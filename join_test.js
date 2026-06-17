// Simulate bot joining a group and verify handlers set main moderator to owner
// ensure config loads without a real token
if (!process.env.TELEGRAM_TOKEN) process.env.TELEGRAM_TOKEN = '123:TEST';
const registerHandlers = require('./handlers');

// fake bot implementation
function makeFakeBot() {
  const events = {};
  const bot = {
    _events: events,
    getMe() { return Promise.resolve({ id: 999 }); },
    on(event, fn) { events[event] = fn; },
    onText() { /* ignore text handlers in test */ },
    deleteMessage() { return Promise.resolve(); },
    promoteChatMember() { return Promise.resolve(); },
    getChatAdministrators(chatId) {
      // return an owner admin
      return Promise.resolve([ { status: 'creator', user: { id: 12345, username: 'owner_user', first_name: 'Owner' } } ]);
    },
    sendMessage() { return Promise.resolve(); },
    getChatMember() { return Promise.resolve({ status: 'member' }); },
    restrictChatMember() { return Promise.resolve(); },
    kickChatMember() { return Promise.resolve(); }
  };
  return bot;
}

async function run() {
  const fakeBot = makeFakeBot();
  let setMainCalled = false;
  const fakeDb = {
    setMainModerator(chatId, userId, username, priority) {
      setMainCalled = { chatId, userId, username, priority };
    },
    // minimal stubs used by handlers
    addConversation() {},
    addMessage() {},
    getBannedWords() { return []; },
    isProtectionOn() { return true; },
    addWarning() {},
    getRecentMessageCount() { return 0; },
    getRecentMessageIds() { return []; },
    getWarnLimit() { return 3; },
    getWarningCount() { return 0; },
    isModerator() { return false; }
  };

  registerHandlers(fakeBot, fakeDb);

  // wait a tick for getMe() promise to resolve inside handlers
  await new Promise(r => setTimeout(r, 50));

  // simulate service message where bot was added
  const msg = {
    chat: { id: -10001, type: 'group' },
    new_chat_members: [{ id: 999, username: 'test_bot' }],
    from: { id: 54321, username: 'adder', first_name: 'Adder' },
    message_id: 101
  };

  // call the registered message handler
  if (fakeBot._events && typeof fakeBot._events.message === 'function') {
    await fakeBot._events.message(msg);
  } else {
    console.error('No message handler registered');
    process.exit(2);
  }

  // wait a moment for handlers to run
  await new Promise(r => setTimeout(r, 50));

  if (setMainCalled && setMainCalled.userId === 12345) {
    console.log('OK: setMainModerator called for owner id', setMainCalled.userId);
    process.exit(0);
  } else {
    console.error('FAIL: setMainModerator not called as expected', setMainCalled);
    process.exit(3);
  }
}

run().catch(err => { console.error('Test error:', err); process.exit(4); });
