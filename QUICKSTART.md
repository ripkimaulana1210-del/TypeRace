## QUICK START GUIDE 🚀

### Prerequisites
- Node.js installed on your computer

### Installation & Running

1. **Open Terminal/Command Prompt** in the project folder

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Start the Server:**
   ```bash
   npm start
   ```
   
   You should see: `F1 Typing Battle server running on http://localhost:3000`

4. **Open Browser:** 
   - Go to `http://localhost:3000`
   - Open another tab/window to test multiplayer locally

### Game Instructions

#### Single Player (Test Mode)
1. Enter your name (e.g., "Player 1")
2. Click "CREATE ROOM" → You get a room code (e.g., "ABC123")
3. Open another browser tab → Enter same name as "Player 2"
4. Click "JOIN ROOM" → Enter the code
5. First tab: Click "START RACE" when Player 2 joins
6. Race! Type as fast and accurately as possible

#### Multiplayer (Real Test)
- Open game on different computers
- Use same room code to connect
- Have fun racing!

### Game Controls
- **Type**: Focus on typing the displayed text correctly and quickly
- **Watch**: Your car speed increases with correct typing
- **Finish**: Complete the text first to win!

### Stopping the Server
- Press `Ctrl + C` in terminal

### Troubleshooting

**Port 3000 already in use?**
```bash
# On Windows, find process on port 3000
netstat -ano | findstr :3000

# On Mac/Linux
lsof -i :3000
```

**"Cannot find module"?**
- Run: `npm install` again

**Browser shows blank page?**
- Check browser console (F12) for errors
- Try refreshing the page
- Clear browser cache

### Features Available

✅ Create/Join multiplayer rooms with codes
✅ Real-time F1 car race animation
✅ Live WPM and accuracy tracking
✅ Sound feedback for correct/incorrect typing
✅ Final podium with rankings
✅ Support for up to 6 players per room

### Next Steps
- Customize the game by editing CSS for themes
- Add more typing texts in `server.js` textPool array
- Modify car physics in `game.js`
- Add sound effects (edit HTML/JS)

Happy Racing! 🏎️
