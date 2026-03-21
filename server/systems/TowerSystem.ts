import { GameState, GamePhase, Projectile, Tower, Enemy, PlayerSide, TowerType, EnemyType } from '../../shared/types/game.types.js';
import { PROJECTILE_SPEED, TOWER_STATS, GRID } from '../../shared/types/constants.js';
import { distance } from '../../shared/utils/math.js';
import { v4 as uuid } from 'uuid';

export class TowerSystem {
  private gameTime = 0;

  update(state: GameState, dt: number, now: number): void {
    if (state.phase !== GamePhase.COMBAT) return;

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
      const target = this.findTarget(tower, state, ownerSide);
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

  private findTarget(tower: Tower, state: GameState, ownerSide: PlayerSide | null): Enemy | null {
    let closest: Enemy | null = null;
    let closestDist = Infinity;

    for (const enemy of Object.values(state.enemies)) {
      if (!enemy.spawned || enemy.health <= 0) continue;

      // Non-AA towers deal reduced damage to flying (handled in ProjectileSystem)
      // AA towers can target both ground and flying enemies

      // Only target enemies on the tower owner's half of the board
      if (ownerSide === PlayerSide.LEFT && enemy.position.x > GRID.LEFT_ZONE_END) continue;
      if (ownerSide === PlayerSide.RIGHT && enemy.position.x < GRID.RIGHT_ZONE_START) continue;

      const dist = distance(
        { x: tower.position.x, y: tower.position.y },
        enemy.position,
      );

      if (dist <= tower.range && dist < closestDist) {
        closest = enemy;
        closestDist = dist;
      }
    }

    return closest;
  }
}
