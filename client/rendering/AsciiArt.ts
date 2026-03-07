import { TowerType, EnemyType } from '../../shared/types/game.types.js';

// Tower ASCII art representations (rendered at cell position)
export const TOWER_CHARS: Record<TowerType, string> = {
  [TowerType.BASIC]: '#',
  [TowerType.SNIPER]: 'I',
  [TowerType.SPLASH]: '*',
  [TowerType.SLOW]: '~',
  [TowerType.WALL]: 'W',
  [TowerType.AA]: 'A',
};

export const TOWER_LABELS: Record<TowerType, string> = {
  [TowerType.BASIC]: 'Basic',
  [TowerType.SNIPER]: 'Sniper',
  [TowerType.SPLASH]: 'Splash',
  [TowerType.SLOW]: 'Slow',
  [TowerType.WALL]: 'Wall',
  [TowerType.AA]: 'AA',
};

// Enemy ASCII chars - cycle for animation
export const ENEMY_FRAMES: Record<EnemyType, string[]> = {
  [EnemyType.BASIC]: ['o', 'O'],
  [EnemyType.FAST]: ['>', '>>'],
  [EnemyType.TANK]: ['@', '#'],
  [EnemyType.BOSS]: ['M', 'W'],
  [EnemyType.FLYING]: ['^', 'v'],
};

export function getEnemyChar(type: EnemyType, time: number): string {
  const frames = ENEMY_FRAMES[type];
  const idx = Math.floor(time * 3) % frames.length;
  return frames[idx];
}
