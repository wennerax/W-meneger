const { BANNED_WORDS } = require('./config');

async function isAdmin(bot, chatId, userId) {
  try {
    const m = await bot.getChatMember(chatId, userId);
    return ['administrator', 'creator'].includes(m.status);
  } catch (e) {
    return false;
  }
}

function parseDurationString(raw, defaultUnit = 'm') {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?)(?:\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|day|days?|ч|чч|д|дн))?$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = m[2] ? m[2].toLowerCase() : defaultUnit;
  if (/^s/.test(unit)) return Math.max(0, Math.round(num));
  if (/^m/.test(unit) || unit === 'ч' || unit === 'д' ) { /* handled below */ }
  if (/^m/.test(unit)) return Math.max(0, Math.round(num * 60));
  if (/^h/.test(unit) || unit === 'ч') return Math.max(0, Math.round(num * 3600));
  if (/^d/.test(unit) || unit === 'д' || unit === 'дн') return Math.max(0, Math.round(num * 86400));
  return Math.max(0, Math.round(num * 60));
}

function formatSeconds(s) {
  if (!s || s <= 0) return 'навсегда';
  if (s % 86400 === 0) return `${s/86400}дн`;
  if (s % 3600 === 0) return `${s/3600}ч`;
  if (s % 60 === 0) return `${s/60}м`;
  return `${s}с`;
}

async function resolveTarget(bot, db, chatId, identifier, reply) {
  // reply: message object to get reply_to_message
  if (!identifier && reply && reply.reply_to_message) {
    // not used
  }

  // If identifier is empty and there's a reply, return the replied user
  if ((!identifier || identifier === '') && reply && reply.reply_to_message) {
    const u = reply.reply_to_message.from;
    return { id: u.id, username: u.username || null };
  }

  if (!identifier) return null;

  // numeric id
  if (/^\d+$/.test(identifier)) {
    return { id: parseInt(identifier, 10), username: null };
  }

  // username like @name or name
  const uname = identifier.startsWith('@') ? identifier.slice(1) : identifier;

  // try DB first
  try {
    const found = db.getUserIdByUsername ? db.getUserIdByUsername(uname, chatId) : null;
    if (found && found.id) return { id: found.id, username: found.username || uname };
  } catch (e) { }

  // try chat administrators search
  try {
    const admins = await bot.getChatAdministrators(chatId);
    const m = admins.find(a => (a.user.username || '').toLowerCase() === uname.toLowerCase());
    if (m) return { id: m.user.id, username: m.user.username || uname };
  } catch (e) { }

  return null;
}

