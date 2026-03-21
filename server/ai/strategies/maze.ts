import { GameState, PlayerSide, TowerType, CellType } from '../../../shared/types/game.types.js';
import { GRID, CENTER_SPAWN, TOWER_STATS } from '../../../shared/types/constants.js';
import { findPath, isInSpawnZone } from '../../../shared/logic/pathfinding.js';
import { chooseTowerType } from './placement.js';
import { getDynamicPrice } from './economy.js';
import { log } from '../../utils/logger.js';

interface PlannedPlacement {
  x: number;
  y: number;
  type: TowerType;
  cost: number;
}

export interface MazePlan {
  placements: PlannedPlacement[];
  sellTowerIds: string[];
}

/**
 * Emergent maze builder v3 — unified scoring.
 *
 * Every tower both blocks the path AND deals damage. No separate wall/damage
 * phases. A single scoring function combines path extension and path coverage:
 *
 *   score = pathDelta * DELTA_W + pathCoverage * COVERAGE_W + wallAdj * ADJ_W
 *
 * This lets each placement decision naturally balance between:
 *   - Extending the maze (high delta, low coverage)
 *   - Adding firepower (low delta, high coverage)
 *   - Building structure (adjacency to existing towers)
 *
 * Tower types:
 *   - WALL (25c) for pure structure when only delta matters
 *   - BASIC (50c) default — blocks + deals damage
 *   - Specialized (SLOW/SPLASH/SNIPER) when coverage score dominates
 */
