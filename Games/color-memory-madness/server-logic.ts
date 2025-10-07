/**
 * Color Memory Madness - Server Logic
 * Add this code to server/server.ts inside the io.on('connection') handler
 */

import type { GameData, PlayerProgress, RoundData, ColorType, GameResults, Difficulty } from './types';

// Difficulty settings
const DIFFICULTY_SETTINGS: { [key in Difficulty]: { displayTime: number; replayTime: number; colors: number } } = {
  easy: { displayTime: 2000, replayTime: 30, colors: 3 },
  medium: { displayTime: 1500, replayTime: 25, colors: 4 },
  hard: { displayTime: 1000, replayTime: 20, colors: 5 },
  extreme: { displayTime: 700, replayTime: 15, colors: 6 },
};

// Available colors
const ALL_COLORS: ColorType[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

// Round timers
let roundTimers: Map<string, NodeJS.Timeout> = new Map();
let replayTimers: Map<string, NodeJS.Timeout> = new Map();

/**
 * Start game
 */
socket.on('game:start', (data: { roomCode: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || lobby.hostSocketId !== socket.id) return;

  const difficulty = lobby.settings.difficulty || 'medium';
  const difficultySettings = DIFFICULTY_SETTINGS[difficulty];

  // Initialize player progress
  const playerProgress: { [socketId: string]: PlayerProgress } = {};
  lobby.players.forEach(player => {
    playerProgress[player.socketId] = {
      socketId: player.socketId,
      playerName: player.name,
      currentSequence: [],
      isCorrect: true,
      isComplete: false,
      mistakes: 0,
      isEliminated: false,
      activePowerUps: [],
      streak: 0,
    };
  });

  // Initialize scores
  const scores: { [socketId: string]: number } = {};
  lobby.players.forEach(player => {
    scores[player.socketId] = 0;
    lobby.scores[player.socketId] = 0;
  });

  // Generate first sequence
  const firstSequence = generateSequence(lobby.settings.startingSequenceLength || 1, difficultySettings.colors);

  // Initialize game data
  const gameData: GameData = {
    phase: 'waiting',
    gameMode: lobby.settings.gameMode || 'classic',
    difficulty,
    currentRound: {
      roundNumber: 1,
      sequence: firstSequence,
      sequenceLength: firstSequence.length,
      displayTime: difficultySettings.displayTime,
      replayTimeLimit: difficultySettings.replayTime,
      startTime: 0,
      currentDisplayIndex: -1,
    },
    playerProgress,
    scores,
    activePowerUps: [],
    colorCount: difficultySettings.colors,
    startingSequenceLength: lobby.settings.startingSequenceLength || 1,
    maxSequenceLength: lobby.settings.maxSequenceLength || 20,
    soundEnabled: lobby.settings.soundEnabled !== false,
    colorBlindMode: lobby.settings.colorBlindMode || false,
    gameOver: false,
    totalRounds: 0,
    targetRounds: lobby.settings.targetRounds,
    startTime: Date.now(),
  };

  lobby.gameData = gameData;
  lobby.state = 'PLAYING';

  io.to(lobby.code).emit('game:started', { lobby });
  io.to(lobby.code).emit('game:state-update', { gameData });

  // Start first round after 3 seconds
  setTimeout(() => {
    startRound(lobby);
  }, 3000);
});

/**
 * Handle color selection
 */
socket.on('game:color-selected', (data: { roomCode: string; color: ColorType }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || !lobby.gameData) return;

  const gameData = lobby.gameData;
  const progress = gameData.playerProgress[socket.id];

  // Validate phase
  if (gameData.phase !== 'replaying') return;

  // Validate player can play
  if (!progress || progress.isEliminated || progress.isComplete || !progress.isCorrect) return;

  // Get expected color
  const expectedIndex = progress.currentSequence.length;
  const expectedColor = gameData.currentRound.sequence[expectedIndex];

  // Check if correct
  if (data.color === expectedColor) {
    // Correct!
    progress.currentSequence.push(data.color);

    // Check if completed sequence
    if (progress.currentSequence.length === gameData.currentRound.sequenceLength) {
      progress.isComplete = true;
      progress.completionTime = Date.now() - gameData.currentRound.startTime;

      // Check if first to complete
      const otherCompleted = Object.values(gameData.playerProgress).filter(
        p => p.socketId !== socket.id && p.isComplete
      );
      const isFirst = otherCompleted.length === 0;

      io.to(lobby.code).emit('game:player-completed', {
        socketId: socket.id,
        time: progress.completionTime,
        isFirst,
      });

      // Award points
      const points = calculatePoints(progress, gameData.currentRound, isFirst);
      gameData.scores[socket.id] += points;
      lobby.scores[socket.id] = gameData.scores[socket.id];

      // Update player score
      const player = lobby.players.find(p => p.socketId === socket.id);
      if (player) {
        player.score = gameData.scores[socket.id];
      }

      // Increment streak
      progress.streak++;

      // Check if all active players completed or eliminated
      checkRoundComplete(lobby);
    }

    // Broadcast progress update
    io.to(lobby.code).emit('game:player-progress-updated', {
      socketId: socket.id,
      progress,
    });
  } else {
    // Wrong color!
    progress.isCorrect = false;
    progress.mistakes++;

    io.to(lobby.code).emit('game:player-mistake', {
      socketId: socket.id,
      expectedColor,
      selectedColor: data.color,
    });

    // In classic mode, eliminate on mistake
    if (gameData.gameMode === 'classic') {
      eliminatePlayer(lobby, socket.id, 'Wrong color');
    } else {
      // In other modes, reset their sequence
      progress.currentSequence = [];
      progress.isCorrect = true;
      progress.streak = 0;

      // Apply penalty
      gameData.scores[socket.id] = Math.max(0, gameData.scores[socket.id] - 20);
      lobby.scores[socket.id] = gameData.scores[socket.id];
    }

    io.to(lobby.code).emit('game:player-progress-updated', {
      socketId: socket.id,
      progress,
    });
  }

  // Broadcast updated game state
  io.to(lobby.code).emit('game:state-update', { gameData });
});

