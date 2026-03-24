import { describe, it, expect, beforeEach } from 'vitest';
import { TowerSystem } from '../../../server/systems/TowerSystem.js';
import { GamePhase, PlayerSide, TowerType, EnemyType } from '../../../shared/types/game.types.js';
import { TOWER_STATS, GRID } from '../../../shared/types/constants.js';
import { createGameState, createPlayer, createTower, createEnemy, placeTowerOnGrid, createWaveEconomy } from '../../helpers.js';

describe('TowerSystem', () => {
  let system: TowerSystem;

  beforeEach(() => {
    system = new TowerSystem();
  });

  it('does nothing outside COMBAT phase', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const tower = createTower({ ammo: 50 });
    placeTowerOnGrid(state, tower);
    const enemy = createEnemy({ position: { x: 6, y: 5 } });
    state.enemies[enemy.id] = enemy;
    system.update(state, 0.05, Date.now());
    expect(Object.keys(state.projectiles).length).toBe(0);
    expect(tower.ammo).toBe(50);
  });

  it('fires projectile at enemy in range', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({
      position: { x: 5, y: 5 },
      ownerId: player.id,
      fireRate: 2,
      range: 5,
      ammo: 50,
      lastFireTime: -10,
    });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const enemy = createEnemy({
      position: { x: 6, y: 5 }, // within range
      targetSide: PlayerSide.LEFT,
    });
    state.enemies[enemy.id] = enemy;

    // Advance game time enough
    system.update(state, 1.0, Date.now());
    expect(Object.keys(state.projectiles).length).toBe(1);
    expect(tower.ammo).toBe(49);
    expect(tower.targetId).toBe(enemy.id);
  });

  it('does not fire when ammo is 0', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({
      position: { x: 5, y: 5 },
      ownerId: player.id,
      ammo: 0,
      lastFireTime: -10,
    });
    placeTowerOnGrid(state, tower);

    const enemy = createEnemy({ position: { x: 6, y: 5 }, targetSide: PlayerSide.LEFT });
    state.enemies[enemy.id] = enemy;

    system.update(state, 1.0, Date.now());
    expect(Object.keys(state.projectiles).length).toBe(0);
  });

  it('does not target enemies outside range', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({
      position: { x: 5, y: 5 },
      ownerId: player.id,
      range: 3,
      ammo: 50,
      lastFireTime: -10,
    });
    placeTowerOnGrid(state, tower);

    // Enemy far away
    const enemy = createEnemy({ position: { x: 20, y: 20 }, targetSide: PlayerSide.LEFT });
    state.enemies[enemy.id] = enemy;

    system.update(state, 1.0, Date.now());
    expect(Object.keys(state.projectiles).length).toBe(0);
    expect(tower.targetId).toBeNull();
  });

  it('does not target enemies in opposite zone', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({
      position: { x: 28, y: 14 },
      ownerId: player.id,
      range: 10, // large range
      ammo: 50,
      lastFireTime: -10,
    });
    placeTowerOnGrid(state, tower);

    // Enemy in right zone
    const enemy = createEnemy({
      position: { x: GRID.RIGHT_ZONE_START + 2, y: 14 },
      targetSide: PlayerSide.RIGHT,
    });
    state.enemies[enemy.id] = enemy;

    system.update(state, 1.0, Date.now());
    expect(Object.keys(state.projectiles).length).toBe(0);
  });

  it('respects fire rate interval', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({
      position: { x: 5, y: 5 },
      ownerId: player.id,
      fireRate: 1, // 1 shot per second
      ammo: 50,
      lastFireTime: 0,
    });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const enemy = createEnemy({ position: { x: 6, y: 5 }, targetSide: PlayerSide.LEFT });
    state.enemies[enemy.id] = enemy;

    // First tick at 0.1s — not enough time since lastFireTime=0
    system.update(state, 0.1, Date.now());
    expect(Object.keys(state.projectiles).length).toBe(0);

    // Advance past the 1.0s interval
    system.update(state, 1.0, Date.now());
    expect(Object.keys(state.projectiles).length).toBe(1);
  });

  it('targets closest enemy when multiple in range', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const tower = createTower({
      position: { x: 10, y: 14 },
      ownerId: player.id,
      range: 10,
      ammo: 50,
      lastFireTime: -10,
    });
    placeTowerOnGrid(state, tower);
    state.waveEconomy[player.id] = createWaveEconomy();

    const farEnemy = createEnemy({
      id: 'enemy-far',
      position: { x: 18, y: 14 },
      targetSide: PlayerSide.LEFT,
    });
    const closeEnemy = createEnemy({
      id: 'enemy-close',
      position: { x: 11, y: 14 },
      targetSide: PlayerSide.LEFT,
    });
    state.enemies[farEnemy.id] = farEnemy;
    state.enemies[closeEnemy.id] = closeEnemy;

    system.update(state, 1.0, Date.now());
    expect(tower.targetId).toBe('enemy-close');
  });

  it('tracks ammo usage in wave economy', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const econ = createWaveEconomy();
    state.waveEconomy[player.id] = econ;
    const tower = createTower({
      position: { x: 5, y: 5 },
      ownerId: player.id,
      ammo: 50,
      lastFireTime: -10,
    });
    placeTowerOnGrid(state, tower);

    const enemy = createEnemy({ position: { x: 6, y: 5 }, targetSide: PlayerSide.LEFT });
    state.enemies[enemy.id] = enemy;

    system.update(state, 1.0, Date.now());
    expect(econ.ammoUsed).toBe(1);
    expect(econ.shotsFired).toBe(1);
  });

  it('creates splash projectile for SPLASH towers', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    state.waveEconomy[player.id] = createWaveEconomy();
    const splashStats = TOWER_STATS[TowerType.SPLASH];
    const tower = createTower({
      type: TowerType.SPLASH,
      position: { x: 5, y: 5 },
      ownerId: player.id,
      ammo: 50,
      lastFireTime: -10,
      damage: splashStats.damage,
      range: splashStats.range,
      fireRate: splashStats.fireRate,
    });
    placeTowerOnGrid(state, tower);

    const enemy = createEnemy({ position: { x: 6, y: 5 }, targetSide: PlayerSide.LEFT });
    state.enemies[enemy.id] = enemy;

    system.update(state, 1.0, Date.now());
    const proj = Object.values(state.projectiles)[0];
    expect(proj.isSplash).toBe(true);
    expect(proj.splashRadius).toBe(splashStats.splashRadius);
  });

  it('creates slowing projectile for SLOW towers', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    state.waveEconomy[player.id] = createWaveEconomy();
    const slowStats = TOWER_STATS[TowerType.SLOW];
    const tower = createTower({
      type: TowerType.SLOW,
      position: { x: 5, y: 5 },
      ownerId: player.id,
      ammo: 50,
      lastFireTime: -10,
      damage: slowStats.damage,
      range: slowStats.range,
      fireRate: slowStats.fireRate,
    });
    placeTowerOnGrid(state, tower);

    const enemy = createEnemy({ position: { x: 6, y: 5 }, targetSide: PlayerSide.LEFT });
    state.enemies[enemy.id] = enemy;

    system.update(state, 1.0, Date.now());
    const proj = Object.values(state.projectiles)[0];
    expect(proj.isSlowing).toBe(true);
    expect(proj.slowAmount).toBe(slowStats.slowAmount);
    expect(proj.slowDuration).toBe(slowStats.slowDuration);
  });
});
