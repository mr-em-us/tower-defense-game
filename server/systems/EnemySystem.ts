import { GameState, GamePhase, PlayerSide, CellType } from '../../shared/types/game.types.js';
import { ENEMY_STATS, GRID } from '../../shared/types/constants.js';

const ADJ_DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export class EnemySystem {
  update(state: GameState, dt: number): void {
    if (state.phase !== GamePhase.COMBAT) return;

    const toRemove: string[] = [];
    const towersToRemove: string[] = [];

    for (const enemy of Object.values(state.enemies)) {
      if (!enemy.spawned) continue;

      // Contact damage to adjacent towers
      const ex = Math.round(enemy.position.x);
      const ey = Math.round(enemy.position.y);
      const contactDmg = ENEMY_STATS[enemy.type].contactDamage;

      for (const dir of ADJ_DIRS) {
        const ax = ex + dir.x;
        const ay = ey + dir.y;
        if (ax < 0 || ax >= GRID.WIDTH || ay < 0 || ay >= GRID.HEIGHT) continue;

        // Find tower at this adjacent cell
        for (const tower of Object.values(state.towers)) {
          if (tower.position.x === ax && tower.position.y === ay) {
            tower.health -= contactDmg;
            if (tower.health <= 0 && !towersToRemove.includes(tower.id)) {
              towersToRemove.push(tower.id);
            }
          }
        }
      }

      // Move along path
      const target = enemy.path[enemy.pathIndex + 1];
      if (!target) {
        // Reached the end - deduct money from defending player
        this.enemyReachedGoal(state, enemy.targetSide, enemy.creditValue);
        toRemove.push(enemy.id);
        continue;
      }

      const dx = target.x - enemy.position.x;
      const dy = target.y - enemy.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.05) {
        enemy.position.x = target.x;
        enemy.position.y = target.y;
        enemy.pathIndex++;
      } else {
        const step = enemy.speed * dt;
        const ratio = Math.min(step / dist, 1);
        enemy.position.x += dx * ratio;
        enemy.position.y += dy * ratio;
      }
    }

    for (const id of toRemove) {
      delete state.enemies[id];
    }

    // Remove destroyed towers
    for (const id of towersToRemove) {
      const tower = state.towers[id];
      if (tower) {
        state.grid.cells[tower.position.y][tower.position.x] = CellType.EMPTY;
        delete state.towers[id];
      }
    }
  }

  private enemyReachedGoal(state: GameState, targetSide: PlayerSide, damage: number): void {
    // The defending player loses HP equal to the enemy's credit value
    for (const player of Object.values(state.players)) {
      if (player.side === targetSide) {
        player.health = Math.max(0, player.health - damage);
        break;
      }
    }
  }
}
