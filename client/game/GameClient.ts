import { GameState, GameMode, GameSettings, PlayerSide, TowerType, EnemyType, GridCell, GamePhase, WaveStats } from '../../shared/types/game.types.js';
import { ServerMessage } from '../../shared/types/network.types.js';
import { validateTowerPlacement } from '../../shared/logic/pathfinding.js';
import { TOWER_STATS, PRICE_ESCALATION } from '../../shared/types/constants.js';
import { computeRepairCost } from '../../shared/utils/economy.js';
import { NetworkClient } from '../network/NetworkClient.js';
import { SoundManager } from '../audio/SoundManager.js';
import { StatsTracker } from './StatsTracker.js';
import { ChartsOverlay } from '../ui/ChartsOverlay.js';
import { TowerTemplate, fromState as templateFromState, save as saveTemplate } from '../data/TemplateStore.js';

export interface ClientState {
  selectedTowerType: TowerType | null;
  hoveredCell: GridCell | null;
  selectedTowerIds: string[];
  errorMessage: string | null;
  errorTimer: number;
  zoom: number;
  panOffset: { x: number; y: number };
  activeTool: 'place' | 'brush';
  brushRadius: number;
  brushMode: 'repair' | 'upgrade' | 'sell';
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
  readonly statsTracker = new StatsTracker();
  readonly chartsOverlay: ChartsOverlay;
  private waveStats: WaveStats[] = [];
  private pendingTemplate: TowerTemplate | null = null;
  private templateApplied = false;

  readonly clientState: ClientState = {
    selectedTowerType: TowerType.BASIC,
    hoveredCell: null,
    selectedTowerIds: [],
    errorMessage: null,
    errorTimer: 0,
    zoom: 1.0,
    panOffset: { x: 0, y: 0 },
    activeTool: 'place',
    brushRadius: 3,
    brushMode: 'repair',
  };

  constructor(network: NetworkClient) {
    this.network = network;
    this.chartsOverlay = new ChartsOverlay(this, this.statsTracker);
    network.onMessage((msg) => this.handleMessage(msg));
  }

  joinGame(gameMode: GameMode, playerName = 'Player', settings?: GameSettings): void {
    this.network.send({ type: 'JOIN_GAME', playerName, gameMode, settings });
  }

  setPendingTemplate(tpl: TowerTemplate): void {
    this.pendingTemplate = tpl;
    this.templateApplied = false;
  }

  /** Snapshot current tower layout + save to localStorage. Returns true on success. */
  saveCurrentAsTemplate(): boolean {
    if (!this.gameState || !this.playerId) return false;
    const myTowers = Object.values(this.gameState.towers).filter(t => t.ownerId === this.playerId);
    if (myTowers.length === 0) {
      this.showError('No towers to save');
      return false;
    }
    const player = this.gameState.players[this.playerId];
    const playerName = player?.name ?? 'Player';
    const name = prompt(`Template name (${myTowers.length} towers):`);
    if (!name || !name.trim()) return false;
    const tpl = templateFromState(this.gameState, this.playerId, name.trim());
    saveTemplate(playerName, tpl);
    return true;
  }

