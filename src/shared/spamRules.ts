/** Pure spam rules (no I/O) shared by the server and the tests. */
export const NEW_ACCOUNT_DAYS = 7;
export const isNewAccount = (u: { createdAt: string }, now = Date.now(), demo = false) => !demo && now - new Date(u.createdAt).getTime() < NEW_ACCOUNT_DAYS * 86_400_000;

const PHONE = /(?<!\d)(?:\+?91[\s-]?)?[6-9](?:[\s.-]?\d){9}(?!\d)/;
const LINK = /(?:https?:\/\/|www\.|wa\.me\/|t\.me\/|bit\.ly\/|\b[a-z0-9-]+\.(?:com|in|co|me|link|xyz|app)\b)/i;

/** Returns a human-readable reason when the message must be blocked, else null. */
export function filterMessage(u: { createdAt: string }, text: string, now = Date.now(), demo = false): string | null {
  const links = (text.match(new RegExp(LINK.source, 'gi')) || []).length;
  if (links > 2) return 'Too many links in one message.';
  if (isNewAccount(u, now, demo) && (links > 0 || PHONE.test(text))) return 'New accounts (first 7 days) cannot share links or phone numbers in chat. Use the deal room tools; this unlocks automatically.';
  return null;
}
