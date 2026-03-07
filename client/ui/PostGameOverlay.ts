import { GameState, GameMode, GamePhase, WaveStats } from '../../shared/types/game.types.js';
import { GameClient } from '../game/GameClient.js';
import { PlayerHistory } from '../game/StatsTracker.js';

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

function td(text: string, warn = false): HTMLTableCellElement {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (warn) cell.className = 'pg-warn';
  return cell;
}

function th(text: string): HTMLTableCellElement {
  const cell = document.createElement('th');
  cell.textContent = text;
  return cell;
}

export class PostGameOverlay {
  private container: HTMLElement;
  private shown = false;

  constructor(private gameClient: GameClient) {
    this.container = document.createElement('div');
    this.container.id = 'post-game-panel';
    this.container.className = 'post-game-panel hidden';
    document.getElementById('app')!.appendChild(this.container);
  }

  update(state: GameState): void {
    if (state.phase !== GamePhase.GAME_OVER) {
      this.shown = false;
      return;
    }
    if (this.shown) return;
    this.shown = true;
    this.show(state);
  }

  private show(state: GameState): void {
    const myHp = this.gameClient.getMyHealth();
    const waveStats = this.gameClient.getWaveStats();
    const histories = this.gameClient.statsTracker.getHistories();

    let headerText: string;
    let subText: string;

    if (state.gameMode === GameMode.SINGLE) {
      headerText = 'GAME OVER';
      subText = `Survived to wave ${state.waveNumber} | HP: ${Math.ceil(myHp.current)}/${myHp.max}`;
    } else {
      const oppHp = this.gameClient.getOpponentHealth();
      const won = myHp.current > 0 && oppHp.current <= 0;
      headerText = won ? 'VICTORY!' : 'DEFEAT';
      subText = `Wave ${state.waveNumber} | Your HP: ${Math.ceil(myHp.current)} | Opponent HP: ${Math.ceil(oppHp.current)}`;
    }

    // Compute summary totals
    const totals = { enemiesKilled: 0, enemiesLeaked: 0, towersDestroyed: 0, creditsEarned: 0, creditsSpent: 0, towersBought: 0, towersUpgraded: 0 };
    for (const ws of waveStats) {
      totals.enemiesKilled += ws.enemiesKilled;
      totals.enemiesLeaked += ws.enemiesLeaked;
      totals.towersDestroyed += ws.towersDestroyed;
      totals.creditsEarned += ws.creditsEarned;
      totals.creditsSpent += ws.creditsSpent;
      totals.towersBought += ws.towersBought;
      totals.towersUpgraded += ws.towersUpgraded;
    }

    this.container.textContent = '';
    this.container.classList.remove('hidden');

    // Header
    this.container.appendChild(el('div', 'pg-header', headerText));
    this.container.appendChild(el('div', 'pg-sub', subText));

    // Summary stats
    const summaryRow = el('div', 'pg-summary');
    const statEntries: [string, string][] = [
      ['Enemies Killed', `${totals.enemiesKilled}`],
      ['Enemies Leaked', `${totals.enemiesLeaked}`],
      ['Towers Built', `${totals.towersBought}`],
      ['Towers Upgraded', `${totals.towersUpgraded}`],
      ['Towers Lost', `${totals.towersDestroyed}`],
      ['Credits Earned', `${totals.creditsEarned}c`],
      ['Credits Spent', `${totals.creditsSpent}c`],
    ];
    for (const [label, value] of statEntries) {
      const item = el('div', 'pg-stat');
      item.appendChild(el('div', 'pg-stat-value', value));
      item.appendChild(el('div', 'pg-stat-label', label));
      summaryRow.appendChild(item);
    }
    this.container.appendChild(summaryRow);

    // Wave breakdown table
    if (waveStats.length > 0) {
      const tableSection = el('div', 'pg-table-section');
      tableSection.appendChild(el('div', 'pg-section-title', 'Wave Breakdown'));

      const tableWrap = el('div', 'pg-table-wrap');
      const table = document.createElement('table');
      table.className = 'pg-table';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const h of ['Wave', 'Spawned', 'Killed', 'Leaked', 'Towers Lost', 'Earned', 'Spent']) {
        headRow.appendChild(th(h));
      }
      thead.appendChild(headRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const ws of waveStats) {
        const tr = document.createElement('tr');
        tr.appendChild(td(`${ws.waveNumber}`));
        tr.appendChild(td(`${ws.enemiesSpawned}`));
        tr.appendChild(td(`${ws.enemiesKilled}`));
        tr.appendChild(td(`${ws.enemiesLeaked}`, ws.enemiesLeaked > 0));
        tr.appendChild(td(`${ws.towersDestroyed}`, ws.towersDestroyed > 0));
        tr.appendChild(td(`${ws.creditsEarned}c`));
        tr.appendChild(td(`${ws.creditsSpent}c`));
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      tableSection.appendChild(tableWrap);
      this.container.appendChild(tableSection);
    }

    // Charts: Health + Credits over time
    if (histories.length > 0) {
      const chartsSection = el('div', 'pg-charts');
      chartsSection.appendChild(this.renderChart(histories, 'health', 'Health Over Time'));
      chartsSection.appendChild(this.renderChart(histories, 'credits', 'Credits Over Time'));
      this.container.appendChild(chartsSection);
    }

    // Action buttons
    const btnRow = el('div', 'pg-actions');
    const playAgain = document.createElement('button');
    playAgain.className = 'menu-btn';
    playAgain.textContent = 'Play Again';
    playAgain.addEventListener('click', () => window.location.reload());
    btnRow.appendChild(playAgain);
    this.container.appendChild(btnRow);

    this.container.appendChild(el('div', 'pg-note', 'Results saved to Leaderboard'));
  }

