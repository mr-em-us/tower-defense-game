import { GameSettings, TowerType, EnemyType, TowerStatOverrides, EnemyStatOverrides } from '../../shared/types/game.types.js';
import { DEFAULT_GAME_SETTINGS, TOWER_STATS, ENEMY_STATS } from '../../shared/types/constants.js';
import { computeDifficultyFactor, EASY_SETTINGS, HARD_SETTINGS } from '../../shared/utils/difficulty.js';
import { TOWER_CHARS, TOWER_LABELS } from '../rendering/AsciiArt.js';

// ── Number field config ──

interface NumberFieldConfig {
  label: string;
  key: 'startingHealth' | 'startingCredits' | 'firstWaveEnemies';
  min: number;
  max: number;
  step: number;
  default: number;
}

const NUMBER_FIELDS: NumberFieldConfig[] = [
  { label: 'Starting HP', key: 'startingHealth', min: 50, max: 5000, step: 50, default: 500 },
  { label: 'Starting Cash', key: 'startingCredits', min: 50, max: 50000, step: 50, default: 2000 },
  { label: 'First Wave Enemies', key: 'firstWaveEnemies', min: 5, max: 200, step: 1, default: 15 },
];

// ── Curve canvas constants ──

const CURVE_WIDTH = 500;
const CURVE_HEIGHT = 200;
const CURVE_PAD_LEFT = 40;
const CURVE_PAD_RIGHT = 16;
const CURVE_PAD_TOP = 16;
const CURVE_PAD_BOTTOM = 28;
const CURVE_MIN_Y = 0.1;
const CURVE_MAX_Y = 10.0;
const NUM_WAVES = 20;
const POINT_RADIUS = 6;
const POINT_HIT_RADIUS = 14;

// ── Tower / enemy stat definitions ──

type TowerOverrideKey = keyof TowerStatOverrides;
type EnemyOverrideKey = keyof EnemyStatOverrides;

const ALL_TOWER_TYPES: TowerType[] = [TowerType.BASIC, TowerType.SNIPER, TowerType.SPLASH, TowerType.SLOW, TowerType.WALL];
const ALL_ENEMY_TYPES: EnemyType[] = [EnemyType.BASIC, EnemyType.FAST, EnemyType.TANK, EnemyType.BOSS];

const TOWER_OVERRIDE_KEYS: TowerOverrideKey[] = ['cost', 'damage', 'range', 'fireRate', 'maxHealth', 'maxAmmo'];
const ENEMY_OVERRIDE_KEYS: EnemyOverrideKey[] = ['health', 'speed', 'creditValue', 'contactDamage'];

// Stats that are always 0 for WALL — skip sliders
const WALL_SKIP_KEYS: Set<TowerOverrideKey> = new Set(['damage', 'range', 'fireRate', 'maxAmmo']);

const STAT_LABELS: Record<string, string> = {
  cost: 'Cost',
  damage: 'Damage',
  range: 'Range',
  fireRate: 'Fire Rate',
  maxHealth: 'Max HP',
  maxAmmo: 'Max Ammo',
  health: 'HP',
  speed: 'Speed',
  creditValue: 'Credits',
  contactDamage: 'Contact Dmg',
};

// ── Tab identifiers ──

type TabId = 'general' | 'towers' | 'enemies';

// ──────────────────────────────────────────────────
// SettingsPanel
// ──────────────────────────────────────────────────

export class SettingsPanel {
  private root: HTMLElement;
  private settings: GameSettings;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private draggingIndex: number | null = null;
  private valueDisplays: Map<string, HTMLElement> = new Map();
  private resolvePromise: ((settings: GameSettings) => void) | null = null;
  private resolveReadOnly: (() => void) | null = null;
  private readOnly = false;

  // DOM references
  private difficultyValueEl!: HTMLElement;
  private difficultyDeltaEl!: HTMLElement;
  private tabContentEl!: HTMLElement;
  private tabButtons: Map<TabId, HTMLElement> = new Map();
  private doneBtn!: HTMLButtonElement;
  private savedPresetsWrap!: HTMLElement;
  private activeTab: TabId = 'general';
  private prevFactor = 1.0;
  private deltaTimeout: ReturnType<typeof setTimeout> | null = null;
  private username = '';

