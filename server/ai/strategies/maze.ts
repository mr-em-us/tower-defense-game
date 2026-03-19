import { GameState, PlayerSide, TowerType, CellType } from '../../../shared/types/game.types.js';
import { GRID, CENTER_SPAWN } from '../../../shared/types/constants.js';
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

interface MazeCell {
  x: number;
  y: number;
  type: TowerType;
}

interface BoxGeometry {
  cells: MazeCell[];
  mazeLeft: number;
  mazeRight: number;
  mazeTop: number;
  mazeBottom: number;
  numWalls: number;
}

/**
 * AI maze strategy: compact box with horizontal switchback lanes + return section.
 *
 * Phase 1: Box maze — switchbacks going downward from spawn
 * Phase 2: Return section — when box has 6+ walls, add a second set of
 *   switchbacks to the goal side. Enemy goes down through box, then UP
 *   through the return section, doubling path length.
 *
 * The return section is enclosed by a connector seal wall (between box
 * and return) and an outer funnel (beyond return), preventing shortcuts.
 *
 * Growth priority:
 *   1. Box maze — more rows as budget allows (batch placed)
 *   2. Return section — second switchback column (batch placed)
 *   3. Additive repair — fill any wall gaps
 *   4. Offense fill — DPS towers near path
 *   5. AA defense
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

  // AA reserve: proactively reserve budget for AA line along flight corridor.
  // Target: 4 + wave*1.5 total AA towers. Reserve enough to close the gap each wave.
  const existingAA = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA).length;
  const aaTarget = Math.round(4 + wave * 1.5);
  const aaGap = Math.max(0, aaTarget - existingAA);
  const aaCostEst = getDynamicPrice(state, TowerType.AA);
  let aaReserve: number;
  if (wave <= 1) {
    aaReserve = 0; // Wave 1: all to maze
  } else {
    // Reserve enough for the gap, but cap so maze still gets funded
    aaReserve = aaGap * aaCostEst;
  }
  aaReserve = Math.min(aaReserve, Math.floor(budget * 0.5));
  const mazeBudget = budget - aaReserve;

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // === 1. GENERATE BOX GEOMETRY ===
  const box = generateBoxMaze(state, side, wave, mazeBudget);

  // === 1.5. TARGETED SELL — open gaps in old seal walls that became internal ===
  const sellTowerIds: string[] = [];
  const firstCorridorY = box.mazeTop + 1;
  const lastCorridorY = box.mazeTop + (box.numWalls - 1) * 2 - 1;

  for (let w = 1; w < box.numWalls - 1; w++) {
    const wallY = box.mazeTop + w * 2;
    const gapAtRight = w % 2 === 1;
    const gapX = gapAtRight ? (box.mazeRight - 1) : (box.mazeLeft + 1);

    if (state.grid.cells[wallY]?.[gapX] === CellType.TOWER) {
      const tower = Object.values(state.towers).find(
        t => t.position.x === gapX && t.position.y === wallY && t.ownerId === playerId
      );
      if (tower) {
        sellTowerIds.push(tower.id);
        state.grid.cells[wallY][gapX] = CellType.EMPTY;
        log(`[MAZE] Sell gap: (${gapX},${wallY}) for switchback w=${w}`);
      }
    }
  }
  // Also open the exit corridor — lastCorridorY on goal side needs no wall
  const goalSideX = side === PlayerSide.RIGHT ? box.mazeRight : box.mazeLeft;
  if (state.grid.cells[lastCorridorY]?.[goalSideX] === CellType.TOWER) {
    const tower = Object.values(state.towers).find(
      t => t.position.x === goalSideX && t.position.y === lastCorridorY && t.ownerId === playerId
    );
    if (tower) {
      sellTowerIds.push(tower.id);
      state.grid.cells[lastCorridorY][goalSideX] = CellType.EMPTY;
      log(`[MAZE] Sell exit: (${goalSideX},${lastCorridorY})`);
    }
  }

  // === 2. BATCH PLACE BOX ===
  const batchCells: MazeCell[] = [];
  for (const cell of box.cells) {
    if (state.grid.cells[cell.y][cell.x] !== CellType.EMPTY) continue;
    if (isInSpawnZone(cell.x, cell.y)) continue;
    if (cell.x < xMin || cell.x > xMax) continue;
    batchCells.push(cell);
  }

  for (const cell of batchCells) {
    state.grid.cells[cell.y][cell.x] = CellType.TOWER;
  }

  const batchPath = findPath(state.grid, side);
  if (batchPath) {
    for (const cell of batchCells) {
      const cost = getDynamicPrice(state, cell.type);
      if (spent + cost > mazeBudget) {
        state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
        continue;
      }
      simulated.push({ x: cell.x, y: cell.y });
      placements.push({ x: cell.x, y: cell.y, type: cell.type, cost });
      spent += cost;
      towerTypeCounts[cell.type] = (towerTypeCounts[cell.type] ?? 0) + 1;
    }
  } else {
    for (const cell of batchCells) {
      state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
    }
    log(`[MAZE] Batch blocked path — cell-by-cell fallback`);
    for (const cell of box.cells) {
      if (spent >= mazeBudget) break;
      if (state.grid.cells[cell.y][cell.x] !== CellType.EMPTY) continue;
      if (isInSpawnZone(cell.x, cell.y)) continue;
      if (cell.x < xMin || cell.x > xMax) continue;

      const cost = getDynamicPrice(state, cell.type);
      if (spent + cost > mazeBudget) continue;

      state.grid.cells[cell.y][cell.x] = CellType.TOWER;
      if (!findPath(state.grid, side)) {
        state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
        continue;
      }
      simulated.push({ x: cell.x, y: cell.y });
      placements.push({ x: cell.x, y: cell.y, type: cell.type, cost });
      spent += cost;
      towerTypeCounts[cell.type] = (towerTypeCounts[cell.type] ?? 0) + 1;
    }
  }

  // === 2b. CHAINED SECTIONS — additional switchback columns ===
  // Each section alternates direction: up, down, up, down...
  // Connected by seal walls, enclosed by outer funnel on last section.
  if (box.numWalls >= 6) {
    let prevExitX = goalSideX; // box 1's exit column
    let goingUp = true; // first extra section goes upward
    let sectionIdx = 0;

    while (mazeBudget - spent >= 500) {
      const section = generateChainedSection(state, side, box, playerId, prevExitX, goingUp);
      if (!section) break;

      // Apply sells
      const secSellIds = section.sellTowerIds;
      for (const towerId of secSellIds) {
        const tower = state.towers[towerId];
        if (tower) state.grid.cells[tower.position.y][tower.position.x] = CellType.EMPTY;
      }

      // Filter to new cells
      const secBatch: MazeCell[] = [];
      for (const cell of section.cells) {
        if (state.grid.cells[cell.y][cell.x] !== CellType.EMPTY) continue;
        if (isInSpawnZone(cell.x, cell.y)) continue;
        if (cell.x < xMin || cell.x > xMax) continue;
        secBatch.push(cell);
      }

      // Batch place
      for (const cell of secBatch) state.grid.cells[cell.y][cell.x] = CellType.TOWER;
      const secPath = findPath(state.grid, side);

      if (secPath) {
        let secSpent = 0;
        for (const cell of secBatch) {
          const cost = getDynamicPrice(state, cell.type);
          if (spent + cost > mazeBudget) {
            state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
            continue;
          }
          simulated.push({ x: cell.x, y: cell.y });
          placements.push({ x: cell.x, y: cell.y, type: cell.type, cost });
          spent += cost;
          secSpent += cost;
          towerTypeCounts[cell.type] = (towerTypeCounts[cell.type] ?? 0) + 1;
        }
        sellTowerIds.push(...secSellIds);
        log(`[MAZE] Section ${sectionIdx + 1} (${goingUp ? 'up' : 'down'}): ${secBatch.length} cells, ${secSpent}c, path ${secPath.length}`);
        prevExitX = section.exitX;
        goingUp = !goingUp;
        sectionIdx++;
      } else {
        // Revert
        for (const cell of secBatch) state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
        for (const towerId of secSellIds) {
          const tower = state.towers[towerId];
          if (tower) state.grid.cells[tower.position.y][tower.position.x] = CellType.TOWER;
        }
        log(`[MAZE] Section ${sectionIdx + 1} blocked path — stopping chain`);
        break;
      }
    }
  }

  // === 3. ADDITIVE REPAIR — fill any wall gaps ===
  for (let round = 0; round < 3; round++) {
    let anyFilled = false;

    for (let w = 0; w < box.numWalls; w++) {
      const wallY = box.mazeTop + w * 2;
      if (wallY > box.mazeBottom || wallY >= GRID.HEIGHT) continue;

      const isSeal = w === 0 || w === box.numWalls - 1;
      const gapX = isSeal ? -1 : (w % 2 === 1
        ? (box.mazeRight - 1) : (box.mazeLeft + 1));

      const gapCells: MazeCell[] = [];
      for (let x = box.mazeLeft; x <= box.mazeRight; x++) {
        if (x === gapX) continue;
        if (state.grid.cells[wallY][x] !== CellType.EMPTY) continue;
        if (isInSpawnZone(x, wallY)) continue;
        gapCells.push({ x, y: wallY, type: isSeal ? TowerType.WALL : TowerType.BASIC });
      }
      if (gapCells.length === 0) continue;

      let gapCost = 0;
      for (const c of gapCells) gapCost += getDynamicPrice(state, c.type);
      if (spent + gapCost > mazeBudget) continue;

      for (const c of gapCells) state.grid.cells[c.y][c.x] = CellType.TOWER;
      if (findPath(state.grid, side)) {
        for (const c of gapCells) {
          const cost = getDynamicPrice(state, c.type);
          simulated.push({ x: c.x, y: c.y });
          placements.push({ x: c.x, y: c.y, type: c.type, cost });
          spent += cost;
          towerTypeCounts[c.type] = (towerTypeCounts[c.type] ?? 0) + 1;
        }
        anyFilled = true;
        log(`[MAZE] Repair: filled ${gapCells.length} gaps in row ${wallY}`);
      } else {
        for (const c of gapCells) state.grid.cells[c.y][c.x] = CellType.EMPTY;
      }
    }
    if (!anyFilled) break;
  }

  // === 4. OFFENSE FILL ===
  // Place DPS towers near the path. Radius scales with wave for late-game spending.
  const fillBudget = mazeBudget - spent;
  const fillRadius = wave >= 15 ? 4 : wave >= 8 ? 3 : 2;
  if (fillBudget >= 50 && wave >= 2) {
    const fillPath = findPath(state.grid, side);
    if (fillPath) {
      const pathSet = new Set(fillPath.map(c => `${c.x},${c.y}`));
      const checked = new Set<string>();
      const candidates: { x: number; y: number; dist: number }[] = [];

      for (const cell of fillPath) {
        for (let dx = -fillRadius; dx <= fillRadius; dx++) {
          for (let dy = -fillRadius; dy <= fillRadius; dy++) {
            if (dx === 0 && dy === 0) continue;
            const dist = Math.abs(dx) + Math.abs(dy);
            if (dist > fillRadius) continue;
            const nx = cell.x + dx, ny = cell.y + dy;
            const key = `${nx},${ny}`;
            if (checked.has(key) || pathSet.has(key)) continue;
            checked.add(key);
            if (nx < xMin || nx > xMax || ny < 0 || ny >= GRID.HEIGHT) continue;
            if (state.grid.cells[ny][nx] !== CellType.EMPTY) continue;
            if (isInSpawnZone(nx, ny)) continue;
            candidates.push({ x: nx, y: ny, dist });
          }
        }
      }
      candidates.sort((a, b) => a.dist - b.dist);

      let fillSpent = 0;
      for (const c of candidates) {
        if (fillSpent >= fillBudget) break;
        let ft = chooseTowerType(state, playerId, depth, towerTypeCounts);
        let fc = getDynamicPrice(state, ft);
        if (fillSpent + fc > fillBudget) {
          ft = TowerType.BASIC;
          fc = getDynamicPrice(state, TowerType.BASIC);
          if (fillSpent + fc > fillBudget) break;
        }
        state.grid.cells[c.y][c.x] = CellType.TOWER;
        if (!findPath(state.grid, side)) {
          state.grid.cells[c.y][c.x] = CellType.EMPTY;
          continue;
        }
        simulated.push(c);
        placements.push({ x: c.x, y: c.y, type: ft, cost: fc });
        fillSpent += fc;
        spent += fc;
        towerTypeCounts[ft] = (towerTypeCounts[ft] ?? 0) + 1;
      }
    }
  }

  // === 5. AA DEFENSE ===
  const aaBudget = budget - spent;
  const aaSpent = placeAADefense(state, playerId, side, aaBudget, wave, placements, simulated);
  spent += aaSpent;

  // Restore grid (placements + sold cells)
  for (const cell of simulated) {
    state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
  }
  for (const towerId of sellTowerIds) {
    const tower = state.towers[towerId];
    if (tower) {
      state.grid.cells[tower.position.y][tower.position.x] = CellType.TOWER;
    }
  }

  // Measure final path (simulate sells + placements)
  const soldCellsRestored: { x: number; y: number }[] = [];
  for (const towerId of sellTowerIds) {
    const tower = state.towers[towerId];
    if (tower && state.grid.cells[tower.position.y][tower.position.x] === CellType.TOWER) {
      state.grid.cells[tower.position.y][tower.position.x] = CellType.EMPTY;
      soldCellsRestored.push({ x: tower.position.x, y: tower.position.y });
    }
  }
  const simCells: { x: number; y: number }[] = [];
  for (const p of placements) {
    if (state.grid.cells[p.y][p.x] === CellType.EMPTY) {
      state.grid.cells[p.y][p.x] = CellType.TOWER;
      simCells.push({ x: p.x, y: p.y });
    }
  }
  const pathAfter = findPath(state.grid, side);
  const pathLenAfter = pathAfter?.length ?? 0;

  if (pathAfter && wave <= 3) {
    const pathStr = pathAfter.slice(0, 40).map(c => `(${c.x},${c.y})`).join(' -> ');
    log(`[MAZE] Path trace: ${pathStr}${pathAfter.length > 40 ? '...' : ''}`);
  }
  for (const c of simCells) state.grid.cells[c.y][c.x] = CellType.EMPTY;
  for (const c of soldCellsRestored) state.grid.cells[c.y][c.x] = CellType.TOWER;

  const typeStr = Object.entries(towerTypeCounts).map(([t, c]) => `${t}:${c}`).join(' ');
  log(`[MAZE] Wave ${wave} | Budget ${budget} | Spent ${spent}c (${typeStr}) AA:${aaSpent}c | Path: ${pathLenBefore} -> ${pathLenAfter} | Placed ${placements.length} towers`);

  return { placements, sellTowerIds };
}

/**
 * Generate box maze geometry. Width stays compact (7), growth is via more
 * switchback rows (numWalls increases with budget). Purely additive.
 */
