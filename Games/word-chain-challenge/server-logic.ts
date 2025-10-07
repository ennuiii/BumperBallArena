/**
 * Word Chain Challenge - Server Logic
 * Add this code to server/server.ts inside the io.on('connection') handler
 */

import type { GameData, ChainWord, PlayerStats, VoteData, GameResults, GamePhase } from './types';

// Starting words by category
const STARTING_WORDS = {
  animals: ['dog', 'cat', 'elephant', 'tiger', 'dolphin', 'bird', 'lion', 'bear'],
  food: ['pizza', 'apple', 'bread', 'cheese', 'chocolate', 'rice', 'pasta', 'salad'],
  places: ['beach', 'mountain', 'city', 'forest', 'desert', 'ocean', 'park', 'library'],
  actions: ['run', 'jump', 'swim', 'dance', 'sing', 'write', 'read', 'sleep'],
  objects: ['car', 'phone', 'book', 'chair', 'lamp', 'computer', 'pen', 'camera'],
  emotions: ['happy', 'sad', 'excited', 'angry', 'calm', 'nervous', 'brave', 'proud'],
  nature: ['tree', 'rain', 'sun', 'flower', 'wind', 'snow', 'cloud', 'river'],
};

// Chain multipliers
const CHAIN_MULTIPLIERS: { [key: number]: number } = {
  5: 1.2,
  10: 1.5,
  15: 2.0,
  20: 3.0,
};

// Timer intervals
let turnTimers: Map<string, NodeJS.Timeout> = new Map();
let votingTimers: Map<string, NodeJS.Timeout> = new Map();

/**
 * Start game
 */
socket.on('game:start', (data: { roomCode: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || lobby.hostSocketId !== socket.id) return;

  // Initialize player stats
  const playerStats: { [socketId: string]: PlayerStats } = {};
  lobby.players.forEach(player => {
    playerStats[player.socketId] = {
      socketId: player.socketId,
      wordsSubmitted: 0,
      wordsAccepted: 0,
      wordsRejected: 0,
      totalPoints: 0,
      bonusPoints: 0,
      currentStreak: 0,
    };
  });

  // Get random starting word
  const categories = Object.keys(STARTING_WORDS);
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const categoryWords = STARTING_WORDS[randomCategory as keyof typeof STARTING_WORDS];
  const startingWordText = categoryWords[Math.floor(Math.random() * categoryWords.length)];

  const startingWord: ChainWord = {
    id: 'starting-word',
    word: startingWordText,
    submittedBy: 'system',
    playerName: 'Game',
    timestamp: Date.now(),
    votes: { accepts: [], challenges: [] },
    finalStatus: 'accepted',
    points: 0,
    bonuses: [],
  };

  // Create turn order (randomized)
  const turnOrder = [...lobby.players.map(p => p.socketId)].sort(() => Math.random() - 0.5);

  // Initialize game data
  const gameData: GameData = {
    phase: 'playing',
    currentRound: 1,
    maxRounds: lobby.settings.chainGoal || 20,
    chain: [],
    startingWord,
    currentPlayerSocketId: turnOrder[0],
    turnStartedAt: Date.now(),
    turnDuration: lobby.settings.turnDuration || 30,
    requiresExplanation: false,
    playerStats,
    chainGoal: lobby.settings.chainGoal || 20,
    votingTime: lobby.settings.votingTime || 15,
    allowChallenges: lobby.settings.allowChallenges !== false,
    gameMode: lobby.settings.gameMode || 'chainGoal',
    gameDuration: lobby.settings.gameDuration || 300,
    gameStartTime: Date.now(),
    gameOver: false,
    usedWords: new Set([startingWordText.toLowerCase()]),
    multiplier: 1,
    turnOrder,
    currentTurnIndex: 0,
  };

  lobby.gameData = gameData;
  lobby.state = 'PLAYING';

  // Initialize scores
  lobby.players.forEach(player => {
    lobby.scores[player.socketId] = 0;
  });

  io.to(lobby.code).emit('game:started', { lobby });
  io.to(lobby.code).emit('game:state-update', { gameData });

  // Start turn timer
  startTurnTimer(lobby.code);
});

/**
 * Submit word
 */