export function generateMazeLayout(
  state: GameState,
  playerId: string,
  budget: number,
  depth: number,
): MazePlan {
  const player = state.players[playerId];
  if (!player || budget <= 0) return { placements: [], sellTowerIds: [] };

  const side = player.side;
  const wave = state.waveNumber;
  const simulated: { x: number; y: number }[] = [];

  const pathBefore = findPath(state.grid, side);
  const pathLenBefore = pathBefore?.length ?? 0;

  let spent = 0;
  const towerTypeCounts: Record<string, number> = {};
  const placements: PlannedPlacement[] = [];

  // AA reserve
  const existingAA = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA).length;
  const aaTarget = wave <= 3 ? 2 : wave <= 6 ? Math.round(2 + (wave - 3) * 1.5) : Math.round(7 + (wave - 6) * 2);
  const aaGap = Math.max(0, aaTarget - existingAA);
  const aaCostEst = getDynamicPrice(state, TowerType.AA);
  let aaReserve: number;
  if (wave <= 1) {
    aaReserve = 0;
  } else if (wave <= 4) {
    aaReserve = Math.min(aaGap * aaCostEst, Math.floor(budget * 0.25));
  } else {
    aaReserve = aaGap * aaCostEst;
  }
  aaReserve = Math.min(aaReserve, Math.floor(budget * 0.5));
  const mazeBudget = budget - aaReserve;

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // === UNIFIED PLACEMENT LOOP ===
  // S=2 spacing + leftBias from the start — produces intestine/serpentine pattern
  // Same algorithm that produced path 380 in the sandbox
  const SPACING = 2;
  const LEFT_BIAS = 50;

  let towersPlaced = 0;

  while (spent < mazeBudget) {
    const spacing = SPACING;
    const useBias = LEFT_BIAS;

    const currentPath = findPath(state.grid, side);
    if (!currentPath) break;

    const candidates = scoreUnifiedCandidates(state, side, currentPath, xMin, xMax, spacing, useBias);
    if (candidates.length === 0) break;

    const best = candidates[0];

    // Choose tower type based on whether enemies will actually pass by
    let towerType: TowerType;
    let cost: number;

    // Check: is this tower near where enemies currently walk?
    // Use CURRENT path (before placement) — placing on the path pushes it away,
    // but future placements will bring enemies back through this area.
    let pathCoverage = 0;
    const basicRange = TOWER_STATS[TowerType.BASIC].range;
    const rSq = basicRange * basicRange;
    for (const cell of currentPath) {
      const dx = cell.x - best.x;
      const dy = cell.y - best.y;
      if (dx * dx + dy * dy <= rSq) pathCoverage++;
    }

    if (pathCoverage === 0) {
      // Enemies won't pass by — cheap WALL for structure only
      towerType = TowerType.WALL;
      cost = getDynamicPrice(state, TowerType.WALL);
    } else {
      // Enemies WILL pass by — pick best DPS/cost ROI at current prices
      const dpsTypes: TowerType[] = [TowerType.BASIC, TowerType.SNIPER, TowerType.SPLASH, TowerType.SLOW];
      let bestRoi = 0;
      towerType = TowerType.BASIC;
      cost = getDynamicPrice(state, TowerType.BASIC);

      for (const t of dpsTypes) {
        const stats = TOWER_STATS[t];
        const price = getDynamicPrice(state, t);
        if (spent + price > mazeBudget) continue;

        // Effective DPS: damage × fireRate. SPLASH gets bonus for AoE.
        let dps = stats.damage * stats.fireRate;
        if (stats.splashRadius > 0) dps *= 2; // splash hits multiple enemies
        // SLOW has utility value beyond raw DPS
        if (stats.slowAmount > 0) dps += 10;

        const roi = dps / price;
        if (roi > bestRoi) {
          bestRoi = roi;
          towerType = t;
          cost = price;
        }
      }
    }

    if (spent + cost > mazeBudget) {
      towerType = TowerType.WALL;
      cost = getDynamicPrice(state, TowerType.WALL);
      if (spent + cost > mazeBudget) break;
    }

    state.grid.cells[best.y][best.x] = CellType.TOWER;
    if (!findPath(state.grid, side)) {
      state.grid.cells[best.y][best.x] = CellType.EMPTY;
      continue;
    }
    simulated.push({ x: best.x, y: best.y });
    placements.push({ x: best.x, y: best.y, type: towerType, cost });
    spent += cost;
    towersPlaced++;
    towerTypeCounts[towerType] = (towerTypeCounts[towerType] ?? 0) + 1;

    if (towersPlaced % 50 === 0) {
      const newPath = findPath(state.grid, side);
      log(`[MAZE] Placed: ${towersPlaced}, path: ${newPath?.length ?? 0}, spent: ${spent}c`);
    }
  }

  // === BREAKTHROUGH PHASE ===
  // Try placing short wall lines (3-5 cells) across the path to break
  // through local optima. A single wall can't extend the path, but a
  // line of walls creates a real barrier that forces a major reroute.
  const wallCostBT = getDynamicPrice(state, TowerType.WALL);
  if (spent + wallCostBT * 3 <= mazeBudget) {
    const btResult = findBreakthroughLine(state, side, xMin, xMax);
    if (btResult && btResult.length > 0) {
      const btCost = btResult.length * wallCostBT;
      if (spent + btCost <= mazeBudget) {
        for (const cell of btResult) {
          state.grid.cells[cell.y][cell.x] = CellType.TOWER;
          simulated.push({ x: cell.x, y: cell.y });
          placements.push({ x: cell.x, y: cell.y, type: TowerType.WALL, cost: wallCostBT });
          spent += wallCostBT;
          towersPlaced++;
          towerTypeCounts[TowerType.WALL] = (towerTypeCounts[TowerType.WALL] ?? 0) + 1;
        }
        const btPath = findPath(state.grid, side);
        log(`[MAZE] Breakthrough line! ${btResult.length} walls, path: ${btPath?.length ?? 0}`);

        // After breakthrough, continue with regular delta>0 placements
        let btExtra = 0;
        while (spent + wallCostBT <= mazeBudget && btExtra < 30) {
          const currentPath = findPath(state.grid, side);
          if (!currentPath) break;
          const candidates = scoreUnifiedCandidates(state, side, currentPath, xMin, xMax);
          if (candidates.length === 0 || candidates[0].delta <= 0) break;
          const best = candidates[0];
          state.grid.cells[best.y][best.x] = CellType.TOWER;
          if (!findPath(state.grid, side)) {
            state.grid.cells[best.y][best.x] = CellType.EMPTY;
            continue;
          }
          simulated.push({ x: best.x, y: best.y });
          placements.push({ x: best.x, y: best.y, type: TowerType.WALL, cost: wallCostBT });
          spent += wallCostBT;
          towersPlaced++;
          btExtra++;
          towerTypeCounts[TowerType.WALL] = (towerTypeCounts[TowerType.WALL] ?? 0) + 1;
        }
        if (btExtra > 0) {
          const extraPath = findPath(state.grid, side);
          log(`[MAZE] Post-breakthrough: +${btExtra} walls, path: ${extraPath?.length ?? 0}`);
        }
      }
    }
  }

  // === AA DEFENSE ===
  const aaBudget = budget - spent;
  const aaSpent = placeAADefense(state, playerId, side, aaBudget, wave, placements, simulated);
  spent += aaSpent;

  // === SPEND REMAINING — fill any empty cell with BASIC ===
  // After maze + AA, dump leftover budget into more towers
  let fillCount = 0;
  while (budget - spent >= getDynamicPrice(state, TowerType.BASIC)) {
    const currentPath = findPath(state.grid, side);
    if (!currentPath) break;
    // Use full candidate set with no spacing — just fill everything
    const candidates = scoreUnifiedCandidates(state, side, currentPath, xMin, xMax, 0, 0);
    if (candidates.length === 0) break;
    const best = candidates[0];
    const cost = getDynamicPrice(state, TowerType.BASIC);
    if (spent + cost > budget) break;
    state.grid.cells[best.y][best.x] = CellType.TOWER;
    if (!findPath(state.grid, side)) {
      state.grid.cells[best.y][best.x] = CellType.EMPTY;
      continue;
    }
    simulated.push({ x: best.x, y: best.y });
    placements.push({ x: best.x, y: best.y, type: TowerType.BASIC, cost });
    spent += cost;
    fillCount++;
    towerTypeCounts[TowerType.BASIC] = (towerTypeCounts[TowerType.BASIC] ?? 0) + 1;
  }
  if (fillCount > 0) {
    log(`[MAZE] Remaining budget fill: +${fillCount} BASIC, spent ${Math.round(spent)}c / ${Math.round(budget)}c`);
  }

  // Restore grid
  for (const cell of simulated) {
    state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
  }

  // Measure final path
  const simCells: { x: number; y: number }[] = [];
  for (const p of placements) {
    if (state.grid.cells[p.y][p.x] === CellType.EMPTY) {
      state.grid.cells[p.y][p.x] = CellType.TOWER;
      simCells.push({ x: p.x, y: p.y });
    }
  }
  const pathAfter = findPath(state.grid, side);
  const pathLenAfter = pathAfter?.length ?? 0;
  for (const c of simCells) state.grid.cells[c.y][c.x] = CellType.EMPTY;

  const typeStr = Object.entries(towerTypeCounts).map(([t, c]) => `${t}:${c}`).join(' ');
  log(`[MAZE] Wave ${wave} | Budget ${Math.round(budget)}c | Spent ${Math.round(spent)}c (${typeStr}) AA:${aaSpent}c | Path: ${pathLenBefore} -> ${pathLenAfter} | ${towersPlaced} towers`);

  return { placements, sellTowerIds: [] };
}


