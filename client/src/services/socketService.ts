import { io, Socket } from 'socket.io-client';

// Use environment variable in development, same origin in production (for GameBuddies reverse proxy)
const getServerUrl = (): string => {
  // If VITE_BACKEND_URL is explicitly set, use it
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }

  // In production, use same origin (works with reverse proxy)
  if (import.meta.env.PROD) {
    return window.location.origin;
  }

  // Development fallback
  return 'http://localhost:3001';
};

const SERVER_URL = getServerUrl();

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10; // Increased for Render.com cold starts

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    console.log('[Socket] Connecting to server:', SERVER_URL);

    this.socket = io(SERVER_URL, {
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 2000, // Increased from 1000ms for cold starts
      reconnectionDelayMax: 10000, // Increased from 5000ms for cold starts
      timeout: 60000, // 60 second timeout to handle Render.com free tier cold starts
      transports: ['polling', 'websocket'], // Try polling first (more reliable for cold starts)
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected:', this.socket?.id);
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('reconnect_attempt', () => {
      this.reconnectAttempts++;
      console.log(`[Socket] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed');
    });

    this.socket.on('error', (error) => {
      console.error('[Socket] Error:', error);
    });

    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('[Socket] Disconnected');
    }
  }

  // Emit events
  emit(event: string, data?: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.error('[Socket] Cannot emit - not connected');
    }
  }

  // Listen to events
  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }
}

export default new SocketService();