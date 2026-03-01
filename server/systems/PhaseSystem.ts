import { GameState, GamePhase } from '../../shared/types/game.types.js';
import { GAME, TOWER_STATS } from '../../shared/types/constants.js';

export class PhaseSystem {
  update(state: GameState, dt: number): void {
    if (state.phase === GamePhase.WAITING || state.phase === GamePhase.GAME_OVER) return;

    if (state.phase === GamePhase.BUILD) {
      // Build phase has no timer - transitions only when both players ready up
    } else if (state.phase === GamePhase.COMBAT) {
      const enemyCount = Object.keys(state.enemies).length;
      if (enemyCount === 0 && state.waveEnemiesRemaining <= 0) {
        this.transitionToBuild(state);
      }
    }

    // Check game over: a player loses when their HP reaches 0
    if (state.phase === GamePhase.COMBAT) {
      for (const player of Object.values(state.players)) {
        if (player.health <= 0) {
          state.phase = GamePhase.GAME_OVER;
          return;
        }
      }
    }
  }

  transitionToCombat(state: GameState): void {
    state.phase = GamePhase.COMBAT;
    state.phaseTimeRemaining = 0;
    // Sentinel so PhaseSystem doesn't immediately bounce back to BUILD
    // before WaveSystem gets a chance to populate the queue
    state.waveEnemiesRemaining = 1;

    // Refill all tower ammo at wave start
    for (const tower of Object.values(state.towers)) {
      const stats = TOWER_STATS[tower.type];
      tower.ammo = stats.maxAmmo;
    }

    for (const player of Object.values(state.players)) {
      player.isReady = false;
    }
  }

  transitionToBuild(state: GameState): void {
    state.waveNumber += 1;
    state.phase = GamePhase.BUILD;
    state.phaseTimeRemaining = GAME.BUILD_PHASE_DURATION;

    // Settle economy per player
    for (const player of Object.values(state.players)) {
      // Base income per wave
      player.credits += GAME.CREDITS_PER_WAVE;

      // Collect passive income and pay maintenance from owned towers
      let totalIncome = 0;
      let totalMaintenance = 0;

      for (const tower of Object.values(state.towers)) {
        if (tower.ownerId !== player.id) continue;
        const stats = TOWER_STATS[tower.type];

        totalIncome += stats.incomePerTurn;
        totalMaintenance += stats.maintenancePerTurn;
      }

      player.credits += totalIncome;
      player.credits -= totalMaintenance;

      player.isReady = false;
    }
  }

  handlePlayerReady(state: GameState, playerId: string): void {
    const player = state.players[playerId];
    if (!player || state.phase !== GamePhase.BUILD) return;
    player.isReady = true;

    const allReady = Object.values(state.players).every((p) => p.isReady);
    if (allReady) {
      this.transitionToCombat(state);
    }
  }
}
