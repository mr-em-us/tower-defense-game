import { GridCell, GridState, CellType, PlayerSide } from '../types/game.types.js';
import { GRID, CENTER_SPAWN, GOAL_ROWS } from '../types/constants.js';

// Direction sets ordered by preference: toward goal, vertical, away from goal.
// BFS with this ordering produces paths that go straight until blocked.
const DIRECTIONS_LEFT = [
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: 1, y: 0 },
];

const DIRECTIONS_RIGHT = [
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];


function cellKey(x: number, y: number): number {
  return y * GRID.WIDTH + x;
}

/**
 * BFS pathfinding from center spawn zone to a player's edge.
 * Enemies spawn in the center and walk outward.
 *
 * targetSide LEFT  → enemies walk left  to x=0
 * targetSide RIGHT → enemies walk right to x=WIDTH-1
 */
export function findPath(grid: GridState, targetSide: PlayerSide): GridCell[] | null {
  const goalX = targetSide === PlayerSide.LEFT ? 0 : GRID.WIDTH - 1;
  const dirs = targetSide === PlayerSide.LEFT ? DIRECTIONS_LEFT : DIRECTIONS_RIGHT;

  const visited = new Uint8Array(GRID.WIDTH * GRID.HEIGHT);
  const parent = new Int32Array(GRID.WIDTH * GRID.HEIGHT).fill(-1);
  const queue: number[] = [];

  // BFS starts from the center 2x2 spawn point
  for (const row of CENTER_SPAWN.Y_ROWS) {
    for (let x = CENTER_SPAWN.X_MIN; x <= CENTER_SPAWN.X_MAX; x++) {
      if (grid.cells[row][x] !== CellType.TOWER) {
        const key = cellKey(x, row);
        visited[key] = 1;
        queue.push(key);
      }
    }
  }

  let head = 0;
  let goalKey = -1;

  while (head < queue.length) {
    const key = queue[head++];
    const x = key % GRID.WIDTH;
    const y = (key - x) / GRID.WIDTH;

    if (x === goalX && GOAL_ROWS.includes(y)) {
      goalKey = key;
      break;
    }

    for (const dir of dirs) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (nx < 0 || nx >= GRID.WIDTH || ny < 0 || ny >= GRID.HEIGHT) continue;

      // Enemies stay on their target side (spawn zone is shared)
      if (targetSide === PlayerSide.LEFT && nx > CENTER_SPAWN.X_MAX) continue;
      if (targetSide === PlayerSide.RIGHT && nx < CENTER_SPAWN.X_MIN) continue;

      const nkey = cellKey(nx, ny);
      if (visited[nkey]) continue;
      if (grid.cells[ny][nx] === CellType.TOWER) continue;

      visited[nkey] = 1;
      parent[nkey] = key;
      queue.push(nkey);
    }
  }

  if (goalKey === -1) return null;

  // Reconstruct path
  const path: GridCell[] = [];
  let cur = goalKey;
  while (cur !== -1) {
    const x = cur % GRID.WIDTH;
    const y = (cur - x) / GRID.WIDTH;
    path.push({ x, y });
    cur = parent[cur];
  }
  path.reverse();
  return path;
}

/**
 * Check whether placing a tower at (x, y) would block all paths.
 * Returns true if placement would block (i.e. is NOT safe).
 */
export function wouldBlockPath(grid: GridState, x: number, y: number): boolean {
  const prev = grid.cells[y][x];
  grid.cells[y][x] = CellType.TOWER;

  const leftPath = findPath(grid, PlayerSide.LEFT);
  const rightPath = findPath(grid, PlayerSide.RIGHT);

  grid.cells[y][x] = prev;

  return leftPath === null || rightPath === null;
}

/**
 * Check if a cell is in the center spawn zone (no-build area).
 */
export function isInSpawnZone(x: number, y: number): boolean {
  return x >= CENTER_SPAWN.X_MIN && x <= CENTER_SPAWN.X_MAX
    && (CENTER_SPAWN.Y_ROWS as readonly number[]).includes(y);
}

/**
 * Validate whether a player can place a tower at the given position.
 */
export function validateTowerPlacement(
  grid: GridState,
  x: number,
  y: number,
  playerSide: PlayerSide,
): { valid: boolean; reason?: string } {
  if (x < 0 || x >= GRID.WIDTH || y < 0 || y >= GRID.HEIGHT) {
    return { valid: false, reason: 'Out of bounds' };
  }

  if (grid.cells[y][x] !== CellType.EMPTY) {
    return { valid: false, reason: 'Cell occupied' };
  }

  // Center spawn zone - no building allowed (check before zone check due to overlap)
  if (isInSpawnZone(x, y)) {
    return { valid: false, reason: 'Cannot build in spawn zone' };
  }

  // Zone check
  if (playerSide === PlayerSide.LEFT && x > GRID.LEFT_ZONE_END) {
    return { valid: false, reason: 'Not in your zone' };
  }
  if (playerSide === PlayerSide.RIGHT && x < GRID.RIGHT_ZONE_START) {
    return { valid: false, reason: 'Not in your zone' };
  }

  // Path blocking check
  if (wouldBlockPath(grid, x, y)) {
    return { valid: false, reason: 'Would block enemy path' };
  }

  return { valid: true };
}
