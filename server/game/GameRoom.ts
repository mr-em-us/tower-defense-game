import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import {
  GameState, GamePhase, GameMode, Player, PlayerSide,
  CellType, TowerType, Tower,
} from '../../shared/types/game.types.js';
import { GRID, GAME, TOWER_STATS, SELL_REFUND_RATIO, PRICE_ESCALATION } from '../../shared/types/constants.js';
import { validateTowerPlacement } from '../../shared/logic/pathfinding.js';
import { ClientMessage, ServerMessage } from '../../shared/types/network.types.js';
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

  private phaseSystem = new PhaseSystem();
  private waveSystem = new WaveSystem();
  private enemySystem = new EnemySystem();
  private towerSystem = new TowerSystem();
  private projectileSystem = new ProjectileSystem();

  constructor(gameMode: GameMode = GameMode.MULTI) {
    this.roomId = uuid();
    this.state = this.createInitialState(gameMode);
    log(`Room ${this.roomId} created (${gameMode})`);
  }

  get gameMode(): GameMode {
    return this.state.gameMode;
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
    };
  }

  // --- Connection management ---

  addPlayer(newPlayerId: string, ws: WebSocket): { playerId: string; side: PlayerSide } | null {
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
      side,
      credits: this.state.startingCredits,
      health: GAME.PLAYER_MAX_HEALTH,
      maxHealth: GAME.PLAYER_MAX_HEALTH,
      isReady: false,
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

  private tick(dt: number): void {
    const now = Date.now() / 1000;
    this.phaseSystem.update(this.state, dt);
    this.waveSystem.update(this.state, dt);
    this.enemySystem.update(this.state, dt);
    this.towerSystem.update(this.state, dt, now);
    this.projectileSystem.update(this.state, dt);
    this.broadcast({ type: 'GAME_STATE', state: this.state });

    if (this.state.phase === GamePhase.GAME_OVER) {
      this.handleGameOver();
    }
  }

  private handleGameOver(): void {
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
    });
    this.stopLoop();
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
      case 'READY_FOR_WAVE':
        this.phaseSystem.handlePlayerReady(this.state, playerId);
        break;
      case 'SET_STARTING_CREDITS':
        this.handleSetStartingCredits(playerId, msg.credits);
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

    const tower: Tower = {
      id: uuid(),
      type,
      position: { x, y },
      ownerId: playerId,
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
    };

    player.credits -= actualCost;
    // Track purchase for dynamic pricing (not BASIC)
    if (type !== TowerType.BASIC) {
      this.state.globalPurchaseCounts[type] = (this.state.globalPurchaseCounts[type] ?? 0) + 1;
    }
    this.state.towers[tower.id] = tower;
    this.state.grid.cells[y][x] = CellType.TOWER;

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
    const baseCost = Math.round(stats.cost * stats.upgradeCostMultiplier * tower.level);
    const cost = this.getDynamicPrice(tower.type, baseCost);

    if (player.credits < cost) {
      this.sendTo(playerId, { type: 'ACTION_FAILED', reason: 'Not enough credits' });
      return;
    }

    player.credits -= cost;
    tower.level++;
    tower.damage = Math.round(tower.damage * stats.upgradeStatMultiplier);
    tower.range = +(tower.range * 1.1).toFixed(1);
    tower.fireRate = +(tower.fireRate * 1.1).toFixed(2);
    tower.maxHealth = Math.round(tower.maxHealth * 1.2);
    tower.health = tower.maxHealth;
    tower.maxAmmo = Math.round(tower.maxAmmo * 1.15);
    tower.ammo = tower.maxAmmo;

    // Track upgrade for dynamic pricing (not BASIC)
    if (tower.type !== TowerType.BASIC) {
      this.state.globalPurchaseCounts[tower.type] = (this.state.globalPurchaseCounts[tower.type] ?? 0) + 1;
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
    const refund = Math.round(totalInvested * SELL_REFUND_RATIO);
    player.credits += refund;

    this.state.grid.cells[tower.position.y][tower.position.x] = CellType.EMPTY;
    delete this.state.towers[towerId];
  }

  // --- Dynamic pricing ---

  private getDynamicPrice(type: TowerType, baseCost: number): number {
    if (type === TowerType.BASIC) return baseCost;
    const count = this.state.globalPurchaseCounts[type] ?? 0;
    return Math.round(baseCost * (1 + count * PRICE_ESCALATION));
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
