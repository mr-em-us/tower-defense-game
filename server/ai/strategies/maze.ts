import { GameState, PlayerSide, TowerType, CellType } from '../../../shared/types/game.types.js';
import { GRID } from '../../../shared/types/constants.js';
import { findPath, validateTowerPlacement } from '../../../shared/logic/pathfinding.js';
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
 * AI maze strategy: wall columns FIRST to extend path, then offense along it.
 *
 * A complete wall column (29 walls, 725c) doubles the path length from 30 to ~57.
 * This means every offense tower fires for 2x as long. Building the column first
 * is more DPS-efficient than placing 14 extra BASIC towers (same cost).
 *
 * Strategy:
 * - Every wave: build as many wall columns as budget allows (up to 2 per wave)
 * - Remaining budget: offense towers along the (now longer) path
 * - Wall columns use alternating top/bottom gaps for serpentine pathing
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
  const placements: PlannedPlacement[] = [];
  const wave = state.waveNumber;

  const wallCost = getDynamicPrice(state, TowerType.WALL);
  const gapSize = Math.max(1, Math.round(2 - depth));
  const wallsPerColumn = GRID.HEIGHT - gapSize;
  const costPerColumn = wallsPerColumn * wallCost;

  const wallCols = getWallColumns(side);
  let nextCol = findNextUnbuiltColumn(state, side, wallCols, gapSize);

  // Measure path before
  const pathBefore = findPath(state.grid, side);
  const pathLenBefore = pathBefore?.length ?? 0;

  let wallSpent = 0;
  let wallsPlaced = 0;
  const wallSimulated: { x: number; y: number }[] = [];

  // Phase 1: Build wall columns
  // Each column roughly doubles path length. Building columns is the single
  // highest-value investment because every existing tower fires longer.
  // Wave 1: need 1000c+ left for offense. Later waves: 500c is enough since
  // we already have a tower base generating DPS.
  const minOffenseReserve = wave <= 1 ? 1000 : 500;
  const maxColsPerWave = budget >= costPerColumn * 2 + minOffenseReserve ? 2 : 1;

  if (nextCol !== -1 && budget >= costPerColumn + minOffenseReserve) {
    let colsBuilt = 0;
    while (nextCol !== -1 && colsBuilt < maxColsPerWave &&
           budget - wallSpent >= costPerColumn + minOffenseReserve) {
      const { spent, simulated } = buildWallsInColumn(
        state, side, nextCol, wallCols, wallCost, gapSize,
        costPerColumn, placements,
      );
      wallSimulated.push(...simulated);
      wallsPlaced += simulated.length;
      if (spent > 0) {
        wallSpent += spent;
        colsBuilt++;
        nextCol = findNextUnbuiltColumn(state, side, wallCols, gapSize);
      } else {
        break;
      }
    }
  }

  // Phase 2: Air defense — place AA towers along the flight corridor
  // Flying enemies go straight from spawn (col 29-30, row 14) to goal (col 59, rows 12-17)
  // AA towers must be along this corridor, NOT along the maze path
  let airSpent = 0;
  const airBudget = budget - wallSpent;
  if (airBudget > 100) {
    airSpent = placeAirDefense(state, playerId, side, airBudget, placements);
  }

  // Phase 3: Offense towers along the (now extended) path
  const offenseBudget = budget - wallSpent - airSpent;
  let offenseSpent = 0;
  if (offenseBudget > 40) {
    offenseSpent = placeOffensiveTowers(state, playerId, side, offenseBudget, depth, gapSize, placements);
  }

  // Now undo all wall simulations
  for (const cell of wallSimulated) {
    state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
  }

  // Measure path after (simulate all placements)
  const simCells: { x: number; y: number }[] = [];
  for (const p of placements) {
    if (state.grid.cells[p.y][p.x] === CellType.EMPTY) {
      state.grid.cells[p.y][p.x] = CellType.TOWER;
      simCells.push({ x: p.x, y: p.y });
    }
  }
  const pathAfter = findPath(state.grid, side);
  const pathLenAfter = pathAfter?.length ?? 0;
  for (const c of simCells) state.grid.cells[c.y][c.x] = CellType.EMPTY;

  log(`[MAZE] Wave ${wave} | Budget ${budget} | Walls: ${wallsPlaced} (${wallSpent}c), Air: ${airSpent}c, Offense: ${placements.length - wallsPlaced} (${offenseSpent}c) | Path: ${pathLenBefore} → ${pathLenAfter} | NextCol: ${nextCol === -1 ? 'all done' : 'in progress'}`);

  return placements;
}

