import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Lobby, GameData, PlayerShip, Alien, Bullet, PowerUp, Particle, InputState, PowerUpType } from '../types';
import type { Socket } from 'socket.io-client';
import GameBuddiesReturnButton from './GameBuddiesReturnButton';
import GameLayout from './GameLayout';

/**
 * Space Invaders Battle - Game Component
 *
 * A competitive multiplayer space shooter where players compete for high scores
 * by destroying waves of alien invaders.
 */

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

interface GameComponentProps {
  lobby: Lobby;
  socket: Socket;
}

const GameComponent: React.FC<GameComponentProps> = ({ lobby, socket }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const inputStateRef = useRef<InputState>({ left: false, right: false, shoot: false });
  const lastMoveEmitRef = useRef<number>(0);
  const lastShootEmitRef = useRef<number>(0);

  const [gameData, setGameData] = useState<GameData | null>(null);
  const [scores, setScores] = useState<{ [socketId: string]: number }>({});
  const [waveMessage, setWaveMessage] = useState<string>('');
  const [showControls, setShowControls] = useState(true);

  const currentPlayer = lobby.players.find(p => p.socketId === lobby.mySocketId);
  const isHost = currentPlayer?.isHost || false;

  // Socket event listeners
  useEffect(() => {
    socket.on('game:state-update', (data: { gameData: GameData; scores: { [socketId: string]: number } }) => {
      setGameData(data.gameData);
      setScores(data.scores);
    });

    socket.on('game:wave-complete', (data: { wave: number; nextWaveIn: number }) => {
      setWaveMessage(`Wave ${data.wave} Complete! Next wave in ${data.nextWaveIn}s...`);
      setTimeout(() => setWaveMessage(''), data.nextWaveIn * 1000);
    });

    socket.on('game:player-hit', (data: { socketId: string; livesRemaining: number }) => {
      if (data.socketId === lobby.mySocketId) {
        // Flash screen red or show damage indicator
        console.log(`You were hit! ${data.livesRemaining} lives remaining`);
      }
    });

    socket.on('game:power-up-collected', (data: { socketId: string; type: PowerUpType }) => {
      console.log(`Power-up collected: ${data.type}`);
    });

    socket.on('game:game-over', (data: { winner: string; finalScores: { socketId: string; name: string; score: number }[] }) => {
      const winnerInfo = data.finalScores.find(s => s.socketId === data.winner);
      setWaveMessage(`Game Over! Winner: ${winnerInfo?.name} with ${winnerInfo?.score} points!`);
    });

    return () => {
      socket.off('game:state-update');
      socket.off('game:wave-complete');
      socket.off('game:player-hit');
      socket.off('game:power-up-collected');
      socket.off('game:game-over');
    };
  }, [socket, lobby.mySocketId]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        inputStateRef.current.left = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        inputStateRef.current.right = true;
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        inputStateRef.current.shoot = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        inputStateRef.current.left = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        inputStateRef.current.right = false;
      }
      if (e.key === ' ' || e.key === 'Spacebar') {
        inputStateRef.current.shoot = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Input emission to server (throttled)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();

      // Emit movement
      if (inputStateRef.current.left || inputStateRef.current.right) {
        if (now - lastMoveEmitRef.current > 50) { // 20 times per second
          const direction = inputStateRef.current.left ? 'left' : 'right';
          socket.emit('game:player-move', { roomCode: lobby.code, direction });
          lastMoveEmitRef.current = now;
        }
      } else {
        if (now - lastMoveEmitRef.current > 50) {
          socket.emit('game:player-move', { roomCode: lobby.code, direction: 'stop' });
          lastMoveEmitRef.current = now;
        }
      }

      // Emit shooting
      if (inputStateRef.current.shoot) {
        if (now - lastShootEmitRef.current > 200) { // Max 5 shots per second
          socket.emit('game:player-shoot', { roomCode: lobby.code });
          lastShootEmitRef.current = now;
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [socket, lobby.code]);

  // Game rendering
  useEffect(() => {
    if (!gameData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#0a0e1a';
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Draw stars background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      for (let i = 0; i < 50; i++) {
        const x = (i * 123) % GAME_WIDTH;
        const y = (i * 321) % GAME_HEIGHT;
        ctx.fillRect(x, y, 2, 2);
      }

      // Draw particles (explosions)
      gameData.particles.forEach(particle => {
        const alpha = particle.life / particle.maxLife;
        ctx.fillStyle = particle.color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
        ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
      });

      // Draw power-ups
      gameData.powerUps.forEach(powerUp => {
        const emoji = getPowerUpEmoji(powerUp.type);
        ctx.font = '20px Arial';
        ctx.fillText(emoji, powerUp.x, powerUp.y);

        // Glow effect
        ctx.strokeStyle = getPowerUpColor(powerUp.type);
        ctx.lineWidth = 2;
        ctx.strokeRect(powerUp.x - 2, powerUp.y - 22, 24, 24);
      });

      // Draw aliens
      gameData.aliens.forEach(alien => {
        ctx.fillStyle = getAlienColor(alien.type);
        ctx.fillRect(alien.x, alien.y, 30, 30);

        // Draw alien eyes
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(alien.x + 8, alien.y + 10, 6, 6);
        ctx.fillRect(alien.x + 16, alien.y + 10, 6, 6);
      });

      // Draw bullets
      gameData.bullets.forEach(bullet => {
        const owner = gameData.playerShips.find(p => p.socketId === bullet.ownerId);
        ctx.fillStyle = owner?.color || '#ffff00';
        ctx.fillRect(bullet.x, bullet.y, 4, 15);

        // Bullet trail
        ctx.fillStyle = `${owner?.color || '#ffff00'}33`;
        ctx.fillRect(bullet.x - 1, bullet.y + 15, 6, 10);
      });

      // Draw player ships
      gameData.playerShips.forEach(ship => {
        // Shield effect
        if (ship.powerUps.shield > Date.now()) {
          ctx.strokeStyle = '#00ffff';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(ship.x + 20, ship.y + 15, 25, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Ship body
        ctx.fillStyle = ship.color;
        ctx.fillRect(ship.x, ship.y, 40, 30);

        // Ship cockpit
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ship.x + 15, ship.y + 5, 10, 10);

        // Ship name
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(ship.name, ship.x + 20, ship.y - 5);

        // Lives indicator
        ctx.fillText(`❤️ ${ship.lives}`, ship.x + 20, ship.y + 45);

        // Active power-ups indicator
        const activePowerUps: string[] = [];
        if (ship.powerUps.rapidFire > Date.now()) activePowerUps.push('🔫');
        if (ship.powerUps.multiShot > Date.now()) activePowerUps.push('💥');
        if (ship.powerUps.scoreMultiplier > Date.now()) activePowerUps.push('⭐');

        if (activePowerUps.length > 0) {
          ctx.fillText(activePowerUps.join(' '), ship.x + 20, ship.y - 15);
        }
      });

      // Draw wave info
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`Wave ${gameData.currentWave}/${gameData.maxWaves}`, GAME_WIDTH / 2, 40);

      // Draw time remaining (timed mode)
      if (gameData.gameMode === 'timed' && gameData.gameDuration) {
        const elapsed = Math.floor((Date.now() - gameData.gameStartTime) / 1000);
        const remaining = Math.max(0, gameData.gameDuration - elapsed);
        ctx.fillText(`Time: ${remaining}s`, GAME_WIDTH / 2, 70);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameData]);

  // Helper functions for rendering
  const getAlienColor = (type: string): string => {
    switch (type) {
      case 'small': return '#ff4444';
      case 'medium': return '#ff8844';
      case 'large': return '#ff44ff';
      case 'ufo': return '#44ff44';
      default: return '#ff0000';
    }
  };

  const getPowerUpEmoji = (type: PowerUpType): string => {
    switch (type) {
      case 'rapidFire': return '🔫';
      case 'multiShot': return '💥';
      case 'scoreMultiplier': return '⭐';
      case 'shield': return '🛡️';
      default: return '❓';
    }
  };

  const getPowerUpColor = (type: PowerUpType): string => {
    switch (type) {
      case 'rapidFire': return '#ff4444';
      case 'multiShot': return '#ffaa00';
      case 'scoreMultiplier': return '#ffff00';
      case 'shield': return '#00ffff';
      default: return '#ffffff';
    }
  };

  // Touch controls for mobile
  const handleTouchLeft = () => {
    inputStateRef.current.left = true;
    setTimeout(() => { inputStateRef.current.left = false; }, 100);
  };

  const handleTouchRight = () => {
    inputStateRef.current.right = true;
    setTimeout(() => { inputStateRef.current.right = false; }, 100);
  };

  const handleTouchShoot = () => {
    inputStateRef.current.shoot = true;
    setTimeout(() => { inputStateRef.current.shoot = false; }, 100);
  };

  const handleEndGame = () => {
    if (confirm('Are you sure you want to end the game?')) {
      socket.emit('game:end', { roomCode: lobby.code });
    }
  };

  return (
    <GameLayout lobby={lobby} socket={socket}>
      <div className="container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center' }}>🚀 Space Invaders Battle</h1>

      {/* Wave message overlay */}
      {waveMessage && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.9)',
          color: '#ffff00',
          padding: '30px 50px',
          borderRadius: '15px',
          fontSize: '32px',
          fontWeight: 'bold',
          zIndex: 1000,
          textAlign: 'center',
          border: '3px solid #ffff00'
        }}>
          {waveMessage}
        </div>
      )}

      {/* Game canvas */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          style={{
            border: '3px solid #4a5568',
            borderRadius: '10px',
            background: '#0a0e1a',
            maxWidth: '100%',
            height: 'auto'
          }}
        />
      </div>

      {/* Scores */}
      <div style={{ marginTop: '20px' }}>
        <h3>Scores</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {lobby.players.map(player => {
            const ship = gameData?.playerShips.find(s => s.socketId === player.socketId);
            const score = scores[player.socketId] || 0;
            return (
              <div
                key={player.socketId}
                style={{
                  background: ship?.color || '#4a5568',
                  color: '#fff',
                  padding: '10px 15px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  flex: '1',
                  minWidth: '150px',
                  textAlign: 'center'
                }}
              >
                <div>{player.name}</div>
                <div style={{ fontSize: '24px' }}>{score}</div>
                {ship && <div style={{ fontSize: '12px' }}>❤️ {ship.lives}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Controls */}
      <div style={{ marginTop: '20px' }}>
        <button
          onClick={() => setShowControls(!showControls)}
          style={{ width: '100%', marginBottom: '10px' }}
        >
          {showControls ? 'Hide' : 'Show'} Controls
        </button>

        {showControls && (
          <div style={{
            background: '#f8f9fa',
            padding: '15px',
            borderRadius: '8px',
            fontSize: '14px'
          }}>
            <strong>Desktop:</strong> Arrow Keys or A/D to move, Spacebar to shoot<br />
            <strong>Mobile:</strong> Use buttons below
          </div>
        )}

        {/* Mobile touch controls */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <button
            onTouchStart={handleTouchLeft}
            onClick={handleTouchLeft}
            style={{ flex: 1, padding: '20px', fontSize: '24px' }}
          >
            ⬅️
          </button>
          <button
            onTouchStart={handleTouchShoot}
            onClick={handleTouchShoot}
            style={{ flex: 2, padding: '20px', fontSize: '24px', background: '#ff4444', color: '#fff' }}
          >
            🔥 FIRE
          </button>
          <button
            onTouchStart={handleTouchRight}
            onClick={handleTouchRight}
            style={{ flex: 1, padding: '20px', fontSize: '24px' }}
          >
            ➡️
          </button>
        </div>
      </div>

      {/* Host controls */}
      {isHost && (
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={handleEndGame}
            className="danger"
            style={{ width: '100%' }}
          >
            End Game
          </button>
        </div>
      )}

        {/* GameBuddies Return Button */}
        {lobby.isGameBuddiesRoom && (
          <GameBuddiesReturnButton roomCode={lobby.code} socket={socket} />
        )}
      </div>
    </GameLayout>
  );
};

export default GameComponent;
