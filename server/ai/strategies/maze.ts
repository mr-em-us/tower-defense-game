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
 * AI maze strategy: seed + scatter + greedy.
 *
 * Phase 1 (Seed): Place 2 full-height WALL columns near spawn to create
 * initial path extension (+25). This is the most budget-efficient structure
 * for forcing detours. Uses ~1450c (74% of wave 1 budget).
 *
 * Phase 2 (Offense): Scatter offense towers adjacent to the path
 * (corridors between/around columns). These deal damage AND constrain
 * the grid for future greedy expansion.
 *
 * Phase 3 (Greedy extend): In subsequent waves, use greedy WALL placement
 * to extend the path further. The grid is now constrained by columns +
 * offense towers, so greedy is effective.
 *
 * Phase 4 (AA): Place AA towers proactively for air waves.
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
  const simulated: { x: number; y: number }[] = [];

  const pathBefore = findPath(state.grid, side);
  const pathLenBefore = pathBefore?.length ?? 0;

  let spent = 0;
  const towerTypeCounts: Record<string, number> = {};

  // Reserve budget for AA
  const airWaveImminent = state.airWaveCountdown >= 0 && state.airWaveCountdown <= 3;
  const aaReserve = (airWaveImminent || wave >= 3) ? 200 : 0;
  const totalBudget = budget - aaReserve;

  // Zone bounds
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // === Phase 1: Column seeds (full-height WALL columns) ===
  // Cap at 95% of budget — columns include offense towers, remaining for greedy/fill
  const columnBudget = Math.floor(totalBudget * 0.95);
  const columnSpent = placeColumnSeeds(state, side, columnBudget, placements, simulated, towerTypeCounts, playerId, depth);
  spent += columnSpent;

  // === Phase 2: Greedy path extension with WALLs ===
  const greedyBudget = Math.floor((totalBudget - spent) * 0.25);
  const greedySpent = greedyExtendPath(state, side, greedyBudget, placements, simulated, towerTypeCounts, xMin, xMax);
  spent += greedySpent;

  // === Phase 3: Offense towers adjacent to path ===
  const offenseBudget = totalBudget - spent;
  const offenseSpent = placeOffenseTowers(state, playerId, side, offenseBudget, depth, placements, simulated, towerTypeCounts, xMin, xMax);
  spent += offenseSpent;

  // === Phase 4: AA defense ===
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
  for (const c of simCells) state.grid.cells[c.y][c.x] = CellType.EMPTY;

  const typeStr = Object.entries(towerTypeCounts).map(([t, c]) => `${t}:${c}`).join(' ');
  log(`[MAZE] Wave ${wave} | Budget ${budget} | Spent ${spent}c (${typeStr}) AA:${aaSpent}c | Path: ${pathLenBefore} -> ${pathLenAfter} | Placed ${placements.length} towers`);

  return placements;
}

/**
 * Place full-height columns near spawn with mixed tower types.
 * Cells adjacent to corridors (where enemies walk) use offense towers.
 * Other cells use WALLs (cheap blocking).
 * Plans up to 14 columns — skips cells that already have towers.
 * Columns spaced 2 apart with gaps at alternating heights.
 */
