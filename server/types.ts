// GameBuddies Template - Server Types
// Add your game-specific types here

export type GameState =
  | 'LOBBY_WAITING'  // Waiting in lobby for players
  | 'PLAYING'        // Game in progress
  | 'GAME_ENDED';    // Game finished

export interface Player {
  socketId: string;
  gameBuddiesUuid?: string; // GameBuddies UUID
  name: string;
  score: number;
  connected: boolean;
  isHost: boolean;
  disconnectedAt?: number;
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
// BUMPER BALLS ARENA - Server Game Types
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
  acceleration: Vector3D; // Server-only
  isEliminated: boolean;
  eliminatedAt?: number;
  stamina: number;
  isSprinting: boolean;
  eliminations: number;
  survivalTime: number;
  lastInput?: MovementInput; // Server-only
  lastUpdateTime?: number; // Server-only
}

export interface MovementInput {
  x: number;
  z: number;
  sprint: boolean;
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
  lastTickTime: number; // Server-only
  nextShrinkTime?: number; // Server-only
  endTime?: number; // Server-only
}

// For compatibility with template structure
export interface GameData extends BumperBallsGameData {}

export interface Lobby {
  id: string;
  code: string;
  hostId: string; // socketId
  settings: Settings;
  players: Player[];
  state: GameState;
  gameData: GameData | null; // Your custom game state
  isGameBuddiesRoom: boolean;
  gameBuddiesRoomCode?: string;
  messages: ChatMessage[]; // Chat message history (last 100 messages)
}

export interface GameBuddiesSession {
  roomCode: string;
  playerName?: string;
  playerId?: string; // GameBuddies UUID
  isHost: boolean;
  expectedPlayers?: number;
  returnUrl: string;
  sessionToken?: string;
  source: 'gamebuddies';
}
