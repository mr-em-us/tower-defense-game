import { GameState, PlayerSide, TowerType, CellType } from '../../../shared/types/game.types.js';
import { GRID, CENTER_SPAWN } from '../../../shared/types/constants.js';
import { findPath, isInSpawnZone } from '../../../shared/logic/pathfinding.js';
import { chooseTowerType } from './placement.js';
import { getDynamicPrice } from './economy.js';
import { log } from '../../utils/logger.js';

interface PlannedPlacement {
  x: number;
  y: number;
  type: TowerType;
  cost: number;
}

/**
 * AI maze strategy: compact box with horizontal switchback lanes.
 *
 * Builds a rectangular box near spawn with horizontal internal walls.
 * Each internal wall has a 1-cell gap at alternating ends, creating
 * a serpentine path through tight 1-cell corridors.
 *
 * All towers start as BASIC (offense). WALLs added later for expansion
 * or protecting upgraded towers.
 *
 * The box outer walls + internal walls together use ~40 BASIC towers
 * at 50c each = 2000c, fitting wave 1 budget.
 */
export function generateMazeLayout(
  state: GameState,
  playerId: string,
  budget: number,
  depth: number,
): PlannedPlacement[] {
  const player = state.players[playerId];
  if (!player || budget <= 0) return [];

  const side = player.side;
  const wave = state.waveNumber;
  const simulated: { x: number; y: number }[] = [];

  const pathBefore = findPath(state.grid, side);
  const pathLenBefore = pathBefore?.length ?? 0;

  let spent = 0;
  const towerTypeCounts: Record<string, number> = {};
  const placements: PlannedPlacement[] = [];

  // Reserve for AA
  const airWaveImminent = state.airWaveCountdown >= 0 && state.airWaveCountdown <= 3;
  const aaReserve = (airWaveImminent || wave >= 3) ? 200 : 0;
  const mazeBudget = budget - aaReserve;

  // Zone bounds
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // Generate the compact box maze
  const cells = generateBoxMaze(state, side, wave, mazeBudget);

  // Place towers
  for (const cell of cells) {
    if (spent >= mazeBudget) break;
    if (state.grid.cells[cell.y][cell.x] !== CellType.EMPTY) continue;
    if (isInSpawnZone(cell.x, cell.y)) continue;
    if (cell.x < xMin || cell.x > xMax) continue;

    let towerType = cell.type;
    let cost = getDynamicPrice(state, towerType);

    if (spent + cost > mazeBudget) {
      // Try cheaper
      towerType = TowerType.BASIC;
      cost = getDynamicPrice(state, TowerType.BASIC);
      if (spent + cost > mazeBudget) break;
    }

    // Validate path
    state.grid.cells[cell.y][cell.x] = CellType.TOWER;
    const testPath = findPath(state.grid, side);
    if (!testPath) {
      state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
      if (wave <= 1) log(`[MAZE] REJECTED (${cell.x},${cell.y}) — would block path`);
      continue;
    }

    simulated.push({ x: cell.x, y: cell.y });
    placements.push({ x: cell.x, y: cell.y, type: towerType, cost });
    spent += cost;
    towerTypeCounts[towerType] = (towerTypeCounts[towerType] ?? 0) + 1;
  }

  // === Greedy path extension with remaining budget ===
  // After the box is built, place towers on the BFS path to extend it.
  // The constrained grid (from the box) makes greedy effective.
  const greedyBudget = Math.floor((mazeBudget - spent) * 0.8);
  if (greedyBudget >= 50) {
    const basicCostGreedy = getDynamicPrice(state, TowerType.BASIC);
    let greedySpent = 0;
    let noGain = 0;

    while (greedySpent + basicCostGreedy <= greedyBudget && noGain < 3) {
      const curPath = findPath(state.grid, side);
      if (!curPath) break;

      let bestCell: { x: number; y: number } | null = null;
      let bestIncrease = 0;

      for (const cell of curPath) {
        if (cell.x < xMin || cell.x > xMax) continue;
        if (state.grid.cells[cell.y][cell.x] !== CellType.EMPTY) continue;
        if (isInSpawnZone(cell.x, cell.y)) continue;

        state.grid.cells[cell.y][cell.x] = CellType.TOWER;
        const newPath = findPath(state.grid, side);
        state.grid.cells[cell.y][cell.x] = CellType.EMPTY;

        if (!newPath) continue;
        const inc = newPath.length - curPath.length;
        if (inc > bestIncrease) {
          bestIncrease = inc;
          bestCell = cell;
        }
      }

      if (!bestCell) break;
      if (bestIncrease === 0) { noGain++; continue; }
      noGain = 0;

      state.grid.cells[bestCell.y][bestCell.x] = CellType.TOWER;
      simulated.push(bestCell);
      placements.push({ x: bestCell.x, y: bestCell.y, type: TowerType.BASIC, cost: basicCostGreedy });
      greedySpent += basicCostGreedy;
      spent += basicCostGreedy;
      towerTypeCounts[TowerType.BASIC] = (towerTypeCounts[TowerType.BASIC] ?? 0) + 1;
    }
  }

  // === Offense fill: place mixed tower types adjacent to path for DPS ===
  const fillBudget = mazeBudget - spent;
  if (fillBudget >= 50 && wave >= 3) {
    const fillPath = findPath(state.grid, side);
    if (fillPath) {
      const pathSet = new Set(fillPath.map(c => `${c.x},${c.y}`));
      const fillChecked = new Set<string>();
      const fillCandidates: { x: number; y: number }[] = [];

      for (const cell of fillPath) {
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nx = cell.x + dx, ny = cell.y + dy;
          const key = `${nx},${ny}`;
          if (fillChecked.has(key) || pathSet.has(key)) continue;
          fillChecked.add(key);
          if (nx < xMin || nx > xMax || ny < 0 || ny >= GRID.HEIGHT) continue;
          if (state.grid.cells[ny][nx] !== CellType.EMPTY) continue;
          if (isInSpawnZone(nx, ny)) continue;
          fillCandidates.push({ x: nx, y: ny });
        }
      }

      let fillSpent = 0;
      for (const c of fillCandidates) {
        if (fillSpent >= fillBudget) break;
        let ft = chooseTowerType(state, playerId, depth, towerTypeCounts);
        let fc = getDynamicPrice(state, ft);
        if (fillSpent + fc > fillBudget) {
          ft = TowerType.BASIC;
          fc = getDynamicPrice(state, TowerType.BASIC);
          if (fillSpent + fc > fillBudget) break;
        }
        state.grid.cells[c.y][c.x] = CellType.TOWER;
        const tp = findPath(state.grid, side);
        if (!tp) { state.grid.cells[c.y][c.x] = CellType.EMPTY; continue; }
        simulated.push(c);
        placements.push({ x: c.x, y: c.y, type: ft, cost: fc });
        fillSpent += fc;
        spent += fc;
        towerTypeCounts[ft] = (towerTypeCounts[ft] ?? 0) + 1;
      }
    }
  }

  // AA defense
  const aaBudget = budget - spent;
  const aaSpent = placeAADefense(state, playerId, side, aaBudget, wave, placements, simulated);
  spent += aaSpent;

  // Clean up simulated cells
  for (const cell of simulated) {
    state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
  }

  // Measure final path
  const simCells: { x: number; y: number }[] = [];
  for (const p of placements) {
    if (state.grid.cells[p.y][p.x] === CellType.EMPTY) {
      state.grid.cells[p.y][p.x] = CellType.TOWER;
      simCells.push({ x: p.x, y: p.y });
    }
  }
  const pathAfter = findPath(state.grid, side);
  const pathLenAfter = pathAfter?.length ?? 0;

  // Debug: log first 20 path cells to trace the route
  if (pathAfter && wave <= 2) {
    const pathStr = pathAfter.slice(0, 30).map(c => `(${c.x},${c.y})`).join(' → ');
    log(`[MAZE] Path trace: ${pathStr}${pathAfter.length > 30 ? '...' : ''}`);
  }

  for (const c of simCells) state.grid.cells[c.y][c.x] = CellType.EMPTY;

  const typeStr = Object.entries(towerTypeCounts).map(([t, c]) => `${t}:${c}`).join(' ');
  log(`[MAZE] Wave ${wave} | Budget ${budget} | Spent ${spent}c (${typeStr}) AA:${aaSpent}c | Path: ${pathLenBefore} -> ${pathLenAfter} | Placed ${placements.length} towers`);

  return placements;
}

