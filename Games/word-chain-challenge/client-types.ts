/**
 * Word Chain Challenge - Client Types
 * Add these to client/src/types.ts
 */

// Game phases
export type GamePhase = 'waiting' | 'playing' | 'voting' | 'explanation' | 'reveal' | 'finished';

// Connection types for word relationships
export type ConnectionType =
  | 'synonym'
  | 'category'
  | 'association'
  | 'compound'
  | 'rhyme'
  | 'opposite'
  | 'action'
  | 'creative';

// Individual word in the chain
export interface ChainWord {
  id: string;
  word: string;
  submittedBy: string; // socketId
  playerName: string;
  connectionType?: ConnectionType;
  connectionExplanation?: string;
  timestamp: number;
  votes: {
    accepts: string[]; // socketIds who accepted
    challenges: string[]; // socketIds who challenged
  };
  finalStatus: 'accepted' | 'challenged' | 'pending' | 'rejected';
  points: number; // Points awarded for this word
  bonuses: string[]; // Bonus descriptions like "Rare Word", "Long Word"
}

// Vote data for current word
export interface VoteData {
  wordId: string;
  votes: {
    [socketId: string]: 'accept' | 'challenge';
  };
  votingEndsAt: number; // timestamp
}

// Player stats
export interface PlayerStats {
  socketId: string;
  wordsSubmitted: number;
  wordsAccepted: number;
  wordsRejected: number;
  totalPoints: number;
  bonusPoints: number;
  currentStreak: number; // consecutive accepted words
}

// Main game data
export interface GameData {
  // Game state
  phase: GamePhase;
  currentRound: number;
  maxRounds: number;

  // Word chain
  chain: ChainWord[];
  startingWord: ChainWord;

  // Current turn
  currentPlayerSocketId: string;
  currentWord?: string; // Word being submitted
  currentExplanation?: string; // Explanation for challenged word
  turnStartedAt: number;
  turnDuration: number; // seconds

  // Voting
  voteData?: VoteData;
  requiresExplanation: boolean; // true if word was challenged

  // Player stats
  playerStats: {
    [socketId: string]: PlayerStats;
  };

  // Game settings
  chainGoal: number; // target chain length
  votingTime: number; // seconds for voting
  allowChallenges: boolean;
  gameMode: 'chainGoal' | 'timed' | 'survival';
  gameDuration?: number; // seconds (for timed mode)
  gameStartTime: number;

  // Game state
  gameOver: boolean;
  winner?: string;

  // Word history (prevents repeats)
  usedWords: Set<string>;

  // Chain multiplier
  multiplier: number;
}

// Real-time timer data
export interface TimerData {
  timeRemaining: number; // milliseconds
  turnEndsAt: number; // timestamp
}

// Game results
export interface GameResults {
  winner: {
    socketId: string;
    name: string;
    score: number;
  };
  finalScores: {
    socketId: string;
    name: string;
    score: number;
    wordsAccepted: number;
    longestChainContribution: number;
  }[];
  longestChain: ChainWord[];
  mostCreativeWord: ChainWord;
  stats: {
    totalWords: number;
    totalChallenges: number;
    averageWordLength: number;
  };
}

// Socket events (client → server)
export interface ClientToServerEvents {
  'game:submit-word': (data: { roomCode: string; word: string }) => void;
  'game:vote': (data: { roomCode: string; wordId: string; vote: 'accept' | 'challenge' }) => void;
  'game:submit-explanation': (data: { roomCode: string; wordId: string; explanation: string }) => void;
  'game:skip-turn': (data: { roomCode: string }) => void;
}

// Socket events (server → client)
export interface ServerToClientEvents {
  'game:phase-changed': (data: { phase: GamePhase; data?: any }) => void;
  'game:word-submitted': (data: { word: ChainWord }) => void;
  'game:voting-started': (data: { voteData: VoteData }) => void;
  'game:vote-recorded': (data: { socketId: string; vote: 'accept' | 'challenge' }) => void;
  'game:voting-ended': (data: { result: 'accepted' | 'challenged'; requiresExplanation: boolean }) => void;
  'game:explanation-requested': (data: { wordId: string; timeLimit: number }) => void;
  'game:explanation-submitted': (data: { explanation: string }) => void;
  'game:word-resolved': (data: { word: ChainWord; finalStatus: 'accepted' | 'rejected' }) => void;
  'game:turn-changed': (data: { currentPlayerSocketId: string; turnStartedAt: number }) => void;
  'game:timer-update': (data: TimerData) => void;
  'game:chain-updated': (data: { chain: ChainWord[]; multiplier: number }) => void;
  'game:game-over': (data: GameResults) => void;
}

// Update Settings interface
export interface Settings {
  minPlayers: number;
  maxPlayers: number;

  // Word Chain specific
  turnDuration: number; // seconds per turn
  chainGoal: number; // target chain length (chainGoal mode)
  votingTime: number; // seconds for voting
  allowChallenges: boolean;
  requireExplanations: boolean;
  gameMode: 'chainGoal' | 'timed' | 'survival';
  gameDuration: number; // seconds (timed mode)
}

// Starting word categories
export const STARTING_WORDS = {
  animals: ['dog', 'cat', 'elephant', 'tiger', 'dolphin', 'bird', 'lion', 'bear'],
  food: ['pizza', 'apple', 'bread', 'cheese', 'chocolate', 'rice', 'pasta', 'salad'],
  places: ['beach', 'mountain', 'city', 'forest', 'desert', 'ocean', 'park', 'library'],
  actions: ['run', 'jump', 'swim', 'dance', 'sing', 'write', 'read', 'sleep'],
  objects: ['car', 'phone', 'book', 'chair', 'lamp', 'computer', 'pen', 'camera'],
  emotions: ['happy', 'sad', 'excited', 'angry', 'calm', 'nervous', 'brave', 'proud'],
  nature: ['tree', 'rain', 'sun', 'flower', 'wind', 'snow', 'cloud', 'river'],
};

// Word validation constants
export const MIN_WORD_LENGTH = 2;
export const MAX_WORD_LENGTH = 20;
export const VOTING_MAJORITY_PERCENT = 0.5; // 50%

// Multiplier thresholds
export const CHAIN_MULTIPLIERS = {
  5: 1.2,
  10: 1.5,
  15: 2.0,
  20: 3.0,
};
