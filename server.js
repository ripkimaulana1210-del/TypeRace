const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const ROOM_CODE_LENGTH = 6;

const MAX_SPEED = 320;
const MIN_CRUISE_SPEED = 38;
const ACCELERATION_STEP = 5;
const FAST_ACCELERATION_STEP = 12;
const STEADY_ACCELERATION_STEP = 7;
const SLOW_CORRECT_DECELERATION_STEP = 4;
const DECELERATION_STEP = 22;

const TICK_RATE = 1000 / 20;
const DISTANCE_SCALE = 0.08;
const DRAG_PER_SECOND = 18;
const IDLE_GRACE_MS = 1200;
const IDLE_DECELERATION_PER_SECOND = 24;

const FAST_INPUT_WINDOW_MS = 360;
const STEADY_INPUT_WINDOW_MS = 750;
const SLOW_INPUT_WINDOW_MS = 1100;

const MIN_PLAYERS = 1;

const DEFAULT_TRACK_LENGTH = 300;
const DEFAULT_LAP_COUNT = 1;
const MIN_LAP_COUNT = 1;
const MAX_LAP_COUNT = 5;

const TEXT_CHARS_PER_LAP = 190;
const MIN_RACE_TEXT_LENGTH = 140;
const MAX_RACE_TEXT_LENGTH = 950;

const RACE_OPENINGS = [
  'Lampu start padam dan mobil langsung melesat dari grid',
  'Mesin meraung ketika pembalap masuk ke tikungan pertama',
  'Sirkuit mulai terbuka saat mobil keluar dari jalur pit',
  'Pembalap menjaga posisi sambil mencari celah di trek lurus',
  'Ban mulai panas ketika mobil memasuki sektor cepat',
  'Sorakan penonton terdengar saat duel berlangsung ketat',
  'Mobil merah melesat cepat melewati garis start',
  'Pembalap menahan napas sebelum menekan gas lebih dalam',
  'Langit sirkuit mulai gelap saat balapan semakin panas',
  'Dari posisi grid pembalap langsung mengejar jalur terbaik'
];

const RACE_ACTIONS = [
  'jaga ritme ketikan agar tenaga mobil tetap stabil',
  'tekan setiap huruf dengan tenang supaya kecepatan tidak turun',
  'ikuti alur kalimat sambil mempertahankan akurasi',
  'hindari salah ketik karena momentum mobil bisa berkurang',
  'percepat tempo saat tangan sudah mulai stabil',
  'ambil jalur terbaik dan jangan panik saat lawan mendekat',
  'pertahankan fokus agar mobil tetap berada di racing line',
  'atur kecepatan jari supaya setiap input tetap bersih',
  'gunakan akurasi untuk membuka peluang menyalip lawan',
  'jangan terburu buru ketika memasuki bagian kalimat yang panjang'
];

const RACE_MIDDLES = [
  'di tikungan panjang pembalap perlu fokus dan sabar',
  'di sektor cepat setiap kata terasa seperti dorongan mesin',
  'di trek lurus mobil bisa mengejar jarak dengan cepat',
  'di zona pengereman kesalahan kecil bisa membuat posisi turun',
  'di bagian akhir lap konsentrasi menjadi kunci kemenangan',
  'di lintasan malam refleks dan ketenangan harus seimbang',
  'di jalur sempit pembalap harus menjaga kontrol penuh',
  'di area kerb mobil sedikit bergetar namun tetap stabil',
  'di tengah tekanan lawan ritme mengetik harus tetap rapi',
  'di putaran berikutnya setiap huruf menentukan jarak'
];

