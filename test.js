// Test loader: sets a dummy token if missing and imports modules to verify syntax/load-time errors
if (!process.env.TELEGRAM_TOKEN) process.env.TELEGRAM_TOKEN = '123:TEST';
try {
  const config = require('./config');
  const db = require('./db');
  const utils = require('./utils');
  const handlers = require('./handlers');
  console.log('Modules loaded: config, db, utils, handlers');
  if (db && typeof db.close === 'function') db.close();
  process.exit(0);
} catch (err) {
  console.error('Module load failed:', err);
  process.exit(2);
}
