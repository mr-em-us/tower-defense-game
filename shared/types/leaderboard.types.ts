import { GameSettings, GameMode } from './game.types.js';

export interface GameResultRecord {
  id: string;
  timestamp: number;
  playerName: string;
  gameMode: GameMode;
  waveReached: number;
  playerHealth: number;
  settings: GameSettings;
  difficultyFactor: number;
  adjustedScore: number;
}

export interface LeaderboardEntry {
  rank: number;
  playerName: string;
  bestWave: number;
  difficultyLabel: string;
  difficultyFactor: number;
  adjustedScore: number;
  gameMode: GameMode;
  timestamp: number;
  settings: GameSettings;
}

export interface LeaderboardData {
  version: 1;
  results: GameResultRecord[];
}
