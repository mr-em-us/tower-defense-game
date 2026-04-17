import { v4 as uuid } from 'uuid';
import { Tower, TowerType, GridCell, GameState } from '../../shared/types/game.types.js';
import { TOWER_STATS } from '../../shared/types/constants.js';

/**
 * Build a Tower, applying stat overrides and (optionally) pre-applied upgrade levels.
 * Extracted so auto-rebuild, template apply, and normal placement stay in sync
 * with handleUpgradeTower's math. Level defaults to 1.
 */
export function createTower(
  state: GameState,
  ownerId: string,
  type: TowerType,
  position: GridCell,
  level = 1,
): Tower {
  const stats = TOWER_STATS[type];
  const overrides = state.settings.towerOverrides?.[type];

  let damage = Math.round(stats.damage * (overrides?.damage ?? 1));
  let range = +(stats.range * (overrides?.range ?? 1)).toFixed(1);
  let fireRate = +(stats.fireRate * (overrides?.fireRate ?? 1)).toFixed(2);
  let maxHealth = Math.round(stats.maxHealth * (overrides?.maxHealth ?? 1));
  let maxAmmo = Math.round(stats.maxAmmo * (overrides?.maxAmmo ?? 1));

  // Apply (level - 1) upgrades. Mirrors handleUpgradeTower's math exactly.
  for (let l = 1; l < level; l++) {
    damage = Math.round(damage * stats.upgradeStatMultiplier);
    range = +(range * 1.1).toFixed(1);
    fireRate = +(fireRate * 1.1).toFixed(2);
    maxHealth = Math.round(maxHealth * (type === TowerType.WALL ? 1.3 : 1.2));
    maxAmmo = Math.round(maxAmmo * 1.15);
  }

  return {
    id: uuid(),
    type,
    position: { x: position.x, y: position.y },
    ownerId,
    level,
    damage,
    range,
    fireRate,
    lastFireTime: 0,
    targetId: null,
    health: maxHealth,
    maxHealth,
    ammo: maxAmmo,
    maxAmmo,
    placedWave: state.waveNumber,
  };
}
