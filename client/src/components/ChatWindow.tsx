import React, { useState, useEffect, useRef } from 'react';
import EmojiPicker, { type EmojiClickData, Theme } from 'emoji-picker-react';
import type { Socket } from 'socket.io-client';
import type { ChatMessage } from '../types';
import './ChatWindow.css';

interface ChatWindowProps {
  roomCode: string;
  socket: Socket;
  messages: ChatMessage[];
}

const ChatWindow: React.FC<ChatWindowProps> = ({ roomCode, socket, messages }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    } else {
      setUnreadCount((prev) => prev + 1);
    }
  }, [messages, isOpen]);

  // Focus input when opening chat
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setUnreadCount(0);
    }
  }, [isOpen]);

  const handleSendMessage = () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    socket.emit('chat:send-message', {
      roomCode,
      message: trimmed,
    });

    setMessage('');
    setShowEmojiPicker(false);
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  if (!isOpen) {
    return (
      <div className="chat-minimized" onClick={() => setIsOpen(true)}>
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {unreadCount > 0 && <div className="unread-badge">{unreadCount}</div>}
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <h3>Chat</h3>
        <button className="minimize-button" onClick={() => setIsOpen(false)}>
          −
        </button>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-message ${msg.isSystem ? 'system-message' : ''}`}
          >
            {!msg.isSystem && (
              <div className="message-header">
                <span className="message-sender">{msg.playerName}</span>
                <span className="message-time">{formatTimestamp(msg.timestamp)}</span>
              </div>
            )}
            <div className="message-content">{msg.message}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        {showEmojiPicker && (
          <div className="emoji-picker-container">
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              theme={Theme.DARK}
              width={300}
              height={350}
            />
          </div>
        )}

        <div className="chat-input-wrapper">
          <button
            className="emoji-button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            type="button"
          >
            😀
          </button>
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            maxLength={500}
            className="chat-input"
          />
          <button
            className="send-button"
            onClick={handleSendMessage}
            disabled={!message.trim()}
            type="button"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
