/**
 * v26 — the line at the bottom of every public GENZ page a broker shares (brochure, listing board, visiting card).
 * Buyers read the property; OTHER BROKERS who get the forward see "made on GENZ — join free" with the sharer's code,
 * so every share is also an invitation (the sharer gets the credit through the normal nomination flow).
 */
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { ensureReferralCode } from './growth.js';
import { reputationLine } from './reputation.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * v30 — "5 buyers are looking in Raipur · 3 site visits done this week": real counts only (never a name, number or budget),
 * shown only when the numbers are worth showing (at least 3), and cached for 10 minutes per city so a public page never walks the whole database.
 */
const demandCache = new Map<string, { at: number; buyers: number; visits: number }>();
export function demandNumbers(city: string, now = Date.now()): { buyers: number; visits: number } {
  const key = String(city || '').trim().toLowerCase(); if (!key) return { buyers: 0, visits: 0 };
  const hit = demandCache.get(key); if (hit && now - hit.at < 600_000) return hit;
  const s = db.getState();
  const buyers = s.requirements.filter(r => ['active', 'matching'].includes(r.status) && String(r.city || '').trim().toLowerCase() === key).length;
  const inCity = new Set(s.properties.filter(p => String(p.city || '').trim().toLowerCase() === key).map(p => p.id));
  const visits = s.siteVisits.filter(v => v.isVerified && v.verifiedAt && now - Date.parse(v.verifiedAt) < 7 * 86_400_000 && inCity.has(v.propertyId)).length;
  if (demandCache.size > 500) demandCache.clear();
  const out = { at: now, buyers, visits }; demandCache.set(key, out); return out;
}
export function demandHtml(city?: string): string {
  const c = String(city || '').trim(); if (!c) return '';
  let n; try { n = demandNumbers(c); } catch { return ''; }
  const parts: string[] = []; const hi: string[] = [];
  if (n.buyers >= 3) { parts.push(`${n.buyers} buyers are looking in ${esc(c)} right now`); hi.push(`${esc(c)} में अभी ${n.buyers} खरीदार ढूँढ रहे हैं`); }
  if (n.visits >= 3) { parts.push(`${n.visits} site visits verified this week`); hi.push(`इस हफ़्ते ${n.visits} साइट विज़िट पक्की हुईं`); }
  if (!parts.length) return '';
  return `<div data-genz-demand style="margin:12px 0 0;padding:10px 12px;border-radius:12px;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;font-size:12px;line-height:1.5">🔥 ${parts.join(' · ')}<br><span style="opacity:.85">${hi.join(' · ')}</span></div>`;
}

export function joinFooter(sharer?: UserProfile | null, city?: string): string {
  let code = '';
  try { if (sharer && sharer.role === 'BROKER' && sharer.verificationStatus === 'VERIFIED') code = ensureReferralCode(sharer); } catch { /* a page never fails over its footer */ }
  const href = code ? `/?ref=${encodeURIComponent(code)}` : '/';
  return `${demandHtml(city || sharer?.city)}<a href="${esc(href)}" data-genz-join style="display:block;margin:14px 0 4px;padding:12px 14px;border-radius:12px;background:#14213d;color:#fff;text-decoration:none;font-size:13px;line-height:1.45">
<b>Made on GENZ Broker Network</b> · ब्रोकर हैं? अपनी लिस्टिंग का ऐसा पेज मुफ़्त बनाइए, सौदे शेयर कीजिए — GENZ से जुड़िए →<br><span style="opacity:.8">Broker? Make pages like this free and co-broke with verified brokers — request access →</span></a>`;
}

/** "12 deals closed on GENZ · confirmed by 5 brokers" (empty when there is nothing yet) */
export function reputationHtml(u?: UserProfile | null): string {
  if (!u) return '';
  const en = reputationLine(u.id); if (!en) return '';
  return `<div style="font-size:12px;color:#166534;margin-top:4px">✔ ${esc(en)}</div>`;
}
