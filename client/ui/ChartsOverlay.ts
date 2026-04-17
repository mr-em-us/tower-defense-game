import { PlayerSide, GameState, WaveEconomy } from '../../shared/types/game.types.js';
import { VISUAL } from '../../shared/types/constants.js';
import { GameClient } from '../game/GameClient.js';
import { StatsTracker, PlayerHistory } from '../game/StatsTracker.js';

const PLAYER_COLORS: Record<string, string> = {
  [PlayerSide.LEFT]: '#4A9EFF',
  [PlayerSide.RIGHT]: '#FF6B6B',
};

const TABS = ['credits', 'health', 'strength', 'ledger'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = {
  credits: 'CREDITS',
  health: 'HP',
  strength: 'STR',
  ledger: 'ECON',
};

const CHART_W = 260;
const CHART_H = 175;
const HEADER_H = 20; // tab row height (taller for pill buttons)
const TOTAL_H = HEADER_H + CHART_H;

export class ChartsOverlay {
  private visible = false;
  private activeTab: Tab = 'credits';
  private tabBounds: Array<{ tab: Tab; x: number; width: number }> = [];

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

  setTab(tab: Tab): void { this.activeTab = tab; }

  hitTestSpecificTab(localX: number, localY: number): Tab | null {
    if (localY < 0 || localY > HEADER_H) return null;
    for (const bound of this.tabBounds) {
      if (localX >= bound.x && localX <= bound.x + bound.width) {
        return bound.tab;
      }
    }
    return null;
  }

  /** Draw directly onto the game canvas context. x,y = top-left of widget area. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.visible) return;
    const histories = this.statsTracker.getHistories();

    // Tab row — pill-style buttons
    ctx.font = `bold 11px ${VISUAL.FONT}`;
    ctx.textBaseline = 'top';
    let tx = x;
    const tabPadH = 6;
    const tabPadV = 2;
    const tabH = 16;

    this.tabBounds = [];
    for (const tab of TABS) {
      const isActive = tab === this.activeTab;
      const label = TAB_LABELS[tab];
      const textW = ctx.measureText(label).width;
      const pillW = textW + tabPadH * 2;

      // Background pill
      ctx.fillStyle = isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
      const r = 4;
      const px = tx;
      const py = y;
      ctx.beginPath();
      ctx.moveTo(px + r, py);
      ctx.lineTo(px + pillW - r, py);
      ctx.arcTo(px + pillW, py, px + pillW, py + r, r);
      ctx.lineTo(px + pillW, py + tabH - r);
      ctx.arcTo(px + pillW, py + tabH, px + pillW - r, py + tabH, r);
      ctx.lineTo(px + r, py + tabH);
      ctx.arcTo(px, py + tabH, px, py + tabH - r, r);
      ctx.lineTo(px, py + r);
      ctx.arcTo(px, py, px + r, py, r);
      ctx.closePath();
      ctx.fill();

      // Border
      ctx.strokeStyle = isActive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text
      ctx.fillStyle = isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'left';
      ctx.fillText(label, tx + tabPadH, y + tabPadV + 1);

      this.tabBounds.push({ tab, x: tx - x, width: pillW });
      tx += pillW + 5;
    }

    // Legend (inline after tabs, only if multiplayer and on single-field chart tab)
    if (this.activeTab !== 'ledger' && histories.length > 1) {
      tx += 4;
      const state = this.gameClient.getState();
      for (const h of histories) {
        const color = PLAYER_COLORS[h.side] || '#fff';
        // Look up current player name from state; fall back to history.name (playerId).
        const matching = state ? Object.values(state.players).find(p => p.side === h.side) : null;
        const label = matching?.name ?? (h.side === this.gameClient.getPlayerSide() ? 'You' : 'Opp');
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, y + 8);
        ctx.lineTo(tx + 10, y + 8);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `10px ${VISUAL.FONT}`;
        ctx.fillText(label, tx + 12, y + 2);
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
    } else if (this.activeTab === 'strength') {
      this.renderStrengthChart(ctx, histories, chartX, chartY, CHART_W, CHART_H);
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
    const rowH = 11;
    const labelX = cx + pad;
    const valueX = cx + cw - pad;
    let ry = cy + pad;

    const drawRow = (label: string, value: number, isRevenue: boolean) => {
      ctx.font = `10px ${VISUAL.FONT}`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(label, labelX, ry);
      const prefix = isRevenue ? '+' : '-';
      ctx.fillStyle = isRevenue ? '#4ADE80' : '#EF4444';
      ctx.textAlign = 'right';
      ctx.fillText(`${prefix}${Math.round(value).toLocaleString()}c`, valueX, ry);
      ry += rowH;
    };

    const drawDivider = () => {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + pad, ry + 2);
      ctx.lineTo(cx + cw - pad, ry + 2);
      ctx.stroke();
      ry += 5;
    };

    if (!econ) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `12px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('no data', cx + cw / 2, cy + ch / 2);
      return;
    }

    // Starting balance
    ctx.font = `bold 10px ${VISUAL.FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('Starting', labelX, ry);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(econ.startingCredits).toLocaleString()}c`, valueX, ry);
    ry += rowH;

    drawDivider();

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
    ctx.fillText(`${net >= 0 ? '+' : ''}${net.toLocaleString()}c`, valueX, ry);
    ry += rowH + 2;

    // Current balance
    ctx.font = `bold 11px ${VISUAL.FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('Current', labelX, ry);
    const currentCredits = Math.floor(state.players[playerId]?.credits ?? 0);
    ctx.fillStyle = '#4A9EFF';
    ctx.textAlign = 'right';
    ctx.fillText(`${currentCredits.toLocaleString()}c`, valueX, ry);
  }

  /** Dual-line chart: strength vs difficulty (amber), supports all players in multiplayer */
  private renderStrengthChart(
    ctx: CanvasRenderingContext2D,
    histories: PlayerHistory[],
    cx: number, cy: number, cw: number, ch: number,
  ): void {
    const pad = { top: 4, right: 4, bottom: 16, left: 36 };
    const plotW = cw - pad.left - pad.right;
    const plotH = ch - pad.top - pad.bottom;
    const ox = cx + pad.left;
    const oy = cy + pad.top;

    // Use all histories with sufficient data
    const validHistories = histories.filter(h => h.snapshots.length >= 2);
    if (validHistories.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = `12px ${VISUAL.FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('waiting...', cx + cw / 2, cy + ch / 2);
      return;
    }

    // Compute time and strength ranges across ALL valid histories
    let minTime = Infinity, maxTime = -Infinity;
    let minVal = Infinity, maxVal = -Infinity;
    let minDiff = Infinity, maxDiff = -Infinity;
    for (const hist of validHistories) {
      for (const s of hist.snapshots) {
        if (s.time < minTime) minTime = s.time;
        if (s.time > maxTime) maxTime = s.time;
        if (s.strength < minVal) minVal = s.strength;
        if (s.strength > maxVal) maxVal = s.strength;
        if (s.difficulty < minDiff) minDiff = s.difficulty;
        if (s.difficulty > maxDiff) maxDiff = s.difficulty;
      }
    }
    const timeRange = maxTime - minTime || 1;

    // Pad ranges
    const valRange = maxVal - minVal || 1;
    minVal = Math.max(0, minVal - valRange * 0.08);
    maxVal = maxVal + valRange * 0.08;
    const diffRange = maxDiff - minDiff || 1;
    minDiff = Math.max(0, minDiff - diffRange * 0.08);
    maxDiff = maxDiff + diffRange * 0.08;

    const toX = (t: number) => ox + ((t - minTime) / timeRange) * plotW;
    const toYVal = (v: number) => oy + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;
    const toYDiff = (v: number) => oy + plotH - ((v - minDiff) / (maxDiff - minDiff)) * plotH;

    // Y-axis ticks (strength, left side) — formatted as multiplier
    const yTicks = niceScale(minVal, maxVal, 4);
    ctx.font = `10px ${VISUAL.FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of yTicks) {
      const y = toYVal(v);
      if (y < oy + 2 || y > oy + plotH - 2) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, y);
      ctx.lineTo(ox + plotW, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(74,158,255,0.5)';
      ctx.fillText(v.toFixed(1) + 'x', ox - 2, y);
    }

    // Time labels
    const xTicks = niceScale(minTime, maxTime, 4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `10px ${VISUAL.FONT}`;
    for (const t of xTicks) {
      const xp = toX(t);
      if (xp < ox + 5 || xp > ox + plotW - 5) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(formatTime(t), xp, oy + plotH + 1);
    }

    // Wave markers (from first valid history — shared data)
    const firstHist = validHistories[0];
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    let prevWave = 0;
    for (const s of firstHist.snapshots) {
      if (s.wave !== prevWave && s.wave > 0) {
        const xp = toX(s.time);
        ctx.beginPath();
        ctx.moveTo(xp, oy);
        ctx.lineTo(xp, oy + plotH);
        ctx.stroke();
        prevWave = s.wave;
      }
    }
    ctx.restore();

    // Strength lines — one per player in their player color
    for (const hist of validHistories) {
      const color = PLAYER_COLORS[hist.side] || '#fff';
      const snaps = hist.snapshots;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < snaps.length; i++) {
        const xp = toX(snaps[i].time);
        const yp = toYVal(snaps[i].strength);
        if (i === 0) ctx.moveTo(xp, yp);
        else ctx.lineTo(xp, yp);
      }
      ctx.stroke();

      // Dot at latest
      const last = snaps[snaps.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(last.time), toYVal(last.strength), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Difficulty line (amber) — shared, drawn once from first history
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < firstHist.snapshots.length; i++) {
      const xp = toX(firstHist.snapshots[i].time);
      const yp = toYDiff(firstHist.snapshots[i].difficulty);
      if (i === 0) ctx.moveTo(xp, yp);
      else ctx.lineTo(xp, yp);
    }
    ctx.stroke();

    // Difficulty dot at latest
    const lastDiff = firstHist.snapshots[firstHist.snapshots.length - 1];
    ctx.fillStyle = '#FBBF24';
    ctx.beginPath();
    ctx.arc(toX(lastDiff.time), toYDiff(lastDiff.difficulty), 2, 0, Math.PI * 2);
    ctx.fill();

    // Legend at top-right of chart area
    const legX = ox + plotW - 4;
    const legY = oy + 2;
    ctx.font = `9px ${VISUAL.FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';

    let legOffset = 0;

    // Strength legend — only show in single player (multiplayer uses main legend)
    if (validHistories.length <= 1) {
      ctx.strokeStyle = PLAYER_COLORS[validHistories[0].side] || '#4A9EFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(legX - 42, legY + 4);
      ctx.lineTo(legX - 32, legY + 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('Strength', legX - 44, legY);
      legOffset = 10;
    }

    // Difficulty legend
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(legX - 42, legY + legOffset + 4);
    ctx.lineTo(legX - 32, legY + legOffset + 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('Difficulty', legX - 54, legY + legOffset);

    // Difficulty y-axis labels on right side
    const diffTicks = niceScale(minDiff, maxDiff, 3);
    ctx.font = `9px ${VISUAL.FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const v of diffTicks) {
      const y = toYDiff(v);
      if (y < oy + 2 || y > oy + plotH - 2) continue;
      ctx.fillStyle = 'rgba(251,191,36,0.4)';
      ctx.fillText(v.toFixed(1) + 'x', ox + plotW + 2, y);
    }
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
