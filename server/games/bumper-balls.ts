/**
 * Bumper Balls Arena - Server Logic
 *
 * Add these functions and event handlers to your server/server.ts
 * This file contains the core game loop, physics engine, and multiplayer logic
 */

// ============================================================================
// TYPES (simplified - import from server-types.ts in production)
// ============================================================================

interface Vector3D {
  x: number;
  y: number;
  z: number;
}

interface PlayerBall {
  socketId: string;
  name: string;
  color: string;
  position: Vector3D;
  velocity: Vector3D;
  rotation: Vector3D;
  acceleration: Vector3D;
  isEliminated: boolean;
  eliminatedAt?: number;
  stamina: number;
  isSprinting: boolean;
  eliminations: number;
  survivalTime: number;
  lastInput?: MovementInput;
  lastHitBy?: string; // socketId of player who last hit this player
  lastHitTime?: number; // timestamp of last hit
}

interface MovementInput {
  x: number; // -1 to 1
  z: number; // -1 to 1
  sprint: boolean;
}

interface BumperBallsGameData {
  status: 'countdown' | 'playing' | 'ended';
  countdownValue?: number;
  startTime: number;
  gameMode: 'classic' | 'shrinking' | 'timed';
  players: PlayerBall[];
  alivePlayers: string[];
  eliminationOrder: string[];
  winnerId?: string;
  lastTickTime: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONSTANTS = {
  // Physics
  BALL_RADIUS: 0.5,
  MAX_VELOCITY: 30.0, // Increased from 25.0 for faster movement
  SPRINT_MAX_VELOCITY: 50.0, // Increased from 40.0 for aggressive gameplay
  MOVE_FORCE: 75.0, // Increased from 50.0 for snappier acceleration
  SPRINT_FORCE: 120.0, // Increased from 80.0 for explosive sprint speed
  FRICTION: 0.90, // Increased from 0.88 for better momentum retention
  GRAVITY: 9.81,

  // Platform
  PLATFORM_RADIUS: 10.0,
  FALL_THRESHOLD: -5.0,
  SPAWN_HEIGHT: 1.0,

  // Game
  TICK_RATE: 60, // ticks per second
  SYNC_RATE: 60, // state broadcasts per second (increased from 30 for smoother 144fps gameplay)
  COUNTDOWN_DURATION: 3, // seconds

  // Stamina
  MAX_STAMINA: 100,
  STAMINA_REGEN: 15, // per second
  STAMINA_DRAIN: 45, // per second (faster depletion)
  MIN_SPRINT_STAMINA: 10,

  // Spawn
  SPAWN_RADIUS: 8.0,

  // Colors
  PLAYER_COLORS: ['#FF4444', '#4444FF', '#44FF44', '#FFFF44', '#FF44FF', '#44FFFF', '#FF8844', '#8844FF'],
};

// ============================================================================
// GAME STATE STORAGE
// ============================================================================

export const activeGames = new Map<string, {
  lobby: any; // Reference to the lobby object
  gameData: BumperBallsGameData;
  gameLoop: NodeJS.Timeout | null;
  syncLoop: NodeJS.Timeout | null;
  countdownInterval: NodeJS.Timeout | null;
  cleanupTimeout: NodeJS.Timeout | null;
}>();

// ============================================================================
// GAME INITIALIZATION
// ============================================================================

export function initializeBumperBallsGame(lobby: any, io: any): void {
  console.log(`[Bumper] Initializing game for lobby ${lobby.code}`);

  // Create player balls
  const players: PlayerBall[] = lobby.players.map((player: any, index: number) => {
    const angle = (index / lobby.players.length) * Math.PI * 2;
    const spawnX = Math.cos(angle) * CONSTANTS.SPAWN_RADIUS;
    const spawnZ = Math.sin(angle) * CONSTANTS.SPAWN_RADIUS;

    return {
      socketId: player.socketId,
      name: player.name,
      color: CONSTANTS.PLAYER_COLORS[index % CONSTANTS.PLAYER_COLORS.length],
      position: { x: spawnX, y: CONSTANTS.SPAWN_HEIGHT, z: spawnZ },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
      isEliminated: false,
      stamina: CONSTANTS.MAX_STAMINA,
      isSprinting: false,
      eliminations: 0,
      survivalTime: 0,
      lastInput: { x: 0, z: 0, sprint: false },
    };
  });

  const gameData: BumperBallsGameData = {
    status: 'countdown',
    countdownValue: CONSTANTS.COUNTDOWN_DURATION,
    startTime: Date.now(),
    gameMode: lobby.settings?.gameMode || 'classic',
    players,
    alivePlayers: players.map(p => p.socketId),
    eliminationOrder: [],
    lastTickTime: Date.now(),
  };

  // Attach game data to lobby
  lobby.gameData = gameData;

  // Store game state with lobby reference FIRST (before countdown needs it)
  activeGames.set(lobby.code, {
    lobby,
    gameData,
    gameLoop: null,
    syncLoop: null,
    countdownInterval: null,
    cleanupTimeout: null,
  });

  // Emit the updated lobby with game data to all players
  io.to(lobby.code).emit('game:started', {
    lobby: {
      code: lobby.code,
      hostId: lobby.hostId,
      settings: lobby.settings,
      players: lobby.players.map((p: any) => ({
        socketId: p.socketId,
        name: p.name,
        score: p.score,
        connected: p.connected,
        isHost: p.isHost,
      })),
      state: lobby.state,
      gameData: gameData,
      isGameBuddiesRoom: lobby.isGameBuddiesRoom,
    },
  });

  // Start countdown (after game is stored in activeGames)
  startCountdown(lobby.code, gameData, io);
}

// ============================================================================
// COUNTDOWN
// ============================================================================

function startCountdown(roomCode: string, gameData: BumperBallsGameData, io: any): void {
  console.log(`[Bumper] Starting countdown for ${roomCode}`);
  let count = CONSTANTS.COUNTDOWN_DURATION;

  const game = activeGames.get(roomCode);
  if (!game) {
    console.error(`[Bumper] Cannot start countdown - game not found for ${roomCode}`);
    return;
  }

  const countdownInterval = setInterval(() => {
    // Validate this countdown is still current (not from a previous game)
    const currentGame = activeGames.get(roomCode);
    if (!currentGame || currentGame.gameData !== gameData) {
      console.log(`[Bumper] Countdown ${roomCode} is stale (gameData changed), exiting early`);
      clearInterval(countdownInterval);
      return;
    }

    gameData.countdownValue = count;
    console.log(`[Bumper] Countdown ${roomCode}: ${count}`);

    // Broadcast countdown
    io.to(roomCode).emit('bumper:state-update', { gameData: sanitizeGameData(gameData) });

    count--;

    if (count < 0) {
      console.log(`[Bumper] Countdown complete for ${roomCode}, starting game loop`);
      clearInterval(countdownInterval);
      if (currentGame) currentGame.countdownInterval = null;
      startGameLoop(roomCode, gameData, io);
    }
  }, 1000);

  // Store the interval reference
  game.countdownInterval = countdownInterval;
}

// ============================================================================
// GAME LOOP
// ============================================================================

function startGameLoop(roomCode: string, gameData: BumperBallsGameData, io: any): void {
  console.log(`[Bumper] Starting game loop for ${roomCode}`);

  gameData.status = 'playing';
  gameData.startTime = Date.now();
  gameData.lastTickTime = Date.now();
  console.log(`[Bumper] Set status to 'playing' for ${roomCode}`);

  const game = activeGames.get(roomCode);
  if (!game) {
    console.error(`[Bumper] Cannot start game loop - game not found for ${roomCode}`);
    return;
  }
  console.log(`[Bumper] Starting physics and sync loops for ${roomCode}`);

  // Immediately emit the playing state (don't wait for first sync tick)
  io.to(roomCode).emit('bumper:state-update', { gameData: sanitizeGameData(gameData) });
  console.log(`[Bumper] Emitted initial 'playing' state for ${roomCode}`);

  // Physics tick (60 Hz)
  const gameLoop = setInterval(() => {
    // Validate this loop is still current
    const currentGame = activeGames.get(roomCode);
    if (!currentGame || currentGame.gameData !== gameData) {
      console.log(`[Bumper] Game loop ${roomCode} is stale, exiting`);
      clearInterval(gameLoop);
      return;
    }

    const now = Date.now();
    const deltaTime = (now - gameData.lastTickTime) / 1000; // seconds
    gameData.lastTickTime = now;

    updatePhysics(gameData, deltaTime);
    checkEliminations(gameData, roomCode, io);
    checkVictoryCondition(gameData, roomCode, io);
  }, 1000 / CONSTANTS.TICK_RATE);
  game.gameLoop = gameLoop;

  // State sync (30 Hz)
  const syncLoop = setInterval(() => {
    // Validate this loop is still current
    const currentGame = activeGames.get(roomCode);
    if (!currentGame || currentGame.gameData !== gameData) {
      console.log(`[Bumper] Sync loop ${roomCode} is stale, exiting`);
      clearInterval(syncLoop);
      return;
    }

    // Keep lobby.gameData in sync
    if (game.lobby) {
      game.lobby.gameData = gameData;
    }
    io.to(roomCode).emit('bumper:state-update', { gameData: sanitizeGameData(gameData) });
  }, 1000 / CONSTANTS.SYNC_RATE);
  game.syncLoop = syncLoop;
}

// ============================================================================
// PHYSICS ENGINE
// ============================================================================

function updatePhysics(gameData: BumperBallsGameData, deltaTime: number): void {
  for (const player of gameData.players) {
    if (player.isEliminated) continue;

    // Update survival time
    player.survivalTime += deltaTime * 1000;

    // Apply input forces
    applyPlayerInput(player, deltaTime);

    // Update stamina
    updateStamina(player, deltaTime);

    // Apply gravity
    player.acceleration.y = -CONSTANTS.GRAVITY;

    // Update velocity
    player.velocity.x += player.acceleration.x * deltaTime;
    player.velocity.y += player.acceleration.y * deltaTime;
    player.velocity.z += player.acceleration.z * deltaTime;

    // Apply friction
    player.velocity.x *= CONSTANTS.FRICTION;
    player.velocity.z *= CONSTANTS.FRICTION;

    // Clamp velocity
    const maxVel = player.isSprinting ? CONSTANTS.SPRINT_MAX_VELOCITY : CONSTANTS.MAX_VELOCITY;
    const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.z ** 2);
    if (speed > maxVel) {
      player.velocity.x = (player.velocity.x / speed) * maxVel;
      player.velocity.z = (player.velocity.z / speed) * maxVel;
    }

    // Update position
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    player.position.z += player.velocity.z * deltaTime;

    // Check if player is on the platform (within platform radius)
    const distFromCenter = Math.sqrt(player.position.x ** 2 + player.position.z ** 2);
    const isOnPlatform = distFromCenter <= CONSTANTS.PLATFORM_RADIUS;

    // Only keep player at spawn height if they're ON the platform
    // If they're off the platform, let them fall!
    if (isOnPlatform && player.position.y < CONSTANTS.SPAWN_HEIGHT) {
      player.position.y = CONSTANTS.SPAWN_HEIGHT;
      player.velocity.y = 0;
    }

    // Debug logging for falling players
    if (!isOnPlatform && player.position.y < 0) {
      console.log(`[Physics] ${player.name} is falling! Pos: (${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)}), Dist: ${distFromCenter.toFixed(2)}`);
    }

    // Reset acceleration
    player.acceleration.x = 0;
    player.acceleration.z = 0;
  }

