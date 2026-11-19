const crypto = require('crypto');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

let pool = null;
let isConnected = false;

// Fallback in-memory store jika database PostgreSQL belum dinyalakan
const memoryStore = {
  users: new Map(), // email -> user
  usersByUid: new Map(), // uid -> user
  stats: new Map(), // uid -> stats
  profiles: new Map(), // uid -> profile
  matches: []
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, key] = stored.split(':');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(hash, 'hex'));
  } catch (_e) {
    return false;
  }
}

async function initDatabase() {
  if (!DATABASE_URL && !process.env.PGHOST) {
    console.log('[DB] No DATABASE_URL or PGHOST specified. Running with in-memory fallback store.');
    return;
  }

  try {
    pool = new Pool({
      connectionString: DATABASE_URL || undefined,
      host: process.env.PGHOST,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || 'typerace_db',
      connectionTimeoutMillis: 4000
    });

    const client = await pool.connect();
    isConnected = true;
    console.log('[DB] Connected to PostgreSQL successfully.');

    // Auto-migrate tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid VARCHAR(64) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        avatar_url TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_profiles (
        uid VARCHAR(64) PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
        display_name VARCHAR(100),
        status VARCHAR(255) DEFAULT 'Ready to race',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_stats (
        uid VARCHAR(64) PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
        races_played INT DEFAULT 0,
        races_won INT DEFAULT 0,
        avg_wpm NUMERIC(6,2) DEFAULT 0,
        best_wpm NUMERIC(6,2) DEFAULT 0,
        avg_accuracy NUMERIC(5,2) DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS match_history (
        id SERIAL PRIMARY KEY,
        room_code VARCHAR(16),
        uid VARCHAR(64) REFERENCES users(uid) ON DELETE CASCADE,
        display_name VARCHAR(100),
        wpm NUMERIC(6,2),
        accuracy NUMERIC(5,2),
        finish_position INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    client.release();
    console.log('[DB] Schema verified/migrated in PostgreSQL.');
  } catch (err) {
    console.warn('[DB] PostgreSQL connection failed:', err.message, '-> Using in-memory fallback.');
    isConnected = false;
  }
}

async function registerUser({ email, password, displayName }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(displayName || cleanEmail.split('@')[0] || 'Driver').trim().slice(0, 30);
  const uid = 'usr_' + crypto.randomBytes(12).toString('hex');
  const passwordHash = hashPassword(password);

  if (isConnected && pool) {
    const existing = await pool.query('SELECT uid FROM users WHERE email = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      throw new Error('Email already registered.');
    }

    await pool.query(
      'INSERT INTO users (uid, email, password_hash, display_name) VALUES ($1, $2, $3, $4)',
      [uid, cleanEmail, passwordHash, cleanName]
    );

    await pool.query(
      'INSERT INTO user_stats (uid, races_played, races_won, avg_wpm, best_wpm, avg_accuracy) VALUES ($1, 0, 0, 0, 0, 0)',
      [uid]
    );

    await pool.query(
      'INSERT INTO user_profiles (uid, display_name) VALUES ($1, $2)',
      [uid, cleanName]
    );

    return { uid, email: cleanEmail, displayName: cleanName };
  } else {
    if (memoryStore.users.has(cleanEmail)) {
      throw new Error('Email already registered.');
    }
    const user = { uid, email: cleanEmail, passwordHash, displayName: cleanName };
    memoryStore.users.set(cleanEmail, user);
    memoryStore.usersByUid.set(uid, user);
    memoryStore.stats.set(uid, { races_played: 0, races_won: 0, avg_wpm: 0, best_wpm: 0, avg_accuracy: 0 });
    memoryStore.profiles.set(uid, { displayName: cleanName, status: 'Ready to race' });
    return { uid, email: cleanEmail, displayName: cleanName };
  }
}

async function authenticateUser({ email, password }) {
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (isConnected && pool) {
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
    if (res.rows.length === 0) {
      throw new Error('User not found.');
    }
    const user = res.rows[0];
    if (!verifyPassword(password, user.password_hash)) {
      throw new Error('Invalid password.');
    }
    return { uid: user.uid, email: user.email, displayName: user.display_name };
  } else {
    const user = memoryStore.users.get(cleanEmail);
    if (!user) {
      throw new Error('User not found.');
    }
    if (!verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid password.');
    }
    return { uid: user.uid, email: user.email, displayName: user.displayName };
  }
}

async function getUserByUid(uid) {
  if (isConnected && pool) {
    const res = await pool.query('SELECT uid, email, display_name, avatar_url, created_at FROM users WHERE uid = $1', [uid]);
    return res.rows[0] || null;
  } else {
    const user = memoryStore.usersByUid.get(uid);
    if (!user) return null;
    return { uid: user.uid, email: user.email, display_name: user.displayName, avatar_url: '' };
  }
}

async function getUserStats(uid) {
  if (isConnected && pool) {
    const res = await pool.query('SELECT * FROM user_stats WHERE uid = $1', [uid]);
    return res.rows[0] || { races_played: 0, races_won: 0, avg_wpm: 0, best_wpm: 0, avg_accuracy: 0 };
  } else {
    return memoryStore.stats.get(uid) || { races_played: 0, races_won: 0, avg_wpm: 0, best_wpm: 0, avg_accuracy: 0 };
  }
}

async function recordMatchResult({ uid, roomCode, displayName, wpm, accuracy, finishPosition }) {
  const numWpm = parseFloat(wpm) || 0;
  const numAccuracy = parseFloat(accuracy) || 0;
  const pos = parseInt(finishPosition, 10) || 1;
  const isWon = pos === 1 ? 1 : 0;

  if (isConnected && pool) {
    await pool.query(
      `INSERT INTO match_history (room_code, uid, display_name, wpm, accuracy, finish_position)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [roomCode || 'SOLO', uid || null, displayName, numWpm, numAccuracy, pos]
    );

    if (uid) {
      await pool.query(
        `UPDATE user_stats
         SET races_played = races_played + 1,
             races_won = races_won + $1,
             best_wpm = GREATEST(best_wpm, $2),
             avg_wpm = ROUND(((avg_wpm * races_played) + $2) / (races_played + 1), 2),
             avg_accuracy = ROUND(((avg_accuracy * races_played) + $3) / (races_played + 1), 2),
             updated_at = CURRENT_TIMESTAMP
         WHERE uid = $4`,
        [isWon, numWpm, numAccuracy, uid]
      );
    }
  } else {
    memoryStore.matches.push({ roomCode, uid, displayName, wpm: numWpm, accuracy: numAccuracy, finishPosition: pos });
    if (uid && memoryStore.stats.has(uid)) {
      const s = memoryStore.stats.get(uid);
      const played = s.races_played + 1;
      s.races_won += isWon;
      s.best_wpm = Math.max(s.best_wpm, numWpm);
      s.avg_wpm = Math.round(((s.avg_wpm * s.races_played) + numWpm) / played);
      s.avg_accuracy = Math.round(((s.avg_accuracy * s.races_played) + numAccuracy) / played);
      s.races_played = played;
    }
  }
}

async function getLeaderboard(limit = 10) {
  if (isConnected && pool) {
    const res = await pool.query(
      `SELECT u.display_name, s.best_wpm, s.avg_wpm, s.races_played, s.races_won
       FROM user_stats s
       JOIN users u ON s.uid = u.uid
       ORDER BY s.best_wpm DESC
       LIMIT $1`,
      [limit]
    );
    return res.rows;
  } else {
    const list = [];
    for (const [uid, stat] of memoryStore.stats.entries()) {
      const u = memoryStore.usersByUid.get(uid);
      if (u) {
        list.push({
          display_name: u.displayName,
          best_wpm: stat.best_wpm,
          avg_wpm: stat.avg_wpm,
          races_played: stat.races_played,
          races_won: stat.races_won
        });
      }
    }
    return list.sort((a, b) => b.best_wpm - a.best_wpm).slice(0, limit);
  }
}

module.exports = {
  initDatabase,
  registerUser,
  authenticateUser,
  getUserByUid,
  getUserStats,
  recordMatchResult,
  getLeaderboard,
  isPostgresConnected: () => isConnected
};
