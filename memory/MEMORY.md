# Project Memory -- Tower Defense Game
Last Save: 2026-03-19 - 10:21 AM PST

## Current State
**AI code from 541149c + speed fixes + budget accounting fixes + economy improvements.**
Maze now builds 6 walls on wave 1 (was 5), grows to 7 by wave 7. Best result: wave 9 at speed=4.

### Changes This Session (from 541149c baseline)
1. **Budget accounting fixes** (3 bugs found):
   - `maxTowers < 10` guard prevented ALL maze growth after wave 1 → only applies wave 1 now
   - effectiveBudget over-planned numWalls → affordability check added
   - WALL towers counted at BASIC cost (50c not 25c) → fixed mazeCreditBudget + removed funnel double-count
2. **Economy improvements**:
   - AA upgrade ROI boost (3x) — AA effective DPS is 3x vs flying
   - Unspent build budget flows to upgrades (maze saturated → upgrade pool)
   - Savings reserve removed (spend everything)
   - Late-game upgrade ratios: 80% w21-30, 85% w31+
3. **AA rebalance**: conservative early (target 2 at waves 2-3), aggressive later (7 + (wave-6)*2)
4. **Safe sells**: only sell gap/corridor towers when maze is actually growing AND can afford new seal

### Known Issues
- **Path too short**: 59-63 cells isn't enough. Need 80+ for late-game survival.
- **Chain sections never trigger**: budget threshold too high, post-wave-1 income too low (~200-500c/wave).
- **Wall thickness**: Jason reports 2-thick walls visually. Not yet investigated.

## Speed Bug Discovery (CRITICAL KNOWLEDGE)
**All wave counts from speed>1 tests before commit 8403ec5 were inflated.**
Always test at speed=4+ with speed fixes in place. Speed=1 is ground truth.

## Test Results This Session
| Version | Wave | Path (w1) | Key Change |
|---------|------|-----------|------------|
| Baseline | 10 | 47 (5 walls) | 541149c restored |
| v5 (current) | 9 | 59 (6 walls) | Budget fixes + economy |

## Next Steps
1. [ ] Make maze bigger — Jason wants "copy-paste" chain approach (repeat box pattern)
2. [ ] Chain sections need to be incrementally buildable (can't afford full section at once)
3. [ ] Fix wall thickness issue
4. [ ] Visual verification in browser

## Recent Sessions
### 2026-03-19 Morning — Budget Bug Hunting + Economy Fixes
- Found 3 budget accounting bugs preventing maze growth
- Fixed: wave 1 now builds 6 walls (was 5), maze grows to 7 by wave 7
- Economy: AA ROI boost, unspent build→upgrades, safe sells
- Best result: wave 9 at speed=4 (baseline was 10 — mixed results)
- Jason's insight: focus on maze construction quality, economy can be tuned later
- Jason suggests "copy-paste" box pattern for chain sections

### 2026-03-19 Early AM — Speed Bug Analysis + Strategy Restoration
- Discovered ALL previous wave counts at speed>1 were inflated by 3 bugs
- Unified ROI scorer attempted and failed (spatial reasoning limitation)
- Restored 541149c as baseline
- AA defense rewritten: proactive placement

### 2026-03-18 Late Night — AI Strategy Overhaul (REVERTED)
- 10 variants tested at speed=4. All got wave 7-10.
- Changes reverted in favor of restoring known-good 541149c code.

### Previous sessions: see session-log.md

## User Preferences
Jason, PST, fair difficulty, no cheats, spend everything
**Key feedback:**
- Focus on maze construction quality — economy can be tuned later
- "Copy-paste" approach: repeat working box pattern with links
- LLM has poor spatial reasoning — don't redesign maze geometry from scratch
- Previous "wave 40" claims were inflated by speed bugs

## Docs & Files
.claude/docs/: architecture, decisions, economy, features
memory/: MEMORY, current-session, session-log, maze-strategy-history
