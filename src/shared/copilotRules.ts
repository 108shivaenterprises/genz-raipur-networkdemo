/**
 * v110 — Broker Copilot: turns one Hinglish/English line into a PLAN (never into a write).
 * The UI shows the plan as a confirm card; only the broker's tap runs it, through the same API calls the screens use,
 * so permissions, rate limits and audit stay exactly as they are. Pure, no I/O — shared by the UI and the tests.
 */
import { parseLeadText } from './dailyRules.js';
import { normNum } from './hiNum.js';
import { readWhen } from './sahayak.js';

export interface CpClient { id: string; name: string; stage: string; followUpAt?: string }
export interface CpListing { id: string; title: string; state?: string }
export interface CpCtx { clients: CpClient[]; listings: CpListing[]; now?: Date }

export type CpPlan =
  | { kind: 'ADD_CLIENT'; hi: string; en: string; body: { name: string; phone: string; budgetMin: number; budgetMax: number; city: string; areas: string[]; propertyType: string; transactionType: 'Sale' | 'Rent'; notes: string; followUpAt?: string }; needsConsent: true }
  | { kind: 'STAGE'; hi: string; en: string; clientId: string; stage: 'CONTACTED' | 'SITE_VISIT' | 'NEGOTIATION' | 'DEAL' | 'LOST'; lostReason?: string; followUpAt?: string; money?: boolean }
  | { kind: 'NOTE'; hi: string; en: string; clientId: string; text: string; noteKind: 'NOTE' | 'CONTACT' | 'FOLLOWUP'; followUpAt?: string }
  | { kind: 'CONFIRM_LISTING'; hi: string; en: string; listingId: string }
  | { kind: 'SHOW_DUE' | 'SHOW_BRIEF' | 'SHOW_STALE'; hi: string; en: string }
  | { kind: 'ASK'; hi: string; en: string; choices?: { id: string; label: string }[] }
  | { kind: 'UNKNOWN'; hi: string; en: string };

export const COPILOT_HELP = {
  hi: 'ऐसे लिखें: “नया क्लाइंट Ramesh 98260 12345 budget 60 lakh Pandri” · “Ramesh ko call kiya, kal 5 baje follow-up” · “Ramesh site visit” · “Ramesh deal ho gayi” · “Ramesh lost, budget kam” · “aaj ka kaam” · “kiska follow-up pending hai”.',
  en: 'Try: “new client Ramesh 98260 12345 budget 60 lakh Pandri” · “called Ramesh, follow-up tomorrow 5pm” · “Ramesh site visit” · “Ramesh deal done” · “Ramesh lost, budget low” · “today’s work” · “whose follow-up is pending”.',
};

const low = (s: string) => normNum(String(s || '')).toLowerCase().replace(/\s+/g, ' ').trim();
const first = (s: string) => String(s || '').trim().split(/\s+/)[0] || '';
const words = (s: string) => low(s).replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

/** clients whose name is mentioned in the line (whole-word, first name or full name); a full-name hit beats a first-name hit */
export function findClients(text: string, clients: CpClient[]): CpClient[] {
  const t = ' ' + words(text) + ' ';
  const hit = clients.filter(c => { const n = words(c.name); return n.length >= 2 && (t.includes(' ' + n + ' ') || t.includes(' ' + first(n) + ' ')); });
  const full = hit.filter(c => t.includes(' ' + words(c.name) + ' '));
  return full.length ? full : hit;
}

