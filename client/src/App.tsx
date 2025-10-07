import { useState, useEffect, useCallback } from 'react';
import socketService from './services/socketService';
import { getCurrentSession, resolvePendingSession } from './services/gameBuddiesSession';
import type { GameBuddiesSession } from './services/gameBuddiesSession';
import type { Lobby, ChatMessage, GameState } from './types';
import Home from './components/Home';
import LobbyComponent from './components/Lobby';
import GameComponent from './components/GameComponent';
import ChatWindow from './components/ChatWindow';
import PlayerList from './components/PlayerList';
import { WebRTCProvider } from './contexts/WebRTCContext';
import { WebcamConfigProvider } from './config/WebcamConfig';
import WebcamDisplay from './components/WebcamDisplay';
import { createGameAdapter } from './adapters/gameAdapter';
import './App.css';

function App() {
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [error, setError] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [gameBuddiesSession, setGameBuddiesSession] = useState<GameBuddiesSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isWebcamHidden, setIsWebcamHidden] = useState(false);

  const handleCreateRoom = useCallback((playerName: string, session: GameBuddiesSession | null) => {
    const socket = socketService.getSocket();
    if (socket) {
      setGameBuddiesSession(session);

      if (session?.sessionToken) {
        console.log(`[GameBuddies Client] Creating room with session token: ${session.sessionToken.substring(0, 8)}...`);
      }

      socket.emit('lobby:create', {
        playerName,
        playerId: session?.playerId,
        roomCode: session?.roomCode,
        isGameBuddiesRoom: !!session,
        sessionToken: session?.sessionToken,
      });
    }
  }, []);

  const handleJoinRoom = useCallback((
    roomCode: string,
    playerName: string,
    session: GameBuddiesSession | null
  ) => {
    const socket = socketService.getSocket();
    if (socket) {
      setGameBuddiesSession(session);

      console.log(`[GameBuddies Client] Joining room: ${roomCode}, Player: ${playerName}`);
      if (session?.sessionToken) {
        console.log(`[GameBuddies Client] Joining with session token: ${session.sessionToken.substring(0, 8)}...`);
      }

      socket.emit('lobby:join', {
        roomCode,
        playerName,
        playerId: session?.playerId,
      });
    }
  }, []);

  useEffect(() => {
    // Connect to socket
    const socket = socketService.connect();

    socket.on('connect', async () => {
      console.log('[App] Socket connected, setting isConnected = true');
      setIsConnected(true);

      // Check for GameBuddies session and handle async resolution
      let session = getCurrentSession();

      // If no session but we have a pending one, try to resolve it
      if (!session) {
        console.log('[App] No immediate session, checking for pending resolution...');
        session = await resolvePendingSession();
      } else if (session.sessionToken && !session.roomCode) {
        // Session exists but room code is undefined - need to resolve it
        console.log('[App] Session exists but room code is undefined, resolving session token...');
        session = await resolvePendingSession();
      }

      if (session) {
        setGameBuddiesSession(session);
        console.log('[App] GameBuddies session detected after socket connection');

        // Auto-join/create based on session
        if (session.isHost) {
          // Host creates room
          console.log('[App] Auto-creating room as host');
          setTimeout(() => {
            handleCreateRoom(session.playerName || 'Host', session);
          }, 100);
        } else {
          // Player joins room (only if they have a name)
          if (session.playerName) {
            console.log('[App] Auto-joining room as player with name:', session.playerName);
            setTimeout(() => {
              handleJoinRoom(session.roomCode, session.playerName!, session);
            }, 100);
          } else {
            console.log('[App] Player has no name, will show Home component for manual entry');
          }
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('[App] Socket disconnected');
      setIsConnected(false);
    });

    // Listen for lobby events
    socket.on('lobby:created', (data: { roomCode: string; lobby: Lobby }) => {
      console.log('[App] Lobby created:', data.roomCode);
      setLobby(data.lobby);
      setMessages(data.lobby.messages || []);
      setError('');
    });

    socket.on('lobby:joined', (data: { lobby: Lobby }) => {
      console.log('[App] Joined lobby');
      setLobby(data.lobby);
      setMessages(data.lobby.messages || []);
      setError('');
    });

    socket.on('lobby:player-joined', (data: { players: any[]; state?: GameState }) => {
      console.log('[App] Player joined');
      setLobby((prevLobby) => {
        if (!prevLobby) return prevLobby;
        return {
          ...prevLobby,
          players: data.players,
          ...(data.state && { state: data.state })  // Update state if provided
        };
      });
    });

    socket.on('lobby:player-left', (data: { players: any[] }) => {
      console.log('[App] Player left');
      setLobby((prevLobby) => {
        if (!prevLobby) return prevLobby;
        return { ...prevLobby, players: data.players };
      });
    });

    socket.on('lobby:player-list-update', (data: { players: any[] }) => {
      console.log('[App] Player list updated with scores');
      setLobby((prevLobby) => {
        if (!prevLobby) return prevLobby;
        return { ...prevLobby, players: data.players };
      });
    });

    socket.on('lobby:settings-updated', (data: { settings: any }) => {
      console.log('[App] Settings updated');
      setLobby((prevLobby) => {
        if (!prevLobby) return prevLobby;
        return { ...prevLobby, settings: data.settings };
      });
    });

    socket.on('game:started', (data: { lobby: Lobby }) => {
      console.log('[App] Game started');
      setLobby((prevLobby) => ({
        ...data.lobby,
        mySocketId: prevLobby?.mySocketId ?? data.lobby.mySocketId  // Preserve client-specific mySocketId
      }));
    });

    socket.on('game:ended', (data: { lobby: Lobby }) => {
      console.log('[App] Game ended');
      setLobby((prevLobby) => ({
        ...data.lobby,
        mySocketId: prevLobby?.mySocketId ?? data.lobby.mySocketId  // Preserve client-specific mySocketId
      }));
    });

    // Chat events
    socket.on('chat:message', (message: ChatMessage) => {
      console.log('[App] Chat message received:', message);
      setMessages(prev => [...prev, message].slice(-100)); // Keep last 100
    });

    // Error handling
    socket.on('error', (data: { message: string }) => {
      console.error('[App] Error from server:', data.message);
      setError(data.message);
    });

    socket.on('player:kicked', (data: { message: string }) => {
      console.log('[App] Kicked from room:', data.message);
      alert(data.message);
      setLobby(null);
      setError('');
    });

    return () => {
      socketService.disconnect();
    };
  }, [handleCreateRoom, handleJoinRoom]);

  const renderContent = () => {
    console.log('[App] renderContent called', { lobby, isConnected });

    if (!isConnected) {
      console.log('[App] Waiting for socket connection');
      return (
        <div className="container">
          <h1>Connecting...</h1>
          <p style={{ textAlign: 'center', color: '#94a3b8' }}>
            Connecting to server...
          </p>
        </div>
      );
    }

    if (!lobby) {
      console.log('[App] Rendering Home component');
      return (
        <Home
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          gameBuddiesSession={gameBuddiesSession}
        />
      );
    }

    console.log('[App] Rendering based on state:', lobby.state);

    // Simple state-based rendering
    switch (lobby.state) {
      case 'LOBBY_WAITING':
        return <LobbyComponent lobby={lobby} socket={socketService.getSocket()!} gameBuddiesSession={gameBuddiesSession} />;

      case 'PLAYING':
        return <GameComponent lobby={lobby} socket={socketService.getSocket()!} />;

      case 'GAME_ENDED':
        // You can create a GameOver component here
        return (
          <div className="container">
            <h1>Game Over!</h1>
            <div className="round-info">
              <h2>Final Scores</h2>
              <ul className="player-list">
                {[...lobby.players].sort((a, b) => b.score - a.score).map((player, index) => (
                  <li key={player.socketId} className="player-item">
                    <span>
                      #{index + 1} {player.name}
                    </span>
                    <span style={{ fontWeight: 'bold' }}>{player.score} pts</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      default:
        return <div>Unknown game state: {lobby.state}</div>;
    }
  };

  const socket = socketService.getSocket();
  const webcamConfig = socket && lobby ? createGameAdapter(socket, lobby.code, lobby) : null;

  return (
    <div className="app-root">
      {webcamConfig ? (
        <WebcamConfigProvider config={webcamConfig}>
          <WebRTCProvider>
            <div className="app-layout">
              {!isWebcamHidden && (
                <div className="webcam-top-bar">
                  <WebcamDisplay />
                </div>
              )}
              {/* Webcam toggle button */}
              <button
                onClick={() => setIsWebcamHidden(!isWebcamHidden)}
                className="webcam-toggle-btn"
                title={isWebcamHidden ? "Show Webcam" : "Hide Webcam"}
              >
                {isWebcamHidden ? "📹 Show" : "📹 Hide"}
              </button>
              <div className="main-container">
                <div className="game-content">
                  {error && (
                    <div className="error-message" style={{ margin: '20px auto', maxWidth: '600px' }}>
                      {error}
                    </div>
                  )}
                  {renderContent()}
                </div>
                <div className="right-sidebar">
                  {lobby && (
                    <>
                      <PlayerList
                        players={lobby.players}
                        hostId={lobby.hostId}
                        mySocketId={lobby.mySocketId}
                        roomCode={lobby.code}
                        socket={socket!}
                      />
                      <ChatWindow
                        messages={messages}
                        socket={socket!}
                        roomCode={lobby.code}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          </WebRTCProvider>
        </WebcamConfigProvider>
      ) : (
        <div className="app-layout">
          {error && (
            <div className="error-message" style={{ margin: '20px auto', maxWidth: '600px' }}>
              {error}
            </div>
          )}
          {renderContent()}
        </div>
      )}
    </div>
  );
}

export default App;
