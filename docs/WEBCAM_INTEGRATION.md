# Webcam Integration Guide

Complete guide to the webcam/video chat system.

## Overview

The webcam system provides:
- **Multi-user video chat** - WebRTC peer-to-peer connections
- **Virtual backgrounds** - AI-powered background replacement
- **3D face avatars** - MediaPipe face tracking + Three.js
- **Audio processing** - Noise suppression, gain control
- **Device selection** - Camera and microphone selection
- **Mobile support** - Works on phones and tablets

## Architecture

### Components

1. **WebcamDisplay.tsx** - Main webcam UI
   - Video feeds grid
   - Device settings modal
   - Media controls

2. **WebRTCContext.tsx** - WebRTC state management
   - Peer connections
   - Media streams
   - Signaling

3. **Services**
   - `virtualBackgroundService.ts` - AI backgrounds
   - `faceAvatarService.ts` - 3D avatars
   - `audioProcessor.ts` - Audio effects

4. **Adapter** - Bridges game state to webcam config
   - `gameAdapter.ts` - Maps players, settings

## How It Works

### 1. User Enables Camera

```typescript
// User clicks "Join Video Chat"
handleJoinVideoChat();
  → prepareVideoChat()  // Get media stream
  → showDeviceSettings  // Open settings modal
  → User configures camera/effects
  → enableVideo()       // Start WebRTC
```

### 2. WebRTC Connection

```
Player A                    Server                     Player B
   |                          |                           |
   |--- webrtc:enable-video ->|                           |
   |                          |---- peer-video-enabled -->|
   |                          |                           |
   |<----------------------- webrtc:offer ----------------|
   |--- webrtc:answer ---------------------------------------->
   |<----- webrtc:ice-candidate --->|<-- ice-candidate -----|
   |                          |                           |
   [P2P connection established]
```

### 3. Media Processing Pipeline

```
Camera
  ↓
getUserMedia()
  ↓
Virtual Background Service (optional)
  ↓
Face Avatar Service (optional)
  ↓
Audio Processor
  ↓
WebRTC Peer Connection
  ↓
Remote Video Feed
```

## Using the Webcam System

### Basic Setup

The webcam system is already integrated in `App.tsx`:

```typescript
const webcamConfig = createGameAdapter(socket, lobby.code, lobby);

<WebcamConfigProvider config={webcamConfig}>
  <WebRTCProvider>
    <WebcamDisplay />
    {/* Your game components */}
  </WebRTCProvider>
</WebcamConfigProvider>
```

### Customizing the Adapter

**client/src/adapters/gameAdapter.ts**:

```typescript
export function createGameAdapter(socket, roomCode, lobby): WebcamConfig {
  return {
    getSocket: () => socket,
    getRoomCode: () => roomCode,
    getUserId: () => socket?.id || '',
    getPlayers: () => lobby.players.map(p => ({
      id: p.socketId,
      name: p.name,
      score: p.score,
    })),

    // Optional: Show turn indicators
    showTurnIndicators: true,
    getCurrentTurnPlayer: () => lobby.gameData?.currentTurn,

    // Optional: Show lives
    showLives: true,
    getLivesForPlayer: (playerId) => {
      const player = lobby.players.find(p => p.socketId === playerId);
      return player?.lives || 0;
    },

    // Optional: Language
    getLanguage: () => 'en',
  };
}
```

## Features in Detail

### Virtual Backgrounds

**How it works:**
1. MediaPipe segments person from background
2. Original background replaced with:
   - Solid color
   - Blur effect
   - Custom image (future)

**Enabling:**
```typescript
// User clicks "Enable Virtual Background" in settings
await webrtcContext.initializeVirtualBackground();
await webrtcContext.updateVirtualBackgroundConfig({
  type: 'blur',  // or 'color'
  color: '#4F46E5',
  blurAmount: 10,
});
```

**Performance:**
- Uses WebAssembly for speed
- GPU-accelerated when available
- ~30fps on modern devices

### Face Avatars

**How it works:**
1. MediaPipe detects face landmarks (468 points)
2. Tracks head position and rotation
3. Three.js renders 3D model that follows face
4. Supports blend shapes for expressions

**Available Avatars:**
- Raccoon (default)
- Robot
- Alien
- Cat
- Geometric shapes (sphere, cube, etc.)

**Enabling:**
```typescript
await webrtcContext.initializeFaceAvatar();
await webrtcContext.updateFaceAvatarConfig({
  avatarType: 'raccoon',
  avatarSize: 40,
  trackingSmoothing: 0.8,
});
```

### Audio Processing

**Features:**
- Noise suppression
- Auto gain control
- Echo cancellation (browser-native)

**Configuration:**
```typescript
const audioSettings = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};
```

## Server-Side WebRTC

### Signaling Server

**server/server.ts** handles WebRTC signaling:

