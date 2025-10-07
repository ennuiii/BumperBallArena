// Basic validation utilities for GameBuddies template
// Add game-specific validation functions here

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

export function validatePlayerName(name: string): { valid: boolean; error?: string } {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Player name is required' };
  }

  const trimmed = name.trim();

  if (trimmed.length < 1 || trimmed.length > 20) {
    return { valid: false, error: 'Player name must be 1-20 characters' };
  }

  return { valid: true };
}

export function validateRoomCode(code: string): { valid: boolean; error?: string } {
  if (!code || code.trim().length === 0) {
    return { valid: false, error: 'Room code is required' };
  }

  const trimmed = code.trim().toUpperCase();

  if (trimmed.length < 4 || trimmed.length > 10) {
    return { valid: false, error: 'Room code must be 4-10 characters' };
  }

  // Only alphanumeric
  if (!/^[A-Z0-9]+$/.test(trimmed)) {
    return { valid: false, error: 'Room code must be alphanumeric' };
  }

  return { valid: true };
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude I, O, 0, 1
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function validateChatMessage(message: string): { valid: boolean; error?: string } {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message is required' };
  }

  const trimmed = message.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }

  if (trimmed.length > 500) {
    return { valid: false, error: 'Message too long (max 500 characters)' };
  }

  return { valid: true };
}
