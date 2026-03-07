import { PlayerSide, GameState, WaveEconomy } from '../../shared/types/game.types.js';
import { VISUAL } from '../../shared/types/constants.js';
import { GameClient } from '../game/GameClient.js';
import { StatsTracker, PlayerHistory } from '../game/StatsTracker.js';

const PLAYER_COLORS: Record<string, string> = {
  [PlayerSide.LEFT]: '#4A9EFF',
  [PlayerSide.RIGHT]: '#FF6B6B',
};

const TABS = ['credits', 'health', 'ledger'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = { credits: 'CREDITS', health: 'HP', ledger: 'ECON' };

const CHART_W = 260;
const CHART_H = 140;
const HEADER_H = 18; // tab row height
const TOTAL_H = HEADER_H + CHART_H;

export class ChartsOverlay {
  private visible = false;
  private activeTab: Tab = 'credits';

  constructor(
    private gameClient: GameClient,
    private statsTracker: StatsTracker,
  ) {}

  show(): void { this.visible = true; }
  hide(): void { this.visible = false; }
  toggle(): void { this.visible = !this.visible; }
  isVisible(): boolean { return this.visible; }

  getActiveTab(): Tab { return this.activeTab; }

  cycleTab(): void {
    const idx = TABS.indexOf(this.activeTab);
    this.activeTab = TABS[(idx + 1) % TABS.length];
  }

  /** Draw directly onto the game canvas context. x,y = top-left of widget area. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.visible) return;
    const histories = this.statsTracker.getHistories();

    // Tab row
    ctx.font = `12px ${VISUAL.FONT}`;
    ctx.textBaseline = 'top';
    let tx = x;
    for (const tab of TABS) {
      const isActive = tab === this.activeTab;
      ctx.fillStyle = isActive ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'left';
      ctx.fillText(TAB_LABELS[tab], tx, y);
      const w = ctx.measureText(TAB_LABELS[tab]).width;
      if (isActive) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, y + 15);
        ctx.lineTo(tx + w, y + 15);
        ctx.stroke();
      }
      tx += w + 12;
    }

    // Legend (inline after tabs, only if multiplayer and on chart tab)
    if (this.activeTab !== 'ledger' && histories.length > 1) {
      tx += 4;
      for (const h of histories) {
        const color = PLAYER_COLORS[h.side] || '#fff';
        const label = h.side === this.gameClient.getPlayerSide() ? 'You' : 'Opp';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, y + 7);
        ctx.lineTo(tx + 10, y + 7);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `11px ${VISUAL.FONT}`;
        ctx.fillText(label, tx + 12, y + 1);
        tx += 36;
      }
    }

    // Content background
    const chartX = x;
    const chartY = y + HEADER_H;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(chartX - 1, chartY - 1, CHART_W + 2, CHART_H + 2);

    if (this.activeTab === 'ledger') {
      this.renderLedger(ctx, chartX, chartY, CHART_W, CHART_H);
    } else {
      this.renderChart(ctx, histories, this.activeTab, chartX, chartY, CHART_W, CHART_H);
    }
  }

  /** Returns total height of the widget for positioning. */
  getTotalHeight(): number { return TOTAL_H; }
  getWidth(): number { return CHART_W; }

  /** Hit test: is the click within the tab row? localX/Y relative to widget top-left. */
  hitTestTab(localX: number, localY: number): boolean {
    return localY >= 0 && localY <= HEADER_H && localX >= 0 && localX <= CHART_W;
  }

  /** Hit test: is the click anywhere inside the widget? */
  hitTestWidget(localX: number, localY: number): boolean {
    return localX >= 0 && localX <= CHART_W && localY >= 0 && localY <= TOTAL_H;
  }

  private renderLedger(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, cw: number, ch: number,
  ): void {
    const playerId = this.gameClient.getPlayerId();
    const state = this.gameClient.getState();
    if (!playerId || !state) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `12px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('waiting...', cx + cw / 2, cy + ch / 2);
      return;
    }

    const econ: WaveEconomy | undefined = state.waveEconomy[playerId];
    const pad = 6;
    const rowH = 12;
    const labelX = cx + pad;
    const valueX = cx + cw - pad;
    let ry = cy + pad;

    const drawRow = (label: string, value: number, isRevenue: boolean) => {
      ctx.font = `10px ${VISUAL.FONT}`;
      ctx.textBaseline = 'top';
      // Label
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(label, labelX, ry);
      // Value
      const prefix = isRevenue ? '+' : '-';
      ctx.fillStyle = isRevenue ? '#4ADE80' : '#EF4444';
      ctx.textAlign = 'right';
      ctx.fillText(`${prefix}${Math.round(value)}c`, valueX, ry);
      ry += rowH;
    };

    const drawDivider = () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + pad, ry + 2);
      ctx.lineTo(cx + cw - pad, ry + 2);
      ctx.stroke();
      ry += 6;
    };

    if (!econ) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `12px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('no data', cx + cw / 2, cy + ch / 2);
      return;
    }

    // Revenue rows
    drawRow('Kill Rewards', econ.killRewards, true);
    drawRow('Wave Bonus', econ.waveBonus, true);
    drawRow('Tower Income', econ.towerIncome, true);
    drawRow('Sell Refunds', econ.sellRefunds, true);

    drawDivider();

    // Expense rows
    drawRow('Towers', econ.towerPurchases, false);
    drawRow('Upgrades', econ.towerUpgrades, false);
    drawRow('Repairs', econ.repairCosts, false);
    drawRow('Restock', econ.restockCosts, false);
    drawRow('Maintenance', econ.maintenanceCosts, false);

    drawDivider();

    // Net total
    const totalRev = econ.killRewards + econ.waveBonus + econ.towerIncome + econ.sellRefunds;
    const totalExp = econ.towerPurchases + econ.towerUpgrades + econ.repairCosts + econ.restockCosts + econ.maintenanceCosts;
    const net = Math.round(totalRev - totalExp);

    ctx.font = `bold 11px ${VISUAL.FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('Net', labelX, ry);
    ctx.fillStyle = net >= 0 ? '#4ADE80' : '#EF4444';
    ctx.textAlign = 'right';
    ctx.fillText(`${net >= 0 ? '+' : ''}${net}c`, valueX, ry);
  }

  private renderChart(
    ctx: CanvasRenderingContext2D,
    histories: PlayerHistory[],
    field: 'credits' | 'health',
    cx: number, cy: number, cw: number, ch: number,
  ): void {
    const pad = { top: 4, right: 4, bottom: 16, left: 36 };
    const plotW = cw - pad.left - pad.right;
    const plotH = ch - pad.top - pad.bottom;
    const ox = cx + pad.left;
    const oy = cy + pad.top;

    if (histories.length === 0 || histories.every(h => h.snapshots.length < 2)) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `12px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('waiting...', cx + cw / 2, cy + ch / 2);
      return;
    }

    // Data range
    let minTime = Infinity, maxTime = -Infinity;
    let minVal = Infinity, maxVal = -Infinity;
    for (const hist of histories) {
      for (const s of hist.snapshots) {
        if (s.time < minTime) minTime = s.time;
        if (s.time > maxTime) maxTime = s.time;
        const v = s[field];
        if (v < minVal) minVal = v;
        if (v > maxVal) maxVal = v;
      }
    }

    const valRange = maxVal - minVal || 1;
    minVal = Math.max(0, minVal - valRange * 0.08);
    maxVal = maxVal + valRange * 0.08;
    const timeRange = maxTime - minTime || 1;

    const toX = (t: number) => ox + ((t - minTime) / timeRange) * plotW;
    const toY = (v: number) => oy + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

    // Horizontal reference lines
    const yTicks = niceScale(minVal, maxVal, 4);
    ctx.font = `10px ${VISUAL.FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yTicks) {
      const y = toY(v);
      if (y < oy + 2 || y > oy + plotH - 2) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + plotW, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText(formatValue(v), ox - 2, y);
    }

    // Time labels
    const xTicks = niceScale(minTime, maxTime, 4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `10px ${VISUAL.FONT}`;
    for (const t of xTicks) {
      const x = toX(t);
      if (x < ox + 5 || x > ox + plotW - 5) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(formatTime(t), x, oy + plotH + 1);
    }

    // Wave markers
    const firstHist = histories[0];
    if (firstHist) {
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      let prevWave = 0;
      for (const s of firstHist.snapshots) {
        if (s.wave !== prevWave && s.wave > 0) {
          const x = toX(s.time);
          ctx.beginPath();
          ctx.moveTo(x, oy);
          ctx.lineTo(x, oy + plotH);
          ctx.stroke();
          prevWave = s.wave;
        }
      }
      ctx.restore();
    }

    // Data lines
    for (const hist of histories) {
      if (hist.snapshots.length < 2) continue;
      const color = PLAYER_COLORS[hist.side] || '#fff';

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < hist.snapshots.length; i++) {
        const s = hist.snapshots[i];
        const x = toX(s.time);
        const y = toY(s[field]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Dot at latest
      const last = hist.snapshots[hist.snapshots.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(last.time), toY(last[field]), 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function niceScale(min: number, max: number, targetTicks: number): number[] {
  const range = max - min || 1;
  const rawStep = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  let step: number;
  const normalized = rawStep / mag;
  if (normalized <= 1.5) step = mag;
  else if (normalized <= 3.5) step = 2 * mag;
  else if (normalized <= 7.5) step = 5 * mag;
  else step = 10 * mag;

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

function formatValue(v: number): string {
  if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
  return v.toFixed(0);
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}
