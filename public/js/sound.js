import * as THREE from 'three';

const ENGINE_AUDIO_URL = '/audio/engine.mp3';
const LOBBY_AUDIO_URL = '/audio/Lobby.mp3';
const RESULTS_AUDIO_URL = '/audio/AfterRace.mp3';
const ENGINE_VOLUME_IDLE = 0.22;
const ENGINE_VOLUME_FAST = 0.72;
const LOBBY_MUSIC_GAIN = 0.32;
const RESULTS_MUSIC_GAIN = 0.44;

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
    this.engineStarting = false;
    this.syntheticEngineOscillator = null;
    this.syntheticEngineHarmonic = null;
    this.syntheticEngineGain = null;

    this.lobbyBuffer = null;
    this.lobbyLoadPromise = null;
    this.lobbySource = null;
    this.lobbyMusicWanted = false;

    this.resultsBuffer = null;
    this.resultsLoadPromise = null;
    this.resultsSource = null;
    this.resultsMusicWanted = false;

    this.lastCorrectSfxAt = 0;
    this.bgmVolume = 0.65;
    this.sfxVolume = 0.75;

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
    this.engineFilter.connect(this.engineGain);

    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = 0.62;
    this.sfxGain.connect(this.masterGain);

    this.lobbyMusicGain = this.context.createGain();
    this.lobbyMusicGain.gain.value = 0;
    this.lobbyMusicGain.connect(this.masterGain);

    this.resultsMusicGain = this.context.createGain();
    this.resultsMusicGain.gain.value = 0;
    this.resultsMusicGain.connect(this.masterGain);
  }

  async unlock() {
    try {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      this.userActivated = true;
      this.loadEngineBuffer();
      this.loadLobbyBuffer();
      this.loadResultsBuffer();
      this.updateLobbyMusicState();
      this.updateResultsMusicState();
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

  loadResultsBuffer() {
    return this.loadAudioBuffer(RESULTS_AUDIO_URL, 'resultsBuffer', 'resultsLoadPromise');
  }

  async startEngineLoop() {
    if (!this.userActivated) {
      return;
    }

    this.startSyntheticEngineLoop();

    if (this.engineStarted || this.engineStarting) {
      return;
    }

    this.engineStarting = true;
    const buffer = await this.loadEngineBuffer();
    this.engineStarting = false;

    if (!buffer || this.engineStarted) {
      return;
    }

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(0.85, now);

    source.connect(this.engineFilter);

    source.start(now);

    this.engineSource = source;
    this.engineStarted = true;
  }

  startSyntheticEngineLoop() {
    if (!this.userActivated || this.syntheticEngineOscillator) {
      return;
    }

    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const harmonic = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = 'sawtooth';
    harmonic.type = 'triangle';
    oscillator.frequency.setValueAtTime(46, now);
    harmonic.frequency.setValueAtTime(92, now);
    gain.gain.setValueAtTime(0.18, now);

    oscillator.connect(gain);
    harmonic.connect(gain);
    gain.connect(this.engineFilter);

    oscillator.start(now);
    harmonic.start(now);

    this.syntheticEngineOscillator = oscillator;
    this.syntheticEngineHarmonic = harmonic;
    this.syntheticEngineGain = gain;
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

    if (this.lobbyMusicWanted) {
      this.resultsMusicWanted = false;
      this.updateResultsMusicState();
    }

    return this.updateLobbyMusicState();
  }

  async updateLobbyMusicState() {
    if (this.userActivated && this.lobbyMusicWanted) {
      await this.startLobbyMusic();
      const now = this.context.currentTime;

      if (!this.userActivated || !this.lobbyMusicWanted) {
        rampParam(this.lobbyMusicGain.gain, 0, now, 0.25);
        this.stopLobbyMusic(0.3);
        return;
      }

      rampParam(this.lobbyMusicGain.gain, LOBBY_MUSIC_GAIN * this.bgmVolume, now, 0.35);
      return;
    }

    const now = this.context.currentTime;
    rampParam(this.lobbyMusicGain.gain, 0, now, 0.25);
    this.stopLobbyMusic(0.3);
  }

  async startResultsMusic() {
    if (!this.userActivated || this.resultsSource) {
      return;
    }

    const buffer = await this.loadResultsBuffer();

    if (!buffer || this.resultsSource || !this.resultsMusicWanted) {
      return;
    }

    const now = this.context.currentTime;
    const source = this.context.createBufferSource();

    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.setValueAtTime(1, now);
    source.connect(this.resultsMusicGain);
    source.start(now);

    source.onended = () => {
      if (this.resultsSource === source) {
        this.resultsSource = null;
      }
    };

    this.resultsSource = source;
  }

  stopResultsMusic(fadeDuration = 0.35) {
    if (!this.resultsSource) {
      return;
    }

    const source = this.resultsSource;
    const now = this.context.currentTime;

    try {
      this.resultsMusicGain.gain.cancelScheduledValues(now);
      this.resultsMusicGain.gain.setValueAtTime(Math.max(this.resultsMusicGain.gain.value, 0.0001), now);
      this.resultsMusicGain.gain.linearRampToValueAtTime(0.0001, now + fadeDuration);
      source.stop(now + fadeDuration + 0.03);
    } catch (_error) {}

    this.resultsSource = null;
  }

  setResultsMusicActive(active) {
    this.resultsMusicWanted = Boolean(active);

    if (this.resultsMusicWanted) {
      this.lobbyMusicWanted = false;
      this.updateLobbyMusicState();
    }

    return this.updateResultsMusicState();
  }

  async updateResultsMusicState() {
    if (this.userActivated && this.resultsMusicWanted) {
      await this.startResultsMusic();
      const now = this.context.currentTime;

      if (!this.userActivated || !this.resultsMusicWanted) {
        rampParam(this.resultsMusicGain.gain, 0, now, 0.25);
        this.stopResultsMusic(0.3);
        return;
      }

      rampParam(this.resultsMusicGain.gain, RESULTS_MUSIC_GAIN * this.bgmVolume, now, 0.45);
      return;
    }

    const now = this.context.currentTime;
    rampParam(this.resultsMusicGain.gain, 0, now, 0.25);
    this.stopResultsMusic(0.3);
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

  playDrs() {
    this.playTone(740, 0.06, 'sawtooth', 0.055);
    this.playTone(1180, 0.12, 'triangle', 0.07, 0.055);
  }

  playGripLoss() {
    this.playTone(190, 0.08, 'sawtooth', 0.07);
    this.playTone(120, 0.16, 'square', 0.045, 0.045);
  }

  playFinalPush() {
    this.playTone(620, 0.08, 'triangle', 0.06);
    this.playTone(930, 0.1, 'triangle', 0.07, 0.08);
    this.playTone(1240, 0.12, 'sine', 0.05, 0.16);
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

    if (this.userActivated) {
      this.startEngineLoop();
    }

    const now = this.context.currentTime;

    if (!this.engineGain) {
      return;
    }

    const targetVolume = this.userActivated && engineActive
      ? (ENGINE_VOLUME_IDLE + normalized * (ENGINE_VOLUME_FAST - ENGINE_VOLUME_IDLE)) * this.sfxVolume
      : 0;

    const targetPlaybackRate = 0.78 + normalized * 0.72;
    const targetFilterFrequency = 1100 + normalized * 2600;
    const targetFundamental = 44 + normalized * 82;
    const targetHarmonic = targetFundamental * 2.02;
    const targetSyntheticGain = (0.16 + normalized * 0.22) * this.sfxVolume;

    rampParam(this.engineGain.gain, targetVolume, now, 0.12);
    rampParam(this.engineFilter.frequency, targetFilterFrequency, now, 0.12);

    if (this.engineSource) {
      rampParam(this.engineSource.playbackRate, targetPlaybackRate, now, 0.12);
    }

    if (this.syntheticEngineOscillator && this.syntheticEngineHarmonic && this.syntheticEngineGain) {
      rampParam(this.syntheticEngineOscillator.frequency, targetFundamental, now, 0.12);
      rampParam(this.syntheticEngineHarmonic.frequency, targetHarmonic, now, 0.12);
      rampParam(this.syntheticEngineGain.gain, targetSyntheticGain, now, 0.12);
    }
  }

  setBgmVolume(value = 0.65) {
    this.bgmVolume = THREE.MathUtils.clamp(Number(value), 0, 1);
    this.updateLobbyMusicState();
    this.updateResultsMusicState();
  }

  setSfxVolume(value = 0.75) {
    this.sfxVolume = THREE.MathUtils.clamp(Number(value), 0, 1);
    const now = this.context.currentTime;
    rampParam(this.sfxGain.gain, 0.62 * this.sfxVolume, now, 0.08);
  }
}
