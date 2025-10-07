# Bumper Balls Arena

A 3D multiplayer battle royale game where players bump each other off a floating platform! Built with **GameBuddies integration**, **webcam support**, **chat**, and **real-time physics**.

## 🎮 What's Included

This template provides a complete foundation for multiplayer games:

### Core Features
- ✅ **GameBuddies Integration** - Automatic room creation, streamer mode, return to lobby
- ✅ **Webcam System** - Full video chat with virtual backgrounds and face avatars
- ✅ **Mobile WebRTC** - TURN servers, iOS H.264 codec, mobile-optimized quality
- ✅ **Mobile Cellular Support** - Works on 4G/5G networks (with TURN credentials)
- ✅ **Chat System** - Real-time messaging with system notifications
- ✅ **Player Management** - Join, leave, kick, disconnect handling
- ✅ **Lobby System** - Room codes, host controls, settings management
- ✅ **Mobile Responsive** - Works great on phones and tablets
- ✅ **WebRTC** - Peer-to-peer video/audio with signaling server
- ✅ **TypeScript** - Fully typed client and server
- ✅ **Tailwind CSS** - Modern styling system

### Tech Stack
- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO, TypeScript
- **Webcam**: MediaPipe (AI backgrounds), Three.js (3D avatars), WebRTC
- **Deployment**: Ready for Render.com with reverse proxy support

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. **Clone/copy this template**
   ```bash
   cd C:\GamebuddiesTemplate
   ```

2. **Install dependencies**
   ```bash
   # Install server dependencies
   npm install

   # Install client dependencies
   cd client
   npm install
   cd ..
   ```

3. **Configure environment**

   **Server** - Copy `.env.example` to `.env`:
   ```env
   PORT=3001
   GAMEBUDDIES_CENTRAL_URL=https://gamebuddies.io
   GAMEBUDDIES_API_KEY=your_api_key_here
   GAME_ID=your-game-name
   CLIENT_URL=http://localhost:5173
   ```

   **Client** - Create `client/.env`:
   ```env
   VITE_BACKEND_URL=http://localhost:3001
   VITE_BASE_PATH=/

   # TURN Server Credentials (REQUIRED for mobile cellular networks)
   VITE_METERED_USERNAME=your_username_here
   VITE_METERED_PASSWORD=your_password_here
   ```

   **🔐 TURN Server Setup** (Required for Mobile Support)

   Mobile devices on 4G/5G cellular networks need TURN servers for WebRTC to work. Without TURN servers, mobile users on cellular networks cannot connect!

   **Get Free TURN Credentials:**
   1. Visit https://www.metered.ca/tools/openrelay/
   2. Click "Get Free TURN Credentials"
   3. Enter your email
   4. Copy the username and password
   5. Add to `client/.env` as shown above

   **Free Tier:** 500MB/month bandwidth, unlimited users, no credit card required

   **What works without TURN:**
   - ✅ Desktop-to-Desktop (WiFi)
   - ✅ Mobile-to-Desktop (WiFi)

   **What requires TURN:**
   - ⚠️ Mobile-to-Desktop (4G/5G cellular)
   - ⚠️ iOS Safari compatibility
   - ⚠️ Restrictive corporate networks

   For more details, see [docs/WEBRTC-MOBILE-FIXES.md](docs/WEBRTC-MOBILE-FIXES.md)

4. **Run development mode**
   ```bash
   npm run dev
   ```

   This runs both server (port 3001) and client (port 5173).

5. **Open your browser**
   - Navigate to http://localhost:5173
   - Create a room and start building your game!

## 📁 Project Structure

```
GamebuddiesTemplate/
├── client/                       # React frontend
│   ├── public/
│   │   ├── wasm/                # MediaPipe WASM files
│   │   └── models/              # AI models for webcam features
│   ├── src/
│   │   ├── adapters/
│   │   │   └── gameAdapter.ts   # Webcam config adapter
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx   # Chat UI
│   │   │   ├── GameComponent.tsx # 🎯 YOUR GAME GOES HERE
│   │   │   ├── Home.tsx         # Landing/join screen
│   │   │   ├── Lobby.tsx        # Lobby with settings
│   │   │   ├── PlayerList.tsx   # Player list with kick
│   │   │   └── WebcamDisplay.tsx # Webcam UI
│   │   ├── config/
│   │   │   └── WebcamConfig.tsx # Webcam system config
│   │   ├── contexts/
│   │   │   └── WebRTCContext.tsx # WebRTC state management
│   │   ├── services/
│   │   │   ├── gameBuddiesSession.ts # GameBuddies integration
│   │   │   ├── socketService.ts      # Socket.IO client
│   │   │   ├── virtualBackgroundService.ts # AI backgrounds
│   │   │   └── faceAvatarService.ts      # 3D avatars
│   │   ├── App.tsx              # Main app component
│   │   └── types.ts             # 🎯 ADD YOUR GAME TYPES HERE
│   └── package.json
├── server/
│   ├── services/
│   │   └── gameBuddiesService.ts # GameBuddies API
│   ├── utils/
│   │   └── validation.ts         # Input validation
│   ├── server.ts                 # 🎯 ADD YOUR GAME LOGIC HERE
│   └── types.ts                  # 🎯 ADD YOUR GAME TYPES HERE
├── docs/                         # Documentation
│   ├── QUICKSTART.md
│   ├── ADDING_GAME_LOGIC.md
│   ├── GAMEBUDDIES_INTEGRATION.md
│   └── WEBCAM_INTEGRATION.md
├── package.json
└── README.md
```

