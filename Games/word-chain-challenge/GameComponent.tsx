import React, { useState, useEffect, useRef } from 'react';
import type { Lobby, GameData, ChainWord, GamePhase, TimerData, GameResults } from '../types';
import type { Socket } from 'socket.io-client';
import GameBuddiesReturnButton from './GameBuddiesReturnButton';
import GameLayout from './GameLayout';

/**
 * Word Chain Challenge - Game Component
 *
 * A creative word association game where players build chains of related words.
 */

interface GameComponentProps {
  lobby: Lobby;
  socket: Socket;
}

const GameComponent: React.FC<GameComponentProps> = ({ lobby, socket }) => {
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [currentWord, setCurrentWord] = useState('');
  const [explanation, setExplanation] = useState('');
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [hasVoted, setHasVoted] = useState(false);
  const [myVote, setMyVote] = useState<'accept' | 'challenge' | null>(null);
  const [gameResults, setGameResults] = useState<GameResults | null>(null);

  const wordInputRef = useRef<HTMLInputElement>(null);
  const chainContainerRef = useRef<HTMLDivElement>(null);

  const currentPlayer = lobby.players.find(p => p.socketId === lobby.mySocketId);
  const isHost = currentPlayer?.isHost || false;
  const isMyTurn = gameData?.currentPlayerSocketId === lobby.mySocketId;

  // Socket event listeners
  useEffect(() => {
    socket.on('game:state-update', (data: { gameData: GameData }) => {
      setGameData(data.gameData);
    });

    socket.on('game:phase-changed', (data: { phase: GamePhase }) => {
      console.log('Phase changed:', data.phase);
    });

    socket.on('game:word-submitted', (data: { word: ChainWord }) => {
      console.log('Word submitted:', data.word);
    });

    socket.on('game:voting-started', () => {
      setHasVoted(false);
      setMyVote(null);
    });

    socket.on('game:vote-recorded', (data: { socketId: string; vote: 'accept' | 'challenge' }) => {
      if (data.socketId === lobby.mySocketId) {
        setHasVoted(true);
        setMyVote(data.vote);
      }
    });

    socket.on('game:voting-ended', (data: { result: 'accepted' | 'challenged'; requiresExplanation: boolean }) => {
      console.log('Voting ended:', data.result);
    });

    socket.on('game:explanation-requested', () => {
      setExplanation('');
    });

    socket.on('game:word-resolved', (data: { word: ChainWord; finalStatus: 'accepted' | 'rejected' }) => {
      console.log('Word resolved:', data.finalStatus);
      setCurrentWord('');
      setExplanation('');
    });

    socket.on('game:turn-changed', (data: { currentPlayerSocketId: string; turnStartedAt: number }) => {
      console.log('Turn changed to:', data.currentPlayerSocketId);
      if (data.currentPlayerSocketId === lobby.mySocketId && wordInputRef.current) {
        setTimeout(() => wordInputRef.current?.focus(), 100);
      }
    });

    socket.on('game:timer-update', (data: TimerData) => {
      setTimeRemaining(data.timeRemaining);
    });

    socket.on('game:chain-updated', (data: { chain: ChainWord[]; multiplier: number }) => {
      // Scroll to end of chain
      if (chainContainerRef.current) {
        chainContainerRef.current.scrollLeft = chainContainerRef.current.scrollWidth;
      }
    });

    socket.on('game:game-over', (data: GameResults) => {
      setGameResults(data);
    });

    return () => {
      socket.off('game:state-update');
      socket.off('game:phase-changed');
      socket.off('game:word-submitted');
      socket.off('game:voting-started');
      socket.off('game:vote-recorded');
      socket.off('game:voting-ended');
      socket.off('game:explanation-requested');
      socket.off('game:word-resolved');
      socket.off('game:turn-changed');
      socket.off('game:timer-update');
      socket.off('game:chain-updated');
      socket.off('game:game-over');
    };
  }, [socket, lobby.mySocketId]);

  // Submit word
  const handleSubmitWord = () => {
    if (!currentWord.trim() || !isMyTurn) return;

    socket.emit('game:submit-word', {
      roomCode: lobby.code,
      word: currentWord.trim().toLowerCase(),
    });
  };

  // Vote on word
  const handleVote = (vote: 'accept' | 'challenge') => {
    if (hasVoted || !gameData?.voteData) return;

    socket.emit('game:vote', {
      roomCode: lobby.code,
      wordId: gameData.voteData.wordId,
      vote,
    });
  };

  // Submit explanation
  const handleSubmitExplanation = () => {
    if (!explanation.trim() || !gameData?.voteData) return;

    socket.emit('game:submit-explanation', {
      roomCode: lobby.code,
      wordId: gameData.voteData.wordId,
      explanation: explanation.trim(),
    });
  };

  // Skip turn
  const handleSkipTurn = () => {
    if (!isMyTurn || !confirm('Skip your turn? You\'ll lose 5 points.')) return;

    socket.emit('game:skip-turn', { roomCode: lobby.code });
    setCurrentWord('');
  };

  // End game (host only)
  const handleEndGame = () => {
    if (!confirm('Are you sure you want to end the game?')) return;
    socket.emit('game:end', { roomCode: lobby.code });
  };

  // Render phase-specific UI
  const renderGameContent = () => {
    if (!gameData) {
      return <div>Loading game...</div>;
    }

    // Game over
    if (gameData.gameOver || gameResults) {
      return renderGameResults();
    }

    return (
      <>
        {/* Chain display */}
        <div style={{ marginTop: '20px' }}>
          <h3>Word Chain {gameData.multiplier > 1 && (
            <span style={{ color: '#ff6600', marginLeft: '10px' }}>
              {gameData.multiplier}x Multiplier! 🔥
            </span>
          )}</h3>

          <div
            ref={chainContainerRef}
            style={{
              display: 'flex',
              gap: '15px',
              overflowX: 'auto',
              padding: '20px',
              background: '#f8f9fa',
              borderRadius: '10px',
              minHeight: '100px',
              alignItems: 'center',
            }}
          >
            {/* Starting word */}
            <div style={wordBubbleStyle('#4a5568')}>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                {gameData.startingWord.word.toUpperCase()}
              </div>
              <div style={{ fontSize: '12px', marginTop: '5px' }}>START</div>
            </div>

            {/* Chain words */}
            {gameData.chain.map((word, index) => (
              <React.Fragment key={word.id}>
                <div style={{ fontSize: '24px', color: '#cbd5e1' }}>→</div>
                <div
                  style={wordBubbleStyle(
                    word.finalStatus === 'accepted'
                      ? '#22c55e'
                      : word.finalStatus === 'rejected'
                      ? '#ef4444'
                      : word.finalStatus === 'challenged'
                      ? '#f59e0b'
                      : '#6366f1'
                  )}
                >
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    {word.word.toUpperCase()}
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '5px' }}>
                    {word.playerName}
                  </div>
                  {word.points > 0 && (
                    <div style={{ fontSize: '11px', color: '#fbbf24' }}>
                      +{word.points} pts
                    </div>
                  )}
                  {word.bonuses.length > 0 && (
                    <div style={{ fontSize: '10px', marginTop: '3px' }}>
                      {word.bonuses.join(', ')}
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '10px', color: '#64748b' }}>
            Chain Length: {gameData.chain.length} / {gameData.chainGoal}
          </div>
        </div>

        {/* Current turn info */}
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          {renderPhaseContent()}
        </div>

        {/* Scores */}
        <div style={{ marginTop: '20px' }}>
          <h3>Scores</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {Object.entries(gameData.playerStats)
              .sort(([, a], [, b]) => b.totalPoints - a.totalPoints)
              .map(([socketId, stats]) => {
                const player = lobby.players.find(p => p.socketId === socketId);
                return (
                  <div
                    key={socketId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '10px 15px',
                      background: socketId === lobby.mySocketId ? '#dbeafe' : '#f1f5f9',
                      borderRadius: '8px',
                      border: socketId === gameData.currentPlayerSocketId ? '3px solid #3b82f6' : 'none',
                    }}
                  >
                    <div>
                      <strong>{player?.name || 'Unknown'}</strong>
                      {socketId === gameData.currentPlayerSocketId && (
                        <span style={{ marginLeft: '10px', color: '#3b82f6' }}>← Current Turn</span>
                      )}
                    </div>
                    <div>
                      <strong>{stats.totalPoints} pts</strong>
                      <span style={{ marginLeft: '10px', color: '#64748b', fontSize: '14px' }}>
                        ({stats.wordsAccepted}/{stats.wordsSubmitted} accepted)
                      </span>
                      {stats.currentStreak > 2 && (
                        <span style={{ marginLeft: '10px', color: '#f59e0b' }}>
                          🔥 {stats.currentStreak} streak
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </>
    );
  };

  // Render content based on game phase
  const renderPhaseContent = () => {
    if (!gameData) return null;

    const lastWord = gameData.chain.length > 0
      ? gameData.chain[gameData.chain.length - 1].word
      : gameData.startingWord.word;

    switch (gameData.phase) {
      case 'playing':
        if (isMyTurn) {
          return (
            <div style={phaseBoxStyle('#3b82f6')}>
              <h2>Your Turn!</h2>
              <p>Previous word: <strong style={{ fontSize: '24px' }}>{lastWord.toUpperCase()}</strong></p>
              <div style={{ fontSize: '18px', color: '#ef4444', marginBottom: '10px' }}>
                Time: {Math.ceil(timeRemaining / 1000)}s
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', maxWidth: '500px', margin: '0 auto' }}>
                <input
                  ref={wordInputRef}
                  type="text"
                  value={currentWord}
                  onChange={(e) => setCurrentWord(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSubmitWord()}
                  placeholder="Enter a related word..."
                  style={{
                    flex: 1,
                    padding: '15px',
                    fontSize: '18px',
                    borderRadius: '8px',
                    border: '2px solid #3b82f6',
                  }}
                  autoFocus
                />
                <button
                  onClick={handleSubmitWord}
                  disabled={!currentWord.trim()}
                  style={{ padding: '15px 30px', fontSize: '18px' }}
                >
                  Submit
                </button>
              </div>
              <button
                onClick={handleSkipTurn}
                style={{
                  marginTop: '10px',
                  background: '#ef4444',
                  color: '#fff',
                }}
              >
                Skip Turn (-5 pts)
              </button>
            </div>
          );
        } else {
          const currentPlayerName = lobby.players.find(p => p.socketId === gameData.currentPlayerSocketId)?.name;
          return (
            <div style={phaseBoxStyle('#64748b')}>
              <h2>Waiting for {currentPlayerName}...</h2>
              <p>Previous word: <strong style={{ fontSize: '24px' }}>{lastWord.toUpperCase()}</strong></p>
              <div style={{ fontSize: '18px', color: '#ef4444' }}>
                Time remaining: {Math.ceil(timeRemaining / 1000)}s
              </div>
            </div>
          );
        }

      case 'voting':
        if (isMyTurn) {
          return (
            <div style={phaseBoxStyle('#f59e0b')}>
              <h2>Players are voting on your word...</h2>
              <p style={{ fontSize: '24px' }}>
                {lastWord.toUpperCase()} → <strong>{currentWord.toUpperCase()}</strong>
              </p>
              <div>
                Votes: {gameData.voteData?.votes ? Object.keys(gameData.voteData.votes).length : 0} / {lobby.players.length - 1}
              </div>
            </div>
          );
        } else {
          return (
            <div style={phaseBoxStyle('#f59e0b')}>
              <h2>Vote on this connection!</h2>
              <p style={{ fontSize: '24px' }}>
                {lastWord.toUpperCase()} → <strong>{gameData.currentWord?.toUpperCase()}</strong>
              </p>
              {!hasVoted ? (
                <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '20px' }}>
                  <button
                    onClick={() => handleVote('accept')}
                    style={{
                      padding: '20px 40px',
                      fontSize: '20px',
                      background: '#22c55e',
                      color: '#fff',
                    }}
                  >
                    ✅ Accept
                  </button>
                  <button
                    onClick={() => handleVote('challenge')}
                    style={{
                      padding: '20px 40px',
                      fontSize: '20px',
                      background: '#ef4444',
                      color: '#fff',
                    }}
                  >
                    ❌ Challenge
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '20px', fontSize: '18px' }}>
                  You voted: <strong>{myVote === 'accept' ? '✅ Accept' : '❌ Challenge'}</strong>
                  <br />
                  Waiting for other players...
                </div>
              )}
            </div>
          );
        }

      case 'explanation':
        if (isMyTurn) {
          return (
            <div style={phaseBoxStyle('#8b5cf6')}>
              <h2>Your word was challenged!</h2>
              <p>Explain the connection:</p>
              <p style={{ fontSize: '24px' }}>
                {lastWord.toUpperCase()} → <strong>{currentWord.toUpperCase()}</strong>
              </p>
              <div style={{ maxWidth: '500px', margin: '20px auto' }}>
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explain how these words are connected..."
                  style={{
                    width: '100%',
                    padding: '15px',
                    fontSize: '16px',
                    borderRadius: '8px',
                    border: '2px solid #8b5cf6',
                    minHeight: '100px',
                  }}
                  autoFocus
                />
                <button
                  onClick={handleSubmitExplanation}
                  disabled={!explanation.trim()}
                  style={{ width: '100%', marginTop: '10px', padding: '15px', fontSize: '18px' }}
                >
                  Submit Explanation
                </button>
              </div>
            </div>
          );
        } else {
          const currentPlayerName = lobby.players.find(p => p.socketId === gameData.currentPlayerSocketId)?.name;
          return (
            <div style={phaseBoxStyle('#8b5cf6')}>
              <h2>{currentPlayerName} is explaining their word...</h2>
              {gameData.currentExplanation && (
                <div style={{
                  background: '#fff',
                  padding: '20px',
                  borderRadius: '10px',
                  marginTop: '20px',
                  maxWidth: '600px',
                  margin: '20px auto',
                }}>
                  <p style={{ fontSize: '18px', fontStyle: 'italic' }}>"{gameData.currentExplanation}"</p>
                </div>
              )}
            </div>
          );
        }

      default:
        return null;
    }
  };

  // Render game results
  const renderGameResults = () => {
    if (!gameResults) return null;

    return (
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>🏆 Game Over!</h1>

        <div style={{
          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
          color: '#fff',
          padding: '30px',
          borderRadius: '15px',
          marginBottom: '30px',
        }}>
          <h2 style={{ fontSize: '36px', marginBottom: '10px' }}>Winner</h2>
          <div style={{ fontSize: '48px', fontWeight: 'bold' }}>
            {gameResults.winner.name}
          </div>
          <div style={{ fontSize: '24px' }}>
            {gameResults.winner.score} points
          </div>
        </div>

        <h3>Final Scores</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
          {gameResults.finalScores.map((score, index) => (
            <div
              key={score.socketId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '15px 20px',
                background: index === 0 ? '#fef3c7' : '#f1f5f9',
                borderRadius: '10px',
                fontSize: '18px',
              }}
            >
              <div>
                <strong>#{index + 1} {score.name}</strong>
              </div>
              <div>
                <strong>{score.score} pts</strong>
                <span style={{ marginLeft: '15px', color: '#64748b' }}>
                  ({score.wordsAccepted} words accepted)
                </span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '10px' }}>
          <h3>Game Stats</h3>
          <p>Total Words in Chain: {gameResults.stats.totalWords}</p>
          <p>Total Challenges: {gameResults.stats.totalChallenges}</p>
          <p>Average Word Length: {gameResults.stats.averageWordLength.toFixed(1)} letters</p>
          {gameResults.mostCreativeWord && (
            <p>
              Most Creative Word: <strong>{gameResults.mostCreativeWord.word.toUpperCase()}</strong> by {gameResults.mostCreativeWord.playerName}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <GameLayout lobby={lobby} socket={socket}>
      <div className="container" style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center' }}>🔗 Word Chain Challenge</h1>

        {renderGameContent()}

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
const wordBubbleStyle = (bgColor: string): React.CSSProperties => ({
  background: bgColor,
  color: '#fff',
  padding: '15px 20px',
  borderRadius: '15px',
  minWidth: '100px',
  textAlign: 'center',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  flexShrink: 0,
});

const phaseBoxStyle = (borderColor: string): React.CSSProperties => ({
  padding: '30px',
  borderRadius: '15px',
  border: `3px solid ${borderColor}`,
  background: '#fff',
});

export default GameComponent;
