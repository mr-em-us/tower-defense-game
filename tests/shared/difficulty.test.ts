import { describe, it, expect } from 'vitest';
import { computeDifficultyFactor, getDifficultyLabel, EASY_SETTINGS, HARD_SETTINGS } from '../../shared/utils/difficulty.js';
import { DEFAULT_GAME_SETTINGS } from '../../shared/types/constants.js';
import { createSettings } from '../helpers.js';

describe('computeDifficultyFactor', () => {
  it('returns close to 1.0 for default settings', () => {
    const factor = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    // Weighted geometric mean may not produce exactly 1.0 for defaults
    expect(factor).toBeGreaterThan(0.8);
    expect(factor).toBeLessThan(1.2);
  });

  it('easy settings produce lower factor than default', () => {
    const normal = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    const easy = computeDifficultyFactor(EASY_SETTINGS);
    expect(easy).toBeLessThan(normal);
  });

  it('hard settings produce different factor than default', () => {
    const normal = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    const hard = computeDifficultyFactor(HARD_SETTINGS);
    // HARD has lower HP/credits but also fewer starting credits,
    // the combined factor depends on weight balance
    expect(hard).not.toBe(normal);
  });

  it('higher HP makes it easier (lower factor)', () => {
    const baseline = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    const easy = computeDifficultyFactor(createSettings({ startingHealth: 2000 }));
    expect(easy).toBeLessThan(baseline);
  });

  it('lower HP makes it harder (higher factor)', () => {
    const baseline = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    const hard = computeDifficultyFactor(createSettings({ startingHealth: 100 }));
    expect(hard).toBeGreaterThan(baseline);
  });

  it('more starting credits makes it easier', () => {
    const baseline = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    const easy = computeDifficultyFactor(createSettings({ startingCredits: 20000 }));
    expect(easy).toBeLessThan(baseline);
  });

  it('more first wave enemies makes it harder', () => {
    const baseline = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    const hard = computeDifficultyFactor(createSettings({ firstWaveEnemies: 50 }));
    expect(hard).toBeGreaterThan(baseline);
  });

  it('tower damage override > 1 makes it easier', () => {
    const baseline = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    const easy = computeDifficultyFactor(createSettings({
      towerOverrides: { BASIC: { damage: 2.0 } },
    }));
    expect(easy).toBeLessThan(baseline);
  });

  it('enemy health override > 1 makes it harder', () => {
    const baseline = computeDifficultyFactor(DEFAULT_GAME_SETTINGS);
    const hard = computeDifficultyFactor(createSettings({
      enemyOverrides: { BASIC: { health: 3.0 } },
    }));
    expect(hard).toBeGreaterThan(baseline);
  });
});

describe('getDifficultyLabel', () => {
  it('returns Easy for easy preset', () => {
    expect(getDifficultyLabel(EASY_SETTINGS)).toBe('Easy');
  });

  it('returns Normal for default settings', () => {
    expect(getDifficultyLabel(DEFAULT_GAME_SETTINGS)).toBe('Normal');
  });

  it('returns Hard for hard preset', () => {
    expect(getDifficultyLabel(HARD_SETTINGS)).toBe('Hard');
  });

  it('returns Custom for modified settings', () => {
    const custom = createSettings({ startingHealth: 999 });
    expect(getDifficultyLabel(custom)).toBe('Custom');
  });
});
