const { BANNED_WORDS, DELETE_LINKS, MESSAGES_PER_MINUTE_THRESHOLD, FLOOD_MUTE_SECONDS } = require('./config');
const { containsLink, containsBanned } = require('./utils');
const cmds = require('./commands');

module.exports = function registerHandlers(bot, db) {
  let BOT_ID = null;
  bot.getMe().then(me => { BOT_ID = me.id; }).catch(()=>{});

  // helper: check warning count and ban if limit reached
  async function checkWarnAndBan(chatId, userId, username) {
    try {
      if (typeof db.getWarningCount !== 'function' || typeof db.getWarnLimit !== 'function') return;
      const count = db.getWarningCount(chatId, userId);
      const limit = db.getWarnLimit(chatId);
      if (limit > 0 && count >= limit) {
        try {
          await bot.kickChatMember(chatId, userId);
          db.addWarning(chatId, userId, `Достигнут лимит предупреждений (${limit}) — бан`, username || null);
          const who = username ? `@${username}` : userId;
          bot.sendMessage(chatId, `${who} забанен — превышен лимит предупреждений (${limit}).`, { _messageType: 'ban' });
        } catch (e) {
          // ignore ban errors
        }
      }
    } catch (e) { }
  }

  // Enhance bot senders: decorate text/captions and optionally send an emoji/sticker by id.
  try {
    const { decorateMessage, detectMessageType } = require('./utils');
    const methods = ['sendMessage','sendPhoto','sendVideo','sendAudio','sendDocument','sendAnimation','sendVoice','sendVideoNote','sendMediaGroup','sendSticker'];
    const orig = {};
    methods.forEach(n => { if (bot[n]) orig[n] = bot[n].bind(bot); });

    methods.forEach((name) => {
      if (!orig[name]) return;
      // sendSticker should not attempt to prepend another sticker
      if (name === 'sendSticker') {
        bot.sendSticker = function(chatId, sticker, options) {
          return orig.sendSticker(chatId, sticker, options);
        };
        return;
      }

      bot[name] = function(...args) {
        const chatId = args[0];
        try {
          if (name === 'sendMessage') {
            const text = args[1] || '';
            const options = args[2] || {};
            const type = options._messageType ? options._messageType : detectMessageType(text || '');
            args[1] = decorateMessage(text, type);
            // send sticker/emoji by id if provided
            if (options._emojiId && orig.sendSticker) {
              return orig.sendSticker(chatId, options._emojiId).then(() => orig.sendMessage(...args)).catch(() => orig.sendMessage(...args));
            }
            return orig.sendMessage(...args);
          }

          if (name === 'sendMediaGroup') {
            const media = args[1] || [];
            const options = args[2] || {};
            // decorate captions inside media array
            const decorated = media.map(m => {
              if (m.caption) {
                const type = options._messageType ? options._messageType : detectMessageType(m.caption);
                m.caption = decorateMessage(m.caption, type);
              }
              return m;
            });
            args[1] = decorated;
            if (options._emojiId && orig.sendSticker) {
              return orig.sendSticker(chatId, options._emojiId).then(() => orig.sendMediaGroup(...args)).catch(() => orig.sendMediaGroup(...args));
            }
            return orig.sendMediaGroup(...args);
          }

          // all other media sending methods: signature (chatId, media, options)
          const options = args[2] || {};
          if (options && options.caption) {
            const type = options._messageType ? options._messageType : detectMessageType(options.caption);
            options.caption = decorateMessage(options.caption, type);
            args[2] = options;
          }
          if (options && options._emojiId && orig.sendSticker) {
            return orig.sendSticker(chatId, options._emojiId).then(() => orig[name](...args)).catch(() => orig[name](...args));
          }
          return orig[name](...args);
        } catch (e) {
          try { return orig[name](...args); } catch (e2) { return Promise.reject(e2); }
        }
      };
    });
  } catch (e) { /* ignore decoration errors */ }

  bot.onText(/\/start/, (msg) => cmds.start(bot, db, msg));

  // Protection is always enabled by default; protect_on/protect_off commands removed.

  bot.onText(/\/warn(?:\s+(\S+))?(?:\s+(.+))?/, (msg, match) => cmds.warn(bot, db, msg, match));
  bot.onText(/\/ban\s+(@\S+)\s+(.+)/, (msg, match) => cmds.ban(bot, db, msg, match));
  bot.onText(/\/mute\s+(@\S+)\s+(.+)/, (msg, match) => cmds.mute(bot, db, msg, match));
  bot.onText(/\/unmute(?:\s+(\S+))?/, (msg, match) => cmds.unmute(bot, db, msg, match));
  bot.onText(/\/list_warnings(?:\s+(\S+))?/, (msg, match) => cmds.listWarnings(bot, db, msg, match));
  bot.onText(/\/add_banned\s+(\S+)/, (msg, match) => cmds.addBanned(bot, db, msg, match));
  bot.onText(/\/remove_banned\s+(\S+)/, (msg, match) => cmds.removeBanned(bot, db, msg, match));
  bot.onText(/\/list_banned/, (msg) => cmds.listBanned(bot, db, msg));
  bot.onText(/\/aadmin\s+(@\S+)/, (msg, match) => cmds.aadmin(bot, db, msg, match));
  bot.onText(/\/radmin\s+(@\S+)/, (msg, match) => cmds.radmin(bot, db, msg, match));
  bot.onText(/\/admins/, (msg) => cmds.admins(bot, db, msg));
  bot.onText(/^!админы/i, (msg) => cmds.admins(bot, db, msg));
  bot.onText(/^!admins/i, (msg) => cmds.admins(bot, db, msg));

  // Alternative prefixes (+) and Russian aliases
  bot.onText(/^[\/\+]админ\s+(@\S+)/i, (msg, match) => cmds.aadmin(bot, db, msg, match));
  bot.onText(/^[\/\+]админ\s+(@\S+)/i, (msg, match) => cmds.aadmin(bot, db, msg, match));
  bot.onText(/^[\/\+]aadmin\s+(@\S+)/i, (msg, match) => cmds.aadmin(bot, db, msg, match));

  bot.onText(/^[\/\+]размод\s+(@\S+)/i, (msg, match) => cmds.radmin(bot, db, msg, match));
  bot.onText(/^[\/\+]radmin\s+(@\S+)/i, (msg, match) => cmds.radmin(bot, db, msg, match));

  bot.onText(/^[\/\+]бан\s+(@\S+)\s+(.+)/i, (msg, match) => cmds.ban(bot, db, msg, match));
  bot.onText(/^[\/\+]ban\s+(@\S+)\s+(.+)/i, (msg, match) => cmds.ban(bot, db, msg, match));

  bot.onText(/^[\/\+]мут\s+(@\S+)\s+(.+)/i, (msg, match) => cmds.mute(bot, db, msg, match));
  bot.onText(/^[\/\+]заглушить\s+(@\S+)\s+(.+)/i, (msg, match) => cmds.mute(bot, db, msg, match));
  bot.onText(/^[\/\+]mute\s+(@\S+)\s+(.+)/i, (msg, match) => cmds.mute(bot, db, msg, match));

  bot.onText(/^[\/\+]размут\s+(@\S+)/i, (msg, match) => cmds.unmute(bot, db, msg, match));
  bot.onText(/^[\/\+]разглушить\s+(@\S+)/i, (msg, match) => cmds.unmute(bot, db, msg, match));

  bot.onText(/^[\/\+]пред\s+(@\S+)(?:\s+(.+))?/i, (msg, match) => cmds.warn(bot, db, msg, match));
  bot.onText(/^[\/\+]предупр\s+(@\S+)(?:\s+(.+))?/i, (msg, match) => cmds.warn(bot, db, msg, match));

  bot.onText(/^[\/\+]помощь/i, (msg) => cmds.help(bot, db, msg));
  bot.onText(/^[\/\+]help/i, (msg) => cmds.help(bot, db, msg));

  bot.onText(/\/stats/, (msg) => cmds.stats ? cmds.stats(bot, db, msg) : bot.sendMessage(msg.chat.id, `Хранимые сообщения: (см. БД)`));
  bot.onText(/\/targettime(?:\s+(\S+))?/, (msg, match) => cmds.targetTime(bot, db, msg, match));
  bot.onText(/\/top(?:\s+(\d+))?/, (msg, match) => cmds.top ? cmds.top(bot, db, msg, match) : bot.sendMessage(msg.chat.id, 'Нет команды top.'));
  bot.onText(/^!топ(?:\s+(\d+))?/i, (msg, match) => cmds.top ? cmds.top(bot, db, msg, match) : bot.sendMessage(msg.chat.id, 'Нет команды top.'));

  // Handle service messages (bot joins, etc.) to try to keep promotions silent
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;

    // If this is a service message where the bot was added, try to delete it and promote the adder
    if (msg.new_chat_members && BOT_ID) {
      const addedBot = msg.new_chat_members.find(m => m.id === BOT_ID);
      if (addedBot) {
        // try delete the service message (requires delete permissions)
        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) { }

        // try to promote the user who added the bot (msg.from)
        if (msg.from) {
          try {
            await bot.promoteChatMember(chatId, msg.from.id, {
              can_change_info: true,
              can_delete_messages: true,
              can_restrict_members: true,
              can_pin_messages: true,
              can_invite_users: true,
              can_promote_members: false
            });
            // best-effort: nothing more we can do to fully suppress promotion notice
          } catch (e) { }
        }

        // Automatically add the group owner as a moderator (robust)
        try {
          const admins = await bot.getChatAdministrators(chatId);
          const ownerAdmin = admins && admins.find(a => a.status === 'creator');
          if (ownerAdmin && ownerAdmin.user) {
            db.setMainModerator(chatId, ownerAdmin.user.id, ownerAdmin.user.username || ownerAdmin.user.first_name || '', 1000);
          } else if (msg.from) {
            // fallback: set the user who added the bot as main moderator
            db.setMainModerator(chatId, msg.from.id, msg.from.username || msg.from.first_name || '', 500);
          }
        } catch (e) { }
      }
    }

    // ignore service messages that are not text and have no caption
    if (!msg.text && !msg.caption) return;

    // consider text and media captions for moderation checks
    const text = msg.text || msg.caption || '';

    // store message always and track conversation (skip private chats inside db method)
    try { db.addConversation(msg.chat); } catch (e) { }
    try { db.addMessage(chatId, msg.from.id, msg.from.username || '', msg.message_id, text); } catch (e) { /* ignore db errors */ }

    // flood detection: count messages in the last 60 seconds
    try {
      if (!msg.from || msg.from.is_bot) return;
      // skip admins/moderators
      let member = null;
      try { member = await bot.getChatMember(chatId, msg.from.id); } catch (e) { member = null; }
      if (member && (member.status === 'administrator' || member.status === 'creator')) return;
      if (typeof db.isModerator === 'function' && db.isModerator(chatId, msg.from.id)) return;

      const count = (typeof db.getRecentMessageCount === 'function') ? db.getRecentMessageCount(chatId, msg.from.id, 60) : 0;
      if (count > (MESSAGES_PER_MINUTE_THRESHOLD || 20)) {
        // delete recent messages from this user (best-effort) and mute for 1 day
        try {
          const secs = 86400; // 1 day
          // fetch recent message ids from DB (last 60s)
          const ids = (typeof db.getRecentMessageIds === 'function') ? db.getRecentMessageIds(chatId, msg.from.id, 60) : [];
          if (ids && ids.length) {
            for (const mid of ids) {
              try { await bot.deleteMessage(chatId, mid); } catch (e) { /* ignore individual delete errors */ }
            }
          }

          const until = Math.floor(Date.now() / 1000) + parseInt(secs, 10);
          await bot.restrictChatMember(chatId, msg.from.id, { can_send_messages: false, until_date: until });
          db.addWarning(chatId, msg.from.id, 'Флуд', msg.from.username || null);
          // check and ban if warn limit reached
          try { await checkWarnAndBan(chatId, msg.from.id, msg.from.username || null); } catch (e) { }
          const who = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
          await bot.sendMessage(chatId, `${who}, вы отправляете слишком много сообщений. Вы заглушены на 1 день.`, { _messageType: 'warn' });
        } catch (e) {
          // ignore
        }
        return;
      }
    } catch (e) { }

    if (!db.isProtectionOn(chatId)) return;

    // links: delete message and ban sender (record warning). skip admins/mods.
    if (DELETE_LINKS && containsLink(text)) {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
        db.addWarning(chatId, msg.from.id, 'Отправил ссылку', msg.from.username || null);
        try { await checkWarnAndBan(chatId, msg.from.id, msg.from.username || null); } catch (e) { }
        const who = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

        // avoid banning chat administrators or bot moderators
        let member = null;
        try { member = await bot.getChatMember(chatId, msg.from.id); } catch (e) { member = null; }
        if (member && (member.status === 'administrator' || member.status === 'creator')) {
          bot.sendMessage(chatId, `${who}, ссылки здесь запрещены.`);
          return;
        }
        if (typeof db.isModerator === 'function' && db.isModerator(chatId, msg.from.id)) {
          bot.sendMessage(chatId, `${who}, '5472267631979405211' ссылки здесь запрещены.`);
          return;
        }

        try {
          await bot.kickChatMember(chatId, msg.from.id);
          bot.sendMessage(chatId, `${who}, вы были забанены за отправку ссылки.`);
        } catch (e) {
          bot.sendMessage(chatId, `${who}, ссылки здесь запрещены.`);
        }
      } catch (e) { }
      return;
    }

    // banned words (from config + DB)
    const banned = BANNED_WORDS.concat(db.getBannedWords());
    if (containsBanned(text, banned)) {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
        db.addWarning(chatId, msg.from.id, 'Запрещённое слово', msg.from.username || null);
        try { await checkWarnAndBan(chatId, msg.from.id, msg.from.username || null); } catch (e) { }
        const who2 = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;
        // mute for 1 day (86400 seconds)
        try {
          const secs = 86400;
          const until = Math.floor(Date.now() / 1000) + secs;
          await bot.restrictChatMember(chatId, msg.from.id, { can_send_messages: false, until_date: until });
          bot.sendMessage(chatId, `${who2}, это слово здесь запрещено. Вы заглушены на 1 день.`);
        } catch (e) {
          bot.sendMessage(chatId, `${who2}, это слово здесь запрещено.`);
        }
      } catch (e) { }
    }
  });
};
