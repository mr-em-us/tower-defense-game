# Design Decisions (ADR Log)

### 2024 -- Server-Authoritative Architecture
**Context**: Building a multiplayer game that also works in single player.
**Decision**: Server owns all game logic. Client is a "dumb" renderer that sends action requests and receives full state.
**Alternatives**: Client-authoritative (simpler but cheat-prone), prediction+reconciliation (complex)
**Consequences**: No cheating possible, but full state broadcast every tick is bandwidth-heavy. Single player has unnecessary network round-trip latency (negligible on LAN).

### 2024 -- BFS Pathfinding with Zone Constraints
**Context**: Enemies spawn at center, need to reach player edges. Players can't block paths.
**Decision**: BFS from center spawn to goal rows (12-17) on player's edge. validateTowerPlacement() simulates placement and checks that at least one path remains.
**Alternatives**: A* (unnecessary since all moves cost 1), flow fields (overkill for grid size)
**Consequences**: Memory-efficient with Uint8Array/Int32Array. Zone constraints naturally prevent cross-board pathing.

### 2024 -- Player HP Separate from Economy (commit d22226f)
**Context**: Originally enemies reaching the edge just reduced credits. Made the game confusing -- losing money felt like economy failure, not existential threat.
**Decision**: Added player.health / player.maxHealth separate from credits. Enemies deal contactDamage to HP on reaching goal. HP=0 triggers game over.
**Alternatives**: Keep single resource (credits=life), separate lives counter
**Consequences**: Clearer player feedback. HP is the "you're losing" signal, credits are the "you're building" resource. Settings can tune each independently.

### 2024 -- Real-time Ammo Costs (commit 8273989)
**Context**: Originally ammo was free during combat, costs settled at wave end. Players couldn't see the economic impact of combat in real-time.
**Decision**: Towers deduct ammoCostPerRound credits per shot during combat. Ammo bar shows remaining shots. Out of ammo = tower stops firing.
**Alternatives**: Free unlimited ammo (too easy), wave-end bulk deduction (poor feedback)
**Consequences**: Creates meaningful resource tension during combat. Players must balance tower count vs ammo sustainability. Restock mechanic added for manual resupply.

### 2024 -- Dynamic Pricing for Non-Basic Towers
**Context**: Players spamming the most cost-effective tower type.
**Decision**: SNIPER/SPLASH/SLOW prices increase by 12% per global purchase (PRICE_ESCALATION=0.12). BASIC and WALL exempt.
**Alternatives**: Hard caps per type, cooldowns, diminishing returns on damage
**Consequences**: Naturally encourages tower diversity. Early tower choices are cheap, mass production gets expensive. Upgrade purchases also increment the counter.

### 2024 -- Multi-select and Brush Tool (commit 4068537)
**Context**: Managing many towers individually was tedious.
**Decision**: Shift-click for multi-select, brush tool for area repair/restock. Brush operates on towers within a radius, sorted by distance.
**Alternatives**: Select-all, group management UI, auto-repair
**Consequences**: More ergonomic tower management. Brush tool is especially useful in combat for quick area repair.

### 2026-03 -- Settings Overrides as Multipliers (not raw values)
**Context**: Adding per-tower and per-enemy stat customization to the settings panel.
**Decision**: Overrides are multipliers (default 1.0) applied to base stats: `actualStat = baseStat * (override ?? 1.0)`. Settings store the multiplier, server applies it at tower creation / enemy spawn.
**Alternatives**: Raw value overrides (would break if base stats change), percentage offsets
**Consequences**: If base stats are rebalanced during development, all saved presets remain valid. UI shows "Base -> Effective" preview. Difficulty factor computation can treat multipliers uniformly.

