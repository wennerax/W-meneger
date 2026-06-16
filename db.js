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
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS banned_words (
        word TEXT PRIMARY KEY
      );
    `);
  }

  init();

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

    addWarning(chatId, userId, reason) {
      const stmt = db.prepare('INSERT INTO warnings (chat_id, user_id, reason) VALUES (?, ?, ?)');
      stmt.run(chatId, userId, reason || '');
    },

    getWarnings(chatId, userId) {
      return db.prepare('SELECT id, reason, created_at FROM warnings WHERE chat_id = ? AND user_id = ?').all(chatId, userId);
    },

    addBannedWord(word) {
      const stmt = db.prepare('INSERT OR IGNORE INTO banned_words (word) VALUES (?)');
      stmt.run(word.toLowerCase());
    },

    getBannedWords() {
      return db.prepare('SELECT word FROM banned_words').all().map(r => r.word);
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

    addWarning(chatId, userId, reason) {
      state.warnings.push({ id: state.warnings.length + 1, chat_id: chatId, user_id: userId, reason: reason || '', created_at: new Date().toISOString() });
      persist();
    },

    getWarnings(chatId, userId) {
      return state.warnings.filter(w => w.chat_id == chatId && w.user_id == userId).map(w => [w.id, w.reason, w.created_at]);
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
