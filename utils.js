const LINK_RE = /https?:\/\//i;

function containsLink(text) {
  if (!text) return false;
  return LINK_RE.test(text) || /t\.me\//i.test(text) || /telegram\.me\//i.test(text);
}

function containsBanned(text, bannedWords) {
  if (!text) return false;
  const t = text.toLowerCase();
  for (const w of bannedWords) {
    if (!w) continue;
    if (t.includes(w)) return true;
  }
  return false;
}

function detectMessageType(text) {
  if (!text) return 'neutral';
  const t = text.toLowerCase();
  if (/\b(забанен|забан|бан)\b/.test(t)) return 'ban';
  if (/\b(заглушен|заглушить|мут|разглушен|размут)\b/.test(t)) return 'warn';
  if (/\b(предупрежден|предупреждён|предупреждение|предупрежд)\b/.test(t)) return 'warn';
  if (/\b(не удалось|ошиб|ошибка|не получилось)\b/.test(t)) return 'error';
  if (/\b(успешно|назначен|добавлен|удалено|снята|снята роль|назначен модератор)\b/.test(t)) return 'success';
  if (/\b(помощь|help|команд)\b/.test(t)) return 'help';
  if (/\b(модератор|модераторы|admins|список)\b/.test(t)) return 'info';
  if (/\b(ссылк|link|ссылка)\b/.test(t)) return 'warn';
  return 'neutral';
}

function decorateMessage(text, type) {
  if (!text) return text;
  const theme = type || detectMessageType(text || '');
  const THEMES = {
    info: {pref: '📘✨', suf: '✨'},
    help: {pref: '📚🛡️', suf: '✨'},
    warn: {pref: '⚠️🔥', suf: '⚠️'},
    ban: {pref: '⛔️🔨', suf: '⛔️'},
    success: {pref: '✅💫', suf: '✨'},
    error: {pref: '❌🚫', suf: '❗️'},
    neutral: {pref: '✨🛡️', suf: '✨'}
  };
  const t = THEMES[theme] || THEMES.neutral;
  // Keep original text intact; avoid adding markup that breaks Markdown/HTML
  return `${t.pref} ${text} ${t.suf}`;
}

module.exports = { containsLink, containsBanned, decorateMessage, detectMessageType };
