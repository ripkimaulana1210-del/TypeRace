import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

const FIREBASE_SDK_VERSION = '10.12.4';
const MAX_CHAT_LENGTH = 500;
const MAX_CHAT_MESSAGES = 80;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function normalizeRoomCode(roomCode = '') {
  return String(roomCode || '').trim().toUpperCase();
}

function cleanDisplayName(name = '', fallback = 'Pembalap') {
  const cleaned = String(name || '').trim().slice(0, 32);
  return cleaned || fallback;
}

function cleanChatText(text = '') {
  return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
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
    this.voiceUnsubscribers = [];
    this.peerConnections = new Map();
    this.remoteAudioElements = new Map();
    this.queuedCandidates = new Map();
    this.localStream = null;
    this.voiceActive = false;
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
      this.emitStatus('Firebase belum dikonfigurasi.');
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

      this.emitStatus('Firebase siap.');
      return { enabled: true };
    } catch (error) {
      this.ready = false;
      this.emitStatus('Firebase gagal dimuat. Cek koneksi dan config.', { error });
      console.error('Firebase init failed:', error);
      return { enabled: false, error };
    }
  }

  ensureReady() {
    if (!this.ready || !this.auth || !this.db) {
      throw new Error('Firebase belum siap. Isi config Firebase lalu refresh.');
    }
  }

  ensureSignedIn() {
    this.ensureReady();

    if (!this.authUser) {
      throw new Error('Login dulu untuk memakai chat dan voice.');
    }
  }

  async register({ email, password, displayName }) {
    this.ensureReady();

    const credential = await this.modules.createUserWithEmailAndPassword(
      this.auth,
      String(email || '').trim(),
      String(password || '')
    );

    const name = cleanDisplayName(displayName, credential.user.email?.split('@')[0] || 'Pembalap');
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
      this.emitLocal('authChanged', { user: null, displayName: '' });
      return;
    }

    this.displayName = cleanDisplayName(user.displayName, user.email?.split('@')[0] || 'Pembalap');

    try {
      await this.upsertUserProfile(user, this.displayName);
    } catch (error) {
      console.warn('Firebase auth profile sync failed:', error);
    }

    this.startGlobalPresence();

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

    const { ref, set, serverTimestamp } = this.modules;
    await set(ref(this.db, `users/${user.uid}/profile`), {
      uid: user.uid,
      displayName: cleanDisplayName(displayName, user.email?.split('@')[0] || 'Pembalap'),
      updatedAt: serverTimestamp()
    });
  }

  async setDisplayName(name) {
    if (!this.ready || !this.authUser) {
      return;
    }

    const nextName = cleanDisplayName(name, this.displayName || 'Pembalap');
    this.displayName = nextName;

    if (this.authUser.displayName !== nextName) {
      await this.modules.updateProfile(this.authUser, { displayName: nextName });
    }

    await this.upsertUserProfile(this.authUser, nextName);
    await this.refreshPresenceName(nextName);
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

  async setGlobalPresence(state = 'online') {
    if (!this.ready || !this.authUser) {
      return;
    }

    const { ref, set, serverTimestamp } = this.modules;
    await set(ref(this.db, `users/${this.authUser.uid}/status`), {
      state,
      displayName: this.displayName,
      roomCode: state === 'online' ? this.currentRoomCode || null : null,
      lastChanged: serverTimestamp()
    });
  }

  async refreshPresenceName(displayName = this.displayName) {
    if (!this.ready || !this.authUser) {
      return;
    }

    const { ref, update, serverTimestamp } = this.modules;
    await update(ref(this.db, `users/${this.authUser.uid}/status`), {
      displayName,
      lastChanged: serverTimestamp()
    });

    if (this.currentRoomCode) {
      await update(ref(this.db, `rooms/${this.currentRoomCode}/presence/${this.authUser.uid}`), {
        displayName,
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
    this.displayName = cleanDisplayName(displayName, this.displayName || 'Pembalap');

    const { ref, set, update, onDisconnect, serverTimestamp } = this.modules;
    const roomPresenceRef = ref(this.db, `rooms/${normalizedRoomCode}/presence/${this.authUser.uid}`);

    await set(roomPresenceRef, {
      uid: this.authUser.uid,
      playerId: this.playerId,
      displayName: this.displayName,
      state: 'online',
      mic: this.voiceActive,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    onDisconnect(roomPresenceRef).remove()
      .catch((error) => console.warn('Firebase room onDisconnect failed:', error));

    await update(ref(this.db, `users/${this.authUser.uid}/status`), {
      state: 'online',
      displayName: this.displayName,
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
      throw new Error('Masuk room dulu untuk chat.');
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
      throw new Error('Masuk room dulu untuk open mic.');
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Browser tidak mendukung akses mikrofon.');
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
        updatedAt: serverTimestamp()
      });

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
        updatedAt: serverTimestamp()
      });
      await remove(ref(this.db, `rooms/${roomCode}/voice/peers/${uid}`));
      await remove(ref(this.db, `rooms/${roomCode}/voice/signals/${uid}`));
    } catch (error) {
      console.warn('Firebase stop voice failed:', error);
    }
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
