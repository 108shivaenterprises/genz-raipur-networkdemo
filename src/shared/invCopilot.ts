/**
 * v111 — Copilot for the unit grid (builder + partners). One line → one plan; nothing is written here.
 * The builder's rate / reserve / available changes go through the same PUT /inventory/units/:uid the grid uses;
 * a partner can only ask (counts, one unit's status) — a hold needs a token receipt, so it stays on the grid.
 */
import { normNum } from './hiNum.js';

export interface CpUnit { id: string; label: string; code?: string; status: string; price?: number | null; config?: string; group?: string }
export type InvPlan =
  | { kind: 'PRICE'; hi: string; en: string; unitId: string; price: number; warn?: { hi: string; en: string } }
  | { kind: 'STATUS'; hi: string; en: string; unitId: string; status: 'AVAILABLE' | 'RESERVED' }
  | { kind: 'SHOW_SUMMARY' | 'SHOW_UNIT'; hi: string; en: string; unitId?: string }
  | { kind: 'INFO'; hi: string; en: string }
  | { kind: 'ASK'; hi: string; en: string; choices?: { id: string; label: string }[] }
  | { kind: 'UNKNOWN'; hi: string; en: string };

export const INV_HELP = {
  hi: 'ऐसे लिखें: “कितने फ्लैट बचे हैं” · “A-101 का स्टेटस” · (बिल्डर) “A-101 का रेट 85 lakh करो” · “A-102 reserve करो” · “A-102 available करो”.',
  en: 'Try: “how many flats are left” · “status of A-101” · (builder) “set A-101 rate to 85 lakh” · “reserve A-102” · “make A-102 available”.',
};

