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
        password_hash VARCHAR(255) DEFAULT '',
        display_name VARCHAR(100) DEFAULT 'Driver',
        avatar_url TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT '';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(100) DEFAULT 'Driver';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';

      CREATE TABLE IF NOT EXISTS user_profiles (
        uid VARCHAR(64) PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
        display_name VARCHAR(100),
        username VARCHAR(50),
        bio TEXT DEFAULT 'F1 Racing Driver',
        avatar_url TEXT DEFAULT '',
        status VARCHAR(255) DEFAULT 'Ready to race',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT 'F1 Racing Driver';
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username VARCHAR(50);
      ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';

      CREATE TABLE IF NOT EXISTS user_stats (
        uid VARCHAR(64) PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
        races_played INT DEFAULT 0,
        races_won INT DEFAULT 0,
        avg_wpm NUMERIC(6,2) DEFAULT 0,
        best_wpm NUMERIC(6,2) DEFAULT 0,
        avg_accuracy NUMERIC(5,2) DEFAULT 0,
        total_typed INT DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS total_typed INT DEFAULT 0;

      CREATE TABLE IF NOT EXISTS match_history (
        id SERIAL PRIMARY KEY,
        room_code VARCHAR(16),
        uid VARCHAR(64) REFERENCES users(uid) ON DELETE CASCADE,
        display_name VARCHAR(100),
        wpm NUMERIC(6,2),
        accuracy NUMERIC(5,2),
        finish_position INT,
        mode VARCHAR(32) DEFAULT 'multiplayer',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE match_history ADD COLUMN IF NOT EXISTS mode VARCHAR(32) DEFAULT 'multiplayer';
    `);

    client.release();
    console.log('[DB] Schema verified/migrated in PostgreSQL.');
  } catch (err) {
    console.warn('[DB] PostgreSQL connection failed:', err.message, '-> Using in-memory fallback.');
    isConnected = false;
  }
}

async function registerUser({ email, password, displayName, username }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(displayName || cleanEmail.split('@')[0] || 'Driver').trim().slice(0, 30);
  const cleanUsername = String(username || cleanEmail.split('@')[0]).trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  const uid = 'usr_' + crypto.randomBytes(12).toString('hex');
  const passwordHash = hashPassword(password);

  if (isConnected && pool) {
    const existing = await pool.query('SELECT uid FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (existing.rows.length > 0) {
      throw new Error('Email already registered.');
    }

    if (cleanUsername) {
      const existingUser = await pool.query('SELECT uid FROM user_profiles WHERE LOWER(username) = $1', [cleanUsername]);
      if (existingUser.rows.length > 0) {
        throw new Error('Username already taken.');
      }
    }

    await pool.query(
      'INSERT INTO users (uid, email, password_hash, display_name) VALUES ($1, $2, $3, $4)',
      [uid, cleanEmail, passwordHash, cleanName]
    );

    await pool.query(
      'INSERT INTO user_stats (uid, races_played, races_won, avg_wpm, best_wpm, avg_accuracy, total_typed) VALUES ($1, 0, 0, 0, 0, 0, 0)',
      [uid]
    );

    await pool.query(
      'INSERT INTO user_profiles (uid, display_name, username, bio) VALUES ($1, $2, $3, $4)',
      [uid, cleanName, cleanUsername || cleanEmail.split('@')[0], 'F1 Racing Driver']
    );

    return { uid, email: cleanEmail, displayName: cleanName, username: cleanUsername };
  } else {
    if (memoryStore.users.has(cleanEmail)) {
      throw new Error('Email already registered.');
    }
    const user = { uid, email: cleanEmail, passwordHash, displayName: cleanName };
    memoryStore.users.set(cleanEmail, user);
    memoryStore.usersByUid.set(uid, user);
    memoryStore.stats.set(uid, { races_played: 0, races_won: 0, avg_wpm: 0, best_wpm: 0, avg_accuracy: 0, total_typed: 0 });
    memoryStore.profiles.set(uid, { displayName: cleanName, username: cleanUsername, bio: 'F1 Racing Driver', avatar_url: '' });
    return { uid, email: cleanEmail, displayName: cleanName, username: cleanUsername };
  }
}

async function authenticateUser({ email, identifier, password }) {
  const cleanId = String(identifier || email || '').trim().toLowerCase();

  if (isConnected && pool) {
    const res = await pool.query(
      `SELECT u.* FROM users u
       LEFT JOIN user_profiles p ON u.uid = p.uid
       WHERE LOWER(u.email) = $1 OR LOWER(COALESCE(p.username, '')) = $1
       LIMIT 1`,
      [cleanId]
    );
    if (res.rows.length === 0) {
      throw new Error('User not found. Check email or username.');
    }
    const user = res.rows[0];
    if (!verifyPassword(password, user.password_hash)) {
      throw new Error('Invalid password.');
    }
    return { uid: user.uid, email: user.email, displayName: user.display_name };
  } else {
    let user = memoryStore.users.get(cleanId);
    if (!user) {
      for (const [uid, prof] of memoryStore.profiles.entries()) {
        if (prof.username && prof.username.toLowerCase() === cleanId) {
          user = memoryStore.usersByUid.get(uid);
          break;
        }
      }
    }
    if (!user) {
      throw new Error('User not found. Check email or username.');
    }
    if (!verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid password.');
    }
    return { uid: user.uid, email: user.email, displayName: user.displayName };
  }
}

async function clearAllUsers() {
  if (isConnected && pool) {
    await pool.query('TRUNCATE TABLE match_history, user_stats, user_profiles, users CASCADE;');
    console.log('[DB] PostgreSQL: All accounts, profiles, and match histories have been purged.');
  }
  memoryStore.users.clear();
  memoryStore.usersByUid.clear();
  memoryStore.stats.clear();
  memoryStore.profiles.clear();
  memoryStore.matches = [];
  return { ok: true, message: 'All accounts wiped successfully.' };
}

async function getFullUserData(uid) {
  if (isConnected && pool) {
    const userRes = await pool.query('SELECT uid, email, display_name, avatar_url, created_at FROM users WHERE uid = $1', [uid]);
    const user = userRes.rows[0] || null;
    if (!user) return null;

    const profileRes = await pool.query('SELECT display_name, username, bio, avatar_url, status FROM user_profiles WHERE uid = $1', [uid]);
    const profile = profileRes.rows[0] || { display_name: user.display_name, bio: 'F1 Racing Driver', avatar_url: '' };

    const statsRes = await pool.query('SELECT * FROM user_stats WHERE uid = $1', [uid]);
    const stats = statsRes.rows[0] || { races_played: 0, races_won: 0, avg_wpm: 0, best_wpm: 0, avg_accuracy: 0, total_typed: 0 };

    const historyRes = await pool.query(
      'SELECT room_code, wpm, accuracy, finish_position, mode, created_at FROM match_history WHERE uid = $1 ORDER BY created_at DESC LIMIT 20',
      [uid]
    );

    return {
      user: { uid: user.uid, email: user.email, displayName: user.display_name },
      profile: {
        displayName: profile.display_name || user.display_name,
        username: profile.username || user.email.split('@')[0],
        bio: profile.bio || 'F1 Racing Driver',
        photoURL: profile.avatar_url || ''
      },
      stats: {
        matches: stats.races_played || 0,
        wins: stats.races_won || 0,
        podiums: stats.races_won || 0,
        winRate: stats.races_played ? Math.round((stats.races_won / stats.races_played) * 100) : 0,
        avgWpm: parseFloat(stats.avg_wpm) || 0,
        bestWpm: parseFloat(stats.best_wpm) || 0,
        avgAccuracy: parseFloat(stats.avg_accuracy) || 0,
        bestAccuracy: parseFloat(stats.best_wpm ? 98 : 0),
        totalTyped: stats.total_typed || 0,
        completed: stats.races_played || 0,
        p1: stats.races_won || 0,
        p2: 0,
        p3: 0
      },
      history: historyRes.rows.map((r) => ({
        mode: r.mode || 'multiplayer',
        wpm: parseFloat(r.wpm) || 0,
        accuracy: parseFloat(r.accuracy) || 0,
        placement: r.finish_position || 1,
        completed: true,
        roomCode: r.room_code,
        createdAt: r.created_at
      }))
    };
  } else {
    const user = memoryStore.usersByUid.get(uid);
    if (!user) return null;
    const prof = memoryStore.profiles.get(uid) || { displayName: user.displayName, bio: 'F1 Racing Driver' };
    const stat = memoryStore.stats.get(uid) || { races_played: 0, races_won: 0, avg_wpm: 0, best_wpm: 0, avg_accuracy: 0, total_typed: 0 };
    return {
      user: { uid: user.uid, email: user.email, displayName: user.displayName },
      profile: { displayName: prof.displayName || user.displayName, bio: prof.bio || 'F1 Racing Driver', photoURL: '' },
      stats: {
        matches: stat.races_played || 0,
        wins: stat.races_won || 0,
        podiums: stat.races_won || 0,
        winRate: stat.races_played ? Math.round((stat.races_won / stat.races_played) * 100) : 0,
        avgWpm: stat.avg_wpm || 0,
        bestWpm: stat.best_wpm || 0,
        avgAccuracy: stat.avg_accuracy || 0,
        bestAccuracy: 98,
        totalTyped: stat.total_typed || 0,
        completed: stat.races_played || 0,
        p1: stat.races_won || 0,
        p2: 0,
        p3: 0
      },
      history: []
    };
  }
}

async function updateUserProfile(uid, { displayName, username, bio, photoURL }) {
  const cleanName = String(displayName || '').trim().slice(0, 30);
  const cleanBio = String(bio || '').trim().slice(0, 200);
  const cleanUser = String(username || '').trim().slice(0, 30);
  const cleanAvatar = String(photoURL || '').trim();

  if (isConnected && pool) {
    if (cleanName) {
      await pool.query('UPDATE users SET display_name = $1 WHERE uid = $2', [cleanName, uid]);
    }
    await pool.query(
      `INSERT INTO user_profiles (uid, display_name, username, bio, avatar_url, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (uid) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           username = EXCLUDED.username,
           bio = EXCLUDED.bio,
           avatar_url = EXCLUDED.avatar_url,
           updated_at = CURRENT_TIMESTAMP`,
      [uid, cleanName, cleanUser, cleanBio, cleanAvatar]
    );
    return getFullUserData(uid);
  } else {
    const user = memoryStore.usersByUid.get(uid);
    if (user && cleanName) user.displayName = cleanName;
    memoryStore.profiles.set(uid, { displayName: cleanName, username: cleanUser, bio: cleanBio, avatar_url: cleanAvatar });
    return getFullUserData(uid);
  }
}

async function recordMatchResult({ uid, roomCode, displayName, wpm, accuracy, finishPosition, charsTyped }) {
  const numWpm = parseFloat(wpm) || 0;
  const numAccuracy = parseFloat(accuracy) || 0;
  const pos = parseInt(finishPosition, 10) || 1;
  const isWon = pos === 1 ? 1 : 0;
  const typed = parseInt(charsTyped, 10) || Math.round(numWpm * 5);

  if (isConnected && pool) {
    await pool.query(
      `INSERT INTO match_history (room_code, uid, display_name, wpm, accuracy, finish_position, mode)
       VALUES ($1, $2, $3, $4, $5, $6, 'multiplayer')`,
      [roomCode || 'SOLO', uid || null, displayName, numWpm, numAccuracy, pos]
    );

    if (uid) {
      await pool.query(
        `UPDATE user_stats
         SET races_played = COALESCE(races_played, 0) + 1,
             races_won = COALESCE(races_won, 0) + $1,
             best_wpm = GREATEST(COALESCE(best_wpm, 0), $2),
             avg_wpm = ROUND(((COALESCE(avg_wpm, 0) * COALESCE(races_played, 0)) + $2) / (COALESCE(races_played, 0) + 1), 2),
             avg_accuracy = ROUND(((COALESCE(avg_accuracy, 0) * COALESCE(races_played, 0)) + $3) / (COALESCE(races_played, 0) + 1), 2),
             total_typed = COALESCE(total_typed, 0) + $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE uid = $5`,
        [isWon, numWpm, numAccuracy, typed, uid]
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
      s.total_typed = (s.total_typed || 0) + typed;
      s.races_played = played;
    }
  }
}

async function getUserStats(uid) {
  if (isConnected && pool) {
    const res = await pool.query('SELECT * FROM user_stats WHERE uid = $1', [uid]);
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      races_played: parseInt(r.races_played, 10) || 0,
      races_won: parseInt(r.races_won, 10) || 0,
      avg_wpm: parseFloat(r.avg_wpm) || 0,
      best_wpm: parseFloat(r.best_wpm) || 0,
      avg_accuracy: parseFloat(r.avg_accuracy) || 0,
      total_typed: parseInt(r.total_typed, 10) || 0
    };
  } else {
    return memoryStore.stats.get(uid) || null;
  }
}

async function searchUsers(term = '', limit = 10) {
  const cleanTerm = `%${String(term || '').trim().toLowerCase()}%`;
  if (isConnected && pool) {
    const res = await pool.query(
      `SELECT u.uid, u.display_name, u.email, p.username, p.bio, p.avatar_url, s.best_wpm, s.races_won
       FROM users u
       LEFT JOIN user_profiles p ON u.uid = p.uid
       LEFT JOIN user_stats s ON u.uid = s.uid
       WHERE LOWER(u.display_name) LIKE $1 OR LOWER(u.email) LIKE $1 OR LOWER(COALESCE(p.username, '')) LIKE $1
       LIMIT $2`,
      [cleanTerm, limit]
    );
    return res.rows.map((r) => ({
      uid: r.uid,
      displayName: r.display_name,
      username: r.username || '',
      email: r.email,
      bio: r.bio || 'F1 Racing Driver',
      photoURL: r.avatar_url || '',
      bestWpm: parseFloat(r.best_wpm) || 0,
      racesWon: r.races_won || 0
    }));
  } else {
    const list = [];
    for (const [email, u] of memoryStore.users.entries()) {
      const prof = memoryStore.profiles.get(u.uid) || {};
      if (email.includes(term.toLowerCase()) || u.displayName.toLowerCase().includes(term.toLowerCase()) || (prof.username && prof.username.toLowerCase().includes(term.toLowerCase()))) {
        list.push({ uid: u.uid, displayName: u.displayName, username: prof.username || '', email, bio: 'F1 Racing Driver', photoURL: '', bestWpm: 0, racesWon: 0 });
      }
    }
    return list.slice(0, limit);
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
  clearAllUsers,
  getFullUserData,
  getUserStats,
  updateUserProfile,
  recordMatchResult,
  searchUsers,
  getLeaderboard,
  isPostgresConnected: () => isConnected
};
