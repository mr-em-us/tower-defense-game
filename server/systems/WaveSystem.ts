import { GameState, GamePhase, GameMode, Enemy, EnemyType, PlayerSide, GameSettings, GridCell } from '../../shared/types/game.types.js';
import { ENEMY_STATS, GOAL_ROWS, CENTER_SPAWN, GRID } from '../../shared/types/constants.js';
import { findPath } from '../../shared/logic/pathfinding.js';
import { v4 as uuid } from 'uuid';

interface WaveEntry {
  type: EnemyType;
  count: number;
  interval: number; // seconds between spawns
}

// Target duration in seconds for the spawn phase of each wave
const WAVE_SPAWN_DURATION = 8;

function getDifficultyMultiplier(waveNumber: number, curve: number[]): number {
  const idx = waveNumber - 1;
  if (idx < 0) return curve[0];
  if (idx < curve.length) return curve[idx];
  // Extrapolate beyond curve with exponential growth (15% per wave)
  const beyondIdx = idx - curve.length + 1;
  return curve[curve.length - 1] * Math.pow(1.15, beyondIdx);
}

function getWaveDefinition(waveNumber: number, settings: GameSettings, hasAir: boolean = false): WaveEntry[] {
  const entries: { type: EnemyType; count: number }[] = [];

  // Difficulty ratio: how much harder this wave is relative to wave 1
  const diffRatio = getDifficultyMultiplier(waveNumber, settings.difficultyCurve)
                  / getDifficultyMultiplier(1, settings.difficultyCurve);

  // Total enemy count grows linearly per wave, scaled by firstWaveEnemies and difficulty curve.
  // Wave 1 ≈ firstWaveEnemies, then grows ~20% per wave plus difficulty curve acceleration.
  const baseCount = settings.firstWaveEnemies * (1 + (waveNumber - 1) * 0.2) * diffRatio;

  // Distribute among enemy types based on wave progression
  let basicPct = 1.0;
  if (waveNumber >= 3) basicPct -= 0.30; // fast takes 30%
  if (hasAir) basicPct -= 0.15;          // flying takes 15% (on air waves only)
  if (waveNumber >= 5) basicPct -= 0.15; // tanks take 15%

  entries.push({ type: EnemyType.BASIC, count: Math.max(1, Math.round(baseCount * basicPct)) });

  // Fast enemies from wave 3 (30% of total)
  if (waveNumber >= 3) {
    entries.push({ type: EnemyType.FAST, count: Math.max(1, Math.round(baseCount * 0.30)) });
  }

  // Tanks from wave 5 (15% of total)
  if (waveNumber >= 5) {
    entries.push({ type: EnemyType.TANK, count: Math.max(1, Math.round(baseCount * 0.15)) });
  }

  // Flying enemies only on scheduled air waves (15% of total)
  if (hasAir) {
    entries.push({ type: EnemyType.FLYING, count: Math.max(2, Math.round(baseCount * 0.15)) });
  }

  // Boss every 10 waves
  if (waveNumber > 0 && waveNumber % 10 === 0) {
    entries.push({ type: EnemyType.BOSS, count: Math.max(1, Math.ceil(waveNumber / 10)) });
  }

  const totalEnemies = entries.reduce((sum, e) => sum + e.count, 0);
  const interval = Math.max(0.05, WAVE_SPAWN_DURATION / totalEnemies);
  return entries.map(e => ({ ...e, interval }));
}

export class WaveSystem {
  private spawnTimer = 0;
  private waveQueue: Array<{ type: EnemyType; side: PlayerSide; delay: number }> = [];
  private waveStarted = false;
  // Path cache — avoids recomputing BFS for every enemy spawn.
  // Invalidated when state.gridVersion changes (tower placed or destroyed).
  private pathCache: Partial<Record<PlayerSide, GridCell[] | null>> = {};
  private pathCacheVersion = -1;