/**
 * End game (host only)
 */
socket.on('game:end', (data: { roomCode: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || lobby.hostSocketId !== socket.id) return;

  endGame(lobby);
});

// ============================================================================
// GAME LOGIC
// ============================================================================

function startRound(lobby: Lobby) {
  const gameData = lobby.gameData!;

  // Reset player progress for new round
  Object.values(gameData.playerProgress).forEach(progress => {
    if (!progress.isEliminated) {
      progress.currentSequence = [];
      progress.isCorrect = true;
      progress.isComplete = false;
      progress.completionTime = undefined;
    }
  });

  gameData.phase = 'watching';
  gameData.totalRounds++;

  io.to(lobby.code).emit('game:phase-changed', { phase: 'watching' });
  io.to(lobby.code).emit('game:round-started', { round: gameData.currentRound });
  io.to(lobby.code).emit('game:state-update', { gameData });

  // Display sequence
  displaySequence(lobby);
}

function displaySequence(lobby: Lobby) {
  const gameData = lobby.gameData!;
  const sequence = gameData.currentRound.sequence;
  const displayTime = gameData.currentRound.displayTime;

  let index = 0;

  const displayNext = () => {
    if (index >= sequence.length) {
      // Sequence display complete
      gameData.phase = 'memorizing';
      gameData.currentRound.currentDisplayIndex = -1;

      io.to(lobby.code).emit('game:phase-changed', { phase: 'memorizing' });
      io.to(lobby.code).emit('game:state-update', { gameData });

      // Start replay phase after 1 second
      setTimeout(() => {
        startReplayPhase(lobby);
      }, 1000);

      return;
    }

    // Display current color
    const color = sequence[index];
    gameData.currentRound.currentDisplayIndex = index;

    io.to(lobby.code).emit('game:sequence-display', {
      colorIndex: index,
      color,
    });

    index++;

    // Schedule next color (displayTime + 200ms gap)
    const timer = setTimeout(displayNext, displayTime + 200);
    roundTimers.set(lobby.code, timer);
  };

  // Start displaying
  displayNext();
}