socket.on('game:submit-word', (data: { roomCode: string; word: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || !lobby.gameData) return;

  const gameData = lobby.gameData;

  // Validate it's player's turn
  if (gameData.currentPlayerSocketId !== socket.id) return;

  // Validate word
  const word = data.word.toLowerCase().trim();
  const validation = validateWord(word, gameData);

  if (!validation.valid) {
    socket.emit('game:error', { message: validation.error });
    return;
  }

  // Stop turn timer
  clearTurnTimer(lobby.code);

  // Create word entry
  const player = lobby.players.find(p => p.socketId === socket.id);
  const wordEntry: ChainWord = {
    id: `word-${Date.now()}-${Math.random()}`,
    word,
    submittedBy: socket.id,
    playerName: player?.name || 'Unknown',
    timestamp: Date.now(),
    votes: { accepts: [], challenges: [] },
    finalStatus: 'pending',
    points: 0,
    bonuses: [],
  };

  gameData.currentWord = word;
  gameData.phase = 'voting';

  // Add to used words
  gameData.usedWords.add(word);

  // Update player stats
  gameData.playerStats[socket.id].wordsSubmitted++;

  // Broadcast word submission
  io.to(lobby.code).emit('game:word-submitted', { word: wordEntry });
  io.to(lobby.code).emit('game:state-update', { gameData });

  // If only 1 player (host testing), auto-accept
  if (lobby.players.length === 1) {
    acceptWord(lobby, wordEntry);
    return;
  }

  // Start voting
  startVoting(lobby, wordEntry);
});

/**
 * Vote on word
 */
socket.on('game:vote', (data: { roomCode: string; wordId: string; vote: 'accept' | 'challenge' }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || !lobby.gameData || !lobby.gameData.voteData) return;

  const gameData = lobby.gameData;

  // Can't vote on own word
  if (gameData.currentPlayerSocketId === socket.id) return;

  // Record vote
  gameData.voteData.votes[socket.id] = data.vote;

  // Broadcast vote recorded
  io.to(lobby.code).emit('game:vote-recorded', {
    socketId: socket.id,
    vote: data.vote,
  });

  // Check if all votes are in
  const votingPlayers = lobby.players.filter(p => p.socketId !== gameData.currentPlayerSocketId);
  if (Object.keys(gameData.voteData.votes).length >= votingPlayers.length) {
    // All votes in, resolve immediately
    clearVotingTimer(lobby.code);
    resolveVoting(lobby);
  }
});

/**
 * Submit explanation
 */
socket.on('game:submit-explanation', (data: { roomCode: string; wordId: string; explanation: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || !lobby.gameData) return;

  const gameData = lobby.gameData;

  // Validate it's player's word
  if (gameData.currentPlayerSocketId !== socket.id) return;

  gameData.currentExplanation = data.explanation;

  // Broadcast explanation
  io.to(lobby.code).emit('game:explanation-submitted', {
    explanation: data.explanation,
  });

  // Give players 5 seconds to read, then do final vote
  setTimeout(() => {
    if (lobby.gameData && lobby.gameData.phase === 'explanation') {
      // For now, auto-accept if explanation provided
      // (could implement second vote round here)
      const wordEntry = findCurrentWordEntry(gameData);
      if (wordEntry) {
        acceptWord(lobby, wordEntry);
      }
    }
  }, 5000);
});

/**
 * Skip turn
 */
socket.on('game:skip-turn', (data: { roomCode: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || !lobby.gameData) return;

  const gameData = lobby.gameData;

  // Validate it's player's turn
  if (gameData.currentPlayerSocketId !== socket.id) return;

  // Apply penalty
  gameData.playerStats[socket.id].totalPoints -= 5;
  lobby.scores[socket.id] = (lobby.scores[socket.id] || 0) - 5;

  // Update player score
  const player = lobby.players.find(p => p.socketId === socket.id);
  if (player) {
    player.score = lobby.scores[socket.id];
  }

  // Clear timer
  clearTurnTimer(lobby.code);

  // Next turn
  nextTurn(lobby);
});

/**
 * End game
 */
socket.on('game:end', (data: { roomCode: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || lobby.hostSocketId !== socket.id) return;

  endGame(lobby);
});

// ============================================================================
// GAME LOGIC
// ============================================================================

