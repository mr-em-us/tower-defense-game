# Project Memory -- Tower Defense Game
Last Save: 2026-03-17 - 10:34 PM PST

## Current State
AI reaches **wave 40+** (timed out still alive at 180 HP). Chained maze sections (down→up→down) with path length **147**. Flying enemies rebalanced — slower, flat leak damage. Difficulty curve extends to wave 40 with exponential extrapolation beyond. AA upgrade priority + unspent build→upgrade flow keeps DPS scaling with enemy HP.

### Architecture (current working code)
- `server/ai/strategies/maze.ts` — chained switchback maze generator
- Box 1: width 7, grows downward (+3 walls/wave max)
- Chained sections: `generateChainedSection()` adds up/down columns automatically
- 3 sections fit on RIGHT side (cols 31-37, 39-45, 47-53)
- Enclosure: connector seals between sections, outer funnel on last section
- Corridor clearing: sells offense fill towers in new corridor rows when box grows
- Conflict sell: only sells truly wrong tower types (not WALL↔BASIC)
- Offense fill: radius 2→3→4 scaling with wave
- AA defense: aggressive targets, capped at 10 new/wave (upgrades > new level-1s)
- AA reserve uncapped after wave 20 (maze is done)

### Economy (current working code)
- `server/ai/strategies/economy.ts` — budget allocation + upgrade scoring
- Upgrade ratio: 0% w1-4, 20% w5-7, 35% w8-12, 55% w13-20, 70% w21-25, 80% w26-30, 85% w31+
- AA upgrade ROI boost: 3x (accounts for 3x flying damage multiplier)
- `server/ai/AIController.ts` — unspent build budget flows to upgrades
- Late-game credits mostly go to AA tower upgrades (exponential DPS scaling)

### Balance State
- Flying: speed 2 (was 3), 80 HP, non-AA damage 0.5x (was 0.4x), AA 3x
- Leak damage: FLAT (creditValue without difficulty scaling) — flying leak = 20 HP always
- Kill rewards: sqrt(difficulty) scaling — income grows slower than enemy HP
- Difficulty curve: 40 entries, aggressive late game (120x at wave 40)
- Post-wave-40: 15% exponential growth per wave

### Dev Tools
- **Headless AI test:** `GET /api/ai-test?speed=10&timeout=1800000` — configurable timeout, returns JSON
- **Broadcast optimization:** skips JSON.stringify when no open connections
- **Railway deployment:** https://zonal-light-production-d71c.up.railway.app (deploy via `railway up`)

## Next Steps
- [x] **Railway deployment** — live at https://zonal-light-production-d71c.up.railway.app
- [ ] **LEFT side mirror testing** — verify chained sections work mirrored
- [ ] **Ground enemy variety** — ground never leaks, could buff ground or add new enemy types
- [ ] **Wave 50+ target** — AI is still gaining HP headroom at wave 40
- [ ] Clean up debug logging in maze.ts

## Uncommitted Work
None — committing now.

## Recent Sessions

### 2026-03-17 Late Night -- Wave 40 AI ★★★★★
- Fixed corridor clearing bug (offense fill towers blocking new corridors when box grows)
- Fixed conflict sell (don't sell WALL→BASIC on wall rows — wastes early budget)
- AA upgrade priority: 3x ROI boost in upgrade scoring
- Upgrade ratio: 80% wave 26-30, 85% wave 31+ (was 70% flat for 21+)
- Unspent build budget flows to upgrades (huge late-game DPS boost)
- AA reserve uncapped after wave 20, excess AA capped at 10/wave
- Wall growth rate +3/wave (was +2) — maze reaches full size faster
- Configurable test timeout parameter
- **Wave 40+, 180 HP, zero leaks waves 32-39. 13,546 enemies killed in wave 39.**

### 2026-03-17 Evening -- Chained Maze + Rebalance ★★★★
- Chained sections: down→up→down, 3 columns automatic, path 139
- Flying rebalance, flat leak damage, difficulty curve to 40
- **Wave 30+, 60 HP, timed out still alive**

### 2026-03-17 Afternoon -- AA Balance + Wave 22 ★★★
- AA damage buff (5→8), countdown-driven AA reserve/target scaling
- **Reliably wave 20+, ground defense perfect, only air leaks**

### 2026-03-17 Morning -- AI Maze to Wave 20 ★★★
- Targeted gap sells, growth limiting, broadcast optimization
- **Wave 20, 500 HP, zero leaks waves 1-19**

### 2026-03-15 Evening -- Compact Box Maze ★★★
- Full rewrite: compact box with horizontal switchbacks
- Wave 4 → wave 13, path 30 → 173

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
