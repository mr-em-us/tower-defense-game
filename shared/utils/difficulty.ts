import { GameSettings, TowerType, EnemyType, TowerStatOverrides, EnemyStatOverrides, AIDifficulty } from '../types/game.types.js';
import { DEFAULT_GAME_SETTINGS, TOWER_STATS, ENEMY_STATS } from '../types/constants.js';

// Reference values for Normal difficulty
const DEFAULT_HP = 500;
const DEFAULT_CREDITS = 2000;
const DEFAULT_ENEMIES = 15;
const DEFAULT_CURVE_MEAN = DEFAULT_GAME_SETTINGS.difficultyCurve.reduce((a, b) => a + b, 0) / DEFAULT_GAME_SETTINGS.difficultyCurve.length;

// Weights for each category (total = 1.0)
const W_CURVE = 0.25;
const W_ENEMIES = 0.15;
const W_HP = 0.10;
const W_CREDITS = 0.08;
const W_TOWERS = 0.22;
const W_ENEMY_STATS = 0.20;

// Tower stat keys that are "player advantage" (higher = easier = factor goes down)
const TOWER_ADVANTAGE_KEYS: (keyof TowerStatOverrides)[] = ['damage', 'range', 'fireRate', 'maxHealth', 'maxAmmo'];
// Tower cost is a "challenge" key (higher cost = harder)
const TOWER_CHALLENGE_KEYS: (keyof TowerStatOverrides)[] = ['cost'];

// Enemy stat keys that are "challenge" (higher = harder)
const ENEMY_CHALLENGE_KEYS: (keyof EnemyStatOverrides)[] = ['health', 'speed', 'contactDamage'];
// Enemy creditValue is "player advantage" (higher = easier)
const ENEMY_ADVANTAGE_KEYS: (keyof EnemyStatOverrides)[] = ['creditValue'];

const ALL_TOWER_TYPES = [TowerType.BASIC, TowerType.SNIPER, TowerType.SPLASH, TowerType.SLOW, TowerType.WALL];
const ALL_ENEMY_TYPES = [EnemyType.BASIC, EnemyType.FAST, EnemyType.TANK, EnemyType.BOSS];

function getOverride(overrides: Partial<Record<string, Partial<Record<string, number>>>> | undefined, type: string, key: string): number {
  return (overrides as Record<string, Record<string, number>> | undefined)?.[type]?.[key] ?? 1.0;
}

/**
 * Compute a difficulty factor from game settings.
 * 1.0 = Normal difficulty. Higher = harder.
 * Uses a weighted geometric mean of per-parameter ratios.
 */
export function computeDifficultyFactor(settings: GameSettings): number {
  // General factors
  const hpFactor = DEFAULT_HP / settings.startingHealth; // less HP = harder
  const creditsFactor = DEFAULT_CREDITS / settings.startingCredits;
  const enemyFactor = settings.firstWaveEnemies / DEFAULT_ENEMIES; // more enemies = harder
  const curveMean = settings.difficultyCurve.reduce((a, b) => a + b, 0) / settings.difficultyCurve.length;
  const curveFactor = curveMean / DEFAULT_CURVE_MEAN;

  // Tower overrides factor
  // For each tower type, compute the combined effect of all stat overrides
  let towerLogSum = 0;
  const towerStatCount = ALL_TOWER_TYPES.length * (TOWER_ADVANTAGE_KEYS.length + TOWER_CHALLENGE_KEYS.length);
  const perTowerStatWeight = W_TOWERS / towerStatCount;

  for (const ttype of ALL_TOWER_TYPES) {
    // Skip Wall for damage/range/fireRate/ammo since they're all 0
    const isWall = ttype === TowerType.WALL;
    for (const key of TOWER_ADVANTAGE_KEYS) {
      if (isWall && (key === 'damage' || key === 'range' || key === 'fireRate' || key === 'maxAmmo')) {
        // These are 0 for walls; overrides don't affect difficulty
        continue;
      }
      const mult = getOverride(settings.towerOverrides, ttype, key);
      // Higher advantage stat = easier = ratio < 1: use 1/mult
      towerLogSum += Math.log(1 / mult) * perTowerStatWeight;
    }
    for (const key of TOWER_CHALLENGE_KEYS) {
      const mult = getOverride(settings.towerOverrides, ttype, key);
      // Higher cost = harder = ratio > 1: use mult
      towerLogSum += Math.log(mult) * perTowerStatWeight;
    }
  }

  // Enemy overrides factor
  let enemyLogSum = 0;
  const enemyStatCount = ALL_ENEMY_TYPES.length * (ENEMY_CHALLENGE_KEYS.length + ENEMY_ADVANTAGE_KEYS.length);
  const perEnemyStatWeight = W_ENEMY_STATS / enemyStatCount;

  for (const etype of ALL_ENEMY_TYPES) {
    for (const key of ENEMY_CHALLENGE_KEYS) {
      const mult = getOverride(settings.enemyOverrides, etype, key);
      enemyLogSum += Math.log(mult) * perEnemyStatWeight;
    }
    for (const key of ENEMY_ADVANTAGE_KEYS) {
      const mult = getOverride(settings.enemyOverrides, etype, key);
      // Higher credit value = easier
      enemyLogSum += Math.log(1 / mult) * perEnemyStatWeight;
    }
  }

  // Weighted geometric mean via exp(sum of weighted logs)
  const logResult =
    W_HP * Math.log(hpFactor) +
    W_CREDITS * Math.log(creditsFactor) +
    W_ENEMIES * Math.log(enemyFactor) +
    W_CURVE * Math.log(curveFactor) +
    towerLogSum +
    enemyLogSum;

  const factor = Math.exp(logResult);
  return Math.round(factor * 100) / 100;
}

