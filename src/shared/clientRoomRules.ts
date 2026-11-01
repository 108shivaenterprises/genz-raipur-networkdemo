/** v31 — Client Room: a broker's private room with his own client. Rules shared by the server, the broker screen and the tests. */
export const ROOM_KINDS = [
  { id: 'BUYER', en: 'Buyer', hi: 'खरीदार' },
  { id: 'RENTER', en: 'Renter', hi: 'किराए पर लेने वाला' },
  { id: 'TENANT', en: 'Tenant', hi: 'किराएदार' },
  { id: 'OTHER', en: 'Other client', hi: 'अन्य क्लाइंट' },
  { id: 'OWNER', en: 'Property owner', hi: 'प्रॉपर्टी मालिक' },
] as const;
export type RoomKind = (typeof ROOM_KINDS)[number]['id'];

/** v46: a client who opens his room at least once in `sessionDays` never types a code again (sliding), on at most `devices` phones;
 *  the link itself also slides with use, up to `maxLifeDays` from when the room was made (then the broker makes a new link). */
export const ROOM_LIMITS = { activeRooms: 100, items: 30, messages: 500, textChars: 1000, linkDays: 60, otpMinutes: 10, otpTries: 5, sessionDays: 60, purgeClosedDays: 90, devices: 2, maxLifeDays: 365 } as const;

