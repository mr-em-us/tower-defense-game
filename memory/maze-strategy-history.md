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

## Iteration 9: Batch Placement + Self-Repair (2026-03-17, CURRENT)
**Problem:** Cell-by-cell validation fundamentally broken for maze construction.
**Approach:**
1. **Batch placement:** Place ALL maze cells on grid at once, single path validation. No per-cell rejection.
2. **Self-repair loop (additive only):** After batch, scan each wall row for unexpected gaps. If found, batch-fill the gaps (place all gap cells at once, validate once). Never sell existing towers during repair.
3. **Targeted sell:** Only sell WALL-type towers on corridor rows that are old side walls (not at current edges). Don't touch DPS towers.
4. Removed WALL value cap.
5. Removed greedy algorithm.
6. Removed return corridor.

**Key code structure:**
```
generateMazeLayout():
  0. Sell old side walls (WALL type only, corridor rows, not at current edges)
  1. Batch place entire box maze (single path validation)
  2. Self-repair: fill wall gaps (additive only, batch per row)
  3. Offense fill (DPS towers adjacent to path)
  4. AA defense
```

**Status:** Testing in progress. Batch placement should fix the core gap issue.

---

## Failed Approaches Summary (DO NOT RETRY)
1. **Vertical columns** — wrong shape entirely
2. **Straight parallel walls as corridors** — no maze value, just distance
3. **Cell-by-cell path validation for interdependent maze cells** — rejects valid placements due to intermediate invalid states
4. **WALL cap at 10%** — makes maze too expensive, breaks structure
5. **Greedy single-cell path extension** — creates random diagonals, not structured maze
6. **Destructive self-repair (sell entire rows)** — gutted the maze, couldn't afford to rebuild

## Proven Approaches (USE THESE)
1. **Compact box with horizontal switchbacks** — correct fundamental shape
2. **WALL for structure, BASIC for internal walls** — budget efficient + DPS
3. **Funnel column at zone edge** — prevents bypass
4. **Batch placement with single validation** — avoids cell interdependency issue
5. **Additive repair** — fill gaps without destroying what works
6. **Sell only old side walls** — targeted, not aggressive
