import { GameState, GamePhase, GameMode, TowerType, CellType, Tower, WaveEconomy } from '../../shared/types/game.types.js';
import { GAME, TOWER_STATS, PRICE_ESCALATION, PRICE_DECAY_RATE, MIN_DYNAMIC_PRICE } from '../../shared/types/constants.js';
import { wouldBlockPath } from '../../shared/logic/pathfinding.js';
import { v4 as uuid } from 'uuid';
import { log } from '../utils/logger.js';

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
    // In observer mode, only the AI player's health matters
    if (state.phase === GamePhase.COMBAT) {
      for (const player of Object.values(state.players)) {
        if (state.gameMode === GameMode.OBSERVER && !player.isAI) continue;
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

    for (const player of Object.values(state.players)) {
      player.isReady = false;
    }
  }

  transitionToBuild(state: GameState): void {
    // Log wave results before transitioning
    const killed = state.waveEnemiesKilled ?? 0;
    const total = state.waveEnemiesTotal ?? 0;
    const leaked = total - killed;
    const playerHealths = Object.values(state.players).map(p => `${p.name}:${Math.round(p.health)}HP`).join(', ');
    const towerCount = Object.keys(state.towers).length;
    const leakedTypes = Object.entries(state.waveLeakedByType ?? {})
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    const leakDetail = leaked > 0 && leakedTypes ? ` [${leakedTypes}]` : '';
    log(`[WAVE ${state.waveNumber} END] Killed: ${killed}/${total} (${leaked} leaked${leakDetail}) | Towers: ${towerCount} | ${playerHealths}`);

    state.waveNumber += 1;
    state.phase = GamePhase.BUILD;
    state.phaseTimeRemaining = GAME.BUILD_PHASE_DURATION;

    // Settle economy per player
    const waveBonus = GAME.CREDITS_PER_WAVE + (state.waveNumber - 1) * GAME.CREDITS_PER_WAVE_GROWTH;
    for (const player of Object.values(state.players)) {
      // Base income per wave (scales with wave number)
      player.credits += waveBonus;

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
      // Never let maintenance drive credits below zero
      if (player.credits < 0) player.credits = 0;

      player.isReady = false;
    }

    // Price decay: reduce global purchase counts by 5% per wave
    for (const type of Object.keys(state.globalPurchaseCounts)) {
      if (type === TowerType.BASIC || type === TowerType.WALL) continue;
      state.globalPurchaseCounts[type] *= (1 - PRICE_DECAY_RATE);
    }

    // Air wave scheduling: randomized with 3-wave warning
    if (state.airWaveCountdown > 0) {
      // Count down to scheduled air wave
      state.airWaveCountdown--;
    } else if (state.airWaveCountdown === 0) {
      // Air wave just happened, reset
      state.airWaveCountdown = -1;
    }
    // Schedule new air wave if none pending and wave >= 2 (will arrive wave >= 5)
    if (state.airWaveCountdown === -1 && state.waveNumber >= 2) {
      // ~35% chance each wave to schedule air 3 waves from now
      if (Math.random() < 0.35) {
        state.airWaveCountdown = 3;
      }
    }

    // Auto-rebuild destroyed towers
    const tracesToRemove: number[] = [];
    for (const player of Object.values(state.players)) {
      if (!player.autoRebuildEnabled) continue;
      for (let i = 0; i < state.destroyedTowerTraces.length; i++) {
        const trace = state.destroyedTowerTraces[i];
        if (trace.ownerId !== player.id) continue;

        // Check cell is still empty
        if (state.grid.cells[trace.position.y][trace.position.x] !== CellType.EMPTY) continue;

        // Check rebuilding won't block paths
        if (wouldBlockPath(state.grid, trace.position.x, trace.position.y)) continue;

        const stats = TOWER_STATS[trace.type];
        const overrides = state.settings.towerOverrides?.[trace.type];
        // Compute dynamic price with cost override
        const costMult = overrides?.cost ?? 1;
        let cost = Math.round(stats.cost * costMult);
        if (trace.type !== TowerType.BASIC && trace.type !== TowerType.WALL) {
          const count = state.globalPurchaseCounts[trace.type] ?? 0;
          cost = Math.max(MIN_DYNAMIC_PRICE, Math.round(cost * (1 + count * PRICE_ESCALATION)));
        }

        if (player.credits < cost) continue;

        player.credits -= cost;

        // Place tower with stat overrides applied
        const tower: Tower = {
          id: uuid(),
          type: trace.type,
          position: { x: trace.position.x, y: trace.position.y },
          ownerId: player.id,
          level: 1,
          damage: Math.round(stats.damage * (overrides?.damage ?? 1)),
          range: +(stats.range * (overrides?.range ?? 1)).toFixed(1),
          fireRate: +(stats.fireRate * (overrides?.fireRate ?? 1)).toFixed(2),
          lastFireTime: 0,
          targetId: null,
          health: Math.round(stats.maxHealth * (overrides?.maxHealth ?? 1)),
          maxHealth: Math.round(stats.maxHealth * (overrides?.maxHealth ?? 1)),
          ammo: Math.round(stats.maxAmmo * (overrides?.maxAmmo ?? 1)),
          maxAmmo: Math.round(stats.maxAmmo * (overrides?.maxAmmo ?? 1)),
          placedWave: state.waveNumber,
        };
        state.towers[tower.id] = tower;
        state.grid.cells[trace.position.y][trace.position.x] = CellType.TOWER;

        // Track economy
        const econ = state.waveEconomy[player.id];
        if (econ) econ.towerPurchases += cost;

        // Increment dynamic pricing
        if (trace.type !== TowerType.BASIC && trace.type !== TowerType.WALL) {
          state.globalPurchaseCounts[trace.type] = (state.globalPurchaseCounts[trace.type] ?? 0) + 1;
        }

        tracesToRemove.push(i);
      }
    }
    // Remove rebuilt traces (reverse order to preserve indices)
    for (const idx of tracesToRemove.sort((a, b) => b - a)) {
      state.destroyedTowerTraces.splice(idx, 1);
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
