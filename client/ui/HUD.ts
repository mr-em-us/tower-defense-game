import { GamePhase, GameMode, TowerType, PlayerSide } from '../../shared/types/game.types.js';
import { TOWER_STATS, SELL_REFUND_RATIO } from '../../shared/types/constants.js';
import { TOWER_CHARS, TOWER_LABELS } from '../rendering/AsciiArt.js';
import { GameClient } from '../game/GameClient.js';

const TOWER_TYPES = [TowerType.BASIC, TowerType.SNIPER, TowerType.SPLASH, TowerType.SLOW];

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

  constructor(private gameClient: GameClient) {
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
      const myHp = this.gameClient.getMyHealth();
      if (state.gameMode === GameMode.SINGLE) {
        this.showOverlay(
          `GAME OVER\n` +
          `Survived to wave ${state.waveNumber} | HP: ${Math.ceil(myHp.current)}/${myHp.max}\n` +
          'Refresh to play again',
        );
      } else {
        const oppHp = this.gameClient.getOpponentHealth();
        const won = myHp.current > 0 && oppHp.current <= 0;
        this.showOverlay(
          `${won ? 'VICTORY!' : 'DEFEAT'}\n` +
          `Wave ${state.waveNumber} | Your HP: ${Math.ceil(myHp.current)} | Opponent HP: ${Math.ceil(oppHp.current)}\n` +
          'Refresh to play again',
        );
      }
      return;
    }

    this.hideOverlay();
    this.updateHUD(state);
    this.updateTowerBar(state);
  }

  private updateHUD(state: import('../../shared/types/game.types.js').GameState): void {
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
    myPanel.appendChild(span(`${Math.ceil(myHp.current)}HP`, hpColor));
    myPanel.appendChild(span(`${Math.floor(credits)}c`, credits > 0 ? 'color:#4ADE80' : 'color:#EF4444'));

    // Opponent info on their side (multiplayer only)
    if (state.gameMode !== GameMode.SINGLE) {
      const oppHp = this.gameClient.getOpponentHealth();
      const oppSide = side === PlayerSide.LEFT ? '>' : '<';
      oppPanel.appendChild(span(`${oppSide} Opp`, 'opacity:0.6'));
      oppPanel.appendChild(span(`${Math.ceil(oppHp.current)}HP`, 'opacity:0.6'));
      oppPanel.appendChild(span(`${Math.floor(oppCredits)}c`, 'opacity:0.6'));
    }

    clearChildren(this.hudCenter);
    if (state.phase === GamePhase.BUILD) {
      const players = Object.values(state.players);
      const readyCount = players.filter(p => p.isReady).length;
      this.hudCenter.appendChild(span(`BUILD  ${readyCount}/${players.length} ready`, 'font-weight:500'));
    } else {
      this.hudCenter.appendChild(span(`WAVE ${state.waveNumber}`, 'font-weight:500'));
    }
  }

  private updateTowerBar(state: import('../../shared/types/game.types.js').GameState): void {
    if (!this.buttonsCreated) {
      this.createTowerButtons();
      this.buttonsCreated = true;
    }

    const credits = this.gameClient.getMyCredits();
    const isBuild = state.phase === GamePhase.BUILD;
    const isBuildOrCombat = state.phase === GamePhase.BUILD || state.phase === GamePhase.COMBAT;
    const selected = this.gameClient.clientState.selectedTowerType;
    const activeTool = this.gameClient.clientState.activeTool;

    // Update tower placement button states
    for (const type of TOWER_TYPES) {
      const btn = document.getElementById(`tower-btn-${type}`) as HTMLElement;
      if (!btn) continue;

      const dynamicCost = this.gameClient.getDynamicPrice(type);
      const canAfford = credits >= dynamicCost;

      const costEl = btn.querySelector('.cost');
      if (costEl) costEl.textContent = `${dynamicCost}c`;

      btn.classList.toggle('selected', activeTool === 'place' && selected === type);
      btn.classList.toggle('disabled', !isBuild || !canAfford);
    }

    // Brush tool button
    const brushBtn = document.getElementById('brush-btn');
    if (brushBtn) {
      brushBtn.classList.toggle('selected', activeTool === 'brush');
    }

    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) readyBtn.style.display = isBuild ? '' : 'none';

    // Restock All button — visible when any tower needs ammo
    const restockAllBtn = document.getElementById('restock-all-btn');
    if (restockAllBtn) {
      let totalRestockCost = 0;
      const playerId = this.gameClient.getPlayerId();
      for (const tower of Object.values(state.towers)) {
        if (tower.ownerId !== playerId || tower.ammo >= tower.maxAmmo) continue;
        const stats = TOWER_STATS[tower.type];
        totalRestockCost += Math.round((tower.maxAmmo - tower.ammo) * stats.ammoCostPerRound);
      }
      if (totalRestockCost > 0 && isBuildOrCombat) {
        restockAllBtn.style.display = '';
        restockAllBtn.textContent = `Restock All (${totalRestockCost}c)`;
      } else {
        restockAllBtn.style.display = 'none';
      }
    }

    // Selected tower actions
    const selectedIds = this.gameClient.clientState.selectedTowerIds;
    const upgradeBtn = document.getElementById('upgrade-btn');
    const sellBtn = document.getElementById('sell-btn');
    const repairBtn = document.getElementById('repair-btn');
    const restockBtn = document.getElementById('restock-btn');

    if (selectedIds.length === 1) {
      // Single tower selected
      const towerId = selectedIds[0];
      const tower = state.towers[towerId];

      if (upgradeBtn && sellBtn) {
        if (tower && isBuild) {
          upgradeBtn.style.display = '';
          upgradeBtn.textContent = 'Upgrade';
          sellBtn.style.display = '';
          sellBtn.textContent = 'Sell';
        } else {
          upgradeBtn.style.display = 'none';
          sellBtn.style.display = 'none';
        }
      }

      if (repairBtn) {
        if (tower && isBuildOrCombat) {
          const repairCost = this.gameClient.getRepairCost(towerId);
          if (repairCost !== null && repairCost > 0) {
            repairBtn.style.display = '';
            repairBtn.textContent = `Repair (${repairCost}c)`;
          } else {
            repairBtn.style.display = 'none';
          }
        } else {
          repairBtn.style.display = 'none';
        }
      }

      if (restockBtn) {
        if (tower && isBuildOrCombat) {
          const restockCost = this.gameClient.getRestockCost(towerId);
          if (restockCost !== null && restockCost > 0) {
            restockBtn.style.display = '';
            restockBtn.textContent = `Restock (${restockCost}c)`;
          } else {
            restockBtn.style.display = 'none';
          }
        } else {
          restockBtn.style.display = 'none';
        }
      }
    } else if (selectedIds.length > 1) {
      // Multi-select: show bulk action buttons
      const towers = selectedIds.map(id => state.towers[id]).filter(Boolean);

      if (upgradeBtn) {
        if (isBuild && towers.length > 0) {
          upgradeBtn.style.display = '';
          upgradeBtn.textContent = `Upgrade All (${towers.length})`;
        } else {
          upgradeBtn.style.display = 'none';
        }
      }

      if (sellBtn) {
        if (isBuild && towers.length > 0) {
          let totalSell = 0;
          for (const t of towers) {
            const stats = TOWER_STATS[t.type];
            let invested = stats.cost;
            for (let lvl = 1; lvl < t.level; lvl++) invested += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
            totalSell += Math.round(invested * SELL_REFUND_RATIO);
          }
          sellBtn.style.display = '';
          sellBtn.textContent = `Sell All (${totalSell}c)`;
        } else {
          sellBtn.style.display = 'none';
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
          repairBtn.textContent = `Repair All (${totalRepair}c)`;
        } else {
          repairBtn.style.display = 'none';
        }
      }

      if (restockBtn) {
        let totalRestock = 0;
        for (const id of selectedIds) {
          const cost = this.gameClient.getRestockCost(id);
          if (cost !== null && cost > 0) totalRestock += cost;
        }
        if (totalRestock > 0 && isBuildOrCombat) {
          restockBtn.style.display = '';
          restockBtn.textContent = `Restock All (${totalRestock}c)`;
        } else {
          restockBtn.style.display = 'none';
        }
      }
    } else {
      // No tower selected
      if (upgradeBtn) upgradeBtn.style.display = 'none';
      if (sellBtn) sellBtn.style.display = 'none';
      if (repairBtn) repairBtn.style.display = 'none';
      if (restockBtn) restockBtn.style.display = 'none';
    }
  }

  private createTowerButtons(): void {
    clearChildren(this.towerBar);

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
      cost.textContent = `${stats.cost}c`;

      btn.appendChild(art);
      btn.appendChild(label);
      btn.appendChild(cost);

      btn.addEventListener('click', () => {
        this.gameClient.selectTowerType(type);
      });

      this.towerBar.appendChild(btn);
    }

    // Brush tool button
    const brushBtn = document.createElement('button');
    brushBtn.id = 'brush-btn';
    brushBtn.className = 'tower-btn';
    const brushArt = document.createElement('span');
    brushArt.className = 'art';
    brushArt.textContent = '+';
    const brushLabel = document.createElement('span');
    brushLabel.textContent = 'Brush';
    brushBtn.appendChild(brushArt);
    brushBtn.appendChild(brushLabel);
    brushBtn.addEventListener('click', () => {
      const cs = this.gameClient.clientState;
      if (cs.activeTool === 'brush') {
        cs.activeTool = 'place';
      } else {
        cs.activeTool = 'brush';
        cs.selectedTowerIds = [];
        cs.selectedTowerType = null;
      }
    });
    this.towerBar.appendChild(brushBtn);

    // Ready button
    const readyBtn = document.createElement('button');
    readyBtn.id = 'ready-btn';
    readyBtn.className = 'action-btn ready-btn';
    readyBtn.textContent = 'Ready';
    readyBtn.addEventListener('click', () => this.gameClient.readyForWave());
    this.towerBar.appendChild(readyBtn);

    // Restock All button
    const restockAllBtn = document.createElement('button');
    restockAllBtn.id = 'restock-all-btn';
    restockAllBtn.className = 'action-btn';
    restockAllBtn.textContent = 'Restock All';
    restockAllBtn.style.display = 'none';
    restockAllBtn.addEventListener('click', () => this.gameClient.restockAll());
    this.towerBar.appendChild(restockAllBtn);

    // Upgrade button
    const upgradeBtn = document.createElement('button');
    upgradeBtn.id = 'upgrade-btn';
    upgradeBtn.className = 'action-btn';
    upgradeBtn.textContent = 'Upgrade';
    upgradeBtn.style.display = 'none';
    upgradeBtn.addEventListener('click', () => {
      for (const id of this.gameClient.clientState.selectedTowerIds) {
        this.gameClient.upgradeTower(id);
      }
    });
    this.towerBar.appendChild(upgradeBtn);

    // Sell button
    const sellBtn = document.createElement('button');
    sellBtn.id = 'sell-btn';
    sellBtn.className = 'action-btn';
    sellBtn.textContent = 'Sell';
    sellBtn.style.display = 'none';
    sellBtn.addEventListener('click', () => {
      for (const id of this.gameClient.clientState.selectedTowerIds) {
        this.gameClient.sellTower(id);
      }
      this.gameClient.clientState.selectedTowerIds = [];
      this.gameClient.clientState.selectedTowerType = TowerType.BASIC;
    });
    this.towerBar.appendChild(sellBtn);

    // Repair button
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
    this.towerBar.appendChild(repairBtn);

    // Restock button (per-tower or multi)
    const restockBtn = document.createElement('button');
    restockBtn.id = 'restock-btn';
    restockBtn.className = 'action-btn';
    restockBtn.textContent = 'Restock';
    restockBtn.style.display = 'none';
    restockBtn.addEventListener('click', () => {
      for (const id of this.gameClient.clientState.selectedTowerIds) {
        this.gameClient.restockTower(id);
      }
    });
    this.towerBar.appendChild(restockBtn);
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
