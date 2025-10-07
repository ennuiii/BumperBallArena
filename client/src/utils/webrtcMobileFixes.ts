/**
 * WebRTC Mobile Fixes - TypeScript Module
 *
 * Fixes mobile video issues with TURN servers, H.264 codec, and optimized constraints.
 *
 * REQUIREMENTS:
 * 1. Add to .env (client-side):
 *    VITE_METERED_USERNAME=your_username
 *    VITE_METERED_PASSWORD=your_password
 *
 * 2. Get free TURN credentials at: https://www.metered.ca/tools/openrelay/
 *
 * USAGE:
 * import { getICEServers, getVideoConstraints, setH264CodecPreference } from './webrtcMobileFixes';
 */

// ============================================================================
// MOBILE DETECTION
// ============================================================================

/**
 * Detect if the current device is mobile
 * @returns True if mobile device
 */
export function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Detect if the current device is iOS (iPhone, iPad)
 * iOS Safari only supports H.264 codec, not VP8/VP9
 * @returns True if iOS device
 */
export function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPad Pro
}

// ============================================================================
// ICE SERVERS (STUN + TURN)
// ============================================================================

/**
 * Get ICE servers configuration with TURN support for mobile cellular
 *
 * IMPORTANT: Mobile devices on 4G/5G need TURN servers because carrier-grade NAT
 * blocks direct peer connections. STUN only works on WiFi.
 *
 * @returns Array of ICE servers
 */
export function getICEServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    // STUN servers (free - works for desktop/WiFi)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Add TURN servers if credentials are configured
  const username = import.meta.env?.VITE_METERED_USERNAME;
  const password = import.meta.env?.VITE_METERED_PASSWORD;

  if (username && password) {
    console.log('[WebRTC] ✅ TURN servers configured - Mobile cellular support enabled');

    servers.push(
      // Metered TURN servers (free tier: 500MB/month)
      {
        urls: 'turn:a.relay.metered.ca:80',
        username: username,
        credential: password
      },
      {
        urls: 'turn:a.relay.metered.ca:80?transport=tcp',
        username: username,
        credential: password
      },
      {
        urls: 'turn:a.relay.metered.ca:443',
        username: username,
        credential: password
      },
      {
        urls: 'turns:a.relay.metered.ca:443?transport=tcp', // TLS for restrictive networks
        username: username,
        credential: password
      }
    );
  } else {
    console.warn('[WebRTC] ⚠️ No TURN servers configured - Mobile cellular connections will fail!');
    console.warn('[WebRTC] Get free credentials at: https://www.metered.ca/tools/openrelay/');
    console.warn('[WebRTC] Add VITE_METERED_USERNAME and VITE_METERED_PASSWORD to your .env file');
  }

  return servers;
}

// ============================================================================
// MEDIA CONSTRAINTS
// ============================================================================

/**
 * Get mobile-optimized video constraints
 *
 * Mobile devices need lower resolution/framerate for:
 * - Cellular bandwidth limitations
 * - Battery life
 * - CPU performance
 *
 * @param deviceId - Optional camera device ID
 * @returns Video constraints object
 */
export function getVideoConstraints(deviceId?: string): MediaTrackConstraints {
  const baseConstraints: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : {};

  if (isMobileDevice()) {
    // Mobile: Lower quality for cellular bandwidth & battery
    return {
      ...baseConstraints,
      width: { ideal: 480, max: 640 },
      height: { ideal: 360, max: 480 },
      frameRate: { ideal: 15, max: 24 }
    };
  } else {
    // Desktop: Higher quality
    return {
      ...baseConstraints,
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 }
    };
  }
}

/**
 * Get high-quality audio constraints with noise suppression
 * @param deviceId - Optional microphone device ID
 * @returns Audio constraints object
 */
export function getAudioConstraints(deviceId?: string): MediaTrackConstraints {
  return {
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: { ideal: 48000 },
    channelCount: { ideal: 1 }
  };
}

// ============================================================================
// PEER CONNECTION SETUP
// ============================================================================

/**
 * Set H.264 codec preference for iOS compatibility
 *
 * iOS Safari only supports H.264 codec. If desktop sends VP8/VP9,
 * iOS users won't see the video.
 *
 * @param peerConnection - The peer connection
 * @param peerId - Peer ID for logging
 */