### 2026-03 -- Difficulty Factor as Weighted Geometric Mean
**Context**: Need a single number to compare game difficulty across different settings configurations for leaderboard scoring.
**Decision**: Weighted geometric mean of per-parameter ratios. Weights: curve 0.25, enemies 0.15, HP 0.10, credits 0.08, tower stats 0.22, enemy stats 0.20. Factor 1.0 = Normal. Higher = harder.
**Alternatives**: Simple sum of deltas (doesn't handle multiplicative effects), manual difficulty tiers only
**Consequences**: adjustedScore = wave * difficultyFactor creates fair cross-difficulty comparison. Live display in settings panel creates "shopping cart" effect -- players see difficulty change as they tweak each slider.

### 2026-03 -- Auto-Repair Throttled to Once Per Second
**Context**: Auto-repair needs to passively maintain towers without overwhelming the server tick loop.
**Decision**: Counter increments each tick, processAutoRepair() runs every TICK_RATE ticks (once/sec). Repairs most-damaged towers first (by health ratio), then restocks lowest-ammo towers. Same cost formulas as manual operations.
**Alternatives**: Every tick (wasteful CPU, too aggressive spending), every wave (too slow to be useful), fixed credit-per-tick drain (different economy feel)
**Consequences**: Predictable 1/sec cadence. Players can watch credits drain steadily. Priority ordering means critical towers get fixed first. Uses existing repair/restock cost formulas so no economy discrepancy.

### 2026-03 -- Fast Mode via gameSpeed on GameState
**Context**: Players want to speed up gameplay, especially in late waves or singleplayer.
**Decision**: gameSpeed field on GameState (1=normal, 2=fast). Server multiplies dt by gameSpeed before passing to systems. TowerSystem fire interval also divided by gameSpeed since it uses wall-clock time. Singleplayer: immediate toggle. Multiplayer: both players must request (same as Ready pattern).
**Alternatives**: Client-side animation speed (wouldn't actually speed up game logic), server tick rate change (harder to implement, affects networking), arbitrary speed slider (too much complexity)
**Consequences**: True server-side speed increase. All systems (phases, waves, enemies, towers, projectiles) run faster. Multiplayer consensus prevents one player from forcing speed on another. gameSpeed on GameState means clients see it in every broadcast for UI.

### 2026-03 -- Turbo Mode: requestedSpeed Replaces fastModeRequested
**Context**: User wanted a "very fast" mode beyond the existing 2x. Old boolean fastModeRequested only supported on/off.
**Decision**: Changed Player.fastModeRequested: boolean → Player.requestedSpeed: number (1/2/4). Server cycles 1→2→4→1 on TOGGLE_FAST_MODE. Reused existing message type (no new network message needed). SP uses player's speed directly. MP uses Math.min() of all players.
**Alternatives**: Separate messages per speed tier (more message types), slider control (too complex for quick toggle), client-side only speedup (wouldn't affect game logic)
**Consequences**: Clean upgrade path from old boolean. Extensible to more speeds if needed. MP min() means the slowest player sets the pace.

### 2026-03 -- Ghost Traces as TowerTrace[] on GameState
**Context**: Players couldn't remember where destroyed towers were, making rebuilding defense lines tedious.
**Decision**: When a tower is destroyed, push a TowerTrace (position, type, ownerId) to state.destroyedTowerTraces[]. Client renders faded red outlines for own traces. Traces cleared when a tower is placed on that cell.
**Alternatives**: Client-side memory only (lost on reconnect), permanent markers (clutter), minimap highlighting
**Consequences**: Server-authoritative traces survive reconnects. Only own traces shown to avoid information leak in MP. Automatic cleanup on rebuild prevents clutter.

### 2026-03 -- Post-Game Wave Stats via Phase Transition Detection
**Context**: Needed per-wave stats for post-game analysis. Server already tracks some counters per wave.
**Decision**: Track WaveStats (spawned, killed, leaked, towers lost, credits earned/spent, towers bought/upgraded) via private waveStatsHistory on GameRoom. Detect phase transitions by comparing prevPhase with current state.phase in tick(). Init stats on COMBAT start, finalize on COMBAT→BUILD transition. Include array in GAME_OVER broadcast.
**Alternatives**: Client-side stat tracking only (unreliable), separate stat tracking system (over-engineered), instrument every action individually (fragile)
**Consequences**: Known bug: BUILD phase tower purchases happen when currentWaveStats is null, so credits spent shows 0c. Fix needed: keep currentWaveStats alive during BUILD phase.

### 2026-03 -- Economy Ledger as Canvas Tab (not DOM Panel)
**Context**: Needed a live revenue/expense breakdown for players to understand where credits go.
**Decision**: Integrated ledger as a canvas tab ("ECON") within existing ChartsOverlay, cycling CREDITS → HP → ECON. Canvas-rendered to match existing chart aesthetic. Initially built as a separate DOM panel (EconomyLedger.ts), but user feedback was that it felt like a "different style / element" from the canvas charts.
**Alternatives**: DOM overlay panel (built first, deleted), separate HUD section, tooltip on hover
**Consequences**: Consistent visual style with existing charts. Single widget to manage. Canvas hit-testing already in place for tab cycling. Trade-off: canvas text rendering is less flexible than DOM (no copy-paste, no accessibility), but matches game's overall canvas-first approach.

### 2026-03 -- Server-Side WaveEconomy Tracking
**Context**: Need per-wave revenue/expense data for the economy ledger.
**Decision**: Added WaveEconomy interface to GameState with 9 categories (4 revenue, 5 expense). Instrumented all 8 spending handlers in GameRoom plus kill rewards in ProjectileSystem. Economy resets per-wave in initWaveStats(). Phase-transition income (waveBonus, towerIncome, maintenanceCosts) computed in initWaveStats() for waves > 1.
**Alternatives**: Client-side tracking (unreliable, wouldn't survive reconnect), post-hoc calculation from state diffs (complex, lossy)
**Consequences**: Server-authoritative economy data, consistent with project architecture. Small overhead per transaction (one property increment). Data broadcast every tick as part of GameState.

### 2026-03 -- Mode-Driven Configuration Over Code Forks
**Context**: Brainstorming future features (4-player, AI opponents, offense buildings, army units) raised concern about mode branching — would each new mode create parallel codepaths across every system?
**Decision**: New game modes should use configuration-driven differences, not forked system files. Single system pipeline stays, with mode flags and config objects determining behavior (e.g., grid layout, spawn rules, win conditions). GameMode enum + per-mode config objects parameterize existing systems.
**Alternatives**: Separate system files per mode (EnemySystem4P, EnemySystemAI), plugin architecture (over-engineered for current scope)
**Consequences**: Adding a mode means adding a config block, not duplicating systems. Existing systems gain small conditional branches but remain unified. Reduces maintenance burden as core game evolves. Example: 4-player would change grid dimensions + zone count in config, not rewrite BFS or PhaseSystem.

### 2026-03 -- Auto-Sync with GitHub on Save/Resume
**Context**: Jason assumed git was auto-syncing to GitHub, but commits were only local. Michael couldn't see any of the recent work. Claude Cloud was pulling from a stale fork (jlsavard/tower-defense-game) instead of the shared repo (mr-em-us/tower-defense-game).
**Decision**: Updated save protocol to `git push origin main` after every commit. Updated resume protocol to `git fetch origin` + `git pull --rebase origin main` before starting work. Added collaborator identity map to CLAUDE.md (git email → display name) and personalized welcome messages on resume.
**Alternatives**: Manual push/pull (error-prone, forgot for 9 commits), GitHub Actions auto-sync (over-engineered), branch-per-person (unnecessary complexity for 2 collaborators)
**Consequences**: Both collaborators stay in sync automatically through the save/resume workflow. Welcome messages provide context on what the other person changed. Risk: simultaneous work on main could cause rebase conflicts, but unlikely with 2 people and save-based workflow.

### 2026-03 -- AI Opponents as Virtual Client (not separate process)
**Context**: Adding AI opponents for singleplayer. Needed to decide where the AI runs and how it interacts with game systems.
**Decision**: AI runs inside GameRoom as a "virtual client" — AIController produces ClientMessages that go through the same handleMessage() validation pipeline as human WebSocket messages. No separate process, no WebSocket connection. AI player is a normal Player with `isAI: true` on the RIGHT side.
**Alternatives**: Separate AI process over WebSocket (unnecessary complexity), client-side AI (violates server-authoritative design), direct state mutation (bypasses validation)
**Consequences**: AI is subject to all the same rules as humans — same economy, same validation, same pathfinding checks. Zero new network code. AI difficulty comes purely from decision quality (depth dial 0-1), not cheats. Virtual client pattern is lightweight and testable.

### 2026-03 -- AI Maze Strategy: Vertical Walls with Alternating Gaps
**Context**: Initial AI maze used horizontal walls, which didn't create effective serpentine paths. User builds much better mazes.
**Decision**: Switched to vertical wall columns spanning nearly the full grid height, with alternating top/bottom gaps. Each column forces enemies to traverse the full grid height for just a few columns of horizontal progress. Offensive towers placed in horizontal lines for dual coverage (ground kill zones + flying enemy linear coverage).
**Alternatives**: Horizontal walls with alternating left/right gaps (original, less effective), greedy single-cell placement (scattered, no structure), pre-computed maze templates (inflexible)
**Consequences**: Much longer enemy paths. AI maze performance competitive with human maze-building. Vertical walls naturally create corridors where offensive towers can cover both zigzagging ground enemies and straight-line flying enemies.

### 2026-03 -- AI Difficulty as Decision Depth, Not Resource Cheats
**Context**: User strongly requested that AI difficulty be "fair" — same resources, same information, no cheating. Difficulty should come from how well the AI evaluates the same set of concerns.
**Decision**: Single unified decision engine with a depth float (0.25 easy, 0.55 medium, 0.90 hard). Depth controls: number of candidates evaluated, noise added to scores, gap sizes in maze walls, skip chance for wall cells, savings ratio, upgrade ROI threshold. All three difficulties think about the same things (placement scoring, economy planning, maze building) — depth determines how thoroughly.
**Alternatives**: Separate strategy classes per difficulty (code duplication), resource multipliers (cheating), hard-coded behavior differences (brittle)
**Consequences**: Single codebase for all difficulties. Easy AI makes reasonable but imperfect decisions. Hard AI evaluates more candidates with less noise. No information asymmetry — AI sees the same GameState broadcast as clients.

### 2026-03 -- Wave Rebalancing (firstWaveEnemies 60 -> 15)
**Context**: Default difficulty was too hard. Wave 3 had 165 enemies due to formula `(4 + wave*2) * 10 * countScale`. User reported game was unplayable at defaults.
**Decision**: Rewrote wave formula to `baseCount = firstWaveEnemies * (1 + (wave-1) * 0.2) * diffRatio` with percentage-based type distribution. Reduced default firstWaveEnemies from 60 to 15.
**Alternatives**: Just reduce the *10 multiplier (wouldn't fix the scaling shape), adjust difficulty curve (wouldn't fix wave 1)
**Consequences**: Wave 1: 15 enemies (was 60). Wave 3: 23 (was 165). Wave 10: 101. Late waves still get intense. Easy/Hard presets adjusted proportionally (8 and 25).
