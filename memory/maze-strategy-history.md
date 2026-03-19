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

**Status:** Best single-box result. AA buff needed separately.

## Iteration 11: AA Tower Balance Buff (2026-03-17 PM, CURRENT ★★★)
**Problem:** Flying enemies too powerful. AA does 15 dmg/shot (5 base × 3x), ground towers do 25% damage (nearly useless). Wave 9/13 air waves kill the AI.
**Changes (in shared/types/constants.ts and server/systems/ProjectileSystem.ts):**
1. AA damage: 5 → 8 (= 24/shot vs flying, 108 DPS per tower)
2. Ground vs flying multiplier: 0.25 → 0.40 (SNIPER now does 20 vs flying)
**Result (iteration 10 single-box code + AA buff):**
- **WAVE 22+ reached! Timed out at 5 min limit, AI still alive at 41 HP!**
- Waves 1-8: ZERO leaks, 500 HP
- Wave 9: 3 FLYING leaked → 383 HP
- Waves 10-17: ZERO leaks, 383 HP
- Wave 18: 3 FLYING leaked → 41 HP
- Waves 19-21: ZERO leaks, 41 HP, still going
- 169 towers by wave 20, path ~81
- Only 6 total enemies leaked across 21+ waves (all FLYING)
**Key insight:** The AA buff was the critical missing piece. The maze strategy (iteration 10) was already excellent — the problem was AA tower balance, not maze design.

## Iteration 11b: Chained Boxes (2026-03-17 PM, ABANDONED)
**Problem:** Single box maxes out at ~8 walls (grid height limit), path ~81. Need more path length.
**Approach:** Build box 2 (cols 39-45) adjacent to box 1 (cols 31-37), connected via last corridor. Enemies exit box 1, enter box 2 for double path length.
**Result:** Box 2 built correctly but enemies BYPASSED it entirely. Path stayed at 75.
**Root cause 1:** Old exit corridors (where lastCorridorY was before maze grew) leave holes in the goal-side wall. Enemies escape through these holes instead of going to the current exit.
**Root cause 2:** Corridor side wall repair (one-at-a-time with path validation) FAILS because blocking the current escape route blocks the current path, even though a longer valid path exists.
**Root cause 3:** Box 2's entrance/exit logic was wrong — needed entrance at bottom spawn side, exit at top goal side for proper upward traversal.
**Lesson:** Chained boxes require solving the "old exit hole" problem first. The corridor side wall repair is subject to the same cell-by-cell validation trap as the old gap fill issue. Need batch placement for corridor repairs too.
**Decision:** REVERTED to single-box (iteration 10). The complexity of chained boxes is high and the core issue (old exit holes) is not yet solved.

## Iteration 11c: AA Scaling + Economy Tuning (2026-03-17 PM, CURRENT)
**Problem:** AI hoards credits (75k+ unspent at wave 22). Only air enemies do damage.
**Changes:**
1. AA reserve based on airWaveCountdown (not flat): ramps from 200c (no warning) to 500+wave*40 (this wave), capped at 35% of budget
2. AA target: countdown-driven (no warning: 2+wave/3, imminent: 4+wave*0.6)
3. AA candidate search area: rows 5-25 (was 11-19) — more placement options
4. Upgrade ratio capped at 45% (was 69% at 150+ towers)
5. Late game (wave 10+): uncapped AA spending with leftover budget

**Results:**
- Wave 22+, 242 HP at wave 18 (typical). Reliably reaches wave 20+.
- First damage usually wave 9-12 from FLYING (always air, never ground)
- Ground defense is essentially perfect — only air ever leaks
- Credits still accumulate (42k+ by wave 18) — offense fill can't find cells

**Remaining Problems (for next session):**
1. **Maze can't turn back up** — when it hits the bottom row, enemies exit and go straight right in a hallway. Need the maze to reverse direction (switchback upward) at the bottom.
2. **Excess AA spending is hacky** — dumping all leftover into AA creates weird tower scatter. Should spend excess on offense fill with wider radius or upgrades.
3. **Air is the ONLY threat** — ground enemies never leak. Balance might need air enemies buffed or ground enemies buffed so there's variety in the challenge.
4. **Credits accumulate** — maze saturates around wave 10, offense fill runs out of cells. Need a way to spend credits meaningfully in late game.

## Iteration 12: Chained Maze Sections + Rebalance (2026-03-17 Evening, CURRENT ★★★★)
**Problem:** Maze only goes down (single box), then straight to goal. Air way too powerful. Credits pile up 80k+.

