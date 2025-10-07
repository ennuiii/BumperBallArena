# Adding Game Logic - Step by Step Tutorial

This guide shows you how to add your custom game logic to the template.

## Example: Building a Trivia Game

We'll build a simple trivia game step-by-step.

### Step 1: Define Game Types

**server/types.ts** and **client/src/types.ts**:

```typescript
export interface GameData {
  currentRound: number;
  totalRounds: number;
  currentQuestion: Question | null;
  answers: Map<string, string>; // playerId -> answer
  scores: Map<string, number>;   // playerId -> score
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  category: string;
}
```

### Step 2: Add Game Settings

**types.ts** (both client and server):

```typescript
export interface Settings {
  minPlayers: number;
  maxPlayers: number;
  // Trivia-specific settings
  roundsPerGame: number;
  questionTimeLimit: number;
  categories: string[];
}
```

**server/server.ts** - Update default settings:

```typescript
const DEFAULT_SETTINGS: Settings = {
  minPlayers: 2,
  maxPlayers: 12,
  roundsPerGame: 10,
  questionTimeLimit: 30,
  categories: ['General', 'Science', 'History'],
};
```

### Step 3: Initialize Game State

**server/server.ts** - In the `game:start` handler:

```typescript
socket.on('game:start', (data: { roomCode: string }) => {
  // ... existing validation code ...

  // Initialize trivia game
  const firstQuestion = generateQuestion(lobby.settings.categories);

  lobby.gameData = {
    currentRound: 1,
    totalRounds: lobby.settings.roundsPerGame,
    currentQuestion: firstQuestion,
    answers: new Map(),
    scores: new Map(),
  };

  lobby.state = 'PLAYING';

  io.to(lobby.code).emit('game:started', {
    lobby: {
      ...lobby,
      players: lobby.players.map(sanitizePlayer),
    },
  });

  // Start round timer
  startRoundTimer(lobby, lobby.settings.questionTimeLimit);
});

// Helper function to generate questions
function generateQuestion(categories: string[]): Question {
  // Your question generation logic
  // Can fetch from API or use local question bank
  return {
    id: randomUUID(),
    text: "What is 2 + 2?",
    options: ["3", "4", "5", "6"],
    correctAnswer: 1,
    category: categories[0],
  };
}

function startRoundTimer(lobby: Lobby, seconds: number) {
  setTimeout(() => {
    // Time's up - reveal answer
    revealAnswer(lobby);
  }, seconds * 1000);
}
```

### Step 4: Add Game Event Handlers

**server/server.ts** - Add after the `game:start` handler:

```typescript
// Submit answer
socket.on('game:submit-answer', (data: {
  roomCode: string;
  answer: number;
}) => {
  try {
    const lobby = lobbies.get(data.roomCode);
    if (!lobby || !lobby.gameData) return;

    const player = lobby.players.find(p => p.socketId === socket.id);
    if (!player) return;

    // Store answer
    lobby.gameData.answers.set(socket.id, data.answer.toString());

    // Notify others
    io.to(lobby.code).emit('game:answer-submitted', {
      playerId: socket.id,
      playerName: player.name,
    });

    // If all players answered, reveal immediately
    if (lobby.gameData.answers.size === lobby.players.length) {
      revealAnswer(lobby);
    }
  } catch (error) {
    console.error('[game:submit-answer] Error:', error);
  }
});

// Reveal answer and calculate scores
function revealAnswer(lobby: Lobby) {
  if (!lobby.gameData || !lobby.gameData.currentQuestion) return;

  const question = lobby.gameData.currentQuestion;
  const correctAnswer = question.correctAnswer;

  // Calculate scores
  lobby.gameData.answers.forEach((answer, playerId) => {
    if (parseInt(answer) === correctAnswer) {
      const player = lobby.players.find(p => p.socketId === playerId);
      if (player) {
        player.score += 10; // 10 points for correct answer
      }
    }
  });

  // Emit results
  io.to(lobby.code).emit('game:round-ended', {
    correctAnswer,
    results: Array.from(lobby.gameData.answers.entries()).map(([pid, ans]) => ({
      playerId: pid,
      answer: parseInt(ans),
      correct: parseInt(ans) === correctAnswer,
    })),
    scores: lobby.players.map(p => ({
      playerId: p.socketId,
      score: p.score,
    })),
  });

  // Move to next round after 3 seconds
  setTimeout(() => {
    startNextRound(lobby);
  }, 3000);
}

function startNextRound(lobby: Lobby) {
  if (!lobby.gameData) return;

  lobby.gameData.currentRound++;

  // Check if game is over
  if (lobby.gameData.currentRound > lobby.gameData.totalRounds) {
    endGame(lobby);
    return;
  }

  // Generate next question
  lobby.gameData.currentQuestion = generateQuestion(lobby.settings.categories);
  lobby.gameData.answers.clear();

  io.to(lobby.code).emit('game:next-round', {
    gameData: lobby.gameData,
  });

  // Start timer
  startRoundTimer(lobby, lobby.settings.questionTimeLimit);
}

function endGame(lobby: Lobby) {
  lobby.state = 'GAME_ENDED';
  lobby.gameData = null;

  // Find winner
  const winner = lobby.players.reduce((prev, current) =>
    current.score > prev.score ? current : prev
  );

  io.to(lobby.code).emit('game:ended', {
    lobby: {
      ...lobby,
      players: lobby.players.map(sanitizePlayer),
    },
    winner: {
      id: winner.socketId,
      name: winner.name,
      score: winner.score,
    },
  });
}
```

