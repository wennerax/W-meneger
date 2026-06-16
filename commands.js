const { BANNED_WORDS } = require('./config');

async function isAdmin(bot, chatId, userId) {
  try {
    const m = await bot.getChatMember(chatId, userId);
    return ['administrator', 'creator'].includes(m.status);
  } catch (e) {
    return false;
  }
}

module.exports = {
  async start(bot, db, msg) {
    await bot.sendMessage(msg.chat.id, 'Hello — I protect this chat. Use /protect_on or /protect_off to toggle.');
  },

  async protectOn(bot, db, msg) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can change protection.');
    db.setChatProtection(msg.chat.id, true);
    bot.sendMessage(msg.chat.id, 'Protection enabled');
  },

  async protectOff(bot, db, msg) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can change protection.');
    db.setChatProtection(msg.chat.id, false);
    bot.sendMessage(msg.chat.id, 'Protection disabled');
  },

  async warn(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can warn users.');
    const userId = match && match[1] ? parseInt(match[1], 10) : (msg.reply_to_message ? msg.reply_to_message.from.id : null);
    const reason = match && match[2] ? match[2] : 'No reason';
    if (!userId) return bot.sendMessage(msg.chat.id, 'Reply to a message or pass user id to warn.');
    db.addWarning(msg.chat.id, userId, reason);
    bot.sendMessage(msg.chat.id, `User ${userId} warned: ${reason}`);
  },

  async ban(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can ban users.');
    const userId = match && match[1] ? parseInt(match[1], 10) : (msg.reply_to_message ? msg.reply_to_message.from.id : null);
    if (!userId) return bot.sendMessage(msg.chat.id, 'Reply to a message or pass user id to ban.');
    try {
      await bot.kickChatMember(msg.chat.id, userId);
      bot.sendMessage(msg.chat.id, `Banned ${userId}`);
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Failed to ban: ${e.message}`);
    }
  },

  async mute(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can mute users.');
    const userId = match && match[1] ? parseInt(match[1], 10) : (msg.reply_to_message ? msg.reply_to_message.from.id : null);
    if (!userId) return bot.sendMessage(msg.chat.id, 'Reply to a message or pass user id to mute.');
    try {
      await bot.restrictChatMember(msg.chat.id, userId, { can_send_messages: false });
      bot.sendMessage(msg.chat.id, `Muted ${userId}`);
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Failed to mute: ${e.message}`);
    }
  },

  async unmute(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can unmute users.');
    const userId = match && match[1] ? parseInt(match[1], 10) : (msg.reply_to_message ? msg.reply_to_message.from.id : null);
    if (!userId) return bot.sendMessage(msg.chat.id, 'Reply to a message or pass user id to unmute.');
    try {
      await bot.restrictChatMember(msg.chat.id, userId, { can_send_messages: true });
      bot.sendMessage(msg.chat.id, `Unmuted ${userId}`);
    } catch (e) {
      bot.sendMessage(msg.chat.id, `Failed to unmute: ${e.message}`);
    }
  },

  async listWarnings(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can view warnings.');
    const userId = match && match[1] ? parseInt(match[1], 10) : (msg.reply_to_message ? msg.reply_to_message.from.id : null);
    if (!userId) return bot.sendMessage(msg.chat.id, 'Reply to a message or pass user id to list warnings.');
    const ws = db.getWarnings(msg.chat.id, userId) || [];
    if (!ws.length) return bot.sendMessage(msg.chat.id, `No warnings for ${userId}`);
    const text = ws.map(w => `- ${w[1]} (${w[2]})`).join('\n');
    bot.sendMessage(msg.chat.id, `Warnings for ${userId}:\n${text}`);
  },

  async addBanned(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can add banned words.');
    const word = match && match[1] ? match[1].trim().toLowerCase() : null;
    if (!word) return bot.sendMessage(msg.chat.id, 'Usage: /add_banned <word>');
    db.addBannedWord(word);
    bot.sendMessage(msg.chat.id, `Added banned word: ${word}`);
  },

  async removeBanned(bot, db, msg, match) {
    const admin = await isAdmin(bot, msg.chat.id, msg.from.id);
    if (!admin) return bot.sendMessage(msg.chat.id, 'Only admins can remove banned words.');
    const word = match && match[1] ? match[1].trim().toLowerCase() : null;
    if (!word) return bot.sendMessage(msg.chat.id, 'Usage: /remove_banned <word>');
    if (typeof db.removeBannedWord === 'function') db.removeBannedWord(word);
    bot.sendMessage(msg.chat.id, `Removed banned word: ${word}`);
  },

  async listBanned(bot, db, msg) {
    const list = (BANNED_WORDS || []).concat(db.getBannedWords());
    if (!list.length) return bot.sendMessage(msg.chat.id, 'No banned words defined.');
    bot.sendMessage(msg.chat.id, `Banned words: ${list.join(', ')}`);
  }
};
