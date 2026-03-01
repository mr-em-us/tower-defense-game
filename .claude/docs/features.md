# Feature Inventory

## Shipped (committed)

### 2-Player Networked Game -- shipped
Commit: 1240170 | Initial commit
Core multiplayer tower defense: WebSocket networking, server-authoritative state, 60x30 grid split into left/right zones, 5 tower types, 4 enemy types, BFS pathfinding, build/combat phase loop.

### Enemy Zone Constraints -- shipped
Commit: c60e83f
Enemies constrained to path toward their target player's side only. Prevents cross-board pathing confusion.

### Single Player Mode -- shipped
Commit: e423fdf
Added GameMode.SINGLE. Starting menu to choose Single/Multi. Single player: 1 player, enemies target that player's side only. Room auto-starts with 1 player.

### Even Enemy Spawn Distribution -- shipped
Commit: c86b4e2
Spread enemy spawns evenly across wave duration instead of burst spawning. Fixed side boundary calculation.

### Mobile Support + Cloud Gaming -- shipped
Commits: a0ce493, 3d727a2, ac1f67f
Touch input (tap to place, pinch zoom), responsive canvas scaling, landscape orientation prompt, localtunnel integration for remote play.

### Render Deploy -- shipped
Commits: f320da2, 4fa0255
render.yaml config, server binds to 0.0.0.0, PORT env variable support.

### Wave Progress UI + Real-time Ammo Costs -- shipped
Commit: 8273989
HUD shows wave progress bar (enemies remaining/total). Towers deduct ammo cost credits per shot during combat (not just at wave end). HUD positioning fixes.

### Player HP System -- shipped
Commit: d22226f
Separate health from economy. player.health/maxHealth independent from credits. Enemies deal contactDamage to HP on reaching goal. Game over when HP=0.

### Multi-select, Paid Ammo, Brush Tool, Zoom/Pan -- shipped
Commit: 4068537
Shift-click multi-tower selection. Ammo is a paid resource (ammoCostPerRound per shot). Brush repair tool for area repair/restock. Mouse wheel zoom + arrow key pan. Combat repair enabled.

### Pre-game Settings Panel + Stats Charts -- shipped
Commit: e029bff | PR #5
Settings panel with difficulty curve editor (20 draggable points). StatsTracker records per-wave stats. ChartsOverlay renders stat charts.

## Shipped (uncommitted -- on main branch)

### Username System -- shipped (uncommitted)
UsernamePanel with localStorage persistence (td_usernames, max 10 MRU). Name sent with JOIN_GAME, stored in Player.name, used in leaderboard.

### Expanded GameSettings -- shipped (uncommitted)
Per-tower stat overrides (cost, damage, range, fireRate, maxHealth, maxAmmo) and per-enemy stat overrides (health, speed, creditValue, contactDamage) as multipliers. Server applies at tower creation / enemy spawn.

### Settings Panel Redesign -- shipped (uncommitted)
Tabbed UI (General/Towers/Enemies). Live difficulty factor display with delta. Slider-based tower/enemy stat override editing with base->effective preview. Easy/Normal/Hard preset buttons.

### Named Preset Save/Load -- shipped (uncommitted)
Save current settings by name, linked to username via localStorage (td_presets_{username}). Load/delete saved presets from settings panel.

### Difficulty Factor System -- shipped (uncommitted)
Weighted geometric mean difficulty computation (shared/utils/difficulty.ts). Live display in settings panel and mode menu. adjustedScore = wave * factor for leaderboard ranking.

### Leaderboard System -- shipped (uncommitted)
Server: LeaderboardStore (data/leaderboard.json), REST API endpoints. Client: LeaderboardPanel with SP/MP tabs, per-player best scores, Challenge button to review game settings.

### Difficulty Indicator on Mode Menu -- shipped (uncommitted)
Shows "Easy: 0.68x" / "Hard: 1.70x" / "Custom: N.NNx" on mode menu when settings differ from Normal. Clickable to reopen settings.

### Wave Rebalancing -- shipped (uncommitted)
New formula: `baseCount = firstWaveEnemies * (1 + (wave-1) * 0.2) * diffRatio`. Percentage-based type distribution. firstWaveEnemies default: 60 -> 15. Easy: 8, Hard: 25.

### Persistent Memory System -- shipped (not in git, lives in ~/.claude/ + CLAUDE.md)
Three-tier memory: CLAUDE.md (auto-loaded project ref), MEMORY.md (auto-loaded dynamic state), 5 topic files (on-demand). Handoff protocol: "save" triggers git commit + memory update + PST timestamp. Session start auto-loads + confirms. Live session logging via current-session.md.

### Auto-Repair Toggle -- shipped (uncommitted)
Passive tower maintenance toggle. When enabled, server auto-repairs most-damaged towers first (same cost formula as manual repair), then restocks lowest-ammo towers. Processed once per second. Persists until manually turned off. HUD button with ON/OFF state and .selected highlight.

### Fast Mode -- shipped (uncommitted)
Game speed toggle (1x normal / 2x fast). gameSpeed multiplied into dt for all server systems; TowerSystem fire interval also divided by gameSpeed. Singleplayer: immediate toggle. Multiplayer: requires both players to request (same pattern as Ready). HUD button shows speed state; center HUD shows "[2x]" in yellow when active.

## Planned / Ideas
- More tower/enemy types
- Cloud leaderboard sync
- Test suite
- Delta state compression for bandwidth
- Lobby system for multiplayer
