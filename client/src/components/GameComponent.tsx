import React, { useState, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import type { Lobby, BumperBallsGameData, MovementInput, PlayerBall } from '../types';
import type { Socket } from 'socket.io-client';
import * as THREE from 'three';

/**
 * Bumper Balls Arena - 144fps Optimized 3D Game
 *
 * High-performance multiplayer battle game targeting 144fps:
 * - Beautiful PBR materials with metalness & emissive properties
 * - Bloom effects for stunning glow
 * - High-quality geometry (32-segment spheres, 48-segment platform)
 * - Dramatic lighting without shadows
 * - High-performance rendering mode
 *
 * Performance optimizations for 144fps:
 * - ❌ No shadow maps (major FPS boost)
 * - ❌ No reflections/MeshReflectorMaterial (major FPS boost)
 * - ✅ Bloom + Vignette post-processing
 * - ✅ 32-segment spheres (balanced quality/performance)
 * - ✅ Antialiasing enabled for crisp visuals
 * - ✅ High-performance power preference
 * - ✅ Responsive layout for all screen sizes
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM_RADIUS = 10;
const BALL_RADIUS = 0.5;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface GameComponentProps {
  lobby: Lobby;
  socket: Socket;
}

const GameComponent: React.FC<GameComponentProps> = ({ lobby, socket }) => {
  const [gameData, setGameData] = useState<BumperBallsGameData | null>(lobby.gameData || null);
  const lastSentInput = useRef<MovementInput>({ x: 0, z: 0, sprint: false });
  const keysPressed = useRef<Set<string>>(new Set());

  // Music controls
  const [volume, setVolume] = useState(20); // 0-100, default to 20% for comfortable starting volume
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Use socket.id as fallback if lobby.mySocketId is not set
  const mySocketId = lobby.mySocketId || socket.id || '';
  const currentPlayer = lobby.players.find(p => p.socketId === mySocketId);
  const isHost = currentPlayer?.isHost || false;

  // ============================================================================
  // SOCKET EVENT LISTENERS
  // ============================================================================

  useEffect(() => {
    socket.on('bumper:state-update', (data: { gameData: BumperBallsGameData }) => {
      console.log('[GameComponent] Received state update:', data.gameData.status, 'countdown:', data.gameData.countdownValue);
      setGameData(data.gameData);
    });

    socket.on('bumper:player-eliminated', (data: { socketId: string; playerName: string }) => {
      console.log(`[Bumper] ${data.playerName} was eliminated!`);
    });

    socket.on('bumper:game-end', (data: { winnerId: string; winnerName: string; finalScores?: any; gameData?: BumperBallsGameData }) => {
      console.log(`[Bumper] ${data.winnerName} wins!`, data);

      // Update gameData with the ended state if provided
      if (data.gameData) {
        setGameData(data.gameData);
      }
    });

    return () => {
      socket.off('bumper:state-update');
      socket.off('bumper:player-eliminated');
      socket.off('bumper:game-end');
    };
  }, [socket]);

  // ============================================================================
  // MUSIC CONTROLS
  // ============================================================================

  // Initialize audio element
  useEffect(() => {
    if (!audioRef.current) {
      // Use BASE_URL to ensure correct path when behind proxy (e.g., /bumperball/)
      const musicPath = `${import.meta.env.BASE_URL}music/Bumper Ball Beatdown.mp3`;
      console.log('[Music] Loading from path:', musicPath);
      console.log('[Music] BASE_URL:', import.meta.env.BASE_URL);

      const audio = new Audio(musicPath);
      audio.loop = true;
      audio.volume = volume / 100;

      // Add event listeners to debug loading
      audio.addEventListener('loadeddata', () => {
        console.log('[Music] Audio loaded successfully');
      });
      audio.addEventListener('error', (e) => {
        console.error('[Music] Failed to load audio:', {
          error: e,
          src: audio.src,
          networkState: audio.networkState,
          readyState: audio.readyState
        });
      });

      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Control music playback based on game status
  useEffect(() => {
    if (!audioRef.current || !gameData) return;

    if (gameData.status === 'playing') {
      console.log('[Music] Attempting to play. Audio src:', audioRef.current.src);
      audioRef.current.play().catch(err => {
        console.error('[Music] Autoplay prevented:', {
          error: err,
          name: err.name,
          message: err.message,
          src: audioRef.current?.src,
          networkState: audioRef.current?.networkState,
          readyState: audioRef.current?.readyState
        });
      });
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [gameData?.status]);

  // Update volume when volume or mute changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  // Debug logging for player positions
  useEffect(() => {
    if (!gameData || gameData.status !== 'playing') return;

    const debugInterval = setInterval(() => {
      const myPlayer = gameData.players.find(p => p.socketId === mySocketId);
      if (myPlayer) {
        const distFromCenter = Math.sqrt(myPlayer.position.x ** 2 + myPlayer.position.z ** 2);
        console.log(`[Client] Me: Y=${myPlayer.position.y.toFixed(2)}, Dist=${distFromCenter.toFixed(2)}, OnPlatform=${distFromCenter <= 10}`);
      }
    }, 2000);

    return () => clearInterval(debugInterval);
  }, [gameData, mySocketId]);

  // ============================================================================
  // KEYBOARD CONTROLS
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key.toLowerCase());
      updateInputFromKeys();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key.toLowerCase());
      updateInputFromKeys();
    };

    const updateInputFromKeys = () => {
      const keys = keysPressed.current;
      let x = 0;
      let z = 0;

      if (keys.has('w') || keys.has('arrowup')) z -= 1;
      if (keys.has('s') || keys.has('arrowdown')) z += 1;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;

      const sprint = keys.has('shift');

      if (x !== 0 && z !== 0) {
        const magnitude = Math.sqrt(x * x + z * z);
        x /= magnitude;
        z /= magnitude;
      }

      const newInput = { x, z, sprint };

      if (
        newInput.x !== lastSentInput.current.x ||
        newInput.z !== lastSentInput.current.z ||
        newInput.sprint !== lastSentInput.current.sprint
      ) {
        socket.emit('bumper:move', {
          roomCode: lobby.code,
          movement: newInput,
        });
        lastSentInput.current = newInput;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [socket, lobby.code]);

  // ============================================================================
  // GAMEPAD/CONTROLLER SUPPORT
  // ============================================================================

  useEffect(() => {
    let animationFrameId: number;
    const DEADZONE = 0.15; // Ignore small stick movements

    const pollGamepad = () => {
      // IMPORTANT: Only process gamepad input if this tab/window is focused
      // This prevents controller from controlling multiple tabs simultaneously
      if (!document.hasFocus()) {
        animationFrameId = requestAnimationFrame(pollGamepad);
        return;
      }

      const gamepads = navigator.getGamepads();
      let gamepadInput = { x: 0, z: 0, sprint: false };

      // Check all connected gamepads (usually first one is index 0)
      for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i];
        if (!gamepad) continue;

        // Left stick: axes[0] = horizontal, axes[1] = vertical
        let x = gamepad.axes[0] || 0;
        let z = gamepad.axes[1] || 0;

        // Apply deadzone
        if (Math.abs(x) < DEADZONE) x = 0;
        if (Math.abs(z) < DEADZONE) z = 0;

        // Normalize if magnitude > 1 (stick pushed diagonally)
        const magnitude = Math.sqrt(x * x + z * z);
        if (magnitude > 1) {
          x /= magnitude;
          z /= magnitude;
        }

        // Sprint: Right Trigger (axes[7] or button 7) or A button (button 0)
        // Xbox: RT = button 7, A = button 0
        // PlayStation: R2 = button 7, X = button 0
        const rightTrigger = gamepad.buttons[7]?.pressed || false;
        const aButton = gamepad.buttons[0]?.pressed || false;
        const sprint = rightTrigger || aButton;

        // If this gamepad has input, use it
        if (x !== 0 || z !== 0 || sprint) {
          gamepadInput = { x, z, sprint };
          break; // Use first active gamepad
        }
      }

      // Only send if gamepad has input OR if we need to clear previous gamepad input
      if (
        gamepadInput.x !== 0 ||
        gamepadInput.z !== 0 ||
        gamepadInput.sprint ||
        (lastSentInput.current.x !== 0 && gamepadInput.x === 0) ||
        (lastSentInput.current.z !== 0 && gamepadInput.z === 0)
      ) {
        // Merge with keyboard input (keyboard takes priority if both are active)
        const keys = keysPressed.current;
        let finalX = gamepadInput.x;
        let finalZ = gamepadInput.z;
        let finalSprint = gamepadInput.sprint;

        // Keyboard overrides gamepad
        if (keys.has('w') || keys.has('s') || keys.has('a') || keys.has('d') ||
            keys.has('arrowup') || keys.has('arrowdown') || keys.has('arrowleft') || keys.has('arrowright')) {
          finalX = 0;
          finalZ = 0;
          if (keys.has('w') || keys.has('arrowup')) finalZ -= 1;
          if (keys.has('s') || keys.has('arrowdown')) finalZ += 1;
          if (keys.has('a') || keys.has('arrowleft')) finalX -= 1;
          if (keys.has('d') || keys.has('arrowright')) finalX += 1;

          // Normalize diagonal keyboard input
          if (finalX !== 0 && finalZ !== 0) {
            const mag = Math.sqrt(finalX * finalX + finalZ * finalZ);
            finalX /= mag;
            finalZ /= mag;
          }
        }

        if (keys.has('shift')) {
          finalSprint = true;
        }

        const newInput = { x: finalX, z: finalZ, sprint: finalSprint };

        // Only send if changed
        if (
          newInput.x !== lastSentInput.current.x ||
          newInput.z !== lastSentInput.current.z ||
          newInput.sprint !== lastSentInput.current.sprint
        ) {
          socket.emit('bumper:move', {
            roomCode: lobby.code,
            movement: newInput,
          });
          lastSentInput.current = newInput;
        }
      }

      animationFrameId = requestAnimationFrame(pollGamepad);
    };

    // Start polling
    animationFrameId = requestAnimationFrame(pollGamepad);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [socket, lobby.code]);


  // ============================================================================
  // RENDER
  // ============================================================================

  if (!gameData) {
    return (
      <div className="container">
        <h1>Bumper Balls Arena</h1>
        <p>Loading game...</p>
      </div>
    );
  }

  const myBall = gameData.players.find(p => p.socketId === mySocketId);
  const isEliminated = myBall?.isEliminated || false;

  // Debug logging - show host status
  if (gameData.status === 'ended') {
    console.log('[Victory Screen Debug]', {
      isHost,
      mySocketId,
      lobbyMySocketId: lobby.mySocketId,
      socketId: socket.id,
      hostId: lobby.hostId,
      currentPlayer: currentPlayer,
      allPlayers: lobby.players.map(p => ({ socketId: p.socketId, name: p.name, isHost: p.isHost })),
    });
  }

  return (
    <div style={{
      height: '100%',
      width: '100%',
      position: 'relative',
      background: '#000',
      borderRadius: '8px',
      overflow: 'hidden',
      minHeight: '600px',
    }}>
      {/* THREE.JS CANVAS - Optimized for 144fps with great visuals */}
      <Canvas
        frameloop="always"
        dpr={[1, 2]}
        camera={{ position: [15, 15, 15], fov: 50 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          powerPreference: "high-performance",
        }}
        style={{
          width: '100%',
          height: '100%',
        }}
      >
        {/* LIGHTING - Beautiful but performant */}
        <ambientLight intensity={0.3} />

        {/* Main directional light (no shadows for performance) */}
        <directionalLight
          position={[20, 30, 20]}
          intensity={2}
        />

        {/* Rim lights for dramatic effect */}
        <spotLight position={[-15, 20, -15]} intensity={1.2} angle={0.3} penumbra={0.5} color="#667eea" />
        <spotLight position={[15, 20, 15]} intensity={1.2} angle={0.3} penumbra={0.5} color="#764ba2" />

        {/* Point light for ball highlights */}
        <pointLight position={[0, 5, 0]} intensity={0.8} color="#ffffff" />

        {/* ENVIRONMENT */}
        <Environment preset="night" />

        {/* ARENA */}
        <Platform radius={PLATFORM_RADIUS} />

        {/* PLAYER BALLS */}
        {gameData.players.map(player => (
          <PlayerBallMesh
            key={player.socketId}
            player={player}
            isMe={player.socketId === lobby.mySocketId}
          />
        ))}

        {/* CAMERA CONTROLS */}
        <OrbitControls
          enabled={false}
          enableRotate={false}
          enablePan={false}
          enableZoom={false}
        />

        {/* POST-PROCESSING EFFECTS - Balanced for quality and performance */}
        <EffectComposer multisampling={2}>
          {/* Bloom for glow effects */}
          <Bloom
            intensity={1.5}
            luminanceThreshold={0.3}
            luminanceSmoothing={0.9}
            mipmapBlur
          />

          {/* Vignette for cinematic look */}
          <Vignette
            offset={0.3}
            darkness={0.6}
            eskil={false}
            blendFunction={BlendFunction.NORMAL}
          />
        </EffectComposer>
      </Canvas>

      {/* UI OVERLAY */}
      <GameUI
        gameData={gameData}
        lobby={lobby}
        isEliminated={isEliminated}
        isHost={isHost}
        socket={socket}
        mySocketId={mySocketId}
        volume={volume}
        isMuted={isMuted}
        setVolume={setVolume}
        setIsMuted={setIsMuted}
      />
    </div>
  );
};

