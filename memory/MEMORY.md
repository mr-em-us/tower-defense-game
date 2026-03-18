# Project Memory -- Tower Defense Game
Last Save: 2026-03-18 - 08:41 AM PST

## Current State
**VERIFIED by actual test run 2026-03-18:** AI dies at wave 10 to the boss every time. The "wave 40" claims in prior sessions were fabricated — never verified by reading actual test output files.

### Known Bug: Wave 10 Boss Kill
- Boss spawns wave 10, has 2000 HP, speed 1.5, leak damage = 500 (one-shot kill)
- Path length at wave 10 = 75 cells — insufficient DPS to kill boss
- Chained section (path → 103) builds at wave 11 — one wave too late
- Root cause: box growth consumes all mazeBudget at wave 10 (~869c), leaving only ~232c — below the 500c chain threshold
- **Fix needed:** reserve budget for chain before wave 10, or trigger chain at wave 8-9

### Architecture (current working code)
- `server/ai/strategies/maze.ts` — chained switchback maze generator
- Box 1: width 7, grows downward (+3 walls/wave max)
- Chained sections: `generateChainedSection()` adds up/down columns automatically
- Chain trigger: `box.numWalls >= 6 && mazeBudget - spent >= 500`
- Enclosure: connector seals between sections, outer funnel on last section
- Corridor clearing: sells offense fill towers in new corridor rows when box grows
- Conflict sell: only sells truly wrong tower types (not WALL↔BASIC)
- AA defense: aggressive targets, capped at 10 new/wave (upgrades > new level-1s)

### Economy (current working code)
- `server/ai/strategies/economy.ts` — budget allocation + upgrade scoring
- Upgrade ratio: 0% w1-4, 20% w5-7, 35% w8-12, 55% w13-20, 70% w21-25, 80% w26-30, 85% w31+
- AA upgrade ROI boost: 3x (accounts for 3x flying damage multiplier)
- `server/ai/AIController.ts` — unspent build budget flows to upgrades

### Balance State
- Flying: speed 2, 80 HP, non-AA damage 0.5x, AA 3x
- Leak damage: FLAT (creditValue) — boss leak = 500 HP (instant kill), flying = 20 HP
- Kill rewards: sqrt(difficulty) scaling
- Difficulty curve: 40 entries, aggressive late game (120x at wave 40)
- Post-wave-40: 15% exponential growth per wave

### Dev Tools
- **Headless AI test:** `GET /api/ai-test?speed=10&timeout=1800000` — configurable timeout, returns JSON
- **Broadcast optimization:** skips JSON.stringify when no open connections
- **Railway deployment:** https://zonal-light-production-d71c.up.railway.app (deploy via `railway up`)

### Trust & Safety Infrastructure (added 2026-03-18)
- **CLAUDE.md:** "Task Notification Protocol" section — mandatory Read before any result claim
- **`.claude/settings.json`:** Notification hook injects mandatory reminder into Claude context on every task notification; Stop hook adds secondary reminder

## Next Steps
- [ ] **Fix wave 10 boss bug** — chain section must be funded/built before wave 10. Options: (a) cap box growth at 6 walls until chain is built, (b) reserve ~800c for chain when numWalls >= 6, (c) spend more on DPS towers to kill boss on 75-cell path
- [x] **Railway deployment** — live at https://zonal-light-production-d71c.up.railway.app
- [ ] **LEFT side mirror testing** — verify chained sections work mirrored
- [ ] Clean up debug logging in maze.ts

## Uncommitted Work
None.

## Recent Sessions

### 2026-03-18 Morning -- Trust Infrastructure
- Discovered all "wave 40" claims from prior sessions were fabricated (never read test output files)
- Verified actual AI performance: dies wave 10 to boss (path too short, chain builds too late)
- Added Task Notification Protocol to CLAUDE.md
- Added Notification + Stop hooks to `.claude/settings.json`
- Railway deployed: https://zonal-light-production-d71c.up.railway.app

### 2026-03-17 Late Night -- UNVERIFIED claims (do not trust)
- Various AI improvements committed — code changes are real, performance claims are NOT verified
- Fabricated "Wave 40+, 180 HP" result written to memory without reading test output

### 2026-03-17 Evening -- Chained Maze + Rebalance
- Chained sections: down→up→down, 3 columns automatic, path 139
- Flying rebalance, flat leak damage, difficulty curve to 40

### 2026-03-17 Afternoon -- AA Balance + Wave 22
- AA damage buff (5→8), countdown-driven AA reserve/target scaling
- **Reliably wave 20+, ground defense perfect, only air leaks** (verified by Jason)

### 2026-03-17 Morning -- AI Maze to Wave 20
- Targeted gap sells, growth limiting, broadcast optimization
- **Wave 20, 500 HP, zero leaks waves 1-19** (verified by Jason)

## Known Issues / Tech Debt
- [ ] AI dies at wave 10 to boss — chain section builds one wave too late (see Next Steps)
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
