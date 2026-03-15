# Project Memory -- Tower Defense Game
Last Save: 2026-03-14 - 11:52 PM PST

## Current State
AI maze strategy needs a REWRITE. After 8 iterations of incremental tuning, Jason identified that the fundamental approach is flawed — the AI doesn't build a real maze. Current code (server/ai/strategies/maze.ts) has three core problems that no amount of parameter tuning will fix. Clean build, uncommitted iteration 8 changes in working tree.

## *** NEXT SESSION: Rewrite AI Maze Strategy ***
The maze rewrite is the #1 priority. Here's what's wrong and what to do:

### Problem Diagnosis (from code review + Jason's feedback)
1. **Wasted towers at grid edges:** Columns span full height (rows 0-29) but enemies only travel around rows 8-22. Towers at rows 0-5 and 25-29 do nothing.
2. **Not a real maze:** `colSpacing=10` means columns are 10 cells apart. On a 30-cell zone, that's ~3 columns. Enemies barely zigzag. Need tight switchbacks.
3. **Air defense is an afterthought:** `placeAirDefense` scatters AA in rows 11-19 within the zone. Needs to be a deliberate corridor along the flight path.

### Design Principles (from Jason)
- Do NOT copy any single layout. Mazes should be varied/generalized.
- Measure success by **path length increase**, not tower count.
- Build where enemies actually travel, not at the fringes.
- Force enemies through tight switchbacks (real serpentine, not wide fence posts).
- AA defense must be deliberate, not scattered.

### Key File
- `server/ai/strategies/maze.ts` — the file to rewrite

## Uncommitted Work
Iteration 8 changes still in working tree (not being committed this save — they represent the flawed approach being replaced).

## Recent Sessions

### 2026-03-14 Late Night -- Maze Problem Diagnosis
- Jason reviewed AI maze output, identified fundamental strategy flaws
- Shared screenshot of human-built maze showing what good looks like
- Clarified 3 principles: don't waste money on edges, build real maze, handle air
- Code review confirmed: colSpacing=10 too wide, full-height columns wasteful, AA scattered
- Decision: full maze strategy rewrite needed (not more iteration)

### 2026-03-14 PM/Night -- AI Maze Iteration (Iter 7→8)
- Ran iteration 7: died wave 15 (best result). Ground defense perfect waves 9-14. Air wave killed from 396→0HP.
- Iteration 8: wider search, lower thresholds, aggressive AA — died wave 13 (worse)
- Added placeAirDefense function but fundamental maze shape is wrong
- Concluded: incremental tuning won't fix the core layout problem

### 2026-03-14 PM -- AI Opponents + Port Change + Canvas Scaling
- Port 8080→9090, canvas scaling fills screen
- AI Opponents feature (full implementation)
- Menu UI: Single Player / Play vs AI / Watch AI Play

## Known Issues / Tech Debt
- [ ] Leaderboard data only persists locally (data/leaderboard.json)
- [ ] No tests exist
- [ ] Multiplayer room management is basic
- [ ] Full GameState broadcast every tick (no delta compression)
- [ ] format.ts utility created but unused (toLocaleString used directly)
- [ ] Save/resume is singleplayer only (BUILD phase only)
- [ ] SavePanel onLoad callback gets stale if user goes Back then reopens

## User Preferences
- Username: Jason
- Timezone: PST (America/Los_Angeles)
- Prefers thorough testing via preview server after changes
- Values game balance -- wants difficulty to feel fair, not punishing
- Likes parallel agent workflows for large features
- Prefers memos/output displayed as text in chat, not just saved to files
- AI difficulty should be based on decision quality, NOT cheats (same resources/info)

## Shared Docs (git-tracked in .claude/docs/)
- `architecture.md` -- Server/client data flow, system pipeline, network protocol
- `decisions.md` -- Key design decisions with rationale (ADR log)
- `economy.md` -- Tower/enemy stats, pricing formulas, wave scaling
- `features.md` -- Feature inventory with status and commit references

## Personal Files (local only)
- `session-log.md` -- Full session history archive
- `current-session.md` -- Live log of current/most recent session
