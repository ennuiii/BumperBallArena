import React, { useState } from 'react';
import type { Lobby as LobbyType, Player, Settings } from '../types';
import type { Socket } from 'socket.io-client';
import type { GameBuddiesSession } from '../services/gameBuddiesSession';
import GameBuddiesReturnButton from './GameBuddiesReturnButton';

interface LobbyProps {
  lobby: LobbyType;
  socket: Socket;
  gameBuddiesSession?: GameBuddiesSession | null;
}

const Lobby: React.FC<LobbyProps> = ({ lobby, socket, gameBuddiesSession }) => {
  const [settings, setSettings] = useState<Settings>(lobby.settings);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  const isHost = lobby.players.find(p => p.socketId === lobby.mySocketId)?.isHost || false;
  const canStartGame = lobby.players.length >= settings.minPlayers;
  const hideRoomCode = gameBuddiesSession?.hideRoomCode || false;

  const handleCopyJoinLink = () => {
    const baseUrl = window.location.origin;
    const basePath = import.meta.env.BASE_URL || '/';
    let joinUrl: string;

    if (hideRoomCode && gameBuddiesSession?.sessionToken) {
      // For streamer mode, create a player invite link
      const invitePlayerId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;

      const params = new URLSearchParams({
        session: gameBuddiesSession.sessionToken,
        players: lobby.settings.maxPlayers.toString(),
        playerId: invitePlayerId,
      });
      joinUrl = `https://gamebuddies.io/cluescale?${params.toString()}`;
    } else {
      // For regular mode, use the join link with room code
      joinUrl = `${baseUrl}${basePath}?join=${lobby.code}`;
    }

    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      if (hideRoomCode) {
        alert('Failed to copy invite link.');
      } else {
        alert('Failed to copy link. Room code: ' + lobby.code);
      }
    });
  };

  const handleStartGame = () => {
    if (canStartGame) {
      socket.emit('game:start', { roomCode: lobby.code });
    }
  };

  const handleSettingChange = (key: keyof Settings, value: any) => {
    const updatedSettings = { ...settings, [key]: value };
    setSettings(updatedSettings);
    socket.emit('settings:update', { roomCode: lobby.code, settings: updatedSettings });
  };

  const handleKickPlayer = (playerId: string) => {
    if (confirm('Are you sure you want to kick this player?')) {
      socket.emit('player:kick', { roomCode: lobby.code, playerId });
    }
  };

  return (
    <div className="container">
      <h1>Your Game Name</h1>

      {!hideRoomCode ? (
        <div className="round-info">
          <h3>Room Code</h3>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#667eea', letterSpacing: '0.2em' }}>
            {lobby.code}
          </div>
          <p style={{ marginTop: '10px', color: '#666' }}>
            Share this code with your friends to join!
          </p>
          <button
            onClick={handleCopyJoinLink}
            style={{ marginTop: '15px' }}
            className={copied ? 'success' : ''}
          >
            {copied ? 'Link Copied!' : 'Copy Join Link'}
          </button>
        </div>
      ) : (
        <div className="round-info">
          <h3>Streamer Mode</h3>
          <p style={{ color: '#667eea', fontSize: '1.1rem' }}>
            🎥 Room is ready for streaming
          </p>
          <p style={{ color: '#666', marginTop: '10px' }}>
            Invite players using the safe invite link below:
          </p>
          <button
            onClick={handleCopyJoinLink}
            style={{ marginTop: '15px' }}
            className={copied ? 'success' : ''}
          >
            {copied ? 'Invite Link Copied!' : 'Copy Invite Link'}
          </button>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '10px' }}>
            🔒 Link doesn't reveal room code - safe for streaming!
          </p>
        </div>
      )}

      <div style={{ marginTop: '30px' }}>
        <h2>Players ({lobby.players.length}/{settings.maxPlayers})</h2>
        <ul className="player-list">
          {lobby.players.map((player: Player) => (
            <li
              key={player.socketId}
              className={`player-item ${player.isHost ? 'host' : ''} ${!player.connected ? 'disconnected' : ''}`}
            >
              <span>
                {player.name}
                {!player.connected && ' (disconnected)'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {player.isHost && <span className="badge">HOST</span>}
                <span style={{ fontWeight: 'bold' }}>
                  {player.score} pts
                </span>
                {isHost && !player.isHost && (
                  <button
                    onClick={() => handleKickPlayer(player.socketId)}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      background: '#dc3545',
                      border: 'none',
                      borderRadius: '6px',
                      color: 'white',
                      cursor: 'pointer'
                    }}
                  >
                    Kick
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isHost && (
        <>
          <div className="action-buttons">
            <button
              onClick={handleStartGame}
              disabled={!canStartGame}
              className="success"
            >
              Start Game
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="secondary"
            >
              {showSettings ? 'Hide Settings' : 'Show Settings'}
            </button>
          </div>

          {!canStartGame && (
            <p style={{ textAlign: 'center', color: '#dc3545', marginTop: '10px' }}>
              Need at least {settings.minPlayers} players to start
            </p>
          )}

          {showSettings && (
            <div className="settings-panel">
              <h3>Game Settings</h3>

              <div className="settings-group">
                <label>Minimum Players</label>
                <input
                  type="number"
                  min="2"
                  max="10"
                  value={settings.minPlayers}
                  onChange={(e) => handleSettingChange('minPlayers', parseInt(e.target.value))}
                />
              </div>

              <div className="settings-group">
                <label>Maximum Players</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={settings.maxPlayers}
                  onChange={(e) => handleSettingChange('maxPlayers', parseInt(e.target.value))}
                />
              </div>

              {/* Add your game-specific settings here */}
              {/* Example:
              <div className="settings-group">
                <label>Round Duration (seconds)</label>
                <input
                  type="number"
                  min="30"
                  max="180"
                  value={settings.roundDuration}
                  onChange={(e) => handleSettingChange('roundDuration', parseInt(e.target.value))}
                />
              </div>
              */}
            </div>
          )}
        </>
      )}

      {!isHost && (
        <p style={{ textAlign: 'center', color: '#666', marginTop: '20px' }}>
          Waiting for host to start the game...
        </p>
      )}

      {lobby.isGameBuddiesRoom && (
        <GameBuddiesReturnButton roomCode={lobby.code} socket={socket} />
      )}
    </div>
  );
};

export default Lobby;