interface MazeCell {
  x: number;
  y: number;
  type: TowerType;
}

/**
 * Generate a compact box maze with horizontal switchback lanes.
 *
 * The maze is a series of horizontal walls stacked vertically, each with
 * a 1-cell gap at alternating ends (left/right). This forces enemies to
 * traverse the full width of the maze for each lane.
 *
 * No separate perimeter walls needed — the horizontal walls themselves
 * form the structure. Enemies enter from one side, snake through, exit
 * the other side toward the goal.
 *
 * For RIGHT side, each wall runs from boxLeft to boxRight. Gaps alternate:
 *   Wall 0: gap at boxRight (enemy enters top, goes right)
 *   Wall 1: gap at boxLeft  (enemy goes left)
 *   Wall 2: gap at boxRight (enemy goes right)
 *   ...
 *
 * Each wall is 1 row. Corridors between walls are 1 row.
 * Total height = numWalls * 2 - 1 (walls + corridors).
 */
function generateBoxMaze(
  state: GameState,
  side: PlayerSide,
  wave: number,
  budget: number,
): MazeCell[] {
  const SPAWN_ROW = 14;
  const basicCost = getDynamicPrice(state, TowerType.BASIC);
  const wallPrice = getDynamicPrice(state, TowerType.WALL);

  const maxTowers = Math.floor(budget / basicCost);
  if (maxTowers < 10) return [];

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // The maze must be tall enough that bypassing above/below costs more than
  // going through it. The bypass cost = distance from spawn to top/bottom of maze.
  // The through-path gain = numWalls * mazeWidth (approx).
  // We want the maze to be TALL (many walls = many switchbacks) even if narrower.
  //
  // With budget of ~39 BASIC towers:
  // Each wall costs (mazeWidth-1) towers + 2 side walls for corridor = mazeWidth+1 per wall-pair.
  // Try width=7: per wall-pair = 8. 39/8 ≈ 4 wall-pairs → 5 walls (4 corridors).
  //   Maze height = 5*2-1 = 9 rows. Path increase ≈ 4*12 = 48. Bypass cost ~5 each way = 10.
  //   48 >> 10, so enemies go through. Good!
  // Try width=8: per wall-pair = 9. 39/9 ≈ 4. Same 5 walls.
  //   Path increase ≈ 4*14 = 56. Even better.

  // Balance width (path per switchback) vs height (bypass prevention).
  // Wider = more path per switchback but fewer walls.
  // With budget 31 maze towers and funnel 8:
  //   Width 7, 4 walls: 4*6 + 3*2-2 = 24+4 = 28. Fits!
  //   Width 8, 4 walls: 4*7 + 3*2-2 = 28+4 = 32. Tight.
  // Width 7 with 4 walls: estWalls(4,7) = 14+12+4 = 30. Plus funnel 8 = 38. Fits!
  let mazeWidth = Math.min(14, 7 + Math.floor(wave * 0.4));

  // Budget accounting: funnel + maze walls + side walls.
  // In later waves, existing towers don't cost anything to re-plan.
  // Count how many funnel cells are already built.
  const funnelXEst = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : GRID.LEFT_ZONE_END;
  let existingFunnelCells = 0;
  for (let dy = -4; dy <= 4; dy++) {
    if (dy === 0) continue;
    const y = SPAWN_ROW + dy;
    if (y >= 0 && y < GRID.HEIGHT && state.grid.cells[y][funnelXEst] === CellType.TOWER) {
      existingFunnelCells++;
    }
  }
  // Funnel cost: 8 towers base, minus existing. Grows in later waves.
  const funnelBaseCost = 8;
  const funnelNewCost = Math.max(0, funnelBaseCost - existingFunnelCells);
  const mazeTowerBudget = maxTowers - funnelNewCost;

  // Count existing maze tower cost (already built = free to re-plan)
  let existingMazeCost = 0;
  const mazeLeftEst = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START + 1 : 0;
  const mazeRightEst = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START + mazeWidth : GRID.LEFT_ZONE_END;
  for (let y = 0; y < GRID.HEIGHT; y++) {
    for (let x = mazeLeftEst; x <= Math.min(mazeRightEst, xMax); x++) {
      if (state.grid.cells[y][x] === CellType.TOWER) existingMazeCost += basicCost; // approximate
    }
  }
  // Budget in credits: new spending + existing (free)
  const mazeCreditBudget = mazeTowerBudget * basicCost; // convert tower count to credits
  const effectiveCreditBudget = mazeCreditBudget + existingMazeCost;

  // Compute numWalls based on credit budget
  // Each "slice" costs roughly: 1 internal wall (mazeWidth-1)*50 + 2 side walls*25 = ~(mw-1)*50 + 50
  const sliceCreditCost = (mazeWidth - 1) * basicCost + 2 * wallPrice;
  let numWalls = 2 + Math.floor((effectiveCreditBudget - 2 * mazeWidth * wallPrice) / sliceCreditCost);
  numWalls = Math.max(2, Math.min(numWalls, 12));

  // Mixed cost estimate: WALL (25c) for structural, BASIC (50c) for internal walls.
  const estCost = (w: number, mw: number) => {
    // First/last walls: WALL at 25c each cell, solid (mw cells each)
    const solidCost = 2 * mw * wallPrice;
    // Internal walls: BASIC at 50c, gap (mw-1 cells each)
    const internalCost = Math.max(0, w - 2) * (mw - 1) * basicCost;
    // Side walls: WALL at 25c, (w-1) corridors minus entrance/exit
    const sideCost = Math.max(0, 2 * (w - 1) - 2) * wallPrice;
    return solidCost + internalCost + sideCost;
  };
  // Funnel cost in credits (WALL towers)
  const estFunnelCost = funnelNewCost * wallPrice;

  let est = estCost(numWalls, mazeWidth) + estFunnelCost;
  while (est > effectiveCreditBudget && numWalls > 2) {
    numWalls--;
    est = estCost(numWalls, mazeWidth) + estFunnelCost;
  }
  while (est > effectiveCreditBudget && mazeWidth > 4) {
    mazeWidth--;
    est = estCost(numWalls, mazeWidth) + estFunnelCost;
  }

  // Maze height: numWalls walls with 1-row corridors between them
  // Total rows = numWalls + (numWalls - 1) = 2*numWalls - 1
  const mazeHeight = 2 * numWalls - 1;

  // Position: entrance corridor (first corridor = mazeTop+1) must be at spawn row.
  // So mazeTop = SPAWN_ROW - 1. This puts the first wall at row 13, entrance at row 14.
  // Walls above spawn prevent north bypass. Walls below prevent south bypass.
  const mazeTop = Math.max(1, SPAWN_ROW - 1);
  const mazeBottom = Math.min(GRID.HEIGHT - 2, mazeTop + mazeHeight - 1);

  let mazeLeft: number, mazeRight: number;
  if (side === PlayerSide.RIGHT) {
    // Start right at zone edge + 1 (as close to spawn as possible)
    mazeLeft = GRID.RIGHT_ZONE_START + 1;
    mazeRight = mazeLeft + mazeWidth - 1;
  } else {
    mazeRight = GRID.LEFT_ZONE_END - 1;
    mazeLeft = mazeRight - mazeWidth + 1;
  }

  // Clamp
  if (mazeRight > xMax - 1) mazeRight = xMax - 1;
  if (mazeLeft < xMin + 1) mazeLeft = xMin + 1;

  const actualWidth = mazeRight - mazeLeft + 1;
  if (actualWidth < 5) return [];

  log(`[MAZE] Box: cols ${mazeLeft}-${mazeRight} (W=${actualWidth}), rows ${mazeTop}-${mazeBottom} (H=${mazeHeight}), ${numWalls} walls, ~${est}c (mazeBudget: ${mazeCreditBudget}c, existing: ${existingMazeCost}c, effective: ${effectiveCreditBudget}c)`);

  const cells: MazeCell[] = [];

  // First corridor and last corridor positions
  const firstCorridorY = mazeTop + 1;
  const lastCorridorY = mazeTop + (numWalls - 1) * 2 - 1;

  // === FUNNEL (placed FIRST) ===
  // Block bypass above/below entrance. Uses WALL towers (cheap blocking).
  const funnelX = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : GRID.LEFT_ZONE_END;
  const funnelTop = Math.max(0, mazeTop - 1);
  const funnelBottom = Math.min(GRID.HEIGHT - 1, mazeBottom + 1);
  for (let y = funnelTop; y <= funnelBottom; y++) {
    if (y === firstCorridorY) continue; // entrance gap
    if (isInSpawnZone(funnelX, y)) continue;
    cells.push({ x: funnelX, y, type: TowerType.WALL });
  }

  // Build horizontal walls with alternating gaps.
  // FIRST and LAST walls are SOLID (no gaps) — they seal the top and bottom.
  // Internal walls have gaps at alternating sides to create switchbacks.
  // The entrance and exit are openings in the SIDE walls, not in horizontal walls.

  for (let w = 0; w < numWalls; w++) {
    const wallY = mazeTop + w * 2;
    if (wallY > mazeBottom || wallY >= GRID.HEIGHT) break;

    const isFirstWall = w === 0;
    const isLastWall = w === numWalls - 1;

    if (isFirstWall || isLastWall) {
      // Solid wall — seals top/bottom. Use WALL (cheap blocking, no DPS needed).
      for (let x = mazeLeft; x <= mazeRight; x++) {
        cells.push({ x, y: wallY, type: TowerType.WALL });
      }
    } else {
      // Internal wall with gap at alternating end (1 cell inward from edge).
      const gapAtRight = w % 2 === 1;
      const gapX = gapAtRight ? (mazeRight - 1) : (mazeLeft + 1);

      for (let x = mazeLeft; x <= mazeRight; x++) {
        if (x === gapX) continue;
        cells.push({ x, y: wallY, type: TowerType.BASIC });
      }
    }
  }

  // Side walls: seal left and right edges between horizontal walls.
  // These form the vertical sides of the box, connecting the horizontal walls.
  // The corridor rows (between wall rows) need side walls to prevent bypass.
  //
  // Side walls on corridor rows. Entrance = spawn side at first corridor.
  // Exit = goal side at last corridor. All other corridors sealed on both sides.
  const spawnSideX = side === PlayerSide.RIGHT ? mazeLeft : mazeRight;
  const goalSideX = side === PlayerSide.RIGHT ? mazeRight : mazeLeft;

  for (let y = mazeTop; y <= mazeBottom; y++) {
    const isWallRow = (y - mazeTop) % 2 === 0;
    if (isWallRow) continue; // wall rows already placed above

    // Spawn side: entrance at first corridor only. Use WALL (cheap).
    if (y !== firstCorridorY) {
      cells.push({ x: spawnSideX, y, type: TowerType.WALL });
    }

    // Goal side: exit at last corridor only. Use WALL (cheap).
    if (y !== lastCorridorY) {
      cells.push({ x: goalSideX, y, type: TowerType.WALL });
    }
  }

  return cells;
}

