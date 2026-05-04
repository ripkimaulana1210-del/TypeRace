const DEFAULT_LAP_COUNT = 1;
const MIN_LAP_COUNT = 1;
const MAX_LAP_COUNT = 5;

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
    this.circuitProfile = null;
    this.lapCount = DEFAULT_LAP_COUNT;
    this.listeners = new Map();
  }

  ensureSocketReady() {
    if (!window.io) {
      throw new Error('Klien Socket.IO gagal dimuat. Buka aplikasi dari server yang sedang berjalan.');
    }

    if (!this.socket || !this.socket.connected) {
      throw new Error('Belum terhubung ke server.');
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
        reject(new Error('Klien Socket.IO gagal dimuat. Pastikan aplikasi dibuka melalui server Node.'));
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

      ['roomUpdated', 'countdownStart', 'countdownTick', 'raceStart', 'playerUpdate', 'raceFinished']
        .forEach((event) => {
          this.socket.on(event, (payload) => this.emitLocal(event, payload));
        });
    });
  }

  createRoom(playerName) {
    return this.emitWithAck(
      'createRoom',
      [playerName, this.getRaceProfile()],
      'Ruang tidak bisa dibuat. Server tidak merespons.'
    ).then((response) => {
      this.roomCode = response.roomCode;
      return response;
    });
  }

  joinRoom(roomCode, playerName) {
    return this.emitWithAck(
      'joinRoom',
      [roomCode, playerName, this.getRaceProfile()],
      'Tidak bisa masuk ke ruang. Server tidak merespons.'
    ).then((response) => {
      this.roomCode = response.roomCode;
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

  setLapCount(lapCount) {
    this.lapCount = normalizeLapCount(lapCount);

    if (this.circuitProfile) {
      this.circuitProfile.lapCount = this.lapCount;
    }

    if (this.socket?.connected && this.roomCode) {
      this.socket.emit('setCircuitProfile', this.getRaceProfile());
    }
  }

  applyCircuitProfile(profile) {
    if (!profile) {
      return;
    }

    this.lapCount = normalizeLapCount(profile.lapCount);

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

  sendKeyTyped(char) {
    this.socket.emit('keyTyped', { char });
  }

  leaveRoom() {
    this.socket.emit('leaveRoom');
    this.roomCode = null;
    this.players = [];
    this.hostId = null;
    this.state = 'waiting';
  }
}
