import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

const FIREBASE_SDK_VERSION = '10.12.4';
const MAX_CHAT_LENGTH = 500;
const MAX_CHAT_MESSAGES = 80;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const SPEAKING_LEVEL_THRESHOLD = 9;
const SPEAKING_WRITE_INTERVAL_MS = 520;
const SPEAKING_KEEPALIVE_INTERVAL_MS = 1800;
const SPEAKING_METER_INTERVAL_MS = 160;
const MAX_BIO_LENGTH = 120;
const MAX_HISTORY_ITEMS = 24;
const MAX_PHOTO_URL_LENGTH = 500;

function normalizeRoomCode(roomCode = '') {
  return String(roomCode || '').trim().toUpperCase();
}

function cleanDisplayName(name = '', fallback = 'Driver') {
  const cleaned = String(name || '').trim().slice(0, 32);
  return cleaned || fallback;
}

function cleanChatText(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
}

function cleanBio(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_BIO_LENGTH);
}

function cleanUsername(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24);
}

function cleanPhotoURL(url = '', { throwOnInvalid = true } = {}) {
  const trimmed = String(url || '').trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.length > MAX_PHOTO_URL_LENGTH) {
    if (throwOnInvalid) {
      throw new Error('Avatar URL must be 500 characters or fewer.');
    }

    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (['http:', 'https:'].includes(parsed.protocol)) {
      return trimmed;
    }
  } catch (_error) {
    // Fall through to the validation error below.
  }

  if (throwOnInvalid) {
    throw new Error('Avatar must be a PNG/JPG/WEBP/GIF file or an http:// / https:// image URL.');
  }

  return '';
}

function isWebPhotoURL(url = '') {
  try {
    const parsed = new URL(String(url || '').trim());
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_error) {
    return false;
  }
}

function snapshotList(snapshot) {
  const value = snapshot.val() || {};
  return Object.entries(value)
    .map(([id, item]) => ({ id, ...(item || {}) }))
    .filter((item) => item.uid || item.id);
}

export { isFirebaseConfigured };

