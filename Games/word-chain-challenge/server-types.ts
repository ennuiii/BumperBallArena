/**
 * Word Chain Challenge - Server Types
 * Add these to server/types.ts
 */

export type GamePhase = 'waiting' | 'playing' | 'voting' | 'explanation' | 'reveal' | 'finished';
export type ConnectionType = 'synonym' | 'category' | 'association' | 'compound' | 'rhyme' | 'opposite' | 'action' | 'creative';

export interface ChainWord {
  id: string;
  word: string;
  submittedBy: string;
  playerName: string;
  connectionType?: ConnectionType;
  connectionExplanation?: string;
  timestamp: number;
  votes: {
    accepts: string[];
    challenges: string[];
  };
  finalStatus: 'accepted' | 'challenged' | 'pending' | 'rejected';
  points: number;
  bonuses: string[];
}

export interface VoteData {
  wordId: string;
  votes: {
    [socketId: string]: 'accept' | 'challenge';
  };
  votingEndsAt: number;
}

export interface PlayerStats {
  socketId: string;
  wordsSubmitted: number;
  wordsAccepted: number;
  wordsRejected: number;
  totalPoints: number;
  bonusPoints: number;
  currentStreak: number;
}

export interface GameData {
  phase: GamePhase;
  currentRound: number;
  maxRounds: number;
  chain: ChainWord[];
  startingWord: ChainWord;
  currentPlayerSocketId: string;
  currentWord?: string;
  currentExplanation?: string;
  turnStartedAt: number;
  turnDuration: number;
  voteData?: VoteData;
  requiresExplanation: boolean;
  playerStats: {
    [socketId: string]: PlayerStats;
  };
  chainGoal: number;
  votingTime: number;
  allowChallenges: boolean;
  gameMode: 'chainGoal' | 'timed' | 'survival';
  gameDuration?: number;
  gameStartTime: number;
  gameOver: boolean;
  winner?: string;
  usedWords: Set<string>;
  multiplier: number;
  turnOrder: string[]; // socketIds in turn order
  currentTurnIndex: number;
}

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

// Extend Settings
export interface Settings {
  minPlayers: number;
  maxPlayers: number;
  turnDuration: number;
  chainGoal: number;
  votingTime: number;
  allowChallenges: boolean;
  requireExplanations: boolean;
  gameMode: 'chainGoal' | 'timed' | 'survival';
  gameDuration: number;
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
