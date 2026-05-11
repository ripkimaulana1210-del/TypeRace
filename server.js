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
const MAX_PLAYERS = 8;

const MOMENTUM_BASE = 1;
const MOMENTUM_MIN = 0.72;
const MOMENTUM_MAX = 1.38;
const MOMENTUM_FAST_GAIN = 0.038;
const MOMENTUM_STEADY_GAIN = 0.024;
const MOMENTUM_SLOW_GAIN = 0.012;
const MOMENTUM_MISTAKE_PENALTY = 0.16;
const MOMENTUM_IDLE_DECAY_PER_SECOND = 0.035;
const GRIP_BASE = 1;
const GRIP_MIN = 0.58;
const GRIP_MAX = 1.12;
const GRIP_CORRECT_RECOVERY = 0.018;
const GRIP_TICK_RECOVERY_PER_SECOND = 0.032;
const GRIP_MISTAKE_PENALTY = 0.18;
const DRS_STREAK_THRESHOLD = 18;
const DRS_SPEED_BONUS = 3.5;
const DRS_EVENT_COOLDOWN_MS = 2600;
const FINAL_PUSH_PROGRESS = 85;
const RACE_EVENT_TTL_MS = 2200;
const GHOST_PLAYER_ID_PREFIX = 'ghost:';
const GHOST_BASE_WPM = 52;
const GHOST_VARIANCE_WPM = 10;
const AI_GHOST_COUNT = 5;
const DEFAULT_GAME_MODE = 'multiplayer';
const GAME_MODES = new Set(['multiplayer', 'ai']);
const DEFAULT_BOT_DIFFICULTY = 'medium';
const BOT_DIFFICULTIES = {
  'very-easy': {
    label: 'Very Easy',
    name: 'Rookie AI',
    wpm: 28,
    variance: 4,
    accuracy: 90,
    maxSpeedRatio: 0.68,
    grip: 0.94,
    momentum: 0.92
  },
  easy: {
    label: 'Easy',
    name: 'Academy AI',
    wpm: 38,
    variance: 5,
    accuracy: 93,
    maxSpeedRatio: 0.76,
    grip: 0.98,
    momentum: 0.98
  },
  medium: {
    label: 'Medium',
    name: 'Rival AI',
    wpm: 52,
    variance: 7,
    accuracy: 96,
    maxSpeedRatio: 0.88,
    grip: 1.05,
    momentum: 1.08
  },
  hard: {
    label: 'Hard',
    name: 'Pro AI',
    wpm: 66,
    variance: 8,
    accuracy: 98,
    maxSpeedRatio: 0.96,
    grip: 1.08,
    momentum: 1.16
  },
  'very-hard': {
    label: 'Very Hard',
    name: 'Champion AI',
    wpm: 82,
    variance: 9,
    accuracy: 99,
    maxSpeedRatio: 1,
    grip: 1.1,
    momentum: 1.24
  }
};

const RACE_SECTORS = [
  {
    id: 'launch',
    label: 'Start',
    until: 20,
    accelMultiplier: 1.04,
    dragMultiplier: 0.94,
    speedMultiplier: 1.02
  },
  {
    id: 'technical',
    label: 'Tikungan',
    until: 45,
    accelMultiplier: 0.92,
    dragMultiplier: 1.12,
    speedMultiplier: 0.96
  },
  {
    id: 'straight',
    label: 'Trek Lurus',
    until: 75,
    accelMultiplier: 1.16,
    dragMultiplier: 0.9,
    speedMultiplier: 1.08
  },
  {
    id: 'braking',
    label: 'Pengereman',
    until: 90,
    accelMultiplier: 0.9,
    dragMultiplier: 1.18,
    speedMultiplier: 0.94
  },
  {
    id: 'final',
    label: 'Final Push',
    until: 100,
    accelMultiplier: 1.1,
    dragMultiplier: 0.96,
    speedMultiplier: 1.04
  }
];

const DEFAULT_TRACK_LENGTH = 300;
const DEFAULT_LAP_COUNT = 1;
const MIN_LAP_COUNT = 1;
const MAX_LAP_COUNT = 5;