  update(state: GameState, dt: number): void {
    if (state.phase !== GamePhase.COMBAT) {
      this.waveStarted = false;
      return;
    }

    if (!this.waveStarted) {
      this.startWave(state);
      this.waveStarted = true;
    }

    // Spawn from queue one batch at a time per tick.
    // At high game speeds, dt can exceed spawn interval — but we only spawn
    // one batch per tick to keep enemy spacing consistent regardless of speed.
    // This prevents splash/AoE from being artificially stronger at high speed.
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.waveQueue.length > 0) {
      const batchSize = Math.min(5, 1 + Math.floor((state.waveNumber - 1) / 2));
      for (let b = 0; b < batchSize && this.waveQueue.length > 0; b++) {
        const entry = this.waveQueue.shift()!;
        if (entry.side === ('BOTH' as PlayerSide)) {
          this.spawnEnemy(state, entry.type, PlayerSide.LEFT);
          this.spawnEnemy(state, entry.type, PlayerSide.RIGHT);
        } else {
          this.spawnEnemy(state, entry.type, entry.side);
        }
      }
      state.waveEnemiesRemaining = this.waveQueue.reduce((sum, e) => sum + (e.side === ('BOTH' as PlayerSide) ? 2 : 1), 0);
      if (this.waveQueue.length > 0) {
        this.spawnTimer = this.waveQueue[0].delay; // reset to full interval, don't carry deficit
      }
    }
  }

  private startWave(state: GameState): void {
    const hasAir = state.airWaveCountdown === 0;
    const definition = getWaveDefinition(state.waveNumber, state.settings, hasAir);
    this.waveQueue = [];

    // In single player without AI, only spawn enemies toward the player's side.
    // With AI opponent (2 players), spawn for both sides like multiplayer.
    // In observer mode, only spawn toward the AI's side.
    const playerCount = Object.keys(state.players).length;
    let singlePlayerSide: PlayerSide | null = null;
    if (state.gameMode === GameMode.SINGLE && playerCount === 1) {
      singlePlayerSide = Object.values(state.players)[0]?.side ?? PlayerSide.LEFT;
    } else if (state.gameMode === GameMode.OBSERVER) {
      // Only target the AI player's side
      const aiPlayer = Object.values(state.players).find(p => p.isAI);
      singlePlayerSide = aiPlayer?.side ?? PlayerSide.RIGHT;
    }

    for (const entry of definition) {
      for (let i = 0; i < entry.count; i++) {
        if (singlePlayerSide) {
          this.waveQueue.push({ type: entry.type, side: singlePlayerSide, delay: entry.interval });
        } else {
          // In multiplayer, use BOTH to signal spawning for both sides simultaneously
          this.waveQueue.push({ type: entry.type, side: 'BOTH' as PlayerSide, delay: entry.interval });
        }
      }
    }

    // Shuffle spawn order for variety
    for (let i = this.waveQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.waveQueue[i], this.waveQueue[j]] = [this.waveQueue[j], this.waveQueue[i]];
    }

    // Count actual enemies (BOTH entries spawn 2)
    const actualTotal = this.waveQueue.reduce((sum, e) => sum + (e.side === ('BOTH' as PlayerSide) ? 2 : 1), 0);
    state.waveEnemiesTotal = actualTotal;
    state.waveEnemiesRemaining = actualTotal;
    state.waveEnemiesKilled = 0;
    state.waveLeakedByType = {};
    this.spawnTimer = 0.5; // small initial delay
  }

  private spawnEnemy(state: GameState, type: EnemyType, targetSide: PlayerSide): void {
    const stats = ENEMY_STATS[type];
    const hpScale = getDifficultyMultiplier(state.waveNumber, state.settings.difficultyCurve);
    const overrides = state.settings.enemyOverrides?.[type];
    const hp = Math.round(stats.health * hpScale * (overrides?.health ?? 1));
    const speed = stats.speed * (overrides?.speed ?? 1);
    // Kill reward scales with sqrt of difficulty — income grows slower than enemy HP
    const creditValue = Math.round(stats.creditValue * Math.sqrt(hpScale) * (overrides?.creditValue ?? 1));
    // Leak damage stays flat — a leaked enemy always costs the same HP regardless of wave
    const leakDamage = Math.round(stats.creditValue * (overrides?.creditValue ?? 1));
    const contactDamage = stats.contactDamage * (overrides?.contactDamage ?? 1);

    // Flying enemies go straight from spawn to goal (no BFS pathfinding)
    let path: GridCell[] | null | undefined;
    if (type === EnemyType.FLYING) {
      const goalRow = GOAL_ROWS[Math.floor(Math.random() * GOAL_ROWS.length)];
      const goalX = targetSide === PlayerSide.LEFT ? 0 : GRID.WIDTH - 1;
      const spawnY = CENTER_SPAWN.Y_ROWS[0];
      const spawnX = targetSide === PlayerSide.LEFT
        ? CENTER_SPAWN.X_MIN
        : CENTER_SPAWN.X_MAX;
      path = [
        { x: spawnX, y: spawnY },
        { x: goalX, y: goalRow },
      ];
    } else {
      // Cache BFS per (gridVersion, side). Invalidate whole cache on any grid change.
      if (state.gridVersion !== this.pathCacheVersion) {
        this.pathCache = {};
        this.pathCacheVersion = state.gridVersion;
      }
      let cached = this.pathCache[targetSide];
      if (cached === undefined) {
        cached = findPath(state.grid, targetSide);
        this.pathCache[targetSide] = cached;
      }
      // Path waypoints are read-only; pathIndex lives on Enemy, so sharing is safe.
      path = cached;
    }
    if (!path || path.length === 0) return;

    const spawnPoint = path[0];

    const enemy: Enemy = {
      id: uuid(),
      type,
      position: { x: spawnPoint.x, y: spawnPoint.y },
      targetSide,
      health: hp,
      maxHealth: hp,
      speed,
      creditValue,
      leakDamage,
      path,
      pathIndex: 0,
      spawnDelay: 0,
      spawned: true,
    };

    state.enemies[enemy.id] = enemy;
  }
}