function generateBoxMaze(
  state: GameState,
  side: PlayerSide,
  wave: number,
  budget: number,
): BoxGeometry {
  const SPAWN_ROW = 14;
  const basicCost = getDynamicPrice(state, TowerType.BASIC);
  const wallPrice = getDynamicPrice(state, TowerType.WALL);

  const empty: BoxGeometry = { cells: [], mazeLeft: 0, mazeRight: 0, mazeTop: SPAWN_ROW - 1, mazeBottom: SPAWN_ROW + 1, numWalls: 0 };
  const maxTowers = Math.floor(budget / basicCost);
  if (maxTowers < 10) return empty;

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  const mazeWidth = 7;

  // Budget accounting
  const funnelXEst = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : GRID.LEFT_ZONE_END;
  let existingFunnelCells = 0;
  for (let dy = -4; dy <= 4; dy++) {
    if (dy === 0) continue;
    const y = SPAWN_ROW + dy;
    if (y >= 0 && y < GRID.HEIGHT && state.grid.cells[y][funnelXEst] === CellType.TOWER) {
      existingFunnelCells++;
    }
  }
  const funnelNewCost = Math.max(0, 8 - existingFunnelCells);
  const mazeTowerBudget = maxTowers - funnelNewCost;

  let existingMazeCost = 0;
  for (let y = 0; y < GRID.HEIGHT; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (x === funnelXEst) continue;
      if (state.grid.cells[y][x] === CellType.TOWER) existingMazeCost += basicCost;
    }
  }
  const mazeCreditBudget = mazeTowerBudget * basicCost;
  const effectiveCreditBudget = mazeCreditBudget + existingMazeCost;

  // Count existing wall rows — allow aggressive growth (up to +4 per wave)
  let existingWallRows = 0;
  for (let y = 0; y < GRID.HEIGHT; y++) {
    let solidCount = 0;
    for (let x = xMin + 1; x <= xMax - 1; x++) {
      if (state.grid.cells[y][x] === CellType.TOWER) solidCount++;
    }
    if (solidCount >= mazeWidth - 2) existingWallRows++;
  }
  const maxWallsThisWave = Math.max(6, existingWallRows + 4);

  const sliceCreditCost = (mazeWidth - 1) * basicCost + 2 * wallPrice;
  let numWalls = 2 + Math.floor((effectiveCreditBudget - 2 * mazeWidth * wallPrice) / sliceCreditCost);
  numWalls = Math.max(2, Math.min(numWalls, maxWallsThisWave, 12));

  const estCost = (w: number) => {
    const solidCost = 2 * mazeWidth * wallPrice;
    const internalCost = Math.max(0, w - 2) * (mazeWidth - 1) * basicCost;
    const sideCost = Math.max(0, 2 * (w - 1) - 2) * wallPrice;
    return solidCost + internalCost + sideCost;
  };
  const estFunnelCost = funnelNewCost * wallPrice;

  let est = estCost(numWalls) + estFunnelCost;
  while (est > effectiveCreditBudget && numWalls > 2) {
    numWalls--;
    est = estCost(numWalls) + estFunnelCost;
  }

  const mazeTop = Math.max(1, SPAWN_ROW - 1);
  // Cap numWalls based on actual grid space available
  const maxWallsFromHeight = Math.floor((GRID.HEIGHT - 2 - mazeTop) / 2) + 1;
  numWalls = Math.min(numWalls, maxWallsFromHeight);
  const mazeHeight = 2 * numWalls - 1;
  const mazeBottom = mazeTop + mazeHeight - 1;

  let mazeLeft: number, mazeRight: number;
  if (side === PlayerSide.RIGHT) {
    mazeLeft = GRID.RIGHT_ZONE_START + 1;
    mazeRight = mazeLeft + mazeWidth - 1;
  } else {
    mazeRight = GRID.LEFT_ZONE_END - 1;
    mazeLeft = mazeRight - mazeWidth + 1;
  }

  if (mazeRight > xMax - 1) mazeRight = xMax - 1;
  if (mazeLeft < xMin + 1) mazeLeft = xMin + 1;

  const actualWidth = mazeRight - mazeLeft + 1;
  if (actualWidth < 5) return empty;

  log(`[MAZE] Box: cols ${mazeLeft}-${mazeRight} (W=${actualWidth}), rows ${mazeTop}-${mazeBottom} (H=${mazeHeight}), ${numWalls} walls, ~${est}c`);

  const cells: MazeCell[] = [];
  const firstCorridorY = mazeTop + 1;
  const lastCorridorY = mazeTop + (numWalls - 1) * 2 - 1;
  const spawnSideX = side === PlayerSide.RIGHT ? mazeLeft : mazeRight;
  const goalSideX = side === PlayerSide.RIGHT ? mazeRight : mazeLeft;

  // 1. FUNNEL — zone edge column
  const funnelX = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : GRID.LEFT_ZONE_END;
  const funnelTop = Math.max(0, mazeTop - 1);
  const funnelBottom = Math.min(GRID.HEIGHT - 1, mazeBottom + 1);
  for (let y = funnelTop; y <= funnelBottom; y++) {
    if (y === firstCorridorY) continue;
    if (isInSpawnZone(funnelX, y)) continue;
    cells.push({ x: funnelX, y, type: TowerType.WALL });
  }

  // 2. SEAL WALLS — solid top and bottom (cheap WALLs)
  for (let w = 0; w < numWalls; w++) {
    const isSeal = w === 0 || w === numWalls - 1;
    if (!isSeal) continue;
    const wallY = mazeTop + w * 2;
    if (wallY > mazeBottom || wallY >= GRID.HEIGHT) continue;
    for (let x = mazeLeft; x <= mazeRight; x++) {
      cells.push({ x, y: wallY, type: TowerType.WALL });
    }
  }

  // 3. SIDE WALLS — seal corridor rows on left/right edges (cheap WALLs)
  for (let y = mazeTop; y <= mazeBottom; y++) {
    if ((y - mazeTop) % 2 === 0) continue;
    if (y !== firstCorridorY) cells.push({ x: spawnSideX, y, type: TowerType.WALL });
    if (y !== lastCorridorY) cells.push({ x: goalSideX, y, type: TowerType.WALL });
  }

  // 4. INTERNAL WALLS — switchback walls with gaps (expensive BASIC for DPS)
  for (let w = 0; w < numWalls; w++) {
    const isSeal = w === 0 || w === numWalls - 1;
    if (isSeal) continue;
    const wallY = mazeTop + w * 2;
    if (wallY > mazeBottom || wallY >= GRID.HEIGHT) continue;
    const gapAtRight = w % 2 === 1;
    const gapX = gapAtRight ? (mazeRight - 1) : (mazeLeft + 1);
    for (let x = mazeLeft; x <= mazeRight; x++) {
      if (x === gapX) continue;
      cells.push({ x, y: wallY, type: TowerType.BASIC });
    }
  }

  return { cells, mazeLeft, mazeRight, mazeTop, mazeBottom, numWalls };
}

