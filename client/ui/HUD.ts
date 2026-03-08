import { GamePhase, GameMode, GameState, TowerType, PlayerSide } from '../../shared/types/game.types.js';
import { TOWER_STATS, SELL_REFUND_RATIO, PRICE_ESCALATION } from '../../shared/types/constants.js';
import { TOWER_CHARS, TOWER_LABELS } from '../rendering/AsciiArt.js';
import { GameClient } from '../game/GameClient.js';
import { PostGameOverlay } from './PostGameOverlay.js';
const TOWER_TYPES = [TowerType.BASIC, TowerType.SNIPER, TowerType.SPLASH, TowerType.SLOW, TowerType.WALL, TowerType.AA];

function span(text: string, style?: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  if (style) el.style.cssText = style;
  return el;
}

function clearChildren(el: HTMLElement): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export class HUD {
  private hudLeft: HTMLElement;
  private hudCenter: HTMLElement;
  private hudRight: HTMLElement;
  private towerBar: HTMLElement;
  private overlay: HTMLElement;
  private overlayContent: HTMLElement;
  private buttonsCreated = false;
  private postGameOverlay: PostGameOverlay;
  private drawerOpen = false;
  private brushDrawerOpen = false;
  private brushMode: 'repair' | 'upgrade' | 'sell' = 'repair';

  constructor(private gameClient: GameClient) {
    this.postGameOverlay = new PostGameOverlay(gameClient);
    this.hudLeft = document.getElementById('hud-left')!;
    this.hudCenter = document.getElementById('hud-center')!;
    this.hudRight = document.getElementById('hud-right')!;
    this.towerBar = document.getElementById('tower-bar')!;
    this.overlay = document.getElementById('overlay')!;
    this.overlayContent = document.getElementById('overlay-content')!;
  }

  update(): void {
    const state = this.gameClient.getState();

    if (!state) {
      this.showOverlay('Waiting for server...');
      return;
    }

    if (state.phase === GamePhase.WAITING) {
      if (state.gameMode === GameMode.SINGLE) {
        this.showOverlay('Starting game...');
      } else {
        this.showLobby(state.startingCredits);
      }
      return;
    }

    if (state.phase === GamePhase.GAME_OVER) {
      if (this.postGameOverlay) {
        this.postGameOverlay.update(state);
      }
      return;
    }

    this.hideOverlay();
    this.updateHUD(state);
    this.updateTowerBar(state);
  }

  private updateHUD(state: GameState): void {
    const credits = this.gameClient.getMyCredits();
    const oppCredits = this.gameClient.getOpponentCredits();
    const side = this.gameClient.getPlayerSide();

    const myHp = this.gameClient.getMyHealth();
    const hpColor = myHp.current > myHp.max * 0.5 ? 'color:#4ADE80' : myHp.current > myHp.max * 0.25 ? 'color:#FBBF24' : 'color:#EF4444';

    // Place each player's info on their own side of the screen
    const myPanel = side === PlayerSide.RIGHT ? this.hudRight : this.hudLeft;
    const oppPanel = side === PlayerSide.RIGHT ? this.hudLeft : this.hudRight;

    clearChildren(this.hudLeft);
    clearChildren(this.hudRight);

    // My info on my side
    myPanel.appendChild(span(side === PlayerSide.LEFT ? '< You' : 'You >'));
    myPanel.appendChild(span(`${Math.ceil(myHp.current).toLocaleString()}HP`, hpColor));
    myPanel.appendChild(span(`${Math.floor(credits).toLocaleString()}c`, credits > 0 ? 'color:#4ADE80' : 'color:#EF4444'));

    // Opponent info on their side (multiplayer only)
    if (state.gameMode !== GameMode.SINGLE) {
      const oppHp = this.gameClient.getOpponentHealth();
      const oppSide = side === PlayerSide.LEFT ? '>' : '<';
      oppPanel.appendChild(span(`${oppSide} Opp`, 'opacity:0.6'));
      oppPanel.appendChild(span(`${Math.ceil(oppHp.current).toLocaleString()}HP`, 'opacity:0.6'));
      oppPanel.appendChild(span(`${Math.floor(oppCredits).toLocaleString()}c`, 'opacity:0.6'));
    }

    clearChildren(this.hudCenter);
    if (state.phase === GamePhase.BUILD) {
      const players = Object.values(state.players);
      const readyCount = players.filter(p => p.isReady).length;
      this.hudCenter.appendChild(span(`WAVE ${state.waveNumber}  BUILD  ${readyCount}/${players.length} ready`, 'font-weight:500'));
    } else {
      const waveText = `WAVE ${state.waveNumber}`;
      this.hudCenter.appendChild(span(waveText, 'font-weight:500'));
      if (state.gameSpeed > 1) {
        this.hudCenter.appendChild(span(` [${state.gameSpeed}x]`, 'color:#FBBF24;font-weight:500'));
      }
    }
    // Air wave warning
    if (state.airWaveCountdown === 0) {
      this.hudCenter.appendChild(span('  ✈ AIR WAVE', 'color:#EF4444;font-weight:700'));
    } else if (state.airWaveCountdown > 0) {
      this.hudCenter.appendChild(span(`  ✈ Air in ${state.airWaveCountdown}`, 'color:#FBBF24;font-weight:500'));
    }
  }

  private toggleDrawer(): void {
    this.closeBrushDrawer(); // close brush if open
    this.drawerOpen = !this.drawerOpen;
    this.applyDrawerVisibility();
  }

  private closeDrawer(): void {
    if (!this.drawerOpen) return;
    this.drawerOpen = false;
    this.applyDrawerVisibility();
  }

  private toggleBrushDrawer(): void {
    this.closeDrawer(); // close towers if open
    this.brushDrawerOpen = !this.brushDrawerOpen;
    this.applyDrawerVisibility();
  }

  private closeBrushDrawer(): void {
    if (!this.brushDrawerOpen) return;
    this.brushDrawerOpen = false;
    this.applyDrawerVisibility();
  }

  private applyDrawerVisibility(): void {
    const mainRow = document.getElementById('tower-main-row');
    const towerDrawer = document.getElementById('tower-drawer-panel');
    const brushDrawer = document.getElementById('brush-drawer-panel');
    const anyOpen = this.drawerOpen || this.brushDrawerOpen;
    if (mainRow) mainRow.style.display = anyOpen ? 'none' : '';
    if (towerDrawer) towerDrawer.style.display = this.drawerOpen ? '' : 'none';
    if (brushDrawer) brushDrawer.style.display = this.brushDrawerOpen ? '' : 'none';
  }

  private updateTowerBar(state: GameState): void {
    if (!this.buttonsCreated) {
      this.createTowerButtons();
      this.buttonsCreated = true;
    }

    const credits = this.gameClient.getMyCredits();
    const isBuild = state.phase === GamePhase.BUILD;
    const isBuildOrCombat = state.phase === GamePhase.BUILD || state.phase === GamePhase.COMBAT;
    const selected = this.gameClient.clientState.selectedTowerType;
    const activeTool = this.gameClient.clientState.activeTool;
    const playerId = this.gameClient.getPlayerId();

    // Update drawer toggle buttons
    const drawerToggle = document.getElementById('tower-drawer-toggle');
    if (drawerToggle) {
      if (drawerToggle.textContent !== 'Towers') drawerToggle.textContent = 'Towers';
      drawerToggle.classList.toggle('drawer-open', this.drawerOpen);
    }
    const brushToggle = document.getElementById('brush-drawer-toggle');
    if (brushToggle) {
      const brushActive = activeTool === 'brush';
      const brushLabel = brushActive ? `Brush: ${this.brushMode.charAt(0).toUpperCase() + this.brushMode.slice(1)}` : 'Brush';
      if (brushToggle.textContent !== brushLabel) brushToggle.textContent = brushLabel;
      brushToggle.classList.toggle('drawer-open', this.brushDrawerOpen);
      brushToggle.classList.toggle('selected', brushActive && !this.brushDrawerOpen);
    }

    // Update tower placement button states (inside drawer)
    for (const type of TOWER_TYPES) {
      const btn = document.getElementById(`tower-btn-${type}`) as HTMLElement;
      if (!btn) continue;

      const dynamicCost = this.gameClient.getDynamicPrice(type);
      const canAfford = credits >= dynamicCost;

      const costEl = btn.querySelector('.cost');
      if (costEl) costEl.textContent = `${dynamicCost.toLocaleString()}c`;

      // Show escalation % for non-BASIC/WALL towers
      const escEl = btn.querySelector('.escalation') as HTMLElement;
      if (escEl) {
        if (type !== TowerType.BASIC && type !== TowerType.WALL && state.globalPurchaseCounts[type]) {
          const count = state.globalPurchaseCounts[type];
          escEl.textContent = `+${Math.round(count * PRICE_ESCALATION * 100)}%`;
          escEl.style.display = '';
        } else {
          escEl.style.display = 'none';
        }
      }

      btn.classList.toggle('selected', activeTool === 'place' && selected === type);
      btn.classList.toggle('disabled', !isBuild || !canAfford);
    }

    // Brush tool buttons — highlight active mode
    const brushRepairBtn = document.getElementById('brush-repair-btn');
    const brushUpgradeBtn = document.getElementById('brush-upgrade-btn');
    const brushSellBtn = document.getElementById('brush-sell-btn');
    if (brushRepairBtn) {
      brushRepairBtn.classList.toggle('selected', activeTool === 'brush' && this.brushMode === 'repair');
    }
    if (brushUpgradeBtn) {
      brushUpgradeBtn.classList.toggle('selected', activeTool === 'brush' && this.brushMode === 'upgrade');
    }
    if (brushSellBtn) {
      brushSellBtn.classList.toggle('selected', activeTool === 'brush' && this.brushMode === 'sell');
    }

    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) {
      readyBtn.classList.toggle('disabled', !isBuild);
    }

    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
      saveBtn.style.display = (isBuild && state.gameMode === GameMode.SINGLE) ? '' : 'none';
    }

    // Auto R&R button
    const autoRepairBtn = document.getElementById('auto-repair-btn');
    if (autoRepairBtn) {
      if (isBuildOrCombat) {
        autoRepairBtn.style.display = '';
        const enabled = this.gameClient.isAutoRepairEnabled();
        const newText = enabled ? 'Auto Fix: ON' : 'Auto Fix: OFF';
        if (autoRepairBtn.textContent !== newText) autoRepairBtn.textContent = newText;
        autoRepairBtn.classList.toggle('selected', enabled);
      } else {
        autoRepairBtn.style.display = 'none';
      }
    }

    // Auto-Rebuild button
    const autoRebuildBtn = document.getElementById('auto-rebuild-btn');
    if (autoRebuildBtn) {
      if (isBuildOrCombat) {
        autoRebuildBtn.style.display = '';
        const isAutoRebuild = state.players[playerId!]?.autoRebuildEnabled ?? false;
        const newText = isAutoRebuild ? 'Rebuild: ON' : 'Rebuild: OFF';
        if (autoRebuildBtn.textContent !== newText) autoRebuildBtn.textContent = newText;
        autoRebuildBtn.classList.toggle('selected', isAutoRebuild);
      } else {
        autoRebuildBtn.style.display = 'none';
      }
    }

    // Speed Mode button (Normal / Fast / Turbo)
    const fastModeBtn = document.getElementById('fast-mode-btn');
    if (fastModeBtn) {
      const mySpeed = this.gameClient.getRequestedSpeed();
      const activeSpeed = this.gameClient.getGameSpeed();
      let newText: string;
      if (state.gameMode === GameMode.SINGLE) {
        if (activeSpeed >= 4) newText = 'Turbo [>>>]';
        else if (activeSpeed >= 2) newText = 'Fast [>>]';
        else newText = 'Normal [>]';
      } else {
        const players = Object.values(state.players);
        const total = players.length;
        if (activeSpeed >= 4) {
          newText = `Turbo (${players.filter(p => p.requestedSpeed >= 4).length}/${total})`;
        } else if (activeSpeed >= 2) {
          newText = `Fast (${players.filter(p => p.requestedSpeed >= 2).length}/${total})`;
        } else {
          const wanting = players.filter(p => p.requestedSpeed >= 2).length;
          newText = wanting > 0 ? `Speed (${wanting}/${total})` : 'Normal [>]';
        }
      }
      if (fastModeBtn.textContent !== newText) fastModeBtn.textContent = newText;
      fastModeBtn.classList.toggle('selected', mySpeed > 1);
    }

    // Selected tower actions — show/hide context group as a whole
    const selectedIds = this.gameClient.clientState.selectedTowerIds;
    const contextGroup = document.getElementById('context-group');
    const upgradeBtn = document.getElementById('upgrade-btn');
    const sellBtn = document.getElementById('sell-btn');
    const repairBtn = document.getElementById('repair-btn');

    if (selectedIds.length === 1) {
      // Single tower selected
      const towerId = selectedIds[0];
      const tower = state.towers[towerId];

      if (upgradeBtn && sellBtn && contextGroup) {
        if (tower && isBuild) {
          contextGroup.style.display = '';
          const upgCost = this.gameClient.getUpgradeCost(towerId);
          upgradeBtn.textContent = upgCost !== null ? `Upgrade ${upgCost.toLocaleString()}c` : 'Upgrade';
          // Show refund amount
          const stats = TOWER_STATS[tower.type];
          let invested = stats.cost;
          for (let lvl = 1; lvl < tower.level; lvl++) invested += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
          const isSamePhase = tower.placedWave === state.waveNumber;
          const refund = isSamePhase ? invested : Math.round(invested * SELL_REFUND_RATIO);
          sellBtn.textContent = `Sell ${refund.toLocaleString()}c`;
        } else {
          contextGroup.style.display = 'none';
        }
      }

      if (repairBtn) {
        if (tower && isBuildOrCombat) {
          const repairCost = this.gameClient.getRepairCost(towerId);
          if (repairCost !== null && repairCost > 0) {
            repairBtn.style.display = '';
            repairBtn.textContent = `Repair ${repairCost.toLocaleString()}c`;
          } else {
            repairBtn.style.display = 'none';
          }
        } else {
          repairBtn.style.display = 'none';
        }
      }

    } else if (selectedIds.length > 1) {
      // Multi-select: show bulk action buttons
      const towers = selectedIds.map(id => state.towers[id]).filter(Boolean);

      if (upgradeBtn && contextGroup) {
        if (isBuild && towers.length > 0) {
          contextGroup.style.display = '';
          let totalUpgCost = 0;
          for (const t of towers) {
            const c = this.gameClient.getUpgradeCost(t.id);
            if (c !== null) totalUpgCost += c;
          }
          upgradeBtn.textContent = `Upgrade All ${totalUpgCost.toLocaleString()}c`;
        } else {
          contextGroup.style.display = 'none';
        }
      }

      if (sellBtn) {
        if (isBuild && towers.length > 0) {
          let totalSell = 0;
          for (const t of towers) {
            const stats = TOWER_STATS[t.type];
            let invested = stats.cost;
            for (let lvl = 1; lvl < t.level; lvl++) invested += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
            const isSamePhase = t.placedWave === state.waveNumber;
            totalSell += isSamePhase ? invested : Math.round(invested * SELL_REFUND_RATIO);
          }
          sellBtn.textContent = `Sell All ${totalSell.toLocaleString()}c`;
        }
      }

      if (repairBtn) {
        let totalRepair = 0;
        for (const id of selectedIds) {
          const cost = this.gameClient.getRepairCost(id);
          if (cost !== null && cost > 0) totalRepair += cost;
        }
        if (totalRepair > 0 && isBuildOrCombat) {
          repairBtn.style.display = '';
          repairBtn.textContent = `Repair All ${totalRepair.toLocaleString()}c`;
        } else {
          repairBtn.style.display = 'none';
        }
      }

    } else {
      // No tower selected — hide entire context group
      if (contextGroup) contextGroup.style.display = 'none';
      if (repairBtn) repairBtn.style.display = 'none';
    }
  }

  private createTowerButtons(): void {
    clearChildren(this.towerBar);

    // === Main row: visible when drawer is closed ===
    const mainRow = document.createElement('div');
    mainRow.id = 'tower-main-row';
    mainRow.className = 'tower-row';

    // --- Group 1: Tools (drawers) ---
    const toolsGroup = document.createElement('div');
    toolsGroup.className = 'bar-group';

    const drawerToggle = document.createElement('button');
    drawerToggle.id = 'tower-drawer-toggle';
    drawerToggle.className = 'action-btn drawer-toggle';
    drawerToggle.textContent = 'Towers';
    drawerToggle.addEventListener('click', () => this.toggleDrawer());
    toolsGroup.appendChild(drawerToggle);

    const brushToggle = document.createElement('button');
    brushToggle.id = 'brush-drawer-toggle';
    brushToggle.className = 'action-btn drawer-toggle';
    brushToggle.textContent = 'Brush';
    brushToggle.addEventListener('click', () => this.toggleBrushDrawer());
    toolsGroup.appendChild(brushToggle);

    mainRow.appendChild(toolsGroup);

    // --- Group 2: Context actions (Upgrade, Sell, Repair) — conditional ---
    const contextGroup = document.createElement('div');
    contextGroup.id = 'context-group';
    contextGroup.className = 'bar-group';
    contextGroup.style.display = 'none';

    const upgradeBtn = document.createElement('button');
    upgradeBtn.id = 'upgrade-btn';
    upgradeBtn.className = 'action-btn';
    upgradeBtn.textContent = 'Upgrade';
    upgradeBtn.addEventListener('click', () => {
      for (const id of this.gameClient.clientState.selectedTowerIds) {
        this.gameClient.upgradeTower(id);
      }
    });
    contextGroup.appendChild(upgradeBtn);

    const sellBtn = document.createElement('button');
    sellBtn.id = 'sell-btn';
    sellBtn.className = 'action-btn';
    sellBtn.textContent = 'Sell';
    sellBtn.addEventListener('click', () => {
      for (const id of this.gameClient.clientState.selectedTowerIds) {
        this.gameClient.sellTower(id);
      }
      this.gameClient.clientState.selectedTowerIds = [];
      this.gameClient.clientState.selectedTowerType = TowerType.BASIC;
    });
    contextGroup.appendChild(sellBtn);

    const repairBtn = document.createElement('button');
    repairBtn.id = 'repair-btn';
    repairBtn.className = 'action-btn';
    repairBtn.textContent = 'Repair';
    repairBtn.style.display = 'none';
    repairBtn.addEventListener('click', () => {
      for (const id of this.gameClient.clientState.selectedTowerIds) {
        this.gameClient.repairTower(id);
      }
    });
    contextGroup.appendChild(repairBtn);

    mainRow.appendChild(contextGroup);

    // --- Group 3: Toggles (Auto Fix, Rebuild, Speed) ---
    const togglesGroup = document.createElement('div');
    togglesGroup.className = 'bar-group';

    const autoRepairBtn = document.createElement('button');
    autoRepairBtn.id = 'auto-repair-btn';
    autoRepairBtn.className = 'action-btn compact-btn fixed-width-btn';
    autoRepairBtn.textContent = 'Auto Fix: OFF';
    autoRepairBtn.style.display = 'none';
    autoRepairBtn.addEventListener('click', () => this.gameClient.toggleAutoRepair());
    togglesGroup.appendChild(autoRepairBtn);

    const autoRebuildBtn = document.createElement('button');
    autoRebuildBtn.id = 'auto-rebuild-btn';
    autoRebuildBtn.className = 'action-btn compact-btn fixed-width-btn';
    autoRebuildBtn.textContent = 'Rebuild: OFF';
    autoRebuildBtn.style.display = 'none';
    autoRebuildBtn.addEventListener('click', () => this.gameClient.toggleAutoRebuild());
    togglesGroup.appendChild(autoRebuildBtn);

    const fastModeBtn = document.createElement('button');
    fastModeBtn.id = 'fast-mode-btn';
    fastModeBtn.className = 'action-btn compact-btn fixed-width-btn';
    fastModeBtn.textContent = 'Normal [>]';
    fastModeBtn.addEventListener('click', () => this.gameClient.toggleFastMode());
    togglesGroup.appendChild(fastModeBtn);

    mainRow.appendChild(togglesGroup);

    this.towerBar.appendChild(mainRow);

    // === Drawer panel: visible when drawer is open ===
    const drawerPanel = document.createElement('div');
    drawerPanel.id = 'tower-drawer-panel';
    drawerPanel.className = 'tower-row';
    drawerPanel.style.display = 'none';

    for (const type of TOWER_TYPES) {
      const stats = TOWER_STATS[type];
      const btn = document.createElement('button');
      btn.id = `tower-btn-${type}`;
      btn.className = 'tower-btn';

      const art = document.createElement('span');
      art.className = 'art';
      art.textContent = TOWER_CHARS[type];

      const label = document.createElement('span');
      label.textContent = TOWER_LABELS[type];

      const cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = `${stats.cost.toLocaleString()}c`;

      const escalation = document.createElement('span');
      escalation.className = 'escalation';
      escalation.style.display = 'none';

      btn.appendChild(art);
      btn.appendChild(label);
      btn.appendChild(cost);
      btn.appendChild(escalation);

      // Tooltip with tower stats
      if (type === TowerType.AA) {
        btn.title = `AA — ${stats.damage} ground / ${stats.damage * 3} air dmg\nRange: ${stats.range} | Rate: ${stats.fireRate}/s\nAmmo: ${stats.maxAmmo}`;
      } else if (type === TowerType.WALL) {
        btn.title = `Wall — HP: ${stats.maxHealth}\nBlocks enemy paths`;
      } else {
        btn.title = `${TOWER_LABELS[type]} — ${stats.damage} dmg\nRange: ${stats.range} | Rate: ${stats.fireRate}/s\nAmmo: ${stats.maxAmmo}`;
      }

      btn.addEventListener('click', () => {
        this.gameClient.selectTowerType(type);
      });

      drawerPanel.appendChild(btn);
    }

    // Close tower drawer button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'action-btn drawer-close-btn';
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => this.closeDrawer());
    drawerPanel.appendChild(closeBtn);

    this.towerBar.appendChild(drawerPanel);

    // === Brush drawer panel: visible when brush drawer is open ===
    const brushDrawer = document.createElement('div');
    brushDrawer.id = 'brush-drawer-panel';
    brushDrawer.className = 'tower-row';
    brushDrawer.style.display = 'none';

    const brushModes: Array<{ id: string; art: string; label: string; desc: string; mode: 'repair' | 'upgrade' | 'sell' }> = [
      { id: 'brush-repair-btn', art: '+', label: 'Fix', desc: 'Repair + restock towers in area', mode: 'repair' },
      { id: 'brush-upgrade-btn', art: '\u2191', label: 'Upgrade', desc: 'Upgrade towers in area', mode: 'upgrade' },
      { id: 'brush-sell-btn', art: '$', label: 'Sell', desc: 'Sell towers in area', mode: 'sell' },
    ];
    for (const bm of brushModes) {
      const btn = document.createElement('button');
      btn.id = bm.id;
      btn.className = 'tower-btn';
      const art = document.createElement('span');
      art.className = 'art';
      art.textContent = bm.art;
      const label = document.createElement('span');
      label.textContent = bm.label;
      btn.appendChild(art);
      btn.appendChild(label);
      btn.title = bm.desc;
      btn.addEventListener('click', () => {
        const cs = this.gameClient.clientState;
        this.brushMode = bm.mode;
        cs.brushMode = bm.mode;
        cs.activeTool = 'brush';
        cs.selectedTowerIds = [];
        cs.selectedTowerType = null;
        this.closeBrushDrawer();
      });
      brushDrawer.appendChild(btn);
    }

    // Close brush drawer button
    const brushCloseBtn = document.createElement('button');
    brushCloseBtn.className = 'action-btn drawer-close-btn';
    brushCloseBtn.textContent = '\u00d7';
    brushCloseBtn.addEventListener('click', () => this.closeBrushDrawer());
    brushDrawer.appendChild(brushCloseBtn);

    this.towerBar.appendChild(brushDrawer);

    // === Persistent right group: always visible regardless of drawer state ===
    const rightGroup = document.createElement('div');
    rightGroup.id = 'tower-persistent-right';
    rightGroup.className = 'bar-group no-divider tower-group-right';

    const saveBtn = document.createElement('button');
    saveBtn.id = 'save-btn';
    saveBtn.className = 'action-btn';
    saveBtn.textContent = 'Save';
    saveBtn.style.display = 'none';
    saveBtn.addEventListener('click', async () => {
      const name = prompt('Save name (leave blank for default):');
      const success = await this.gameClient.saveGame(name || undefined);
      saveBtn.textContent = success ? 'Saved!' : 'Failed';
      setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
    });
    rightGroup.appendChild(saveBtn);

    const readyBtn = document.createElement('button');
    readyBtn.id = 'ready-btn';
    readyBtn.className = 'action-btn ready-btn';
    readyBtn.textContent = 'Ready';
    readyBtn.addEventListener('click', () => this.gameClient.readyForWave());
    rightGroup.appendChild(readyBtn);

    const statsBtn = document.createElement('button');
    statsBtn.id = 'stats-btn';
    statsBtn.className = 'action-btn';
    statsBtn.textContent = 'Stats';
    statsBtn.addEventListener('click', () => this.gameClient.chartsOverlay.toggle());
    rightGroup.appendChild(statsBtn);

    this.towerBar.appendChild(rightGroup);
  }

  private showLobby(currentCredits: number): void {
    this.overlay.classList.remove('hidden');

    if (!document.getElementById('credits-input')) {
      clearChildren(this.overlayContent);

      const title = document.createElement('div');
      title.className = 'big';
      title.textContent = 'Waiting for opponent...';
      this.overlayContent.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.textContent = 'Share this URL with a friend on the same network';
      this.overlayContent.appendChild(subtitle);

      const box = document.createElement('div');
      box.style.cssText = 'margin-top:24px;padding:16px 24px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;display:inline-flex;align-items:center;gap:12px';

      const label = document.createElement('label');
      label.textContent = 'Starting credits:';
      label.style.cssText = 'font-size:16px';

      const input = document.createElement('input');
      input.id = 'credits-input';
      input.type = 'number';
      input.min = '50';
      input.max = '10000';
      input.step = '50';
      input.value = String(currentCredits);
      input.style.cssText = 'width:90px;padding:6px 10px;font-family:inherit;font-size:16px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:6px;text-align:center';

      input.addEventListener('change', () => {
        const val = Math.max(50, Math.min(10000, Math.round(Number(input.value) / 50) * 50));
        input.value = String(val);
        this.gameClient.setStartingCredits(val);
      });

      box.appendChild(label);
      box.appendChild(input);
      this.overlayContent.appendChild(box);
    } else {
      const input = document.getElementById('credits-input') as HTMLInputElement;
      if (input && document.activeElement !== input) {
        input.value = String(currentCredits);
      }
    }
  }

  private showOverlay(text: string): void {
    this.overlay.classList.remove('hidden');
    clearChildren(this.overlayContent);

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const div = document.createElement('div');
      div.textContent = lines[i];
      if (i === 0) div.className = 'big';
      this.overlayContent.appendChild(div);
    }
  }

  private hideOverlay(): void {
    this.overlay.classList.add('hidden');
  }
}
