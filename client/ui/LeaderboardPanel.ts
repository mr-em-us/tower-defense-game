import { GameSettings } from '../../shared/types/game.types.js';
import { LeaderboardEntry } from '../../shared/types/leaderboard.types.js';

type TabMode = 'singleplayer' | 'multiplayer';

export class LeaderboardPanel {
  private root: HTMLElement;
  private activeTab: TabMode = 'singleplayer';
  private tableWrap!: HTMLElement;
  private tabButtons: HTMLButtonElement[] = [];
  private onChallenge: (settings: GameSettings) => void;

  constructor(containerId: string, onChallenge: (settings: GameSettings) => void) {
    this.onChallenge = onChallenge;

    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    }
    this.root = container;
    this.root.className = 'leaderboard-panel hidden';
    this.buildDOM();
  }

  show(): void {
    this.root.classList.remove('hidden');
    this.fetchAndRender();
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private buildDOM(): void {
    const title = document.createElement('h1');
    title.className = 'leaderboard-title';
    title.textContent = 'LEADERBOARD';
    this.root.appendChild(title);

    const tabBar = document.createElement('div');
    tabBar.className = 'leaderboard-tabs';

    const tabs: { label: string; mode: TabMode }[] = [
      { label: 'Singleplayer', mode: 'singleplayer' },
      { label: 'Multiplayer', mode: 'multiplayer' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.className = 'leaderboard-tab';
      btn.textContent = tab.label;
      if (tab.mode === this.activeTab) btn.classList.add('active');

      btn.addEventListener('click', () => {
        this.activeTab = tab.mode;
        for (const b of this.tabButtons) b.classList.remove('active');
        btn.classList.add('active');
        this.fetchAndRender();
      });

      tabBar.appendChild(btn);
      this.tabButtons.push(btn);
    }

    this.root.appendChild(tabBar);

    this.tableWrap = document.createElement('div');
    this.tableWrap.className = 'leaderboard-table-wrap';
    this.root.appendChild(this.tableWrap);

    const backBtn = document.createElement('button');
    backBtn.className = 'leaderboard-back-btn menu-btn';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => this.hide());
    this.root.appendChild(backBtn);
  }

  private async fetchAndRender(): Promise<void> {
    this.showMessage('Loading...');

    try {
      const host = window.location.hostname || 'localhost';
      const mode = this.activeTab === 'singleplayer' ? 'SINGLE' : 'MULTI';
      const url = `http://${host}:8080/api/leaderboard?mode=${mode}`;
      const resp = await fetch(url);
      const entries: LeaderboardEntry[] = await resp.json();

      if (!entries || entries.length === 0) {
        this.showMessage('No games yet');
        return;
      }

      this.renderTable(entries);
    } catch {
      this.showMessage('Failed to load leaderboard');
    }
  }

  private showMessage(text: string): void {
    while (this.tableWrap.firstChild) this.tableWrap.removeChild(this.tableWrap.firstChild);

    const msg = document.createElement('div');
    msg.style.cssText = 'text-align:center;padding:40px;color:rgba(255,255,255,0.5);font-family:"DM Mono",monospace;font-size:14px';
    msg.textContent = text;
    this.tableWrap.appendChild(msg);
  }

  private renderTable(entries: LeaderboardEntry[]): void {
    while (this.tableWrap.firstChild) this.tableWrap.removeChild(this.tableWrap.firstChild);

    const table = document.createElement('table');
    table.className = 'leaderboard-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['Rank', 'Player', 'Best Wave', 'Difficulty', 'Score', 'Date', ''];
    for (const h of headers) {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const tr = document.createElement('tr');

      // Rank
      const rankTd = document.createElement('td');
      rankTd.textContent = String(i + 1);
      tr.appendChild(rankTd);

      // Player
      const playerTd = document.createElement('td');
      const displayName = entry.playerName.length > 15
        ? entry.playerName.substring(0, 15) + '...'
        : entry.playerName;
      playerTd.textContent = displayName;
      tr.appendChild(playerTd);

      // Best Wave
      const waveTd = document.createElement('td');
      waveTd.textContent = String(entry.bestWave);
      tr.appendChild(waveTd);

      // Difficulty
      const diffTd = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'difficulty-badge ' + this.getDifficultyClass(entry.difficultyLabel);
      badge.textContent = entry.difficultyLabel;
      diffTd.appendChild(badge);

      const factorSpan = document.createElement('span');
      factorSpan.style.cssText = 'margin-left:6px;font-size:11px;opacity:0.6';
      factorSpan.textContent = entry.difficultyFactor.toFixed(2) + 'x';
      diffTd.appendChild(factorSpan);
      tr.appendChild(diffTd);

      // Score
      const scoreTd = document.createElement('td');
      scoreTd.textContent = entry.adjustedScore.toFixed(1);
      tr.appendChild(scoreTd);

      // Date
      const dateTd = document.createElement('td');
      dateTd.textContent = this.formatDate(entry.timestamp);
      tr.appendChild(dateTd);

      // Challenge button
      const challengeTd = document.createElement('td');
      const challengeBtn = document.createElement('button');
      challengeBtn.className = 'leaderboard-challenge-btn';
      challengeBtn.textContent = 'Challenge';
      challengeBtn.addEventListener('click', () => {
        this.onChallenge(entry.settings);
      });
      challengeTd.appendChild(challengeBtn);
      tr.appendChild(challengeTd);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    this.tableWrap.appendChild(table);
  }

  private getDifficultyClass(label: string): string {
    const lower = label.toLowerCase();
    if (lower === 'easy') return 'easy';
    if (lower === 'normal') return 'normal';
    if (lower === 'hard') return 'hard';
    return 'custom';
  }

  private formatDate(timestamp: number): string {
    const d = new Date(timestamp);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `${month}/${day}`;
  }
}
