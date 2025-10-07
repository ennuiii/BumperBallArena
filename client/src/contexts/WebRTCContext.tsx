import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { useWebcamConfig } from '../config/WebcamConfig.tsx';
import { VirtualBackgroundService, DEFAULT_BACKGROUNDS } from '../services/virtualBackgroundService';
import type { VirtualBackgroundConfig } from '../services/virtualBackgroundService';
import { AudioProcessor, DEFAULT_AUDIO_PROCESSOR_CONFIG } from '../services/audioProcessor';
import type { AudioProcessorConfig } from '../services/audioProcessor';
import { FaceAvatarService, DEFAULT_AVATAR_CONFIG } from '../services/faceAvatarService';
import type { FaceAvatarConfig } from '../services/faceAvatarService';
import {
  getICEServers,
  getVideoConstraints,
  getAudioConstraints,
  setH264CodecPreference,
  addEnhancedDiagnostics
} from '../utils/webrtcMobileFixes';

interface WebRTCState {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  peerConnections: Map<string, RTCPeerConnection>;
  connectionStates: Map<string, string>; // Track negotiation states per peer
  peerConnectionTypes: Map<string, string>; // Track peer connection types (video+audio, audio only, etc.)
  isWebcamActive: boolean;
  isVideoEnabled: boolean; // Whether user has enabled video chat
  isVideoPrepairing: boolean; // Whether user is in preparation mode (settings open)
  isMicrophoneMuted: boolean; // Whether microphone is muted
  connectionType: 'has-camera' | 'no-camera' | null; // Track user's connection capabilities
  availableDevices: {
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
  };
  selectedDevices: {
    cameraId: string;
    microphoneId: string;
  };
  virtualBackground: {
    isEnabled: boolean;
    isInitialized: boolean;
    config: VirtualBackgroundConfig;
    availableBackgrounds: Array<{ name: string; url: string }>;
  };
  audioProcessor: {
    isEnabled: boolean;
    isInitialized: boolean;
    config: AudioProcessorConfig;
  };
  faceAvatar: {
    isEnabled: boolean;
    isInitialized: boolean;
    config: FaceAvatarConfig;
  };
}

type WebRTCAction = 
  | { type: 'SET_LOCAL_STREAM'; payload: MediaStream | null }
  | { type: 'SET_WEBCAM_ACTIVE'; payload: boolean }
  | { type: 'SET_VIDEO_ENABLED'; payload: boolean }
  | { type: 'SET_VIDEO_PREPARING'; payload: boolean }
  | { type: 'SET_MICROPHONE_MUTED'; payload: boolean }
  | { type: 'SET_CONNECTION_TYPE'; payload: 'has-camera' | 'no-camera' | null }
  | { type: 'ADD_REMOTE_STREAM'; payload: { peerId: string; stream: MediaStream } }
  | { type: 'REMOVE_REMOTE_STREAM'; payload: string }
  | { type: 'ADD_PEER_CONNECTION'; payload: { peerId: string; connection: RTCPeerConnection } }
  | { type: 'REMOVE_PEER_CONNECTION'; payload: string }
  | { type: 'SET_CONNECTION_STATE'; payload: { peerId: string; state: string } }
  | { type: 'SET_PEER_CONNECTION_TYPE'; payload: { peerId: string; connectionType: string } }
  | { type: 'SET_AVAILABLE_DEVICES'; payload: { cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] } }
  | { type: 'SET_SELECTED_DEVICE'; payload: { deviceType: 'camera' | 'microphone'; deviceId: string } }
  | { type: 'SET_VIRTUAL_BACKGROUND_ENABLED'; payload: boolean }
  | { type: 'SET_VIRTUAL_BACKGROUND_INITIALIZED'; payload: boolean }
  | { type: 'SET_VIRTUAL_BACKGROUND_CONFIG'; payload: Partial<VirtualBackgroundConfig> }
  | { type: 'SET_AUDIO_PROCESSOR_ENABLED'; payload: boolean }
  | { type: 'SET_AUDIO_PROCESSOR_INITIALIZED'; payload: boolean }
  | { type: 'SET_AUDIO_PROCESSOR_CONFIG'; payload: Partial<AudioProcessorConfig> }
  | { type: 'SET_FACE_AVATAR_ENABLED'; payload: boolean }
  | { type: 'SET_FACE_AVATAR_INITIALIZED'; payload: boolean }
  | { type: 'SET_FACE_AVATAR_CONFIG'; payload: Partial<FaceAvatarConfig> }
  | { type: 'RESET_STATE' };

const initialState: WebRTCState = {
  localStream: null,
  remoteStreams: new Map(),
  peerConnections: new Map(),
  connectionStates: new Map(),
  peerConnectionTypes: new Map(),
  isWebcamActive: false,
  isVideoEnabled: false,
  isVideoPrepairing: false,
  isMicrophoneMuted: false,
  connectionType: null,
  availableDevices: {
    cameras: [],
    microphones: []
  },
  selectedDevices: {
    cameraId: '',
    microphoneId: ''
  },
  virtualBackground: {
    isEnabled: false,
    isInitialized: false,
    config: {
      model: 'MediaPipe',
      segmentationThreshold: 0.6,
      useBlur: true,
      blurAmount: 25,
      edgeSmoothing: 3,
      temporalSmoothing: 0.7,
      maskBlur: 2,
      erosionSize: 1,
      dilationSize: 1,
      adaptiveThreshold: true,
      hairRefinement: true,
      minContourArea: 1000
    },
    availableBackgrounds: DEFAULT_BACKGROUNDS
  },
  audioProcessor: {
    isEnabled: false,
    isInitialized: false,
    config: DEFAULT_AUDIO_PROCESSOR_CONFIG
  },
  faceAvatar: {
    isEnabled: false,
    isInitialized: false,
    config: DEFAULT_AVATAR_CONFIG
  }
};

// Note: ICE servers (STUN/TURN) are now provided by getICEServers() from mobile fixes
// Audio constraints are now provided by getAudioConstraints() from mobile fixes

