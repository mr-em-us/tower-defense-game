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
}

export enum EnemyType {
  BASIC = 'BASIC',
  FAST = 'FAST',
  TANK = 'TANK',
  BOSS = 'BOSS',
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
  side: PlayerSide;
  credits: number;
  isReady: boolean;
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
}
