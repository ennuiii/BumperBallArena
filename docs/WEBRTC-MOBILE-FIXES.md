# WebRTC Mobile Fixes - Integration Guide

This guide shows you how to add mobile video support to your other games using the fixes from this project.

## Files to Copy

1. **`webrtc-mobile-fixes.js`** - Main module with all the fixes
2. This README for reference

## Quick Integration Steps

### Step 1: Add to Your Project

```bash
# Copy the file to your other game project
cp webrtc-mobile-fixes.js /path/to/your/other/game/src/
```

### Step 2: Add TURN Credentials to .env

Get free TURN credentials at https://www.metered.ca/tools/openrelay/

Add to your `.env` file (client-side):

```bash
VITE_METERED_USERNAME=your_username_from_metered
VITE_METERED_PASSWORD=your_password_from_metered
```

**Important:** These go in your **frontend/client** .env, NOT the server!

### Step 3: Replace Your Old WebRTC Code

#### Before (Old Code):

```javascript
// OLD CODE - Don't use this anymore
const peerConnection = new RTCPeerConnection({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
});

const stream = await navigator.mediaDevices.getUserMedia({
  video: { width: 640, height: 480 },
  audio: true
});
```

#### After (New Code with Mobile Fixes):

```javascript
// NEW CODE - Use this instead
import { setupPeerConnectionWithFixes, getUserMediaWithFallback } from './webrtc-mobile-fixes.js';

// 1. Get media stream (with fallback for mobile)
const { stream, hasVideo, hasAudio } = await getUserMediaWithFallback();

if (!stream) {
  console.error('Could not access camera/microphone');
  // Handle error
  return;
}

// 2. Create peer connection with all mobile fixes
const peerConnection = setupPeerConnectionWithFixes('peer-id-123', stream);

// 3. Set up your handlers (same as before)
peerConnection.ontrack = (event) => {
  remoteVideoElement.srcObject = event.streams[0];
};

peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    // Send to your signaling server
    socket.emit('ice-candidate', event.candidate);
  }
};
```

## What Gets Fixed Automatically

When you use `setupPeerConnectionWithFixes()`:

✅ **TURN servers configured** - Mobile cellular connections work
✅ **H.264 codec for iOS** - iPhone/iPad users can see video
✅ **Mobile-optimized quality** - Lower resolution on mobile (saves bandwidth/battery)
✅ **Enhanced diagnostics** - Console logs show connection issues
✅ **ICE candidate logging** - See if TURN relay is working

## Common Integration Patterns

### Pattern 1: React Component

```javascript
import { setupPeerConnectionWithFixes, getUserMediaWithFallback } from './webrtc-mobile-fixes.js';

function VideoChat() {
  const [localStream, setLocalStream] = useState(null);

  const startVideo = async () => {
    const { stream } = await getUserMediaWithFallback();
    setLocalStream(stream);

    // Create peer connection with fixes
    const pc = setupPeerConnectionWithFixes('peer-123', stream);

    // ... rest of your WebRTC logic
  };

  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted />
      <button onClick={startVideo}>Start Video</button>
    </div>
  );
}
```

### Pattern 2: Vanilla JavaScript

```javascript
import { setupPeerConnectionWithFixes, getUserMediaWithFallback } from './webrtc-mobile-fixes.js';

async function enableVideoChat() {
  // Get media
  const { stream, hasVideo, hasAudio } = await getUserMediaWithFallback();

  if (stream) {
    document.getElementById('local-video').srcObject = stream;
  }

  // Create peer connection
  const peerConnection = setupPeerConnectionWithFixes('peer-id', stream);

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    document.getElementById('remote-video').srcObject = event.streams[0];
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendToServer({ type: 'ice-candidate', candidate: event.candidate });
    }
  };

  // Create offer
  const offer = await peerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
  });
  await peerConnection.setLocalDescription(offer);
  sendToServer({ type: 'offer', offer });
}
```

### Pattern 3: Socket.io Signaling (Complete Example)

```javascript
import { setupPeerConnectionWithFixes, getUserMediaWithFallback } from './webrtc-mobile-fixes.js';

const peerConnections = new Map();

// Enable video
socket.on('start-video', async ({ peers }) => {
  const { stream } = await getUserMediaWithFallback();

  peers.forEach(peerId => {
    const pc = setupPeerConnectionWithFixes(peerId, stream);
    peerConnections.set(peerId, pc);

    // Handle remote stream
    pc.ontrack = (event) => {
      addRemoteVideo(peerId, event.streams[0]);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { peerId, candidate: event.candidate });
      }
    };

    // Create offer if we're the initiator
    if (shouldInitiate(peerId)) {
      createOffer(pc, peerId);
    }
  });
});

// Receive offer
socket.on('offer', async ({ fromPeerId, offer }) => {
  const pc = peerConnections.get(fromPeerId);
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  socket.emit('answer', { toPeerId: fromPeerId, answer });
});

// Receive answer
socket.on('answer', async ({ fromPeerId, answer }) => {
  const pc = peerConnections.get(fromPeerId);
  await pc.setRemoteDescription(answer);
});

// Receive ICE candidate
socket.on('ice-candidate', async ({ fromPeerId, candidate }) => {
  const pc = peerConnections.get(fromPeerId);
  if (pc) {
    await pc.addIceCandidate(candidate);
  }
});
```

## Individual Function Usage

If you only need specific fixes, you can import individual functions:

### Just Mobile Detection

