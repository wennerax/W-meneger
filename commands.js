const { BANNED_WORDS } = require('./config');

async function isAdmin(bot, chatId, userId) {
  try {
    const m = await bot.getChatMember(chatId, userId);
    return ['administrator', 'creator'].includes(m.status);
  } catch (e) {
    return false;
  }
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

  async protectOn(bot, db, msg) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут менять защиту.');
    db.setChatProtection(msg.chat.id, true);
    bot.sendMessage(msg.chat.id, 'Защита включена');
  },

  async protectOff(bot, db, msg) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут менять защиту.');
    db.setChatProtection(msg.chat.id, false);
    bot.sendMessage(msg.chat.id, 'Защита отключена');
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
    const identifier = match && match[1] ? match[1] : null;
    const target = await resolveTarget(bot, db, msg.chat.id, identifier, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Ответьте на сообщение или укажите ID или @username пользователя для бана.');
    try {
      await bot.kickChatMember(msg.chat.id, target.id);
      const who = target.username ? `@${target.username}` : target.id;
      bot.sendMessage(msg.chat.id, `Забанен ${who}`);
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Не удалось забанить: ${e.message}`);
    }
  },

  async mute(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Только админы могут заглушать пользователей.');
    const identifier = match && match[1] ? match[1] : null;
    const target = await resolveTarget(bot, db, msg.chat.id, identifier, msg);
    if (!target) return bot.sendMessage(msg.chat.id, 'Ответьте на сообщение или укажите ID или @username пользователя для заглушения.');
    try {
      await bot.restrictChatMember(msg.chat.id, target.id, { can_send_messages: false });
      const who = target.username ? `@${target.username}` : target.id;
      bot.sendMessage(msg.chat.id, `Заглушен ${who}`);
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
