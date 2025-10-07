/**
 * Space Invaders Battle - Server Logic
 * Add this code to server/server.ts inside the io.on('connection') handler
 */

import type { GameData, PlayerShip, Alien, Bullet, PowerUp, Particle, AlienType, PowerUpType } from './types';

// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLAYER_SHIP_WIDTH = 40;
const PLAYER_SHIP_HEIGHT = 30;
const PLAYER_SPEED = 5;
const BULLET_SPEED = 8;
const ALIEN_WIDTH = 30;
const ALIEN_HEIGHT = 30;
const POWERUP_SIZE = 25;
const POWERUP_DROP_CHANCE = 0.15; // 15% chance

// Player colors
const PLAYER_COLORS = ['#00ff00', '#0088ff', '#ff00ff', '#ffaa00', '#ff0000', '#00ffff'];

// Game loop interval (60 ticks per second)
let gameLoopIntervals: Map<string, NodeJS.Timeout> = new Map();

/**
 * Initialize game when host starts it
 */
socket.on('game:start', (data: { roomCode: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || lobby.hostSocketId !== socket.id) return;

  // Initialize game data
  const gameData: GameData = {
    currentWave: 1,
    maxWaves: lobby.settings.maxWaves || 5,
    playerShips: initializePlayerShips(lobby),
    aliens: [],
    bullets: [],
    powerUps: [],
    particles: [],
    alienDirection: 1,
    alienSpeed: getAlienSpeed(1, lobby.settings.difficulty),
    alienMoveDown: false,
    waveStartTime: Date.now(),
    gameStartTime: Date.now(),
    gameMode: lobby.settings.gameMode || 'waves',
    gameDuration: lobby.settings.gameDuration || 300,
    difficulty: lobby.settings.difficulty || 'medium',
    gameOver: false,
  };

  // Spawn first wave
  spawnWave(gameData, 1);

  lobby.gameData = gameData;
  lobby.state = 'PLAYING';

  // Initialize scores
  lobby.players.forEach(player => {
    lobby.scores[player.socketId] = 0;
  });

  io.to(lobby.code).emit('game:started', { lobby });

  // Start game loop
  startGameLoop(lobby.code);
});

/**
 * Player movement
 */
socket.on('game:player-move', (data: { roomCode: string; direction: 'left' | 'right' | 'stop' }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || !lobby.gameData) return;

  const ship = lobby.gameData.playerShips.find(s => s.socketId === socket.id);
  if (!ship) return;

  if (data.direction === 'left') {
    ship.velocityX = -PLAYER_SPEED;
  } else if (data.direction === 'right') {
    ship.velocityX = PLAYER_SPEED;
  } else {
    ship.velocityX = 0;
  }
});

/**
 * Player shooting
 */
