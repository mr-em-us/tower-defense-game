import { SaveMetadata } from '../../shared/types/save.types.js';

export class SavePanel {
  private root: HTMLElement;
  private listWrap!: HTMLElement;
  private onLoad: (saveId: string) => void;
  private playerName = '';

  constructor(containerId: string, onLoad: (saveId: string) => void) {
    this.onLoad = onLoad;
    this.root = document.getElementById(containerId)!;
    this.buildDOM();
  }

  private buildDOM(): void {
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);
    this.root.style.cssText = `
      position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
      justify-content:center;background:rgba(0,0,0,0.85);z-index:200;
      font-family:'DM Mono',monospace;color:#E2E8F0;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
      width:500px;max-width:90vw;max-height:80vh;overflow-y:auto;
      background:#0F172A;border:1px solid #334155;border-radius:8px;padding:24px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'SAVED GAMES';
    title.style.cssText = 'text-align:center;margin:0 0 16px;letter-spacing:2px;font-size:18px;';
    container.appendChild(title);

    this.listWrap = document.createElement('div');
    container.appendChild(this.listWrap);

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Back';
    backBtn.className = 'menu-btn';
    backBtn.style.cssText = 'margin-top:16px;width:100%;';
    backBtn.addEventListener('click', () => this.hide());
    container.appendChild(backBtn);

    this.root.appendChild(container);
  }

  async show(playerName: string): Promise<void> {
    this.playerName = playerName;
    this.root.classList.remove('hidden');
    await this.fetchAndRender();
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private async fetchAndRender(): Promise<void> {
    const host = window.location.hostname || 'localhost';
    const port = window.location.port || '8080';
    try {
      const resp = await fetch(`${window.location.protocol}//${host}:${port}/api/saves?player=${encodeURIComponent(this.playerName)}`);
      const data = await resp.json();
      this.renderList(data.saves || []);
    } catch {
      while (this.listWrap.firstChild) this.listWrap.removeChild(this.listWrap.firstChild);
      const errMsg = document.createElement('div');
      errMsg.textContent = 'Failed to load saves';
      errMsg.style.cssText = 'text-align:center;color:#EF4444;';
      this.listWrap.appendChild(errMsg);
    }
  }

  private renderList(saves: SaveMetadata[]): void {
    while (this.listWrap.firstChild) this.listWrap.removeChild(this.listWrap.firstChild);

    if (saves.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No saved games';
      empty.style.cssText = 'text-align:center;color:#64748B;padding:24px;';
      this.listWrap.appendChild(empty);
      return;
    }

    for (const save of saves) {
      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;align-items:center;justify-content:space-between;
        padding:10px 12px;margin-bottom:8px;background:#1E293B;border-radius:4px;
        border:1px solid #334155;
      `;

      const info = document.createElement('div');
      const nameEl = document.createElement('div');
      nameEl.textContent = save.displayName;
      nameEl.style.cssText = 'font-weight:500;font-size:14px;';

      const details = document.createElement('div');
      details.style.cssText = 'font-size:11px;color:#94A3B8;margin-top:2px;';
      const date = new Date(save.timestamp).toLocaleString();
      details.textContent = `Wave ${save.waveReached} | HP: ${save.playerHealth} | ${save.credits.toLocaleString()}c | ${date}`;

      info.appendChild(nameEl);
      info.appendChild(details);

      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex;gap:6px;';

      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.className = 'action-btn';
      loadBtn.style.cssText = 'padding:4px 12px;font-size:12px;';
      loadBtn.addEventListener('click', () => {
        this.hide();
        this.onLoad(save.id);
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Del';
      delBtn.className = 'action-btn';
      delBtn.style.cssText = 'padding:4px 8px;font-size:12px;color:#EF4444;';
      delBtn.addEventListener('click', async () => {
        const host = window.location.hostname || 'localhost';
        const port = window.location.port || '8080';
        await fetch(`${window.location.protocol}//${host}:${port}/api/saves?id=${save.id}&player=${encodeURIComponent(this.playerName)}`, { method: 'DELETE' });
        await this.fetchAndRender();
      });

      btns.appendChild(loadBtn);
      btns.appendChild(delBtn);

      row.appendChild(info);
      row.appendChild(btns);
      this.listWrap.appendChild(row);
    }
  }
}
