import { GameState, GamePhase, TowerType, EnemyType } from '../../shared/types/game.types.js';
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
        this.applyDamage(state, proj.targetId, proj.damage, proj.towerId);

        // Splash damage
        if (proj.isSplash && proj.splashRadius > 0) {
          for (const enemy of Object.values(state.enemies)) {
            if (enemy.id === proj.targetId) continue;
            if (distance(enemy.position, proj.position) <= proj.splashRadius) {
              this.applyDamage(state, enemy.id, Math.round(proj.damage * 0.5), proj.towerId);
            }
          }
        }

        // Slow effect - apply slow with duration tracking
        if (proj.isSlowing && target.health > 0) {
          const baseSpeed = ENEMY_STATS[target.type].speed * (state.settings.enemyOverrides?.[target.type]?.speed ?? 1);
          const minSpeed = baseSpeed * proj.slowAmount;
          if (target.speed > minSpeed) {
            target.speed = minSpeed;
          }
          // Reset slow timer — speed will be restored by EnemySystem
          (target as any)._slowTimer = proj.slowDuration;
          (target as any)._baseSpeed = baseSpeed;
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

  private applyDamage(state: GameState, enemyId: string, damage: number, towerId: string): void {
    const enemy = state.enemies[enemyId];
    if (!enemy) return;

    let finalDamage = damage;
    // Flying damage: AA towers deal 3x, non-AA towers deal 50%
    if (enemy.type === EnemyType.FLYING) {
      const tower = state.towers[towerId];
      if (tower && tower.type === TowerType.AA) {
        finalDamage = Math.round(damage * 3);
      } else {
        finalDamage = Math.round(damage * 0.5);
      }
    }
    enemy.health -= finalDamage;

    if (enemy.health <= 0) {
      // Award credits to the tower owner for the kill
      const tower = state.towers[towerId];
      if (tower) {
        const owner = state.players[tower.ownerId];
        if (owner) {
          owner.credits += enemy.creditValue;
          // Track kill reward in wave economy
          const econ = state.waveEconomy[tower.ownerId];
          if (econ) econ.killRewards += enemy.creditValue;
        }
      }
      state.waveEnemiesKilled++;
      state.waveCreditsEarned += enemy.creditValue;
      delete state.enemies[enemyId];
    }
  }
}
