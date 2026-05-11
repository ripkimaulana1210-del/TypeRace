const DEFAULT_LAP_COUNT = 1;
const MIN_LAP_COUNT = 1;
const MAX_LAP_COUNT = 5;
const DEFAULT_GAME_MODE = 'multiplayer';
const DEFAULT_BOT_DIFFICULTY = 'medium';

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

export class NetworkClient {
  constructor() {
    this.socket = null;
    this.roomCode = null;
    this.players = [];
    this.hostId = null;
    this.state = 'waiting';
    this.mode = DEFAULT_GAME_MODE;
    this.botDifficulty = DEFAULT_BOT_DIFFICULTY;
    this.circuitProfile = null;
    this.lapCount = DEFAULT_LAP_COUNT;
    this.listeners = new Map();
  }

  ensureSocketReady() {
    if (!window.io) {
      throw new Error('Socket.IO client failed to load. Open the app from the running server.');
    }

    if (!this.socket || !this.socket.connected) {
      throw new Error('Not connected to the server yet.');
    }
  }

  emitWithAck(event, args, fallbackMessage, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      try {
        this.ensureSocketReady();
      } catch (error) {
        reject(error);
        return;
      }

      let settled = false;

      const timer = window.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        reject(new Error(fallbackMessage));
      }, timeoutMs);

      this.socket.emit(event, ...args, (response) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);

        if (!response?.success) {
          reject(new Error(response?.message || fallbackMessage));
          return;
        }

        resolve(response);
      });
    });
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event).push(handler);
  }

  emitLocal(event, payload) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach((handler) => handler(payload));
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!window.io) {
        reject(new Error('Socket.IO client failed to load. Make sure the app is opened through the Node server.'));
        return;
      }

      this.socket = io();

      this.socket.once('connect', () => {
        if (this.circuitProfile) {
          this.socket.emit('setCircuitProfile', this.getRaceProfile());
        }

        resolve();
      });

      this.socket.once('connect_error', (error) => reject(error));

      [
        'roomUpdated',
        'countdownStart',
        'countdownTick',
        'raceStart',
        'racePaused',
        'raceResumed',
        'playerUpdate',
        'raceFinished'
      ].forEach((event) => {
        this.socket.on(event, (payload) => this.emitLocal(event, payload));
      });
    });
  }

  createRoom(playerName, options = {}) {
    return this.emitWithAck(
      'createRoom',
      [playerName, this.getRaceProfile(), this.getRoomOptions(options)],
      'Room could not be created. Server is not responding.'
    ).then((response) => {
      this.roomCode = response.roomCode;
      this.mode = response.mode || options.mode || DEFAULT_GAME_MODE;
      this.botDifficulty = response.botDifficulty || options.botDifficulty || DEFAULT_BOT_DIFFICULTY;
      return response;
    });
  }

  createVsAiRoom(playerName, botDifficulty = DEFAULT_BOT_DIFFICULTY) {
    return this.createRoom(playerName, {
      mode: 'ai',
      botDifficulty
    });
  }

  joinRoom(roomCode, playerName) {
    return this.emitWithAck(
      'joinRoom',
      [roomCode, playerName, this.getRaceProfile()],
      'Could not join the room. Server is not responding.'
    ).then((response) => {
      this.roomCode = response.roomCode;
      this.mode = response.mode || DEFAULT_GAME_MODE;
      this.botDifficulty = response.botDifficulty || DEFAULT_BOT_DIFFICULTY;
      return response;
    });
  }

  setCircuitProfile(profile) {
    const trackLength = Number(profile?.trackLength);

    if (!Number.isFinite(trackLength) || trackLength <= 0) {
      return;
    }

    this.circuitProfile = {
      id: String(profile?.id || 'default-circuit').slice(0, 48),
      trackLength: Math.round(trackLength),
      lapCount: this.lapCount
    };

    if (this.socket?.connected && this.roomCode) {
      this.socket.emit('setCircuitProfile', this.getRaceProfile());
    }
  }

  setLapCount(value) {
    this.lapCount = normalizeLapCount(value);

    if (this.circuitProfile) {
      this.circuitProfile.lapCount = this.lapCount;
    }

    if (this.socket?.connected && this.roomCode) {
      this.socket.emit('setLapCount', this.roomCode, this.lapCount);
    }
  }

  applyCircuitProfile(profile) {
    if (!profile) {
      return;
    }

    this.lapCount = normalizeLapCount(profile.lapCount ?? this.lapCount);

    const trackLength = Number(profile.trackLength);

    if (!Number.isFinite(trackLength) || trackLength <= 0) {
      return;
    }

    this.circuitProfile = {
      id: String(profile.id || 'default-circuit').slice(0, 48),
      trackLength: Math.round(trackLength),
      lapCount: this.lapCount
    };
  }

  getRaceProfile() {
    return {
      ...(this.circuitProfile || {}),
      lapCount: this.lapCount
    };
  }

  getRoomOptions(options = {}) {
    return {
      mode: options.mode || DEFAULT_GAME_MODE,
      botDifficulty: options.botDifficulty || DEFAULT_BOT_DIFFICULTY
    };
  }

  startRace() {
    if (this.roomCode) {
      this.socket.emit('startRace', this.roomCode, this.getRaceProfile());
    }
  }

  playAgain() {
    if (this.roomCode) {
      this.socket.emit('playAgain', this.roomCode, this.getRaceProfile());
    }
  }

  pauseAiRace() {
    if (this.roomCode) {
      this.socket.emit('pauseAiRace', this.roomCode);
    }
  }

  resumeAiRace() {
    if (this.roomCode) {
      this.socket.emit('resumeAiRace', this.roomCode);
    }
  }

  restartAiRace() {
    if (this.roomCode) {
      this.socket.emit('restartAiRace', this.roomCode, this.getRaceProfile());
    }
  }

  sendKeyTyped(char) {
    this.socket.emit('keyTyped', { char });
  }

  leaveRoom() {
    this.socket.emit('leaveRoom');
    this.roomCode = null;
    this.players = [];
    this.hostId = null;
    this.state = 'waiting';
    this.mode = DEFAULT_GAME_MODE;
    this.botDifficulty = DEFAULT_BOT_DIFFICULTY;
    this.lapCount = DEFAULT_LAP_COUNT;
  }
}
