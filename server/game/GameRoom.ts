import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import {
  GameState, GamePhase, GameMode, Player, PlayerSide,
  CellType, TowerType, Tower, GameSettings, WaveStats, WaveEconomy,
} from '../../shared/types/game.types.js';
import { GRID, GAME, TOWER_STATS, SELL_REFUND_RATIO, REPAIR_COST_RATIO, PRICE_ESCALATION, MIN_DYNAMIC_PRICE, DEFAULT_GAME_SETTINGS } from '../../shared/types/constants.js';
import { validateTowerPlacement } from '../../shared/logic/pathfinding.js';
import { ClientMessage, ServerMessage } from '../../shared/types/network.types.js';
import { GameResultRecord } from '../../shared/types/leaderboard.types.js';
import { computeDifficultyFactor } from '../../shared/utils/difficulty.js';
import { PhaseSystem } from '../systems/PhaseSystem.js';
import { WaveSystem } from '../systems/WaveSystem.js';
import { EnemySystem } from '../systems/EnemySystem.js';
import { TowerSystem } from '../systems/TowerSystem.js';
import { ProjectileSystem } from '../systems/ProjectileSystem.js';
import { log } from '../utils/logger.js';

export class GameRoom {
  readonly roomId: string;
  private state: GameState;
  private connections = new Map<string, WebSocket>();
  private disconnectedSlots = new Map<PlayerSide, Player>();
  private loopInterval: ReturnType<typeof setInterval> | null = null;

  onGameOver: ((results: GameResultRecord[]) => void) | null = null;

  private phaseSystem = new PhaseSystem();
  private waveSystem = new WaveSystem();
  private enemySystem = new EnemySystem();
  private towerSystem = new TowerSystem();
  private projectileSystem = new ProjectileSystem();

  // Wave stats tracking
  private waveStatsHistory: WaveStats[] = [];
  private currentWaveStats: WaveStats | null = null;
  private prevPhase: GamePhase = GamePhase.WAITING;

  constructor(gameMode: GameMode = GameMode.MULTI) {
    this.roomId = uuid();
    this.state = this.createInitialState(gameMode);
    log(`Room ${this.roomId} created (${gameMode})`);
  }

  get gameMode(): GameMode {
    return this.state.gameMode;
  }

  applySettings(settings: GameSettings): void {
    if (this.state.phase !== GamePhase.WAITING) return;
    // Validate
    if (!settings || typeof settings.startingHealth !== 'number') return;
    if (settings.startingHealth < 50 || settings.startingHealth > 5000) return;
    if (settings.startingCredits < 50 || settings.startingCredits > 50000) return;
    if (settings.firstWaveEnemies < 5 || settings.firstWaveEnemies > 500) return;
    if (!Array.isArray(settings.difficultyCurve) || settings.difficultyCurve.length !== 20) return;
    if (settings.difficultyCurve.some((v: number) => typeof v !== 'number' || v < 0.1 || v > 20)) return;

    this.state.settings = { ...settings, difficultyCurve: [...settings.difficultyCurve] };
  }

  private createInitialState(gameMode: GameMode): GameState {
    const cells: CellType[][] = [];
    for (let y = 0; y < GRID.HEIGHT; y++) {
      cells.push(new Array(GRID.WIDTH).fill(CellType.EMPTY));
    }

    return {
      roomId: this.roomId,
      gameMode,
      phase: GamePhase.WAITING,
      waveNumber: 0,
      phaseTimeRemaining: 0,
      startingCredits: GAME.STARTING_CREDITS,
      globalPurchaseCounts: {},
      players: {},
      towers: {},
      enemies: {},
      projectiles: {},
      grid: { width: GRID.WIDTH, height: GRID.HEIGHT, cells },
      waveEnemiesRemaining: 0,
      waveEnemiesTotal: 0,
      waveEnemiesKilled: 0,
      waveTowersDestroyed: 0,
      waveCreditsEarned: 0,
      gameSpeed: 1,
      destroyedTowerTraces: [],
      settings: { ...DEFAULT_GAME_SETTINGS },
      waveEconomy: {},
      airWaveCountdown: -1,
    };
  }

  // --- Connection management ---

