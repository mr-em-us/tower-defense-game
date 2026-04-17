import { TowerType, GameState } from '../../shared/types/game.types.js';
import { TOWER_STATS } from '../../shared/types/constants.js';

export interface TowerTemplate {
  id: string;
  name: string;
  createdAt: number;
  cost: number; // base cost at level 1 + upgrade costs to reach final level
  towers: Array<{ x: number; y: number; type: TowerType; level: number }>;
}

const KEY_PREFIX = 'tower-templates:';

function key(playerName: string): string {
  return KEY_PREFIX + playerName;
}

/** Cost to build a tower of `type` at `level` from scratch: base cost + all upgrades. */
export function computeTowerCost(type: TowerType, level: number): number {
  const stats = TOWER_STATS[type];
  let total = stats.cost;
  for (let l = 1; l < level; l++) {
    total += Math.round(stats.cost * stats.upgradeCostMultiplier * l);
  }
  return total;
}

export function list(playerName: string): TowerTemplate[] {
  try {
    const raw = localStorage.getItem(key(playerName));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function save(playerName: string, template: TowerTemplate): void {
  const all = list(playerName);
  const existing = all.findIndex(t => t.id === template.id);
  if (existing >= 0) all[existing] = template;
  else all.unshift(template);
  try {
    localStorage.setItem(key(playerName), JSON.stringify(all));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Failed to save template (localStorage full?):', e);
  }
}

export function remove(playerName: string, templateId: string): void {
  const all = list(playerName).filter(t => t.id !== templateId);
  localStorage.setItem(key(playerName), JSON.stringify(all));
}

/** Extract a template from the current game state for the given player. */
export function fromState(
  state: GameState,
  playerId: string,
  name: string,
): TowerTemplate {
  const towers = Object.values(state.towers)
    .filter(t => t.ownerId === playerId)
    .map(t => ({ x: t.position.x, y: t.position.y, type: t.type, level: t.level }));
  const cost = towers.reduce((sum, t) => sum + computeTowerCost(t.type, t.level), 0);
  return {
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    cost,
    towers,
  };
}