function startReplayPhase(lobby: Lobby) {
  const gameData = lobby.gameData!;

  gameData.phase = 'replaying';
  gameData.currentRound.startTime = Date.now();

  io.to(lobby.code).emit('game:phase-changed', { phase: 'replaying' });
  io.to(lobby.code).emit('game:replay-phase-started', {
    timeLimit: gameData.currentRound.replayTimeLimit,
  });
  io.to(lobby.code).emit('game:state-update', { gameData });

  // Set timeout for replay phase
  const timeout = setTimeout(() => {
    // Time's up! Eliminate players who haven't completed
    Object.values(gameData.playerProgress).forEach(progress => {
      if (!progress.isEliminated && !progress.isComplete) {
        if (gameData.gameMode === 'classic') {
          eliminatePlayer(lobby, progress.socketId, 'Timeout');
        } else {
          // Apply timeout penalty
          gameData.scores[progress.socketId] = Math.max(0, gameData.scores[progress.socketId] - 10);
          lobby.scores[progress.socketId] = gameData.scores[progress.socketId];
          progress.streak = 0;
        }
      }
    });

    endRound(lobby);
  }, gameData.currentRound.replayTimeLimit * 1000);

  replayTimers.set(lobby.code, timeout);
}

function checkRoundComplete(lobby: Lobby) {
  const gameData = lobby.gameData!;

  // Check if all active players have completed or been eliminated
  const activePlayers = Object.values(gameData.playerProgress).filter(p => !p.isEliminated);
  const allDone = activePlayers.every(p => p.isComplete || !p.isCorrect);

  if (allDone) {
    // Clear replay timer
    const timer = replayTimers.get(lobby.code);
    if (timer) {
      clearTimeout(timer);
      replayTimers.delete(lobby.code);
    }

    endRound(lobby);
  }
}

function endRound(lobby: Lobby) {
  const gameData = lobby.gameData!;

  gameData.phase = 'roundEnd';

  // Get survivors (players who completed)
  const survivors = Object.values(gameData.playerProgress)
    .filter(p => !p.isEliminated && p.isComplete)
    .map(p => p.socketId);

  io.to(lobby.code).emit('game:round-ended', {
    scores: gameData.scores,
    survivors,
  });

  io.to(lobby.code).emit('game:state-update', { gameData });

  // Check win conditions
  if (shouldEndGame(gameData)) {
    setTimeout(() => endGame(lobby), 3000);
    return;
  }

  // Start next round after 3 seconds
  setTimeout(() => {
    prepareNextRound(lobby);
    startRound(lobby);
  }, 3000);
}

function prepareNextRound(lobby: Lobby) {
  const gameData = lobby.gameData!;

  // Increment round number
  const nextRoundNumber = gameData.currentRound.roundNumber + 1;

  // Increase sequence length
  const nextLength = Math.min(
    gameData.currentRound.sequenceLength + 1,
    gameData.maxSequenceLength
  );

  // Generate new sequence
  const nextSequence = generateSequence(nextLength, gameData.colorCount);

  gameData.currentRound = {
    roundNumber: nextRoundNumber,
    sequence: nextSequence,
    sequenceLength: nextLength,
    displayTime: gameData.currentRound.displayTime,
    replayTimeLimit: gameData.currentRound.replayTimeLimit,
    startTime: 0,
    currentDisplayIndex: -1,
  };

  // Update highest round
  if (!gameData.highestRound || nextRoundNumber > gameData.highestRound) {
    gameData.highestRound = nextRoundNumber;
  }
}

function generateSequence(length: number, colorCount: number): ColorType[] {
  const availableColors = ALL_COLORS.slice(0, colorCount);
  const sequence: ColorType[] = [];

  for (let i = 0; i < length; i++) {
    let color: ColorType;

    // Avoid three consecutive same colors
    do {
      color = availableColors[Math.floor(Math.random() * availableColors.length)];
    } while (
      sequence.length >= 2 &&
      sequence[sequence.length - 1] === color &&
      sequence[sequence.length - 2] === color
    );

    sequence.push(color);
  }

  return sequence;
}

function calculatePoints(progress: PlayerProgress, round: RoundData, isFirst: boolean): number {
  let points = 100 * round.sequenceLength; // Base points

  // Speed bonus (up to +50 points)
  if (progress.completionTime) {
    const timeRatio = progress.completionTime / (round.replayTimeLimit * 1000);
    const speedBonus = Math.floor(50 * (1 - timeRatio));
    points += Math.max(0, speedBonus);
  }

  // Streak bonus
  if (progress.streak > 0) {
    points += 25 * progress.streak;
  }

  // First place bonus
  if (isFirst) {
    points += 30;
  }

  return points;
}