  addPlayer(newPlayerId: string, ws: WebSocket, playerName: string): { playerId: string; side: PlayerSide } | null {
    // Check for reconnection to a disconnected slot
    for (const [side, savedPlayer] of this.disconnectedSlots) {
      const reconnectId = savedPlayer.id;
      this.disconnectedSlots.delete(side);
      this.connections.set(reconnectId, ws);

      log(`Player ${reconnectId} reconnected to room ${this.roomId} as ${side} (credits: ${savedPlayer.credits})`);

      // Resume game loop if it was paused
      if (!this.loopInterval && (this.state.phase === GamePhase.BUILD || this.state.phase === GamePhase.COMBAT)) {
        this.startLoop();
      }

      return { playerId: reconnectId, side };
    }

    // Normal join - find an open side
    const players = Object.values(this.state.players);
    const leftTaken = players.some((p) => p.side === PlayerSide.LEFT);
    const rightTaken = players.some((p) => p.side === PlayerSide.RIGHT);

    let side: PlayerSide;
    if (!leftTaken) side = PlayerSide.LEFT;
    else if (!rightTaken) side = PlayerSide.RIGHT;
    else return null;

    const player: Player = {
      id: newPlayerId,
      name: playerName,
      side,
      credits: this.state.settings.startingCredits,
      health: this.state.settings.startingHealth,
      maxHealth: this.state.settings.startingHealth,
      isReady: false,
      autoRepairEnabled: false,
      autoRebuildEnabled: false,
      requestedSpeed: 1,
    };

    this.state.players[newPlayerId] = player;
    this.connections.set(newPlayerId, ws);

    log(`Player ${newPlayerId} joined room ${this.roomId} as ${side}`);

    const playerCount = Object.keys(this.state.players).length;
    const neededPlayers = this.state.gameMode === GameMode.SINGLE ? 1 : 2;
    if (playerCount >= neededPlayers) {
      this.startGame();
    }

    return { playerId: newPlayerId, side };
  }

  removePlayer(playerId: string): void {
    const player = this.state.players[playerId];
    this.connections.delete(playerId);

    if (this.state.phase === GamePhase.WAITING) {
      // Lobby: fully remove player
      delete this.state.players[playerId];
    } else if (player) {
      // Active game: preserve player state for reconnection
      this.disconnectedSlots.set(player.side, player);
      this.stopLoop();
    }

    this.broadcast({ type: 'PLAYER_DISCONNECTED', playerId });
    log(`Player ${playerId} left room ${this.roomId}`);
  }

  isFull(): boolean {
    const max = this.state.gameMode === GameMode.SINGLE ? 1 : 2;
    return this.connections.size >= max;
  }

  isEmpty(): boolean {
    return this.connections.size === 0;
  }

  // --- Game lifecycle ---

  private startGame(): void {
    this.state.phase = GamePhase.BUILD;
    this.state.waveNumber = 1;
    this.state.phaseTimeRemaining = GAME.BUILD_PHASE_DURATION;
    this.initWaveStats(); // Track spending from the very first BUILD phase
    log(`Game started in room ${this.roomId}`);
    this.startLoop();
  }

  private startLoop(): void {
    const dt = 1 / GAME.TICK_RATE;
    this.loopInterval = setInterval(() => this.tick(dt), 1000 / GAME.TICK_RATE);
  }

  private stopLoop(): void {
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
  }

  private autoRepairCounter = 0;

  private tick(dt: number): void {
    const adjustedDt = dt * this.state.gameSpeed;
    const now = Date.now() / 1000;
    this.phaseSystem.update(this.state, adjustedDt);
    this.waveSystem.update(this.state, adjustedDt);
    this.enemySystem.update(this.state, adjustedDt);
    this.towerSystem.update(this.state, adjustedDt, now);
    this.projectileSystem.update(this.state, adjustedDt);

    // Detect phase transitions for wave stats tracking
    if (this.prevPhase === GamePhase.COMBAT && this.state.phase === GamePhase.BUILD) {
      // Combat ended: finalize stats for the completed wave, then init for the new wave's BUILD phase
      this.finalizeWaveStats();
      this.initWaveStats();
    }
    this.prevPhase = this.state.phase;

    // Auto-repair: process once per second (every TICK_RATE ticks)
    this.autoRepairCounter++;
    if (this.autoRepairCounter >= GAME.TICK_RATE) {
      this.autoRepairCounter = 0;
      this.processAutoRepair();
    }

    this.broadcast({ type: 'GAME_STATE', state: this.state });

    if (this.state.phase === GamePhase.GAME_OVER) {
      this.handleGameOver();
    }
  }

