import { GameState, GameMode } from './game.types.js';

export interface SaveMetadata {
  id: string;
  playerName: string;
  displayName: string;
  timestamp: number;
  waveReached: number;
  playerHealth: number;
  credits: number;
  gameMode: GameMode;
}

export interface GameSaveFile {
  metadata: SaveMetadata;
  gameState: GameState;
}