/** any Unicode decimal digit (Devanagari, Arabic-Indic, full-width, mathematical bold…) → its ASCII digit */
function asciiDigits(t: string): string {
  return t.replace(/\p{Nd}/gu, ch => {
    let cp = ch.codePointAt(0)!; let start = cp;
    while (/\p{Nd}/u.test(String.fromCodePoint(start - 1))) start -= 1; // digit runs come in aligned blocks of ten
    return String((cp - start) % 10);
  });
}
const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9',
  shunya: '0', oh: '0', ek: '1', do: '2', teen: '3', char: '4', chaar: '4', paanch: '5', panch: '5', chhe: '6', chhah: '6', saat: '7', aath: '8', nau: '9',
  'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4', 'पांच': '5', 'पाँच': '5', 'छह': '6', 'छः': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
};
/** "ninety eight" → 98, "twenty six" → 26, "sixty" → 60 (English tens words) */
const TENS: Record<string, string> = { twenty: '2', thirty: '3', forty: '4', fourty: '4', fifty: '5', sixty: '6', seventy: '7', eighty: '8', ninety: '9' };
const UNITS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
/** the digits in a text after every disguise is undone (any script, styled / full-width digits, invisible characters, o/l for 0/1, number words incl. "ninety eight") */
function plainDigits(text: string): string {
  let t = asciiDigits(String(text || '').normalize('NFKC')).replace(/[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
  t = t.replace(/\b(twenty|thirty|fou?rty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b)?/gi, (_m, ten: string, unit?: string) => `${TENS[ten.toLowerCase()]}${unit ? UNITS[unit.toLowerCase()] : '0'}`);
  t = t.replace(/[\p{L}\p{M}]+/gu, w => NUMBER_WORDS[w.toLowerCase()] ?? w);
  t = t.replace(/\b(double|dabal|dubal|triple|tripple|teepal)[\s-]+(\d)/gi, (_m, w: string, d: string) => d.repeat(/^(?:double|dabal|dubal)$/i.test(w) ? 2 : 3));   // "double nine" = 99, "triple seven" = 777
  for (let i = 0; i < 3; i++) t = t.replace(/(\d)[oO](?=\d)/g, '$10').replace(/(\d)[lI|](?=\d)/g, '$11');
  return t;
}
/**
 * a 10-digit Indian mobile (with or without +91 / 0) typed anywhere in a message.
 * Audit F5 — the text is normalised first: full-width / styled / any-script digits, invisible characters, any short run of
 * symbols between digits, o/O and l/I written for 0/1, number words, and one filler word between two digit groups of 3+.
 * v100 — (1) a phone followed by another number ("9826012345 5 baje") no longer hides it: the digit GROUPS are tried one after the other,
 * (2) "ninety eight twenty six …" and Hinglish "do" are read as digits.
 */
export function containsPhone(text: string): boolean {
  const t = plainDigits(text);
  const joined = t
    .replace(/(\d{3,})[^\p{L}\p{N}]*[\p{L}]{1,8}[^\p{L}\p{N}]*(?=\d{3,})/gu, '$1')   // "98265 then 11223"
    .replace(/(\d)[^\p{L}\p{N}]{1,4}(?=\d)/gu, '$1');                                   // "98265+11223", "9 8 2 6 5"
  if (/(?<!\d)(?:\+?91|0)?[6-9]\d{9}(?!\d)/.test(joined)) return true;
  // groups of digits written one after the other (≤ 4 symbols between): any run of neighbours that adds up to exactly a mobile number
  const groups = t.match(/\d+(?:[^\p{L}\p{N}]{1,4}\d+)*/gu) || [];
  for (const g of groups) {
    const parts = g.match(/\d+/g) || [];
    for (let i = 0; i < parts.length; i++) {
      let acc = '';
      for (let j = i; j < parts.length && acc.length <= 12; j++) {
        acc += parts[j];
        if ((acc.length === 10 && /^[6-9]/.test(acc)) || (acc.length === 11 && /^0[6-9]/.test(acc)) || (acc.length === 12 && /^91[6-9]/.test(acc))) return true;
      }
    }
  }
  return false;
}

/** words that follow an app name but are NOT a handle ("telegram pe", "insta page") */
const NOT_HANDLE = new Set('is pe par me mein hai ka ki ke ko se the my on id chat call group message page profile link number no dm search follow add and aur ya or check dekho see visit bhi bhej bhejo karo kar hi to a an at in of for with from your tumhara mera meri apna apni account handle username'.split(' '));
const SOCIAL_APPS = /\b(?:insta(?:gram)?|ig|telegram|tg|snap(?:chat)?|skype|twitter|linkedin|fb|facebook)\b[\s:\-–=]*(?:id|handle|username|user\s?name|account|page|profile)?[\s:\-–=]*@?([a-z][a-z0-9_.]{2,})/gi;
const SOCIAL_IS = /\b(?:my|mera|meri|mere|our|hamara)\s+(?:insta(?:gram)?|telegram|tg|snap(?:chat)?|skype|fb|facebook|twitter)\s*(?:id|handle|username|account)?\s*(?:is|hai|:)\s*@?([a-z][a-z0-9_.]{2,})/gi;
/** other ways to reach a person outside the app: e-mail (also "x at gmail dot com"), UPI id, @handles, chat / social / shortener links, "insta: raj_007" */
export function containsContactId(text: string): boolean {
  const t = String(text || '').normalize('NFKC').replace(/[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
  if (/[a-z0-9._%+-]{2,}@[a-z0-9-]{2,}/i.test(t) || /[a-z0-9._%+-]{2,}\s?(?:\(at\)|\[at\]|\bat the rate\b)\s?[a-z0-9-]{2,}/i.test(t)) return true;   // raj.kumar@gmail.com · rajbroker@oksbi · raj(at)gmail
  if (/\b[a-z0-9._-]{2,}\s+at\s+[a-z0-9-]{2,}\s+(?:dot|\.)\s+[a-z]{2,}/i.test(t)) return true;                                           // raj kumar at gmail dot com
  if (/(?<![\w@.])@[a-z][a-z0-9_.]{3,}/i.test(t)) return true;                                                                            // @rajbroker
  if (/(?:https?:\/\/|www\.|\b(?:wa\.me|t\.me|telegram\.(?:me|dog)|instagram\.com|ig\.me|facebook\.com|fb\.(?:me|com)|linkedin\.com|linktr\.ee|(?:chat|api)\.whatsapp\.com|bit\.ly|tinyurl\.com|goo\.gl|rb\.gy|cutt\.ly|snapchat\.com|signal\.me|discord\.gg|x\.com|twitter\.com)\b)/i.test(t)) return true;
  for (const m of t.matchAll(SOCIAL_IS)) { const w = (m[1] || '').toLowerCase().replace(/[._]+$/, ''); if (w.length >= 3 && !NOT_HANDLE.has(w)) return true; }
  for (const m of t.matchAll(SOCIAL_APPS)) { const w = (m[1] || '').toLowerCase().replace(/[._]+$/, ''); if (w.length >= 3 && !NOT_HANDLE.has(w)) return true; }
  return false;
}
/** a phone number OR any other contact id — what may never be typed into a chat or a listing text that another person reads */
export const containsContact = (text: string): boolean => containsPhone(text) || containsContactId(text);
/** v100 — shown instead of PHONE_IN_CHAT_MSG when the message holds an e-mail / UPI / social id / chat link (no phone) */
export const CONTACT_IN_CHAT_MSG = {
  en: 'Please do not share e-mail, UPI, Instagram / Telegram IDs or chat links here. GENZ connects you itself — use the chat, a visit or a call from the app.',
  hi: 'कृपया यहाँ ई-मेल, UPI, Instagram / Telegram आईडी या चैट लिंक न लिखें। GENZ खुद आपको जोड़ता है — ऐप के चैट, विज़िट या कॉल का इस्तेमाल करें।',
};
/**
 * v100 — a number split over two or three messages ("98260" … "12345") is the same number: the digits that END the sender's last few messages (≤ 15 min old)
 * are put in front of the digits that START the new one. `prev` = that sender's recent texts, oldest first.
 */
export function phoneAcross(prev: string[], text: string): boolean {
  const head = /^[^\p{L}\p{N}]{0,4}(?:\d[^\p{L}\p{N}]{0,4}){2,}/u.exec(String(text || '').normalize('NFKC'))?.[0];
  if (!head) return false;
  let acc = head;
  for (let i = prev.length - 1; i >= 0 && i >= prev.length - 3; i--) {
    const m = /(?:\d[^\p{L}\p{N}]{0,4}){2,}$/u.exec(String(prev[i] || '').normalize('NFKC')); if (!m) break;
    acc = `${m[0]} ${acc}`;
    if (containsPhone(acc)) return true;
    if (String(prev[i]).normalize('NFKC').slice(0, -m[0].length).trim()) break;   // that message had other words too: earlier ones are not a continuation
  }
  return false;
}
/** what a blocked text holds: a phone number (also split over messages) or another contact id; null when it is fine */
export function contactKind(text: string, prev: string[] = []): 'PHONE' | 'ID' | null {
  if (containsPhone(text) || phoneAcross(prev, text)) return 'PHONE';
  return containsContactId(text) ? 'ID' : null;
}
/** the sender's own messages of the last 15 minutes (oldest first) — what `contactKind` needs to see a number split over messages */
export const recentOwn = <T>(msgs: T[], at: (m: T) => string, text: (m: T) => string, now = Date.now()) => msgs.filter(m => now - Date.parse(at(m)) < 15 * 60_000).slice(-3).map(text);
export const PHONE_IN_CHAT_MSG = {
  en: 'Please do not type phone numbers in this chat. The owner\'s number is shared only after a verified visit, and your broker\'s number is already on this page.',
  hi: 'कृपया इस चैट में फ़ोन नंबर न लिखें। मालिक का नंबर सिर्फ़ वेरिफ़ाइड विज़िट के बाद मिलता है, और आपके ब्रोकर का नंबर इसी पेज पर है।',
};
export const contactMsg = (k: 'PHONE' | 'ID') => (k === 'PHONE' ? PHONE_IN_CHAT_MSG : CONTACT_IN_CHAT_MSG);

/** v69 — what a client may send from his page. KYC kinds need the vault key (the file is AES-sealed) and a tick; Aadhaar only masked. */
export const DOC_KINDS = [
  { id: 'KYC_PAN', kyc: true, en: 'PAN card', hi: 'पैन कार्ड' },
  { id: 'KYC_AADHAAR_MASKED', kyc: true, en: 'Aadhaar (masked — first 8 digits covered)', hi: 'आधार (मास्क्ड — पहले 8 अंक ढके हुए)' },
  { id: 'KYC_AADHAAR_FULL', kyc: true, en: 'Full Aadhaar (only for a paper the broker is making)', hi: 'पूरा आधार (सिर्फ़ ब्रोकर जो काग़ज़ बना रहा है उसके लिए)' },
  { id: 'KYC_OTHER_ID', kyc: true, en: 'Other photo ID', hi: 'अन्य फ़ोटो पहचान पत्र' },
  { id: 'PAPER', kyc: false, en: 'Paper / document', hi: 'काग़ज़ / दस्तावेज़' },
  { id: 'PHOTO', kyc: false, en: 'Photo', hi: 'फ़ोटो' },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]['id'];
export const isDocKind = (k: unknown): k is DocKind => DOC_KINDS.some(d => d.id === k);
export const isKycKind = (k: unknown) => DOC_KINDS.some(d => d.id === k && d.kyc);
/** a file is at most 2.5 MB (a phone photo is made smaller on the phone first); a room holds at most 12 files */
/** v70 — the full-Aadhaar kind is off unless the server switch is on AND the broker asked this client; such a file is erased after this many days */
export const FULL_AADHAAR_DAYS = 7;
export const DOC_LIMITS = { maxBytes: 2_500_000, perRoom: 12 } as const;