socket.on('game:player-shoot', (data: { roomCode: string }) => {
  const lobby = lobbies.get(data.roomCode);
  if (!lobby || !lobby.gameData) return;

  const ship = lobby.gameData.playerShips.find(s => s.socketId === socket.id);
  if (!ship) return;

  const now = Date.now();
  const fireRate = ship.powerUps.rapidFire > now ? 100 : 300; // Faster with rapid fire

  if (now - ship.lastShotTime < fireRate) return;

  ship.lastShotTime = now;

  // Check if multi-shot is active
  const multiShot = ship.powerUps.multiShot > now;

  if (multiShot) {
    // Fire 3 bullets
    createBullet(lobby.gameData, ship, -10);
    createBullet(lobby.gameData, ship, 0);
    createBullet(lobby.gameData, ship, 10);
  } else {
    // Fire 1 bullet
    createBullet(lobby.gameData, ship, 0);
  }
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
// GAME LOOP
// ============================================================================

function startGameLoop(roomCode: string) {
  // Clear existing loop if any
  if (gameLoopIntervals.has(roomCode)) {
    clearInterval(gameLoopIntervals.get(roomCode)!);
  }

  const interval = setInterval(() => {
    const lobby = lobbies.get(roomCode);
    if (!lobby || !lobby.gameData || lobby.gameData.gameOver) {
      clearInterval(interval);
      gameLoopIntervals.delete(roomCode);
      return;
    }

    updateGame(lobby);

    // Broadcast state (20 times per second, not every tick)
    if (Date.now() % 50 < 17) {
      io.to(roomCode).emit('game:state-update', {
        gameData: lobby.gameData,
        scores: lobby.scores,
      });
    }
  }, 1000 / 60); // 60 ticks per second

  gameLoopIntervals.set(roomCode, interval);
}

function updateGame(lobby: Lobby) {
  const gameData = lobby.gameData!;

  // Check timed mode end condition
  if (gameData.gameMode === 'timed' && gameData.gameDuration) {
    const elapsed = (Date.now() - gameData.gameStartTime) / 1000;
    if (elapsed >= gameData.gameDuration) {
      endGame(lobby);
      return;
    }
  }

  // Update player ships
  gameData.playerShips.forEach(ship => {
    ship.x += ship.velocityX;
    ship.x = Math.max(0, Math.min(GAME_WIDTH - PLAYER_SHIP_WIDTH, ship.x));
  });

  // Update bullets
  gameData.bullets.forEach(bullet => {
    bullet.y += bullet.velocityY;
  });

  // Remove off-screen bullets
  gameData.bullets = gameData.bullets.filter(b => b.y > -20 && b.y < GAME_HEIGHT + 20);

  // Update power-ups
  gameData.powerUps.forEach(powerUp => {
    powerUp.y += powerUp.velocityY;
  });

  // Remove off-screen power-ups
  gameData.powerUps = gameData.powerUps.filter(p => p.y < GAME_HEIGHT);

  // Update particles
  gameData.particles.forEach(particle => {
    particle.x += particle.velocityX;
    particle.y += particle.velocityY;
    particle.life--;
  });

  // Remove dead particles
  gameData.particles = gameData.particles.filter(p => p.life > 0);

  // Update aliens
  updateAliens(gameData);

  // Check collisions
  checkBulletAlienCollisions(lobby);
  checkPlayerPowerUpCollisions(lobby);
  checkAlienPlayerCollisions(lobby);

  // Check wave completion
  if (gameData.aliens.length === 0 && !gameData.gameOver) {
    completeWave(lobby);
  }

  // Check game over conditions
  checkGameOverConditions(lobby);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function initializePlayerShips(lobby: Lobby): PlayerShip[] {
  const ships: PlayerShip[] = [];
  const spacing = GAME_WIDTH / (lobby.players.length + 1);

  lobby.players.forEach((player, index) => {
    ships.push({
      socketId: player.socketId,
      name: player.name,
      x: spacing * (index + 1) - PLAYER_SHIP_WIDTH / 2,
      y: GAME_HEIGHT - 60,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      lives: 3,
      powerUps: {
        rapidFire: 0,
        multiShot: 0,
        scoreMultiplier: 0,
        shield: 0,
      },
      lastShotTime: 0,
      velocityX: 0,
    });
  });

  return ships;
}

function spawnWave(gameData: GameData, wave: number) {
  const aliens: Alien[] = [];
  const rows = Math.min(3 + Math.floor(wave / 2), 6);
  const cols = Math.min(8 + wave, 12);
  const startX = (GAME_WIDTH - cols * 40) / 2;
  const startY = 80;

  let id = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const type: AlienType = row === 0 ? 'large' : row === 1 ? 'medium' : 'small';
      const health = type === 'large' ? 3 : type === 'medium' ? 2 : 1;

      aliens.push({
        id: `alien-${wave}-${id++}`,
        x: startX + col * 40,
        y: startY + row * 40,
        type,
        health,
        row,
        col,
      });
    }
  }

  // Occasional UFO spawn
  if (Math.random() < 0.3) {
    aliens.push({
      id: `ufo-${wave}`,
      x: 0,
      y: 40,
      type: 'ufo',
      health: 1,
      row: -1,
      col: -1,
    });
  }

  gameData.aliens = aliens;
  gameData.alienDirection = 1;
  gameData.alienMoveDown = false;
}

function getAlienSpeed(wave: number, difficulty: string): number {
  const baseSpeed = difficulty === 'easy' ? 0.3 : difficulty === 'medium' ? 0.5 : 0.7;
  return baseSpeed + wave * 0.1;
}

// ============================================================================
// ALIEN MOVEMENT
// ============================================================================

function updateAliens(gameData: GameData) {
  let shouldMoveDown = false;
  const speed = gameData.alienSpeed;

  gameData.aliens.forEach(alien => {
    // UFOs move horizontally across the screen
    if (alien.type === 'ufo') {
      alien.x += 2;
      if (alien.x > GAME_WIDTH) {
        alien.health = 0; // Mark for removal
      }
      return;
    }

    // Regular aliens move in formation
    alien.x += speed * gameData.alienDirection;

    // Check if any alien hit the edge
    if (alien.x <= 0 || alien.x >= GAME_WIDTH - ALIEN_WIDTH) {
      shouldMoveDown = true;
    }
  });

  // Move down and reverse direction
  if (shouldMoveDown) {
    gameData.alienDirection *= -1;
    gameData.aliens.forEach(alien => {
      if (alien.type !== 'ufo') {
        alien.y += 20;
      }
    });
  }

  // Remove dead aliens (UFOs that went off screen)
  gameData.aliens = gameData.aliens.filter(a => a.health > 0);
}

// ============================================================================
// COLLISIONS
// ============================================================================

function checkBulletAlienCollisions(lobby: Lobby) {
  const gameData = lobby.gameData!;
  const bulletsToRemove: string[] = [];
  const aliensToRemove: string[] = [];

  gameData.bullets.forEach(bullet => {
    gameData.aliens.forEach(alien => {
      if (
        bullet.x < alien.x + ALIEN_WIDTH &&
        bullet.x + 4 > alien.x &&
        bullet.y < alien.y + ALIEN_HEIGHT &&
        bullet.y + 15 > alien.y
      ) {
        // Hit!
        alien.health--;

        if (alien.health <= 0) {
          // Alien destroyed
          aliensToRemove.push(alien.id);

          // Award points
          const points = getAlienPoints(alien.type);
          const ship = gameData.playerShips.find(s => s.socketId === bullet.ownerId);
          const multiplier = ship && ship.powerUps.scoreMultiplier > Date.now() ? 2 : 1;

          lobby.scores[bullet.ownerId] = (lobby.scores[bullet.ownerId] || 0) + points * multiplier;

          // Update player score in lobby
          const player = lobby.players.find(p => p.socketId === bullet.ownerId);
          if (player) {
            player.score = lobby.scores[bullet.ownerId];
          }

          // Spawn explosion particles
          spawnExplosion(gameData, alien.x + ALIEN_WIDTH / 2, alien.y + ALIEN_HEIGHT / 2, '#ff0000');

          // Chance to drop power-up
          if (Math.random() < POWERUP_DROP_CHANCE) {
            spawnPowerUp(gameData, alien.x, alien.y);
          }
        }

        bulletsToRemove.push(bullet.id);
      }
    });
  });

  // Remove hit bullets and destroyed aliens
  gameData.bullets = gameData.bullets.filter(b => !bulletsToRemove.includes(b.id));
  gameData.aliens = gameData.aliens.filter(a => !aliensToRemove.includes(a.id));
}

function checkPlayerPowerUpCollisions(lobby: Lobby) {
  const gameData = lobby.gameData!;
  const powerUpsToRemove: string[] = [];

  gameData.playerShips.forEach(ship => {
    gameData.powerUps.forEach(powerUp => {
      if (
        ship.x < powerUp.x + POWERUP_SIZE &&
        ship.x + PLAYER_SHIP_WIDTH > powerUp.x &&
        ship.y < powerUp.y + POWERUP_SIZE &&
        ship.y + PLAYER_SHIP_HEIGHT > powerUp.y
      ) {
        // Power-up collected!
        activatePowerUp(ship, powerUp.type);
        powerUpsToRemove.push(powerUp.id);

        // Award points
        lobby.scores[ship.socketId] = (lobby.scores[ship.socketId] || 0) + 5;

        io.to(lobby.code).emit('game:power-up-collected', {
          socketId: ship.socketId,
          type: powerUp.type,
        });
      }
    });
  });

  gameData.powerUps = gameData.powerUps.filter(p => !powerUpsToRemove.includes(p.id));
}

function checkAlienPlayerCollisions(lobby: Lobby) {
  const gameData = lobby.gameData!;

  gameData.aliens.forEach(alien => {
    // Check if alien reached bottom
    if (alien.y + ALIEN_HEIGHT >= GAME_HEIGHT - 80) {
      // Damage all players
      gameData.playerShips.forEach(ship => {
        if (ship.powerUps.shield <= Date.now()) {
          ship.lives--;
          io.to(lobby.code).emit('game:player-hit', {
            socketId: ship.socketId,
            livesRemaining: ship.lives,
          });
        }
      });

      // Remove the alien
      alien.health = 0;
    }
  });

  gameData.aliens = gameData.aliens.filter(a => a.health > 0);
}

// ============================================================================
// HELPERS
// ============================================================================

function createBullet(gameData: GameData, ship: PlayerShip, offsetX: number) {
  gameData.bullets.push({
    id: `bullet-${Date.now()}-${Math.random()}`,
    x: ship.x + PLAYER_SHIP_WIDTH / 2 - 2 + offsetX,
    y: ship.y,
    velocityY: -BULLET_SPEED,
    ownerId: ship.socketId,
  });
}

function spawnPowerUp(gameData: GameData, x: number, y: number) {
  const types: PowerUpType[] = ['rapidFire', 'multiShot', 'scoreMultiplier', 'shield'];
  const type = types[Math.floor(Math.random() * types.length)];

  gameData.powerUps.push({
    id: `powerup-${Date.now()}-${Math.random()}`,
    x,
    y,
    type,
    velocityY: 2,
  });
}

function activatePowerUp(ship: PlayerShip, type: PowerUpType) {
  const duration = type === 'shield' ? 5000 : 10000;
  ship.powerUps[type] = Date.now() + duration;
}

function spawnExplosion(gameData: GameData, x: number, y: number, color: string) {
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10;
    const speed = 2 + Math.random() * 3;

    gameData.particles.push({
      id: `particle-${Date.now()}-${i}`,
      x,
      y,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      life: 30,
      maxLife: 30,
      color,
      size: 4,
    });
  }
}