/**
 * Generate a chained switchback section on the goal side of a previous section.
 * Sections alternate direction: up, down, up, down...
 * Each section is enclosed by a connector seal (between it and the previous
 * section) and an outer funnel (beyond it toward the goal).
 *
 * @param prevExitX - the goal-side column of the previous section
 * @param goingUp - true = upward traversal, false = downward
 * @returns cells, sells, and the exit column for chaining
 */
function generateChainedSection(
  state: GameState,
  side: PlayerSide,
  box: BoxGeometry,
  playerId: string,
  prevExitX: number,
  goingUp: boolean,
): { cells: MazeCell[]; sellTowerIds: string[]; exitX: number } | null {
  const mazeWidth = box.mazeRight - box.mazeLeft + 1;
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;
  const goalDir = side === PlayerSide.RIGHT ? 1 : -1;

  // Position: 1 col for connector seal, then the section
  const sealWallX = prevExitX + goalDir;
  const secLeft = side === PlayerSide.RIGHT
    ? sealWallX + 1
    : sealWallX - mazeWidth;
  const secRight = side === PlayerSide.RIGHT
    ? secLeft + mazeWidth - 1
    : sealWallX - 1;
  const outerFunnelX = side === PlayerSide.RIGHT ? secRight + 1 : secLeft - 1;

  // Spawn side faces previous section, goal side faces next/goal
  const spawnSideX = side === PlayerSide.RIGHT ? secLeft : secRight;
  const goalSideXSec = side === PlayerSide.RIGHT ? secRight : secLeft;

  // Bounds check — need room for section + outer funnel
  if (secLeft < xMin || secRight > xMax) return null;
  if (outerFunnelX < xMin || outerFunnelX > xMax) return null;

  const firstCorridorY = box.mazeTop + 1;
  const lastCorridorY = box.mazeTop + (box.numWalls - 1) * 2 - 1;

  // Entry/exit rows depend on direction
  const entryRow = goingUp ? lastCorridorY : firstCorridorY;
  const exitRow = goingUp ? firstCorridorY : lastCorridorY;

  const cells: MazeCell[] = [];
  const sellTowerIds: string[] = [];

  // --- Find towers to sell ---
  const cellsToSell: { x: number; y: number }[] = [];

  // Connector cell
  cellsToSell.push({ x: sealWallX, y: entryRow });

  // Outer funnel exit + clear 3 cells beyond
  cellsToSell.push({ x: outerFunnelX, y: exitRow });
  for (let i = 1; i <= 3; i++) {
    cellsToSell.push({ x: outerFunnelX + goalDir * i, y: exitRow });
  }

  // Corridor cells (must be empty for path)
  for (let y = box.mazeTop; y <= box.mazeBottom; y++) {
    if ((y - box.mazeTop) % 2 === 0) continue;
    for (let x = secLeft; x <= secRight; x++) {
      if (x === spawnSideX && y !== entryRow) continue;
      if (x === goalSideXSec && y !== exitRow) continue;
      cellsToSell.push({ x, y });
    }
  }

  // Gap cells
  for (let w = 1; w < box.numWalls - 1; w++) {
    const wallY = box.mazeTop + w * 2;
    const gapX = getGapX(w, box.numWalls, secLeft, secRight, side, goingUp);
    cellsToSell.push({ x: gapX, y: wallY });
  }

  for (const cell of cellsToSell) {
    if (cell.x < 0 || cell.x >= GRID.WIDTH || cell.y < 0 || cell.y >= GRID.HEIGHT) continue;
    if (state.grid.cells[cell.y]?.[cell.x] === CellType.TOWER) {
      const tower = Object.values(state.towers).find(
        t => t.position.x === cell.x && t.position.y === cell.y && t.ownerId === playerId
      );
      if (tower) sellTowerIds.push(tower.id);
    }
  }

  // --- Generate cells ---

  // 1. CONNECTOR SEAL — blocks all rows except entry
  for (let y = box.mazeTop; y <= box.mazeBottom; y++) {
    if (y === entryRow) continue;
    if (isInSpawnZone(sealWallX, y)) continue;
    cells.push({ x: sealWallX, y, type: TowerType.WALL });
  }

  // 2. OUTER FUNNEL — blocks all rows except exit
  const funnelTop = Math.max(0, box.mazeTop - 1);
  const funnelBottom = Math.min(GRID.HEIGHT - 1, box.mazeBottom + 1);
  for (let y = funnelTop; y <= funnelBottom; y++) {
    if (y === exitRow) continue;
    if (isInSpawnZone(outerFunnelX, y)) continue;
    cells.push({ x: outerFunnelX, y, type: TowerType.WALL });
  }

  // 3. SEAL WALLS — solid top and bottom
  for (let w = 0; w < box.numWalls; w++) {
    const isSeal = w === 0 || w === box.numWalls - 1;
    if (!isSeal) continue;
    const wallY = box.mazeTop + w * 2;
    if (wallY > box.mazeBottom || wallY >= GRID.HEIGHT) continue;
    for (let x = secLeft; x <= secRight; x++) {
      cells.push({ x, y: wallY, type: TowerType.WALL });
    }
  }

  // 4. SIDE WALLS — entry side open at entryRow, exit side open at exitRow
  for (let y = box.mazeTop; y <= box.mazeBottom; y++) {
    if ((y - box.mazeTop) % 2 === 0) continue;
    if (y !== entryRow) cells.push({ x: spawnSideX, y, type: TowerType.WALL });
    if (y !== exitRow) cells.push({ x: goalSideXSec, y, type: TowerType.WALL });
  }

  // 5. INTERNAL WALLS with gaps
  for (let w = 0; w < box.numWalls; w++) {
    const isSeal = w === 0 || w === box.numWalls - 1;
    if (isSeal) continue;
    const wallY = box.mazeTop + w * 2;
    if (wallY > box.mazeBottom || wallY >= GRID.HEIGHT) continue;

    const gapX = getGapX(w, box.numWalls, secLeft, secRight, side, goingUp);
    for (let x = secLeft; x <= secRight; x++) {
      if (x === gapX) continue;
      cells.push({ x, y: wallY, type: TowerType.BASIC });
    }
  }

  log(`[MAZE] Chain: cols ${secLeft}-${secRight} ${goingUp ? 'UP' : 'DOWN'}, seal=${sealWallX}, funnel=${outerFunnelX}, sells=${sellTowerIds.length}`);
  return { cells, sellTowerIds, exitX: goalSideXSec };
}

