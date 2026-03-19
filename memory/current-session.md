# 2026-03-19 Session — AI Strategy Overhaul (Wave 40 Target)

## Status: Active — working on getting past wave 10

## Key Findings So Far
1. **Baseline: wave 9-10** (path 43, box never grows)
2. **Box growth NOW works** with wave-based numWalls + reduced AA reserve → path 75 by wave 7
3. **Chain sections still can't trigger** — budget always consumed by box growth + offense fill
4. **Exit corridor is the DPS gap** — 22 cells after box with zero tower coverage
5. **Partial box growth is useless** — need complete wall rows
6. **All-WALL construction = zero DPS** — BASIC internals essential
7. **The headless test uses SAME code as real game** — GameRoom, systems, AIController all identical

## Current Code State (uncommitted changes to maze.ts, economy.ts, AIController.ts)
- Wave-number numWalls: 4+2*floor(wave/2), maxed at 8 by grid height
- AA reserve: 0 waves 1-6, moderate 7-12, scaled 13+
- Upgrade ratio: 0% w1, 15% w2-3, 35% w4-6, 50% w7-10
- Chain: numWalls >= 6, wave >= 5, remaining >= 350 (WALL internals)
- Offense fill radius 3-5, no path shortening allowed
- Growth fund: 95% of unspent, through wave 15
- Exit corridor defense step added (but never has budget to trigger)

## Test Results This Session
- v6 (best): wave 9, path 75 by wave 7, zero leaks waves 1-5
- v9: wave 10, path 75, better upgrade scaling
- Baseline (before changes): wave 9-10, path 43 never grows

## The Wave 10 Problem
Boss wave 10: 4300 HP boss, 100+ enemies. Path 75 gives boss 50s in maze.
With ~80 towers and shared DPS, boss gets ~76 DPS = 56s to kill. Close but not enough.
Need either: longer path (100+), more DPS (upgrades), or both.

## Next Steps
- Fix offense fill to cover exit corridor (the DPS gap)
- Get chain sections working (need to save budget across waves)
- Verify in browser game after improving
