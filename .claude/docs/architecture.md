# Architecture Deep Dive

## Data Flow

```
Client Action (click/key)
  -> InputHandler converts to grid coords
  -> GameClient.placeTower() / upgradeTower() / etc.
  -> NetworkClient.send({ type: 'PLACE_TOWER', ... })
  -> WebSocket
  -> server/index.ts routes to GameRoom.handleMessage()
  -> GameRoom validates + applies to GameState
  -> tick() runs system pipeline:
       PhaseSystem -> WaveSystem -> EnemySystem -> TowerSystem -> ProjectileSystem
  -> broadcast({ type: 'GAME_STATE', state })
  -> WebSocket
  -> NetworkClient.onMessage callback
  -> GameClient.handleGameState() stores state
  -> requestAnimationFrame loop:
       GameClient.update(dt) -> Renderer.render(dt) -> HUD.update()
```

## Server System Pipeline (executed every tick at 20 Hz)

### 1. PhaseSystem (server/systems/PhaseSystem.ts, 79 lines)
- Manages BUILD <-> COMBAT transitions
- BUILD phase: countdown timer (30s), player ready checks, early start if all ready
- COMBAT -> BUILD transition: awards wave income (CREDITS_PER_WAVE=50), deducts tower maintenance, restocks ammo, increments wave number
- Detects GAME_OVER when any player HP <= 0

### 2. WaveSystem (server/systems/WaveSystem.ts, 156 lines)
- Spawns enemies during COMBAT phase
- Wave formula: `baseCount = firstWaveEnemies * (1 + (wave-1) * 0.2) * diffRatio`
- Type distribution: 100% Basic (waves 1-2), 70/30 Basic/Fast (waves 3-4), 55/30/15 Basic/Fast/Tank (wave 5+)
- Boss every 10 waves (count = ceil(wave/10))
- Enemy HP scaled by difficulty curve multiplier
- Spawn queue shuffled for variety, enemies spawn one at a time over 45 seconds

### 3. EnemySystem (server/systems/EnemySystem.ts, 90 lines)
- Moves enemies along BFS paths toward player edges
- Applies contact damage to adjacent towers (1-cell radius)
- When enemy reaches goal: deducts player HP by contactDamage, removes enemy
- Awards no credits for goal-reached enemies

