# Color Memory Madness 🎨

A thrilling multiplayer memory game inspired by Simon Says! Watch sequences of colors light up, then recreate them from memory to score points.

## 🎮 Game Overview

Color Memory Madness is a fast-paced competitive memory game where players race to recreate increasingly complex color sequences. Watch carefully as colors flash in sequence, then tap them back in the correct order before time runs out. The longer the sequence you complete, the higher your score!

## 🎯 How to Play

### Objective
Remember and recreate color sequences to score points. Survive the longest and get the highest score to win!

### Game Flow
1. **Watch Phase**: A sequence of colored buttons lights up one by one
2. **Memorize**: Pay attention to the order and timing
3. **Replay Phase**: All players simultaneously recreate the sequence
4. **Scoring**: Points awarded based on accuracy and speed
5. **Next Round**: Sequence gets longer by 1 color

### Controls
- **Click/Tap**: Select colored buttons during replay phase
- **Keyboard**: Use 1-6 keys for the corresponding colors (optional)

### Scoring
- **Perfect Sequence**: 100 × sequence length
- **Speed Bonus**: Up to +50 points for fast completion
- **Streak Bonus**: +25 points per consecutive perfect round
- **First to Complete**: +30 bonus points
- **Wrong Color**: Lose 20 points, sequence resets for that player
- **Timeout**: Lose current round, -10 points

## ✨ Game Features

### Difficulty Levels
- **Easy**: 3 colors, 2-second display time, 30s to complete
- **Medium**: 4 colors, 1.5-second display time, 25s to complete
- **Hard**: 5 colors, 1-second display time, 20s to complete
- **Extreme**: 6 colors, 0.7-second display time, 15s to complete

### Game Modes

**Classic Mode**: Everyone plays same sequence
- Sequences get progressively longer
- One mistake = you're out
- Last player standing wins

**Speed Run Mode**: Race to complete 10 sequences fastest
- Timer counts up
- Fastest total time wins
- Mistakes add +10s penalty

**Survival Mode**: Endless sequences
- Sequences get faster each round
- Survive as long as possible
- High score competition

**Battle Mode**: Head-to-head competition
- Each player gets different sequences
- First to X points wins
- Power-ups appear randomly

### Power-ups (Battle Mode)
- 🔍 **Slow-Mo**: Next sequence plays at half speed
- ⏸️ **Pause**: Freeze sequence for 3 seconds to study
- 🎯 **Hint**: One color glows briefly during replay
- ⚡ **Speed Boost**: +20s on timer
- 🛡️ **Shield**: Protect from one mistake
- 🔀 **Scramble Opponent**: Shuffle their colors (positions change)

### Visual & Audio
- **Color Themes**:
  - Classic: Red, Blue, Green, Yellow, Purple, Orange
  - Neon: Bright cyberpunk colors with glow effects
  - Pastel: Soft, calming colors
  - Rainbow: Full spectrum shifting colors
- **Sound Effects**: Each color has unique tone
- **Animations**: Pulsing, glowing, particle effects
- **Accessibility**: Color-blind friendly patterns option

## 🏗️ Implementation Guide

### 1. Client Types (`client-types.ts`)
Add to `client/src/types.ts`:
- `GameData` interface with current sequence, player states
- `ColorButton` interface for button data
- `PlayerProgress` for tracking each player's attempt
- `PowerUp` interface for battle mode
- Game phases and difficulty settings

### 2. Server Types (`server-types.ts`)
Add to `server/types.ts`:
- Same interfaces as client
- Sequence generation logic types
- Round management types

### 3. Game Component (`GameComponent.tsx`)
Replace `client/src/components/GameComponent.tsx`:
- Large colored buttons with click handlers
- Sequence animation during watch phase
- Real-time player progress indicators
- Timer countdown
- Sound effects for each color
- Power-up display and activation
- Victory animations

### 4. Server Logic (`server-logic.ts`)
Add to `server/server.ts`:
- Sequence generation (random, increasing length)
- Round management and synchronization
- Player input validation
- Timing and scoring
- Power-up spawning and effects
- Win condition checking

### 5. Settings
Update Settings interface:
```typescript
difficulty: 'easy' | 'medium' | 'hard' | 'extreme';
gameMode: 'classic' | 'speedRun' | 'survival' | 'battle';
startingSequenceLength: number;
maxSequenceLength: number;
colorCount: number; // 3-6
soundEnabled: boolean;
colorBlindMode: boolean;
```

## 🎨 Visual Layout

### Button Grid
```
┌─────────┬─────────┬─────────┐
│  RED    │  BLUE   │  GREEN  │
│  (1)    │  (2)    │  (3)    │
├─────────┼─────────┼─────────┤
│ YELLOW  │ PURPLE  │ ORANGE  │
│  (4)    │  (5)    │  (6)    │
└─────────┴─────────┴─────────┘
```

