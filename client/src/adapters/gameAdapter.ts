import type { Socket } from 'socket.io-client';
import type { WebcamConfig, WebcamPlayer } from '../config/WebcamConfig.tsx';
import type { Language } from '../utils/translations';
import type { Lobby } from '../types';

/**
 * Game Adapter for Webcam Integration
 *
 * This adapter bridges your game's state to the WebcamConfig interface,
 * allowing the webcam system to work with your game.
 *
 * You can customize this adapter to add game-specific features like:
 * - Turn indicators (showTurnIndicators, getCurrentTurnPlayer)
 * - Lives display (showLives, getLivesForPlayer)
 * - Voting system (showVoting, onVote)
 * - etc.
 */
export function createGameAdapter(
  socket: Socket,
  roomCode: string,
  lobby: Lobby | null
): WebcamConfig {
  return {
    getSocket: () => socket,
    getRoomCode: () => roomCode,
    getUserId: () => socket?.id || '',
    getLanguage: (): Language => 'en',
    getPlayers: (): WebcamPlayer[] => {
      if (!lobby || !lobby.players) return [];
      return lobby.players.map(player => ({
        id: player.socketId,
        name: player.name,
        score: player.score,
      }));
    },

    // OPTIONAL: Add game-specific UI features here

    // Example: Turn-based game
    // showTurnIndicators: true,
    // getCurrentTurnPlayer: () => {
    //   if (!lobby?.gameData?.currentTurn) return null;
    //   return lobby.gameData.currentTurn;
    // },

    // Example: Lives system
    // showLives: true,
    // getLivesForPlayer: (playerId: string) => {
    //   const player = lobby?.players.find(p => p.socketId === playerId);
    //   return player?.lives || 0;
    // },

    // Example: Voting system
    // showVoting: lobby?.state === 'VOTING',
    // getHasVoted: () => {
    //   // Return true if current player has voted
    //   return false;
    // },
    // onVote: (playerId: string) => {
    //   socket.emit('game:vote', { roomCode, votedFor: playerId });
    // },
  };
}
