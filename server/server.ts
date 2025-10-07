import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { Lobby, Player, Settings, GameState, ChatMessage, MovementInput } from './types';
import gameBuddiesService from './services/gameBuddiesService';
import {
  validatePlayerName,
  validateRoomCode,
  generateRoomCode,
  sanitizeInput,
  validateChatMessage,
} from './utils/validation';
import { randomUUID } from 'crypto';
import { initializeBumperBallsGame, setupBumperBallsHandlers } from './games/bumper-balls';
import path from 'path';

dotenv.config();

const app = express();

// CRITICAL: Trust proxy for reverse proxy support (GameBuddies.io)
app.set('trust proxy', true);

const httpServer = createServer(app);

// Configure allowed origins for CORS (GameBuddies compatibility)
const allowedOrigins: string[] = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://localhost:5173',
  'https://gamebuddies.io',
  'https://gamebuddies-io.onrender.com',
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
].filter((origin): origin is string => Boolean(origin));

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Performance optimizations
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// Store all active lobbies
const lobbies = new Map<string, Lobby>();

// GameBuddies session token -> room code mapping
const gameBuddiesSessions = new Map<string, string>();

// WebRTC peer tracking
const videoEnabledPeers = new Map<string, Set<string>>(); // roomCode -> Set of peerIds
const peerConnectionTypes = new Map<string, string>(); // peerId -> connectionType

// Default settings - customize for your game
const DEFAULT_SETTINGS: Settings = {
  minPlayers: 2,
  maxPlayers: 12,
  // Add your game-specific settings here
  // Example:
  // roundDuration: 60,
  // difficulty: 'medium',
};

// Helper: Sanitize player data for client
function sanitizePlayer(player: Player) {
  return {
    socketId: player.socketId,
    name: player.name,
    score: player.score,
    connected: player.connected,
    isHost: player.isHost,
  };
}

// Helper: Send system message to chat
function sendSystemMessage(lobby: Lobby, message: string) {
  const systemMessage: ChatMessage = {
    id: randomUUID(),
    playerId: 'system',
    playerName: 'System',
    message,
    timestamp: Date.now(),
    isSystem: true,
  };
  lobby.messages.push(systemMessage);
  io.to(lobby.code).emit('chat:message', systemMessage);
}