### Color Mapping
- **Red**: #ef4444 / Tone: C note
- **Blue**: #3b82f6 / Tone: D note
- **Green**: #22c55e / Tone: E note
- **Yellow**: #f59e0b / Tone: F note
- **Purple**: #a855f7 / Tone: G note
- **Orange**: #f97316 / Tone: A note

## 🔧 Technical Details

### Sequence Generation
- Random color selection
- No three consecutive repeats
- Smooth transitions between colors
- Server-authoritative to prevent cheating

### Animation Timing
- Watch phase: Each color lights for `displayTime` milliseconds
- Gap between colors: 200ms
- Total watch time: `(displayTime + 200) × sequenceLength`

### Input Validation
- Server tracks expected sequence
- Client sends each color tap
- Server validates in real-time
- Wrong color = immediate feedback

### Synchronization
- All players see sequence simultaneously
- Replay phase starts together
- Server broadcasts progress updates
- Visual indicators show who's ahead

### Sound System
- Web Audio API for tones
- Each color = unique frequency
- Optional sound effects
- Volume controls
- Mute option

## 📱 Mobile Support
- Large touch-friendly buttons (100px minimum)
- Haptic feedback on button press
- Landscape orientation recommended
- Responsive grid layout
- Mobile-optimized animations

## 🎉 Game Flow Example

### Round 1
```
Server: Shows [RED]
Players: All tap [RED]
Result: Everyone correct! +100 pts each
```

### Round 2
```
Server: Shows [RED, BLUE]
Players: All tap [RED, BLUE]
Result:
- Player 1: Perfect! +200 pts, +25 streak bonus
- Player 2: Perfect! +200 pts
- Player 3: Wrong! (tapped GREEN) -20 pts, ELIMINATED
```

### Round 3
```
Server: Shows [RED, BLUE, GREEN]
Players: Player 1 and 2 remaining
Result:
- Player 1: Perfect in 3.2s! +300 pts, +50 streak, +30 first place
- Player 2: Perfect in 4.1s! +300 pts, +50 streak
```

*Continues until only one player remains...*

## 🏆 Victory Conditions

**Classic Mode**: Last player standing wins

**Speed Run Mode**: Fastest to complete all sequences

**Survival Mode**: Highest score when all players fail

**Battle Mode**: First to 1000 points (or configured target)

## 💡 Strategy Tips

- **Focus on patterns**: Look for repeating subsequences
- **Use rhythm**: The timing can help memory
- **Chunk sequences**: Break long sequences into groups of 3-4
- **Stay calm**: Panic leads to mistakes
- **Practice spatial memory**: Remember positions, not just colors
- **First vs accuracy**: Sometimes speed bonus isn't worth the risk
- **Power-up timing**: Save shields for long sequences

## 🎮 Accessibility Features

### Color-Blind Mode
Each button shows unique symbol:
- Red: ● (Circle)
- Blue: ■ (Square)
- Green: ▲ (Triangle)
- Yellow: ★ (Star)
- Purple: ♦ (Diamond)
- Orange: ✖ (Cross)

### Sound Mode
- Option to play without visual (audio-only mode)
- Each color has distinct musical note
- Great for visually impaired players

### Difficulty Adjustments
- Extended time limits
- Shorter sequences
- Larger buttons
- High contrast mode

## 🌟 Example Game Session

**Players**: Alice, Bob, Charlie, Diana

**Round 1** - Sequence: [BLUE]
- All players succeed ✓
- Scores: All 100

**Round 2** - Sequence: [BLUE, RED]
- All players succeed ✓
- Scores: All 200

**Round 3** - Sequence: [BLUE, RED, GREEN]
- Charlie makes mistake ✗
- Scores: Alice 475, Bob 450, Diana 430, Charlie -20 (eliminated)

**Round 4** - Sequence: [BLUE, RED, GREEN, YELLOW]
- Bob times out ✗
- Scores: Alice 850, Diana 780, Bob 440 (eliminated)

**Round 5** - Sequence: [BLUE, RED, GREEN, YELLOW, PURPLE]
- Both succeed, Alice faster ✓
- Scores: Alice 1280, Diana 1100

**Round 6** - Sequence: [BLUE, RED, GREEN, YELLOW, PURPLE, ORANGE]
- Diana makes mistake ✗

**🏆 ALICE WINS with 1780 points!**

## 🎵 Sound Design

### Frequency Map (Hz)
- Red: 261.63 (C4)
- Blue: 293.66 (D4)
- Green: 329.63 (E4)
- Yellow: 349.23 (F4)
- Purple: 392.00 (G4)
- Orange: 440.00 (A4)

### Audio Features
- Smooth attack/release envelopes
- Reverb effect option
- Volume normalization
- Cross-platform compatibility

---

**Built with the GameBuddies Template** - Remember, repeat, win!
