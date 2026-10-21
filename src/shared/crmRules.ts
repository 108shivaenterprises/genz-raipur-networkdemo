/**
 * v16 — pure rules for the CRM controls (no server imports: unit tests and the browser use it too).
 */
export const STALE_DAYS = 7;
export const PROTECTION_EXTEND_DAYS = 30;
export const MAX_EXTENSIONS = 2;
export const EXTEND_WINDOW_DAYS = 7;        // may ask only when this close to expiry
export const EXTEND_ACTIVITY_DAYS = 14;     // …and only with real activity (call / meeting / visit / follow-up done) this recently
export const PHONE_FIX_HOURS = 24;          // the associate may fix a typo this long after registering; the builder any time
export const LOST_RETENTION_DAYS: number = Number((globalThis as any).process?.env?.CRM_LOST_RETENTION_DAYS) || 365;
export const OPTOUT_RETENTION_DAYS: number = Number((globalThis as any).process?.env?.CRM_OPTOUT_RETENTION_DAYS) || 30;
export const CLAIM_ESCALATE_DAYS = 7;       // an associate's "customer paid" claim the builder never answered
export const PAYOUT_CONFIRM_DAYS = 7;       // a payout the associate never confirmed
export const MAX_IMPORT_ROWS = 200;
export const MAX_BULK = 50;
export const MAX_TAGS = 5;
export const DEFAULT_TDS_PCT = 5;
export const NO_PAN_TDS_PCT = 20;
export const GST_PCT = 18;

export const TEMPERATURES = ['HOT', 'WARM', 'COLD'] as const;
export const LOST_CODES: { id: string; en: string; hi: string }[] = [
  { id: 'PRICE', en: 'Price too high', hi: 'कीमत ज़्यादा' },
  { id: 'LOCATION', en: 'Location not suitable', hi: 'लोकेशन पसंद नहीं' },
  { id: 'LOAN_REJECTED', en: 'Loan rejected', hi: 'लोन रिजेक्ट' },
  { id: 'BOUGHT_ELSEWHERE', en: 'Bought elsewhere', hi: 'कहीं और ले लिया' },
  { id: 'NOT_RESPONDING', en: 'Not responding', hi: 'जवाब नहीं दे रहे' },
  { id: 'NOT_INTERESTED', en: 'Not interested', hi: 'रुचि नहीं' },
  { id: 'POSTPONED', en: 'Postponed the plan', hi: 'प्लान टाल दिया' },
  { id: 'DUPLICATE', en: 'Duplicate / wrong lead', hi: 'डुप्लीकेट / गलत लीड' },
  { id: 'OTHER', en: 'Other', hi: 'अन्य' },
];
export const lostCodeOk = (c: unknown): c is string => typeof c === 'string' && LOST_CODES.some(x => x.id === c);

/** Follow-up the app suggests automatically when a lead reaches a stage (days from now). */
export const AUTO_FOLLOWUP: Record<string, { days: number; channel: 'CALL' | 'WHATSAPP'; note: string }> = {
  CONTACTED: { days: 2, channel: 'CALL', note: 'Follow up after first contact' },
  SITE_VISITED: { days: 2, channel: 'CALL', note: 'Ask for feedback after the site visit' },
  NEGOTIATION: { days: 3, channel: 'CALL', note: 'Check on the negotiation / offer' },
};

export const isOpenStage = (stage: string) => !['BOOKED', 'LOST'].includes(stage);
const DAY = 86400_000;

