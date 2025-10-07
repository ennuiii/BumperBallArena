# GameBuddies Integration Guide

Complete guide to the GameBuddies integration system.

## How It Works

GameBuddies allows streamers and content creators to launch games from a central lobby without revealing room codes on stream.

### Integration Flow

1. **User clicks "Launch Game" on GameBuddies.io**
2. **GameBuddies creates session** with unique token
3. **Browser redirects** to your game with URL parameters
4. **Your game parses parameters** and auto-creates/joins room
5. **Players connect** through safe invite links
6. **Game sends status updates** to GameBuddies
7. **Players return to lobby** when game ends

## URL Parameters

### Host (Streamer Mode)
```
https://gamebuddies.io/your-game?session=abc123&players=4&role=gm
```

Parameters:
- `session` - Session token for resolving room code
- `players` - Expected number of players
- `role=gm` - Indicates host/game master

### Player (Joining)
```
https://gamebuddies.io/your-game?session=abc123&players=4&name=Alice&playerId=uuid
```

Parameters:
- `session` - Same session token as host
- `players` - Expected players
- `name` - Player's name
- `playerId` - GameBuddies UUID for player

## Client-Side Integration

### Session Parsing

**client/src/services/gameBuddiesSession.ts** handles session detection:

```typescript
// Parse URL parameters
const session = parseGameBuddiesSession();

if (session) {
  if (session.isHost) {
    // Auto-create room
    handleCreateRoom(session.playerName, session);
  } else {
    // Auto-join room
    handleJoinRoom(session.roomCode, session.playerName, session);
  }
}
```

### Session Resolution

For streamer mode (no room code in URL), the session token must be resolved:

```typescript
// Resolve session token → room code
const resolved = await resolveSessionToken(sessionToken);
// Returns: { roomCode, gameType, streamerMode }
```

### Storing Session

Sessions are stored in `sessionStorage`:

```typescript
storeSession(session);        // Save
const session = loadSession(); // Load
clearSession();               // Clear
```

## Server-Side Integration

### API Configuration

**server/.env**:
```env
GAMEBUDDIES_CENTRAL_URL=https://gamebuddies.io
GAMEBUDDIES_API_KEY=your_api_key_here
GAME_ID=your-game-name
```

### Status Updates

Update GameBuddies when player status changes:

```typescript
await gameBuddiesService.updatePlayerStatus(
  roomCode,           // GameBuddies room code
  playerId,           // GameBuddies UUID
  'connected',        // Status: 'connected' | 'in_game' | 'disconnected'
  'joined_lobby',     // Reason/location
  { playerName }      // Additional data
);
```

**When to update:**
- Player joins: `status: 'connected', reason: 'lobby'`
- Game starts: `status: 'in_game', reason: 'game_started'`
- Player disconnects: `status: 'disconnected', reason: 'disconnect'`
- Player kicked: `status: 'disconnected', reason: 'kicked'`

### Return to Lobby

When game ends, send players back to GameBuddies:

```typescript
const result = await gameBuddiesService.requestReturnToLobby(
  roomCode,
  {
    returnAll: true,          // Return all players
    initiatedBy: 'host',      // Who initiated
    reason: 'game_ended',     // Why returning
    metadata: { winner: 'Alice' }
  }
);

// Redirect players
io.to(lobby.code).emit('gamebuddies:return-redirect', {
  url: result.returnUrl
});
```

## UI Features

### Streamer Mode

When `session.hideRoomCode === true`:

- Room code is hidden from UI
- "Copy Invite Link" button uses safe session links
- No room code visible on stream

**client/src/components/Lobby.tsx**:
```typescript
const hideRoomCode = gameBuddiesSession?.hideRoomCode || false;

{hideRoomCode ? (
  <div>Streamer Mode - Room code hidden</div>
) : (
  <div>Room Code: {lobby.code}</div>
)}
```

### Return Button

**client/src/components/GameBuddiesReturnButton.tsx** provides a button to return to GameBuddies:

```typescript
<GameBuddiesReturnButton
  roomCode={lobby.code}
  socket={socket}
/>
```

Shows only when `lobby.isGameBuddiesRoom === true`.

## Testing Integration

### Local Testing

1. **Without API Key** - Game works standalone
2. **With API Key** - Get test key from GameBuddies team

### Test URLs

Create test URLs manually:

```
# Host
http://localhost:5173?room=TEST123&role=gm&players=4&playerId=host-uuid

# Player
http://localhost:5173?room=TEST123&name=Alice&playerId=player-uuid
```

### Production Testing

1. Deploy your game to Render.com
2. Register game with GameBuddies
3. Test launch from GameBuddies.io
4. Verify:
   - Auto room creation works
   - Players can join via invite link
   - Status updates appear in GameBuddies
   - Return to lobby works

## Error Handling

### Session Not Found

```typescript
if (!session) {
  // Show normal home screen
  // Users can still create/join manually
}
```

### API Key Missing

Game works in standalone mode without API key. Features disabled:
- Status updates
- Proper return URLs (fallback to gamebuddies.io)

### Resolution Failed

```typescript
const resolved = await resolveSessionToken(token);
if (!resolved) {
  // Fall back to manual room creation
  console.error('Session resolution failed');
}
```

## Security Notes

- Session tokens are one-time use
- Room codes are generated server-side
- Player UUIDs are validated by GameBuddies
- Streamer mode prevents code sniping
- All API calls require valid API key

## API Reference

### Client Session Methods

```typescript
parseGameBuddiesSession(): GameBuddiesSession | null
resolveSessionToken(token: string): Promise<ResolvedSession | null>
storeSession(session: GameBuddiesSession): void
loadSession(): GameBuddiesSession | null
clearSession(): void
```

### Server Service Methods

```typescript
gameBuddiesService.updatePlayerStatus(
  roomCode: string,
  playerId: string,
  status: 'connected' | 'in_game' | 'disconnected',
  reason: string,
  gameData?: any
): Promise<boolean>

gameBuddiesService.requestReturnToLobby(
  roomCode: string,
  options: ReturnOptions
): Promise<ReturnResult>
```

## Deployment Checklist

- [  ] Add `GAMEBUDDIES_API_KEY` to production env
- [  ] Set correct `GAME_ID`
- [  ] Test launch from GameBuddies
- [  ] Verify status updates work
- [  ] Test return to lobby
- [  ] Check streamer mode hides codes
- [  ] Verify player invite links work

---

**Questions?** Contact the GameBuddies team for API access and support.
