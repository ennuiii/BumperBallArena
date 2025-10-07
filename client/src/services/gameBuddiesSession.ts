export type GameBuddiesSession = {
  roomCode: string;
  playerName?: string;
  playerId?: string;
  isHost: boolean;
  expectedPlayers?: number;
  returnUrl: string;
  sessionToken?: string;
  source: 'gamebuddies';
  isStreamerMode?: boolean; // New: indicates if this is streamer mode
  hideRoomCode?: boolean; // New: indicates if room code should be hidden
  pendingResolution?: boolean; // New: indicates if session needs async resolution
};

const SESSION_KEY = 'gamebuddies:session';

/**
 * Parse GameBuddies session from URL parameters
 */
export function parseGameBuddiesSession(): GameBuddiesSession | null {
  const params = new URLSearchParams(window.location.search);

  // Check for streamer mode (no roomcode in URL)
  const sessionToken = params.get('session');
  const players = params.get('players');
  const playerName = params.get('name');
  const playerId = params.get('playerId');
  const role = params.get('role');

  // Streamer mode detection: session + players parameters present (name and role are optional)
  const isStreamerMode = !!(sessionToken && players);

  if (isStreamerMode) {
    // For streamer mode, we need to resolve the session token to get the actual room code
    // Don't return a session immediately - it needs to be resolved asynchronously
    // Store the streamer mode parameters for async resolution
    const pendingSession = {
      pendingResolution: true,
      sessionToken,
      playerName: playerName || undefined,
      playerId: playerId || undefined,
      isHost: role === 'gm',
      expectedPlayers: parseInt(players) || 0,
      source: 'gamebuddies' as const,
      isStreamerMode: true,
      hideRoomCode: true,
    };

    // Store the pending session for async resolution
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(pendingSession));
    return null; // Return null to trigger async resolution
  }

  // Original GameBuddies mode (with roomcode in URL)
  const roomCode = params.get('room') || params.get('gbRoomCode');

  // Optional parameters
  const isHost = role === 'host' || role === 'gm' || params.get('isHost') === 'true';
  const expectedPlayers = parseInt(params.get('players') || '0');
  const returnUrl = params.get('returnUrl');

  // Detect if launched from GameBuddies
  const isGameBuddiesSession = !!(roomCode && (playerName || playerId || isHost));

  if (!isGameBuddiesSession) {
    return null;
  }

  return {
    roomCode: roomCode!,
    playerName: playerName || undefined,
    playerId: playerId || undefined,
    isHost,
    expectedPlayers,
    returnUrl: returnUrl || `https://gamebuddies.io/lobby/${roomCode}`,
    sessionToken: sessionToken || undefined,
    source: 'gamebuddies',
    isStreamerMode: false,
    hideRoomCode: false,
  };
}

/**
 * Store session in sessionStorage
 */
export function storeSession(session: GameBuddiesSession | null) {
  if (!session) {
    clearSession();
    return;
  }

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Load session from sessionStorage
 */
export function loadSession(): GameBuddiesSession | null {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('[GameBuddies] Failed to parse session:', e);
    return null;
  }
}

/**
 * Clear session from sessionStorage
 */
export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

/**
 * Get current session (from URL or storage)
 */
export function getCurrentSession(): GameBuddiesSession | null {
  const urlSession = parseGameBuddiesSession();
  if (urlSession) {
    storeSession(urlSession);
    return urlSession;
  }

  return loadSession();
}

/**
 * Resolve session token to get actual room code from GameBuddies API (direct call)
 */
export async function resolveSessionToken(sessionToken: string): Promise<{
  roomCode: string;
  gameType: string;
  streamerMode: boolean;
  metadata?: any;
} | null> {
  try {
    console.log(`[GameBuddies Client] Resolving session token: ${sessionToken.substring(0, 8)}...`);
    console.log(`[GameBuddies Client] Current window.location.origin: ${window.location.origin}`);
    console.log(`[GameBuddies Client] Current window.location.href: ${window.location.href}`);

    // Call GameBuddies API directly instead of going through ClueScale server proxy
    // This reduces latency and removes unnecessary proxy hop
    // GameBuddies has CORS configured to allow all .onrender.com domains
    const baseUrl = 'https://gamebuddies.io';
    console.log(`[GameBuddies Client] Using GameBuddies API directly: ${baseUrl}`);

    const fullUrl = `${baseUrl}/api/game-sessions/${sessionToken}`;
    console.log(`[GameBuddies Client] Fetching URL: ${fullUrl}`);

    // Add detailed debugging about the fetch request
    console.log(`[GameBuddies Client] Request details:`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors',
      credentials: 'include' // Changed from 'same-origin' to support cross-origin requests
    });

    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      mode: 'cors',
      credentials: 'include' // Changed from 'same-origin' to support cross-origin requests
    });

    console.log(`[GameBuddies Client] Response status: ${response.status}`);
    console.log(`[GameBuddies Client] Response headers:`, response.headers);

    if (!response.ok) {
      console.error('[GameBuddies] Failed to resolve session token:', response.status, response.statusText);
      console.error('[GameBuddies] Response URL:', response.url);

      // Try to read the error body for more info
      try {
        const errorText = await response.text();
        console.error('[GameBuddies] Error response body:', errorText);
      } catch (e) {
        console.error('[GameBuddies] Could not read error response body:', e);
      }

      return null;
    }

    const data = await response.json();
    console.log(`[GameBuddies Client] Response data:`, data);

    if (data.success) {
      console.log(`[GameBuddies Client] Session resolved successfully: ${sessionToken.substring(0, 8)}... -> Room: ${data.roomCode}`);
      return {
        roomCode: data.roomCode,
        gameType: data.gameType,
        streamerMode: data.streamerMode,
        metadata: data.metadata
      };
    } else {
      console.error('[GameBuddies Client] Session resolution failed:', data);
      return null;
    }
  } catch (error) {
    console.error('[GameBuddies Client] Error resolving session token:', error);
    if (error instanceof Error) {
      console.error('[GameBuddies Client] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    } else {
      console.error('[GameBuddies Client] Unknown error type:', typeof error);
    }
    return null;
  }
}

/**
 * Resolve pending session asynchronously
 */
export async function resolvePendingSession(): Promise<GameBuddiesSession | null> {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;

  try {
    const pending = JSON.parse(stored);

    if (!pending.pendingResolution || !pending.sessionToken) {
      return pending; // Return normal sessions as-is
    }

    console.log('[GameBuddies] Resolving pending session token:', pending.sessionToken.substring(0, 8) + '...');

    const resolved = await resolveSessionToken(pending.sessionToken);
    if (!resolved) {
      console.error('[GameBuddies] Failed to resolve session token');
      clearSession();
      return null;
    }

    console.log('[GameBuddies] Session resolved to room code:', resolved.roomCode);

    // Build the final session object
    const finalSession: GameBuddiesSession = {
      roomCode: resolved.roomCode,
      playerName: pending.playerName,
      playerId: pending.playerId,
      isHost: pending.isHost,
      expectedPlayers: pending.expectedPlayers,
      returnUrl: `https://gamebuddies.io/cluescale?session=${pending.sessionToken}&players=${pending.expectedPlayers}`,
      sessionToken: pending.sessionToken,
      source: 'gamebuddies',
      isStreamerMode: true,
      hideRoomCode: true,
    };

    // Store the resolved session
    storeSession(finalSession);
    return finalSession;
  } catch (error) {
    console.error('[GameBuddies] Failed to resolve pending session:', error);
    clearSession();
    return null;
  }
}