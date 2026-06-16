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

module.exports = { containsLink, containsBanned };
