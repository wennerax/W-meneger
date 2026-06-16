try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed — environment vars may be set externally
}

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const DB_PATH = process.env.BOT_DB || 'bot.sqlite';
const BANNED_WORDS = (process.env.BANNED_WORDS || 'spam,scam').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const DELETE_LINKS = (process.env.DELETE_LINKS || '1') !== '0';

if (!TOKEN) {
  throw new Error('TELEGRAM_TOKEN is not set in environment or .env');
}

module.exports = { TOKEN, DB_PATH, BANNED_WORDS, DELETE_LINKS };
