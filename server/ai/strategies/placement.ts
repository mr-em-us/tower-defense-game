import { GameState, PlayerSide, TowerType, Tower } from '../../../shared/types/game.types.js';
import { GRID, TOWER_STATS, AI } from '../../../shared/types/constants.js';
import { findPath, validateTowerPlacement } from '../../../shared/logic/pathfinding.js';
import { CellType } from '../../../shared/types/game.types.js';

/**
 * Get candidate cells for tower placement, filtered by depth.
 * Higher depth = more candidates evaluated = better choices.
 */
export function getCandidateCells(
  state: GameState,
  side: PlayerSide,
  depth: number,
): { x: number; y: number }[] {
  const candidates: { x: number; y: number }[] = [];
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  for (let y = 0; y < GRID.HEIGHT; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (state.grid.cells[y][x] === CellType.EMPTY) {
        const v = validateTowerPlacement(state.grid, x, y, side);
        if (v.valid) {
          candidates.push({ x, y });
        }
      }
    }
  }

  // Limit candidates by depth
  const maxCandidates = Math.round(AI.MAX_CANDIDATES_BASE + depth * AI.MAX_CANDIDATES_SCALE);

  if (candidates.length <= maxCandidates) return candidates;

  // At low depth, randomly sample. At high depth, keep more.
  // Shuffle and take first N
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, maxCandidates);
}

/**
 * Score a potential tower placement. Higher = better.
 */
export function scorePlacement(
  state: GameState,
  playerId: string,
  x: number,
  y: number,
  towerType: TowerType,
  depth: number,
): number {
  const side = state.players[playerId]?.side;
  if (!side) return 0;

  let score = 0;

  // 1. Path length score — how much does this placement extend enemy path?
  const pathLengthWeight = 1.5 + depth * 1.5; // 1.5 at easy, 3.0 at hard
  const currentPath = findPath(state.grid, side);
  const currentLen = currentPath?.length ?? 0;

  // Temporarily place tower to measure path extension
  const prevCell = state.grid.cells[y][x];
  state.grid.cells[y][x] = CellType.TOWER;
  const newPath = findPath(state.grid, side);
  state.grid.cells[y][x] = prevCell;

  if (!newPath) return -Infinity; // Would block path — should never happen after validation

  const pathIncrease = newPath.length - currentLen;
  score += pathIncrease * pathLengthWeight;

  // 2. Coverage score — how many enemy path cells are in this tower's range?
  if (towerType !== TowerType.WALL) {
    const stats = TOWER_STATS[towerType];
    const range = stats.range;
    const pathToScore = newPath;
    let coveredCells = 0;
    for (const cell of pathToScore) {
      const dx = cell.x - x;
      const dy = cell.y - y;
      if (Math.sqrt(dx * dx + dy * dy) <= range) {
        coveredCells++;
      }
    }
    score += coveredCells * 2.0;
  }

  // 3. Synergy score — bonus for good tower combos nearby
  const ownedTowers = Object.values(state.towers).filter(t => t.ownerId === playerId);
  for (const tower of ownedTowers) {
    const dx = tower.position.x - x;
    const dy = tower.position.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 6) continue;

    // SLOW near damage dealers = bonus
    if (towerType === TowerType.SLOW && (tower.type === TowerType.SPLASH || tower.type === TowerType.SNIPER)) {
      score += 1.5;
    }
    if ((towerType === TowerType.SPLASH || towerType === TowerType.SNIPER) && tower.type === TowerType.SLOW) {
      score += 1.5;
    }
  }

  // 4. Gap score — prefer positions that aren't too close or too far from existing towers
  if (ownedTowers.length > 0) {
    let minDist = Infinity;
    for (const tower of ownedTowers) {
      const dx = tower.position.x - x;
      const dy = tower.position.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
    }
    // Optimal distance is ~3-5 cells
    if (minDist < 2) score -= 1.0; // too close
    else if (minDist > 8) score -= 0.5; // too far
    else score += 0.5; // good spacing
  }

  // 5. Noise — lower depth = more random
  const noise = (Math.random() - 0.5) * 2 * AI.PLACEMENT_NOISE_BASE * (1 - depth);
  score += noise * Math.abs(score || 1);

  return score;
}