function placeColumnSeeds(
  state: GameState,
  side: PlayerSide,
  budget: number,
  placements: PlannedPlacement[],
  simulated: { x: number; y: number }[],
  towerTypeCounts: Record<string, number>,
  playerId?: string,
  depth?: number,
): number {
  const SPACING = 2;
  const HEIGHT = GRID.HEIGHT;
  const wallCost = getDynamicPrice(state, TowerType.WALL);
  const basicCost = getDynamicPrice(state, TowerType.BASIC);

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;
  const margin = 2;

  const columnXs: number[] = [];
  if (side === PlayerSide.RIGHT) {
    for (let x = xMin + margin; x <= xMax - 1; x += SPACING) {
      columnXs.push(x);
    }
  } else {
    for (let x = xMax - margin; x >= xMin + 1; x -= SPACING) {
      columnXs.push(x);
    }
  }

  // Determine corridor positions (between columns)
  const corridorXs = new Set<number>();
  for (let i = 0; i < Math.min(columnXs.length, 14) - 1; i++) {
    const x1 = columnXs[i];
    const x2 = columnXs[i + 1];
    if (side === PlayerSide.RIGHT) {
      for (let cx = x1 + 1; cx < x2; cx++) corridorXs.add(cx);
    } else {
      for (let cx = x1 - 1; cx > x2; cx--) corridorXs.add(cx);
    }
  }

  let spent = 0;

  for (let i = 0; i < Math.min(columnXs.length, 14); i++) {
    const colX = columnXs[i];
    const gapY = i % 2 === 0 ? HEIGHT - 2 : 1;

    // Check if this column is already mostly built
    let existingCells = 0;
    for (let y = 0; y < HEIGHT; y++) {
      if (y === gapY) continue;
      if (state.grid.cells[y][colX] === CellType.TOWER) existingCells++;
    }
    if (existingCells > HEIGHT * 0.7) continue;

    // Only first column (closest to spawn) gets offense towers.
    // Other columns use all WALLs to save budget for more columns.
    const isFirstNewColumn = (i === 0 || placements.length === 0);
    const adjCorridor = corridorXs.has(colX - 1) || corridorXs.has(colX + 1);

    // Build the column
    const columnCells: { x: number; y: number; type: TowerType; cost: number }[] = [];
    let columnCost = 0;

    for (let y = 0; y < HEIGHT; y++) {
      if (y === gapY) continue;
      if (state.grid.cells[y][colX] !== CellType.EMPTY) continue;
      if (isInSpawnZone(colX, y)) continue;

      // Use offense only for first column, near spawn, adjacent to corridor
      const nearSpawn = Math.abs(y - 14) <= 8;
      const useOffense = isFirstNewColumn && adjCorridor && nearSpawn;

      let type: TowerType;
      let cost: number;
      if (useOffense && playerId) {
        type = chooseTowerType(state, playerId, depth ?? 0.5, towerTypeCounts);
        cost = getDynamicPrice(state, type);
        if (spent + columnCost + cost > budget) {
          type = TowerType.BASIC;
          cost = basicCost;
        }
      } else {
        type = TowerType.WALL;
        cost = wallCost;
      }

      if (spent + columnCost + cost > budget) {
        // Try WALL as last resort
        type = TowerType.WALL;
        cost = wallCost;
        if (spent + columnCost + cost > budget) break;
      }

      // Validate path
      state.grid.cells[y][colX] = CellType.TOWER;
      const testPath = findPath(state.grid, side);
      if (!testPath) {
        state.grid.cells[y][colX] = CellType.EMPTY;
        continue;
      }

      columnCells.push({ x: colX, y, type, cost });
      columnCost += cost;
      // Update counts immediately so chooseTowerType sees accurate state
      towerTypeCounts[type] = (towerTypeCounts[type] ?? 0) + 1;
    }

    if (columnCells.length < HEIGHT * 0.5) {
      // Undo placement and revert counts
      for (const c of columnCells) {
        state.grid.cells[c.y][c.x] = CellType.EMPTY;
        towerTypeCounts[c.type] = (towerTypeCounts[c.type] ?? 1) - 1;
      }
      break;
    }

    // Commit the column (towerTypeCounts already updated during planning)
    for (const c of columnCells) {
      simulated.push({ x: c.x, y: c.y });
      placements.push({ x: c.x, y: c.y, type: c.type, cost: c.cost });
    }
    spent += columnCost;
  }

  return spent;
}

/**
 * Greedy path extension: place WALLs one at a time on/near the current path,
 * picking the cell that maximizes path length increase.
 */
