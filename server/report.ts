/**
 * v26 — public "GENZ <City> Property Report" (/report/:city) — a free, shareable page that brings buyers AND brokers.
 *
 * Only aggregates, only where enough data exists (no single listing can be read back):
 *  - median asking ₹ / sq ft per locality + type (at least RATE_MIN_SAMPLE listings, last 90 days — the rate-card rule)
 *  - how many live listings per type, how many open buyer needs per locality (only localities with 3+ needs)
 * No broker, owner, client, phone or address. If the city has too little data the page says so instead of guessing.
 * A broker shares it with ?ref=<his code>; the footer then invites other brokers with his code.
 */
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { rateLimit } from './auth.js';
import { rateCard, RATE_MIN_SAMPLE } from '../src/shared/dailyRules.js';
import { normCity } from '../src/shared/cities.js';
import { joinFooter } from './publicFooter.js';
import { findByCode } from './growth.js';
import { brandOf } from './share.js';

export const REPORT_MIN_LISTINGS = 20;
const NEED_MIN = 3;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const live = (p: any) => p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus) && !p.heldAt;

export function cityReport(cityRaw: string) {
  const city = normCity(cityRaw);
  const s = db.getState();
  const props = s.properties.filter(p => normCity(p.city) === city);
  const liveProps = props.filter(live);
  const byType = new Map<string, number>();
  for (const p of liveProps) byType.set(p.propertyType, (byType.get(p.propertyType) || 0) + 1);
  const needs = new Map<string, number>();
  for (const r of s.requirements) {
    if (!['active', 'matching'].includes(r.status) || normCity(r.city || '') !== city) continue;
    for (const l of (r.preferredLocalities || []).slice(0, 3)) { const k = l.trim(); if (k) needs.set(k, (needs.get(k) || 0) + 1); }
  }
  const rates = rateCard(props.filter(p => !(p as any).heldAt && p.verificationStatus === 'VERIFIED')).filter(r => r.city === city).slice(0, 25);
  return {
    city, month: new Date().toISOString().slice(0, 7), ready: liveProps.length >= REPORT_MIN_LISTINGS,
    liveListings: liveProps.length,
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => ({ type, n })),
    rates: rates.map(r => ({ locality: r.locality, propertyType: r.propertyType, medianPerSqFt: r.medianPerSqFt, sample: r.sample })),
    hotLocalities: [...needs.entries()].filter(([, n]) => n >= NEED_MIN).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([locality, n]) => ({ locality, needs: n })),
    minSample: RATE_MIN_SAMPLE,
  };
}

export function createReportRouter() {
  const r = Router();
  r.get('/:city', rateLimit('report-view', 120, 60_000), (req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=600');
    const rep = cityReport(decodeURIComponent(req.params.city).replace(/-/g, ' '));
    let sharer: UserProfile | undefined;
    try { const ref = String(req.query.ref || ''); if (ref) sharer = findByCode(ref); } catch { /* no ref */ }
    const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
    const title = `GENZ ${rep.city} Property Report — ${rep.month}`;
    // v79 — shared by a broker whose public page is ON: the customer is invited to his page (his homes, an enquiry form, a private client room)
    let sharedBy = '';
    if (sharer && sharer.role === 'BROKER' && sharer.publicCard?.enabled && sharer.referralCode) {
      const b = brandOf(sharer);
      sharedBy = `<div class="card by" data-testid="report-sharedby"><p class="by1">शेयर किया / Shared by</p><h2 style="margin:2px 0 0;font-size:17px">${esc(b.displayName)}${b.company ? ` <small>· ${esc(b.company)}</small>` : ''}</h2><p class="small" style="margin:2px 0 10px">✔ GENZ Verified Broker${sharer.city ? ` · ${esc(sharer.city)}` : ''}</p><a class="go" href="/c/${esc(encodeURIComponent(sharer.referralCode))}">🏠 इनके घर देखें और पूछें / See ${esc(b.displayName.split(' ')[0])}’s homes &amp; ask</a></div>`;
    }
    const body = !rep.ready
      ? `<div class="card"><p>The ${esc(rep.city)} report starts when GENZ has at least ${REPORT_MIN_LISTINGS} verified live listings there (now: ${rep.liveListings}).<br>यह रिपोर्ट तब शुरू होगी जब ${esc(rep.city)} में कम से कम ${REPORT_MIN_LISTINGS} वेरिफ़ाइड लाइव लिस्टिंग हों।</p></div>`
      : `<div class="card"><h2>Live verified listings / लाइव लिस्टिंग: ${rep.liveListings}</h2>${rep.byType.map(t => `<div class="row"><span>${esc(t.type)}</span><b>${t.n}</b></div>`).join('')}</div>
${rep.rates.length ? `<div class="card"><h2>Asking rate per sq ft (median) / प्रति वर्ग फ़ुट माँगी गई दर</h2>${rep.rates.map(x => `<div class="row"><span>${esc(x.locality)} · ${esc(x.propertyType)}</span><b>${inr(x.medianPerSqFt)} <small>(${x.sample})</small></b></div>`).join('')}<p class="small">Only localities with ${rep.minSample}+ listings in 90 days. Asking prices on GENZ, not registered sale values.</p></div>` : ''}
${rep.hotLocalities.length ? `<div class="card"><h2>Where buyers are looking / ख़रीदार कहाँ ढूँढ रहे हैं</h2>${rep.hotLocalities.map(x => `<div class="row"><span>${esc(x.locality)}</span><b>${x.needs} needs</b></div>`).join('')}</div>` : ''}`;
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(`${rep.liveListings} verified listings · locality rates · buyer demand — ${rep.city}`)}">
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}.w{max-width:560px;margin:0 auto;padding:16px}
.top{background:#14213d;color:#fff;border-radius:16px;padding:18px}.top h1{margin:0;font-size:20px}.top p{margin:4px 0 0;opacity:.85;font-size:13px}.card{background:#fff;border-radius:14px;padding:14px;margin-top:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
h2{font-size:14px;margin:0 0 8px}.row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:6px 0;border-bottom:1px solid #eee}.row:last-child{border:0}small{color:#777;font-weight:400}.small{font-size:11px;color:#666;margin-top:8px}.by{border:2px solid #0f9d58}.by1{margin:0;font-size:11px;color:#0b7a43;font-weight:700}.go{display:block;text-align:center;background:#0f9d58;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 10px;font-size:15px}</style></head>
<body><div class="w"><div class="top"><h1>${esc(rep.city)} Property Report</h1><p>${esc(rep.month)} · GENZ Broker Network · ${esc(rep.city)} प्रॉपर्टी रिपोर्ट</p></div>${sharedBy}${body}${joinFooter(sharer)}
<p class="small">Indicative numbers from verified GENZ listings and buyer needs. Not advice — always verify RERA, title and registered values.</p></div></body></html>`);
  });
  return r;
}