function getAlienPoints(type: AlienType): number {
  switch (type) {
    case 'small': return 10;
    case 'medium': return 20;
    case 'large': return 30;
    case 'ufo': return 100;
    default: return 10;
  }
}

function completeWave(lobby: Lobby) {
  const gameData = lobby.gameData!;

  // Award wave completion bonus
  const bonus = 50 * gameData.currentWave;
  lobby.players.forEach(player => {
    lobby.scores[player.socketId] = (lobby.scores[player.socketId] || 0) + bonus;
    player.score = lobby.scores[player.socketId];
  });

  // Check if final wave
  if (gameData.currentWave >= gameData.maxWaves) {
    endGame(lobby);
    return;
  }

  // Start next wave
  gameData.currentWave++;
  gameData.alienSpeed = getAlienSpeed(gameData.currentWave, gameData.difficulty);
  gameData.waveStartTime = Date.now();

  // Notify players
  io.to(lobby.code).emit('game:wave-complete', {
    wave: gameData.currentWave - 1,
    nextWaveIn: 3,
  });

  // Spawn next wave after 3 seconds
  setTimeout(() => {
    if (lobby.gameData && !lobby.gameData.gameOver) {
      spawnWave(gameData, gameData.currentWave);
    }
  }, 3000);
}

function checkGameOverConditions(lobby: Lobby) {
  const gameData = lobby.gameData!;

  // Check if all players are dead
  const allDead = gameData.playerShips.every(ship => ship.lives <= 0);

  if (allDead) {
    endGame(lobby);
  }
}

function endGame(lobby: Lobby) {
  const gameData = lobby.gameData!;
  gameData.gameOver = true;

  // Determine winner
  const sortedScores = Object.entries(lobby.scores)
    .map(([socketId, score]) => {
      const player = lobby.players.find(p => p.socketId === socketId);
      return { socketId, name: player?.name || 'Unknown', score };
    })
    .sort((a, b) => b.score - a.score);

  const winner = sortedScores[0];
  gameData.winner = winner.socketId;

  // Stop game loop
  if (gameLoopIntervals.has(lobby.code)) {
    clearInterval(gameLoopIntervals.get(lobby.code)!);
    gameLoopIntervals.delete(lobby.code);
  }

  // Notify clients
  io.to(lobby.code).emit('game:game-over', {
    winner: winner.socketId,
    finalScores: sortedScores,
  });

  // Return to lobby after 10 seconds
  setTimeout(() => {
    lobby.state = 'LOBBY';
    lobby.gameData = undefined;
    io.to(lobby.code).emit('lobby:updated', { lobby });
  }, 10000);
}