  private initWaveStats(): void {
    this.currentWaveStats = {
      waveNumber: this.state.waveNumber,
      enemiesSpawned: 0,
      enemiesKilled: 0,
      enemiesLeaked: 0,
      towersDestroyed: 0,
      creditsEarned: 0,
      creditsSpent: 0,
      towersBought: 0,
      towersUpgraded: 0,
    };
    // Reset per-wave counters
    this.state.waveTowersDestroyed = 0;
    this.state.waveCreditsEarned = 0;

    // Reset wave economy per player and record phase-transition income
    for (const player of Object.values(this.state.players)) {
      const econ = this.getPlayerEconomy(player.id);
      // Zero out all fields
      econ.startingCredits = player.credits;
      econ.killRewards = 0; econ.waveBonus = 0; econ.towerIncome = 0; econ.sellRefunds = 0;
      econ.towerPurchases = 0; econ.towerUpgrades = 0; econ.repairCosts = 0; econ.restockCosts = 0; econ.maintenanceCosts = 0;

      // Record phase-transition income (already applied by PhaseSystem)
      if (this.state.waveNumber > 1) {
        econ.waveBonus = GAME.CREDITS_PER_WAVE + (this.state.waveNumber - 1) * GAME.CREDITS_PER_WAVE_GROWTH;
        let income = 0;
        let maintenance = 0;
        for (const tower of Object.values(this.state.towers)) {
          if (tower.ownerId !== player.id) continue;
          const stats = TOWER_STATS[tower.type];
          income += stats.incomePerTurn;
          maintenance += stats.maintenancePerTurn;
        }
        econ.towerIncome = income;
        econ.maintenanceCosts = maintenance;
      }
    }
  }

  private getPlayerEconomy(playerId: string): WaveEconomy {
    if (!this.state.waveEconomy[playerId]) {
      this.state.waveEconomy[playerId] = {
        startingCredits: 0,
        killRewards: 0, waveBonus: 0, towerIncome: 0, sellRefunds: 0,
        towerPurchases: 0, towerUpgrades: 0, repairCosts: 0, restockCosts: 0, maintenanceCosts: 0,
      };
    }
    return this.state.waveEconomy[playerId];
  }

  private finalizeWaveStats(): void {
    if (!this.currentWaveStats) return;
    this.currentWaveStats.enemiesSpawned = this.state.waveEnemiesTotal;
    this.currentWaveStats.enemiesKilled = this.state.waveEnemiesKilled;
    this.currentWaveStats.enemiesLeaked = this.state.waveEnemiesTotal - this.state.waveEnemiesKilled;
    this.currentWaveStats.towersDestroyed = this.state.waveTowersDestroyed;
    this.currentWaveStats.creditsEarned = this.state.waveCreditsEarned;
    this.waveStatsHistory.push(this.currentWaveStats);
    this.currentWaveStats = null;
  }

  private handleGameOver(): void {
    // Finalize current wave stats if game ends mid-combat
    if (this.currentWaveStats) {
      this.finalizeWaveStats();
    }

    const players = Object.values(this.state.players);
    let winnerId: string | null = null;

    if (players.length === 2) {
      const [p1, p2] = players;
      const p1Towers = Object.values(this.state.towers).some(t => t.ownerId === p1.id);
      const p2Towers = Object.values(this.state.towers).some(t => t.ownerId === p2.id);
      if (p1Towers && !p2Towers) winnerId = p1.id;
      else if (p2Towers && !p1Towers) winnerId = p2.id;
    }

    this.broadcast({
      type: 'GAME_OVER',
      winnerId,
      finalWave: this.state.waveNumber,
      waveStats: this.waveStatsHistory,
    });
    this.stopLoop();

    if (this.onGameOver) {
      const results: GameResultRecord[] = [];
      for (const player of Object.values(this.state.players)) {
        results.push({
          id: uuid(),
          timestamp: Date.now(),
          playerName: player.name,
          gameMode: this.state.gameMode,
          waveReached: this.state.waveNumber,
          playerHealth: Math.max(0, player.health),
          settings: structuredClone(this.state.settings),
          difficultyFactor: computeDifficultyFactor(this.state.settings),
          adjustedScore: Math.round(this.state.waveNumber * computeDifficultyFactor(this.state.settings) * 100) / 100,
        });
      }
      this.onGameOver(results);
    }
  }

  // --- Message handling ---

