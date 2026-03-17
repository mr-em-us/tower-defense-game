# Project Memory -- Tower Defense Game
Last Save: 2026-03-17 - 03:12 PM PST

## Current State
AI maze strategy reaches **wave 22+** reliably. Best run: **wave 22+ (timed out, still alive at 41 HP)**. Only 6 enemies leaked across 21 waves — all FLYING from 2 air waves.

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

### Balance Changes (this session)
- AA tower damage: 5 → 8 (24/shot vs flying with 3x multiplier, 108 DPS)
- Ground vs flying multiplier: 0.25 → 0.40 (SNIPER does 20 vs flying, BASIC does 4)
- This was the critical fix — maze was already good, AA balance was the bottleneck

### Dev Tools
- **Headless AI test:** `GET /api/ai-test?speed=4` — no browser needed, returns JSON
- **Broadcast optimization:** skips JSON.stringify when no open connections
- **Perf logging:** tick timing + entity counts every 200 ticks in combat

## Next Steps
- [x] ~~Better AA scaling for air waves~~ DONE via AA damage buff
- [ ] Render deployment for mobile play (Jason wanted this, needs GitHub OAuth)
- [ ] Test LEFT side mirror behavior
- [ ] Chained boxes (iteration 11b) — needs "old exit hole" fix first (see strategy history)

## Uncommitted Work
- `shared/types/constants.ts` — AA damage 5→8
- `server/systems/ProjectileSystem.ts` — ground vs flying 0.25→0.40
- `memory/maze-strategy-history.md` — updated with iterations 11, 11b

## Recent Sessions

### 2026-03-17 Afternoon -- AA Balance + Wave 22 ★★★
- Diagnosed air enemy problem: AA too weak, ground towers useless vs flying
- AA damage buff (5→8) + ground-vs-flying buff (0.25→0.40)
- Tried chained boxes (box 2 adjacent to box 1) — ABANDONED, enemies bypass
- Reverted to single-box + AA buff: **wave 22+, timed out still alive**
- Only 6 enemies leaked across 21+ waves (all FLYING from 2 air waves)

### 2026-03-17 Morning -- AI Maze to Wave 20 ★★★
- Fixed old seal walls blocking switchback gaps (targeted sell of gap cells)
- Added growth limiting (+2 walls/wave max), broadcast optimization
- Created headless AI test endpoint for fast iteration
- **Best: wave 20, 500 HP, zero leaks waves 1-19**

### 2026-03-15 Evening -- Compact Box Maze Implementation ★★★
- Full rewrite of maze.ts to compact box with horizontal switchbacks
- Progress: wave 4 → wave 13. Path: 30 → 173.

### 2026-03-15 PM -- Column-Based Experiments (11 iterations)
- Tried columns, serpentine, greedy — all fundamentally wrong

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
- `maze-strategy-history.md` -- **MUST READ before any maze changes.** Complete code evolution log (11 iterations) with failed approaches and lessons learned.
