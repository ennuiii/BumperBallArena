/**
 * Space Invaders Battle - Client Types
 * Add these to client/src/types.ts
 */

// Game constants
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const PLAYER_SHIP_WIDTH = 40;
export const PLAYER_SHIP_HEIGHT = 30;
export const ALIEN_WIDTH = 30;
export const ALIEN_HEIGHT = 30;
export const BULLET_WIDTH = 4;
export const BULLET_HEIGHT = 15;
export const POWERUP_SIZE = 25;

// Power-up types
export type PowerUpType = 'rapidFire' | 'multiShot' | 'scoreMultiplier' | 'shield';

// Power-up interface
export interface PowerUp {
  id: string;
  x: number;
  y: number;
  type: PowerUpType;
  velocityY: number;
}

// Player ship interface
export interface PlayerShip {
  socketId: string;
  name: string;
  x: number;
  y: number;
  color: string;
  lives: number;
  powerUps: {
    rapidFire: number; // timestamp when it expires, 0 if inactive
    multiShot: number;
    scoreMultiplier: number;
    shield: number;
  };
  lastShotTime: number;
}

// Bullet interface
export interface Bullet {
  id: string;
  x: number;
  y: number;
  velocityY: number;
  ownerId: string; // socketId of player who fired it
}

// Alien types
export type AlienType = 'small' | 'medium' | 'large' | 'ufo';

// Alien interface
export interface Alien {
  id: string;
  x: number;
  y: number;
  type: AlienType;
  health: number;
  row: number;
  col: number;
}

// Particle effect (for explosions)
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

// Main game data interface
export interface GameData {
  // Current wave
  currentWave: number;
  maxWaves: number;

  // Game entities
  playerShips: PlayerShip[];
  aliens: Alien[];
  bullets: Bullet[];
  powerUps: PowerUp[];
  particles: Particle[];

  // Alien movement
  alienDirection: 1 | -1; // 1 = right, -1 = left
  alienSpeed: number;
  alienMoveDown: boolean;

  // Game state
  waveStartTime: number;
  gameStartTime: number;
  gameMode: 'waves' | 'timed';
  gameDuration?: number; // seconds (for timed mode)
  difficulty: 'easy' | 'medium' | 'hard';

  // Victory/defeat
  gameOver: boolean;
  winner?: string; // socketId of winner
}

// Client-only interfaces for rendering
export interface GameAssets {
  sprites: {
    playerShip: HTMLImageElement;
    aliens: { [key in AlienType]: HTMLImageElement };
    powerUps: { [key in PowerUpType]: HTMLImageElement };
  };
  loaded: boolean;
}

// Game input state (client-side)
export interface InputState {
  left: boolean;
  right: boolean;
  shoot: boolean;
}

// Socket events (client → server)
export interface ClientToServerEvents {
  'game:player-move': (data: { roomCode: string; direction: 'left' | 'right' | 'stop' }) => void;
  'game:player-shoot': (data: { roomCode: string }) => void;
}

// Socket events (server → client)
export interface ServerToClientEvents {
  'game:state-update': (data: { gameData: GameData; scores: { [socketId: string]: number } }) => void;
  'game:wave-complete': (data: { wave: number; nextWaveIn: number }) => void;
  'game:player-hit': (data: { socketId: string; livesRemaining: number }) => void;
  'game:power-up-collected': (data: { socketId: string; type: PowerUpType }) => void;
  'game:game-over': (data: { winner: string; finalScores: { socketId: string; name: string; score: number }[] }) => void;
}

// Update the Settings interface to include Space Invaders settings
export interface Settings {
  minPlayers: number;
  maxPlayers: number;

  // Space Invaders specific
  gameMode: 'waves' | 'timed';
  maxWaves: number;
  gameDuration: number; // seconds (for timed mode)
  difficulty: 'easy' | 'medium' | 'hard';
}
