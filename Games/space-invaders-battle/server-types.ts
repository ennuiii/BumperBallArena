/**
 * Space Invaders Battle - Server Types
 * Add these to server/types.ts
 */

// Same types as client for consistency
export type PowerUpType = 'rapidFire' | 'multiShot' | 'scoreMultiplier' | 'shield';
export type AlienType = 'small' | 'medium' | 'large' | 'ufo';

export interface PowerUp {
  id: string;
  x: number;
  y: number;
  type: PowerUpType;
  velocityY: number;
}

export interface PlayerShip {
  socketId: string;
  name: string;
  x: number;
  y: number;
  color: string;
  lives: number;
  powerUps: {
    rapidFire: number;
    multiShot: number;
    scoreMultiplier: number;
    shield: number;
  };
  lastShotTime: number;
  velocityX: number; // Server tracks velocity for movement
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  velocityY: number;
  ownerId: string;
}

export interface Alien {
  id: string;
  x: number;
  y: number;
  type: AlienType;
  health: number;
  row: number;
  col: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface GameData {
  currentWave: number;
  maxWaves: number;
  playerShips: PlayerShip[];
  aliens: Alien[];
  bullets: Bullet[];
  powerUps: PowerUp[];
  particles: Particle[];
  alienDirection: 1 | -1;
  alienSpeed: number;
  alienMoveDown: boolean;
  waveStartTime: number;
  gameStartTime: number;
  gameMode: 'waves' | 'timed';
  gameDuration?: number;
  difficulty: 'easy' | 'medium' | 'hard';
  gameOver: boolean;
  winner?: string;
}

// Extend Settings interface
export interface Settings {
  minPlayers: number;
  maxPlayers: number;
  gameMode: 'waves' | 'timed';
  maxWaves: number;
  gameDuration: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

// Extend Lobby interface to include gameData
export interface Lobby {
  code: string;
  hostSocketId: string;
  players: Player[];
  settings: Settings;
  state: 'WAITING' | 'LOBBY' | 'PLAYING' | 'FINISHED';
  gameData?: GameData;
  scores: { [socketId: string]: number };
  createdAt: number;
  isGameBuddiesRoom: boolean;
  gameBuddiesSessionId?: string;
}

export interface Player {
  socketId: string;
  name: string;
  isHost: boolean;
  score: number;
  connected: boolean;
  joinedAt: number;
  disconnectedAt?: number;
}
