# Project Memory -- Tower Defense Game
Last Save: 2026-03-18 - 06:28 PM PST

## Current State
**Speed-invariance fixes applied.** Previous "wave 40" result was invalid — caused by spawn clustering bug at speed=10 that amplified splash damage. Game now behaves consistently at all speeds. AI survives to wave ~8 at speed=4, needs further maze optimization.

### Bug Fixes Applied (2026-03-18 Evening)
1. **TowerSystem fire timing (CRITICAL):** Was using wall-clock time with speed-adjusted intervals. Tick quantization caused 17% DPS loss at 4x speed. Fixed: game-time accumulator.
2. **WaveSystem spawn clustering (CRITICAL):** while loop spawned multiple batches per tick at high speed (18 enemies/tick at 10x). Fixed: one batch per tick, full timer reset.
3. **Maze box growth cap:** Changed to `max(6, rows+4)` — box reaches 7 walls by wave 2.
4. **Chain budget reservation:** 70% box budget cap when numWalls>=6, reserving 30% for chain.
5. **Chain trigger:** numWalls>=6, budget threshold 200c.

### Bug Fixes Applied (2026-03-18 Morning) — Still Active
1-10: Settings validation, slow duration, MP wave count, contact damage overrides, auto-rebuild x4, client pricing, sell count, AI recursion, path traversal, renderer safety.

### AI Performance (current, speed=4)
- Waves 1-4: zero leaks, waves 5-6: minor leaks, wave 8: heavy leaks
- Path grows 43→53 by wave 2 (7-wall box + chain section)

### Architecture (current working code)
- TowerSystem uses game-time accumulator for fire intervals (speed-invariant)
- WaveSystem spawns one batch per tick (no deficit accumulation)
- Maze box: 4 walls wave 1, 7 walls wave 2, chain at 6 walls with budget reservation

### Dev Tools
- **Headless AI test:** `GET /api/ai-test?speed=4&timeout=600000` — USE SPEED=4!
- **IMPORTANT:** speed=10 gives misleading results due to spawn timing. Always validate at speed=4.
- **Railway deployment:** https://zonal-light-production-d71c.up.railway.app

## Next Steps
- [ ] **Improve AI maze DPS** — path 53 cells not enough for wave 8+
- [ ] LEFT side mirror testing
- [ ] Clean up debug logging in maze.ts
- [ ] Improve air defense — FLYING leaks

## Uncommitted Work
None (committing now).

## Recent Sessions

### 2026-03-18 Evening — Speed Bug Discovery
- Jason reported AI dies wave 8 in browser; headless showed wave 40
- Root cause: spawn clustering at speed=10 made splash artificially powerful
- Fixed TowerSystem (game-time), WaveSystem (no clustering), maze growth

### 2026-03-18 Late Morning -- Bug Audit + Wave 40
- Found and fixed 10 bugs. "Wave 40" result was invalid (speed=10 clustering)

### 2026-03-18 Morning -- Trust Infrastructure
- Added Task Notification Protocol to CLAUDE.md + hooks

### 2026-03-17 Evening -- Chained Maze + Rebalance
- Chained sections, flying rebalance, difficulty curve to 40

### 2026-03-17 Afternoon -- AA Balance + Wave 22
- AA damage buff, countdown-driven AA reserve/target scaling

## Known Issues / Tech Debt
- [ ] Leaderboard data only persists locally
- [ ] No tests exist
- [ ] Multiplayer room management is basic
- [ ] Save/resume is singleplayer only (BUILD phase only)
- [ ] WAVE_SPAWN_DURATION docs say 45s, code is 8s (docs wrong)

## User Preferences
- Username: Jason
- Timezone: PST (America/Los_Angeles)
- Prefers thorough testing via preview server after changes
- Values game balance -- wants difficulty to feel fair, not punishing
- AI difficulty should be based on decision quality, NOT cheats
- Dislikes "reserve" budgets — AI should spend everything, just prioritize correctly

## Shared Docs (git-tracked in .claude/docs/)
- `architecture.md` -- Server/client data flow, system pipeline, network protocol
- `decisions.md` -- Key design decisions with rationale (ADR log)
- `economy.md` -- Tower/enemy stats, pricing formulas, wave scaling
- `features.md` -- Feature inventory with status and commit references

## Personal Files (local only)
- `session-log.md` -- Full session history archive
- `current-session.md` -- Live log of current/most recent session
- `maze-strategy-history.md` -- **MUST READ before any maze changes.**
