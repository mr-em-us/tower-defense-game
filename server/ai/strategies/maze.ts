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

export interface MazePlan {
  placements: PlannedPlacement[];
  sellTowerIds: string[];
}

interface MazeCell {
  x: number;
  y: number;
  type: TowerType;
}

/**
 * AI maze strategy: compact box with horizontal switchback lanes.
 *
 * ADDITIVE ONLY — never sell towers. Growth is via more switchback rows
 * (downward), not wider walls. Width stays compact. Like building a road:
 * you extend it, you don't demolish and rebuild.
 *
 * Growth priority:
 *   1. Box maze — more rows as budget allows (batch placed)
 *   2. Additive repair — fill any wall gaps
 *   3. Offense fill — DPS towers adjacent to path
 *   4. AA defense
 */
export function generateMazeLayout(
  state: GameState,
  playerId: string,
  budget: number,
  depth: number,
): MazePlan {
  const player = state.players[playerId];
  if (!player || budget <= 0) return { placements: [], sellTowerIds: [] };

  const side = player.side;
  const wave = state.waveNumber;
  const simulated: { x: number; y: number }[] = [];

  const pathBefore = findPath(state.grid, side);
  const pathLenBefore = pathBefore?.length ?? 0;

  let spent = 0;
  const towerTypeCounts: Record<string, number> = {};
  const placements: PlannedPlacement[] = [];

  const airWaveImminent = state.airWaveCountdown >= 0 && state.airWaveCountdown <= 3;
  const aaReserve = (airWaveImminent || wave >= 3) ? 200 : 0;
  const mazeBudget = budget - aaReserve;

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // === 1. GENERATE BOX GEOMETRY ===
  // Width stays compact (7). Growth is via more rows (numWalls increases with budget).
  const box = generateBoxMaze(state, side, wave, mazeBudget);

  // === 2. BATCH PLACE ===
  // Place ALL new maze cells at once, validate with single path check.
  const batchCells: MazeCell[] = [];
  for (const cell of box.cells) {
    if (state.grid.cells[cell.y][cell.x] !== CellType.EMPTY) continue;
    if (isInSpawnZone(cell.x, cell.y)) continue;
    if (cell.x < xMin || cell.x > xMax) continue;
    batchCells.push(cell);
  }

  // Place all on grid
  for (const cell of batchCells) {
    state.grid.cells[cell.y][cell.x] = CellType.TOWER;
  }

  const batchPath = findPath(state.grid, side);
  if (batchPath) {
    // Valid — commit (respecting budget)
    for (const cell of batchCells) {
      const cost = getDynamicPrice(state, cell.type);
      if (spent + cost > mazeBudget) {
        state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
        continue;
      }
      simulated.push({ x: cell.x, y: cell.y });
      placements.push({ x: cell.x, y: cell.y, type: cell.type, cost });
      spent += cost;
      towerTypeCounts[cell.type] = (towerTypeCounts[cell.type] ?? 0) + 1;
    }
  } else {
    // Batch blocked path — revert, fall back to cell-by-cell
    for (const cell of batchCells) {
      state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
    }
    log(`[MAZE] Batch blocked path — cell-by-cell fallback`);
    for (const cell of box.cells) {
      if (spent >= mazeBudget) break;
      if (state.grid.cells[cell.y][cell.x] !== CellType.EMPTY) continue;
      if (isInSpawnZone(cell.x, cell.y)) continue;
      if (cell.x < xMin || cell.x > xMax) continue;

      const cost = getDynamicPrice(state, cell.type);
      if (spent + cost > mazeBudget) continue;

      state.grid.cells[cell.y][cell.x] = CellType.TOWER;
      if (!findPath(state.grid, side)) {
        state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
        continue;
      }
      simulated.push({ x: cell.x, y: cell.y });
      placements.push({ x: cell.x, y: cell.y, type: cell.type, cost });
      spent += cost;
      towerTypeCounts[cell.type] = (towerTypeCounts[cell.type] ?? 0) + 1;
    }
  }

  // === 3. ADDITIVE REPAIR — fill any wall gaps ===
  for (let round = 0; round < 3; round++) {
    let anyFilled = false;

    for (let w = 0; w < box.numWalls; w++) {
      const wallY = box.mazeTop + w * 2;
      if (wallY > box.mazeBottom || wallY >= GRID.HEIGHT) continue;

      const isSeal = w === 0 || w === box.numWalls - 1;
      const gapX = isSeal ? -1 : (w % 2 === 1
        ? (box.mazeRight - 1) : (box.mazeLeft + 1));

      const gapCells: MazeCell[] = [];
      for (let x = box.mazeLeft; x <= box.mazeRight; x++) {
        if (x === gapX) continue;
        if (state.grid.cells[wallY][x] !== CellType.EMPTY) continue;
        if (isInSpawnZone(x, wallY)) continue;
        gapCells.push({ x, y: wallY, type: isSeal ? TowerType.WALL : TowerType.BASIC });
      }
      if (gapCells.length === 0) continue;

      let gapCost = 0;
      for (const c of gapCells) gapCost += getDynamicPrice(state, c.type);
      if (spent + gapCost > mazeBudget) continue;

      // Batch fill
      for (const c of gapCells) state.grid.cells[c.y][c.x] = CellType.TOWER;
      if (findPath(state.grid, side)) {
        for (const c of gapCells) {
          const cost = getDynamicPrice(state, c.type);
          simulated.push({ x: c.x, y: c.y });
          placements.push({ x: c.x, y: c.y, type: c.type, cost });
          spent += cost;
          towerTypeCounts[c.type] = (towerTypeCounts[c.type] ?? 0) + 1;
        }
        anyFilled = true;
        log(`[MAZE] Repair: filled ${gapCells.length} gaps in row ${wallY}`);
      } else {
        for (const c of gapCells) state.grid.cells[c.y][c.x] = CellType.EMPTY;
      }
    }
    if (!anyFilled) break;
  }

  // === 4. OFFENSE FILL ===
  const fillBudget = mazeBudget - spent;
  if (fillBudget >= 50 && wave >= 3) {
    const fillPath = findPath(state.grid, side);
    if (fillPath) {
      const pathSet = new Set(fillPath.map(c => `${c.x},${c.y}`));
      const checked = new Set<string>();
      const candidates: { x: number; y: number }[] = [];

      for (const cell of fillPath) {
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nx = cell.x + dx, ny = cell.y + dy;
          const key = `${nx},${ny}`;
          if (checked.has(key) || pathSet.has(key)) continue;
          checked.add(key);
          if (nx < xMin || nx > xMax || ny < 0 || ny >= GRID.HEIGHT) continue;
          if (state.grid.cells[ny][nx] !== CellType.EMPTY) continue;
          if (isInSpawnZone(nx, ny)) continue;
          candidates.push({ x: nx, y: ny });
        }
      }

      let fillSpent = 0;
      for (const c of candidates) {
        if (fillSpent >= fillBudget) break;
        let ft = chooseTowerType(state, playerId, depth, towerTypeCounts);
        let fc = getDynamicPrice(state, ft);
        if (fillSpent + fc > fillBudget) {
          ft = TowerType.BASIC;
          fc = getDynamicPrice(state, TowerType.BASIC);
          if (fillSpent + fc > fillBudget) break;
        }
        state.grid.cells[c.y][c.x] = CellType.TOWER;
        if (!findPath(state.grid, side)) {
          state.grid.cells[c.y][c.x] = CellType.EMPTY;
          continue;
        }
        simulated.push(c);
        placements.push({ x: c.x, y: c.y, type: ft, cost: fc });
        fillSpent += fc;
        spent += fc;
        towerTypeCounts[ft] = (towerTypeCounts[ft] ?? 0) + 1;
      }
    }
  }

  // === 5. AA DEFENSE ===
  const aaBudget = budget - spent;
  const aaSpent = placeAADefense(state, playerId, side, aaBudget, wave, placements, simulated);
  spent += aaSpent;

  // Restore grid
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

  if (pathAfter && wave <= 2) {
    const pathStr = pathAfter.slice(0, 30).map(c => `(${c.x},${c.y})`).join(' → ');
    log(`[MAZE] Path trace: ${pathStr}${pathAfter.length > 30 ? '...' : ''}`);
  }
  for (const c of simCells) state.grid.cells[c.y][c.x] = CellType.EMPTY;

  const typeStr = Object.entries(towerTypeCounts).map(([t, c]) => `${t}:${c}`).join(' ');
  log(`[MAZE] Wave ${wave} | Budget ${budget} | Spent ${spent}c (${typeStr}) AA:${aaSpent}c | Path: ${pathLenBefore} -> ${pathLenAfter} | Placed ${placements.length} towers`);

  // No sells — purely additive
  return { placements, sellTowerIds: [] };
}