  handleMessage(playerId: string, msg: ClientMessage): void {
    switch (msg.type) {
      case 'PLACE_TOWER':
        this.handlePlaceTower(playerId, msg.position.x, msg.position.y, msg.towerType);
        break;
      case 'UPGRADE_TOWER':
        this.handleUpgradeTower(playerId, msg.towerId);
        break;
      case 'SELL_TOWER':
        this.handleSellTower(playerId, msg.towerId);
        break;
      case 'REPAIR_TOWER':
        this.handleRepairTower(playerId, msg.towerId);
        break;
      case 'RESTOCK_TOWER':
        this.handleRestockTower(playerId, msg.towerId);
        break;
      case 'RESTOCK_ALL':
        this.handleRestockAll(playerId);
        break;
      case 'BRUSH_REPAIR':
        this.handleBrushRepair(playerId, msg.center, msg.radius);
        break;
      case 'BRUSH_UPGRADE':
        this.handleBrushUpgrade(playerId, msg.center, msg.radius);
        break;
      case 'BRUSH_SELL':
        this.handleBrushSell(playerId, msg.center, msg.radius);
        break;
      case 'READY_FOR_WAVE':
        this.phaseSystem.handlePlayerReady(this.state, playerId);
        break;
      case 'SET_STARTING_CREDITS':
        this.handleSetStartingCredits(playerId, msg.credits);
        break;
      case 'SET_GAME_SETTINGS':
        this.handleSetGameSettings(playerId, msg.settings);
        break;
      case 'TOGGLE_AUTO_REPAIR':
        this.handleToggleAutoRepair(playerId);
        break;
      case 'TOGGLE_AUTO_REBUILD':
        this.handleToggleAutoRebuild(playerId);
        break;
      case 'TOGGLE_FAST_MODE':
        this.handleToggleFastMode(playerId);
        break;
    }
  }

  private handlePlaceTower(playerId: string, x: number, y: number, type: TowerType): void {
    const player = this.state.players[playerId];
    if (!player) return;

    // Sanitize inputs
    if (!Number.isInteger(x) || !Number.isInteger(y)) return;
    if (!Object.values(TowerType).includes(type)) return;

    if (this.state.phase !== GamePhase.BUILD) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Can only place towers during build phase' });
      return;
    }

