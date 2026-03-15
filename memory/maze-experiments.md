# Maze AI Experiment Log
Last Updated: 2026-03-15

## Current Approach
Seed + greedy + offense hybrid. Full-height WALL columns create switchbacks (path +52),
offense towers in first column deal damage to enemies in corridors. Greedy extends path
in constrained areas. Best result: wave 7, 0 leaks through wave 5.

## Key Constraints
- Grid: 60x30, RIGHT zone cols 30-59, LEFT zone cols 0-29
- Spawn: col 29-30, row 14. Goal: GOAL_ROWS 12-17 at edge (x=0 or x=59)
- Budget wave 1: ~1960c (after economy reserves)
- Tower costs: BASIC=50, SLOW=80, AA=100, SNIPER=120, SPLASH=150, WALL=25
- BFS pathfinding, cardinal directions only
- CENTER_SPAWN: X 29-30, Y [14]

## Critical Lessons Learned
1. Path extension without DPS is useless — WALLs extend path but enemies walk through unhurt
2. Full-height columns (rows 0-29) prevent bypass; shorter columns always get bypassed
3. Single-cell greedy doesn't work on open grids — only +1-2 per placement
4. Greedy WORKS on constrained grids (after columns+towers placed)
5. First column should use offense (near spawn), other columns use WALLs (cheap)
6. chooseTowerType bug: must update towerTypeCounts DURING column planning, not just on commit
7. Column budget must leave room for greedy and offense
8. 2 full-height columns (1 offense + 1 WALL) = sweet spot for wave 1 budget (~1900c)
9. Wave 2+ budgets are low (~250-350c) — mostly AA and incremental additions

## Design Principles
1. Compact maze centered on spawn
2. Full-height columns prevent bypass
3. Mix of WALL (blocking) + offense (damage) — not ONLY one type
4. First column = offense (damage), others = WALL (cheap blocking)
5. Greedy path extension in constrained areas
6. AA built proactively from wave 3+

## Budget Math (Wave 1, ~1960c)
- Column 1 (offense): 13 offense (rows 8-20) + 16 WALL = ~1050c
- Column 2 (WALL): 29 cells × 25c = 725c
- Total columns: ~1775c
- Remaining: ~185c for greedy + offense fill
- Path increase: +52 from 2 columns

## Experiments

### Exp 0-1 — Early greedy attempts
- BROKEN — placement bugs, 0-1 towers placed

### Exp 2 — Connected serpentine (band approach)
- Died wave 6, path 30→44 (+14). Bypass above/below band.

### Exp 3 — Capped serpentine with cap rows
- Died wave 6, path 30→39. Cap rows had gaps, enemies bypassed.

### Exp 4 — Full-height columns (mixed offense/WALL)
- Died wave 5, path 30→55. 22 WALL + 26 offense. Good structure but path too short.
- Maze stopped growing after wave 1 (budget too low for new columns).

### Exp 5 — Full-height columns (plan all, grow over waves)
- Died wave 5, path 30→55. Same structure, waves 2+ budget too low.

### Exp 6 — Greedy path extension only
- Died wave 5, path 30→31→48. Greedy placed only 1 WALL on open grid.
- Wave 2 showed greedy works on constrained grids (+17 from 6 WALLs).

### Exp 7 — All WALLs, max path
- Died wave 4 (WORSE). Path 30→87 (+57). 78 WALLs, 0 offense. No DPS = useless.

### Exp 8 — One offense column + WALLs (towerTypeCounts bug)
- Died wave 5. Only 1 column built (too expensive with 13 SLOWs).
- Bug: chooseTowerType saw stale towerTypeCounts → all got SLOW.

### Exp 9 — Fixed: first column offense, second WALL ★ BEST
- **Survived to wave 7! 0 leaks waves 1-5!**
- Path 30→82 (+52). 59 towers: 45 WALL + 3 SLOW + 11 BASIC.
- Wave 6: 8 leaked, 1 tower lost. Wave 7: died.
- 191 killed, 31 leaked total. 4636c earned.
- Key: first column offense (DPS) + second column WALL (cheap path extension)

## Next Steps
- [ ] Add more offense towers in later waves (currently budget goes to AA)
- [ ] Try 3 columns wave 1 (reduce first column offense to save budget)
- [ ] Add greedy extension after columns to push path beyond 82
- [ ] Test if upgrading existing towers helps in mid-game
- [ ] Evaluate optimal offense/WALL split per column