  // Check collisions between all players
  checkCollisions(gameData);

  // Players can fall off the platform - no boundaries!
  // Elimination is handled by checkEliminations() when they fall below threshold
}

// ============================================================================
// PLAYER INPUT
// ============================================================================

function applyPlayerInput(player: PlayerBall, deltaTime: number): void {
  if (!player.lastInput) return;

  const input = player.lastInput;
  const force = player.isSprinting ? CONSTANTS.SPRINT_FORCE : CONSTANTS.MOVE_FORCE;

  player.acceleration.x = input.x * force;
  player.acceleration.z = input.z * force;
}

// ============================================================================
// STAMINA SYSTEM
// ============================================================================

function updateStamina(player: PlayerBall, deltaTime: number): void {
  if (player.isSprinting && (player.lastInput?.x !== 0 || player.lastInput?.z !== 0)) {
    // Drain stamina when sprinting and moving
    player.stamina -= CONSTANTS.STAMINA_DRAIN * deltaTime;

    if (player.stamina < 0) {
      player.stamina = 0;
      player.isSprinting = false;
    }
  } else {
    // Regenerate stamina when not sprinting
    player.stamina += CONSTANTS.STAMINA_REGEN * deltaTime;

    if (player.stamina > CONSTANTS.MAX_STAMINA) {
      player.stamina = CONSTANTS.MAX_STAMINA;
    }
  }

  // Check if can sprint
  if (player.lastInput?.sprint && player.stamina >= CONSTANTS.MIN_SPRINT_STAMINA) {
    player.isSprinting = true;
  } else {
    player.isSprinting = false;
  }
}

