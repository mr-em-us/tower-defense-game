import { GameState, GamePhase, PlayerSide, CellType, EnemyType, Tower } from '../../shared/types/game.types.js';
import { ENEMY_STATS, GRID } from '../../shared/types/constants.js';

const ADJ_DIRS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

const MAX_TOWER_TRACES = 300;

export class EnemySystem {
  update(state: GameState, dt: number): void {
    if (state.phase !== GamePhase.COMBAT) return;

    const toRemove: string[] = [];
    const towersToRemoveSet = new Set<string>();

    // Build tower position lookup: "x,y" -> Tower. O(towers) once,
    // then O(1) per enemy adjacency check instead of O(towers) linear scan.
    const towerAt = new Map<number, Tower>();
    for (const tower of Object.values(state.towers)) {
      towerAt.set(tower.position.y * GRID.WIDTH + tower.position.x, tower);
    }

    for (const enemy of Object.values(state.enemies)) {
      if (!enemy.spawned) continue;

      // Slow duration tick-down: restore speed when slow wears off
      const slowTimer = (enemy as any)._slowTimer;
      if (typeof slowTimer === 'number' && slowTimer > 0) {
        (enemy as any)._slowTimer = slowTimer - dt;
        if ((enemy as any)._slowTimer <= 0) {
          const baseSpeed = (enemy as any)._baseSpeed;
          if (typeof baseSpeed === 'number') {
            enemy.speed = baseSpeed;
          }
          delete (enemy as any)._slowTimer;
          delete (enemy as any)._baseSpeed;
        }
      }

      // Flying enemies fly over towers, no contact damage
      if (enemy.type !== EnemyType.FLYING) {
        const ex = Math.round(enemy.position.x);
        const ey = Math.round(enemy.position.y);
        const baseContactDmg = ENEMY_STATS[enemy.type].contactDamage;
        const contactOverride = state.settings?.enemyOverrides?.[enemy.type]?.contactDamage ?? 1;
        // Scale contact damage by speed ratio: slowed enemies deal proportionally less
        // damage per tick so total damage over a tile is unchanged (otherwise slow
        // effectively buffs enemy DPS by keeping them adjacent longer).
        const baseSpeed = ENEMY_STATS[enemy.type].speed * (state.settings?.enemyOverrides?.[enemy.type]?.speed ?? 1);
        const speedRatio = baseSpeed > 0 ? enemy.speed / baseSpeed : 1;
        const contactDmg = baseContactDmg * contactOverride * speedRatio;

        for (const dir of ADJ_DIRS) {
          const ax = ex + dir.x;
          const ay = ey + dir.y;
          if (ax < 0 || ax >= GRID.WIDTH || ay < 0 || ay >= GRID.HEIGHT) continue;

          const tower = towerAt.get(ay * GRID.WIDTH + ax);
          if (!tower) continue;
          tower.health -= contactDmg;
          if (tower.health <= 0) towersToRemoveSet.add(tower.id);
        }
      }

      // Move along path
      const target = enemy.path[enemy.pathIndex + 1];
      if (!target) {
        // Reached the end - deduct money from defending player
        this.enemyReachedGoal(state, enemy.targetSide, enemy.leakDamage);
        state.waveLeakedByType[enemy.type] = (state.waveLeakedByType[enemy.type] ?? 0) + 1;
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

    // Remove destroyed towers (leave ghost traces)
    if (towersToRemoveSet.size > 0) {
      for (const id of towersToRemoveSet) {
        const tower = state.towers[id];
        if (tower) {
          state.destroyedTowerTraces.push({
            position: { x: tower.position.x, y: tower.position.y },
            type: tower.type,
            ownerId: tower.ownerId,
            level: tower.level,
          });
          state.waveTowersDestroyed++;
          state.grid.cells[tower.position.y][tower.position.x] = CellType.EMPTY;
          delete state.towers[id];
        }
      }
      // Cap traces to avoid unbounded growth in long games
      if (state.destroyedTowerTraces.length > MAX_TOWER_TRACES) {
        state.destroyedTowerTraces.splice(0, state.destroyedTowerTraces.length - MAX_TOWER_TRACES);
      }
      // Signal path-cache invalidation for new enemy spawns
      state.gridVersion++;
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