/**
 * Unified scoring: combines path extension + damage coverage + structure.
 *
 * score = delta * 10 + coverage * 2 + wallAdj * 3 + proximity * 1
 *
 * Candidates: cells on/near the path + cells adjacent to existing towers.
 */
function scoreUnifiedCandidates(
  state: GameState,
  side: PlayerSide,
  currentPath: { x: number; y: number }[],
  xMin: number,
  xMax: number,
  minSpacing: number = 0,
  leftBias: number = 0,
): { x: number; y: number; score: number; delta: number; coverage: number }[] {
  const currentLen = currentPath.length;
  const BASIC_RANGE = TOWER_STATS[TowerType.BASIC].range;
  const rangeSq = BASIC_RANGE * BASIC_RANGE;

  const DELTA_WEIGHT = 15;
  const COVERAGE_WEIGHT = 2;
  const ADJACENCY_WEIGHT = 3;
  const PROXIMITY_WEIGHT = 1;

  // Build path set
  const pathSet = new Set<string>();
  for (const cell of currentPath) {
    pathSet.add(`${cell.x},${cell.y}`);
  }

  // Collect candidates
  const candidateSet = new Set<string>();

  if (minSpacing > 0) {
    // Spacing mode (intestine growth): consider ALL empty cells in zone
    // This matches the sandbox behavior that produced the intestine pattern
    for (let y = 0; y < GRID.HEIGHT; y++) {
      for (let x = xMin; x <= xMax; x++) {
        if (state.grid.cells[y][x] !== CellType.EMPTY) continue;
        if (isInSpawnZone(x, y)) continue;
        candidateSet.add(`${x},${y}`);
      }
    }
  } else {
    // Dense mode (early game): narrow candidate set for focused building
    // Cells on the path
    for (const cell of currentPath) {
      if (cell.x >= xMin && cell.x <= xMax && !isInSpawnZone(cell.x, cell.y)) {
        candidateSet.add(`${cell.x},${cell.y}`);
      }
    }

    // Cells within 3 of path
    for (const cell of currentPath) {
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          if (dx === 0 && dy === 0) continue;
          if (Math.abs(dx) + Math.abs(dy) > 3) continue;
          const nx = cell.x + dx;
          const ny = cell.y + dy;
          if (nx < xMin || nx > xMax || ny < 0 || ny >= GRID.HEIGHT) continue;
          if (state.grid.cells[ny][nx] !== CellType.EMPTY) continue;
          if (isInSpawnZone(nx, ny)) continue;
          candidateSet.add(`${nx},${ny}`);
        }
      }
    }
  }

  // Adjacent to existing towers
  for (let y = 0; y < GRID.HEIGHT; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (state.grid.cells[y][x] !== CellType.TOWER) continue;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < xMin || nx > xMax || ny < 0 || ny >= GRID.HEIGHT) continue;
        if (state.grid.cells[ny][nx] !== CellType.EMPTY) continue;
        if (isInSpawnZone(nx, ny)) continue;
        candidateSet.add(`${nx},${ny}`);
      }
    }
  }

  // Score each candidate
  const results: { x: number; y: number; score: number; delta: number; coverage: number }[] = [];
  for (const key of candidateSet) {
    const [xStr, yStr] = key.split(',');
    const x = parseInt(xStr);
    const y = parseInt(yStr);

    if (state.grid.cells[y][x] !== CellType.EMPTY) continue;

    // Spacing constraint: Manhattan distance to nearest tower
    if (minSpacing > 0) {
      let tooClose = false;
      for (let dy2 = -minSpacing + 1; dy2 < minSpacing && !tooClose; dy2++) {
        for (let dx2 = -minSpacing + 1; dx2 < minSpacing && !tooClose; dx2++) {
          if (dx2 === 0 && dy2 === 0) continue;
          if (Math.abs(dx2) + Math.abs(dy2) >= minSpacing) continue;
          const nx2 = x + dx2, ny2 = y + dy2;
          if (nx2 >= 0 && nx2 < GRID.WIDTH && ny2 >= 0 && ny2 < GRID.HEIGHT) {
            if (state.grid.cells[ny2][nx2] === CellType.TOWER) tooClose = true;
          }
        }
      }
      if (tooClose) continue;
    }

    // Path delta
    state.grid.cells[y][x] = CellType.TOWER;
    const newPath = findPath(state.grid, side);
    state.grid.cells[y][x] = CellType.EMPTY;
    if (!newPath) continue;

    const delta = newPath.length - currentLen;

    // Coverage: path cells within BASIC range
    let coverage = 0;
    for (const cell of currentPath) {
      const dx = cell.x - x;
      const dy = cell.y - y;
      if (dx * dx + dy * dy <= rangeSq) coverage++;
    }

    // Wall adjacency
    let wallAdj = 0;
    for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + ddx;
      const ny = y + ddy;
      if (nx >= 0 && nx < GRID.WIDTH && ny >= 0 && ny < GRID.HEIGHT) {
        if (state.grid.cells[ny][nx] === CellType.TOWER) wallAdj++;
      }
    }

    // Path proximity
    let minPathDist = 99;
    for (const cell of currentPath) {
      const dist = Math.abs(cell.x - x) + Math.abs(cell.y - y);
      if (dist < minPathDist) minPathDist = dist;
      if (dist <= 1) break;
    }
    const proximity = Math.max(0, 5 - minPathDist);

    const score = delta * DELTA_WEIGHT + coverage * COVERAGE_WEIGHT
                + wallAdj * ADJACENCY_WEIGHT + proximity * PROXIMITY_WEIGHT;
    results.push({ x, y, score, delta, coverage });
  }

  // Lexicographic sort: delta>0 ALWAYS first (path extension priority),
  // then within delta>0: prefer leftmost column (intestine pattern),
  // then by composite score as tiebreaker.
  results.sort((a, b) => {
    const aTier = a.delta > 0 ? 1 : 0;
    const bTier = b.delta > 0 ? 1 : 0;
    if (aTier !== bTier) return bTier - aTier;
    if (aTier === 1 && bTier === 1 && leftBias > 0) {
      // Both delta>0: prefer leftmost column
      if (a.x !== b.x) return a.x - b.x;
    }
    return b.score - a.score;
  });
  return results;
}

