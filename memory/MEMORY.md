# Project Memory -- Tower Defense Game
Last Save: 2026-03-17 - 06:09 PM PST

## Current State
AI reaches **wave 30+** (timed out still alive at 60 HP). Chained maze sections (down→up→down) with path length **139**. Flying enemies rebalanced — slower, flat leak damage. Difficulty curve extends to wave 40 with exponential extrapolation beyond.

### Architecture (current working code)
- `server/ai/strategies/maze.ts` — chained switchback maze generator
- Box 1: width 7, grows downward (+2 walls/wave max)
- Chained sections: `generateChainedSection()` adds up/down columns automatically
- 3 sections fit on RIGHT side (cols 31-37, 39-45, 47-53)
- Enclosure: connector seals between sections, outer funnel on last section
- Offense fill: radius 2→3→4 scaling with wave
- AA defense: aggressive targets, 50% excess budget to AA after wave 8

### Balance State
- Flying: speed 2 (was 3), 80 HP, non-AA damage 0.5x (was 0.4x), AA 3x
- Leak damage: FLAT (creditValue without difficulty scaling) — flying leak = 20 HP always
- Kill rewards: sqrt(difficulty) scaling — income grows slower than enemy HP
- Difficulty curve: 40 entries, aggressive late game (120x at wave 40)
- Post-wave-40: 15% exponential growth per wave
- Upgrade ratio: 55% wave 13-20, 70% wave 21+

### Dev Tools
- **Headless AI test:** `GET /api/ai-test?speed=10` — 10min timeout, returns JSON
- **Broadcast optimization:** skips JSON.stringify when no open connections

## Next Steps
- [ ] **Wave 40 target** — needs more AA scaling or 4th maze section to survive deeper
- [ ] **LEFT side mirror testing** — verify chained sections work mirrored
- [ ] **Ground enemy variety** — ground never leaks, could buff ground or add new enemy types
- [ ] Render deployment for mobile play
- [ ] Clean up debug logging in maze.ts

## Uncommitted Work
None — committing now.

## Recent Sessions

### 2026-03-17 Evening -- Chained Maze + Rebalance ★★★★
- Implemented return section (U-turn): enemy goes down→up through 2 switchback columns
- Fixed numWalls cap bug (was 12, should be 8 based on grid height)
- Fixed exit path blocking (offense fill at funnel exit)
- Generalized to chained sections: down→up→down, 3 columns automatic
- Path: 43 → 139 (3.2x increase!)
- Rebalanced flying: speed 3→2, non-AA dmg 0.4→0.5x
- Flat leak damage (leakDamage field, no difficulty scaling)
- Extended difficulty curve to 40 waves (aggressive: 120x at wave 40)
- Post-40 extrapolation: 15% exponential per wave
- Kill rewards: sqrt scaling (caps income growth)
- **Wave 30+, 60 HP, timed out still alive. 3,063 enemies killed in wave 30.**

### 2026-03-17 Afternoon -- AA Balance + Wave 22 ★★★
- AA damage buff (5→8), ground-vs-flying (0.25→0.40)
- Countdown-driven AA reserve/target scaling
- **Reliably wave 20+, ground defense perfect, only air leaks**

### 2026-03-17 Morning -- AI Maze to Wave 20 ★★★
- Targeted gap sells, growth limiting, broadcast optimization
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
- `maze-strategy-history.md` -- **MUST READ before any maze changes.** Complete history with failed approaches and lessons learned.
