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

### Fast Mode -> Turbo Speed Mode -- shipped (uncommitted)
Game speed cycles Normal (1x) / Fast (2x) / Turbo (4x). Player.requestedSpeed replaces old fastModeRequested boolean. gameSpeed multiplied into dt for all server systems. SP: immediate toggle. MP: uses min of all players' requestedSpeed. HUD button shows Normal [>] / Fast [>>] / Turbo [>>>]; center HUD shows "[Nx]" indicator.

### WASD Camera Controls -- shipped (uncommitted)
WASD keys for camera panning alongside arrow keys. Input guard skips WASD/arrow handling when focused on `<input>` or `<textarea>`. Single file change: InputHandler.ts.

### Upgrade Cost on Button -- shipped (uncommitted)
When a tower is selected, the upgrade button shows the cost (e.g., "Upgrade (120c)"). Multi-select shows sum (e.g., "Upgrade All (450c)"). Uses getUpgradeCost() on GameClient which applies dynamic pricing formula.

### Destroyed Tower Ghost Traces -- shipped (uncommitted)
When a tower is destroyed by enemies, a faded outline (ghost trace) remains at that position showing the tower type. Helps players rebuild their defense lines. Traces are cleared when a new tower is placed on that cell. Only shows traces belonging to the current player.

### Post-Game Analysis Overlay -- shipped (uncommitted)
Full DOM-based post-game overlay shown at GAME_OVER phase. Displays: header (GAME OVER/VICTORY/DEFEAT), wave/HP subtitle, summary stats grid (enemies killed, towers built/lost, credits earned/spent), wave breakdown HTML table with red highlights on leaked/lost values, health and credits line charts via canvas, Play Again button. Server tracks per-wave stats (WaveStats) via phase transition detection, includes in GAME_OVER broadcast. Known bug: credits spent shows 0c because BUILD phase spending isn't tracked.

### Bug Fixes: Credits Tracking + Negative Credits + Difficulty Curve -- shipped (uncommitted)
Fixed 3 user-reported bugs: (1) Credits spent showing 0c in post-game — init wave stats at game start and BUILD transitions instead of only COMBAT start, added tracking to restockAll/brushRepair/processAutoRepair. (2) Credits going negative — added floor `if (player.credits < 0) player.credits = 0` after maintenance deduction in PhaseSystem.ts. (3) Difficulty ramp too steep waves 8-10 — smoothed default curve values from [1.9, 2.1, 2.4] to [1.8, 1.95, 2.15], adjusted waves 11-20 to reconnect to 7.2 endpoint.

### Dynamic Pricing Visibility -- shipped (uncommitted)
Tower buttons for SNIPER/SPLASH/SLOW show escalation percentage (e.g., "+36%") in amber text below the price when price has increased due to global purchases. BASIC/WALL exempt. Uses `count * PRICE_ESCALATION * 100` formula. Implemented via `.escalation` span in HUD.ts createTowerButtons() + updateTowerBar().

### Live Economy Ledger (ECON Tab) -- shipped (uncommitted)
New "ECON" tab in ChartsOverlay (canvas-rendered, matching existing chart aesthetic). Shows per-wave revenue breakdown (Kill Rewards, Wave Bonus, Tower Income, Sell Refunds) in green and expenses (Towers, Upgrades, Repairs, Restock, Maintenance) in red, with net total. Server-side WaveEconomy tracking: new WaveEconomy interface on GameState, getPlayerEconomy() helper in GameRoom, all 8 spending handlers instrumented, kill rewards tracked in ProjectileSystem. Economy resets each wave in initWaveStats(). ChartsOverlay scaled from 160x80 to 260x140 for readability.

### Flying Enemies + AA Tower -- shipped (uncommitted)
New enemy type (FLYING) with straight-line path from spawn to goal (bypasses BFS). New tower type (AA) that only targets flying, deals 3x damage. Non-AA towers deal 25% to flying. Air waves scheduled randomly (~35% chance, 3-wave countdown warning). HUD shows "✈ Air in N" / "✈ AIR WAVE".

### Price Decay -- shipped (uncommitted)
PRICE_DECAY_RATE=0.05 per wave applied in PhaseSystem. Dynamic prices gradually decrease when towers aren't being purchased.

