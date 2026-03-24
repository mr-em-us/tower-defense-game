# Project Memory -- Tower Defense Game
Last Save: 2026-03-23 - 09:54 PM PST

## Current State
**Intestine maze builder — S=2 spacing + leftBias from tower 1. Sandbox path 380.**
Starting credits: 5000c. AI difficulty: HARD only. AI respawn system active.
**Unit test suite: 192 tests across 12 files (vitest). Run with `npm test`.**

### Key Architecture
- S=2 spacing (Manhattan distance ≥2 between towers) + leftBias (prefer leftmost column among delta>0)
- ALL empty cells as candidates when spacing active (matches sandbox)
- Tower type: ROI-based (WALL where enemies don't pass, best DPS/cost where they do)
- AA: splash radius 2 (flying-only), placed in flight corridor
- Remaining budget fill pass after maze + AA (spend close to 0c)
- Three separate auto toggles: Repair, Reload, Rebuild (only run during combat)

### AI Respawn System
- SINGLE player mode: AI death → respawn at build phase (not mid-combat)
- New AI gets 120% of human's total tower value as budget
- AI defeated count tracked, shown in HUD + leaderboard
- Modal shown: "AI DEFEATED x{N}" with new challenger name and budget

### Test Suite
- vitest, 192 tests, 12 files
- Covers: math, pathfinding, difficulty, constants, WaveSystem, EnemySystem, TowerSystem, ProjectileSystem, PhaseSystem, GameRoom actions, AI economy, AI placement
- Run: `npm test` or `npm run test:watch`

## Speed Bug Discovery (CRITICAL KNOWLEDGE)
**All wave counts from speed>1 tests before commit 8403ec5 were inflated.**
Always test at speed=4+ with speed fixes in place. Speed=1 is ground truth.

## Next Steps
1. [ ] Fix load-game modal not dismissing (stays up after load)
2. [ ] Verify intestine pattern forms correctly in-game (S=2 from tower 1)
3. [ ] Investigate rebuild not working for human player
4. [ ] Run AI test to measure wave performance of new intestine maze

## Recent Sessions
### 2026-03-23 — Unit Test Suite
- Added vitest with 192 tests across 12 test files
- Coverage: shared utils (math, pathfinding, difficulty, constants), all 5 server systems (Wave, Enemy, Tower, Projectile, Phase), GameRoom action logic, AI economy + placement strategies
- Found and fixed: PhaseSystem handlePlayerReady auto-transitions when single player (not a bug, just test understanding)
- Key insight: difficulty factor for defaults is 0.93 not 1.0 (weighted geometric mean)
- User feedback: NEVER claim features exist without checking code first

### 2026-03-21 — Intestine Maze + AI Respawn + UI Overhaul
- Rebuilt sandbox as multi-algorithm platform (15 algorithms)
- **Breakthrough: S=2 spacing + leftBias = path 380 intestine pattern**
- Integrated into game maze.ts (S=2 from tower 1, all-cell candidates)
- ROI-based tower type selection (WALL vs DPS based on path coverage)
- AA splash damage (flying-only, radius 2)
- AI respawn system: die → respawn with 120% human tower value
- Split Auto Fix into Repair/Reload/Rebuild toggles
- Economy logging: comprehensive per-player wave-end stats

### 2026-03-20 — Plateau Research + Cellular Automaton Discovery
- Tried 5 approaches to break wave-16 plateau — none beat baseline
- Built sandbox.html for automaton research

### Previous sessions: see session-log.md

## User Preferences
Jason, PST, fair difficulty, no cheats, spend everything
**Key feedback:**
- NEVER claim a feature exists or doesn't exist without checking the code first. Search before answering.
- Emergent complexity > predefined geometry (LLM spatial reasoning limitation)
- Per-tower marginal decisions > macro budget planning
- Always verify server is actually running before claiming it's up
- Split auto toggles: Repair/Reload/Rebuild (not combined "Auto Fix")
- AI should use same auto-repair/restock/rebuild as human (level playing field)
- AI should spend close to 100% of budget (no hoarding)
- Always start local server on session boot, output URL

## Memory Index
- [feedback_start_server.md](~/.claude/.../feedback_start_server.md) — Start local server on boot, verify with curl

## Docs & Files
.claude/docs/: architecture, decisions, economy, features, dead-ends, knowledge-taxonomy
memory/: MEMORY, current-session, session-log, maze-strategy-history
client/sandbox.html: multi-algorithm maze research tool
