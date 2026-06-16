const { DB_PATH } = require('./config');
const fs = require('fs');
const path = require('path');

let useSqlite = false;
let sqlite;
try {
  sqlite = require('better-sqlite3');
  useSqlite = true;
} catch (err) {
  useSqlite = false;
}

if (useSqlite) {
  const Database = sqlite;
  const db = new Database(DB_PATH);

  function init() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY,
        protection INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        user_id INTEGER,
        username TEXT,
        text TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        user_id INTEGER,
        username TEXT,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS banned_words (
        word TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS chat_settings (
        chat_id INTEGER PRIMARY KEY,
        spam_time INTEGER DEFAULT 60,
        mute_time INTEGER DEFAULT 3600,
        ban_time INTEGER DEFAULT 86400
      );

      CREATE TABLE IF NOT EXISTS moderators (
        chat_id INTEGER,
        user_id INTEGER,
        username TEXT,
        is_owner INTEGER DEFAULT 0,
        priority INTEGER DEFAULT 0,
        PRIMARY KEY (chat_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS conversations (
        chat_id INTEGER PRIMARY KEY,
        title TEXT,
        type TEXT,
        username TEXT,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  init();

  // ensure new columns exist for older databases
  try {
    db.exec("ALTER TABLE moderators ADD COLUMN is_owner INTEGER DEFAULT 0;");
  } catch (e) { }
  try {
    db.exec("ALTER TABLE moderators ADD COLUMN priority INTEGER DEFAULT 0;");
  } catch (e) { }

  module.exports = {
    setChatProtection(chatId, on) {
      const stmt = db.prepare('INSERT OR REPLACE INTO chats (id, protection) VALUES (?, ?)');
      stmt.run(chatId, on ? 1 : 0);
    },

    isProtectionOn(chatId) {
      const row = db.prepare('SELECT protection FROM chats WHERE id = ?').get(chatId);
      if (!row) return true;
      return !!row.protection;
    },

    addMessage(chatId, userId, username, text) {
      const stmt = db.prepare('INSERT INTO messages (chat_id, user_id, username, text) VALUES (?, ?, ?, ?)');
      stmt.run(chatId, userId, username || '', text || '');
    },

    addConversation(chat) {
      try {
        if (!chat || chat.type === 'private') return;
        const stmt = db.prepare('INSERT OR REPLACE INTO conversations (chat_id, title, type, username, last_seen) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)');
        stmt.run(chat.id, chat.title || '', chat.type || '', chat.username || null);
      } catch (e) { }
    },

    addWarning(chatId, userId, reason, username) {
      const stmt = db.prepare('INSERT INTO warnings (chat_id, user_id, username, reason) VALUES (?, ?, ?, ?)');
      stmt.run(chatId, userId, username || null, reason || '');
    },

    getWarnings(chatId, userId) {
      return db.prepare('SELECT id, username, reason, created_at FROM warnings WHERE chat_id = ? AND user_id = ?').all(chatId, userId);
    },

    addBannedWord(word) {
      const stmt = db.prepare('INSERT OR IGNORE INTO banned_words (word) VALUES (?)');
      stmt.run(word.toLowerCase());
    },

    getBannedWords() {
      return db.prepare('SELECT word FROM banned_words').all().map(r => r.word);
    },

    setSpamTime(chatId, seconds) {
      const stmt = db.prepare('INSERT OR REPLACE INTO chat_settings (chat_id, spam_time) VALUES (?, ?)');
      stmt.run(chatId, seconds);
    },

    getSpamTime(chatId) {
      const row = db.prepare('SELECT spam_time FROM chat_settings WHERE chat_id = ?').get(chatId);
      if (!row) return 60;
      return row.spam_time || 60;
    },
    setMuteTime(chatId, seconds) {
      const stmt = db.prepare('INSERT OR REPLACE INTO chat_settings (chat_id, mute_time) VALUES (?, ?)');
      stmt.run(chatId, seconds);
    },

    getMuteTime(chatId) {
      const row = db.prepare('SELECT mute_time FROM chat_settings WHERE chat_id = ?').get(chatId);
      if (!row) return 3600;
      return row.mute_time || 3600;
    },

    setBanTime(chatId, seconds) {
      const stmt = db.prepare('INSERT OR REPLACE INTO chat_settings (chat_id, ban_time) VALUES (?, ?)');
      stmt.run(chatId, seconds);
    },

    getBanTime(chatId) {
      const row = db.prepare('SELECT ban_time FROM chat_settings WHERE chat_id = ?').get(chatId);
      if (!row) return 86400;
      return row.ban_time || 86400;
    },

    getUserIdByUsername(username, chatId) {
      const row = db.prepare('SELECT user_id, username FROM messages WHERE username = ? AND chat_id = ? ORDER BY created_at DESC LIMIT 1').get(username, chatId);
      if (!row) return null;
      return { id: row.user_id, username: row.username };
    },

    getTopUsers(chatId, limit = 10) {
      const stmt = db.prepare('SELECT user_id, username, COUNT(*) as cnt FROM messages WHERE chat_id = ? GROUP BY user_id, username ORDER BY cnt DESC LIMIT ?');
      return stmt.all(chatId, limit);
    },

    getRecentMessageCount(chatId, userId, seconds) {
      const row = db.prepare('SELECT COUNT(*) as c FROM messages WHERE chat_id = ? AND user_id = ? AND created_at >= datetime(\'now\', ? )').get(chatId, userId, `-${seconds} seconds`);
      return row ? row.c : 0;
    },

    addModerator(chatId, userId, username, isOwner = 0, priority = 0) {
      const stmt = db.prepare('INSERT OR REPLACE INTO moderators (chat_id, user_id, username, is_owner, priority) VALUES (?, ?, ?, ?, ?)');
      stmt.run(chatId, userId, username || null, isOwner ? 1 : 0, priority || 0);
    },

    setMainModerator(chatId, userId, username, priority = 1000) {
      try {
        db.prepare('UPDATE moderators SET is_owner = 0 WHERE chat_id = ?').run(chatId);
      } catch (e) { }
      const stmt = db.prepare('INSERT OR REPLACE INTO moderators (chat_id, user_id, username, is_owner, priority) VALUES (?, ?, ?, ?, ?)');
      stmt.run(chatId, userId, username || null, 1, priority);
    },

    removeModerator(chatId, userId) {
      const stmt = db.prepare('DELETE FROM moderators WHERE chat_id = ? AND user_id = ?');
      stmt.run(chatId, userId);
    },

    isModerator(chatId, userId) {
      const row = db.prepare('SELECT 1 FROM moderators WHERE chat_id = ? AND user_id = ?').get(chatId, userId);
      return !!row;
    },

    listModerators(chatId) {
      return db.prepare('SELECT user_id, username, is_owner, priority FROM moderators WHERE chat_id = ? ORDER BY priority DESC').all(chatId);
    },

    removeBannedWord(word) {
      const stmt = db.prepare('DELETE FROM banned_words WHERE word = ?');
      stmt.run(word.toLowerCase());
    },

    close() {
      db.close();
    }
  };

} else {
  // fallback: simple JSON file storage
  const file = path.resolve(DB_PATH + '.json');
  let state = { chats: {}, messages: [], warnings: [], banned_words: [] };
  try {
    if (fs.existsSync(file)) {
      state = JSON.parse(fs.readFileSync(file, 'utf8')) || state;
    } else {
      fs.writeFileSync(file, JSON.stringify(state, null, 2));
    }
  } catch (e) {
    // ignore and start fresh
    state = { chats: {}, messages: [], warnings: [], banned_words: [] };
  }

  function persist() {
    try { fs.writeFileSync(file, JSON.stringify(state, null, 2)); } catch (e) { }
  }

  module.exports = {
    setChatProtection(chatId, on) {
      state.chats[chatId] = { protection: on ? 1 : 0 };
      persist();
    },

    isProtectionOn(chatId) {
      const row = state.chats[chatId];
      if (!row) return true;
      return !!row.protection;
    },

    addMessage(chatId, userId, username, text) {
      state.messages.push({ id: state.messages.length + 1, chat_id: chatId, user_id: userId, username: username || '', text: text || '', created_at: new Date().toISOString() });
      persist();
    },

    addConversation(chat) {
      try {
        if (!chat || chat.type === 'private') return;
        if (!state.conversations) state.conversations = {};
        state.conversations[chat.id] = { chat_id: chat.id, title: chat.title || '', type: chat.type || '', username: chat.username || null, last_seen: new Date().toISOString() };
        persist();
      } catch (e) { }
    },

    addWarning(chatId, userId, reason, username) {
      state.warnings.push({ id: state.warnings.length + 1, chat_id: chatId, user_id: userId, username: username || null, reason: reason || '', created_at: new Date().toISOString() });
      persist();
    },

    getWarnings(chatId, userId) {
      return state.warnings.filter(w => w.chat_id == chatId && w.user_id == userId).map(w => ({ id: w.id, username: w.username, reason: w.reason, created_at: w.created_at }));
    },

    addBannedWord(word) {
      const w = word.toLowerCase();
      if (!state.banned_words.includes(w)) {
        state.banned_words.push(w);
        persist();
      }
    },

    getBannedWords() {
      return state.banned_words.slice();
    },

    setSpamTime(chatId, seconds) {
      if (!state.chats[chatId]) state.chats[chatId] = { protection: 1 };
      state.chats[chatId].spam_time = seconds;
      persist();
    },

    getSpamTime(chatId) {
      const row = state.chats[chatId];
      if (!row) return 60;
      return row.spam_time || 60;
    },
    setMuteTime(chatId, seconds) {
      if (!state.chats[chatId]) state.chats[chatId] = { protection: 1 };
      state.chats[chatId].mute_time = seconds;
      persist();
    },

    getMuteTime(chatId) {
      const row = state.chats[chatId];
      if (!row) return 3600;
      return row.mute_time || 3600;
    },

    setBanTime(chatId, seconds) {
      if (!state.chats[chatId]) state.chats[chatId] = { protection: 1 };
      state.chats[chatId].ban_time = seconds;
      persist();
    },

    getBanTime(chatId) {
      const row = state.chats[chatId];
      if (!row) return 86400;
      return row.ban_time || 86400;
    },

    getUserIdByUsername(username, chatId) {
      const msgs = state.messages.filter(m => m.username && m.username.toLowerCase() === username.toLowerCase() && m.chat_id == chatId);
      if (!msgs.length) return null;
      const last = msgs[msgs.length - 1];
      return { id: last.user_id, username: last.username };
    },

    getTopUsers(chatId, limit = 10) {
      const counts = {};
      state.messages.forEach(m => {
        if (m.chat_id == chatId) {
          const key = m.user_id;
          counts[key] = counts[key] || { user_id: m.user_id, username: m.username || null, cnt: 0 };
          counts[key].cnt += 1;
        }
      });
      const arr = Object.values(counts).sort((a,b) => b.cnt - a.cnt).slice(0, limit);
      return arr;
    },

    getRecentMessageCount(chatId, userId, seconds) {
      const cutoff = Date.now() - (seconds * 1000);
      return state.messages.filter(m => m.chat_id == chatId && m.user_id == userId && new Date(m.created_at).getTime() >= cutoff).length;
    },

    addModerator(chatId, userId, username) {
      if (!state.moderators) state.moderators = {};
      if (!state.moderators[chatId]) state.moderators[chatId] = [];
      const exists = state.moderators[chatId].find(m => m.user_id == userId);
      if (!exists) {
        state.moderators[chatId].push({ user_id: userId, username: username || null, is_owner: 0, priority: 0 });
        persist();
      }
    },

    setMainModerator(chatId, userId, username, priority = 1000) {
      if (!state.moderators) state.moderators = {};
      if (!state.moderators[chatId]) state.moderators[chatId] = [];
      // clear previous owner flags
      state.moderators[chatId].forEach(m => { m.is_owner = 0; });
      const exists = state.moderators[chatId].find(m => m.user_id == userId);
      if (exists) {
        exists.is_owner = 1;
        exists.priority = priority;
        exists.username = username || exists.username;
      } else {
        state.moderators[chatId].push({ user_id: userId, username: username || null, is_owner: 1, priority });
      }
      persist();
    },

    removeModerator(chatId, userId) {
      if (!state.moderators || !state.moderators[chatId]) return;
      const idx = state.moderators[chatId].findIndex(m => m.user_id == userId);
      if (idx !== -1) {
        state.moderators[chatId].splice(idx, 1);
        persist();
      }
    },

    isModerator(chatId, userId) {
      if (!state.moderators || !state.moderators[chatId]) return false;
      return !!state.moderators[chatId].find(m => m.user_id == userId);
    },

    listModerators(chatId) {
      if (!state.moderators || !state.moderators[chatId]) return [];
      return state.moderators[chatId].slice().sort((a,b) => (b.priority || 0) - (a.priority || 0));
    },

    removeBannedWord(word) {
      const w = word.toLowerCase();
      const idx = state.banned_words.indexOf(w);
      if (idx !== -1) {
        state.banned_words.splice(idx, 1);
        persist();
      }
    },

    close() { /* nothing */ }
  };
}