function greedyExtendPath(
  state: GameState,
  side: PlayerSide,
  budget: number,
  placements: PlannedPlacement[],
  simulated: { x: number; y: number }[],
  towerTypeCounts: Record<string, number>,
  xMin: number,
  xMax: number,
): number {
  const wallCost = getDynamicPrice(state, TowerType.WALL);
  let spent = 0;
  let noGainRuns = 0;

  while (spent + wallCost <= budget && noGainRuns < 5) {
    const currentPath = findPath(state.grid, side);
    if (!currentPath || currentPath.length === 0) break;

    let bestCell: { x: number; y: number } | null = null;
    let bestIncrease = -1;

    // Check cells on the path AND adjacent to path
    const checked = new Set<string>();

    for (const cell of currentPath) {
      // Check the path cell itself
      const key = `${cell.x},${cell.y}`;
      if (!checked.has(key)) {
        checked.add(key);
        const inc = tryWallPlacement(state, side, cell.x, cell.y, currentPath.length, xMin, xMax);
        if (inc !== null && inc > bestIncrease) {
          bestIncrease = inc;
          bestCell = { x: cell.x, y: cell.y };
        }
      }

      // Check adjacent cells
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        const akey = `${nx},${ny}`;
        if (checked.has(akey)) continue;
        checked.add(akey);
        const inc = tryWallPlacement(state, side, nx, ny, currentPath.length, xMin, xMax);
        if (inc !== null && inc > bestIncrease) {
          bestIncrease = inc;
          bestCell = { x: nx, y: ny };
        }
      }
    }

    if (!bestCell || bestIncrease < 0) break;

    if (bestIncrease === 0) {
      noGainRuns++;
    } else {
      noGainRuns = 0;
    }

    // Place the WALL
    state.grid.cells[bestCell.y][bestCell.x] = CellType.TOWER;
    simulated.push(bestCell);
    placements.push({ x: bestCell.x, y: bestCell.y, type: TowerType.WALL, cost: wallCost });
    spent += wallCost;
    towerTypeCounts[TowerType.WALL] = (towerTypeCounts[TowerType.WALL] ?? 0) + 1;
  }

  return spent;
}

/** Try placing a wall at (x,y) and return path increase, or null if invalid. */
function tryWallPlacement(
  state: GameState,
  side: PlayerSide,
  x: number,
  y: number,
  currentPathLen: number,
  xMin: number,
  xMax: number,
): number | null {
  if (x < xMin || x > xMax || y < 0 || y >= GRID.HEIGHT) return null;
  if (state.grid.cells[y][x] !== CellType.EMPTY) return null;
  if (isInSpawnZone(x, y)) return null;

  state.grid.cells[y][x] = CellType.TOWER;
  const newPath = findPath(state.grid, side);
  state.grid.cells[y][x] = CellType.EMPTY;

  if (!newPath) return null;
  return newPath.length - currentPathLen;
}

/**
 * Place offense towers adjacent to the current path.
 */
function placeOffenseTowers(
  state: GameState,
  playerId: string,
  side: PlayerSide,
  budget: number,
  depth: number,
  placements: PlannedPlacement[],
  simulated: { x: number; y: number }[],
  towerTypeCounts: Record<string, number>,
  xMin: number,
  xMax: number,
): number {
  if (budget <= 0) return 0;

  const finalPath = findPath(state.grid, side);
  if (!finalPath) return 0;

  const pathSet = new Set(finalPath.map(c => `${c.x},${c.y}`));

  // Find empty cells adjacent to the path
  const candidates: { x: number; y: number; score: number }[] = [];
  const checked = new Set<string>();

  for (const cell of finalPath) {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      const key = `${nx},${ny}`;
      if (checked.has(key)) continue;
      checked.add(key);

      if (nx < xMin || nx > xMax || ny < 0 || ny >= GRID.HEIGHT) continue;
      if (state.grid.cells[ny][nx] !== CellType.EMPTY) continue;
      if (isInSpawnZone(nx, ny)) continue;
      if (pathSet.has(key)) continue;

      // Score: adjacency to path + proximity to spawn (early kills better)
      let adjPathCells = 0;
      for (const [dx2, dy2] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (pathSet.has(`${nx + dx2},${ny + dy2}`)) adjPathCells++;
      }
      candidates.push({ x: nx, y: ny, score: adjPathCells });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  let spent = 0;
  for (const c of candidates) {
    if (spent >= budget) break;

    let towerType = chooseTowerType(state, playerId, depth, towerTypeCounts);
    let cost = getDynamicPrice(state, towerType);

    if (spent + cost > budget) {
      towerType = TowerType.BASIC;
      cost = getDynamicPrice(state, TowerType.BASIC);
      if (spent + cost > budget) break;
    }

    state.grid.cells[c.y][c.x] = CellType.TOWER;
    const testPath = findPath(state.grid, side);
    if (!testPath) {
      state.grid.cells[c.y][c.x] = CellType.EMPTY;
      continue;
    }

    simulated.push({ x: c.x, y: c.y });
    placements.push({ x: c.x, y: c.y, type: towerType, cost });
    spent += cost;
    towerTypeCounts[towerType] = (towerTypeCounts[towerType] ?? 0) + 1;
  }

  return spent;
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