  /**
   * Apply a template by firing individual PLACE_TOWER + UPGRADE_TOWER messages.
   * The server validates each one (cost, path) — partial apply is possible if
   * credits run out. Must be called during the first BUILD phase before any
   * other towers are placed.
   */
  private applyTemplate(tpl: TowerTemplate): void {
    // Fire all placements in original order, upgrades last so tower IDs exist.
    // We don't have the server-assigned tower ID until after TOWER_PLACED arrives;
    // instead, upgrade each tower by finding it in state.towers by position.
    for (const t of tpl.towers) {
      this.network.send({
        type: 'PLACE_TOWER',
        position: { x: t.x, y: t.y },
        towerType: t.type,
      });
    }
    // After all placements, queue upgrade messages. They'll be processed after
    // the server has created the towers (messages are ordered per-connection).
    // We look up tower IDs by position from the *current* state; since the
    // placement messages haven't been processed yet, we send by position-hint
    // via a small delayed retry loop.
    const tryUpgrade = (attempt: number) => {
      if (!this.gameState) return;
      let stillPending = 0;
      for (const t of tpl.towers) {
        if (t.level <= 1) continue;
        const tower = Object.values(this.gameState.towers).find(
          tw => tw.position.x === t.x && tw.position.y === t.y && tw.ownerId === this.playerId,
        );
        if (!tower) { stillPending++; continue; }
        // Send (target level - current level) upgrade messages
        const needed = t.level - tower.level;
        for (let i = 0; i < needed; i++) {
          this.network.send({ type: 'UPGRADE_TOWER', towerId: tower.id });
        }
      }
      if (stillPending > 0 && attempt < 20) {
        setTimeout(() => tryUpgrade(attempt + 1), 150);
      }
    };
    setTimeout(() => tryUpgrade(0), 200);
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

  getMyHealth(): { current: number; max: number } {
    if (!this.gameState || !this.playerId) return { current: 0, max: 0 };
    const player = this.gameState.players[this.playerId];
    return player ? { current: player.health, max: player.maxHealth } : { current: 0, max: 0 };
  }

  getOpponentHealth(): { current: number; max: number } {
    if (!this.gameState || !this.playerId) return { current: 0, max: 0 };
    for (const p of Object.values(this.gameState.players)) {
      if (p.id !== this.playerId) return { current: p.health, max: p.maxHealth };
    }
    return { current: 0, max: 0 };
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
    if (!this.gameState) return TOWER_STATS[type].cost;
    const costMult = this.gameState.settings?.towerOverrides?.[type]?.cost ?? 1;
    const adjusted = Math.round(TOWER_STATS[type].cost * costMult);
    if (type === TowerType.BASIC || type === TowerType.WALL) return adjusted;
    const count = this.gameState.globalPurchaseCounts[type] ?? 0;
    return Math.max(10, Math.round(adjusted * (1 + count * PRICE_ESCALATION)));
  }

  update(dt: number): void {
    if (this.gameState) {
      this.statsTracker.recordTick(this.gameState, dt);
    }

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

  repairTower(towerId: string): void {
    this.network.send({ type: 'REPAIR_TOWER', towerId });
  }

  restockTower(towerId: string): void {
    this.network.send({ type: 'RESTOCK_TOWER', towerId });
  }

  restockAll(): void {
    this.network.send({ type: 'RESTOCK_ALL' });
  }

  toggleAutoRepair(): void {
    this.network.send({ type: 'TOGGLE_AUTO_REPAIR' });
  }

  isAutoRepairEnabled(): boolean {
    if (!this.gameState || !this.playerId) return false;
    return this.gameState.players[this.playerId]?.autoRepairEnabled ?? false;
  }

  toggleAutoRestock(): void {
    this.network.send({ type: 'TOGGLE_AUTO_RESTOCK' });
  }

  isAutoRestockEnabled(): boolean {
    if (!this.gameState || !this.playerId) return false;
    return this.gameState.players[this.playerId]?.autoRestockEnabled ?? false;
  }

  toggleFastMode(): void {
    this.network.send({ type: 'TOGGLE_FAST_MODE' });
  }

  getRequestedSpeed(): number {
    if (!this.gameState || !this.playerId) return 1;
    return this.gameState.players[this.playerId]?.requestedSpeed ?? 1;
  }

  isFastModeRequested(): boolean {
    return this.getRequestedSpeed() > 1;
  }

  getGameSpeed(): number {
    return this.gameState?.gameSpeed ?? 1;
  }

  brushRepairAndRestock(centerX: number, centerY: number): void {
    this.network.send({
      type: 'BRUSH_REPAIR',
      center: { x: centerX, y: centerY },
      radius: this.clientState.brushRadius,
    });
  }

  brushUpgrade(centerX: number, centerY: number): void {
    this.network.send({
      type: 'BRUSH_UPGRADE',
      center: { x: centerX, y: centerY },
      radius: this.clientState.brushRadius,
    });
  }

  brushSell(centerX: number, centerY: number): void {
    this.network.send({
      type: 'BRUSH_SELL',
      center: { x: centerX, y: centerY },
      radius: this.clientState.brushRadius,
    });
  }

  toggleAutoRebuild(): void {
    this.network.send({ type: 'TOGGLE_AUTO_REBUILD' });
  }

  isAutoRebuildEnabled(): boolean {
    if (!this.gameState || !this.playerId) return false;
    return this.gameState.players[this.playerId]?.autoRebuildEnabled ?? false;
  }

  getRestockCost(towerId: string): number | null {
    if (!this.gameState) return null;
    const tower = this.gameState.towers[towerId];
    if (!tower || tower.ammo >= tower.maxAmmo) return null;
    const stats = TOWER_STATS[tower.type];
    return Math.round((tower.maxAmmo - tower.ammo) * stats.ammoCostPerRound);
  }

  getRepairCost(towerId: string): number | null {
    if (!this.gameState) return null;
    const tower = this.gameState.towers[towerId];
    if (!tower || tower.health >= tower.maxHealth) return null;
    return computeRepairCost(tower.type, tower.health, tower.maxHealth);
  }

  getUpgradeCost(towerId: string): number | null {
    if (!this.gameState) return null;
    const tower = this.gameState.towers[towerId];
    if (!tower) return null;
    const stats = TOWER_STATS[tower.type];
    // Upgrades no longer use dynamic pricing — flat cost based on level
    return Math.round(stats.cost * stats.upgradeCostMultiplier * tower.level);
  }

  getWaveStats(): WaveStats[] {
    return this.waveStats;
  }

  readyForWave(): void {
    this.network.send({ type: 'READY_FOR_WAVE' });
  }

  async saveGame(displayName?: string): Promise<boolean> {
    if (!this.gameState || !this.playerId) return false;
    if (this.gameState.phase !== GamePhase.BUILD) return false;
    if (this.gameState.gameMode !== GameMode.SINGLE) return false;

    const player = this.gameState.players[this.playerId];
    if (!player) return false;

    const save = {
      metadata: {
        id: crypto.randomUUID(),
        playerName: player.name,
        displayName: displayName || `Wave ${this.gameState.waveNumber}`,
        timestamp: Date.now(),
        waveReached: this.gameState.waveNumber,
        playerHealth: player.health,
        credits: player.credits,
        gameMode: this.gameState.gameMode,
      },
      gameState: structuredClone(this.gameState),
    };

    try {
      const resp = await fetch(`${window.location.origin}/api/saves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(save),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  loadSave(saveId: string): void {
    this.network.send({ type: 'LOAD_SAVE', saveId });
  }

  setStartingCredits(credits: number): void {
    this.network.send({ type: 'SET_STARTING_CREDITS', credits });
  }

  selectTowerType(type: TowerType): void {
    this.clientState.selectedTowerType = type;
    this.clientState.selectedTowerIds = [];
    this.clientState.activeTool = 'place';
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
        // Apply pending template on the first BUILD-phase snapshot where no towers exist yet.
        if (this.pendingTemplate && !this.templateApplied
            && msg.state.phase === GamePhase.BUILD
            && this.playerId
            && !Object.values(msg.state.towers).some(t => t.ownerId === this.playerId)) {
          this.templateApplied = true;
          this.applyTemplate(this.pendingTemplate);
          this.pendingTemplate = null;
        }
        break;
      case 'GAME_OVER':
        if (msg.waveStats) this.waveStats = msg.waveStats;
        break;
      case 'ACTION_FAILED':
        this.showError(msg.reason);
        this.sound.actionFailed();
        break;
      case 'AI_DEFEATED':
        this.showAIDefeatedModal(msg.defeatCount, msg.aiName, msg.wave, msg.newAiName, msg.newBudget);
        break;
    }
  }

  // --- Sound event detection via state diffing ---

  private airRaidWave = -1;

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

    // Air raid siren: play when the "Air in N" warning first appears (countdown
    // goes from -1 → positive), AND again when flying enemies actually spawn.
    if (prev.airWaveCountdown < 0 && next.airWaveCountdown > 0) {
      this.sound.airRaidSiren();
    }
    if (next.phase === GamePhase.COMBAT && next.waveNumber !== this.airRaidWave) {
      for (const enemy of Object.values(next.enemies)) {
        if (enemy.type === EnemyType.FLYING) {
          this.sound.airRaidSiren();
          this.airRaidWave = next.waveNumber;
          break;
        }
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

  private showAIDefeatedModal(defeatCount: number, aiName: string, wave: number, newAiName: string, newBudget: number): void {
    // Use a dedicated modal that won't get clobbered by HUD updates
    let modal = document.getElementById('ai-defeated-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ai-defeated-modal';
      modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.92);border:2px solid #4ADE80;border-radius:12px;padding:32px 48px;z-index:9999;text-align:center;font-family:"DM Mono",monospace;color:#fff;pointer-events:none;';
      document.body.appendChild(modal);
    }
    modal.style.display = 'block';
    modal.innerHTML = `
      <div style="font-size:24px;font-weight:bold;color:#4ADE80;margin-bottom:12px">AI DEFEATED x${defeatCount}</div>
      <div>You outlasted <strong>${aiName}</strong> past wave ${wave}!</div>
      <div style="margin-top:12px;opacity:0.7">A new challenger approaches...</div>
      <div style="margin-top:8px"><span style="color:#F59E0B;font-weight:bold">${newAiName}</span> enters with a budget of <span style="color:#4ADE80">${newBudget.toLocaleString()}c</span></div>
      <div style="margin-top:16px;opacity:0.5;font-style:italic">How long can you survive?</div>
    `;

    setTimeout(() => {
      modal.style.display = 'none';
    }, 5000);
  }

  private showError(message: string): void {
    this.clientState.errorMessage = message;
    this.clientState.errorTimer = 2;
  }
}