const RX = {
  add: /(naya|nayi|new|add|जोड़|नया)\s*(client|customer|lead|grahak|क्लाइंट|ग्राहक)|(client|lead)\s*(add|jodo|banao)/,
  due: /(pending|baaki|kiska|kiske|kaun|due|overdue).*(follow|call|fu)|follow.?ups?\s*(pending|due|list|dikhao|batao)|aaj ka kaam|aaj kya karna|today.?s? (work|tasks?|plan)|kya karna hai|brief|morning/,
  stale: /(thanda|cold|purane|stale|koi hal nahi|no reply|neglect|chhoot|bhool)/,
  stageVisit: /(site visit|visit (ho|kar|hua|kiya|done|complete)|dekh liya|dekhne gaye|ghar dekha)/,
  stageNego: /(negotiat|bhaav|bhav|mol.?tol|rate baat|baat chal|final kar|price baat)/,
  stageDeal: /(deal (ho|done|close|final|pakki)|sauda (ho|pakka|final)|book(ed|ing)? (ho|kar|done)|token (de|diya|mil)|ho gaya sauda|closed)/,
  stageLost: /(lost|nahi lena|nahi chahiye|cancel|drop|interest nahi|khatam|band karo|mana kar|chhod diya)/,
  contact: /(call kiya|baat hui|baat ki|phone kiya|whatsapp kiya|msg kiya|message kiya|spoke|called|talked|met|mila|milke)/,
  follow: /(follow.?up|yaad dila|remind|dobara|phir (call|baat)|call back|callback)/,
  confirm: /(still available|abhi bhi (available|hai)|available hai|confirm|taaza|refresh|re.?list)/,
  phone: /(?<!\d)[6-9]\d{9}(?!\d)/,
};
const squeeze = (s: string) => s.replace(/(\d)[\s-](?=\d)/g, '$1');

const rupeesText = (n: number) => (n >= 1e7 ? `${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${+(n / 1e5).toFixed(1)} L` : String(n));

function parseBudget(t: string): { min: number; max: number } {
  const num = (v: string, u: string) => { const x = parseFloat(v.replace(/,/g, '')); if (!Number.isFinite(x)) return 0; return Math.round(x * (/^cr/.test(u) ? 1e7 : /^(l|lac|lakh)/.test(u) ? 1e5 : /^(k|hazar)/.test(u) ? 1e3 : 1)); };
  const m = /([\d.,]+)\s*(cr(?:ore)?|lakhs?|lacs?|l|k|hazar)?\s*(?:-|to|se|–)\s*([\d.,]+)\s*(cr(?:ore)?|lakhs?|lacs?|l|k|hazar)\b/i.exec(t);
  if (m) { const u2 = m[4].toLowerCase(); const u1 = (m[2] || m[4]).toLowerCase(); return { min: num(m[1], u1), max: num(m[3], u2) }; }
  const s = /([\d.,]+)\s*(cr(?:ore)?|lakhs?|lacs?|l|k|hazar)\b/i.exec(t);
  if (s) return { min: 0, max: num(s[1], s[2].toLowerCase()) };
  return { min: 0, max: 0 };
}

const NAME_STOP = /^(budget|bajet|call|client|naya|nayi|new|add|ke|ka|ki|me|mein|mai|ko|se|tak|bhk|rent|sale|lakh|lac|cr|crore|follow|up|kal|aaj|parso|phone|number|no|flat|plot|house|ghar|customer|lead|grahak)$/i;

