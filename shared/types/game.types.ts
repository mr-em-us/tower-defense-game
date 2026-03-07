export interface Position {
  x: number;
  y: number;
}

export type GridCell = Position;

export enum TowerType {
  BASIC = 'BASIC',
  SNIPER = 'SNIPER',
  SPLASH = 'SPLASH',
  SLOW = 'SLOW',
  WALL = 'WALL',
  AA = 'AA',
}

export enum EnemyType {
  BASIC = 'BASIC',
  FAST = 'FAST',
  TANK = 'TANK',
  BOSS = 'BOSS',
  FLYING = 'FLYING',
}

export enum GamePhase {
  WAITING = 'WAITING',
  BUILD = 'BUILD',
  COMBAT = 'COMBAT',
  GAME_OVER = 'GAME_OVER',
}

export enum GameMode {
  SINGLE = 'SINGLE',
  MULTI = 'MULTI',
}

export enum PlayerSide {
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export enum CellType {
  EMPTY = 0,
  TOWER = 1,
  SPAWN = 2,
  GOAL = 3,
}

export interface Tower {
  id: string;
  type: TowerType;
  position: GridCell;
  ownerId: string;
  level: number;
  damage: number;
  range: number;
  fireRate: number;
  lastFireTime: number;
  targetId: string | null;
  health: number;
  maxHealth: number;
  ammo: number;
  maxAmmo: number;
  placedWave: number;
}

export interface Enemy {
  id: string;
  type: EnemyType;
  position: Position;
  targetSide: PlayerSide;
  health: number;
  maxHealth: number;
  speed: number;
  creditValue: number;
  path: GridCell[];
  pathIndex: number;
  spawnDelay: number;
  spawned: boolean;
}

export interface Projectile {
  id: string;
  position: Position;
  targetId: string;
  damage: number;
  speed: number;
  towerId: string;
  isSplash: boolean;
  splashRadius: number;
  isSlowing: boolean;
  slowAmount: number;
  slowDuration: number;
}

export interface Player {
  id: string;
  name: string;
  side: PlayerSide;
  credits: number;
  health: number;
  maxHealth: number;
  isReady: boolean;
  autoRepairEnabled: boolean;
  autoRebuildEnabled: boolean;
  requestedSpeed: number;  // 1 = normal, 2 = fast, 4 = turbo
}

export interface TowerTrace {
  position: GridCell;
  type: TowerType;
  ownerId: string;
}

export interface WaveStats {
  waveNumber: number;
  enemiesSpawned: number;
  enemiesKilled: number;
  enemiesLeaked: number;
  towersDestroyed: number;
  creditsEarned: number;
  creditsSpent: number;
  towersBought: number;
  towersUpgraded: number;
}

export interface WaveEconomy {
  startingCredits: number;
  // Revenue
  killRewards: number;
  waveBonus: number;
  towerIncome: number;
  sellRefunds: number;
  // Expenses
  towerPurchases: number;
  towerUpgrades: number;
  repairCosts: number;
  restockCosts: number;
  maintenanceCosts: number;
}

export interface GridState {
  width: number;
  height: number;
  cells: CellType[][];
}

export interface GameState {
  roomId: string;
  gameMode: GameMode;
  phase: GamePhase;
  waveNumber: number;
  phaseTimeRemaining: number;
  startingCredits: number;
  globalPurchaseCounts: Record<string, number>;
  players: Record<string, Player>;
  towers: Record<string, Tower>;
  enemies: Record<string, Enemy>;
  projectiles: Record<string, Projectile>;
  grid: GridState;
  waveEnemiesRemaining: number;
  waveEnemiesTotal: number;
  waveEnemiesKilled: number;
  waveTowersDestroyed: number;
  waveCreditsEarned: number;
  gameSpeed: number;
  destroyedTowerTraces: TowerTrace[];
  settings: GameSettings;
  waveEconomy: Record<string, WaveEconomy>;
  airWaveCountdown: number; // -1 = no air scheduled, 0 = this wave has air, 1-3 = air in N waves
}

export interface TowerStatOverrides {
  cost: number;          // multiplier on base cost, default 1.0
  damage: number;        // multiplier on base damage
  range: number;         // multiplier on base range
  fireRate: number;      // multiplier on base fireRate
  maxHealth: number;     // multiplier on base maxHealth
  maxAmmo: number;       // multiplier on base maxAmmo
}

export interface EnemyStatOverrides {
  health: number;        // multiplier on base health, default 1.0
  speed: number;         // multiplier on base speed
  creditValue: number;   // multiplier on base creditValue
  contactDamage: number; // multiplier on base contactDamage
}

export interface GameSettings {
  startingHealth: number;      // default 500
  startingCredits: number;     // default 2000
  firstWaveEnemies: number;    // default 15 (base enemy count for wave 1)
  // 20 difficulty multiplier values for waves 1-20.
  // Each value scales enemy count AND hp for that wave.
  // 1.0 = normal baseline. Beyond wave 20, extrapolate from last segment.
  difficultyCurve: number[];
  // Per-tower stat multipliers (all default to 1.0 if absent)
  towerOverrides: Partial<Record<TowerType, Partial<TowerStatOverrides>>>;
  // Per-enemy stat multipliers (all default to 1.0 if absent)
  enemyOverrides: Partial<Record<EnemyType, Partial<EnemyStatOverrides>>>;
}