export function setH264CodecPreference(peerConnection: RTCPeerConnection, peerId: string): void {
  if (!isIOSDevice()) {
    return; // Only needed on iOS
  }

  console.log(`[WebRTC] 📱 iOS device detected, setting H.264 codec preference for ${peerId}`);

  try {
    const transceivers = peerConnection.getTransceivers();
    transceivers.forEach(transceiver => {
      if (transceiver.sender.track?.kind === 'video') {
        const capabilities = RTCRtpSender.getCapabilities('video');
        if (capabilities && capabilities.codecs) {
          // Separate H.264 codecs from others
          const h264Codecs = capabilities.codecs.filter(codec =>
            codec.mimeType.toLowerCase().includes('h264')
          );
          const otherCodecs = capabilities.codecs.filter(codec =>
            !codec.mimeType.toLowerCase().includes('h264')
          );

          // Prioritize H.264 for iOS compatibility
          if (h264Codecs.length > 0) {
            const preferredCodecs = [...h264Codecs, ...otherCodecs];
            transceiver.setCodecPreferences(preferredCodecs);
            console.log(`[WebRTC] ✅ H.264 codec set as preferred for ${peerId} (found ${h264Codecs.length} H.264 codecs)`);
          } else {
            console.warn(`[WebRTC] ⚠️ No H.264 codecs found for ${peerId}, iOS compatibility may be limited`);
          }
        }
      }
    });
  } catch (error) {
    console.warn(`[WebRTC] Failed to set H.264 codec preference for ${peerId}:`, error);
    // Non-fatal error, continue with default codecs
  }
}

/**
 * Add enhanced diagnostics to peer connection
 * Logs ICE candidate types, connection states, and warnings
 *
 * @param peerConnection - The peer connection
 * @param peerId - Peer ID for logging
 */
export function addEnhancedDiagnostics(peerConnection: RTCPeerConnection, peerId: string): void {
  // ICE candidate logging with type detection
  const originalOnIceCandidate = peerConnection.onicecandidate;
  peerConnection.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      // Determine candidate type (host/srflx/relay)
      const candidateType = event.candidate.candidate.includes('typ host') ? 'host' :
                            event.candidate.candidate.includes('typ srflx') ? 'srflx (STUN)' :
                            event.candidate.candidate.includes('typ relay') ? 'relay (TURN)' : 'unknown';

      console.log(`[WebRTC] 🔗 ICE candidate [${candidateType}] for ${peerId}`);

      // Log relay candidates specially (indicates TURN server is working)
      if (candidateType.includes('relay')) {
        console.log(`[WebRTC] ✅ TURN relay candidate generated - Mobile cellular support active`);
      }
    } else {
      console.log(`[WebRTC] ICE gathering complete for ${peerId}`);
    }

    // Call original handler if it exists
    if (originalOnIceCandidate) {
      originalOnIceCandidate.call(peerConnection, event);
    }
  };

  // ICE connection state logging
  peerConnection.oniceconnectionstatechange = () => {
    const iceState = peerConnection.iceConnectionState;
    console.log(`[WebRTC] 🧊 ICE connection state with ${peerId}: ${iceState}`);

    if (iceState === 'connected' || iceState === 'completed') {
      console.log(`[WebRTC] ✅ ICE connection established with ${peerId}`);
    } else if (iceState === 'failed') {
      console.error(`[WebRTC] ❌ ICE connection failed with ${peerId} - Check TURN server credentials or network`);
    } else if (iceState === 'disconnected') {
      console.warn(`[WebRTC] ⚠️ ICE connection disconnected with ${peerId} - May reconnect automatically`);
    }
  };

  // ICE gathering state logging
  peerConnection.onicegatheringstatechange = () => {
    const gatheringState = peerConnection.iceGatheringState;
    console.log(`[WebRTC] 🔍 ICE gathering state with ${peerId}: ${gatheringState}`);

    if (gatheringState === 'complete') {
      // Check if relay candidates were gathered
      const stats = peerConnection.getStats();
      stats.then(report => {
        let hasRelay = false;
        report.forEach(stat => {
          if (stat.type === 'local-candidate' && (stat as any).candidateType === 'relay') {
            hasRelay = true;
          }
        });
        if (hasRelay) {
          console.log(`[WebRTC] ✅ TURN relay candidates available for ${peerId}`);
        } else if (isMobileDevice()) {
          console.warn(`[WebRTC] ⚠️ No TURN relay candidates for ${peerId} - Mobile connection may fail!`);
        }
      }).catch(err => {
        console.warn(`[WebRTC] Could not check ICE candidates:`, err);
      });
    }
  };

  // Connection state logging
  peerConnection.onconnectionstatechange = () => {
    console.log(`[WebRTC] Connection state with ${peerId}: ${peerConnection.connectionState}`);

    if (peerConnection.connectionState === 'connected') {
      console.log(`[WebRTC] ✅ Successfully connected to ${peerId}!`);
    } else if (peerConnection.connectionState === 'failed' ||
               peerConnection.connectionState === 'closed') {
      console.log(`[WebRTC] Connection to ${peerId} failed/closed`);
    }
  };
}

