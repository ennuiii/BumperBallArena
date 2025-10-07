import React from 'react';
import type { Socket } from 'socket.io-client';
import type { Player } from '../types';
import './PlayerList.css';

interface PlayerListProps {
  players: Player[];
  hostId: string;
  mySocketId: string;
  roomCode: string;
  socket: Socket;
  currentTurnPlayerId?: string | null;
  showSkipButton?: boolean;
}

const PlayerList: React.FC<PlayerListProps> = ({
  players,
  hostId,
  mySocketId,
  roomCode,
  socket,
  currentTurnPlayerId,
  showSkipButton = false,
}) => {
  const isHost = hostId === mySocketId;

  const handleKickPlayer = (playerId: string) => {
    if (!isHost) return;

    if (window.confirm('Are you sure you want to kick this player?')) {
      socket.emit('player:kick', { roomCode, playerId });
    }
  };

  const handleSkipTurn = () => {
    if (!isHost || !currentTurnPlayerId) return;

    if (window.confirm('Are you sure you want to skip this player\'s turn?')) {
      socket.emit('round:skip-turn', { roomCode });
    }
  };

  return (
    <div className="player-list-fixed">
      <div className="player-list-header">
        <h3>Players ({players.length})</h3>
        {isHost && showSkipButton && currentTurnPlayerId && (
          <button className="skip-turn-button" onClick={handleSkipTurn}>
            Skip Turn
          </button>
        )}
      </div>

      <div className="player-list-items">
        {players.map((player) => (
          <div
            key={player.socketId}
            className={`player-item ${player.socketId === mySocketId ? 'is-me' : ''} ${
              currentTurnPlayerId === player.socketId ? 'is-active' : ''
            }`}
          >
            <div className="player-info">
              <div className={`status-dot ${player.connected ? 'connected' : 'disconnected'}`} />
              <div>
                <div className="player-name">
                  {player.name}
                  {player.isHost && <span className="badge-host">HOST</span>}
                  {player.socketId === mySocketId && <span className="badge-you">YOU</span>}
                  {currentTurnPlayerId === player.socketId && <span className="badge-active">ACTIVE</span>}
                </div>
                <div className="player-score">Score: {player.score}</div>
              </div>
            </div>

            {isHost && player.socketId !== mySocketId && (
              <button className="kick-button" onClick={() => handleKickPlayer(player.socketId)}>
                Kick
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlayerList;
