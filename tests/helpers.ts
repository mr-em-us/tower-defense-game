/**
 * Shared test helpers — factory functions for game state, players, towers, enemies.
 */
import {
  GameState, GamePhase, GameMode, Player, PlayerSide, Tower, TowerType,
  Enemy, EnemyType, CellType, GridState, Projectile, WaveEconomy, GameSettings,
  AIDifficulty,
} from '../shared/types/game.types.js';
import { DEFAULT_GAME_SETTINGS, GRID, TOWER_STATS, ENEMY_STATS } from '../shared/types/constants.js';

export function createEmptyGrid(): GridState {
  const cells: CellType[][] = [];
  for (let y = 0; y < GRID.HEIGHT; y++) {
    cells.push(new Array(GRID.WIDTH).fill(CellType.EMPTY));
  }
  return { width: GRID.WIDTH, height: GRID.HEIGHT, cells };
}

export function createGameState(overrides: Partial<GameState> = {}): GameState {
  return {
    roomId: 'test-room',
    gameMode: GameMode.SINGLE,
    phase: GamePhase.BUILD,
    waveNumber: 1,
    phaseTimeRemaining: 30,
    startingCredits: 5000,
    globalPurchaseCounts: {},
    players: {},
    towers: {},
    enemies: {},
    projectiles: {},
    grid: createEmptyGrid(),
    waveEnemiesRemaining: 0,
    waveEnemiesTotal: 0,
    waveEnemiesKilled: 0,
    waveTowersDestroyed: 0,
    waveCreditsEarned: 0,
    waveLeakedByType: {},
    gameSpeed: 1,
    destroyedTowerTraces: [],
    settings: { ...DEFAULT_GAME_SETTINGS },
    waveEconomy: {},
    airWaveCountdown: -1,
    aiDefeatedCount: 0,
    ...overrides,
  };
}

export function createPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'TestPlayer',
    side: PlayerSide.LEFT,
    credits: 5000,
    health: 500,
    maxHealth: 500,
    isReady: false,
    autoRepairEnabled: false,
    autoRestockEnabled: false,
    autoRebuildEnabled: false,
    requestedSpeed: 1,
    isAI: false,
    ...overrides,
  };
}

export function createTower(overrides: Partial<Tower> = {}): Tower {
  const type = overrides.type ?? TowerType.BASIC;
  const stats = TOWER_STATS[type];
  return {
    id: 'tower-1',
    type,
    position: { x: 5, y: 5 },
    ownerId: 'player-1',
    level: 1,
    damage: stats.damage,
    range: stats.range,
    fireRate: stats.fireRate,
    lastFireTime: 0,
    targetId: null,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    ammo: stats.maxAmmo,
    maxAmmo: stats.maxAmmo,
    placedWave: 1,
    ...overrides,
  };
}

export function createEnemy(overrides: Partial<Enemy> = {}): Enemy {
  const type = overrides.type ?? EnemyType.BASIC;
  const stats = ENEMY_STATS[type];
  return {
    id: 'enemy-1',
    type,
    position: { x: 29, y: 14 },
    targetSide: PlayerSide.LEFT,
    health: stats.health,
    maxHealth: stats.health,
    speed: stats.speed,
    creditValue: stats.creditValue,
    leakDamage: stats.creditValue,
    path: [{ x: 29, y: 14 }, { x: 15, y: 14 }, { x: 0, y: 14 }],
    pathIndex: 0,
    spawnDelay: 0,
    spawned: true,
    ...overrides,
  };
}

export function createProjectile(overrides: Partial<Projectile> = {}): Projectile {
  return {
    id: 'proj-1',
    position: { x: 5, y: 5 },
    targetId: 'enemy-1',
    damage: 10,
    speed: 12,
    towerId: 'tower-1',
    isSplash: false,
    splashRadius: 0,
    isSlowing: false,
    slowAmount: 0,
    slowDuration: 0,
    ...overrides,
  };
}

export function createWaveEconomy(): WaveEconomy {
  return {
    startingCredits: 5000,
    killRewards: 0,
    waveBonus: 0,
    towerIncome: 0,
    sellRefunds: 0,
    towerPurchases: 0,
    towerUpgrades: 0,
    repairCosts: 0,
    restockCosts: 0,
    maintenanceCosts: 0,
    ammoUsed: 0,
    shotsFired: 0,
  };
}

export function createSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return { ...DEFAULT_GAME_SETTINGS, ...overrides };
}

/** Place a tower on the grid (updates cells) */
export function placeTowerOnGrid(state: GameState, tower: Tower): void {
  state.towers[tower.id] = tower;
  state.grid.cells[tower.position.y][tower.position.x] = CellType.TOWER;
}