/**
 * Create a peer connection with all mobile fixes applied
 *
 * @param peerId - Peer ID for logging
 * @param localStream - Optional local media stream to add
 * @returns Configured peer connection
 */
export function setupPeerConnectionWithFixes(peerId: string, localStream?: MediaStream): RTCPeerConnection {
  console.log(`[WebRTC] Creating peer connection for ${peerId} with mobile fixes`);

  // Create peer connection with optimized configuration
  const peerConnection = new RTCPeerConnection({
    iceServers: getICEServers(),
    iceTransportPolicy: 'all',      // Try all connection types
    bundlePolicy: 'max-bundle',     // Optimize bandwidth
    rtcpMuxPolicy: 'require'        // Reduce port usage
  });

  // Add local stream tracks if provided
  if (localStream) {
    const tracks = localStream.getTracks();
    tracks.forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    console.log(`[WebRTC] Added ${tracks.length} local tracks for ${peerId}`);
  }

  // Apply iOS H.264 codec preference
  setH264CodecPreference(peerConnection, peerId);

  // Add enhanced diagnostics
  addEnhancedDiagnostics(peerConnection, peerId);

  return peerConnection;
}

// ============================================================================
// MEDIA STREAM HELPERS
// ============================================================================

export interface GetUserMediaResult {
  stream: MediaStream | null;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface GetUserMediaOptions {
  cameraId?: string;
  microphoneId?: string;
}

/**
 * Get user media with mobile-optimized constraints
 * Tries multiple combinations: video+audio, audio-only, video-only
 *
 * @param options - Options for media stream
 * @returns Object with stream and capability flags
 */
export async function getUserMediaWithFallback(options: GetUserMediaOptions = {}): Promise<GetUserMediaResult> {
  const { cameraId, microphoneId } = options;

  // Try video + audio
  try {
    console.log('[WebRTC] Attempting video + audio...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: getVideoConstraints(cameraId),
      audio: getAudioConstraints(microphoneId)
    });
    const hasVideo = stream.getVideoTracks().length > 0;
    const hasAudio = stream.getAudioTracks().length > 0;
    console.log('[WebRTC] ✅ Video + Audio enabled');
    return { stream, hasVideo, hasAudio };
  } catch (error) {
    console.log('[WebRTC] Video + Audio failed, trying audio-only...', error);
  }

  // Try audio only
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioConstraints(microphoneId)
    });
    const hasAudio = stream.getAudioTracks().length > 0;
    console.log('[WebRTC] ✅ Audio-only enabled');
    return { stream, hasVideo: false, hasAudio };
  } catch (error) {
    console.log('[WebRTC] Audio failed, trying video-only...', error);
  }

  // Try video only
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: getVideoConstraints(cameraId)
    });
    const hasVideo = stream.getVideoTracks().length > 0;
    console.log('[WebRTC] ✅ Video-only enabled');
    return { stream, hasVideo, hasAudio: false };
  } catch (error) {
    console.log('[WebRTC] ❌ All media access failed', error);
  }

  // All attempts failed
  return { stream: null, hasVideo: false, hasAudio: false };
}

// Default export for convenience
export default {
  isMobileDevice,
  isIOSDevice,
  getICEServers,
  getVideoConstraints,
  getAudioConstraints,
  setH264CodecPreference,
  addEnhancedDiagnostics,
  setupPeerConnectionWithFixes,
  getUserMediaWithFallback
};
