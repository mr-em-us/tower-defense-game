import { GameState, GamePhase, PlayerSide } from '../../shared/types/game.types.js';

export interface StatsSnapshot {
  time: number;
  credits: number;
  health: number;
  wave: number;
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
      history.snapshots.push({
        time: this.elapsed,
        credits: player.credits,
        health: player.health,
        wave: state.waveNumber,
      });
    }
  }

  getHistories(): PlayerHistory[] {
    return Array.from(this.histories.values());
  }
}
