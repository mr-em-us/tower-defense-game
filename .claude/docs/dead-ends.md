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

---

*See also: `memory/maze-strategy-history.md` for the complete maze-specific iteration history (16+ iterations).*