const key = (s: string) => String(s || '').toLowerCase().replace(/[\s\-_/]/g, '');
const inrShort = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(2)} L` : `₹${n.toLocaleString('en-IN')}`);

/** the unit(s) a line names — by label (A-101) or the builder's own code; the longest name wins, so “A-101” is never read as “A-10” */
export function findUnits(text: string, units: CpUnit[]): CpUnit[] {
  const t = key(text);
  const hits = units.flatMap(u => [u.label, u.code].filter(Boolean).map(n => ({ u, n: key(n as string) }))).filter(x => x.n.length >= 2 && t.includes(x.n));
  if (!hits.length) return [];
  const best = Math.max(...hits.map(h => h.n.length));
  return [...new Map(hits.filter(h => h.n.length === best).map(h => [h.u.id, h.u])).values()];
}

/** “85 lakh”, “1.2 cr”, “8500000” → rupees; 0 when there is no amount. A bare number under ₹1 lakh is not a flat's rate. */
export function amountIn(text: string): number {
  const t = normNum(text).toLowerCase().replace(/(\d),(?=\d)/g, '$1');
  const u = /(\d+(?:\.\d+)?)\s*(cr(?:ore)?|lakhs?|lacs?|l)\b/.exec(t);
  if (u) { const v = parseFloat(u[1]); return Math.round(v * (/^cr/.test(u[2]) ? 1e7 : 1e5)); }
  const n = [...t.matchAll(/(?<![\d.])(\d{6,9})(?![\d.])/g)].map(m => parseInt(m[1], 10)).filter(v => v >= 100_000);
  return n[0] || 0;
}

const R = {
  price: /(rate|price|bhav|bhaav|dam\b|kimat|कीमत|रेट|भाव)/,
  reserve: /(reserve|rok\s?(lo|do)|rakh\s?(lo|do)|block kar|रिज़र्व|रोक)/,
  avail: /(available|khali|free|unreserve|wapas|वापस|उपलब्ध)/,
  act: /(karo|kar do|kar de|kardo|kijiye|set|mark|change|badlo|badal|update|कर दो|करो|बदल)/,
  hold: /(hold|token|book)/,
  count: /(kitne|kitni|kitna|how many|bache|bacha|bachi|left|remaining|summary|inventory|stock|total)/,
};

export function planInventory(raw: string, ctx: { units: CpUnit[]; canManage: boolean }): InvPlan {
  const text = String(raw || '').trim().slice(0, 400);
  if (!text) return { kind: 'UNKNOWN', ...INV_HELP };
  const t = normNum(text).toLowerCase();
  const hit = findUnits(text, ctx.units);
  const acts = R.act.test(t);

  if (hit.length > 1) return { kind: 'ASK', hi: 'कई यूनिट मिलीं — कौन-सी?', en: 'More than one unit matches — which one?', choices: hit.slice(0, 6).map(u => ({ id: u.id, label: `${u.label} · ${u.status}` })) };
  const u = hit[0];

  const wantsPrice = R.price.test(t) && (acts || amountIn(t) > 0);
  const wantsStatus = R.reserve.test(t) || (R.avail.test(t) && acts);
  if (u && (wantsPrice || wantsStatus)) {
    if (!ctx.canManage) return { kind: 'INFO', hi: 'रेट और स्टेटस सिर्फ़ बिल्डर बदल सकते हैं। होल्ड के लिए ग्रिड में यूनिट खोलिए (टोकन + रसीद नंबर चाहिए)।', en: 'Only the builder can change rate or status. To hold a unit, open it in the grid (token + receipt number needed).' };
    if (u.status === 'BOOKED') return { kind: 'INFO', hi: `${u.label} बुक है — बदलाव सिर्फ़ बुकिंग (CRM) से होता है।`, en: `${u.label} is booked — it changes only through its booking (CRM).` };
    if (u.status === 'HOLD') return { kind: 'INFO', hi: `${u.label} होल्ड पर है — पहले होल्ड छोड़िए।`, en: `${u.label} is on hold — release the hold first.` };
    if (wantsPrice && !wantsStatus) {
      const price = amountIn(t);
      if (!price) return { kind: 'ASK', hi: `${u.label} का नया रेट कितना? जैसे “85 lakh”।`, en: `New rate for ${u.label}? e.g. “85 lakh”.` };
      const old = u.price || 0; const big = old > 0 && Math.abs(price - old) / old > 0.2;
      return { kind: 'PRICE', unitId: u.id, price, ...(big ? { warn: { hi: `पुराने रेट (${inrShort(old)}) से 20% से ज़्यादा फ़र्क़ है — पक्का?`, en: `More than 20% away from the old rate (${inrShort(old)}) — sure?` } } : {}), hi: `${u.label} का रेट ${old ? inrShort(old) + ' → ' : ''}${inrShort(price)} करूँ?`, en: `Change ${u.label} rate ${old ? inrShort(old) + ' → ' : 'to '}${inrShort(price)}?` };
    }
    const status = R.reserve.test(t) ? 'RESERVED' : 'AVAILABLE';
    if (u.status === status) return { kind: 'INFO', hi: `${u.label} पहले से ${status === 'RESERVED' ? 'रिज़र्व' : 'उपलब्ध'} है।`, en: `${u.label} is already ${status.toLowerCase()}.` };
    return { kind: 'STATUS', unitId: u.id, status, hi: `${u.label}: ${u.status} → ${status === 'RESERVED' ? 'रिज़र्व (बिल्डर)' : 'उपलब्ध'}?`, en: `${u.label}: ${u.status} → ${status.toLowerCase()}?` };
  }
  if (u && R.hold.test(t) && acts) return { kind: 'INFO', hi: 'होल्ड/बुकिंग ग्रिड से होती है — यूनिट खोलकर लीड, टोकन और रसीद नंबर भरिए।', en: 'Hold / booking is done from the grid — open the unit and fill lead, token and receipt number.' };
  if (u) return { kind: 'SHOW_UNIT', unitId: u.id, hi: '', en: '' };
  if (R.count.test(t) || R.avail.test(t)) return { kind: 'SHOW_SUMMARY', hi: '', en: '' };
  if (wantsPrice || wantsStatus || R.hold.test(t)) return { kind: 'ASK', hi: 'कौन-सी यूनिट? नंबर लिखिए, जैसे A-101।', en: 'Which unit? Write its number, e.g. A-101.' };
  return { kind: 'UNKNOWN', ...INV_HELP };
}

/** read-only answers, built from the loaded grid */
export function summaryText(units: CpUnit[]): string {
  const c = (s: string) => units.filter(u => u.status === s).length;
  const by = new Map<string, number>();
  for (const u of units.filter(x => x.status === 'AVAILABLE')) { const k = u.config || '—'; by.set(k, (by.get(k) || 0) + 1); }
  const cfg = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ');
  return `${units.length} units — ${c('AVAILABLE')} available · ${c('HOLD')} hold · ${c('BOOKED')} booked · ${c('RESERVED')} reserved${cfg ? `\n${cfg}` : ''}`;
}
export function unitLine(u: CpUnit, showPrice: boolean): string {
  return `${u.label}${u.config ? ' · ' + u.config : ''} · ${u.status}${showPrice && u.price ? ' · ' + inrShort(u.price) : ''}`;
}
