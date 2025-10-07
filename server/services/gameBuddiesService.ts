import axios from 'axios';

interface StatusUpdateOptions {
  status: 'connected' | 'in_game' | 'disconnected';
  location: 'game' | 'disconnected';
  reason: string;
  gameData?: any;
}

interface ReturnOptions {
  playerId?: string;
  initiatedBy?: string;
  reason?: string;
  returnAll?: boolean;
  metadata?: any;
}

class GameBuddiesService {
  private apiBase: string;
  private apiKey: string | undefined;
  private gameId: string;
  private apiTimeout: number = 5000;

  constructor() {
    this.apiBase = process.env.GAMEBUDDIES_CENTRAL_URL || 'https://gamebuddies.io';
    this.apiKey = process.env.GAMEBUDDIES_API_KEY;
    this.gameId = process.env.GAME_ID || 'guess-the-number';

    console.log(`[GameBuddies] Initialized with API base: ${this.apiBase}`);
    console.log(`[GameBuddies] API Key: ${this.apiKey ? '✅ Configured' : '❌ Missing'}`);
  }

  /**
   * Check if ID is a GameBuddies UUID (not Socket.IO ID)
   */
  isGameBuddiesUUID(id: string | undefined): boolean {
    if (!id) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Update player status via External Game Status API
   */
  async updatePlayerStatus(
    roomCode: string,
    playerId: string,
    status: 'connected' | 'in_game' | 'disconnected',
    reason: string,
    gameData: any = null
  ): Promise<boolean> {
    if (!this.apiKey) {
      console.warn('[GameBuddies] No API key - skipping status update');
      return false;
    }

    if (!this.isGameBuddiesUUID(playerId)) {
      console.error('[GameBuddies] Invalid UUID format:', playerId);
      return false;
    }

    const url = `${this.apiBase}/api/game/rooms/${roomCode}/players/${playerId}/status`;
    const payload: StatusUpdateOptions = {
      status,
      location: status === 'disconnected' ? 'disconnected' : 'game',
      reason,
      gameData,
    };

    try {
      console.log(`[GameBuddies] Updating player status: ${status}`);
      await axios.post(url, payload, {
        timeout: this.apiTimeout,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
      });

      console.log('[GameBuddies] Status update successful');
      return true;
    } catch (error: any) {
      console.error('[GameBuddies] Status update failed:', error.message);
      if (error.response) {
        console.error('  Status:', error.response.status);
        console.error('  Data:', error.response.data);
      }
      return false;
    }
  }

  /**
   * Request return to GameBuddies lobby
   */
  async requestReturnToLobby(
    roomCode: string,
    options: ReturnOptions = {}
  ): Promise<{
    success: boolean;
    returnUrl: string;
    sessionToken?: string;
    playersReturned?: number;
    error?: string;
  }> {
    if (!this.apiKey) {
      console.warn('[GameBuddies] No API key - using fallback return');
      return {
        success: false,
        returnUrl: `${this.apiBase}/lobby/${roomCode}`,
        error: 'NO_API_KEY',
      };
    }

    const {
      playerId,
      initiatedBy = 'host',
      reason = 'game_ended',
      returnAll = true,
      metadata = {},
    } = options;

    const url = `${this.apiBase}/api/v2/external/return`;
    const payload = {
      roomCode,
      returnAll,
      playerId: returnAll ? undefined : playerId,
      initiatedBy,
      reason,
      metadata: {
        game: this.gameId,
        timestamp: new Date().toISOString(),
        ...metadata,
      },
    };

    try {
      console.log(
        `[GameBuddies] Requesting return (mode: ${returnAll ? 'group' : 'individual'})`
      );
      const response = await axios.post(url, payload, {
        timeout: this.apiTimeout,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
      });

      console.log('[GameBuddies] Return request successful');
      return {
        success: true,
        returnUrl: response.data.returnUrl,
        sessionToken: response.data.sessionToken,
        playersReturned: response.data.playersReturned,
      };
    } catch (error: any) {
      console.error('[GameBuddies] Return request failed:', error.message);
      return {
        success: false,
        returnUrl: `${this.apiBase}/lobby/${roomCode}`,
        error: error.message,
      };
    }
  }
}

export default new GameBuddiesService();