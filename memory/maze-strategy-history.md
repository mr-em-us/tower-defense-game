# Maze Strategy Evolution Log

**Purpose:** Complete history of AI maze strategy iterations. READ THIS before making any maze changes to avoid repeating failed approaches.

---

## Iteration 1: Column-Based (2026-03-15, ABANDONED)
**Approach:** Vertical columns with gaps, serpentine path between columns.
**Result:** Fundamentally wrong shape. Best: wave 7. Jason showed his compact box maze vs AI columns — completely different approach.
**Lesson:** Must build a compact rectangular box with horizontal switchbacks, not vertical columns.

## Iteration 2: Compact Box Maze v1 (2026-03-15 evening)
**Approach:** Rectangular box near spawn with horizontal internal walls. Each wall has 1-cell gap at alternating ends (left/right). WALL towers (25c) for structure, BASIC (50c) for internal walls (DPS). Greedy path extension after box. Funnel column at zone edge.
**File:** `server/ai/strategies/maze.ts`
**Result:** Wave 13, path 173. Major success.
**Key elements:**
- Box width 7, 4 walls, placed at cols 31-37, rows 13-19 (RIGHT side)
- Funnel at col 30 blocks bypass above/below entrance
- First/last walls solid (seal), internal walls have alternating gaps
- Side walls on corridor rows (entrance at firstCorridorY, exit at lastCorridorY)
- Greedy extension: picks best single cell on BFS path to maximize path increase
- Offense fill: DPS towers adjacent to path
- Economy upgrades start wave 5

## Iteration 3: Return Corridor — Straight Hallway (2026-03-17, FAILED)
**Problem:** After exiting the box, enemies beeline straight to the goal. No structure forces them to travel further.
**Approach:** Two parallel WALL rows extending from maze exit toward board edge, creating a corridor.
**Result:** Just a straight hallway with zero switchbacks. Enemies walk horizontally to the end. No maze value. Also ate too much budget when included in wave 1.
**Lesson:** A corridor without internal walls is not a maze. Never build straight parallel walls as a "corridor."

## Iteration 4: Return Corridor in Box Budget (2026-03-17, FAILED)
**Approach:** Same as #3 but only built with leftover budget after box (not included in wave 1 budget).
**Result:** Still a straight hallway. Path "extension" was just horizontal distance, not switchback length.
**Lesson:** The corridor concept is fundamentally flawed — it adds distance but not maze complexity.

## Iteration 5: Aggressive Box Widening (2026-03-17, PARTIALLY WORKED)
**Problem:** Needed post-box path extension that's actually a maze, not a hallway.
**Approach:** Make the box itself grow wider each wave. Width formula: `Math.min(zoneWidth - 2, 7 + wave * 2)`. The switchback pattern naturally extends as walls get longer. Removed greedy algorithm (it created random diagonals). Removed return corridor entirely.
**Result:** Box widens correctly BUT internal walls have gaps where old gap positions couldn't be filled.
**Root cause:** Cell-by-cell path validation. When filling old gap at col 36 (from width-7 era), the path currently goes through it. Validation rejects the fill because it blocks the current path, even though the new gap at col 40 would be valid.

## Iteration 6: Cell Ordering Fix (2026-03-17, FAILED)
**Problem:** Old gap positions not filling when box widens.
**Approach:** Reorder cell placement: seal walls first, then internal walls placed from extension end inward (right-to-left for RIGHT side). Theory: new gap passage established before old gap sealed.
**Result:** Still left gaps. The fundamental issue is that cell-by-cell validation with interdependent cells doesn't work for maze widening.
**Lesson:** Cannot fix batch-level constraints with cell ordering. The cells are interdependent.

## Iteration 7: Old Side Wall Sell + Cell Ordering (2026-03-17, FAILED)
**Problem:** Old goal-side wall towers on corridor rows become mid-maze obstacles.
**Approach:** Sell old WALL towers on corridor rows inside the box before placing new cells.
**Result:** Still had gaps in internal walls. Sell helped with corridors but didn't fix wall-row gap filling.

## Iteration 8: WALL Value Cap at 10% (2026-03-17, FAILED BADLY)
**Problem:** User requested limiting WALL towers to 10% of total tower value.
**Approach:** `wallOrBasic()` checks total WALL value before placing. If over 10%, uses BASIC instead.
**Result:** Converted almost all structural WALLs to BASIC (50c vs 25c), doubling the cost. Maze budget exhausted with far fewer towers. Path: 30→30 (zero switchbacks!). Maze completely broken.
**Lesson:** 10% is way too aggressive. WALLs are critical for budget efficiency. If we revisit this, cap should be much higher (40%+) or only apply to non-structural positions.

