import { GameState, GameMode, PlayerSide, TowerType, GridCell, GamePhase } from '../../shared/types/game.types.js';
import { ServerMessage } from '../../shared/types/network.types.js';
import { validateTowerPlacement } from '../../shared/logic/pathfinding.js';
import { TOWER_STATS, PRICE_ESCALATION } from '../../shared/types/constants.js';
import { NetworkClient } from '../network/NetworkClient.js';
import { SoundManager } from '../audio/SoundManager.js';

export interface ClientState {
  selectedTowerType: TowerType | null;
  hoveredCell: GridCell | null;
  selectedTowerId: string | null;
  errorMessage: string | null;
  errorTimer: number;
}

// Shell casing particle for ammo animation
export interface ShellParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export class GameClient {
  private gameState: GameState | null = null;
  private prevState: GameState | null = null;
  private playerId: string | null = null;
  private playerSide: PlayerSide | null = null;
  private network: NetworkClient;
  readonly sound = new SoundManager();
  readonly shellParticles: ShellParticle[] = [];

  readonly clientState: ClientState = {
    selectedTowerType: TowerType.BASIC,
    hoveredCell: null,
    selectedTowerId: null,
    errorMessage: null,
    errorTimer: 0,
  };

  constructor(network: NetworkClient) {
    this.network = network;
    network.onMessage((msg) => this.handleMessage(msg));
  }

  joinGame(gameMode: GameMode, playerName = 'Player'): void {
    this.network.send({ type: 'JOIN_GAME', playerName, gameMode });
  }

