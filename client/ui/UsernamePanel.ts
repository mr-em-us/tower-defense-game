const STORAGE_KEY = 'td_usernames';
const MAX_STORED = 10;
const MAX_NAME_LENGTH = 20;

export class UsernamePanel {
  private root: HTMLElement;
  private input!: HTMLInputElement;
  private datalist!: HTMLDataListElement;
  private resolvePromise: ((name: string) => void) | null = null;

  constructor(containerId: string) {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    }
    this.root = container;
    this.root.className = 'username-panel hidden';
    this.buildDOM();
  }

  show(): Promise<string> {
    this.root.classList.remove('hidden');
    this.populateDatalist();

    const names = this.loadNames();
    if (names.length > 0) {
      this.input.value = names[0];
    } else {
      this.input.value = '';
    }

    this.input.focus();
    this.input.select();

    return new Promise<string>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private buildDOM(): void {
    const title = document.createElement('h1');
    title.className = 'username-title';
    title.textContent = 'ENTER YOUR NAME';
    this.root.appendChild(title);

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'username-input';
    this.input.placeholder = 'Type your name...';
    this.input.maxLength = MAX_NAME_LENGTH;
    this.input.setAttribute('list', 'td-username-list');
    this.input.setAttribute('autocomplete', 'off');

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.submit();
      }
    });

    this.root.appendChild(this.input);

    this.datalist = document.createElement('datalist');
    this.datalist.id = 'td-username-list';
    this.root.appendChild(this.datalist);

    const playBtn = document.createElement('button');
    playBtn.className = 'username-play-btn menu-btn';
    playBtn.textContent = 'Play';
    playBtn.addEventListener('click', () => this.submit());
    this.root.appendChild(playBtn);
  }

  private submit(): void {
    const name = this.input.value.trim();
    if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
      this.input.classList.add('shake');
      setTimeout(() => this.input.classList.remove('shake'), 300);
      return;
    }

    this.saveName(name);
    this.hide();
    if (this.resolvePromise) {
      this.resolvePromise(name);
      this.resolvePromise = null;
    }
  }

  private loadNames(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
      }
    } catch { /* ignore */ }
    return [];
  }

  private saveName(name: string): void {
    let names = this.loadNames();
    names = names.filter((n) => n !== name);
    names.unshift(name);
    if (names.length > MAX_STORED) names.length = MAX_STORED;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
  }

  private populateDatalist(): void {
    while (this.datalist.firstChild) this.datalist.removeChild(this.datalist.firstChild);

    const names = this.loadNames();
    for (const name of names) {
      const option = document.createElement('option');
      option.value = name;
      this.datalist.appendChild(option);
    }
  }
}
