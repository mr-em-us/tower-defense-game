# Project Memory -- Tower Defense Game
Last Save: 2026-03-17 - 01:42 PM PST

## Current State
AI maze strategy reaches **wave 15-20** reliably with compact box maze. Best run: **wave 20, 500 HP, zero leaks through wave 19**. Huge improvement from wave 5-7 baseline at session start.

### Architecture (current working code)
- `server/ai/strategies/maze.ts` — compact box maze generator with batch placement
- Wave 1: builds box (width 7, 4 walls) with WALL structural + BASIC internal
- Waves 2+: grows downward (+2 walls/wave max), targeted sells for gap openings
- Batch placement: all cells at once, single path validation
- Offense fill: DPS towers within 2 cells of path
- AA defense: scales with wave count and air wave countdown

### Key Design Elements
- Horizontal walls with 1-cell gaps at alternating sides (switchbacks)
- Solid first/last walls (seals), side walls on corridor rows
- WALL (25c) for structure, BASIC (50c) for internal walls (DPS)
- Funnel column at zone edge prevents bypass
- Growth is ADDITIVE (more rows downward), never widening
- Targeted sells: only gap cells in repurposed seal walls + old exit corridors

### Dev Tools
- **Headless AI test:** `GET /api/ai-test?speed=4` — no browser needed, returns JSON
- **Broadcast optimization:** skips JSON.stringify when no open connections
- **Perf logging:** tick timing + entity counts every 200 ticks in combat

## Next Steps (toward reliable wave 20)
- [ ] Better AA scaling for wave 6 air wave (key vulnerability: -60-120 HP)
- [ ] Render deployment for mobile play (Jason wanted this, needs GitHub OAuth)
- [ ] Test LEFT side mirror behavior

## Uncommitted Work
- `server/ai/strategies/maze.ts` — targeted gap sells, growth limiting, offense fill r2
- `server/game/GameRoom.ts` — broadcast optimization, perf logging
- `server/index.ts` — headless AI test endpoint
- `memory/maze-strategy-history.md` — updated with iterations 9-10 results

## Recent Sessions

### 2026-03-17 Morning -- AI Maze to Wave 20 ★★★
- Fixed old seal walls blocking switchback gaps (targeted sell of gap cells)
- Added growth limiting (+2 walls/wave max)
- Expanded offense fill to radius 2, starting wave 2
- Fixed game hang at wave 11+ (broadcast JSON.stringify bottleneck)
- Created headless AI test endpoint for fast iteration
- **Best: wave 20, 500 HP, zero leaks waves 1-19**
- Confirmation: wave 15 (leaked 2 flying on wave 6 = key vulnerability)

### 2026-03-15 Evening -- Compact Box Maze Implementation ★★★
- Full rewrite of maze.ts to compact box with horizontal switchbacks
- Iterated through ~15 experiments fixing bypass, gaps, expansion
- Progress: wave 4 → wave 13. Path: 30 → 173.

### 2026-03-15 PM -- Column-Based Experiments (11 iterations)
- Tried columns, serpentine, greedy — all fundamentally wrong
- Decision: must build compact rectangular maze, not columns

### 2026-03-14 Late Night -- Maze Problem Diagnosis
- Jason identified fundamental strategy flaws
- Decision: full maze strategy rewrite needed

## Known Issues / Tech Debt
- [ ] Leaderboard data only persists locally (data/leaderboard.json)
- [ ] No tests exist
- [ ] Multiplayer room management is basic
- [ ] Save/resume is singleplayer only (BUILD phase only)

## User Preferences
- Username: Jason
- Timezone: PST (America/Los_Angeles)
- Prefers thorough testing via preview server after changes
- Values game balance -- wants difficulty to feel fair, not punishing
- AI difficulty should be based on decision quality, NOT cheats

## Shared Docs (git-tracked in .claude/docs/)
- `architecture.md` -- Server/client data flow, system pipeline, network protocol
- `decisions.md` -- Key design decisions with rationale (ADR log)
- `economy.md` -- Tower/enemy stats, pricing formulas, wave scaling
- `features.md` -- Feature inventory with status and commit references

## Personal Files (local only)
- `session-log.md` -- Full session history archive
- `current-session.md` -- Live log of current/most recent session
- `maze-experiments.md` -- Detailed experiment log for AI maze iterations
- `maze-strategy-history.md` -- **MUST READ before any maze changes.** Complete code evolution log (10 iterations) with failed approaches and lessons learned.
