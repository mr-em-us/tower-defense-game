import { GameState, GamePhase, Projectile, Tower, Enemy, PlayerSide } from '../../shared/types/game.types.js';
import { PROJECTILE_SPEED, TOWER_STATS, GRID } from '../../shared/types/constants.js';
import { EnemySpatialIndex } from '../game/SpatialIndex.js';
import { v4 as uuid } from 'uuid';

export class TowerSystem {
  private gameTime = 0;

  update(state: GameState, dt: number, now: number, index?: EnemySpatialIndex): void {
    if (state.phase !== GamePhase.COMBAT) return;

    // Tests may omit the index — build one on the fly
    let idx = index;
    if (!idx) {
      idx = new EnemySpatialIndex();
      idx.rebuild(state.enemies);
    }

    // Use game-time (adjusted by gameSpeed) for fire timing,
    // not wall-clock. Wall-clock + speed-adjusted intervals cause
    // tick quantization errors at certain speeds (17% DPS loss at 4x).
    this.gameTime += dt; // dt is already adjustedDt from GameRoom

    for (const tower of Object.values(state.towers)) {
      const stats = TOWER_STATS[tower.type];
      const fireInterval = 1 / tower.fireRate;

      if (this.gameTime - tower.lastFireTime < fireInterval) continue;

      // No ammo - can't fire
      if (tower.ammo <= 0) continue;

      // Determine which half this tower's owner controls
      const owner = state.players[tower.ownerId];
      const ownerSide = owner?.side ?? null;

      // Find closest enemy in range on the same half
      const target = this.findTarget(tower, ownerSide, idx);
      if (!target) {
        tower.targetId = null;
        continue;
      }

      tower.targetId = target.id;
      tower.lastFireTime = this.gameTime;
      tower.ammo--;

      // Track ammo usage per player
      const econ = state.waveEconomy[tower.ownerId];
      if (econ) { econ.ammoUsed++; econ.shotsFired++; }

      // Create projectile
      const projectile: Projectile = {
        id: uuid(),
        position: { x: tower.position.x, y: tower.position.y },
        targetId: target.id,
        damage: tower.damage,
        speed: PROJECTILE_SPEED,
        towerId: tower.id,
        isSplash: stats.splashRadius > 0,
        splashRadius: stats.splashRadius,
        isSlowing: stats.slowAmount > 0,
        slowAmount: stats.slowAmount,
        slowDuration: stats.slowDuration,
      };

      state.projectiles[projectile.id] = projectile;
    }
  }

  private findTarget(tower: Tower, ownerSide: PlayerSide | null, index: EnemySpatialIndex): Enemy | null {
    let closest: Enemy | null = null;
    let closestDistSq = Infinity;
    const tx = tower.position.x;
    const ty = tower.position.y;
    const rangeSq = tower.range * tower.range;
    // Squared distance avoids sqrt per candidate.

    index.forEachInRadius(tower.position, tower.range, (enemy) => {
      if (enemy.health <= 0) return;
      if (ownerSide === PlayerSide.LEFT && enemy.position.x > GRID.LEFT_ZONE_END) return;
      if (ownerSide === PlayerSide.RIGHT && enemy.position.x < GRID.RIGHT_ZONE_START) return;
      const dx = enemy.position.x - tx;
      const dy = enemy.position.y - ty;
      const dSq = dx * dx + dy * dy;
      if (dSq <= rangeSq && dSq < closestDistSq) {
        closest = enemy;
        closestDistSq = dSq;
      }
    });

    return closest;
  }
}
