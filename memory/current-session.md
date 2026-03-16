# Session: 2026-03-15 Evening — Compact Box Maze Implementation

## Earlier (PM session, saved at 2:46 PM)
- Ran 11 column-based experiments (best: wave 7)
- Jason showed his maze: compact box with horizontal switchbacks
- Concluded: full rewrite needed from columns to compact box

## This Session (continued after save)
- 06:00 PM — Full rewrite of maze.ts: compact box with horizontal walls
- 06:05 PM — Exp 12: First box (6×7, 3 lanes). Shape correct but too small, path +5.
- 06:10 PM — Exp 13-14: Width/height variations. Enemies bypass above/below.
- 06:15 PM — Exp 15: Added funnel column at x=30. Enemies still bypass via x=30.
- 06:20 PM — Exp 16: Funnel placed FIRST. Goal side wall rejected by pathfinding.
- 06:21 PM — KEY FIX: Internal wall gaps must be 1 cell INWARD from edge (not AT edge).
- 06:22 PM — Exp 17: **SWITCHBACKS WORKING!** Path 30→43. Width 5, 5 walls.
- 06:23 PM — Exp 18: Width 7, 4 walls. Path 43. 500HP wave 5+. 0 leaks waves 1-4.
- 06:30 PM — Exp 19: Best yet — **wave 9!** 0 leaks waves 1-4,6. 318 killed.
- 06:40 PM — Added greedy path extension (80% of remaining budget).
- 06:45 PM — Exp 22: Path grows 43→62 over waves! Greedy very effective.
- 06:50 PM — Exp 24: Path 43→75. Wave 9. Consistent.
- 07:00 PM — Tuned economy: upgrades start wave 5 (20%), scale to 35% wave 8+.
- 07:05 PM — Exp 25: **Wave 10!** Upgrade budget 442-642c in waves 8-10.
- 07:30 PM — KEY IMPROVEMENT: WALL towers (25c) for structural elements.
  - Funnel, first/last walls, side walls all use WALL instead of BASIC.
  - Internal walls still BASIC (DPS). 2× more cells per budget!
- 07:45 PM — **Exp 26: WAVE 13! PATH 173!** New record by huge margin.
  - Wave 1: 49 towers (26 WALL + 23 BASIC), path 60 (was 43 with all BASIC)
  - Wave 12: path grew to 165! Wave 13: path 173!
  - Greedy + WALL structural = massive mid-game expansion
- 09:56 PM — Save requested.
