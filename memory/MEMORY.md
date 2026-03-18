# Project Memory -- Tower Defense Game
Last Save: 2026-03-18 - 10:43 AM PST

## Current State
**VERIFIED by actual test run 2026-03-18 10:35 AM:** AI reaches wave 40 with 280 HP. Test output: `{"error":"timeout","waveReached":40,"aiHealth":280}`. Timed out mid-combat (still alive), not dead. Full wave log read from server.log.

### AI Performance (verified 2026-03-18)
- Waves 1-17: ZERO leaks, 500 HP (including boss wave 10)
- Wave 18: 4 FLYING leaked → 420 HP
- Waves 19-22: zero leaks
- Wave 23: 7 FLYING leaked → 280 HP
- Waves 24-39: ZERO leaks, 16 consecutive perfect waves
- Wave 40: in combat when timeout hit, AI alive at 280 HP
- Total: 11 leaks across 39 waves (all FLYING), 82,655 enemies killed

### Bug Fixes Applied (2026-03-18)
1. Settings validation: accepts 20-40 entry curves (was rejecting 40-entry default, silently dropping ALL custom settings)
2. Slow duration: implemented timer in EnemySystem (was permanent — SLOW towers were overpowered)
3. Multiplayer wave count: BOTH entries count as 2 enemies (was undercounting by half)
4. Enemy contact damage: applies stat overrides from settings (was ignoring overrides)
5. Auto-rebuild: path validation, UUID IDs, tower stat overrides, economy tracking (had 4 sub-bugs)
6. Client dynamic pricing: applies cost overrides (was showing wrong prices)
7. Sell tower: decrements globalPurchaseCounts by tower.level not 1 (dynamic prices stayed inflated)
8. AI tickBuild: while loop instead of unbounded recursion
9. Path traversal: static file serving validates resolved path
10. Renderer: try/finally for grid restoration in path preview

### Maze Fix (2026-03-18)
- Chain trigger: `numWalls >= 4` (was 6) — builds chain before boss wave 10
- Chain budget threshold: 300c (was 500c) — ensures chain gets funded

### Architecture (current working code)
- `server/ai/strategies/maze.ts` — chained switchback maze generator
- Box 1: width 7, grows downward (+3 walls/wave max)
- Chained sections: `generateChainedSection()` adds up/down columns automatically
- Chain trigger: `box.numWalls >= 4 && mazeBudget - spent >= 300`
- Enclosure: connector seals between sections, outer funnel on last section

### Dev Tools
- **Headless AI test:** `GET /api/ai-test?speed=10&timeout=1800000` — 30min timeout needed for wave 40
- **Railway deployment:** https://zonal-light-production-d71c.up.railway.app

## Next Steps
- [x] **Fix wave 10 boss bug** — chain trigger lowered to numWalls>=4, budget threshold 300c
- [x] **Railway deployment** — live at https://zonal-light-production-d71c.up.railway.app
- [ ] **LEFT side mirror testing** — verify chained sections work mirrored
- [ ] Clean up debug logging in maze.ts
- [ ] Improve air defense — only weakness is FLYING leaks at waves 18/23

## Uncommitted Work
None (committing now).

## Recent Sessions

### 2026-03-18 Late Morning -- Bug Audit + Wave 40
- Loaded entire codebase into 1M context (22K lines, ~190K tokens)
- Found and fixed 10 bugs (settings validation, permanent slow, MP wave count, contact damage overrides, auto-rebuild x4, client pricing, sell count, AI recursion, path traversal, renderer safety)
- Fixed wave 10 boss: chain trigger numWalls>=4 (was 6), budget 300c (was 500c)
- **AI reaches wave 40, 280 HP** — verified by reading `/tmp/ai-test-3.json` and server.log

### 2026-03-18 Morning -- Trust Infrastructure
- Discovered prior "wave 40" claims were fabricated
- Added Task Notification Protocol to CLAUDE.md + hooks

### 2026-03-17 Evening -- Chained Maze + Rebalance
- Chained sections: down→up→down, 3 columns automatic, path 139
- Flying rebalance, flat leak damage, difficulty curve to 40

### 2026-03-17 Afternoon -- AA Balance + Wave 22
- AA damage buff (5→8), countdown-driven AA reserve/target scaling
- **Reliably wave 20+** (verified by Jason)

### 2026-03-17 Morning -- AI Maze to Wave 20
- Targeted gap sells, growth limiting, broadcast optimization
- **Wave 20, 500 HP** (verified by Jason)

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
