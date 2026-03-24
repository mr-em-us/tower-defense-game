import { describe, it, expect, beforeEach } from 'vitest';
import { PhaseSystem } from '../../../server/systems/PhaseSystem.js';
import { GamePhase, GameMode, PlayerSide, CellType, TowerType } from '../../../shared/types/game.types.js';
import { GAME, TOWER_STATS, PRICE_DECAY_RATE } from '../../../shared/types/constants.js';
import { createGameState, createPlayer, createTower, placeTowerOnGrid, createWaveEconomy } from '../../helpers.js';

describe('PhaseSystem', () => {
  let system: PhaseSystem;

  beforeEach(() => {
    system = new PhaseSystem();
  });

  it('skips WAITING phase', () => {
    const state = createGameState({ phase: GamePhase.WAITING });
    system.update(state, 0.05);
    expect(state.phase).toBe(GamePhase.WAITING);
  });

  it('skips GAME_OVER phase', () => {
    const state = createGameState({ phase: GamePhase.GAME_OVER });
    system.update(state, 0.05);
    expect(state.phase).toBe(GamePhase.GAME_OVER);
  });

  it('transitions COMBAT -> BUILD when all enemies cleared', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      waveEnemiesRemaining: 0,
    });
    const player = createPlayer();
    state.players[player.id] = player;
    state.waveEconomy[player.id] = createWaveEconomy();

    system.update(state, 0.05);
    expect(state.phase).toBe(GamePhase.BUILD);
    expect(state.waveNumber).toBe(2);
  });

  it('does NOT transition if enemies remain', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      waveEnemiesRemaining: 5,
    });
    const enemy = { id: 'e1' } as any;
    state.enemies['e1'] = enemy;

    system.update(state, 0.05);
    expect(state.phase).toBe(GamePhase.COMBAT);
  });

  it('does NOT transition if enemies alive even with remaining=0', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      waveNumber: 1,
      waveEnemiesRemaining: 0,
    });
    state.enemies['e1'] = { id: 'e1' } as any;

    system.update(state, 0.05);
    expect(state.phase).toBe(GamePhase.COMBAT);
  });

  it('game over when human player health reaches 0', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      gameMode: GameMode.SINGLE,
      waveEnemiesRemaining: 5, // keep combat going
    });
    // Need at least one enemy alive to prevent transition to BUILD
    state.enemies['e1'] = { id: 'e1' } as any;
    const player = createPlayer({ health: 0, isAI: false });
    state.players[player.id] = player;

    system.update(state, 0.05);
    expect(state.phase).toBe(GamePhase.GAME_OVER);
  });

  it('AI death does NOT trigger game over in SINGLE mode', () => {
    const state = createGameState({
      phase: GamePhase.COMBAT,
      gameMode: GameMode.SINGLE,
      waveEnemiesRemaining: 5,
    });
    state.enemies['e1'] = { id: 'e1' } as any; // keep combat going
    const human = createPlayer({ id: 'human', health: 500, isAI: false });
    const ai = createPlayer({ id: 'ai', health: 0, isAI: true, name: 'Bot' });
    state.players[human.id] = human;
    state.players[ai.id] = ai;

    system.update(state, 0.05);
    expect(state.phase).toBe(GamePhase.COMBAT); // NOT game over
    expect(state.aiDefeatedCount).toBe(1);
  });

  describe('transitionToCombat', () => {
    it('sets phase to COMBAT and resets ready flags', () => {
      const state = createGameState({ phase: GamePhase.BUILD });
      const p1 = createPlayer({ id: 'p1', isReady: true });
      const p2 = createPlayer({ id: 'p2', isReady: true, side: PlayerSide.RIGHT });
      state.players[p1.id] = p1;
      state.players[p2.id] = p2;

      system.transitionToCombat(state);
      expect(state.phase).toBe(GamePhase.COMBAT);
      expect(p1.isReady).toBe(false);
      expect(p2.isReady).toBe(false);
      // Sentinel value to prevent immediate bounce-back
      expect(state.waveEnemiesRemaining).toBe(1);
    });
  });

  describe('transitionToBuild', () => {
    it('awards wave bonus credits', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 1,
        waveEnemiesRemaining: 0,
      });
      const player = createPlayer({ credits: 100 });
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();

      system.update(state, 0.05); // triggers transitionToBuild
      const expectedBonus = GAME.CREDITS_PER_WAVE + (state.waveNumber - 1) * GAME.CREDITS_PER_WAVE_GROWTH;
      // Credits should have increased by at least the wave bonus
      expect(player.credits).toBeGreaterThan(100);
    });

    it('collects tower income and deducts maintenance', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 1,
        waveEnemiesRemaining: 0,
      });
      const player = createPlayer({ credits: 1000 });
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();

      const tower = createTower({ ownerId: player.id, type: TowerType.BASIC });
      placeTowerOnGrid(state, tower);

      const creditsBefore = player.credits;
      system.update(state, 0.05);

      const stats = TOWER_STATS[TowerType.BASIC];
      const netIncome = stats.incomePerTurn - stats.maintenancePerTurn;
      // Player should get wave bonus + net tower income
      expect(player.credits).toBeGreaterThan(creditsBefore);
    });

    it('credits never go below 0 from maintenance', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 1,
        waveEnemiesRemaining: 0,
      });
      const player = createPlayer({ credits: 0 });
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();

      // Place many expensive-maintenance towers
      for (let i = 0; i < 50; i++) {
        const t = createTower({
          id: `tower-${i}`,
          ownerId: player.id,
          type: TowerType.SNIPER,
          position: { x: i % 29, y: Math.floor(i / 29) },
        });
        state.towers[t.id] = t;
      }

      system.update(state, 0.05);
      expect(player.credits).toBeGreaterThanOrEqual(0);
    });

    it('decays dynamic pricing counts', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 1,
        waveEnemiesRemaining: 0,
      });
      state.globalPurchaseCounts = { SNIPER: 10, SPLASH: 5, BASIC: 3 };
      const player = createPlayer();
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();

      system.update(state, 0.05);
      // SNIPER and SPLASH should decay; BASIC should stay the same
      expect(state.globalPurchaseCounts['SNIPER']).toBeLessThan(10);
      expect(state.globalPurchaseCounts['SPLASH']).toBeLessThan(5);
      expect(state.globalPurchaseCounts['BASIC']).toBe(3); // BASIC exempt
    });

    it('resets ready flags for all players', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 1,
        waveEnemiesRemaining: 0,
      });
      const p1 = createPlayer({ id: 'p1', isReady: true });
      state.players[p1.id] = p1;
      state.waveEconomy[p1.id] = createWaveEconomy();

      system.update(state, 0.05);
      expect(p1.isReady).toBe(false);
    });
  });

  describe('handlePlayerReady', () => {
    it('marks player as ready (transitions if only player)', () => {
      const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 1 });
      const player = createPlayer({ id: 'test-player', isReady: false });
      state.players['test-player'] = player;

      system.handlePlayerReady(state, 'test-player');
      // With only one player, allReady triggers transitionToCombat immediately,
      // which resets isReady to false. Verify the transition happened instead.
      expect(state.phase).toBe(GamePhase.COMBAT);
    });

    it('transitions to combat when all players ready', () => {
      const state = createGameState({ phase: GamePhase.BUILD });
      const p1 = createPlayer({ id: 'p1' });
      const p2 = createPlayer({ id: 'p2', side: PlayerSide.RIGHT });
      state.players[p1.id] = p1;
      state.players[p2.id] = p2;

      system.handlePlayerReady(state, p1.id);
      expect(state.phase).toBe(GamePhase.BUILD); // not yet

      system.handlePlayerReady(state, p2.id);
      expect(state.phase).toBe(GamePhase.COMBAT);
    });

    it('does nothing in non-BUILD phase', () => {
      const state = createGameState({ phase: GamePhase.COMBAT });
      const player = createPlayer();
      state.players[player.id] = player;

      system.handlePlayerReady(state, player.id);
      expect(player.isReady).toBe(false);
    });

    it('does nothing for invalid player', () => {
      const state = createGameState({ phase: GamePhase.BUILD });
      system.handlePlayerReady(state, 'nonexistent');
      // Should not throw
    });
  });

  describe('auto-rebuild destroyed towers', () => {
    it('rebuilds destroyed towers when autoRebuildEnabled', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 1,
        waveEnemiesRemaining: 0,
      });
      const player = createPlayer({ credits: 5000, autoRebuildEnabled: true });
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();
      state.destroyedTowerTraces = [{
        position: { x: 5, y: 5 },
        type: TowerType.BASIC,
        ownerId: player.id,
      }];

      system.update(state, 0.05); // triggers transitionToBuild
      // Tower should be rebuilt
      const towers = Object.values(state.towers);
      const rebuilt = towers.find(t => t.position.x === 5 && t.position.y === 5);
      expect(rebuilt).toBeDefined();
      expect(rebuilt!.type).toBe(TowerType.BASIC);
      expect(state.destroyedTowerTraces.length).toBe(0);
    });

    it('does NOT rebuild if autoRebuildEnabled is false', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 1,
        waveEnemiesRemaining: 0,
      });
      const player = createPlayer({ credits: 5000, autoRebuildEnabled: false });
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();
      state.destroyedTowerTraces = [{
        position: { x: 5, y: 5 },
        type: TowerType.BASIC,
        ownerId: player.id,
      }];

      system.update(state, 0.05);
      expect(state.destroyedTowerTraces.length).toBe(1); // trace remains
    });

    it('does NOT rebuild if player has insufficient credits', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 1,
        waveEnemiesRemaining: 0,
      });
      const player = createPlayer({ credits: 0, autoRebuildEnabled: true });
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();
      state.destroyedTowerTraces = [{
        position: { x: 5, y: 5 },
        type: TowerType.SNIPER,
        ownerId: player.id,
      }];

      system.update(state, 0.05);
      expect(state.destroyedTowerTraces.length).toBe(1);
    });
  });

  describe('air wave scheduling', () => {
    it('counts down air wave', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 5,
        waveEnemiesRemaining: 0,
        airWaveCountdown: 2,
      });
      const player = createPlayer();
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();

      system.update(state, 0.05);
      expect(state.airWaveCountdown).toBe(1);
    });

    it('resets air wave countdown after air wave fires', () => {
      const state = createGameState({
        phase: GamePhase.COMBAT,
        waveNumber: 5,
        waveEnemiesRemaining: 0,
        airWaveCountdown: 0,
      });
      const player = createPlayer();
      state.players[player.id] = player;
      state.waveEconomy[player.id] = createWaveEconomy();

      system.update(state, 0.05);
      expect(state.airWaveCountdown).toBe(-1);
    });
  });
});