// ============================================================================
// COLLISION DETECTION
// ============================================================================

function checkCollisions(gameData: BumperBallsGameData): void {
  const alivePlayers = gameData.players.filter(p => !p.isEliminated);

  for (let i = 0; i < alivePlayers.length; i++) {
    for (let j = i + 1; j < alivePlayers.length; j++) {
      const p1 = alivePlayers[i];
      const p2 = alivePlayers[j];

      const dx = p2.position.x - p1.position.x;
      const dz = p2.position.z - p1.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      const minDistance = CONSTANTS.BALL_RADIUS * 2;

      if (distance < minDistance) {
        // Collision detected!
        resolveCollision(p1, p2, dx, dz, distance);
      }
    }
  }
}

function resolveCollision(
  p1: PlayerBall,
  p2: PlayerBall,
  dx: number,
  dz: number,
  distance: number
): void {
  // Normalize collision normal
  const nx = dx / distance;
  const nz = dz / distance;

  // Separate the balls
  const overlap = CONSTANTS.BALL_RADIUS * 2 - distance;
  p1.position.x -= nx * overlap * 0.5;
  p1.position.z -= nz * overlap * 0.5;
  p2.position.x += nx * overlap * 0.5;
  p2.position.z += nz * overlap * 0.5;

  // MARIO PARTY STYLE PHYSICS
  // "The faster you're going, the farther your opponent is bumped!"

  // Calculate individual speeds (momentum magnitude)
  const speed1 = Math.sqrt(p1.velocity.x ** 2 + p1.velocity.z ** 2);
  const speed2 = Math.sqrt(p2.velocity.x ** 2 + p2.velocity.z ** 2);

  // Sprint gives "effective mass" advantage - harder to knock back when sprinting
  const mass1 = p1.isSprinting ? 1.5 : 1.0;
  const mass2 = p2.isSprinting ? 1.5 : 1.0;

  // Calculate relative velocity
  const relVelX = p2.velocity.x - p1.velocity.x;
  const relVelZ = p2.velocity.z - p1.velocity.z;

  // Velocity along collision normal
  const velAlongNormal = relVelX * nx + relVelZ * nz;

  // Don't resolve if velocities are separating
  if (velAlongNormal > 0) return;

  // Base restitution (bounciness) - EXTREMELY POWERFUL for instant eliminations
  const restitution = 10.5; // 1.5x from 7.0 (was 1.8 originally)

  // Calculate impulse with mass consideration
  const totalMass = mass1 + mass2;
  const j = -(1 + restitution) * velAlongNormal / totalMass;

  // Speed-based knockback multiplier - INSANE power for maximum impact
  // "The faster you're going when you bump an opponent, the farther your opponent is bumped"
  const speedFactor1 = 1.0 + (speed1 / CONSTANTS.MAX_VELOCITY) * 9.0; // 1.5x from 6.0
  const speedFactor2 = 1.0 + (speed2 / CONSTANTS.MAX_VELOCITY) * 9.0; // 1.5x from 6.0

  // Apply asymmetric impulses based on mass and speed
  // Player 1 receives knockback based on Player 2's speed and mass
  const impulse1 = j * mass2 * speedFactor2;
  // Player 2 receives knockback based on Player 1's speed and mass
  const impulse2 = j * mass1 * speedFactor1;

  // Apply impulses
  p1.velocity.x -= impulse1 * nx;
  p1.velocity.z -= impulse1 * nz;
  p2.velocity.x += impulse2 * nx;
  p2.velocity.z += impulse2 * nz;

  // Minimum impulse for satisfying bumps (even low-speed collisions feel impactful)
  const minImpulse = 24.0; // 1.5x from 16.0 for devastating bumps
  const p1ImpulseMagnitude = Math.sqrt((impulse1 * nx) ** 2 + (impulse1 * nz) ** 2);
  const p2ImpulseMagnitude = Math.sqrt((impulse2 * nx) ** 2 + (impulse2 * nz) ** 2);

  if (p1ImpulseMagnitude < minImpulse) {
    const scale = minImpulse / (p1ImpulseMagnitude || 1);
    p1.velocity.x -= impulse1 * nx * scale;
    p1.velocity.z -= impulse1 * nz * scale;
  }

  if (p2ImpulseMagnitude < minImpulse) {
    const scale = minImpulse / (p2ImpulseMagnitude || 1);
    p2.velocity.x += impulse2 * nx * scale;
    p2.velocity.z += impulse2 * nz * scale;
  }

  // Track who hit who for elimination credit
  // The player with more speed gets credit for the hit
  const now = Date.now();
  if (speed1 > speed2) {
    p2.lastHitBy = p1.socketId;
    p2.lastHitTime = now;
  } else {
    p1.lastHitBy = p2.socketId;
    p1.lastHitTime = now;
  }
}