function validateWord(word: string, gameData: GameData): { valid: boolean; error?: string } {
  // Check length
  if (word.length < 2) {
    return { valid: false, error: 'Word must be at least 2 characters' };
  }
  if (word.length > 20) {
    return { valid: false, error: 'Word must be 20 characters or less' };
  }

  // Check letters only
  if (!/^[a-z]+$/i.test(word)) {
    return { valid: false, error: 'Word must contain only letters' };
  }

  // Check not already used
  if (gameData.usedWords.has(word)) {
    return { valid: false, error: 'Word already used in this game' };
  }

  // Basic profanity check (add more as needed)
  const profanity = ['badword1', 'badword2']; // placeholder
  if (profanity.includes(word)) {
    return { valid: false, error: 'Inappropriate word' };
  }

  return { valid: true };
}

function startTurnTimer(roomCode: string) {
  const lobby = lobbies.get(roomCode);
  if (!lobby || !lobby.gameData) return;

  const gameData = lobby.gameData;
  const duration = gameData.turnDuration * 1000; // convert to ms

  // Send timer updates every second
  const timerInterval = setInterval(() => {
    if (!lobby.gameData || lobby.gameData.phase !== 'playing') {
      clearInterval(timerInterval);
      return;
    }

    const elapsed = Date.now() - gameData.turnStartedAt;
    const remaining = Math.max(0, duration - elapsed);

    io.to(roomCode).emit('game:timer-update', {
      timeRemaining: remaining,
      turnEndsAt: gameData.turnStartedAt + duration,
    });

    if (remaining <= 0) {
      clearInterval(timerInterval);
      // Time's up, skip turn
      gameData.playerStats[gameData.currentPlayerSocketId].totalPoints -= 5;
      lobby.scores[gameData.currentPlayerSocketId] = (lobby.scores[gameData.currentPlayerSocketId] || 0) - 5;
      nextTurn(lobby);
    }
  }, 1000);

  turnTimers.set(roomCode, timerInterval as any);
}

function clearTurnTimer(roomCode: string) {
  const timer = turnTimers.get(roomCode);
  if (timer) {
    clearInterval(timer);
    turnTimers.delete(roomCode);
  }
}

function startVoting(lobby: Lobby, wordEntry: ChainWord) {
  const gameData = lobby.gameData!;

  const voteData: VoteData = {
    wordId: wordEntry.id,
    votes: {},
    votingEndsAt: Date.now() + gameData.votingTime * 1000,
  };

  gameData.voteData = voteData;

  io.to(lobby.code).emit('game:voting-started', { voteData });

  // Set voting timeout
  const timeout = setTimeout(() => {
    if (lobby.gameData && lobby.gameData.voteData?.wordId === wordEntry.id) {
      resolveVoting(lobby);
    }
  }, gameData.votingTime * 1000);

  votingTimers.set(lobby.code, timeout);
}

function clearVotingTimer(roomCode: string) {
  const timer = votingTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    votingTimers.delete(roomCode);
  }
}

function resolveVoting(lobby: Lobby) {
  const gameData = lobby.gameData!;
  if (!gameData.voteData) return;

  const votes = Object.values(gameData.voteData.votes);
  const accepts = votes.filter(v => v === 'accept').length;
  const challenges = votes.filter(v => v === 'challenge').length;

  const totalVotes = accepts + challenges;
  const acceptPercent = totalVotes > 0 ? accepts / totalVotes : 1;

  const wordEntry = findCurrentWordEntry(gameData);
  if (!wordEntry) return;

  wordEntry.votes.accepts = Object.entries(gameData.voteData.votes)
    .filter(([, vote]) => vote === 'accept')
    .map(([socketId]) => socketId);

  wordEntry.votes.challenges = Object.entries(gameData.voteData.votes)
    .filter(([, vote]) => vote === 'challenge')
    .map(([socketId]) => socketId);

  if (acceptPercent >= 0.5) {
    // Accepted!
    io.to(lobby.code).emit('game:voting-ended', {
      result: 'accepted',
      requiresExplanation: false,
    });

    acceptWord(lobby, wordEntry);
  } else {
    // Challenged
    if (gameData.allowChallenges && lobby.settings.requireExplanations) {
      // Request explanation
      gameData.phase = 'explanation';
      gameData.requiresExplanation = true;

      io.to(lobby.code).emit('game:voting-ended', {
        result: 'challenged',
        requiresExplanation: true,
      });

      io.to(lobby.code).emit('game:explanation-requested', {
        wordId: wordEntry.id,
        timeLimit: 20,
      });

      io.to(lobby.code).emit('game:state-update', { gameData });

      // Timeout for explanation
      setTimeout(() => {
        if (gameData.phase === 'explanation' && !gameData.currentExplanation) {
          // No explanation provided, reject
          rejectWord(lobby, wordEntry);
        }
      }, 20000);
    } else {
      // Reject immediately
      io.to(lobby.code).emit('game:voting-ended', {
        result: 'challenged',
        requiresExplanation: false,
      });

      rejectWord(lobby, wordEntry);
    }
  }
}

