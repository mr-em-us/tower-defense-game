import { GameState, GamePhase, TowerType, EnemyType } from '../../shared/types/game.types.js';
import { ENEMY_STATS } from '../../shared/types/constants.js';
import { EnemySpatialIndex } from '../game/SpatialIndex.js';

export class ProjectileSystem {
  update(state: GameState, dt: number, index?: EnemySpatialIndex): void {
    if (state.phase !== GamePhase.COMBAT) return;

    // Tests may omit the index — build one on the fly
    let idx = index;
    if (!idx) {
      idx = new EnemySpatialIndex();
      idx.rebuild(state.enemies);
    }

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
          // AA splash only hits flying enemies
          const splashTower = proj.towerId ? state.towers[proj.towerId] : null;
          const isAASplash = splashTower?.type === TowerType.AA;
          const splashDmg = Math.round(proj.damage * 0.5);
          const radiusSq = proj.splashRadius * proj.splashRadius;
          const px = proj.position.x;
          const py = proj.position.y;
          idx.forEachInRadius(proj.position, proj.splashRadius, (enemy) => {
            if (enemy.id === proj.targetId) return;
            if (isAASplash && enemy.type !== EnemyType.FLYING) return;
            const dx = enemy.position.x - px;
            const dy = enemy.position.y - py;
            if (dx * dx + dy * dy <= radiusSq) {
              this.applyDamage(state, enemy.id, splashDmg, proj.towerId);
            }
          });
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
