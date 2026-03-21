# Project Memory -- Tower Defense Game
Last Save: 2026-03-21 - 12:52 PM PST

## Current State
**Intestine maze builder — S=2 spacing + leftBias from tower 1. Sandbox path 380.**
Starting credits: 5000c. AI difficulty: HARD only. AI respawn system active.

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

### Sandbox Findings (CRITICAL)
- S=2 + LeftBias=50 at 500 towers = path 380 (intestine pattern)
- S=2 alone at 80 towers = path 98 (+14 over baseline 84)
- Pure CA birth rules = path 30 (useless without global path info)
- Tower count matters more than algorithm — no artificial cap

## Speed Bug Discovery (CRITICAL KNOWLEDGE)
**All wave counts from speed>1 tests before commit 8403ec5 were inflated.**
Always test at speed=4+ with speed fixes in place. Speed=1 is ground truth.

## Economy Investigation (2026-03-21)
- Per-player logging added: kills, shots, ammo, repair, restock, tower value per wave
- Kill rewards are IDENTICAL between human and AI (same enemies, same formula)
- Repair cost gap: human pays more because towers take more contact damage (denser layout)
- Auto-repair only runs during combat (not build phase) to prevent credit drain when selling

## Next Steps
1. [ ] Verify intestine pattern forms correctly in-game (S=2 from tower 1)
2. [ ] Investigate rebuild not working for human player
3. [ ] Run AI test to measure wave performance of new intestine maze
4. [ ] Test AI respawn modal display

## Recent Sessions
### 2026-03-21 — Intestine Maze + AI Respawn + UI Overhaul
- Rebuilt sandbox as multi-algorithm platform (15 algorithms)
- **Breakthrough: S=2 spacing + leftBias = path 380 intestine pattern**
- Integrated into game maze.ts (S=2 from tower 1, all-cell candidates)
- ROI-based tower type selection (WALL vs DPS based on path coverage)
- AA splash damage (flying-only, radius 2)
- AI respawn system: die → respawn with 120% human tower value
- Split Auto Fix into Repair/Reload/Rebuild toggles
- Economy logging: comprehensive per-player wave-end stats
- Starting credits: 5000c, AI difficulty: HARD only
- Start-wave selector (skip to wave 5/10/15/20/25/30)
- Click-and-drag tower placement
- Canvas scaling fixed (reserves space for HUD + tower bar)
- Tower buttons: fixed 70px width, compact

### 2026-03-20 — Plateau Research + Cellular Automaton Discovery
- Tried 5 approaches to break wave-16 plateau — none beat baseline
- Built sandbox.html for automaton research
- Key discovery: B0+onPath = path 128 (isolated on-path placements)

### Previous sessions: see session-log.md

## User Preferences
Jason, PST, fair difficulty, no cheats, spend everything
**Key feedback:**
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