function acceptWord(lobby: Lobby, wordEntry: ChainWord) {
  const gameData = lobby.gameData!;

  wordEntry.finalStatus = 'accepted';

  // Calculate points
  let points = 10; // base points
  const bonuses: string[] = [];

  // Time bonus
  const turnDuration = Date.now() - gameData.turnStartedAt;
  const turnSeconds = turnDuration / 1000;
  if (turnSeconds <= 10) {
    // Full points
  } else if (turnSeconds <= 20) {
    points = Math.floor(points * 0.9);
  } else {
    points = Math.floor(points * 0.7);
  }

  // Long word bonus
  if (wordEntry.word.length >= 8) {
    points += 5;
    bonuses.push('Long Word +5');
  }

  // Unanimous accept bonus
  if (wordEntry.votes.challenges.length === 0 && wordEntry.votes.accepts.length > 0) {
    points += 5;
    bonuses.push('Unanimous +5');
  }

  wordEntry.points = points;
  wordEntry.bonuses = bonuses;

  // Add to chain
  gameData.chain.push(wordEntry);

  // Update player stats
  const playerStats = gameData.playerStats[wordEntry.submittedBy];
  playerStats.wordsAccepted++;
  playerStats.currentStreak++;
  playerStats.totalPoints += points;
  lobby.scores[wordEntry.submittedBy] = playerStats.totalPoints;

  // Update player score
  const player = lobby.players.find(p => p.socketId === wordEntry.submittedBy);
  if (player) {
    player.score = playerStats.totalPoints;
  }

  // Update multiplier
  updateMultiplier(gameData);

  // Broadcast
  io.to(lobby.code).emit('game:word-resolved', {
    word: wordEntry,
    finalStatus: 'accepted',
  });

  io.to(lobby.code).emit('game:chain-updated', {
    chain: gameData.chain,
    multiplier: gameData.multiplier,
  });

  // Check win condition
  if (gameData.chain.length >= gameData.chainGoal) {
    endGame(lobby);
    return;
  }

  // Next turn
  setTimeout(() => {
    nextTurn(lobby);
  }, 2000);
}

function rejectWord(lobby: Lobby, wordEntry: ChainWord) {
  const gameData = lobby.gameData!;

  wordEntry.finalStatus = 'rejected';
  wordEntry.points = -5;

  // Update player stats
  const playerStats = gameData.playerStats[wordEntry.submittedBy];
  playerStats.wordsRejected++;
  playerStats.currentStreak = 0;
  playerStats.totalPoints -= 5;
  lobby.scores[wordEntry.submittedBy] = playerStats.totalPoints;

  // Update player score
  const player = lobby.players.find(p => p.socketId === wordEntry.submittedBy);
  if (player) {
    player.score = playerStats.totalPoints;
  }

  // Remove from used words
  gameData.usedWords.delete(wordEntry.word);

  // Broadcast
  io.to(lobby.code).emit('game:word-resolved', {
    word: wordEntry,
    finalStatus: 'rejected',
  });

  // Next turn
  setTimeout(() => {
    nextTurn(lobby);
  }, 2000);
}