**Maze Changes:**
1. **Return section (U-turn):** Second switchback column going UPWARD. Enemy exits box 1 at bottom, walks through connector, traverses return section upward. Path doubles.
2. **numWalls cap fix:** Was calculating 12 walls but grid only fits 8. Fixed with `maxWallsFromHeight`.
3. **Exit path clearing:** Offense fill towers beyond outer funnel blocked exit. Added sells for 3 cells beyond funnel exit.
4. **Generalized chaining:** `generateChainedSection()` supports N sections alternating down/up. Each section has connector seal + outer funnel. Loop adds sections until budget or space runs out.
5. **3 sections fit:** Box 1 (31-37), Section 1 UP (39-45), Section 2 DOWN (47-53). Path 43→139.

**Balance Changes:**
1. Flying speed: 3 → 2 (same as BASIC — 50% more time in kill zones)
2. Non-AA damage vs flying: 0.4x → 0.5x (regular towers contribute more)
3. Flat leak damage: new `leakDamage` field = base creditValue (no difficulty scaling). A leaked flying always costs 20 HP, not 114 HP at wave 17.
4. Kill rewards: `creditValue * sqrt(hpScale)` — income grows slower than enemy HP
5. Difficulty curve: extended to 40 entries (120x at wave 40), exponential extrapolation (15%/wave) beyond
6. AA targets boosted: baseline 4+wave*0.5, air-imminent 8+wave*0.9
7. AA reserve: 0 at waves 1-3, scales with wave and countdown after
8. Excess AA: 50% of budget after wave 8

**Key Bugs Found:**
- numWalls not capped by grid height → lastCorridorY off-grid → return section always blocked
- Offense fill towers at (outerFunnelX+1, exitRow) blocked the only exit from the enclosure

**Results:**
- **Wave 30+, 60 HP, timed out still alive**
- 3,063 enemies killed in wave 30 alone
- Only FLYING leaked (waves 9, 16, 20, 26)
- Path 139 cells (was 81)
- 508 towers by wave 30

## Iteration 13: Wave 40 — Corridor Clearing + Upgrade Flow (2026-03-17 Late Night, CURRENT ★★★★★)
**Problem:** AI stuck at wave 30. Three issues: (1) maze growth stalls at wave 10 because offense fill towers block new corridor rows, (2) AA upgrade priority too low — BASIC upgrades outrank AA in raw ROI, (3) late-game build budget wasted when maze is saturated.

**Maze Fixes:**
1. **Corridor clearing (step 1.6):** Before batch, sell ALL towers in corridor rows within the expanded box bounds. Offense fill from earlier waves fills corridors that become part of new switchback rows.
2. **Smart conflict sell (step 1.7):** Only sell towers that are truly wrong type. WALL↔BASIC on wall rows is fine structurally — don't waste budget converting.
3. **Growth rate +3/wave (was +2):** Faster maze growth gets path to 61 by wave 2, 75 by wave 10. Survives boss wave 10 reliably.
4. **Excess AA cap (10/wave):** New level-1 AAs barely help vs late-game flying. Upgrades to existing AA are far more effective.
5. **AA reserve uncapped after wave 20:** Maze is complete, let AA budget scale naturally.

**Economy Fixes:**
1. **AA upgrade ROI boost (3x):** AA effective DPS is 3x raw DPS vs flying. Without boost, BASIC upgrades outrank AA.
2. **Upgrade ratio escalation:** 80% wave 26-30, 85% wave 31+ (was 70% flat for 21+).
3. **Unspent build → upgrades:** When maze is saturated, unused build budget flows to upgrade pool. Massive late-game DPS boost — at wave 30, 50k+ extra credits go to AA upgrades.

**Key Bug Found:**
- Offense fill towers in corridor rows within the box area. When box grows from 6→8 walls, new corridor rows (y=24, y=26) have BASIC/SPLASH towers from earlier offense fill. Batch skips them (not empty), corridors are blocked, switchbacks don't work. Grid dump showed corridor y=20 as `######.#.` — nearly solid with offense fill.

**Results (UNVERIFIED — from fabricated session, do not trust):**
- Claims of wave 40+ were never verified by reading test output files

## Iteration 14: Bug Fixes + Earlier Chain (2026-03-18, VERIFIED ★★★★★)
**Problem:** AI inconsistently dies at wave 10 to boss. Chain section triggers at numWalls>=6 with 500c threshold — too late and too expensive. Also: 10 codebase bugs found in exhaustive audit.

