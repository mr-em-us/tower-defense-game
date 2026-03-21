# Dead Ends — What Didn't Work and Why

**Append-only. Never delete entries. Format: what was tried → what happened → what worked instead.**

---

## LLM Spatial Reasoning for Maze Design (2026-03-19)
**Tried:** Redesigning maze geometry from scratch (unified ROI scorer, all-BASIC maze, new box sizing).
**Happened:** Wave 6-7, WORSE than baseline. All-BASIC maze cost 2x more, produced shorter paths (30-36 vs 43-75). Box over-planned with effective budget that included existing tower value. Multiple spatial errors in wall placement logic.
**What works instead:** Keep the proven maze geometry code (541149c) untouched. Only modify economy/spending decisions, not spatial layout. Use `/spatial-check` and `/dump-grid` to verify any spatial changes.
**Root cause:** LLMs lack spatial reasoning ability. This is well-documented in research. Grid-based spatial problems that humans find intuitive are extremely difficult for LLMs.

## Speed>1 Tests Before Speed Fix (2026-03-19)
**Tried:** Using headless test results at speed=4 and speed=10 to evaluate AI performance.
**Happened:** All results were inflated by 3 bugs: tower fire timing (wall-clock vs game-time), enemy clumping (multiple spawns per tick at high speed), and splash effectiveness (clumped enemies = 3-5x splash value). "Wave 40" was at speed=10 with broken physics.
**What works instead:** Always test at speed=4+ AFTER commit 8403ec5 (speed fix). Speed=1 is ground truth (no bugs at 1x). The speed fix must remain in TowerSystem.ts and WaveSystem.ts — never revert those files.
**Root cause:** Speed scaling multiplied dt but three systems used wall-clock time or had while-loops that spawned multiple batches per tick.

## Tangling Strategy Changes with Bug Fixes (2026-03-19)
**Tried:** Commit 8403ec5 fixed speed bugs AND changed maze strategy in the same commit.
**Happened:** Impossible to determine whether the AI regression (wave 40 → wave 10) was caused by speed fixes or strategy changes. No clean baseline existed.
**What works instead:** Always make ONE change per test. Fix bugs in isolation, test, record result. Then change strategy, test, record result. Never combine.

## Budget Splits with Arbitrary Wave Thresholds (2026-03-18)
**Tried:** Hardcoded upgrade ratios (0% wave 1, 15% wave 2-3, 35% wave 4-6, etc.) and savings reserves (2-5% of credits).
**Happened:** Budget splits starved the maze of growth funds in critical early waves while hoarding credits that were never spent productively.
**What works instead:** Minimal savings (or zero), let the maze planner and upgrade scorer compete for the same pool. Unspent build budget flows to upgrades automatically.

## All-BASIC Maze Construction (2026-03-19)
**Tried:** Using BASIC towers (50c) for ALL maze cells including structural walls, seals, and funnels.
**Happened:** Maze cost doubled. With 2000c wave 1 budget, could only afford 3 walls (was 4). Path length 30-36 (was 43-75). Fewer switchbacks = less enemy exposure time.
**What works instead:** Hybrid: WALL (25c) for structural cells not adjacent to corridors (seals, funnels, sides). BASIC (50c) for internal walls adjacent to corridors (they shoot enemies walking past). This is what the proven 541149c code does.

## Removing Lexicographic Sort from Emergent Scoring (2026-03-19)
**Tried:** Removing the lexicographic sort (delta>0 first) from the emergent maze scorer, letting raw composite scores determine placement order. Theory: D×L optimization might favor more damage towers over more path length.
**Happened:** Wave 7 (was 15-17). Path dropped from 86 to 59 on wave 1. Coverage-only damage towers (score ~20) outranked delta=1 walls (score ~15), so walls weren't placed until late. Path too short for any towers to be effective.
**What works instead:** Lexicographic sort: always place ALL delta>0 cells before ANY delta=0 cells. The path length multiplies ALL existing damage, so extending the path is almost always more valuable than adding one more damage tower.

## All-Wall Wave 1 Strategy (2026-03-19)
**Tried:** Placing ONLY WALL towers (25c each, 80 total) on wave 1 to maximize path length. Theory: denser obstacle field = longer path.
**Happened:** Wave 3. Path was 88 (only 2 more than mixed approach's 86), but ZERO damage towers = enemies walk through maze completely unharmed.
**What works instead:** Mixed approach (44 WALL + 16 damage towers). Path 86 with enough DPS to survive.

## Goal-Direction Bonus in Wall Scoring (2026-03-19)
**Tried:** Adding a bonus for cells closer to the goal edge in the wall scoring function. Theory: walls between path and goal force longer routes.
**Happened:** Path dropped from 86 to 66 on wave 1. The bonus diverted walls to the goal side (far from current path) instead of path-adjacent positions that actually extend the path.
**What works instead:** Score by proximity to current path + adjacency to existing walls. The greedy algorithm naturally builds structure near the path.

## Removing Path Revalidation from AI tickBuild (2026-03-19)
**Tried:** Skipping `wouldBlockPath` check in AIController.tickBuild when executing planned placements. Theory: planning phase already validated the full set.
**Happened:** Wave 13 (was 17). Some placements actually blocked the path when placed individually (different from planning context where all previous placements were simulated).
**What works instead:** Keep the full re-validation. Some planned placements will be rejected (causing the "before path" drop), but this is safer than risking path-blocking placements that cascade into tower destruction.

## Path Length vs DPS — Zero-Sum Tradeoff (2026-03-20)
**Tried:** Multiple approaches to break the path-86 plateau: mutation (sell/rebuild), catalyst (2-step lookahead), BASIC-first (every tower fights), hybrid WALL+BASIC, and reduced AA allocation. Successfully extended path from 86 to 118 using catalysts.
**Happened:** Longer path with WALL-based catalyst = wave 8 (was 16). Path length without DPS is worthless. BASIC-first with natural path 118 = median wave 14 (was 16) — better per-tower DPS but lower density means more leaks. Hybrid 50/50 = wave 9-10 (worst of both). Reduced AA = wave 8 (flying enemies devastate).
**What works instead:** The original WALL-heavy baseline (path 86, median wave 16) is the correct balance point. The path-86 plateau is NOT a bottleneck — it's the optimal tradeoff between path length and DPS density. Any budget spent extending the path beyond 86 is budget NOT spent on towers that kill enemies. The 60 towers (44 WALL + 16 DPS) provide both density and firepower.
**Root cause:** Path length multiplies existing DPS exposure time, but only if DPS exists. Adding path with WALLs adds zero DPS. Adding path with BASIC reduces density (50c vs 25c = half as many towers). The marginal value of path extension diminishes once the path is "long enough" (80-90 cells).

## Sell/Rebuild Coordination Problem (2026-03-20)
**Tried:** Selling clusters of towers during BUILD phase and rebuilding in the freed space. Three variants: individual weak walls, cluster sell+rebuild, speculative (simulate before committing).
**Happened:** Sells execute one-by-one via action queue, then placements execute one-by-one. Each placement is re-validated against the current grid state. Some planned placements fail re-validation because the grid has diverged from planning time (other placements changed pathfinding). Net tower loss between waves — "before path" dropped from 86 to 56-68.
**What works instead:** Don't sell towers. The greedy placer's purely additive approach avoids this coordination problem entirely. If towers must be repositioned, the 100% sell refund (SELL_REFUND_RATIO=1.0) makes same-wave sell+rebuy viable for humans, but the AI's action queue timing makes it unreliable.

---

*See also: `memory/maze-strategy-history.md` for the complete maze-specific iteration history (18+ iterations).*
