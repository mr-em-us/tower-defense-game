# Tower Defense Game

Multiplayer and singleplayer tower defense with ASCII art style. Server-authoritative architecture over WebSocket. Players place towers to defend their side of a shared grid from enemies that spawn at the center and path toward the edges.

## Commands
- `npm run build` — full production build (tsc shared + server + esbuild client + copy assets)
- `npm run dev` — build + concurrently run dev server + esbuild watcher
- `npm start` — run production server (dist/server/server/index.js)
- `npm run tunnel` — build + run + localtunnel for remote play
- Server: http://localhost:9090 | WS: ws://localhost:9090
- Deploy: Render free tier (render.yaml)

## Collaborators
Map git identity → display name. Identification priority:
1. **Cloud (preferred):** Check if `/home/claude/.claude/remote/.session_ingress_token` exists. If so, decode the JWT payload (base64 middle segment) and extract `account_email`. Match against the table below.
2. **Local CLI:** Use `git config user.email` and match against the table below.
3. **Fallback:** If neither method identifies the user, ask: "Hey! I can't tell who you are. Are you Jason or Michael?"

| Email pattern          | Name    |
|------------------------|---------|
| jvsfernando@gmail.com  | Jason   |
| 168463487+jlsavard@*   | Jason   |
| mike@ochotta.com       | Michael |

## Stack
TypeScript monorepo | Node.js + ws (server) | Canvas 2D + DOM (client) | esbuild bundler | DM Mono font

## File Structure
- `client/` — Browser client: Canvas rendering, DOM overlays (HUD, settings, leaderboard), WebSocket
- `server/` — Authoritative game server: WebSocket, ECS-like system pipeline, HTTP static + API
- `shared/` — Cross-boundary: types, constants, pathfinding, difficulty calc
- `data/` — Runtime data (gitignored): leaderboard.json
- `.claude/launch.json` — Preview server config (port 9090)

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
- WebSocket URL hardcoded to port 9090 even in dev (esbuild serves client on different port)
- Canvas uses internal buffer coordinates; CSS scaling handled separately via applyResponsiveScaling
- SettingsPanel.buildCurveSection() creates a new canvas each time switchTab('general') runs — must call drawCurve() after switchTab, not before
- Phase transitions use waveEnemiesRemaining sentinel to prevent race conditions
- data/ directory is gitignored — leaderboard.json persists locally only
- Difficulty factor uses weighted geometric mean (shared/utils/difficulty.ts) — formula is non-trivial

## Memory System Protocol

This project uses a structured persistent memory system. Follow these protocols exactly.

### Memory file locations

**Shared (git-tracked, visible to all collaborators):**
- `CLAUDE.md` (this file) — project reference, conventions, protocols
- `.claude/docs/architecture.md` — server/client data flow, system pipeline, network protocol
- `.claude/docs/decisions.md` — design decisions with rationale (ADR log)
- `.claude/docs/economy.md` — tower/enemy stats, pricing formulas, wave scaling
- `.claude/docs/features.md` — feature inventory with status and commit refs

**Personal (local, per-developer — exists in TWO locations that must stay in sync):**
- `memory/MEMORY.md` — dynamic state, session history, known issues, next steps
- `memory/current-session.md` — live log of current session
- `memory/session-log.md` — archived session history

**IMPORTANT — Dual MEMORY.md locations:**
Claude auto-loads `MEMORY.md` from the **auto-memory directory** (`~/.claude/projects/<project-hash>/memory/MEMORY.md`), NOT from the project's `memory/MEMORY.md`. Both must be kept in sync. On save, always write to BOTH:
1. `memory/MEMORY.md` (project dir — git-tracked)
2. `~/.claude/projects/C--Users-jvsfe-Desktop-Claude-Tower-Defense-Game/memory/MEMORY.md` (auto-memory — what new sessions actually read)

### Session Start (do this automatically at the beginning of every new session)
1. CLAUDE.md and MEMORY.md auto-load — read them
2. **Identify the user:** Run `git config user.email` and match against the Collaborators table above
3. Read the "Last Save" line from MEMORY.md to get the previous session's save timestamp
4. Based on the user's task, read relevant shared docs (e.g., `.claude/docs/economy.md` for balance work, `.claude/docs/architecture.md` for structural changes)
5. Run `git status --short` to check for uncommitted local changes
6. **Sync with remote:** Run `git fetch origin` then check for divergence:
   - If remote has new commits: run `git pull --rebase origin main` to incorporate them
   - If pull fails due to conflicts: alert the user and do NOT proceed until resolved
7. **Build welcome message:** Check `git log` to determine what happened since the user's last commit:
   - Find the user's most recent commit (by their email)
   - Check if other collaborators committed anything after that
   - **Always include the exact "Last Save" timestamp from MEMORY.md** in the welcome message so the user can verify the right state was loaded
   - If no new commits from others: "Hey [Name]! Last save: [exact timestamp]. Nothing new since then. You last worked on: [summary of their recent commits]."
   - If new commits from others: "Hey [Name]! Last save: [exact timestamp]. Since then, [OtherName] made some changes: [summary of their commits]. Before that, you last worked on: [summary]."
   - Keep summaries concise — bullet the key changes, not every commit message verbatim
8. Create a fresh `memory/current-session.md` with today's date as the header
9. Output the welcome message + sync status

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
2. Update `memory/MEMORY.md` (project dir) AND copy to auto-memory:
   - Update "Current State" to reflect what's true now
   - Update "Uncommitted Work" (clear if committing everything)
   - Add/update session entry in "Recent Sessions"
   - Update "Known Issues" and "Next Steps" if changed
   - Update "Last Save" timestamp
   - If >5 session entries, move oldest to `session-log.md`
   - Verify file stays under 190 lines
   - **CRITICAL:** Copy the updated file to `~/.claude/projects/C--Users-jvsfe-Desktop-Claude-Tower-Defense-Game/memory/MEMORY.md` so new sessions load current state
3. Update relevant shared docs (in `.claude/docs/`):
   - Design decision made → append to `decisions.md`
   - Feature completed/started → update `features.md`
   - Balance numbers changed → update `economy.md`
   - Architecture changed → update `architecture.md`
4. Archive `current-session.md` content to `session-log.md` (prepend as newest entry)
5. Git operations:
   - `git add` specific changed files (never `git add -A`)
   - Include any modified `.claude/docs/*.md` files in the commit
   - `git commit` with descriptive message
   - `git pull --rebase origin main` to pick up any remote changes first
   - `git push origin main` to sync to GitHub
   - If push fails (e.g., conflict), alert the user and help resolve
6. Get actual system time: `date '+%Y-%m-%d - %I:%M %p'` (system clock is PST)
7. Output confirmation: `Saved - [timestamp in PST]`
