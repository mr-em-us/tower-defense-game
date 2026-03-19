# Project Memory -- Tower Defense Game
Last Save: 2026-03-19 - 12:48 AM PST

## Current State
**AI code restored to commit 541149c (chained maze sections) + AA improvements + speed fixes.**
This is the version Jason saw playing well in the browser — builds two mazes, expands, reached wave 20+ visually.

### What's Changed From 541149c Baseline
1. **Speed bug fixes** (from 8403ec5, kept in TowerSystem.ts + WaveSystem.ts):
   - Tower fire timing uses game-time not wall-clock
   - Enemy spawning: one batch per tick regardless of speed
   - Game plays identically at all speeds now
2. **AA improvements** (new this session):
   - AA target: `4 + wave * 1.5` (5x previous, proactive not reactive)
   - AA placement: horizontal line at rows 12-16 (flight corridor), spread horizontally
   - AA budget reserve: based on gap to target, capped at 50% of budget
3. **Economy tweaks** (from 541149c, minor changes):
   - Savings reserve removed (spend everything)
   - Upgrade ratios: 0% w1-4, 20% w5-7, 35% w8-12, 55% w13-20, 70% w21+
4. **Growth cap raised**: max +4 walls/wave (was +2), initial min 6 (was 4)

### Known Issue: Wall Thickness
Jason reports maze walls appear 2 rows thick. Should be 1 row thick to maximize switchbacks per vertical space. Not yet fixed — needs visual debugging.

## Speed Bug Discovery (CRITICAL KNOWLEDGE)
**All wave counts from speed>1 tests before commit 8403ec5 were inflated.**
- At speed=10: enemies clumped → splash hit 3-5x more per shot
- At speed=4: towers lost ~17% DPS from wall-clock timing bug
- The "wave 40" result (b24e146) was at speed=10 with these bugs active
- After speed fixes, same code only reaches wave 6-7 at speed=4
- At speed=1, bugs don't matter (dt=0.05, no scaling)
- Jason watched AI in browser at speed=1 (then sped up) — the visual behavior was real, but wave count when sped up was inflated

**Lesson:** Always test at speed=4 with speed fixes in place. Speed=1 is ground truth.

## Session Experiments (2026-03-19)
### Failed: Unified ROI Scorer
Attempted to replace budget splits with a single scorer that evaluated all actions (placements + upgrades) by DPS-per-credit. Three files rewritten:
- economy.ts: removed planEconomy, added scoreAllActions
- maze.ts: BASIC everywhere, return candidates not placements
- AIController.ts: unified action loop

**Result: Wave 6-7.** Worse than baseline. Problems:
1. All-BASIC maze cost 2x more → fewer walls → shorter path (30-36 vs 43-75)
2. Spatial reasoning failure: couldn't understand maze geometry implications
3. Box growth over-planned (effective budget included existing towers, but actual budget was just new credits)

**Lesson:** LLM lacks spatial reasoning for maze design. The old maze geometry code works — don't redesign it. Only change the economy/spending layer.

### Successful: Restored 541149c
Checked out AI files from commit 541149c (the version Jason saw playing well). This is the "chained maze sections" code with proper box geometry.

### In Progress: AA Line
Rewrote placeAADefense() to aggressively place AA in horizontal line along flight corridor (rows 12-16). Proactive placement from wave 2, target 4+wave*1.5.

## Next Steps
1. [ ] Fix wall thickness issue (Jason sees 2-thick walls)
2. [ ] Test AA improvements — verify AI survives air waves better
3. [ ] Run honest speed=4 test and record wave reached
4. [ ] Visual verification in browser

## Recent Sessions
### 2026-03-19 Early AM — Speed Bug Analysis + Strategy Restoration
- Discovered ALL previous wave counts at speed>1 were inflated by 3 bugs
- Unified ROI scorer attempted and failed (spatial reasoning limitation)
- Restored 541149c as baseline (the version Jason saw playing well)
- AA defense rewritten: 5x more AA, horizontal line placement, proactive

### 2026-03-18 Late Night — AI Strategy Overhaul (REVERTED)
- 10 variants tested at speed=4. All got wave 7-10.
- Fundamental budget conflict identified but not solved.
- Changes reverted in favor of restoring known-good 541149c code.

### Previous sessions: see session-log.md

## User Preferences
Jason, PST, fair difficulty, no cheats, spend everything
**Critical feedback:**
- Previous "wave 40" claims were inflated by speed bugs. Must verify honestly.
- LLM has poor spatial reasoning — don't redesign maze geometry, only tune economy/spending.
- User will verify results visually; don't claim success without user confirmation.

## Docs & Files
.claude/docs/: architecture, decisions, economy, features
memory/: MEMORY, current-session, session-log, maze-strategy-history
