/**
 * Rule-based scoring used by the daily features. Pure functions, no I/O — shared by the server and the tests.
 * Everything here is transparent on purpose: each point can be explained to the broker ("why is this lead hot").
 */
import type { ClientCard, ClientStage, Property } from '../../server/db.js';
import { normCity } from './cities.js';

const DAY = 86_400_000;
const days = (iso?: string, now = Date.now()) => (iso ? (now - new Date(iso).getTime()) / DAY : Infinity);

// ───────────────────────────── F10 lead score (pure) ─────────────────────────────
export interface LeadScore { score: number; label: 'HOT' | 'WARM' | 'COLD'; reasons: { en: string; hi: string; pts: number }[] }

const STAGE_PTS: Record<ClientStage, number> = { NEW: 10, CONTACTED: 20, SITE_VISIT: 40, NEGOTIATION: 55, DEAL: 0, LOST: 0 };

/** Transparent rule list — every point is explained to the broker ("why is this lead hot"). */
export function leadScore(c: ClientCard, o: { matchCount: number; shareViews7d: number; now?: number }): LeadScore {
  const now = o.now ?? Date.now();
  const reasons: LeadScore['reasons'] = [];
  const add = (pts: number, en: string, hi: string) => { if (pts !== 0) reasons.push({ pts, en, hi }); };
  if (c.stage === 'DEAL' || c.stage === 'LOST') return { score: 0, label: 'COLD', reasons: [{ pts: 0, en: c.stage === 'DEAL' ? 'Deal done' : 'Lead lost', hi: c.stage === 'DEAL' ? 'डील हो गई' : 'लीड खत्म' }] };
  add(STAGE_PTS[c.stage], `Stage: ${c.stage.replace('_', ' ').toLowerCase()}`, `चरण: ${({ NEW: 'नया', CONTACTED: 'बात हुई', SITE_VISIT: 'साइट विज़िट', NEGOTIATION: 'मोलभाव' } as any)[c.stage]}`);
  const since = days(c.lastContactAt || c.createdAt, now);
  if (since <= 2) add(20, 'Spoke in the last 2 days', 'पिछले 2 दिनों में बात हुई');
  else if (since <= 7) add(10, 'Spoke in the last week', 'पिछले हफ्ते बात हुई');
  else if (since > 21) add(-10, 'No contact for over 3 weeks', '3 हफ्ते से ज़्यादा बात नहीं हुई');
  const m = Math.min(3, o.matchCount);
  add(m * 5, `${o.matchCount} strong property match(es) in the network`, `नेटवर्क में ${o.matchCount} मज़बूत प्रॉपर्टी मैच`);
  const v = Math.min(2, o.shareViews7d);
  add(v * 10, `Opened your shared link ${o.shareViews7d}× this week`, `इस हफ्ते आपका लिंक ${o.shareViews7d} बार खोला`);
  if (c.followUpAt && new Date(c.followUpAt).getTime() < now) add(5, 'Follow-up is due', 'फॉलो-अप का समय हो गया');
  const score = Math.max(0, Math.min(100, reasons.reduce((a, r) => a + r.pts, 0)));
  return { score, label: score >= 60 ? 'HOT' : score >= 35 ? 'WARM' : 'COLD', reasons };
}


export function digestScore(base: number, o: { trust: number; ageDays: number; boosted: boolean; typeAff: number; locAff: number; seen?: string }) {
  const recency = o.ageDays <= 3 ? 10 : o.ageDays <= 7 ? 7 : o.ageDays <= 14 ? 4 : o.ageDays <= 30 ? 1 : 0;
  const parts = {
    match: base * 0.6,                       // budget, locality, type, size (matching.ts)
    trust: Math.max(0, Math.min(100, o.trust)) * 0.1,   // source broker's trust score
    recency,                                 // how new the listing is
    boost: o.boosted ? 3 : 0,                // non-cash profile boost redeemed with points (a nudge, never a jump)
    learned: Math.min(3, o.typeAff) + Math.min(3, o.locAff), // opened / shortlisted similar before (max 6)
    shortlisted: o.seen === 'SHORTLISTED' ? 2 : 0,
  };
  return { score: Math.max(0, Math.min(100, Math.round(Object.values(parts).reduce((a, b) => a + b, 0)))), parts };
}


// ───────────────────────────── F17 rate card (pure) ─────────────────────────────
export const RATE_MIN_SAMPLE = 10;
export function rateCard(properties: Property[], now = Date.now()) {
  const groups = new Map<string, { city: string; locality: string; type: string; rates: number[]; oldest: number; newest: number }>();
  for (const p of properties) {
    if (p.transactionType !== 'Sale' || !['active', 'under_negotiation', 'sold'].includes(p.listingStatus)) continue;
    const area = p.builtUpAreaSqFt || p.plotAreaSqFt || 0;
    const t = new Date(p.createdAt).getTime();
    if (!area || !p.askingPrice || now - t > 90 * DAY) continue;
    const k = `${normCity(p.city)}|${p.locality.trim().toLowerCase()}|${p.propertyType}`;
    const g = groups.get(k) || { city: normCity(p.city), locality: p.locality.trim(), type: p.propertyType, rates: [], oldest: t, newest: t };
    g.rates.push(p.askingPrice / area); g.oldest = Math.min(g.oldest, t); g.newest = Math.max(g.newest, t);
    groups.set(k, g);
  }
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  return [...groups.values()].filter(g => g.rates.length >= RATE_MIN_SAMPLE).map(g => ({
    city: g.city, locality: g.locality, propertyType: g.type, medianPerSqFt: Math.round(med(g.rates)), sample: g.rates.length,
    from: new Date(g.oldest).toISOString().slice(0, 10), to: new Date(g.newest).toISOString().slice(0, 10),
    note: 'Indicative only — asking prices of GENZ listings, not registered sale values.',
  })).sort((a, b) => b.sample - a.sample);
}


// ───────────────────────────── paste-a-lead-text parser (free alternative to portal IMAP) ─────────────────────────────
export function parseLeadText(text: string) {
  const t = String(text || '').slice(0, 4000);
  const phone = (t.match(/(?:\+?91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})/) || [])[1]?.replace(/\D/g, '');
  const nameM = t.match(/(?:name|client|customer|enquiry from|inquiry from)\s*[:\-]\s*([A-Za-z][A-Za-z .']{1,40})/i);
  const mb = t.match(/(?:budget|price)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d.,]+)\s*(crore|cr|lakhs|lakh|lac|l)?(?:\s*(?:-|to)\s*(?:rs\.?|₹)?\s*([\d.,]+)\s*(crore|cr|lakhs|lakh|lac|l)?)?/i);
  const toInr = (n?: string, u?: string) => { if (!n) return 0; const v = parseFloat(n.replace(/,/g, '')); if (!Number.isFinite(v)) return 0; const unit = (u || '').toLowerCase(); return Math.round(v * (unit.startsWith('c') ? 1e7 : unit.startsWith('l') ? 1e5 : 1)); };
  let min = 0, max = 0;
  if (mb) { max = toInr(mb[3] || mb[1], mb[4] || mb[2]); min = mb[3] ? toInr(mb[1], mb[2] || mb[4]) : 0; }
  const loc = (t.match(/(?:location|locality|area|city)\s*[:\-]\s*([A-Za-z][A-Za-z ,.-]{1,60})/i) || [])[1]?.trim();
  return { name: nameM?.[1]?.trim() || '', phone: phone || '', budgetMin: min, budgetMax: max, area: loc || '' };
}