/**
 * Get a human-readable difficulty label based on settings.
 */
export function getDifficultyLabel(settings: GameSettings): 'Easy' | 'Normal' | 'Hard' | 'Custom' {
  if (settingsMatchDefaults(settings, EASY_SETTINGS)) return 'Easy';
  if (settingsMatchDefaults(settings, DEFAULT_GAME_SETTINGS)) return 'Normal';
  if (settingsMatchDefaults(settings, HARD_SETTINGS)) return 'Hard';
  return 'Custom';
}

function settingsMatchDefaults(a: GameSettings, b: GameSettings): boolean {
  if (a.startingHealth !== b.startingHealth) return false;
  if (a.startingCredits !== b.startingCredits) return false;
  if (a.firstWaveEnemies !== b.firstWaveEnemies) return false;
  if (a.difficultyCurve.length !== b.difficultyCurve.length) return false;
  for (let i = 0; i < a.difficultyCurve.length; i++) {
    if (Math.abs(a.difficultyCurve[i] - b.difficultyCurve[i]) > 0.01) return false;
  }
  // Check if overrides are all default (1.0 or absent)
  if (hasNonDefaultOverrides(a) !== hasNonDefaultOverrides(b)) return false;
  return true;
}

function hasNonDefaultOverrides(s: GameSettings): boolean {
  if (s.towerOverrides) {
    for (const ttype of Object.values(s.towerOverrides)) {
      if (ttype) {
        for (const val of Object.values(ttype)) {
          if (typeof val === 'number' && Math.abs(val - 1.0) > 0.01) return true;
        }
      }
    }
  }
  if (s.enemyOverrides) {
    for (const etype of Object.values(s.enemyOverrides)) {
      if (etype) {
        for (const val of Object.values(etype)) {
          if (typeof val === 'number' && Math.abs(val - 1.0) > 0.01) return true;
        }
      }
    }
  }
  return false;
}

// Preset definitions (exported for use in SettingsPanel and difficulty label detection)
export const EASY_SETTINGS: GameSettings = {
  startingHealth: 1000,
  startingCredits: 5000,
  firstWaveEnemies: 8,
  difficultyCurve: [
    1.0, 1.0, 1.0, 1.1, 1.1,
    1.2, 1.3, 1.4, 1.5, 1.6,
    1.7, 1.8, 2.0, 2.2, 2.4,
    2.5, 2.6, 2.7, 2.8, 3.0,
  ],
  towerOverrides: {},
  enemyOverrides: {},
  aiEnabled: false,
  aiDifficulty: AIDifficulty.HARD,
  startWave: 1,
};

export const HARD_SETTINGS: GameSettings = {
  startingHealth: 300,
  startingCredits: 1000,
  firstWaveEnemies: 25,
  difficultyCurve: [
    1.0, 1.3, 1.6, 2.0, 2.4,
    2.9, 3.4, 4.0, 4.6, 5.2,
    5.8, 6.4, 7.0, 7.5, 8.0,
    8.4, 8.8, 9.2, 9.6, 10.0,
  ],
  towerOverrides: {},
  enemyOverrides: {},
  aiEnabled: false,
  aiDifficulty: AIDifficulty.HARD,
  startWave: 1,
};