// ============================================================================
// ELIMINATION DETECTION
// ============================================================================

function checkEliminations(gameData: BumperBallsGameData, roomCode: string, io: any): void {
  for (const player of gameData.players) {
    if (player.isEliminated) continue;

    // Check if out of bounds (outside platform radius) - INSTANT ELIMINATION
    const distFromCenter = Math.sqrt(player.position.x ** 2 + player.position.z ** 2);
    if (distFromCenter > CONSTANTS.PLATFORM_RADIUS) {
      console.log(`[Elimination] ${player.name} went out of bounds! Distance: ${distFromCenter.toFixed(2)} (platform radius: ${CONSTANTS.PLATFORM_RADIUS})`);
      eliminatePlayer(player, gameData, roomCode, io);
      continue; // Skip other checks once eliminated
    }

    // Check if fallen below platform (secondary check)
    if (player.position.y < CONSTANTS.FALL_THRESHOLD) {
      console.log(`[Elimination] ${player.name} fell off! Y position: ${player.position.y.toFixed(2)} (threshold: ${CONSTANTS.FALL_THRESHOLD})`);
      eliminatePlayer(player, gameData, roomCode, io);
    }
  }
}

function eliminatePlayer(
  player: PlayerBall,
  gameData: BumperBallsGameData,
  roomCode: string,
  io: any
): void {
  console.log(`[Bumper] ${player.name} was eliminated!`);

  player.isEliminated = true;
  player.eliminatedAt = Date.now();

  // Credit elimination to player who last hit them (if within last 3 seconds)
  const HIT_CREDIT_WINDOW = 3000; // 3 seconds
  if (player.lastHitBy && player.lastHitTime) {
    const timeSinceHit = Date.now() - player.lastHitTime;
    if (timeSinceHit < HIT_CREDIT_WINDOW) {
      const attacker = gameData.players.find(p => p.socketId === player.lastHitBy);
      if (attacker && !attacker.isEliminated) {
        attacker.eliminations++;
        console.log(`[Bumper] ${attacker.name} gets credit for eliminating ${player.name}! (${attacker.eliminations} total KOs)`);
      }
    }
  }

  // Add to elimination order
  gameData.eliminationOrder.push(player.socketId);

  // Remove from alive players
  gameData.alivePlayers = gameData.alivePlayers.filter(id => id !== player.socketId);

  // Notify players
  io.to(roomCode).emit('bumper:player-eliminated', {
    socketId: player.socketId,
    playerName: player.name,
    remainingPlayers: gameData.alivePlayers.length,
  });
}