const TEXT_CHARS_PER_LAP = 230;
const MIN_TEXT_CHARS_PER_LAP = 170;
const MAX_TEXT_CHARS_PER_LAP = 320;
const MIN_RACE_TEXT_LENGTH = 160;
const MAX_RACE_TEXT_LENGTH = 1450;
const LONG_TRACK_TEXT_BUFFER_START = 900;
const LONG_TRACK_TEXT_BUFFER_END = 1800;
const FINISH_SECTOR_TEXT_BUFFER_RATIO = 0.16;

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
const configuredOrigins = String(process.env.CLIENT_ORIGIN || process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = configuredOrigins.includes('*') ? '*' : configuredOrigins;
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST']
  }
});

const publicDir = path.join(__dirname, 'public');
const audioDir = path.join(publicDir, 'audio');
const modelsDir = path.join(publicDir, 'models');
const threeDir = path.join(__dirname, 'node_modules', 'three');

app.use(cors({ origin: corsOrigin }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'typerace-backend'
  });
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

function normalizeGameMode(value = DEFAULT_GAME_MODE) {
  const mode = String(value || DEFAULT_GAME_MODE).trim().toLowerCase();
  return GAME_MODES.has(mode) ? mode : DEFAULT_GAME_MODE;
}

function normalizeBotDifficulty(value = DEFAULT_BOT_DIFFICULTY) {
  const difficulty = String(value || DEFAULT_BOT_DIFFICULTY).trim().toLowerCase();
  return BOT_DIFFICULTIES[difficulty] ? difficulty : DEFAULT_BOT_DIFFICULTY;
}

function getTargetTextLength(trackLength = DEFAULT_TRACK_LENGTH, lapCount = DEFAULT_LAP_COUNT) {
  const rawTrackLength = Number(trackLength);
  const safeTrackLength = Number.isFinite(rawTrackLength) && rawTrackLength > 0
    ? clampNumber(rawTrackLength, 160, 2200)
    : DEFAULT_TRACK_LENGTH;
  const safeLapCount = normalizeLapCount(lapCount);
  const trackScale = Math.sqrt(safeTrackLength / DEFAULT_TRACK_LENGTH);
  const baseCharsPerLap = clampNumber(
    Math.round(TEXT_CHARS_PER_LAP * trackScale),
    MIN_TEXT_CHARS_PER_LAP,
    MAX_TEXT_CHARS_PER_LAP
  );
  const longTrackRatio = clampNumber(
    (safeTrackLength - LONG_TRACK_TEXT_BUFFER_START)
      / (LONG_TRACK_TEXT_BUFFER_END - LONG_TRACK_TEXT_BUFFER_START),
    0,
    1
  );
  const finishSectorBuffer = Math.round(
    baseCharsPerLap * FINISH_SECTOR_TEXT_BUFFER_RATIO * longTrackRatio
  );
  const charsPerLap = clampNumber(
    baseCharsPerLap + finishSectorBuffer,
    MIN_TEXT_CHARS_PER_LAP,
    MAX_TEXT_CHARS_PER_LAP
  );
  const lapScale = 1 + (safeLapCount - 1) * 0.68;

  return Math.round(clampNumber(
    charsPerLap * lapScale,
    MIN_RACE_TEXT_LENGTH,
    MAX_RACE_TEXT_LENGTH
  ));
}

