# Telegram Chat Protector (JavaScript)

This project provides a Telegram bot written in JavaScript (Node.js) that protects group chats by deleting messages with links or banned words, stores conversations in a SQLite database, and tracks warnings.

Quick start

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file (see `.env.example`) and set `TELEGRAM_TOKEN`.

3. Run the bot:

```bash
npm start
```

Files

- `index.js` — bot entrypoint
- `config.js` — environment config
- `db.js` — SQLite database (better-sqlite3)
- `handlers.js` — commands and message protection
- `utils.js` — helper functions
- `package.json` — project manifest
# W-meneger