/** Get the planned wall column X positions for a side. */
function getWallColumns(side: PlayerSide): number[] {
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;
  const startOffset = 2;
  const colSpacing = 3;
  const cols: number[] = [];

  if (side === PlayerSide.RIGHT) {
    for (let x = xMin + startOffset; x <= xMax - 1; x += colSpacing) {
      cols.push(x);
    }
  } else {
    for (let x = xMax - startOffset; x >= xMin + 1; x -= colSpacing) {
      cols.push(x);
    }
  }
  return cols;
}

/** Find the index of the next column that isn't fully built. */
function findNextUnbuiltColumn(
  state: GameState,
  side: PlayerSide,
  wallCols: number[],
  gapSize: number,
): number {
  const minWalls = GRID.HEIGHT - gapSize - 2; // allow some slack
  for (let i = 0; i < wallCols.length; i++) {
    const colX = wallCols[i];
    let wallCount = 0;
    for (let y = 0; y < GRID.HEIGHT; y++) {
      if (state.grid.cells[y][colX] === CellType.TOWER) wallCount++;
    }
    if (wallCount < minWalls) return i;
  }
  return -1;
}

/**
 * Build walls incrementally in a column up to a budget cap.
 * Places walls top-to-bottom (skipping gap rows), validates each.
 * Leaves simulated walls ON the grid for caller to use.
 */
function buildWallsInColumn(
  state: GameState,
  side: PlayerSide,
  colIdx: number,
  wallCols: number[],
  wallCost: number,
  gapSize: number,
  maxBudget: number,
  placements: PlannedPlacement[],
): { spent: number; simulated: { x: number; y: number }[] } {
  let spent = 0;
  const colX = wallCols[colIdx];
  const gapAtBottom = colIdx % 2 === 0;
  const simulated: { x: number; y: number }[] = [];

  for (let y = 0; y < GRID.HEIGHT; y++) {
    if (spent + wallCost > maxBudget) break;
    if (gapAtBottom && y >= GRID.HEIGHT - gapSize) continue;
    if (!gapAtBottom && y < gapSize) continue;
    if (state.grid.cells[y][colX] !== CellType.EMPTY) continue;

    const v = validateTowerPlacement(state.grid, colX, y, side);
    if (!v.valid) continue;

    state.grid.cells[y][colX] = CellType.TOWER;
    const testPath = findPath(state.grid, side);
    if (!testPath) {
      state.grid.cells[y][colX] = CellType.EMPTY;
      continue;
    }

    simulated.push({ x: colX, y });
    placements.push({ x: colX, y, type: TowerType.WALL, cost: wallCost });
    spent += wallCost;
  }

  // Walls stay on grid — caller is responsible for cleanup
  return { spent, simulated };
}

/**
 * Place AA towers along the flying enemy flight corridor.
 * Flying enemies go straight from spawn (col 29-30, row 14) to goal edge (rows 12-17).
 * AA towers need range 6 coverage along this diagonal path, NOT the maze path.
 *
 * Budget is capped: only spend what's needed for air defense, leave rest for ground offense.
 */
