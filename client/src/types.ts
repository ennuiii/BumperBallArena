// GameBuddies Template - Client Types
// Add your game-specific types here

export type GameState =
  | 'LOBBY_WAITING'  // Waiting in lobby for players
  | 'PLAYING'        // Game in progress
  | 'GAME_ENDED';    // Game finished

export interface Player {
  socketId: string;
  name: string;
  score: number;
  connected: boolean;
  isHost: boolean;
}

export interface Settings {
  minPlayers: number;
  maxPlayers: number;
  // Add your game-specific settings here
  // Example:
  // roundDuration: number;
  // difficulty: 'easy' | 'medium' | 'hard';
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

// ============================================================================
// BUMPER BALLS ARENA - Game Types
// ============================================================================

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface PlayerBall {
  socketId: string;
  name: string;
  color: string;
  position: Vector3D;
  velocity: Vector3D;
  rotation: Vector3D;
  isEliminated: boolean;
  eliminatedAt?: number;
  stamina: number;
  isSprinting: boolean;
  eliminations: number;
  survivalTime: number;
}

export interface BumperBallsGameData {
  status: 'countdown' | 'playing' | 'ended';
  countdownValue?: number;
  startTime: number;
  gameMode: 'classic' | 'shrinking' | 'timed';
  players: PlayerBall[];
  alivePlayers: string[];
  eliminationOrder: string[];
  winnerId?: string;
}

export interface MovementInput {
  x: number;
  z: number;
  sprint: boolean;
}

// For compatibility with template structure
export interface GameData extends BumperBallsGameData {}

export interface Lobby {
  code: string;
  hostId: string;
  settings: Settings;
  players: Player[];
  state: GameState;
  gameData: GameData | null; // Your custom game state
  isGameBuddiesRoom: boolean;
  mySocketId: string;
  messages?: ChatMessage[];
}