/**
 * Find a short wall line (3-5 cells) that extends the path.
 * Tries horizontal and vertical lines crossing the current path.
 * Each line is a batch that together creates a barrier forcing a longer route.
 *
 * Returns array of cells to place, or null if no breakthrough found.
 */
function findBreakthroughLine(
  state: GameState,
  side: PlayerSide,
  xMin: number,
  xMax: number,
): { x: number; y: number }[] | null {
  const currentPath = findPath(state.grid, side);
  if (!currentPath) return null;
  const currentLen = currentPath.length;

  // Build path set for quick lookup
  const pathSet = new Set<string>();
  for (const cell of currentPath) {
    pathSet.add(`${cell.x},${cell.y}`);
  }

  let bestDelta = 0;
  let bestLine: { x: number; y: number }[] | null = null;

  // Try horizontal lines (constant y, varying x) crossing the path
  for (let y = 0; y < GRID.HEIGHT; y++) {
    for (let startX = xMin; startX <= xMax - 2; startX++) {
      // Try lines of length 3, 4, 5
      for (let len = 3; len <= 5 && startX + len - 1 <= xMax; len++) {
        const line: { x: number; y: number }[] = [];
        let crossesPath = false;
        let allValid = true;

        for (let x = startX; x < startX + len; x++) {
          if (state.grid.cells[y][x] !== CellType.EMPTY && !pathSet.has(`${x},${y}`)) {
            allValid = false;
            break;
          }
          if (state.grid.cells[y][x] === CellType.TOWER) {
            // Already a tower — skip (wall line incorporates existing tower)
            continue;
          }
          if (isInSpawnZone(x, y)) {
            allValid = false;
            break;
          }
          if (pathSet.has(`${x},${y}`)) crossesPath = true;
          line.push({ x, y });
        }

        if (!allValid || !crossesPath || line.length < 2) continue;

        // Temporarily place the line
        for (const cell of line) {
          state.grid.cells[cell.y][cell.x] = CellType.TOWER;
        }
        const newPath = findPath(state.grid, side);
        for (const cell of line) {
          state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
        }

        if (!newPath) continue; // Would block path entirely

        const delta = newPath.length - currentLen;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestLine = [...line];
        }
      }
    }
  }

  // Try vertical lines (constant x, varying y) crossing the path
  for (let x = xMin; x <= xMax; x++) {
    for (let startY = 0; startY <= GRID.HEIGHT - 3; startY++) {
      for (let len = 3; len <= 5 && startY + len - 1 < GRID.HEIGHT; len++) {
        const line: { x: number; y: number }[] = [];
        let crossesPath = false;
        let allValid = true;

        for (let y = startY; y < startY + len; y++) {
          if (state.grid.cells[y][x] !== CellType.EMPTY && !pathSet.has(`${x},${y}`)) {
            allValid = false;
            break;
          }
          if (state.grid.cells[y][x] === CellType.TOWER) {
            continue;
          }
          if (isInSpawnZone(x, y)) {
            allValid = false;
            break;
          }
          if (pathSet.has(`${x},${y}`)) crossesPath = true;
          line.push({ x, y });
        }

        if (!allValid || !crossesPath || line.length < 2) continue;

        for (const cell of line) {
          state.grid.cells[cell.y][cell.x] = CellType.TOWER;
        }
        const newPath = findPath(state.grid, side);
        for (const cell of line) {
          state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
        }

        if (!newPath) continue;

        const delta = newPath.length - currentLen;
        if (delta > bestDelta) {
          bestDelta = delta;
          bestLine = [...line];
        }
      }
    }
  }

  if (bestLine && bestDelta >= 4) {
    log(`[MAZE] Found breakthrough line: ${bestLine.length} cells, delta=${bestDelta}`);
    return bestLine;
  }
  return null;
}

