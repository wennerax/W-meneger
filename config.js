try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed — environment vars may be set externally
}

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const DB_PATH = process.env.BOT_DB || 'bot.sqlite';
const BANNED_WORDS = (process.env.BANNED_WORDS || 'spam,scam').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const DELETE_LINKS = (process.env.DELETE_LINKS || '1') !== '0';
const MESSAGES_PER_MINUTE_THRESHOLD = parseInt(process.env.MESSAGES_PER_MINUTE_THRESHOLD || '20', 10);
const FLOOD_MUTE_SECONDS = parseInt(process.env.FLOOD_MUTE_SECONDS || String(86400), 10);
const BOT_OWNER_ID = process.env.BOT_OWNER_ID ? parseInt(process.env.BOT_OWNER_ID, 10) : null;

if (!TOKEN) {
  throw new Error('TELEGRAM_TOKEN is not set in environment or .env');
}

module.exports = { TOKEN, DB_PATH, BANNED_WORDS, DELETE_LINKS, MESSAGES_PER_MINUTE_THRESHOLD, FLOOD_MUTE_SECONDS, BOT_OWNER_ID };
