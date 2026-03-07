# Project Memory -- Tower Defense Game
Last Save: 2026-03-07 - 03:27 PM PST

## Current State
All features complete + playtesting fixes + UI redesign. Clean build. Flying enemies, AA tower, air wave scheduling, bar redesign all working. Future ideas brainstormed and documented. Ready for playtesting.

## Uncommitted Work
Memory file updates only (this save).

## What's New This Session
1. **Ready button persistent** — Always visible regardless of drawer state.
2. **AA buff** — Flying multiplier 3x (45 DPS vs air).
3. **Bar redesign** — Uniform height, .bar-group dividers, compact cost labels.
4. **Brush tooltips** — Descriptions moved to native tooltips.
5. **Future ideas documented** — 4-player, AI opponents, offense buildings, enemy streams, army units.
6. **Architecture principle** — Mode-driven configuration over code forks for new game modes.

## Known Issues / Tech Debt
- [ ] Leaderboard data only persists locally (data/leaderboard.json)
- [ ] No tests exist
- [ ] Multiplayer room management is basic
- [ ] Full GameState broadcast every tick (no delta compression)

## Recent Sessions

### 2026-03-07 PM (continued) -- Bar Redesign + AA Buff + Future Ideas
- Ready+Stats moved to persistent group (always visible regardless of drawer)
- AA flying multiplier 2x→3x (45 DPS vs air)
- Full bar redesign: uniform height, .bar-group dividers, compact cost labels
- Brush buttons cleaned (descriptions → tooltips)
- Future ideas brainstormed: 4-player, AI opponents, offense buildings, enemy streams, army units
- Architecture discussion: mode-driven configuration principle established
- Clean build, 3 commits this session (12c006d, 69b1fdb, + memory update)

### 2026-03-07 PM -- Playtesting Fixes + Flying Enemies
- Fixed flying damage bug (non-AA 25% damage, AA 3x)
- Air wave randomization with 3-wave countdown warning
- Ready button always visible (disabled during combat)
- R&R→Fix rename, chart "Diff"→"Difficulty"
- Brush UI restructured into separate drawer
- AA damage: 80→10 base, tooltip with air damage

### 2026-03-07 PM -- 12-Item Batch Review
- Reviewed all 12 batch items, 10/12 complete
- Removed dead Restock button and format.ts
- Confirmed dynamic pricing on upgrades + sell

### 2026-03-07 AM -- Bug Fixes + Dynamic Pricing + Economy Ledger
- Fixed 3 bugs, added WaveEconomy tracking, price escalation display, ECON tab

### 2026-03-06 -- 5 Feature Batch (WASD, Upgrade Cost, Turbo, Ghost Traces, Post-Game)

## User Preferences
- Username: Jason
- Timezone: PST (America/Los_Angeles)
- Prefers thorough testing via preview server after changes
- Values game balance — wants difficulty to feel fair, not punishing
- Likes parallel agent workflows for large features
- Dislikes inconsistent button sizes — wants uniform, clean UI

## Next Steps (Priority Order)
1. Playtest with all new mechanics (flying, AA, air waves)
2. Balance flying enemy HP vs AA damage
3. Verify multiplayer works with new features
4. Explore future ideas (AI opponents, offense buildings — see features.md)
5. Architecture: use mode-driven config pattern for any new game modes

## Shared Docs (git-tracked in .claude/docs/)
- `architecture.md` -- Server/client data flow, system pipeline, network protocol
- `decisions.md` -- Key design decisions with rationale (ADR log)
- `economy.md` -- Tower/enemy stats, pricing formulas, wave scaling
- `features.md` -- Feature inventory with status and commit references

## Personal Files (local only)
- `session-log.md` -- Full session history archive
- `current-session.md` -- Live log of current/most recent session
