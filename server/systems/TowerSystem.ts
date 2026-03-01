import { GameState, GamePhase, Projectile, Tower, Enemy, PlayerSide } from '../../shared/types/game.types.js';
import { PROJECTILE_SPEED, TOWER_STATS, GRID } from '../../shared/types/constants.js';
import { distance } from '../../shared/utils/math.js';
import { v4 as uuid } from 'uuid';

export class TowerSystem {
  update(state: GameState, dt: number, now: number): void {
    if (state.phase !== GamePhase.COMBAT) return;

    for (const tower of Object.values(state.towers)) {
      const stats = TOWER_STATS[tower.type];
      const fireInterval = 1 / tower.fireRate;

      if (now - tower.lastFireTime < fireInterval) continue;

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
      tower.lastFireTime = now;
      tower.ammo--;

      // Deduct ammo cost from owner's credits in real-time
      if (owner) {
        owner.credits -= stats.ammoCostPerRound;
      }

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