function nextTurn(lobby: Lobby) {
  const gameData = lobby.gameData!;

  // Reset phase
  gameData.phase = 'playing';
  gameData.currentWord = undefined;
  gameData.currentExplanation = undefined;
  gameData.voteData = undefined;
  gameData.requiresExplanation = false;

  // Next player
  gameData.currentTurnIndex = (gameData.currentTurnIndex + 1) % gameData.turnOrder.length;
  gameData.currentPlayerSocketId = gameData.turnOrder[gameData.currentTurnIndex];
  gameData.turnStartedAt = Date.now();

  // Broadcast
  io.to(lobby.code).emit('game:turn-changed', {
    currentPlayerSocketId: gameData.currentPlayerSocketId,
    turnStartedAt: gameData.turnStartedAt,
  });

  io.to(lobby.code).emit('game:state-update', { gameData });

  // Start turn timer
  startTurnTimer(lobby.code);
}

function updateMultiplier(gameData: GameData) {
  const chainLength = gameData.chain.length;

  let newMultiplier = 1;
  for (const [threshold, multiplier] of Object.entries(CHAIN_MULTIPLIERS).reverse()) {
    if (chainLength >= parseInt(threshold)) {
      newMultiplier = multiplier;
      break;
    }
  }

  gameData.multiplier = newMultiplier;

  // Apply multiplier retroactively to recent scores
  if (newMultiplier > 1 && chainLength > 0) {
    const lastWord = gameData.chain[gameData.chain.length - 1];
    const extraPoints = Math.floor(lastWord.points * (newMultiplier - 1));
    gameData.playerStats[lastWord.submittedBy].bonusPoints += extraPoints;
    gameData.playerStats[lastWord.submittedBy].totalPoints += extraPoints;
    lobby.scores[lastWord.submittedBy] += extraPoints;
  }
}

function findCurrentWordEntry(gameData: GameData): ChainWord | null {
  if (!gameData.voteData) return null;

  // The word is being voted on, so it's not in the chain yet
  // We need to reconstruct it or track it separately
  // For simplicity, we'll create it from current state
  const player = gameData.currentPlayerSocketId;
  const word = gameData.currentWord;
  if (!word) return null;

  return {
    id: gameData.voteData.wordId,
    word,
    submittedBy: player,
    playerName: Object.keys(gameData.playerStats).find(id => id === player) || 'Unknown',
    timestamp: Date.now(),
    votes: { accepts: [], challenges: [] },
    finalStatus: 'pending',
    points: 0,
    bonuses: [],
  };
}

function endGame(lobby: Lobby) {
  const gameData = lobby.gameData!;
  gameData.gameOver = true;
  gameData.phase = 'finished';

  // Clear timers
  clearTurnTimer(lobby.code);
  clearVotingTimer(lobby.code);

  // Calculate final scores
  const finalScores = Object.values(gameData.playerStats)
    .map(stats => {
      const player = lobby.players.find(p => p.socketId === stats.socketId);
      return {
        socketId: stats.socketId,
        name: player?.name || 'Unknown',
        score: stats.totalPoints,
        wordsAccepted: stats.wordsAccepted,
        longestChainContribution: gameData.chain.filter(w => w.submittedBy === stats.socketId).length,
      };
    })
    .sort((a, b) => b.score - a.score);

  const winner = finalScores[0];

  // Find most creative word (most challenges but still accepted)
  const mostCreativeWord = gameData.chain
    .filter(w => w.finalStatus === 'accepted')
    .sort((a, b) => b.votes.challenges.length - a.votes.challenges.length)[0];

  // Calculate stats
  const totalWords = gameData.chain.length;
  const totalChallenges = gameData.chain.reduce((sum, w) => sum + w.votes.challenges.length, 0);
  const averageWordLength = totalWords > 0
    ? gameData.chain.reduce((sum, w) => sum + w.word.length, 0) / totalWords
    : 0;

  const results: GameResults = {
    winner: {
      socketId: winner.socketId,
      name: winner.name,
      score: winner.score,
    },
    finalScores,
    longestChain: gameData.chain,
    mostCreativeWord,
    stats: {
      totalWords,
      totalChallenges,
      averageWordLength,
    },
  };

  // Broadcast results
  io.to(lobby.code).emit('game:game-over', results);

  // Return to lobby after 15 seconds
  setTimeout(() => {
    lobby.state = 'LOBBY';
    lobby.gameData = undefined;
    io.to(lobby.code).emit('lobby:updated', { lobby });
  }, 15000);
}
