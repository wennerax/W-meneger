// Non-invasive module loader test
if (!process.env.TELEGRAM_TOKEN) process.env.TELEGRAM_TOKEN = '123:TEST';
try {
  require('./config');
  require('./db');
  require('./utils');
  require('./handlers');
  require('./commands');
  console.log('Modules loaded: config, db, utils, handlers, commands');
  process.exit(0);
} catch (err) {
  console.error('Module load failed:', err);
  process.exit(2);
}
