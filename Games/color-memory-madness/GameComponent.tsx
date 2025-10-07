import React, { useState, useEffect, useRef } from 'react';
import type { Lobby, GameData, ColorType, GamePhase, PlayerProgress, GameResults } from '../types';
import type { Socket } from 'socket.io-client';
import GameBuddiesReturnButton from './GameBuddiesReturnButton';
import GameLayout from './GameLayout';

/**
 * Color Memory Madness - Game Component
 *
 * A Simon Says-style memory game where players recreate color sequences.
 */

const COLOR_DEFINITIONS = {
  red: { hex: '#ef4444', tone: 261.63, symbol: '●' },
  blue: { hex: '#3b82f6', tone: 293.66, symbol: '■' },
  green: { hex: '#22c55e', tone: 329.63, symbol: '▲' },
  yellow: { hex: '#f59e0b', tone: 349.23, symbol: '★' },
  purple: { hex: '#a855f7', tone: 392.00, symbol: '♦' },
  orange: { hex: '#f97316', tone: 440.00, symbol: '✖' },
};

interface GameComponentProps {
  lobby: Lobby;
  socket: Socket;
}

const GameComponent: React.FC<GameComponentProps> = ({ lobby, socket }) => {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [currentlyLit, setCurrentlyLit] = useState<ColorType | null>(null);
  const [gameResults, setGameResults] = useState<GameResults | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentPlayer = lobby.players.find(p => p.socketId === lobby.mySocketId);
  const isHost = currentPlayer?.isHost || false;
  const myProgress = gameData?.playerProgress[lobby.mySocketId];

  // Initialize audio context
  useEffect(() => {
    if (gameData?.soundEnabled && !audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, [gameData?.soundEnabled]);

  // Socket event listeners
  useEffect(() => {
    socket.on('game:state-update', (data: { gameData: GameData }) => {
      setGameData(data.gameData);
    });

    socket.on('game:phase-changed', (data: { phase: GamePhase }) => {
      console.log('Phase:', data.phase);
    });

    socket.on('game:round-started', (data: { round: any }) => {
      console.log('Round', data.round.roundNumber, 'started');
    });

    socket.on('game:sequence-display', (data: { colorIndex: number; color: ColorType }) => {
      setCurrentlyLit(data.color);
      playTone(data.color);

      // Turn off after display time
      setTimeout(() => {
        setCurrentlyLit(null);
      }, gameData?.currentRound?.displayTime || 1000);
    });

    socket.on('game:replay-phase-started', (data: { timeLimit: number }) => {
      setTimeRemaining(data.timeLimit);
      startTimer(data.timeLimit);
    });

    socket.on('game:player-progress-updated', (data: { socketId: string; progress: PlayerProgress }) => {
      console.log('Player progress:', data.socketId, data.progress);
    });

    socket.on('game:player-mistake', (data: { socketId: string; expectedColor: ColorType; selectedColor: ColorType }) => {
      if (data.socketId === lobby.mySocketId) {
        // Visual feedback for mistake
        console.log(`Wrong! Expected ${data.expectedColor}, got ${data.selectedColor}`);
      }
    });

    socket.on('game:player-eliminated', (data: { socketId: string; reason: string }) => {
      console.log('Player eliminated:', data.socketId, data.reason);
    });

    socket.on('game:player-completed', (data: { socketId: string; time: number; isFirst: boolean }) => {
      console.log('Player completed:', data.socketId, data.time, 'ms', data.isFirst ? '(FIRST!)' : '');
    });

    socket.on('game:round-ended', (data: { scores: any; survivors: string[] }) => {
      console.log('Round ended. Survivors:', data.survivors.length);
      stopTimer();
    });

    socket.on('game:game-over', (data: GameResults) => {
      setGameResults(data);
      stopTimer();
    });

    return () => {
      socket.off('game:state-update');
      socket.off('game:phase-changed');
      socket.off('game:round-started');
      socket.off('game:sequence-display');
      socket.off('game:replay-phase-started');
      socket.off('game:player-progress-updated');
      socket.off('game:player-mistake');
      socket.off('game:player-eliminated');
      socket.off('game:player-completed');
      socket.off('game:round-ended');
      socket.off('game:game-over');
    };
  }, [socket, lobby.mySocketId, gameData]);

  // Timer management
  const startTimer = (seconds: number) => {
    stopTimer();

    let remaining = seconds;
    setTimeRemaining(remaining);

    timerIntervalRef.current = setInterval(() => {
      remaining--;
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        stopTimer();
      }
    }, 1000);
  };

  const stopTimer = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Play tone for color
  const playTone = (color: ColorType) => {
    if (!gameData?.soundEnabled || !audioContextRef.current) return;

    const ctx = audioContextRef.current;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = COLOR_DEFINITIONS[color].tone;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  };

  // Handle color button click
  const handleColorClick = (color: ColorType) => {
    if (!gameData || gameData.phase !== 'replaying') return;
    if (myProgress?.isEliminated || myProgress?.isComplete) return;

    // Play tone
    playTone(color);

    // Visual feedback
    setCurrentlyLit(color);
    setTimeout(() => setCurrentlyLit(null), 200);

    // Send to server
    socket.emit('game:color-selected', {
      roomCode: lobby.code,
      color,
    });
  };

  // Handle keyboard input
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const keyMap: { [key: string]: ColorType } = {
        '1': 'red',
        '2': 'blue',
        '3': 'green',
        '4': 'yellow',
        '5': 'purple',
        '6': 'orange',
      };

      const color = keyMap[e.key];
      if (color) {
        handleColorClick(color);
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => window.removeEventListener('keypress', handleKeyPress);
  }, [gameData, myProgress]);

  // Get available colors based on game settings
  const getAvailableColors = (): ColorType[] => {
    const allColors: ColorType[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
    return allColors.slice(0, gameData?.colorCount || 4);
  };

  // Render color buttons
  const renderColorButtons = () => {
    const colors = getAvailableColors();
    const isReplayPhase = gameData?.phase === 'replaying';
    const canClick = isReplayPhase && !myProgress?.isEliminated && !myProgress?.isComplete;

    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '20px',
        maxWidth: '600px',
        margin: '0 auto',
      }}>
        {colors.map((color, index) => {
          const colorDef = COLOR_DEFINITIONS[color];
          const isLit = currentlyLit === color;

          return (
            <button
              key={color}
              onClick={() => canClick && handleColorClick(color)}
              disabled={!canClick}
              style={{
                height: '150px',
                fontSize: '48px',
                fontWeight: 'bold',
                background: isLit ? colorDef.hex : `${colorDef.hex}aa`,
                color: '#fff',
                border: isLit ? '5px solid #fff' : '3px solid #00000033',
                borderRadius: '20px',
                cursor: canClick ? 'pointer' : 'not-allowed',
                opacity: canClick ? 1 : 0.6,
                boxShadow: isLit ? `0 0 30px ${colorDef.hex}` : '0 4px 6px rgba(0,0,0,0.1)',
                transform: isLit ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.1s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
              }}
            >
              {gameData?.colorBlindMode && (
                <div style={{ fontSize: '64px' }}>{colorDef.symbol}</div>
              )}
              <div style={{ fontSize: '18px', textTransform: 'uppercase' }}>
                {color}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.8 }}>
                ({index + 1})
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // Render current phase info
  const renderPhaseInfo = () => {
    if (!gameData) return null;

    switch (gameData.phase) {
      case 'watching':
        return (
          <div style={phaseBoxStyle('#8b5cf6')}>
            <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>👀 Watch Carefully!</h2>
            <p style={{ fontSize: '20px' }}>
              Round {gameData.currentRound.roundNumber} - {gameData.currentRound.sequenceLength} colors
            </p>
            <div style={{ marginTop: '20px', fontSize: '18px', color: '#64748b' }}>
              Memorize the sequence...
            </div>
          </div>
        );

      case 'memorizing':
        return (
          <div style={phaseBoxStyle('#f59e0b')}>
            <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>🧠 Get Ready!</h2>
            <p style={{ fontSize: '20px' }}>Sequence shown. Prepare to replay...</p>
          </div>
        );

      case 'replaying':
        if (myProgress?.isEliminated) {
          return (
            <div style={phaseBoxStyle('#ef4444')}>
              <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>❌ Eliminated</h2>
              <p style={{ fontSize: '20px' }}>Watch the others compete!</p>
            </div>
          );
        } else if (myProgress?.isComplete) {
          return (
            <div style={phaseBoxStyle('#22c55e')}>
              <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>✅ Complete!</h2>
              <p style={{ fontSize: '20px' }}>
                Completed in {((myProgress.completionTime || 0) / 1000).toFixed(2)}s
              </p>
              <p>Waiting for others...</p>
            </div>
          );
        } else {
          return (
            <div style={phaseBoxStyle('#3b82f6')}>
              <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>🎮 Your Turn!</h2>
              <div style={{ fontSize: '28px', color: '#ef4444', marginBottom: '10px' }}>
                ⏱️ {timeRemaining}s
              </div>
              <div style={{ marginBottom: '15px' }}>
                Progress: {myProgress?.currentSequence.length || 0} / {gameData.currentRound.sequenceLength}
              </div>
              <div style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}>
                {myProgress?.currentSequence.map((color, i) => (
                  <div
                    key={i}
                    style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      background: COLOR_DEFINITIONS[color].hex,
                      border: '2px solid #fff',
                    }}
                  />
                ))}
              </div>
            </div>
          );
        }

      case 'roundEnd':
        return (
          <div style={phaseBoxStyle('#22c55e')}>
            <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>🎉 Round Complete!</h2>
            <p style={{ fontSize: '20px' }}>Next round starting soon...</p>
          </div>
        );

      default:
        return null;
    }
  };

  // Render player progress bars
  const renderPlayerProgress = () => {
    if (!gameData) return null;

    return (
      <div style={{ marginTop: '30px' }}>
        <h3>Players</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {Object.values(gameData.playerProgress)
            .sort((a, b) => (gameData.scores[b.socketId] || 0) - (gameData.scores[a.socketId] || 0))
            .map(progress => {
              const player = lobby.players.find(p => p.socketId === progress.socketId);
              const score = gameData.scores[progress.socketId] || 0;

              return (
                <div
                  key={progress.socketId}
                  style={{
                    padding: '15px',
                    background: progress.isEliminated
                      ? '#fee2e2'
                      : progress.socketId === lobby.mySocketId
                      ? '#dbeafe'
                      : '#f1f5f9',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: progress.isEliminated ? 0.6 : 1,
                  }}
                >
                  <div>
                    <strong>{player?.name || 'Unknown'}</strong>
                    {progress.isEliminated && <span style={{ marginLeft: '10px', color: '#ef4444' }}>❌ OUT</span>}
                    {progress.isComplete && !progress.isEliminated && (
                      <span style={{ marginLeft: '10px', color: '#22c55e' }}>✅ Done</span>
                    )}
                  </div>
                  <div>
                    <strong style={{ fontSize: '20px' }}>{score}</strong>
                    <span style={{ marginLeft: '10px', color: '#64748b' }}>
                      {progress.currentSequence.length}/{gameData.currentRound.sequenceLength}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    );
  };

  // Render game results
  const renderGameResults = () => {
    if (!gameResults) return null;

    return (
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>🏆 Game Over!</h1>

        <div style={{
          background: 'linear-gradient(135deg, #a855f7 0%, #8b5cf6 100%)',
          color: '#fff',
          padding: '30px',
          borderRadius: '15px',
          marginBottom: '30px',
        }}>
          <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>Winner</h2>
          <div style={{ fontSize: '48px', fontWeight: 'bold' }}>
            {gameResults.winner.name}
          </div>
          <div style={{ fontSize: '24px', marginTop: '10px' }}>
            {gameResults.winner.score} points · Round {gameResults.winner.finalRound}
          </div>
        </div>

        <h3>Final Rankings</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
          {gameResults.rankings.map(ranking => (
            <div
              key={ranking.socketId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '15px 20px',
                background: ranking.rank === 1 ? '#fef3c7' : '#f1f5f9',
                borderRadius: '10px',
                fontSize: '18px',
              }}
            >
              <div>
                <strong>#{ranking.rank} {ranking.name}</strong>
              </div>
              <div>
                <strong>{ranking.score} pts</strong>
                <span style={{ marginLeft: '15px', color: '#64748b' }}>
                  Round {ranking.finalRound}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '10px' }}>
          <h3>Game Stats</h3>
          <p>Total Rounds: {gameResults.stats.totalRounds}</p>
          <p>Longest Sequence: {gameResults.stats.longestSequence} colors</p>
          <p>Fastest Completion: {gameResults.stats.fastestCompletion.playerName} ({(gameResults.stats.fastestCompletion.time / 1000).toFixed(2)}s)</p>
          <p>Perfect Rounds: {gameResults.stats.perfectRounds}</p>
        </div>
      </div>
    );
  };

  // End game (host only)
  const handleEndGame = () => {
    if (!confirm('Are you sure you want to end the game?')) return;
    socket.emit('game:end', { roomCode: lobby.code });
  };

  return (
    <GameLayout lobby={lobby} socket={socket}>
      <div className="container" style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center' }}>🎨 Color Memory Madness</h1>

        {gameData?.gameOver || gameResults ? (
          renderGameResults()
        ) : (
          <>
            {renderPhaseInfo()}

            <div style={{ marginTop: '30px' }}>
              {renderColorButtons()}
            </div>

            {renderPlayerProgress()}
          </>
        )}

        {/* Host controls */}
        {isHost && !gameData?.gameOver && (
          <div style={{ marginTop: '30px' }}>
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

// Styles
const phaseBoxStyle = (borderColor: string): React.CSSProperties => ({
  padding: '30px',
  borderRadius: '15px',
  border: `3px solid ${borderColor}`,
  background: '#fff',
  textAlign: 'center',
  marginTop: '20px',
});

export default GameComponent;
