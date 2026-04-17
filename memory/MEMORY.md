# Project Memory -- Tower Defense Game
Last Save: 2026-04-16 - 09:55 PM PST

## Current State
**Big perf + UX overhaul + free wall repair + tower templates. Auto-versioned build.**
Starting credits: 5000c. AI difficulty: HARD only. AI respawn system active.
**Unit test suite: 193 tests across 12 files (vitest). Run with `npm test`.**

### Shipped this session (2026-04-16)
- **Perf Tier 1+2** (cff12c1): EnemySpatialIndex for targeting/splash, tower position map for contact damage (O(1) instead of O(towers)), WaveSystem path cache keyed on `state.gridVersion` (bumped on place/sell/tower-death), `destroyedTowerTraces` capped at 300. Tick times ~0.5ms at wave 12 with 200+ towers / 150+ enemies.
- **UX + perf batch** (f4cdaf2): real player names in HUD/charts, layered air raid siren, slow towers scale contact damage by speed ratio (so slow is a true buff), HUD.update() dirty-checks state identity + client UI stamp (kills 60Hz DOM churn), Renderer path preview cached per (gridVersion, hover, towerType).
- **Major UX + templates** (a419a33): right-click clears selection; air-raid siren also plays when "Air in N" warning first appears; Renderer batched into font/fillStyle passes; `TowerTrace` carries `level` so rebuild (auto or manual same-cell) restores upgrade level at base cost; canvas runs full-width (tower bar overlays center-bottom); **tower templates** via localStorage.
- **Auto-version stamp** (886dbb6): `scripts/build-client.mjs` pulls git short SHA + date, injects via esbuild `--define __VERSION__`. No more manual bumps.
- **Ready button state** (37c1843): bright saturated green + ✓ + glow when server registered.
- **Free wall repair** (b25a681): all 11 repair-cost sites use `shared/utils/economy.ts:computeRepairCost`. Walls return 0. Tooltip discloses "Repair: FREE (replacement still costs 25c)". Auto-repair no longer aborts below 200c reserve — free walls still heal.

### Key Architecture (unchanged)
- S=2 + leftBias maze, ROI-based tower type selection, AA flight corridor.
- Three auto toggles: Repair, Reload, Rebuild (only run during combat).
- AI respawn at build phase with 120% of human tower value budget.

## Known Issues
- **Cross-lane splash credit leak (CONFIRMED BUG, not yet fixed)**: `ProjectileSystem` splash callback has no side filter. Friend earned 30k credits vs Jason's 10k from splash near midline. One-line fix: gate splash by `enemy.targetSide === ownerSide`. See `feedback_cross_lane_invariant.md`.
- **Free wall repair is too strong.** Jason identified post-ship that "strong walls + power towers" now wins arbitrary waves. Needs rebalance.
- **Templates are SP-only.** Overly conservative guard — no technical reason. Should wire through `onMulti` too.
- Rebuild not working for human player — pre-existing, not yet investigated.
- Load-game modal may not dismiss after load — pre-existing.

## Next Steps
1. [ ] Fix cross-lane splash credit leak (`ProjectileSystem` side gate)
2. [ ] Rebalance free wall repair (cap per wave / small repair cost / slow decay?)
3. [ ] Enable templates in multiplayer (wire `onMulti` branch)
4. [ ] Laser tower (axis-aligned beam, diminishing damage, upgrades raise penetration)
5. [ ] Three heatmaps: damage dealt, enemy damage taken, player damage taken
6. [ ] EU4-style map layers framework
7. [ ] Pre-existing: load-game modal dismiss, human rebuild investigation

## Recent Sessions
### 2026-04-16 — Perf overhaul, UX polish, tower templates, free wall repair
- 7 commits shipped: cff12c1 (Tier 1+2 perf), f4cdaf2 (UX batch), a419a33 (templates + rebuild retains level + canvas full-width), 886dbb6 (auto-version), f15e6f3 (version bump), 37c1843 (ready button state), b25a681 (free wall repair).
- Confirmed via live-game logs that server tick times were 0.3-0.8ms at wave 12 — late-wave lag is client-side.
- Investigated friend's Edge-browser lag at wave 11: concluded it's client-side (canvas fillText / Edge GPU compositing / thermal throttling candidates).
- Read-only investigation of splash cross-lane bug confirmed it exists in code.
- User documented future work (see Next Steps + `project_future_work_queue.md`).

### 2026-03-23 — Unit Test Suite
- Added vitest with 192 tests (now 193 with wall-free-repair test).
- Coverage: shared utils, all 5 server systems, GameRoom actions, AI economy + placement.

### 2026-03-21 — Intestine Maze + AI Respawn + UI Overhaul
- S=2 + leftBias, ROI-based tower type, AA splash, AI respawn, economy logging, auto toggles split.

### Previous sessions: see session-log.md

## User Preferences
Jason, PST, fair difficulty, no cheats, spend everything
**Key feedback:**
- NEVER claim a feature exists or doesn't exist without checking the code first. Search before answering.
- NEVER have cross-lane combat interactions (towers/enemies/credits should never cross the midline).
- Emergent complexity > predefined geometry (LLM spatial reasoning limitation).
- Always verify server is actually running before claiming it's up.
- Always start local server on session boot, output URL.
- Version stamp must be auto-generated, never hardcoded.

## Memory Index
- [Cross-lane isolation invariant](feedback_cross_lane_invariant.md) — two sides must never interact in combat; splash, laser, AoE all need side gates
- [Future work queue](project_future_work_queue.md) — bugs, balance, features documented at end of 2026-04-16 session
- [Start server on boot](feedback_start_server.md) — verify with curl

## Docs & Files
.claude/docs/: architecture, decisions, economy, features, dead-ends, knowledge-taxonomy
memory/: MEMORY, current-session, session-log, maze-strategy-history
client/sandbox.html: multi-algorithm maze research tool
scripts/build-client.mjs: auto-version esbuild wrapper
shared/utils/economy.ts: `computeRepairCost` single source of truth
server/game/SpatialIndex.ts: enemy spatial index for tower/splash queries
server/game/towerFactory.ts: `createTower` with level applied (rebuild reuses this)
