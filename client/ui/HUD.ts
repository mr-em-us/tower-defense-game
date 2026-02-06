import { GamePhase, GameMode, TowerType } from '../../shared/types/game.types.js';
import { TOWER_STATS } from '../../shared/types/constants.js';
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
      const playerId = this.gameClient.getPlayerId();
      const myTowers = Object.values(state.towers).filter(t => t.ownerId === playerId).length;
      if (state.gameMode === GameMode.SINGLE) {
        this.showOverlay(
          `GAME OVER\n` +
          `Survived to wave ${state.waveNumber} | Towers remaining: ${myTowers}\n` +
          'Refresh to play again',
        );
      } else {
        const oppTowers = Object.values(state.towers).filter(t => t.ownerId !== playerId).length;
        const won = myTowers > 0 && oppTowers === 0;
        this.showOverlay(
          `${won ? 'VICTORY!' : 'DEFEAT'}\n` +
          `Wave ${state.waveNumber} | Your towers: ${myTowers} | Opponent: ${oppTowers}\n` +
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

    clearChildren(this.hudLeft);
    this.hudLeft.appendChild(span(side === 'LEFT' ? '< You' : 'You >'));
    this.hudLeft.appendChild(span(`${credits}c`, credits > 0 ? 'color:#4ADE80' : 'color:#EF4444'));

    clearChildren(this.hudCenter);
    if (state.phase === GamePhase.BUILD) {
      const players = Object.values(state.players);
      const readyCount = players.filter(p => p.isReady).length;
      this.hudCenter.appendChild(span(`BUILD  ${readyCount}/${players.length} ready`, 'font-weight:500'));
    } else {
      this.hudCenter.appendChild(span(`WAVE ${state.waveNumber}`, 'font-weight:500'));
    }

    clearChildren(this.hudRight);
    if (state.gameMode !== GameMode.SINGLE) {
      this.hudRight.appendChild(span(`Opp: ${oppCredits}c`, 'opacity:0.6'));
    }
  }

  private updateTowerBar(state: import('../../shared/types/game.types.js').GameState): void {
    if (!this.buttonsCreated) {
      this.createTowerButtons();
      this.buttonsCreated = true;
    }

    const credits = this.gameClient.getMyCredits();
    const isBuild = state.phase === GamePhase.BUILD;
    const selected = this.gameClient.clientState.selectedTowerType;

    // Update button costs with dynamic pricing
    for (const type of TOWER_TYPES) {
      const btn = document.getElementById(`tower-btn-${type}`) as HTMLElement;
      if (!btn) continue;

      const dynamicCost = this.gameClient.getDynamicPrice(type);
      const canAfford = credits >= dynamicCost;

      // Update displayed cost
      const costEl = btn.querySelector('.cost');
      if (costEl) costEl.textContent = `${dynamicCost}c`;

      btn.classList.toggle('selected', selected === type);
      btn.classList.toggle('disabled', !isBuild || !canAfford);
    }

    const readyBtn = document.getElementById('ready-btn');
    if (readyBtn) readyBtn.style.display = isBuild ? '' : 'none';

    const upgradeBtn = document.getElementById('upgrade-btn');
    const sellBtn = document.getElementById('sell-btn');
    const towerId = this.gameClient.clientState.selectedTowerId;

    if (upgradeBtn && sellBtn) {
      if (towerId && isBuild && state.towers[towerId]) {
        upgradeBtn.style.display = '';
        sellBtn.style.display = '';
      } else {
        upgradeBtn.style.display = 'none';
        sellBtn.style.display = 'none';
      }
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
        this.gameClient.clientState.selectedTowerId = null;
      });

      this.towerBar.appendChild(btn);
    }

    // Ready button
    const readyBtn = document.createElement('button');
    readyBtn.id = 'ready-btn';
    readyBtn.className = 'action-btn ready-btn';
    readyBtn.textContent = 'Ready';
    readyBtn.addEventListener('click', () => this.gameClient.readyForWave());
    this.towerBar.appendChild(readyBtn);

    // Upgrade button
    const upgradeBtn = document.createElement('button');
    upgradeBtn.id = 'upgrade-btn';
    upgradeBtn.className = 'action-btn';
    upgradeBtn.textContent = 'Upgrade';
    upgradeBtn.style.display = 'none';
    upgradeBtn.addEventListener('click', () => {
      const id = this.gameClient.clientState.selectedTowerId;
      if (id) this.gameClient.upgradeTower(id);
    });
    this.towerBar.appendChild(upgradeBtn);

    // Sell button
    const sellBtn = document.createElement('button');
    sellBtn.id = 'sell-btn';
    sellBtn.className = 'action-btn';
    sellBtn.textContent = 'Sell';
    sellBtn.style.display = 'none';
    sellBtn.addEventListener('click', () => {
      const id = this.gameClient.clientState.selectedTowerId;
      if (id) {
        this.gameClient.sellTower(id);
        this.gameClient.clientState.selectedTowerId = null;
        this.gameClient.clientState.selectedTowerType = TowerType.BASIC;
      }
    });
    this.towerBar.appendChild(sellBtn);
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
