import { GameState, TowerType, Tower } from '../../../shared/types/game.types.js';
import { TOWER_STATS, REPAIR_COST_RATIO, AI, PRICE_ESCALATION, MIN_DYNAMIC_PRICE } from '../../../shared/types/constants.js';
import { ClientMessage } from '../../../shared/types/network.types.js';

export interface EconomyPlan {
  repairBudget: number;
  restockBudget: number;
  buildBudget: number;
  upgradeBudget: number;
  savingsTarget: number;
}

/**
 * Plan how to allocate credits across repair, restock, build, and upgrade.
 *
 * Economy phases:
 * - Waves 1-3: Aggressive building (minimal reserve, no upgrades)
 * - Waves 4-7: Balanced (moderate reserve, start upgrading)
 * - Waves 8+: Mature economy (upgrades + maintenance focused)
 */
export function planEconomy(
  state: GameState,
  playerId: string,
  depth: number,
): EconomyPlan {
  const player = state.players[playerId];
  if (!player) {
    return { repairBudget: 0, restockBudget: 0, buildBudget: 0, upgradeBudget: 0, savingsTarget: 0 };
  }

  const credits = player.credits;
  const wave = state.waveNumber;

  // Reserve ratio: minimal — maximize spending on towers
  let reserveRatio: number;
  if (wave <= 5) {
    reserveRatio = 0.02; // 2% reserve early — build aggressively
  } else {
    reserveRatio = 0.05; // 5% late game — still prioritize building
  }

  const savingsTarget = Math.round(credits * reserveRatio);
  const available = credits - savingsTarget;

  if (available <= 0) {
    return { repairBudget: 0, restockBudget: 0, buildBudget: 0, upgradeBudget: 0, savingsTarget };
  }

  // Calculate repair and restock costs
  const ownedTowers = Object.values(state.towers).filter(t => t.ownerId === playerId);
  let repairCost = 0;
  let restockCost = 0;

  for (const tower of ownedTowers) {
    if (tower.health < tower.maxHealth) {
      const stats = TOWER_STATS[tower.type];
      const damageRatio = 1 - tower.health / tower.maxHealth;
      repairCost += Math.ceil(damageRatio * stats.cost * REPAIR_COST_RATIO);
    }
    if (tower.ammo < tower.maxAmmo) {
      const stats = TOWER_STATS[tower.type];
      restockCost += (tower.maxAmmo - tower.ammo) * stats.ammoCostPerRound;
    }
  }

  // Allocate: repair first, then restock, then split between build and upgrade
  const repairBudget = Math.min(repairCost, available);
  const afterRepair = available - repairBudget;

  const restockBudget = Math.min(restockCost, afterRepair);
  const afterRestock = afterRepair - restockBudget;

  // Upgrade ratio: low until maze is established, then scale up
  // Late game: grid saturates, upgrades become primary DPS growth
  const towerCount = Object.values(state.towers).filter(t => t.ownerId === playerId).length;
  let upgradeRatio: number;
  if (wave <= 4) {
    upgradeRatio = 0; // all building early — establish maze
  } else if (wave <= 7) {
    upgradeRatio = 0.20; // 20% mid-game — upgrade key towers for DPS
  } else if (wave <= 12) {
    upgradeRatio = 0.35; // 35% — upgrades more important as enemies scale
  } else if (wave <= 20) {
    upgradeRatio = 0.55; // 55% — heavy upgrades, maze is established
  } else if (wave <= 25) {
    upgradeRatio = 0.70; // 70% — late game, maze saturated
  } else if (wave <= 30) {
    upgradeRatio = 0.80; // 80% — deep late game, upgrades are primary DPS growth
  } else {
    upgradeRatio = 0.85; // 85% — ultra late game, almost all upgrades
  }

  const upgradeBudget = Math.round(afterRestock * upgradeRatio);
  const buildBudget = afterRestock - upgradeBudget;

  return { repairBudget, restockBudget, buildBudget, upgradeBudget, savingsTarget };
}

/**
 * Generate repair and restock messages for damaged/depleted towers.
 * Returns messages sorted by urgency (most damaged/depleted first).
 */
export function getMaintenanceActions(
  state: GameState,
  playerId: string,
): ClientMessage[] {
  const actions: ClientMessage[] = [];
  const ownedTowers = Object.values(state.towers).filter(t => t.ownerId === playerId);

  // Repair: sorted by lowest health ratio first
  const damagedTowers = ownedTowers
    .filter(t => t.health < t.maxHealth)
    .sort((a, b) => (a.health / a.maxHealth) - (b.health / b.maxHealth));

  for (const tower of damagedTowers) {
    actions.push({ type: 'REPAIR_TOWER', towerId: tower.id });
  }

  // Restock: sorted by lowest ammo ratio first
  const lowAmmoTowers = ownedTowers
    .filter(t => t.maxAmmo > 0 && t.ammo < t.maxAmmo)
    .sort((a, b) => (a.ammo / a.maxAmmo) - (b.ammo / b.maxAmmo));

  for (const tower of lowAmmoTowers) {
    actions.push({ type: 'RESTOCK_TOWER', towerId: tower.id });
  }

  return actions;
}

/**
 * Generate upgrade actions for existing towers, sorted by value.
 * Higher depth = better ROI analysis.
 */
export function getUpgradeActions(
  state: GameState,
  playerId: string,
  budget: number,
  depth: number,
): ClientMessage[] {
  const actions: ClientMessage[] = [];
  const ownedTowers = Object.values(state.towers).filter(t => t.ownerId === playerId);

  // Score towers for upgrade value
  // AA towers get a 3x ROI boost because they deal 3x damage to flying enemies,
  // which are the primary late-game threat. Raw DPS undervalues AA effectiveness.
  const upgradeCandidates = ownedTowers
    .filter(t => t.type !== TowerType.WALL) // don't upgrade walls
    .map(t => {
      const stats = TOWER_STATS[t.type];
      const cost = Math.round(stats.cost * stats.upgradeCostMultiplier * t.level);
      // DPS increase per credit spent
      const currentDPS = t.damage * t.fireRate;
      const newDPS = Math.round(t.damage * stats.upgradeStatMultiplier) * (t.fireRate * 1.1);
      const dpsGain = newDPS - currentDPS;
      // AA effective DPS is 3x vs flying (the only real threat late game)
      const effectiveDpsGain = t.type === TowerType.AA ? dpsGain * 3 : dpsGain;
      const valuePerCredit = cost > 0 ? effectiveDpsGain / cost : 0;
      return { tower: t, cost, value: valuePerCredit };
    })
    .filter(c => c.cost <= budget && c.cost > 0)
    .sort((a, b) => b.value - a.value);

  let spent = 0;
  for (const candidate of upgradeCandidates) {
    if (spent + candidate.cost > budget) continue;
    actions.push({ type: 'UPGRADE_TOWER', towerId: candidate.tower.id });
    spent += candidate.cost;
  }

  return actions;
}

/**
 * Get the dynamic price for a tower type.
 */
export function getDynamicPrice(state: GameState, type: TowerType): number {
  const stats = TOWER_STATS[type];
  const costMult = state.settings.towerOverrides?.[type]?.cost ?? 1;
  const adjusted = Math.round(stats.cost * costMult);
  if (type === TowerType.BASIC || type === TowerType.WALL) return adjusted;
  const count = state.globalPurchaseCounts[type] ?? 0;
  return Math.max(MIN_DYNAMIC_PRICE, Math.round(adjusted * (1 + count * PRICE_ESCALATION)));
}