export function lastActivityAt(l: { activities: { at: string; type?: string }[]; createdAt: string }): string {
  return l.activities.reduce((m, a) => (a.at > m ? a.at : m), l.createdAt);
}
export function isStale(l: { stage: string; activities: { at: string }[]; createdAt: string }, now = Date.now()): boolean {
  return isOpenStage(l.stage) && now - Date.parse(lastActivityAt(l)) > STALE_DAYS * DAY;
}
export function protectionDaysLeft(l: { protectedUntil: string }, now = Date.now()): number {
  return Math.ceil((Date.parse(l.protectedUntil) - now) / DAY);
}
/** Real engagement (not notes / system lines) in the last EXTEND_ACTIVITY_DAYS. */
export function hasRecentEngagement(l: { activities: { at: string; type: string }[] }, now = Date.now()): boolean {
  return l.activities.some(a => ['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT'].includes(a.type) && now - Date.parse(a.at) <= EXTEND_ACTIVITY_DAYS * DAY);
}
/** '' when protection may be extended now, else the reason. */
export function extendBlock(l: { stage: string; protectedUntil: string; protectionExtensions?: number; activities: { at: string; type: string }[] }, now = Date.now()): string {
  if (!isOpenStage(l.stage) || l.stage === 'BOOKING_REQUESTED') return 'Only an open lead can be extended';
  if ((l.protectionExtensions || 0) >= MAX_EXTENSIONS) return `Protection can be extended at most ${MAX_EXTENSIONS} times`;
  const left = protectionDaysLeft(l, now);
  if (left > EXTEND_WINDOW_DAYS) return `You can extend only in the last ${EXTEND_WINDOW_DAYS} days of protection (${left} days left)`;
  if (left < -3) return 'Protection has already lapsed — register the customer again if still free';
  if (!hasRecentEngagement(l, now)) return `Log a real call / meeting / visit with this customer in the last ${EXTEND_ACTIVITY_DAYS} days first`;
  return '';
}

/** TDS % on brokerage: the builder's rate, but never below the no-PAN rate when the associate has no PAN. CA decides the real numbers. */
export function effectiveTdsPct(projectPct: number | undefined, hasPan: boolean): number {
  const base = Number.isFinite(projectPct as number) ? (projectPct as number) : DEFAULT_TDS_PCT;
  return hasPan ? base : Math.max(base, NO_PAN_TDS_PCT);
}
export function brokerageBreakup(amount: number, tdsPct: number, hasGstin: boolean) {
  const gst = hasGstin ? Math.round((amount * GST_PCT) / 100) : 0;
  const tds = Math.round((amount * tdsPct) / 100);
  return { gross: Math.round(amount), gst, tds, net: Math.round(amount) + gst - tds };
}

/** A CSV cell that cannot run as a spreadsheet formula. */
export function csvCell(v: unknown): string {
  let s = String(v ?? '').replace(/\r?\n/g, ' ');
  if (/^[=+\-@\t]/.test(s)) s = `'${s}`;
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}

/** WhatsApp message templates (client-side, wa.me link — no paid API). */
export const WA_TEMPLATES: { id: string; en: string; hi: string; textEn: string; textHi: string }[] = [
  { id: 'intro', en: 'Introduction', hi: 'परिचय', textEn: 'Hello {name}, this is {me} regarding {project}. When is a good time to talk?', textHi: 'नमस्ते {name}, मैं {me}, {project} के बारे में बात करना चाहता/चाहती हूँ। बात करने का सही समय बताइए।' },
  { id: 'visit', en: 'Site-visit reminder', hi: 'साइट विज़िट रिमाइंडर', textEn: 'Hello {name}, a reminder of your {project} site visit. Please carry an ID. See you there!', textHi: 'नमस्ते {name}, {project} की साइट विज़िट की याद दिलाना चाहता/चाहती हूँ। कृपया ID साथ रखें। मिलते हैं!' },
  { id: 'after', en: 'After the visit', hi: 'विज़िट के बाद', textEn: 'Hello {name}, thank you for visiting {project}. Did you like it? Happy to answer any questions.', textHi: 'नमस्ते {name}, {project} देखने आने के लिए धन्यवाद। आपको कैसा लगा? कोई सवाल हो तो ज़रूर पूछें।' },
  { id: 'offer', en: 'Offer / price update', hi: 'ऑफ़र / कीमत अपडेट', textEn: 'Hello {name}, there is an update on {project} that may interest you. Shall I share the details?', textHi: 'नमस्ते {name}, {project} पर एक अपडेट है जो आपके काम का हो सकता है। विवरण भेजूँ?' },
  { id: 'payment', en: 'Payment reminder', hi: 'पेमेंट रिमाइंडर', textEn: 'Hello {name}, a gentle reminder about the upcoming payment for {project}. Please let me know if you need any help.', textHi: 'नमस्ते {name}, {project} की आने वाली किस्त की याद दिलाना चाहता/चाहती हूँ। कोई मदद चाहिए तो बताइए।' },
  { id: 'thanks', en: 'Thank you', hi: 'धन्यवाद', textEn: 'Thank you {name}! Wishing you a wonderful home at {project}.', textHi: 'धन्यवाद {name}! {project} में आपके नए घर के लिए शुभकामनाएँ।' },
];
export const fillTemplate = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
