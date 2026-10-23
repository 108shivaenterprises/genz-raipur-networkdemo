/**
 * v57 — the broker's public page (/c/<code>): limits and words shared by the server (what may be shown / stored) and the broker's
 * screen (what he can pick). Pure, no imports.
 */
export const PAGE_LIMITS = {
  /** homes on one page (his own live listings + other brokers' listings opened to pages) */
  homes: 24,
  areas: 6,
  areaChars: 40,
  headline: 120,
  message: 300,
  /** photos of one home on the page (the first on the card, the rest under "more photos") */
  photos: 6,
  /** an enquiry is erased this many days after it came in (or earlier, when the broker deletes it) */
  keepDays: 180,
  /** the same mobile may send this many enquiries to one page in a day */
  perPhoneDay: 3,
  /** one page takes this many enquiries a day (a flood stops here) */
  perPageDay: 80,
  /** one connection (IP) may send this many enquiries an hour, to all pages together */
  perIpHour: 10,
} as const;

export const ENQ_STATUSES = [
  { id: 'NEW', en: 'New', hi: 'नई' },
  { id: 'CONTACTED', en: 'Spoke', hi: 'बात हुई' },
  { id: 'CLOSED', en: 'Done', hi: 'पूरी' },
  { id: 'SPAM', en: 'Spam', hi: 'स्पैम' },
] as const;
export type EnqStatus = typeof ENQ_STATUSES[number]['id'];
export const isEnqStatus = (s: unknown): s is EnqStatus => ENQ_STATUSES.some(x => x.id === s);

/** the broker's one-time promise before his own listings (or "other brokers may show it") go on public pages */
export const OWNER_OK_TEXT = {
  en: 'The owners of the homes I put on public pages have agreed that I show them to people looking to buy or rent. The page never shows the owner’s name, number or full address.',
  hi: 'जो घर मैं पब्लिक पेज पर लगाऊँगा, उनके मालिकों ने हाँ कहा है कि मैं उन्हें ख़रीदने / किराये पर लेने वालों को दिखाऊँ। पेज पर मालिक का नाम, नंबर और पूरा पता कभी नहीं दिखता।',
} as const;

/** "Shankar Nagar, Telibandha" → ["Shankar Nagar", "Telibandha"] (trimmed, unique, limited) */
export function cleanAreas(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : String(v ?? '').split(/[,\n]/);
  const out: string[] = [];
  for (const a of raw) {
    const s = String(a ?? '').replace(/<[^>]*>/g, '').replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, PAGE_LIMITS.areaChars);
    if (s.length >= 2 && !out.some(x => x.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= PAGE_LIMITS.areas) break;
  }
  return out;
}

/** "98260 11101", "+91 98260-11101", "09826011101" → "9826011101"; anything else → '' */
export function mobile10(v: unknown): string {
  const raw = String(v ?? '').replace(/[\s\-().]/g, '').replace(/^\+/, '');
  const ten = raw.length === 12 && raw.startsWith('91') ? raw.slice(2) : raw.length === 11 && raw.startsWith('0') ? raw.slice(1) : raw;
  return /^[6-9]\d{9}$/.test(ten) ? ten : '';
}

/** ₹1.25 Cr · ₹45 L · ₹18,000 — how a price reads on the page */
export function priceShort(n: number): string {
  const v = Math.round(Number(n) || 0);
  const trim = (s: string) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);
  if (v >= 1_00_00_000) return `₹${trim((v / 1_00_00_000).toFixed(2))} Cr`;
  if (v >= 1_00_000) return `₹${trim((v / 1_00_000).toFixed(1))} L`;
  return '₹' + v.toLocaleString('en-IN');
}