function eliminatePlayer(lobby: Lobby, socketId: string, reason: string) {
  const gameData = lobby.gameData!;
  const progress = gameData.playerProgress[socketId];

  if (!progress || progress.isEliminated) return;

  progress.isEliminated = true;
  progress.streak = 0;

  io.to(lobby.code).emit('game:player-eliminated', {
    socketId,
    reason,
  });

  // Check if only one player remains (classic mode)
  const activePlayers = Object.values(gameData.playerProgress).filter(p => !p.isEliminated);

  if (activePlayers.length <= 1 && gameData.gameMode === 'classic') {
    // Game over - we have a winner!
    setTimeout(() => endGame(lobby), 2000);
  }
}

function shouldEndGame(gameData: GameData): boolean {
  const activePlayers = Object.values(gameData.playerProgress).filter(p => !p.isEliminated);

  // Classic mode: One or zero players left
  if (gameData.gameMode === 'classic' && activePlayers.length <= 1) {
    return true;
  }

  // Speed run mode: Target rounds reached
  if (gameData.gameMode === 'speedRun' && gameData.targetRounds) {
    if (gameData.totalRounds >= gameData.targetRounds) {
      return true;
    }
  }

  // All players eliminated
  if (activePlayers.length === 0) {
    return true;
  }

  // Max sequence length reached
  if (gameData.currentRound.sequenceLength >= gameData.maxSequenceLength) {
    return true;
  }

  return false;
}

function endGame(lobby: Lobby) {
  const gameData = lobby.gameData!;
  gameData.gameOver = true;
  gameData.phase = 'gameOver';

  // Clear any active timers
  const roundTimer = roundTimers.get(lobby.code);
  if (roundTimer) {
    clearTimeout(roundTimer);
    roundTimers.delete(lobby.code);
  }

  const replayTimer = replayTimers.get(lobby.code);
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimers.delete(lobby.code);
  }

  // Calculate rankings
  const rankings = Object.values(gameData.playerProgress)
    .map(progress => {
      const player = lobby.players.find(p => p.socketId === progress.socketId);
      const completionTimes = progress.completionTime ? [progress.completionTime] : [];

      return {
        rank: 0, // Will be set below
        socketId: progress.socketId,
        name: player?.name || 'Unknown',
        score: gameData.scores[progress.socketId] || 0,
        finalRound: gameData.totalRounds,
        totalMistakes: progress.mistakes,
        averageCompletionTime: completionTimes.length > 0
          ? completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
          : 0,
      };
    })
    .sort((a, b) => {
      // Sort by score, then by mistakes (fewer is better)
      if (b.score !== a.score) return b.score - a.score;
      return a.totalMistakes - b.totalMistakes;
    })
    .map((ranking, index) => ({
      ...ranking,
      rank: index + 1,
    }));

  const winner = rankings[0];

  // Find fastest completion
  let fastestCompletion = {
    playerName: 'None',
    time: Infinity,
  };

  Object.values(gameData.playerProgress).forEach(progress => {
    if (progress.completionTime && progress.completionTime < fastestCompletion.time) {
      const player = lobby.players.find(p => p.socketId === progress.socketId);
      fastestCompletion = {
        playerName: player?.name || 'Unknown',
        time: progress.completionTime,
      };
    }
  });

  // Calculate perfect rounds
  const perfectRounds = Object.values(gameData.playerProgress).reduce(
    (max, progress) => Math.max(max, progress.streak),
    0
  );

  const results: GameResults = {
    winner: {
      socketId: winner.socketId,
      name: winner.name,
      score: winner.score,
      finalRound: winner.finalRound,
    },
    rankings,
    stats: {
      totalRounds: gameData.totalRounds,
      longestSequence: gameData.highestRound || 1,
      fastestCompletion: fastestCompletion.time < Infinity ? fastestCompletion : {
        playerName: 'None',
        time: 0,
      },
      perfectRounds,
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
