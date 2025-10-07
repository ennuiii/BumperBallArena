# Space Invaders Battle 🚀

A competitive multiplayer space shooter where players control their own ships and compete for the highest score!

## 🎮 Game Overview

Space Invaders Battle is a modern twist on the classic arcade game. Multiple players share the same battlefield, shooting waves of alien invaders while competing for the highest score. Watch out - friendly fire is off, but aliens drop power-ups that can give you an edge!

## 🎯 How to Play

### Objective
Destroy as many alien invaders as possible before they reach the bottom. The player with the highest score when all waves are cleared (or time runs out) wins!

### Controls
- **Arrow Keys / A-D**: Move your ship left and right
- **Spacebar**: Fire your laser
- **Touch/Click**: Tap sides of screen to move (mobile)

### Game Features
- **Multiplayer Competition**: See other players' ships in real-time
- **Power-ups**:
  - 🔫 Rapid Fire - Shoot faster for 10 seconds
  - 💥 Multi-shot - Fire 3 bullets at once for 10 seconds
  - ⭐ Score Multiplier - 2x points for 10 seconds
  - 🛡️ Shield - Invincibility for 5 seconds
- **Wave System**: Aliens get faster and more numerous each wave
- **Real-time Scoring**: See everyone's scores update live
- **Mobile Responsive**: Playable on phones and tablets

### Scoring
- Small alien: 10 points
- Medium alien: 20 points
- Large alien: 30 points
- UFO (rare): 100 points
- Power-up collection: 5 points
- Wave completion bonus: 50 points × wave number

## 🏗️ Implementation Guide

### 1. Client Types (`client-types.ts`)
Add to `client/src/types.ts`:
- `GameData` interface with game state
- `PlayerShip`, `Alien`, `Bullet`, `PowerUp` interfaces
- Power-up types and game constants

### 2. Server Types (`server-types.ts`)
Add to `server/types.ts`:
- Same interfaces as client for consistency
- Additional server-only state management types

### 3. Game Component (`GameComponent.tsx`)
Replace `client/src/components/GameComponent.tsx` with the provided implementation:
- Canvas-based game rendering
- Keyboard/touch controls
- Animation loop using requestAnimationFrame
- Socket event handlers for multiplayer sync

### 4. Server Logic (`server-logic.ts`)
Add to `server/server.ts` inside the socket connection handler:
- Game initialization and wave management
- Player movement and shooting
- Collision detection
- Power-up spawning
- Score calculation
- Victory condition checking

### 5. Settings
Update Settings interface to include:
```typescript
gameMode: 'waves' | 'timed';
maxWaves: number;
gameDuration: number; // seconds (for timed mode)
difficulty: 'easy' | 'medium' | 'hard';
```

## 🎨 Visual Style
- **Background**: Space gradient (dark blue to black)
- **Player Ships**: Different colors per player (green, blue, purple, orange)
- **Aliens**: Pixelated retro style in red/pink
- **Effects**: Particle explosions, laser trails, shield auras

## 🔧 Technical Details

### Game Loop
- Server: 60 tick/second game loop
- Client: requestAnimationFrame for smooth rendering
- State sync: Server broadcasts full game state 20 times/second

### Collision Detection
- AABB (Axis-Aligned Bounding Box) collision
- Bullet-alien collisions
- Alien-bottom detection
- Player-powerup collisions

### Optimization
- Object pooling for bullets and particles
- Culling off-screen objects
- Delta time for frame-independent movement

## 📱 Mobile Support
- Touch controls with on-screen buttons
- Simplified UI for small screens
- Auto-fire option for mobile players
- Responsive canvas scaling

## 🎉 Game Flow

1. **Lobby**: Host configures settings (mode, difficulty, max waves)
2. **Game Start**: All players spawn at bottom with their colored ships
3. **Waves**: Aliens spawn in formations and move down
4. **Power-ups**: Randomly drop from destroyed aliens
5. **Wave Complete**: Brief pause, scores displayed, next wave starts
6. **Game End**: Final scores, winner announced, return to lobby

## 🏆 Victory Conditions

**Wave Mode**:
- Complete all waves → Player with highest score wins
- All players destroyed → Game over

**Timed Mode**:
- Timer reaches zero → Player with highest score wins

## 💡 Tips & Strategy
- Focus on aliens in front rows for combo chains
- Save power-ups for tough waves
- Position yourself under aliens for easy shots
- Watch other players' positions for power-up opportunities
- Rapid fire + multi-shot combo is devastating!

---

**Built with the GameBuddies Template** - Multiplayer made easy!