// ============================================================================
// PLATFORM COMPONENT
// ============================================================================

const Platform: React.FC<{ radius: number }> = ({ radius }) => {
  return (
    <group>
      {/* Main Platform - No reflections but still beautiful */}
      <mesh position={[0, -0.25, 0]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[radius, radius, 0.5, 48]} />
        <meshStandardMaterial
          color="#1a202c"
          metalness={0.7}
          roughness={0.3}
          emissive="#0a0a14"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* Glowing Platform Edge Ring */}
      <EdgeRing radius={radius} />

      {/* Holographic Grid */}
      <HolographicGrid radius={radius} />
    </group>
  );
};

// ============================================================================
// GLOWING EDGE RING
// ============================================================================

const EdgeRing: React.FC<{ radius: number }> = ({ radius }) => {
  return (
    <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[radius, 0.15, 16, 100]} />
      <meshStandardMaterial
        color="#667eea"
        metalness={0.9}
        roughness={0.1}
        emissive="#667eea"
        emissiveIntensity={0.6}
      />
    </mesh>
  );
};

// ============================================================================
// HOLOGRAPHIC GRID
// ============================================================================

const HolographicGrid: React.FC<{ radius: number }> = ({ radius }) => {
  const gridRef = useRef<THREE.LineSegments>(null);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);

  useEffect(() => {
    if (gridRef.current) {
      const positions: number[] = [];

      // Radial lines
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        positions.push(0, 0.01, 0);
        positions.push(
          Math.cos(angle) * radius,
          0.01,
          Math.sin(angle) * radius
        );
      }

      // Circular rings - Good quality
      for (let r = radius / 4; r < radius; r += radius / 4) {
        for (let i = 0; i < 64; i++) {
          const angle1 = (i / 64) * Math.PI * 2;
          const angle2 = ((i + 1) / 64) * Math.PI * 2;

          positions.push(
            Math.cos(angle1) * r,
            0.01,
            Math.sin(angle1) * r
          );
          positions.push(
            Math.cos(angle2) * r,
            0.01,
            Math.sin(angle2) * r
          );
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
      );

      gridRef.current.geometry = geometry;
    }
  }, [radius]);


  return (
    <lineSegments ref={gridRef}>
      <lineBasicMaterial
        ref={materialRef}
        color="#667eea"
        opacity={0.5}
        transparent
      />
    </lineSegments>
  );
};