function placeAirDefense(
  state: GameState,
  playerId: string,
  side: PlayerSide,
  totalBudget: number,
  placements: PlannedPlacement[],
): number {
  const wave = state.waveNumber;

  // Only invest in air defense when air wave is approaching (countdown <= 3)
  // or maintain a baseline from wave 5+
  const airWaveImminent = state.airWaveCountdown >= 0 && state.airWaveCountdown <= 3;
  const needBaseline = wave >= 5;
  if (!airWaveImminent && !needBaseline) return 0;

  // Count existing AA towers
  const existingAA = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA).length;

  // Target AA count: more aggressive when air wave is imminent
  const expectedFlying = Math.max(2, Math.round((15 + wave * 4) * 0.15));
  let aaTarget: number;
  if (airWaveImminent) {
    aaTarget = Math.ceil(expectedFlying / 2.5) + Math.floor(wave / 3);
  } else {
    aaTarget = 2 + Math.floor(wave / 5); // baseline
  }

  const aaNeeded = Math.max(0, aaTarget - existingAA);
  if (aaNeeded === 0) return 0;

  const aaCost = getDynamicPrice(state, TowerType.AA);
  // Cap air budget: don't spend more than 40% of total on air defense
  const maxAirBudget = Math.min(totalBudget * 0.4, aaNeeded * aaCost);

  // Flight corridor: rows 8-22 (generous band around rows 12-17 goal + range 6)
  // Spread across full zone width for coverage
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;
  const flightRowMin = 8;
  const flightRowMax = 22;

  // Generate candidates in the flight corridor, scored by coverage of flight lines
  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = flightRowMin; y <= flightRowMax && y < GRID.HEIGHT; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (state.grid.cells[y][x] !== CellType.EMPTY) continue;

      // Score by how many flight lines this position covers (range 6)
      let flightCoverage = 0;
      for (const goalRow of [12, 13, 14, 15, 16, 17]) {
        // Flight line goes from (30, 14) to (59, goalRow) for RIGHT side
        // Sample points along the line
        const startX = side === PlayerSide.RIGHT ? 30 : 29;
        const endX = side === PlayerSide.RIGHT ? 59 : 0;
        for (let t = 0; t <= 1; t += 0.1) {
          const fx = startX + (endX - startX) * t;
          const fy = 14 + (goalRow - 14) * t;
          const d = Math.sqrt((fx - x) ** 2 + (fy - y) ** 2);
          if (d <= 6) flightCoverage++;
        }
      }

      if (flightCoverage > 0) {
        // Bonus for being spread out from existing AA
        let spreadBonus = 0;
        const existingAAPositions = Object.values(state.towers)
          .filter(t => t.ownerId === playerId && t.type === TowerType.AA);
        if (existingAAPositions.length > 0) {
          let minDist = Infinity;
          for (const aa of existingAAPositions) {
            const d = Math.sqrt((aa.position.x - x) ** 2 + (aa.position.y - y) ** 2);
            if (d < minDist) minDist = d;
          }
          spreadBonus = Math.min(5, minDist); // reward spacing
        } else {
          spreadBonus = 3;
        }
        candidates.push({ x, y, score: flightCoverage + spreadBonus });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  let spent = 0;
  let placed = 0;
  for (const c of candidates) {
    if (placed >= aaNeeded || spent + aaCost > maxAirBudget) break;

    const v = validateTowerPlacement(state.grid, c.x, c.y, side);
    if (!v.valid) continue;

    // Check path isn't blocked
    state.grid.cells[c.y][c.x] = CellType.TOWER;
    const testPath = findPath(state.grid, side);
    if (!testPath) {
      state.grid.cells[c.y][c.x] = CellType.EMPTY;
      continue;
    }
    state.grid.cells[c.y][c.x] = CellType.EMPTY; // undo — placements are tracked separately

    placements.push({ x: c.x, y: c.y, type: TowerType.AA, cost: aaCost });
    spent += aaCost;
    placed++;
  }

  if (placed > 0) {
    log(`[MAZE] Air defense: ${placed} AA towers (${spent}c), target=${aaTarget}, existing=${existingAA}`);
  }

  return spent;
}

/**
 * Place offensive towers adjacent to the enemy path.
 * Prioritizes positions near turn points with high path coverage.
 */
