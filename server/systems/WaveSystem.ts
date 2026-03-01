import { GameState, GamePhase, GameMode, Enemy, EnemyType, PlayerSide, GameSettings } from '../../shared/types/game.types.js';
import { ENEMY_STATS } from '../../shared/types/constants.js';
import { findPath } from '../../shared/logic/pathfinding.js';
import { v4 as uuid } from 'uuid';

interface WaveEntry {
  type: EnemyType;
  count: number;
  interval: number; // seconds between spawns
}

// Target duration in seconds for the spawn phase of each wave
const WAVE_SPAWN_DURATION = 45;

function getDifficultyMultiplier(waveNumber: number, curve: number[]): number {
  // curve has 20 entries for waves 1-20
  const idx = waveNumber - 1;
  if (idx < 0) return curve[0];
  if (idx < curve.length) return curve[idx];
  // Extrapolate beyond wave 20 using the slope of the last segment
  const lastSlope = curve[curve.length - 1] - curve[curve.length - 2];
  return curve[curve.length - 1] + lastSlope * (idx - curve.length + 1);
}

function getWaveDefinition(waveNumber: number, settings: GameSettings): WaveEntry[] {
  const entries: { type: EnemyType; count: number }[] = [];
  const base = waveNumber;

  // Scale factor from settings.firstWaveEnemies relative to default of 60
  const countScale = settings.firstWaveEnemies / 60;

  // Get difficulty multiplier from curve (interpolate/extrapolate)
  const diffMult = getDifficultyMultiplier(waveNumber, settings.difficultyCurve);

  // Basic enemies every wave - scale by both countScale and diffMult
  entries.push({ type: EnemyType.BASIC, count: Math.round((4 + base * 2) * 10 * countScale * (diffMult / getDifficultyMultiplier(1, settings.difficultyCurve))) });

  // Fast enemies from wave 3
  if (waveNumber >= 3) {
    entries.push({ type: EnemyType.FAST, count: Math.round((2 + base) * 10 * countScale * (diffMult / getDifficultyMultiplier(1, settings.difficultyCurve))) });
  }

  // Tanks from wave 5
  if (waveNumber >= 5) {
    entries.push({ type: EnemyType.TANK, count: Math.round(Math.floor(base / 2) * 10 * countScale * (diffMult / getDifficultyMultiplier(1, settings.difficultyCurve))) });
  }

  // Boss every 10 waves
  if (waveNumber > 0 && waveNumber % 10 === 0) {
    entries.push({ type: EnemyType.BOSS, count: 10 });
  }

  const totalEnemies = entries.reduce((sum, e) => sum + e.count, 0);
  const interval = Math.max(0.05, WAVE_SPAWN_DURATION / totalEnemies);
  return entries.map(e => ({ ...e, interval }));
}

export class WaveSystem {
  private spawnTimer = 0;
  private waveQueue: Array<{ type: EnemyType; side: PlayerSide; delay: number }> = [];
  private waveStarted = false;

  update(state: GameState, dt: number): void {
    if (state.phase !== GamePhase.COMBAT) {
      this.waveStarted = false;
      return;
    }

    if (!this.waveStarted) {
      this.startWave(state);
      this.waveStarted = true;
    }

    // Spawn from queue
    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.waveQueue.length > 0) {
      const entry = this.waveQueue.shift()!;
      if (entry.side === ('BOTH' as PlayerSide)) {
        // Multiplayer: spawn one enemy for each side simultaneously
        this.spawnEnemy(state, entry.type, PlayerSide.LEFT);
        this.spawnEnemy(state, entry.type, PlayerSide.RIGHT);
      } else {
        this.spawnEnemy(state, entry.type, entry.side);
      }
      state.waveEnemiesRemaining = this.waveQueue.length;
      if (this.waveQueue.length > 0) {
        this.spawnTimer += this.waveQueue[0].delay;
        break;
      }
    }
  }

  private startWave(state: GameState): void {
    const definition = getWaveDefinition(state.waveNumber, state.settings);
    this.waveQueue = [];

    // In single player, only spawn enemies toward the player's side
    const singlePlayerSide = state.gameMode === GameMode.SINGLE
      ? Object.values(state.players)[0]?.side ?? PlayerSide.LEFT
      : null;

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

    state.waveEnemiesTotal = this.waveQueue.length;
    state.waveEnemiesRemaining = this.waveQueue.length;
    state.waveEnemiesKilled = 0;
    this.spawnTimer = 0.5; // small initial delay
  }

  private spawnEnemy(state: GameState, type: EnemyType, targetSide: PlayerSide): void {
    const stats = ENEMY_STATS[type];
    const hpScale = getDifficultyMultiplier(state.waveNumber, state.settings.difficultyCurve);
    const hp = Math.round(stats.health * hpScale);

    const path = findPath(state.grid, targetSide);
    if (!path || path.length === 0) return;

    const spawnPoint = path[0];

    const enemy: Enemy = {
      id: uuid(),
      type,
      position: { x: spawnPoint.x, y: spawnPoint.y },
      targetSide,
      health: hp,
      maxHealth: hp,
      speed: stats.speed,
      creditValue: stats.creditValue,
      path,
      pathIndex: 0,
      spawnDelay: 0,
      spawned: true,
    };

    state.enemies[enemy.id] = enemy;
  }
}
