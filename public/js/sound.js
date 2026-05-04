import * as THREE from 'three';

const ENGINE_AUDIO_URL = '/audio/engine.mp3';
const LOBBY_AUDIO_URL = '/audio/Lobby.mp3';

function rampParam(param, value, time, duration = 0.08) {
  try {
    param.cancelScheduledValues(time);
    param.setValueAtTime(param.value, time);
    param.linearRampToValueAtTime(value, time + duration);
  } catch (_error) {
    param.value = value;
  }
}

export class EngineSoundController {
  constructor(camera) {
    this.camera = camera;
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);

    this.context = this.listener.context;
    this.userActivated = false;

    this.engineBuffer = null;
    this.engineLoadPromise = null;
    this.engineSource = null;
    this.engineStarted = false;

    this.lobbyBuffer = null;
    this.lobbyLoadPromise = null;
    this.lobbySource = null;
    this.lobbyMusicWanted = false;

    this.lastCorrectSfxAt = 0;

    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.75;
    this.masterGain.connect(this.context.destination);

    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.masterGain);

    this.engineFilter = this.context.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 1800;
    this.engineFilter.Q.value = 0.65;

    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = 0.62;
    this.sfxGain.connect(this.masterGain);

    this.lobbyMusicGain = this.context.createGain();
    this.lobbyMusicGain.gain.value = 0;
    this.lobbyMusicGain.connect(this.masterGain);
  }

  async unlock() {
    try {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      this.userActivated = true;
      this.updateLobbyMusicState();
    } catch (error) {
      console.error('AUDIO UNLOCK ERROR:', error);
    }
  }

  async loadAudioBuffer(url, cacheKey, promiseKey) {
    if (this[cacheKey]) {
      return this[cacheKey];
    }

    if (!this[promiseKey]) {
      this[promiseKey] = fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Gagal memuat audio ${url}: ${response.status}`);
          }

          return response.arrayBuffer();
        })
        .then((arrayBuffer) => this.context.decodeAudioData(arrayBuffer))
        .then((buffer) => {
          this[cacheKey] = buffer;
          return buffer;
        })
        .catch((error) => {
          this[promiseKey] = null;
          console.error('AUDIO LOAD ERROR:', error);
          return null;
        });
    }

    return this[promiseKey];
  }

  loadEngineBuffer() {
    return this.loadAudioBuffer(ENGINE_AUDIO_URL, 'engineBuffer', 'engineLoadPromise');
  }

  loadLobbyBuffer() {
    return this.loadAudioBuffer(LOBBY_AUDIO_URL, 'lobbyBuffer', 'lobbyLoadPromise');
  }

  async startEngineLoop() {
    if (!this.userActivated || this.engineStarted) {
      return;
    }

    const buffer = await this.loadEngineBuffer();

    if (!buffer || this.engineStarted) {
      return;
    }

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(0.85, now);

    source.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);

    source.start(now);

    this.engineSource = source;
    this.engineStarted = true;
  }

  async startLobbyMusic() {
    if (!this.userActivated || this.lobbySource) {
      return;
    }

    const buffer = await this.loadLobbyBuffer();

    if (!buffer || this.lobbySource || !this.lobbyMusicWanted) {
      return;
    }

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(1, now);
    source.connect(this.lobbyMusicGain);
    source.start(now);

    source.onended = () => {
      if (this.lobbySource === source) {
        this.lobbySource = null;
      }
    };

    this.lobbySource = source;
  }

  stopLobbyMusic(fadeDuration = 0.35) {
    if (!this.lobbySource) {
      return;
    }

    const source = this.lobbySource;
    const now = this.context.currentTime;

    try {
      this.lobbyMusicGain.gain.cancelScheduledValues(now);
      this.lobbyMusicGain.gain.setValueAtTime(Math.max(this.lobbyMusicGain.gain.value, 0.0001), now);
      this.lobbyMusicGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
      source.stop(now + fadeDuration + 0.03);
    } catch (_error) {}

    this.lobbySource = null;
  }

  setLobbyMusicActive(active) {
    this.lobbyMusicWanted = Boolean(active);
    this.updateLobbyMusicState();
  }

  async updateLobbyMusicState() {
    const active = this.userActivated && this.lobbyMusicWanted;
    const now = this.context.currentTime;

    if (active) {
      await this.startLobbyMusic();
      rampParam(this.lobbyMusicGain.gain, 0.32, now, 0.35);
      return;
    }

    rampParam(this.lobbyMusicGain.gain, 0, now, 0.25);
    this.stopLobbyMusic(0.3);
  }

  setResultsMusicActive(_active) {
    // Kosongin aja biar aman kalau masih ada pemanggilan dari game3d.js.
    // Musik after race kamu diatur dari main.js.
  }

  playTone(frequency, duration = 0.1, type = 'sine', volume = 0.18, delay = 0) {
    if (!this.userActivated) {
      return;
    }

    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(this.sfxGain);

    oscillator.start(now);
    oscillator.stop(now + duration + 0.035);
  }

  playCountdownTick(count = 3) {
    const frequency = count <= 1 ? 760 : 560;
    this.playTone(frequency, 0.11, 'square', 0.1);
    this.playTone(frequency * 1.5, 0.08, 'sine', 0.04, 0.035);
  }

  playRaceStart() {
    this.playTone(420, 0.07, 'square', 0.08);
    this.playTone(630, 0.08, 'square', 0.1, 0.08);
    this.playTone(940, 0.14, 'sawtooth', 0.08, 0.17);
    this.playBoost();
  }

  playCorrectKey() {
    const now = performance.now();

    if (now - this.lastCorrectSfxAt < 55) {
      return;
    }

    this.lastCorrectSfxAt = now;
    this.playTone(980, 0.035, 'triangle', 0.045);
  }

  playMistake() {
    this.playTone(150, 0.13, 'sawtooth', 0.1);
    this.playTone(90, 0.14, 'square', 0.06);
  }

  playFinish() {
    this.playTone(523, 0.09, 'triangle', 0.08);
    this.playTone(659, 0.09, 'triangle', 0.08, 0.1);
    this.playTone(784, 0.18, 'triangle', 0.1, 0.2);
  }

  playBoost() {
    this.playTone(330, 0.05, 'sawtooth', 0.06);
    this.playTone(660, 0.07, 'triangle', 0.09, 0.035);
    this.playTone(990, 0.1, 'sine', 0.06, 0.085);
  }

  playSegmentComplete() {
    this.playTone(520, 0.05, 'triangle', 0.08);
    this.playTone(780, 0.06, 'triangle', 0.09, 0.055);
    this.playTone(1040, 0.075, 'sine', 0.06, 0.12);
  }

  update(speed = 0, maxSpeed = 320, engineActive = true, _effects = {}) {
    const normalized = THREE.MathUtils.clamp(
      Number(speed) / Math.max(1, Number(maxSpeed) || 320),
      0,
      1
    );

    if (this.userActivated && !this.engineStarted) {
      this.startEngineLoop();
    }

    const now = this.context.currentTime;

    if (!this.engineSource || !this.engineGain) {
      return;
    }

    const targetVolume = this.userActivated && engineActive
      ? 0.12 + normalized * 0.42
      : 0;

    const targetPlaybackRate = 0.78 + normalized * 0.72;
    const targetFilterFrequency = 1100 + normalized * 2600;

    rampParam(this.engineGain.gain, targetVolume, now, 0.12);
    rampParam(this.engineSource.playbackRate, targetPlaybackRate, now, 0.12);
    rampParam(this.engineFilter.frequency, targetFilterFrequency, now, 0.12);
  }
}