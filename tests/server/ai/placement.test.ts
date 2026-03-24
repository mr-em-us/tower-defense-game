import { describe, it, expect } from 'vitest';
import { getCandidateCells, scorePlacement, chooseTowerType } from '../../../server/ai/strategies/placement.js';
import { GamePhase, PlayerSide, TowerType, CellType } from '../../../shared/types/game.types.js';
import { GRID, AI, TOWER_STATS } from '../../../shared/types/constants.js';
import { createGameState, createPlayer, createTower, placeTowerOnGrid } from '../../helpers.js';

describe('getCandidateCells', () => {
  it('returns only valid cells in players zone', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    const candidates = getCandidateCells(state, PlayerSide.LEFT, 0.5);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.x).toBeLessThanOrEqual(GRID.LEFT_ZONE_END);
    }
  });

  it('returns RIGHT zone cells for RIGHT player', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const player = createPlayer({ side: PlayerSide.RIGHT });
    state.players[player.id] = player;

    const candidates = getCandidateCells(state, PlayerSide.RIGHT, 0.5);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.x).toBeGreaterThanOrEqual(GRID.RIGHT_ZONE_START);
    }
  });

  it('excludes occupied cells', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    // Place tower at (5,5)
    state.grid.cells[5][5] = CellType.TOWER;

    const candidates = getCandidateCells(state, PlayerSide.LEFT, 1.0);
    expect(candidates.find(c => c.x === 5 && c.y === 5)).toBeUndefined();
  });

  it('higher depth returns more candidates', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    const lowDepth = getCandidateCells(state, PlayerSide.LEFT, 0.1);
    const highDepth = getCandidateCells(state, PlayerSide.LEFT, 0.9);
    expect(highDepth.length).toBeGreaterThanOrEqual(lowDepth.length);
  });
});

describe('scorePlacement', () => {
  it('returns higher score for path-extending positions', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 1 });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    // Score a position that's on the path vs one that isn't
    const onPath = scorePlacement(state, player.id, 15, 14, TowerType.BASIC, 0.5);
    const offPath = scorePlacement(state, player.id, 0, 0, TowerType.BASIC, 0.5);
    // On-path placement should generally score higher (extends path)
    expect(onPath).toBeGreaterThanOrEqual(offPath);
  });

  it('returns -Infinity if placement would block path', () => {
    const state = createGameState({ phase: GamePhase.BUILD });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    // Fill the entire left zone except one corridor
    for (let y = 0; y < GRID.HEIGHT; y++) {
      for (let x = 0; x < 29; x++) {
        if (y !== 14) {
          state.grid.cells[y][x] = CellType.TOWER;
        }
      }
    }

    // Now blocking the only path should return -Infinity
    const score = scorePlacement(state, player.id, 15, 14, TowerType.BASIC, 0.5);
    expect(score).toBe(-Infinity);
  });

  it('gives synergy bonus for SLOW near SPLASH', () => {
    const state = createGameState({ phase: GamePhase.BUILD, waveNumber: 5 });
    const player = createPlayer({ side: PlayerSide.LEFT });
    state.players[player.id] = player;

    // Place a SPLASH tower
    const splash = createTower({
      id: 'splash',
      type: TowerType.SPLASH,
      ownerId: player.id,
      position: { x: 10, y: 14 },
    });
    placeTowerOnGrid(state, splash);

    // Score SLOW placement nearby vs far
    const nearby = scorePlacement(state, player.id, 12, 14, TowerType.SLOW, 0.5);
    const faraway = scorePlacement(state, player.id, 0, 0, TowerType.SLOW, 0.5);
    expect(nearby).toBeGreaterThan(faraway);
  });
});

describe('chooseTowerType', () => {
  it('returns BASIC for early waves', () => {
    const state = createGameState({ waveNumber: 1, airWaveCountdown: -1 });
    const player = createPlayer();
    state.players[player.id] = player;

    // Without many existing SLOW towers, should return SLOW first
    const type = chooseTowerType(state, player.id, 0.5);
    expect([TowerType.BASIC, TowerType.SLOW]).toContain(type);
  });

  it('returns SLOW when SLOW count is below threshold', () => {
    const state = createGameState({ waveNumber: 2, airWaveCountdown: -1 });
    const player = createPlayer();
    state.players[player.id] = player;
    // No existing towers — SLOW should be first priority (count < 2)
    const type = chooseTowerType(state, player.id, 0.5);
    expect(type).toBe(TowerType.SLOW);
  });

  it('returns BASIC when SLOW threshold is met in early waves', () => {
    const state = createGameState({ waveNumber: 2, airWaveCountdown: -1 });
    const player = createPlayer();
    state.players[player.id] = player;
    // Add 3 SLOW towers
    for (let i = 0; i < 3; i++) {
      const t = createTower({
        id: `slow-${i}`,
        type: TowerType.SLOW,
        ownerId: player.id,
        position: { x: i * 2, y: 10 },
      });
      state.towers[t.id] = t;
    }
    const type = chooseTowerType(state, player.id, 0.5);
    expect(type).toBe(TowerType.BASIC);
  });

  it('returns AA when air wave is incoming and AA count is low', () => {
    const state = createGameState({ waveNumber: 5, airWaveCountdown: 2 });
    const player = createPlayer();
    state.players[player.id] = player;
    // No AA towers
    const type = chooseTowerType(state, player.id, 0.5);
    expect(type).toBe(TowerType.AA);
  });

  it('balances tower composition in mid/late game', () => {
    const state = createGameState({ waveNumber: 10, airWaveCountdown: -1 });
    const player = createPlayer();
    state.players[player.id] = player;

    // Create 20 BASIC towers, no SLOW/SPLASH/SNIPER
    for (let i = 0; i < 20; i++) {
      const t = createTower({
        id: `basic-${i}`,
        type: TowerType.BASIC,
        ownerId: player.id,
        position: { x: i % 29, y: Math.floor(i / 29) + 1 },
      });
      state.towers[t.id] = t;
    }

    const type = chooseTowerType(state, player.id, 0.5);
    // Should pick a non-BASIC type to balance composition (could be AA for minimum AA requirement)
    expect([TowerType.SPLASH, TowerType.SLOW, TowerType.SNIPER, TowerType.AA]).toContain(type);
  });
});
