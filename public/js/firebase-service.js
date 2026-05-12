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

function getGoogleProviderPhotoURL(user = null) {
  const googleProfile = (user?.providerData || [])
    .find((profile) => profile?.providerId === 'google.com');

  return cleanPhotoURL(googleProfile?.photoURL || '', { throwOnInvalid: false });
}

function getPreferredPhotoURL(user = null, profile = {}) {
  return getGoogleProviderPhotoURL(user)
    || cleanPhotoURL(profile?.photoURL || user?.photoURL || '', { throwOnInvalid: false });
}

function snapshotList(snapshot) {
  const value = snapshot.val() || {};
  return Object.entries(value)
    .map(([id, item]) => ({ id, ...(item || {}) }))
    .filter((item) => item.uid || item.id);
}

function snapshotRecordList(snapshot) {
  const value = snapshot.val() || {};
  return Object.entries(value)
    .map(([id, item]) => ({ id, ...(item || {}) }))
    .filter((item) => item.id || item.raceId);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundNumber(value, digits = 0) {
  const number = safeNumber(value);
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function normalizeRaceMode(mode = '') {
  return String(mode || '').trim().toLowerCase();
}

function getProfileName(profile = {}, fallback = 'Driver') {
  return cleanDisplayName(
    profile.displayName || profile.nickname || profile.username || profile.email?.split('@')[0],
    fallback
  );
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
    this.voiceSignalsRoomCode = '';
    this.voicePeersRoomCode = '';
    this.latestVoicePeers = [];
    this.latestRoomParticipants = [];
    this.processedVoiceSignalIds = new Set();
    this.peerConnections = new Map();
    this.remoteAudioElements = new Map();
    this.queuedCandidates = new Map();
    this.localStream = null;
    this.voiceActive = false;
    this.micMuted = false;
    this.speakerEnabled = true;
    this.voiceStatus = 'idle';
    this.voiceOutputVolume = 1;
    this.voiceOutputMuted = false;
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
    const [profileSnapshot, legacyProfileSnapshot] = await Promise.all([
      get(ref(this.db, `profiles/${user.uid}`)),
      get(ref(this.db, `users/${user.uid}/profile`))
    ]);
    const existingProfile = profileSnapshot.val() || legacyProfileSnapshot.val() || {};
    const username = cleanUsername(existingProfile.username || fallbackUsername);
    const googlePhotoURL = getGoogleProviderPhotoURL(user);
    const photoURL = getPreferredPhotoURL(user, existingProfile);
    const nextProfile = {
      uid: user.uid,
      displayName: cleanDisplayName(displayName, user.email?.split('@')[0] || 'Driver'),
      nickname: cleanDisplayName(displayName, user.email?.split('@')[0] || 'Driver'),
      username,
      usernameLower: username,
      nicknameLower: cleanDisplayName(displayName, user.email?.split('@')[0] || 'Driver').toLowerCase(),
      email: user.email || '',
      photoURL,
      bio: cleanBio(existingProfile.bio || ''),
      updatedAt: serverTimestamp()
    };

    if (googlePhotoURL && user.photoURL !== googlePhotoURL) {
      await this.modules.updateProfile(user, { photoURL: googlePhotoURL });
    }

    await Promise.all([
      update(ref(this.db, `profiles/${user.uid}`), nextProfile),
      update(ref(this.db, `users/${user.uid}`), nextProfile),
      update(ref(this.db, `users/${user.uid}/profile`), nextProfile)
    ]);

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

    const { ref, onValue } = this.modules;
    const uid = this.authUser.uid;
    const latest = {
      profile: null,
      status: null,
      stats: null,
      friends: [],
      requests: [],
      sentRequests: [],
      invites: [],
      notifications: [],
      history: [],
      statuses: {}
    };
    const emit = () => {
      const notifications = latest.notifications || [];
      this.emitLocal('accountDataChanged', {
        ...latest,
        invites: notifications.filter((notification) => notification.type === 'lobby_invite'),
        uid
      });
    };

    const bindValue = (path, key, mapper = (snapshot) => snapshot.val()) => {
      const unsubscribe = onValue(ref(this.db, path), (snapshot) => {
        latest[key] = mapper(snapshot);
        emit();
      });
      this.accountUnsubscribers.push(unsubscribe);
    };

    bindValue(`profiles/${uid}`, 'profile', (snapshot) => {
      const profile = snapshot.val() || null;
      this.currentProfile = profile;
      return profile;
    });
    bindValue(`users/${uid}/status`, 'status');
    bindValue(`users/${uid}/stats`, 'stats');
    bindValue(`users/${uid}/raceHistory`, 'history', (snapshot) => snapshotRecordList(snapshot)
      .filter((match) => normalizeRaceMode(match.mode) === 'multiplayer')
      .sort((a, b) => safeNumber(b.finishedAt || b.createdAt) - safeNumber(a.finishedAt || a.createdAt)));
    bindValue(`friends/${uid}`, 'friends', snapshotList);
    bindValue(`friendRequests/${uid}`, 'requests', snapshotList);
    bindValue(`sentFriendRequests/${uid}`, 'sentRequests', snapshotList);
    bindValue(`notifications/${uid}`, 'notifications', snapshotList);
    bindValue('users', 'statuses', (snapshot) => {
      const users = snapshot.val() || {};
      return Object.fromEntries(
        Object.entries(users).map(([userUid, userData]) => [userUid, userData?.status || null])
      );
    });
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
    const googlePhotoURL = getGoogleProviderPhotoURL(this.authUser);
    const photoURL = googlePhotoURL || cleanPhotoURL(profile.photoURL || '');
    const { ref, update, serverTimestamp } = this.modules;

    this.displayName = displayName;
    const profilePayload = {
      uid: this.authUser.uid,
      displayName,
      nickname: displayName,
      username,
      usernameLower: username,
      nicknameLower: displayName.toLowerCase(),
      email: this.authUser.email || '',
      photoURL,
      bio,
      updatedAt: serverTimestamp()
    };

    await this.modules.updateProfile(this.authUser, {
      displayName,
      photoURL: isWebPhotoURL(photoURL) ? photoURL : null
    });

    await Promise.all([
      update(ref(this.db, `profiles/${this.authUser.uid}`), profilePayload),
      update(ref(this.db, `users/${this.authUser.uid}`), profilePayload),
      update(ref(this.db, `users/${this.authUser.uid}/profile`), profilePayload)
    ]);

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
    const [profilesSnapshot, usersSnapshot] = await Promise.all([
      get(ref(this.db, 'profiles')),
      get(ref(this.db, 'users'))
    ]);
    const profiles = profilesSnapshot.val() || {};
    const users = usersSnapshot.val() || {};
    const mergedProfiles = new Map();

    Object.entries(users).forEach(([uid, value]) => {
      const profile = {
        ...(value?.profile || {}),
        ...(value || {}),
        uid
      };
      mergedProfiles.set(uid, profile);
    });

    Object.entries(profiles).forEach(([uid, value]) => {
      mergedProfiles.set(uid, {
        ...(mergedProfiles.get(uid) || {}),
        ...(value || {}),
        uid
      });
    });

    return Array.from(mergedProfiles.values())
      .filter((profile) => profile?.uid && profile.uid !== this.authUser.uid)
      .filter((profile) => {
        const haystack = [
          profile.username,
          profile.usernameLower,
          profile.nickname,
          profile.nicknameLower,
          profile.displayName,
          profile.email
        ].join(' ').toLowerCase();
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

    const { ref, get, update, push, serverTimestamp } = this.modules;
    const [targetProfileSnapshot, ownProfileSnapshot, existingFriendSnapshot] = await Promise.all([
      get(ref(this.db, `profiles/${target}`)),
      get(ref(this.db, `profiles/${this.authUser.uid}`)),
      get(ref(this.db, `friends/${this.authUser.uid}/${target}`))
    ]);
    const targetProfile = targetProfileSnapshot.val() || {};
    const ownProfile = ownProfileSnapshot.val() || this.currentProfile || {};

    if (existingFriendSnapshot.exists()) {
      return false;
    }

    const notificationRef = push(ref(this.db, `notifications/${target}`));
    const fromName = getProfileName(ownProfile, this.displayName || this.authUser.displayName || 'Driver');
    const toName = getProfileName(targetProfile, 'Driver');

    await update(ref(this.db), {
      [`friendRequests/${target}/${this.authUser.uid}`]: {
        fromUid: this.authUser.uid,
        toUid: target,
        fromName,
        fromPhotoURL: this.getCurrentPhotoURL(),
        status: 'pending',
        createdAt: serverTimestamp()
      },
      [`sentFriendRequests/${this.authUser.uid}/${target}`]: {
        fromUid: this.authUser.uid,
        toUid: target,
        toName,
        toPhotoURL: targetProfile.photoURL || '',
        status: 'pending',
        createdAt: serverTimestamp()
      },
      [`notifications/${target}/${notificationRef.key}`]: {
        type: 'friend_request',
        fromUid: this.authUser.uid,
        createdAt: serverTimestamp()
      }
    });

    return true;
  }

  async cancelFriendRequest(targetUid) {
    this.ensureSignedIn();

    const target = String(targetUid || '').trim();

    if (!target || target === this.authUser.uid) {
      return false;
    }

    const { ref, remove } = this.modules;
    await Promise.all([
      remove(ref(this.db, `friendRequests/${target}/${this.authUser.uid}`)),
      remove(ref(this.db, `sentFriendRequests/${this.authUser.uid}/${target}`))
    ]);
    return true;
  }

  async respondFriendRequest(fromUid, accept = false) {
    this.ensureSignedIn();

    const otherUid = String(fromUid || '').trim();

    if (!otherUid) {
      return false;
    }

    const { ref, get, update, remove, push, serverTimestamp } = this.modules;
    const requestSnapshot = await get(ref(this.db, `friendRequests/${this.authUser.uid}/${otherUid}`));
    const request = requestSnapshot.val() || {};

    if (request.toUid && request.toUid !== this.authUser.uid) {
      throw new Error('This friend request is not addressed to you.');
    }

    const [otherProfileSnapshot, ownProfileSnapshot] = await Promise.all([
      get(ref(this.db, `profiles/${otherUid}`)),
      get(ref(this.db, `profiles/${this.authUser.uid}`))
    ]);
    const otherProfile = otherProfileSnapshot.val() || {};
    const ownProfile = ownProfileSnapshot.val() || this.currentProfile || {};

    if (accept) {
      const notificationRef = push(ref(this.db, `notifications/${otherUid}`));
      await update(ref(this.db), {
        [`friends/${this.authUser.uid}/${otherUid}`]: {
          uid: otherUid,
          name: request.fromName || getProfileName(otherProfile, 'Driver'),
          displayName: request.fromName || getProfileName(otherProfile, 'Driver'),
          username: otherProfile.username || '',
          photoURL: otherProfile.photoURL || request.fromPhotoURL || '',
          createdAt: serverTimestamp()
        },
        [`friends/${otherUid}/${this.authUser.uid}`]: {
          uid: this.authUser.uid,
          name: getProfileName(ownProfile, this.displayName || 'Driver'),
          displayName: getProfileName(ownProfile, this.displayName || 'Driver'),
          username: ownProfile.username || '',
          photoURL: this.getCurrentPhotoURL(),
          createdAt: serverTimestamp()
        },
        [`notifications/${otherUid}/${notificationRef.key}`]: {
          type: 'friend_request_accepted',
          fromUid: this.authUser.uid,
          createdAt: serverTimestamp()
        }
      });
    }

    await Promise.all([
      remove(ref(this.db, `friendRequests/${this.authUser.uid}/${otherUid}`)),
      remove(ref(this.db, `sentFriendRequests/${otherUid}/${this.authUser.uid}`))
    ]);
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
    await push(ref(this.db, `notifications/${target}`), {
      type: 'lobby_invite',
      fromUid: this.authUser.uid,
      fromName: this.displayName || this.authUser.displayName || 'Driver',
      fromPhotoURL: this.getCurrentPhotoURL(),
      roomCode: normalizedRoomCode,
      mode: 'multiplayer',
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
    await remove(ref(this.db, `notifications/${this.authUser.uid}/${id}`));
    return true;
  }

  async recordMatchResult(match = {}) {
    return this.saveMultiplayerRaceHistory(match.roomCode, match);
  }

  async saveMultiplayerRaceHistory(roomCode, raceResult = {}) {
    const raceMode = normalizeRaceMode(raceResult.mode);
    if (raceMode !== 'multiplayer') {
      console.log('[History] skipped because race mode is not multiplayer:', raceMode || 'unknown');
      return false;
    }

    this.ensureSignedIn();

    const normalizedRoomCode = normalizeRoomCode(roomCode || raceResult.roomCode);
    const localResult = raceResult.localResult || {};
    const results = Array.isArray(raceResult.results) ? raceResult.results : [];
    const humanResults = results.filter((player) => !player?.isGhost);
    const totalPlayers = safeNumber(raceResult.totalPlayers, humanResults.length || results.length);
    const placement = safeNumber(localResult.placement ?? localResult.position ?? raceResult.placement);
    const wpm = safeNumber(localResult.wpm ?? raceResult.wpm);
    const accuracy = safeNumber(localResult.accuracy ?? raceResult.accuracy);
    const finishedAtMs = safeNumber(raceResult.finishedAtMs || raceResult.finishedAt || Date.now(), Date.now());
    const durationMs = safeNumber(localResult.durationMs ?? raceResult.durationMs);
    const finishTimeMs = safeNumber(localResult.finishTimeMs ?? localResult.durationMs ?? raceResult.finishTimeMs ?? durationMs);
    const completed = Boolean(localResult.completed ?? raceResult.completed);

    console.log('[History] multiplayer finish detected:', {
      roomCode: normalizedRoomCode,
      placement,
      totalPlayers,
      wpm,
      accuracy,
      completed
    });

    if (!normalizedRoomCode || !placement || !totalPlayers || !Number.isFinite(wpm) || !Number.isFinite(accuracy)) {
      console.warn('[History] skipped because final race result is incomplete.', {
        roomCode: normalizedRoomCode,
        placement,
        totalPlayers,
        wpm,
        accuracy
      });
      return false;
    }

    if (!humanResults.length && localResult.isGhost) {
      console.log('[History] skipped because result only contains AI/bot participants.');
      return false;
    }

    const uid = this.authUser.uid;
    const raceId = String(raceResult.raceId || `${normalizedRoomCode}_${Math.round(finishedAtMs)}`);
    const { ref, get, set, serverTimestamp } = this.modules;
    const historyPath = `users/${uid}/raceHistory/${raceId}`;
    const historyRef = ref(this.db, historyPath);
    const existingSnapshot = await get(historyRef);

    if (existingSnapshot.exists()) {
      console.log('[History] duplicate skipped:', historyPath);
      await this.recalculateUserStats();
      return false;
    }

    const localPlayerId = String(localResult.id || raceResult.localPlayerId || this.playerId || '');
    const presenceByPlayerId = new Map(
      (this.latestRoomParticipants || [])
        .filter((participant) => participant?.playerId)
        .map((participant) => [String(participant.playerId), participant])
    );
    const opponents = results
      .filter((player) => player && !player.isGhost && String(player.id || '') !== localPlayerId)
      .map((player) => {
        const presence = presenceByPlayerId.get(String(player.id || '')) || {};
        return {
          uid: String(presence.uid || player.uid || ''),
          name: cleanDisplayName(presence.displayName || player.name || 'Driver'),
          placement: safeNumber(player.placement ?? player.position),
          wpm: safeNumber(player.wpm),
          accuracy: safeNumber(player.accuracy)
        };
      });

    const historyPayload = {
      raceId,
      roomCode: normalizedRoomCode,
      mode: 'multiplayer',
      trackName: String(raceResult.trackName || raceResult.circuit?.id || 'TypeRace Circuit').slice(0, 80),
      createdAt: serverTimestamp(),
      finishedAt: serverTimestamp(),

      placement,
      totalPlayers,
      isWinner: placement === 1,
      isPodium: placement <= 3,
      completed,

      wpm,
      accuracy,
      mistakes: safeNumber(localResult.mistakes ?? raceResult.mistakes),
      typedChars: safeNumber(localResult.typedChars ?? localResult.totalKeys ?? raceResult.typedChars),
      correctChars: safeNumber(localResult.correctChars ?? localResult.correctKeys ?? raceResult.correctChars),
      durationMs,
      finishTimeMs,

      opponents
    };

    try {
      await set(historyRef, historyPayload);
      console.log('[History] saved:', historyPath);
      await this.recalculateUserStats();
      return true;
    } catch (error) {
      console.error('[History] failed to save at path:', historyPath, error);
      throw error;
    }
  }

  async recalculateUserStats() {
    this.ensureSignedIn();

    const uid = this.authUser.uid;
    const { ref, get, set, serverTimestamp } = this.modules;
    const historyPath = `users/${uid}/raceHistory`;
    const statsPath = `users/${uid}/stats`;
    const historySnapshot = await get(ref(this.db, historyPath));
    const history = snapshotRecordList(historySnapshot)
      .filter((match) => normalizeRaceMode(match.mode) === 'multiplayer');
    const matches = history.length;
    const wins = history.filter((match) => safeNumber(match.placement) === 1).length;
    const podiums = history.filter((match) => {
      const placement = safeNumber(match.placement);
      return placement > 0 && placement <= 3;
    }).length;
    const completedHistory = history.filter((match) => match.completed === true);
    const sum = (field, items = history) => items.reduce((total, match) => total + safeNumber(match[field]), 0);
    const avg = (field, items = history) => items.length ? sum(field, items) / items.length : 0;
    const max = (field) => history.reduce((best, match) => Math.max(best, safeNumber(match[field])), 0);
    const stats = {
      matches,
      wins,
      podiums,
      winRate: matches ? roundNumber((wins / matches) * 100, 1) : 0,
      avgWpm: matches ? roundNumber(avg('wpm'), 1) : 0,
      bestWpm: max('wpm'),
      avgAccuracy: matches ? roundNumber(avg('accuracy'), 1) : 0,
      bestAccuracy: max('accuracy'),
      totalTyped: sum('typedChars'),
      completed: completedHistory.length,
      p1: history.filter((match) => safeNumber(match.placement) === 1).length,
      p2: history.filter((match) => safeNumber(match.placement) === 2).length,
      p3: history.filter((match) => safeNumber(match.placement) === 3).length,
      avgFinishMs: completedHistory.length ? Math.round(avg('finishTimeMs', completedHistory)) : 0,
      updatedAt: serverTimestamp()
    };

    try {
      await set(ref(this.db, statsPath), stats);
      console.log('[History] stats recalculated:', statsPath, stats);
      return stats;
    } catch (error) {
      console.error('[History] failed to write stats at path:', statsPath, error);
      throw error;
    }
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
    return getPreferredPhotoURL(this.authUser, this.currentProfile || {});
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

    try {
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
    } catch (error) {
      console.warn('Firebase room presence write failed:', error);
    }

    try {
      await update(ref(this.db, `users/${this.authUser.uid}/status`), {
        state: 'online',
        displayName: this.displayName,
        photoURL,
        roomCode: normalizedRoomCode,
        lastChanged: serverTimestamp()
      });
    } catch (error) {
      console.warn('Firebase room status write failed:', error);
    }

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

      this.latestRoomParticipants = users;
      this.emitLocal('presenceChanged', { roomCode, users });
      this.syncVoiceParticipants();
    }));

    this.subscribeVoiceSignals();
    this.subscribeVoicePeers();
  }

  clearRoomSubscriptions() {
    this.roomUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.roomUnsubscribers = [];
    this.cleanupVoiceListeners();
    this.latestVoicePeers = [];
    this.latestRoomParticipants = [];
    this.processedVoiceSignalIds.clear();
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

    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    this.voiceActive = true;
    this.micMuted = false;
    this.voiceStatus = 'connecting';
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });
    this.emitVoiceState();

    try {
      await this.publishVoicePeer(this.currentRoomCode);
      this.startSpeakingMeter();
      this.subscribeVoiceSignals();
      this.subscribeVoicePeers();
      this.syncVoiceParticipants();
      this.voiceStatus = 'connected';
      this.emitVoiceState();
    } catch (error) {
      await this.stopVoice();
      this.voiceStatus = 'error';
      this.emitVoiceState({ error });
      throw error;
    }

    return true;
  }

  async stopVoice() {
    const roomCode = this.currentRoomCode;
    const uid = this.authUser?.uid;

    this.voiceActive = false;
    this.micMuted = false;
    this.voiceStatus = 'idle';
    this.cleanupVoiceListeners();
    this.cleanupVoiceConnections();
    this.stopSpeakingMeter();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.reconnectListeningPeers();

    this.emitVoiceState();

    if (!this.ready || !roomCode || !uid) {
      return;
    }

    await this.removeVoicePeer(roomCode).catch((error) => {
      console.warn('Firebase stop voice failed:', error);
    });
  }

  emitVoiceState(extra = {}) {
    this.emitLocal('voiceChanged', {
      active: this.voiceActive,
      micMuted: this.micMuted,
      speakerEnabled: this.speakerEnabled,
      status: this.voiceStatus,
      ...extra
    });
  }

  async publishVoicePeer(roomCode = this.currentRoomCode) {
    if (!this.ready || !this.authUser || !roomCode) {
      return false;
    }

    const { ref, set, update, onDisconnect, serverTimestamp } = this.modules;
    const peerRef = ref(this.db, `rooms/${roomCode}/voice/peers/${this.authUser.uid}`);
    await set(peerRef, {
      uid: this.authUser.uid,
      name: this.displayName || this.authUser.displayName || 'Driver',
      displayName: this.displayName || this.authUser.displayName || 'Driver',
      micEnabled: this.voiceActive,
      muted: this.micMuted,
      speakerEnabled: this.speakerEnabled,
      active: this.voiceActive,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    onDisconnect(peerRef).remove()
      .catch((error) => console.warn('Firebase voice onDisconnect failed:', error));

    update(ref(this.db, `rooms/${roomCode}/presence/${this.authUser.uid}`), {
      mic: this.voiceActive && !this.micMuted,
      speaking: false,
      voiceLevel: 0,
      updatedAt: serverTimestamp()
    }).catch((error) => console.warn('Firebase voice presence update failed:', error));

    return true;
  }

  async removeVoicePeer(roomCode = this.currentRoomCode) {
    if (!this.ready || !this.authUser || !roomCode) {
      return false;
    }

    const { ref, remove, update, serverTimestamp } = this.modules;
    await update(ref(this.db, `rooms/${roomCode}/presence/${this.authUser.uid}`), {
      mic: false,
      speaking: false,
      voiceLevel: 0,
      updatedAt: serverTimestamp()
    });
    await remove(ref(this.db, `rooms/${roomCode}/voice/peers/${this.authUser.uid}`));
    return true;
  }

  async muteMic() {
    if (!this.voiceActive) {
      return false;
    }

    this.micMuted = true;
    this.localStream?.getAudioTracks?.().forEach((track) => {
      track.enabled = false;
    });
    this.stopSpeakingMeter();
    this.emitVoiceState();
    await this.updateVoicePeerState();
    return true;
  }

  async unmuteMic() {
    if (!this.voiceActive) {
      return false;
    }

    this.micMuted = false;
    this.localStream?.getAudioTracks?.().forEach((track) => {
      track.enabled = true;
    });
    this.startSpeakingMeter();
    this.emitVoiceState();
    await this.updateVoicePeerState();
    return true;
  }

  async toggleMicMute() {
    return this.micMuted ? this.unmuteMic() : this.muteMic();
  }

  async toggleSpeaker() {
    this.speakerEnabled = !this.speakerEnabled;
    this.applyVoiceOutputSettings();
    this.emitVoiceState();
    await this.updateVoicePeerState({ presence: false });
    return this.speakerEnabled;
  }

  async updateVoicePeerState({ presence = true } = {}) {
    if (!this.ready || !this.currentRoomCode || !this.authUser) {
      return false;
    }

    const { ref, update, serverTimestamp } = this.modules;
    await update(ref(this.db, `rooms/${this.currentRoomCode}/voice/peers/${this.authUser.uid}`), {
      micEnabled: this.voiceActive,
      muted: this.micMuted,
      speakerEnabled: this.speakerEnabled,
      active: this.voiceActive,
      updatedAt: serverTimestamp()
    });

    if (presence) {
      await update(ref(this.db, `rooms/${this.currentRoomCode}/presence/${this.authUser.uid}`), {
        mic: this.voiceActive && !this.micMuted,
        speaking: false,
        voiceLevel: 0,
        updatedAt: serverTimestamp()
      });
    }

    return true;
  }

  cleanupVoiceConnections() {
    Array.from(this.peerConnections.keys()).forEach((remoteUid) => this.closePeer(remoteUid));
    this.peerConnections.clear();
    this.queuedCandidates.clear();
  }

  cleanupVoiceListeners() {
    this.voiceUnsubscribers.forEach((unsubscribe) => unsubscribe());
    this.voiceUnsubscribers = [];
    this.voiceSignalsRoomCode = '';
    this.voicePeersRoomCode = '';
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
        if (!this.voiceActive || this.micMuted || !this.voiceAnalyser) {
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
      mic: this.voiceActive && !this.micMuted,
      speaking,
      voiceLevel,
      updatedAt: serverTimestamp()
    }).catch((error) => console.warn('Firebase speaking state failed:', error));
  }

  subscribeVoiceSignals() {
    if (!this.currentRoomCode || !this.authUser || this.voiceSignalsRoomCode === this.currentRoomCode) {
      return;
    }

    this.voiceSignalsRoomCode = this.currentRoomCode;
    const { ref, onChildAdded } = this.modules;
    const inboxRef = ref(this.db, `rooms/${this.currentRoomCode}/voice/signals/${this.authUser.uid}`);

    this.voiceUnsubscribers.push(onChildAdded(inboxRef, async (snapshot) => {
      const signalKey = `${this.currentRoomCode}:${snapshot.key}`;

      if (this.processedVoiceSignalIds.has(signalKey)) {
        return;
      }

      this.processedVoiceSignalIds.add(signalKey);
      const signal = snapshot.val();
      const createdAt = Number(signal?.createdAt) || 0;
      const isStaleSignal = createdAt > 0 && Date.now() - createdAt > 120000;

      try {
        if (!isStaleSignal) {
          await this.handleSignal(signal);
        }
      } catch (error) {
        console.warn('Voice signal failed:', error);
      }
    }));
  }

  subscribeVoicePeers() {
    if (!this.currentRoomCode || !this.authUser || this.voicePeersRoomCode === this.currentRoomCode) {
      return;
    }

    this.voicePeersRoomCode = this.currentRoomCode;
    const { ref, onValue } = this.modules;
    const peersRef = ref(this.db, `rooms/${this.currentRoomCode}/voice/peers`);

    this.voiceUnsubscribers.push(onValue(peersRef, (snapshot) => {
      const peers = snapshotList(snapshot)
        .filter((peer) => (peer.micEnabled || peer.active) && peer.uid && peer.uid !== this.authUser?.uid);
      this.latestVoicePeers = peers;

      this.emitLocal('voicePeersChanged', { peers });
      this.syncVoiceParticipants();
    }));
  }

  syncVoiceParticipants() {
    if (!this.currentRoomCode || !this.authUser) {
      return;
    }

    const localUid = String(this.authUser.uid || '');
    const participantIds = new Set(
      (this.latestRoomParticipants || [])
        .map((participant) => String(participant.uid || '').trim())
        .filter((uid) => uid && uid !== localUid)
    );
    const activeVoicePeerIds = new Set(
      (this.latestVoicePeers || [])
        .map((peer) => String(peer.uid || '').trim())
        .filter((uid) => uid && uid !== localUid)
    );

    Array.from(this.peerConnections.keys()).forEach((remoteUid) => {
      const isParticipant = participantIds.has(String(remoteUid));
      const shouldKeepListening = !this.voiceActive && activeVoicePeerIds.has(String(remoteUid));

      if (!isParticipant || (!this.voiceActive && !shouldKeepListening)) {
        this.closePeer(remoteUid);
      }
    });

    if (this.voiceActive) {
      participantIds.forEach((remoteUid) => {
        this.ensurePeer(remoteUid, this.shouldCreateOfferToPeer(remoteUid));
      });
      this.syncLocalTracksToPeers();
      return;
    }

    activeVoicePeerIds.forEach((remoteUid) => {
      this.ensurePeer(remoteUid, false);
    });
  }

  shouldCreateOfferToPeer(remoteUid) {
    if (!this.voiceActive || !this.authUser || !remoteUid) {
      return false;
    }

    const localUid = String(this.authUser.uid || '');
    const targetUid = String(remoteUid || '');
    const remoteMicActive = (this.latestVoicePeers || [])
      .some((peer) => String(peer.uid || '') === targetUid);

    return remoteMicActive ? localUid < targetUid : true;
  }

  reconnectListeningPeers() {
    if (!this.currentRoomCode || !this.authUser || this.voiceActive) {
      return;
    }

    this.latestVoicePeers.forEach((peer) => {
      if (peer?.uid && peer.uid !== this.authUser.uid) {
        this.ensurePeer(peer.uid, false);
      }
    });
  }

  syncLocalTracksToPeers() {
    if (!this.localStream?.getAudioTracks().length) {
      return;
    }

    this.peerConnections.forEach((connection, remoteUid) => {
      const hasAudioSender = connection.getSenders()
        .some((sender) => sender.track?.kind === 'audio');

      if (!hasAudioSender) {
        this.localStream.getAudioTracks().forEach((track) => {
          connection.addTrack(track, this.localStream);
        });
      }

      if (connection.signalingState === 'stable' && this.shouldCreateOfferToPeer(remoteUid)) {
        this.createOffer(remoteUid, connection).catch((error) => {
          console.warn('Voice renegotiation failed:', error);
        });
      }
    });
  }

  ensurePeer(remoteUid, shouldOffer = false) {
    const targetUid = String(remoteUid || '').trim();

    if (!targetUid || targetUid === this.authUser?.uid) {
      return null;
    }

    if (this.peerConnections.has(targetUid)) {
      const existingConnection = this.peerConnections.get(targetUid);
      if (['closed', 'failed'].includes(existingConnection.connectionState)) {
        this.closePeer(targetUid);
      } else {
        this.attachLocalAudioTracks(existingConnection);
        return existingConnection;
      }
    }

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(targetUid, connection);

    if (!this.attachLocalAudioTracks(connection)) {
      connection.addTransceiver('audio', { direction: 'recvonly' });
    }

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

      this.sendSignal(targetUid, 'candidate', candidate).catch((error) => {
        console.warn('ICE candidate send failed:', error);
      });
    };

    connection.ontrack = (event) => {
      const [stream] = event.streams;

      if (!stream) {
        return;
      }

      this.attachRemoteAudio(targetUid, stream);
    };

    connection.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(connection.connectionState)) {
        this.closePeer(targetUid);
        if (this.voiceActive && this.latestRoomParticipants.some((participant) => String(participant.uid || '') === targetUid)) {
          window.setTimeout(() => this.ensurePeer(targetUid, this.shouldCreateOfferToPeer(targetUid)), 500);
        }
      }
    };

    if (shouldOffer) {
      queueMicrotask(() => this.createOffer(targetUid, connection));
    }

    return connection;
  }

  attachLocalAudioTracks(connection) {
    const audioTracks = this.localStream?.getAudioTracks?.() || [];

    if (!connection || !audioTracks.length) {
      return false;
    }

    audioTracks.forEach((track) => {
      track.enabled = this.voiceActive && !this.micMuted;
      const existingSender = connection.getSenders()
        .find((sender) => sender.track?.kind === 'audio');

      if (existingSender) {
        if (existingSender.track !== track) {
          existingSender.replaceTrack(track).catch((error) => {
            console.warn('Voice replaceTrack failed:', error);
          });
        }
        return;
      }

      connection.addTrack(track, this.localStream);
    });

    return true;
  }

  async createOffer(remoteUid, connection) {
    if (!connection || !this.currentRoomCode || !this.authUser || connection.signalingState !== 'stable') {
      return;
    }

    this.attachLocalAudioTracks(connection);
    const offer = await connection.createOffer({ offerToReceiveAudio: true });
    await connection.setLocalDescription(offer);
    await this.sendSignal(remoteUid, 'offer', {
      type: offer.type,
      sdp: offer.sdp
    });
  }

  async handleSignal(signal) {
    const fromUid = String(signal?.fromUid || signal?.from || '').trim();
    const signalRoomCode = String(signal?.roomCode || this.currentRoomCode || '').trim().toUpperCase();

    if (
      !this.currentRoomCode
      || !this.authUser
      || !fromUid
      || fromUid === this.authUser?.uid
      || signalRoomCode !== this.currentRoomCode
    ) {
      return;
    }

    const connection = this.ensurePeer(fromUid, false);

    if (!connection) {
      return;
    }

    if (signal.type === 'offer') {
      if (connection.signalingState !== 'stable') {
        try {
          await connection.setLocalDescription({ type: 'rollback' });
        } catch (_error) {}
      }

      await connection.setRemoteDescription(new RTCSessionDescription(signal.payload || signal.data));
      await this.flushQueuedCandidates(fromUid, connection);

      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await this.sendSignal(fromUid, 'answer', {
        type: answer.type,
        sdp: answer.sdp
      });
      return;
    }

    if (signal.type === 'answer') {
      if (connection.signalingState === 'have-local-offer') {
        await connection.setRemoteDescription(new RTCSessionDescription(signal.payload || signal.data));
        await this.flushQueuedCandidates(fromUid, connection);
      }
      return;
    }

    const candidatePayload = signal.payload || signal.data;

    if (signal.type === 'candidate' && candidatePayload?.candidate) {
      if (!connection.remoteDescription?.type) {
        if (!this.queuedCandidates.has(fromUid)) {
          this.queuedCandidates.set(fromUid, []);
        }

        this.queuedCandidates.get(fromUid).push(candidatePayload);
        return;
      }

      await connection.addIceCandidate(new RTCIceCandidate(candidatePayload));
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
      to: remoteUid,
      roomCode: this.currentRoomCode,
      name: this.displayName,
      type,
      payload: data,
      createdAt: serverTimestamp()
    });
  }

  initVoice(roomCode = this.currentRoomCode) {
    this.currentRoomCode = normalizeRoomCode(roomCode || this.currentRoomCode);
    this.subscribeVoiceSignals();
    this.subscribeVoicePeers();
    return Boolean(this.currentRoomCode);
  }

  startMic(roomCode = this.currentRoomCode) {
    if (roomCode) {
      this.currentRoomCode = normalizeRoomCode(roomCode);
    }
    return this.startVoice();
  }

  stopMic() {
    return this.stopVoice();
  }

  createPeerConnection(roomCode, remoteUid) {
    if (roomCode) {
      this.currentRoomCode = normalizeRoomCode(roomCode);
    }
    return this.ensurePeer(remoteUid, false);
  }

  ensurePeerConnection(roomCode, remoteUid) {
    return this.createPeerConnection(roomCode, remoteUid);
  }

  startCallToPeer(roomCode, remoteUid) {
    if (roomCode) {
      this.currentRoomCode = normalizeRoomCode(roomCode);
    }
    return this.ensurePeer(remoteUid, true);
  }

  listenVoicePeers(roomCode = this.currentRoomCode) {
    if (roomCode) {
      this.currentRoomCode = normalizeRoomCode(roomCode);
    }
    return this.subscribeVoicePeers();
  }

  listenVoiceSignals(roomCode = this.currentRoomCode) {
    if (roomCode) {
      this.currentRoomCode = normalizeRoomCode(roomCode);
    }
    return this.subscribeVoiceSignals();
  }

  handleOffer(roomCode, signal) {
    if (roomCode) {
      this.currentRoomCode = normalizeRoomCode(roomCode);
    }
    return this.handleSignal({ ...signal, type: 'offer' });
  }

  handleAnswer(roomCode, signal) {
    if (roomCode) {
      this.currentRoomCode = normalizeRoomCode(roomCode);
    }
    return this.handleSignal({ ...signal, type: 'answer' });
  }

  handleCandidate(roomCode, signal) {
    if (roomCode) {
      this.currentRoomCode = normalizeRoomCode(roomCode);
    }
    return this.handleSignal({ ...signal, type: 'candidate' });
  }

  cleanupVoice(roomCode = this.currentRoomCode) {
    void roomCode;
    return this.stopVoice();
  }

  setVoiceOutput({ volume = this.voiceOutputVolume, muted = this.voiceOutputMuted } = {}) {
    const nextVolume = Math.max(0, Math.min(1, Number(volume)));
    this.voiceOutputVolume = Number.isFinite(nextVolume) ? nextVolume : 1;
    this.voiceOutputMuted = Boolean(muted);
    this.applyVoiceOutputSettings();
  }

  applyVoiceOutputSettings() {
    this.remoteAudioElements.forEach((audio) => {
      audio.volume = this.voiceOutputVolume;
      audio.muted = !this.speakerEnabled || this.voiceOutputMuted || this.voiceOutputVolume <= 0;
    });
  }

  attachRemoteAudio(remoteUid, stream) {
    let audio = this.remoteAudioElements.get(remoteUid);

    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.controls = false;
      audio.playsInline = true;
      audio.dataset.remoteVoice = remoteUid;
      document.body.appendChild(audio);
      this.remoteAudioElements.set(remoteUid, audio);
    }

    audio.srcObject = stream;
    this.applyVoiceOutputSettings();
    audio.play().catch((error) => {
      console.warn('Remote voice playback was blocked until the next tap:', error);
      this.queueRemoteAudioUnlock();
    });
  }

  renderRemoteAudio(remoteUid, stream) {
    return this.attachRemoteAudio(remoteUid, stream);
  }

  removeRemoteAudio(remoteUid) {
    const audio = this.remoteAudioElements.get(remoteUid);

    if (audio) {
      audio.srcObject = null;
      audio.remove();
      this.remoteAudioElements.delete(remoteUid);
    }
  }

  queueRemoteAudioUnlock() {
    const unlock = () => {
      this.remoteAudioElements.forEach((audio) => {
        audio.play().catch(() => {});
      });

      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };

    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
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

    this.removeRemoteAudio(remoteUid);
  }

  getCurrentUser() {
    return this.authUser;
  }
}