/**
 * Calculate gap position for an internal wall.
 * Downward sections use box 1's pattern. Upward sections reverse it.
 */
function getGapX(
  w: number, numWalls: number,
  secLeft: number, secRight: number,
  side: PlayerSide, goingUp: boolean,
): number {
  let gapAtRight: boolean;
  if (goingUp) {
    // Reversed for upward traversal
    gapAtRight = side === PlayerSide.RIGHT
      ? ((numWalls - 2 - w) % 2 === 0)
      : ((numWalls - 2 - w) % 2 === 1);
  } else {
    // Same as box 1 for downward traversal
    gapAtRight = w % 2 === 1;
  }
  return gapAtRight ? (secRight - 1) : (secLeft + 1);
}

/**
 * Place AA towers along the flight corridor.
 * No uncapped late-game spending — excess goes to offense fill + upgrades instead.
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

  // Aggressive AA targeting: 5x previous values.
  // Build proactively every wave, not just when air is warned.
  const aaTarget = Math.round(4 + wave * 1.5);

  let aaNeeded = Math.max(0, aaTarget - totalAA);
  if (aaNeeded === 0) return 0;

  const aaCost = getDynamicPrice(state, TowerType.AA);
  const maxAirBudget = Math.min(totalBudget, aaNeeded * aaCost);
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  // Collect existing + planned AA positions for spread scoring
  const existingAAPositions = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA)
    .map(t => t.position);
  const placedAAPositions = [...existingAAPositions];

  // Candidates: horizontal band rows 12-16 (all within AA range 6 of flight path row 14).
  // Prioritize: row 14 first, then 13/15, then 12/16.
  // Within each row, spread horizontally across the full zone width.
  const candidates: { x: number; y: number; score: number }[] = [];
  const flightRows = [14, 13, 15, 12, 16]; // priority order

  for (const y of flightRows) {
    if (y < 0 || y >= GRID.HEIGHT) continue;
    const rowPriority = 10 - Math.abs(y - 14) * 2; // 10 for row 14, 8 for 13/15, 6 for 12/16

    for (let x = xMin; x <= xMax; x++) {
      if (state.grid.cells[y][x] !== CellType.EMPTY) continue;
      if (isInSpawnZone(x, y)) continue;

      // Horizontal spread: prefer positions far from existing AA on the X axis
      let minXDist = 100;
      for (const pos of placedAAPositions) {
        const xDist = Math.abs(pos.x - x);
        if (xDist < minXDist) minXDist = xDist;
      }
      // Score: row priority + horizontal spread (capped at 6 to not dominate)
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
    // Update spread tracking so next placement spaces out from this one
    placedAAPositions.push({ x: c.x, y: c.y });
  }

  if (placed > 0) log(`[MAZE] AA: ${placed} towers (${spent}c), target=${aaTarget}, existing=${existingAA}`);
  return spent;
}
