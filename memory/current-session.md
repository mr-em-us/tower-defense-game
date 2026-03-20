# Session — 2026-03-19 Late Morning

## Key Events
- 10:24 AM — Session resumed. Continuing from 10:21 AM save.
- 10:30 AM — Started emergent maze approach (Jason's idea: Game of Life philosophy)
- 10:35 AM — v1: greedy hill-climbing. Only 2 walls placed (zero-delta stop). Wave 6.
- 10:38 AM — v2: zero-delta limit=8. Path 86 on wave 1! But wave 7 (walls waste budget).
- 10:43 AM — v3: unified scoring (single score for wall+damage). Wave 11, path 57.
- 10:50 AM — v4: lexicographic sort (delta>0 first). Wave 12 speed=4, 300 HP. Path 86.
- 10:56 AM — v5: search radius 3. Wave 11. Occasional breakthroughs (path 118 at wave 9!).
- 11:08 AM — v6: delayed upgrades. Wave 12, 240 HP timeout. Path stays 86-88.
- 11:15 AM — v7: breakthrough pairs (2-step look-ahead). Wave 17! Best result.
- 11:25 AM — v8: lower BT threshold. Wave 16 (no improvement).
- 11:36 AM — v9: no path revalidation. Wave 13 (WORSE — revert).
- 12:10 PM — 3x reliability test: waves 16, 15, 16. Consistent.
- 12:29 PM — Logged all results to maze-strategy-history.md.
- 12:30 PM — v10: line probe breakthroughs. Wave 15. No breakthrough lines found (plateau too deep).
- 12:39 PM — v11: removed lexicographic sort. Wave 7 (MUCH WORSE). Lex sort is critical. Reverted.
- 12:55 PM — DELTA_WEIGHT=15: Waves 16, 15, 17. No change from w=10 (lex sort dominates).
- 01:18 PM — Cheap WALL for low-coverage: Wave 14, 15. Not better (less DPS). Reverted.
- 01:30 PM — Higher credits (3000, 5000): Waves 15, 14. Budget not the bottleneck.
- 01:42 PM — Faster upgrade ramp: Wave 15, 16. Within variance.
- 01:55 PM — Final batch: 10, 16, 16. Wave 10 outlier (randomness in chooseTowerType).

## Final Results (Emergent Maze v7-final)
**All speed=4 tests combined:**
| Wave | Count |
|------|-------|
| 10   | 1     |
| 12   | 1     |
| 14   | 1     |
| 15   | 3     |
| 16   | 5     |
| 17   | 2     |

Median: 16, Mean: ~15, Range: 10-17
**Baseline (box maze): wave 9-10. Improvement: ~60%**

## Architecture Decisions
1. Emergent > predefined geometry for this codebase (LLM limitation mitigation)
2. Lexicographic sort is CRITICAL (delta>0 first, always)
3. Path plateau at 86-88 is a fundamental local optimum (no single or pair of walls breaks it)
4. Line probes up to length 5 couldn't break through either
5. Budget allocation matters less than expected (unspent build → upgrades automatically)
6. Higher starting credits don't significantly improve results (DPS scaling is bottleneck)
