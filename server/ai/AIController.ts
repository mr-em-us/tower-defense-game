import { GameState, GamePhase, PlayerSide, AIDifficulty, TowerType, CellType } from '../../shared/types/game.types.js';
import { ClientMessage } from '../../shared/types/network.types.js';
import { AI, TOWER_STATS, REPAIR_COST_RATIO } from '../../shared/types/constants.js';
import { validateTowerPlacement } from '../../shared/logic/pathfinding.js';
import { planEconomy, getMaintenanceActions, getUpgradeActions, getDynamicPrice } from './strategies/economy.js';
import { generateMazeLayout } from './strategies/maze.js';
import { log } from '../utils/logger.js';

export class AIController {
  readonly playerId: string;
  readonly playerName: string;
  readonly side: PlayerSide;

  private depth: number;
  private actionQueue: ClientMessage[] = [];
  private tickCounter = 0;
  private readyDelayCounter = 0;
  private lastPhase: GamePhase = GamePhase.WAITING;
  private combatCheckCounter = 0;
  private hasEnabledAutoRepair = false;
  private readySent = false;

  constructor(playerId: string, name: string, side: PlayerSide, difficulty: AIDifficulty) {
    this.playerId = playerId;
    this.playerName = name;
    this.side = side;
    this.depth = difficulty === AIDifficulty.EASY ? AI.DEPTH_EASY
               : difficulty === AIDifficulty.HARD ? AI.DEPTH_HARD
               : AI.DEPTH_MEDIUM;
  }

  /**
   * Called every server tick. Returns 0 or 1 ClientMessage to execute.
   */
  tick(state: GameState): ClientMessage | null {
    // Detect phase transition → BUILD: plan all actions
    if (state.phase === GamePhase.BUILD && this.lastPhase !== GamePhase.BUILD) {
      this.onBuildPhaseStart(state);
    }

    // Detect phase transition → COMBAT: clear remaining build queue
    if (state.phase === GamePhase.COMBAT && this.lastPhase !== GamePhase.COMBAT) {
      this.actionQueue = [];
    }

    this.lastPhase = state.phase;

    if (state.phase === GamePhase.BUILD) {
      return this.tickBuild(state);
    } else if (state.phase === GamePhase.COMBAT) {
      return this.tickCombat(state);
    }
    return null;
  }

  private onBuildPhaseStart(state: GameState): void {
    this.actionQueue = [];
    this.tickCounter = 0;
    this.readyDelayCounter = 0;
    this.readySent = false;

    // Enable auto-repair on first BUILD phase
    if (!this.hasEnabledAutoRepair) {
      this.actionQueue.push({ type: 'TOGGLE_AUTO_REPAIR' });
      this.hasEnabledAutoRepair = true;
    }

    const player = state.players[this.playerId];
    if (!player) return;

    // 1. Plan economy
    const plan = planEconomy(state, this.playerId, this.depth);

    // 2. Maintenance first (repair + restock)
    const maintenanceActions = getMaintenanceActions(state, this.playerId);
    let maintenanceBudget = plan.repairBudget + plan.restockBudget;
    for (const action of maintenanceActions) {
      if (maintenanceBudget <= 0) break;
      this.actionQueue.push(action);
      // Estimate cost for budget tracking
      if (action.type === 'REPAIR_TOWER') {
        const tower = state.towers[(action as { towerId: string }).towerId];
        if (tower) {
          const stats = TOWER_STATS[tower.type];
          const damageRatio = 1 - tower.health / tower.maxHealth;
          maintenanceBudget -= Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
        }
      } else if (action.type === 'RESTOCK_TOWER') {
        const tower = state.towers[(action as { towerId: string }).towerId];
        if (tower) {
          const stats = TOWER_STATS[tower.type];
          maintenanceBudget -= (tower.maxAmmo - tower.ammo) * stats.ammoCostPerRound;
        }
      }
    }

    // 3. Build new towers (maze + offense)
    const mazePlacements = generateMazeLayout(state, this.playerId, plan.buildBudget, this.depth);
    for (const placement of mazePlacements) {
      this.actionQueue.push({
        type: 'PLACE_TOWER',
        position: { x: placement.x, y: placement.y },
        towerType: placement.type,
      });
    }

    // 4. Upgrades with remaining budget
    const upgradeActions = getUpgradeActions(state, this.playerId, plan.upgradeBudget, this.depth);
    for (const action of upgradeActions) {
      this.actionQueue.push(action);
    }

    log(`AI ${this.playerName} planned ${this.actionQueue.length} actions for wave ${state.waveNumber}`);
  }

  private tickBuild(state: GameState): ClientMessage | null {
    if (this.readySent) return null;

    this.tickCounter++;

    if (this.actionQueue.length > 0) {
      if (this.tickCounter >= AI.ACTION_DELAY_TICKS) {
        this.tickCounter = 0;
        const action = this.actionQueue.shift()!;

        // Re-validate PLACE_TOWER actions (grid may have changed)
        if (action.type === 'PLACE_TOWER') {
          const pos = (action as { position: { x: number; y: number } }).position;
          const v = validateTowerPlacement(state.grid, pos.x, pos.y, this.side);
          if (!v.valid) {
            // Skip invalid placement, try next action
            return this.tickBuild(state);
          }
          // Also check if we can still afford it
          const player = state.players[this.playerId];
          const towerType = (action as { towerType: TowerType }).towerType;
          const cost = getDynamicPrice(state, towerType);
          if (!player || player.credits < cost) {
            return this.tickBuild(state);
          }
        }

        return action;
      }
      return null;
    }

    // Queue empty — wait a beat, then ready up
    this.readyDelayCounter++;
    if (this.readyDelayCounter >= AI.READY_DELAY_TICKS) {
      this.readySent = true;
      return { type: 'READY_FOR_WAVE' };
    }
    return null;
  }

  private tickCombat(state: GameState): ClientMessage | null {
    this.combatCheckCounter++;
    if (this.combatCheckCounter < AI.COMBAT_CHECK_INTERVAL) return null;
    this.combatCheckCounter = 0;

    const player = state.players[this.playerId];
    if (!player || player.credits < 20) return null;

    // Find most damaged tower that needs repair
    const ownedTowers = Object.values(state.towers).filter(t => t.ownerId === this.playerId);

    // Critical repair: any tower below 30% health
    const criticalTower = ownedTowers
      .filter(t => t.health / t.maxHealth < 0.3)
      .sort((a, b) => (a.health / a.maxHealth) - (b.health / b.maxHealth))[0];

    if (criticalTower) {
      const stats = TOWER_STATS[criticalTower.type];
      const damageRatio = 1 - criticalTower.health / criticalTower.maxHealth;
      const cost = Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
      if (player.credits >= cost) {
        return { type: 'REPAIR_TOWER', towerId: criticalTower.id };
      }
    }

    // Critical restock: any offensive tower with 0 ammo
    const emptyAmmoTower = ownedTowers
      .filter(t => t.maxAmmo > 0 && t.ammo === 0)
      .sort((a, b) => TOWER_STATS[b.type].damage - TOWER_STATS[a.type].damage)[0];

    if (emptyAmmoTower) {
      return { type: 'RESTOCK_TOWER', towerId: emptyAmmoTower.id };
    }

    return null;
  }
}
