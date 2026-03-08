import { GameState, GridCell, TowerType, PlayerSide, GamePhase, GameMode, GameSettings, WaveStats } from './game.types.js';

// Client -> Server messages
export type ClientMessage =
  | { type: 'JOIN_GAME'; playerName: string; gameMode: GameMode; settings?: GameSettings }
  | { type: 'PLACE_TOWER'; position: GridCell; towerType: TowerType }
  | { type: 'UPGRADE_TOWER'; towerId: string }
  | { type: 'SELL_TOWER'; towerId: string }
  | { type: 'REPAIR_TOWER'; towerId: string }
  | { type: 'RESTOCK_TOWER'; towerId: string }
  | { type: 'RESTOCK_ALL' }
  | { type: 'BRUSH_REPAIR'; center: GridCell; radius: number }
  | { type: 'BRUSH_UPGRADE'; center: GridCell; radius: number }
  | { type: 'BRUSH_SELL'; center: GridCell; radius: number }
  | { type: 'READY_FOR_WAVE' }
  | { type: 'SET_STARTING_CREDITS'; credits: number }
  | { type: 'SET_GAME_SETTINGS'; settings: GameSettings }
  | { type: 'TOGGLE_AUTO_REPAIR' }
  | { type: 'TOGGLE_AUTO_REBUILD' }
  | { type: 'TOGGLE_FAST_MODE' }
  | { type: 'LOAD_SAVE'; saveId: string };

// Server -> Client messages
export type ServerMessage =
  | { type: 'GAME_JOINED'; playerId: string; playerSide: PlayerSide; roomId: string }
  | { type: 'GAME_STATE'; state: GameState }
  | { type: 'PHASE_CHANGED'; newPhase: GamePhase; waveNumber: number }
  | { type: 'TOWER_PLACED'; towerId: string }
  | { type: 'ACTION_FAILED'; reason: string }
  | { type: 'PLAYER_DISCONNECTED'; playerId: string }
  | { type: 'GAME_OVER'; winnerId: string | null; finalWave: number; waveStats: WaveStats[] };
