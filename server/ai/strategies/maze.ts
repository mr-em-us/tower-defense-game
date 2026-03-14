import { GameState, PlayerSide, TowerType, CellType } from '../../../shared/types/game.types.js';
import { GRID, TOWER_STATS } from '../../../shared/types/constants.js';
import { findPath, validateTowerPlacement } from '../../../shared/logic/pathfinding.js';
import { scorePlacement, getCandidateCells, chooseTowerType } from './placement.js';
import { getDynamicPrice } from './economy.js';

interface PlannedPlacement {
  x: number;
  y: number;
  type: TowerType;
  cost: number;
}

/**
 * Generate a sequence of tower placements that form a maze and fill it with
 * offensive towers. Returns placements in order (walls/maze first, then offense).
 *
 * The maze strategy builds vertical wall columns spanning nearly the full grid
 * height with alternating top/bottom gaps, forcing enemies to zigzag vertically.
 * Each column of horizontal progress requires traveling the full grid height,
 * maximizing path length while minimizing horizontal progress.
 *
 * Offensive towers are placed in horizontal lines for dual coverage:
 * ground enemies pass through kill zones in the corridors, and flying enemies
 * (which ignore the maze) hit a horizontal line of AA/damage towers.
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
  let spent = 0;

  // Phase 1: Vertical maze walls
  const wallBudgetRatio = 0.55 + depth * 0.15; // 55-70% of budget on walls
  const wallBudget = Math.round(budget * wallBudgetRatio);
  const wallCost = getDynamicPrice(state, TowerType.WALL);

  spent = placeVerticalWalls(state, playerId, side, wallBudget, wallCost, depth, placements);

  // Phase 2: Offensive towers in horizontal lines along corridors
  const offenseBudget = budget - spent;
  spent += placeOffensiveTowers(state, playerId, side, offenseBudget, depth, placements);

  return placements;
}

/**
 * Build vertical wall columns with alternating top/bottom gaps.
 *
 * For the RIGHT side (cols 30-59), enemies enter at col 30 row 14 and
 * must reach col 59 rows 12-17. Vertical walls at regular column intervals
 * force enemies to travel up/down the full grid height for each few columns
 * of horizontal progress.
 *
 * Layout example (RIGHT side, gap=2, spacing=3):
 *   col 33: wall rows 0-27, gap at bottom (rows 28-29)
 *   col 36: wall rows 2-29, gap at top (rows 0-1)
 *   col 39: wall rows 0-27, gap at bottom
 *   ...etc
 *
 * Depth controls:
 * - Column spacing (easy: 4 cols apart, hard: 3 cols apart)
 * - Gap size (easy: 3 rows, hard: 2 rows)
 * - Wall completeness (easy: skip some cells randomly)
 */
