import { NetworkClient } from './network.js';
import { TypingEngine } from './typing.js';

const FAST_INPUT_WINDOW_MS = 360;
const SLOW_INPUT_WINDOW_MS = 1100;
const SAVED_SESSION_KEY = 'f1TypingBattle.lastRoom';

class F1TypingBattleApp {
  constructor() {
    this.network = new NetworkClient();
    this.typing = new TypingEngine();
    this.game = null;
    this.currentScreen = 'menu';
    this.playerName = '';
    this.lastRoomCode = '';
    this.latestResults = [];
    this.elements = this.getElements();
  }

  getElements() {
    return {
      menuScreen: document.getElementById('menuScreen'),
      joinModal: document.getElementById('joinModal'),
      lobbyScreen: document.getElementById('lobbyScreen'),
      gameScreen: document.getElementById('gameScreen'),
      resultsScreen: document.getElementById('resultsScreen'),
      loadingScreen: document.getElementById('loadingScreen'),
      playerNameInput: document.getElementById('playerNameInput'),
      roomCodeInput: document.getElementById('roomCodeInput'),
      roomCodeDisplay: document.getElementById('roomCodeDisplay'),
      playersList: document.getElementById('playersList'),
      lobbyStateLabel: document.getElementById('lobbyStateLabel'),
      loadingText: document.getElementById('loadingText'),
      textToType: document.getElementById('textToType'),
      typingInput: document.getElementById('typingInput'),
      inputFeedback: document.getElementById('inputFeedback'),
      wpmDisplay: document.getElementById('wpmDisplay'),
      accuracyDisplay: document.getElementById('accuracyDisplay'),
      progressDisplay: document.getElementById('progressDisplay'),
      lapDisplay: document.getElementById('lapDisplay'),
      countdownOverlay: document.getElementById('countdownOverlay'),
      raceStatusLabel: document.getElementById('raceStatusLabel'),
      trackLoadingOverlay: document.getElementById('trackLoadingOverlay'),
      resultsList: document.getElementById('resultsList'),
      roomContextDisplay: document.getElementById('roomContextDisplay'),
      createRoomBtn: document.getElementById('createRoomBtn'),
      joinRoomBtn: document.getElementById('joinRoomBtn'),
      resumeRoomBtn: document.getElementById('resumeRoomBtn'),
      savedRoomHint: document.getElementById('savedRoomHint'),
      confirmJoinBtn: document.getElementById('confirmJoinBtn'),
      cancelJoinBtn: document.getElementById('cancelJoinBtn'),
      startRaceBtn: document.getElementById('startRaceBtn'),
      leaveLobbyBtn: document.getElementById('leaveLobbyBtn'),
      backToRoomBtn: document.getElementById('backToRoomBtn'),
      playAgainBtn: document.getElementById('playAgainBtn'),
      backToMenuBtn: document.getElementById('backToMenuBtn')
    };
  }

  async init() {
    this.showScreen('loading');
    this.elements.loadingText.textContent = 'Menghubungkan ke pusat balapan...';
    this.restoreSavedSession();
    this.bindUI();
    this.bindNetwork();

    try {
      await this.network.connect();
      await this.initGame();
      this.updateSavedRoomUI();
      this.showScreen('menu');
    } catch (error) {
      this.elements.loadingText.textContent = 'Koneksi gagal. Muat ulang untuk mencoba lagi.';
      console.error(error);
    }
  }

  async initGame() {
    try {
      const { Game3D } = await import('./game3d.js');
      this.game = new Game3D({
        canvas: document.getElementById('gameCanvas'),
        getLocalPlayerId: () => this.network.socket?.id || null
      });
      this.syncCircuitProfile();
    } catch (error) {
      this.game = null;
      if (this.elements.trackLoadingOverlay) {
        this.elements.trackLoadingOverlay.classList.add('hidden');
      }
      this.elements.raceStatusLabel.textContent = 'Mode Typing';
      console.warn('Scene 3D dinonaktifkan:', error);
    }
  }

