import { describe, it, expect, beforeEach } from 'vitest';
import { EnemySystem } from '../../../server/systems/EnemySystem.js';
import { GamePhase, CellType, PlayerSide, EnemyType, TowerType } from '../../../shared/types/game.types.js';
import { GRID, ENEMY_STATS } from '../../../shared/types/constants.js';
import { createGameState, createPlayer, createEnemy, createTower, placeTowerOnGrid } from '../../helpers.js';

describe('EnemySystem', () => {
  let system: EnemySystem;

  beforeEach(() => {
    system = new EnemySystem();
  });

  it('does nothing outside COMBAT phase', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const enemy = createEnemy({ position: { x: 10, y: 14 } });
    state.enemies[enemy.id] = enemy;
    system.update(state, 0.05);
    expect(state.enemies[enemy.id].position.x).toBe(10);
  });

  it('moves enemies along their path', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const enemy = createEnemy({
      position: { x: 20, y: 14 },
      path: [{ x: 20, y: 14 }, { x: 10, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 0,
      speed: 2,
    });
    state.enemies[enemy.id] = enemy;
    system.update(state, 0.5);
    // Enemy should have moved left
    expect(state.enemies[enemy.id].position.x).toBeLessThan(20);
  });

  it('removes enemy when it reaches the end of path', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT, health: 500 });
    state.players[player.id] = player;
    const enemy = createEnemy({
      position: { x: 0, y: 14 },
      path: [{ x: 1, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 1, // at last cell
      targetSide: PlayerSide.LEFT,
      leakDamage: 12,
    });
    state.enemies[enemy.id] = enemy;
    system.update(state, 0.05);
    expect(state.enemies[enemy.id]).toBeUndefined();
  });

  it('deducts health from defending player on leak', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT, health: 500 });
    state.players[player.id] = player;
    const enemy = createEnemy({
      position: { x: 0, y: 14 },
      path: [{ x: 1, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 1,
      targetSide: PlayerSide.LEFT,
      leakDamage: 50,
    });
    state.enemies[enemy.id] = enemy;
    system.update(state, 0.05);
    expect(player.health).toBe(450);
  });

  it('player health never goes below 0', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT, health: 10 });
    state.players[player.id] = player;
    const enemy = createEnemy({
      position: { x: 0, y: 14 },
      path: [{ x: 1, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 1,
      targetSide: PlayerSide.LEFT,
      leakDamage: 999,
    });
    state.enemies[enemy.id] = enemy;
    system.update(state, 0.05);
    expect(player.health).toBe(0);
  });

  it('enemies deal contact damage to adjacent towers', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const tower = createTower({
      position: { x: 10, y: 14 },
      health: 200,
      maxHealth: 200,
    });
    placeTowerOnGrid(state, tower);

    const enemy = createEnemy({
      type: EnemyType.BASIC,
      position: { x: 11, y: 14 }, // adjacent
      path: [{ x: 11, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 0,
    });
    state.enemies[enemy.id] = enemy;
    state.settings = { ...state.settings, enemyOverrides: {} };

    system.update(state, 0.05);
    expect(tower.health).toBeLessThan(200);
  });

  it('destroys tower when health reaches 0 from contact damage', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const tower = createTower({
      position: { x: 10, y: 14 },
      health: 0.1, // nearly dead
      maxHealth: 200,
    });
    placeTowerOnGrid(state, tower);

    const enemy = createEnemy({
      type: EnemyType.TANK, // high contact damage
      position: { x: 11, y: 14 },
      path: [{ x: 11, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 0,
    });
    state.enemies[enemy.id] = enemy;
    state.settings = { ...state.settings, enemyOverrides: {} };

    system.update(state, 0.05);
    // Tower should be destroyed
    expect(state.towers[tower.id]).toBeUndefined();
    expect(state.grid.cells[14][10]).toBe(CellType.EMPTY);
    expect(state.destroyedTowerTraces.length).toBe(1);
    expect(state.waveTowersDestroyed).toBe(1);
  });

  it('flying enemies do NOT deal contact damage', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const tower = createTower({
      position: { x: 10, y: 14 },
      health: 200,
      maxHealth: 200,
    });
    placeTowerOnGrid(state, tower);

    const enemy = createEnemy({
      type: EnemyType.FLYING,
      position: { x: 11, y: 14 },
      path: [{ x: 11, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 0,
    });
    state.enemies[enemy.id] = enemy;
    state.settings = { ...state.settings, enemyOverrides: {} };

    system.update(state, 0.05);
    expect(tower.health).toBe(200); // unchanged
  });

  it('tracks leaked enemy types', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;
    const enemy = createEnemy({
      type: EnemyType.FAST,
      position: { x: 0, y: 14 },
      path: [{ x: 1, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 1,
      targetSide: PlayerSide.LEFT,
    });
    state.enemies[enemy.id] = enemy;
    system.update(state, 0.05);
    expect(state.waveLeakedByType[EnemyType.FAST]).toBe(1);
  });

  it('slow timer wears off and restores speed', () => {
    const state = createGameState({ phase: GamePhase.COMBAT });
    const enemy = createEnemy({
      speed: 1.0, // slowed
      path: [{ x: 29, y: 14 }, { x: 15, y: 14 }, { x: 0, y: 14 }],
      pathIndex: 0,
    });
    (enemy as any)._slowTimer = 0.01;
    (enemy as any)._baseSpeed = 2.0;
    state.enemies[enemy.id] = enemy;

    system.update(state, 0.05); // dt > slowTimer
    expect(enemy.speed).toBe(2.0);
    expect((enemy as any)._slowTimer).toBeUndefined();
  });
});