function placeVerticalWalls(
  state: GameState,
  _playerId: string,
  side: PlayerSide,
  budget: number,
  wallCost: number,
  depth: number,
  placements: PlannedPlacement[],
): number {
  let spent = 0;
  const maxWalls = Math.floor(budget / wallCost);
  if (maxWalls <= 0) return 0;

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // Gap size at top/bottom of each column: easy=3, hard=2
  const gapSize = Math.max(2, Math.round(3 - depth));

  // Column spacing: easy=5, hard=3 columns between wall columns
  const colSpacing = Math.max(3, Math.round(5 - depth * 2));

  // Determine which columns to build walls on.
  // Start a few columns in from the entry side to give enemies room to enter,
  // then build columns at regular intervals toward the exit.
  const wallCols: number[] = [];
  const startOffset = 3; // Don't wall right at the entry

  if (side === PlayerSide.RIGHT) {
    // Entry at xMin (col 30), exit at xMax (col 59)
    for (let x = xMin + startOffset; x <= xMax - 2; x += colSpacing) {
      wallCols.push(x);
    }
  } else {
    // Entry at xMax (col 29), exit at xMin (col 0)
    for (let x = xMax - startOffset; x >= xMin + 2; x -= colSpacing) {
      wallCols.push(x);
    }
  }

  // Track which columns are already substantially built (from previous waves)
  const builtCols = new Set<number>();
  for (const col of wallCols) {
    let wallCount = 0;
    for (let y = 0; y < GRID.HEIGHT; y++) {
      if (state.grid.cells[y][col] === CellType.TOWER) wallCount++;
    }
    // If >50% of the column has towers, consider it "built"
    if (wallCount > GRID.HEIGHT * 0.5) builtCols.add(col);
  }

  // Save grid state for simulation
  const simulated: { x: number; y: number }[] = [];
  let wallColIndex = 0;

  for (const colX of wallCols) {
    if (spent + wallCost > budget) break;
    if (builtCols.has(colX)) {
      wallColIndex++;
      continue;
    }

    // Alternate gap position: even columns gap at bottom, odd at top
    const gapAtBottom = wallColIndex % 2 === 0;
    wallColIndex++;

    // Build cells for this column (top to bottom)
    const colCells: { x: number; y: number }[] = [];
    for (let y = 0; y < GRID.HEIGHT; y++) {
      // Leave gap
      if (gapAtBottom && y >= GRID.HEIGHT - gapSize) continue;
      if (!gapAtBottom && y < gapSize) continue;

      // Skip if already occupied
      if (state.grid.cells[y][colX] !== CellType.EMPTY) continue;

      colCells.push({ x: colX, y });
    }

    // Easy mode: randomly skip some cells (makes walls gappier)
    const skipChance = Math.max(0, 0.25 - depth * 0.25); // 25% at easy, 0% at hard

    for (const cell of colCells) {
      if (spent + wallCost > budget) break;

      // Random skip for lower difficulty
      if (skipChance > 0 && Math.random() < skipChance) continue;

      // Validate placement
      const v = validateTowerPlacement(state.grid, cell.x, cell.y, side);
      if (!v.valid) continue;

      // Simulate placement to verify path isn't blocked
      state.grid.cells[cell.y][cell.x] = CellType.TOWER;
      const testPath = findPath(state.grid, side);
      if (!testPath) {
        state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
        continue;
      }

      simulated.push({ x: cell.x, y: cell.y });
      placements.push({ x: cell.x, y: cell.y, type: TowerType.WALL, cost: wallCost });
      spent += wallCost;
    }
  }

  // Undo all simulated placements
  for (const cell of simulated) {
    state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
  }

  return spent;
}

/**
 * Place offensive towers in horizontal lines along the maze corridors.
 * This provides:
 * - Kill zones for ground enemies zigzagging through the maze
 * - Linear horizontal coverage against flying enemies that ignore walls
 */
function placeOffensiveTowers(
  state: GameState,
  playerId: string,
  side: PlayerSide,
  budget: number,
  depth: number,
  placements: PlannedPlacement[],
): number {
  let spent = 0;
  const maxTowers = 12;

  // Temporarily apply planned wall placements for accurate scoring
  const simulated: { x: number; y: number }[] = [];
  for (const p of placements) {
    state.grid.cells[p.y][p.x] = CellType.TOWER;
    simulated.push({ x: p.x, y: p.y });
  }

  // Get the current path to find the best kill zone rows
  const path = findPath(state.grid, side);
  const pathRowCounts: Record<number, number> = {};
  if (path) {
    for (const cell of path) {
      pathRowCounts[cell.y] = (pathRowCounts[cell.y] ?? 0) + 1;
    }
  }

  for (let i = 0; i < maxTowers; i++) {
    const towerType = chooseTowerType(state, playerId, depth);
    const cost = getDynamicPrice(state, towerType);
    if (spent + cost > budget) break;

    const candidates = getCandidateCells(state, side, depth);
    if (candidates.length === 0) break;

    // Score candidates with bonus for horizontal alignment with other towers
    // and for being on rows the path traverses heavily
    let bestCell: { x: number; y: number } | null = null;
    let bestScore = -Infinity;

    for (const cell of candidates) {
      let s = scorePlacement(state, playerId, cell.x, cell.y, towerType, depth);

      // Bonus for rows with heavy path traffic (kill zones)
      const rowTraffic = pathRowCounts[cell.y] ?? 0;
      s += rowTraffic * 0.5;

      // Bonus for horizontal alignment — encourages linear AA coverage
      if (towerType === TowerType.AA || towerType === TowerType.SNIPER) {
        const ownedTowers = Object.values(state.towers).filter(t => t.ownerId === playerId);
        for (const t of ownedTowers) {
          if (Math.abs(t.position.y - cell.y) <= 1) {
            s += 1.0; // Bonus for being on the same row as existing towers
          }
        }
      }

      if (s > bestScore) {
        bestScore = s;
        bestCell = cell;
      }
    }

    if (!bestCell) break;

    placements.push({ x: bestCell.x, y: bestCell.y, type: towerType, cost });
    spent += cost;

    state.grid.cells[bestCell.y][bestCell.x] = CellType.TOWER;
    simulated.push({ x: bestCell.x, y: bestCell.y });
  }

  // Undo all simulated placements
  for (const cell of simulated) {
    state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
  }

  return spent;
}
