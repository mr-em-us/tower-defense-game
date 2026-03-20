# Project Memory -- Tower Defense Game
Last Save: 2026-03-19 - 02:10 PM PST

## Current State
**Emergent maze builder — greedy hill-climbing on path length.**
Complete rewrite of AI maze strategy. No predefined geometry; maze structure emerges from simple scoring rules. Median wave 16 at speed=4 (baseline was wave 9-10). Path 86 on wave 1.

### Key Architecture
- Each tower placement scored by: `pathDelta×15 + coverage×2 + wallAdj×3 + proximity×1`
- Lexicographic sort: delta>0 cells ALWAYS placed before delta=0 (CRITICAL — removing this drops to wave 7)
- Tower type: WALL (25c) for positive delta, BASIC/specialized for coverage
- Line probe breakthrough search for 3-5 cell wall lines
- AA defense unchanged from previous (proactive placement, spread scoring)
- `?credits=N` param added to `/api/ai-test` for high-budget testing

### Known Issues
- **Path plateau at 86-88**: Local optimum. No single wall, pair, or line (up to 5) breaks through.
- **"Before path" drops** to 56-60 in later waves (re-validation rejects some planned placements)
- **Wave 10 outlier**: ~1 in 13 tests hits wave 10 instead of 15-17 (randomness in chooseTowerType)
- **Wall thickness**: Jason reported visually. Not investigated.

## Speed Bug Discovery (CRITICAL KNOWLEDGE)
**All wave counts from speed>1 tests before commit 8403ec5 were inflated.**
Always test at speed=4+ with speed fixes in place. Speed=1 is ground truth.

## Test Results (Emergent Maze, 13 tests at speed=4)
| Wave | Count | Cumulative % |
|------|-------|-------------|
| 10   | 1     | 8%          |
| 12   | 1     | 15%         |
| 14   | 1     | 23%         |
| 15   | 3     | 46%         |
| 16   | 5     | 85%         |
| 17   | 2     | 100%        |
Median: 16, Mean: ~15. Baseline (box maze): wave 9-10.

## Next Steps
1. [ ] Break path plateau at 86-88 (3+ coordinated walls needed, or new approach)
2. [ ] Investigate "before path" drop (re-validation issue with interdependent placements)
3. [ ] Fix wave 10 outlier (reduce randomness in chooseTowerType?)
4. [ ] Visual verification in browser — see what the emergent maze actually looks like
5. [ ] Fix wall thickness issue Jason reported

## Recent Sessions
### 2026-03-19 Afternoon — Emergent Maze Builder (All Day Session)
- Jason's insight: "take a page from evolution" — emergent complexity from simple rules
- Complete rewrite of maze.ts (854→~450 lines)
- 13 iterations tested, 13+ speed=4 tests run
- Best: wave 17, median: wave 16 (was 9-10)
- Key findings: lexicographic sort critical, path plateau at 86-88 is fundamental,
  budget allocation self-balances, higher credits don't help
- Economy: delayed upgrades, faster upgrade ramp for late game
- Added `?credits=N` to ai-test endpoint

### 2026-03-19 Morning — Budget Bug Hunting + Economy Fixes
- Found 3 budget accounting bugs preventing maze growth
- Fixed: wave 1 now builds 6 walls (was 5), maze grows to 7 by wave 7
- Best result: wave 9 at speed=4

### 2026-03-19 Early AM — Speed Bug Analysis + Strategy Restoration
- Discovered ALL previous wave counts at speed>1 were inflated
- Restored 541149c as baseline

### Previous sessions: see session-log.md

## User Preferences
Jason, PST, fair difficulty, no cheats, spend everything
**Key feedback:**
- Emergent complexity > predefined geometry (LLM spatial reasoning limitation)
- "Take a page from evolution" — simple rules producing complex behavior
- Per-tower marginal decisions > macro budget planning
- Minimize reliance on spatial reasoning
- Focus on growth and efficiency of maze over progress in levels
- Previous "wave 40" claims were inflated by speed bugs

## Docs & Files
.claude/docs/: architecture, decisions, economy, features, dead-ends, knowledge-taxonomy
memory/: MEMORY, current-session, session-log, maze-strategy-history
