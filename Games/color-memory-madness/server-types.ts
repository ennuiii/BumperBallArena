/**
 * Color Memory Madness - Server Types
 * Add these to server/types.ts
 */

export type ColorType = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';
export type GamePhase = 'waiting' | 'watching' | 'memorizing' | 'replaying' | 'scoring' | 'roundEnd' | 'gameOver';
export type GameMode = 'classic' | 'speedRun' | 'survival' | 'battle';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';
export type PowerUpType = 'slowMo' | 'pause' | 'hint' | 'speedBoost' | 'shield' | 'scramble';

export interface ColorButton {
  color: ColorType;
  hex: string;
  tone: number;
  symbol: string;
  position: number;
}

export interface PlayerProgress {
  socketId: string;
  playerName: string;
  currentSequence: ColorType[];
  isCorrect: boolean;
  isComplete: boolean;
  completionTime?: number;
  mistakes: number;
  isEliminated: boolean;
  activePowerUps: PowerUpType[];
  streak: number; // Consecutive perfect rounds
}

export interface PowerUp {
  id: string;
  type: PowerUpType;
  expiresAt: number;
  targetSocketId?: string;
}

export interface RoundData {
  roundNumber: number;
  sequence: ColorType[];
  sequenceLength: number;
  displayTime: number;
  replayTimeLimit: number;
  startTime: number;
  currentDisplayIndex: number;
}

export interface GameData {
  phase: GamePhase;
  gameMode: GameMode;
  difficulty: Difficulty;
  currentRound: RoundData;
  playerProgress: {
    [socketId: string]: PlayerProgress;
  };
  scores: {
    [socketId: string]: number;
  };
  activePowerUps: PowerUp[];
  colorCount: number;
  startingSequenceLength: number;
  maxSequenceLength: number;
  soundEnabled: boolean;
  colorBlindMode: boolean;
  gameOver: boolean;
  winner?: string;
  totalRounds: number;
  highestRound?: number;
  targetRounds?: number;
  startTime?: number;
}

export interface GameResults {
  winner: {
    socketId: string;
    name: string;
    score: number;
    finalRound: number;
  };
  rankings: {
    rank: number;
    socketId: string;
    name: string;
    score: number;
    finalRound: number;
    totalMistakes: number;
    averageCompletionTime: number;
  }[];
  stats: {
    totalRounds: number;
    longestSequence: number;
    fastestCompletion: {
      playerName: string;
      time: number;
    };
    perfectRounds: number;
  };
}

// Extend Settings
export interface Settings {
  minPlayers: number;
  maxPlayers: number;
  difficulty: Difficulty;
  gameMode: GameMode;
  colorCount: number;
  startingSequenceLength: number;
  maxSequenceLength: number;
  soundEnabled: boolean;
  colorBlindMode: boolean;
  targetRounds?: number;
  targetScore?: number;
}

// Extend Lobby
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
