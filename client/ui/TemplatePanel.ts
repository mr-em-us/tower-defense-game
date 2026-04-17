import { TowerTemplate, list, remove } from '../data/TemplateStore.js';

/**
 * Modal that lists saved templates and lets the player pick one to apply.
 * Applies on game start — caller is responsible for stitching the selected
 * template into the next JOIN_GAME / template-apply flow.
 */
export class TemplatePanel {
  private root: HTMLElement;
  private onPick: (tpl: TowerTemplate) => void;
  private playerName = '';

  constructor(containerId: string, onPick: (tpl: TowerTemplate) => void) {
    this.root = document.getElementById(containerId)!;
    this.onPick = onPick;
  }

  show(playerName: string): void {
    this.playerName = playerName;
    this.root.classList.remove('hidden');
    this.root.style.display = 'flex';
    this.render();
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.root.style.display = 'none';
  }

  private render(): void {
    while (this.root.firstChild) this.root.removeChild(this.root.firstChild);

    const wrap = document.createElement('div');
    wrap.style.cssText =
      'background:#0F172A;padding:20px;border-radius:8px;width:480px;max-height:70vh;overflow-y:auto;color:#fff;font-family:inherit;';

    const title = document.createElement('div');
    title.textContent = 'Load Tower Template';
    title.style.cssText = 'font-size:18px;font-weight:500;margin-bottom:12px;';
    wrap.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = 'Templates apply at the start of a single-player game. Your starting credits must cover the template cost.';
    hint.style.cssText = 'font-size:12px;color:#94A3B8;margin-bottom:16px;';
    wrap.appendChild(hint);

    const templates = list(this.playerName);
    if (templates.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No saved templates. Save one during a build phase.';
      empty.style.cssText = 'font-size:13px;color:#64748B;padding:12px;text-align:center;';
      wrap.appendChild(empty);
    } else {
      for (const tpl of templates) {
        wrap.appendChild(this.renderRow(tpl));
      }
    }

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;';
    const back = document.createElement('button');
    back.textContent = 'Back';
    back.className = 'action-btn';
    back.addEventListener('click', () => this.hide());
    actions.appendChild(back);
    wrap.appendChild(actions);

    this.root.appendChild(wrap);
  }

  private renderRow(tpl: TowerTemplate): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:8px;border:1px solid #1E293B;border-radius:6px;margin-bottom:8px;';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    const name = document.createElement('div');
    name.textContent = tpl.name;
    name.style.cssText = 'font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;';
    const meta = document.createElement('div');
    const date = new Date(tpl.createdAt).toLocaleString();
    meta.textContent = `${tpl.towers.length} towers · ${tpl.cost.toLocaleString()}c · ${date}`;
    meta.style.cssText = 'font-size:11px;color:#94A3B8;';
    info.appendChild(name);
    info.appendChild(meta);

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.className = 'action-btn';
    loadBtn.style.cssText = 'padding:4px 12px;font-size:12px;';
    loadBtn.addEventListener('click', () => {
      this.onPick(tpl);
      this.hide();
    });

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.className = 'action-btn';
    delBtn.style.cssText = 'padding:4px 12px;font-size:12px;background:#7F1D1D;';
    delBtn.addEventListener('click', () => {
      if (confirm(`Delete template "${tpl.name}"?`)) {
        remove(this.playerName, tpl.id);
        this.render();
      }
    });

    row.appendChild(info);
    row.appendChild(loadBtn);
    row.appendChild(delBtn);
    return row;
  }
}