/**
 * Generate box maze geometry. Width stays compact (7), growth is via more
 * switchback rows (numWalls increases with budget). Purely additive.
 */
function generateBoxMaze(
  state: GameState,
  side: PlayerSide,
  wave: number,
  budget: number,
): { cells: MazeCell[]; mazeLeft: number; mazeRight: number; mazeTop: number; mazeBottom: number; numWalls: number } {
  const SPAWN_ROW = 14;
  const basicCost = getDynamicPrice(state, TowerType.BASIC);
  const wallPrice = getDynamicPrice(state, TowerType.WALL);

  const empty = { cells: [] as MazeCell[], mazeLeft: 0, mazeRight: 0, mazeTop: SPAWN_ROW - 1, mazeBottom: SPAWN_ROW + 1, numWalls: 0 };
  const maxTowers = Math.floor(budget / basicCost);
  if (maxTowers < 10) return empty;

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // Width stays COMPACT. Growth is downward (more rows), not wider.
  // Fixed at 7 for stability. This avoids all widening issues.
  const mazeWidth = 7;

  // Budget accounting
  const funnelXEst = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : GRID.LEFT_ZONE_END;
  let existingFunnelCells = 0;
  for (let dy = -4; dy <= 4; dy++) {
    if (dy === 0) continue;
    const y = SPAWN_ROW + dy;
    if (y >= 0 && y < GRID.HEIGHT && state.grid.cells[y][funnelXEst] === CellType.TOWER) {
      existingFunnelCells++;
    }
  }
  const funnelNewCost = Math.max(0, 8 - existingFunnelCells);
  const mazeTowerBudget = maxTowers - funnelNewCost;

  // Count existing towers in the maze area (already built = free)
  let existingMazeCost = 0;
  for (let y = 0; y < GRID.HEIGHT; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (x === funnelXEst) continue;
      if (state.grid.cells[y][x] === CellType.TOWER) existingMazeCost += basicCost;
    }
  }
  const mazeCreditBudget = mazeTowerBudget * basicCost;
  const effectiveCreditBudget = mazeCreditBudget + existingMazeCost;

  // Compute numWalls based on budget
  const sliceCreditCost = (mazeWidth - 1) * basicCost + 2 * wallPrice;
  let numWalls = 2 + Math.floor((effectiveCreditBudget - 2 * mazeWidth * wallPrice) / sliceCreditCost);
  numWalls = Math.max(2, Math.min(numWalls, 12));

  const estCost = (w: number) => {
    const solidCost = 2 * mazeWidth * wallPrice;
    const internalCost = Math.max(0, w - 2) * (mazeWidth - 1) * basicCost;
    const sideCost = Math.max(0, 2 * (w - 1) - 2) * wallPrice;
    return solidCost + internalCost + sideCost;
  };
  const estFunnelCost = funnelNewCost * wallPrice;

  let est = estCost(numWalls) + estFunnelCost;
  while (est > effectiveCreditBudget && numWalls > 2) {
    numWalls--;
    est = estCost(numWalls) + estFunnelCost;
  }

  const mazeHeight = 2 * numWalls - 1;
  const mazeTop = Math.max(1, SPAWN_ROW - 1);
  const mazeBottom = Math.min(GRID.HEIGHT - 2, mazeTop + mazeHeight - 1);

  let mazeLeft: number, mazeRight: number;
  if (side === PlayerSide.RIGHT) {
    mazeLeft = GRID.RIGHT_ZONE_START + 1;
    mazeRight = mazeLeft + mazeWidth - 1;
  } else {
    mazeRight = GRID.LEFT_ZONE_END - 1;
    mazeLeft = mazeRight - mazeWidth + 1;
  }

  if (mazeRight > xMax - 1) mazeRight = xMax - 1;
  if (mazeLeft < xMin + 1) mazeLeft = xMin + 1;

  const actualWidth = mazeRight - mazeLeft + 1;
  if (actualWidth < 5) return empty;

  log(`[MAZE] Box: cols ${mazeLeft}-${mazeRight} (W=${actualWidth}), rows ${mazeTop}-${mazeBottom} (H=${mazeHeight}), ${numWalls} walls, ~${est}c`);

  // Cell generation order matters for budget: structural containment first
  // (cheap WALLs), then expensive internal walls (BASIC with DPS) last.
  // This ensures the maze never has holes in its perimeter.
  //
  // Order: 1. Funnel  2. Seal walls  3. Side walls  4. Internal walls

  const cells: MazeCell[] = [];
  const firstCorridorY = mazeTop + 1;
  const lastCorridorY = mazeTop + (numWalls - 1) * 2 - 1;
  const spawnSideX = side === PlayerSide.RIGHT ? mazeLeft : mazeRight;
  const goalSideX = side === PlayerSide.RIGHT ? mazeRight : mazeLeft;

  // 1. FUNNEL — zone edge column
  const funnelX = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : GRID.LEFT_ZONE_END;
  const funnelTop = Math.max(0, mazeTop - 1);
  const funnelBottom = Math.min(GRID.HEIGHT - 1, mazeBottom + 1);
  for (let y = funnelTop; y <= funnelBottom; y++) {
    if (y === firstCorridorY) continue;
    if (isInSpawnZone(funnelX, y)) continue;
    cells.push({ x: funnelX, y, type: TowerType.WALL });
  }

  // 2. SEAL WALLS — solid top and bottom (cheap WALLs)
  for (let w = 0; w < numWalls; w++) {
    const isSeal = w === 0 || w === numWalls - 1;
    if (!isSeal) continue;
    const wallY = mazeTop + w * 2;
    if (wallY > mazeBottom || wallY >= GRID.HEIGHT) continue;
    for (let x = mazeLeft; x <= mazeRight; x++) {
      cells.push({ x, y: wallY, type: TowerType.WALL });
    }
  }

  // 3. SIDE WALLS — seal corridor rows on left/right edges (cheap WALLs)
  for (let y = mazeTop; y <= mazeBottom; y++) {
    if ((y - mazeTop) % 2 === 0) continue; // wall rows handled above
    if (y !== firstCorridorY) cells.push({ x: spawnSideX, y, type: TowerType.WALL });
    if (y !== lastCorridorY) cells.push({ x: goalSideX, y, type: TowerType.WALL });
  }

  // 4. INTERNAL WALLS — switchback walls with gaps (expensive BASIC for DPS)
  for (let w = 0; w < numWalls; w++) {
    const isSeal = w === 0 || w === numWalls - 1;
    if (isSeal) continue;
    const wallY = mazeTop + w * 2;
    if (wallY > mazeBottom || wallY >= GRID.HEIGHT) continue;
    const gapAtRight = w % 2 === 1;
    const gapX = gapAtRight ? (mazeRight - 1) : (mazeLeft + 1);
    for (let x = mazeLeft; x <= mazeRight; x++) {
      if (x === gapX) continue;
      cells.push({ x, y: wallY, type: TowerType.BASIC });
    }
  }

  return { cells, mazeLeft, mazeRight, mazeTop, mazeBottom, numWalls };
}

/**
 * Place AA towers along the flight corridor.
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
  const aaTarget = airWaveImminent
    ? 3 + Math.floor(wave / 3)
    : 2 + Math.floor(wave / 5);

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
        spreadScore = Math.min(spreadScore, Math.abs(pos.x - x) + Math.abs(pos.y - y));
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
    if (!findPath(state.grid, side)) {
      state.grid.cells[c.y][c.x] = CellType.EMPTY;
      continue;
    }
    simulated.push({ x: c.x, y: c.y });
    placements.push({ x: c.x, y: c.y, type: TowerType.AA, cost: aaCost });
    spent += aaCost;
    placed++;
  }

  if (placed > 0) log(`[MAZE] AA: ${placed} towers (${spent}c), target=${aaTarget}, existing=${existingAA}`);
  return spent;
}