  async safeResumeAudio() {
    try {
      await this.game?.resumeAudio();
      this.syncScreenAudio();
    } catch (error) {
      console.warn('Audio belum bisa diaktifkan:', error);
    }
  }

  bindUI() {
    this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
    this.elements.joinRoomBtn.addEventListener('click', () => this.openJoinModal());
    this.elements.resumeRoomBtn?.addEventListener('click', () => this.resumeLastRoom());
    this.elements.confirmJoinBtn.addEventListener('click', () => this.joinRoom());
    this.elements.cancelJoinBtn.addEventListener('click', () => this.closeJoinModal());
    this.elements.startRaceBtn.addEventListener('click', async () => {
      await this.safeResumeAudio();
      this.syncCircuitProfile();
      if (this.network.state === 'finished') {
        this.network.playAgain();
        return;
      }
      this.network.startRace();
    });
    this.elements.leaveLobbyBtn.addEventListener('click', () => this.leaveLobby());
    this.elements.backToRoomBtn.addEventListener('click', () => this.returnToRoom());
    this.elements.playAgainBtn.addEventListener('click', async () => this.playAgain());
    this.elements.backToMenuBtn.addEventListener('click', () => this.leaveLobby());
    this.elements.typingInput.addEventListener('keydown', (event) => this.handleTyping(event));
    window.addEventListener('pointerdown', () => {
      this.safeResumeAudio();
    }, { passive: true });

    window.addEventListener('trackLoaded', (event) => {
      const detail = event?.detail || {};
      this.syncCircuitProfile();
      if (this.elements.trackLoadingOverlay) {
        if (detail.success) {
          this.elements.trackLoadingOverlay.classList.add('hidden');
        } else {
          const loadingLabel = this.elements.trackLoadingOverlay.querySelector('p');
          if (loadingLabel) {
            loadingLabel.textContent = detail.pending
              ? 'Menggunakan lintasan cadangan. Model utama masih dimuat.'
              : 'Gagal memuat sirkuit. Menggunakan lintasan cadangan.';
          }
          this.elements.trackLoadingOverlay.classList.add('hidden');
        }
      }
    });
  }

  bindNetwork() {
    this.network.on('roomUpdated', (payload) => this.handleRoomUpdated(payload));
    this.network.on('countdownStart', (payload) => this.handleCountdownStart(payload));
    this.network.on('countdownTick', (payload) => this.handleCountdownTick(payload));
    this.network.on('raceStart', (payload) => this.handleRaceStart(payload));
    this.network.on('playerUpdate', (payload) => this.handlePlayerUpdate(payload));
    this.network.on('raceFinished', (payload) => this.handleRaceFinished(payload));
  }

  showScreen(name) {
    ['menu', 'lobby', 'game', 'results', 'loading'].forEach((screenName) => {
      const element = this.elements[`${screenName}Screen`];
      if (!element) {
        return;
      }
      element.classList.toggle('active', screenName === name);
      element.classList.toggle('hidden', screenName !== name);
    });
    this.currentScreen = name;
    this.syncScreenAudio();
    if (name === 'game') {
      requestAnimationFrame(() => this.elements.typingInput.focus());
    }
  }

  syncScreenAudio() {
    const shouldPlayLobbyMusic = this.currentScreen === 'lobby' || this.currentScreen === 'results';
    this.game?.setLobbyMusicActive(shouldPlayLobbyMusic);
  }

  syncCircuitProfile() {
    const profile = this.game?.getCircuitProfile?.();
    if (profile) {
      this.network.setCircuitProfile(profile);
    }
  }