const RACE_ENDINGS = [
  'pertahankan kontrol sampai garis finis terlihat jelas',
  'selesaikan putaran dengan bersih dan tetap percaya diri',
  'gunakan akurasi tinggi untuk menjaga mobil tetap ringan',
  'biarkan ritme yang konsisten membawa mobil menuju kemenangan',
  'jangan biarkan tekanan mengganggu fokus sampai balapan selesai',
  'pastikan setiap input benar agar hasil akhir tetap maksimal',
  'dorong mobil sampai akhir tanpa kehilangan konsentrasi',
  'tutup lap dengan ketikan bersih dan kecepatan stabil',
  'jaga momentum terakhir agar posisi tidak mudah direbut',
  'akhiri balapan dengan tempo kuat dan kendali penuh'
];

const STRIPPED_PUNCTUATION_PATTERN = /[.,!?;:]/g;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const publicDir = path.join(__dirname, 'public');
const audioDir = path.join(publicDir, 'audio');
const modelsDir = path.join(publicDir, 'models');
const threeDir = path.join(__dirname, 'node_modules', 'three');

app.use(cors());

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use('/vendor/three', express.static(threeDir));

app.use('/audio', express.static(audioDir, {
  setHeaders(res) {
    res.setHeader('Content-Disposition', 'inline');
  }
}));