function webrtcReducer(state: WebRTCState, action: WebRTCAction): WebRTCState {
  switch (action.type) {
    case 'SET_LOCAL_STREAM':
      return { ...state, localStream: action.payload };
    
    case 'SET_WEBCAM_ACTIVE':
      return { ...state, isWebcamActive: action.payload };
    
    case 'SET_VIDEO_ENABLED':
      return { ...state, isVideoEnabled: action.payload };
    
    case 'SET_VIDEO_PREPARING':
      return { ...state, isVideoPrepairing: action.payload };
    
    case 'SET_MICROPHONE_MUTED':
      return { ...state, isMicrophoneMuted: action.payload };
    
    case 'SET_CONNECTION_TYPE':
      return { ...state, connectionType: action.payload };
    
    case 'ADD_REMOTE_STREAM':
      const newRemoteStreams = new Map(state.remoteStreams);
      newRemoteStreams.set(action.payload.peerId, action.payload.stream);
      return { ...state, remoteStreams: newRemoteStreams };
    
    case 'REMOVE_REMOTE_STREAM':
      const updatedRemoteStreams = new Map(state.remoteStreams);
      updatedRemoteStreams.delete(action.payload);
      return { ...state, remoteStreams: updatedRemoteStreams };
    
    case 'ADD_PEER_CONNECTION':
      const newConnections = new Map(state.peerConnections);
      newConnections.set(action.payload.peerId, action.payload.connection);
      return { ...state, peerConnections: newConnections };
    
    case 'REMOVE_PEER_CONNECTION':
      const updatedConnections = new Map(state.peerConnections);
      const updatedStates = new Map(state.connectionStates);
      const updatedConnectionTypes = new Map(state.peerConnectionTypes);
      const connection = updatedConnections.get(action.payload);
      if (connection) {
        connection.close();
        updatedConnections.delete(action.payload);
      }
      updatedStates.delete(action.payload);
      updatedConnectionTypes.delete(action.payload);
      return { ...state, peerConnections: updatedConnections, connectionStates: updatedStates, peerConnectionTypes: updatedConnectionTypes };
    
    case 'SET_CONNECTION_STATE':
      const newConnectionStates = new Map(state.connectionStates);
      newConnectionStates.set(action.payload.peerId, action.payload.state);
      return { ...state, connectionStates: newConnectionStates };
    
    case 'SET_PEER_CONNECTION_TYPE':
      const newPeerConnectionTypes = new Map(state.peerConnectionTypes);
      newPeerConnectionTypes.set(action.payload.peerId, action.payload.connectionType);
      return { ...state, peerConnectionTypes: newPeerConnectionTypes };
    
    case 'SET_AVAILABLE_DEVICES':
      return { ...state, availableDevices: action.payload };
    
    case 'SET_SELECTED_DEVICE':
      const updatedSelectedDevices = { ...state.selectedDevices };
      if (action.payload.deviceType === 'camera') {
        updatedSelectedDevices.cameraId = action.payload.deviceId;
      } else {
        updatedSelectedDevices.microphoneId = action.payload.deviceId;
      }
      return { ...state, selectedDevices: updatedSelectedDevices };
    
    case 'SET_VIRTUAL_BACKGROUND_ENABLED':
      return { 
        ...state, 
        virtualBackground: { 
          ...state.virtualBackground, 
          isEnabled: action.payload 
        } 
      };
    
    case 'SET_VIRTUAL_BACKGROUND_INITIALIZED':
      return { 
        ...state, 
        virtualBackground: { 
          ...state.virtualBackground, 
          isInitialized: action.payload 
        } 
      };
    
    case 'SET_VIRTUAL_BACKGROUND_CONFIG':
      return { 
        ...state, 
        virtualBackground: { 
          ...state.virtualBackground, 
          config: { ...state.virtualBackground.config, ...action.payload } 
        } 
      };
    
    case 'SET_AUDIO_PROCESSOR_ENABLED':
      return { 
        ...state, 
        audioProcessor: { 
          ...state.audioProcessor, 
          isEnabled: action.payload 
        } 
      };
    
    case 'SET_AUDIO_PROCESSOR_INITIALIZED':
      return { 
        ...state, 
        audioProcessor: { 
          ...state.audioProcessor, 
          isInitialized: action.payload 
        } 
      };
    
    case 'SET_AUDIO_PROCESSOR_CONFIG':
      return { 
        ...state, 
        audioProcessor: { 
          ...state.audioProcessor, 
          config: { ...state.audioProcessor.config, ...action.payload } 
        } 
      };
    
    case 'SET_FACE_AVATAR_ENABLED':
      return { 
        ...state, 
        faceAvatar: { 
          ...state.faceAvatar, 
          isEnabled: action.payload 
        } 
      };
    
    case 'SET_FACE_AVATAR_INITIALIZED':
      return { 
        ...state, 
        faceAvatar: { 
          ...state.faceAvatar, 
          isInitialized: action.payload 
        } 
      };
    
    case 'SET_FACE_AVATAR_CONFIG':
      return { 
        ...state, 
        faceAvatar: { 
          ...state.faceAvatar, 
          config: { ...state.faceAvatar.config, ...action.payload } 
        } 
      };
    
    case 'RESET_STATE':
      state.peerConnections.forEach(connection => connection.close());
      if (state.localStream) {
        state.localStream.getTracks().forEach(track => track.stop());
      }
      return { ...initialState };
    
    default:
      return state;
  }
}

interface WebRTCContextState extends WebRTCState {
  enableVideoChat: () => Promise<void>;
  prepareVideoChat: () => Promise<void>;
  confirmVideoChat: () => Promise<void>;
  cancelVideoPreparation: () => void;
  disableVideoChat: () => void;
  toggleWebcam: () => void;
  toggleMicrophone: () => void;
  refreshConnections: () => void;
  setSelectedCamera: (deviceId: string) => void;
  setSelectedMicrophone: (deviceId: string) => void;
  refreshDevices: () => Promise<void>;
  initializeVirtualBackground: () => Promise<void>;
  enableVirtualBackground: () => Promise<void>;
  disableVirtualBackground: () => void;
  updateVirtualBackgroundConfig: (config: Partial<VirtualBackgroundConfig>) => void;
  initializeAudioProcessor: () => Promise<void>;
  enableAudioProcessor: () => Promise<void>;
  disableAudioProcessor: () => void;
  updateAudioProcessorConfig: (config: Partial<AudioProcessorConfig>) => void;
  initializeFaceAvatar: () => Promise<void>;
  enableFaceAvatar: () => Promise<void>;
  disableFaceAvatar: () => void;
  updateFaceAvatarConfig: (config: Partial<FaceAvatarConfig>) => void;
}

const WebRTCContext = createContext<WebRTCContextState | undefined>(undefined);

export const useWebRTC = (): WebRTCContextState => {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
};

interface WebRTCProviderProps {
  children: ReactNode;
}

