import { NetworkClient } from './network.js';
import { TypingEngine } from './typing.js';
import { FirebaseRaceService, isFirebaseConfigured } from './firebase-service.js';

const FAST_INPUT_WINDOW_MS = 360;
const SLOW_INPUT_WINDOW_MS = 1100;
const SAVED_SESSION_KEY = 'f1TypingBattle.lastRoom';
const AUDIO_SETTINGS_KEY = 'f1TypingBattle.audioSettings';
const ROUTE_DEBUG_QUERY_PARAM = 'debugRoute';
const BROADCAST_HUD_QUERY_PARAM = 'broadcastHud';
const FINISH_REPLAY_DURATION_MS = 2600;
const DEFAULT_BOT_DIFFICULTY = 'medium';
const MAX_ROOM_PLAYERS = 8;

class F1TypingBattleApp {
  constructor() {
    this.network = new NetworkClient();
    this.firebase = new FirebaseRaceService();
    this.typing = new TypingEngine();
    this.game = null;
    this.currentScreen = 'menu';
    this.playerName = '';
    this.selectedMode = 'multiplayer';
    this.selectedBotDifficulty = DEFAULT_BOT_DIFFICULTY;
    this.audioSettings = this.loadAudioSettings();
    this.isGameMenuOpen = false;
    this.wasPausedByMenu = false;
    this.lastRoomCode = '';
    this.latestResults = [];
    this.orderedResults = [];
    this.resultsPageIndex = 0;
    this.routeHudFrameId = null;
    this.lastRaceEventId = null;
    this.radioHideTimer = null;
    this.finishReplayTimer = null;
    this.isTrackReady = false;
    this.isAuthRequestActive = false;
    this.isChatPanelOpen = false;
    this.hasShownInitialAuthPrompt = false;
    this.pendingModeAfterLogin = '';
    this.authPromptMessage = '';
    this.unreadChatCount = 0;
    this.roomMaxPlayers = MAX_ROOM_PLAYERS;
    this.chatMessageIds = new Set();
    this.latestPresenceUsers = [];
    this.elements = this.getElements();
  }

