# F1 Typing Battle 🏎️

A real-time multiplayer typing race game where Formula 1 cars compete based on typing speed and accuracy.

## Features

- **Real-time Multiplayer**: Up to 6 players can race simultaneously
- **Room System**: Create rooms and invite friends with 6-character codes
- **F1 Racing Visuals**: Canvas-based animated F1 cars on a track
- **Dynamic Speed Control**: Car speed increases with fast & accurate typing, decreases with mistakes
- **Live Statistics**: Track WPM (Words Per Minute), Accuracy, and Race Progress
- **Podium Results**: See final rankings with player statistics

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

1. Clone or extract the project directory
2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Server

Start the game server:
```bash
npm start
```

The server will run on `http://localhost:3000`

For development with auto-reload:
```bash
npm run dev
```

## How to Play

1. **Open the Game**: Navigate to `http://localhost:3000` in your web browser

2. **Create or Join a Room**:
   - Enter your player name
   - Click "CREATE ROOM" to start a new game and get a room code
   - Click "JOIN ROOM" to enter an existing room using the code

3. **Wait in Lobby**:
   - Players gather in the lobby
   - The room host can click "START RACE" when ready (minimum 2 players)

4. **Race**:
   - A 3-second countdown begins
   - Type the displayed text as fast and accurately as possible
   - Your F1 car accelerates with correct typing and decelerates with mistakes
   - See your car's position, speed, WPM, and accuracy in real-time

5. **Race Results**:
   - When the first player finishes, the race ends
   - View the final podium with rankings and statistics

## Game Mechanics

| Action | Effect |
|--------|--------|
| Correct character | +5 speed (max 320 km/h) |
| Incorrect character | -15 speed, +1 mistake |
| Idle (not typing) | Speed gradually maintained |
| Typing accuracy | Affects final score |

## File Structure

```
f1-typing-battle/
├── server.js                    # Node.js + Socket.IO server
├── package.json                 # Dependencies
└── public/
    ├── index.html              # Main HTML
    ├── css/
    │   └── style.css          # Dark F1 theme styling
    └── js/
        ├── network.js         # Socket.IO client
        ├── typing.js          # Typing engine & WPM calc
        ├── game.js            # Canvas F1 visuals
        └── main.js            # UI flow & state management
```

## Game Modes

- **Practice**: Play with friends in custom rooms
- **Multiplayer**: Up to 6 players per room
- **Ranked**: Plan for future implementation

## Technical Stack

- **Frontend**: HTML5, CSS3, Canvas API, JavaScript
- **Backend**: Node.js, Express, Socket.IO
- **Real-time Communication**: WebSocket via Socket.IO

## Tips to Win

1. Type accurately - mistakes significantly slow your car
2. Maintain a consistent typing rhythm
3. Focus on accuracy over speed
4. Watch the progress indicator to know how far you are in the text
5. Stay calm under pressure!

## Troubleshooting

**Can't connect to server?**
- Ensure the server is running with `npm start`
- Check that port 3000 is not in use
- Try refreshing the page

**Game feels laggy?**
- Check your internet connection
- Close other applications using bandwidth
- Try reloading the page

**Typing input not registering?**
- Click on the typing input area to ensure it's focused
- Try clearing your browser cache

## Future Features

- Leaderboard system
- Different difficulty levels
- Custom text submissions
- Voice chat integration
- Mobile-friendly UI improvements
- AI opponents

## License

MIT License

## Contributing

Feel free to fork and contribute improvements!