```typescript
// Relay offers
socket.on('webrtc:offer', ({ toPeerId, offer }) => {
  io.to(toPeerId).emit('webrtc:offer', {
    fromPeerId: socket.id,
    offer
  });
});

// Relay answers
socket.on('webrtc:answer', ({ toPeerId, answer }) => {
  io.to(toPeerId).emit('webrtc:answer', {
    fromPeerId: socket.id,
    answer
  });
});

// Relay ICE candidates
socket.on('webrtc:ice-candidate', ({ toPeerId, candidate }) => {
  io.to(toPeerId).emit('webrtc:ice-candidate', {
    fromPeerId: socket.id,
    candidate
  });
});
```

### Peer Tracking

```typescript
// Track who has video enabled
const videoEnabledPeers = new Map<string, Set<string>>();

socket.on('webrtc:enable-video', ({ roomCode, peerId }) => {
  videoEnabledPeers.get(roomCode)?.add(peerId);
  socket.to(roomCode).emit('webrtc:peer-video-enabled', { peerId });
});
```

## Layout Customization

### Default Layout

```
┌─────────────────────────────────────┐
│     WebcamDisplay (horizontal)      │
├──────────────────┬──────────────────┤
│                  │   PlayerList     │
│   Game Content   ├──────────────────┤
│                  │   ChatWindow     │
└──────────────────┴──────────────────┘
```

### Custom Layout

Edit **client/src/App.css**:

```css
.webcam-top-bar {
  /* Customize webcam position */
}

.right-sidebar {
  /* Adjust sidebar */
}
```

### Video Grid

Videos are arranged in responsive grid:
- 1 video: Full width
- 2-4 videos: 2-column grid
- 5+ videos: 3-column grid
- Mobile: 1-column stack

## Mobile Support

### Features
- Touch-optimized controls
- Responsive video grid
- Battery-efficient
- Bandwidth-adaptive

### Considerations
- Request camera on user gesture
- Disable video if battery low
- Reduce quality for poor connection
- Show connection status

## Troubleshooting

### Camera Not Working

1. **Permissions**
   - Browser must have camera/mic permission
   - HTTPS required (except localhost)

2. **Device Selection**
   - Open settings modal
   - Select correct camera/mic
   - Click "Apply Settings"

3. **Browser Compatibility**
   - Chrome/Edge: Full support
   - Firefox: Full support
   - Safari: Partial support (no virtual backgrounds)

### Connection Issues

1. **Firewall**
   - WebRTC needs UDP ports open
   - Corporate networks may block

2. **TURN Server**
   - For strict NATs, add TURN server:
   ```typescript
   const iceServers = [
     { urls: 'stun:stun.l.google.com:19302' },
     {
       urls: 'turn:your-turn-server.com',
       username: 'user',
       credential: 'pass'
     }
   ];
   ```

### Performance Issues

1. **Reduce quality**
   ```typescript
   constraints: {
     video: {
       width: { ideal: 640 },
       height: { ideal: 480 },
       frameRate: { ideal: 24 }
     }
   }
   ```

2. **Disable effects**
   - Turn off virtual background
   - Disable face avatar
   - Use lower resolution

## Assets

### WASM Files

Located in `client/public/wasm/`:
- `vision_wasm_internal.js` - MediaPipe runtime
- `vision_wasm_internal.wasm` - Core WASM
- `vision_wasm_nosimd_internal.js` - Fallback
- `vision_wasm_nosimd_internal.wasm` - Fallback WASM

### Models

Located in `client/public/models/`:
- `selfie_segmenter.tflite` - Background segmentation (249 KB)
- `face_landmarker.task` - Face detection (3.7 MB)
- `raccoon_head.glb` - 3D raccoon model (9.2 MB)

### Adding Custom Models

1. Add `.glb` file to `public/models/`
2. Update `faceAvatarService.ts`:
```typescript
case 'myavatar':
  modelUrl = baseUrl + 'models/myavatar.glb';
```

## API Reference

### WebRTCContext

```typescript
const {
  localStream,              // Local media stream
  remoteStreams,            // Map<peerId, stream>
  peers,                    // Map<peerId, connection>
  prepareVideoChat,         // Get camera
  enableVideo,              // Start WebRTC
  disableVideo,             // Stop WebRTC
  initializeVirtualBackground,
  updateVirtualBackgroundConfig,
  initializeFaceAvatar,
  updateFaceAvatarConfig,
} = useWebRTC();
```

### WebcamConfig

```typescript
interface WebcamConfig {
  getSocket: () => Socket;
  getRoomCode: () => string | null;
  getUserId: () => string | null;
  getPlayers?: () => WebcamPlayer[];
  getLanguage?: () => Language;
  showTurnIndicators?: boolean;
  showLives?: boolean;
  showVoting?: boolean;
  // ... more options
}
```

---

**Next:** Customize the adapter for your game-specific features!