export class FirebaseRaceService {
  constructor() {
    this.ready = false;
    this.configured = isFirebaseConfigured;
    this.authUser = null;
    this.displayName = '';
    this.playerId = '';
    this.currentRoomCode = '';
    this.subscribedRoomCode = '';
    this.listeners = new Map();
    this.roomUnsubscribers = [];
    this.presenceUnsubscribers = [];
    this.accountUnsubscribers = [];
    this.voiceUnsubscribers = [];
    this.peerConnections = new Map();
    this.remoteAudioElements = new Map();
    this.queuedCandidates = new Map();
    this.localStream = null;
    this.voiceActive = false;
    this.voiceAudioContext = null;
    this.voiceAnalyser = null;
    this.voiceSource = null;
    this.voiceMeterTimer = null;
    this.lastSpeakingState = false;
    this.lastVoiceLevel = 0;
    this.lastSpeakingWriteAt = 0;
    this.currentProfile = null;
    this.modules = {};
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

  emitStatus(message, detail = {}) {
    this.emitLocal('statusChanged', {
      configured: this.configured,
      ready: this.ready,
      message,
      ...detail
    });
  }

  async init() {
    if (!this.configured) {
      this.emitStatus('Firebase is not configured.');
      return { enabled: false };
    }

    try {
      const [appModule, authModule, databaseModule] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-database.js`)
      ]);

      this.modules = {
        ...appModule,
        ...authModule,
        ...databaseModule
      };

      const app = appModule.getApps().length
        ? appModule.getApp()
        : appModule.initializeApp(firebaseConfig);

      this.app = app;
      this.auth = authModule.getAuth(app);
      this.db = databaseModule.getDatabase(app);
      this.ready = true;

      authModule.onAuthStateChanged(this.auth, (user) => {
        this.handleAuthStateChanged(user);
      });

      this.emitStatus('Firebase ready.');
      return { enabled: true };
    } catch (error) {
      this.ready = false;
      this.emitStatus('Firebase failed to load. Check connection and config.', { error });
      console.error('Firebase init failed:', error);
      return { enabled: false, error };
    }
  }

  ensureReady() {
    if (!this.ready || !this.auth || !this.db) {
      throw new Error('Firebase is not ready. Fill in the Firebase config, then refresh.');
    }
  }

  ensureSignedIn() {
    this.ensureReady();

    if (!this.authUser) {
      throw new Error('Sign in first to use chat and voice.');
    }
  }

  async register({ email, password, displayName }) {
    this.ensureReady();

    const credential = await this.modules.createUserWithEmailAndPassword(
      this.auth,
      String(email || '').trim(),
      String(password || '')
    );

    const name = cleanDisplayName(displayName, credential.user.email?.split('@')[0] || 'Driver');
    await this.modules.updateProfile(credential.user, { displayName: name });
    this.authUser = credential.user;
    this.displayName = name;

    try {
      await this.upsertUserProfile(credential.user, name);
    } catch (error) {
      console.warn('Firebase profile write failed:', error);
    }

    this.emitLocal('authChanged', { user: credential.user, displayName: name });
    return credential.user;
  }

  async login({ email, password, displayName }) {
    this.ensureReady();

    const credential = await this.modules.signInWithEmailAndPassword(
      this.auth,
      String(email || '').trim(),
      String(password || '')
    );

    const name = cleanDisplayName(displayName, credential.user.displayName || credential.user.email?.split('@')[0]);

    if (name && credential.user.displayName !== name) {
      await this.modules.updateProfile(credential.user, { displayName: name });
    }

    this.authUser = credential.user;
    this.displayName = name;

    try {
      await this.upsertUserProfile(credential.user, name);
    } catch (error) {
      console.warn('Firebase profile write failed:', error);
    }

    this.emitLocal('authChanged', { user: credential.user, displayName: name });
    return credential.user;
  }

  async loginWithGoogle() {
    this.ensureReady();

    const provider = new this.modules.GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });

    const credential = await this.modules.signInWithPopup(this.auth, provider);
    const name = cleanDisplayName(
      credential.user.displayName,
      credential.user.email?.split('@')[0] || 'Driver'
    );

    this.authUser = credential.user;
    this.displayName = name;

    try {
      await this.upsertUserProfile(credential.user, name);
    } catch (error) {
      console.warn('Firebase profile write failed:', error);
    }

    this.emitLocal('authChanged', { user: credential.user, displayName: name });
    return credential.user;
  }

  async logout() {
    this.ensureReady();
    await this.leaveRoom();
    await this.setGlobalPresence('offline');
    await this.modules.signOut(this.auth);
  }

  async handleAuthStateChanged(user) {
    this.authUser = user || null;

    if (!user) {
      this.cleanupPresenceListeners();
      this.cleanupAccountListeners();
      this.emitLocal('authChanged', { user: null, displayName: '' });
      return;
    }

    this.displayName = cleanDisplayName(user.displayName, user.email?.split('@')[0] || 'Driver');

    try {
      await this.upsertUserProfile(user, this.displayName);
    } catch (error) {
      console.warn('Firebase auth profile sync failed:', error);
    }

    this.startGlobalPresence();
    this.subscribeAccountData();

    this.emitLocal('authChanged', {
      user,
      displayName: this.displayName
    });

    if (this.currentRoomCode) {
      this.joinRoom(this.currentRoomCode, this.displayName, this.playerId).catch((error) => {
        console.warn('Firebase room rejoin failed:', error);
      });
    }
  }

  async upsertUserProfile(user = this.authUser, displayName = this.displayName) {
    if (!this.ready || !user) {
      return;
    }

    const { ref, get, update, serverTimestamp } = this.modules;
    const fallbackUsername = cleanUsername(user.email?.split('@')[0] || displayName || 'driver');
    const existingProfile = (await get(ref(this.db, `users/${user.uid}/profile`))).val() || {};
    const username = cleanUsername(existingProfile.username || fallbackUsername);
    const photoSource = Object.prototype.hasOwnProperty.call(existingProfile, 'photoURL')
      ? existingProfile.photoURL
      : user.photoURL || '';
    const photoURL = cleanPhotoURL(photoSource, { throwOnInvalid: false });
    const nextProfile = {
      uid: user.uid,
      displayName: cleanDisplayName(displayName, user.email?.split('@')[0] || 'Driver'),
      username,
      usernameLower: username,
      email: user.email || '',
      photoURL,
      bio: cleanBio(existingProfile.bio || ''),
      updatedAt: serverTimestamp()
    };

    await update(ref(this.db, `users/${user.uid}/profile`), nextProfile);

    await update(ref(this.db, `userDirectory/${user.uid}`), {
      uid: user.uid,
      displayName: nextProfile.displayName,
      username,
      usernameLower: username,
      photoURL,
      updatedAt: serverTimestamp()
    });

    this.currentProfile = {
      ...nextProfile,
      updatedAt: Date.now()
    };
  }

  async setDisplayName(name) {
    if (!this.ready || !this.authUser) {
      return;
    }

    const nextName = cleanDisplayName(name, this.displayName || 'Driver');
    this.displayName = nextName;

    if (this.authUser.displayName !== nextName) {
      await this.modules.updateProfile(this.authUser, { displayName: nextName });
    }

    await this.upsertUserProfile(this.authUser, nextName);
    await this.refreshPresenceName(nextName);
  }

  subscribeAccountData() {
    this.cleanupAccountListeners();

    if (!this.ready || !this.authUser) {
      return;
    }

    const { ref, query, limitToLast, onValue } = this.modules;
    const uid = this.authUser.uid;
    const latest = {
      profile: null,
      status: null,
      stats: null,
      friends: [],
      requests: [],
      invites: [],
      history: [],
      statuses: {}
    };
    const emit = () => this.emitLocal('accountDataChanged', {
      ...latest,
      uid
    });

    const bindValue = (path, key, mapper = (snapshot) => snapshot.val()) => {
      const unsubscribe = onValue(ref(this.db, path), (snapshot) => {
        latest[key] = mapper(snapshot);
        emit();
      });
      this.accountUnsubscribers.push(unsubscribe);
    };

    bindValue(`users/${uid}/profile`, 'profile', (snapshot) => {
      const profile = snapshot.val() || null;
      this.currentProfile = profile;
      return profile;
    });
    bindValue(`users/${uid}/status`, 'status');
    bindValue(`stats/${uid}`, 'stats');
    bindValue(`friends/${uid}`, 'friends', snapshotList);
    bindValue(`friendRequests/${uid}`, 'requests', snapshotList);
    bindValue(`invites/${uid}`, 'invites', snapshotList);
    bindValue('users', 'statuses', (snapshot) => {
      const users = snapshot.val() || {};
      return Object.fromEntries(
        Object.entries(users).map(([userUid, userData]) => [userUid, userData?.status || null])
      );
    });

    const historyUnsubscribe = onValue(
      query(ref(this.db, `matchHistory/${uid}`), limitToLast(MAX_HISTORY_ITEMS)),
      (snapshot) => {
        latest.history = snapshotList(snapshot).reverse();
        emit();
      }
    );
    this.accountUnsubscribers.push(historyUnsubscribe);
  }

  cleanupAccountListeners() {
    this.accountUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.accountUnsubscribers = [];
  }

  async updateProfileData(profile = {}) {
    this.ensureSignedIn();

    const displayName = cleanDisplayName(profile.displayName, this.displayName || 'Driver');
    const username = cleanUsername(profile.username || displayName);
    const bio = cleanBio(profile.bio || '');
    const photoURL = cleanPhotoURL(profile.photoURL || '');
    const { ref, update, serverTimestamp } = this.modules;

    this.displayName = displayName;
    const profilePayload = {
      uid: this.authUser.uid,
      displayName,
      username,
      usernameLower: username,
      email: this.authUser.email || '',
      photoURL,
      bio,
      updatedAt: serverTimestamp()
    };

    await this.modules.updateProfile(this.authUser, {
      displayName,
      photoURL: isWebPhotoURL(photoURL) ? photoURL : null
    });

    await update(ref(this.db, `users/${this.authUser.uid}/profile`), profilePayload);

    await update(ref(this.db, `userDirectory/${this.authUser.uid}`), {
      uid: this.authUser.uid,
      displayName,
      username,
      usernameLower: username,
      photoURL,
      updatedAt: serverTimestamp()
    });

    this.currentProfile = {
      ...profilePayload,
      updatedAt: Date.now()
    };

    await this.refreshPresenceName(displayName);
    this.emitLocal('authChanged', { user: this.authUser, displayName });
    return { uid: this.authUser.uid, displayName, username, usernameLower: username, bio, photoURL };
  }

  async searchUsers(term = '') {
    this.ensureSignedIn();

    const needle = String(term || '').trim().toLowerCase();

    if (needle.length < 2) {
      return [];
    }

    const { ref, get } = this.modules;
    const [directorySnapshot, statusSnapshot] = await Promise.all([
      get(ref(this.db, 'userDirectory')),
      get(ref(this.db, 'users'))
    ]);
    const directory = directorySnapshot.val() || {};
    const users = statusSnapshot.val() || {};

    return Object.values(directory)
      .filter((profile) => profile?.uid && profile.uid !== this.authUser.uid)
      .filter((profile) => {
        const haystack = `${profile.displayName || ''} ${profile.username || ''}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 12)
      .map((profile) => ({
        ...profile,
        status: users[profile.uid]?.status || null
      }));
  }

  async sendFriendRequest(targetUid) {
    this.ensureSignedIn();

    const target = String(targetUid || '').trim();

    if (!target || target === this.authUser.uid) {
      return false;
    }

    const { ref, update, serverTimestamp } = this.modules;
    await update(ref(this.db, `friendRequests/${target}/${this.authUser.uid}`), {
      uid: this.authUser.uid,
      fromUid: this.authUser.uid,
      fromName: this.displayName || this.authUser.displayName || 'Driver',
      fromPhotoURL: this.getCurrentPhotoURL(),
      createdAt: serverTimestamp()
    });
    await update(ref(this.db, `friendRequestsSent/${this.authUser.uid}/${target}`), {
      uid: target,
      createdAt: serverTimestamp()
    });
    return true;
  }

  async respondFriendRequest(fromUid, accept = false) {
    this.ensureSignedIn();

    const otherUid = String(fromUid || '').trim();

    if (!otherUid) {
      return false;
    }

    const { ref, get, update, remove, serverTimestamp } = this.modules;
    const otherProfile = (await get(ref(this.db, `users/${otherUid}/profile`))).val() || {};
    const ownProfile = (await get(ref(this.db, `users/${this.authUser.uid}/profile`))).val() || {};

    if (accept) {
      await update(ref(this.db, `friends/${this.authUser.uid}/${otherUid}`), {
        uid: otherUid,
        displayName: otherProfile.displayName || 'Driver',
        username: otherProfile.username || '',
        photoURL: otherProfile.photoURL || '',
        since: serverTimestamp()
      });
      await update(ref(this.db, `friends/${otherUid}/${this.authUser.uid}`), {
        uid: this.authUser.uid,
        displayName: ownProfile.displayName || this.displayName || 'Driver',
        username: ownProfile.username || '',
        photoURL: ownProfile.photoURL || '',
        since: serverTimestamp()
      });
    }

    await remove(ref(this.db, `friendRequests/${this.authUser.uid}/${otherUid}`));
    await remove(ref(this.db, `friendRequestsSent/${otherUid}/${this.authUser.uid}`));
    return true;
  }

  async removeFriend(friendUid) {
    this.ensureSignedIn();

    const otherUid = String(friendUid || '').trim();

    if (!otherUid) {
      return false;
    }

    const { ref, remove } = this.modules;
    await Promise.all([
      remove(ref(this.db, `friends/${this.authUser.uid}/${otherUid}`)),
      remove(ref(this.db, `friends/${otherUid}/${this.authUser.uid}`))
    ]);
    return true;
  }

  async sendLobbyInvite(targetUid, roomCode) {
    this.ensureSignedIn();

    const target = String(targetUid || '').trim();
    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!target || !normalizedRoomCode) {
      return false;
    }

    const { ref, push, serverTimestamp } = this.modules;
    await push(ref(this.db, `invites/${target}`), {
      fromUid: this.authUser.uid,
      fromName: this.displayName || this.authUser.displayName || 'Driver',
      fromPhotoURL: this.getCurrentPhotoURL(),
      roomCode: normalizedRoomCode,
      mode: 'multiplayer',
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return true;
  }

  async dismissInvite(inviteId) {
    this.ensureSignedIn();

    const id = String(inviteId || '').trim();

    if (!id) {
      return false;
    }

    const { ref, remove } = this.modules;
    await remove(ref(this.db, `invites/${this.authUser.uid}/${id}`));
    return true;
  }

  async recordMatchResult(match = {}) {
    if (!this.ready || !this.authUser) {
      return false;
    }

    const uid = this.authUser.uid;
    const position = Math.max(1, Math.round(Number(match.position) || 99));
    const totalPlayers = Math.max(1, Math.round(Number(match.totalPlayers) || 1));
    const wpm = Math.max(0, Math.round(Number(match.wpm) || 0));
    const accuracy = Math.max(0, Math.min(100, Math.round(Number(match.accuracy) || 0)));
    const totalKeys = Math.max(0, Math.round(Number(match.totalKeys) || 0));
    const { ref, push, get, set, serverTimestamp } = this.modules;
    const statsRef = ref(this.db, `stats/${uid}`);
    const currentStats = (await get(statsRef)).val() || {};
    const totalMatches = Math.max(0, Number(currentStats.totalMatches) || 0) + 1;
    const totalWins = Math.max(0, Number(currentStats.totalWins) || 0) + (position === 1 ? 1 : 0);
    const totalPodiums = Math.max(0, Number(currentStats.totalPodiums) || 0) + (position <= 3 ? 1 : 0);
    const totalWpm = Math.max(0, Number(currentStats.totalWpm) || 0) + wpm;
    const totalAccuracy = Math.max(0, Number(currentStats.totalAccuracy) || 0) + accuracy;
    const totalCharacters = Math.max(0, Number(currentStats.totalCharacters) || 0) + totalKeys;
    const totalFinishPosition = Math.max(0, Number(currentStats.totalFinishPosition) || 0) + position;

    await push(ref(this.db, `matchHistory/${uid}`), {
      roomCode: normalizeRoomCode(match.roomCode),
      mode: match.mode || 'multiplayer',
      position,
      totalPlayers,
      opponents: Array.isArray(match.opponents) ? match.opponents.slice(0, 10) : [],
      wpm,
      accuracy,
      totalKeys,
      mistakes: Math.max(0, Math.round(Number(match.mistakes) || 0)),
      completed: Boolean(match.completed ?? true),
      createdAt: serverTimestamp()
    });

    await set(statsRef, {
      totalMatches,
      totalWins,
      totalLosses: Math.max(0, totalMatches - totalWins),
      totalPodiums,
      firstPlaces: Math.max(0, Number(currentStats.firstPlaces) || 0) + (position === 1 ? 1 : 0),
      secondPlaces: Math.max(0, Number(currentStats.secondPlaces) || 0) + (position === 2 ? 1 : 0),
      thirdPlaces: Math.max(0, Number(currentStats.thirdPlaces) || 0) + (position === 3 ? 1 : 0),
      totalRaceCompleted: totalMatches,
      totalWpm,
      totalAccuracy,
      totalCharacters,
      totalFinishPosition,
      averageWpm: Math.round(totalWpm / totalMatches),
      bestWpm: Math.max(Number(currentStats.bestWpm) || 0, wpm),
      averageAccuracy: Math.round(totalAccuracy / totalMatches),
      bestAccuracy: Math.max(Number(currentStats.bestAccuracy) || 0, accuracy),
      winRate: Math.round((totalWins / totalMatches) * 100),
      averageFinishPosition: Number((totalFinishPosition / totalMatches).toFixed(1)),
      updatedAt: serverTimestamp()
    });

    return true;
  }

  startGlobalPresence() {
    this.cleanupPresenceListeners();

    if (!this.ready || !this.authUser) {
      return;
    }

    const { ref, onValue, onDisconnect, set, serverTimestamp } = this.modules;
    const statusRef = ref(this.db, `users/${this.authUser.uid}/status`);
    const connectedRef = ref(this.db, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() !== true) {
        return;
      }

      onDisconnect(statusRef).set({
        state: 'offline',
        displayName: this.displayName,
        lastChanged: serverTimestamp()
      }).catch((error) => console.warn('Firebase onDisconnect status failed:', error));

      set(statusRef, {
        state: 'online',
        displayName: this.displayName,
        roomCode: this.currentRoomCode || null,
        lastChanged: serverTimestamp()
      }).catch((error) => console.warn('Firebase status write failed:', error));
    });

    this.presenceUnsubscribers.push(unsubscribe);
  }

