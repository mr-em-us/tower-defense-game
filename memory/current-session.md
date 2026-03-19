# Session: 2026-03-19 Morning

## Key Events
- 09:54 AM — Session start. Resuming from 12:48 AM save.
- 09:56 AM — Read maze-strategy-history, dead-ends, economy docs. All 3 AI files reviewed.
- 10:00 AM — Applied 4 proven economy improvements: AA upgrade ROI boost (3x), unspent build→upgrades flow, corridor clearing, remove savings reserve.
- 10:03 AM — Baseline test: wave 10 (0 HP). Improved test: wave 9 (slightly worse).
- 10:05 AM — **KEY BUG FOUND: `maxTowers < 10` guard prevents ALL maze growth after wave 1.** generateBoxMaze returns empty when budget < 500c (typical for waves 2+). Fixed to only apply on wave 1.
- 10:08 AM — **KEY BUG FOUND: effectiveBudget over-plans numWalls that actual budget can't complete.** Gap sells create holes in maze structure without being able to afford replacement walls. Added affordability check.
- 10:10 AM — v3 test: wave 8. AA reserve too aggressive early (50% of budget for AA at wave 2). Reduced early AA to 25% cap, lower targets waves 2-4.
- 10:12 AM — **KEY BUG FOUND: Budget accounting counts WALL towers (25c) at BASIC cost (50c).** Funnel cost double-counted. Fixed mazeCreditBudget calculation + removed double funnel cost.
- 10:17 AM — v5 test: wave 9. Maze now builds 6 walls on wave 1 (was 5). Grows to 7 by wave 7. Zero leaks through wave 6. But still dies wave 9 — path too short (59-63 cells).
- 10:21 AM — Jason requested save.

## Bugs Found (3 budget accounting bugs)
1. `maxTowers < 10` guard kills ALL post-wave-1 maze growth
2. effectiveBudget over-plans walls → gap sells create holes
3. WALL towers counted at BASIC cost (50c not 25c) → wave 1 builds 5 walls instead of 6

## Test Results Summary
| Version | Changes | Wave Reached | Path (wave 1) |
|---------|---------|-------------|----------------|
| Baseline (541149c+AA) | None | 10 | 47 |
| v2 (+economy fixes) | AA ROI, build→upgrade, corridor clear, no savings | 9 | 47 |
| v3 (+maze growth fixes) | maxTowers guard, affordability check, AA rebalance | 8 | 47 |
| v4 (+budget accounting) | mazeCreditBudget fix, safe sells | 7 | 47 |
| v5 (+funnel double-count) | Remove double funnel cost | 9 | 59 (6 walls!) |

## Key Insight
Path length is the bottleneck. Maze needs to be bigger faster. Jason suggests "copy-paste" approach — repeat the box pattern linked together. Chain section code exists but never triggers (budget too low post-wave-1). Need to either:
1. Make chain sections incrementally buildable
2. Save budget across waves for chain construction
3. Build both sections on wave 1 (needs cheaper construction)

## Decisions
1. Economy changes can wait — maze construction is the priority
2. Don't redesign maze geometry — fix the budget bugs instead
3. Jason interested in pattern-matching approach and "copy-paste" chain building