function normalizeCircuitProfile(profile = {}) {
  const rawTrackLength = Number(profile?.trackLength);

  const trackLength = Number.isFinite(rawTrackLength) && rawTrackLength > 0
    ? clampNumber(rawTrackLength, 120, 2200)
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

function createRoom(code, hostId, options = {}) {
  const circuitProfile = normalizeCircuitProfile();
  const mode = normalizeGameMode(options.mode);
  const botDifficulty = normalizeBotDifficulty(options.botDifficulty);

  const room = {
    code,
    hostId,
    mode,
    botDifficulty,
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
    pausedFromState: null,
    pausedAt: null,
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
    name: String(name || 'Driver').trim().slice(0, 20) || 'Driver',
    isGhost: false,
    speed: 0,
    minSpeed: MIN_CRUISE_SPEED,
    maxSpeed: MAX_SPEED,
    acceleration: ACCELERATION_STEP,
    distance: 0,
    progress: 0,
    progressExact: 0,
    wpm: 0,
    accuracy: 100,
    mistakes: 0,
    totalKeys: 0,
    correctKeys: 0,
    typedText: '',
    lastKeyAt: null,
    lastCorrectKeyAt: null,
    streak: 0,
    longestStreak: 0,
    momentum: MOMENTUM_BASE,
    grip: GRIP_BASE,
    drsActive: false,
    finalPushActive: false,
    raceEvent: null,
    eventSeq: 0,
    lastDrsEventAt: 0,
    _finalPushAnnounced: false,
    sectorIndex: 0,
    sectorEnteredAt: null,
    sectorTimes: RACE_SECTORS.map(() => 0),
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

function getMomentumGain(intervalMs) {
  if (!Number.isFinite(intervalMs) || intervalMs <= FAST_INPUT_WINDOW_MS) {
    return MOMENTUM_FAST_GAIN;
  }

  if (intervalMs <= STEADY_INPUT_WINDOW_MS) {
    return MOMENTUM_STEADY_GAIN;
  }

  return MOMENTUM_SLOW_GAIN;
}

function getRaceSector(progressPercent = 0) {
  const progress = clampNumber(Number(progressPercent) || 0, 0, 100);

  return RACE_SECTORS.find((sector) => progress <= sector.until)
    || RACE_SECTORS[RACE_SECTORS.length - 1];
}

function getRaceSectorIndex(progressPercent = 0) {
  const sector = getRaceSector(progressPercent);
  return Math.max(0, RACE_SECTORS.findIndex((candidate) => candidate.id === sector.id));
}

function setRaceEvent(player, type, message, now = Date.now()) {
  if (!player || !type) {
    return;
  }

  player.eventSeq = (player.eventSeq || 0) + 1;
  player.raceEvent = {
    id: player.eventSeq,
    type,
    message,
    at: now,
    expiresAt: now + RACE_EVENT_TTL_MS
  };
}

function updatePlayerSector(player, progressPercent = 0, now = Date.now()) {
  if (!player) {
    return;
  }

  const nextSectorIndex = getRaceSectorIndex(progressPercent);

  if (!Number.isFinite(player.sectorIndex)) {
    player.sectorIndex = nextSectorIndex;
    player.sectorEnteredAt = now;
    return;
  }

  if (!player.sectorEnteredAt) {
    player.sectorEnteredAt = now;
  }

  if (nextSectorIndex === player.sectorIndex) {
    return;
  }

  const elapsed = Math.max(0, now - player.sectorEnteredAt);
  player.sectorTimes[player.sectorIndex] = (player.sectorTimes[player.sectorIndex] || 0) + elapsed;
  player.sectorIndex = nextSectorIndex;
  player.sectorEnteredAt = now;

  const sector = RACE_SECTORS[nextSectorIndex];
  if (sector && !player.isGhost) {
    setRaceEvent(player, 'sector', `${sector.label}: ritme disesuaikan`, now);
  }
}

function finalizePlayerSector(player, now = Date.now()) {
  if (!player || !player.sectorEnteredAt || !Number.isFinite(player.sectorIndex)) {
    return;
  }

  const elapsed = Math.max(0, now - player.sectorEnteredAt);
  player.sectorTimes[player.sectorIndex] = (player.sectorTimes[player.sectorIndex] || 0) + elapsed;
  player.sectorEnteredAt = now;
}

function getSectorSummary(player) {
  const entries = (player?.sectorTimes || []).map((timeMs, index) => ({
    id: RACE_SECTORS[index]?.id || `sector-${index + 1}`,
    label: RACE_SECTORS[index]?.label || `Sektor ${index + 1}`,
    timeMs: Math.round(timeMs || 0)
  }));
  const positiveEntries = entries.filter((entry) => entry.timeMs > 0);
  const best = positiveEntries.reduce((bestEntry, entry) => (
    !bestEntry || entry.timeMs < bestEntry.timeMs ? entry : bestEntry
  ), null);
  const worst = positiveEntries.reduce((worstEntry, entry) => (
    !worstEntry || entry.timeMs > worstEntry.timeMs ? entry : worstEntry
  ), null);

  return {
    entries,
    best,
    worst
  };
}

function getPlayerQualityMultiplier(player, sector) {
  const momentum = Number.isFinite(player?.momentum) ? player.momentum : MOMENTUM_BASE;
  const grip = Number.isFinite(player?.grip) ? player.grip : GRIP_BASE;
  const sectorMultiplier = Number.isFinite(sector?.accelMultiplier) ? sector.accelMultiplier : 1;

  return clampNumber(
    ((momentum * 0.68) + (grip * 0.42)) * sectorMultiplier,
    0.58,
    1.52
  );
}

function getRaceSpeedFloor(player) {
  return Number.isFinite(player?.minSpeed) ? player.minSpeed : MIN_CRUISE_SPEED;
}

function sanitizePlayerForLobby(player) {
  return {
    id: player.id,
    name: player.name,
    isGhost: Boolean(player.isGhost),
    finished: Boolean(player.finishedAt || player.progress >= 100),
    speed: player.speed,
    progress: player.progress,
    progressExact: player.progressExact || player.progress,
    wpm: player.wpm,
    accuracy: player.accuracy,
    grip: Math.round((player.grip || GRIP_BASE) * 100),
    momentum: Math.round((player.momentum || MOMENTUM_BASE) * 100),
    position: player.position
  };
}

function getTypedProgressPercent(player, room) {
  if (player?.isGhost) {
    return clampNumber(Number(player.progressExact) || 0, 0, 100);
  }

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

function getHumanRoomPlayers(room) {
  return getRoomPlayers(room).filter((player) => !player.isGhost);
}

function createGhostPlayer(room, index = 1) {
  const difficulty = BOT_DIFFICULTIES[normalizeBotDifficulty(room?.botDifficulty)] || BOT_DIFFICULTIES.medium;
  const ghostNumber = Math.max(1, Math.min(AI_GHOST_COUNT, Math.round(Number(index) || 1)));
  const ghost = createPlayer(
    `${GHOST_PLAYER_ID_PREFIX}${room.code}:${ghostNumber}`,
    room.code,
    `${difficulty.name} ${ghostNumber}`
  );
  const seed = room.code
    .split('')
    .reduce((total, character) => total + character.charCodeAt(0), 0);

  ghost.isGhost = true;
  ghost.minSpeed = MIN_CRUISE_SPEED + Math.round(difficulty.wpm / 7);
  ghost.maxSpeed = MAX_SPEED * difficulty.maxSpeedRatio;
  ghost.ghostWpm = difficulty.wpm + ((seed + ghostNumber * 3) % (difficulty.variance + 1));
  ghost.accuracy = difficulty.accuracy;
  ghost.grip = difficulty.grip;
  ghost.momentum = difficulty.momentum;
  ghost.botDifficulty = normalizeBotDifficulty(room?.botDifficulty);
  ghost.raceEvent = {
    id: 1,
    type: 'ghost',
    message: `${difficulty.label} bot joined as practice opponent`,
    at: Date.now(),
    expiresAt: Date.now() + RACE_EVENT_TTL_MS
  };

  return ghost;
}

function removeGhostOpponent(room) {
  if (!room) {
    return;
  }

  room.players
    .filter((id) => String(id).startsWith(GHOST_PLAYER_ID_PREFIX))
    .forEach((id) => players.delete(id));

  room.players = room.players.filter((id) => !String(id).startsWith(GHOST_PLAYER_ID_PREFIX));
}

function ensureGhostOpponent(room) {
  if (!room) {
    return;
  }

  if (room.mode !== 'ai') {
    removeGhostOpponent(room);
    return;
  }

  const humanPlayers = getHumanRoomPlayers(room);

  if (humanPlayers.length !== 1) {
    removeGhostOpponent(room);
    return;
  }

  const existingGhostIds = room.players.filter((id) => String(id).startsWith(GHOST_PLAYER_ID_PREFIX));

  existingGhostIds
    .filter((id) => {
      const index = Number(String(id).split(':').pop());
      return !Number.isInteger(index) || index < 1 || index > AI_GHOST_COUNT;
    })
    .forEach((id) => players.delete(id));

  room.players = room.players.filter((id) => {
    if (!String(id).startsWith(GHOST_PLAYER_ID_PREFIX)) {
      return true;
    }

    const index = Number(String(id).split(':').pop());
    return Number.isInteger(index) && index >= 1 && index <= AI_GHOST_COUNT;
  });

  for (let index = 1; index <= AI_GHOST_COUNT; index += 1) {
    const ghostId = `${GHOST_PLAYER_ID_PREFIX}${room.code}:${index}`;

    if (players.has(ghostId) && room.players.includes(ghostId)) {
      continue;
    }

    const ghost = createGhostPlayer(room, index);
    players.set(ghost.id, ghost);
    room.players.push(ghost.id);
  }
}

function broadcastRoom(room) {
  const roomPlayers = getRoomPlayers(room);

  io.to(room.code).emit('roomUpdated', {
    roomCode: room.code,
    mode: room.mode,
    botDifficulty: room.botDifficulty,
    state: room.state,
    hostId: room.hostId,
    circuit: room.circuitProfile,
    lapCount: room.lapCount,
    maxPlayers: room.mode === 'ai' ? roomPlayers.length : MAX_PLAYERS,
    players: roomPlayers.map(sanitizePlayerForLobby)
  });
}

function broadcastPositions(room) {
  const positions = getRoomPlayers(room)
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

      return b.distance - a.distance;
    })
    .map((player, index) => ({
      id: player.id,
      name: player.name,
      isGhost: Boolean(player.isGhost),
      finished: Boolean(player.finishedAt || player.progress >= 100),
      finishedAt: player.finishedAt,
      speed: player.speed,
      distance: player.distance,
      progress: player.progress,
      progressExact: getTypedProgressPercent(player, room),
      wpm: player.wpm,
      accuracy: player.accuracy,
      mistakes: player.mistakes,
      streak: player.streak || 0,
      longestStreak: player.longestStreak || 0,
      grip: Math.round((player.grip || GRIP_BASE) * 100),
      momentum: Math.round((player.momentum || MOMENTUM_BASE) * 100),
      drsActive: Boolean(player.drsActive),
      finalPushActive: Boolean(player.finalPushActive),
      sector: RACE_SECTORS[player.sectorIndex]?.label || getRaceSector(getTypedProgressPercent(player, room)).label,
      raceEvent: player.raceEvent || null,
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
  player.progressExact = 0;
  player.wpm = 0;
  player.accuracy = 100;
  player.mistakes = 0;
  player.totalKeys = 0;
  player.correctKeys = 0;
  player.typedText = '';
  player.lastKeyAt = null;
  player.lastCorrectKeyAt = null;
  player.streak = 0;
  player.longestStreak = 0;
  player.momentum = player.isGhost ? 1.08 : MOMENTUM_BASE;
  player.grip = player.isGhost ? 1.05 : GRIP_BASE;
  player.drsActive = false;
  player.finalPushActive = false;
  player.raceEvent = null;
  player.eventSeq = 0;
  player.lastDrsEventAt = 0;
  player._finalPushAnnounced = false;
  player.sectorIndex = 0;
  player.sectorEnteredAt = null;
  player.sectorTimes = RACE_SECTORS.map(() => 0);
  player.finishedAt = null;
  player.position = 0;
}

function startPlayerForRace(player, startTime) {
  player.speed = getRaceSpeedFloor(player);
  player.lastKeyAt = startTime;
  player.lastCorrectKeyAt = null;
  player.sectorEnteredAt = startTime;

  if (player.isGhost) {
    player.speed = player.minSpeed + 24;
    player.lastCorrectKeyAt = startTime;
    setRaceEvent(player, 'ghost', `${player.name} menjaga tempo stabil`, startTime);
  }
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
      finalizePlayerSector(player);
      player.position = index + 1;
      const sectorSummary = getSectorSummary(player);

      return {
        id: player.id,
        name: player.name,
        isGhost: Boolean(player.isGhost),
        position: index + 1,
        wpm: player.wpm,
        accuracy: player.accuracy,
        progress: player.progress,
        mistakes: player.mistakes,
        totalKeys: player.totalKeys,
        correctKeys: player.correctKeys,
        longestStreak: player.longestStreak || 0,
        grip: Math.round((player.grip || GRIP_BASE) * 100),
        momentum: Math.round((player.momentum || MOMENTUM_BASE) * 100),
        bestSector: sectorSummary.best,
        worstSector: sectorSummary.worst,
        sectorTimes: sectorSummary.entries
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

  const allPlayersFinished = roomPlayers.every((player) => player.finishedAt || player.progress >= 100);

  if (allPlayersFinished) {
    finishRace(room);
  }
}

function updateGhostPlayer(player, room, now, deltaSeconds) {
  if (!player?.isGhost || player.finishedAt) {
    return;
  }

  const textLength = Math.max(1, room?.text?.length || 1);
  const elapsedSeconds = Math.max(0, (now - (room.startTime || now)) / 1000);
  const phase = Math.sin((elapsedSeconds * 0.72) + player.id.length) * 0.08;
  const sector = getRaceSector(player.progressExact || 0);
  const charsPerSecond = ((player.ghostWpm || GHOST_BASE_WPM) * 5) / 60;
  const progressGain = ((charsPerSecond * (1 + phase) * sector.speedMultiplier) / textLength) * 100 * deltaSeconds;

  player.progressExact = clampNumber((player.progressExact || 0) + progressGain, 0, 100);
  player.progress = Math.round(player.progressExact);
  player.correctKeys = Math.round((player.progressExact / 100) * textLength);
  player.totalKeys = player.correctKeys;
  player.wpm = Math.round((player.correctKeys / 5) / Math.max(elapsedSeconds / 60, 1 / 60000));
  player.accuracy = 97;
  player.streak = Math.max(player.streak || 0, Math.min(player.correctKeys, 40));
  player.longestStreak = Math.max(player.longestStreak || 0, player.streak);
  player.drsActive = player.progressExact > 45 && player.progressExact < 82;
  player.finalPushActive = player.progressExact >= FINAL_PUSH_PROGRESS;
  player.speed = clampNumber(
    getRaceSpeedFloor(player) + (player.progressExact * 1.55) + (player.drsActive ? 16 : 0),
    getRaceSpeedFloor(player),
    player.maxSpeed
  );
  player.lastKeyAt = now;
  player.lastCorrectKeyAt = now;

  updatePlayerSector(player, player.progressExact, now);

  if (player.progress >= 100 && !player.finishedAt) {
    player.finishedAt = now;
    player.progress = 100;
    player.progressExact = 100;
    player.speed = 0;
  }
}

function updatePlayerPhysics(player, room, now, deltaSeconds) {
  if (player.finishedAt || player.progress >= 100) {
    player.speed = 0;
    player.progress = 100;
    player.progressExact = 100;
    return;
  }

  const progressPercent = getTypedProgressPercent(player, room);
  const sector = getRaceSector(progressPercent);
  const speedFloor = getRaceSpeedFloor(player);
  const idleMs = now - (player.lastKeyAt || room.startTime || now);
  const idleDrag = idleMs > IDLE_GRACE_MS ? IDLE_DECELERATION_PER_SECOND : 0;
  const gripLoss = 1 - clampNumber(player.grip || GRIP_BASE, GRIP_MIN, GRIP_MAX);
  const drag = (DRAG_PER_SECOND * sector.dragMultiplier)
    + (idleDrag * (1 + gripLoss * 0.8));

  player.momentum = clampNumber(
    (player.momentum || MOMENTUM_BASE) - (MOMENTUM_IDLE_DECAY_PER_SECOND * deltaSeconds * (idleDrag ? 1.45 : 1)),
    MOMENTUM_MIN,
    MOMENTUM_MAX
  );
  player.grip = clampNumber(
    (player.grip || GRIP_BASE) + GRIP_TICK_RECOVERY_PER_SECOND * deltaSeconds,
    GRIP_MIN,
    GRIP_MAX
  );
  player.speed = Math.max(
    speedFloor,
    Number.isFinite(player.speed) ? player.speed : speedFloor
  );

  if (!player.finishedAt) {
    player.distance += player.speed * deltaSeconds * DISTANCE_SCALE * sector.speedMultiplier;
  }

  player.speed = Math.max(
    speedFloor,
    player.speed - (drag * deltaSeconds)
  );

  updatePlayerSector(player, progressPercent, now);
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
      if (player.isGhost) {
        updateGhostPlayer(player, room, now, deltaSeconds);
      }

      updatePlayerPhysics(player, room, now, deltaSeconds);
    });

    broadcastPositions(room);
    maybeFinishRace(room);
  }, TICK_RATE);
}

function startCountdown(room) {
  room.state = 'countdown';

  updateRoomCircuitProfile(room, room.circuitProfile);
  ensureGhostOpponent(room);

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
  const humanPlayers = getHumanRoomPlayers(room);

  if (room.hostId === socketId) {
    room.hostId = humanPlayers[0]?.id || null;
  }

  if (humanPlayers.length === 0) {
    stopRoomTimers(room);
    removeGhostOpponent(room);
    rooms.delete(room.code);
    return;
  }

  if (humanPlayers.length > 1) {
    removeGhostOpponent(room);
  }

  if (room.state === 'racing' || room.state === 'countdown') {
    maybeFinishRace(room);
  }

  broadcastRoom(room);
  broadcastPositions(room);
}

io.on('connection', (socket) => {
  socket.on('createRoom', (playerName, circuitProfile, options, callback) => {
    if (typeof circuitProfile === 'function') {
      callback = circuitProfile;
      circuitProfile = null;
      options = {};
    } else if (typeof options === 'function') {
      callback = options;
      options = {};
    }

    callback = typeof callback === 'function' ? callback : () => {};

    const existingPlayer = players.get(socket.id);

    if (existingPlayer) {
      socket.leave(existingPlayer.roomCode);
    }

    removePlayerFromRoom(socket.id);

    const roomCode = generateRoomCode();
    const room = createRoom(roomCode, socket.id, options);

    updateRoomCircuitProfile(room, circuitProfile);

    const player = createPlayer(socket.id, roomCode, playerName);

    players.set(socket.id, player);
    room.players.push(socket.id);
    ensureGhostOpponent(room);
    socket.join(roomCode);

    callback({
      success: true,
      roomCode,
      mode: room.mode,
      botDifficulty: room.botDifficulty,
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
      callback({ success: false, message: 'Room not found.' });
      return;
    }

    if (room.state !== 'waiting') {
      callback({ success: false, message: 'Race is already running.' });
      return;
    }

    if (room.mode === 'ai') {
      callback({ success: false, message: 'VS AI rooms cannot be joined by other players.' });
      return;
    }

    if (getHumanRoomPlayers(room).length >= MAX_PLAYERS) {
      callback({ success: false, message: `Room is full. Maximum ${MAX_PLAYERS} drivers.` });
      return;
    }

    const player = createPlayer(socket.id, normalizedCode, playerName);

    players.set(socket.id, player);
    room.players.push(socket.id);
    socket.join(normalizedCode);

    callback({
      success: true,
      roomCode: normalizedCode,
      mode: room.mode,
      botDifficulty: room.botDifficulty,
      player: sanitizePlayerForLobby(player)
    });

    broadcastRoom(room);
  });

  socket.on('setCircuitProfile', (profile) => {
    const player = players.get(socket.id);

    if (!player || player.isGhost) {
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

  socket.on('pauseAiRace', (roomCode) => {
    const room = getRoom(String(roomCode || '').trim().toUpperCase());

    if (!room || room.hostId !== socket.id || room.mode !== 'ai' || room.state !== 'racing') {
      return;
    }

    const now = Date.now();
    room.pausedFromState = room.state;
    room.pausedAt = now;
    room.state = 'paused';

    getRoomPlayers(room).forEach((player) => {
      player.speed = 0;
      player.lastKeyAt = now;
      player.lastCorrectKeyAt = now;
    });

    io.to(room.code).emit('racePaused', {
      roomCode: room.code,
      state: room.state
    });
    broadcastPositions(room);
  });

  socket.on('resumeAiRace', (roomCode) => {
    const room = getRoom(String(roomCode || '').trim().toUpperCase());

    if (!room || room.hostId !== socket.id || room.mode !== 'ai' || room.state !== 'paused') {
      return;
    }

    const now = Date.now();
    const pauseDuration = Math.max(0, now - (room.pausedAt || now));

    room.startTime = (room.startTime || now) + pauseDuration;
    room.state = room.pausedFromState || 'racing';
    room.pausedFromState = null;
    room.pausedAt = null;

    getRoomPlayers(room).forEach((player) => {
      player.lastKeyAt = now;
      player.lastCorrectKeyAt = now;
      player.speed = Math.max(player.speed || 0, getRaceSpeedFloor(player));
    });

    io.to(room.code).emit('raceResumed', {
      roomCode: room.code,
      state: room.state,
      startTime: room.startTime
    });
    broadcastRoom(room);
  });

  socket.on('restartAiRace', (roomCode, circuitProfile) => {
    const room = getRoom(String(roomCode || '').trim().toUpperCase());

    if (!room || room.hostId !== socket.id || room.mode !== 'ai') {
      return;
    }

    if (!['countdown', 'racing', 'paused', 'finished', 'waiting'].includes(room.state)) {
      return;
    }

    stopRoomTimers(room);
    removeGhostOpponent(room);
    room.state = 'waiting';
    room.pausedFromState = null;
    room.pausedAt = null;
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
      const currentProgress = getTypedProgressPercent(player, room);
      const sector = getRaceSector(currentProgress);
      const qualityMultiplier = getPlayerQualityMultiplier(player, sector);

      player.typedText += typedChar;
      player.correctKeys += 1;
      player.streak += 1;
      player.longestStreak = Math.max(player.longestStreak || 0, player.streak);
      player.grip = clampNumber(
        (player.grip || GRIP_BASE) + GRIP_CORRECT_RECOVERY,
        GRIP_MIN,
        GRIP_MAX
      );
      player.momentum = clampNumber(
        (player.momentum || MOMENTUM_BASE) + getMomentumGain(correctKeyIntervalMs),
        MOMENTUM_MIN,
        MOMENTUM_MAX
      );
      player.drsActive = player.streak >= DRS_STREAK_THRESHOLD;
      player.finalPushActive = getTypedProgressPercent(player, room) >= FINAL_PUSH_PROGRESS;

      player.speed = clampNumber(
        Math.max(speedFloor, player.speed)
          + (speedDelta * qualityMultiplier)
          + (player.drsActive ? DRS_SPEED_BONUS : 0),
        speedFloor,
        player.maxSpeed
      );

      player.lastCorrectKeyAt = now;

      if (
        player.drsActive
        && now - (player.lastDrsEventAt || 0) > DRS_EVENT_COOLDOWN_MS
      ) {
        player.lastDrsEventAt = now;
        setRaceEvent(player, 'drs', 'DRS active: clean streak gives a boost', now);
      } else if (player.finalPushActive && !player._finalPushAnnounced) {
        player._finalPushAnnounced = true;
        setRaceEvent(player, 'final_push', 'Final push: jaga ritme sampai garis finis', now);
      }
    } else {
      player.mistakes += 1;
      player.streak = 0;
      player.drsActive = false;
      player.grip = clampNumber(
        (player.grip || GRIP_BASE) - GRIP_MISTAKE_PENALTY,
        GRIP_MIN,
        GRIP_MAX
      );
      player.momentum = clampNumber(
        (player.momentum || MOMENTUM_BASE) - MOMENTUM_MISTAKE_PENALTY,
        MOMENTUM_MIN,
        MOMENTUM_MAX
      );
      player.speed = Math.max(
        getRaceSpeedFloor(player),
        player.speed - (DECELERATION_STEP * (1 + (1 - player.grip) * 0.9))
      );
      setRaceEvent(player, 'grip_loss', 'Grip turun: typo membuat mobil goyah', now);
    }

    const elapsedMinutes = Math.max((Date.now() - room.startTime) / 60000, 1 / 60000);

    player.wpm = Math.round((player.typedText.length / 5) / elapsedMinutes);

    player.accuracy = Math.max(
      0,
      Math.round(((player.totalKeys - player.mistakes) / Math.max(1, player.totalKeys)) * 100)
    );

    player.progressExact = getTypedProgressPercent(player, room);
    player.progress = Math.round(player.progressExact);
    updatePlayerSector(player, player.progressExact, now);

    if (player.progress >= 100 && !player.finishedAt) {
      player.finishedAt = now;
      finalizePlayerSector(player, now);
      player.progress = 100;
      player.progressExact = 100;
      player.speed = 0;
      setRaceEvent(player, 'finish', 'Clean finish: sentence complete', now);
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