app.use('/models', express.static(modelsDir, {
  setHeaders(res, filePath) {
    if (path.extname(filePath).toLowerCase() === '.glb') {
      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.use(express.static(publicDir, { index: false }));

const rooms = new Map();
const players = new Map();

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLapCount(value = DEFAULT_LAP_COUNT) {
  const lapCount = Number(value);

  if (!Number.isFinite(lapCount)) {
    return DEFAULT_LAP_COUNT;
  }

  return Math.round(clampNumber(lapCount, MIN_LAP_COUNT, MAX_LAP_COUNT));
}

function getTargetTextLength(_trackLength = DEFAULT_TRACK_LENGTH, lapCount = DEFAULT_LAP_COUNT) {
  const safeLapCount = normalizeLapCount(lapCount);

  return Math.round(clampNumber(
    TEXT_CHARS_PER_LAP * safeLapCount,
    MIN_RACE_TEXT_LENGTH,
    MAX_RACE_TEXT_LENGTH
  ));
}

function normalizeCircuitProfile(profile = {}) {
  const rawTrackLength = Number(profile?.trackLength);

  const trackLength = Number.isFinite(rawTrackLength) && rawTrackLength > 0
    ? clampNumber(rawTrackLength, 120, 1200)
    : DEFAULT_TRACK_LENGTH;

  const id = String(profile?.id || 'default-circuit')
    .trim()
    .slice(0, 48) || 'default-circuit';

  const lapCount = normalizeLapCount(profile?.lapCount);

  return {
    id,
    trackLength: Math.round(trackLength),
    lapCount,
    targetTextLength: getTargetTextLength(trackLength, lapCount)
  };
}

function generateRoomCode() {
  let code = '';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  while (code.length < ROOM_CODE_LENGTH) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  if (rooms.has(code)) {
    return generateRoomCode();
  }

  return code;
}

function createRoom(code, hostId) {
  const circuitProfile = normalizeCircuitProfile();

  const room = {
    code,
    hostId,
    state: 'waiting',
    players: [],
    text: '',
    startTime: null,
    countdownTimer: null,
    raceLoop: null,
    lastTickAt: 0,
    lastTextIndex: -1,
    circuitProfile,
    lapCount: circuitProfile.lapCount,
    standings: []
  };

  rooms.set(code, room);
  return room;
}

function updateRoomCircuitProfile(room, profile = {}) {
  if (!room) {
    return;
  }

  const nextProfile = normalizeCircuitProfile({
    ...(room.circuitProfile || {}),
    ...(profile || {}),
    lapCount: profile?.lapCount ?? room.lapCount ?? DEFAULT_LAP_COUNT
  });

  room.circuitProfile = nextProfile;
  room.lapCount = nextProfile.lapCount;
}

function updateRoomLapCount(room, lapCount) {
  if (!room) {
    return;
  }

  const nextLapCount = normalizeLapCount(lapCount);
  room.lapCount = nextLapCount;

  room.circuitProfile = normalizeCircuitProfile({
    ...(room.circuitProfile || {}),
    lapCount: nextLapCount
  });
}

function normalizeRaceText(text) {
  return String(text || '')
    .replace(STRIPPED_PUNCTUATION_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function buildRandomRaceSentence() {
  return normalizeRaceText([
    pickRandom(RACE_OPENINGS),
    pickRandom(RACE_ACTIONS),
    pickRandom(RACE_MIDDLES),
    pickRandom(RACE_ENDINGS)
  ].join(' '));
}

function trimTextToWordBoundary(text, maxLength) {
  const normalized = normalizeRaceText(text);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const trimmed = normalized.slice(0, maxLength);
  const lastSpaceIndex = trimmed.lastIndexOf(' ');

  if (lastSpaceIndex < 80) {
    return trimmed.trim();
  }

  return trimmed.slice(0, lastSpaceIndex).trim();
}

function pickRandomPassage(previousIndex = -1, targetTextLength = getTargetTextLength()) {
  const targetLength = Math.max(
    MIN_RACE_TEXT_LENGTH,
    Math.min(MAX_RACE_TEXT_LENGTH, Math.round(Number(targetTextLength) || MIN_RACE_TEXT_LENGTH))
  );

  const parts = [];
  let text = '';
  let safety = 0;

  while (text.length < targetLength && safety < 30) {
    parts.push(buildRandomRaceSentence());
    text = normalizeRaceText(parts.join(' '));
    safety += 1;
  }

  return {
    index: previousIndex + 1,
    text: trimTextToWordBoundary(text, targetLength)
  };
}

function getRoom(code) {
  return rooms.get(code);
}

function createPlayer(socketId, roomCode, name) {
  return {
    id: socketId,
    roomCode,
    name: String(name || 'Pembalap').trim().slice(0, 20) || 'Pembalap',
    speed: 0,
    minSpeed: MIN_CRUISE_SPEED,
    maxSpeed: MAX_SPEED,
    acceleration: ACCELERATION_STEP,
    distance: 0,
    progress: 0,
    wpm: 0,
    accuracy: 100,
    mistakes: 0,
    totalKeys: 0,
    typedText: '',
    lastKeyAt: null,
    lastCorrectKeyAt: null,
    finishedAt: null,
    position: 0
  };
}

function getCorrectTypingSpeedDelta(intervalMs) {
  if (!Number.isFinite(intervalMs) || intervalMs <= FAST_INPUT_WINDOW_MS) {
    return FAST_ACCELERATION_STEP;
  }

  if (intervalMs <= STEADY_INPUT_WINDOW_MS) {
    return STEADY_ACCELERATION_STEP;
  }

  if (intervalMs <= SLOW_INPUT_WINDOW_MS) {
    return ACCELERATION_STEP;
  }

  return -SLOW_CORRECT_DECELERATION_STEP;
}

function getRaceSpeedFloor(player) {
  return Number.isFinite(player?.minSpeed) ? player.minSpeed : MIN_CRUISE_SPEED;
}

function sanitizePlayerForLobby(player) {
  return {
    id: player.id,
    name: player.name,
    speed: player.speed,
    progress: player.progress,
    wpm: player.wpm,
    accuracy: player.accuracy,
    position: player.position
  };
}

function getTypedProgressPercent(player, room) {
  const textLength = room?.text?.length || 0;

  if (!textLength) {
    return 0;
  }

  return Math.min(100, (player.typedText.length / textLength) * 100);
}

function getRoomPlayers(room) {
  return room.players
    .map((id) => players.get(id))
    .filter(Boolean);
}

function broadcastRoom(room) {
  io.to(room.code).emit('roomUpdated', {
    roomCode: room.code,
    state: room.state,
    hostId: room.hostId,
    circuit: room.circuitProfile,
    lapCount: room.lapCount,
    players: getRoomPlayers(room).map(sanitizePlayerForLobby)
  });
}

function broadcastPositions(room) {
  const positions = getRoomPlayers(room)
    .sort((a, b) => b.distance - a.distance)
    .map((player, index) => ({
      id: player.id,
      name: player.name,
      speed: player.speed,
      distance: player.distance,
      progress: player.progress,
      progressExact: getTypedProgressPercent(player, room),
      wpm: player.wpm,
      accuracy: player.accuracy,
      position: index + 1
    }));

  io.to(room.code).emit('playerUpdate', {
    positions
  });
}

function resetPlayerForRace(player) {
  player.speed = 0;
  player.distance = 0;
  player.progress = 0;
  player.wpm = 0;
  player.accuracy = 100;
  player.mistakes = 0;
  player.totalKeys = 0;
  player.typedText = '';
  player.lastKeyAt = null;
  player.lastCorrectKeyAt = null;
  player.finishedAt = null;
  player.position = 0;
}

function startPlayerForRace(player, startTime) {
  player.speed = getRaceSpeedFloor(player);
  player.lastKeyAt = startTime;
  player.lastCorrectKeyAt = null;
}

function stopRoomTimers(room) {
  if (room.countdownTimer) {
    clearInterval(room.countdownTimer);
    room.countdownTimer = null;
  }

  if (room.raceLoop) {
    clearInterval(room.raceLoop);
    room.raceLoop = null;
  }
}

function finishRace(room) {
  if (!room || room.state === 'finished') {
    return;
  }

  stopRoomTimers(room);
  room.state = 'finished';

  const results = getRoomPlayers(room)
    .sort((a, b) => {
      if (a.finishedAt && b.finishedAt) {
        return a.finishedAt - b.finishedAt;
      }

      if (a.finishedAt) {
        return -1;
      }

      if (b.finishedAt) {
        return 1;
      }

      return b.progress - a.progress || b.distance - a.distance;
    })
    .map((player, index) => {
      player.position = index + 1;

      return {
        id: player.id,
        name: player.name,
        position: index + 1,
        wpm: player.wpm,
        accuracy: player.accuracy,
        progress: player.progress
      };
    });

  room.standings = results;

  io.to(room.code).emit('raceFinished', {
    results,
    lapCount: room.lapCount,
    circuit: room.circuitProfile
  });

  broadcastRoom(room);
}

function maybeFinishRace(room) {
  if (!room || room.state !== 'racing') {
    return;
  }

  const roomPlayers = getRoomPlayers(room);

  if (!roomPlayers.length) {
    return;
  }

  const hasWinner = roomPlayers.some((player) => player.progress >= 100);

  if (hasWinner) {
    finishRace(room);
  }
}

function startRaceLoop(room) {
  room.lastTickAt = Date.now();

  room.raceLoop = setInterval(() => {
    if (!room || room.state !== 'racing') {
      return;
    }

    const now = Date.now();
    const deltaSeconds = Math.min((now - room.lastTickAt) / 1000, 0.1);
    room.lastTickAt = now;

    const roomPlayers = getRoomPlayers(room);

    roomPlayers.forEach((player) => {
      const speedFloor = getRaceSpeedFloor(player);
      const idleMs = now - (player.lastKeyAt || room.startTime || now);
      const idleDrag = idleMs > IDLE_GRACE_MS ? IDLE_DECELERATION_PER_SECOND : 0;

      player.speed = Math.max(
        speedFloor,
        Number.isFinite(player.speed) ? player.speed : speedFloor
      );

      if (!player.finishedAt) {
        player.distance += player.speed * deltaSeconds * DISTANCE_SCALE;
      }

      player.speed = Math.max(
        speedFloor,
        player.speed - ((DRAG_PER_SECOND + idleDrag) * deltaSeconds)
      );
    });

    broadcastPositions(room);
    maybeFinishRace(room);
  }, TICK_RATE);
}

function startCountdown(room) {
  room.state = 'countdown';

  updateRoomCircuitProfile(room, room.circuitProfile);

  const nextPassage = pickRandomPassage(
    room.lastTextIndex,
    room.circuitProfile?.targetTextLength
  );

  room.lastTextIndex = nextPassage.index;
  room.text = nextPassage.text;

  getRoomPlayers(room).forEach(resetPlayerForRace);

  broadcastRoom(room);

  io.to(room.code).emit('countdownStart', {
    text: room.text,
    circuit: room.circuitProfile,
    lapCount: room.lapCount
  });

  let count = 3;
  io.to(room.code).emit('countdownTick', { count });

  room.countdownTimer = setInterval(() => {
    count -= 1;

    if (count > 0) {
      io.to(room.code).emit('countdownTick', { count });
      return;
    }

    clearInterval(room.countdownTimer);
    room.countdownTimer = null;

    room.state = 'racing';
    room.startTime = Date.now();

    getRoomPlayers(room).forEach((player) => startPlayerForRace(player, room.startTime));

    broadcastRoom(room);
    broadcastPositions(room);

    io.to(room.code).emit('raceStart', {
      startTime: room.startTime,
      text: room.text,
      circuit: room.circuitProfile,
      lapCount: room.lapCount
    });

    startRaceLoop(room);
  }, 1000);
}

function removePlayerFromRoom(socketId) {
  const player = players.get(socketId);

  if (!player) {
    return;
  }

  const room = getRoom(player.roomCode);

  players.delete(socketId);

  if (!room) {
    return;
  }

  room.players = room.players.filter((id) => id !== socketId);

  if (room.hostId === socketId) {
    room.hostId = room.players[0] || null;
  }

  if (room.players.length === 0) {
    stopRoomTimers(room);
    rooms.delete(room.code);
    return;
  }

  if (room.state === 'racing' || room.state === 'countdown') {
    maybeFinishRace(room);
  }

  broadcastRoom(room);
  broadcastPositions(room);
}

io.on('connection', (socket) => {
  socket.on('createRoom', (playerName, circuitProfile, callback) => {
    if (typeof circuitProfile === 'function') {
      callback = circuitProfile;
      circuitProfile = null;
    }

    callback = typeof callback === 'function' ? callback : () => {};

    const existingPlayer = players.get(socket.id);

    if (existingPlayer) {
      socket.leave(existingPlayer.roomCode);
    }

    removePlayerFromRoom(socket.id);

    const roomCode = generateRoomCode();
    const room = createRoom(roomCode, socket.id);

    updateRoomCircuitProfile(room, circuitProfile);

    const player = createPlayer(socket.id, roomCode, playerName);

    players.set(socket.id, player);
    room.players.push(socket.id);
    socket.join(roomCode);

    callback({
      success: true,
      roomCode,
      player: sanitizePlayerForLobby(player)
    });

    broadcastRoom(room);
  });

  socket.on('joinRoom', (roomCode, playerName, circuitProfile, callback) => {
    if (typeof circuitProfile === 'function') {
      callback = circuitProfile;
      circuitProfile = null;
    }

    callback = typeof callback === 'function' ? callback : () => {};

    const existingPlayer = players.get(socket.id);

    if (existingPlayer) {
      socket.leave(existingPlayer.roomCode);
    }

    removePlayerFromRoom(socket.id);

    const normalizedCode = String(roomCode || '').trim().toUpperCase();
    const room = getRoom(normalizedCode);

    if (!room) {
      callback({ success: false, message: 'Ruang tidak ditemukan.' });
      return;
    }

    if (room.state !== 'waiting') {
      callback({ success: false, message: 'Balapan sudah berjalan.' });
      return;
    }

    const player = createPlayer(socket.id, normalizedCode, playerName);

    players.set(socket.id, player);
    room.players.push(socket.id);
    socket.join(normalizedCode);

    callback({
      success: true,
      roomCode: normalizedCode,
      player: sanitizePlayerForLobby(player)
    });

    broadcastRoom(room);
  });

  socket.on('setCircuitProfile', (profile) => {
    const player = players.get(socket.id);

    if (!player) {
      return;
    }

    const room = getRoom(player.roomCode);

    if (!room || room.hostId !== socket.id || (room.state !== 'waiting' && room.state !== 'finished')) {
      return;
    }

    updateRoomCircuitProfile(room, profile);
    broadcastRoom(room);
  });

  socket.on('setLapCount', (roomCode, lapCount) => {
    const normalizedCode = String(roomCode || '').trim().toUpperCase();
    const room = getRoom(normalizedCode);

    if (!room || room.hostId !== socket.id) {
      return;
    }

    if (room.state !== 'waiting' && room.state !== 'finished') {
      return;
    }

    updateRoomLapCount(room, lapCount);
    broadcastRoom(room);
  });

  socket.on('startRace', (roomCode, circuitProfile) => {
    const room = getRoom(String(roomCode || '').trim().toUpperCase());

    if (!room || room.hostId !== socket.id || room.state !== 'waiting') {
      return;
    }

    if (room.players.length < MIN_PLAYERS) {
      return;
    }

    updateRoomCircuitProfile(room, circuitProfile);
    startCountdown(room);
  });

  socket.on('playAgain', (roomCode, circuitProfile) => {
    const player = players.get(socket.id);
    const normalizedCode = String(roomCode || player?.roomCode || '').trim().toUpperCase();
    const room = getRoom(normalizedCode);

    if (!room || room.hostId !== socket.id || room.state !== 'finished') {
      return;
    }

    if (room.players.length < MIN_PLAYERS) {
      return;
    }

    updateRoomCircuitProfile(room, circuitProfile);
    startCountdown(room);
  });

  socket.on('keyTyped', (payload) => {
    const player = players.get(socket.id);

    if (!player) {
      return;
    }

    const room = getRoom(player.roomCode);

    if (!room || room.state !== 'racing') {
      return;
    }

    const expectedChar = room.text[player.typedText.length];

    if (!expectedChar) {
      return;
    }

    const now = Date.now();
    const typedChar = String(payload?.char || '');
    const isCorrect = typedChar.toLowerCase() === expectedChar.toLowerCase();
    const previousCorrectKeyAt = player.lastCorrectKeyAt || room.startTime || now;
    const correctKeyIntervalMs = Math.max(0, now - previousCorrectKeyAt);

    player.totalKeys += 1;
    player.lastKeyAt = now;

    if (isCorrect) {
      const speedDelta = getCorrectTypingSpeedDelta(correctKeyIntervalMs);
      const speedFloor = getRaceSpeedFloor(player);

      player.typedText += typedChar;

      player.speed = clampNumber(
        Math.max(speedFloor, player.speed) + speedDelta,
        speedFloor,
        player.maxSpeed
      );

      player.lastCorrectKeyAt = now;
    } else {
      player.mistakes += 1;
      player.speed = Math.max(getRaceSpeedFloor(player), player.speed - DECELERATION_STEP);
    }

    const elapsedMinutes = Math.max((Date.now() - room.startTime) / 60000, 1 / 60000);

    player.wpm = Math.round((player.typedText.length / 5) / elapsedMinutes);

    player.accuracy = Math.max(
      0,
      Math.round(((player.totalKeys - player.mistakes) / Math.max(1, player.totalKeys)) * 100)
    );

    player.progress = Math.round(getTypedProgressPercent(player, room));

    if (player.progress >= 100 && !player.finishedAt) {
      player.finishedAt = Date.now();
      player.progress = 100;
      player.speed = 0;
    }

    broadcastPositions(room);
    maybeFinishRace(room);
  });

  socket.on('leaveRoom', () => {
    const player = players.get(socket.id);

    if (player) {
      socket.leave(player.roomCode);
    }

    removePlayerFromRoom(socket.id);
  });

  socket.on('disconnect', () => {
    removePlayerFromRoom(socket.id);
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

function startServer(port = PORT) {
  return server.listen(port, () => {
    console.log(`F1 Typing Battle 3D server running on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();

  process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

module.exports = {
  app,
  server,
  io,
  startServer
};