    const stats = TOWER_STATS[type];
    const actualCost = this.getDynamicPrice(type, stats.cost);
    if (player.credits < actualCost) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not enough credits' });
      return;
    }

    const validation = validateTowerPlacement(this.state.grid, x, y, player.side);
    if (!validation.valid) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: validation.reason! });
      return;
    }

    const overrides = this.state.settings.towerOverrides?.[type];
    const tower: Tower = {
      id: uuid(),
      type,
      position: { x, y },
      ownerId: playerId,
      level: 1,
      damage: Math.round(stats.damage * (overrides?.damage ?? 1)),
      range: +(stats.range * (overrides?.range ?? 1)).toFixed(1),
      fireRate: +(stats.fireRate * (overrides?.fireRate ?? 1)).toFixed(2),
      lastFireTime: 0,
      targetId: null,
      health: Math.round(stats.maxHealth * (overrides?.maxHealth ?? 1)),
      maxHealth: Math.round(stats.maxHealth * (overrides?.maxHealth ?? 1)),
      ammo: Math.round(stats.maxAmmo * (overrides?.maxAmmo ?? 1)),
      maxAmmo: Math.round(stats.maxAmmo * (overrides?.maxAmmo ?? 1)),
      placedWave: this.state.waveNumber,
    };

    player.credits -= actualCost;
    if (this.currentWaveStats) {
      this.currentWaveStats.creditsSpent += actualCost;
      this.currentWaveStats.towersBought++;
    }
    this.getPlayerEconomy(playerId).towerPurchases += actualCost;
    // Track purchase for dynamic pricing (not BASIC)
    if (type !== TowerType.BASIC && type !== TowerType.WALL) {
      this.state.globalPurchaseCounts[type] = (this.state.globalPurchaseCounts[type] ?? 0) + 1;
    }
    this.state.towers[tower.id] = tower;
    this.state.grid.cells[y][x] = CellType.TOWER;
    // Clear any ghost trace at this position
    this.state.destroyedTowerTraces = this.state.destroyedTowerTraces.filter(
      t => !(t.position.x === x && t.position.y === y)
    );

    this.sendTo(playerId, { type: 'TOWER_PLACED', towerId: tower.id });
  }

  private handleUpgradeTower(playerId: string, towerId: string): void {
    const player = this.state.players[playerId];
    const tower = this.state.towers[towerId];
    if (!player || !tower) return;

    if (tower.ownerId !== playerId) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not your tower' });
      return;
    }

    if (this.state.phase !== GamePhase.BUILD) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Can only upgrade during build phase' });
      return;
    }

    const stats = TOWER_STATS[tower.type];
    // Upgrades use flat cost (no dynamic pricing)
    const cost = Math.round(stats.cost * stats.upgradeCostMultiplier * tower.level);

    if (player.credits < cost) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not enough credits' });
      return;
    }

    player.credits -= cost;
    if (this.currentWaveStats) {
      this.currentWaveStats.creditsSpent += cost;
      this.currentWaveStats.towersUpgraded++;
    }
    this.getPlayerEconomy(playerId).towerUpgrades += cost;
    tower.level++;
    tower.damage = Math.round(tower.damage * stats.upgradeStatMultiplier);
    tower.range = +(tower.range * 1.1).toFixed(1);
    tower.fireRate = +(tower.fireRate * 1.1).toFixed(2);
    tower.maxHealth = Math.round(tower.maxHealth * (tower.type === TowerType.WALL ? 1.3 : 1.2));
    tower.health = tower.maxHealth;
    tower.maxAmmo = Math.round(tower.maxAmmo * 1.15);
    tower.ammo = tower.maxAmmo;

    // Upgrades feed dynamic pricing
    if (tower.type !== TowerType.BASIC && tower.type !== TowerType.WALL) {
      this.state.globalPurchaseCounts[tower.type] =
        (this.state.globalPurchaseCounts[tower.type] ?? 0) + 1;
    }
  }

  private handleSetStartingCredits(playerId: string, credits: number): void {
    if (this.state.phase !== GamePhase.WAITING) return;
    if (!Number.isInteger(credits) || credits < 50 || credits > 10000) return;

    this.state.startingCredits = credits;
    // Update all waiting players' credits to match
    for (const player of Object.values(this.state.players)) {
      player.credits = credits;
    }
    log(`Player ${playerId} set starting credits to ${credits} in room ${this.roomId}`);
  }

  private validateOverrideValues(overrides: Record<string, unknown> | undefined): boolean {
    if (!overrides || typeof overrides !== 'object') return true; // absent is fine
    for (const typeOverrides of Object.values(overrides)) {
      if (!typeOverrides || typeof typeOverrides !== 'object') continue;
      for (const val of Object.values(typeOverrides as Record<string, unknown>)) {
        if (typeof val !== 'number' || val < 0.1 || val > 5.0) return false;
      }
    }
    return true;
  }

  private handleSetGameSettings(playerId: string, settings: GameSettings): void {
    if (this.state.phase !== GamePhase.WAITING) return;

    // Validate settings
    if (typeof settings.startingHealth !== 'number' || settings.startingHealth < 50 || settings.startingHealth > 5000) return;
    if (typeof settings.startingCredits !== 'number' || settings.startingCredits < 50 || settings.startingCredits > 50000) return;
    if (typeof settings.firstWaveEnemies !== 'number' || settings.firstWaveEnemies < 5 || settings.firstWaveEnemies > 500) return;
    if (!Array.isArray(settings.difficultyCurve) || settings.difficultyCurve.length !== 20) return;
    for (const val of settings.difficultyCurve) {
      if (typeof val !== 'number' || val < 0.1 || val > 20.0) return;
    }
    if (!this.validateOverrideValues(settings.towerOverrides as unknown as Record<string, unknown>)) return;
    if (!this.validateOverrideValues(settings.enemyOverrides as unknown as Record<string, unknown>)) return;

    this.state.settings = settings;

    // Update all existing players' credits and health/maxHealth to match new settings
    for (const player of Object.values(this.state.players)) {
      player.credits = settings.startingCredits;
      player.health = settings.startingHealth;
      player.maxHealth = settings.startingHealth;
    }

    log(`Player ${playerId} updated game settings in room ${this.roomId}`);
  }

  private handleSellTower(playerId: string, towerId: string): void {
    const player = this.state.players[playerId];
    const tower = this.state.towers[towerId];
    if (!player || !tower) return;

    if (tower.ownerId !== playerId) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not your tower' });
      return;
    }

    if (this.state.phase !== GamePhase.BUILD) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Can only sell during build phase' });
      return;
    }

    const stats = TOWER_STATS[tower.type];
    // Calculate total investment (base cost + all upgrade costs)
    let totalInvested = stats.cost;
    for (let lvl = 1; lvl < tower.level; lvl++) {
      totalInvested += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
    }

    // Same-phase purchase: 100% refund for repositioning
    const isSamePhase = tower.placedWave === this.state.waveNumber
      && this.state.phase === GamePhase.BUILD;
    const refund = isSamePhase
      ? totalInvested
      : Math.round(totalInvested * SELL_REFUND_RATIO);
    player.credits += refund;
    this.getPlayerEconomy(playerId).sellRefunds += refund;

    // Decrement dynamic pricing counter (undo purchase increment)
    if (tower.type !== TowerType.BASIC && tower.type !== TowerType.WALL) {
      const current = this.state.globalPurchaseCounts[tower.type] ?? 0;
      this.state.globalPurchaseCounts[tower.type] = Math.max(0, current - 1);
    }

    this.state.grid.cells[tower.position.y][tower.position.x] = CellType.EMPTY;
    delete this.state.towers[towerId];
  }

  private handleRepairTower(playerId: string, towerId: string): void {
    const player = this.state.players[playerId];
    const tower = this.state.towers[towerId];
    if (!player || !tower) return;

    if (tower.ownerId !== playerId) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not your tower' });
      return;
    }

    if (this.state.phase !== GamePhase.BUILD && this.state.phase !== GamePhase.COMBAT) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Cannot repair now' });
      return;
    }

    if (tower.health >= tower.maxHealth) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Tower is already at full health' });
      return;
    }

    const stats = TOWER_STATS[tower.type];
    const damageRatio = 1 - tower.health / tower.maxHealth;
    const cost = Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);

    if (player.credits < cost) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not enough credits' });
      return;
    }

    player.credits -= cost;
    if (this.currentWaveStats) this.currentWaveStats.creditsSpent += cost;
    this.getPlayerEconomy(playerId).repairCosts += cost;
    tower.health = tower.maxHealth;
  }

  private handleRestockTower(playerId: string, towerId: string): void {
    const player = this.state.players[playerId];
    const tower = this.state.towers[towerId];
    if (!player || !tower) return;

    if (tower.ownerId !== playerId) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not your tower' });
      return;
    }

    if (tower.ammo >= tower.maxAmmo) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Ammo already full' });
      return;
    }

    const stats = TOWER_STATS[tower.type];
    const ammoNeeded = tower.maxAmmo - tower.ammo;
    const fullCost = ammoNeeded * stats.ammoCostPerRound;

    if (player.credits >= fullCost) {
      player.credits -= fullCost;
      if (this.currentWaveStats) this.currentWaveStats.creditsSpent += fullCost;
      this.getPlayerEconomy(playerId).restockCosts += fullCost;
      tower.ammo = tower.maxAmmo;
    } else {
      // Partial restock — buy as much as affordable
      const ammoToBuy = Math.floor(player.credits / stats.ammoCostPerRound);
      if (ammoToBuy <= 0) {
        this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not enough credits' });
        return;
      }
      const partialCost = ammoToBuy * stats.ammoCostPerRound;
      player.credits -= partialCost;
      if (this.currentWaveStats) this.currentWaveStats.creditsSpent += partialCost;
      this.getPlayerEconomy(playerId).restockCosts += partialCost;
      tower.ammo += ammoToBuy;
    }
  }

  private handleRestockAll(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;

    for (const tower of Object.values(this.state.towers)) {
      if (tower.ownerId !== playerId || tower.ammo >= tower.maxAmmo) continue;

      const stats = TOWER_STATS[tower.type];
      const ammoNeeded = tower.maxAmmo - tower.ammo;
      const fullCost = ammoNeeded * stats.ammoCostPerRound;

      if (player.credits >= fullCost) {
        player.credits -= fullCost;
        if (this.currentWaveStats) this.currentWaveStats.creditsSpent += fullCost;
        this.getPlayerEconomy(playerId).restockCosts += fullCost;
        tower.ammo = tower.maxAmmo;
      } else {
        const ammoToBuy = Math.floor(player.credits / stats.ammoCostPerRound);
        if (ammoToBuy > 0) {
          const partialCost = ammoToBuy * stats.ammoCostPerRound;
          player.credits -= partialCost;
          if (this.currentWaveStats) this.currentWaveStats.creditsSpent += partialCost;
          this.getPlayerEconomy(playerId).restockCosts += partialCost;
          tower.ammo += ammoToBuy;
        }
        break; // Out of credits
      }
    }
  }

  private handleBrushRepair(playerId: string, center: { x: number; y: number }, radius: number): void {
    const player = this.state.players[playerId];
    if (!player) return;
    if (this.state.phase !== GamePhase.BUILD && this.state.phase !== GamePhase.COMBAT) return;

    // Sanitize
    if (!Number.isInteger(center.x) || !Number.isInteger(center.y)) return;
    if (typeof radius !== 'number' || radius < 1 || radius > 10) return;

    // Gather towers in radius, sorted by distance from center
    const towersInRange: { tower: Tower; dist: number }[] = [];
    for (const tower of Object.values(this.state.towers)) {
      if (tower.ownerId !== playerId) continue;
      const dx = tower.position.x - center.x;
      const dy = tower.position.y - center.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        towersInRange.push({ tower, dist });
      }
    }
    towersInRange.sort((a, b) => a.dist - b.dist);

    for (const { tower } of towersInRange) {
      if (player.credits <= 0) break;
      const stats = TOWER_STATS[tower.type];

      const econ = this.getPlayerEconomy(playerId);

      // Repair if damaged
      if (tower.health < tower.maxHealth) {
        const damageRatio = 1 - tower.health / tower.maxHealth;
        const repairCost = Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
        if (player.credits >= repairCost) {
          player.credits -= repairCost;
          if (this.currentWaveStats) this.currentWaveStats.creditsSpent += repairCost;
          econ.repairCosts += repairCost;
          tower.health = tower.maxHealth;
        }
      }

      // Restock if low on ammo
      if (tower.ammo < tower.maxAmmo) {
        const ammoNeeded = tower.maxAmmo - tower.ammo;
        const fullCost = ammoNeeded * stats.ammoCostPerRound;
        if (player.credits >= fullCost) {
          player.credits -= fullCost;
          if (this.currentWaveStats) this.currentWaveStats.creditsSpent += fullCost;
          econ.restockCosts += fullCost;
          tower.ammo = tower.maxAmmo;
        } else {
          const ammoToBuy = Math.floor(player.credits / stats.ammoCostPerRound);
          if (ammoToBuy > 0) {
            const partialCost = ammoToBuy * stats.ammoCostPerRound;
            player.credits -= partialCost;
            if (this.currentWaveStats) this.currentWaveStats.creditsSpent += partialCost;
            econ.restockCosts += partialCost;
            tower.ammo += ammoToBuy;
          }
        }
      }
    }
  }

  private handleToggleAutoRepair(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;
    player.autoRepairEnabled = !player.autoRepairEnabled;
  }

  private handleToggleAutoRebuild(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;
    player.autoRebuildEnabled = !player.autoRebuildEnabled;
  }

  private handleBrushUpgrade(playerId: string, center: { x: number; y: number }, radius: number): void {
    const player = this.state.players[playerId];
    if (!player) return;
    if (this.state.phase !== GamePhase.BUILD) return;
    if (!center || typeof radius !== 'number' || radius < 1 || radius > 10) return;

    for (const tower of Object.values(this.state.towers)) {
      if (tower.ownerId !== playerId) continue;
      const dx = tower.position.x - center.x;
      const dy = tower.position.y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) > radius) continue;

      const stats = TOWER_STATS[tower.type];
      const cost = Math.round(stats.cost * stats.upgradeCostMultiplier * tower.level);
      if (player.credits < cost) continue;

      player.credits -= cost;
      if (this.currentWaveStats) {
        this.currentWaveStats.creditsSpent += cost;
        this.currentWaveStats.towersUpgraded++;
      }
      this.getPlayerEconomy(playerId).towerUpgrades += cost;
      tower.level++;
      tower.damage = Math.round(tower.damage * stats.upgradeStatMultiplier);
      tower.range = +(tower.range * 1.1).toFixed(1);
      tower.fireRate = +(tower.fireRate * 1.1).toFixed(2);
      tower.maxHealth = Math.round(tower.maxHealth * (tower.type === TowerType.WALL ? 1.3 : 1.2));
      tower.health = tower.maxHealth;
      tower.maxAmmo = Math.round(tower.maxAmmo * 1.15);
      tower.ammo = tower.maxAmmo;

      // Upgrades feed dynamic pricing
      if (tower.type !== TowerType.BASIC && tower.type !== TowerType.WALL) {
        this.state.globalPurchaseCounts[tower.type] =
          (this.state.globalPurchaseCounts[tower.type] ?? 0) + 1;
      }
    }
  }

  private handleBrushSell(playerId: string, center: { x: number; y: number }, radius: number): void {
    const player = this.state.players[playerId];
    if (!player) return;
    if (this.state.phase !== GamePhase.BUILD) return;
    if (!center || typeof radius !== 'number' || radius < 1 || radius > 10) return;

    const towersToSell: string[] = [];
    for (const tower of Object.values(this.state.towers)) {
      if (tower.ownerId !== playerId) continue;
      const dx = tower.position.x - center.x;
      const dy = tower.position.y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) > radius) continue;
      towersToSell.push(tower.id);
    }

    for (const towerId of towersToSell) {
      this.handleSellTower(playerId, towerId);
    }
  }

  private handleToggleFastMode(playerId: string): void {
    const player = this.state.players[playerId];
    if (!player) return;
    // Cycle: 1 → 2 → 4 → 1
    if (player.requestedSpeed <= 1) player.requestedSpeed = 2;
    else if (player.requestedSpeed === 2) player.requestedSpeed = 4;
    else player.requestedSpeed = 1;
    this.updateGameSpeed();
  }

  private updateGameSpeed(): void {
    const players = Object.values(this.state.players);
    if (this.state.gameMode === GameMode.SINGLE) {
      const player = players[0];
      this.state.gameSpeed = player?.requestedSpeed ?? 1;
    } else {
      // Multiplayer: game speed = minimum of all players' requested speeds
      if (players.length < 2) {
        this.state.gameSpeed = 1;
      } else {
        this.state.gameSpeed = Math.min(...players.map(p => p.requestedSpeed));
      }
    }
  }

  private processAutoRepair(): void {
    if (this.state.phase !== GamePhase.BUILD && this.state.phase !== GamePhase.COMBAT) return;

    // Reserve 100 credits so auto-repair never drains the player dry
    const AUTO_REPAIR_RESERVE = 100;

    for (const player of Object.values(this.state.players)) {
      if (!player.autoRepairEnabled || player.credits <= AUTO_REPAIR_RESERVE) continue;

      const econ = this.getPlayerEconomy(player.id);
      const ownedTowers = Object.values(this.state.towers).filter(t => t.ownerId === player.id);

      // Repair: sort by damage ratio ascending (most damaged first)
      const damagedTowers = ownedTowers
        .filter(t => t.health < t.maxHealth)
        .sort((a, b) => (a.health / a.maxHealth) - (b.health / b.maxHealth));

      for (const tower of damagedTowers) {
        if (player.credits <= AUTO_REPAIR_RESERVE) break;
        const stats = TOWER_STATS[tower.type];
        const damageRatio = 1 - tower.health / tower.maxHealth;
        const cost = Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
        if (player.credits - cost >= AUTO_REPAIR_RESERVE) {
          player.credits -= cost;
          if (this.currentWaveStats) this.currentWaveStats.creditsSpent += cost;
          econ.repairCosts += cost;
          tower.health = tower.maxHealth;
        }
      }

      // Restock: sort by ammo ratio ascending (least ammo first)
      const lowAmmoTowers = ownedTowers
        .filter(t => t.ammo < t.maxAmmo)
        .sort((a, b) => (a.ammo / a.maxAmmo) - (b.ammo / b.maxAmmo));

      for (const tower of lowAmmoTowers) {
        if (player.credits <= AUTO_REPAIR_RESERVE) break;
        const stats = TOWER_STATS[tower.type];
        const ammoNeeded = tower.maxAmmo - tower.ammo;
        const fullCost = ammoNeeded * stats.ammoCostPerRound;
        if (player.credits - fullCost >= AUTO_REPAIR_RESERVE) {
          player.credits -= fullCost;
          if (this.currentWaveStats) this.currentWaveStats.creditsSpent += fullCost;
          econ.restockCosts += fullCost;
          tower.ammo = tower.maxAmmo;
        } else {
          const available = player.credits - AUTO_REPAIR_RESERVE;
          const ammoToBuy = Math.floor(available / stats.ammoCostPerRound);
          if (ammoToBuy > 0) {
            const partialCost = ammoToBuy * stats.ammoCostPerRound;
            player.credits -= partialCost;
            if (this.currentWaveStats) this.currentWaveStats.creditsSpent += partialCost;
            econ.restockCosts += partialCost;
            tower.ammo += ammoToBuy;
          }
        }
      }
    }
  }

  // --- Dynamic pricing ---

  private getDynamicPrice(type: TowerType, baseCost: number): number {
    const costMult = this.state.settings.towerOverrides?.[type]?.cost ?? 1;
    const adjusted = Math.round(baseCost * costMult);
    if (type === TowerType.BASIC || type === TowerType.WALL) return adjusted;
    const count = this.state.globalPurchaseCounts[type] ?? 0;
    return Math.max(MIN_DYNAMIC_PRICE, Math.round(adjusted * (1 + count * PRICE_ESCALATION)));
  }

  // --- Networking ---

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.connections.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  private sendTo(playerId: string, msg: ServerMessage): void {
    const ws = this.connections.get(playerId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
