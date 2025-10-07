# Word Chain Challenge 🔗

A creative word association game where players build chains of related words to score points!

## 🎮 Game Overview

Word Chain Challenge is a fast-paced multiplayer word game where players take turns adding words to a growing chain. Each word must be related to the previous word, and other players vote on whether the connection is valid. Creativity is rewarded, but stretch too far and you might get challenged!

## 🎯 How to Play

### Objective
Build the longest word chain possible by adding related words. Score points for accepted words and bonus points for creative connections!

### Game Flow
1. **Starting Word**: A random word is chosen to start the chain
2. **Player Turn**: Current player has 30 seconds to submit a related word
3. **Voting Phase**: Other players vote "Accept" or "Challenge" the connection
4. **Resolution**:
   - If majority accepts → Word is added, player scores points
   - If majority challenges → Player explains the connection
   - Final vote determines if word stays or is rejected
5. **Chain Continues**: Next player's turn begins

### Scoring
- **Basic Word**: 10 points
- **Unanimous Accept**: +5 bonus points
- **Creative Connection**: +10 points (voted by players)
- **Chain Breaker Penalty**: -5 points (rejected word)
- **Longest Chain Bonus**: 50 points at game end

### Word Connection Rules
Words must be connected by:
- **Synonyms**: fast → quick
- **Categories**: apple → orange (both fruits)
- **Associations**: sun → beach
- **Compound words**: fire → truck (firetruck)
- **Rhymes**: cat → hat
- **Opposites**: hot → cold
- **Actions**: dog → bark
- **Related concepts**: book → library

## ✨ Special Features

### Challenge Mode
When a word is challenged:
1. Player has 20 seconds to explain their connection
2. Explanation is shown to all players
3. Second vote determines final outcome
4. Good explanations can turn challenges into accepts!

### Power Words
Certain words unlock bonuses:
- **Rare Words**: Words not used in past 10 games → +5 points
- **Long Words**: 8+ letters → +5 points
- **Perfect Rhymes**: Exact rhyme → +5 points

### Chain Multiplier
- 5+ chain: 1.2x multiplier
- 10+ chain: 1.5x multiplier
- 15+ chain: 2x multiplier
- 20+ chain: 3x multiplier!

### Time Pressure
- First 10 seconds: Full points
- 11-20 seconds: 90% points
- 21-30 seconds: 70% points
- Over 30 seconds: Auto-skip + penalty

## 🏗️ Implementation Guide

### 1. Client Types (`client-types.ts`)
Add to `client/src/types.ts`:
- `GameData` interface with current chain, timer, voting state
- `ChainWord` interface for each word in the chain
- `VoteData` interface for tracking votes
- Game phases and connection types

### 2. Server Types (`server-types.ts`)
Add to `server/types.ts`:
- Same interfaces as client
- Additional validation logic types
- Word history tracking

### 3. Game Component (`GameComponent.tsx`)
Replace `client/src/components/GameComponent.tsx`:
- Word input with auto-focus
- Live chain display with connections
- Timer countdown with visual warning
- Voting interface for other players
- Explanation input for challenged words
- Score leaderboard with multipliers

### 4. Server Logic (`server-logic.ts`)
Add to `server/server.ts`:
- Turn management and rotation
- Word validation (basic profanity filter, length check)
- Voting system and tally
- Timer enforcement
- Chain tracking and history
- Score calculation with multipliers

### 5. Settings
Update Settings interface:
```typescript
turnDuration: number; // seconds per turn
chainGoal: number; // target chain length
votingTime: number; // seconds for voting
allowChallenges: boolean;
requireExplanations: boolean;
```

## 🎨 Visual Style
- **Chain Display**: Flowing word bubbles connected by arrows
- **Current Word**: Pulsing highlight with timer ring
- **Voting Cards**: Flip animation for reveal
- **Connection Types**: Color-coded by relationship type
  - Blue: Synonyms/Opposites
  - Green: Categories
  - Purple: Associations
  - Orange: Creative/Unique

## 🔧 Technical Details

### Word Validation
- Minimum length: 2 characters
- Maximum length: 20 characters
- Letters only (no numbers or special characters)
- Basic profanity filter
- No repeated words (case-insensitive)

### Voting System
- Each player gets one vote (except current player)
- Majority rules (>50% to accept)
- Ties default to accept
- Host vote counts as 1.5 in case of ties

### Timer Implementation
- Server-authoritative timer
- Client shows countdown with warnings
- Auto-skip at 0:00 with penalty
- Grace period of 2 seconds for network lag

### Chain Visualization
- Horizontal scrolling word cloud
- Animated word addition with connection line
- Highlight contested words in yellow
- Rejected words shown in red with strikethrough

## 📱 Mobile Support
- Large touch-friendly input
- Swipe to scroll chain
- Tap-to-vote interface
- Simplified explanation input with suggestions
- Auto-zoom on input focus

## 🎉 Game Flow

1. **Lobby**: Host sets turn duration, chain goal, and rules
2. **Game Start**: Random starting word displayed
3. **Turns**: Players rotate, submitting words
4. **Voting**: Real-time vote tallies
5. **Challenges**: Optional explanation phase
6. **Chain Growth**: Visual chain updates
7. **Game End**: Reach chain goal or all players pass
8. **Results**: Final scores, longest chain, most creative connections

## 🏆 Victory Conditions

**Chain Goal Mode**:
- First to reach target chain contribution wins
- Bonus points for variety

**Timed Mode**:
- Most points when timer expires
- Chain multiplier applies to final score

**Survival Mode**:
- One strike (rejected word) and you're out
- Last player standing wins

## 💡 Tips & Strategy

- **Safe plays**: Use obvious connections early
- **Risk/reward**: Creative words score more but risk challenges
- **Watch opponents**: Learn their style to predict challenges
- **Chain awareness**: Consider what words come next
- **Time management**: Don't overthink - trust your first instinct
- **Explanation prep**: Think of your reasoning while typing
- **Pattern breaking**: Avoid predictable chains to keep multiplier

## 🎲 Starting Word Categories

The game randomly selects from these categories:
- **Animals**: dog, cat, elephant
- **Food**: pizza, apple, bread
- **Places**: beach, mountain, city
- **Actions**: run, jump, swim
- **Objects**: car, phone, book
- **Emotions**: happy, sad, excited
- **Nature**: tree, rain, sun

## 🌟 Example Game

```
Round 1: DOG
Player 1: "CAT" → ✅ Accepted (both pets)
Player 2: "WHISKERS" → ✅ Accepted (cat feature)
Player 3: "HAIR" → ⚠️ Challenged
  Explanation: "Whiskers are like special hair on cats"
  → ✅ Accepted with explanation
Player 4: "BARBER" → ✅ Accepted (cuts hair)
Player 1: "SCISSORS" → ✅ Accepted (barber tool)
...
Chain reaches 20 words → 3x multiplier activated!
```

---

**Built with the GameBuddies Template** - Where words come alive!
