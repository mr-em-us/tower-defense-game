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

  const airCountdown = state.airWaveCountdown; // -1 = none, 0 = this wave, 1-3 = N waves away
  // AA reserve: ZERO early (maze growth is critical). Only reserve when air is imminent.
  let aaReserve: number;
  if (wave <= 6) {
    // Early game: only reserve AA if air wave is imminent
    if (airCountdown === 0) aaReserve = Math.min(300, Math.floor(budget * 0.3));
    else if (airCountdown === 1) aaReserve = Math.min(200, Math.floor(budget * 0.2));
    else aaReserve = 0; // All budget to maze growth
  } else if (wave <= 12) {
    // Mid game: moderate reserve
    aaReserve = 200 + wave * 20;
    if (airCountdown === 0) aaReserve = 500 + wave * 40;
    else if (airCountdown === 1) aaReserve = 400 + wave * 30;
    aaReserve = Math.min(aaReserve, Math.floor(budget * 0.35));
  } else {
    // Late game: scale with wave
    aaReserve = 300 + wave * 30;
    if (airCountdown === 0) aaReserve = 800 + wave * 80;
    else if (airCountdown === 1) aaReserve = 600 + wave * 60;
    if (wave <= 20) aaReserve = Math.min(aaReserve, Math.floor(budget * 0.45));
  }
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


  // === 1.6. CLEAR NEW CORRIDORS — sell towers blocking corridor rows in expanded box ===
  // When the box grows, new corridor rows may have offense fill towers from earlier waves.
  const spawnSideX = side === PlayerSide.RIGHT ? box.mazeLeft : box.mazeRight;
  for (let y = box.mazeTop; y <= box.mazeBottom; y++) {
    if ((y - box.mazeTop) % 2 === 0) continue; // skip wall rows
    for (let x = box.mazeLeft; x <= box.mazeRight; x++) {
      // Keep designed side walls
      if (x === spawnSideX && y !== firstCorridorY) continue;
      if (x === goalSideX && y !== lastCorridorY) continue;
      if (state.grid.cells[y]?.[x] === CellType.TOWER) {
        const tower = Object.values(state.towers).find(
          t => t.position.x === x && t.position.y === y && t.ownerId === playerId
        );
        if (tower) {
          sellTowerIds.push(tower.id);
          state.grid.cells[y][x] = CellType.EMPTY;
          log(`[MAZE] Sell corridor: (${x},${y}) ${tower.type}`);
        }
      }
    }
  }

  // === 1.7. SELL CONFLICTING TOWERS — non-structural towers blocking new wall/seal positions ===
  // Only sell towers that are truly wrong for their position (e.g., offense fill SPLASH in a wall row).
  // Don't sell WALL→BASIC conversions — WALLs in internal wall rows are fine structurally.
  for (const cell of box.cells) {
    if (cell.x < xMin || cell.x > xMax) continue;
    if (isInSpawnZone(cell.x, cell.y)) continue;
    if (state.grid.cells[cell.y]?.[cell.x] === CellType.TOWER) {
      const existing = Object.values(state.towers).find(
        t => t.position.x === cell.x && t.position.y === cell.y && t.ownerId === playerId
      );
      if (!existing) continue;
      // Skip if tower type matches or is WALL/BASIC in a wall row (both OK structurally)
      const isWallRow = cell.type === TowerType.WALL || cell.type === TowerType.BASIC;
      const existingIsStructural = existing.type === TowerType.WALL || existing.type === TowerType.BASIC;
      if (existing.type === cell.type) continue;
      if (isWallRow && existingIsStructural) continue; // WALL↔BASIC is fine
      sellTowerIds.push(existing.id);
      state.grid.cells[cell.y][cell.x] = CellType.EMPTY;
      log(`[MAZE] Sell conflict: (${cell.x},${cell.y}) ${existing.type} -> ${cell.type}`);
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
  if (!batchPath) {
    log(`[MAZE] Batch blocked path — reverting`);
  }
  // No box budget cap — let the box spend what it needs.
  // Chain section has its own budget check (mazeBudget - spent >= 200).
  const boxBudgetCap = mazeBudget;

  if (batchPath) {
    for (const cell of batchCells) {
      const cost = getDynamicPrice(state, cell.type);
      if (spent + cost > boxBudgetCap) {
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
  // Trigger at 6+ walls — need enough switchbacks for meaningful chain.
  if (box.numWalls >= 6 && wave >= 5) {
    let prevExitX = goalSideX; // box 1's exit column
    let goingUp = true; // first extra section goes upward
    let sectionIdx = 0;

    // Chain needs ~350c minimum (WALL internals make them cheaper).
    while (mazeBudget - spent >= 350) {
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

  // === 4a. STRATEGIC SLOW — place SLOW towers at switchback turns ===
  // Turns are where enemies change direction. SLOW here maximizes DPS overlap.
  // Place at wave 1-3 for initial DPS boost.
  if (mazeBudget - spent >= 80 && wave <= 3) {
    const slowCost = getDynamicPrice(state, TowerType.SLOW);
    for (let w = 1; w < box.numWalls - 1; w++) {
      if (mazeBudget - spent < slowCost) break;
      const wallY = box.mazeTop + w * 2;
      const gapAtRight = w % 2 === 1;
      const gapX = gapAtRight ? (box.mazeRight - 1) : (box.mazeLeft + 1);
      // Place SLOW adjacent to the gap (one cell toward the corridor)
      const slowY = wallY + 1; // corridor below the wall
      const slowX = gapX;
      if (slowY >= GRID.HEIGHT || slowX < xMin || slowX > xMax) continue;
      if (state.grid.cells[slowY]?.[slowX] !== CellType.EMPTY) continue;
      if (isInSpawnZone(slowX, slowY)) continue;
      state.grid.cells[slowY][slowX] = CellType.TOWER;
      const checkPath = findPath(state.grid, side);
      if (!checkPath) {
        state.grid.cells[slowY][slowX] = CellType.EMPTY;
        continue;
      }
      simulated.push({ x: slowX, y: slowY });
      placements.push({ x: slowX, y: slowY, type: TowerType.SLOW, cost: slowCost });
      spent += slowCost;
      towerTypeCounts[TowerType.SLOW] = (towerTypeCounts[TowerType.SLOW] ?? 0) + 1;
      log(`[MAZE] Strategic SLOW at (${slowX},${slowY}) near gap w=${w}`);
    }
  }

  // === 4b. OFFENSE FILL ===
  // Place DPS towers near the path (not on it). Large radius to cover exit corridor.
  const fillBudget = mazeBudget - spent;
  const fillRadius = wave >= 10 ? 5 : wave >= 5 ? 4 : 3;
  if (fillBudget >= 50) {
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
      // Sort by priority: cells near the exit corridor (few nearby towers) get higher priority.
      // This ensures DPS coverage extends beyond the box to the board edge.
      for (const c of candidates) {
        let nearbyTowers = 0;
        for (let dx2 = -3; dx2 <= 3; dx2++) {
          for (let dy2 = -3; dy2 <= 3; dy2++) {
            const nx2 = c.x + dx2, ny2 = c.y + dy2;
            if (nx2 >= 0 && nx2 < GRID.WIDTH && ny2 >= 0 && ny2 < GRID.HEIGHT) {
              if (state.grid.cells[ny2][nx2] === CellType.TOWER) nearbyTowers++;
            }
          }
        }
        // Score: lower = higher priority. Prefer under-defended areas (low nearbyTowers)
        // with slight preference for closer to path (lower dist)
        (c as any).priority = nearbyTowers * 2 + c.dist;
      }
      candidates.sort((a, b) => (a as any).priority - (b as any).priority);

      // Track minimum acceptable path length — NEVER allow shortening
      let minPathLen = fillPath?.length ?? 0;
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
        const postPath = findPath(state.grid, side);
        if (!postPath || postPath.length < minPathLen) {
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
  if (budget < 250) return empty;

  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  const mazeWidth = 7;

  const mazeTop = Math.max(1, SPAWN_ROW - 1);
  const maxWallsFromHeight = Math.floor((GRID.HEIGHT - 2 - mazeTop) / 2) + 1;

  // NumWalls determined purely by wave number, not budget.
  // Wave 1: 4, Wave 2: 4, Wave 3: 6, Wave 4: 6, Wave 5: 8, Wave 6: 8, ...
  // The batch placement step handles budget — if we can't afford all cells,
  // cell-by-cell fallback places what it can in priority order.
  let numWalls = Math.min(4 + 2 * Math.floor(wave / 2), maxWallsFromHeight);
  // Force even
  if (numWalls > 2 && numWalls % 2 !== 0) numWalls--;
  numWalls = Math.max(4, numWalls);

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

  const mazeHeight = 2 * numWalls - 1;
  const mazeBottom = mazeTop + mazeHeight - 1;

  const actualWidth = mazeRight - mazeLeft + 1;
  if (actualWidth < 5) return empty;

  log(`[MAZE] Box: cols ${mazeLeft}-${mazeRight} (W=${actualWidth}), rows ${mazeTop}-${mazeBottom} (H=${mazeHeight}), ${numWalls} walls`);

  const cells: MazeCell[] = [];
  const firstCorridorY = mazeTop + 1;
  const lastCorridorY = mazeTop + (numWalls - 1) * 2 - 1;
  const spawnSideX = side === PlayerSide.RIGHT ? mazeLeft : mazeRight;
  const goalSideX = side === PlayerSide.RIGHT ? mazeRight : mazeLeft;

  // 1. FUNNEL — zone edge column (must be first — prevents bypass)
  const funnelX = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : GRID.LEFT_ZONE_END;
  const funnelTop = Math.max(0, mazeTop - 1);
  const funnelBottom = Math.min(GRID.HEIGHT - 1, mazeBottom + 1);
  for (let y = funnelTop; y <= funnelBottom; y++) {
    if (y === firstCorridorY) continue;
    if (isInSpawnZone(funnelX, y)) continue;
    cells.push({ x: funnelX, y, type: TowerType.WALL });
  }

  // 2. TOP SEAL — solid top wall (always needed)
  const topY = mazeTop;
  for (let x = mazeLeft; x <= mazeRight; x++) {
    cells.push({ x, y: topY, type: TowerType.WALL });
  }

  // 3. BUILD EACH ROW as a unit: internal wall + its corridor side walls
  // This ensures limited budget creates complete switchbacks instead of just structural shells.
  // Process ROW-BY-ROW from top to bottom (existing rows first, then new growth).
  for (let w = 1; w < numWalls - 1; w++) {
    const wallY = mazeTop + w * 2;
    const corridorY = wallY - 1; // corridor above this wall
    if (wallY > mazeBottom || wallY >= GRID.HEIGHT) continue;

    // Side walls for the corridor above this internal wall
    if (corridorY !== firstCorridorY) {
      cells.push({ x: spawnSideX, y: corridorY, type: TowerType.WALL });
    }
    if (corridorY !== lastCorridorY) {
      cells.push({ x: goalSideX, y: corridorY, type: TowerType.WALL });
    }

    // Internal wall with gap
    const gapAtRight = w % 2 === 1;
    const gapX = gapAtRight ? (mazeRight - 1) : (mazeLeft + 1);
    for (let x = mazeLeft; x <= mazeRight; x++) {
      if (x === gapX) continue;
      cells.push({ x, y: wallY, type: TowerType.BASIC }); // BASIC for DPS on internal walls
    }
  }

  // 4. LAST CORRIDOR side walls (between last internal wall and bottom seal)
  if (numWalls >= 3) {
    const lastCorrY = lastCorridorY;
    if (lastCorrY !== firstCorridorY) {
      cells.push({ x: spawnSideX, y: lastCorrY, type: TowerType.WALL });
    }
    // goalSideX at lastCorridorY is the EXIT — don't wall it
  }

  // 5. BOTTOM SEAL — solid bottom wall (placed last since switchbacks matter more)
  const bottomY = mazeTop + (numWalls - 1) * 2;
  if (bottomY !== topY && bottomY >= 0 && bottomY < GRID.HEIGHT) {
    for (let x = mazeLeft; x <= mazeRight; x++) {
      cells.push({ x, y: bottomY, type: TowerType.WALL });
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
      cells.push({ x, y: wallY, type: TowerType.WALL }); // WALL for cheaper chain sections
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

  const airCountdown = state.airWaveCountdown;
  let aaTarget: number;
  if (airCountdown === 0) {
    // Air THIS wave — maximum AA
    aaTarget = 8 + Math.floor(wave * 1.2);
  } else if (airCountdown === 1) {
    aaTarget = 6 + Math.floor(wave * 0.9);
  } else if (airCountdown === 2 || airCountdown === 3) {
    aaTarget = 5 + Math.floor(wave * 0.7);
  } else {
    // No air warning — keep enough AA for surprise air waves
    aaTarget = 4 + Math.floor(wave * 0.6);
  }

  let aaNeeded = Math.max(0, aaTarget - totalAA);
  // Mid game: place some extra AA with excess budget. Cap at 10 per wave —
  // beyond that, upgrades to existing AA are far more effective than new level-1s.
  if (wave >= 8 && totalBudget > 500) {
    const excessAA = Math.min(10, Math.floor(totalBudget * 0.3 / getDynamicPrice(state, TowerType.AA)));
    aaNeeded = Math.max(aaNeeded, excessAA);
  }
  if (aaNeeded === 0) return 0;

  const aaCost = getDynamicPrice(state, TowerType.AA);
  const maxAirBudget = Math.min(totalBudget, aaNeeded * aaCost);
  const xMin = side === PlayerSide.RIGHT ? GRID.RIGHT_ZONE_START : 0;
  const xMax = side === PlayerSide.RIGHT ? GRID.WIDTH - 1 : GRID.LEFT_ZONE_END;

  const existingAAPositions = Object.values(state.towers)
    .filter(t => t.ownerId === playerId && t.type === TowerType.AA)
    .map(t => t.position);

  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = 5; y <= 25 && y < GRID.HEIGHT; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (state.grid.cells[y][x] !== CellType.EMPTY) continue;
      if (isInSpawnZone(x, y)) continue;
      const flightScore = 8 - Math.abs(y - 14);
      let spreadScore = 8;
      for (const pos of existingAAPositions) {
        spreadScore = Math.min(spreadScore, Math.abs(pos.x - x) + Math.abs(pos.y - y));
      }
      candidates.push({ x, y, score: flightScore + spreadScore });
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
  }

  if (placed > 0) log(`[MAZE] AA: ${placed} towers (${spent}c), target=${aaTarget}, existing=${existingAA}`);
  return spent;
}
