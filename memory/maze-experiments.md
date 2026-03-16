# Maze AI Experiment Log
Last Updated: 2026-03-15

## Current Approach — Compact Box + Greedy Extension ★★★
Wave 1: Build compact box maze (7 wide × 4 walls, all BASIC, ~38 towers).
Waves 2+: Greedy path extension places towers on BFS path for maximum path increase.
Result: Path grows from 43 → 70 over 9 waves. Best: wave 9, 0 leaks waves 1-4.

## Best Result: Wave 9 (Exp 24)
- Path: 43→45→47→54→64→68→70 (grew every wave!)
- 0 leaks waves 1-4, perfect wave 6
- ~120 towers built, path 70 at death
- Greedy extension key to growth: +10 at wave 5, +4 at wave 6

## Architecture

### Wave 1 Box Maze (RIGHT side)
- Funnel: x=30, rows 10-18 (±4 from entrance), gap at row 14
- Box: cols 31-37, rows 13-19 (W=7, H=7), 4 walls
- Wall 0 (row 13): SOLID. Wall 1 (15): gap x=36. Wall 2 (17): gap x=32. Wall 3 (19): SOLID.
- Side walls: x=31 (entrance gap row 14), x=37 (exit gap row 18)
- Cost: ~38 BASIC × 50c = 1900c ≤ 1960c budget

### Greedy Extension (waves 2+)
- Uses 80% of remaining build budget after box cells placed
- For each tower: try every cell on current BFS path, pick max path increase
- Stops after 3 consecutive 0-gain placements
- Very effective on constrained grid: +2 to +10 per wave

### Key Constraints
- Grid: 60×30, RIGHT zone cols 30-59, spawn (30,14), goal x=59 rows 12-17
- BASIC=50c, WALL=25c, SLOW=80c, AA=100c
- Budget wave 1: 1960c (39 BASIC). Later waves: 300-1100c.
- Internal wall gaps must be 1 cell INWARD from edge (not AT edge)
- Funnel placed FIRST, maze walls second, side walls last
- First/last walls SOLID, internal walls have alternating gaps

## To Reach Wave 20
- Need path 100+ and high DPS density
- Maze expansion: somehow add switchback rows (hard: old solid wall blocks)
- Tower upgrades: level 2-3 towers have 2-3× DPS
- SLOW towers at gaps: enemies spend more time in killzone
- SPLASH towers in corridors: hit multiple enemies in line
- Consider wider maze (8+) when expansion budget allows
