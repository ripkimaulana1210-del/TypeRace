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
const TEXT_CHARS_PER_TRACK_UNIT = 1.15;
const MIN_RACE_TEXT_LENGTH = 180;
const MAX_RACE_TEXT_LENGTH = 620;

const TEXT_PASSAGES = [
  'Lampu start padam dan mobil melesat menuju tikungan pertama. Jaga ritme ketikan tetap bersih, tekan setiap huruf dengan tenang, lalu biarkan kecepatan naik saat lintasan mulai membuka ke trek lurus panjang.',
  'Masuk ke sektor cepat dengan fokus penuh. Setiap kata yang rapi menjaga traksi mobil, sementara kesalahan kecil membuat momentum turun sebelum pembalap sempat keluar dari tikungan berikutnya.',
  'Kejar garis balap terbaik dari awal sampai akhir putaran. Ketik perlahan saat perlu, percepat ketika jari sudah stabil, dan pertahankan akurasi agar mobil tidak kehilangan tenaga di tengah sirkuit.',
  'Sirkuit malam menuntut keberanian dan kontrol halus. Mesin meraung di belakang, lawan mulai mendekat, tetapi pembalap yang sabar membaca ritme akan menemukan ruang untuk menyerang di trek lurus.',
  'Tikungan panjang membutuhkan tangan yang tidak panik. Tahan fokus, ikuti alur kalimat sampai selesai, dan pastikan setiap huruf benar supaya mobil tetap stabil menuju garis finis.',
  'Balapan ini bukan hanya soal mengetik cepat. Pembalap terbaik menjaga napas, memilih tempo, memperbaiki kesalahan secepat mungkin, lalu membangun kecepatan lagi saat lintasan kembali terbuka.',
  'Saat mobil melewati kerb dan masuk ke sektor terakhir, jangan biarkan lawan mengganggu konsentrasi. Ketikan yang konsisten akan membawa mobil tetap di jalur ideal sampai putaran selesai.',
  'Mulai dari grid dengan sabar, naikkan kecepatan sedikit demi sedikit, lalu pertahankan irama sampai semua sektor terlewati. Akurasi yang tinggi membuat mobil terasa ringan sepanjang sirkuit.'
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
    circuitProfile: normalizeCircuitProfile(),
    standings: []
  };
  rooms.set(code, room);
  return room;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getTargetTextLength(trackLength = DEFAULT_TRACK_LENGTH) {
  const safeTrackLength = Number.isFinite(trackLength) && trackLength > 0
    ? trackLength
    : DEFAULT_TRACK_LENGTH;

  return Math.round(clampNumber(
    safeTrackLength * TEXT_CHARS_PER_TRACK_UNIT,
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

  return {
    id,
    trackLength: Math.round(trackLength),
    targetTextLength: getTargetTextLength(trackLength)
  };
}

function updateRoomCircuitProfile(room, profile) {
  if (!room || !profile) {
    return;
  }

  room.circuitProfile = normalizeCircuitProfile(profile);
}

function normalizeRaceText(text) {
  return String(text || '')
    .replace(STRIPPED_PUNCTUATION_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickRandomPassage(previousIndex = -1, targetTextLength = getTargetTextLength()) {
  const normalizedPassages = TEXT_PASSAGES
    .map(normalizeRaceText)
    .filter(Boolean);

  if (!normalizedPassages.length) {
    return {
      index: 0,
      text: ''
    };
  }

  if (normalizedPassages.length <= 1) {
    return {
      index: 0,
      text: normalizedPassages[0] || ''
    };
  }

  let nextIndex = Math.floor(Math.random() * normalizedPassages.length);
  if (nextIndex === previousIndex) {
    nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (normalizedPassages.length - 1))) % normalizedPassages.length;
  }

  const parts = [];
  let cursor = nextIndex;
  let text = '';

  while (text.length < targetTextLength && parts.length < normalizedPassages.length) {
    parts.push(normalizedPassages[cursor % normalizedPassages.length]);
    text = parts.join(' ');
    cursor += 1;
  }

  return {
    index: nextIndex,
    text
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
  io.to(room.code).emit('raceFinished', { results });
  broadcastRoom(room);
}

function maybeFinishRace(room) {
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
      player.distance += player.speed * deltaSeconds * DISTANCE_SCALE;
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
    circuit: room.circuitProfile
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
      circuit: room.circuitProfile
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
    if (room.hostId === socket.id) {
      updateRoomCircuitProfile(room, circuitProfile);
    }
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
      player.speed = Math.min(player.maxSpeed, player.speed + 25);
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

// Error handlers
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

  // Graceful shutdown
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