  getState(): GameState | null {
    return this.gameState;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  getPlayerSide(): PlayerSide | null {
    return this.playerSide;
  }

  getMyCredits(): number {
    if (!this.gameState || !this.playerId) return 0;
    return this.gameState.players[this.playerId]?.credits ?? 0;
  }

  getOpponentCredits(): number {
    if (!this.gameState || !this.playerId) return 0;
    for (const p of Object.values(this.gameState.players)) {
      if (p.id !== this.playerId) return p.credits;
    }
    return 0;
  }

  getMyTotalAmmo(): { current: number; max: number } {
    if (!this.gameState || !this.playerId) return { current: 0, max: 0 };
    let current = 0;
    let max = 0;
    for (const tower of Object.values(this.gameState.towers)) {
      if (tower.ownerId === this.playerId) {
        current += tower.ammo;
        max += tower.maxAmmo;
      }
    }
    return { current, max };
  }

  getDynamicPrice(type: TowerType): number {
    if (!this.gameState || type === TowerType.BASIC) return TOWER_STATS[type].cost;
    const count = this.gameState.globalPurchaseCounts[type] ?? 0;
    return Math.round(TOWER_STATS[type].cost * (1 + count * PRICE_ESCALATION));
  }

  update(dt: number): void {
    if (this.clientState.errorTimer > 0) {
      this.clientState.errorTimer -= dt;
      if (this.clientState.errorTimer <= 0) {
        this.clientState.errorMessage = null;
      }
    }

    // Update shell casing particles
    for (let i = this.shellParticles.length - 1; i >= 0; i--) {
      const p = this.shellParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt; // gravity
      p.life -= dt;
      if (p.life <= 0) {
        this.shellParticles.splice(i, 1);
      }
    }
  }

  // --- Actions ---

  placeTower(cell: GridCell): void {
    if (!this.gameState || !this.playerSide || !this.clientState.selectedTowerType) return;
    if (this.gameState.phase !== GamePhase.BUILD) return;

    const validation = validateTowerPlacement(this.gameState.grid, cell.x, cell.y, this.playerSide);
    if (!validation.valid) {
      this.showError(validation.reason!);
      return;
    }

    const cost = this.getDynamicPrice(this.clientState.selectedTowerType);
    if (this.getMyCredits() < cost) {
      this.showError('Not enough credits');
      return;
    }

    this.network.send({
      type: 'PLACE_TOWER',
      position: cell,
      towerType: this.clientState.selectedTowerType,
    });
  }

  upgradeTower(towerId: string): void {
    this.network.send({ type: 'UPGRADE_TOWER', towerId });
  }

  sellTower(towerId: string): void {
    this.network.send({ type: 'SELL_TOWER', towerId });
  }

  readyForWave(): void {
    this.network.send({ type: 'READY_FOR_WAVE' });
  }

  setStartingCredits(credits: number): void {
    this.network.send({ type: 'SET_STARTING_CREDITS', credits });
  }

  selectTowerType(type: TowerType): void {
    this.clientState.selectedTowerType = type;
    this.clientState.selectedTowerId = null;
  }

  canPlaceAt(cell: GridCell): boolean {
    if (!this.gameState || !this.playerSide) return false;
    return validateTowerPlacement(this.gameState.grid, cell.x, cell.y, this.playerSide).valid;
  }

  // --- Message handling ---

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'GAME_JOINED':
        this.playerId = msg.playerId;
        this.playerSide = msg.playerSide;
        break;
      case 'GAME_STATE':
        this.detectSoundEvents(msg.state);
        this.prevState = this.gameState;
        this.gameState = msg.state;
        break;
      case 'ACTION_FAILED':
        this.showError(msg.reason);
        this.sound.actionFailed();
        break;
    }
  }

  // --- Sound event detection via state diffing ---

  private detectSoundEvents(next: GameState): void {
    const prev = this.prevState;
    if (!prev) return;

    // Phase transitions
    if (prev.phase !== next.phase) {
      if (next.phase === GamePhase.COMBAT) this.sound.waveStart();
      else if (next.phase === GamePhase.BUILD && prev.phase === GamePhase.COMBAT) this.sound.waveComplete();
      else if (next.phase === GamePhase.GAME_OVER) {
        const myTowers = Object.values(next.towers).filter(t => t.ownerId === this.playerId).length;
        const oppTowers = Object.values(next.towers).filter(t => t.ownerId !== this.playerId).length;
        if (myTowers > 0 && oppTowers === 0) this.sound.victory();
        else this.sound.gameOver();
      }
    }

    // New projectiles → tower fired + spawn shell casing particles
    const prevProjIds = new Set(Object.keys(prev.projectiles));
    for (const id of Object.keys(next.projectiles)) {
      if (!prevProjIds.has(id)) {
        const proj = next.projectiles[id];
        const tower = next.towers[proj.towerId];
        if (tower) {
          if (tower.type === TowerType.SNIPER) this.sound.towerFireSniper();
          else if (tower.type === TowerType.SPLASH) this.sound.towerFireSplash();
          else if (tower.type === TowerType.SLOW) this.sound.towerFireSlow();
          else this.sound.towerFire();

          // Spawn shell casing particle at tower position
          this.shellParticles.push({
            x: tower.position.x,
            y: tower.position.y,
            vx: (Math.random() - 0.5) * 8,
            vy: -3 - Math.random() * 4,
            life: 0.6 + Math.random() * 0.3,
          });
        }
        break;
      }
    }

    // Removed enemies → died or reached goal
    const nextEnemyIds = new Set(Object.keys(next.enemies));
    for (const id of Object.keys(prev.enemies)) {
      if (!nextEnemyIds.has(id)) {
        const enemy = prev.enemies[id];
        if (enemy.health <= 0) {
          this.sound.enemyDeath();
        } else {
          this.sound.enemyReachGoal();
        }
        break;
      }
    }

    // New towers → placed
    const prevTowerIds = new Set(Object.keys(prev.towers));
    for (const id of Object.keys(next.towers)) {
      if (!prevTowerIds.has(id)) {
        this.sound.towerPlaced();
        break;
      }
    }

    // Removed towers → sold or destroyed
    const nextTowerIds = new Set(Object.keys(next.towers));
    for (const id of Object.keys(prev.towers)) {
      if (!nextTowerIds.has(id)) {
        this.sound.towerSold();
        break;
      }
    }

    // Tower upgraded (level increased)
    for (const id of Object.keys(next.towers)) {
      const prevTower = prev.towers[id];
      const nextTower = next.towers[id];
      if (prevTower && nextTower && nextTower.level > prevTower.level) {
        this.sound.towerUpgraded();
        break;
      }
    }
  }

  private showError(message: string): void {
    this.clientState.errorMessage = message;
    this.clientState.errorTimer = 2;
  }
}