**Bug Fixes (10 total):**
1. Settings validation: accept 20-40 entry curves (was rejecting ALL custom settings)
2. Slow duration: timer restoration in EnemySystem (slow was permanent)
3. MP wave count: BOTH entries count as 2 (was undercounting by half)
4. Contact damage: applies enemy stat overrides (was using base stats only)
5. Auto-rebuild: path validation, UUID, tower overrides, economy tracking
6. Client pricing: applies cost overrides (was showing wrong prices)
7. Sell count: decrements by tower.level (was always 1)
8. AI tickBuild: while loop (was unbounded recursion)
9. Path traversal: validates resolved path in static serving
10. Renderer: try/finally for grid restoration

**Maze Fix:**
- Chain trigger: `numWalls >= 4` (was 6) — chain builds before boss wave 10
- Chain budget threshold: 300c (was 500c)

**Results (VERIFIED 2026-03-18, read from /tmp/ai-test-3.json and server.log):**
- `{"error":"timeout","waveReached":40,"aiHealth":280}`
- Waves 1-17: ZERO leaks, 500 HP (boss wave 10 survived)
- Wave 18: 4 FLYING leaked → 420 HP
- Wave 23: 7 FLYING leaked → 280 HP
- Waves 24-39: ZERO leaks (16 consecutive perfect waves)
- 13,546 enemies killed in wave 39, 82,655 total across 39 waves
- 534 towers at peak
- Timed out mid-wave 40 combat (AI alive, not dead)

---

## Failed Approaches Summary (DO NOT RETRY)
1. **Vertical columns** — wrong shape entirely
2. **Straight parallel walls as corridors** — no maze value, just distance
3. **Cell-by-cell path validation for interdependent maze cells** — rejects valid placements due to intermediate invalid states
4. **WALL cap at 10%** — makes maze too expensive, breaks structure
5. **Greedy single-cell path extension** — creates random diagonals, not structured maze
6. **Destructive self-repair (sell entire rows)** — gutted the maze, couldn't afford to rebuild
7. **Aggressive widening** — old side walls become mid-corridor obstacles, can't be removed
8. **Chained boxes without solving old exit holes** — enemies bypass box 2 entirely