## 🎯 Building Your Game

### Step 1: Define Your Game State

Edit `client/src/types.ts` and `server/types.ts`:

```typescript
// Example: Trivia game
export interface GameData {
  currentQuestion: Question;
  currentRound: number;
  answers: Map<string, string>;
}

export interface Question {
  text: string;
  options: string[];
  correctAnswer: number;
}
```

### Step 2: Add Game Logic in Server

Edit `server/server.ts` and add your game event handlers:

```typescript
socket.on('game:submit-answer', (data: { roomCode: string; answer: string }) => {
  const lobby = lobbies.get(data.roomCode);
  // Process answer
  // Update game state
  // Emit updates to clients
  io.to(lobby.code).emit('game:update', { gameData: lobby.gameData });
});
```

### Step 3: Create Game UI

Edit `client/src/components/GameComponent.tsx`:

```typescript
// Add your game UI here
// - Display questions, cards, board, etc.
// - Handle player input
// - Listen for game updates
```

### Step 4: Test & Deploy

```bash
# Build for production
npm run build:client

# Deploy to Render.com or your hosting provider
```

## 📚 Documentation

- **[Quick Start Guide](docs/QUICKSTART.md)** - Get up and running
- **[Adding Game Logic](docs/ADDING_GAME_LOGIC.md)** - Step-by-step tutorial
- **[GameBuddies Integration](docs/GAMEBUDDIES_INTEGRATION.md)** - How it works
- **[Webcam Integration](docs/WEBCAM_INTEGRATION.md)** - Video chat features

## 🌟 Features in Detail

### GameBuddies Integration
- Automatic room creation from GameBuddies.io
- Streamer mode (hide room codes)
- Player status sync
- Return to lobby button
- Session management

### Webcam System
- Multi-user video chat
- Virtual backgrounds (AI-powered)
- 3D face avatars
- Device selection
- Audio processing
- Mobile support

### Chat System
- Real-time messaging
- System notifications
- Emoji picker
- Message history (100 messages)
- Auto-scroll

### Player Management
- Host controls
- Kick players
- Disconnect handling (30s grace period)
- Player list with scores
- Connection status

## 🔧 Customization

### Game Settings

Add your own settings in `types.ts`:

```typescript
export interface Settings {
  minPlayers: number;
  maxPlayers: number;
  // Your custom settings
  roundDuration: number;
  difficulty: 'easy' | 'medium' | 'hard';
}
```

### Styling

The template uses Tailwind CSS. Customize in:
- `client/tailwind.config.js` - Colors, fonts, etc.
- `client/src/App.css` - Layout and components
- `client/src/index.css` - Global styles

### Webcam Features

Customize webcam behavior in `client/src/adapters/gameAdapter.ts`:
- Turn indicators
- Lives display
- Voting system
- Custom player info

## 📝 Environment Variables

### Server (.env)
- `PORT` - Server port (default: 3001)
- `GAMEBUDDIES_CENTRAL_URL` - GameBuddies API URL
- `GAMEBUDDIES_API_KEY` - Your API key
- `GAME_ID` - Your game identifier
- `CLIENT_URL` - Frontend URL

### Client (.env)
- `VITE_BACKEND_URL` - Backend server URL
- `VITE_BASE_PATH` - Base path for deployment (e.g., `/your-game/`)

## 🚢 Deployment

This template is ready for deployment to Render.com with reverse proxy support:

1. Push to GitHub
2. Create new Web Service on Render.com
3. Add environment variables
4. Deploy!

The template handles subpath deployment (e.g., `gamebuddies.io/your-game/`) automatically.

## 🤝 Contributing

This is a template - customize it for your needs! Share your games with the community.

## 📄 License

ISC License - Free to use for your projects

## 🎮 Example Games Built With This Template

- ClueScale - Clue-based guessing game
- (Add your game here!)

## 💡 Tips

- Start with the `GameComponent.tsx` - that's where your game lives
- Use the chat for game announcements
- Leverage the player list for turn indicators
- Test with multiple browser windows
- The webcam system works great for social games!

## 🆘 Troubleshooting

### Build Issues
```bash
# Clear node_modules and reinstall
rm -rf node_modules client/node_modules
npm install
cd client && npm install
```

### WebRTC Issues
- Check firewall settings
- Enable camera/mic permissions
- Test on localhost first

### GameBuddies Issues
- Verify API key
- Check console for errors
- Test standalone mode first

---

**Ready to build your game?** Start with `docs/QUICKSTART.md`!