  // Slider value labels and preview labels — keyed by "towerType:statKey" or "enemyType:statKey"
  private sliderValueEls: Map<string, HTMLElement> = new Map();
  private sliderPreviewEls: Map<string, HTMLElement> = new Map();
  private sliderInputs: Map<string, HTMLInputElement> = new Map();

  constructor(containerId: string) {
    this.settings = structuredClone(DEFAULT_GAME_SETTINGS);

    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    }
    this.root = container;
    this.root.className = 'settings-panel hidden';

    this.buildDOM();
  }

  show(initial?: GameSettings): Promise<GameSettings> {
    this.readOnly = false;
    if (initial) {
      this.settings = structuredClone(initial);
    }
    this.prevFactor = computeDifficultyFactor(this.settings);
    this.refreshAll();
    this.doneBtn.textContent = 'Done';
    this.setAllInputsDisabled(false);
    this.root.classList.remove('hidden');
    this.switchTab('general');
    return new Promise<GameSettings>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  showReadOnly(settings: GameSettings): Promise<void> {
    this.readOnly = true;
    this.settings = structuredClone(settings);
    this.prevFactor = computeDifficultyFactor(this.settings);
    this.refreshAll();
    this.doneBtn.textContent = 'Back';
    this.setAllInputsDisabled(true);
    this.root.classList.remove('hidden');
    this.switchTab('general');
    return new Promise<void>((resolve) => {
      this.resolveReadOnly = resolve;
    });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setUsername(name: string): void {
    this.username = name;
  }

  // ── Saved presets (localStorage) ──

  private getStorageKey(): string {
    return 'td_presets_' + this.username;
  }

  private loadSavedPresets(): Record<string, GameSettings> {
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch { /* ignore */ }
    return {};
  }

  private saveSavedPresets(presets: Record<string, GameSettings>): void {
    localStorage.setItem(this.getStorageKey(), JSON.stringify(presets));
  }

  private saveCurrentAs(name: string): void {
    const presets = this.loadSavedPresets();
    presets[name] = structuredClone(this.settings);
    this.saveSavedPresets(presets);
    this.renderSavedPresets();
  }

  private deleteSavedPreset(name: string): void {
    const presets = this.loadSavedPresets();
    delete presets[name];
    this.saveSavedPresets(presets);
    this.renderSavedPresets();
  }

  private loadSavedPreset(name: string): void {
    const presets = this.loadSavedPresets();
    const preset = presets[name];
    if (preset) {
      this.applyPreset(preset);
    }
  }

  // ── DOM construction ──

  private buildDOM(): void {
    // Title
    const title = document.createElement('h1');
    title.className = 'settings-title';
    title.textContent = 'GAME SETTINGS';
    this.root.appendChild(title);

    // Difficulty display (always visible, outside tabs)
    this.root.appendChild(this.buildDifficultyDisplay());

    // Tab bar
    this.root.appendChild(this.buildTabBar());

    // Scrollable content area
    this.tabContentEl = document.createElement('div');
    this.tabContentEl.className = 'settings-content settings-tab-content';
    this.root.appendChild(this.tabContentEl);

    // Preset buttons
    this.root.appendChild(this.buildPresetButtons());

    // Saved presets section
    this.savedPresetsWrap = document.createElement('div');
    this.savedPresetsWrap.className = 'settings-saved-presets';
    this.root.appendChild(this.savedPresetsWrap);

    // Done / Back button
    this.doneBtn = document.createElement('button');
    this.doneBtn.className = 'settings-start-btn';
    this.doneBtn.textContent = 'Done';
    this.doneBtn.addEventListener('click', () => {
      this.hide();
      if (this.readOnly) {
        if (this.resolveReadOnly) {
          this.resolveReadOnly();
          this.resolveReadOnly = null;
        }
      } else {
        if (this.resolvePromise) {
          this.resolvePromise(structuredClone(this.settings));
          this.resolvePromise = null;
        }
      }
    });
    this.root.appendChild(this.doneBtn);
  }

  // ── Difficulty display ──

  private buildDifficultyDisplay(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'settings-difficulty';

    const label = document.createElement('span');
    label.textContent = 'DIFFICULTY: ';
    label.style.opacity = '0.7';
    wrap.appendChild(label);

    this.difficultyValueEl = document.createElement('span');
    this.difficultyValueEl.className = 'settings-difficulty-value';
    this.difficultyValueEl.textContent = '1.00x';
    wrap.appendChild(this.difficultyValueEl);

    this.difficultyDeltaEl = document.createElement('span');
    this.difficultyDeltaEl.className = 'settings-difficulty-delta';
    wrap.appendChild(this.difficultyDeltaEl);

    return wrap;
  }

  private updateDifficulty(): void {
    const factor = computeDifficultyFactor(this.settings);
    this.difficultyValueEl.textContent = factor.toFixed(2) + 'x';

    const delta = factor - this.prevFactor;
    if (Math.abs(delta) > 0.004) {
      const sign = delta > 0 ? '+' : '';
      this.difficultyDeltaEl.textContent = sign + delta.toFixed(2);
      this.difficultyDeltaEl.style.color = delta > 0 ? '#EF4444' : '#4ADE80';
      this.difficultyDeltaEl.style.opacity = '1';
      // fade after 2s
      if (this.deltaTimeout) clearTimeout(this.deltaTimeout);
      this.deltaTimeout = setTimeout(() => {
        this.difficultyDeltaEl.style.opacity = '0';
      }, 2000);
    }
    this.prevFactor = factor;
  }

  // ── Tab bar ──

  private buildTabBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'settings-tabs';

    const tabs: { id: TabId; label: string }[] = [
      { id: 'general', label: 'General' },
      { id: 'towers', label: 'Towers' },
      { id: 'enemies', label: 'Enemies' },
    ];

    for (const tab of tabs) {
      const btn = document.createElement('button');
      btn.className = 'settings-tab';
      btn.textContent = tab.label;
      btn.addEventListener('click', () => this.switchTab(tab.id));
      bar.appendChild(btn);
      this.tabButtons.set(tab.id, btn);
    }

    return bar;
  }

  private switchTab(tabId: TabId): void {
    this.activeTab = tabId;

    // Update active button styling
    for (const [id, btn] of this.tabButtons) {
      if (id === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }

    // Rebuild content
    this.tabContentEl.textContent = '';
    switch (tabId) {
      case 'general':
        this.buildGeneralTab(this.tabContentEl);
        this.drawCurve(); // Canvas is recreated by buildGeneralTab, must redraw
        break;
      case 'towers':
        this.buildTowersTab(this.tabContentEl);
        break;
      case 'enemies':
        this.buildEnemiesTab(this.tabContentEl);
        break;
    }
  }

  // ── General tab ──

  private buildGeneralTab(container: HTMLElement): void {
    const fieldsSection = document.createElement('div');
    fieldsSection.className = 'settings-fields';
    for (const field of NUMBER_FIELDS) {
      fieldsSection.appendChild(this.buildNumberField(field));
    }
    container.appendChild(fieldsSection);
    container.appendChild(this.buildCurveSection());
  }

  // ── Towers tab ──

  private buildTowersTab(container: HTMLElement): void {
    for (const ttype of ALL_TOWER_TYPES) {
      const section = document.createElement('div');
      section.className = 'settings-override-section';

      // Header
      const header = document.createElement('div');
      header.className = 'settings-section-header';
      header.textContent = TOWER_CHARS[ttype] + ' ' + TOWER_LABELS[ttype];
      section.appendChild(header);

      const isWall = ttype === TowerType.WALL;

      for (const statKey of TOWER_OVERRIDE_KEYS) {
        if (isWall && WALL_SKIP_KEYS.has(statKey)) continue;

        const base = (TOWER_STATS[ttype] as Record<string, number>)[statKey];
        const mult = this.getTowerOverride(ttype, statKey);
        const sliderKey = ttype + ':' + statKey;

        section.appendChild(this.buildSliderRow(
          STAT_LABELS[statKey],
          mult,
          base,
          sliderKey,
          (val: number) => {
            this.setTowerOverride(ttype, statKey, val);
            this.onSliderChange(sliderKey, val, base);
          },
        ));
      }

      container.appendChild(section);
    }
  }

  // ── Enemies tab ──

  private buildEnemiesTab(container: HTMLElement): void {
    for (const etype of ALL_ENEMY_TYPES) {
      const section = document.createElement('div');
      section.className = 'settings-override-section';

      const header = document.createElement('div');
      header.className = 'settings-section-header';
      header.textContent = etype.charAt(0) + etype.slice(1).toLowerCase();
      section.appendChild(header);

      for (const statKey of ENEMY_OVERRIDE_KEYS) {
        const base = (ENEMY_STATS[etype] as Record<string, number>)[statKey];
        const mult = this.getEnemyOverride(etype, statKey);
        const sliderKey = etype + ':' + statKey;

        section.appendChild(this.buildSliderRow(
          STAT_LABELS[statKey],
          mult,
          base,
          sliderKey,
          (val: number) => {
            this.setEnemyOverride(etype, statKey, val);
            this.onSliderChange(sliderKey, val, base);
          },
        ));
      }

      container.appendChild(section);
    }
  }

  // ── Slider row builder ──

  private buildSliderRow(
    label: string,
    multiplier: number,
    baseValue: number,
    sliderKey: string,
    onChange: (val: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-slider-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'settings-field-label';
    nameEl.textContent = label;
    row.appendChild(nameEl);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'settings-slider';
    slider.min = '0.1';
    slider.max = '3.0';
    slider.step = '0.1';
    slider.value = String(multiplier);
    this.sliderInputs.set(sliderKey, slider);

    const valueEl = document.createElement('span');
    valueEl.className = 'settings-slider-value';
    valueEl.textContent = multiplier.toFixed(1) + 'x';
    this.sliderValueEls.set(sliderKey, valueEl);

    const effective = Math.round(baseValue * multiplier);
    const previewEl = document.createElement('span');
    previewEl.className = 'settings-slider-preview';
    previewEl.textContent = baseValue + ' \u2192 ' + effective;
    this.sliderPreviewEls.set(sliderKey, previewEl);

    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      const rounded = Math.round(val * 10) / 10;
      onChange(rounded);
    });

    row.appendChild(slider);
    row.appendChild(valueEl);
    row.appendChild(previewEl);

    return row;
  }

  private onSliderChange(sliderKey: string, multiplier: number, baseValue: number): void {
    const valueEl = this.sliderValueEls.get(sliderKey);
    if (valueEl) valueEl.textContent = multiplier.toFixed(1) + 'x';

    const previewEl = this.sliderPreviewEls.get(sliderKey);
    if (previewEl) {
      const effective = Math.round(baseValue * multiplier);
      previewEl.textContent = baseValue + ' \u2192 ' + effective;
    }
    this.updateDifficulty();
  }

  // ── Override getters/setters ──

  private getTowerOverride(ttype: TowerType, key: TowerOverrideKey): number {
    return this.settings.towerOverrides?.[ttype]?.[key] ?? 1.0;
  }

  private setTowerOverride(ttype: TowerType, key: TowerOverrideKey, value: number): void {
    if (!this.settings.towerOverrides) this.settings.towerOverrides = {};
    if (!this.settings.towerOverrides[ttype]) this.settings.towerOverrides[ttype] = {};
    this.settings.towerOverrides[ttype]![key] = value;
  }

  private getEnemyOverride(etype: EnemyType, key: EnemyOverrideKey): number {
    return this.settings.enemyOverrides?.[etype]?.[key] ?? 1.0;
  }

  private setEnemyOverride(etype: EnemyType, key: EnemyOverrideKey, value: number): void {
    if (!this.settings.enemyOverrides) this.settings.enemyOverrides = {};
    if (!this.settings.enemyOverrides[etype]) this.settings.enemyOverrides[etype] = {};
    this.settings.enemyOverrides[etype]![key] = value;
  }

  // ── Number fields (same as current) ──

  private buildNumberField(config: NumberFieldConfig): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-field-row';

    const label = document.createElement('span');
    label.className = 'settings-field-label';
    label.textContent = config.label;
    row.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'settings-field-controls';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'settings-step-btn';
    minusBtn.textContent = '-';
    minusBtn.addEventListener('click', () => {
      if (this.readOnly) return;
      const current = this.settings[config.key] as number;
      const next = Math.max(config.min, current - config.step);
      this.settings[config.key] = next;
      this.updateValueDisplay(config.key);
      this.updateDifficulty();
    });

    const valueEl = document.createElement('span');
    valueEl.className = 'settings-field-value';
    valueEl.textContent = String(this.settings[config.key]);
    this.valueDisplays.set(config.key, valueEl);

    // Click value to edit inline
    valueEl.addEventListener('click', () => {
      if (this.readOnly) return;
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'settings-field-input';
      input.min = String(config.min);
      input.max = String(config.max);
      input.step = String(config.step);
      input.value = String(this.settings[config.key]);

      const commit = () => {
        let val = Number(input.value);
        val = Math.round(val / config.step) * config.step;
        val = Math.max(config.min, Math.min(config.max, val));
        this.settings[config.key] = val;
        this.updateValueDisplay(config.key);
        this.updateDifficulty();
        if (input.parentNode === controls) {
          controls.replaceChild(valueEl, input);
        }
      };

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
      });

      controls.replaceChild(input, valueEl);
      input.focus();
      input.select();
    });

    const plusBtn = document.createElement('button');
    plusBtn.className = 'settings-step-btn';
    plusBtn.textContent = '+';
    plusBtn.addEventListener('click', () => {
      if (this.readOnly) return;
      const current = this.settings[config.key] as number;
      const next = Math.min(config.max, current + config.step);
      this.settings[config.key] = next;
      this.updateValueDisplay(config.key);
      this.updateDifficulty();
    });

    controls.appendChild(minusBtn);
    controls.appendChild(valueEl);
    controls.appendChild(plusBtn);
    row.appendChild(controls);

    return row;
  }

  private updateValueDisplay(key: string): void {
    const el = this.valueDisplays.get(key);
    if (el) {
      el.textContent = String((this.settings as unknown as Record<string, unknown>)[key]);
    }
  }

  // ── Curve section (identical to current) ──

  private buildCurveSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'settings-curve-section';

    const curveLabel = document.createElement('div');
    curveLabel.className = 'settings-curve-label';
    curveLabel.textContent = 'Difficulty Curve';
    section.appendChild(curveLabel);

    // Canvas wrapper for responsiveness
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'settings-curve-wrap';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'settings-curve-canvas';
    this.canvas.width = CURVE_WIDTH;
    this.canvas.height = CURVE_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;

    this.attachCurveListeners();

    canvasWrap.appendChild(this.canvas);
    section.appendChild(canvasWrap);

    const hint = document.createElement('div');
    hint.className = 'settings-curve-hint';
    hint.textContent = 'Drag points to adjust difficulty. Beyond wave 20, difficulty extrapolates.';
    section.appendChild(hint);

    return section;
  }

  // ── Preset buttons ──

  private buildPresetButtons(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-preset-row';

    const presets: Array<{ name: string; settings: GameSettings }> = [
      { name: 'Easy', settings: EASY_SETTINGS },
      { name: 'Normal', settings: DEFAULT_GAME_SETTINGS },
      { name: 'Hard', settings: HARD_SETTINGS },
    ];

    for (const preset of presets) {
      const btn = document.createElement('button');
      btn.className = 'settings-preset-btn';
      btn.textContent = preset.name;
      btn.addEventListener('click', () => {
        if (this.readOnly) return;
        this.applyPreset(preset.settings);
      });
      row.appendChild(btn);
    }

    return row;
  }

  private applyPreset(preset: GameSettings): void {
    this.settings = structuredClone(preset);
    this.refreshAll();
    // Re-render current tab to pick up new overrides
    this.switchTab(this.activeTab);
  }

  // ── Saved presets rendering ──

  private renderSavedPresets(): void {
    const wrap = this.savedPresetsWrap;
    wrap.textContent = '';

    if (!this.username || this.readOnly) return;

    const presets = this.loadSavedPresets();
    const names = Object.keys(presets);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-preset-btn settings-save-btn';
    saveBtn.textContent = 'Save As\u2026';
    saveBtn.addEventListener('click', () => {
      this.promptSaveName();
    });
    wrap.appendChild(saveBtn);

    if (names.length === 0) return;

    // Saved preset chips
    for (const name of names) {
      const chip = document.createElement('span');
      chip.className = 'settings-saved-chip';

      const nameEl = document.createElement('span');
      nameEl.className = 'settings-saved-chip-name';
      nameEl.textContent = name;
      nameEl.addEventListener('click', () => {
        this.loadSavedPreset(name);
      });
      chip.appendChild(nameEl);

      const delBtn = document.createElement('span');
      delBtn.className = 'settings-saved-chip-del';
      delBtn.textContent = '\u00d7';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteSavedPreset(name);
      });
      chip.appendChild(delBtn);

      wrap.appendChild(chip);
    }
  }

  private promptSaveName(): void {
    // Replace the save button with an inline input
    const wrap = this.savedPresetsWrap;
    const existing = wrap.querySelector('.settings-save-input-wrap');
    if (existing) return; // already prompting

    const inputWrap = document.createElement('div');
    inputWrap.className = 'settings-save-input-wrap';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'settings-save-input';
    input.placeholder = 'Preset name...';
    input.maxLength = 20;

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'settings-preset-btn';
    confirmBtn.textContent = 'Save';

    const commit = () => {
      const name = input.value.trim();
      if (name.length > 0) {
        this.saveCurrentAs(name);
      } else {
        this.renderSavedPresets();
      }
    };

    const cancel = () => {
      this.renderSavedPresets();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });

    confirmBtn.addEventListener('click', commit);

    inputWrap.appendChild(input);
    inputWrap.appendChild(confirmBtn);
    wrap.appendChild(inputWrap);

    input.focus();
  }

  // ── Refresh everything ──

  private refreshAll(): void {
    for (const field of NUMBER_FIELDS) {
      this.updateValueDisplay(field.key);
    }
    this.updateDifficulty();
    this.drawCurve();
    this.renderSavedPresets();
  }

  // ── Read-only support ──

  private setAllInputsDisabled(disabled: boolean): void {
    // This is called before tabs render, so we also guard in event handlers
    // For sliders, buttons etc already in DOM:
    const inputs = this.root.querySelectorAll('input, button');
    inputs.forEach((el) => {
      if (el === this.doneBtn) return; // Done/Back button stays active
      (el as HTMLInputElement | HTMLButtonElement).disabled = disabled;
    });
  }

  // ── Canvas drawing (identical to current) ──

  private plotX(waveIndex: number): number {
    const plotW = CURVE_WIDTH - CURVE_PAD_LEFT - CURVE_PAD_RIGHT;
    return CURVE_PAD_LEFT + (waveIndex / (NUM_WAVES - 1)) * plotW;
  }

  private plotY(value: number): number {
    const plotH = CURVE_HEIGHT - CURVE_PAD_TOP - CURVE_PAD_BOTTOM;
    const t = (value - CURVE_MIN_Y) / (CURVE_MAX_Y - CURVE_MIN_Y);
    return CURVE_PAD_TOP + plotH * (1 - t);
  }

  private valueFromY(canvasY: number): number {
    const plotH = CURVE_HEIGHT - CURVE_PAD_TOP - CURVE_PAD_BOTTOM;
    const t = 1 - (canvasY - CURVE_PAD_TOP) / plotH;
    const val = CURVE_MIN_Y + t * (CURVE_MAX_Y - CURVE_MIN_Y);
    return Math.round(Math.max(CURVE_MIN_Y, Math.min(CURVE_MAX_Y, val)) * 10) / 10;
  }

  private drawCurve(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = CURVE_WIDTH;
    const h = CURVE_HEIGHT;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const yTicks = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const yVal of yTicks) {
      const y = this.plotY(yVal);
      ctx.beginPath();
      ctx.moveTo(CURVE_PAD_LEFT, y);
      ctx.lineTo(w - CURVE_PAD_RIGHT, y);
      ctx.stroke();
    }

    // Y axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px "DM Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const yVal of [0, 2, 4, 6, 8, 10]) {
      ctx.fillText(`${yVal}x`, CURVE_PAD_LEFT - 6, this.plotY(yVal));
    }

    // X axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i < NUM_WAVES; i += 4) {
      ctx.fillText(String(i + 1), this.plotX(i), h - CURVE_PAD_BOTTOM + 6);
    }
    // Always label last wave
    ctx.fillText('20', this.plotX(19), h - CURVE_PAD_BOTTOM + 6);

    // Curve line
    const curve = this.settings.difficultyCurve;
    ctx.strokeStyle = '#4A9EFF';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < NUM_WAVES; i++) {
      const x = this.plotX(i);
      const y = this.plotY(curve[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Fill under curve
    ctx.fillStyle = 'rgba(74, 158, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(this.plotX(0), this.plotY(0));
    for (let i = 0; i < NUM_WAVES; i++) {
      ctx.lineTo(this.plotX(i), this.plotY(curve[i]));
    }
    ctx.lineTo(this.plotX(NUM_WAVES - 1), this.plotY(0));
    ctx.closePath();
    ctx.fill();

    // Control points
    for (let i = 0; i < NUM_WAVES; i++) {
      const x = this.plotX(i);
      const y = this.plotY(curve[i]);

      // Outer glow for dragged point
      if (this.draggingIndex === i) {
        ctx.fillStyle = 'rgba(74, 158, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(x, y, POINT_RADIUS + 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = this.draggingIndex === i ? '#4A9EFF' : '#fff';
      ctx.beginPath();
      ctx.arc(x, y, POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Inner dot
      ctx.fillStyle = '#1a1a2e';
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Value tooltip when dragging
    if (this.draggingIndex !== null) {
      const i = this.draggingIndex;
      const x = this.plotX(i);
      const y = this.plotY(curve[i]);
      const text = `W${i + 1}: ${curve[i].toFixed(1)}x`;
      ctx.font = '11px "DM Mono", monospace';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      const tw = ctx.measureText(text).width + 10;
      const tooltipY = y - 24;
      ctx.beginPath();
      ctx.roundRect(x - tw / 2, tooltipY - 8, tw, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, tooltipY);
    }
  }

  // ── Canvas interaction (identical to current) ──

  private getCanvasCoords(e: MouseEvent | Touch): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private findPointAt(cx: number, cy: number): number | null {
    const curve = this.settings.difficultyCurve;
    let closest = -1;
    let closestDist = Infinity;
    for (let i = 0; i < NUM_WAVES; i++) {
      const px = this.plotX(i);
      const py = this.plotY(curve[i]);
      const dx = cx - px;
      const dy = cy - py;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < POINT_HIT_RADIUS && dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    }
    return closest >= 0 ? closest : null;
  }

  private attachCurveListeners(): void {
    // Mouse
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.readOnly) return;
      const { x, y } = this.getCanvasCoords(e);
      const idx = this.findPointAt(x, y);
      if (idx !== null) {
        this.draggingIndex = idx;
        this.canvas.style.cursor = 'grabbing';
        this.drawCurve();
        e.preventDefault();
      }
    });

    const onMouseMove = (e: MouseEvent) => {
      if (this.draggingIndex === null) return;
      const { y } = this.getCanvasCoords(e);
      this.settings.difficultyCurve[this.draggingIndex] = this.valueFromY(y);
      this.drawCurve();
      this.updateDifficulty();
      e.preventDefault();
    };

    const onMouseUp = () => {
      if (this.draggingIndex !== null) {
        this.draggingIndex = null;
        this.canvas.style.cursor = '';
        this.drawCurve();
      }
    };

    // Bind to window so dragging outside canvas still works
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    // Hover cursor
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.draggingIndex !== null) return;
      const { x, y } = this.getCanvasCoords(e);
      const idx = this.findPointAt(x, y);
      this.canvas.style.cursor = idx !== null ? 'grab' : '';
    });

    // Touch
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.readOnly) return;
      if (e.touches.length !== 1) return;
      const { x, y } = this.getCanvasCoords(e.touches[0]);
      const idx = this.findPointAt(x, y);
      if (idx !== null) {
        this.draggingIndex = idx;
        this.drawCurve();
        e.preventDefault();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.draggingIndex === null) return;
      const { y } = this.getCanvasCoords(e.touches[0]);
      this.settings.difficultyCurve[this.draggingIndex] = this.valueFromY(y);
      this.drawCurve();
      this.updateDifficulty();
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchend', () => {
      if (this.draggingIndex !== null) {
        this.draggingIndex = null;
        this.drawCurve();
      }
    });
  }
}