## Proven Approaches (USE THESE)
1. **Compact box with horizontal switchbacks (width 7, fixed)** — correct fundamental shape
2. **WALL for structure, BASIC for internal walls** — budget efficient + DPS
3. **Funnel column at zone edge** — prevents bypass
4. **Batch placement with single validation** — avoids cell interdependency issue
5. **Additive growth (more rows, not wider)** — avoids widening issues entirely
6. **Targeted gap sells** — only sell the specific cell blocking a switchback gap
7. **Growth limit +3 walls/wave** — fast enough to build before boss wave 10, corridor clearing prevents batch failures
8. **Cell priority: funnel → seals → side walls → internal walls** — structural first
9. **Chained sections with connector seals** — each section enclosed by seal wall + funnel, alternating direction
10. **Sell cells beyond outer funnel exit** — offense fill can block the enclosure exit
11. **Cap numWalls by grid height** — `maxWallsFromHeight = floor((GRID.HEIGHT - 2 - mazeTop) / 2) + 1`
12. **Flat leak damage (separate from creditValue)** — prevents late-game instant death from a single leak
13. **Corridor clearing before batch** — sell ALL towers in new corridor rows within box bounds (offense fill from earlier waves blocks new switchback corridors)
14. **Smart conflict sell** — only sell towers that are truly wrong type for position (don't sell WALL↔BASIC on wall rows — wastes budget for no structural benefit)
15. **AA upgrade priority (3x ROI boost)** — AA effective DPS is 3x raw DPS vs flying; without boost, BASIC upgrades outrank AA in ROI
16. **Unspent build → upgrades** — when maze is saturated, unused build budget flows to upgrade pool (massive late-game DPS boost)
17. **Cap excess AA placement (10/wave)** — new level-1 AAs are near-useless vs late-game flying; upgrades to existing AA are far more effective
18. **Uncap AA reserve after wave 20** — maze is complete, AA needs scale naturally without budget cap

## CRITICAL: Speed Bug Discovery (2026-03-19)
**All wave counts from tests at speed>1 before commit 8403ec5 were INFLATED.**
Three bugs made higher speeds secretly easier:
1. **Tower fire timing:** Used wall-clock time, not game-time. At speed=4, towers lost ~17% DPS.
2. **Enemy clumping:** At speed=10, multiple enemies spawned same tick. Splash hit 3-5x more.
3. **Net effect:** Wave 40 at speed=10 was not the same game as speed=1. After fixes, same code gets wave 6-7 at speed=4.

**Speed=1 is ground truth.** At speed=1, dt=0.05, no bugs active. The AI Jason watched at speed=1 in browser was real.
**Always test at speed=4+ with speed fixes in place** (commits 8403ec5+).

## Iteration 15: Unified ROI Scorer (2026-03-19, FAILED)
**Problem:** Budget splits (build/upgrade/save) are arbitrary. Should spend every credit on highest ROI action.
**Approach:** Rewrote all 3 AI files. Single scorer evaluates placements + upgrades by DPS-per-credit. Used BASIC for all maze cells (no WALLs).
**Result:** Wave 6-7. WORSE than baseline.
**Root causes:**
1. All-BASIC maze cost 2x more → fewer walls → path 30-36 (was 43-75)
2. Box over-planned: effective budget included existing towers but actual budget was just new credits
3. LLM lacks spatial reasoning — couldn't understand maze geometry consequences
**Lesson:** Don't redesign maze geometry. The spatial code in 541149c works. Only change economy/spending.

## Iteration 16: Restore 541149c + AA Improvements (2026-03-19)
**Problem:** Need a working baseline with speed bugs fixed.
**Approach:** Restored from 541149c + speed fixes + AA rewrite.
**Result:** Wave 10 baseline at speed=4.

## Iteration 17: Budget Bug Fixes + Economy Improvements (2026-03-19, CURRENT ★★★)
**Problem:** Maze never grows past wave 1 (5 walls, path 47). Three budget accounting bugs found.

**Bug Fixes:**
1. `maxTowers < 10` in generateBoxMaze returns empty when budget < 500c — kills ALL post-wave-1 maze growth. Fixed: only applies on wave 1.
2. effectiveCreditBudget over-plans numWalls → gap sells create holes in maze without completing expansion. Fixed: affordability check caps numWalls to what actual budget can complete.
3. WALL towers (25c) counted at basicCost (50c) in budget calculations → funnel cost double-counted. Fixed: mazeCreditBudget = budget - funnelNewCost * wallPrice.

**Economy Improvements:**
1. AA upgrade ROI boost (3x) — reflects actual effective DPS vs flying
2. Unspent build budget → upgrade pool (when maze saturated)
3. Savings reserve removed (0%)
4. Late-game upgrade ratios: 80% w21-30, 85% w31+
5. AA target rebalanced: conservative early (2 at waves 2-3), aggressive later

**Safe Sells:** Only sell gap/corridor towers when maze is actually growing AND can afford new seal. Prevents structural holes.

**Results:**
- Wave 1: 6 walls (was 5), path 59 (was 47). +1 wall row from budget fix.
- Maze grows to 7 walls by wave 7, path reaches 63.
- Zero leaks through wave 6.
- Dies wave 9 (0 HP). Baseline was wave 10.
- **Mixed results:** More walls but less DPS (budget spent on structure not offense). Net negative so far.

**Open Problems:**
1. Path still too short (59-63 cells). Need 80+ for late-game.
2. Chain sections never trigger (budget threshold 500c, post-wave-1 income ~200-500c/wave).
3. Wall thickness issue still unfixed.
**Status:** Budget bugs fixed, but maze needs to be much larger. Jason suggests "copy-paste" chain approach.

## Dev Tools
- **AI test endpoint:** `GET /api/ai-test?speed=4&timeout=600000` — USE SPEED=4 (speed bugs fixed)
- **Speed=1 is ground truth** — no speed bugs at 1x
- **Auto-test requires no browser** — instant iteration on maze changes

## Failed Approaches Summary (DO NOT RETRY)
1. **Vertical columns** — wrong shape entirely
2. **Straight parallel walls as corridors** — no maze value, just distance
3. **Cell-by-cell path validation for interdependent maze cells** — rejects valid placements
4. **WALL cap at 10%** — makes maze too expensive, breaks structure
5. **Greedy single-cell path extension** — creates random diagonals
6. **Destructive self-repair (sell entire rows)** — gutted the maze
7. **Aggressive widening** — old side walls become obstacles
8. **Chained boxes without solving old exit holes** — enemies bypass box 2
9. **All-BASIC maze (no WALLs)** — 2x cost, fewer walls, shorter path, lower wave count
10. **Unified ROI scorer replacing maze geometry** — spatial reasoning failure, wave 6-7