function parseAdd(raw: string, now: Date): CpPlan {
  const t = low(raw);
  const sq = squeeze(raw);
  const lead = parseLeadText(sq);
  const phone = lead.phone || (RX.phone.exec(squeeze(t)) || [''])[0];
  const afterKw = /(?:client|customer|lead|grahak|क्लाइंट|ग्राहक)\s*(?:add|jodo)?\s*[:\-]?\s*([A-Za-zऀ-ॿ][A-Za-zऀ-ॿ .']{1,30}?)(?=\s+\d|\s+budget|\s+bajet|\s*,|\s+rent\b|\s+sale\b|$)/i.exec(raw);
  let name = lead.name || (afterKw ? afterKw[1].trim() : '');
  name = name.split(/\s+/).filter(w => !NAME_STOP.test(w)).slice(0, 3).join(' ');
  const bhk = /(\d)\s*bhk/.exec(t)?.[1];
  const rent = /(rent|kiraya|kiraye)/.test(t);
  const b = lead.budgetMax ? { min: lead.budgetMin, max: lead.budgetMax } : parseBudget(t.replace(/\b\d{10}\b/g, ' '));
  const areaM = /(?:\bin\b|\bme\b|\bmein\b|\bmai\b|area|location|ilaka|इलाके?\s*(?:में)?)\s+([a-zऀ-ॿ][a-zऀ-ॿ ]{2,24}?)(?=\s+(?:budget|bajet|\d|rent|sale|follow|kal|aaj|ke|ka)\b|[,.]|$)/i.exec(raw);
  const area = (lead.area || (areaM ? areaM[1] : '')).trim();
  if (!name) return { kind: 'ASK', hi: 'क्लाइंट का नाम क्या है? जैसे “नया क्लाइंट Ramesh 98260 12345 budget 60 lakh”।', en: 'What is the client’s name? e.g. “new client Ramesh 98260 12345 budget 60 lakh”.' };
  if (!/^[6-9]\d{9}$/.test(phone)) return { kind: 'ASK', hi: `${name} का 10 अंकों का मोबाइल नंबर बताइए।`, en: `Please give ${name}’s 10-digit mobile number.` };
  const w = readWhen(raw, now);
  const body = { name, phone, budgetMin: b.min, budgetMax: b.max, city: '', areas: area ? [area] : [], propertyType: bhk ? `${bhk} BHK Flat` : 'Residential Flat', transactionType: (rent ? 'Rent' : 'Sale') as 'Sale' | 'Rent', notes: '', ...(w?.iso ? { followUpAt: w.iso } : {}) };
  const bits = [bhk ? `${bhk}BHK` : '', b.max ? `≤ ₹${rupeesText(b.max)}` : '', area, rent ? 'Rent' : ''].filter(Boolean).join(' · ');
  return { kind: 'ADD_CLIENT', body, needsConsent: true, hi: `नया क्लाइंट जोड़ूँ: ${name} (${phone.slice(0, 5)}•••••)${bits ? ' — ' + bits : ''}${w ? ' — फॉलो-अप ' + w.hi : ''}`, en: `Add client: ${name} (${phone.slice(0, 5)}•••••)${bits ? ' — ' + bits : ''}${w ? ' — follow-up ' + w.en : ''}` };
}

function lostReasonOf(raw: string, name: string): string {
  return raw.replace(new RegExp(name.split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu, ''), 'i'), '')
    .replace(/(lost|nahi lena|nahi chahiye|cancel|drop|interest nahi|khatam|band karo|mana kar|chhod diya)/gi, '')
    .replace(/^[\s,.\-:]+|[\s,.\-:]+$/g, '').slice(0, 120);
}

/** one line → one plan */
export function planCommand(raw: string, ctx: CpCtx): CpPlan {
  const text = String(raw || '').trim().slice(0, 600);
  const now = ctx.now || new Date();
  if (!text) return { kind: 'UNKNOWN', ...COPILOT_HELP };
  const t = low(text);
  const who = findClients(text, ctx.clients);

  if (RX.add.test(t) || (RX.phone.test(squeeze(t)) && !who.length && /budget|bhk|lakh|rent/.test(t))) return parseAdd(text, now);
  if (!who.length && RX.stale.test(t)) return { kind: 'SHOW_STALE', hi: 'ठंडे क्लाइंट (7+ दिन से संपर्क नहीं):', en: 'Cold clients (no contact for 7+ days):' };
  if (!who.length && RX.due.test(t)) return /follow/.test(t) ? { kind: 'SHOW_DUE', hi: 'आज/पेंडिंग फॉलो-अप:', en: 'Follow-ups due now:' } : { kind: 'SHOW_BRIEF', hi: 'आज का काम:', en: 'Today’s work:' };

  if (!who.length && RX.confirm.test(t)) {
    const hits = ctx.listings.filter(l => words(l.title).split(' ').filter(w => w.length > 3).some(w => t.includes(w)));
    if (hits.length === 1) return { kind: 'CONFIRM_LISTING', listingId: hits[0].id, hi: `“${hits[0].title}” अभी भी उपलब्ध है — कन्फर्म करूँ?`, en: `Confirm “${hits[0].title}” is still available?` };
    const pool = hits.length ? hits : ctx.listings.slice(0, 5);
    if (pool.length) return { kind: 'ASK', hi: 'कौन-सी लिस्टिंग कन्फर्म करनी है?', en: 'Which listing should I confirm?', choices: pool.map(l => ({ id: l.id, label: l.title })) };
    return { kind: 'ASK', hi: 'आपकी कोई सक्रिय लिस्टिंग नहीं मिली।', en: 'I found no active listing of yours.' };
  }

  const wantsStage = RX.stageDeal.test(t) ? 'DEAL' : RX.stageLost.test(t) ? 'LOST' : RX.stageNego.test(t) ? 'NEGOTIATION' : RX.stageVisit.test(t) ? 'SITE_VISIT' : null;
  const wantsContact = RX.contact.test(t);
  const w = readWhen(text, now);
  const wantsFollow = RX.follow.test(t) || (wantsContact && !!w);
  if (!wantsStage && !wantsContact && !wantsFollow) return { kind: 'UNKNOWN', ...COPILOT_HELP };

  if (who.length === 0) return { kind: 'ASK', hi: 'कौन-सा क्लाइंट? नाम लिखिए (आपकी लिस्ट में नहीं मिला)।', en: 'Which client? Write the name (not found in your list).' };
  if (who.length > 1) return { kind: 'ASK', hi: 'कई क्लाइंट मिले — कौन-सा?', en: 'More than one client matches — which one?', choices: who.slice(0, 5).map(c => ({ id: c.id, label: `${c.name} · ${c.stage}` })) };
  const c = who[0];

  if (wantsStage) {
    if (wantsStage === 'LOST') {
      const lr = lostReasonOf(text, c.name);
      if (!lr) return { kind: 'ASK', hi: `${c.name} क्यों नहीं ले रहे? एक लाइन में वजह लिखें (जैसे “budget kam”)।`, en: `Why is ${c.name} lost? Give a one-line reason (e.g. “budget low”).` };
      return { kind: 'STAGE', clientId: c.id, stage: 'LOST', lostReason: lr, hi: `${c.name} को LOST करूँ — वजह: ${lr}`, en: `Mark ${c.name} as LOST — reason: ${lr}` };
    }
    const label: Record<string, [string, string]> = { SITE_VISIT: ['साइट विज़िट', 'Site visit'], NEGOTIATION: ['बातचीत', 'Negotiation'], DEAL: ['डील', 'Deal'] };
    return { kind: 'STAGE', clientId: c.id, stage: wantsStage, ...(w?.iso && wantsStage !== 'DEAL' ? { followUpAt: w.iso } : {}), money: wantsStage === 'DEAL', hi: `${c.name}: ${c.stage} → ${label[wantsStage][0]}${wantsStage === 'DEAL' ? ' (डील बंद — पक्का?)' : ''}`, en: `${c.name}: ${c.stage} → ${label[wantsStage][1]}${wantsStage === 'DEAL' ? ' (deal closed — sure?)' : ''}` };
  }
  if (wantsFollow && !w?.iso && !wantsContact) return { kind: 'ASK', hi: `${c.name} का फॉलो-अप कब? जैसे “कल शाम 5 बजे”।`, en: `When should I follow up with ${c.name}? e.g. “tomorrow 5pm”.` };
  return { kind: 'NOTE', clientId: c.id, noteKind: wantsContact ? 'CONTACT' : 'FOLLOWUP', text: text.slice(0, 300), ...(w?.iso ? { followUpAt: w.iso } : {}), hi: `${c.name}: ${wantsContact ? 'संपर्क नोट' : 'फॉलो-अप'}${w ? ' — ' + w.hi : ''}`, en: `${c.name}: ${wantsContact ? 'contact note' : 'follow-up'}${w ? ' — ' + w.en : ''}` };
}
