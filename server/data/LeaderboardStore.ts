import fs from 'fs';
import path from 'path';
import { GameMode } from '../../shared/types/game.types.js';
import { GameResultRecord, LeaderboardEntry, LeaderboardData } from '../../shared/types/leaderboard.types.js';
import { getDifficultyLabel } from '../../shared/utils/difficulty.js';

const DATA_DIR = path.resolve('data');
const DATA_FILE = path.join(DATA_DIR, 'leaderboard.json');

export class LeaderboardStore {
  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      const initial: LeaderboardData = { version: 1, results: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    }
  }

  private readData(): LeaderboardData {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw) as LeaderboardData;
  }

  private writeData(data: LeaderboardData): void {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  }

  addResult(record: GameResultRecord): void {
    const data = this.readData();
    data.results.push(record);
    this.writeData(data);
  }

  getLeaderboard(gameMode: GameMode): LeaderboardEntry[] {
    const data = this.readData();
    const filtered = data.results.filter(r => r.gameMode === gameMode);

    // Group by playerName, pick best adjustedScore per player
    const bestByPlayer = new Map<string, GameResultRecord>();
    for (const r of filtered) {
      const existing = bestByPlayer.get(r.playerName);
      if (!existing || r.adjustedScore > existing.adjustedScore) {
        bestByPlayer.set(r.playerName, r);
      }
    }

    // Sort by adjustedScore descending
    const sorted = Array.from(bestByPlayer.values()).sort(
      (a, b) => b.adjustedScore - a.adjustedScore
    );

    // Map to LeaderboardEntry with rank
    return sorted.map((r, i) => ({
      rank: i + 1,
      playerName: r.playerName,
      bestWave: r.waveReached,
      difficultyLabel: getDifficultyLabel(r.settings),
      difficultyFactor: r.difficultyFactor,
      adjustedScore: r.adjustedScore,
      gameMode: r.gameMode,
      timestamp: r.timestamp,
      settings: r.settings,
      aiDefeatedCount: r.aiDefeatedCount,
    }));
  }

  getHistory(gameMode: GameMode, limit: number): GameResultRecord[] {
    const data = this.readData();
    const filtered = data.results.filter(r => r.gameMode === gameMode);
    // Most recent first
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    return filtered.slice(0, limit);
  }
}
