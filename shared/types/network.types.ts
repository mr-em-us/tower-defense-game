import { GameState, GridCell, TowerType, PlayerSide, GamePhase, GameMode } from './game.types.js';

// Client -> Server messages
export type ClientMessage =
  | { type: 'JOIN_GAME'; playerName: string; gameMode: GameMode }
  | { type: 'PLACE_TOWER'; position: GridCell; towerType: TowerType }
  | { type: 'UPGRADE_TOWER'; towerId: string }
  | { type: 'SELL_TOWER'; towerId: string }
  | { type: 'READY_FOR_WAVE' }
  | { type: 'SET_STARTING_CREDITS'; credits: number };

// Server -> Client messages
export type ServerMessage =
  | { type: 'GAME_JOINED'; playerId: string; playerSide: PlayerSide; roomId: string }
  | { type: 'GAME_STATE'; state: GameState }
  | { type: 'PHASE_CHANGED'; newPhase: GamePhase; waveNumber: number }
  | { type: 'TOWER_PLACED'; towerId: string }
  | { type: 'ACTION_FAILED'; reason: string }
  | { type: 'PLAYER_DISCONNECTED'; playerId: string }
  | { type: 'GAME_OVER'; winnerId: string | null; finalWave: number };
