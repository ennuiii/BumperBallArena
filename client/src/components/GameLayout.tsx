import React, { useState } from 'react';
import { Video, VideoOff } from 'lucide-react';
import WebcamDisplay from './WebcamDisplay';
import PlayerList from './PlayerList';
import ChatWindow from './ChatWindow';
import type { Lobby } from '../types';
import type { Socket } from 'socket.io-client';

interface GameLayoutProps {
  children: React.ReactNode;
  lobby: Lobby;
  socket: Socket;
}

const GameLayout: React.FC<GameLayoutProps> = ({ children, lobby, socket }) => {
  const [isWebcamHidden, setIsWebcamHidden] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);

  return (
    <div className="app-layout">
      {/* Webcam Top Bar - Always available */}
      {!isWebcamHidden && (
        <div className="webcam-top-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Video size={18} style={{ color: 'var(--text-accent)' }} />
            <h3 style={{ fontSize: '0.875rem', fontWeight: '600', margin: 0, color: 'var(--text-primary)' }}>
              Video Chat
            </h3>
          </div>
          <WebcamDisplay lobby={lobby} />
        </div>
      )}

      {/* Webcam Toggle Button - Bottom center */}
      <button
        onClick={() => setIsWebcamHidden(!isWebcamHidden)}
        className="webcam-toggle-btn"
        title={isWebcamHidden ? 'Show Webcam' : 'Hide Webcam'}
      >
        {isWebcamHidden ? (
          <>
            <VideoOff size={16} style={{ display: 'inline-block', marginRight: '0.5rem' }} />
            Show Video
          </>
        ) : (
          <>
            <Video size={16} style={{ display: 'inline-block', marginRight: '0.5rem' }} />
            Hide Video
          </>
        )}
      </button>

      {/* Main Container */}
      <div className="main-container">
        {/* Game Content */}
        <div className="game-content">
          {children}
        </div>

        {/* Right Sidebar - PlayerList + Chat */}
        <div className="right-sidebar">
          {/* Player List */}
          <div className="player-list">
            <PlayerList
              players={lobby.players}
              hostId={lobby.hostId}
              mySocketId={lobby.mySocketId}
              roomCode={lobby.code}
              socket={socket}
            />
          </div>

          {/* Chat */}
          <div className="sidebar-chat">
            <ChatWindow
              lobby={lobby}
              socket={socket}
              isOpen={isChatOpen}
              onClose={() => setIsChatOpen(false)}
              mode="sidebar"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameLayout;