```javascript
import { isMobileDevice, isIOSDevice } from './webrtc-mobile-fixes.js';

if (isMobileDevice()) {
  console.log('User is on mobile');
}

if (isIOSDevice()) {
  console.log('User is on iPhone/iPad');
}
```

### Just Video Constraints

```javascript
import { getVideoConstraints } from './webrtc-mobile-fixes.js';

const stream = await navigator.mediaDevices.getUserMedia({
  video: getVideoConstraints(), // Automatically optimized for mobile
  audio: true
});
```

### Just ICE Servers

```javascript
import { getICEServers } from './webrtc-mobile-fixes.js';

const peerConnection = new RTCPeerConnection({
  iceServers: getICEServers() // Includes TURN servers
});
```

### Just H.264 Codec Fix

```javascript
import { setH264CodecPreference } from './webrtc-mobile-fixes.js';

const peerConnection = new RTCPeerConnection({...});
// ... add tracks ...
setH264CodecPreference(peerConnection, 'peer-id');
```

### Just Diagnostics

```javascript
import { addEnhancedDiagnostics } from './webrtc-mobile-fixes.js';

const peerConnection = new RTCPeerConnection({...});
addEnhancedDiagnostics(peerConnection, 'peer-id');
// Now you'll see detailed logs about ICE candidates, connection states, etc.
```

## Testing Checklist

After integrating into your other game:

### Desktop to Desktop (WiFi)
- [ ] Open game on 2 desktop browsers
- [ ] Both should see each other's video
- [ ] Console should show `srflx (STUN)` candidates

### Mobile to Desktop
- [ ] Open game on mobile (4G/5G, NOT WiFi)
- [ ] Open game on desktop
- [ ] Both should see each other's video
- [ ] Console should show `relay (TURN)` candidates
- [ ] Should see "✅ TURN relay candidate generated"

### iPhone/iPad to Desktop
- [ ] Open game on iPhone/iPad (Safari)
- [ ] Open game on desktop (Chrome)
- [ ] Both should see each other's video
- [ ] Console should show "📱 iOS device detected"
- [ ] Console should show "✅ H.264 codec set as preferred"

### Check Logs
Look for these SUCCESS indicators:
```
✅ TURN servers configured - Mobile cellular support enabled
📱 iOS device detected, setting H.264 codec preference
✅ H.264 codec set as preferred
🔗 ICE candidate [relay (TURN)] for peer-123
✅ TURN relay candidate generated - Mobile cellular support active
✅ ICE connection established with peer-123
```

Look for these WARNING indicators (need to fix):
```
⚠️ No TURN servers configured - Mobile cellular connections will fail!
⚠️ No TURN relay candidates for peer-123 - Mobile connection may fail!
❌ ICE connection failed with peer-123
```

## Troubleshooting

### Mobile still can't connect

1. **Check TURN credentials:**
   ```bash
   # Make sure these are set in your .env
   echo $VITE_METERED_USERNAME
   echo $VITE_METERED_PASSWORD
   ```

2. **Check logs for TURN relay:**
   - Open browser console on mobile
   - Look for `relay (TURN)` in ICE candidates
   - If you only see `host` and `srflx`, TURN isn't working

3. **Verify environment variables:**
   ```javascript
   // Add this temporarily to check
   console.log('TURN username:', import.meta.env.VITE_METERED_USERNAME);
   console.log('TURN password:', import.meta.env.VITE_METERED_PASSWORD);
   ```

### iOS can't see desktop video

1. **Check for H.264 codec preference:**
   - Look for "📱 iOS device detected" in console
   - Look for "✅ H.264 codec set as preferred"
   - If missing, the codec fix isn't being applied

2. **Check desktop is sending H.264:**
   - On desktop, open `chrome://webrtc-internals`
   - Find your peer connection
   - Look for "codec" in the stats
   - Should show "H264" not "VP8"

### Video quality is too low on desktop

This is expected if you're testing on mobile network. The module automatically detects mobile devices and reduces quality.

To test desktop quality:
```javascript
import { getVideoConstraints } from './webrtc-mobile-fixes.js';

// Force desktop quality (for testing)
const constraints = getVideoConstraints();
console.log(constraints); // Will show 640x480 on desktop, 480x360 on mobile
```

## Migration Checklist

- [ ] Copy `webrtc-mobile-fixes.js` to your project
- [ ] Add TURN credentials to `.env` (client-side)
- [ ] Replace old `RTCPeerConnection` creation with `setupPeerConnectionWithFixes()`
- [ ] Replace old `getUserMedia` with `getUserMediaWithFallback()`
- [ ] Test desktop-to-desktop
- [ ] Test mobile-to-desktop (on cellular, not WiFi!)
- [ ] Test iOS-to-desktop
- [ ] Check console logs for success indicators
- [ ] Deploy to production

## Render.com Deployment

Remember to add TURN credentials to **frontend** service (not backend):

1. Go to Render.com dashboard
2. Select your **frontend** service
3. Environment → Add Environment Variables:
   - `VITE_METERED_USERNAME` = your_username
   - `VITE_METERED_PASSWORD` = your_password
4. Trigger redeploy

## Support

If you encounter issues:

1. Check browser console for WebRTC logs
2. Look for the emoji indicators (✅, ⚠️, ❌)
3. Verify TURN credentials are configured
4. Test on actual mobile network (not WiFi)

## Credits

These fixes are based on research into:
- Jackbox Games mobile architecture
- Among Us WebRTC implementation
- iOS Safari WebRTC limitations
- Carrier-Grade NAT (CGNAT) issues on mobile networks