// ============================================================================
// VICTORY CONDITION
// ============================================================================

function checkVictoryCondition(gameData: BumperBallsGameData, roomCode: string, io: any): void {
  if (gameData.status !== 'playing') return;

  // Check if only one player remains
  if (gameData.alivePlayers.length === 1) {
    endGame(gameData, gameData.alivePlayers[0], roomCode, io);
  }

  // Check if all players eliminated (draw)
  if (gameData.alivePlayers.length === 0) {
    // Winner is last to be eliminated
    const winnerId = gameData.eliminationOrder[gameData.eliminationOrder.length - 1];
    endGame(gameData, winnerId, roomCode, io);
  }

  // Timed mode - check if time expired
  if (gameData.gameMode === 'timed') {
    const elapsed = (Date.now() - gameData.startTime) / 1000;
    const duration = 180; // 3 minutes default

    if (elapsed >= duration) {
      // Winner is player with most eliminations
      const sortedPlayers = [...gameData.players].sort((a, b) => b.eliminations - a.eliminations);
      endGame(gameData, sortedPlayers[0].socketId, roomCode, io);
    }
  }
}

// ============================================================================
// GAME END
// ============================================================================

function endGame(gameData: BumperBallsGameData, winnerId: string, roomCode: string, io: any): void {
  console.log(`[Bumper] Game ended! Winner: ${winnerId}`);

  gameData.status = 'ended';
  gameData.winnerId = winnerId;

  const winner = gameData.players.find(p => p.socketId === winnerId);

  // Stop game loops
  const game = activeGames.get(roomCode);
  if (game) {
    if (game.gameLoop) clearInterval(game.gameLoop);
    if (game.syncLoop) clearInterval(game.syncLoop);
    if (game.cleanupTimeout) clearTimeout(game.cleanupTimeout);

    // Increment winner's score in lobby
    if (game.lobby && game.lobby.players) {
      const lobbyWinner = game.lobby.players.find((p: any) => p.socketId === winnerId);
      if (lobbyWinner) {
        lobbyWinner.score = (lobbyWinner.score || 0) + 1;
        console.log(`[Bumper] ${lobbyWinner.name} score: ${lobbyWinner.score}`);

        // Emit lobby update with new scores
        io.to(roomCode).emit('lobby:player-list-update', {
          players: game.lobby.players.map((p: any) => ({
            socketId: p.socketId,
            name: p.name,
            score: p.score || 0,
            connected: p.connected,
            isHost: p.isHost,
          }))
        });
      }
    }
  }

  // Calculate final scores
  const finalScores = gameData.players.map((player, index) => {
    let place = 1;
    if (player.isEliminated) {
      place = gameData.players.length - gameData.eliminationOrder.indexOf(player.socketId);
    }

    let score = 0;
    if (place === 1) score = 100;
    else if (place === 2) score = 75;
    else if (place === 3) score = 50;
    else if (place === 4) score = 25;
    else score = 10;

    return {
      socketId: player.socketId,
      name: player.name,
      place,
      score,
      eliminations: player.eliminations,
      survivalTime: player.survivalTime,
    };
  });

  // Notify all players
  io.to(roomCode).emit('bumper:game-end', {
    winnerId,
    winnerName: winner?.name || 'Unknown',
    finalScores,
    gameData: sanitizeGameData(gameData),
  });

  // Clean up
  const cleanupTimeout = setTimeout(() => {
    activeGames.delete(roomCode);
  }, 10000); // Clean up after 10 seconds

  if (game) {
    game.cleanupTimeout = cleanupTimeout;
  }
}

