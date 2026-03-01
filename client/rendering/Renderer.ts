import {
  GameState, GamePhase, PlayerSide, TowerType, CellType, GridCell,
} from '../../shared/types/game.types.js';
import { GRID, VISUAL, TOWER_STATS, SELL_REFUND_RATIO, REPAIR_COST_RATIO, CENTER_SPAWN, PRICE_ESCALATION } from '../../shared/types/constants.js';
import { findPath } from '../../shared/logic/pathfinding.js';
import { TOWER_CHARS, getEnemyChar } from './AsciiArt.js';
import { GameClient } from '../game/GameClient.js';

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private gameClient: GameClient;
  private time = 0;

  constructor(ctx: CanvasRenderingContext2D, gameClient: GameClient) {
    this.ctx = ctx;
    this.gameClient = gameClient;
  }

  render(dt: number): void {
    this.time += dt;
    const state = this.gameClient.getState();
    const ctx = this.ctx;
    const W = GRID.WIDTH * GRID.CELL_SIZE;
    const H = GRID.HEIGHT * GRID.CELL_SIZE;

    // Clear entire canvas (before zoom)
    ctx.fillStyle = VISUAL.BG_COLOR;
    ctx.fillRect(0, 0, W, H);

    if (!state) {
      this.drawCenteredText('Connecting...', W / 2, H / 2, 24);
      return;
    }

    // --- Game world (zoomed) ---
    const { zoom, panOffset } = this.gameClient.clientState;
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    this.drawGrid(state);
    this.drawPathPreview(state);
    this.drawTowers(state);
    this.drawEnemies(state);
    this.drawProjectiles(state);
    this.drawShellParticles();
    this.drawHoverPreview(state);
    this.drawSelectedTowerRange(state);
    this.drawBrushPreview(state);

    ctx.restore();

    // --- HUD overlays (not zoomed, fixed to screen) ---
    this.drawSelectedTowerInfo(state);
    this.drawAmmoBar(state);
    this.drawWaveProgress(state);
    this.drawChartWidget();
    this.drawError();
  }

  // --- Grid ---

  private drawGrid(state: GameState): void {
    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;

    ctx.strokeStyle = VISUAL.GRID_COLOR;
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= GRID.WIDTH; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cs, 0);
      ctx.lineTo(x * cs, GRID.HEIGHT * cs);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID.HEIGHT; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cs);
      ctx.lineTo(GRID.WIDTH * cs, y * cs);
      ctx.stroke();
    }

    ctx.strokeStyle = VISUAL.ZONE_BORDER_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const midX = GRID.RIGHT_ZONE_START * cs;
    ctx.beginPath();
    ctx.moveTo(midX, 0);
    ctx.lineTo(midX, GRID.HEIGHT * cs);
    ctx.stroke();
    ctx.setLineDash([]);

    const side = this.gameClient.getPlayerSide();
    if (side === PlayerSide.LEFT) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(0, 0, midX, GRID.HEIGHT * cs);
    } else if (side === PlayerSide.RIGHT) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(midX, 0, (GRID.WIDTH - GRID.RIGHT_ZONE_START) * cs, GRID.HEIGHT * cs);
    }

    // Center spawn X marker
    const centerX = (CENTER_SPAWN.X_MIN + CENTER_SPAWN.X_MAX + 1) / 2 * cs;
    const centerY = (CENTER_SPAWN.Y_ROWS[0] + CENTER_SPAWN.Y_ROWS[CENTER_SPAWN.Y_ROWS.length - 1] + 1) / 2 * cs;
    ctx.fillStyle = 'rgba(255, 200, 50, 0.8)';
    ctx.font = `bold ${cs * 1.5}px ${VISUAL.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('X', centerX, centerY);
  }

  // --- Path preview ---

  private drawPathPreview(state: GameState): void {
    if (state.phase !== GamePhase.BUILD) return;

    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;
    const hover = this.gameClient.clientState.hoveredCell;
    const towerType = this.gameClient.clientState.selectedTowerType;

    // Temporarily place tower in grid if hovering a valid spot
    let simulated = false;
    if (hover && towerType && state.grid.cells[hover.y]?.[hover.x] === CellType.EMPTY) {
      state.grid.cells[hover.y][hover.x] = CellType.TOWER;
      simulated = true;
    }

    const leftPath = findPath(state.grid, PlayerSide.LEFT);
    const rightPath = findPath(state.grid, PlayerSide.RIGHT);

    // Restore grid
    if (simulated && hover) {
      state.grid.cells[hover.y][hover.x] = CellType.EMPTY;
    }

    // Draw paths as translucent red lines through cell centers
    for (const path of [leftPath, rightPath]) {
      if (!path || path.length < 2) continue;

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(path[0].x * cs + cs / 2, path[0].y * cs + cs / 2);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x * cs + cs / 2, path[i].y * cs + cs / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // --- Towers ---

  private drawTowers(state: GameState): void {
    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;
    const playerId = this.gameClient.getPlayerId();
    const selectedIds = this.gameClient.clientState.selectedTowerIds;

    for (const tower of Object.values(state.towers)) {
      const cx = tower.position.x * cs + cs / 2;
      const cy = tower.position.y * cs + cs / 2;

      const isOwn = tower.ownerId === playerId;
      const isSelected = selectedIds.includes(tower.id);

      // Background highlight
      if (isSelected) {
        ctx.fillStyle = 'rgba(74, 222, 128, 0.2)';
      } else {
        ctx.fillStyle = isOwn ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 200, 200, 0.1)';
      }
      ctx.fillRect(tower.position.x * cs + 1, tower.position.y * cs + 1, cs - 2, cs - 2);

      // Tower character - dim if out of ammo
      ctx.fillStyle = tower.ammo > 0 ? VISUAL.FG_COLOR : 'rgba(255, 255, 255, 0.35)';
      ctx.font = `bold ${cs - 4}px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TOWER_CHARS[tower.type], cx, cy);

      // Level indicator
      if (tower.level > 1) {
        ctx.font = `${cs * 0.35}px ${VISUAL.FONT}`;
        ctx.fillStyle = 'rgba(255, 255, 150, 0.9)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`${tower.level}`, (tower.position.x + 1) * cs - 2, tower.position.y * cs + 1);
      }

      // Health bar (below tower)
      const hpRatio = tower.health / tower.maxHealth;
      if (hpRatio < 1) {
        const barW = cs - 4;
        const barH = 2;
        const barX = tower.position.x * cs + 2;
        const barY = (tower.position.y + 1) * cs - 3;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = hpRatio > 0.5 ? '#4ADE80' : hpRatio > 0.25 ? '#FBBF24' : '#EF4444';
        ctx.fillRect(barX, barY, barW * hpRatio, barH);
      }

      // Ammo count (left side of tower during combat)
      if (isOwn && state.phase === GamePhase.COMBAT) {
        const ammoRatio = tower.ammo / tower.maxAmmo;
        const dotY = tower.position.y * cs + 2;
        const dotX = tower.position.x * cs + 2;
        ctx.fillStyle = ammoRatio > 0.3 ? 'rgba(255, 200, 50, 0.7)' : 'rgba(239, 68, 68, 0.8)';
        ctx.font = `${cs * 0.3}px ${VISUAL.FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${tower.ammo}`, dotX, dotY);
      }
    }
  }

  // --- Shell casing particles ---

  private drawShellParticles(): void {
    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;

    for (const p of this.gameClient.shellParticles) {
      const alpha = Math.min(1, p.life * 2);
      ctx.fillStyle = `rgba(255, 200, 50, ${alpha})`;
      ctx.font = `${cs * 0.4}px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(',', p.x * cs + cs / 2, p.y * cs + cs / 2);
    }
  }

  // --- Ammo bar overlay (during combat) ---

  private drawAmmoBar(state: GameState): void {
    if (state.phase !== GamePhase.COMBAT) return;

    const ammo = this.gameClient.getMyTotalAmmo();
    if (ammo.max === 0) return;

    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;
    const W = GRID.WIDTH * cs;
    const ratio = ammo.current / ammo.max;
    const side = this.gameClient.getPlayerSide();

    // Position on the player's side of the board
    const barW = 160;
    const barH = 8;
    const barX = side === PlayerSide.RIGHT
      ? W - barW - 12
      : 12;
    const barY = 6;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    const barColor = ratio > 0.5 ? '#FBBF24' : ratio > 0.2 ? '#F97316' : '#EF4444';
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barW * ratio, barH);

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = `10px ${VISUAL.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`AMMO ${ammo.current}/${ammo.max}`, barX + barW / 2, barY + barH + 2);
  }

  // --- Wave progress overlay (during combat) ---

  private drawWaveProgress(state: GameState): void {
    if (state.phase !== GamePhase.COMBAT) return;
    if (state.waveEnemiesTotal === 0) return;

    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;
    const W = GRID.WIDTH * cs;
    const side = this.gameClient.getPlayerSide();

    // Per-player stats: filter enemies targeting this player's side
    const mySide = side ?? PlayerSide.LEFT;
    const total = state.waveEnemiesTotal; // each queue entry spawns one per side
    const alive = Object.values(state.enemies).filter(e => e.targetSide === mySide).length;
    const remaining = state.waveEnemiesRemaining;
    const cleared = Math.max(0, total - alive - remaining);
    const progress = total > 0 ? cleared / total : 0;

    // Position on the player's side, below the ammo bar
    const barW = 160;
    const barH = 8;
    const barX = side === PlayerSide.RIGHT
      ? W - barW - 12
      : 12;
    const barY = 28;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    // Progress fill
    const barColor = progress > 0.7 ? '#4ADE80' : progress > 0.3 ? '#FBBF24' : '#60A5FA';
    ctx.fillStyle = barColor;
    ctx.fillRect(barX, barY, barW * progress, barH);

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = `10px ${VISUAL.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `CLEARED ${cleared}/${total}  ALIVE ${alive}  QUEUE ${remaining}`,
      barX + barW / 2,
      barY + barH + 2,
    );
  }

  // --- Enemies ---

  private drawEnemies(state: GameState): void {
    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;

    for (const enemy of Object.values(state.enemies)) {
      if (!enemy.spawned) continue;

      const cx = enemy.position.x * cs + cs / 2;
      const cy = enemy.position.y * cs + cs / 2;

      const ch = getEnemyChar(enemy.type, this.time);
      ctx.fillStyle = '#FF6B6B';
      ctx.font = `bold ${cs - 2}px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, cx, cy);

      const hpRatio = enemy.health / enemy.maxHealth;
      const barW = cs - 4;
      const barH = 3;
      const barX = cx - barW / 2;
      const barY = cy - cs / 2 - 2;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = hpRatio > 0.5 ? '#4ADE80' : hpRatio > 0.25 ? '#FBBF24' : '#EF4444';
      ctx.fillRect(barX, barY, barW * hpRatio, barH);
    }
  }

  // --- Projectiles ---

  private drawProjectiles(state: GameState): void {
    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;

    ctx.fillStyle = '#FBBF24';
    for (const proj of Object.values(state.projectiles)) {
      const px = proj.position.x * cs + cs / 2;
      const py = proj.position.y * cs + cs / 2;

      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Hover preview ---

  private drawHoverPreview(state: GameState): void {
    const cs = this.gameClient.clientState;
    const cell = cs.hoveredCell;

    // Tower placement preview (only during build with place tool)
    if (cell && cs.selectedTowerType && cs.activeTool === 'place' && state.phase === GamePhase.BUILD) {
      const cellSize = GRID.CELL_SIZE;
      const canPlace = this.gameClient.canPlaceAt(cell);
      const ctx = this.ctx;

      ctx.fillStyle = canPlace ? 'rgba(74, 222, 128, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize);

      ctx.fillStyle = canPlace ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 100, 100, 0.5)';
      ctx.font = `bold ${cellSize - 4}px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(TOWER_CHARS[cs.selectedTowerType], cell.x * cellSize + cellSize / 2, cell.y * cellSize + cellSize / 2);

      if (canPlace) {
        const stats = TOWER_STATS[cs.selectedTowerType];
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cell.x * cellSize + cellSize / 2, cell.y * cellSize + cellSize / 2, stats.range * cellSize, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // --- Brush preview circle (drawn in world space, zoomed) ---

  private drawBrushPreview(state: GameState): void {
    const cs = this.gameClient.clientState;
    if (cs.activeTool !== 'brush') return;
    if (state.phase !== GamePhase.BUILD && state.phase !== GamePhase.COMBAT) return;

    const cell = cs.hoveredCell;
    if (!cell) return;

    const ctx = this.ctx;
    const cellSize = GRID.CELL_SIZE;
    const centerX = cell.x * cellSize + cellSize / 2;
    const centerY = cell.y * cellSize + cellSize / 2;
    const radius = cs.brushRadius * cellSize;

    // Check if any own towers are in the brush radius
    const playerId = this.gameClient.getPlayerId();
    let hasTowersInRange = false;
    for (const tower of Object.values(state.towers)) {
      if (tower.ownerId !== playerId) continue;
      const dx = tower.position.x - cell.x;
      const dy = tower.position.y - cell.y;
      if (Math.sqrt(dx * dx + dy * dy) <= cs.brushRadius) {
        if (tower.health < tower.maxHealth || tower.ammo < tower.maxAmmo) {
          hasTowersInRange = true;
          break;
        }
      }
    }

    // Draw circle
    ctx.strokeStyle = hasTowersInRange ? 'rgba(74, 222, 128, 0.5)' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill
    ctx.fillStyle = hasTowersInRange ? 'rgba(74, 222, 128, 0.05)' : 'rgba(255, 255, 255, 0.02)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Selected tower range (drawn in world space, zoomed) ---

  private drawSelectedTowerRange(state: GameState): void {
    const selectedIds = this.gameClient.clientState.selectedTowerIds;
    if (selectedIds.length === 0) return;

    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;

    for (const towerId of selectedIds) {
      const tower = state.towers[towerId];
      if (!tower) continue;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        tower.position.x * cs + cs / 2,
        tower.position.y * cs + cs / 2,
        tower.range * cs, 0, Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  // --- Selected tower info (drawn in screen space, not zoomed) ---

  private drawSelectedTowerInfo(state: GameState): void {
    const selectedIds = this.gameClient.clientState.selectedTowerIds;
    if (selectedIds.length === 0) return;

    const ctx = this.ctx;
    const cs = GRID.CELL_SIZE;

    if (selectedIds.length === 1) {
      // Single tower info panel
      const tower = state.towers[selectedIds[0]];
      if (!tower) return;

      const stats = TOWER_STATS[tower.type];
      const baseUpgradeCost = Math.round(stats.cost * stats.upgradeCostMultiplier * tower.level);
      const upgradeCost = tower.type !== TowerType.BASIC
        ? Math.round(baseUpgradeCost * (1 + (state.globalPurchaseCounts[tower.type] ?? 0) * PRICE_ESCALATION))
        : baseUpgradeCost;
      let totalInvested = stats.cost;
      for (let lvl = 1; lvl < tower.level; lvl++) {
        totalInvested += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
      }
      const sellValue = Math.round(totalInvested * SELL_REFUND_RATIO);

      const hasDamage = tower.health < tower.maxHealth;
      const needsAmmo = tower.ammo < tower.maxAmmo;
      let lines = 6;
      if (hasDamage) lines++;
      if (needsAmmo) lines++;
      const panelH = 16 * lines + 4;
      const panelX = 10;
      const panelY = GRID.HEIGHT * cs - panelH - 10;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(panelX, panelY, 240, panelH);

      ctx.fillStyle = VISUAL.FG_COLOR;
      ctx.font = `13px ${VISUAL.FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      let y = panelY + 6;
      ctx.fillText(`Lvl ${tower.level} ${tower.type}`, panelX + 8, y); y += 16;
      ctx.fillText(`DMG: ${tower.damage}  RNG: ${tower.range}`, panelX + 8, y); y += 16;
      ctx.fillText(`HP: ${Math.ceil(tower.health)}/${tower.maxHealth}  AMMO: ${tower.ammo}/${tower.maxAmmo}`, panelX + 8, y); y += 16;
      ctx.fillText(`Income: +${stats.incomePerTurn}c  Maint: -${stats.maintenancePerTurn}c`, panelX + 8, y); y += 16;
      ctx.fillText(`Upgrade: ${upgradeCost}c  Sell: ${sellValue}c`, panelX + 8, y); y += 16;
      ctx.fillText(`Ammo cost: ${stats.ammoCostPerRound}c/round`, panelX + 8, y); y += 16;

      if (hasDamage) {
        const damageRatio = 1 - tower.health / tower.maxHealth;
        const repairCost = Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(`Repair: ${repairCost}c`, panelX + 8, y); y += 16;
      }

      if (needsAmmo) {
        const restockCost = Math.round((tower.maxAmmo - tower.ammo) * stats.ammoCostPerRound);
        ctx.fillStyle = '#60A5FA';
        ctx.fillText(`Restock: ${restockCost}c`, panelX + 8, y);
      }
    } else {
      // Multi-select summary panel
      const towers = selectedIds.map(id => state.towers[id]).filter(Boolean);
      if (towers.length === 0) return;

      let totalRepairCost = 0;
      let totalRestockCost = 0;
      let totalSellValue = 0;

      for (const t of towers) {
        const stats = TOWER_STATS[t.type];
        // Repair cost
        if (t.health < t.maxHealth) {
          const damageRatio = 1 - t.health / t.maxHealth;
          totalRepairCost += Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
        }
        // Restock cost
        if (t.ammo < t.maxAmmo) {
          totalRestockCost += Math.round((t.maxAmmo - t.ammo) * stats.ammoCostPerRound);
        }
        // Sell value
        let invested = stats.cost;
        for (let lvl = 1; lvl < t.level; lvl++) {
          invested += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
        }
        totalSellValue += Math.round(invested * SELL_REFUND_RATIO);
      }

      const panelH = 68;
      const panelX = 10;
      const panelY = GRID.HEIGHT * cs - panelH - 10;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(panelX, panelY, 240, panelH);

      ctx.fillStyle = VISUAL.FG_COLOR;
      ctx.font = `13px ${VISUAL.FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      ctx.fillText(`${towers.length} towers selected`, panelX + 8, panelY + 6);
      ctx.fillText(`Sell value: ${totalSellValue}c`, panelX + 8, panelY + 22);
      if (totalRepairCost > 0) {
        ctx.fillStyle = '#FBBF24';
        ctx.fillText(`Total repair: ${totalRepairCost}c`, panelX + 8, panelY + 38);
      }
      if (totalRestockCost > 0) {
        ctx.fillStyle = '#60A5FA';
        ctx.fillText(`Total restock: ${totalRestockCost}c`, panelX + 8, panelY + 54);
      }
    }
  }

  // --- Chart widget (below ammo/wave bars) ---

  private drawChartWidget(): void {
    const charts = this.gameClient.chartsOverlay;
    if (!charts.isVisible()) return;

    const side = this.gameClient.getPlayerSide();
    const cs = GRID.CELL_SIZE;
    const W = GRID.WIDTH * cs;
    // Same X as ammo/wave bars
    const x = side === PlayerSide.RIGHT ? W - 160 - 12 : 12;
    // Below wave progress bar (barY=28 + barH=8 + label~12 + gap=4 = 52)
    const y = 52;

    charts.draw(this.ctx, x, y);
  }

  // --- Error message ---

  private drawError(): void {
    const err = this.gameClient.clientState.errorMessage;
    if (!err) return;

    const ctx = this.ctx;
    const W = GRID.WIDTH * GRID.CELL_SIZE;

    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.font = `14px ${VISUAL.FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(err, W / 2, GRID.HEIGHT * GRID.CELL_SIZE - 60);
  }

  // --- Utility ---

  private drawCenteredText(text: string, x: number, y: number, size: number): void {
    this.ctx.fillStyle = VISUAL.FG_COLOR;
    this.ctx.font = `${size}px ${VISUAL.FONT}`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x, y);
  }
}