module.exports = {
  async start(bot, db, msg) {
    await bot.sendMessage(msg.chat.id, 'Привет — я защищаю этот чат. Используйте /protect_on или /protect_off для управления защитой.');
  },

  async help(bot, db, msg) {
    const text = [
      'Команды модерации:',
      '/help — показать это сообщение',
      '/warn @username [reason] — выдать предупреждение (или ответить на сообщение)',
      '/ban @username <причина> <время> — забанить пользователя (время: 10m, 2h, 1d)',
      '/mute @username <причина> <время> — заглушить пользователя (время: 10m, 2h, 1d)',
      '/unmute @username — снять заглушение',
      '/list_warnings @username — показать предупреждения пользователя',
      '/add_banned <word> — добавить запрещённое слово',
      '/remove_banned <word> — удалить запрещённое слово',
      '/list_banned — показать список запрещённых слов',
      '/targettime <value><unit> — задать время мута при использовании запрещённого слова (по умолчанию значение в минутах). Примеры: /targettime 10m, /targettime 2h, /targettime 1d',
      '/aadmin @username — назначить модератора бота (только админы чата)',
      '/radmin @username — снять у пользователя роль модератора',
      '/stats — показать простую статистику (в хранилище)'
    ].join('\n');
    bot.sendMessage(msg.chat.id, text);
  },

  async aadmin(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут назначать модераторов.');
    const identifier = match && match[1] ? match[1] : null;
    if (!identifier) return bot.sendMessage(msg.chat.id, 'Использование: /aadmin @username');
    const uname = identifier.startsWith('@') ? identifier.slice(1) : identifier;
    const target = await resolveTarget(bot, db, msg.chat.id, uname, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Пользователь не найден в чате по указанному @username.');
    db.addModerator(msg.chat.id, target.id, target.username || uname);
    bot.sendMessage(msg.chat.id, `Пользователь @${target.username || uname} назначен модератором.`);
  },

  async radmin(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут снимать роль модератора.');
    const identifier = match && match[1] ? match[1] : null;
    if (!identifier) return bot.sendMessage(msg.chat.id, 'Использование: /radmin @username');
    const uname = identifier.startsWith('@') ? identifier.slice(1) : identifier;
    const target = await resolveTarget(bot, db, msg.chat.id, uname, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Пользователь не найден в чате по указанному @username.');
    db.removeModerator(msg.chat.id, target.id);
    bot.sendMessage(msg.chat.id, `У пользователя @${target.username || uname} снята роль модератора.`);
  },

  async warn(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут выносить предупреждения.');
    const identifier = match && match[1] ? match[1] : null;
    const reason = match && match[2] ? match[2] : 'Без причины';
    const target = await resolveTarget(bot, db, msg.chat.id, identifier, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Ответьте на сообщение или укажите ID или @username пользователя для предупреждения.');
    db.addWarning(msg.chat.id, target.id, reason, target.username || null);
    const who = target.username ? `@${target.username}` : target.id;
    bot.sendMessage(msg.chat.id, `Пользователь ${who} предупреждён: ${reason}`);
  },

  async ban(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут банить пользователей.');
    const identifier = match && match[1] ? match[1] : null; // @username
    const rest = match && match[2] ? match[2].trim() : '';
    if (!identifier) return bot.sendMessage(msg.chat.id, 'Использование: /ban @username <причина> <время> — пример: /ban @ivan Спам 1d');
    const uname = identifier.startsWith('@') ? identifier.slice(1) : identifier;
    const target = await resolveTarget(bot, db, msg.chat.id, uname, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Пользователь не найден в чате по указанному @username.');
    // rest must contain reason and duration (duration is last token)
    const parts = rest.split(/\s+/);
    if (parts.length < 2) return bot.sendMessage(msg.chat.id, 'Укажите причину и время. Пример: /ban @ivan Спам 1d');
    const rawDur = parts.pop();
    const reason = parts.join(' ');
    try {
      let secs = null;
      secs = parseDurationString(rawDur);
      if (secs === null) return bot.sendMessage(msg.chat.id, 'Неверный формат времени для бана. Примеры: 10m, 2h, 1d');
      if (secs && secs > 0) {
        const until = Math.floor(Date.now() / 1000) + parseInt(secs, 10);
        await bot.kickChatMember(msg.chat.id, target.id, { until_date: until });
      } else {
        // permanent
        await bot.kickChatMember(msg.chat.id, target.id);
      }
      const who = target.username ? `@${target.username}` : target.id;
      bot.sendMessage(msg.chat.id, `Забанен ${who} на ${formatSeconds(secs)}. Причина: ${reason}`);
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Не удалось забанить: ${e.message}`);
    }
  },

  async mute(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут заглушать пользователей.');
    const identifier = match && match[1] ? match[1] : null; // @username
    const rest = match && match[2] ? match[2].trim() : '';
    if (!identifier) return bot.sendMessage(msg.chat.id, 'Использование: /mute @username <причина> <время> — пример: /mute @ivan Оскорбления 10m');
    const uname = identifier.startsWith('@') ? identifier.slice(1) : identifier;
    const target = await resolveTarget(bot, db, msg.chat.id, uname, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Пользователь не найден в чате по указанному @username.');
    const parts = rest.split(/\s+/);
    if (parts.length < 2) return bot.sendMessage(msg.chat.id, 'Укажите причину и время. Пример: /mute @ivan Оскорбления 10m');
    const rawDur = parts.pop();
    const reason = parts.join(' ');
    try {
      let secs = null;
      secs = parseDurationString(rawDur);
      if (secs === null) return bot.sendMessage(msg.chat.id, 'Неверный формат времени для заглушения. Примеры: 10m, 2h, 1d');
      if (secs && secs > 0) {
        const until = Math.floor(Date.now() / 1000) + parseInt(secs, 10);
        await bot.restrictChatMember(msg.chat.id, target.id, { can_send_messages: false, until_date: until });
      } else {
        // permanent mute
        await bot.restrictChatMember(msg.chat.id, target.id, { can_send_messages: false });
      }
      const who = target.username ? `@${target.username}` : target.id;
      bot.sendMessage(msg.chat.id, `Заглушен ${who} на ${formatSeconds(secs)}. Причина: ${reason}`);
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Не удалось заглушить: ${e.message}`);
    }
  },

  async unmute(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут снять заглушение с пользователей.');
    const identifier = match && match[1] ? match[1] : null;
    const target = await resolveTarget(bot, db, msg.chat.id, identifier, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Ответьте на сообщение или укажите ID или @username пользователя для снятия заглушения.');
    try {
      await bot.restrictChatMember(msg.chat.id, target.id, { can_send_messages: true });
      const who = target.username ? `@${target.username}` : target.id;
      bot.sendMessage(msg.chat.id, `Разглушен ${who}`);
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Не удалось снять заглушение: ${e.message}`);
    }
  },

  async listWarnings(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут просматривать предупреждения.');
    const identifier = match && match[1] ? match[1] : null;
    const target = await resolveTarget(bot, db, msg.chat.id, identifier, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Ответьте на сообщение или укажите ID или @username пользователя, чтобы показать предупреждения.');
    const ws = db.getWarnings(msg.chat.id, target.id) || [];
    const who = target.username ? `@${target.username}` : target.id;
    if (!ws.length) return bot.sendMessage(msg.chat.id, `Нет предупреждений для ${who}`);
    const text = ws.map(w => `- ${w[1]} (${w[2]})`).join('\n');
    bot.sendMessage(msg.chat.id, `Предупреждения для ${who}:\n${text}`);
  },

  async addBanned(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут добавлять запрещённые слова.');
    const word = match && match[1] ? match[1].trim().toLowerCase() : null;
    if (!word) return bot.sendMessage(msg.chat.id, 'Использование: /add_banned <слово>');
    db.addBannedWord(word);
    bot.sendMessage(msg.chat.id, `Добавлено запрещённое слово: ${word}`);
  },

  async targetTime(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут менять время мута.');
    const raw = match && match[1] ? (match[1].trim().toLowerCase()) : null;
    // helper to format seconds
    const fmt = (s) => {
      if (s % 86400 === 0) return `${s/86400}дн`;
      if (s % 3600 === 0) return `${s/3600}ч`;
      if (s % 60 === 0) return `${s/60}м`;
      return `${s}с`;
    };
    if (!raw) {
      const cur = (typeof db.getSpamTime === 'function') ? db.getSpamTime(msg.chat.id) : 60;
      return bot.sendMessage(msg.chat.id, `Текущее время мута: ${cur} секунд (${fmt(cur)})`);
    }

    const m = raw.match(/^(\d+(?:\.\d+)?)(?:\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|day|days?))?$/i);
    if (!m) return bot.sendMessage(msg.chat.id, 'Неверный формат. Примеры: /targettime 10m, /targettime 2h, /targettime 1d');
    const num = parseFloat(m[1]);
    const unit = m[2] ? m[2].toLowerCase() : 'm';
    const mul = (u) => {
      if (/^s/.test(u)) return 1;
      if (/^m/.test(u)) return 60;
      if (/^h/.test(u)) return 3600;
      if (/^d/.test(u)) return 86400;
      return 60;
    };
    const secs = Math.max(0, Math.round(num * mul(unit)));
    if (typeof db.setSpamTime === 'function') db.setSpamTime(msg.chat.id, secs);
    bot.sendMessage(msg.chat.id, `Время заглушения при нарушении установлено: ${secs} секунд (${fmt(secs)})`);
  },

  async removeBanned(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут удалять запрещённые слова.');
    const word = match && match[1] ? match[1].trim().toLowerCase() : null;
    if (!word) return bot.sendMessage(msg.chat.id, 'Использование: /remove_banned <слово>');
    if (typeof db.removeBannedWord === 'function') db.removeBannedWord(word);
    bot.sendMessage(msg.chat.id, `Удалено запрещённое слово: ${word}`);
  },

  async listBanned(bot, db, msg) {
    const list = (BANNED_WORDS || []).concat(db.getBannedWords());
    if (!list.length) return bot.sendMessage(msg.chat.id, 'Запрещённые слова не заданы.');
    bot.sendMessage(msg.chat.id, `Запрещённые слова: ${list.join(', ')}`);
  }
};
