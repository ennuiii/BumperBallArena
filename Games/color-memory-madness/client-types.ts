/**
 * Color Memory Madness - Client Types
 * Add these to client/src/types.ts
 */

// Color types
export type ColorType = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

// Game phases
export type GamePhase = 'waiting' | 'watching' | 'memorizing' | 'replaying' | 'scoring' | 'roundEnd' | 'gameOver';

// Game modes
export type GameMode = 'classic' | 'speedRun' | 'survival' | 'battle';

// Difficulty levels
export type Difficulty = 'easy' | 'medium' | 'hard' | 'extreme';

// Power-up types (battle mode)
export type PowerUpType = 'slowMo' | 'pause' | 'hint' | 'speedBoost' | 'shield' | 'scramble';

// Color button data
export interface ColorButton {
  color: ColorType;
  hex: string;
  tone: number; // Frequency in Hz
  symbol: string; // For color-blind mode
  position: number; // 0-5
}

// Player's current attempt at the sequence
export interface PlayerProgress {
  socketId: string;
  playerName: string;
  currentSequence: ColorType[]; // What they've entered so far
  isCorrect: boolean; // Are they still correct?
  isComplete: boolean; // Have they finished?
  completionTime?: number; // Time taken to complete (ms)
  mistakes: number; // Number of mistakes this game
  isEliminated: boolean;
  activePowerUps: PowerUpType[];
}

// Power-up instance
export interface PowerUp {
  id: string;
  type: PowerUpType;
  expiresAt: number; // timestamp
  targetSocketId?: string; // For targeted power-ups
}

// Round data
export interface RoundData {
  roundNumber: number;
  sequence: ColorType[];
  sequenceLength: number;
  displayTime: number; // ms per color
  replayTimeLimit: number; // total seconds allowed
  startTime: number; // timestamp when replay phase started
  currentDisplayIndex: number; // Which color is currently being shown (-1 if none)
}

// Main game data
export interface GameData {
  // Game state
  phase: GamePhase;
  gameMode: GameMode;
  difficulty: Difficulty;

  // Current round
  currentRound: RoundData;

  // Player progress
  playerProgress: {
    [socketId: string]: PlayerProgress;
  };

  // Scores
  scores: {
    [socketId: string]: number;
  };

  // Power-ups (battle mode)
  activePowerUps: PowerUp[];

  // Settings
  colorCount: number; // 3-6
  startingSequenceLength: number;
  maxSequenceLength: number;
  soundEnabled: boolean;
  colorBlindMode: boolean;

  // Game state
  gameOver: boolean;
  winner?: string;
  totalRounds: number;

  // Survival mode
  highestRound?: number;

  // Speed run mode
  targetRounds?: number;
  startTime?: number; // Game start timestamp
}

// Animation state (client-only)
export interface AnimationState {
  currentlyLit?: ColorType;
  litUntil: number; // timestamp
  isAnimating: boolean;
}

// Sound state (client-only)
export interface SoundState {
  audioContext?: AudioContext;
  oscillators: Map<ColorType, OscillatorNode>;
  enabled: boolean;
  volume: number;
}

// Game results
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

// Socket events (client → server)
export interface ClientToServerEvents {
  'game:color-selected': (data: { roomCode: string; color: ColorType }) => void;
  'game:activate-powerup': (data: { roomCode: string; powerUpType: PowerUpType; targetSocketId?: string }) => void;
  'game:ready-for-next-round': (data: { roomCode: string }) => void;
}

// Socket events (server → client)
export interface ServerToClientEvents {
  'game:phase-changed': (data: { phase: GamePhase }) => void;
  'game:round-started': (data: { round: RoundData }) => void;
  'game:sequence-display': (data: { colorIndex: number; color: ColorType }) => void;
  'game:replay-phase-started': (data: { timeLimit: number }) => void;
  'game:player-progress-updated': (data: { socketId: string; progress: PlayerProgress }) => void;
  'game:player-mistake': (data: { socketId: string; expectedColor: ColorType; selectedColor: ColorType }) => void;
  'game:player-eliminated': (data: { socketId: string; reason: string }) => void;
  'game:player-completed': (data: { socketId: string; time: number; isFirst: boolean }) => void;
  'game:round-ended': (data: { scores: { [socketId: string]: number }; survivors: string[] }) => void;
  'game:powerup-spawned': (data: { powerUp: PowerUp }) => void;
  'game:powerup-activated': (data: { socketId: string; powerUpType: PowerUpType; targetSocketId?: string }) => void;
  'game:game-over': (data: GameResults) => void;
}

// Update Settings interface
export interface Settings {
  minPlayers: number;
  maxPlayers: number;

  // Color Memory specific
  difficulty: Difficulty;
  gameMode: GameMode;
  colorCount: number; // 3-6
  startingSequenceLength: number;
  maxSequenceLength: number;
  soundEnabled: boolean;
  colorBlindMode: boolean;

  // Mode-specific settings
  targetRounds?: number; // For speed run mode
  targetScore?: number; // For battle mode
}

// Color definitions
export const COLOR_DEFINITIONS: { [key in ColorType]: ColorButton } = {
  red: {
    color: 'red',
    hex: '#ef4444',
    tone: 261.63, // C4
    symbol: '●',
    position: 0,
  },
  blue: {
    color: 'blue',
    hex: '#3b82f6',
    tone: 293.66, // D4
    symbol: '■',
    position: 1,
  },
  green: {
    color: 'green',
    hex: '#22c55e',
    tone: 329.63, // E4
    symbol: '▲',
    position: 2,
  },
  yellow: {
    color: 'yellow',
    hex: '#f59e0b',
    tone: 349.23, // F4
    symbol: '★',
    position: 3,
  },
  purple: {
    color: 'purple',
    hex: '#a855f7',
    tone: 392.00, // G4
    symbol: '♦',
    position: 4,
  },
  orange: {
    color: 'orange',
    hex: '#f97316',
    tone: 440.00, // A4
    symbol: '✖',
    position: 5,
  },
};

// Difficulty settings
export const DIFFICULTY_SETTINGS: { [key in Difficulty]: { displayTime: number; replayTime: number; colors: number } } = {
  easy: { displayTime: 2000, replayTime: 30, colors: 3 },
  medium: { displayTime: 1500, replayTime: 25, colors: 4 },
  hard: { displayTime: 1000, replayTime: 20, colors: 5 },
  extreme: { displayTime: 700, replayTime: 15, colors: 6 },
};

// Power-up descriptions
export const POWERUP_DESCRIPTIONS: { [key in PowerUpType]: { name: string; icon: string; description: string } } = {
  slowMo: { name: 'Slow-Mo', icon: '🔍', description: 'Next sequence plays at half speed' },
  pause: { name: 'Pause', icon: '⏸️', description: 'Freeze sequence for 3 seconds' },
  hint: { name: 'Hint', icon: '🎯', description: 'One color glows during replay' },
  speedBoost: { name: 'Speed Boost', icon: '⚡', description: '+20s on timer' },
  shield: { name: 'Shield', icon: '🛡️', description: 'Protect from one mistake' },
  scramble: { name: 'Scramble', icon: '🔀', description: 'Shuffle opponent colors' },
};

// Scoring constants
export const SCORING = {
  PERFECT_SEQUENCE_BASE: 100,
  MAX_SPEED_BONUS: 50,
  STREAK_BONUS: 25,
  FIRST_PLACE_BONUS: 30,
  MISTAKE_PENALTY: 20,
  TIMEOUT_PENALTY: 10,
};