io.on('connection', (socket: Socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Setup Bumper Balls game handlers
  setupBumperBallsHandlers(io, socket);

  // =====================================================
  // LOBBY MANAGEMENT
  // =====================================================

  socket.on('lobby:create', async (data: {
    playerName: string;
    playerId?: string;
    roomCode?: string;
    isGameBuddiesRoom?: boolean;
    sessionToken?: string;
  }) => {
    try {
      const { playerName, playerId, roomCode: gbRoomCode, isGameBuddiesRoom, sessionToken } = data;

      console.log(`[lobby:create] Player: ${playerName}, PlayerId: ${playerId}, GBRoom: ${gbRoomCode}`);

      // Validate player name
      const nameValidation = validatePlayerName(playerName);
      if (!nameValidation.valid) {
        socket.emit('error', { message: nameValidation.error });
        return;
      }

      // Generate or use provided room code
      let code = gbRoomCode;
      if (!code) {
        do {
          code = generateRoomCode();
        } while (lobbies.has(code));
      }

      // Create lobby
      const lobby: Lobby = {
        id: randomUUID(),
        code,
        hostId: socket.id,
        settings: { ...DEFAULT_SETTINGS },
        players: [
          {
            socketId: socket.id,
            gameBuddiesUuid: playerId,
            name: sanitizeInput(playerName),
            score: 0,
            connected: true,
            isHost: true,
          },
        ],
        state: 'LOBBY_WAITING' as GameState,
        gameData: null,
        isGameBuddiesRoom: isGameBuddiesRoom || false,
        gameBuddiesRoomCode: gbRoomCode,
        messages: [],
      };

      lobbies.set(code, lobby);
      socket.join(code);

      console.log(`[Lobby ${code}] Created by ${playerName}`);

      // Store session mapping
      if (sessionToken) {
        gameBuddiesSessions.set(sessionToken, code);
      }

      // Send lobby info to client
      socket.emit('lobby:created', {
        roomCode: code,
        lobby: {
          ...lobby,
          mySocketId: socket.id,
          players: lobby.players.map(sanitizePlayer),
        },
      });

      // Update GameBuddies status
      if (isGameBuddiesRoom && playerId) {
        await gameBuddiesService.updatePlayerStatus(
          gbRoomCode || code,
          playerId,
          'connected',
          'lobby',
          { playerName }
        );
      }

      sendSystemMessage(lobby, `${playerName} created the room`);
    } catch (error: any) {
      console.error('[lobby:create] Error:', error);
      socket.emit('error', { message: 'Failed to create lobby' });
    }
  });

  socket.on('lobby:join', async (data: {
    roomCode: string;
    playerName: string;
    playerId?: string;
  }) => {
    try {
      const { roomCode, playerName, playerId } = data;

      console.log(`[lobby:join] Room: ${roomCode}, Player: ${playerName}, PlayerId: ${playerId}`);

      // Validate
      const nameValidation = validatePlayerName(playerName);
      if (!nameValidation.valid) {
        socket.emit('error', { message: nameValidation.error });
        return;
      }

      const codeValidation = validateRoomCode(roomCode);
      if (!codeValidation.valid) {
        socket.emit('error', { message: codeValidation.error });
        return;
      }

      const normalizedCode = roomCode.toUpperCase();
      const lobby = lobbies.get(normalizedCode);

      if (!lobby) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if room is full
      if (lobby.players.length >= lobby.settings.maxPlayers) {
        socket.emit('error', { message: 'Room is full' });
        return;
      }

      // Check if player already in room
      const existingPlayer = lobby.players.find(p => p.socketId === socket.id);
      if (existingPlayer) {
        socket.emit('error', { message: 'You are already in this room' });
        return;
      }

      // Add player
      const newPlayer: Player = {
        socketId: socket.id,
        gameBuddiesUuid: playerId,
        name: sanitizeInput(playerName),
        score: 0,
        connected: true,
        isHost: false,
      };

      lobby.players.push(newPlayer);
      socket.join(normalizedCode);

      console.log(`[Lobby ${normalizedCode}] ${playerName} joined`);

      // Notify player
      socket.emit('lobby:joined', {
        lobby: {
          ...lobby,
          mySocketId: socket.id,
          players: lobby.players.map(sanitizePlayer),
        },
      });

      // Notify others
      socket.to(normalizedCode).emit('lobby:player-joined', {
        players: lobby.players.map(sanitizePlayer),
      });

      // Update GameBuddies status
      if (lobby.isGameBuddiesRoom && playerId) {
        await gameBuddiesService.updatePlayerStatus(
          lobby.gameBuddiesRoomCode || lobby.code,
          playerId,
          'connected',
          'lobby',
          { playerName }
        );
      }

      sendSystemMessage(lobby, `${playerName} joined the room`);
    } catch (error: any) {
      console.error('[lobby:join] Error:', error);
      socket.emit('error', { message: 'Failed to join lobby' });
    }
  });

  // =====================================================
  // GAME MANAGEMENT
  // =====================================================

  socket.on('game:start', (data: { roomCode: string }) => {
    try {
      const lobby = lobbies.get(data.roomCode);
      if (!lobby) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if host
      if (lobby.hostId !== socket.id) {
        socket.emit('error', { message: 'Only host can start the game' });
        return;
      }

      // Check minimum players
      if (lobby.players.length < lobby.settings.minPlayers) {
        socket.emit('error', {
          message: `Need at least ${lobby.settings.minPlayers} players to start`,
        });
        return;
      }

      console.log(`[Lobby ${lobby.code}] Starting game`);

      // Change state to PLAYING
      lobby.state = 'PLAYING';

      // Initialize Bumper Balls game
      initializeBumperBallsGame(lobby, io);

      // Note: game:started event is sent by initializeBumperBallsGame during countdown
      sendSystemMessage(lobby, 'Game starting!');
    } catch (error: any) {
      console.error('[game:start] Error:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  });

  // ADD YOUR GAME EVENT HANDLERS HERE
  // Example:
  // socket.on('game:action', (data: { roomCode: string; action: string; data: any }) => {
  //   try {
  //     const lobby = lobbies.get(data.roomCode);
  //     if (!lobby) return;
  //
  //     // Process game action
  //     // Update lobby.gameData
  //     // Emit updates to clients
  //
  //     io.to(lobby.code).emit('game:update', { gameData: lobby.gameData });
  //   } catch (error) {
  //     console.error('[game:action] Error:', error);
  //   }
  // });

  socket.on('game:end', (data: { roomCode: string }) => {
    try {
      const lobby = lobbies.get(data.roomCode);
      if (!lobby) return;

      if (lobby.hostId !== socket.id) {
        socket.emit('error', { message: 'Only host can end the game' });
        return;
      }

      console.log(`[Lobby ${lobby.code}] Game ended`);

      lobby.state = 'GAME_ENDED';
      lobby.gameData = null;

      io.to(lobby.code).emit('game:ended', {
        lobby: {
          ...lobby,
          players: lobby.players.map(sanitizePlayer),
        },
      });

      sendSystemMessage(lobby, 'Game ended!');
    } catch (error: any) {
      console.error('[game:end] Error:', error);
    }
  });

  socket.on('game:restart', (data: { roomCode: string }) => {
    try {
      const lobby = lobbies.get(data.roomCode);
      if (!lobby) return;

      if (lobby.hostId !== socket.id) {
        socket.emit('error', { message: 'Only host can restart the game' });
        return;
      }

      console.log(`[Lobby ${lobby.code}] Restarting game`);

      // Reset scores
      lobby.players.forEach(p => (p.score = 0));
      lobby.state = 'LOBBY_WAITING';
      lobby.gameData = null;

      io.to(lobby.code).emit('lobby:settings-updated', {
        settings: lobby.settings,
      });

      io.to(lobby.code).emit('lobby:player-joined', {
        players: lobby.players.map(sanitizePlayer),
      });

      sendSystemMessage(lobby, 'Game restarted - back to lobby');
    } catch (error: any) {
      console.error('[game:restart] Error:', error);
    }
  });

  // =====================================================
  // SETTINGS MANAGEMENT
  // =====================================================

  socket.on('settings:update', (data: { roomCode: string; settings: Partial<Settings> }) => {
    try {
      const lobby = lobbies.get(data.roomCode);
      if (!lobby) return;

      if (lobby.hostId !== socket.id) {
        socket.emit('error', { message: 'Only host can update settings' });
        return;
      }

      // Update settings
      lobby.settings = { ...lobby.settings, ...data.settings };

      io.to(lobby.code).emit('lobby:settings-updated', {
        settings: lobby.settings,
      });

      console.log(`[Lobby ${lobby.code}] Settings updated`);
    } catch (error: any) {
      console.error('[settings:update] Error:', error);
    }
  });

  // =====================================================
  // PLAYER MANAGEMENT
  // =====================================================

  socket.on('player:kick', (data: { roomCode: string; playerId: string }) => {
    try {
      const { roomCode, playerId } = data;
      const lobby = lobbies.get(roomCode);

      if (!lobby) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Check if host
      if (lobby.hostId !== socket.id) {
        socket.emit('error', { message: 'Only host can kick players' });
        return;
      }

      // Cannot kick yourself
      if (playerId === socket.id) {
        socket.emit('error', { message: 'Cannot kick yourself' });
        return;
      }

      const player = lobby.players.find((p) => p.socketId === playerId);
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }

      console.log(`[Lobby ${lobby.code}] ${player.name} kicked by host`);

      sendSystemMessage(lobby, `${player.name} was kicked from the game`);

      // Remove player from lobby
      lobby.players = lobby.players.filter((p) => p.socketId !== playerId);

      // Notify kicked player
      const kickedSocket = io.sockets.sockets.get(playerId);
      if (kickedSocket) {
        kickedSocket.emit('player:kicked', { message: 'You have been kicked by the host' });
        kickedSocket.leave(roomCode);
      }

      // Notify remaining players
      io.to(lobby.code).emit('lobby:player-left', {
        playerId,
        players: lobby.players.map((p) => sanitizePlayer(p)),
      });

      // Notify GameBuddies
      if (lobby.isGameBuddiesRoom && player.gameBuddiesUuid) {
        gameBuddiesService.updatePlayerStatus(
          lobby.gameBuddiesRoomCode || lobby.code,
          player.gameBuddiesUuid,
          'disconnected',
          'kicked',
          { playerName: player.name }
        );
      }

      // Check if lobby is empty
      if (lobby.players.length === 0) {
        lobbies.delete(lobby.code);
        console.log(`[Lobby ${lobby.code}] Deleted (empty after kick)`);
        return;
      }
    } catch (error: any) {
      console.error('[player:kick] Error:', error);
      socket.emit('error', { message: 'Failed to kick player' });
    }
  });

  // =====================================================
  // CHAT
  // =====================================================

  socket.on('chat:send-message', (data: { roomCode: string; message: string }) => {
    try {
      const lobby = lobbies.get(data.roomCode);
      if (!lobby) return;

      const player = lobby.players.find(p => p.socketId === socket.id);
      if (!player) return;

      const validation = validateChatMessage(data.message);
      if (!validation.valid) {
        socket.emit('error', { message: validation.error });
        return;
      }

      const chatMessage: ChatMessage = {
        id: randomUUID(),
        playerId: socket.id,
        playerName: player.name,
        message: sanitizeInput(data.message),
        timestamp: Date.now(),
      };

      lobby.messages.push(chatMessage);
      if (lobby.messages.length > 100) {
        lobby.messages = lobby.messages.slice(-100);
      }

      io.to(lobby.code).emit('chat:message', chatMessage);
    } catch (error: any) {
      console.error('[chat:send-message] Error:', error);
    }
  });

  // =====================================================
  // GAMEBUDDIES INTEGRATION
  // =====================================================

  socket.on('gamebuddies:return', async (data: {
    roomCode: string;
    returnAll?: boolean;
  }) => {
    try {
      const lobby = lobbies.get(data.roomCode);
      if (!lobby || !lobby.isGameBuddiesRoom) {
        console.log('[gamebuddies:return] Not a GameBuddies room');
        socket.emit('gamebuddies:return-redirect', {
          url: 'https://gamebuddies.io',
        });
        return;
      }

      console.log(`[GameBuddies] Return request for room ${lobby.code}`);

      const result = await gameBuddiesService.requestReturnToLobby(
        lobby.gameBuddiesRoomCode || lobby.code,
        {
          returnAll: data.returnAll ?? true,
          initiatedBy: 'host',
          reason: 'game_ended',
        }
      );

      if (data.returnAll) {
        io.to(lobby.code).emit('gamebuddies:return-redirect', {
          url: result.returnUrl,
        });
      } else {
        socket.emit('gamebuddies:return-redirect', {
          url: result.returnUrl,
        });
      }
    } catch (error: any) {
      console.error('[gamebuddies:return] Error:', error);
      socket.emit('gamebuddies:return-redirect', {
        url: 'https://gamebuddies.io',
      });
    }
  });

  // =====================================================
  // WEBRTC SIGNALING
  // =====================================================

  socket.on('webrtc:offer', ({ roomCode, toPeerId, offer }) => {
    io.to(toPeerId).emit('webrtc:offer', { fromPeerId: socket.id, offer });
  });

  socket.on('webrtc:answer', ({ roomCode, toPeerId, answer }) => {
    io.to(toPeerId).emit('webrtc:answer', { fromPeerId: socket.id, answer });
  });

  socket.on('webrtc:ice-candidate', ({ roomCode, toPeerId, candidate }) => {
    io.to(toPeerId).emit('webrtc:ice-candidate', { fromPeerId: socket.id, candidate });
  });

  socket.on('webrtc:enable-video', ({ roomCode, peerId, connectionType }) => {
    console.log(`[WebRTC] ${peerId} enabled video (type: ${connectionType})`);

    if (!videoEnabledPeers.has(roomCode)) {
      videoEnabledPeers.set(roomCode, new Set());
    }
    videoEnabledPeers.get(roomCode)!.add(peerId);

    if (connectionType) {
      peerConnectionTypes.set(peerId, connectionType);
    }

    socket.to(roomCode).emit('webrtc:peer-video-enabled', {
      peerId,
      connectionType: connectionType || 'unknown',
    });
  });

  socket.on('webrtc:disable-video', ({ roomCode, peerId }) => {
    console.log(`[WebRTC] ${peerId} disabled video`);

    const peers = videoEnabledPeers.get(roomCode);
    if (peers) {
      peers.delete(peerId);
    }

    peerConnectionTypes.delete(peerId);

    socket.to(roomCode).emit('webrtc:peer-video-disabled', { peerId });
  });

  // =====================================================
  // DISCONNECT HANDLING
  // =====================================================

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);

    // Find and update lobbies
    for (const [code, lobby] of lobbies.entries()) {
      const player = lobby.players.find(p => p.socketId === socket.id);
      if (!player) continue;

      console.log(`[Lobby ${code}] Player ${player.name} disconnected`);

      // Mark as disconnected with grace period
      player.connected = false;
      player.disconnectedAt = Date.now();

      // Notify others
      io.to(code).emit('lobby:player-left', {
        playerId: socket.id,
        players: lobby.players.map(sanitizePlayer),
      });

      sendSystemMessage(lobby, `${player.name} disconnected`);

      // Notify GameBuddies
      if (lobby.isGameBuddiesRoom && player.gameBuddiesUuid) {
        gameBuddiesService.updatePlayerStatus(
          lobby.gameBuddiesRoomCode || lobby.code,
          player.gameBuddiesUuid,
          'disconnected',
          'disconnect',
          { playerName: player.name }
        );
      }

      // Auto-remove after 30 seconds
      setTimeout(() => {
        const currentLobby = lobbies.get(code);
        if (!currentLobby) return;

        const currentPlayer = currentLobby.players.find(p => p.socketId === socket.id);
        if (!currentPlayer || currentPlayer.connected) return;

        console.log(`[Lobby ${code}] Removing ${currentPlayer.name} after timeout`);

        currentLobby.players = currentLobby.players.filter(p => p.socketId !== socket.id);

        io.to(code).emit('lobby:player-left', {
          playerId: socket.id,
          players: currentLobby.players.map(sanitizePlayer),
        });

        // If lobby is empty, delete it
        if (currentLobby.players.length === 0) {
          lobbies.delete(code);
          console.log(`[Lobby ${code}] Deleted (empty after disconnect)`);
        }
      }, 30000);

      // Clean up WebRTC
      for (const [roomCode, peers] of videoEnabledPeers.entries()) {
        peers.delete(socket.id);
      }
      peerConnectionTypes.delete(socket.id);

      break; // Player can only be in one lobby
    }
  });
});

// Serve static files from client build (production)
if (process.env.NODE_ENV === 'production') {
  const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
  console.log(`[Static] Serving client from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    lobbies: lobbies.size,
    timestamp: new Date().toISOString(),
  });
});

// Catch-all route for client-side routing (SPA) - must be last
if (process.env.NODE_ENV === 'production') {
  app.get('/*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'client', 'dist', 'index.html'));
  });
}

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`
🚀 GameBuddies Template Server Running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Port: ${PORT}
  Environment: ${process.env.NODE_ENV || 'development'}
  GameBuddies API: ${gameBuddiesService ? '✅ Connected' : '❌ Disabled'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});
