/**
 * Universal Webcam Integration Config Interface
 *
 * This interface abstracts away game-specific state management,
 * allowing the webcam system to work with any React/Node.js game.
 *
 * Claude AI can analyze your project and generate a custom adapter
 * that implements this interface for your specific game.
 */

import React, { createContext, useContext } from 'react';
import { Socket } from 'socket.io-client';
import type { Language } from '../utils/translations';

/**
 * Player data structure (flexible, adapt to your game)
 */
export interface WebcamPlayer {
  id: string;
  name: string;
  // Optional fields - your game may have more
  lives?: number;
  isEliminated?: boolean;
  score?: number;
  team?: string;
  [key: string]: any; // Allow any additional properties
}

/**
 * Core configuration interface
 * Implement this to integrate webcam into your game
 */
export interface WebcamConfig {
  // ========================================
  // REQUIRED: Core Video Chat Functionality
  // ========================================

  /**
   * Get the Socket.io connection instance
   * @returns Active socket connection
   */
  getSocket: () => Socket;

  /**
   * Get the current user's ID
   * @returns User ID string (your playerId, userId, etc.)
   */
  getUserId: () => string | null;

  /**
   * Get the current room/game/session code
   * @returns Room code string or null if not in a room
   */
  getRoomCode: () => string | null;

  // ========================================
  // OPTIONAL: Enhanced Functionality
  // ========================================

  /**
   * Get the current user's role
   * @returns Role string (e.g., 'player', 'gamemaster', 'host', 'spectator')
   * @default 'player'
   */
  getUserRole?: () => string;

  /**
   * Get list of players in the room
   * @returns Array of player objects (empty array if not applicable)
   */
  getPlayers?: () => WebcamPlayer[];

  /**
   * Get the gamemaster/host information
   * @returns Gamemaster object or null
   */
  getGamemaster?: () => { id: string; name: string } | null;

  /**
   * Get current language for i18n
   * @returns Language code ('en' or 'de')
   * @default 'en'
   */
  getLanguage?: () => Language;

  /**
   * Callback when media state changes (for your game to react)
   * @param isMicOn - Whether microphone is currently on
   */
  onMediaStateChange?: (isMicOn: boolean) => void;

  // ========================================
  // OPTIONAL: Game-Specific UI Features
  // ========================================

  /**
   * Whether to show lives/hearts display
   * @default false
   */
  showLives?: boolean;

  /**
   * Get number of lives for a specific player
   * @param playerId - Player ID
   * @returns Number of lives (0-N)
   */
  getLivesForPlayer?: (playerId: string) => number;

  /**
   * Whether to show voting buttons (for voting games)
   * @default false
   */
  showVoting?: boolean;

  /**
   * Whether user has already voted (for voting games)
   * @returns true if voted, false otherwise
   */
  getHasVoted?: () => boolean;

  /**
   * Callback when user votes for a player
   * @param playerId - Player ID being voted for
   */
  onVote?: (playerId: string) => void;

  /**
   * Check if currently in voting phase
   * @returns true if voting is active
   */
  isVotingPhase?: () => boolean;

  /**
   * Whether to show turn indicators (for turn-based games)
   * @default false
   */
  showTurnIndicators?: boolean;

  /**
   * Get the player who is currently taking their turn
   * @returns Player ID or null
   */
  getCurrentTurnPlayer?: () => string | null;

  /**
   * Get the player who will take the next turn
   * @returns Player ID or null
   */
  getNextTurnPlayer?: () => string | null;

  /**
   * Get the current game state (for conditional UI)
   * @returns Game state string (e.g., 'lobby', 'playing', 'voting', 'ended')
   */
  getGameState?: () => string;

  // ========================================
  // OPTIONAL: UI Customization
  // ========================================

  /**
   * Custom CSS class for main container
   */
  containerClassName?: string;

  /**
   * Whether to enable compact mode (smaller UI)
   * @default false
   */
  compactMode?: boolean;

  /**
   * Maximum number of video feeds to show
   * @default Infinity (show all)
   */
  maxVideoFeeds?: number;

  /**
   * Custom player name formatter
   * @param player - Player object
   * @returns Formatted display name
   */
  formatPlayerName?: (player: WebcamPlayer) => string;
}

/**
 * Create a webcam config with default values
 * @param config - Partial config (only required fields needed)
 * @returns Complete config with defaults applied
 */
export function createWebcamConfig(config: Partial<WebcamConfig> & Required<Pick<WebcamConfig, 'getSocket' | 'getUserId' | 'getRoomCode'>>): WebcamConfig {
  return {
    // Required fields (passed in)
    getSocket: config.getSocket,
    getUserId: config.getUserId,
    getRoomCode: config.getRoomCode,

    // Optional fields with defaults
    getUserRole: config.getUserRole || (() => 'player'),
    getPlayers: config.getPlayers || (() => []),
    getGamemaster: config.getGamemaster || (() => null),
    getLanguage: config.getLanguage || (() => 'en'),
    onMediaStateChange: config.onMediaStateChange || (() => {}),

    // UI features (disabled by default for maximum compatibility)
    showLives: config.showLives ?? false,
    getLivesForPlayer: config.getLivesForPlayer || (() => 3),
    showVoting: config.showVoting ?? false,
    getHasVoted: config.getHasVoted || (() => false),
    onVote: config.onVote || (() => {}),
    isVotingPhase: config.isVotingPhase || (() => false),
    showTurnIndicators: config.showTurnIndicators ?? false,
    getCurrentTurnPlayer: config.getCurrentTurnPlayer || (() => null),
    getNextTurnPlayer: config.getNextTurnPlayer || (() => null),
    getGameState: config.getGameState || (() => 'playing'),

    // UI customization
    containerClassName: config.containerClassName || '',
    compactMode: config.compactMode ?? false,
    maxVideoFeeds: config.maxVideoFeeds ?? Infinity,
    formatPlayerName: config.formatPlayerName || ((player) => player.name),
  };
}

/**
 * Context for providing config to components
 */
export const WebcamConfigContext = createContext<WebcamConfig | null>(null);

/**
 * Hook to access webcam config in components
 * @throws Error if used outside WebcamConfigProvider
 */
export function useWebcamConfig(): WebcamConfig {
  const config = useContext(WebcamConfigContext);
  if (!config) {
    throw new Error('useWebcamConfig must be used within WebcamConfigProvider');
  }
  return config;
}

/**
 * Provider component to inject config
 */
export interface WebcamConfigProviderProps {
  config: WebcamConfig;
  children: React.ReactNode;
}

export function WebcamConfigProvider({ config, children }: WebcamConfigProviderProps) {
  return (
    <WebcamConfigContext.Provider value={config}>
      {children}
    </WebcamConfigContext.Provider>
  );
}
