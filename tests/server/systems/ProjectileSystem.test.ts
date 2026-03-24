import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectileSystem } from '../../../server/systems/ProjectileSystem.js';
import { GamePhase, PlayerSide, TowerType, EnemyType } from '../../../shared/types/game.types.js';
import { ENEMY_STATS } from '../../../shared/types/constants.js';
import { createGameState, createPlayer, createTower, createEnemy, createProjectile, placeTowerOnGrid, createWaveEconomy } from '../../helpers.js';

describe('ProjectileSystem', () => {
  let system: ProjectileSystem;

  beforeEach(() => {
    system = new ProjectileSystem();
  });

  it('does nothing outside COMBAT phase', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const proj = createProjectile({ position: { x: 5, y: 5 } });
    state.projectiles[proj.id] = proj;
    system.update(state, 0.05);
    expect(state.projectiles[proj.id].position.x).toBe(5);
  });

  it('moves projectile toward target', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const enemy = createEnemy({ position: { x: 10, y: 5 } });
    state.enemies[enemy.id] = enemy;
    const proj = createProjectile({
      position: { x: 5, y: 5 },
      targetId: enemy.id,
      speed: 12,
    });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.1);
    expect(proj.position.x).toBeGreaterThan(5);
  });

  it('removes projectile and deals damage on hit', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({ ownerId: player.id });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const enemy = createEnemy({ position: { x: 5.1, y: 5 }, health: 100 });
    state.enemies[enemy.id] = enemy;
    const proj = createProjectile({
      position: { x: 5, y: 5 }, // very close to enemy
      targetId: enemy.id,
      towerId: tower.id,
      damage: 30,
    });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.05);
    expect(state.projectiles[proj.id]).toBeUndefined();
    expect(enemy.health).toBe(70);
  });

  it('removes projectile when target is dead/missing', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const proj = createProjectile({ targetId: 'nonexistent' });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.05);
    expect(state.projectiles[proj.id]).toBeUndefined();
  });

  it('awards kill credits to tower owner', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT, credits: 100 });
    state.players[player.id] = player;
    const tower = createTower({ ownerId: player.id });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const enemy = createEnemy({
      position: { x: 5.1, y: 5 },
      health: 10,
      creditValue: 25,
    });
    state.enemies[enemy.id] = enemy;
    const proj = createProjectile({
      position: { x: 5, y: 5 },
      targetId: enemy.id,
      towerId: tower.id,
      damage: 50, // will kill
    });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.05);
    expect(player.credits).toBe(125);
    expect(state.enemies[enemy.id]).toBeUndefined();
    expect(state.waveEnemiesKilled).toBe(1);
    expect(state.waveCreditsEarned).toBe(25);
  });

  it('splash damage hits nearby enemies at 50%', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({ ownerId: player.id, type: TowerType.SPLASH });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const target = createEnemy({
      id: 'target',
      position: { x: 5.1, y: 5 },
      health: 200,
    });
    const nearby = createEnemy({
      id: 'nearby',
      position: { x: 5.5, y: 5 }, // within splash radius
      health: 200,
    });
    state.enemies[target.id] = target;
    state.enemies[nearby.id] = nearby;

    const proj = createProjectile({
      position: { x: 5, y: 5 },
      targetId: target.id,
      towerId: tower.id,
      damage: 40,
      isSplash: true,
      splashRadius: 2,
    });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.05);
    expect(target.health).toBe(160); // 200 - 40
    expect(nearby.health).toBe(180); // 200 - 20 (50% splash)
  });

  it('slow effect reduces enemy speed', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    state.settings = { ...state.settings, enemyOverrides: {} };
    const tower = createTower();
    placeTowerOnGrid(state, tower);

    const enemy = createEnemy({
      position: { x: 5.1, y: 5 },
      health: 200,
      speed: ENEMY_STATS[EnemyType.BASIC].speed,
    });
    state.enemies[enemy.id] = enemy;

    const proj = createProjectile({
      position: { x: 5, y: 5 },
      targetId: enemy.id,
      towerId: tower.id,
      damage: 10,
      isSlowing: true,
      slowAmount: 0.5,
      slowDuration: 2,
    });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.05);
    expect(enemy.speed).toBe(ENEMY_STATS[EnemyType.BASIC].speed * 0.5);
    expect((enemy as any)._slowTimer).toBe(2);
  });

  it('flying enemies take 50% damage from non-AA towers', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({ ownerId: player.id, type: TowerType.BASIC });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const flying = createEnemy({
      type: EnemyType.FLYING,
      position: { x: 5.1, y: 5 },
      health: 100,
    });
    state.enemies[flying.id] = flying;

    const proj = createProjectile({
      position: { x: 5, y: 5 },
      targetId: flying.id,
      towerId: tower.id,
      damage: 20,
    });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.05);
    expect(flying.health).toBe(90); // 100 - round(20*0.5)
  });

  it('flying enemies take 3x damage from AA towers', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({ ownerId: player.id, type: TowerType.AA, id: 'aa-tower' });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const flying = createEnemy({
      type: EnemyType.FLYING,
      position: { x: 5.1, y: 5 },
      health: 100,
    });
    state.enemies[flying.id] = flying;

    const proj = createProjectile({
      position: { x: 5, y: 5 },
      targetId: flying.id,
      towerId: 'aa-tower',
      damage: 10,
    });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.05);
    expect(flying.health).toBe(70); // 100 - round(10*3)
  });

  it('AA splash only hits flying enemies', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({ ownerId: player.id, type: TowerType.AA, id: 'aa-tower' });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const flyingTarget = createEnemy({
      id: 'flying-target',
      type: EnemyType.FLYING,
      position: { x: 5.1, y: 5 },
      health: 200,
    });
    const groundNearby = createEnemy({
      id: 'ground-nearby',
      type: EnemyType.BASIC,
      position: { x: 5.5, y: 5 },
      health: 200,
    });
    state.enemies[flyingTarget.id] = flyingTarget;
    state.enemies[groundNearby.id] = groundNearby;

    const proj = createProjectile({
      position: { x: 5, y: 5 },
      targetId: flyingTarget.id,
      towerId: 'aa-tower',
      damage: 10,
      isSplash: true,
      splashRadius: 5,
    });
    state.projectiles[proj.id] = proj;

    system.update(state, 0.05);
    // Ground enemy should NOT be hit by AA splash
    expect(groundNearby.health).toBe(200);
  });
});