### 4. TowerSystem (server/systems/TowerSystem.ts, 82 lines)
- Targets closest enemy in range (zone-aware: only targets enemies heading toward tower's side)
- Rate-limited firing based on fireRate
- Ammo consumption: deducts 1 ammo + ammoCostPerRound credits per shot
- Creates Projectile entities with splash/slow properties from tower stats

### 5. ProjectileSystem (server/systems/ProjectileSystem.ts, 80 lines)
- Moves projectiles toward target at PROJECTILE_SPEED (12 cells/sec)
- Hit detection at 0.3 unit distance
- Splash damage: 50% of main damage to enemies within splashRadius
- Slow effect: reduces enemy speed by slowAmount for slowDuration seconds
- Kill credit: awards enemy.creditValue to tower owner

## Client Architecture

### Bootstrap (client/main.ts)
1. UsernamePanel.show() -> player enters/selects name (localStorage: td_usernames)
2. showModeMenu() -> player picks Single/Multi, optionally adjusts Settings
3. NetworkClient connects to ws://localhost:9090
4. GameClient.joinGame() sends JOIN_GAME with mode, name, settings
5. requestAnimationFrame loop starts: update -> render -> HUD

### GameClient (client/game/GameClient.ts, 346 lines)
- Stores latest GameState from server
- ClientState: selectedTowerId, selectedTowerIds (multi), hoverCell, buildingType, brushMode, zoom, pan, chartsVisible
- Sound event detection via state diffing (new projectiles, enemy deaths, phase changes)
- Shell casing particle effects (visual only)
- StatsTracker + ChartsOverlay integration

### InputHandler (client/game/InputHandler.ts, 267 lines)
- Mouse: click to place/select, Shift-click multi-select, wheel zoom, right-click deselect
- Touch: tap to place/select, pinch zoom, drag pan
- Arrow keys for panning
- Brush tool mode: click+drag repairs towers in radius
- Coordinate transform: screen -> canvas -> world (accounting for CSS scale, zoom, pan)

### Renderer (client/rendering/Renderer.ts, 629 lines)
- Two coordinate spaces: world (zoomed/panned) and screen (fixed HUD)
- Grid rendering with zone borders and path preview (dimmed BFS paths)
- Tower rendering: ASCII chars + health bars + level + ammo count + selection highlight
- Enemy rendering: animated ASCII chars + health bars
- Projectile rendering: small dots
- HUD overlays: ammo bar, wave progress, selected tower info, error messages

### HUD (client/ui/HUD.ts, 485 lines)
- Tower bar: buttons for each tower type with dynamic pricing
- Action buttons: upgrade, sell, repair, restock, restock-all
- Ready button (BUILD phase only)
- Stats button (opens ChartsOverlay)
- Game over / victory screens
- Lobby UI with starting credits adjustment

### UI Panels
- SettingsPanel (client/ui/SettingsPanel.ts): Tabs (General/Towers/Enemies), difficulty curve canvas editor, live difficulty factor display, preset buttons, named preset save/load
- UsernamePanel (client/ui/UsernamePanel.ts): Name input with datalist of previous names from localStorage
- LeaderboardPanel (client/ui/LeaderboardPanel.ts): SP/MP tabs, per-player best scores ranked by adjustedScore, Challenge button to review settings

## Network Protocol (shared/types/network.types.ts)

### Client -> Server
- JOIN_GAME: { gameMode, playerName, settings }
- PLACE_TOWER: { position, towerType }
- UPGRADE_TOWER: { towerId }
- SELL_TOWER: { towerId }
- REPAIR_TOWER: { towerId }
- RESTOCK_TOWER: { towerId }
- RESTOCK_ALL: {}
- BRUSH_REPAIR: { center, radius }
- READY_FOR_WAVE: {}
- SET_STARTING_CREDITS: { credits }
- SET_GAME_SETTINGS: { settings }

### Server -> Client
- GAME_JOINED: { playerId, playerSide, roomId }
- GAME_STATE: { state } (full GameState, every tick)
- TOWER_PLACED: { towerId }
- ACTION_FAILED: { reason }
- PLAYER_DISCONNECTED: { playerId }
- GAME_OVER: { winnerId, finalWave }

## State Shape (shared/types/game.types.ts)

```typescript
GameState {
  roomId, gameMode, phase, waveNumber, phaseTimeRemaining,
  startingCredits, globalPurchaseCounts,
  players: Record<id, Player>,     // id, name, side, credits, health, maxHealth, isReady
  towers: Record<id, Tower>,       // id, type, position, ownerId, level, damage, range, fireRate, health, ammo
  enemies: Record<id, Enemy>,      // id, type, position, targetSide, health, speed, creditValue, path, pathIndex
  projectiles: Record<id, Projectile>, // id, position, targetId, damage, speed, isSplash, isSlowing
  grid: GridState,                 // width, height, cells (CellType[][])
  waveEnemiesRemaining, waveEnemiesTotal, waveEnemiesKilled,
  settings: GameSettings           // startingHealth, startingCredits, firstWaveEnemies, difficultyCurve, towerOverrides, enemyOverrides
}
```

## Leaderboard Pipeline
1. GameRoom.handleGameOver() creates GameResultRecord per player (id, timestamp, name, mode, wave, HP, settings snapshot, difficultyFactor, adjustedScore)
2. room.onGameOver callback (wired in server/index.ts) calls LeaderboardStore.addResult()
3. LeaderboardStore appends to data/leaderboard.json (sync file I/O)
4. HTTP API: GET /api/leaderboard?mode= returns per-player best (sorted by adjustedScore desc)
5. HTTP API: GET /api/leaderboard/history?mode=&limit= returns recent games
6. LeaderboardPanel fetches via fetch(), renders table with Challenge button