/**
 * Place AA towers along the flight corridor.
 */
function placeAADefense(
  state: GameState,
  playerId: string,
  side: PlayerSide,
  totalBudget: number,
  wave: number,
  placements: PlannedPlacement[],
  simulated: { x: number; y: number }[],
): number {
  if (wave < 2) return 0;

  const existingAA = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA).length;
  const plannedAA = placements.filter(p => p.type === TowerType.AA).length;
  const totalAA = existingAA + plannedAA;
  const aaTarget = wave <= 3 ? 2 : wave <= 6 ? Math.round(2 + (wave - 3) * 1.5) : Math.round(7 + (wave - 6) * 2);

  let aaNeeded = Math.max(0, aaTarget - totalAA);
  if (aaNeeded === 0) return 0;

  const aaCost = getDynamicPrice(state, TowerType.AA);
  const maxAirBudget = Math.min(totalBudget, aaNeeded * aaCost);
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  const existingAAPositions = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA)
    .map(t => t.position);
  const placedAAPositions = [...existingAAPositions];

  const candidates: { x: number; y: number; score: number }[] = [];
  const flightRows = [14, 13, 15, 12, 16];

  for (const y of flightRows) {
    if (y < 0 || y >= GRID.HEIGHT) continue;
    const rowPriority = 10 - Math.abs(y - 14) * 2;
    for (let x = xMin; x <= xMax; x++) {
      if (state.grid.cells[y][x] !== CellType.EMPTY) continue;
      if (isInSpawnZone(x, y)) continue;
      let minXDist = 100;
      for (const pos of placedAAPositions) {
        const xDist = Math.abs(pos.x - x);
        if (xDist < minXDist) minXDist = xDist;
      }
      const spreadScore = Math.min(6, minXDist);
      candidates.push({ x, y, score: rowPriority + spreadScore });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  let spent = 0;
  let placed = 0;
  for (const c of candidates) {
    if (placed >= aaNeeded || spent + aaCost > maxAirBudget) break;
    state.grid.cells[c.y][c.x] = CellType.TOWER;
    if (!findPath(state.grid, side)) {
      state.grid.cells[c.y][c.x] = CellType.EMPTY;
      continue;
    }
    simulated.push({ x: c.x, y: c.y });
    placements.push({ x: c.x, y: c.y, type: TowerType.AA, cost: aaCost });
    spent += aaCost;
    placed++;
    placedAAPositions.push({ x: c.x, y: c.y });
  }

  if (placed > 0) log(`[MAZE] AA: ${placed} towers (${spent}c), target=${aaTarget}, existing=${existingAA}`);
  return spent;
}
