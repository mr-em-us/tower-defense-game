import { TowerType } from '../types/game.types.js';
import { TOWER_STATS, REPAIR_COST_RATIO } from '../types/constants.js';

/**
 * Cost to repair a tower back to full health, given its current HP.
 * WALL towers repair free — they eat contact damage continuously so paying to
 * fix them nukes the player's economy. Replacing a destroyed wall still costs
 * its base price; this only applies to repair of a damaged-but-alive wall.
 */
export function computeRepairCost(type: TowerType, health: number, maxHealth: number): number {
  if (type === TowerType.WALL) return 0;
  if (health >= maxHealth) return 0;
  const damageRatio = 1 - health / maxHealth;
  return Math.ceil(damageRatio * TOWER_STATS[type].cost * REPAIR_COST_RATIO);
}