function placeOffensiveTowers(
  state: GameState,
  playerId: string,
  side: PlayerSide,
  budget: number,
  depth: number,
  gapSize: number,
  placements: PlannedPlacement[],
): number {
  let spent = 0;

  // Apply planned placements temporarily (walls already on grid from buildWallsInColumn)
  const simulated: { x: number; y: number }[] = [];
  for (const p of placements) {
    if (state.grid.cells[p.y][p.x] === CellType.EMPTY) {
      state.grid.cells[p.y][p.x] = CellType.TOWER;
      simulated.push({ x: p.x, y: p.y });
    }
  }

  const path = findPath(state.grid, side);
  if (!path || path.length === 0) {
    for (const cell of simulated) state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
    return 0;
  }

  // Find turn points
  const turnPoints = new Set<string>();
  for (let i = 1; i < path.length - 1; i++) {
    const dx1 = path[i].x - path[i - 1].x;
    const dy1 = path[i].y - path[i - 1].y;
    const dx2 = path[i + 1].x - path[i].x;
    const dy2 = path[i + 1].y - path[i].y;
    if (dx1 !== dx2 || dy1 !== dy2) {
      turnPoints.add(`${path[i].x},${path[i].y}`);
    }
  }

  const pathSet = new Set<string>();
  for (const cell of path) pathSet.add(`${cell.x},${cell.y}`);

  // Reserve only UNBUILT wall column Xs — completed columns are fine for offense
  const wallCols = getWallColumns(side);
  const reservedXs = new Set<number>();
  for (let i = 0; i < wallCols.length; i++) {
    const colX = wallCols[i];
    let wallCount = 0;
    for (let y = 0; y < GRID.HEIGHT; y++) {
      if (state.grid.cells[y][colX] === CellType.TOWER) wallCount++;
    }
    if (wallCount < GRID.HEIGHT - gapSize - 2) reservedXs.add(colX);
  }

  // Generate candidates within range 5 of path (covers SNIPER range)
  // Wider search prevents grid saturation from choking placement
  const searchRadius = 5;
  const candidateSet = new Set<string>();
  const candidates: { x: number; y: number; score: number }[] = [];

  for (const pathCell of path) {
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const nx = pathCell.x + dx;
        const ny = pathCell.y + dy;
        if (nx < 0 || nx >= GRID.WIDTH || ny < 0 || ny >= GRID.HEIGHT) continue;
        const key = `${nx},${ny}`;
        if (candidateSet.has(key)) continue;
        if (pathSet.has(key)) continue;
        if (state.grid.cells[ny][nx] !== CellType.EMPTY) continue;
        if (reservedXs.has(nx)) continue;

        candidateSet.add(key);

        let coverage = 0;
        let nearTurn = false;
        for (const pc of path) {
          const d = Math.sqrt((pc.x - nx) ** 2 + (pc.y - ny) ** 2);
          if (d <= 3) {
            coverage++;
            if (turnPoints.has(`${pc.x},${pc.y}`)) nearTurn = true;
          }
        }

        if (coverage > 0) {
          candidates.push({ x: nx, y: ny, score: coverage + (nearTurn ? 8 : 0) });
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const maxTowers = Math.min(100, Math.max(30, Math.floor(budget / 40)));
  let towersPlaced = 0;
  const towerTypeCounts: Record<string, number> = {};

  for (const candidate of candidates) {
    if (towersPlaced >= maxTowers || spent >= budget) break;

    const towerType = chooseTowerType(state, playerId, depth, towerTypeCounts);
    const cost = getDynamicPrice(state, towerType);

    let finalType = towerType;
    let finalCost = cost;
    if (spent + cost > budget) {
      finalType = TowerType.BASIC;
      finalCost = getDynamicPrice(state, TowerType.BASIC);
      if (spent + finalCost > budget) continue;
    }

    const v = validateTowerPlacement(state.grid, candidate.x, candidate.y, side);
    if (!v.valid) continue;

    state.grid.cells[candidate.y][candidate.x] = CellType.TOWER;
    const testPath = findPath(state.grid, side);
    if (!testPath) {
      state.grid.cells[candidate.y][candidate.x] = CellType.EMPTY;
      continue;
    }

    simulated.push({ x: candidate.x, y: candidate.y });
    placements.push({ x: candidate.x, y: candidate.y, type: finalType, cost: finalCost });
    spent += finalCost;
    towersPlaced++;
    towerTypeCounts[finalType] = (towerTypeCounts[finalType] ?? 0) + 1;
  }

  for (const cell of simulated) {
    state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
  }

  const typeStr = Object.entries(towerTypeCounts).map(([t, c]) => `${t}:${c}`).join(' ');
  log(`[MAZE] Offensive: ${towersPlaced} towers (${typeStr}), ${spent}c, path=${path.length}`);

  return spent;
}