  cleanupPresenceListeners() {
    this.presenceUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.presenceUnsubscribers = [];
  }

  getCurrentPhotoURL() {
    return cleanPhotoURL(this.currentProfile?.photoURL || this.authUser?.photoURL || '', { throwOnInvalid: false });
  }

  async setGlobalPresence(state = 'online') {
    if (!this.ready || !this.authUser) {
      return;
    }

    const { ref, set, serverTimestamp } = this.modules;
    await set(ref(this.db, `users/${this.authUser.uid}/status`), {
      state,
      displayName: this.displayName,
      photoURL: this.getCurrentPhotoURL(),
      roomCode: state === 'online' ? this.currentRoomCode || null : null,
      lastChanged: serverTimestamp()
    });
  }

  async refreshPresenceName(displayName = this.displayName) {
    if (!this.ready || !this.authUser) {
      return;
    }

    const { ref, update, serverTimestamp } = this.modules;
    const photoURL = this.getCurrentPhotoURL();
    await update(ref(this.db, `users/${this.authUser.uid}/status`), {
      displayName,
      photoURL,
      lastChanged: serverTimestamp()
    });

    if (this.currentRoomCode) {
      await update(ref(this.db, `rooms/${this.currentRoomCode}/presence/${this.authUser.uid}`), {
        displayName,
        photoURL,
        updatedAt: serverTimestamp()
      });
    }
  }