  getElements() {
    return {
      menuScreen: document.getElementById('menuScreen'),
      raceCommsPanel: document.getElementById('raceCommsPanel'),
      chatToggleBtn: document.getElementById('chatToggleBtn'),
      chatUnreadBadge: document.getElementById('chatUnreadBadge'),
      chatCloseBtn: document.getElementById('chatCloseBtn'),
      gameMenuModal: document.getElementById('gameMenuModal'),
      multiplayerSetupScreen: document.getElementById('multiplayerSetupScreen'),
      aiSetupScreen: document.getElementById('aiSetupScreen'),
      joinModal: document.getElementById('joinModal'),
      lobbyScreen: document.getElementById('lobbyScreen'),
      gameScreen: document.getElementById('gameScreen'),
      resultsScreen: document.getElementById('resultsScreen'),
      loadingScreen: document.getElementById('loadingScreen'),
      authModal: document.getElementById('authModal'),
      authOpenBtn: document.getElementById('authOpenBtn'),
      authCloseBtn: document.getElementById('authCloseBtn'),
      appConnectionLabel: document.getElementById('appConnectionLabel'),
      playerNameInput: document.getElementById('playerNameInput'),
      authPanel: document.querySelector('.auth-panel'),
      authStateLabel: document.getElementById('authStateLabel'),
      authNameInput: document.getElementById('authNameInput'),
      authEmailInput: document.getElementById('authEmailInput'),
      authPasswordInput: document.getElementById('authPasswordInput'),
      authEmailLoginBtn: document.getElementById('authEmailLoginBtn'),
      authLoginBtn: document.getElementById('authLoginBtn'),
      authRegisterBtn: document.getElementById('authRegisterBtn'),
      authLogoutBtn: document.getElementById('authLogoutBtn'),
      firebaseStatusText: document.getElementById('firebaseStatusText'),
      authUserLabel: document.getElementById('authUserLabel'),
      onlineUsersList: document.getElementById('onlineUsersList'),
      chatMessages: document.getElementById('chatMessages'),
      chatForm: document.getElementById('chatForm'),
      chatInput: document.getElementById('chatInput'),
      sendChatBtn: document.getElementById('sendChatBtn'),
      voiceToggleBtn: document.getElementById('voiceToggleBtn'),
      modeButtons: Array.from(document.querySelectorAll('.mode-switch .mode-card[data-mode]')),
      resumeRoomBtn: document.getElementById('resumeRoomBtn'),
      savedRoomHint: document.getElementById('savedRoomHint'),
      aiSetupPanel: document.getElementById('aiSetupPanel'),
      botDifficultyGroup: document.getElementById('botDifficultyGroup'),
      difficultyButtons: Array.from(document.querySelectorAll('.difficulty-option')),
      aiLapCountSelect: document.getElementById('aiLapCountSelect'),
      aiLapOptionGroup: document.getElementById('aiLapOptionGroup'),
      multiplayerDriverName: document.getElementById('multiplayerDriverName'),
      aiDriverName: document.getElementById('aiDriverName'),
      settingsBtn: document.getElementById('settingsBtn'),
      gameMenuBtn: document.getElementById('gameMenuBtn'),
      bgmVolumeInput: document.getElementById('bgmVolumeInput'),
      bgmVolumeValue: document.getElementById('bgmVolumeValue'),
      muteBgmBtn: document.getElementById('muteBgmBtn'),
      sfxVolumeInput: document.getElementById('sfxVolumeInput'),
      sfxVolumeValue: document.getElementById('sfxVolumeValue'),
      muteSfxBtn: document.getElementById('muteSfxBtn'),
      resumeGameBtn: document.getElementById('resumeGameBtn'),
      restartAiRaceBtn: document.getElementById('restartAiRaceBtn'),
      gameMenuMainMenuBtn: document.getElementById('gameMenuMainMenuBtn'),
      closeMenuBtn: document.getElementById('closeMenuBtn'),
      gameMenuModeLabel: document.getElementById('gameMenuModeLabel'),
      gameMenuTitle: document.getElementById('gameMenuTitle'),
      aiPauseNotice: document.getElementById('aiPauseNotice'),
      roomCodeInput: document.getElementById('roomCodeInput'),
      roomCodeDisplay: document.getElementById('roomCodeDisplay'),
      copyRoomCodeBtn: document.getElementById('copyRoomCodeBtn'),
      lobbyModeLabel: document.getElementById('lobbyModeLabel'),
      lobbyRoomMeta: document.getElementById('lobbyRoomMeta'),
      raceOptionsPanel: document.getElementById('raceOptionsPanel'),
      playersList: document.getElementById('playersList'),
      lobbyDriverCount: document.getElementById('lobbyDriverCount'),
      lobbyHintText: document.getElementById('lobbyHintText'),
      lapCountSelect: document.getElementById('lapCountSelect'),
      lapOptionGroup: document.getElementById('lapOptionGroup'),
      lapPreviewValue: document.getElementById('lapPreviewValue'),
      lobbyStateLabel: document.getElementById('lobbyStateLabel'),
      trackReadyLabel: document.getElementById('trackReadyLabel'),
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
      resultsPager: document.getElementById('resultsPager'),
      resultsPrevBtn: document.getElementById('resultsPrevBtn'),
      resultsNextBtn: document.getElementById('resultsNextBtn'),
      resultsPageLabel: document.getElementById('resultsPageLabel'),
      podiumGrid: document.getElementById('podiumGrid'),
      winnerDisplay: document.getElementById('winnerDisplay'),
      roomContextDisplay: document.getElementById('roomContextDisplay'),
      createRoomBtn: document.getElementById('createRoomBtn'),
      joinRoomBtn: document.getElementById('joinRoomBtn'),
      startAiBtn: document.getElementById('startAiBtn'),
      backFromMultiplayerBtn: document.getElementById('backFromMultiplayerBtn'),
      backFromAiBtn: document.getElementById('backFromAiBtn'),
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
    this.elements.loadingText.textContent = 'Connecting to race control...';
    this.restoreSavedSession();
    this.bindUI();
    this.bindNetwork();
    this.bindFirebase();
    this.initFirebase();

    try {
      await this.network.connect();
      if (this.elements.appConnectionLabel) {
        this.elements.appConnectionLabel.textContent = 'Server online';
        this.elements.appConnectionLabel.classList.add('online');
      }
      await this.initGame();
      this.updateSavedRoomUI();
      this.showScreen('menu');
    } catch (error) {
      this.elements.loadingText.textContent = 'Connection failed. Reload to try again.';
      if (this.elements.appConnectionLabel) {
        this.elements.appConnectionLabel.textContent = 'Server offline';
        this.elements.appConnectionLabel.classList.remove('online');
      }
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
      this.applyAudioSettings();
      this.updateCameraModeButtons();
      this.syncCircuitProfile();
      this.startRouteHudLoop();
    } catch (error) {
      this.game = null;
      this.isTrackReady = true;
      if (this.elements.trackLoadingOverlay) {
        this.elements.trackLoadingOverlay.classList.add('hidden');
      }
      this.elements.raceStatusLabel.textContent = 'Mode Typing';
      this.updateRoomActions();
      console.warn('3D scene disabled:', error);
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
      this.applyAudioSettings();
      this.syncScreenAudio();
    } catch (error) {
      console.warn('Audio could not be enabled yet:', error);
    }
  }

  async playResultsMusic() {
    try {
      await this.game?.setResultsMusicActive(true);
    } catch (error) {
      console.warn('After-race music could not be played:', error);
    }
  }

  stopResultsMusic() {
    this.game?.setResultsMusicActive(false);
  }

  bindUI() {
    this.syncAudioSettingsUI();
    this.elements.authEmailLoginBtn?.addEventListener('click', () => this.loginWithFirebase());
    this.elements.authRegisterBtn?.addEventListener('click', () => this.registerWithFirebase());
    this.elements.authLoginBtn?.addEventListener('click', () => this.loginWithGoogleFirebase());
    this.elements.authLogoutBtn?.addEventListener('click', () => this.logoutFromFirebase());
    this.elements.authOpenBtn?.addEventListener('click', () => this.handleAuthButtonClick());
    this.elements.authCloseBtn?.addEventListener('click', () => this.closeAuthModal());
    this.elements.authModal?.addEventListener('click', (event) => {
      if (event.target === this.elements.authModal) {
        this.closeAuthModal();
      }
    });
    this.elements.chatForm?.addEventListener('submit', (event) => this.sendChatMessage(event));
    this.elements.chatToggleBtn?.addEventListener('click', () => this.toggleChatPanel());
    this.elements.chatCloseBtn?.addEventListener('click', () => this.setChatPanelOpen(false));
    this.elements.voiceToggleBtn?.addEventListener('click', () => this.toggleVoiceChat());
    this.elements.resumeRoomBtn?.addEventListener('click', () => this.resumeLastRoom());
    this.elements.copyRoomCodeBtn?.addEventListener('click', () => this.copyRoomCode());
    this.elements.playerNameInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.openModeSetup(this.selectedMode);
      }
    });
    this.elements.authPasswordInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.loginWithFirebase();
      }
    });
    this.elements.createRoomBtn?.addEventListener('click', () => this.createRoom());
    this.elements.joinRoomBtn?.addEventListener('click', () => this.openJoinModal());
    this.elements.startAiBtn?.addEventListener('click', () => this.createVsAiRace());
    this.elements.modeButtons.forEach((button) => {
      button.addEventListener('click', () => this.openModeSetup(button.dataset.mode));
    });
    this.elements.backFromMultiplayerBtn?.addEventListener('click', () => this.showScreen('menu'));
    this.elements.backFromAiBtn?.addEventListener('click', () => this.showScreen('menu'));
    this.elements.settingsBtn?.addEventListener('click', () => this.openAudioMenu());
    this.elements.gameMenuBtn?.addEventListener('click', () => this.openGameMenu());
    this.elements.resumeGameBtn?.addEventListener('click', () => this.resumeFromGameMenu());
    this.elements.restartAiRaceBtn?.addEventListener('click', () => this.restartAiRace());
    this.elements.closeMenuBtn?.addEventListener('click', () => this.closeUnifiedMenu());
    this.elements.gameMenuMainMenuBtn?.addEventListener('click', () => this.exitToMainMenuFromGame());
    this.elements.bgmVolumeInput?.addEventListener('input', () => this.updateAudioSetting('bgm'));
    this.elements.sfxVolumeInput?.addEventListener('input', () => this.updateAudioSetting('sfx'));
    this.elements.muteBgmBtn?.addEventListener('click', () => this.toggleAudioMute('bgm'));
    this.elements.muteSfxBtn?.addEventListener('click', () => this.toggleAudioMute('sfx'));
    this.elements.botDifficultyGroup?.addEventListener('click', (event) => {
      const button = event.target.closest('.difficulty-option');

      if (!button) {
        return;
      }

      this.selectedBotDifficulty = button.dataset.difficulty || DEFAULT_BOT_DIFFICULTY;
      this.updateDifficultySelect();
    });
    this.elements.aiLapOptionGroup?.addEventListener('click', (event) => {
      const button = event.target.closest('.compact-lap-option');

      if (!button || !this.elements.aiLapCountSelect) {
        return;
      }

      this.elements.aiLapCountSelect.value = button.dataset.lap || '1';
      this.updateAiLapSelect();
    });
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
      if (!this.isTrackReady) {
        return;
      }

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
    this.elements.resultsPrevBtn?.addEventListener('click', () => this.changeResultsPage(-1));
    this.elements.resultsNextBtn?.addEventListener('click', () => this.changeResultsPage(1));
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
      this.isTrackReady = true;
      this.syncCircuitProfile();
      this.renderRouteHud();
      this.updateRoomActions();

      if (this.elements.trackLoadingOverlay) {
        if (detail.success) {
          this.elements.trackLoadingOverlay.classList.add('hidden');
        } else {
          const loadingLabel = this.elements.trackLoadingOverlay.querySelector('p');
          if (loadingLabel) {
            loadingLabel.textContent = detail.pending
              ? 'Using fallback track. Main model is still loading.'
              : 'Circuit failed to load. Using fallback track.';
          }
          this.elements.trackLoadingOverlay.classList.add('hidden');
        }
      }
    });
  }

  openModeSetup(mode = 'multiplayer') {
    if (!this.requireSignedIn('Sign in to choose a race mode.')) {
      this.pendingModeAfterLogin = mode === 'ai' ? 'ai' : 'multiplayer';
      return;
    }

    const playerName = this.requireName();
    if (!playerName) {
      return;
    }

    this.selectedMode = mode === 'ai' ? 'ai' : 'multiplayer';

    this.elements.modeButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === this.selectedMode);
    });

    if (this.elements.multiplayerDriverName) {
      this.elements.multiplayerDriverName.textContent = playerName;
    }

    if (this.elements.aiDriverName) {
      this.elements.aiDriverName.textContent = playerName;
    }

    this.showScreen(this.selectedMode === 'ai' ? 'aiSetup' : 'multiplayerSetup');
  }

  updateDifficultySelect() {
    this.elements.difficultyButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.difficulty === this.selectedBotDifficulty);
    });
  }

  updateAiLapSelect() {
    const selectedLap = this.elements.aiLapCountSelect?.value || '1';
    const buttons = this.elements.aiLapOptionGroup?.querySelectorAll('.compact-lap-option') || [];

    buttons.forEach((button) => {
      button.classList.toggle('active', button.dataset.lap === selectedLap);
    });
  }

  bindNetwork() {
    this.network.on('roomUpdated', (payload) => this.handleRoomUpdated(payload));
    this.network.on('countdownStart', (payload) => this.handleCountdownStart(payload));
    this.network.on('countdownTick', (payload) => this.handleCountdownTick(payload));
    this.network.on('raceStart', (payload) => this.handleRaceStart(payload));
    this.network.on('racePaused', (payload) => this.handleRacePaused(payload));
    this.network.on('raceResumed', (payload) => this.handleRaceResumed(payload));
    this.network.on('playerUpdate', (payload) => this.handlePlayerUpdate(payload));
    this.network.on('raceFinished', (payload) => this.handleRaceFinished(payload));
  }

  bindFirebase() {
    this.firebase.on('statusChanged', (payload) => this.handleFirebaseStatus(payload));
    this.firebase.on('authChanged', (payload) => this.handleFirebaseAuth(payload));
    this.firebase.on('messageAdded', (message) => this.renderChatMessage(message));
    this.firebase.on('presenceChanged', (payload) => this.renderPresence(payload.users || []));
    this.firebase.on('voiceChanged', (payload) => this.updateVoiceState(payload.active));
    this.firebase.on('voiceLevelChanged', (payload) => this.updateLocalVoiceLevel(payload));
    this.firebase.on('roomChanged', () => this.updateCommsVisibility());
  }

  initFirebase() {
    this.updateFirebaseControls({
      configured: isFirebaseConfigured,
      ready: false,
      message: isFirebaseConfigured ? 'Connecting Firebase...' : 'Firebase is not configured.'
    });

    this.firebase.init().catch((error) => {
      console.error(error);
      this.updateFirebaseControls({
        configured: isFirebaseConfigured,
        ready: false,
        message: 'Firebase failed to load.'
      });
    });
  }

  handleFirebaseStatus(payload) {
    this.updateFirebaseControls(payload);
  }

  handleFirebaseAuth(payload) {
    const user = payload.user;
    const displayName = payload.displayName || user?.displayName || '';

    if (displayName) {
      this.playerName = displayName.slice(0, 20);

      if (this.elements.playerNameInput && !this.elements.playerNameInput.value.trim()) {
        this.elements.playerNameInput.value = this.playerName;
      }

      if (this.elements.authNameInput) {
        this.elements.authNameInput.value = displayName;
      }
    }

    this.updateFirebaseControls({
      configured: isFirebaseConfigured,
      ready: this.firebase.ready,
      message: user ? 'Firebase online.' : 'Sign in for chat and voice.'
    });

    if (user && this.network.roomCode) {
      this.joinFirebaseRoom(this.network.roomCode);
    }

    if (user && this.currentScreen === 'menu' && !this.isAuthRequestActive && !this.pendingModeAfterLogin) {
      this.closeAuthModal();
    }

    if (user && this.pendingModeAfterLogin && this.currentScreen === 'menu') {
      const pendingMode = this.pendingModeAfterLogin;
      this.pendingModeAfterLogin = '';
      requestAnimationFrame(() => this.openModeSetup(pendingMode));
    }
  }

  handleAuthButtonClick() {
    this.openAuthModal();
  }

  openAuthModal(message = '') {
    if (message) {
      this.authPromptMessage = message;
      if (this.elements.authStateLabel && !this.firebase.getCurrentUser()) {
        this.elements.authStateLabel.textContent = message;
      }
    }

    this.elements.authModal?.classList.remove('hidden');
    requestAnimationFrame(() => {
      if (this.firebase.getCurrentUser()) {
        this.elements.authLogoutBtn?.focus();
        return;
      }

      const target = this.elements.authEmailInput?.value
        ? this.elements.authPasswordInput
        : this.elements.authEmailInput;
      target?.focus();
    });
  }

  closeAuthModal() {
    this.elements.authModal?.classList.add('hidden');
  }

  updateFirebaseControls(payload = {}) {
    const user = this.firebase.getCurrentUser();
    const isReady = Boolean(payload.ready || this.firebase.ready);
    const isConfigured = Boolean(payload.configured ?? isFirebaseConfigured);
    const isLoggedIn = Boolean(user);
    const roomActive = Boolean(this.network.roomCode && isLoggedIn && isReady);
    const statusText = !isConfigured
      ? 'Config missing'
      : payload.message || (isReady ? 'Firebase ready' : 'Firebase loading');

    if (this.elements.firebaseStatusText) {
      this.elements.firebaseStatusText.textContent = statusText;
    }

    if (this.elements.authStateLabel) {
      if (isLoggedIn) {
        this.authPromptMessage = '';
      }

      this.elements.authStateLabel.textContent = isLoggedIn
        ? `Signed in as ${user.displayName || this.firebase.displayName || user.email || 'User'}`
        : this.authPromptMessage || (isReady ? 'Signed out. Login to unlock race control.' : statusText);
    }

    if (this.elements.authUserLabel) {
      this.elements.authUserLabel.textContent = isLoggedIn
        ? (user.displayName || this.firebase.displayName || user.email || 'User')
        : 'Not signed in';
    }

    this.elements.authPanel?.classList.toggle('signed-in', isLoggedIn);

    if (this.elements.authOpenBtn) {
      this.elements.authOpenBtn.textContent = isLoggedIn
        ? (user.displayName || this.firebase.displayName || 'Account')
        : 'Login';
      this.elements.authOpenBtn.classList.toggle('signed-in', isLoggedIn);
    }

    if (this.elements.authLoginBtn) {
      this.elements.authLoginBtn.disabled = this.isAuthRequestActive || !isConfigured || !isReady || isLoggedIn;
      const label = this.elements.authLoginBtn.querySelector('span:last-child');

      if (label) {
        label.textContent = this.isAuthRequestActive
          ? 'Opening Google...'
          : isLoggedIn ? 'Google connected' : 'Login with Google';
      }
    }

    [this.elements.authEmailLoginBtn, this.elements.authRegisterBtn].forEach((button) => {
      if (button) {
        button.disabled = !isConfigured || !isReady || isLoggedIn;
      }
    });

    this.elements.authLogoutBtn?.classList.toggle('hidden', !isLoggedIn);
    if (this.elements.authLogoutBtn) {
      this.elements.authLogoutBtn.disabled = !isReady || !isLoggedIn;
    }

    if (this.elements.sendChatBtn) {
      this.elements.sendChatBtn.disabled = !roomActive;
    }

    if (this.elements.chatInput) {
      this.elements.chatInput.disabled = !roomActive;
      this.elements.chatInput.placeholder = roomActive
        ? 'Type a message'
        : isLoggedIn ? 'Join a room first' : 'Sign in to chat';
    }

    if (this.elements.chatMessages) {
      this.elements.chatMessages.dataset.emptyLabel = roomActive
        ? 'No messages in this room yet.'
        : isLoggedIn ? 'Join a room to use chat.' : 'Sign in with Firebase for chat and voice.';
    }

    if (this.elements.voiceToggleBtn) {
      this.elements.voiceToggleBtn.disabled = !roomActive;
    }

    this.updateAuthGateControls({
      isLoggedIn,
      isConfigured,
      isReady
    });
    this.updateCommsVisibility();
  }

  updateAuthGateControls({ isLoggedIn = false, isConfigured = isFirebaseConfigured, isReady = this.firebase.ready } = {}) {
    const shouldLock = isConfigured && isReady && !isLoggedIn;
    document.body.classList.toggle('auth-locked', shouldLock);

    this.elements.modeButtons.forEach((button) => {
      button.classList.toggle('locked', shouldLock);
      button.setAttribute('aria-disabled', String(shouldLock));
      button.title = shouldLock ? 'Sign in to play' : '';
    });

    if (this.elements.resumeRoomBtn) {
      const hasRoom = Boolean(this.getSavedRoomCode());
      this.elements.resumeRoomBtn.disabled = !hasRoom || !this.network.socket?.connected || shouldLock;
      this.elements.resumeRoomBtn.title = shouldLock ? 'Sign in to rejoin this room' : '';
    }

    if (shouldLock && this.currentScreen === 'menu' && !this.hasShownInitialAuthPrompt) {
      this.hasShownInitialAuthPrompt = true;
      this.openAuthModal('Sign in to unlock race control.');
    }
  }

  requireSignedIn(message = 'Sign in to continue.') {
    if (!isFirebaseConfigured) {
      alert('Firebase config is required before playing.');
      return false;
    }

    if (!this.firebase.ready || !this.firebase.getCurrentUser()) {
      this.openAuthModal(message);
      return false;
    }

    return true;
  }

  applySignedInName(user) {
    const name = String(user?.displayName || user?.email?.split('@')[0] || '').trim().slice(0, 20);

    if (!name) {
      return;
    }

    this.playerName = name;

    if (this.elements.playerNameInput) {
      this.elements.playerNameInput.value = name;
    }
  }

  getAuthFormValues() {
    return {
      displayName: this.elements.authNameInput?.value?.trim() || this.elements.playerNameInput?.value?.trim() || '',
      email: this.elements.authEmailInput?.value?.trim() || '',
      password: this.elements.authPasswordInput?.value || ''
    };
  }

  async loginWithFirebase() {
    try {
      const values = this.getAuthFormValues();
      const user = await this.firebase.login(values);
      this.applySignedInName({
        displayName: values.displayName || user.displayName,
        email: user.email
      });

      this.closeAuthModal();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Email login failed.');
    }
  }

  async registerWithFirebase() {
    try {
      const values = this.getAuthFormValues();
      const user = await this.firebase.register(values);
      this.applySignedInName({
        displayName: values.displayName || user.displayName,
        email: user.email
      });

      this.closeAuthModal();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Registration failed.');
    }
  }

  isGooglePopupCancelError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');

    return [
      'auth/cancelled-popup-request',
      'auth/popup-closed-by-user',
      'auth/user-cancelled'
    ].includes(code) || /cancelled-popup-request|popup-closed-by-user/i.test(message);
  }

  async loginWithGoogleFirebase() {
    if (this.isAuthRequestActive) {
      return;
    }

    this.isAuthRequestActive = true;
    this.updateFirebaseControls({
      configured: isFirebaseConfigured,
      ready: this.firebase.ready,
      message: 'Opening Google sign-in...'
    });

    try {
      const user = await this.firebase.loginWithGoogle();
      this.applySignedInName(user);

      this.closeAuthModal();
    } catch (error) {
      if (this.firebase.getCurrentUser()) {
        this.closeAuthModal();
        return;
      }

      if (this.isGooglePopupCancelError(error)) {
        console.warn('Google sign-in canceled:', error);
        this.updateFirebaseControls({
          configured: isFirebaseConfigured,
          ready: this.firebase.ready,
          message: 'Google sign-in canceled.'
        });
        return;
      }

      console.error(error);
      const message = error?.code === 'auth/popup-blocked'
        ? 'Google popup was blocked. Allow popups for this site, then try again.'
        : error.message || 'Google login failed.';
      alert(message);
    } finally {
      this.isAuthRequestActive = false;
      this.updateFirebaseControls();
    }
  }

  async logoutFromFirebase() {
    try {
      await this.firebase.logout();
      this.chatMessageIds.clear();
      this.resetChatDrawer();
      if (this.elements.chatMessages) {
        this.elements.chatMessages.innerHTML = '';
      }
      this.renderPresence([]);
      this.updateFirebaseControls({
        configured: isFirebaseConfigured,
        ready: this.firebase.ready,
        message: 'Signed out.'
      });
    } catch (error) {
      console.error(error);
      alert(error.message || 'Firebase logout failed.');
    }
  }

  async joinFirebaseRoom(roomCode) {
    if (!this.firebase.ready || !this.firebase.getCurrentUser()) {
      this.updateFirebaseControls();
      return;
    }

    try {
      const normalizedRoomCode = String(roomCode || '').trim().toUpperCase();
      const isNewFirebaseRoom = this.firebase.currentRoomCode !== normalizedRoomCode;
      await this.firebase.setDisplayName(this.playerName || this.elements.playerNameInput?.value);
      await this.firebase.joinRoom(normalizedRoomCode, this.playerName || this.elements.playerNameInput?.value, this.network.socket?.id || '');

      if (isNewFirebaseRoom && this.elements.chatMessages) {
        this.chatMessageIds.clear();
        this.resetChatDrawer();
        this.elements.chatMessages.innerHTML = '';
      }

      this.updateFirebaseControls();
    } catch (error) {
      console.warn('Firebase room sync failed:', error);
      this.updateFirebaseControls({
        configured: isFirebaseConfigured,
        ready: this.firebase.ready,
        message: 'Firebase room sync failed.'
      });
    }
  }

  async leaveFirebaseRoom() {
    try {
      await this.firebase.leaveRoom();
    } catch (error) {
      console.warn('Firebase leave failed:', error);
    }

    this.chatMessageIds.clear();
    this.resetChatDrawer();
    if (this.elements.chatMessages) {
      this.elements.chatMessages.innerHTML = '';
    }
    this.renderPresence([]);
    this.updateFirebaseControls();
  }

  async sendChatMessage(event) {
    event.preventDefault();

    const text = this.elements.chatInput?.value || '';

    try {
      const sent = await this.firebase.sendMessage(text);

      if (sent && this.elements.chatInput) {
        this.elements.chatInput.value = '';
      }
    } catch (error) {
      console.error(error);
      alert(error.message || 'Message could not be sent.');
    }
  }

  async toggleVoiceChat() {
    try {
      await this.firebase.toggleVoice();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Voice chat could not be enabled.');
      this.updateVoiceState(false);
    }
  }

  isCommsAvailable() {
    return Boolean(
      this.elements.raceCommsPanel
      && this.network.roomCode
      && ['lobby', 'results'].includes(this.currentScreen)
    );
  }

  resetChatDrawer() {
    this.isChatPanelOpen = false;
    this.unreadChatCount = 0;
    this.updateCommsVisibility();
  }

  setChatPanelOpen(isOpen) {
    const canShow = this.isCommsAvailable();
    this.isChatPanelOpen = Boolean(isOpen && canShow);

    if (this.isChatPanelOpen) {
      this.unreadChatCount = 0;
    }

    this.updateCommsVisibility();

    if (this.isChatPanelOpen) {
      requestAnimationFrame(() => {
        if (this.elements.chatMessages) {
          this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        }
      });
    }
  }

  toggleChatPanel() {
    this.setChatPanelOpen(!this.isChatPanelOpen);
  }

  updateChatUnreadBadge() {
    const unreadCount = Math.min(this.unreadChatCount, 99);

    if (!this.elements.chatUnreadBadge) {
      return;
    }

    this.elements.chatUnreadBadge.textContent = this.unreadChatCount > 99 ? '99+' : String(unreadCount);
    this.elements.chatUnreadBadge.classList.toggle('hidden', unreadCount <= 0);
  }

  updateCommsVisibility() {
    const canShow = this.isCommsAvailable();

    if (!canShow) {
      this.isChatPanelOpen = false;
      this.unreadChatCount = 0;
    }

    const shouldOpenPanel = canShow && this.isChatPanelOpen;

    this.elements.chatToggleBtn?.classList.toggle('hidden', !canShow);
    this.elements.chatToggleBtn?.classList.toggle('has-unread', this.unreadChatCount > 0);
    this.elements.chatToggleBtn?.setAttribute('aria-expanded', String(shouldOpenPanel));
    this.elements.raceCommsPanel?.classList.toggle('hidden', !shouldOpenPanel);
    document.body.classList.toggle('chat-open', shouldOpenPanel);
    this.updateChatUnreadBadge();
  }

  updateVoiceState(active) {
    if (!this.elements.voiceToggleBtn) {
      return;
    }

    this.elements.voiceToggleBtn.classList.toggle('active', Boolean(active));
    this.elements.voiceToggleBtn.classList.toggle('speaking', false);
    this.elements.voiceToggleBtn.style.removeProperty('--voice-level');
    this.elements.voiceToggleBtn.textContent = active ? 'LIVE' : 'MIC';
    this.elements.voiceToggleBtn.title = active ? 'Turn off open mic' : 'Turn on open mic';
  }

  updateLocalVoiceLevel(payload = {}) {
    if (!this.elements.voiceToggleBtn) {
      return;
    }

    const active = Boolean(payload.active);
    const speaking = active && Boolean(payload.speaking);
    const voiceLevel = Math.max(0, Math.min(100, Math.round(Number(payload.voiceLevel) || 0)));

    this.elements.voiceToggleBtn.classList.toggle('speaking', speaking);
    this.elements.voiceToggleBtn.style.setProperty('--voice-level', `${voiceLevel}%`);
    this.elements.voiceToggleBtn.title = active
      ? speaking ? 'Open mic on - speaking' : 'Open mic on'
      : 'Turn on open mic';

    const currentUid = this.firebase.getCurrentUser()?.uid;
    const currentPresence = currentUid
      ? this.latestPresenceUsers.find((user) => user.uid === currentUid)
      : null;

    if (currentPresence) {
      currentPresence.mic = active;
      currentPresence.speaking = speaking;
      currentPresence.voiceLevel = voiceLevel;
      this.renderPlayerVoiceIndicators();
    }
  }

  renderChatMessage(message) {
    if (!message?.id || this.chatMessageIds.has(message.id)) {
      return;
    }

    this.chatMessageIds.add(message.id);

    if (!this.elements.chatMessages) {
      return;
    }

    const row = document.createElement('div');
    const isOwn = message.uid && message.uid === this.firebase.getCurrentUser()?.uid;
    const timestamp = Number(message.createdAt);
    const timeText = Number.isFinite(timestamp)
      ? new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      : '';

    row.className = `chat-message ${isOwn ? 'own' : ''}`;
    row.innerHTML = `
      <div class="chat-message-meta">
      <strong>${this.escapeHtml(message.name || 'Driver')}</strong>
        <span>${this.escapeHtml(timeText)}</span>
      </div>
      <p>${this.escapeHtml(message.text || '')}</p>
    `;

    this.elements.chatMessages.appendChild(row);

    while (this.elements.chatMessages.children.length > 80) {
      this.elements.chatMessages.firstElementChild?.remove();
    }

    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;

    if (!isOwn && this.isCommsAvailable() && !this.isChatPanelOpen) {
      this.unreadChatCount += 1;
      this.updateChatUnreadBadge();
    }
  }

  renderPresence(users = []) {
    this.latestPresenceUsers = users;

    if (!this.elements.onlineUsersList) {
      return;
    }

    if (!users.length) {
      this.elements.onlineUsersList.innerHTML = '<span class="presence-empty">No users online</span>';
      this.renderPlayerVoiceIndicators();
      return;
    }

    this.elements.onlineUsersList.innerHTML = users
      .map((user) => {
        const state = user.state === 'offline' ? 'offline' : 'online';
        const micOn = Boolean(user.mic);
        const speaking = micOn && Boolean(user.speaking);
        const voiceLevel = Math.max(0, Math.min(100, Math.round(Number(user.voiceLevel) || 0)));
        const micTitle = micOn
          ? speaking ? 'Mic on - speaking' : 'Mic on'
          : 'Mic off';

        return `
          <div class="presence-user ${state} ${micOn ? 'mic-on' : 'mic-off'} ${speaking ? 'speaking' : ''}" style="--voice-level: ${voiceLevel}%">
            <span class="presence-dot"></span>
            <strong>${this.escapeHtml(user.displayName || 'User')}</strong>
            <span class="presence-mic-status" title="${this.escapeHtml(micTitle)}" aria-label="${this.escapeHtml(micTitle)}">
              <span class="presence-mic-icon"></span>
            </span>
            <span class="voice-wave" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="speaking-label">Speaking</span>
          </div>
        `;
      })
      .join('');

    this.renderPlayerVoiceIndicators();
  }

  getVoiceStateForPlayer(playerId) {
    const playerKey = String(playerId || '');
    const user = this.latestPresenceUsers.find((presenceUser) => String(presenceUser.playerId || '') === playerKey);
    const micOn = Boolean(user?.mic);
    const speaking = micOn && Boolean(user?.speaking);
    const voiceLevel = Math.max(0, Math.min(100, Math.round(Number(user?.voiceLevel) || 0)));
    const label = micOn
      ? speaking ? 'Speaking' : 'Mic on'
      : 'Mic off';

    return {
      micOn,
      speaking,
      voiceLevel,
      label,
      title: label
    };
  }

  renderDriverVoiceMarkup(playerId) {
    const voice = this.getVoiceStateForPlayer(playerId);
    const stateClass = voice.micOn ? 'mic-on' : 'mic-off';
    const speakingClass = voice.speaking ? 'speaking' : '';

    return `
      <div class="driver-voice-row ${stateClass} ${speakingClass}" data-driver-voice style="--voice-level: ${voice.voiceLevel}%">
        <span class="presence-mic-status driver-voice-status" title="${this.escapeHtml(voice.title)}" aria-label="${this.escapeHtml(voice.title)}">
          <span class="presence-mic-icon"></span>
        </span>
        <span class="driver-voice-label">${this.escapeHtml(voice.label)}</span>
        <span class="voice-wave" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
    `;
  }

  renderPlayerVoiceIndicators() {
    if (!this.elements.playersList) {
      return;
    }

    this.elements.playersList.querySelectorAll('.player-card[data-player-id]').forEach((card) => {
      const voice = this.getVoiceStateForPlayer(card.dataset.playerId);
      const voiceRow = card.querySelector('[data-driver-voice]');
      const voiceLabel = card.querySelector('.driver-voice-label');
      const voiceStatus = card.querySelector('.driver-voice-status');

      card.classList.toggle('mic-on', voice.micOn);
      card.classList.toggle('mic-off', !voice.micOn);
      card.classList.toggle('speaking', voice.speaking);
      card.style.setProperty('--voice-level', `${voice.voiceLevel}%`);

      voiceRow?.classList.toggle('mic-on', voice.micOn);
      voiceRow?.classList.toggle('mic-off', !voice.micOn);
      voiceRow?.classList.toggle('speaking', voice.speaking);
      voiceRow?.style.setProperty('--voice-level', `${voice.voiceLevel}%`);

      if (voiceLabel) {
        voiceLabel.textContent = voice.label;
      }

      if (voiceStatus) {
        voiceStatus.title = voice.title;
        voiceStatus.setAttribute('aria-label', voice.title);
      }
    });
  }

  loadAudioSettings() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(AUDIO_SETTINGS_KEY) || 'null');
      return {
        bgm: this.clampVolume(saved?.bgm, 0.65),
        sfx: this.clampVolume(saved?.sfx, 0.75),
        bgmMuted: Boolean(saved?.bgmMuted),
        sfxMuted: Boolean(saved?.sfxMuted)
      };
    } catch (_error) {
      return { bgm: 0.65, sfx: 0.75, bgmMuted: false, sfxMuted: false };
    }
  }

  clampVolume(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }

    return Math.max(0, Math.min(1, number));
  }

  saveAudioSettings() {
    try {
      window.localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(this.audioSettings));
    } catch (_error) {}
  }

  syncAudioSettingsUI() {
    const bgmPercent = Math.round(this.audioSettings.bgm * 100);
    const sfxPercent = Math.round(this.audioSettings.sfx * 100);

    if (this.elements.bgmVolumeInput) {
      this.elements.bgmVolumeInput.value = String(bgmPercent);
    }

    if (this.elements.sfxVolumeInput) {
      this.elements.sfxVolumeInput.value = String(sfxPercent);
    }

    if (this.elements.bgmVolumeValue) {
      this.elements.bgmVolumeValue.textContent = this.audioSettings.bgmMuted ? 'Muted' : `${bgmPercent}%`;
    }

    if (this.elements.sfxVolumeValue) {
      this.elements.sfxVolumeValue.textContent = this.audioSettings.sfxMuted ? 'Muted' : `${sfxPercent}%`;
    }

    if (this.elements.muteBgmBtn) {
      this.elements.muteBgmBtn.textContent = this.audioSettings.bgmMuted ? 'Unmute BGM' : 'Mute BGM';
      this.elements.muteBgmBtn.classList.toggle('active', this.audioSettings.bgmMuted);
    }

    if (this.elements.muteSfxBtn) {
      this.elements.muteSfxBtn.textContent = this.audioSettings.sfxMuted ? 'Unmute SFX' : 'Mute SFX';
      this.elements.muteSfxBtn.classList.toggle('active', this.audioSettings.sfxMuted);
    }
  }

  updateAudioSetting(type) {
    if (type === 'bgm') {
      this.audioSettings.bgm = this.clampVolume(Number(this.elements.bgmVolumeInput?.value || 0) / 100, 0.65);
      this.audioSettings.bgmMuted = false;
    }

    if (type === 'sfx') {
      this.audioSettings.sfx = this.clampVolume(Number(this.elements.sfxVolumeInput?.value || 0) / 100, 0.75);
      this.audioSettings.sfxMuted = false;
    }

    this.syncAudioSettingsUI();
    this.applyAudioSettings();
    this.saveAudioSettings();
  }

  toggleAudioMute(type) {
    if (type === 'bgm') {
      this.audioSettings.bgmMuted = !this.audioSettings.bgmMuted;
    }

    if (type === 'sfx') {
      this.audioSettings.sfxMuted = !this.audioSettings.sfxMuted;
    }

    this.syncAudioSettingsUI();
    this.applyAudioSettings();
    this.saveAudioSettings();
  }

  applyAudioSettings() {
    this.game?.setAudioVolumes?.({
      bgm: this.audioSettings.bgmMuted ? 0 : this.audioSettings.bgm,
      sfx: this.audioSettings.sfxMuted ? 0 : this.audioSettings.sfx
    });
  }

  openAudioMenu() {
    this.syncAudioSettingsUI();
    this.isGameMenuOpen = false;
    this.wasPausedByMenu = false;
    this.elements.resumeGameBtn?.classList.add('hidden');
    this.elements.restartAiRaceBtn?.classList.add('hidden');
    this.elements.gameMenuMainMenuBtn?.classList.add('hidden');
    this.elements.aiPauseNotice?.classList.add('hidden');

    if (this.elements.gameMenuModeLabel) {
      this.elements.gameMenuModeLabel.textContent = 'Audio';
    }

    if (this.elements.gameMenuTitle) {
      this.elements.gameMenuTitle.textContent = 'Audio Settings';
    }

    if (this.elements.closeMenuBtn) {
      this.elements.closeMenuBtn.textContent = 'Save';
    }

    this.elements.gameMenuModal?.classList.remove('hidden');
  }

  closeUnifiedMenu() {
    if (this.currentScreen === 'game' && this.isGameMenuOpen) {
      this.resumeFromGameMenu();
      return;
    }

    this.elements.gameMenuModal?.classList.add('hidden');
  }

  openGameMenu() {
    if (this.currentScreen !== 'game') {
      return;
    }

    const isVsAi = this.network.mode === 'ai';
    this.isGameMenuOpen = true;
    this.wasPausedByMenu = isVsAi && this.network.state === 'racing';

    if (this.wasPausedByMenu) {
      this.network.state = 'paused';
      this.network.pauseAiRace();
      this.game?.setRacePaused?.(true);
      this.setTypingInputActive(false);
    }

    this.elements.restartAiRaceBtn?.classList.toggle('hidden', !isVsAi);
    this.elements.aiPauseNotice?.classList.toggle('hidden', !isVsAi);
    this.elements.resumeGameBtn?.classList.remove('hidden');
    this.elements.gameMenuMainMenuBtn?.classList.remove('hidden');

    if (this.elements.gameMenuModeLabel) {
      this.elements.gameMenuModeLabel.textContent = isVsAi ? 'VS AI Menu' : 'Multiplayer Menu';
    }

    if (this.elements.gameMenuTitle) {
      this.elements.gameMenuTitle.textContent = 'Race Menu';
    }

    if (this.elements.closeMenuBtn) {
      this.elements.closeMenuBtn.textContent = 'Save & Resume';
    }

    this.elements.gameMenuModal?.classList.remove('hidden');
  }

  resumeFromGameMenu() {
    const shouldResumeAi = this.network.mode === 'ai' && (this.wasPausedByMenu || this.network.state === 'paused');
    this.elements.gameMenuModal?.classList.add('hidden');
    this.isGameMenuOpen = false;

    if (shouldResumeAi) {
      this.network.resumeAiRace();
    } else if (this.currentScreen === 'game' && this.network.state === 'racing') {
      this.setTypingInputActive(true);
    }

    this.wasPausedByMenu = false;
  }

  restartAiRace() {
    if (this.network.mode !== 'ai') {
      return;
    }

    this.elements.gameMenuModal?.classList.add('hidden');
    this.isGameMenuOpen = false;
    this.wasPausedByMenu = false;
    this.setTypingInputActive(false);
    this.elements.countdownOverlay.classList.add('hidden');
    this.syncCircuitProfile();
    this.network.restartAiRace();
  }

  exitToMainMenuFromGame() {
    this.elements.gameMenuModal?.classList.add('hidden');
    this.isGameMenuOpen = false;
    this.wasPausedByMenu = false;
    this.leaveLobby();
  }

  showScreen(name) {
    ['menu', 'multiplayerSetup', 'aiSetup', 'lobby', 'game', 'results', 'loading'].forEach((screenName) => {
      const element = this.elements[`${screenName}Screen`];
      if (!element) {
        return;
      }

      element.classList.toggle('active', screenName === name);
      element.classList.toggle('hidden', screenName !== name);
    });

    this.currentScreen = name;
    document.body.dataset.screen = name;
    this.elements.gameMenuBtn?.classList.toggle('hidden', name !== 'game');
    this.updateAuthGateControls({
      isLoggedIn: Boolean(this.firebase.getCurrentUser()),
      isConfigured: isFirebaseConfigured,
      isReady: this.firebase.ready
    });
    this.updateCommsVisibility();
    this.syncScreenAudio();

    if (name === 'game') {
      requestAnimationFrame(() => {
        if (this.network.state === 'racing' && !this.elements.typingInput.disabled) {
          this.elements.typingInput.focus();
        }
      });
    }
  }

  syncScreenAudio() {
    const shouldPlayLobbyMusic = ['menu', 'multiplayerSetup', 'aiSetup', 'loading', 'lobby'].includes(this.currentScreen);
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
    const roomCode = this.getSavedRoomCode();
    const hasRoom = Boolean(roomCode);

    this.elements.resumeRoomBtn?.classList.toggle('hidden', !hasRoom);

    if (this.elements.resumeRoomBtn) {
      this.elements.resumeRoomBtn.disabled = !hasRoom || !this.network.socket?.connected || !this.firebase.getCurrentUser();
      this.elements.resumeRoomBtn.textContent = hasRoom ? `Room ${roomCode}` : 'Last Room';
    }

    if (this.elements.savedRoomHint) {
      this.elements.savedRoomHint.classList.toggle('hidden', !hasRoom);
      this.elements.savedRoomHint.textContent = hasRoom
        ? `Last room saved: ${roomCode}. Use the button to rejoin.`
        : '';
    }
  }

  requireName() {
    const name = this.elements.playerNameInput.value.trim();

    if (!name) {
      alert('Enter your driver name first.');
      return null;
    }

    this.playerName = name;

    if (this.elements.authNameInput && !this.elements.authNameInput.value.trim()) {
      this.elements.authNameInput.value = name;
    }

    return name;
  }

  async createRoom() {
    if (!this.requireSignedIn('Sign in to create a room.')) {
      return;
    }

    const playerName = this.requireName();
    if (!playerName) {
      return;
    }

    await this.safeResumeAudio();
    this.showScreen('loading');
    this.elements.loadingText.textContent = 'Creating room...';

    try {
      const response = await this.network.createRoom(playerName, { mode: 'multiplayer' });
      this.rememberRoom(response.roomCode, playerName);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Room could not be created.');
      this.showScreen('menu');
    }
  }

  async createVsAiRace() {
    if (!this.requireSignedIn('Sign in to start a VS AI race.')) {
      return;
    }

    const playerName = this.requireName();
    if (!playerName) {
      return;
    }

    const lapCount = this.elements.aiLapCountSelect?.value || '1';
    this.network.setLapCount(lapCount);

    await this.safeResumeAudio();
    this.showScreen('loading');
    this.elements.loadingText.textContent = 'Preparing VS AI race...';

    try {
      const response = await this.network.createVsAiRoom(playerName, this.selectedBotDifficulty);
      this.rememberRoom(response.roomCode, playerName);
      this.network.setLapCount(lapCount);
    } catch (error) {
      console.error(error);
      alert(error.message || 'VS AI race could not be created.');
      this.showScreen('menu');
    }
  }

  openJoinModal() {
    if (!this.requireSignedIn('Sign in to join a room.')) {
      return;
    }

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
    if (!this.requireSignedIn('Sign in to join a room.')) {
      return;
    }

    const roomCode = this.elements.roomCodeInput.value.trim().toUpperCase();

    if (!roomCode) {
      alert('Enter a room code.');
      return;
    }

    await this.safeResumeAudio();
    this.closeJoinModal();
    this.showScreen('loading');
    this.elements.loadingText.textContent = 'Joining room...';

    try {
      await this.network.joinRoom(roomCode, this.playerName);
      this.rememberRoom(roomCode, this.playerName);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Could not join the room.');
      this.showScreen('menu');
    }
  }

  async resumeLastRoom() {
    if (!this.requireSignedIn('Sign in to rejoin your last room.')) {
      return;
    }

    const roomCode = this.getSavedRoomCode();
    const playerName = this.requireName();

    if (!roomCode || !playerName) {
      return;
    }

    await this.safeResumeAudio();
    this.closeJoinModal();
    this.showScreen('loading');
    this.elements.loadingText.textContent = `Rejoining room ${roomCode}...`;

    try {
      await this.network.joinRoom(roomCode, playerName);
      this.rememberRoom(roomCode, playerName);
    } catch (error) {
      console.error(error);
      alert(error.message || 'Last room could not be opened.');
      this.updateSavedRoomUI();
      this.showScreen('menu');
    }
  }

  async copyRoomCode() {
    const roomCode = this.network.roomCode || this.getSavedRoomCode();

    if (!roomCode || this.network.mode === 'ai') {
      return;
    }

    try {
      await navigator.clipboard?.writeText(roomCode);
      if (this.elements.copyRoomCodeBtn) {
        this.elements.copyRoomCodeBtn.textContent = 'Copied';
        window.setTimeout(() => {
          if (this.elements.copyRoomCodeBtn) {
            this.elements.copyRoomCodeBtn.textContent = 'Copy';
          }
        }, 1400);
      }
    } catch (_error) {
      window.prompt('Copy room code:', roomCode);
    }
  }

  leaveLobby() {
    this.network.leaveRoom();
    this.leaveFirebaseRoom();
    this.resetToMenu();
  }

  returnToRoom() {
    if (!this.network.roomCode) {
      this.resumeLastRoom();
      return;
    }

    this.setTypingInputActive(false);
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
    this.game?.stopRace();
    this.typing.reset();
    this.latestResults = [];
    this.closeJoinModal();
    this.elements.gameMenuModal?.classList.add('hidden');
    this.isGameMenuOpen = false;
    this.wasPausedByMenu = false;
    this.elements.countdownOverlay.classList.add('hidden');
    this.elements.inputFeedback.textContent = '';
    this.elements.inputFeedback.className = 'input-feedback';
    this.setTypingInputActive(false);
    this.elements.raceStatusLabel.textContent = 'Grid Ready';
    this.updateSavedRoomUI();
    this.showScreen('menu');
  }

  updateRoomActions() {
    const playerCount = this.network.players?.length || 0;
    const humanPlayerCount = (this.network.players || []).filter((player) => !player.isGhost).length;
    const isHost = this.network.hostId === this.network.socket?.id;
    const canStart = isHost && playerCount >= 1 && this.network.state === 'waiting' && this.isTrackReady;
    const canPlayAgain = isHost && playerCount >= 1 && this.network.state === 'finished';
    const hasRoom = Boolean(this.network.roomCode);
    const canEditLapCount = isHost && (this.network.state === 'waiting' || this.network.state === 'finished');
    const isVsAi = this.network.mode === 'ai';
    const roomCapacity = isVsAi ? Math.max(playerCount, 1) : this.roomMaxPlayers;
    const occupancyCount = isVsAi ? playerCount : humanPlayerCount;

    this.elements.startRaceBtn.textContent = !this.isTrackReady && this.network.state === 'waiting'
      ? 'Preparing Track'
      : this.network.state === 'finished'
        ? 'Race Again'
        : 'Start Race';

    this.elements.startRaceBtn.disabled = !(canStart || canPlayAgain);

    if (this.elements.lapCountSelect) {
      this.elements.lapCountSelect.disabled = !canEditLapCount;
    }

    const lapButtons = this.elements.lapOptionGroup?.querySelectorAll('.lap-option') || [];
    lapButtons.forEach((button) => {
      button.disabled = !canEditLapCount;
    });

    if (this.elements.lobbyDriverCount) {
      this.elements.lobbyDriverCount.textContent = isVsAi
        ? String(playerCount)
        : `${occupancyCount}/${roomCapacity}`;
      this.elements.lobbyDriverCount.classList.toggle('full', !isVsAi && occupancyCount >= roomCapacity);
    }

    if (this.elements.lobbyHintText) {
      if (!isHost) {
        this.elements.lobbyHintText.textContent = isVsAi
          ? 'You are on the grid. Wait for the host to start.'
          : `You are on the grid ${occupancyCount}/${roomCapacity}. Wait for the host to start.`;
      } else if (!this.isTrackReady) {
        this.elements.lobbyHintText.textContent = 'Track is loading. Start unlocks when it is ready.';
      } else if (this.network.state === 'finished') {
        this.elements.lobbyHintText.textContent = 'Race finished. The host can restart from here.';
      } else if (isVsAi) {
        this.elements.lobbyHintText.textContent = 'Bots are ready. Press start for countdown.';
      } else {
        this.elements.lobbyHintText.textContent = `Share the room code. Grid ${occupancyCount}/${roomCapacity}; start when the track is ready.`;
      }
    }

    if (this.elements.trackReadyLabel) {
      this.elements.trackReadyLabel.textContent = this.isTrackReady ? 'Track ready' : 'Track loading';
      this.elements.trackReadyLabel.classList.toggle('ready', this.isTrackReady);
    }

    if (this.network.state === 'finished') {
      this.elements.playAgainBtn.textContent = isHost ? 'Race Again' : 'Back to Room';
      this.elements.playAgainBtn.disabled = isHost ? !canPlayAgain : !hasRoom;
    } else {
      this.elements.playAgainBtn.textContent = 'Back to Room';
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
    this.network.mode = payload.mode || this.network.mode || 'multiplayer';
    this.network.botDifficulty = payload.botDifficulty || this.network.botDifficulty || DEFAULT_BOT_DIFFICULTY;
    this.roomMaxPlayers = Number.isFinite(Number(payload.maxPlayers))
      ? Math.max(1, Math.round(Number(payload.maxPlayers)))
      : (this.network.mode === 'ai' ? Math.max((payload.players || []).length, 1) : MAX_ROOM_PLAYERS);

    if (Number.isFinite(Number(payload.lapCount))) {
      this.network.lapCount = Math.max(1, Math.min(5, Math.round(Number(payload.lapCount))));
    }

    this.network.applyCircuitProfile(payload.circuit);
    this.network.lapCount = Math.max(1, Math.min(5, Math.round(Number(payload.lapCount) || this.network.lapCount || 1)));
    this.rememberRoom(payload.roomCode, this.playerName || this.elements.playerNameInput.value);
    this.joinFirebaseRoom(payload.roomCode);

    if (payload.state === 'waiting' || this.currentScreen === 'loading') {
      this.showScreen('lobby');
    }

    const isVsAi = this.network.mode === 'ai';
    this.elements.roomCodeDisplay.textContent = isVsAi ? 'VS AI' : payload.roomCode;
    this.elements.copyRoomCodeBtn?.classList.toggle('hidden', isVsAi);
    if (this.elements.lobbyModeLabel) {
      this.elements.lobbyModeLabel.textContent = isVsAi
        ? `VS AI - ${this.formatDifficulty(this.network.botDifficulty)}`
        : 'Race Room';
    }

    if (this.elements.lobbyRoomMeta) {
      const isHost = this.network.hostId === this.network.socket?.id;
      this.elements.lobbyRoomMeta.textContent = isVsAi
        ? 'Solo challenge ready. Chat stays active when you sign in.'
        : `${isHost ? 'You are the host.' : 'You are a driver.'} Room code: ${payload.roomCode}.`;
    }

    this.elements.raceOptionsPanel?.classList.toggle('hidden', isVsAi);
    this.elements.lobbyStateLabel.textContent = this.formatState(payload.state);
    this.updateLapSelect();
    this.elements.playersList.innerHTML = '';

    this.network.players.forEach((player, index) => {
      const card = document.createElement('div');
      const voice = this.getVoiceStateForPlayer(player.id);
      card.className = `player-card ${voice.micOn ? 'mic-on' : 'mic-off'} ${voice.speaking ? 'speaking' : ''}`;
      card.dataset.playerId = player.id;
      card.style.setProperty('--voice-level', `${voice.voiceLevel}%`);
      const isYou = player.id === this.network.socket.id;
      const isHost = player.id === this.network.hostId;
      const driverType = player.isGhost ? 'AI Bot' : isYou ? 'You' : 'Driver';
      const badges = [
        isHost ? '<span class="badge">Host</span>' : '',
        isYou ? '<span class="badge">You</span>' : ''
      ].join('');

      card.innerHTML = `
        <span class="grid-slot">P${index + 1}</span>
        <div class="player-info">
          <div class="player-name-line">
            <strong>${this.escapeHtml(player.name)}</strong>
            <span class="player-role">${driverType}</span>
          </div>
          <div class="player-meta">
            <span>WPM ${player.wpm ?? 0}</span>
            <span>Accuracy ${player.accuracy ?? 100}%</span>
          </div>
          ${this.renderDriverVoiceMarkup(player.id)}
        </div>
        <div class="player-badges">${badges}</div>
      `;

      this.elements.playersList.appendChild(card);
    });

    if (!isVsAi) {
      const filledSlots = this.network.players.filter((player) => !player.isGhost).length;

      for (let slotIndex = filledSlots; slotIndex < this.roomMaxPlayers; slotIndex += 1) {
        const card = document.createElement('div');
        card.className = 'player-card empty-slot';
        card.innerHTML = `
          <span class="grid-slot">P${slotIndex + 1}</span>
          <div class="player-info">
            <div class="player-name-line">
              <strong>Open slot</strong>
              <span class="player-role">Ready</span>
            </div>
            <div class="player-meta">
              <span>Waiting for driver</span>
            </div>
          </div>
        `;

        this.elements.playersList.appendChild(card);
      }
    }

    this.updateRoomActions();
  }

  handleRacePaused(_payload) {
    if (this.network.mode !== 'ai') {
      return;
    }

    this.network.state = 'paused';
    this.game?.setRacePaused?.(true);
    this.setTypingInputActive(false);
    this.elements.raceStatusLabel.textContent = 'Race Paused';
  }

  handleRaceResumed(payload) {
    if (this.network.mode !== 'ai') {
      return;
    }

    this.network.state = payload?.state || 'racing';
    this.game?.setRacePaused?.(false);
    this.elements.raceStatusLabel.textContent = 'Race Running';

    if (this.currentScreen === 'game' && !this.isGameMenuOpen) {
      this.setTypingInputActive(true);
    }
  }

  formatDifficulty(difficulty) {
    return ({
      'very-easy': 'Very Easy',
      easy: 'Easy',
      medium: 'Medium',
      hard: 'Hard',
      'very-hard': 'Very Hard'
    })[difficulty] || 'Medium';
  }

  formatState(state) {
    if (state === 'waiting') return 'Waiting for drivers';
    if (state === 'countdown') return 'Ready on grid';
    if (state === 'racing') return 'Race running';
    if (state === 'finished') return 'Race finished';
    return state;
  }

  handleCountdownStart(payload) {
    this.stopResultsMusic();
    this.elements.gameMenuModal?.classList.add('hidden');
    this.isGameMenuOpen = false;
    this.wasPausedByMenu = false;
    this.network.state = 'countdown';
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
    this.elements.raceStatusLabel.textContent = 'Ready on Grid';
    this.setTypingInputActive(false);
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
    this.network.state = 'racing';
    this.game?.setRacePaused?.(false);
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
    this.elements.raceStatusLabel.textContent = 'Race Running';
    this.setTypingInputActive(true);
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
    this.showEngineerRadio(event.message || 'Race event active.', event.type);

    if (this.elements.inputFeedback) {
      this.elements.inputFeedback.textContent = event.message || 'Race event active.';
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
    this.elements.gameMenuModal?.classList.add('hidden');
    this.isGameMenuOpen = false;
    this.wasPausedByMenu = false;
    this.network.state = 'finished';
    this.setTypingInputActive(false);
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
    if (this.currentScreen !== 'game' || this.network.state !== 'racing') {
      event.preventDefault();
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
        this.elements.inputFeedback.textContent = 'Clean streak. DRS is ready to boost.';
        this.game?.playRaceEvent?.('drs');
        this.showEngineerRadio('DRS enabled. Keep the rhythm clean.', 'drs');
      } else if (result.keyIntervalMs <= FAST_INPUT_WINDOW_MS) {
        this.elements.inputFeedback.textContent = 'Clean and fast input. Speed is rising.';
      } else if (result.keyIntervalMs > SLOW_INPUT_WINDOW_MS) {
        this.elements.inputFeedback.textContent = 'Correct input, but the rhythm is slow. Speed drops.';
      } else {
        this.elements.inputFeedback.textContent = 'Correct input. Speed holds steady.';
      }

      this.elements.inputFeedback.className = 'input-feedback correct';

      if (result.segmentChanged) {
        this.game?.playSegmentComplete();
      }
    } else {
      this.game?.playMistakeInput();
      this.elements.inputFeedback.textContent = 'Typing mistake. Car momentum drops.';
      this.elements.inputFeedback.className = 'input-feedback error';
      this.showEngineerRadio('Grip loss. Reset the rhythm and keep it tidy.', 'grip_loss');
    }

    if (result.finished) {
      this.game?.playFinish();
      this.elements.inputFeedback.textContent = 'Lap complete. Hold the racing line.';
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
            <strong>${this.escapeHtml(player.name || 'Driver')}</strong>
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
    const roomCode = this.network.roomCode || this.getSavedRoomCode();
    const winner = Array.isArray(results) ? results[0] : null;
    this.orderedResults = Array.isArray(results)
      ? results.slice().sort((a, b) => (a.position || 99) - (b.position || 99))
      : [];
    this.resultsPageIndex = 0;

    if (this.elements.roomContextDisplay) {
      this.elements.roomContextDisplay.textContent = roomCode
        ? `Room ${roomCode} stays active.`
        : '';
    }

    if (this.elements.winnerDisplay) {
      this.elements.winnerDisplay.textContent = winner
        ? `${winner.name} wins`
        : 'Podium ready';
    }

    this.renderResultsPage();
  }

  getResultsPageCount() {
    const resultCount = this.orderedResults?.length || 0;
    return 1 + Math.ceil(Math.max(0, resultCount - 3) / 5);
  }

  changeResultsPage(delta) {
    const pageCount = this.getResultsPageCount();
    this.resultsPageIndex = Math.max(0, Math.min(pageCount - 1, this.resultsPageIndex + delta));
    this.renderResultsPage();
  }

  renderResultsPage() {
    this.elements.resultsList.innerHTML = '';

    if (this.elements.podiumGrid) {
      this.elements.podiumGrid.innerHTML = '';
    }

    const pageCount = this.getResultsPageCount();
    const isPodiumPage = this.resultsPageIndex === 0;
    const ceremonyCard = document.querySelector('.finish-ceremony-card');

    ceremonyCard?.classList.toggle('hidden', !isPodiumPage);

    if (isPodiumPage) {
      this.renderPodium(this.orderedResults.slice(0, 3));
    }

    this.elements.resultsList.classList.toggle('hidden', isPodiumPage);

    const startIndex = isPodiumPage ? 0 : 3 + ((this.resultsPageIndex - 1) * 5);
    const endIndex = isPodiumPage ? 0 : startIndex + 5;
    const pagePlayers = this.orderedResults.slice(startIndex, endIndex);
    const slotCount = isPodiumPage ? 0 : 5;

    for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
      const player = pagePlayers[slotIndex];
      const card = document.createElement('div');

      if (!player) {
        card.className = 'result-card empty-result';
        card.innerHTML = `
          <div>
            <strong>P${startIndex + slotIndex + 1} - Empty Slot</strong>
            <div class="result-meta">No driver in this position yet</div>
          </div>
          <div class="result-meta">WPM -</div>
          <div class="result-meta">Accuracy -</div>
          <div class="result-meta">Typo -</div>
          <div class="result-meta">Grip -</div>
          <div class="result-meta">Best -</div>
        `;
        this.elements.resultsList.appendChild(card);
        continue;
      }

      card.className = `result-card ${player.isGhost ? 'ghost-result' : ''}`;
      const bestSector = player.bestSector?.label
        ? `${player.bestSector.label} ${this.formatDuration(player.bestSector.timeMs)}`
        : '-';
      const typoText = `${player.mistakes ?? 0}/${player.totalKeys ?? 0}`;

      card.innerHTML = `
        <div>
          <strong>P${player.position} - ${this.escapeHtml(player.name)}${player.isGhost ? ' - Ghost' : ''}</strong>
          <div class="result-meta">Progress ${player.progress}% - Streak ${player.longestStreak ?? 0}</div>
        </div>
        <div class="result-meta">WPM ${player.wpm}</div>
        <div class="result-meta">Accuracy ${player.accuracy}%</div>
        <div class="result-meta">Typo ${typoText}</div>
        <div class="result-meta">Grip ${player.grip ?? 100}%</div>
        <div class="result-meta">Best ${this.escapeHtml(bestSector)}</div>
      `;

      this.elements.resultsList.appendChild(card);
    }

    const fromPosition = isPodiumPage ? 1 : startIndex + 1;
    const toPosition = isPodiumPage
      ? Math.min(3, this.orderedResults.length || 1)
      : Math.min(startIndex + 5, this.orderedResults.length || startIndex + 1);

    if (this.elements.resultsPageLabel) {
      this.elements.resultsPageLabel.textContent = `P${fromPosition}-P${toPosition} / ${pageCount}`;
    }

    if (this.elements.resultsPrevBtn) {
      this.elements.resultsPrevBtn.disabled = this.resultsPageIndex <= 0;
    }

    if (this.elements.resultsNextBtn) {
      this.elements.resultsNextBtn.disabled = this.resultsPageIndex >= pageCount - 1;
    }

    this.elements.resultsPager?.classList.toggle('hidden', pageCount <= 1);
  }

  renderPodium(topPlayers = []) {
    if (!this.elements.podiumGrid) {
      return;
    }

    const podiumOrder = [2, 1, 3];
    const podiumHtml = podiumOrder
      .map((position) => {
        const player = topPlayers.find((candidate) => Number(candidate.position) === position);

        if (!player) {
          return `
            <div class="podium-card podium-${position} empty">
              <div class="podium-number">${position}</div>
              <div class="podium-driver-silhouette">--</div>
              <div class="podium-driver-bar">Waiting</div>
            </div>
          `;
        }

        const initials = this.getInitials(player.name);
        const meta = player.isGhost ? 'AI' : 'Driver';
        const score = `${player.wpm ?? 0} WPM`;

        return `
          <div class="podium-card podium-${position} ${player.isGhost ? 'ghost-result' : ''}">
            <div class="podium-number">${position}</div>
            <div class="podium-driver-silhouette">${this.escapeHtml(initials)}</div>
            <div class="podium-stats">
              <span>${this.escapeHtml(meta)}</span>
              <strong>${this.escapeHtml(score)}</strong>
            </div>
            <div class="podium-driver-bar">
              <strong>${this.escapeHtml(player.name)}</strong>
              <span>${player.accuracy ?? 100}% ACC</span>
            </div>
          </div>
        `;
      })
      .join('');

    this.elements.podiumGrid.innerHTML = podiumHtml;
  }

  getInitials(name = '') {
    const words = String(name || 'DR')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    return words
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || 'DR';
  }

  setTypingInputActive(active) {
    if (!this.elements.typingInput) {
      return;
    }

    this.elements.typingInput.disabled = !active;
    this.elements.typingInput.value = '';
    this.elements.typingInput.placeholder = active ? '' : 'Tunggu start';

    if (active) {
      requestAnimationFrame(() => this.elements.typingInput.focus());
      return;
    }

    this.elements.typingInput.blur();
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
