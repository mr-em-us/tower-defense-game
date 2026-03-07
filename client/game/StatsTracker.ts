import { GameState, GamePhase, PlayerSide, TowerType } from '../../shared/types/game.types.js';
import { TOWER_STATS } from '../../shared/types/constants.js';

export interface StatsSnapshot {
  time: number;
  credits: number;
  health: number;
  wave: number;
  strength: number;
  difficulty: number;
}

export interface PlayerHistory {
  name: string;
  side: PlayerSide;
  snapshots: StatsSnapshot[];
}

export class StatsTracker {
  private histories = new Map<string, PlayerHistory>();
  private elapsed = 0;
  private lastSampleTime = -Infinity;
  private sampleInterval = 1.0;
  private started = false;

  recordTick(state: GameState, dt: number): void {
    // Only track once game has started (BUILD or COMBAT)
    if (state.phase === GamePhase.WAITING) return;

    if (!this.started) {
      this.started = true;
      this.elapsed = 0;
      this.lastSampleTime = -Infinity;
    }

    this.elapsed += dt;

    if (this.elapsed - this.lastSampleTime < this.sampleInterval) return;
    this.lastSampleTime = this.elapsed;

    // Compute difficulty for current wave
    const curve = state.settings.difficultyCurve;
    const waveIdx = Math.min(state.waveNumber - 1, curve.length - 1);
    const difficulty = waveIdx >= 0 ? curve[waveIdx] : 1.0;

    for (const player of Object.values(state.players)) {
      let history = this.histories.get(player.id);
      if (!history) {
        history = {
          name: player.id,
          side: player.side,
          snapshots: [],
        };
        this.histories.set(player.id, history);
      }

      // Compute total tower value for this player
      let towerValue = 0;
      for (const tower of Object.values(state.towers)) {
        if (tower.ownerId !== player.id) continue;
        const stats = TOWER_STATS[tower.type];
        let invested = stats.cost;
        for (let lvl = 1; lvl < tower.level; lvl++) {
          invested += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
        }
        towerValue += invested;
      }

      const strength = (towerValue + player.credits) / state.startingCredits;

      history.snapshots.push({
        time: this.elapsed,
        credits: player.credits,
        health: player.health,
        wave: state.waveNumber,
        strength,
        difficulty,
      });
    }
  }

  getHistories(): PlayerHistory[] {
    return Array.from(this.histories.values());
  }
}
