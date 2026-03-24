import { describe, it, expect, beforeEach } from 'vitest';
import { WaveSystem } from '../../../server/systems/WaveSystem.js';
import { GamePhase, GameMode, PlayerSide, EnemyType } from '../../../shared/types/game.types.js';
import { DEFAULT_GAME_SETTINGS } from '../../../shared/types/constants.js';
import { createGameState, createPlayer } from '../../helpers.js';

describe('WaveSystem', () => {
  let system: WaveSystem;

  beforeEach(() => {
    system = new WaveSystem();
  });

  it('does nothing outside COMBAT phase', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 1 });
    system.update(state, 0.05);
    expect(Object.keys(state.enemies).length).toBe(0);
  });

  it('starts spawning enemies when COMBAT begins', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      gameMode: GameMode.SINGLE,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    // First update initializes wave
    system.update(state, 0.05);
    expect(state.waveEnemiesTotal).toBeGreaterThan(0);
  });

  it('spawns enemies after enough time passes', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      gameMode: GameMode.SINGLE,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    // Init wave
    system.update(state, 0.05);
    // Spawn timer — after initial delay of 0.5s, enemies should start spawning
    system.update(state, 0.6);
    expect(Object.keys(state.enemies).length).toBeGreaterThan(0);
  });

  it('single player mode only spawns toward player side', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      gameMode: GameMode.SINGLE,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    system.update(state, 0.05);
    system.update(state, 0.6);

    for (const enemy of Object.values(state.enemies)) {
      expect(enemy.targetSide).toBe(PlayerSide.LEFT);
    }
  });

  it('wave 1 only has BASIC enemies', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      gameMode: GameMode.SINGLE,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    // Spawn everything
    for (let i = 0; i < 50; i++) {
      system.update(state, 0.5);
    }

    for (const enemy of Object.values(state.enemies)) {
      expect(enemy.type).toBe(EnemyType.BASIC);
    }
  });

  it('higher waves have more enemies', () => {
    // Wave 1
    const state1 = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      gameMode: GameMode.SINGLE,
    });
    const p1 = createPlayer({ side: PlayerSide.LEFT });
    state1.players[p1.id] = p1;
    const sys1 = new WaveSystem();
    sys1.update(state1, 0.05);
    const total1 = state1.waveEnemiesTotal;

    // Wave 10
    const state10 = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 10,
      gameMode: GameMode.SINGLE,
    });
    const p10 = createPlayer({ side: PlayerSide.LEFT });
    state10.players[p10.id] = p10;
    const sys10 = new WaveSystem();
    sys10.update(state10, 0.05);
    const total10 = state10.waveEnemiesTotal;

    expect(total10).toBeGreaterThan(total1);
  });

  it('multiplayer spawns enemies for BOTH sides', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      gameMode: GameMode.MULTI,
    });
    const p1 = createPlayer({ id: 'p1', side: PlayerSide.LEFT });
    const p2 = createPlayer({ id: 'p2', side: PlayerSide.RIGHT });
    state.players[p1.id] = p1;
    state.players[p2.id] = p2;

    // Spawn many batches
    for (let i = 0; i < 50; i++) {
      system.update(state, 0.5);
    }

    const leftTargets = Object.values(state.enemies).filter(e => e.targetSide === PlayerSide.LEFT);
    const rightTargets = Object.values(state.enemies).filter(e => e.targetSide === PlayerSide.RIGHT);
    expect(leftTargets.length).toBeGreaterThan(0);
    expect(rightTargets.length).toBeGreaterThan(0);
  });

  it('boss spawns every 10 waves', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 10,
      gameMode: GameMode.SINGLE,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    // Spawn everything
    for (let i = 0; i < 100; i++) {
      system.update(state, 0.5);
    }

    const bosses = Object.values(state.enemies).filter(e => e.type === EnemyType.BOSS);
    expect(bosses.length).toBeGreaterThan(0);
  });

  it('FAST enemies appear from wave 3', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 3,
      gameMode: GameMode.SINGLE,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    for (let i = 0; i < 100; i++) {
      system.update(state, 0.5);
    }

    const fast = Object.values(state.enemies).filter(e => e.type === EnemyType.FAST);
    expect(fast.length).toBeGreaterThan(0);
  });

  it('TANK enemies appear from wave 5', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 5,
      gameMode: GameMode.SINGLE,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    for (let i = 0; i < 100; i++) {
      system.update(state, 0.5);
    }

    const tanks = Object.values(state.enemies).filter(e => e.type === EnemyType.TANK);
    expect(tanks.length).toBeGreaterThan(0);
  });

  it('air wave spawns FLYING enemies when countdown is 0', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 5,
      gameMode: GameMode.SINGLE,
      airWaveCountdown: 0,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    for (let i = 0; i < 100; i++) {
      system.update(state, 0.5);
    }

    const flying = Object.values(state.enemies).filter(e => e.type === EnemyType.FLYING);
    expect(flying.length).toBeGreaterThan(0);
  });

  it('enemy HP scales with difficulty curve', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 10,
      gameMode: GameMode.SINGLE,
    });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    for (let i = 0; i < 50; i++) {
      system.update(state, 0.5);
    }

    // Wave 10 basic enemies should have more HP than base (100)
    const basics = Object.values(state.enemies).filter(e => e.type === EnemyType.BASIC);
    if (basics.length > 0) {
      expect(basics[0].maxHealth).toBeGreaterThan(100);
    }
  });
});
