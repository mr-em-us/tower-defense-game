# Project Memory -- Tower Defense Game
Last Save: 2026-03-17 - 03:52 PM PST

## Current State
AI reliably reaches **wave 20+**. Ground defense is perfect — only FLYING enemies ever leak. Best observed: wave 22+ (timed out still alive). Main remaining issues: maze can't turn upward at bottom edge, credit hoarding in late game, air-only damage suggests balance is off.

### Architecture (current working code)
- `server/ai/strategies/maze.ts` — compact box maze generator with batch placement
- Wave 1: builds box (width 7, 4 walls) with WALL structural + BASIC internal
- Waves 2+: grows downward (+2 walls/wave max), targeted sells for gap openings
- Batch placement: all cells at once, single path validation
- Offense fill: DPS towers within 2 cells of path
- AA defense: countdown-driven scaling, uncapped in late game

### Balance Changes (this session)
- AA tower damage: 5 → 8 (24/shot vs flying with 3x multiplier)
- Ground vs flying multiplier: 0.25 → 0.40
- AA reserve: countdown-driven (200c baseline → 500+wave*40 when air is this wave)
- AA target: countdown-driven (2+wave/3 baseline → 4+wave*0.6 when imminent)
- Upgrade ratio capped at 45% (was 69% at 150+ towers)
- Late game: uncapped AA with leftover budget

### Dev Tools
- **Headless AI test:** `GET /api/ai-test?speed=4` — no browser needed, returns JSON
- **Broadcast optimization:** skips JSON.stringify when no open connections

## Next Steps
- [ ] **Maze upward turn** — when maze hits grid bottom, needs to reverse and switchback UP (currently exits into straight hallway at bottom)
- [ ] **Late-game spending** — AI hoards 40-75k credits. Offense fill saturates, excess AA is hacky. Need meaningful late-game spending.
- [ ] **Air balance** — only air ever does damage. Either buff ground enemies or nerf air defense slightly for variety.
- [ ] Render deployment for mobile play
- [ ] Test LEFT side mirror behavior

## Uncommitted Work
- `server/ai/strategies/maze.ts` — AA countdown scaling, uncapped late-game AA, offense fill radius 2
- `server/ai/strategies/economy.ts` — upgrade ratio cap 45%
- `memory/maze-strategy-history.md` — updated with iterations 11, 11b, 11c

## Recent Sessions

### 2026-03-17 Afternoon -- AA Balance + Wave 22 ★★★
- AA damage buff (5→8), ground-vs-flying (0.25→0.40)
- Countdown-driven AA reserve/target scaling
- Tried chained boxes — ABANDONED (enemies bypass)
- Tried no-reserve spending — died wave 14 (no AA budget)
- Tried offense fill radius 4 — created useless walls in open space
- Uncapped late-game AA spending (hacky but functional)
- **Reliably wave 20+, ground defense perfect, only air leaks**

### 2026-03-17 Morning -- AI Maze to Wave 20 ★★★
- Targeted gap sells, growth limiting, broadcast optimization
- Created headless AI test endpoint
- **Wave 20, 500 HP, zero leaks waves 1-19**

### 2026-03-15 Evening -- Compact Box Maze ★★★
- Full rewrite: compact box with horizontal switchbacks
- Wave 4 → wave 13, path 30 → 173

### 2026-03-15 PM -- Column-Based (11 iterations, abandoned)

## Known Issues / Tech Debt
- [ ] Leaderboard data only persists locally
- [ ] No tests exist
- [ ] Multiplayer room management is basic
- [ ] Save/resume is singleplayer only (BUILD phase only)

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
- `maze-strategy-history.md` -- **MUST READ before any maze changes.** Complete history (11 iterations) with failed approaches and lessons learned.
