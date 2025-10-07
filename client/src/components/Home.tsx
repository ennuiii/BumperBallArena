import React, { useState, useEffect } from 'react';
import { getCurrentSession, resolvePendingSession } from '../services/gameBuddiesSession';
import type { GameBuddiesSession } from '../services/gameBuddiesSession';

interface HomeProps {
  onCreateRoom: (playerName: string, session: GameBuddiesSession | null) => void;
  onJoinRoom: (roomCode: string, playerName: string, session: GameBuddiesSession | null) => void;
  gameBuddiesSession: GameBuddiesSession | null;
}

const Home: React.FC<HomeProps> = ({ onCreateRoom, onJoinRoom, gameBuddiesSession }) => {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  useEffect(() => {
    // Check for join URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');

    if (joinCode) {
      setRoomCode(joinCode.toUpperCase());
      setMode('join');
      return;
    }

    // Check for GameBuddies session
    let session = getCurrentSession();
    if (session) {
      setPlayerName(session.playerName || '');
      setRoomCode(session.roomCode || '');
      console.log('[GameBuddies] Session found, auto-join will be handled by App component');
    } else {
      // Check for pending session (for streamer mode)
      resolvePendingSession().then(resolved => {
        if (resolved) {
          console.log('[GameBuddies] Pending session resolved in Home component');
          // The component will re-render when gameBuddiesSession prop updates
        }
      });
    }
  }, [gameBuddiesSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!playerName.trim()) {
      alert('Please enter your name');
      return;
    }

    if (gameBuddiesSession) {
      // For GameBuddies sessions, always join the room using the session's room code
      onJoinRoom(gameBuddiesSession.roomCode, playerName, gameBuddiesSession);
    } else {
      // Check if we have a pending session that needs resolution
      const resolvedSession = await resolvePendingSession();

      if (resolvedSession) {
        // Use the resolved session
        onJoinRoom(resolvedSession.roomCode, playerName, resolvedSession);
      } else {
        // For non-GameBuddies sessions, use the normal create/join logic
        if (mode === 'create') {
          onCreateRoom(playerName, gameBuddiesSession);
        } else {
          if (!roomCode.trim()) {
            alert('Please enter a room code');
            return;
          }
          onJoinRoom(roomCode.toUpperCase(), playerName, gameBuddiesSession);
        }
      }
    }
  };

  if (gameBuddiesSession && gameBuddiesSession.playerName) {
    // If player name is already provided, show connecting message
    return (
      <div className="container">
        <h1>Bumper Balls Arena</h1>
        <div className="round-info">
          <h3>Connecting to GameBuddies room...</h3>
          {!gameBuddiesSession.hideRoomCode && (
            <p>Room: {gameBuddiesSession.roomCode}</p>
          )}
          <p>Player: {gameBuddiesSession.playerName}</p>
          <p>Role: {gameBuddiesSession.isHost ? 'Host' : 'Player'}</p>
          {gameBuddiesSession.isStreamerMode && (
            <p style={{ color: '#667eea', fontSize: '0.9rem' }}>
              🎥 Streamer Mode
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>⚡ Bumper Balls Arena</h1>

      {/* Show GameBuddies context if available */}
      {gameBuddiesSession && (
        <div style={{
          backgroundColor: '#f0f9ff',
          border: '2px solid #667eea',
          borderRadius: '12px',
          padding: '15px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <p style={{ color: '#667eea', fontWeight: 'bold', margin: '0 0 10px 0' }}>
            🎮 GameBuddies Streamer Mode
          </p>
          <p style={{ color: '#666', margin: '5px 0', fontSize: '0.9rem' }}>
            Enter your name to join the streamer's game!
          </p>
        </div>
      )}

      <p style={{ textAlign: 'center', marginBottom: '30px', color: '#666' }}>
        3D multiplayer battle royale - Bump your opponents off the platform!
      </p>

      {!gameBuddiesSession && (
        <div className="action-buttons" style={{ marginBottom: '30px' }}>
          <button
            onClick={() => setMode('create')}
            className={mode === 'create' ? '' : 'secondary'}
          >
            Create Room
          </button>
          <button
            onClick={() => setMode('join')}
            className={mode === 'join' ? '' : 'secondary'}
          >
            Join Room
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Your Name</label>
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            required
          />
        </div>

        {mode === 'join' && (
          <div className="form-group">
            <label>Room Code</label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Enter room code"
              maxLength={10}
              required
            />
          </div>
        )}

        <button type="submit" style={{ width: '100%' }}>
          {gameBuddiesSession ? 'Join Room' : (mode === 'create' ? 'Create Room' : 'Join Room')}
        </button>
      </form>
    </div>
  );
};

export default Home;