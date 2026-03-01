# Tower Defense Game

Multiplayer and singleplayer tower defense with ASCII art style. Server-authoritative architecture over WebSocket. Players place towers to defend their side of a shared grid from enemies that spawn at the center and path toward the edges.

## Commands
- `npm run build` — full production build (tsc shared + server + esbuild client + copy assets)
- `npm run dev` — build + concurrently run dev server + esbuild watcher
- `npm start` — run production server (dist/server/server/index.js)
- `npm run tunnel` — build + run + localtunnel for remote play
- Server: http://localhost:8080 | WS: ws://localhost:8080
- Deploy: Render free tier (render.yaml)

## Stack
TypeScript monorepo | Node.js + ws (server) | Canvas 2D + DOM (client) | esbuild bundler | DM Mono font

## File Structure
- `client/` — Browser client: Canvas rendering, DOM overlays (HUD, settings, leaderboard), WebSocket
- `server/` — Authoritative game server: WebSocket, ECS-like system pipeline, HTTP static + API
- `shared/` — Cross-boundary: types, constants, pathfinding, difficulty calc
- `data/` — Runtime data (gitignored): leaderboard.json
- `.claude/launch.json` — Preview server config (port 8080)

## Architecture
- Server is authoritative: all game logic server-side, client sends action requests
- Server tick: 20 Hz. Client renders via requestAnimationFrame
- Grid: 60x30 cells, 20px/cell. Split at columns 29|30 (LEFT_ZONE_END=29, RIGHT_ZONE_START=30)
- Enemies spawn center (cols 29-30, row 14), BFS path to player's edge (GOAL_ROWS 12-17)
- Server systems execute in order: Phase -> Wave -> Enemy -> Tower -> Projectile
- State broadcast: full GameState JSON every tick
- Client-side: main.ts bootstraps NetworkClient -> GameClient -> InputHandler -> Renderer -> HUD

## Conventions
- All types shared between client/server live in `shared/types/`
- Server systems are classes with `update(state, dt)` pattern
- Client UI: DOM for HUD/menus/overlays, Canvas for game world rendering
- Imports use `.js` extensions (ESM compatibility)
- Settings overrides use multipliers (1.0 = default), not raw values
- Server validates all client-sent values with bounds checks
- Dynamic pricing applies to SNIPER/SPLASH/SLOW only (PRICE_ESCALATION = 0.12)

## Invariants
- Pathfinding must never be blocked (validateTowerPlacement checks this before and after placement)
- Economy operations validated server-side (client checks are cosmetic)
- GameState is single source of truth, broadcast every tick
- Player zones strictly enforced (LEFT vs RIGHT halves)
- Wave enemy count formula: `baseCount = firstWaveEnemies * (1 + (wave-1) * 0.2) * diffRatio`

## Gotchas
- WebSocket URL hardcoded to port 8080 even in dev (esbuild serves client on different port)
- Canvas uses internal buffer coordinates; CSS scaling handled separately via applyResponsiveScaling
- SettingsPanel.buildCurveSection() creates a new canvas each time switchTab('general') runs — must call drawCurve() after switchTab, not before
- Phase transitions use waveEnemiesRemaining sentinel to prevent race conditions
- data/ directory is gitignored — leaderboard.json persists locally only
- Difficulty factor uses weighted geometric mean (shared/utils/difficulty.ts) — formula is non-trivial

## Memory System Protocol

This project uses a structured persistent memory system. Follow these protocols exactly.

### Memory file locations
- Auto-loaded: `CLAUDE.md` (this file) + `memory/MEMORY.md` (in auto memory dir)
- On-demand topic files (in memory dir): `architecture.md`, `decisions.md`, `economy.md`, `features.md`, `session-log.md`
- Live session log: `memory/current-session.md` (created each session, archived on save)

### Session Start (do this automatically at the beginning of every new session)
1. CLAUDE.md and MEMORY.md auto-load — read them
2. Read the "Last Save" line from MEMORY.md to get the previous session's save timestamp
3. Based on the user's task, read relevant topic files (e.g., economy.md for balance work, architecture.md for structural changes)
4. Run `git status --short` and `git log --oneline -3` to check for any changes since last save
5. Create a fresh `memory/current-session.md` with today's date as the header
6. Output confirmation: `Loaded - [last save timestamp from MEMORY.md]`

### During Session (live logging)
After each significant action (file edit, bug fix, feature addition, design decision, failed attempt), append a timestamped entry to `memory/current-session.md`:
```
- HH:MM — [brief description of what was done and why]
```
Get actual system time via `date '+%I:%M %p'` (system clock is already PST). Do NOT use TZ= override on Windows — it gives wrong results.

### Save Protocol (triggered by user saying "save" in context of wanting to save progress)
IMPORTANT: Use intelligent semantic context. "Save our progress" or "let's save" = trigger. "This will save us time" or "save for the button click handler" = NOT a trigger. When in doubt, ask.

Steps:
1. Run `npm run build` — verify clean build
2. Update `memory/MEMORY.md`:
   - Update "Current State" to reflect what's true now
   - Update "Uncommitted Work" (clear if committing everything)
   - Add/update session entry in "Recent Sessions"
   - Update "Known Issues" and "Next Steps" if changed
   - Update "Last Save" timestamp
   - If >5 session entries, move oldest to `session-log.md`
   - Verify file stays under 190 lines
3. Update relevant topic files:
   - Design decision made → append to `decisions.md`
   - Feature completed/started → update `features.md`
   - Balance numbers changed → update `economy.md`
   - Architecture changed → update `architecture.md`
4. Archive `current-session.md` content to `session-log.md` (prepend as newest entry)
5. Git operations:
   - `git add` specific changed files (never `git add -A`)
   - `git commit` with descriptive message
   - Do NOT push unless user explicitly asks
6. Get actual system time: `date '+%Y-%m-%d - %I:%M %p'` (system clock is PST)
7. Output confirmation: `Saved - [timestamp in PST]`
