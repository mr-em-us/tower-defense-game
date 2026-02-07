import { TowerType, EnemyType } from './game.types.js';

export const GRID = {
  WIDTH: 60,
  HEIGHT: 30,
  CELL_SIZE: 20,
  LEFT_ZONE_END: 29,
  RIGHT_ZONE_START: 30,
} as const;

export const GAME = {
  TICK_RATE: 20,
  BUILD_PHASE_DURATION: 30,
  STARTING_CREDITS: 2000,
  CREDITS_PER_WAVE: 50,
} as const;

export const TOWER_STATS: Record<TowerType, {
  cost: number;
  damage: number;
  range: number;
  fireRate: number;
  upgradeCostMultiplier: number;
  upgradeStatMultiplier: number;
  splashRadius: number;
  slowAmount: number;
  slowDuration: number;
  // Economy stats
  maxHealth: number;
  maxAmmo: number;
  ammoCostPerRound: number;
  incomePerTurn: number;
  maintenancePerTurn: number;
}> = {
  [TowerType.BASIC]: {
    cost: 50,
    damage: 10,
    range: 3,
    fireRate: 2,
    upgradeCostMultiplier: 1.5,
    upgradeStatMultiplier: 1.4,
    splashRadius: 0,
    slowAmount: 0,
    slowDuration: 0,
    maxHealth: 200,
    maxAmmo: 100,
    ammoCostPerRound: 0.5,
    incomePerTurn: 5,
    maintenancePerTurn: 2,
  },
  [TowerType.SNIPER]: {
    cost: 120,
    damage: 50,
    range: 8,
    fireRate: 0.5,
    upgradeCostMultiplier: 1.6,
    upgradeStatMultiplier: 1.5,
    splashRadius: 0,
    slowAmount: 0,
    slowDuration: 0,
    maxHealth: 120,
    maxAmmo: 25,
    ammoCostPerRound: 2,
    incomePerTurn: 10,
    maintenancePerTurn: 5,
  },
  [TowerType.SPLASH]: {
    cost: 150,
    damage: 20,
    range: 4,
    fireRate: 1,
    upgradeCostMultiplier: 1.5,
    upgradeStatMultiplier: 1.4,
    splashRadius: 2,
    slowAmount: 0,
    slowDuration: 0,
    maxHealth: 160,
    maxAmmo: 50,
    ammoCostPerRound: 1,
    incomePerTurn: 12,
    maintenancePerTurn: 6,
  },
  [TowerType.SLOW]: {
    cost: 80,
    damage: 5,
    range: 3,
    fireRate: 1.5,
    upgradeCostMultiplier: 1.4,
    upgradeStatMultiplier: 1.3,
    splashRadius: 0,
    slowAmount: 0.5,
    slowDuration: 2,
    maxHealth: 200,
    maxAmmo: 60,
    ammoCostPerRound: 0.5,
    incomePerTurn: 7,
    maintenancePerTurn: 3,
  },
};

export const ENEMY_STATS: Record<EnemyType, {
  health: number;
  speed: number;
  creditValue: number;
  contactDamage: number;
}> = {
  [EnemyType.BASIC]: { health: 100, speed: 2, creditValue: 10, contactDamage: 0.5 },
  [EnemyType.FAST]: { health: 50, speed: 4, creditValue: 15, contactDamage: 0.3 },
  [EnemyType.TANK]: { health: 500, speed: 1, creditValue: 50, contactDamage: 2 },
  [EnemyType.BOSS]: { health: 2000, speed: 1.5, creditValue: 200, contactDamage: 5 },
};

// Dynamic pricing: price = baseCost * (1 + globalCount * PRICE_ESCALATION)
// Only applies to non-BASIC tower types
export const PRICE_ESCALATION = 0.12;

// Goal rows at the edges where enemies exit the board (wide band)
export const GOAL_ROWS = [12, 13, 14, 15, 16, 17];

// Center spawn point - exact center of the 60x30 grid (2x2 block)
export const CENTER_SPAWN = {
  X_MIN: 29,
  X_MAX: 30,
  Y_ROWS: [14, 15],
} as const;

export const PROJECTILE_SPEED = 12;

export const SELL_REFUND_RATIO = 0.6;

export const VISUAL = {
  BG_COLOR: '#007BE5',
  FG_COLOR: '#FFFFFF',
  GRID_COLOR: 'rgba(255, 255, 255, 0.08)',
  ZONE_BORDER_COLOR: 'rgba(255, 255, 255, 0.3)',
  FONT: '"DM Mono", "Courier New", monospace',
  DENSITY_CHARS: ' .:-=+*#%@',
} as const;