  restoreSavedSession() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_SESSION_KEY) || 'null');
      if (!saved?.roomCode) {
        return;
      }

      this.lastRoomCode = String(saved.roomCode || '').trim().toUpperCase();
      this.playerName = String(saved.playerName || '').trim().slice(0, 20);

      if (this.playerName && !this.elements.playerNameInput.value.trim()) {
        this.elements.playerNameInput.value = this.playerName;
      }
    } catch (_error) {
      this.lastRoomCode = '';
    }
  }

  rememberRoom(roomCode, playerName = this.playerName) {
    const normalizedCode = String(roomCode || '').trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    this.lastRoomCode = normalizedCode;
    try {
      window.localStorage.setItem(SAVED_SESSION_KEY, JSON.stringify({
        roomCode: normalizedCode,
        playerName: String(playerName || '').trim().slice(0, 20)
      }));
    } catch (_error) {}

    this.updateSavedRoomUI();
  }

  getSavedRoomCode() {
    if (this.lastRoomCode) {
      return this.lastRoomCode;
    }

    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_SESSION_KEY) || 'null');
      return String(saved?.roomCode || '').trim().toUpperCase();
    } catch (_error) {
      return '';
    }
  }

  updateSavedRoomUI() {
    const roomCode = this.getSavedRoomCode();
    const hasActiveRoom = Boolean(this.network.roomCode);
    const canResume = Boolean(roomCode && !hasActiveRoom);

    this.elements.resumeRoomBtn?.classList.toggle('hidden', !canResume);
    this.elements.savedRoomHint?.classList.toggle('hidden', !canResume);

    if (canResume) {
      this.elements.resumeRoomBtn.textContent = `Lanjut Room ${roomCode}`;
      this.elements.savedRoomHint.textContent = `Room terakhir: ${roomCode}`;
    }
  }

  requireName() {
    const name = this.elements.playerNameInput.value.trim();
    if (!name) {
      alert('Masukkan nama pembalap dulu.');
      return null;
    }
    this.playerName = name;
    return name;
  }

  async createRoom() {
    const playerName = this.requireName();
    if (!playerName) {
      return;
    }
    await this.safeResumeAudio();
    this.showScreen('loading');
    this.elements.loadingText.textContent = 'Membuat ruang...';
    try {
      const response = await this.network.createRoom(playerName);
      this.rememberRoom(response.roomCode, playerName);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Ruang tidak bisa dibuat.');
      this.showScreen('menu');
    }
  }

  openJoinModal() {
    const playerName = this.requireName();
    if (!playerName) {
      return;
    }
    this.elements.roomCodeInput.value = '';
    this.elements.joinModal.classList.remove('hidden');
  }

  closeJoinModal() {
    this.elements.joinModal.classList.add('hidden');
  }

  async joinRoom() {
    const roomCode = this.elements.roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
      alert('Masukkan kode ruang.');
      return;
    }
    await this.safeResumeAudio();
    this.closeJoinModal();
    this.showScreen('loading');
    this.elements.loadingText.textContent = 'Masuk ke ruang...';
    try {
      await this.network.joinRoom(roomCode, this.playerName);
      this.rememberRoom(roomCode, this.playerName);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Tidak bisa masuk ke ruang.');
      this.showScreen('menu');
    }
  }

  async resumeLastRoom() {
    const roomCode = this.getSavedRoomCode();
    const playerName = this.requireName();

    if (!roomCode || !playerName) {
      return;
    }

    await this.safeResumeAudio();
    this.closeJoinModal();
    this.showScreen('loading');
    this.elements.loadingText.textContent = `Menyambung room ${roomCode}...`;

    try {
      await this.network.joinRoom(roomCode, playerName);
      this.rememberRoom(roomCode, playerName);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Room terakhir tidak bisa dibuka.');
      this.updateSavedRoomUI();
      this.showScreen('menu');
    }
  }

  leaveLobby() {
    this.network.leaveRoom();
    this.resetToMenu();
  }

  returnToRoom() {
    if (!this.network.roomCode) {
      this.resumeLastRoom();
      return;
    }

    this.elements.countdownOverlay.classList.add('hidden');
    this.showScreen('lobby');
    this.updateRoomActions();
  }

  async playAgain() {
    await this.safeResumeAudio();
    this.syncCircuitProfile();

    if (this.network.state !== 'finished') {
      this.returnToRoom();
      return;
    }

    const isHost = this.network.hostId === this.network.socket?.id;
    if (isHost) {
      this.network.playAgain();
      return;
    }

    this.returnToRoom();
  }

  resetToMenu() {
    this.typing.reset();
    this.latestResults = [];
    this.closeJoinModal();
    this.elements.countdownOverlay.classList.add('hidden');
    this.elements.inputFeedback.textContent = '';
    this.elements.inputFeedback.className = 'input-feedback';
    this.elements.raceStatusLabel.textContent = 'Grid Siap';
    this.updateSavedRoomUI();
    this.showScreen('menu');
  }

  updateRoomActions() {
    const playerCount = this.network.players?.length || 0;
    const isHost = this.network.hostId === this.network.socket?.id;
    const canStart = isHost && playerCount >= 1 && this.network.state === 'waiting';
    const canPlayAgain = isHost && playerCount >= 1 && this.network.state === 'finished';
    const hasRoom = Boolean(this.network.roomCode);

    this.elements.startRaceBtn.textContent = this.network.state === 'finished'
      ? 'Main Lagi'
      : 'Mulai Balapan';
    this.elements.startRaceBtn.disabled = !(canStart || canPlayAgain);

    if (this.network.state === 'finished') {
      this.elements.playAgainBtn.textContent = isHost ? 'Main Lagi' : 'Kembali ke Room';
      this.elements.playAgainBtn.disabled = isHost ? !canPlayAgain : !hasRoom;
    } else {
      this.elements.playAgainBtn.textContent = 'Kembali ke Room';
      this.elements.playAgainBtn.disabled = !hasRoom;
    }
  }

  handleRoomUpdated(payload) {
    this.network.roomCode = payload.roomCode;
    this.network.players = payload.players || [];
    this.network.hostId = payload.hostId || payload.players?.[0]?.id || null;
    this.network.state = payload.state;
    this.rememberRoom(payload.roomCode, this.playerName || this.elements.playerNameInput.value);

    if (payload.state === 'waiting' || this.currentScreen === 'loading') {
      this.showScreen('lobby');
    }

    this.elements.roomCodeDisplay.textContent = payload.roomCode;
    this.elements.lobbyStateLabel.textContent = this.formatState(payload.state);
    this.elements.playersList.innerHTML = '';

    this.network.players.forEach((player) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      const isYou = player.id === this.network.socket.id;
      const isHost = player.id === this.network.hostId;
      card.innerHTML = `
        <div>
          <strong>${this.escapeHtml(player.name)}</strong>
          <div class="player-meta">KPM ${player.wpm ?? 0} - Akurasi ${player.accuracy ?? 100}%</div>
        </div>
        ${isHost ? '<span class="badge">Tuan rumah</span>' : '<span></span>'}
        ${isYou ? '<span class="badge">Kamu</span>' : '<span></span>'}
      `;
      this.elements.playersList.appendChild(card);
    });

    this.updateRoomActions();
  }

  formatState(state) {
    if (state === 'waiting') return 'Menunggu pembalap';
    if (state === 'countdown') return 'Bersiap di grid';
    if (state === 'racing') return 'Balapan berjalan';
    if (state === 'finished') return 'Balapan selesai';
    return state;
  }

  handleCountdownStart(payload) {
    this.syncCircuitProfile();
    this.typing.setText(payload.text);
    this.game?.setRaceText(payload.text);
    this.renderTyping();
    this.elements.raceStatusLabel.textContent = 'Bersiap di Grid';
    this.elements.countdownOverlay.textContent = '3';
    this.elements.countdownOverlay.classList.remove('hidden');
    this.game?.prepareRaceGrid();
    this.showScreen('game');
  }

  handleCountdownTick(payload) {
    this.elements.countdownOverlay.textContent = String(payload.count);
    this.elements.countdownOverlay.classList.remove('hidden');
    this.game?.playCountdownTick(payload.count);
  }

  handleRaceStart(payload) {
    this.game?.setRaceText(payload.text);
    this.typing.start(payload.startTime);
    this.elements.countdownOverlay.classList.add('hidden');
    this.elements.raceStatusLabel.textContent = 'Balapan Berjalan';
    this.elements.typingInput.focus();
    this.game?.startRace(payload.startTime);
    this.game?.resumeAudio();
    this.game?.playRaceStart();
  }

  handlePlayerUpdate(payload) {
    this.game?.updatePlayers(payload.positions);
  }

  handleRaceFinished(payload) {
    this.latestResults = payload.results;
    this.network.state = 'finished';
    this.game?.stopRace();
    this.renderResults(payload.results);
    this.showScreen('results');
    this.updateRoomActions();
  }

  handleTyping(event) {
    if (this.currentScreen !== 'game') {
      return;
    }
    this.safeResumeAudio();
    event.preventDefault();
    const char = event.key;
    if (char.length !== 1) {
      return;
    }
    const result = this.typing.handleInput(char);
    if (!result.accepted) {
      return;
    }

    this.network.sendKeyTyped(char);
    this.renderTyping();

    if (result.correct) {
      this.game?.playCorrectInput();
      if (result.keyIntervalMs <= FAST_INPUT_WINDOW_MS) {
        this.elements.inputFeedback.textContent = 'Input tepat dan cepat. Kecepatan naik.';
      } else if (result.keyIntervalMs > SLOW_INPUT_WINDOW_MS) {
        this.elements.inputFeedback.textContent = 'Input tepat, tapi ritme lambat. Kecepatan turun.';
      } else {
        this.elements.inputFeedback.textContent = 'Input tepat. Kecepatan terjaga.';
      }
      this.elements.inputFeedback.className = 'input-feedback correct';
      if (result.segmentChanged) {
        this.game?.playSegmentComplete();
      }
    } else {
      this.game?.playMistakeInput();
      this.elements.inputFeedback.textContent = 'Salah ketik. Momentum mobil berkurang.';
      this.elements.inputFeedback.className = 'input-feedback error';
    }

    if (result.finished) {
      this.game?.playFinish();
      this.elements.inputFeedback.textContent = 'Putaran selesai. Pertahankan jalur.';
      this.elements.inputFeedback.className = 'input-feedback correct';
    }
  }

  renderTyping() {
    const display = this.typing.getDisplay();
    this.elements.textToType.innerHTML = `
      <span class="typed">${this.escapeHtml(display.typed)}</span><span class="current">${this.escapeHtml(display.current)}</span><span class="remaining">${this.escapeHtml(display.remaining)}</span>
    `;
    const stats = this.typing.getStats();
    const lapInfo = this.game?.getLapInfoForProgress?.(stats.progress) || {
      currentLap: 1,
      totalLaps: 1,
      lapProgress: stats.progress
    };
    this.elements.wpmDisplay.textContent = String(stats.wpm);
    this.elements.accuracyDisplay.textContent = `${stats.accuracy}%`;
    this.elements.progressDisplay.textContent = `${stats.progress}%`;
    if (this.elements.lapDisplay) {
      this.elements.lapDisplay.textContent = `${lapInfo.currentLap}/${lapInfo.totalLaps}`;
    }
    this.elements.textToType.dataset.segment = lapInfo.totalLaps > 1
      ? `${display.segmentIndex + 1}/${display.segmentCount || 1} - Lap ${lapInfo.currentLap}/${lapInfo.totalLaps}`
      : `${display.segmentIndex + 1}/${display.segmentCount || 1}`;
  }

  renderResults(results) {
    this.elements.resultsList.innerHTML = '';
    const roomCode = this.network.roomCode || this.getSavedRoomCode();
    if (this.elements.roomContextDisplay) {
      this.elements.roomContextDisplay.textContent = roomCode
        ? `Room ${roomCode} tetap aktif.`
        : '';
    }

    results.forEach((player) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <div>
          <strong>P${player.position} - ${this.escapeHtml(player.name)}</strong>
          <div class="result-meta">Progres ${player.progress}%</div>
        </div>
        <div class="result-meta">KPM ${player.wpm}</div>
        <div class="result-meta">Akurasi ${player.accuracy}%</div>
      `;
      this.elements.resultsList.appendChild(card);
    });
  }

  escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[character]));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const app = new F1TypingBattleApp();
  app.init();
});
