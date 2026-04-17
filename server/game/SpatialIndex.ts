import { Enemy, Position } from '../../shared/types/game.types.js';
import { GRID } from '../../shared/types/constants.js';

const CELL_SIZE = 4;
const COLS = Math.ceil(GRID.WIDTH / CELL_SIZE);
const ROWS = Math.ceil(GRID.HEIGHT / CELL_SIZE);

/**
 * Uniform-grid spatial index for enemies.
 * Rebuild once per tick, then query O(buckets_in_range) instead of O(all enemies).
 */
export class EnemySpatialIndex {
  private buckets: Enemy[][] = [];

  constructor() {
    for (let i = 0; i < COLS * ROWS; i++) this.buckets.push([]);
  }

  rebuild(enemies: Record<string, Enemy>): void {
    for (const bucket of this.buckets) bucket.length = 0;
    for (const id in enemies) {
      const e = enemies[id];
      if (!e.spawned || e.health <= 0) continue;
      const cx = Math.min(COLS - 1, Math.max(0, Math.floor(e.position.x / CELL_SIZE)));
      const cy = Math.min(ROWS - 1, Math.max(0, Math.floor(e.position.y / CELL_SIZE)));
      this.buckets[cy * COLS + cx].push(e);
    }
  }

  /**
   * Run `visit` on every candidate enemy within `radius` of `center`.
   * Candidates may be slightly outside radius — caller must still distance-check.
   */
  forEachInRadius(center: Position, radius: number, visit: (e: Enemy) => void): void {
    const cellRadius = Math.ceil(radius / CELL_SIZE);
    const cx = Math.floor(center.x / CELL_SIZE);
    const cy = Math.floor(center.y / CELL_SIZE);
    const xMin = Math.max(0, cx - cellRadius);
    const xMax = Math.min(COLS - 1, cx + cellRadius);
    const yMin = Math.max(0, cy - cellRadius);
    const yMax = Math.min(ROWS - 1, cy + cellRadius);
    for (let by = yMin; by <= yMax; by++) {
      const rowBase = by * COLS;
      for (let bx = xMin; bx <= xMax; bx++) {
        const bucket = this.buckets[rowBase + bx];
        for (let i = 0; i < bucket.length; i++) visit(bucket[i]);
      }
    }
  }
}
