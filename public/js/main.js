import { NetworkClient } from './network.js';
import { TypingEngine } from './typing.js';

const FAST_INPUT_WINDOW_MS = 360;
const SLOW_INPUT_WINDOW_MS = 1100;
const SAVED_SESSION_KEY = 'f1TypingBattle.lastRoom';
const ROUTE_DEBUG_QUERY_PARAM = 'debugRoute';
const BROADCAST_HUD_QUERY_PARAM = 'broadcastHud';
const FINISH_REPLAY_DURATION_MS = 2600;

class F1TypingBattleApp {
  constructor() {
    this.network = new NetworkClient();
    this.typing = new TypingEngine();
    this.game = null;
    this.currentScreen = 'menu';
    this.playerName = '';
    this.lastRoomCode = '';
    this.latestResults = [];
    this.routeHudFrameId = null;
    this.lastRaceEventId = null;
    this.radioHideTimer = null;
    this.finishReplayTimer = null;
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
      lapCountSelect: document.getElementById('lapCountSelect'),
      lapOptionGroup: document.getElementById('lapOptionGroup'),
      lapPreviewValue: document.getElementById('lapPreviewValue'),
      lobbyStateLabel: document.getElementById('lobbyStateLabel'),
      loadingText: document.getElementById('loadingText'),
      textToType: document.getElementById('textToType'),
      typingInput: document.getElementById('typingInput'),
      inputFeedback: document.getElementById('inputFeedback'),
      wpmDisplay: document.getElementById('wpmDisplay'),
      accuracyDisplay: document.getElementById('accuracyDisplay'),
      progressDisplay: document.getElementById('progressDisplay'),
      lapDisplay: document.getElementById('lapDisplay'),
      timingTower: document.getElementById('timingTower'),
      engineerRadio: document.getElementById('engineerRadio'),
      engineerRadioText: document.getElementById('engineerRadioText'),
      finishReplayOverlay: document.getElementById('finishReplayOverlay'),
      speedDisplay: document.getElementById('speedDisplay'),
      gearDisplay: document.getElementById('gearDisplay'),
      drsBadge: document.getElementById('drsBadge'),
      gripMeter: document.getElementById('gripMeter'),
      momentumMeter: document.getElementById('momentumMeter'),
      routeMinimap: document.getElementById('routeMinimap'),
      routeHealthPanel: document.getElementById('routeHealthPanel'),
      routeHealthSource: document.getElementById('routeHealthSource'),
      routeHealthConfidence: document.getElementById('routeHealthConfidence'),
      routeHealthSnap: document.getElementById('routeHealthSnap'),
      routeHealthGuard: document.getElementById('routeHealthGuard'),
      cameraModeButtons: Array.from(document.querySelectorAll('.camera-mode')),
      countdownOverlay: document.getElementById('countdownOverlay'),
      raceStatusLabel: document.getElementById('raceStatusLabel'),
      trackLoadingOverlay: document.getElementById('trackLoadingOverlay'),
      resultsList: document.getElementById('resultsList'),
      winnerDisplay: document.getElementById('winnerDisplay'),
      roomContextDisplay: document.getElementById('roomContextDisplay'),
      createRoomBtn: document.getElementById('createRoomBtn'),
      joinRoomBtn: document.getElementById('joinRoomBtn'),
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
    document.body.classList.toggle('broadcast-hud', this.isBroadcastHudEnabled());
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
      this.updateCameraModeButtons();
      this.syncCircuitProfile();
      this.startRouteHudLoop();
    } catch (error) {
      this.game = null;
      if (this.elements.trackLoadingOverlay) {
        this.elements.trackLoadingOverlay.classList.add('hidden');
      }
      this.elements.raceStatusLabel.textContent = 'Mode Typing';
      console.warn('Scene 3D dinonaktifkan:', error);
    }
  }

  isRouteDebugEnabled() {
    try {
      return new URLSearchParams(window.location.search).has(ROUTE_DEBUG_QUERY_PARAM);
    } catch (_error) {
      return false;
    }
  }

  isBroadcastHudEnabled() {
    try {
      return new URLSearchParams(window.location.search).has(BROADCAST_HUD_QUERY_PARAM);
    } catch (_error) {
      return false;
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

  async playResultsMusic() {
    try {
      await this.game?.setResultsMusicActive(true);
    } catch (error) {
      console.warn('Musik after race belum bisa diputar:', error);
    }
  }

  stopResultsMusic() {
    this.game?.setResultsMusicActive(false);
  }

  bindUI() {
    this.elements.createRoomBtn.addEventListener('click', () => this.createRoom());
    this.elements.joinRoomBtn.addEventListener('click', () => this.openJoinModal());
    this.elements.confirmJoinBtn.addEventListener('click', () => this.joinRoom());
    this.elements.cancelJoinBtn.addEventListener('click', () => this.closeJoinModal());
    this.elements.lapOptionGroup?.addEventListener('click', (event) => {
      const button = event.target.closest('.lap-option');

      if (!button || button.disabled) {
        return;
      }

      const selectedLap = button.dataset.lap;

      if (!selectedLap || !this.elements.lapCountSelect) {
        return;
      }

      this.elements.lapCountSelect.value = selectedLap;
      this.network.setLapCount(selectedLap);
      this.updateLapSelect();
    });

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
    this.elements.cameraModeButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const nextMode = this.game?.setCameraMode(button.dataset.cameraMode);
        this.updateCameraModeButtons(nextMode);
      });
    });

    window.addEventListener('pointerdown', () => {
      this.safeResumeAudio();
    }, { passive: true });

    window.addEventListener('trackLoaded', (event) => {
      const detail = event?.detail || {};
      this.syncCircuitProfile();
      this.renderRouteHud();

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
    const shouldPlayLobbyMusic = ['menu', 'loading', 'lobby'].includes(this.currentScreen);
    this.game?.setLobbyMusicActive(shouldPlayLobbyMusic);

    if (this.currentScreen !== 'results') {
      this.stopResultsMusic();
    }
  }

  syncCircuitProfile() {
    const profile = this.game?.getCircuitProfile?.();
    if (profile) {
      this.network.setCircuitProfile(profile);
    }
  }

  updateCameraModeButtons(activeMode = this.game?.getCameraMode?.()) {
    this.elements.cameraModeButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.cameraMode === activeMode);
    });
  }

  startRouteHudLoop() {
    if (this.routeHudFrameId) {
      return;
    }

    const tick = () => {
      this.routeHudFrameId = requestAnimationFrame(tick);

      if (this.currentScreen === 'game') {
        this.renderRouteHud();
      }
    };

    this.routeHudFrameId = requestAnimationFrame(tick);
  }

  renderRouteHud() {
    const telemetry = this.game?.getRouteTelemetry?.();

    if (!telemetry) {
      return;
    }

    this.drawRouteMinimap(telemetry);
    this.updateCameraModeButtons(telemetry.cameraMode);

    const showHealth = this.isRouteDebugEnabled();
    this.elements.routeHealthPanel?.classList.toggle('hidden', !showHealth);

    if (!showHealth) {
      return;
    }

    const confidence = telemetry.confidence
      ? `${Math.round(telemetry.confidence * 100)}%`
      : '-';
    const snap = telemetry.snapCoverage
      ? `${Math.round(telemetry.snapCoverage * 100)}% / ${telemetry.maxSnapDistance.toFixed(1)}`
      : '-';
    const guard = `${telemetry.guardCorrections || 0}${telemetry.cameraCollision ? ' / cam' : ''}`;

    if (this.elements.routeHealthSource) {
      this.elements.routeHealthSource.textContent = telemetry.source || '-';
    }
    if (this.elements.routeHealthConfidence) {
      this.elements.routeHealthConfidence.textContent = confidence;
    }
    if (this.elements.routeHealthSnap) {
      this.elements.routeHealthSnap.textContent = snap;
    }
    if (this.elements.routeHealthGuard) {
      this.elements.routeHealthGuard.textContent = guard;
    }
  }

  drawRouteMinimap(telemetry) {
    const canvas = this.elements.routeMinimap;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    const cssWidth = Math.max(120, Math.round(canvas.clientWidth || canvas.width));
    const cssHeight = Math.max(88, Math.round(canvas.clientHeight || canvas.height));
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    if (canvas.width !== Math.round(cssWidth * pixelRatio)) {
      canvas.width = Math.round(cssWidth * pixelRatio);
    }

    if (canvas.height !== Math.round(cssHeight * pixelRatio)) {
      canvas.height = Math.round(cssHeight * pixelRatio);
    }

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = 'rgba(8, 10, 9, 0.72)';
    context.fillRect(0, 0, cssWidth, cssHeight);

    const samples = telemetry.samples || [];
    const bounds = telemetry.bounds || {};
    const padding = 12;
    const rangeX = Math.max(1, (bounds.maxX || 1) - (bounds.minX || -1));
    const rangeZ = Math.max(1, (bounds.maxZ || 1) - (bounds.minZ || -1));
    const range = Math.max(rangeX, rangeZ);
    const offsetX = (range - rangeX) * 0.5;
    const offsetZ = (range - rangeZ) * 0.5;
    const mapPoint = (point) => ({
      x: padding + (((point.x - bounds.minX) + offsetX) / range) * (cssWidth - padding * 2),
      y: cssHeight - padding - (((point.z - bounds.minZ) + offsetZ) / range) * (cssHeight - padding * 2)
    });

    context.strokeStyle = 'rgba(245, 247, 242, 0.1)';
    context.lineWidth = 1;
    context.strokeRect(7, 7, cssWidth - 14, cssHeight - 14);

    (telemetry.blockedZones || []).forEach((zone) => {
      const center = mapPoint(zone);
      const radius = (zone.radius / range) * (cssWidth - padding * 2);
      context.beginPath();
      context.arc(center.x, center.y, Math.max(4, radius), 0, Math.PI * 2);
      context.fillStyle = 'rgba(255, 61, 85, 0.18)';
      context.fill();
      context.strokeStyle = 'rgba(255, 61, 85, 0.62)';
      context.lineWidth = 1.5;
      context.stroke();
    });

    if (samples.length > 1) {
      context.beginPath();
      samples.forEach((sample, index) => {
        const point = mapPoint(sample);

        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.closePath();
      context.strokeStyle = telemetry.source === 'manual'
        ? 'rgba(255, 212, 71, 0.94)'
        : 'rgba(0, 255, 112, 0.94)';
      context.lineWidth = 2.5;
      context.stroke();

      const carSample = samples[Math.min(samples.length - 1, Math.floor((telemetry.progress || 0) * samples.length))];
      const carPoint = mapPoint(carSample);
      context.beginPath();
      context.arc(carPoint.x, carPoint.y, 4.5, 0, Math.PI * 2);
      context.fillStyle = '#ffb23f';
      context.fill();
      context.strokeStyle = '#101410';
      context.lineWidth = 2;
      context.stroke();
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
    } catch (_error) { }

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
    return;
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
    this.stopResultsMusic();
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
    const canEditLapCount = isHost && (this.network.state === 'waiting' || this.network.state === 'finished');

    this.elements.startRaceBtn.textContent = this.network.state === 'finished'
      ? 'Main Lagi'
      : 'Mulai Balapan';

    this.elements.startRaceBtn.disabled = !(canStart || canPlayAgain);

    if (this.elements.lapCountSelect) {
      this.elements.lapCountSelect.disabled = !canEditLapCount;
    }

    const lapButtons = this.elements.lapOptionGroup?.querySelectorAll('.lap-option') || [];
    lapButtons.forEach((button) => {
      button.disabled = !canEditLapCount;
    });

    if (this.network.state === 'finished') {
      this.elements.playAgainBtn.textContent = isHost ? 'Main Lagi' : 'Kembali ke Room';
      this.elements.playAgainBtn.disabled = isHost ? !canPlayAgain : !hasRoom;
    } else {
      this.elements.playAgainBtn.textContent = 'Kembali ke Room';
      this.elements.playAgainBtn.disabled = !hasRoom;
    }
  }

  updateLapSelect() {
    if (!this.elements.lapCountSelect) {
      return;
    }

    const selectedLap = String(this.network.lapCount || 1);
    this.elements.lapCountSelect.value = selectedLap;

    if (this.elements.lapPreviewValue) {
      this.elements.lapPreviewValue.textContent = selectedLap;
    }

    const isDisabled = !!this.elements.lapCountSelect.disabled;
    const buttons = this.elements.lapOptionGroup?.querySelectorAll('.lap-option') || [];

    buttons.forEach((button) => {
      const isActive = button.dataset.lap === selectedLap;
      button.classList.toggle('active', isActive);
      button.disabled = isDisabled;
    });
  }

  handleRoomUpdated(payload) {
    this.network.roomCode = payload.roomCode;
    this.network.players = payload.players || [];
    this.network.hostId = payload.hostId || payload.players?.[0]?.id || null;
    this.network.state = payload.state;

    if (Number.isFinite(Number(payload.lapCount))) {
      this.network.lapCount = Math.max(1, Math.min(5, Math.round(Number(payload.lapCount))));
    }

    this.network.applyCircuitProfile(payload.circuit);
    this.network.lapCount = Math.max(1, Math.min(5, Math.round(Number(payload.lapCount) || this.network.lapCount || 1)));
    this.rememberRoom(payload.roomCode, this.playerName || this.elements.playerNameInput.value);

    if (payload.state === 'waiting' || this.currentScreen === 'loading') {
      this.showScreen('lobby');
    }

    this.elements.roomCodeDisplay.textContent = payload.roomCode;
    this.elements.lobbyStateLabel.textContent = this.formatState(payload.state);
    this.updateLapSelect();
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
    this.stopResultsMusic();
    this.network.applyCircuitProfile(payload.circuit);

    if (Number.isFinite(Number(payload.lapCount))) {
      this.network.lapCount = Math.max(1, Math.min(5, Math.round(Number(payload.lapCount))));
    }

    this.updateLapSelect();
    this.syncCircuitProfile();
    this.typing.setText(payload.text);
    this.game?.setRaceText(payload.text, this.network.lapCount);
    this.network.lapCount = Math.max(1, Math.min(5, Math.round(Number(payload.lapCount) || this.network.lapCount || 1)));
    this.updateLapSelect();
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

  async handleRaceStart(payload) {
    this.stopResultsMusic();
    this.network.applyCircuitProfile(payload.circuit);

    if (Number.isFinite(Number(payload.lapCount))) {
      this.network.lapCount = Math.max(1, Math.min(5, Math.round(Number(payload.lapCount))));
    }

    this.updateLapSelect();
    this.game?.setRaceText(payload.text, this.network.lapCount);
    this.network.lapCount = Math.max(1, Math.min(5, Math.round(Number(payload.lapCount) || this.network.lapCount || 1)));
    this.updateLapSelect();
    this.typing.start(payload.startTime);
    this.lastRaceEventId = null;
    this.elements.countdownOverlay.classList.add('hidden');
    this.elements.raceStatusLabel.textContent = 'Balapan Berjalan';
    this.elements.typingInput.focus();
    this.game?.startRace(payload.startTime);
    await this.game?.resumeAudio();
    this.game?.playRaceStart();
  }

  handlePlayerUpdate(payload) {
    const positions = payload.positions || [];

    this.game?.updatePlayers(positions);
    if (this.isBroadcastHudEnabled()) {
      this.renderTimingTower(positions);
    } else if (this.elements.timingTower) {
      this.elements.timingTower.innerHTML = '';
    }
    this.renderCarTelemetry(positions);
    this.handleRaceEvents(positions);
  }

  handleRaceEvents(positions = []) {
    if (!Array.isArray(positions) || this.currentScreen !== 'game') {
      return;
    }

    const localPlayerId = this.network.socket?.id;
    const localPlayer = positions.find((player) => player.id === localPlayerId);
    const event = localPlayer?.raceEvent;

    if (!event || event.id === this.lastRaceEventId || Date.now() > event.expiresAt) {
      return;
    }

    this.lastRaceEventId = event.id;
    this.game?.playRaceEvent?.(event.type);
    this.showEngineerRadio(event.message || 'Event balapan aktif.', event.type);

    if (this.elements.inputFeedback) {
      this.elements.inputFeedback.textContent = event.message || 'Event balapan aktif.';
      this.elements.inputFeedback.className = event.type === 'grip_loss'
        ? 'input-feedback error'
        : 'input-feedback correct';
    }
  }

  showEngineerRadio(message, type = 'neutral') {
    if (!this.elements.engineerRadio || !this.elements.engineerRadioText) {
      return;
    }

    window.clearTimeout(this.radioHideTimer);
    this.elements.engineerRadioText.textContent = message;
    this.elements.engineerRadio.dataset.type = type;
    this.elements.engineerRadio.classList.remove('hidden');

    this.radioHideTimer = window.setTimeout(() => {
      this.elements.engineerRadio?.classList.add('hidden');
    }, 3000);
  }

  async handleRaceFinished(payload) {
    this.latestResults = payload.results;
    this.network.state = 'finished';
    this.game?.triggerFinishCeremony?.();
    this.game?.startFinishReplay?.(FINISH_REPLAY_DURATION_MS);
    this.showFinishReplay(payload.results);

    window.clearTimeout(this.finishReplayTimer);
    this.finishReplayTimer = window.setTimeout(async () => {
      this.game?.stopRace();
      this.hideFinishReplay();
      this.renderResults(payload.results);
      this.showScreen('results');
      await this.playResultsMusic();
      this.updateRoomActions();
    }, FINISH_REPLAY_DURATION_MS);
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
      const stats = this.typing.getStats();

      if (stats.streak > 0 && stats.streak % 18 === 0) {
        this.elements.inputFeedback.textContent = 'Streak bersih. DRS siap memberi dorongan.';
        this.game?.playRaceEvent?.('drs');
        this.showEngineerRadio('DRS enabled. Keep the rhythm clean.', 'drs');
      } else if (result.keyIntervalMs <= FAST_INPUT_WINDOW_MS) {
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
      this.showEngineerRadio('Grip loss. Reset the rhythm and keep it tidy.', 'grip_loss');
    }

    if (result.finished) {
      this.game?.playFinish();
      this.elements.inputFeedback.textContent = 'Putaran selesai. Pertahankan jalur.';
      this.elements.inputFeedback.className = 'input-feedback correct';
      this.showEngineerRadio('Checkered flag. Bring it home.', 'finish');
    }
  }

  renderTimingTower(positions = []) {
    if (!this.elements.timingTower) {
      return;
    }

    if (!Array.isArray(positions) || !positions.length || this.currentScreen !== 'game') {
      this.elements.timingTower.innerHTML = '';
      return;
    }

    const localPlayerId = this.network.socket?.id;
    const leaderProgress = Math.max(...positions.map((player) => Number(player.progressExact ?? player.progress) || 0));
    const rows = positions
      .slice()
      .sort((a, b) => (a.position || 99) - (b.position || 99))
      .slice(0, 8)
      .map((player) => {
        const progress = Number(player.progressExact ?? player.progress) || 0;
        const gap = player.position === 1
          ? 'LEADER'
          : `+${Math.max(0, leaderProgress - progress).toFixed(1)}%`;
        const status = player.drsActive
          ? 'DRS'
          : player.finalPushActive
            ? 'PUSH'
            : player.sector || 'RACE';

        return `
          <div class="timing-row ${player.id === localPlayerId ? 'local' : ''} ${player.isGhost ? 'ghost' : ''}">
            <span class="timing-pos">P${player.position || '-'}</span>
            <strong>${this.escapeHtml(player.name || 'Pembalap')}</strong>
            <small>${gap}</small>
            <em>${this.escapeHtml(status)}</em>
          </div>
        `;
      })
      .join('');

    this.elements.timingTower.innerHTML = `
      <div class="timing-head">
        <span>Timing</span>
        <strong>Live</strong>
      </div>
      ${rows}
    `;
  }

  renderCarTelemetry(positions = []) {
    const localPlayerId = this.network.socket?.id;
    const localPlayer = Array.isArray(positions)
      ? positions.find((player) => player.id === localPlayerId)
      : null;

    if (!localPlayer) {
      return;
    }

    const speed = Math.max(0, Math.round(Number(localPlayer.speed) || 0));
    const gear = speed <= 4 ? 'N' : String(Math.max(1, Math.min(8, Math.ceil(speed / 42))));
    const grip = Math.max(0, Math.min(120, Math.round(Number(localPlayer.grip) || 100)));
    const momentum = Math.max(0, Math.min(150, Math.round(Number(localPlayer.momentum) || 100)));

    if (this.elements.speedDisplay) {
      this.elements.speedDisplay.textContent = String(speed);
    }

    if (this.elements.gearDisplay) {
      this.elements.gearDisplay.textContent = gear;
    }

    if (this.elements.drsBadge) {
      this.elements.drsBadge.classList.toggle('active', Boolean(localPlayer.drsActive));
    }

    if (this.elements.gripMeter) {
      this.elements.gripMeter.style.width = `${Math.min(100, grip)}%`;
    }

    if (this.elements.momentumMeter) {
      this.elements.momentumMeter.style.width = `${Math.min(100, Math.round((momentum / 140) * 100))}%`;
    }
  }

  showFinishReplay(results = []) {
    if (!this.elements.finishReplayOverlay) {
      return;
    }

    const winner = Array.isArray(results) ? results[0] : null;
    this.elements.finishReplayOverlay.querySelector('strong').textContent = winner
      ? `${winner.name} wins`
      : 'Finish Replay';
    this.elements.finishReplayOverlay.classList.remove('hidden');
    this.elements.raceStatusLabel.textContent = 'FINISH';
    this.showEngineerRadio('Checkered flag. Great drive to the line.', 'finish');
  }

  hideFinishReplay() {
    this.elements.finishReplayOverlay?.classList.add('hidden');
  }

  renderTyping() {
    const display = this.typing.getDisplay();

    this.elements.textToType.innerHTML = `
      <span class="typed">${this.escapeHtml(display.typed)}</span><span class="current">${this.escapeHtml(display.current)}</span><span class="remaining">${this.escapeHtml(display.remaining)}</span>
    `;

    const stats = this.typing.getStats();
    const lapInfo = this.getLapInfoForProgress(stats.progress);

    this.elements.wpmDisplay.textContent = String(stats.wpm);
    this.elements.accuracyDisplay.textContent = `${stats.accuracy}%`;
    this.elements.progressDisplay.textContent = `${stats.progress}%`;

    if (this.elements.lapDisplay) {
      this.elements.lapDisplay.textContent = `${lapInfo.completedLaps}/${lapInfo.totalLaps}`;
    }

    this.elements.textToType.dataset.segment = lapInfo.totalLaps > 1
      ? `${display.segmentIndex + 1}/${display.segmentCount || 1} - Lap ${lapInfo.completedLaps}/${lapInfo.totalLaps}`
      : `${display.segmentIndex + 1}/${display.segmentCount || 1} - Lap ${lapInfo.completedLaps}/${lapInfo.totalLaps}`;
  }

  getLapInfoForProgress(progressPercent = 0) {
    if (this.game?.getLapInfoForProgress) {
      return this.game.getLapInfoForProgress(progressPercent);
    }

    const totalLaps = Math.max(1, Math.min(5, Math.round(Number(this.network.lapCount) || 1)));
    const normalizedProgress = Math.max(0, Math.min(1, Number(progressPercent) / 100 || 0));
    const absoluteProgress = normalizedProgress * totalLaps;

    const completedLaps = normalizedProgress >= 1
      ? totalLaps
      : Math.max(0, Math.min(totalLaps, Math.floor(absoluteProgress)));

    const currentLap = normalizedProgress >= 1
      ? totalLaps
      : Math.min(totalLaps, completedLaps + 1);

    const lapProgress = normalizedProgress >= 1
      ? 100
      : Math.round((absoluteProgress - completedLaps) * 100);

    return {
      completedLaps,
      currentLap,
      totalLaps,
      lapProgress
    };
  }

  renderResults(results) {
    this.elements.resultsList.innerHTML = '';
    const roomCode = this.network.roomCode || this.getSavedRoomCode();
    const winner = Array.isArray(results) ? results[0] : null;

    if (this.elements.roomContextDisplay) {
      this.elements.roomContextDisplay.textContent = roomCode
        ? `Room ${roomCode} tetap aktif.`
        : '';
    }

    if (this.elements.winnerDisplay) {
      this.elements.winnerDisplay.textContent = winner
        ? `${winner.name} finis P${winner.position}`
        : 'Podium siap';
    }

    results.forEach((player) => {
      const card = document.createElement('div');
      card.className = `result-card ${player.isGhost ? 'ghost-result' : ''}`;
      const bestSector = player.bestSector?.label
        ? `${player.bestSector.label} ${this.formatDuration(player.bestSector.timeMs)}`
        : '-';
      const typoText = `${player.mistakes ?? 0}/${player.totalKeys ?? 0}`;

      card.innerHTML = `
        <div>
          <strong>P${player.position} - ${this.escapeHtml(player.name)}${player.isGhost ? ' · Ghost' : ''}</strong>
          <div class="result-meta">Progres ${player.progress}% · Streak ${player.longestStreak ?? 0}</div>
        </div>
        <div class="result-meta">KPM ${player.wpm}</div>
        <div class="result-meta">Akurasi ${player.accuracy}%</div>
        <div class="result-meta">Typo ${typoText}</div>
        <div class="result-meta">Grip ${player.grip ?? 100}%</div>
        <div class="result-meta">Best ${this.escapeHtml(bestSector)}</div>
      `;

      this.elements.resultsList.appendChild(card);
    });
  }

  formatDuration(timeMs = 0) {
    const seconds = Math.max(0, Number(timeMs) || 0) / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2)}s`;
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
