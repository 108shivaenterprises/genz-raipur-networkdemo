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

/** a 10-digit Indian mobile (with or without +91 / 0 / spaces / dashes) typed anywhere in a message */
export function containsPhone(text: string): boolean {
  const flat = String(text || '').replace(/[\s\-().]/g, '');
  return /(?:\+?91|0)?[6-9]\d{9}(?!\d)/.test(flat);
}
export const PHONE_IN_CHAT_MSG = {
  en: 'Please do not type phone numbers in this chat. The owner\'s number is shared only after a verified visit, and your broker\'s number is already on this page.',
  hi: 'कृपया इस चैट में फ़ोन नंबर न लिखें। मालिक का नंबर सिर्फ़ वेरिफ़ाइड विज़िट के बाद मिलता है, और आपके ब्रोकर का नंबर इसी पेज पर है।',
};

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
