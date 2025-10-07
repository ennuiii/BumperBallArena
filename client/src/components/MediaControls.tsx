import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Settings, User, Video, VideoOff } from 'lucide-react';
import { useWebcamConfig } from '../config/WebcamConfig';

interface MediaControlsProps {
  isGamemaster?: boolean;
  playerName?: string;
  className?: string;
  onStreamUpdate?: (isMicOn: boolean) => void;
}

const MediaControls: React.FC<MediaControlsProps> = ({
  isGamemaster = false,
  playerName = 'Player',
  className = '',
  onStreamUpdate
}) => {
  const config = useWebcamConfig();
  const [isMicOn, setIsMicOn] = useState(false);
  const [isMusicOn, setIsMusicOn] = useState(true);
  const [musicVolume, setMusicVolume] = useState(0.3);
  const [showSettings, setShowSettings] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [availableDevices, setAvailableDevices] = useState<{
    microphones: MediaDeviceInfo[];
  }>({ microphones: [] });
  const [selectedMicrophone, setSelectedMicrophone] = useState<string>('');
  const [isStreamOperationInProgress, setIsStreamOperationInProgress] = useState(false);
  const [isWebcamOn, setIsWebcamOn] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastOperationTime = useRef<number>(0);

  // Cleanup function for streams
  const cleanupStream = useCallback((streamToCleanup: MediaStream | null) => {
    if (streamToCleanup) {
      streamToCleanup.getTracks().forEach(track => {
        track.stop();
      });
    }
  }, []);

  // Get available media devices (runs only once)
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter(device => device.kind === 'audioinput');
        
        setAvailableDevices({ microphones });
        
        // Set default devices if none selected
        if (!selectedMicrophone && microphones.length > 0) {
          setSelectedMicrophone(microphones[0].deviceId);
        }
      } catch (error) {
        console.error('Error enumerating devices:', error);
      }
    };

    getDevices();
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  }, []);

  // Handle device selection changes
  useEffect(() => {
    // Only restart stream if we have a stream and microphone is on
    if (stream && isMicOn) {
      const restartStream = async () => {
        try {
          cleanupStream(stream);
          const newStream = await createMediaStream(true);
          setStream(newStream);
        } catch (error) {
          console.error('Error restarting stream with new devices:', error);
        }
      };
      
      // Debounce device changes to prevent rapid stream creation
      const timeoutId = setTimeout(restartStream, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedMicrophone]);

  // Background music track
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = musicVolume;
      audioRef.current.loop = true;
      
      if (isMusicOn) {
        audioRef.current.play().catch(console.error);
      } else {
        audioRef.current.pause();
      }
    }
  }, [isMusicOn, musicVolume]);

  // Create new media stream with current settings (audio only)
  const createMediaStream = useCallback(async (audio: boolean) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: false, // No video/camera
        audio: audio ? (selectedMicrophone ? {
          deviceId: { exact: selectedMicrophone }
        } : true) : false
      };
      
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      console.error('Error creating media stream:', error);
      throw error;
    }
  }, [selectedMicrophone]);

  const toggleMicrophone = useCallback(async () => {
    // Prevent rapid clicking and multiple concurrent operations
    const now = Date.now();
    if (isStreamOperationInProgress || now - lastOperationTime.current < 1000) {
      console.log('Microphone toggle blocked - operation in progress or too rapid');
      return;
    }
    
    setIsStreamOperationInProgress(true);
    lastOperationTime.current = now;
    
    try {
      if (isMicOn) {
        // Turn off microphone
        cleanupStream(stream);
        setStream(null);
        setIsMicOn(false);
      } else {
        // Turn on microphone
        cleanupStream(stream);
        const newStream = await createMediaStream(true);
        setStream(newStream);
        setIsMicOn(true);
      }
    } catch (error) {
      console.error('Error toggling microphone:', error);
      alert('Unable to access microphone. Please check permissions.');
    } finally {
      setIsStreamOperationInProgress(false);
    }
  }, [isMicOn, stream, cleanupStream, createMediaStream, isStreamOperationInProgress]);

  const toggleMusic = () => {
    setIsMusicOn(!isMusicOn);
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseFloat(event.target.value);
    setMusicVolume(volume);
  };

  // Notify parent component when stream/state changes
  useEffect(() => {
    if (onStreamUpdate) {
      onStreamUpdate(isMicOn);
    }

    // Update media state via config (broadcasts to other participants if configured)
    config.onMediaStateChange?.(isMicOn);
  }, [isMicOn, onStreamUpdate, config]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupStream(stream);
    };
  }, []);

  const toggleWebcam = () => {
    setIsWebcamOn(!isWebcamOn);
  };

  return (
    <div className={`media-controls ${className}`}>
      {/* Media Controls */}
      <div className="flex items-center space-x-2 bg-slate-800/80 backdrop-blur-sm rounded-xl p-3 border border-slate-600/50">
        
        {/* Microphone Toggle */}
        <button
          onClick={toggleMicrophone}
          disabled={isStreamOperationInProgress}
          className={`btn btn-sm ${isMicOn ? 'btn-success' : 'btn-secondary'} ${isStreamOperationInProgress ? 'opacity-50 cursor-not-allowed' : ''} flex items-center space-x-1`}
          title={isStreamOperationInProgress ? 'Processing...' : (isMicOn ? 'Turn off microphone' : 'Turn on microphone')}
          data-testid="mic-toggle"
        >
          {isStreamOperationInProgress ? 
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> :
            (isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />)
          }
        </button>

        {isMicOn && (
          <div className="flex items-center space-x-1 text-green-400" data-testid="mic-status">
            <Mic className="w-3 h-3" />
            <span className="text-xs">Mic Active</span>
          </div>
        )}

        {/* Music Toggle */}
        <button
          onClick={toggleMusic}
          className={`btn btn-sm ${isMusicOn ? 'btn-warning' : 'btn-secondary'} flex items-center space-x-1`}
          title={isMusicOn ? 'Mute background music' : 'Play background music'}
        >
          {isMusicOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="btn btn-sm btn-secondary"
          title="Media settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Webcam Toggle */}
        <button
          onClick={toggleWebcam}
          className={`btn btn-sm ${isWebcamOn ? 'btn-success' : 'btn-secondary'} flex items-center space-x-1`}
          data-testid="webcam-toggle"
        >
          {isWebcamOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </button>

        {isWebcamOn && (
          <div className="flex items-center space-x-1 text-green-400" data-testid="webcam-status">
            <Video className="w-3 h-3" />
            <span className="text-xs">Camera Active</span>
          </div>
        )}
      </div>

      {/* Player Name Display */}
      <div className="mt-3">
        <div className="bg-slate-800/50 border border-slate-600/50 rounded-xl p-3">
          <div className="flex items-center space-x-2 text-slate-300">
            <User className="w-4 h-4" />
            <span>{isGamemaster ? '👑 Gamemaster' : playerName}</span>
            {isMicOn && (
              <div className="flex items-center space-x-1 text-green-400">
                <Mic className="w-3 h-3" />
                <span className="text-xs">Mic Active</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
            onClick={() => setShowSettings(false)}
          />
          
          {/* Settings Modal */}
          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-slate-800/95 backdrop-blur-sm border border-slate-600/50 rounded-xl p-4 min-w-80 z-[9999] shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-slate-200">🎛️ Audio Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Microphone Selection */}
              <div>
                <label className="text-sm text-slate-300">Microphone</label>
                <select
                  value={selectedMicrophone}
                  onChange={(e) => setSelectedMicrophone(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-slate-200"
                >
                  {availableDevices.microphones.map((microphone) => (
                    <option key={microphone.deviceId} value={microphone.deviceId}>
                      {microphone.label || `Microphone ${microphone.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Background Music Volume */}
              <div>
                <label className="text-sm text-slate-300">Background Music Volume</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={musicVolume}
                  onChange={handleVolumeChange}
                  className="w-full mt-1"
                />
                <div className="text-xs text-slate-400 mt-1">{Math.round(musicVolume * 100)}%</div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Background Music */}
      <audio
        ref={audioRef}
        src="/background-music.mp3"
        preload="metadata"
        onError={() => console.warn('Background music file not found - music features disabled')}
      />
    </div>
  );
};

export default MediaControls; 