import * as THREE from 'three';

const LOBBY_MUSIC_SEQUENCE = [
  196.00,
  246.94,
  293.66,
  329.63,
  392.00,
  329.63,
  293.66,
  246.94
];

function rampParam(param, value, time) {
  try {
    param.cancelScheduledValues(time);
    param.setTargetAtTime(value, time, 0.035);
  } catch (_error) {
    param.value = value;
  }
}

function createNoiseBuffer(context, duration = 1.5) {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

export class EngineSoundController {
  constructor(camera) {
    this.camera = camera;
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);

    this.context = this.listener.context;
    this.userActivated = false;
    this.lobbyMusicLoadStarted = false;
    this.lobbyMusicWanted = false;
    this.proceduralEngineStarted = false;
    this.proceduralMusicStarted = false;
    this.proceduralMusicTimer = null;
    this.proceduralMusicStep = 0;
    this.noiseLayersStarted = false;
    this.lastCorrectSfxAt = 0;

    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0.72;
    this.masterGain.connect(this.context.destination);

    this.sfxGain = this.context.createGain();
    this.sfxGain.gain.value = 0.95;
    this.sfxGain.connect(this.masterGain);

    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.masterGain);

    this.lobbyMusicGain = this.context.createGain();
    this.lobbyMusicGain.gain.value = 0;
    this.lobbyMusicGain.connect(this.masterGain);

    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0;
    this.windFilter = this.context.createBiquadFilter();
    this.windFilter.type = 'highpass';
    this.windFilter.frequency.value = 520;
    this.windFilter.Q.value = 0.8;
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    this.tireGain = this.context.createGain();
    this.tireGain.gain.value = 0;
    this.tireFilter = this.context.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 1180;
    this.tireFilter.Q.value = 7;
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.masterGain);

  }

  loadLobbyMusic() {
    if (this.lobbyMusicLoadStarted) {
      return;
    }

    this.lobbyMusicLoadStarted = true;
    this.updateLobbyMusicState();
  }

  async unlock() {
    try {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      this.userActivated = true;

      this.startProceduralEngine();
      this.startNoiseLayers();
      this.updateLobbyMusicState();
    } catch (error) {
      console.error('ENGINE SOUND UNLOCK ERROR:', error);
    }
  }

  setLobbyMusicActive(active) {
    this.lobbyMusicWanted = Boolean(active);
    this.updateLobbyMusicState();
  }

  updateLobbyMusicState() {
    const active = this.userActivated && this.lobbyMusicWanted;

    if (active && !this.lobbyMusicLoadStarted) {
      this.loadLobbyMusic();
    }

    const useProceduralMusic = active;

    if (useProceduralMusic) {
      this.startProceduralLobbyMusic();
    }

    if (this.lobbyMusicGain) {
      const now = this.context.currentTime;
      rampParam(this.lobbyMusicGain.gain, useProceduralMusic ? 0.24 : 0, now);
    }
  }

  startProceduralLobbyMusic() {
    if (this.proceduralMusicStarted) {
      return;
    }

    const now = this.context.currentTime;
    this.lobbyMusicOscillator = this.context.createOscillator();
    this.lobbyMusicAccentOscillator = this.context.createOscillator();
    this.lobbyMusicFilter = this.context.createBiquadFilter();
    this.lobbyMusicDriveGain = this.context.createGain();

    this.lobbyMusicOscillator.type = 'triangle';
    this.lobbyMusicAccentOscillator.type = 'sine';
    this.lobbyMusicOscillator.frequency.setValueAtTime(LOBBY_MUSIC_SEQUENCE[0], now);
    this.lobbyMusicAccentOscillator.frequency.setValueAtTime(LOBBY_MUSIC_SEQUENCE[0] * 1.5, now);
    this.lobbyMusicFilter.type = 'lowpass';
    this.lobbyMusicFilter.frequency.setValueAtTime(900, now);
    this.lobbyMusicFilter.Q.setValueAtTime(1.4, now);
    this.lobbyMusicDriveGain.gain.setValueAtTime(0.2, now);

    this.lobbyMusicOscillator.connect(this.lobbyMusicFilter);
    this.lobbyMusicAccentOscillator.connect(this.lobbyMusicFilter);
    this.lobbyMusicFilter.connect(this.lobbyMusicDriveGain);
    this.lobbyMusicDriveGain.connect(this.lobbyMusicGain);

    this.lobbyMusicOscillator.start(now);
    this.lobbyMusicAccentOscillator.start(now);
    this.proceduralMusicStarted = true;
    this.scheduleLobbyMusicStep();
    this.proceduralMusicTimer = window.setInterval(() => this.scheduleLobbyMusicStep(), 420);
  }

  scheduleLobbyMusicStep() {
    if (!this.proceduralMusicStarted) {
      return;
    }

    const now = this.context.currentTime;
    const note = LOBBY_MUSIC_SEQUENCE[this.proceduralMusicStep % LOBBY_MUSIC_SEQUENCE.length];
    const accent = note * (this.proceduralMusicStep % 4 === 0 ? 2 : 1.5);
    const filterFrequency = 720 + (this.proceduralMusicStep % 4) * 120;

    rampParam(this.lobbyMusicOscillator.frequency, note, now);
    rampParam(this.lobbyMusicAccentOscillator.frequency, accent, now);
    rampParam(this.lobbyMusicFilter.frequency, filterFrequency, now);
    this.proceduralMusicStep += 1;
  }

  startProceduralEngine() {
    if (this.proceduralEngineStarted) {
      return;
    }

    const now = this.context.currentTime;
    this.engineOscillatorLow = this.context.createOscillator();
    this.engineOscillatorHigh = this.context.createOscillator();
    this.engineFilter = this.context.createBiquadFilter();
    this.engineDriveGain = this.context.createGain();

    this.engineOscillatorLow.type = 'sawtooth';
    this.engineOscillatorHigh.type = 'triangle';
    this.engineOscillatorLow.frequency.setValueAtTime(52, now);
    this.engineOscillatorHigh.frequency.setValueAtTime(104, now);
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(520, now);
    this.engineFilter.Q.setValueAtTime(7, now);
    this.engineDriveGain.gain.setValueAtTime(0.18, now);

    this.engineOscillatorLow.connect(this.engineFilter);
    this.engineOscillatorHigh.connect(this.engineFilter);
    this.engineFilter.connect(this.engineDriveGain);
    this.engineDriveGain.connect(this.engineGain);

    this.engineOscillatorLow.start(now);
    this.engineOscillatorHigh.start(now);
    this.proceduralEngineStarted = true;
  }

  startNoiseLayers() {
    if (this.noiseLayersStarted) {
      return;
    }

    const noiseBuffer = createNoiseBuffer(this.context);
    this.windSource = this.context.createBufferSource();
    this.windSource.buffer = noiseBuffer;
    this.windSource.loop = true;
    this.windSource.connect(this.windFilter);
    this.windSource.start();

    this.tireSource = this.context.createBufferSource();
    this.tireSource.buffer = noiseBuffer;
    this.tireSource.loop = true;
    this.tireSource.connect(this.tireFilter);
    this.tireSource.start();

    this.noiseLayersStarted = true;
  }

  playTone(frequency, duration = 0.1, type = 'sine', volume = 0.24, delay = 0) {
    if (!this.userActivated) {
      return;
    }

    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gain);
    gain.connect(this.sfxGain);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  playCountdownTick(count = 3) {
    const frequency = count <= 1 ? 760 : 560;
    this.playTone(frequency, 0.13, 'square', 0.22);
    this.playTone(frequency * 1.5, 0.09, 'sine', 0.08, 0.035);
  }

  playRaceStart() {
    this.playTone(420, 0.08, 'square', 0.2);
    this.playTone(630, 0.09, 'square', 0.23, 0.08);
    this.playTone(940, 0.18, 'sawtooth', 0.19, 0.17);
    this.playBoost();
  }

  playCorrectKey() {
    const now = performance.now();
    if (now - this.lastCorrectSfxAt < 45) {
      return;
    }

    this.lastCorrectSfxAt = now;
    this.playTone(980, 0.045, 'triangle', 0.16);
  }

  playMistake() {
    this.playTone(150, 0.16, 'sawtooth', 0.36);
    this.playTone(90, 0.18, 'square', 0.18);
    this.playTone(62, 0.22, 'sawtooth', 0.26, 0.02);
    this.playTone(220, 0.08, 'triangle', 0.18, 0.06);
  }

  playFinish() {
    this.playTone(523, 0.1, 'triangle', 0.18);
    this.playTone(659, 0.1, 'triangle', 0.18, 0.1);
    this.playTone(784, 0.22, 'triangle', 0.2, 0.2);
  }

  playBoost() {
    this.playTone(330, 0.06, 'sawtooth', 0.22);
    this.playTone(660, 0.08, 'triangle', 0.3, 0.035);
    this.playTone(990, 0.12, 'sine', 0.2, 0.085);
  }

  playSegmentComplete() {
    this.playTone(520, 0.055, 'triangle', 0.22);
    this.playTone(780, 0.07, 'triangle', 0.24, 0.055);
    this.playTone(1040, 0.09, 'sine', 0.18, 0.12);
  }

  update(speed = 0, maxSpeed = 320, engineActive = true, effects = {}) {
    const normalized = THREE.MathUtils.clamp(speed / Math.max(1, maxSpeed), 0, 1);
    const turnAmount = THREE.MathUtils.clamp(Number(effects.turnAmount) || 0, 0, 1);
    const now = this.context.currentTime;

    if (this.userActivated) {
      this.startNoiseLayers();
    }

    if (this.windGain && this.tireGain) {
      const windVolume = this.userActivated && engineActive
        ? Math.max(0, normalized - 0.14) * 0.72
        : 0;
      const tireVolume = this.userActivated && engineActive
        ? Math.max(0, normalized - 0.3) * turnAmount * 1.05
        : 0;

      rampParam(this.windGain.gain, windVolume, now);
      rampParam(this.windFilter.frequency, 520 + normalized * 1150, now);
      rampParam(this.tireGain.gain, tireVolume, now);
      rampParam(this.tireFilter.frequency, 900 + normalized * 760, now);
    }

    if (this.userActivated && engineActive && !this.proceduralEngineStarted) {
      this.startProceduralEngine();
    }

    if (!this.proceduralEngineStarted) {
      return;
    }

    const lowFrequency = 48 + normalized * 145;
    const highFrequency = lowFrequency * (1.92 + normalized * 0.18);
    const filterFrequency = 420 + normalized * 1850;
    const engineVolume = this.userActivated && engineActive ? 0.028 + normalized * 0.19 : 0;

    rampParam(this.engineOscillatorLow.frequency, lowFrequency, now);
    rampParam(this.engineOscillatorHigh.frequency, highFrequency, now);
    rampParam(this.engineFilter.frequency, filterFrequency, now);
    rampParam(this.engineGain.gain, engineVolume, now);
  }
}