/**
 * Choose the best tower type for the current situation.
 */
/**
 * Choose the best tower type for the current situation.
 * This is called from the OFFENSIVE tower placement — never returns WALL
 * since maze walls are handled separately in placeVerticalWalls().
 */
export function chooseTowerType(
  state: GameState,
  playerId: string,
  depth: number,
  extraCounts?: Record<string, number>,
): TowerType {
  const wave = state.waveNumber;
  const player = state.players[playerId];
  if (!player) return TowerType.BASIC;

  const ownedTowers = Object.values(state.towers).filter(t => t.ownerId === playerId);
  const offensiveTowers = ownedTowers.filter(t => t.type !== TowerType.WALL);
  const typeCounts: Record<string, number> = {};
  for (const t of offensiveTowers) {
    typeCounts[t.type] = (typeCounts[t.type] ?? 0) + 1;
  }
  // Merge in extra counts from planning phase
  if (extraCounts) {
    for (const [type, count] of Object.entries(extraCounts)) {
      typeCounts[type] = (typeCounts[type] ?? 0) + count;
    }
  }
  const total = (offensiveTowers.length + Object.values(extraCounts ?? {}).reduce((s, c) => s + c, 0)) || 1;

  // Air wave coming — aggressively build AA towers
  // Flying enemies have 80HP, speed 3, and non-AA towers only do 25% damage
  // Need ~1 AA per 4 expected flying enemies to kill them all
  const aaCount = typeCounts[TowerType.AA] ?? 0;
  const expectedFlying = Math.max(2, Math.round((15 + wave * 4) * 0.15)); // ~15% of wave
  const aaTarget = Math.ceil(expectedFlying / 3) + Math.floor(wave / 4);
  if (state.airWaveCountdown >= 0 && state.airWaveCountdown <= 3 && aaCount < aaTarget) {
    return TowerType.AA; // deterministic — always build AA when needed
  }
  // Even without air warning, maintain a minimum AA presence from wave 3+
  if (wave >= 3 && aaCount < 2 + Math.floor(wave / 5)) {
    if (Math.random() < 0.3) return TowerType.AA;
  }

  // Boss wave coming — SNIPER is high value
  if (wave % 10 >= 8 && depth > 0.3) {
    const sniperCount = typeCounts[TowerType.SNIPER] ?? 0;
    if (sniperCount < 4 && Math.random() < 0.4) return TowerType.SNIPER;
  }

  // Early waves: maximize tower count with BASIC + a few SLOW
  // BASIC at 0.4 DPS/credit is the most efficient damage tower
  if (wave <= 4) {
    const slowCount = typeCounts[TowerType.SLOW] ?? 0;
    // 2-3 SLOW towers for the slow debuff, rest BASIC
    if (slowCount < 2) return TowerType.SLOW;
    if (slowCount < 3 && total > 10) return TowerType.SLOW;
    return TowerType.BASIC;
  }

  // Mid/late game: deterministic balanced composition
  // Priority order: fill whichever type is furthest below its target ratio
  const slowRatio = (typeCounts[TowerType.SLOW] ?? 0) / total;
  const splashRatio = (typeCounts[TowerType.SPLASH] ?? 0) / total;
  const sniperRatio = (typeCounts[TowerType.SNIPER] ?? 0) / total;

  // Target ratios: 15% SLOW, 20% SPLASH, 12% SNIPER, rest BASIC
  const gaps: { type: TowerType; gap: number }[] = [
    { type: TowerType.SLOW, gap: 0.15 - slowRatio },
    { type: TowerType.SPLASH, gap: 0.20 - splashRatio },
    { type: TowerType.SNIPER, gap: 0.12 - sniperRatio },
  ];

  // Pick the type with the largest gap below target
  gaps.sort((a, b) => b.gap - a.gap);
  if (gaps[0].gap > 0) return gaps[0].type;

  // All ratios met — default to BASIC
  return TowerType.BASIC;
}