export const WebRTCProvider: React.FC<WebRTCProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(webrtcReducer, initialState);

  // Get configuration from adapter
  const config = useWebcamConfig();
  const roomCode = config.getRoomCode();
  const socket = config.getSocket();
  const userId = config.getUserId();
  
  // Use refs to store current state for callbacks
  const stateRef = useRef(state);
  stateRef.current = state;
  
  // Store pending ICE candidates
  const pendingCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const createPeerConnection = useCallback((peerId: string): RTCPeerConnection => {
    console.log(`[WebRTC] Creating peer connection for ${peerId}`);
    
    // Check if connection already exists
    const existingConnection = stateRef.current.peerConnections.get(peerId);
    if (existingConnection) {
      const state = existingConnection.connectionState;
      if (state !== 'closed' && state !== 'failed') {
        console.log(`[WebRTC] Reusing existing connection to ${peerId} (${state})`);
        return existingConnection;
      } else {
        console.log(`[WebRTC] Cleaning up old connection to ${peerId}`);
        existingConnection.close();
      }
    }

    dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId, state: 'new' } });

    const peerConnection = new RTCPeerConnection({
      iceServers: getICEServers(), // Mobile-optimized with TURN support
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // Add local stream tracks if available
    if (stateRef.current.localStream) {
      const tracks = stateRef.current.localStream.getTracks();
      if (tracks.length > 0) {
        tracks.forEach(track => {
          peerConnection.addTrack(track, stateRef.current.localStream!);
        });
        console.log(`[WebRTC] Added ${tracks.length} local tracks for ${peerId}`);
      } else {
        console.log(`[WebRTC] Local stream exists but has no tracks for ${peerId}`);
      }
    } else {
      // Even without local media, we can still receive remote streams
      console.log(`[WebRTC] No local stream available for ${peerId}, but can still receive remote streams`);
    }

    // Apply iOS H.264 codec preference for iOS compatibility
    setH264CodecPreference(peerConnection, peerId);

    // Add enhanced diagnostics for better mobile debugging
    addEnhancedDiagnostics(peerConnection, peerId);

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log(`[WebRTC] Received remote stream from ${peerId}`);
      if (event.streams[0]) {
        dispatch({ type: 'ADD_REMOTE_STREAM', payload: { peerId, stream: event.streams[0] } });
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log(`[WebRTC] Sending ICE candidate to ${peerId}`);
        socket.emit('webrtc:ice-candidate', {
          roomCode,
          toPeerId: peerId,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerId}: ${peerConnection.connectionState}`);
      
      if (peerConnection.connectionState === 'connected') {
        console.log(`[WebRTC] Successfully connected to ${peerId}!`);
        dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId, state: 'connected' } });
        // Clear pending candidates once connected
        pendingCandidates.current.delete(peerId);
      } else if (peerConnection.connectionState === 'connecting') {
        console.log(`[WebRTC] Connecting to ${peerId}...`);
        dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId, state: 'connecting' } });
      } else if (peerConnection.connectionState === 'failed' || 
                 peerConnection.connectionState === 'closed') {
        console.log(`[WebRTC] Connection to ${peerId} failed/closed`);
        dispatch({ type: 'REMOVE_REMOTE_STREAM', payload: peerId });
        dispatch({ type: 'REMOVE_PEER_CONNECTION', payload: peerId });
        pendingCandidates.current.delete(peerId);
      }
    };

    // Handle signaling state changes
    peerConnection.onsignalingstatechange = () => {
      console.log(`[WebRTC] Signaling state with ${peerId}: ${peerConnection.signalingState}`);
    };

    dispatch({ type: 'ADD_PEER_CONNECTION', payload: { peerId, connection: peerConnection } });

    // Process any pending ICE candidates
    const pending = pendingCandidates.current.get(peerId);
    if (pending && pending.length > 0) {
      console.log(`[WebRTC] Processing ${pending.length} pending ICE candidates for ${peerId}`);
      pendingCandidates.current.set(peerId, []);
    }

    return peerConnection;
  }, [socket, roomCode]);

  const createOffer = useCallback(async (peerId: string) => {
    console.log(`[WebRTC] Creating offer for ${peerId}`);
    const peerConnection = createPeerConnection(peerId);
    
    try {
      dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId, state: 'creating-offer' } });
      
      // Create offer with specific options to handle various connection types
      const offerOptions = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      };
      
      console.log(`[WebRTC] Creating offer for ${peerId} with options:`, offerOptions);
      const offer = await peerConnection.createOffer(offerOptions);
      console.log(`[WebRTC] Offer created for ${peerId}, setting local description...`);
      await peerConnection.setLocalDescription(offer);
      console.log(`[WebRTC] Local description set for ${peerId}`);
      
      if (socket && peerConnection.localDescription) {
        console.log(`[WebRTC] Sending offer to ${peerId}`);
        socket.emit('webrtc:offer', {
          roomCode,
          toPeerId: peerId,
          offer: peerConnection.localDescription
        });
        dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId, state: 'offer-sent' } });
      }
    } catch (error) {
      console.error(`[WebRTC] Error creating offer for ${peerId}:`, error);
      dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId, state: 'failed' } });
    }
  }, [createPeerConnection, socket, roomCode]);

  const enableVideoChat = useCallback(async () => {
    try {
      console.log('[WebRTC] Enabling video chat...');
      
      let stream: MediaStream | null = null;
      let hasVideo = false;
      let hasAudio = false;
      let connectionType = '';

      // Try different permission combinations, starting with both video and audio
      try {
        // First attempt: Both video and audio
        console.log('[WebRTC] Attempting video + audio...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: getVideoConstraints(state.selectedDevices.cameraId || undefined),
          audio: getAudioConstraints(state.selectedDevices.microphoneId || undefined)
        });
        hasVideo = stream.getVideoTracks().length > 0;
        hasAudio = stream.getAudioTracks().length > 0;
        connectionType = 'has-camera';
        console.log('[WebRTC] Success: Video + Audio enabled');
      } catch (videoAudioError) {
        console.log('[WebRTC] Video + Audio failed, trying audio only...', videoAudioError);
        
        try {
          // Second attempt: Audio only
          stream = await navigator.mediaDevices.getUserMedia({
            audio: getAudioConstraints(state.selectedDevices.microphoneId || undefined)
          });
          hasVideo = false;
          hasAudio = stream.getAudioTracks().length > 0;
          connectionType = 'no-camera';
          console.log('[WebRTC] Success: Audio-only enabled (no camera available)');
        } catch (audioError) {
          console.log('[WebRTC] Audio failed, trying video only...', audioError);
          
          try {
            // Third attempt: Video only
            stream = await navigator.mediaDevices.getUserMedia({
              video: getVideoConstraints(state.selectedDevices.cameraId || undefined)
            });
            hasVideo = stream.getVideoTracks().length > 0;
            hasAudio = false;
            connectionType = 'has-camera';
            console.log('[WebRTC] Success: Video-only enabled');
          } catch (videoError) {
            console.log('[WebRTC] All media access failed, enabling view-only mode...', videoError);
            
            // Fourth attempt: No media (view-only mode) - create fake stream for WebRTC compatibility
            console.log('[WebRTC] Creating fake stream for view-only mode...');
            try {
              // Create empty audio context and silent audio track for WebRTC compatibility
              const audioContext = new AudioContext();
              const oscillator = audioContext.createOscillator();
              const gainNode = audioContext.createGain();
              
              // Create a silent audio track
              oscillator.connect(gainNode);
              gainNode.connect(audioContext.destination);
              gainNode.gain.value = 0; // Silent
              oscillator.frequency.value = 440;
              oscillator.start();
              
              // Create MediaStreamDestination to get a MediaStream
              const destination = audioContext.createMediaStreamDestination();
              gainNode.connect(destination);
              
              stream = destination.stream;
              hasVideo = false;
              hasAudio = true; // We have a silent audio track
              connectionType = 'no-camera';
              console.log('[WebRTC] Success: View-only mode with fake stream created');
            } catch (emptyStreamError) {
              console.log('[WebRTC] Failed to create fake stream, going truly streamless...', emptyStreamError);
              stream = null;
              hasVideo = false;
              hasAudio = false;
              connectionType = 'no-camera';
              console.log('[WebRTC] Success: View-only mode enabled (no camera available)');
            }
          }
        }
      }

      // Configure initial states based on what we got
      if (stream) {
        // Start with microphone muted if we have audio
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = false;
        });
      }
      
      dispatch({ type: 'SET_LOCAL_STREAM', payload: stream });
      dispatch({ type: 'SET_WEBCAM_ACTIVE', payload: hasVideo });
      dispatch({ type: 'SET_VIDEO_ENABLED', payload: true });
      dispatch({ type: 'SET_MICROPHONE_MUTED', payload: !hasAudio || true }); // Start muted if we have audio
      dispatch({ type: 'SET_CONNECTION_TYPE', payload: connectionType as 'has-camera' | 'no-camera' });
      
      // Notify server that we're ready for video and send our connection type
      if (socket && roomCode) {
        socket.emit('webrtc:enable-video', { 
          roomCode, 
          peerId: userId, 
          connectionType: connectionType 
        });
      }
      
      // Show user what type of connection they have
      const statusMessage = `Video chat enabled (${connectionType})${!hasVideo ? ' - You can see others but your camera is not available' : ''}${!hasAudio ? ' - Audio not available' : ''}`;
      console.log(`[WebRTC] ${statusMessage}`);
      
      // Show a toast notification for no-camera users
      if (connectionType === 'no-camera') {
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        notification.textContent = hasAudio ? 
          '🎤 Voice-only mode: You can hear others but no camera available' :
          '👀 View-only mode: You can see others but no camera/mic available';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 5000);
      }
      
    } catch (error) {
      console.error('[WebRTC] Error enabling video chat:', error);
      // Even if everything fails, we should still allow joining to see others
      dispatch({ type: 'SET_LOCAL_STREAM', payload: null });
      dispatch({ type: 'SET_WEBCAM_ACTIVE', payload: false });
      dispatch({ type: 'SET_VIDEO_ENABLED', payload: true });
      dispatch({ type: 'SET_MICROPHONE_MUTED', payload: true });
      dispatch({ type: 'SET_CONNECTION_TYPE', payload: 'no-camera' });
      
      if (socket && roomCode) {
        socket.emit('webrtc:enable-video', { 
          roomCode, 
          peerId: userId, 
          connectionType: 'no-camera' 
        });
      }
      
      alert('Could not access camera or microphone, but you can still see other players. Check your browser permissions if you want to share your camera/microphone.');
    }
  }, [socket, roomCode, userId, state.selectedDevices.cameraId, state.selectedDevices.microphoneId]);

  const prepareVideoChat = useCallback(async () => {
    try {
      console.log('[WebRTC] Preparing video chat (local preview only)...');
      
      let stream: MediaStream | null = null;
      let hasVideo = false;
      let connectionType = '';

      // Try different permission combinations, starting with both video and audio
      try {
        // First attempt: Both video and audio
        console.log('[WebRTC] Attempting video + audio...');
        stream = await navigator.mediaDevices.getUserMedia({
          video: getVideoConstraints(state.selectedDevices.cameraId || undefined),
          audio: getAudioConstraints(state.selectedDevices.microphoneId || undefined)
        });
        hasVideo = stream.getVideoTracks().length > 0;
        connectionType = 'has-camera';
        console.log('[WebRTC] Success: Video + Audio prepared');
      } catch (videoAudioError) {
        console.log('[WebRTC] Video + Audio failed, trying audio only...', videoAudioError);
        
        try {
          // Second attempt: Audio only
          stream = await navigator.mediaDevices.getUserMedia({
            audio: getAudioConstraints(state.selectedDevices.microphoneId || undefined)
          });
          hasVideo = false;
          connectionType = 'no-camera';
          console.log('[WebRTC] Success: Audio-only prepared (no camera available)');
        } catch (audioError) {
          console.log('[WebRTC] Audio failed, trying video only...', audioError);
          
          try {
            // Third attempt: Video only
            stream = await navigator.mediaDevices.getUserMedia({
              video: getVideoConstraints(state.selectedDevices.cameraId || undefined)
            });
            hasVideo = stream.getVideoTracks().length > 0;
            connectionType = 'has-camera';
            console.log('[WebRTC] Success: Video-only prepared');
          } catch (videoError) {
            console.log('[WebRTC] All media access failed, preparing view-only mode...', videoError);
            stream = null;
            hasVideo = false;
            connectionType = 'no-camera';
            console.log('[WebRTC] Success: View-only mode prepared');
          }
        }
      }

      // Configure initial states - keep muted in preparation mode
      if (stream) {
        const audioTracks = stream.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = false; // Keep muted during preparation
        });
      }
      
      // Set state for preparation mode (but don't notify server yet)
      dispatch({ type: 'SET_LOCAL_STREAM', payload: stream });
      dispatch({ type: 'SET_WEBCAM_ACTIVE', payload: hasVideo });
      dispatch({ type: 'SET_VIDEO_PREPARING', payload: true });
      dispatch({ type: 'SET_MICROPHONE_MUTED', payload: true }); // Always start muted in preparation
      dispatch({ type: 'SET_CONNECTION_TYPE', payload: connectionType as 'has-camera' | 'no-camera' });
      
      console.log(`[WebRTC] Video chat prepared for preview (${connectionType})`);
      
    } catch (error) {
      console.error('[WebRTC] Error preparing video chat:', error);
      // Set basic states even if preparation fails
      dispatch({ type: 'SET_LOCAL_STREAM', payload: null });
      dispatch({ type: 'SET_WEBCAM_ACTIVE', payload: false });
      dispatch({ type: 'SET_VIDEO_PREPARING', payload: true });
      dispatch({ type: 'SET_MICROPHONE_MUTED', payload: true });
      dispatch({ type: 'SET_CONNECTION_TYPE', payload: 'no-camera' });
    }
  }, [state.selectedDevices.cameraId, state.selectedDevices.microphoneId]);

  const confirmVideoChat = useCallback(async () => {
    try {
      console.log('[WebRTC] Confirming video chat - making visible to other players...');
      
      // Exit preparation mode and enable video chat
      dispatch({ type: 'SET_VIDEO_PREPARING', payload: false });
      dispatch({ type: 'SET_VIDEO_ENABLED', payload: true });
      
      // Notify server that we're ready for video and send our connection type
      if (socket && roomCode && state.connectionType) {
        socket.emit('webrtc:enable-video', { 
          roomCode, 
          peerId: userId, 
          connectionType: state.connectionType 
        });
      }
      
      console.log('[WebRTC] Video chat confirmed and enabled for other players');
      
    } catch (error) {
      console.error('[WebRTC] Error confirming video chat:', error);
    }
  }, [socket, roomCode, userId, state.connectionType]);

  const cancelVideoPreparation = useCallback(() => {
    console.log('[WebRTC] Canceling video preparation...');
    
    // Stop the local stream if it exists
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => track.stop());
    }
    
    // Reset preparation state
    dispatch({ type: 'SET_LOCAL_STREAM', payload: null });
    dispatch({ type: 'SET_WEBCAM_ACTIVE', payload: false });
    dispatch({ type: 'SET_VIDEO_PREPARING', payload: false });
    dispatch({ type: 'SET_MICROPHONE_MUTED', payload: false });
    dispatch({ type: 'SET_CONNECTION_TYPE', payload: null });
    
    console.log('[WebRTC] Video preparation canceled');
  }, [state.localStream]);

  const disableVideoChat = useCallback(() => {
    console.log('[WebRTC] Disabling video chat');
    
    // Stop virtual background service if active
    if (virtualBackgroundService.current) {
      console.log('[WebRTC] Disposing virtual background service...');
      virtualBackgroundService.current.dispose();
      virtualBackgroundService.current = null;
    }
    
    // Stop audio processor service if active
    if (audioProcessorService.current) {
      console.log('[WebRTC] Disposing audio processor service...');
      audioProcessorService.current.dispose();
      audioProcessorService.current = null;
    }
    
    // Notify server that we're disabling video
    if (socket && roomCode) {
      socket.emit('webrtc:disable-video', { roomCode, peerId: userId });
    }
    
    dispatch({ type: 'SET_VIDEO_ENABLED', payload: false });
    dispatch({ type: 'RESET_STATE' });
  }, [socket, roomCode, userId]);

  const toggleWebcam = useCallback(async () => {
    if (!state.localStream) {
      console.log('[WebRTC] Cannot toggle webcam - no local stream available');
      return;
    }

    const videoTracks = state.localStream.getVideoTracks();
    if (videoTracks.length === 0) {
      console.log('[WebRTC] Cannot toggle webcam - no video tracks available');
      return;
    }

    const newState = !state.isWebcamActive;

    if (newState) {
      // Turning camera ON - create a completely new stream
      console.log('[WebRTC] Turning camera on - creating new stream with fresh video track');
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: state.selectedDevices.cameraId ? {
            deviceId: { exact: state.selectedDevices.cameraId },
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 }
          } : {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 }
          }
        });

        const newVideoTrack = videoStream.getVideoTracks()[0];
        const audioTracks = state.localStream.getAudioTracks();

        // Stop old video tracks
        videoTracks.forEach(track => track.stop());

        // Create a NEW MediaStream with the new video track and existing audio tracks
        const newStream = new MediaStream();
        newStream.addTrack(newVideoTrack);
        audioTracks.forEach(track => newStream.addTrack(track));

        console.log('[WebRTC] New stream created with fresh video track');

        // Update all peer connections with the new video track
        state.peerConnections.forEach((peerConnection) => {
          const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack).catch(err => {
              console.error('[WebRTC] Failed to replace video track:', err);
            });
          }
        });

        // Update the local stream (this will trigger React re-render)
        dispatch({ type: 'SET_LOCAL_STREAM', payload: newStream });

        console.log('[WebRTC] Camera turned on with fresh video track');
      } catch (error) {
        console.error('[WebRTC] Failed to turn on camera:', error);
        return;
      }
    } else {
      // Turning camera OFF - just disable the track
      console.log('[WebRTC] Turning camera off');
      videoTracks.forEach(track => {
        track.enabled = false;
      });
    }

    dispatch({ type: 'SET_WEBCAM_ACTIVE', payload: newState });
  }, [state.localStream, state.isWebcamActive, state.selectedDevices.cameraId, state.peerConnections]);

  const toggleMicrophone = useCallback(() => {
    if (!state.localStream) {
      console.log('[WebRTC] Cannot toggle microphone - no local stream available');
      return;
    }
    
    const audioTracks = state.localStream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.log('[WebRTC] Cannot toggle microphone - no audio tracks available');
      return;
    }
    
    const newState = !state.isMicrophoneMuted;
    
    audioTracks.forEach(track => {
      track.enabled = !newState; // enabled is opposite of muted
    });
    
    dispatch({ type: 'SET_MICROPHONE_MUTED', payload: newState });
    console.log(`[WebRTC] Microphone ${newState ? 'muted' : 'unmuted'}`);
  }, [state.localStream, state.isMicrophoneMuted]);

  const refreshConnections = useCallback(() => {
    console.log('[WebRTC] Refreshing connections...');
    
    // If video is enabled, request updated peer list from server
    if (state.isVideoEnabled && socket && roomCode) {
      // Close existing connections
      state.peerConnections.forEach((connection, peerId) => {
        console.log(`[WebRTC] Closing connection to ${peerId} for refresh`);
        connection.close();
        dispatch({ type: 'REMOVE_PEER_CONNECTION', payload: peerId });
      });
      
      // Clear remote streams but keep local stream and video enabled state
      state.remoteStreams.clear();
      
      // Request fresh peer list without resetting everything
      setTimeout(() => {
        console.log('[WebRTC] Requesting fresh peer list');
        socket.emit('webrtc:enable-video', { roomCode, peerId: userId });
      }, 200);
    }
  }, [state.isVideoEnabled, state.peerConnections, state.remoteStreams, socket, roomCode, userId]);

  // Device management functions
  const refreshDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const microphones = devices.filter(device => device.kind === 'audioinput');
      
      dispatch({ type: 'SET_AVAILABLE_DEVICES', payload: { cameras, microphones } });
      
      // Set default devices if none selected
      if (!state.selectedDevices.cameraId && cameras.length > 0) {
        dispatch({ type: 'SET_SELECTED_DEVICE', payload: { deviceType: 'camera', deviceId: cameras[0].deviceId } });
      }
      if (!state.selectedDevices.microphoneId && microphones.length > 0) {
        dispatch({ type: 'SET_SELECTED_DEVICE', payload: { deviceType: 'microphone', deviceId: microphones[0].deviceId } });
      }
    } catch (error) {
      console.error('Error enumerating devices:', error);
    }
  }, [state.selectedDevices.cameraId, state.selectedDevices.microphoneId]);

  const setSelectedCamera = useCallback((deviceId: string) => {
    dispatch({ type: 'SET_SELECTED_DEVICE', payload: { deviceType: 'camera', deviceId } });
    
    // If video is enabled, restart stream with new camera
    if (state.isVideoEnabled && state.localStream) {
      setTimeout(async () => {
        try {
          // Stop current stream
          state.localStream?.getTracks().forEach(track => track.stop());
          
          // Create new stream with selected camera
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 24, max: 30 }
            },
            audio: getHighQualityAudioConstraints(state.selectedDevices.microphoneId || undefined)
          });
          
          // Apply current mute states
          const audioTracks = stream.getAudioTracks();
          const videoTracks = stream.getVideoTracks();
          
          audioTracks.forEach(track => {
            track.enabled = !state.isMicrophoneMuted;
          });
          
          videoTracks.forEach(track => {
            track.enabled = state.isWebcamActive;
          });
          
          dispatch({ type: 'SET_LOCAL_STREAM', payload: stream });
          
          // Update all peer connections with new stream
          state.peerConnections.forEach(async (pc) => {
            const senders = pc.getSenders();
            
            // Replace video track
            const videoSender = senders.find(s => s.track?.kind === 'video');
            const newVideoTrack = stream.getVideoTracks()[0];
            if (videoSender && newVideoTrack) {
              await videoSender.replaceTrack(newVideoTrack);
            }
            
            // Replace audio track if microphone also changed
            const audioSender = senders.find(s => s.track?.kind === 'audio');
            const newAudioTrack = stream.getAudioTracks()[0];
            if (audioSender && newAudioTrack) {
              await audioSender.replaceTrack(newAudioTrack);
            }
          });
          
          console.log('[WebRTC] Camera changed successfully');
        } catch (error) {
          console.error('[WebRTC] Error changing camera:', error);
        }
      }, 100);
    }
  }, [state.isVideoEnabled, state.localStream, state.selectedDevices.microphoneId, state.isMicrophoneMuted, state.isWebcamActive, state.peerConnections]);

  const setSelectedMicrophone = useCallback((deviceId: string) => {
    dispatch({ type: 'SET_SELECTED_DEVICE', payload: { deviceType: 'microphone', deviceId } });
    
    // If video is enabled, restart stream with new microphone
    if (state.isVideoEnabled && state.localStream) {
      setTimeout(async () => {
        try {
          // Stop current stream
          state.localStream?.getTracks().forEach(track => track.stop());
          
          // Create new stream with selected microphone
          const stream = await navigator.mediaDevices.getUserMedia({
            video: state.selectedDevices.cameraId ? {
              deviceId: { exact: state.selectedDevices.cameraId },
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 24, max: 30 }
            } : {
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
              frameRate: { ideal: 24, max: 30 }
            },
            audio: getHighQualityAudioConstraints(deviceId)
          });
          
          // Apply current mute states
          const audioTracks = stream.getAudioTracks();
          const videoTracks = stream.getVideoTracks();
          
          audioTracks.forEach(track => {
            track.enabled = !state.isMicrophoneMuted;
          });
          
          videoTracks.forEach(track => {
            track.enabled = state.isWebcamActive;
          });
          
          dispatch({ type: 'SET_LOCAL_STREAM', payload: stream });
          
          // Update all peer connections with new stream
          state.peerConnections.forEach(async (pc) => {
            const senders = pc.getSenders();
            
            // Replace audio track
            const audioSender = senders.find(s => s.track?.kind === 'audio');
            const newAudioTrack = stream.getAudioTracks()[0];
            if (audioSender && newAudioTrack) {
              await audioSender.replaceTrack(newAudioTrack);
            }
            
            // Replace video track
            const videoSender = senders.find(s => s.track?.kind === 'video');
            const newVideoTrack = stream.getVideoTracks()[0];
            if (videoSender && newVideoTrack) {
              await videoSender.replaceTrack(newVideoTrack);
            }
          });
          
          console.log('[WebRTC] Microphone changed successfully');
        } catch (error) {
          console.error('[WebRTC] Error changing microphone:', error);
        }
      }, 100);
    }
  }, [state.isVideoEnabled, state.localStream, state.selectedDevices.cameraId, state.isMicrophoneMuted, state.isWebcamActive, state.peerConnections]);

  // Socket event handlers for WebRTC signaling
  useEffect(() => {
    if (!socket || !roomCode) return;

    const handleVideoEnabledPeers = ({ peers, peerConnectionTypes }: { peers: string[]; peerConnectionTypes?: Record<string, string> }) => {
      console.log('[WebRTC] Received list of video-enabled peers:', peers);
      console.log('[WebRTC] Peer connection types:', peerConnectionTypes);
      console.log('[WebRTC] Current connection count:', stateRef.current.peerConnections.size);
      console.log('[WebRTC] Current remote streams:', stateRef.current.remoteStreams.size);
      
      if (!stateRef.current.isVideoEnabled) return;
      
      // Store peer connection types
      if (peerConnectionTypes) {
        Object.entries(peerConnectionTypes).forEach(([peerId, connectionType]) => {
          dispatch({ type: 'SET_PEER_CONNECTION_TYPE', payload: { peerId, connectionType } });
        });
      }
      
      // Connect to ALL peers (except ourselves)
      peers.forEach(peerId => {
        if (peerId !== userId) {
          const hasConnection = stateRef.current.peerConnections.has(peerId);
          const connectionState = stateRef.current.connectionStates.get(peerId);
          
          // Only create offer if we don't have a connection and we're the initiator
          if (!hasConnection || connectionState === 'failed') {
            const shouldInitiate = userId && userId < peerId;
            console.log(`[WebRTC] Peer ${peerId}: hasConnection=${hasConnection}, state=${connectionState}, shouldInitiate=${shouldInitiate}`);
            
            if (shouldInitiate) {
              // Stagger connection attempts to avoid overwhelming the network
              const delay = Math.random() * 1000;
              setTimeout(() => {
                // Double-check connection doesn't exist before creating
                if (!stateRef.current.peerConnections.has(peerId) || 
                    stateRef.current.connectionStates.get(peerId) === 'failed') {
                  console.log(`[WebRTC] Creating offer to ${peerId} after ${delay}ms delay`);
                  createOffer(peerId);
                }
              }, delay);
            } else {
              console.log(`[WebRTC] Waiting for ${peerId} to initiate connection (they have smaller ID)`);
            }
          } else {
            console.log(`[WebRTC] Skipping ${peerId}: already connected (state=${connectionState})`);
          }
        }
      });
    };

    const handlePeerEnabledVideo = ({ peerId, connectionType }: { peerId: string; connectionType?: string }) => {
      console.log('[WebRTC] Peer enabled video:', peerId, 'with connection type:', connectionType);
      
      // Store peer connection type
      if (connectionType) {
        dispatch({ type: 'SET_PEER_CONNECTION_TYPE', payload: { peerId, connectionType } });
      }
      
      if (!stateRef.current.isVideoEnabled || peerId === userId) return;

      // Only initiate if we have the smaller ID
      const shouldInitiate = userId && userId < peerId;
      
      if (shouldInitiate) {
        const hasConnection = stateRef.current.peerConnections.has(peerId);
        const connectionState = stateRef.current.connectionStates.get(peerId);
        
        if (!hasConnection || connectionState === 'failed') {
          setTimeout(() => createOffer(peerId), 100);
        }
      }
    };

    const handlePeerDisabledVideo = ({ peerId }: { peerId: string }) => {
      console.log('[WebRTC] Peer disabled video:', peerId);
      dispatch({ type: 'REMOVE_REMOTE_STREAM', payload: peerId });
      dispatch({ type: 'REMOVE_PEER_CONNECTION', payload: peerId });
      pendingCandidates.current.delete(peerId);
    };

    const handlePeerLeft = ({ peerId }: { peerId: string }) => {
      console.log('[WebRTC] Peer left:', peerId);
      dispatch({ type: 'REMOVE_REMOTE_STREAM', payload: peerId });
      dispatch({ type: 'REMOVE_PEER_CONNECTION', payload: peerId });
      pendingCandidates.current.delete(peerId);
    };

    const handleOffer = async ({ fromPeerId, offer }: { fromPeerId: string; offer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Received offer from:', fromPeerId);
      
      if (!stateRef.current.isVideoEnabled) {
        console.log('[WebRTC] Video not enabled, ignoring offer');
        return;
      }

      try {
        // Always accept offers - the other peer has decided to initiate
        let peerConnection = stateRef.current.peerConnections.get(fromPeerId);
        
        // Create new connection or reuse existing
        if (!peerConnection || peerConnection.connectionState === 'closed' || peerConnection.connectionState === 'failed') {
          peerConnection = createPeerConnection(fromPeerId);
        }

        // Set remote description and create answer
        dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId: fromPeerId, state: 'answering' } });
        
        console.log(`[WebRTC] Setting remote description for offer from ${fromPeerId}...`);
        await peerConnection.setRemoteDescription(offer);
        console.log(`[WebRTC] Remote description set, creating answer for ${fromPeerId}...`);
        const answer = await peerConnection.createAnswer();
        console.log(`[WebRTC] Answer created for ${fromPeerId}, setting local description...`);
        await peerConnection.setLocalDescription(answer);
        console.log(`[WebRTC] Local description set for answer to ${fromPeerId}`);
        
        if (socket && peerConnection.localDescription) {
          console.log(`[WebRTC] Sending answer to ${fromPeerId}`);
          socket.emit('webrtc:answer', {
            roomCode,
            toPeerId: fromPeerId,
            answer: peerConnection.localDescription
          });
          dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId: fromPeerId, state: 'answer-sent' } });
        }

        // Process any pending ICE candidates
        const pending = pendingCandidates.current.get(fromPeerId) || [];
        for (const candidate of pending) {
          try {
            await peerConnection.addIceCandidate(candidate);
            console.log(`[WebRTC] Added pending ICE candidate for ${fromPeerId}`);
          } catch (err) {
            console.error(`[WebRTC] Error adding pending ICE candidate for ${fromPeerId}:`, err);
          }
        }
        pendingCandidates.current.delete(fromPeerId);
        
      } catch (error) {
        console.error('[WebRTC] Error handling offer:', error);
        dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId: fromPeerId, state: 'failed' } });
      }
    };

    const handleAnswer = async ({ fromPeerId, answer }: { fromPeerId: string; answer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Received answer from:', fromPeerId);
      
      const peerConnection = stateRef.current.peerConnections.get(fromPeerId);
      if (!peerConnection) {
        console.warn(`[WebRTC] No peer connection found for ${fromPeerId} when handling answer`);
        return;
      }

      try {
        console.log(`[WebRTC] Received answer from ${fromPeerId}, setting remote description...`);
        await peerConnection.setRemoteDescription(answer);
        console.log(`[WebRTC] Successfully set remote description for answer from ${fromPeerId}`);
        dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId: fromPeerId, state: 'answer-received' } });
        
        // Process any pending ICE candidates
        const pending = pendingCandidates.current.get(fromPeerId) || [];
        for (const candidate of pending) {
          try {
            await peerConnection.addIceCandidate(candidate);
            console.log(`[WebRTC] Added pending ICE candidate for ${fromPeerId}`);
          } catch (err) {
            console.error(`[WebRTC] Error adding pending ICE candidate for ${fromPeerId}:`, err);
          }
        }
        pendingCandidates.current.delete(fromPeerId);
        
      } catch (error) {
        console.error('[WebRTC] Error handling answer:', error);
        dispatch({ type: 'SET_CONNECTION_STATE', payload: { peerId: fromPeerId, state: 'failed' } });
      }
    };

    const handleIceCandidate = async ({ fromPeerId, candidate }: { fromPeerId: string; candidate: RTCIceCandidateInit }) => {      
      const peerConnection = stateRef.current.peerConnections.get(fromPeerId);
      
      if (!peerConnection) {
        // Store candidate for later if connection doesn't exist yet
        console.log(`[WebRTC] Storing ICE candidate for ${fromPeerId} (no connection yet)`);
        const pending = pendingCandidates.current.get(fromPeerId) || [];
        pending.push(candidate);
        pendingCandidates.current.set(fromPeerId, pending);
        return;
      }

      try {
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(candidate);
          console.log(`[WebRTC] Added ICE candidate from ${fromPeerId}`);
        } else {
          // Store candidate for later if remote description not set
          console.log(`[WebRTC] Storing ICE candidate for ${fromPeerId} (no remote description)`);
          const pending = pendingCandidates.current.get(fromPeerId) || [];
          pending.push(candidate);
          pendingCandidates.current.set(fromPeerId, pending);
        }
      } catch (error) {
        console.error('[WebRTC] Error adding ICE candidate:', error);
      }
    };

    socket.on('webrtc:video-enabled-peers', handleVideoEnabledPeers);
    socket.on('webrtc:peer-enabled-video', handlePeerEnabledVideo);
    socket.on('webrtc:peer-disabled-video', handlePeerDisabledVideo);
    socket.on('webrtc:peer-left', handlePeerLeft);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice-candidate', handleIceCandidate);

    return () => {
      socket.off('webrtc:video-enabled-peers', handleVideoEnabledPeers);
      socket.off('webrtc:peer-enabled-video', handlePeerEnabledVideo);
      socket.off('webrtc:peer-disabled-video', handlePeerDisabledVideo);
      socket.off('webrtc:peer-left', handlePeerLeft);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice-candidate', handleIceCandidate);
    };
  }, [socket, roomCode, userId, createPeerConnection, createOffer]);

  // Initialize devices on mount
  useEffect(() => {
    refreshDevices();
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[WebRTC] Cleaning up...');
      disableVideoChat();
    };
  }, [disableVideoChat]);

  // Virtual background service ref
  const virtualBackgroundService = useRef<VirtualBackgroundService | null>(null);
  
  // Audio processor service ref
  const audioProcessorService = useRef<AudioProcessor | null>(null);
  
  // Face avatar service ref
  const faceAvatarService = useRef<FaceAvatarService | null>(null);

  const initializeVirtualBackground = useCallback(async () => {
    console.log('[WebRTC] initializeVirtualBackground called');
    console.log('[WebRTC] Current virtual background config:', state.virtualBackground.config);
    
    try {
      if (virtualBackgroundService.current) {
        console.log('[WebRTC] Disposing existing virtual background service');
        virtualBackgroundService.current.dispose();
      }

      console.log('[WebRTC] Creating new VirtualBackgroundService');
      virtualBackgroundService.current = new VirtualBackgroundService(state.virtualBackground.config);
      
      console.log('[WebRTC] Initializing virtual background service...');
      await virtualBackgroundService.current.initialize();
      
      dispatch({ type: 'SET_VIRTUAL_BACKGROUND_INITIALIZED', payload: true });
      console.log('[WebRTC] Virtual background initialized successfully');
    } catch (error) {
      console.error('[WebRTC] Failed to initialize virtual background:', error);
      dispatch({ type: 'SET_VIRTUAL_BACKGROUND_INITIALIZED', payload: false });
      throw error;
    }
  }, [state.virtualBackground.config]);

  const enableVirtualBackground = useCallback(async () => {
    console.log('[WebRTC] enableVirtualBackground called');
    console.log('[WebRTC] Virtual background service initialized:', virtualBackgroundService.current?.isServiceInitialized());
    console.log('[WebRTC] Local stream available:', !!state.localStream);
    
    if (!virtualBackgroundService.current?.isServiceInitialized()) {
      console.log('[WebRTC] Initializing virtual background service...');
      await initializeVirtualBackground();
    }

    if (!state.localStream || !virtualBackgroundService.current) {
      const error = 'Local stream or virtual background service not available';
      console.error('[WebRTC]', error);
      throw new Error(error);
    }

    try {
      console.log('[WebRTC] Calling setupAndStart on virtual background service with MediaStream...');
      console.log('[WebRTC] Local stream tracks:', state.localStream.getVideoTracks().length, 'video,', state.localStream.getAudioTracks().length, 'audio');
      console.log('[WebRTC] Checking MediaStreamTrackProcessor support:', 'MediaStreamTrackProcessor' in window);
      console.log('[WebRTC] Checking MediaStreamTrackGenerator support:', 'MediaStreamTrackGenerator' in window);
      
      // Use the new setupAndStart method that takes a MediaStream directly
      const virtualStream = await virtualBackgroundService.current.setupAndStart(state.localStream);

      console.log('[WebRTC] setupAndStart completed. Stream:', !!virtualStream);
      console.log('[WebRTC] Virtual stream tracks:', virtualStream?.getVideoTracks().length || 0);

      if (virtualStream) {
        // Replace video track in the local stream
        const audioTracks = state.localStream.getAudioTracks();
        console.log('[WebRTC] Audio tracks from original stream:', audioTracks.length);
        
        // Create new stream with virtual background video and original audio
        const newStream = new MediaStream([
          ...virtualStream.getVideoTracks(),
          ...audioTracks
        ]);

        console.log('[WebRTC] Created new stream with', newStream.getVideoTracks().length, 'video tracks and', newStream.getAudioTracks().length, 'audio tracks');

        // Update all peer connections with new track
        console.log('[WebRTC] Updating', state.peerConnections.size, 'peer connections with new track...');
        state.peerConnections.forEach((peerConnection) => {
          const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
          if (sender && virtualStream.getVideoTracks()[0]) {
            sender.replaceTrack(virtualStream.getVideoTracks()[0]).catch(console.error);
          }
        });

        dispatch({ type: 'SET_LOCAL_STREAM', payload: newStream });
        dispatch({ type: 'SET_VIRTUAL_BACKGROUND_ENABLED', payload: true });
        console.log('[WebRTC] Virtual background enabled successfully');
      } else {
        console.error('[WebRTC] Virtual stream is null or undefined');
      }
    } catch (error) {
      console.error('[WebRTC] Failed to enable virtual background:', error);
      console.error('[WebRTC] Error details:', error instanceof Error ? error.message : String(error));
      console.error('[WebRTC] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      throw error;
    }
  }, [state.localStream, state.peerConnections, initializeVirtualBackground]);

  const disableVirtualBackground = useCallback(async () => {
    if (virtualBackgroundService.current) {
      virtualBackgroundService.current.stopVirtualBackground();
    }
    dispatch({ type: 'SET_VIRTUAL_BACKGROUND_ENABLED', payload: false });
    
    // Restore original camera stream
    try {
      console.log('[WebRTC] Restoring original camera stream...');
      
      // Get fresh camera stream
      const constraints = {
        video: state.selectedDevices.cameraId ? {
          deviceId: { exact: state.selectedDevices.cameraId },
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 }
        } : {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 }
        },
        audio: true
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Update all peer connections with the new camera track
      state.peerConnections.forEach((peerConnection) => {
        const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (sender && newStream.getVideoTracks()[0]) {
          sender.replaceTrack(newStream.getVideoTracks()[0]).catch(console.error);
        }
      });

      dispatch({ type: 'SET_LOCAL_STREAM', payload: newStream });
      console.log('[WebRTC] Virtual background disabled, restored camera stream');
    } catch (error) {
      console.error('[WebRTC] Failed to restore camera stream after disabling virtual background:', error);
    }
  }, [state.peerConnections, state.selectedDevices.cameraId]);

  const updateVirtualBackgroundConfig = useCallback((config: Partial<VirtualBackgroundConfig>) => {
    dispatch({ type: 'SET_VIRTUAL_BACKGROUND_CONFIG', payload: config });
    
    if (virtualBackgroundService.current) {
      virtualBackgroundService.current.updateConfig(config);
    }
  }, []);

  const initializeAudioProcessor = useCallback(async () => {
    try {
      console.log('[WebRTC] initializeAudioProcessor called');
      console.log('[WebRTC] Audio processor config:', state.audioProcessor.config);
      
      if (audioProcessorService.current) {
        console.log('[WebRTC] Disposing existing audio processor');
        audioProcessorService.current.dispose();
      }

      console.log('[WebRTC] Creating new AudioProcessor instance');
      audioProcessorService.current = new AudioProcessor(state.audioProcessor.config);
      
      console.log('[WebRTC] Initializing audio processor...');
      await audioProcessorService.current.initialize();
      
      dispatch({ type: 'SET_AUDIO_PROCESSOR_INITIALIZED', payload: true });
      console.log('[WebRTC] Audio processor initialized successfully');
    } catch (error) {
      console.error('[WebRTC] Failed to initialize audio processor:', error);
      dispatch({ type: 'SET_AUDIO_PROCESSOR_INITIALIZED', payload: false });
      throw error;
    }
  }, [state.audioProcessor.config]);

  const enableAudioProcessor = useCallback(async () => {
    try {
      console.log('[WebRTC] enableAudioProcessor called');
      console.log('[WebRTC] Local stream available:', !!state.localStream);
      console.log('[WebRTC] Audio processor initialized:', audioProcessorService.current?.isInitialized());
      
      if (!audioProcessorService.current?.isInitialized()) {
        console.log('[WebRTC] Initializing audio processor...');
        await initializeAudioProcessor();
      }

      if (!state.localStream) {
        console.error('[WebRTC] No local stream available');
        throw new Error('Local stream not available');
      }

      if (!audioProcessorService.current) {
        console.error('[WebRTC] Audio processor service not available');
        throw new Error('Audio processor service not available');
      }

      console.log('[WebRTC] Processing audio stream...');
      
      // Process the audio stream
      const processedStream = await audioProcessorService.current.processStream(state.localStream);
      console.log('[WebRTC] Audio stream processed successfully');
      
      // Create new stream with processed audio and original video
      const videoTracks = state.localStream.getVideoTracks();
      const processedAudioTracks = processedStream.getAudioTracks();
      
      console.log('[WebRTC] Video tracks:', videoTracks.length);
      console.log('[WebRTC] Processed audio tracks:', processedAudioTracks.length);
      
      const newStream = new MediaStream([
        ...videoTracks,
        ...processedAudioTracks
      ]);

      // Update all peer connections with the processed audio track
      console.log('[WebRTC] Updating peer connections...');
      state.peerConnections.forEach((peerConnection) => {
        const audioSender = peerConnection.getSenders().find(s => s.track?.kind === 'audio');
        if (audioSender && processedAudioTracks[0]) {
          audioSender.replaceTrack(processedAudioTracks[0]).catch(console.error);
        }
      });

      dispatch({ type: 'SET_LOCAL_STREAM', payload: newStream });
      dispatch({ type: 'SET_AUDIO_PROCESSOR_ENABLED', payload: true });
      console.log('[WebRTC] Audio processor enabled successfully');
    } catch (error) {
      console.error('[WebRTC] Failed to enable audio processor:', error);
      // Don't throw to prevent UI from showing error state
    }
  }, [state.localStream, state.peerConnections, initializeAudioProcessor]);

  const disableAudioProcessor = useCallback(() => {
    if (audioProcessorService.current) {
      audioProcessorService.current.stop();
    }
    dispatch({ type: 'SET_AUDIO_PROCESSOR_ENABLED', payload: false });
    
    // Note: To fully restore original audio, we'd need to restart the stream
    // For now, just mark as disabled
    console.log('[WebRTC] Audio processor disabled');
  }, []);

  const updateAudioProcessorConfig = useCallback((config: Partial<AudioProcessorConfig>) => {
    dispatch({ type: 'SET_AUDIO_PROCESSOR_CONFIG', payload: config });
    
    if (audioProcessorService.current) {
      audioProcessorService.current.updateConfig(config);
    }
  }, []);

  const initializeFaceAvatar = useCallback(async () => {
    try {
      console.log('[WebRTC] initializeFaceAvatar called');
      console.log('[WebRTC] Face avatar config:', state.faceAvatar.config);
      
      if (faceAvatarService.current) {
        console.log('[WebRTC] Disposing existing face avatar service');
        faceAvatarService.current.dispose();
      }

      console.log('[WebRTC] Creating new FaceAvatarService');
      faceAvatarService.current = new FaceAvatarService(state.faceAvatar.config);
      
      console.log('[WebRTC] Initializing face avatar service...');
      await faceAvatarService.current.initialize();
      
      dispatch({ type: 'SET_FACE_AVATAR_INITIALIZED', payload: true });
      console.log('[WebRTC] Face avatar initialized successfully');
    } catch (error) {
      console.error('[WebRTC] Failed to initialize face avatar:', error);
      dispatch({ type: 'SET_FACE_AVATAR_INITIALIZED', payload: false });
      throw error;
    }
  }, [state.faceAvatar.config]);

  const enableFaceAvatar = useCallback(async () => {
    try {
      console.log('[WebRTC] enableFaceAvatar called');
      console.log('[WebRTC] Face avatar service initialized:', faceAvatarService.current?.isServiceInitialized());
      console.log('[WebRTC] Local stream available:', !!state.localStream);
      
      if (!faceAvatarService.current?.isServiceInitialized()) {
        console.log('[WebRTC] Initializing face avatar service...');
        await initializeFaceAvatar();
      }

      if (!state.localStream) {
        console.error('[WebRTC] No local stream available');
        throw new Error('Local stream not available');
      }

      if (!faceAvatarService.current) {
        console.error('[WebRTC] Face avatar service not available');
        throw new Error('Face avatar service not available');
      }

      console.log('[WebRTC] Processing video stream with face avatar...');
      
      // Process the video stream
      const avatarStream = await faceAvatarService.current.setupAndStart(state.localStream);
      console.log('[WebRTC] Face avatar stream processed successfully');
      
      // Create new stream with avatar video and original audio
      const audioTracks = state.localStream.getAudioTracks();
      const avatarVideoTracks = avatarStream.getVideoTracks();
      
      console.log('[WebRTC] Audio tracks:', audioTracks.length);
      console.log('[WebRTC] Avatar video tracks:', avatarVideoTracks.length);
      
      const newStream = new MediaStream([
        ...avatarVideoTracks,
        ...audioTracks
      ]);

      // Update all peer connections with the avatar video track
      console.log('[WebRTC] Updating peer connections...');
      state.peerConnections.forEach((peerConnection) => {
        const videoSender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender && avatarVideoTracks[0]) {
          videoSender.replaceTrack(avatarVideoTracks[0]).catch(console.error);
        }
      });

      dispatch({ type: 'SET_LOCAL_STREAM', payload: newStream });
      dispatch({ type: 'SET_FACE_AVATAR_ENABLED', payload: true });
      console.log('[WebRTC] Face avatar enabled successfully');
    } catch (error) {
      console.error('[WebRTC] Failed to enable face avatar:', error);
      // Don't throw to prevent UI from showing error state
    }
  }, [state.localStream, state.peerConnections, initializeFaceAvatar]);

  const disableFaceAvatar = useCallback(() => {
    if (faceAvatarService.current) {
      faceAvatarService.current.stopFaceAvatar();
    }
    dispatch({ type: 'SET_FACE_AVATAR_ENABLED', payload: false });
    
    // Note: To fully restore original video, we'd need to restart the stream
    // For now, just mark as disabled
    console.log('[WebRTC] Face avatar disabled');
  }, []);

  const updateFaceAvatarConfig = useCallback((config: Partial<FaceAvatarConfig>) => {
    dispatch({ type: 'SET_FACE_AVATAR_CONFIG', payload: config });
    
    if (faceAvatarService.current) {
      faceAvatarService.current.updateConfig(config);
    }
  }, []);

  // Cleanup services on unmount
  useEffect(() => {
    return () => {
      if (virtualBackgroundService.current) {
        virtualBackgroundService.current.dispose();
      }
      if (audioProcessorService.current) {
        audioProcessorService.current.dispose();
      }
      if (faceAvatarService.current) {
        faceAvatarService.current.dispose();
      }
    };
  }, []);

  const contextValue: WebRTCContextState = {
    ...state,
    enableVideoChat,
    prepareVideoChat,
    confirmVideoChat,
    cancelVideoPreparation,
    disableVideoChat,
    toggleWebcam,
    toggleMicrophone,
    refreshConnections,
    setSelectedCamera,
    setSelectedMicrophone,
    refreshDevices,
    initializeVirtualBackground,
    enableVirtualBackground,
    disableVirtualBackground,
    updateVirtualBackgroundConfig,
    initializeAudioProcessor,
    enableAudioProcessor,
    disableAudioProcessor,
    updateAudioProcessorConfig,
    initializeFaceAvatar,
    enableFaceAvatar,
    disableFaceAvatar,
    updateFaceAvatarConfig
  };

  return <WebRTCContext.Provider value={contextValue}>{children}</WebRTCContext.Provider>;
}; 