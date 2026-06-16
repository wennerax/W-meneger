const TelegramBot = require('node-telegram-bot-api');
const { TOKEN } = require('./config');
const db = require('./db');
const registerHandlers = require('./handlers');

const bot = new TelegramBot(TOKEN, { polling: true });

registerHandlers(bot, db);

console.log('Bot started');

process.on('SIGINT', () => {
  console.log('Stopping...');
  bot.stopPolling();
  db.close();
  process.exit();
});
