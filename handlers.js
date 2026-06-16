const { BANNED_WORDS, DELETE_LINKS } = require('./config');
const { containsLink, containsBanned } = require('./utils');
const cmds = require('./commands');

module.exports = function registerHandlers(bot, db) {
  let BOT_ID = null;
  bot.getMe().then(me => { BOT_ID = me.id; }).catch(()=>{});

  bot.onText(/\/start/, (msg) => cmds.start(bot, db, msg));

  bot.onText(/\/protect_on/, (msg) => cmds.protectOn(bot, db, msg));
  bot.onText(/\/protect_off/, (msg) => cmds.protectOff(bot, db, msg));

  bot.onText(/\/warn(?:\s+(\d+))?(?:\s+(.+))?/, (msg, match) => cmds.warn(bot, db, msg, match));
  bot.onText(/\/ban(?:\s+(\d+))?/, (msg, match) => cmds.ban(bot, db, msg, match));
  bot.onText(/\/mute(?:\s+(\d+))?/, (msg, match) => cmds.mute(bot, db, msg, match));
  bot.onText(/\/unmute(?:\s+(\d+))?/, (msg, match) => cmds.unmute(bot, db, msg, match));
  bot.onText(/\/list_warnings(?:\s+(\d+))?/, (msg, match) => cmds.listWarnings(bot, db, msg, match));
  bot.onText(/\/add_banned\s+(\S+)/, (msg, match) => cmds.addBanned(bot, db, msg, match));
  bot.onText(/\/remove_banned\s+(\S+)/, (msg, match) => cmds.removeBanned(bot, db, msg, match));
  bot.onText(/\/list_banned/, (msg) => cmds.listBanned(bot, db, msg));

  bot.onText(/\/stats/, (msg) => cmds.stats ? cmds.stats(bot, db, msg) : bot.sendMessage(msg.chat.id, `Stored messages: (see DB)`));

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
      }
    }

    // ignore service messages that are not text (we already handled bot join above)
    if (!msg.text) return;

    const text = msg.text || '';

    // store message always
    db.addMessage(chatId, msg.from.id, msg.from.username || '', text);

    if (!db.isProtectionOn(chatId)) return;

    // links
    if (DELETE_LINKS && containsLink(text)) {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
        db.addWarning(chatId, msg.from.id, 'Sent link');
        bot.sendMessage(chatId, `${msg.from.first_name}, links are not allowed here.`);
      } catch (e) { }
      return;
    }

    // banned words (from config + DB)
    const banned = BANNED_WORDS.concat(db.getBannedWords());
    if (containsBanned(text, banned)) {
      try {
        await bot.deleteMessage(chatId, msg.message_id);
        db.addWarning(chatId, msg.from.id, 'Banned word');
        bot.sendMessage(chatId, `${msg.from.first_name}, that word is not allowed.`);
      } catch (e) { }
    }
  });
};
