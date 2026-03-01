import { GameState, GamePhase } from '../../shared/types/game.types.js';
import { ENEMY_STATS } from '../../shared/types/constants.js';
import { distance } from '../../shared/utils/math.js';

export class ProjectileSystem {
  update(state: GameState, dt: number): void {
    if (state.phase !== GamePhase.COMBAT) return;

    const toRemove: string[] = [];

    for (const proj of Object.values(state.projectiles)) {
      const target = state.enemies[proj.targetId];

      if (!target || target.health <= 0) {
        toRemove.push(proj.id);
        continue;
      }

      // Move towards target
      const dx = target.position.x - proj.position.x;
      const dy = target.position.y - proj.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.3) {
        // Hit!
        this.applyDamage(state, proj.targetId, proj.damage);

        // Splash damage
        if (proj.isSplash && proj.splashRadius > 0) {
          for (const enemy of Object.values(state.enemies)) {
            if (enemy.id === proj.targetId) continue;
            if (distance(enemy.position, proj.position) <= proj.splashRadius) {
              this.applyDamage(state, enemy.id, Math.round(proj.damage * 0.5));
            }
          }
        }

        // Slow effect - cap at base speed * slowAmount to prevent compounding
        if (proj.isSlowing && target.health > 0) {
          const baseSpeed = ENEMY_STATS[target.type].speed;
          const minSpeed = baseSpeed * proj.slowAmount;
          if (target.speed > minSpeed) {
            target.speed = minSpeed;
          }
        }

        toRemove.push(proj.id);
      } else {
        const step = proj.speed * dt;
        const ratio = Math.min(step / dist, 1);
        proj.position.x += dx * ratio;
        proj.position.y += dy * ratio;
      }
    }

    for (const id of toRemove) {
      delete state.projectiles[id];
    }
  }

  private applyDamage(state: GameState, enemyId: string, damage: number): void {
    const enemy = state.enemies[enemyId];
    if (!enemy) return;

    enemy.health -= damage;

    if (enemy.health <= 0) {
      // No credit reward - killing enemies prevents the money loss from pass-through
      state.waveEnemiesKilled++;
      delete state.enemies[enemyId];
    }
  }
}