// ============================================================================
// SOCKET EVENT HANDLERS
// ============================================================================

/**
 * Add these handlers to your server.ts socket.on() block:
 */

export function setupBumperBallsHandlers(io: any, socket: any): void {
  // Player movement
  socket.on('bumper:move', (data: { roomCode: string; movement: MovementInput }) => {
    const game = activeGames.get(data.roomCode);
    if (!game) return;

    const player = game.gameData.players.find(p => p.socketId === socket.id);
    if (!player || player.isEliminated) return;

    player.lastInput = data.movement;
  });

  // Manual game end (host only)
  socket.on('game:end', (data: { roomCode: string }) => {
    const game = activeGames.get(data.roomCode);
    if (!game) return;

    // TODO: Verify socket is host

    // End with current leader
    const sortedPlayers = [...game.gameData.players].sort((a, b) => b.eliminations - a.eliminations);
    endGame(game.gameData, sortedPlayers[0].socketId, data.roomCode, io);
  });

  // Restart game (host only)
  socket.on('bumper:restart', (data: { roomCode: string }) => {
    console.log(`[Bumper] Restart requested by ${socket.id} for room ${data.roomCode}`);

    const game = activeGames.get(data.roomCode);
    if (!game || !game.lobby) {
      console.log(`[Bumper] Game or lobby not found for room ${data.roomCode}`);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    const lobby = game.lobby;

    // Verify socket is host
    if (lobby.hostId !== socket.id) {
      console.log(`[Bumper] Socket ${socket.id} is not host (${lobby.hostId}), restart denied`);
      socket.emit('error', { message: 'Only host can restart the game' });
      return;
    }

    console.log(`[Bumper] Cleaning up intervals for ${data.roomCode}`);
    // Clear all intervals and timeouts
    if (game.gameLoop) {
      clearInterval(game.gameLoop);
      game.gameLoop = null;
    }
    if (game.syncLoop) {
      clearInterval(game.syncLoop);
      game.syncLoop = null;
    }
    if (game.countdownInterval) {
      clearInterval(game.countdownInterval);
      game.countdownInterval = null;
    }
    if (game.cleanupTimeout) {
      clearTimeout(game.cleanupTimeout);
      game.cleanupTimeout = null;
    }

    // Reset game data (DON'T delete the game object)
    console.log(`[Bumper] Resetting game data for ${data.roomCode}`);
    console.log(`[Bumper DEBUG] Before reset - game.gameData reference:`, game.gameData ? 'exists' : 'null');
    const players: PlayerBall[] = lobby.players.map((player: any, index: number) => {
      const angle = (index / lobby.players.length) * Math.PI * 2;
      const spawnX = Math.cos(angle) * CONSTANTS.SPAWN_RADIUS;
      const spawnZ = Math.sin(angle) * CONSTANTS.SPAWN_RADIUS;

      return {
        socketId: player.socketId,
        name: player.name,
        color: CONSTANTS.PLAYER_COLORS[index % CONSTANTS.PLAYER_COLORS.length],
        position: { x: spawnX, y: CONSTANTS.SPAWN_HEIGHT, z: spawnZ },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        acceleration: { x: 0, y: 0, z: 0 },
        isEliminated: false,
        stamina: CONSTANTS.MAX_STAMINA,
        isSprinting: false,
        eliminations: 0,
        survivalTime: 0,
        lastInput: { x: 0, z: 0, sprint: false },
      };
    });

    const newGameData: BumperBallsGameData = {
      status: 'countdown',
      countdownValue: CONSTANTS.COUNTDOWN_DURATION,
      startTime: Date.now(),
      gameMode: lobby.settings?.gameMode || 'classic',
      players,
      alivePlayers: players.map(p => p.socketId),
      eliminationOrder: [],
      lastTickTime: Date.now(),
    };

    // Update the existing game object
    const oldGameDataRef = game.gameData;
    game.gameData = newGameData;
    lobby.gameData = newGameData;
    console.log(`[Bumper DEBUG] After reset - oldGameData === newGameData:`, oldGameDataRef === newGameData);
    console.log(`[Bumper DEBUG] After reset - game.gameData === newGameData:`, game.gameData === newGameData);

    // Emit game started
    io.to(lobby.code).emit('game:started', {
      lobby: {
        code: lobby.code,
        hostId: lobby.hostId,
        settings: lobby.settings,
        players: lobby.players.map((p: any) => ({
          socketId: p.socketId,
          name: p.name,
          score: p.score,
          connected: p.connected,
          isHost: p.isHost,
        })),
        state: lobby.state,
        gameData: newGameData,
        isGameBuddiesRoom: lobby.isGameBuddiesRoom,
      },
    });

    // Start countdown
    startCountdown(lobby.code, newGameData, io);
    console.log(`[Bumper] Restart complete for ${data.roomCode}`);
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

function sanitizeGameData(gameData: BumperBallsGameData): any {
  // Remove server-only fields before sending to clients
  return {
    ...gameData,
    players: gameData.players.map(p => ({
      socketId: p.socketId,
      name: p.name,
      color: p.color,
      position: p.position,
      velocity: p.velocity,
      rotation: p.rotation,
      isEliminated: p.isEliminated,
      stamina: p.stamina,
      isSprinting: p.isSprinting,
      eliminations: p.eliminations,
      survivalTime: p.survivalTime,
    })),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

// Functions are exported inline above (export function initializeBumperBallsGame, etc.)

/**
 * INTEGRATION INSTRUCTIONS:
 *
 * In your server/server.ts file:
 *
 * 1. Import these functions at the top:
 *    import { initializeBumperBallsGame, setupBumperBallsHandlers } from './bumper-balls-logic';
 *
 * 2. In the 'game:start' event handler, call:
 *    initializeBumperBallsGame(lobby, io);
 *
 * 3. In the socket connection handler, add:
 *    setupBumperBallsHandlers(io, socket);
 *
 * 4. Make sure your Lobby interface includes the game data:
 *    gameData: BumperBallsGameData | null;
 */
