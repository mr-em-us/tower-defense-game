import { GameState, GamePhase, GameMode, PlayerSide, TowerType, CellType, Player, WaveEconomy } from '../../shared/types/game.types.js';
import { GAME, GRID, TOWER_STATS, PRICE_ESCALATION, PRICE_DECAY_RATE, MIN_DYNAMIC_PRICE } from '../../shared/types/constants.js';
import { wouldBlockPath } from '../../shared/logic/pathfinding.js';
import { pickAIName } from '../ai/names.js';
import { createTower } from '../game/towerFactory.js';
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

    // Check game over / AI respawn
    if (state.phase === GamePhase.COMBAT) {
      for (const player of Object.values(state.players)) {
        if (state.gameMode === GameMode.OBSERVER && !player.isAI) continue;
        if (player.health <= 0) {
          // In SINGLE mode with AI: mark AI for respawn at next build phase
          // Don't respawn mid-combat — let the wave finish first
          if (state.gameMode === GameMode.SINGLE && player.isAI) {
            if (!(player as any)._deathCounted) {
              (player as any)._deathCounted = true;
              state.aiDefeatedCount++;
              log(`[AI DEATH] ${player.name} died during wave ${state.waveNumber} — will respawn at build phase`);
            }
            player.health = 0;
            continue;
          }
          state.phase = GamePhase.GAME_OVER;
          return;
        }
      }
    }
  }

  private respawnAI(state: GameState, aiPlayer: Player): void {
    // Clear death flag so next death can be counted
    delete (aiPlayer as any)._deathCounted;

    // Calculate human's total tower value
    let humanTowerValue = 0;
    for (const tower of Object.values(state.towers)) {
      if (tower.ownerId !== aiPlayer.id) {
        const stats = TOWER_STATS[tower.type];
        const baseCost = stats.cost;
        // Account for upgrade levels
        let totalCost = baseCost;
        for (let lvl = 1; lvl < tower.level; lvl++) {
          totalCost += Math.round(baseCost * stats.upgradeCostMultiplier * lvl);
        }
        humanTowerValue += totalCost;
      }
    }

    // Remove all AI towers and clear their grid cells
    const aiTowerIds: string[] = [];
    for (const [id, tower] of Object.entries(state.towers)) {
      if (tower.ownerId === aiPlayer.id) {
        aiTowerIds.push(id);
        state.grid.cells[tower.position.y][tower.position.x] = CellType.EMPTY;
      }
    }
    for (const id of aiTowerIds) {
      delete state.towers[id];
    }

    // Remove all AI projectiles
    for (const [id, proj] of Object.entries(state.projectiles)) {
      if (proj.towerId && aiTowerIds.includes(proj.towerId)) {
        delete state.projectiles[id];
      }
    }

    // Reset AI: full health, budget = 120% of human's tower value
    const newBudget = Math.round(humanTowerValue * 1.2);
    const oldName = aiPlayer.name;
    const newName = pickAIName();
    aiPlayer.health = aiPlayer.maxHealth;
    aiPlayer.credits = newBudget;
    aiPlayer.name = newName;

    // Signal GameRoom to broadcast the defeat modal
    state.pendingAiRespawn = {
      aiName: oldName,
      newAiName: newName,
      wave: state.waveNumber,
      newBudget,
    };

    log(`[AI RESPAWN] ${oldName} defeated (#${state.aiDefeatedCount})! New challenger: ${newName} with ${newBudget}c (human towers worth ${humanTowerValue}c)`);
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
    // Per-player economy breakdown
    for (const p of Object.values(state.players)) {
      const towers = Object.values(state.towers).filter(t => t.ownerId === p.id);
      const towerValue = towers.reduce((sum, t) => {
        const stats = TOWER_STATS[t.type];
        let cost = stats.cost;
        for (let lvl = 1; lvl < t.level; lvl++) cost += Math.round(stats.cost * stats.upgradeCostMultiplier * lvl);
        return sum + cost;
      }, 0);
      const netIncome = towers.reduce((sum, t) => sum + TOWER_STATS[t.type].incomePerTurn - TOWER_STATS[t.type].maintenancePerTurn, 0);
      const econ = state.waveEconomy[p.id];
      const econStr = econ
        ? `kills=${Math.round(econ.killRewards)}c buys=${Math.round(econ.towerPurchases)}c ups=${Math.round(econ.towerUpgrades)}c repair=${Math.round(econ.repairCosts)}c restock=${Math.round(econ.restockCosts)}c sells=${Math.round(econ.sellRefunds)}c shots=${econ.shotsFired} ammo=${econ.ammoUsed}`
        : 'no-econ';
      const towerTypes: Record<string, number> = {};
      for (const t of towers) towerTypes[t.type] = (towerTypes[t.type] ?? 0) + 1;
      const typeStr = Object.entries(towerTypes).map(([t, c]) => `${t}:${c}`).join(' ');
      log(`[WAVE ${state.waveNumber} END] ${p.name}${p.isAI ? '(AI)' : ''}: ${Math.round(p.health)}HP ${Math.round(p.credits)}c | ${towers.length} towers (${typeStr}) val=${towerValue}c inc=${netIncome}c/w | ${econStr}`);
    }
    log(`[WAVE ${state.waveNumber} END] Combat: ${killed}/${total} killed (${leaked} leaked${leakDetail})`);

    // Respawn dead AI at build phase transition
    if (state.gameMode === GameMode.SINGLE) {
      for (const player of Object.values(state.players)) {
        if (player.isAI && player.health <= 0) {
          this.respawnAI(state, player);
        }
      }
    }

    state.waveNumber += 1;
    state.phase = GamePhase.BUILD;
    state.phaseTimeRemaining = GAME.BUILD_PHASE_DURATION;

    // Settle economy per player
    const waveBonus = GAME.CREDITS_PER_WAVE + (state.waveNumber - 1) * GAME.CREDITS_PER_WAVE_GROWTH;
    for (const player of Object.values(state.players)) {
      const creditsBefore = player.credits;

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

      const towerCount = Object.values(state.towers).filter(t => t.ownerId === player.id).length;
      log(`[SETTLE] ${player.name}: ${Math.round(creditsBefore)}c + ${waveBonus}c wave + ${totalIncome}c income - ${totalMaintenance}c maint = ${Math.round(player.credits)}c | ${towerCount} towers`);

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
      // Air wave just happened, reset. Wait one wave before re-scheduling
      // so the siren warning doesn't fire immediately after an air wave ends.
      state.airWaveCountdown = -1;
    } else if (state.airWaveCountdown === -1 && state.waveNumber >= 2) {
      // ~35% chance each wave to schedule air 3 waves from now
      if (Math.random() < 0.35) {
        state.airWaveCountdown = 3;
      }
    }

    // Auto-rebuild destroyed towers
    const tracesToRemove: number[] = [];
    const traceCount = state.destroyedTowerTraces.length;
    if (traceCount > 0) {
      log(`[REBUILD] ${traceCount} destroyed tower traces pending`);
    }
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

        // Rebuild at the trace's original level — player pays only base cost but
        // gets back the tower with all its upgrades intact.
        const tower = createTower(state, player.id, trace.type, trace.position, trace.level);
        state.towers[tower.id] = tower;
        state.grid.cells[trace.position.y][trace.position.x] = CellType.TOWER;
        state.gridVersion++;

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