  async joinRoom(roomCode, displayName = this.displayName, playerId = '') {
    if (!this.ready || !this.authUser) {
      return false;
    }

    const normalizedRoomCode = normalizeRoomCode(roomCode);

    if (!normalizedRoomCode) {
      return false;
    }

    if (this.currentRoomCode && this.currentRoomCode !== normalizedRoomCode) {
      await this.leaveRoom();
    }

    this.currentRoomCode = normalizedRoomCode;
    this.playerId = String(playerId || '');
    this.displayName = cleanDisplayName(displayName, this.displayName || 'Driver');
    const photoURL = this.getCurrentPhotoURL();

    const { ref, set, update, onDisconnect, serverTimestamp } = this.modules;
    const roomPresenceRef = ref(this.db, `rooms/${normalizedRoomCode}/presence/${this.authUser.uid}`);

    await set(roomPresenceRef, {
      uid: this.authUser.uid,
      playerId: this.playerId,
      displayName: this.displayName,
      photoURL,
      state: 'online',
      mic: this.voiceActive,
      speaking: false,
      voiceLevel: 0,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    onDisconnect(roomPresenceRef).remove()
      .catch((error) => console.warn('Firebase room onDisconnect failed:', error));

    await update(ref(this.db, `users/${this.authUser.uid}/status`), {
      state: 'online',
      displayName: this.displayName,
      photoURL,
      roomCode: normalizedRoomCode,
      lastChanged: serverTimestamp()
    });

    this.subscribeRoom(normalizedRoomCode);
    this.emitLocal('roomChanged', { roomCode: normalizedRoomCode });
    return true;
  }

  async leaveRoom() {
    const roomCode = this.currentRoomCode;
    const uid = this.authUser?.uid;

    if (this.voiceActive) {
      await this.stopVoice();
    }

    this.clearRoomSubscriptions();
    this.currentRoomCode = '';
    this.playerId = '';
    this.subscribedRoomCode = '';

    if (!this.ready || !uid || !roomCode) {
      this.emitLocal('roomChanged', { roomCode: '' });
      return;
    }

    const { ref, remove, update, serverTimestamp } = this.modules;

    try {
      await remove(ref(this.db, `rooms/${roomCode}/presence/${uid}`));
      await update(ref(this.db, `users/${uid}/status`), {
        roomCode: null,
        lastChanged: serverTimestamp()
      });
    } catch (error) {
      console.warn('Firebase leave room failed:', error);
    }

    this.emitLocal('roomChanged', { roomCode: '' });
  }

  subscribeRoom(roomCode) {
    if (this.subscribedRoomCode === roomCode) {
      return;
    }

    this.clearRoomSubscriptions();
    this.subscribedRoomCode = roomCode;

    const { ref, query, limitToLast, onChildAdded, onValue } = this.modules;
    const messagesRef = query(
      ref(this.db, `rooms/${roomCode}/messages`),
      limitToLast(MAX_CHAT_MESSAGES)
    );
    const presenceRef = ref(this.db, `rooms/${roomCode}/presence`);

    this.roomUnsubscribers.push(onChildAdded(messagesRef, (snapshot) => {
      const message = snapshot.val();

      if (!message) {
        return;
      }

      this.emitLocal('messageAdded', {
        id: snapshot.key,
        ...message
      });
    }));

    this.roomUnsubscribers.push(onValue(presenceRef, (snapshot) => {
      const users = snapshotList(snapshot)
        .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || '')));

      this.emitLocal('presenceChanged', { roomCode, users });
    }));
  }

  clearRoomSubscriptions() {
    this.roomUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.roomUnsubscribers = [];
  }

  async sendMessage(text) {
    this.ensureSignedIn();

    const messageText = cleanChatText(text);

    if (!messageText) {
      return false;
    }

    if (!this.currentRoomCode) {
      throw new Error('Join a room first to use chat.');
    }

    const { ref, push, serverTimestamp } = this.modules;
    await push(ref(this.db, `rooms/${this.currentRoomCode}/messages`), {
      uid: this.authUser.uid,
      name: this.displayName,
      text: messageText,
      createdAt: serverTimestamp()
    });

    return true;
  }

  async toggleVoice() {
    return this.voiceActive ? this.stopVoice() : this.startVoice();
  }

  async startVoice() {
    this.ensureSignedIn();

    if (!this.currentRoomCode) {
      throw new Error('Join a room first to use open mic.');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone access.');
    }

    if (this.voiceActive) {
      return true;
    }

    const { ref, set, update, onDisconnect, serverTimestamp } = this.modules;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    this.voiceActive = true;
    this.emitLocal('voiceChanged', { active: true });

    try {
      const peerRef = ref(this.db, `rooms/${this.currentRoomCode}/voice/peers/${this.authUser.uid}`);
      await set(peerRef, {
        uid: this.authUser.uid,
        displayName: this.displayName,
        active: true,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      onDisconnect(peerRef).remove()
        .catch((error) => console.warn('Firebase voice onDisconnect failed:', error));

      await update(ref(this.db, `rooms/${this.currentRoomCode}/presence/${this.authUser.uid}`), {
        mic: true,
        speaking: false,
        voiceLevel: 0,
        updatedAt: serverTimestamp()
      });

      this.startSpeakingMeter();
      this.subscribeVoiceSignals();
      this.subscribeVoicePeers();
    } catch (error) {
      await this.stopVoice();
      throw error;
    }

    return true;
  }

  async stopVoice() {
    const roomCode = this.currentRoomCode;
    const uid = this.authUser?.uid;

    this.voiceActive = false;
    this.voiceUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.voiceUnsubscribers = [];
    Array.from(this.peerConnections.keys()).forEach((remoteUid) => this.closePeer(remoteUid));
    this.peerConnections.clear();
    this.queuedCandidates.clear();
    this.stopSpeakingMeter();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.emitLocal('voiceChanged', { active: false });

    if (!this.ready || !roomCode || !uid) {
      return;
    }

    const { ref, remove, update, serverTimestamp } = this.modules;

    try {
      await update(ref(this.db, `rooms/${roomCode}/presence/${uid}`), {
        mic: false,
        speaking: false,
        voiceLevel: 0,
        updatedAt: serverTimestamp()
      });
      await remove(ref(this.db, `rooms/${roomCode}/voice/peers/${uid}`));
      await remove(ref(this.db, `rooms/${roomCode}/voice/signals/${uid}`));
    } catch (error) {
      console.warn('Firebase stop voice failed:', error);
    }
  }

  startSpeakingMeter() {
    this.stopSpeakingMeter({ emit: false });

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor || !this.localStream) {
      return;
    }

    try {
      this.voiceAudioContext = new AudioContextConstructor();
      this.voiceAnalyser = this.voiceAudioContext.createAnalyser();
      this.voiceAnalyser.fftSize = 512;
      this.voiceSource = this.voiceAudioContext.createMediaStreamSource(this.localStream);
      this.voiceSource.connect(this.voiceAnalyser);
      this.voiceAudioContext.resume?.().catch(() => {});

      const samples = new Uint8Array(this.voiceAnalyser.fftSize);
      this.voiceMeterTimer = window.setInterval(() => {
        if (!this.voiceActive || !this.voiceAnalyser) {
          return;
        }

        this.voiceAnalyser.getByteTimeDomainData(samples);

        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const centered = (samples[index] - 128) / 128;
          sum += centered * centered;
        }

        const rms = Math.sqrt(sum / samples.length);
        const voiceLevel = Math.min(100, Math.round(rms * 180));
        const speaking = voiceLevel >= SPEAKING_LEVEL_THRESHOLD;

        this.emitLocal('voiceLevelChanged', {
          active: true,
          speaking,
          voiceLevel
        });

        this.publishSpeakingState(speaking, voiceLevel);
      }, SPEAKING_METER_INTERVAL_MS);
    } catch (error) {
      console.warn('Voice level meter failed:', error);
      this.stopSpeakingMeter();
    }
  }

  stopSpeakingMeter({ emit = true } = {}) {
    if (this.voiceMeterTimer) {
      window.clearInterval(this.voiceMeterTimer);
      this.voiceMeterTimer = null;
    }

    try {
      this.voiceSource?.disconnect();
    } catch (_error) {}

    this.voiceSource = null;
    this.voiceAnalyser = null;

    if (this.voiceAudioContext && this.voiceAudioContext.state !== 'closed') {
      this.voiceAudioContext.close().catch(() => {});
    }

    this.voiceAudioContext = null;
    this.lastSpeakingState = false;
    this.lastVoiceLevel = 0;
    this.lastSpeakingWriteAt = 0;
    if (emit) {
      this.emitLocal('voiceLevelChanged', {
        active: false,
        speaking: false,
        voiceLevel: 0
      });
    }
  }

  publishSpeakingState(speaking, voiceLevel) {
    if (!this.ready || !this.currentRoomCode || !this.authUser) {
      return;
    }

    const now = Date.now();
    const stateChanged = speaking !== this.lastSpeakingState;
    const levelChanged = Math.abs(voiceLevel - this.lastVoiceLevel) >= 18;
    const canWrite = now - this.lastSpeakingWriteAt >= SPEAKING_WRITE_INTERVAL_MS;
    const stale = now - this.lastSpeakingWriteAt >= SPEAKING_KEEPALIVE_INTERVAL_MS;

    if (!canWrite || (!stateChanged && !levelChanged && !stale)) {
      return;
    }

    this.lastSpeakingState = speaking;
    this.lastVoiceLevel = voiceLevel;
    this.lastSpeakingWriteAt = now;

    const { ref, update, serverTimestamp } = this.modules;
    update(ref(this.db, `rooms/${this.currentRoomCode}/presence/${this.authUser.uid}`), {
      mic: true,
      speaking,
      voiceLevel,
      updatedAt: serverTimestamp()
    }).catch((error) => console.warn('Firebase speaking state failed:', error));
  }

  subscribeVoiceSignals() {
    const { ref, onChildAdded, remove } = this.modules;
    const inboxRef = ref(this.db, `rooms/${this.currentRoomCode}/voice/signals/${this.authUser.uid}`);

    this.voiceUnsubscribers.push(onChildAdded(inboxRef, async (snapshot) => {
      const signal = snapshot.val();

      try {
        await this.handleSignal(signal);
      } catch (error) {
        console.warn('Voice signal failed:', error);
      } finally {
        remove(snapshot.ref).catch(() => {});
      }
    }));
  }

  subscribeVoicePeers() {
    const { ref, onValue } = this.modules;
    const peersRef = ref(this.db, `rooms/${this.currentRoomCode}/voice/peers`);

    this.voiceUnsubscribers.push(onValue(peersRef, (snapshot) => {
      const peers = snapshotList(snapshot)
        .filter((peer) => peer.active && peer.uid && peer.uid !== this.authUser?.uid);
      const activePeerIds = new Set(peers.map((peer) => peer.uid));

      this.emitLocal('voicePeersChanged', { peers });

      if (!this.voiceActive) {
        return;
      }

      peers.forEach((peer) => {
        const shouldOffer = String(this.authUser.uid) < String(peer.uid);
        this.ensurePeer(peer.uid, shouldOffer);
      });

      Array.from(this.peerConnections.keys()).forEach((remoteUid) => {
        if (!activePeerIds.has(remoteUid)) {
          this.closePeer(remoteUid);
        }
      });
    }));
  }

  ensurePeer(remoteUid, shouldOffer = false) {
    if (this.peerConnections.has(remoteUid)) {
      return this.peerConnections.get(remoteUid);
    }

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(remoteUid, connection);

    this.localStream?.getTracks().forEach((track) => {
      connection.addTrack(track, this.localStream);
    });

    connection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }

      const candidate = typeof event.candidate.toJSON === 'function'
        ? event.candidate.toJSON()
        : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment
          };

      this.sendSignal(remoteUid, 'candidate', candidate).catch((error) => {
        console.warn('ICE candidate send failed:', error);
      });
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;

      if (!stream) {
        return;
      }

      this.attachRemoteAudio(remoteUid, stream);
    };

    connection.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(connection.connectionState)) {
        this.closePeer(remoteUid);
      }
    };

    if (shouldOffer) {
      queueMicrotask(() => this.createOffer(remoteUid, connection));
    }

    return connection;
  }

  async createOffer(remoteUid, connection) {
    if (!this.voiceActive || connection.signalingState !== 'stable' || connection.localDescription) {
      return;
    }

    const offer = await connection.createOffer({ offerToReceiveAudio: true });
    await connection.setLocalDescription(offer);
    await this.sendSignal(remoteUid, 'offer', {
      type: offer.type,
      sdp: offer.sdp
    });
  }

  async handleSignal(signal) {
    if (!this.voiceActive || !signal?.from || signal.from === this.authUser?.uid) {
      return;
    }

    const connection = this.ensurePeer(signal.from, false);

    if (signal.type === 'offer') {
      if (connection.signalingState !== 'stable') {
        try {
          await connection.setLocalDescription({ type: 'rollback' });
        } catch (_error) {}
      }

      await connection.setRemoteDescription(new RTCSessionDescription(signal.data));
      await this.flushQueuedCandidates(signal.from, connection);

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await this.sendSignal(signal.from, 'answer', {
        type: answer.type,
        sdp: answer.sdp
      });
      return;
    }

    if (signal.type === 'answer') {
      if (connection.signalingState === 'have-local-offer') {
        await connection.setRemoteDescription(new RTCSessionDescription(signal.data));
        await this.flushQueuedCandidates(signal.from, connection);
      }
      return;
    }

    if (signal.type === 'candidate' && signal.data?.candidate) {
      if (!connection.remoteDescription?.type) {
        if (!this.queuedCandidates.has(signal.from)) {
          this.queuedCandidates.set(signal.from, []);
        }

        this.queuedCandidates.get(signal.from).push(signal.data);
        return;
      }

      await connection.addIceCandidate(new RTCIceCandidate(signal.data));
    }
  }

  async flushQueuedCandidates(remoteUid, connection) {
    const candidates = this.queuedCandidates.get(remoteUid) || [];
    this.queuedCandidates.delete(remoteUid);

    for (const candidate of candidates) {
      await connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  async sendSignal(remoteUid, type, data) {
    if (!this.ready || !this.currentRoomCode || !this.authUser) {
      return;
    }

    const { ref, push, serverTimestamp } = this.modules;
    await push(ref(this.db, `rooms/${this.currentRoomCode}/voice/signals/${remoteUid}`), {
      from: this.authUser.uid,
      name: this.displayName,
      type,
      data,
      createdAt: serverTimestamp()
    });
  }

  attachRemoteAudio(remoteUid, stream) {
    let audio = this.remoteAudioElements.get(remoteUid);

    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.remoteVoice = remoteUid;
      document.body.appendChild(audio);
      this.remoteAudioElements.set(remoteUid, audio);
    }

    audio.srcObject = stream;
    audio.play().catch(() => {});
  }

  closePeer(remoteUid) {
    const connection = this.peerConnections.get(remoteUid);

    if (connection) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.onconnectionstatechange = null;
      connection.close();
      this.peerConnections.delete(remoteUid);
    }

    const audio = this.remoteAudioElements.get(remoteUid);

    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.remoteAudioElements.delete(remoteUid);
    }
  }

  getCurrentUser() {
    return this.authUser;
  }
}
