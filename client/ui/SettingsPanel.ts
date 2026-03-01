import { GameSettings } from '../../shared/types/game.types.js';
import { DEFAULT_GAME_SETTINGS } from '../../shared/types/constants.js';

const EASY_SETTINGS: GameSettings = {
  startingHealth: 1000,
  startingCredits: 5000,
  firstWaveEnemies: 30,
  difficultyCurve: [
    1.0, 1.0, 1.0, 1.1, 1.1,
    1.2, 1.3, 1.4, 1.5, 1.6,
    1.7, 1.8, 2.0, 2.2, 2.4,
    2.5, 2.6, 2.7, 2.8, 3.0,
  ],
};

const HARD_SETTINGS: GameSettings = {
  startingHealth: 300,
  startingCredits: 1000,
  firstWaveEnemies: 100,
  difficultyCurve: [
    1.0, 1.3, 1.6, 2.0, 2.4,
    2.9, 3.4, 4.0, 4.6, 5.2,
    5.8, 6.4, 7.0, 7.5, 8.0,
    8.4, 8.8, 9.2, 9.6, 10.0,
  ],
};

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
  { label: 'First Wave Enemies', key: 'firstWaveEnemies', min: 5, max: 500, step: 5, default: 60 },
];

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

export class SettingsPanel {
  private root: HTMLElement;
  private settings: GameSettings;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private draggingIndex: number | null = null;
  private valueDisplays: Map<string, HTMLElement> = new Map();
  private resolvePromise: ((settings: GameSettings) => void) | null = null;

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
    if (initial) {
      this.settings = structuredClone(initial);
      for (const field of NUMBER_FIELDS) {
        this.updateValueDisplay(field.key);
      }
    }
    this.root.classList.remove('hidden');
    this.drawCurve();
    return new Promise<GameSettings>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  private buildDOM(): void {
    // Title
    const title = document.createElement('h1');
    title.className = 'settings-title';
    title.textContent = 'GAME SETTINGS';
    this.root.appendChild(title);

    // Scrollable content area
    const content = document.createElement('div');
    content.className = 'settings-content';

    // Number fields
    const fieldsSection = document.createElement('div');
    fieldsSection.className = 'settings-fields';
    for (const field of NUMBER_FIELDS) {
      fieldsSection.appendChild(this.buildNumberField(field));
    }
    content.appendChild(fieldsSection);

    // Difficulty curve section
    content.appendChild(this.buildCurveSection());

    // Preset buttons
    content.appendChild(this.buildPresetButtons());

    this.root.appendChild(content);

    // Start game button
    const startBtn = document.createElement('button');
    startBtn.className = 'settings-start-btn';
    startBtn.textContent = 'Done';
    startBtn.addEventListener('click', () => {
      this.hide();
      if (this.resolvePromise) {
        this.resolvePromise(structuredClone(this.settings));
        this.resolvePromise = null;
      }
    });
    this.root.appendChild(startBtn);
  }

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
      const current = this.settings[config.key] as number;
      const next = Math.max(config.min, current - config.step);
      this.settings[config.key] = next;
      this.updateValueDisplay(config.key);
    });

    const valueEl = document.createElement('span');
    valueEl.className = 'settings-field-value';
    valueEl.textContent = String(this.settings[config.key]);
    this.valueDisplays.set(config.key, valueEl);

    // Click value to edit inline
    valueEl.addEventListener('click', () => {
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
      const current = this.settings[config.key] as number;
      const next = Math.min(config.max, current + config.step);
      this.settings[config.key] = next;
      this.updateValueDisplay(config.key);
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
      el.textContent = String((this.settings as Record<string, unknown>)[key]);
    }
  }

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
        this.applyPreset(preset.settings);
      });
      row.appendChild(btn);
    }

    return row;
  }

  private applyPreset(preset: GameSettings): void {
    this.settings = structuredClone(preset);
    for (const field of NUMBER_FIELDS) {
      this.updateValueDisplay(field.key);
    }
    this.drawCurve();
  }

  // --- Canvas drawing ---

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

  // --- Canvas interaction ---

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
