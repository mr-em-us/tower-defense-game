# 2026-03-18 Evening Session — Speed Bug Discovery + Fix

- 04:25 PM — Jason reports AI only makes it to wave 8 in browser (Watch AI Play). Previous "wave 40" was headless at speed=10.
- 04:30 PM — Ran headless test at speed=4 (browser speed). AI dies wave 6 with 23 leaks. Speed=10 same code: zero leaks.
- 04:40 PM — Root cause #1: TowerSystem used wall-clock time for fire intervals. At 4x speed, tick quantization caused 17% DPS loss. Fixed: switched to game-time tracking with `this.gameTime += dt`.
- 04:50 PM — Root cause #2 (partial): WaveSystem spawned multiple batches per tick at high speed via `while(spawnTimer <= 0)`. At speed=10, 18 enemies spawned per tick (clustered together); at speed=4 only 6. Splash/AoE was artificially effective at high speed. Fixed: one batch per tick with full timer reset.
- 05:00 PM — After both fixes, speed=10 also dies wave 10 (previously "wave 40"). The old result was ONLY achievable due to spawn clustering amplifying splash damage. Both speeds now consistent.
- 05:10 PM — Root cause #3: Maze box starts with only 4 walls (budget capped by `maxWallsThisWave = max(4, existingRows+3)` = 4). Path only 46 cells — too short for wave 5+ DPS.
- 05:15 PM — Fixed box growth: `max(6, existingRows+4)` allows 7 walls by wave 2. Chain trigger at 6 walls. Reserved 30% of maze budget for chain when numWalls>=6.
- 05:20 PM — Speed=4 test with all fixes: survives through wave 5 (1 flying leak), some leaking wave 7-8 (tank leaks). Path 43→53. Chain section builds at wave 2. Still dying ~wave 8-9 but MUCH better than wave 6.
- 06:28 PM — Save.