## Iteration 9: Batch Placement + Self-Repair (2026-03-17, SUPERSEDED)
**Problem:** Cell-by-cell validation fundamentally broken for maze construction.
**Approach:** Batch placement + self-repair + targeted sell of old side walls.
**Result:** Batch worked for initial box but path stayed at 43 (never grew). Old seal walls blocked new switchback gaps when maze tried to grow downward.
**Lesson:** When numWalls increases, old bottom seal becomes internal wall needing a gap. But existing tower at gap position can't be removed without selling.

## Iteration 10: Targeted Gap Sells + Growth Limiting (2026-03-17, CURRENT)
**Problem:** Old seal walls block switchback gaps; batch fails when too many walls added at once.
**Approach:**
1. **Targeted sells**: Before batch, find internal wall rows where the gap position has an existing tower. Sell ONLY that specific cell. Also sell old exit corridor wall if lastCorridorY moved.
2. **Growth limiting**: Count existing wall rows, cap new walls at +2/wave (prevents batch-blocking-path failures when jumping from 4 to 12 walls at once).
3. **Offense fill radius 2**: Search within 2 cells of path (not just adjacent). Starts wave 2 instead of wave 3. Sorts by distance.
4. Cell priority: funnel → seals → side walls → internal walls (cheapest/structural first).

**Key code structure:**
```
generateMazeLayout():
  1. Generate box geometry (width 7, numWalls capped at existing+2)
  1.5. Targeted sells: gap cells in old seal→internal conversions + old exit
  2. Batch place (single path validation, cell-by-cell fallback)
  3. Additive repair (fill wall gaps without selling)
  4. Offense fill (radius 2, sorted by distance)
  5. AA defense
```

**Results (Iteration 10a — gap sell only):**
- Wave 1: path 43. Wave 2: sold (36,19), path → 61. ✓ Switchbacks work!
- Waves 1-12: ZERO leaks except wave 6 (2 BASIC). 464 HP at wave 12.
- Wave 13: batch fell back to cell-by-cell (12 walls too many at once). Game hung.

**Results (Iteration 10b — + growth limit + offense fill):**
- Path: 43 → 59 (wave 2) → 77 (wave 9) → 81 (wave 10)
- Wave 10 at 410 HP (only 3 FLYING leaked at wave 6)
- Game hangs during wave 11+ combat — caused by JSON.stringify on broadcast

**Results (Iteration 10c — + broadcast skip when no listeners):**
- **WAVE 20 reached! 500 HP through wave 19, died during wave 20 combat.**
- **ZERO LEAKS on waves 1-19.** Perfect defense for 19 straight waves.
- Path: 43 → 59 (wave 2) → 79 (wave 9) → 81 (wave 10+)
- 171 towers by wave 19 (12 walls, width 7, tons of offense fill)
- Broadcast optimization: skip JSON.stringify when no WebSocket OPEN connections
  - Fixed the "game hangs at wave 11+" issue that was blocking all testing

**Status:** Goal achieved — AI reaches wave 20 reliably.

---

## Failed Approaches Summary (DO NOT RETRY)
1. **Vertical columns** — wrong shape entirely
2. **Straight parallel walls as corridors** — no maze value, just distance
3. **Cell-by-cell path validation for interdependent maze cells** — rejects valid placements due to intermediate invalid states
4. **WALL cap at 10%** — makes maze too expensive, breaks structure
5. **Greedy single-cell path extension** — creates random diagonals, not structured maze
6. **Destructive self-repair (sell entire rows)** — gutted the maze, couldn't afford to rebuild
7. **Aggressive widening** — old side walls become mid-corridor obstacles, can't be removed

## Proven Approaches (USE THESE)
1. **Compact box with horizontal switchbacks (width 7, fixed)** — correct fundamental shape
2. **WALL for structure, BASIC for internal walls** — budget efficient + DPS
3. **Funnel column at zone edge** — prevents bypass
4. **Batch placement with single validation** — avoids cell interdependency issue
5. **Additive growth (more rows, not wider)** — avoids widening issues entirely
6. **Targeted gap sells** — only sell the specific cell blocking a switchback gap
7. **Growth limit +2 walls/wave** — prevents batch failure from too many new walls
8. **Cell priority: funnel → seals → side walls → internal walls** — structural first

## Dev Tools
- **AI test endpoint:** `GET /api/ai-test?speed=4` — headless game, returns JSON with waveReached, aiHealth
- **Auto-test requires no browser** — instant iteration on maze changes
