# Quick Start Guide

Get your game up and running in 5 minutes!

## Installation

1. **Copy the template**
   ```bash
   cp -r GamebuddiesTemplate MyAwesomeGame
   cd MyAwesomeGame
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open browser**
   - Go to http://localhost:5173
   - Create a room
   - Open another tab and join with the room code

## First Steps

### 1. Customize Game Name

**client/src/components/Lobby.tsx**:
```typescript
<h1>Your Game Name</h1> // Line 93
```

**client/src/components/GameComponent.tsx**:
```typescript
<h1>Your Game Name</h1> // Line 104
```

### 2. Add Your Game Types

**client/src/types.ts** and **server/types.ts**:
```typescript
export interface GameData {
  // Replace this with your game state
  currentRound: number;
  // ... your fields
}
```

### 3. Start Building

Open `client/src/components/GameComponent.tsx` - this is where your game UI goes!

## Next Steps

- Read [ADDING_GAME_LOGIC.md](./ADDING_GAME_LOGIC.md) for a detailed tutorial
- Explore the example game component
- Test the webcam and chat features
- Customize the lobby settings

## Common Tasks

### Add a Game Setting
1. Add to `Settings` interface in `types.ts`
2. Add UI in `Lobby.tsx` settings panel
3. Use in your game logic

### Add a Game Event
1. Add event handler in `server/server.ts`
2. Emit from client in `GameComponent.tsx`
3. Listen for updates in `useEffect`

### Customize Colors
Edit `client/tailwind.config.js`:
```javascript
colors: {
  'primary': '#your-color',
}
```

## Testing

### Local Testing
- Open multiple browser tabs
- Use different browsers (Chrome, Firefox)
- Test on mobile (use your local IP)

### With GameBuddies
1. Get API key from GameBuddies team
2. Add to `.env`: `GAMEBUDDIES_API_KEY=your_key`
3. Test integration

## Troubleshooting

### "Cannot find module"
```bash
cd client && npm install
```

### Webcam not working
- Allow camera/mic permissions
- Check HTTPS (required for webcam on non-localhost)

### Socket connection failed
- Check `VITE_BACKEND_URL` in `client/.env`
- Ensure server is running on port 3001

---

**Next:** [Adding Game Logic →](./ADDING_GAME_LOGIC.md)
