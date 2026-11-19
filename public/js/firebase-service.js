import { isFirebaseConfigured } from './firebase-config.js';

export { isFirebaseConfigured };

const LOCAL_STORAGE_USER_KEY = 'typerace_server_auth_user';
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

export class FirebaseRaceService {
  constructor() {
    this.ready = true;
    this.configured = true;
    this.authUser = null;
    this.displayName = 'Driver';
    this.playerId = '';
    this.currentRoomCode = '';
    this.listeners = new Map();
    this.socket = null;

    // WebRTC Voice Chat State
    this.peerConnections = new Map();
    this.remoteAudioElements = new Map();
    this.localStream = null;
    this.voiceActive = false;
    this.micMuted = false;
    this.speakerEnabled = true;
    this.voiceStatus = 'idle';
    this.voiceAudioContext = null;
    this.voiceAnalyser = null;
    this.voiceSource = null;
    this.voiceMeterTimer = null;
    this.lastSpeakingState = false;
    this.lastVoiceLevel = 0;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(handler);
  }

  emitLocal(event, payload) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach((h) => {
      try {
        h(payload);
      } catch (err) {
        console.error(`Error in event handler for ${event}:`, err);
      }
    });
  }

  emitStatus(message, detail = {}) {
    this.emitLocal('statusChanged', {
      configured: true,
      ready: true,
      message,
      ...detail
    });
  }

  async init() {
    // 1. Ambil session user yang tersimpan di localStorage
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.uid) {
          this.authUser = parsed;
          this.displayName = parsed.displayName || 'Driver';
        }
      }
    } catch (_err) {
      // Abaikan jika localStorage tidak bisa diakses
    }

    // 2. Setup Socket.IO client untuk Chat & Voice
    if (typeof window !== 'undefined' && window.io) {
      this.socket = window.io();
      this.setupSocketListeners();
    } else {
      window.addEventListener('DOMContentLoaded', () => {
        if (window.io && !this.socket) {
          this.socket = window.io();
          this.setupSocketListeners();
        }
      });
    }

    this.emitStatus('Database Server (PostgreSQL) Ready.');
    this.emitLocal('authChanged', { user: this.authUser });

    // 3. Tarik data profil dan statistik driver dari PostgreSQL
    if (this.authUser?.uid) {
      this.syncAccountData();
    }

    return { enabled: true };
  }

  setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('chat:message', (msg) => {
      this.emitLocal('messageAdded', msg);
    });

    this.socket.on('voice:signal', (signal) => {
      this.handleRemoteSignal(signal);
    });

    this.socket.on('voice:speaking', (payload) => {
      this.emitLocal('voiceLevelChanged', payload);
    });

    this.socket.on('voice:state', (payload) => {
      this.emitLocal('voiceChanged', payload);
    });
  }

  getCurrentUser() {
    return this.authUser;
  }

  async syncAccountData() {
    if (!this.authUser?.uid) return;
    try {
      const res = await fetch(`/api/users/${this.authUser.uid}/full`);
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          const { profile, stats, history } = json.data;
          this.emitLocal('accountDataChanged', {
            profile: {
              displayName: profile.displayName || this.displayName,
              username: profile.username || this.authUser.email?.split('@')[0],
              bio: profile.bio || 'F1 Racing Driver',
              photoURL: profile.photoURL || ''
            },
            stats,
            history
          });
        }
      }
    } catch (err) {
      console.warn('Sync account data failed:', err);
    }
  }

  async register({ email, password, displayName }) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    this.authUser = data.user;
    this.displayName = data.user.displayName;
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(data.user));

    this.emitLocal('authChanged', { user: this.authUser });
    await this.syncAccountData();

    return { user: this.authUser };
  }

  async login({ email, password, displayName }) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Login failed');
    }

    this.authUser = data.user;
    if (displayName && displayName !== data.user.displayName) {
      this.displayName = displayName;
      this.authUser.displayName = displayName;
    } else {
      this.displayName = data.user.displayName;
    }
    localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(this.authUser));

    this.emitLocal('authChanged', { user: this.authUser });
    await this.syncAccountData();

    return { user: this.authUser };
  }

  async loginWithGoogle() {
    // Mode offline/server: quick login pengemudi
    const guestName = 'Driver_' + Math.floor(Math.random() * 899 + 100);
    const guestEmail = `${guestName.toLowerCase()}@f1.server`;
    return this.register({
      email: guestEmail,
      password: 'server_guest_password_123',
      displayName: guestName
    });
  }

  async logout() {
    this.authUser = null;
    this.displayName = 'Driver';
    localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
    this.emitLocal('authChanged', { user: null });
    this.emitLocal('accountDataChanged', {
      profile: { displayName: 'Driver', bio: 'No bio yet.' },
      stats: {},
      history: []
    });
  }

  async setDisplayName(name) {
    if (!name) return;
    this.displayName = name.trim().slice(0, 30);
    if (this.authUser) {
      this.authUser.displayName = this.displayName;
      localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(this.authUser));
      await this.updateProfileData({ displayName: this.displayName });
    }
  }

  async updateProfileData(profile = {}) {
    if (!this.authUser?.uid) return profile;
    try {
      const res = await fetch(`/api/users/${this.authUser.uid}/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      if (data.ok && data.data) {
        if (profile.displayName) {
          this.displayName = profile.displayName;
          this.authUser.displayName = profile.displayName;
          localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(this.authUser));
          this.emitLocal('authChanged', { user: this.authUser });
        }
        await this.syncAccountData();
        return data.data.profile;
      }
    } catch (err) {
      console.error('Update profile error:', err);
    }
    return profile;
  }

  async recordMatchResult(match = {}) {
    try {
      await fetch('/api/matches/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...match,
          uid: this.authUser?.uid || null,
          displayName: this.displayName
        })
      });
      // Sinkronkan kembali statistik balapan terbaru ke profil driver
      await this.syncAccountData();
    } catch (err) {
      console.warn('Record match result to server failed:', err);
    }
  }

  async saveMultiplayerRaceHistory(roomCode, raceResult = {}) {
    return this.recordMatchResult({
      roomCode,
      wpm: raceResult.wpm || 0,
      accuracy: raceResult.accuracy || 0,
      finishPosition: raceResult.finishPosition || 1,
      charsTyped: raceResult.charsTyped || 0
    });
  }

  async joinRoom(roomCode, displayName = this.displayName, playerId = '') {
    this.currentRoomCode = String(roomCode || '').trim().toUpperCase();
    this.displayName = displayName || this.displayName;
    this.playerId = playerId || this.playerId;

    this.emitLocal('roomChanged', { roomCode: this.currentRoomCode });
    this.emitLocal('presenceChanged', {
      roomCode: this.currentRoomCode,
      users: [{ uid: this.authUser?.uid || playerId, displayName: this.displayName }]
    });

    return true;
  }

  async leaveRoom() {
    this.stopVoice();
    this.currentRoomCode = '';
    this.emitLocal('roomChanged', { roomCode: '' });
  }

  async sendMessage(text) {
    const cleanText = String(text || '').trim().slice(0, 300);
    if (!cleanText || !this.currentRoomCode) return false;

    if (this.socket) {
      this.socket.emit('chat:send', {
        roomCode: this.currentRoomCode,
        text: cleanText,
        displayName: this.displayName,
        uid: this.authUser?.uid || this.socket.id
      });
    }
    return true;
  }

  // --- Fitur Voice WebRTC Melalui Socket.IO ---
  async toggleVoice() {
    if (this.voiceActive) {
      await this.stopVoice();
    } else {
      await this.startVoice();
    }
  }

  async startVoice() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.voiceActive = true;
      this.voiceStatus = 'connected';
      this.emitLocal('voiceChanged', { active: true, muted: this.micMuted, status: this.voiceStatus });

      if (this.socket && this.currentRoomCode) {
        this.socket.emit('voice:signal', {
          roomCode: this.currentRoomCode,
          type: 'join',
          fromUid: this.authUser?.uid || this.socket.id,
          name: this.displayName
        });
      }
    } catch (err) {
      console.warn('Microphone access denied or not available:', err);
      this.voiceActive = false;
      this.voiceStatus = 'error';
      this.emitLocal('voiceChanged', { active: false, error: err.message, status: this.voiceStatus });
    }
  }

  async stopVoice() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();
    this.remoteAudioElements.forEach((el) => el.remove());
    this.remoteAudioElements.clear();

    this.voiceActive = false;
    this.voiceStatus = 'idle';
    this.emitLocal('voiceChanged', { active: false, status: this.voiceStatus });
  }

  async toggleMicMute() {
    this.micMuted = !this.micMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = !this.micMuted;
      });
    }
    this.emitLocal('voiceChanged', { active: this.voiceActive, muted: this.micMuted, status: this.voiceStatus });
    return this.micMuted;
  }

  async muteMic() {
    if (!this.micMuted) await this.toggleMicMute();
  }

  async unmuteMic() {
    if (this.micMuted) await this.toggleMicMute();
  }

  async toggleSpeaker() {
    this.speakerEnabled = !this.speakerEnabled;
    this.remoteAudioElements.forEach((el) => {
      el.muted = !this.speakerEnabled;
    });
    this.emitLocal('voiceChanged', { speakerEnabled: this.speakerEnabled });
    return this.speakerEnabled;
  }

  setVoiceOutput(settings = {}) {
    if (settings.muted !== undefined) {
      this.speakerEnabled = !settings.muted;
      this.remoteAudioElements.forEach((el) => {
        el.muted = !this.speakerEnabled;
      });
    }
  }

  async handleRemoteSignal(signal = {}) {
    const { fromUid, type, payload, name } = signal;
    if (!fromUid || fromUid === (this.authUser?.uid || this.socket?.id)) return;

    if (type === 'join' && this.voiceActive) {
      const pc = this.createPeerConnection(fromUid, name);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('voice:signal', {
        targetUid: fromUid,
        roomCode: this.currentRoomCode,
        type: 'offer',
        data: offer,
        fromUid: this.authUser?.uid || this.socket.id,
        name: this.displayName
      });
    } else if (type === 'offer') {
      const pc = this.createPeerConnection(fromUid, name);
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.socket.emit('voice:signal', {
        targetUid: fromUid,
        roomCode: this.currentRoomCode,
        type: 'answer',
        data: answer,
        fromUid: this.authUser?.uid || this.socket.id,
        name: this.displayName
      });
    } else if (type === 'answer') {
      const pc = this.peerConnections.get(fromUid);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
      }
    } else if (type === 'candidate') {
      const pc = this.peerConnections.get(fromUid);
      if (pc && payload) {
        await pc.addIceCandidate(new RTCIceCandidate(payload)).catch((e) => console.warn(e));
      }
    }
  }

  createPeerConnection(targetUid, name) {
    if (this.peerConnections.has(targetUid)) {
      return this.peerConnections.get(targetUid);
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(targetUid, pc);

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && this.socket) {
        this.socket.emit('voice:signal', {
          targetUid,
          roomCode: this.currentRoomCode,
          type: 'candidate',
          data: e.candidate,
          fromUid: this.authUser?.uid || this.socket.id,
          name: this.displayName
        });
      }
    };

    pc.ontrack = (e) => {
      const [remoteStream] = e.streams;
      if (remoteStream && !this.remoteAudioElements.has(targetUid)) {
        const audio = document.createElement('audio');
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        audio.muted = !this.speakerEnabled;
        document.body.appendChild(audio);
        this.remoteAudioElements.set(targetUid, audio);
      }
    };

    return pc;
  }

  // --- Cari Pembalap / Daftar User di Database PostgreSQL ---
  async searchUsers(term = '') {
    try {
      const res = await fetch(`/api/users/search?term=${encodeURIComponent(term)}`);
      if (res.ok) {
        const json = await res.json();
        return json.results || [];
      }
    } catch (err) {
      console.warn('Search users failed:', err);
    }
    return [];
  }

  // Stubs friends & invites
  async sendFriendRequest() { return false; }
  async cancelFriendRequest() { return false; }
  async respondFriendRequest() { return false; }
  async removeFriend() { return false; }
  async sendLobbyInvite() { return false; }
  async dismissInvite() { return false; }
}