### Auto-Rebuild -- shipped (uncommitted)
Types added (autoRebuild in settings, destroyedTowerMemory). PhaseSystem + HUD have rebuild code. Toggle button in main bar.

### Drawer-based HUD Layout -- shipped (uncommitted)
Single-row bottom bar with drawer system. "Towers" button opens tower picker drawer. "Brush" button opens brush mode drawer (Fix/Upgrade/Sell). Drawers are mutually exclusive. Ready+Stats always visible in persistent right group. All buttons uniform height with .bar-group dividers separating logical sections (Tools | Context | Toggles | Game).

### Strength Chart -- shipped (uncommitted)
StatsTracker tracks strengthIndex. ChartsOverlay has strength rendering code.

### Comma Delimiters -- shipped (uncommitted)
All numbers use .toLocaleString() across HUD, Renderer, PostGameOverlay.

### AA Tower Rebalance -- shipped (uncommitted)
AA damage 10→5 (half of Basic), fireRate 1.5→4.5 (3x faster). AA now targets both ground and air enemies. Info panel shows "DMG: 5 gnd / 15 air". Auto-repair prioritizes structural/bridge towers (sorted by empty orthogonal neighbor count).

### Keyboard Hotkeys -- shipped (uncommitted)
1-6 for tower type selection, U upgrade, R repair, E restock, X/Delete sell, Space ready, F cycle speed, Escape deselect. All guarded against input field focus.

### Save/Resume System -- shipped (uncommitted)
Singleplayer BUILD-phase-only saves. Server-side SaveStore (data/saves/, max 10/player). HTTP REST API (GET/POST/DELETE /api/saves). Client SavePanel UI. Save button in HUD. Load Game in main menu. GameRoom.fromSave() factory remaps player IDs.

### Wave Number Always Visible -- shipped (uncommitted)
BUILD phase HUD shows "WAVE N  BUILD  0/1 ready".

### Chart Divergence Fix -- shipped (uncommitted)
Difficulty line only steps up on COMBAT start, not during BUILD when waveNumber is pre-incremented.

### AI Opponents -- shipped (uncommitted)
Server-side AI opponent for singleplayer. Virtual client pattern: AIController inside GameRoom produces ClientMessages through same validation pipeline as human players. Three difficulties (Easy/Medium/Hard) via depth dial (0.25/0.55/0.90) — same resources, same information, deeper evaluation. Strategy: compact box maze with horizontal switchbacks (width 7), chained sections (down→up→down, 3 sections on RIGHT side), corridor clearing for clean box growth, AA-priority upgrades (3x ROI boost), unspent build→upgrade flow. Survives wave 40+ at 180 HP on Normal difficulty. Files: server/ai/ (AIController.ts, names.ts, strategies/*.ts), shared/types/ (AIDifficulty enum, aiEnabled/aiDifficulty settings, isAI player flag).

### Port Change 8080→9090 -- shipped (uncommitted)
All server/client/config references updated from port 8080 to 9090 to avoid conflicts when running multiple games.

### Canvas Full-Screen Scaling -- shipped (uncommitted)
Removed Math.min(..., 1) scale cap in applyResponsiveScaling so the game grid fills the entire browser viewport without blue borders, even when zoomed.

## Planned / Ideas

### Big Features
- **4-Player Mode** — Quadrant-based grid (instead of left/right halves), diagonal BFS pathfinding, 4 spawn zones. Would require major grid/zone architecture changes.
- **Offense Buildings (Barracks)** — Player-built structures that produce and send enemies at opponent. Adds offense/defense tradeoff. Shifts game toward Clash Royale/StarCraft hybrid.
- **Enemy-Produced Streams** — Variant where ALL enemies come from player-built producers, no neutral center spawn. Pure PvP offense/defense.
- **Army/Defender Units** — Mobile defense units that patrol and intercept enemies. Tradeoff between static towers (reliable, positional) vs mobile army (flexible, redirectable). Adds real-time tactics layer.

### Infrastructure
- Cloud leaderboard sync
- Test suite
- Delta state compression for bandwidth
- Lobby system for multiplayer
