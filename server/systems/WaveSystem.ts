import { GameState, GamePhase, GameMode, Enemy, EnemyType, PlayerSide } from '../../shared/types/game.types.js';
import { ENEMY_STATS } from '../../shared/types/constants.js';
import { findPath } from '../../shared/logic/pathfinding.js';
import { v4 as uuid } from 'uuid';

interface WaveEntry {
  type: EnemyType;
  count: number;
  interval: number; // seconds between spawns
}

function getWaveDefinition(waveNumber: number): WaveEntry[] {
  const entries: WaveEntry[] = [];
  const base = waveNumber;

  // Basic enemies every wave (10x count, tighter spawn intervals)
  entries.push({ type: EnemyType.BASIC, count: (4 + base * 2) * 10, interval: 0.08 });

  // Fast enemies from wave 3
  if (waveNumber >= 3) {
    entries.push({ type: EnemyType.FAST, count: (2 + base) * 10, interval: 0.06 });
  }

  // Tanks from wave 5
  if (waveNumber >= 5) {
    entries.push({ type: EnemyType.TANK, count: Math.floor(base / 2) * 10, interval: 0.2 });
  }

  // Boss every 10 waves
  if (waveNumber > 0 && waveNumber % 10 === 0) {
    entries.push({ type: EnemyType.BOSS, count: 10, interval: 0.5 });
  }

  return entries;
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
      this.spawnEnemy(state, entry.type, entry.side);
      state.waveEnemiesRemaining = this.waveQueue.length;
      if (this.waveQueue.length > 0) {
        this.spawnTimer += this.waveQueue[0].delay;
        break;
      }
    }
  }

  private startWave(state: GameState): void {
    const definition = getWaveDefinition(state.waveNumber);
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
          this.waveQueue.push({ type: entry.type, side: PlayerSide.LEFT, delay: entry.interval });
          this.waveQueue.push({ type: entry.type, side: PlayerSide.RIGHT, delay: entry.interval });
        }
      }
    }

    // Shuffle so enemies aren't perfectly alternating
    for (let i = this.waveQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.waveQueue[i], this.waveQueue[j]] = [this.waveQueue[j], this.waveQueue[i]];
    }

    state.waveEnemiesRemaining = this.waveQueue.length;
    this.spawnTimer = 0.5; // small initial delay
  }

  private spawnEnemy(state: GameState, type: EnemyType, targetSide: PlayerSide): void {
    const stats = ENEMY_STATS[type];
    const hpScale = 1 + (state.waveNumber - 1) * 0.2;
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