// ============================================================================
// PLAYER BALL COMPONENT
// ============================================================================

const PlayerBallMesh: React.FC<{ player: PlayerBall; isMe: boolean }> = ({
  player,
  isMe,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const targetPosition = useRef(new THREE.Vector3());
  const currentPosition = useRef(new THREE.Vector3());
  const lastUpdateTime = useRef(Date.now());

  useEffect(() => {
    targetPosition.current.set(
      player.position.x,
      player.position.y,
      player.position.z
    );
    lastUpdateTime.current = Date.now();
  }, [player.position]);

  useFrame(() => {
    if (meshRef.current && glowRef.current) {
      // Time-based interpolation for frame-rate independent smoothing
      // Higher alpha = faster interpolation (good for 60Hz server updates)
      const timeSinceUpdate = Date.now() - lastUpdateTime.current;

      // Adaptive lerp: faster interpolation for recent updates, slower for older ones
      // This prevents stuttering while maintaining smoothness
      const baseAlpha = 0.3; // Increased from 0.2 for 60Hz server updates
      const timeDecay = Math.min(timeSinceUpdate / 100, 1.0); // Normalize to 100ms
      const alpha = Math.min(baseAlpha * (1 + timeDecay), 0.9); // Cap at 0.9 to prevent overshooting

      currentPosition.current.lerp(targetPosition.current, alpha);
      meshRef.current.position.copy(currentPosition.current);
      glowRef.current.position.copy(currentPosition.current);

      // Dynamic rotation based on movement
      meshRef.current.rotation.x += 0.02;
      meshRef.current.rotation.z += 0.02;
    }
  });

  if (player.isEliminated) {
    return null;
  }

  return (
    <group>
      {/* Main Ball - High quality geometry */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[BALL_RADIUS, 32, 32]} />
        <meshStandardMaterial
          color={player.color}
          metalness={0.7}
          roughness={0.2}
          emissive={player.color}
          emissiveIntensity={isMe ? 0.8 : 0.5}
          envMapIntensity={1.5}
        />
      </mesh>

      {/* Outer glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[BALL_RADIUS + 0.15, 24, 24]} />
        <meshBasicMaterial
          color={player.color}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Name Label */}
      <Html
        position={[player.position.x, player.position.y + 1.5, player.position.z]}
        center
        distanceFactor={10}
        style={{
          background: isMe ? 'rgba(255, 215, 0, 0.9)' : 'rgba(0, 0, 0, 0.7)',
          padding: '5px 12px',
          borderRadius: '8px',
          color: isMe ? '#000' : '#fff',
          fontWeight: 'bold',
          fontSize: '28px',
          border: isMe ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.3)',
          backdropFilter: 'blur(10px)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      >
        {player.name}
      </Html>
    </group>
  );
};

// ============================================================================
// GAME UI OVERLAY
// ============================================================================

const GameUI: React.FC<{
  gameData: BumperBallsGameData;
  lobby: Lobby;
  isEliminated: boolean;
  isHost: boolean;
  socket: Socket;
  mySocketId: string;
  volume: number;
  isMuted: boolean;
  setVolume: (vol: number) => void;
  setIsMuted: (muted: boolean) => void;
}> = ({ gameData, lobby, isEliminated, isHost, socket, mySocketId, volume, isMuted, setVolume, setIsMuted }) => {
  const myBall = gameData.players.find(p => p.socketId === mySocketId);

  return (
    <>
      {/* Countdown */}
      {gameData.status === 'countdown' && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: '180px',
            fontWeight: 'bold',
            color: '#FFF',
            textShadow: '0 0 40px rgba(102, 126, 234, 0.8), 0 0 80px rgba(102, 126, 234, 0.6)',
            zIndex: 100,
            fontFamily: 'Arial Black, sans-serif',
            animation: 'pulse 1s infinite',
          }}
        >
          {gameData.countdownValue}
        </div>
      )}

      {/* Top Bar - Game Info */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          right: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'start',
          zIndex: 10,
        }}
      >
        {/* Players Alive */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%)',
            padding: '15px 25px',
            borderRadius: '15px',
            color: '#FFF',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ fontSize: '14px', opacity: 0.9, fontWeight: 'bold' }}>PLAYERS REMAINING</div>
          <div style={{ fontSize: '48px', fontWeight: 'bold', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
            {gameData.alivePlayers.length}
          </div>
        </div>

        {/* My Stamina */}
        {myBall && !myBall.isEliminated && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(20, 20, 40, 0.8) 100%)',
              padding: '15px 25px',
              borderRadius: '15px',
              color: '#FFF',
              minWidth: '200px',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ fontSize: '14px', opacity: 0.9, fontWeight: 'bold', marginBottom: '8px' }}>STAMINA</div>
            <div style={{ background: 'rgba(255,255,255,0.1)', height: '16px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
              <div
                style={{
                  width: `${myBall.stamina}%`,
                  height: '100%',
                  background: myBall.stamina > 30
                    ? 'linear-gradient(90deg, #44FF44 0%, #22DD22 100%)'
                    : 'linear-gradient(90deg, #FF4444 0%, #DD2222 100%)',
                  borderRadius: '8px',
                  transition: 'width 0.3s, background 0.3s',
                  boxShadow: `0 0 20px ${myBall.stamina > 30 ? '#44FF44' : '#FF4444'}`,
                }}
              />
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '5px', textAlign: 'center' }}>
              {Math.round(myBall.stamina)}%
            </div>

            {/* Music Controls */}
            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
              <div style={{ fontSize: '12px', opacity: 0.7, fontWeight: 'bold', marginBottom: '8px', textAlign: 'center' }}>MUSIC</div>

              {/* Mute Button */}
              <button
                onClick={() => setIsMuted(!isMuted)}
                style={{
                  width: '100%',
                  padding: '8px',
                  marginBottom: '8px',
                  background: isMuted
                    ? 'linear-gradient(90deg, #FF4444 0%, #DD2222 100%)'
                    : 'linear-gradient(90deg, #44FF44 0%, #22DD22 100%)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  color: '#FFF',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {isMuted ? '🔇 UNMUTE' : '🔊 MUTE'}
              </button>

              {/* Volume Slider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '16px' }}>🔉</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  style={{
                    flex: 1,
                    height: '6px',
                    borderRadius: '3px',
                    background: `linear-gradient(to right, #44FF44 0%, #44FF44 ${volume}%, rgba(255,255,255,0.2) ${volume}%, rgba(255,255,255,0.2) 100%)`,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: '14px', fontWeight: 'bold', minWidth: '35px', textAlign: 'right' }}>{volume}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Eliminated Overlay - Top Left Corner */}
      {isEliminated && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.85) 0%, rgba(20, 0, 0, 0.85) 100%)',
            padding: '25px 30px',
            borderRadius: '15px',
            textAlign: 'left',
            color: '#FFF',
            zIndex: 100,
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255, 68, 68, 0.5)',
            boxShadow: '0 8px 24px rgba(255, 68, 68, 0.3)',
            maxWidth: '300px',
          }}
        >
          <h2 style={{ fontSize: '32px', marginBottom: '10px', color: '#FF4444', textShadow: '0 0 20px rgba(255, 68, 68, 0.8)' }}>
            ELIMINATED!
          </h2>
          <p style={{ fontSize: '18px', opacity: 0.9, marginBottom: '8px' }}>
            You finished #{gameData.eliminationOrder.indexOf(mySocketId) + 1}
          </p>
          <p style={{ opacity: 0.7, fontSize: '14px' }}>👁️ Spectating the arena...</p>
        </div>
      )}

      {/* Victory Screen */}
      {gameData.status === 'ended' && gameData.winnerId && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.95) 0%, rgba(20, 20, 40, 0.95) 100%)',
            padding: '50px',
            borderRadius: '25px',
            textAlign: 'center',
            color: '#FFF',
            zIndex: 100,
            minWidth: '500px',
            backdropFilter: 'blur(20px)',
            border: '2px solid rgba(255, 215, 0, 0.5)',
            boxShadow: '0 20px 60px rgba(255, 215, 0, 0.4)',
          }}
        >
          <h2 style={{
            fontSize: '72px',
            marginBottom: '30px',
            color: '#FFD700',
            textShadow: '0 0 40px rgba(255, 215, 0, 0.8), 0 0 80px rgba(255, 215, 0, 0.6)',
            fontFamily: 'Arial Black, sans-serif',
          }}>
            {gameData.winnerId === mySocketId ? '🏆 VICTORY! 🏆' : 'GAME OVER'}
          </h2>
          <p style={{ fontSize: '32px', marginBottom: '40px', fontWeight: 'bold' }}>
            {gameData.players.find(p => p.socketId === gameData.winnerId)?.name} WINS!
          </p>

          {/* Final Rankings */}
          <div style={{ marginTop: '30px' }}>
            <h3 style={{ fontSize: '24px', marginBottom: '20px', opacity: 0.8 }}>FINAL RANKINGS</h3>
            {gameData.players
              .sort((a, b) => {
                // Winner (not eliminated) comes first
                if (a.isEliminated && !b.isEliminated) return 1;
                if (!a.isEliminated && b.isEliminated) return -1;
                // For eliminated players, sort by elimination order (later = better)
                const aIndex = gameData.eliminationOrder.indexOf(a.socketId);
                const bIndex = gameData.eliminationOrder.indexOf(b.socketId);
                return bIndex - aIndex;
              })
              .map((player, index) => (
                <div
                  key={player.socketId}
                  style={{
                    padding: '15px 20px',
                    margin: '10px 0',
                    background: index === 0
                      ? 'linear-gradient(90deg, rgba(255, 215, 0, 0.3) 0%, rgba(255, 215, 0, 0.1) 100%)'
                      : 'rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '18px',
                    fontWeight: index < 3 ? 'bold' : 'normal',
                  }}
                >
                  <span style={{ color: index === 0 ? '#FFD700' : '#FFF' }}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`} {player.name}
                  </span>
                  <span>{player.isEliminated ? 'Eliminated' : 'Winner'}</span>
                </div>
              ))}
          </div>

          {/* Game End Buttons - Always show for debugging */}
          <div style={{ marginTop: '40px', display: 'flex', gap: '20px', justifyContent: 'center' }}>
            {isHost ? (
              <>
                <button
                  onClick={() => {
                    console.log('[Bumper] Restart button clicked, emitting bumper:restart', { roomCode: lobby.code, socketId: socket.id, isHost });
                    socket.emit('bumper:restart', { roomCode: lobby.code });
                  }}
                  style={{
                    padding: '15px 40px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, #44FF44 0%, #22DD22 100%)',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderRadius: '12px',
                    color: '#000',
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(68, 255, 68, 0.4)',
                  }}
                >
                  🔄 Restart Game
                </button>
                <button
                  onClick={() => {
                    console.log('[Bumper] Back to Lobby button clicked, emitting game:restart', { roomCode: lobby.code, socketId: socket.id, isHost });
                    socket.emit('game:restart', { roomCode: lobby.code });
                  }}
                  style={{
                    padding: '15px 40px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.9) 0%, rgba(118, 75, 162, 0.9) 100%)',
                    border: '2px solid rgba(255,255,255,0.3)',
                    borderRadius: '12px',
                    color: '#FFF',
                    cursor: 'pointer',
                    boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
                  }}
                >
                  🏠 Back to Lobby
                </button>
              </>
            ) : (
              <div style={{ color: '#FFF', opacity: 0.5, fontSize: '16px' }}>
                Waiting for host to restart or return to lobby...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls Help */}
      {gameData.status === 'playing' && !isEliminated && (
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: 'linear-gradient(135deg, rgba(0, 0, 0, 0.8) 0%, rgba(20, 20, 40, 0.8) 100%)',
            padding: '20px',
            borderRadius: '15px',
            color: '#FFF',
            fontSize: '16px',
            zIndex: 10,
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '14px', opacity: 0.7 }}>KEYBOARD</div>
          <div style={{ marginBottom: '4px' }}><strong>WASD</strong> or <strong>Arrows</strong> - Move</div>
          <div style={{ marginBottom: '12px' }}><strong>Shift</strong> - Sprint</div>
          <div style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '14px', opacity: 0.7 }}>CONTROLLER</div>
          <div style={{ marginBottom: '4px' }}><strong>Left Stick</strong> - Move</div>
          <div><strong>RT / A Button</strong> - Sprint</div>
        </div>
      )}


      {/* Add CSS animation for pulse effect */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.1); }
        }
      `}</style>
    </>
  );
};

export default GameComponent;