### Step 5: Create Game UI

**client/src/components/GameComponent.tsx**:

```typescript
const GameComponent: React.FC<GameComponentProps> = ({ lobby, socket }) => {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [roundResults, setRoundResults] = useState<any>(null);

  const gameData = lobby.gameData as GameData | null;
  const currentQuestion = gameData?.currentQuestion;

  useEffect(() => {
    // Listen for round end
    socket.on('game:round-ended', (data) => {
      setRoundResults(data);
      setHasAnswered(false);
      setSelectedAnswer(null);
    });

    // Listen for next round
    socket.on('game:next-round', (data) => {
      setRoundResults(null);
    });

    return () => {
      socket.off('game:round-ended');
      socket.off('game:next-round');
    };
  }, [socket]);

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;

    socket.emit('game:submit-answer', {
      roomCode: lobby.code,
      answer: selectedAnswer,
    });

    setHasAnswered(true);
  };

  if (roundResults) {
    return <RoundResults results={roundResults} />;
  }

  if (!currentQuestion) {
    return <div>Loading question...</div>;
  }

  return (
    <div className="container">
      <h1>Trivia Game</h1>

      <div className="round-info">
        <h3>Round {gameData.currentRound} / {gameData.totalRounds}</h3>
        <p>Category: {currentQuestion.category}</p>
      </div>

      <div style={{
        background: '#f8f9fa',
        padding: '30px',
        borderRadius: '10px',
        marginTop: '20px'
      }}>
        <h2 style={{ marginBottom: '30px' }}>{currentQuestion.text}</h2>

        <div style={{ display: 'grid', gap: '15px' }}>
          {currentQuestion.options.map((option, index) => (
            <button
              key={index}
              onClick={() => !hasAnswered && setSelectedAnswer(index)}
              disabled={hasAnswered}
              style={{
                padding: '20px',
                fontSize: '18px',
                background: selectedAnswer === index ? '#4F46E5' : '#fff',
                color: selectedAnswer === index ? '#fff' : '#000',
                border: '2px solid #e2e8f0',
                borderRadius: '10px',
                cursor: hasAnswered ? 'not-allowed' : 'pointer',
              }}
            >
              {option}
            </button>
          ))}
        </div>

        {!hasAnswered && selectedAnswer !== null && (
          <button
            onClick={handleSubmitAnswer}
            style={{ width: '100%', marginTop: '20px' }}
          >
            Submit Answer
          </button>
        )}

        {hasAnswered && (
          <p style={{ textAlign: 'center', marginTop: '20px', color: '#4F46E5' }}>
            Waiting for others...
          </p>
        )}
      </div>
    </div>
  );
};
```

### Step 6: Test Your Game

1. Run `npm run dev`
2. Create a room
3. Join with another tab
4. Click "Start Game"
5. Answer questions!

## Key Concepts

### Server-Side
- Store game state in `lobby.gameData`
- Emit events to all players: `io.to(lobby.code).emit(...)`
- Validate all player actions
- Handle timers and game flow

### Client-Side
- Listen for server events in `useEffect`
- Emit actions: `socket.emit(...)`
- Update local state based on server updates
- Show UI based on game state

### Best Practices
- Always validate input on server
- Use TypeScript interfaces for type safety
- Clean up socket listeners in useEffect cleanup
- Handle edge cases (player disconnect, etc.)
- Keep game state on server, UI state on client

---

**Next:** Explore the webcam and chat features!