  private renderChart(histories: PlayerHistory[], metric: 'health' | 'credits', title: string): HTMLElement {
    const wrap = el('div', 'pg-chart-wrap');
    wrap.appendChild(el('div', 'pg-chart-title', title));

    const canvas = document.createElement('canvas');
    const W = 320, H = 100;
    canvas.width = W;
    canvas.height = H;
    canvas.className = 'pg-chart-canvas';
    wrap.appendChild(canvas);

    const ctx = canvas.getContext('2d')!;
    const pad = { top: 10, right: 10, bottom: 20, left: 40 };
    const cw = W - pad.left - pad.right;
    const ch = H - pad.top - pad.bottom;

    let maxVal = 0, maxTime = 0;
    for (const h of histories) {
      for (const s of h.snapshots) {
        const v = metric === 'health' ? s.health : s.credits;
        if (v > maxVal) maxVal = v;
        if (s.time > maxTime) maxTime = s.time;
      }
    }
    if (maxVal === 0) maxVal = 1;
    if (maxTime === 0) maxTime = 1;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, W, H);

    // Axes
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + ch);
    ctx.lineTo(pad.left + cw, pad.top + ch);
    ctx.stroke();

    // Y axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '9px "DM Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(maxVal)}`, pad.left - 4, pad.top);
    ctx.fillText('0', pad.left - 4, pad.top + ch);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${Math.round(maxTime)}s`, pad.left + cw, pad.top + ch + 4);

    // Draw lines
    const colors = ['#4ADE80', '#FBBF24'];
    for (let hi = 0; hi < histories.length; hi++) {
      const h = histories[hi];
      if (h.snapshots.length < 2) continue;
      ctx.strokeStyle = colors[hi % colors.length];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < h.snapshots.length; i++) {
        const s = h.snapshots[i];
        const x = pad.left + (s.time / maxTime) * cw;
        const v = metric === 'health' ? s.health : s.credits;
        const y = pad.top + ch - (v / maxVal) * ch;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    return wrap;
  }
}