/**
 * Place AA towers proactively along the flight corridor.
 */
function placeAADefense(
  state: GameState,
  playerId: string,
  side: PlayerSide,
  totalBudget: number,
  wave: number,
  placements: PlannedPlacement[],
  simulated: { x: number; y: number }[],
): number {
  if (wave < 3 && !(state.airWaveCountdown >= 0 && state.airWaveCountdown <= 3)) return 0;

  const existingAA = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA).length;
  const plannedAA = placements.filter(p => p.type === TowerType.AA).length;
  const totalAA = existingAA + plannedAA;

  const airWaveImminent = state.airWaveCountdown >= 0 && state.airWaveCountdown <= 3;
  let aaTarget: number;
  if (airWaveImminent) {
    aaTarget = 3 + Math.floor(wave / 3);
  } else {
    aaTarget = 2 + Math.floor(wave / 5);
  }

  const aaNeeded = Math.max(0, aaTarget - totalAA);
  if (aaNeeded === 0) return 0;

  const aaCost = getDynamicPrice(state, TowerType.AA);
  const maxAirBudget = Math.min(totalBudget, aaNeeded * aaCost);

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  const existingAAPositions = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA)
    .map(t => t.position);

  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = 11; y <= 19 && y < GRID.HEIGHT; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (state.grid.cells[y][x] !== CellType.EMPTY) continue;

      const flightScore = 5 - Math.abs(y - 14.5);
      let spreadScore = 8;
      for (const pos of existingAAPositions) {
        const d = Math.abs(pos.x - x) + Math.abs(pos.y - y);
        spreadScore = Math.min(spreadScore, d);
      }
      candidates.push({ x, y, score: flightScore + spreadScore });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  let spent = 0;
  let placed = 0;
  for (const c of candidates) {
    if (placed >= aaNeeded || spent + aaCost > maxAirBudget) break;

    state.grid.cells[c.y][c.x] = CellType.TOWER;
    const testPath = findPath(state.grid, side);
    if (!testPath) {
      state.grid.cells[c.y][c.x] = CellType.EMPTY;
      continue;
    }
    simulated.push({ x: c.x, y: c.y });
    placements.push({ x: c.x, y: c.y, type: TowerType.AA, cost: aaCost });
    spent += aaCost;
    placed++;
  }

  if (placed > 0) {
    log(`[MAZE] AA: ${placed} towers (${spent}c), target=${aaTarget}, existing=${existingAA}`);
  }

  return spent;
}
