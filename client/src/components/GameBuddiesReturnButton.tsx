import React, { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

interface GameBuddiesReturnButtonProps {
  roomCode: string;
  socket: Socket;
  isHost: boolean;
}

const GameBuddiesReturnButton: React.FC<GameBuddiesReturnButtonProps> = ({ roomCode, socket, isHost }) => {
  const [isReturning, setIsReturning] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Only host can see and use the return button
  if (!isHost && !isReturning) {
    return null;
  }

  useEffect(() => {
    const handleReturnRedirect = (data: { url: string }) => {
      console.log('[GameBuddies] Received return-redirect:', data);
      setIsReturning(true);

      // Countdown before redirect
      let count = 3;
      const interval = setInterval(() => {
        count--;
        setCountdown(count);

        if (count <= 0) {
          clearInterval(interval);
          window.location.href = data.url;
        }
      }, 1000);
    };

    socket.on('gamebuddies:return-redirect', handleReturnRedirect);

    return () => {
      socket.off('gamebuddies:return-redirect', handleReturnRedirect);
    };
  }, [socket]);

  const handleReturn = () => {
    console.log('[GameBuddies] Return button clicked');
    socket.emit('gamebuddies:return', {
      roomCode,
      mode: 'group',
      reason: 'user_initiated'
    });
  };

  if (isReturning) {
    return (
      <div
        className="gamebuddies-return"
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '20px',
          borderRadius: '10px',
          color: 'white',
          textAlign: 'center'
        }}
      >
        <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
          Returning to GameBuddies...
        </p>
        <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>
          {countdown}
        </p>
      </div>
    );
  }

  return (
    <div className="gamebuddies-return">
      <button
        onClick={handleReturn}
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          padding: '15px 30px',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)'
        }}
      >
        Return to GameBuddies
      </button>
    </div>
  );
};

export default GameBuddiesReturnButton;