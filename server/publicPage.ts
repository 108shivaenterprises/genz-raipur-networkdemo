/**
 * v57 — the broker's public page.
 *   Public (no login):  GET /c/<code> · POST /c/<code>/enquiry · GET /c/page.js        (mounted before the visiting-card router)
 *   Broker (`publicpage:use`):  /api/public-page
 *
 * The opt-in visiting card (/c/<code>) of a BROKER becomes his public page:
 *  • the homes he picks — his own live listings (after a one-time promise that their owners agreed, OWNER_OK_TEXT) and other brokers'
 *    live listings whose listing broker switched on "other GENZ brokers may show this on their public page" (default: off);
 *  • per home: photos (drawn on the visitor's screen with the page broker's name across them), type, locality + city, price, area,
 *    tags, a description without phone numbers, a YouTube walk-through. Never the exact address, map pin, owner's name / number,
 *    net price, documents, or anything from deal rooms;
 *  • an enquiry form → the PAGE broker only (also for another broker's listing: he co-brokes it through a normal offer). Name, mobile,
 *    which home, a message and a consent tick; erased PAGE_LIMITS.keepDays after it came in. No CAPTCHA: a hidden trap field, a signed
 *    "page opened at" time (a form sent back in under 2.5 s is a bot), and per-connection / per-mobile / per-page limits. A mobile on
 *    GENZ Network Watch is marked for the broker; the sender is never told.
 * Other roles (builder, contractor, lawyer) keep the plain visiting card of server/growth.ts.
 */
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, Property, PageEnquiry } from './db.js';
import { ctx, needs, hit, digits, secret, safeEqual, parseCookies } from './auth.js';
import { brandOf } from './share.js';
import { findByCode, ensureReferralCode } from './growth.js';
import { joinFooter, reputationHtml } from './publicFooter.js';
import { stripPhones } from '../src/shared/waParse.js';
import { okMediaUrl, youtubeId } from '../src/shared/roomMedia.js';
import { publicLevel } from './partywatch.js';
import { pushTo } from './webpush.js';
import { PAGE_LIMITS as L, cleanAreas, priceShort, isEnqStatus, OWNER_OK_TEXT, mobile10 } from '../src/shared/publicPageRules.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|embedly|curl|wget|python|node-fetch/i;
const LIVE = ['active', 'under_negotiation'];
const PHONE_RE = /^[6-9]\d{9}$/;
const DAY = 86400_000;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });

// ───────────────────────────── what may be on a page ─────────────────────────────
/** a home that may be on a public page at all: verified, live, not expired / held / erased, and its listing broker still verified */
export function pageLive(p?: Property | null): p is Property {
  if (!p || p.verificationStatus !== 'VERIFIED' || !LIVE.includes(p.listingStatus) || p.expiredAt || p.heldAt || p.purgedAt) return false;
  const lb = db.byId('users', p.listingBrokerId) as UserProfile | undefined;
  return !!lb && lb.role === 'BROKER' && lb.verificationStatus === 'VERIFIED';
}
/** may this broker show this home? his own live listing, or another broker's live listing its listing broker opened to pages */
export function canShow(u: Pick<UserProfile, 'id'>, p?: Property | null): 'OWN' | 'NETWORK' | null {
  if (!pageLive(p)) return null;
  if (p.listingBrokerId === u.id) return 'OWN';
  return p.publicShareOk ? 'NETWORK' : null;
}
/** the homes on his page right now, in his order (a home that was sold, held, or closed to pages drops out by itself) */
export function shownHomes(u: UserProfile): Property[] {
  const out: Property[] = [];
  for (const id of u.publicCard?.homes || []) {
    const p = db.byId('properties', id) as Property | undefined;
    const k = canShow(u, p);
    if (!k || (k === 'OWN' && !u.publicCard?.ownerOkAt)) continue;
    if (!out.some(x => x.id === p!.id)) out.push(p!);
    if (out.length >= L.homes) break;
  }
  return out;
}
/** the listing's own photos and the vault's PUBLIC photos — never a private vault photo, never a document */
export function pagePhotos(p: Property): string[] {
  const out: string[] = [];
  const add = (x: unknown) => { if (okMediaUrl(x) && !out.includes(x)) out.push(x); };
  (p.images || []).forEach(add);
  (st().propertyMediaAssets || []).filter((a: any) => a.propertyId === p.id && a.status === 'ACTIVE' && a.sensitivity === 'PUBLIC' && a.category === 'PHOTOGRAPH').forEach((a: any) => add(a.fileUrl));
  return out.slice(0, L.photos);
}
const dealHi = (t: string) => (t === 'Sale' ? 'बिक्री' : t === 'Rent' ? 'किराया' : 'लीज़');
const dealEn = (t: string) => (t === 'Sale' ? 'For sale' : t === 'Rent' ? 'For rent' : 'For lease');
const areaOf = (p: Property) => [p.builtUpAreaSqFt ? `${Math.round(p.builtUpAreaSqFt).toLocaleString('en-IN')} sq ft built-up` : '', p.plotAreaSqFt ? `${Math.round(p.plotAreaSqFt).toLocaleString('en-IN')} sq ft plot` : ''].filter(Boolean).join(' · ');

// ───────────────────────────── the enquiry form's guards ─────────────────────────────
const formSig = (uid: string, t: number) => crypto.createHmac('sha256', secret()).update(`pgform|${uid}|${t}`).digest('base64url').slice(0, 24);
export const formToken = (uid: string, now = Date.now()) => `${now}.${formSig(uid, now)}`;
/** OK · BAD (forged) · FAST (sent back in under 2.5 s — a bot) · OLD (the page was open for more than 12 hours) */
/** a form that brought an enquiry in cannot bring another (per server copy; the per-mobile and per-page limits hold everywhere) */
const usedForms = new Map<string, number>();
setInterval(() => { const n = Date.now(); for (const [k, t] of usedForms) if (n - t > 13 * 3600_000) usedForms.delete(k); }, 10 * 60_000).unref();
export function checkFormToken(uid: string, tok: unknown, now = Date.now()): 'OK' | 'BAD' | 'FAST' | 'OLD' {
  const [ts, sig] = String(tok || '').split('.');
  const t = Number(ts);
  if (!Number.isFinite(t) || !sig || !safeEqual(sig, formSig(uid, t))) return 'BAD';
  if (usedForms.has(sig)) return 'OLD';
  if (now - t < 2500) return 'FAST';
  if (now - t > 12 * 3600_000) return 'OLD';
  return 'OK';
}

// ───────────────────────────── the page ─────────────────────────────
const CSS = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Devanagari",sans-serif;background:#f4f3ef;color:#16181d}
.w{max-width:760px;margin:0 auto;padding:12px 12px 28px}.hero{background:#14213d;color:#fff;border-radius:18px;padding:18px}.hrow{display:flex;gap:12px;align-items:center}
.logo{width:58px;height:58px;border-radius:14px;background:#fff;object-fit:contain;flex:none}h1{margin:0;font-size:21px;line-height:1.25}.co{margin:2px 0 0;opacity:.85;font-size:13px}
.sub{margin:5px 0 0;font-size:12px;color:#86efac;font-weight:700}.hl{margin:12px 0 0;font-size:14px;line-height:1.5;opacity:.93}.areas{margin-top:10px;display:flex;flex-wrap:wrap;gap:6px}
.areas span{background:rgba(255,255,255,.13);border-radius:99px;padding:4px 10px;font-size:12px}.cta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.cta .g{grid-column:1/-1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:46px;padding:10px 16px;border-radius:12px;border:0;font-size:15px;font-weight:700;text-decoration:none;cursor:pointer;font-family:inherit}
.g{background:#1fa855;color:#fff}.wt{background:#fff;color:#14213d}.l{background:#eef1f7;color:#14213d}.wide{width:100%}button:disabled{opacity:.6}
h2{font-size:17px;margin:22px 4px 8px}h2 small{font-weight:600;color:#666;font-size:13px}.chips{display:flex;gap:6px;margin:0 4px 10px;flex-wrap:wrap}
.chips a{display:inline-flex;align-items:center;min-height:38px;padding:0 14px;border-radius:99px;border:1px solid #cbd5e1;background:#fff;color:#334155;font-size:13px;font-weight:700;text-decoration:none}.chips a.on{background:#14213d;color:#fff;border-color:#14213d}
.grid{display:grid;gap:12px}@media(min-width:640px){.grid{grid-template-columns:1fr 1fr}}.home{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.ph{position:relative;background:#e5e7eb;aspect-ratio:16/10;overflow:hidden}.ph canvas{display:block;width:100%;height:100%;-webkit-touch-callout:none;user-select:none}
.ph .np{position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#64748b;font-size:13px;font-weight:600;text-align:center;padding:10px}.ph.nophoto .np{display:flex}.ph.nophoto canvas{visibility:hidden}
.badge{position:absolute;left:10px;top:10px;background:#14213d;color:#fff;border-radius:99px;padding:4px 10px;font-size:12px;font-weight:700}.bd{padding:12px 14px 14px}
.price{font-size:21px;font-weight:800}.price small{font-size:13px;font-weight:600;color:#555}.t{font-weight:700;font-size:15px;margin-top:2px;line-height:1.35}.s{color:#555;font-size:13px;margin-top:3px;line-height:1.45}
.tag{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:99px;padding:3px 9px;font-size:11px;margin:6px 4px 0 0}.neg{display:inline-block;background:#fef3c7;color:#92400e;border-radius:8px;padding:3px 8px;font-size:12px;font-weight:700;margin-top:6px}
details{margin-top:8px}summary{cursor:pointer;font-size:13px;font-weight:700;color:#14213d;padding:8px 0;min-height:36px}.gal{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}
.gal .ph{flex:0 0 86%;border-radius:12px;scroll-snap-align:start}.vid{position:relative;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;margin-top:8px}.vid iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.desc{font-size:13px;line-height:1.55;color:#333;white-space:pre-wrap;margin:8px 0 0}.ask{margin-top:10px}.card{background:#fff;border-radius:16px;padding:16px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.note{border-radius:12px;padding:12px;font-size:14px;font-weight:600;margin-bottom:10px;line-height:1.5}.ok{background:#dcfce7;color:#14532d}.err{background:#fee2e2;color:#7f1d1d}
label{display:block;font-size:13px;font-weight:700;margin-top:12px}input,select,textarea{display:block;width:100%;margin-top:5px;min-height:46px;border:1px solid #cbd5e1;border-radius:11px;padding:11px 12px;font-size:16px;font-family:inherit;background:#fff;color:#111}
textarea{min-height:84px}.ck{display:flex;gap:10px;align-items:flex-start;font-weight:500;font-size:13px;line-height:1.5}.ck input{width:22px;min-height:22px;height:22px;margin:1px 0 0;flex:none}
.hp{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden}.small{font-size:12px;color:#5b6170;line-height:1.55;margin:12px 4px 0}.lock{font-size:12px;color:#475569;margin-top:8px;line-height:1.45}
.row{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:8px 0;border-bottom:1px solid #eef0f3}.row:last-child{border:0}.empty{color:#555;font-size:14px;line-height:1.5}`;

/**
 * Photos are drawn on a canvas with the page broker's name across them (a saved or forwarded photo still shows whose page it came
 * from), the first photo of a home only when it comes near the screen, the rest when "more photos" is opened. 'self' script only.
 */
const PAGE_JS = `(function(){
function draw(cv){if(cv.getAttribute('data-done'))return;cv.setAttribute('data-done','1');var src=cv.getAttribute('data-src'),wm=cv.getAttribute('data-wm')||'GENZ',box=cv.parentNode;if(!src){if(box)box.className+=' nophoto';return}
var im=new Image();im.referrerPolicy='no-referrer';im.decoding='async';
im.onload=function(){var w=cv.width,h=cv.height,g=cv.getContext('2d');if(!g)return;var iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height,r=Math.max(w/iw,h/ih),dw=iw*r,dh=ih*r;g.drawImage(im,(w-dw)/2,(h-dh)/2,dw,dh);
var fs=Math.max(16,Math.round(w/24));g.save();g.translate(w/2,h/2);g.rotate(-0.42);g.font='700 '+fs+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';var sx=g.measureText(wm).width+fs*2.6,sy=fs*3.4,row=0;
for(var y=-h;y<=h;y+=sy,row++){for(var x=-w*1.2+(row%2?sx/2:0);x<=w*1.2;x+=sx){g.globalAlpha=0.2;g.lineWidth=Math.max(2,fs/7);g.strokeStyle='#000';g.strokeText(wm,x,y);g.globalAlpha=0.36;g.fillStyle='#fff';g.fillText(wm,x,y)}}g.restore();
var bf=Math.max(12,Math.round(w/40)),t='GENZ \\u2714 '+wm.replace(/ · GENZ$/,''),pad=Math.round(bf*0.7);g.font='700 '+bf+'px system-ui,sans-serif';g.textAlign='left';g.textBaseline='middle';var tw=g.measureText(t).width;
g.globalAlpha=0.8;g.fillStyle='#0f172a';g.fillRect(w-tw-pad*3,h-bf*2.3,tw+pad*2,bf*1.8);g.globalAlpha=1;g.fillStyle='#fff';g.fillText(t,w-tw-pad*2,h-bf*1.4)};
im.onerror=function(){if(box)box.className+=' nophoto'};im.src=src}
var all=document.querySelectorAll('canvas[data-src]'),first=[];for(var i=0;i<all.length;i++){if(!all[i].closest('details'))first.push(all[i])}
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){io.unobserve(e.target);draw(e.target)}})},{rootMargin:'300px'});first.forEach(function(c){io.observe(c)})}else{first.forEach(draw)}
var ds=document.querySelectorAll('details');for(var j=0;j<ds.length;j++){(function(d){d.addEventListener('toggle',function(){if(d.open){var cs=d.querySelectorAll('canvas[data-src]');for(var k=0;k<cs.length;k++)draw(cs[k])}})})(ds[j])}
document.addEventListener('contextmenu',function(e){if(e.target&&e.target.tagName==='CANVAS')e.preventDefault()});
var f=document.getElementById('enq-form');if(f){f.addEventListener('submit',function(){var b=f.querySelector('button[type=submit]');if(b){setTimeout(function(){b.disabled=true;b.textContent='\\u092d\\u0947\\u091c \\u0930\\u0939\\u0947 \\u0939\\u0948\\u0902\\u2026 / Sending\\u2026'},0)}})}
})();`;

const gonePage = () => `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Page not available</title><style>${CSS}</style></head><body><div class="w"><div class="card"><p class="empty">यह पेज अभी उपलब्ध नहीं है।<br>This page is not available.</p></div></div></body></html>`;

interface Draft { name?: string; phone?: string; message?: string; home?: string }
const photoBox = (src: string | undefined, wm: string, label: string, w = 800, h = 500) =>
  `<div class="ph${src ? '' : ' nophoto'}"><canvas width="${w}" height="${h}"${src ? ` data-src="${esc(src)}"` : ''} data-wm="${esc(wm)}" aria-label="${esc(label)}"></canvas><span class="np">📷 फ़ोटो जल्द / Photo coming soon</span>`;

export function renderBrokerPage(req: Request, res: Response, u: UserProfile, o: { msg?: string; draft?: Draft; status?: number } = {}) {
  const b = brandOf(u); const card = u.publicCard!; const code = u.referralCode!;
  const all = shownHomes(u);
  const wantDeal = String(req.query.deal || '');
  const deal = wantDeal === 'Sale' || wantDeal === 'Rent' ? wantDeal : '';
  const homes = deal ? all.filter(p => (deal === 'Sale' ? p.transactionType === 'Sale' : p.transactionType !== 'Sale')) : all;
  const both = all.some(p => p.transactionType === 'Sale') && all.some(p => p.transactionType !== 'Sale');
  const d = o.draft || {};
  const pick = String(d.home ?? req.query.home ?? '');
  const sent = req.query.sent === '1' && !o.msg;
  const wm = `${b.displayName} · GENZ`;
  const phone = digits(u.phone);
  const city = u.city || '';
  const firstPhoto = all.map(p => pagePhotos(p)[0]).find(x => x && /^https:\/\//.test(x));
  const title = `${b.displayName} — GENZ Verified Broker${city ? ` · ${city}` : ''}`;
  const desc = card.headline || (all.length ? `${all.length} homes for sale & rent${city ? ` in ${city}` : ''} — verified listings on GENZ Broker Network` : `Verified broker${city ? ` in ${city}` : ''} on GENZ Broker Network`);
  const since = new Date(u.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const wa = (text: string) => `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;

  const homeCard = (p: Property) => {
    const ph = pagePhotos(p);
    const rent = p.transactionType !== 'Sale';
    const area = areaOf(p);
    const vid = youtubeId(String((p as any).videoUrl || ''));
    const more = ph.slice(1);
    const descText = stripPhones(p.description || '').slice(0, 400);
    return `<article class="home" id="h-${esc(p.id)}">${photoBox(ph[0], wm, p.title)}<span class="badge">${esc(dealHi(p.transactionType))} · ${esc(dealEn(p.transactionType))}</span></div>
<div class="bd"><div class="price">${esc(priceShort(p.askingPrice))}${rent ? ' <small>/ माह · month</small>' : ''}</div><div class="t">${esc(p.title)}</div>
<div class="s">${esc(p.propertyType)} · ${esc(p.locality)}, ${esc(p.city)}${area ? `<br>${esc(area)}` : ''}</div>
${(p.tags || []).slice(0, 6).map(t => `<span class="tag">${esc(t)}</span>`).join('')}${p.listingStatus === 'under_negotiation' ? '<div><span class="neg">बातचीत जारी — फिर भी पूछ सकते हैं / Under negotiation — you can still ask</span></div>' : ''}
${more.length || descText || vid ? `<details><summary>${more.length ? `और ${more.length} फ़ोटो · ` : ''}ब्यौरा / ${more.length ? `${more.length} more photo(s) & ` : ''}details</summary>
${more.length ? `<div class="gal">${more.map((x, i) => `${photoBox(x, wm, `${p.title} — photo ${i + 2}`, 640, 400)}</div>`).join('')}</div>` : ''}
${vid ? `<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${esc(vid)}" title="video" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : ''}
${descText ? `<p class="desc">${esc(descText)}</p>` : ''}</details>` : ''}
<p class="lock">🔒 पूरा पता और मालिक की जानकारी वेरिफ़ाइड विज़िट पर। / Exact address and owner details on a verified visit.</p>
<a class="btn l wide ask" href="?home=${encodeURIComponent(p.id)}#enquire">इस घर के बारे में पूछें / Ask about this home</a></div></article>`;
  };

  const chips = both ? `<div class="chips">${[['', 'सब / All'], ['Sale', 'बिक्री / Sale'], ['Rent', 'किराया / Rent']].map(([k, l]) => `<a href="${k ? `?deal=${k}` : '?'}#homes" class="${deal === k ? 'on' : ''}">${l}</a>`).join('')}</div>` : '';
  const homesHtml = all.length ? `<h2 id="homes">मेरे पास ये घर हैं / Homes I can show you <small>(${homes.length})</small></h2>${chips}<div class="grid">${homes.map(homeCard).join('')}</div>` : '';
  const options = all.map(p => `<option value="${esc(p.id)}"${pick === p.id ? ' selected' : ''}>${esc(p.title)} · ${esc(priceShort(p.askingPrice))}</option>`).join('');

  const form = `<section class="card" id="enquire"><h2 style="margin:0 0 4px">पूछताछ भेजें / Send an enquiry</h2>
${sent ? '<div class="note ok">✔ धन्यवाद! आपकी पूछताछ पहुँच गई — ब्रोकर जल्द कॉल / WhatsApp करेंगे।<br>Thank you! Your enquiry has reached the broker — expect a call or WhatsApp soon.</div>' : ''}
${o.msg ? `<div class="note err" role="alert">${o.msg}</div>` : ''}
${sent ? '<details><summary>एक और पूछताछ भेजें / Send another enquiry</summary>' : ''}<form method="post" action="/c/${esc(code)}/enquiry" id="enq-form" novalidate><input type="hidden" name="t" value="${esc(formToken(u.id))}">
<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<label>आपका नाम / Your name<input type="text" name="name" required minlength="2" maxlength="80" autocomplete="name" value="${esc(d.name || '')}"></label>
<label>मोबाइल नंबर / Mobile number<input type="tel" name="phone" required inputmode="tel" maxlength="16" autocomplete="tel-national" placeholder="98XXXXXXXX" value="${esc(d.phone || '')}"></label>
${all.length ? `<label>किस घर के बारे में? / Which home?<select name="home"><option value="">कोई भी / Any home</option>${options}</select></label>` : ''}
<label>संदेश (वैकल्पिक) / Message (optional)<textarea name="message" rows="3" maxlength="${L.message}" placeholder="जैसे: 2BHK, 40 लाख तक, शंकर नगर के पास / e.g. 2BHK up to 40 lakh near Shankar Nagar">${esc(d.message || '')}</textarea></label>
<label class="ck"><input type="checkbox" name="consent" value="1" required><span>मैं सहमत हूँ कि ${esc(b.displayName)} मुझसे इस बारे में कॉल या WhatsApp करें। मेरा नाम और नंबर सिर्फ़ इन्हीं के पास जाएगा।<br>I agree that ${esc(b.displayName)} may call or WhatsApp me about this. My name and number go only to this broker.</span></label>
<button class="btn g wide" type="submit" style="margin-top:14px">पूछताछ भेजें / Send enquiry</button></form>${sent ? '</details>' : ''}
<p class="small" style="margin:10px 0 0">आपकी पूछताछ ${L.keepDays} दिन तक रखी जाती है, फिर अपने आप मिट जाती है। / Your enquiry is kept for up to ${L.keepDays} days, then erased.</p></section>`;

  const trust = `<div class="card">${b.reraId ? `<div class="row"><span>RERA</span><b>${esc(b.reraId)}</b></div>` : ''}<div class="row"><span>GENZ सदस्य / Member since</span><b>${esc(since)}</b></div><div class="row"><span>KYC</span><b>✔ GENZ ने जाँचा / checked by GENZ</b></div>${reputationHtml(u)}</div>`;

  res.status(o.status || 200).send(`<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(title)}</title><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${firstPhoto ? `<meta property="og:image" content="${esc(firstPhoto)}">` : ''}<link rel="icon" type="image/png" href="/icon-192.png"><style>${CSS}</style></head>
<body><div class="w"><header class="hero"><div class="hrow">${b.logo ? `<img class="logo" src="${esc(b.logo)}" alt="">` : ''}<div><h1>${esc(b.displayName)}</h1>${b.company ? `<p class="co">${esc(b.company)}</p>` : ''}<p class="sub">✔ GENZ Verified Broker${city ? ` · ${esc(city)}` : ''}</p></div></div>
${card.headline || b.tagline ? `<p class="hl">${esc(card.headline || b.tagline)}</p>` : ''}${(card.areas || []).length ? `<div class="areas">${(card.areas || []).map(a => `<span>📍 ${esc(a)}</span>`).join('')}</div>` : ''}
<div class="cta"><a class="btn g" href="#enquire">✉ पूछताछ / Enquire</a>${card.showPhone && PHONE_RE.test(phone) ? `<a class="btn wt" href="tel:+91${phone}">📞 कॉल / Call</a><a class="btn wt" href="${esc(wa(`Namaste ${b.displayName}, I saw your GENZ page.`))}" rel="noopener">WhatsApp</a>` : ''}</div></header>
${homesHtml || '<div class="card"><p class="empty">नए घर जल्द यहाँ दिखेंगे। अपनी ज़रूरत नीचे लिखें — मैं आपके लिए ढूँढूँगा।<br>New homes will show here soon. Write what you need below and I will find it for you.</p></div>'}
${form}${trust}
${city ? `<div class="card"><a href="/report/${encodeURIComponent(city)}?ref=${esc(encodeURIComponent(code))}" style="font-weight:700;text-decoration:none">📊 ${esc(city)} प्रॉपर्टी रिपोर्ट — इलाक़े के रेट और माँग / ${esc(city)} property report — locality rates &amp; buyer demand →</a></div>` : ''}
<p class="small">GENZ एक न्यूट्रल प्लेटफ़ॉर्म है: कीमत और शर्तें आपके, मालिक और ब्रोकर के बीच तय होती हैं, और GENZ आपका कोई पैसा नहीं रखता। कोई भी रक़म देने से पहले कागज़ और RERA ज़रूर जाँचें।<br>GENZ is a neutral platform: price and terms are between you, the owner and the broker, and GENZ never holds your money. Check the papers and RERA before you pay anything.</p>
${joinFooter(u, city)}</div><script src="/c/page.js" defer></script></body></html>`);
}

/** /c — the broker's page, its script and its enquiry form; anything else falls through to the plain visiting card */
export function createBrokerPagePublicRouter() {
  const r = Router();
  const form = express.urlencoded({ extended: false, limit: '12kb' });
  const headers = (res: Response) => { res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }); };
  const brokerOf = (code: string) => { const u = findByCode(code); return u && u.role === 'BROKER' && u.publicCard?.enabled ? u : undefined; };

  r.get('/page.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.send(PAGE_JS); });

  r.get('/:code', (req: Request, res: Response, next: NextFunction) => {
    const u = brokerOf(req.params.code); if (!u) return next();
    if (hit(`page-view:${req.ip}`, 120, 60_000)) { res.setHeader('Retry-After', '60'); return res.status(429).send(gonePage()); }
    headers(res);
    // a view counts once per browser per 12 hours (no personal data: a cookie that only says "seen")
    const ck = `gzpv_${crypto.createHash('sha1').update(u.id).digest('hex').slice(0, 10)}`;
    if (!BOT.test(String(req.headers['user-agent'] || '')) && !parseCookies(req.headers.cookie)[ck]) {
      u.publicCard!.views = (u.publicCard!.views || 0) + 1; db.save();
      const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
      res.append('Set-Cookie', `${ck}=1; Path=/c; Max-Age=43200; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
    }
    renderBrokerPage(req, res, u);
  });

  r.post('/:code/enquiry', form, (req: Request, res: Response) => {
    headers(res);
    const u = brokerOf(req.params.code); if (!u) return res.status(404).send(gonePage());
    const origin = req.headers.origin;
    if (origin && origin !== 'null') { try { if (new URL(String(origin)).host !== req.headers.host) return res.status(403).send(gonePage()); } catch { return res.status(403).send(gonePage()); } }
    const draft: Draft = { name: String(req.body?.name || '').trim().slice(0, 80), phone: String(req.body?.phone || '').trim().slice(0, 20), message: String(req.body?.message || '').trim().slice(0, L.message), home: String(req.body?.home || '').slice(0, 40) };
    const again = (msg: string, status = 400) => renderBrokerPage(req, res, u, { msg, draft, status });
    const done = () => res.redirect(303, `/c/${encodeURIComponent(u.referralCode!)}?sent=1#enquire`);
    if (hit(`page-enq-ip:${req.ip}`, L.perIpHour, 3600_000)) return again('इस कनेक्शन से बहुत सारी पूछताछ आ चुकी — एक घंटे बाद फिर भेजें।<br>Too many enquiries from this connection — please try again in an hour.', 429);
    // a bot: the hidden field is filled, or the form came back faster than a person can type → it looks sent, nothing is kept
    if (String(req.body?.website || '').trim()) return done();
    const tk = checkFormToken(u.id, req.body?.t);
    if (tk === 'FAST') return done();
    if (tk !== 'OK') return again('यह पेज बहुत देर से खुला था — एक बार फिर भेजें।<br>This page was open for too long — please send it once more.');
    if (draft.name!.length < 2) return again('अपना नाम लिखें। / Please write your name.');
    const ph = mobile10(draft.phone);
    if (!ph) return again('सही 10 अंकों का मोबाइल नंबर लिखें। / Please enter a valid 10-digit mobile number.');
    if (req.body?.consent !== '1') return again('“मैं सहमत हूँ” पर टिक करें ताकि ब्रोकर आपसे बात कर सकें। / Tick “I agree” so that the broker may contact you.');
    const home = draft.home && shownHomes(u).some(p => p.id === draft.home) ? draft.home : undefined;
    if (hit(`page-enq-ph:${u.id}:${ph}`, L.perPhoneDay, DAY)) return again('आज आप इस पेज पर पूछताछ भेज चुके हैं — ब्रोकर आपसे संपर्क करेंगे।<br>You have already sent enquiries on this page today — the broker will contact you.', 429);
    if (hit(`page-enq-page:${u.id}`, L.perPageDay, DAY)) return again('आज इस पेज पर बहुत पूछताछ आ चुकी — कल फिर भेजें।<br>This page has had too many enquiries today — please try again tomorrow.', 429);
    const s = st();
    // the same mobile about the same home in the last day: one enquiry, the newer message added to it
    const dup = s.pageEnquiries.find(e => e.brokerId === u.id && e.phone === ph && (e.propertyId || '') === (home || '') && Date.now() - Date.parse(e.createdAt) < DAY);
    // the message goes to the page broker only (who has the number anyway) — kept as the customer wrote it
    const msg = draft.message ? draft.message.replace(/[ \t]+\n/g, '\n').slice(0, L.message) || undefined : undefined;
    if (dup) {
      if (msg && msg !== dup.message) dup.message = dup.message ? `${dup.message}\n— ${msg}`.slice(0, L.message * 2) : msg;
      dup.updatedAt = nowIso(); if (dup.status === 'CLOSED') dup.status = 'NEW';
      usedForms.set(String(req.body?.t || '').split('.')[1] || '', Date.now());
      db.save(); return done();
    }
    const lvl = publicLevel(ph);
    const e: PageEnquiry = {
      id: `PGE-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`, brokerId: u.id, propertyId: home, name: draft.name!, phone: ph, message: msg,
      consentAt: nowIso(), status: 'NEW', createdAt: nowIso(), ...(lvl !== 'NONE' ? { watch: lvl } : {}),
    };
    s.pageEnquiries.unshift(e);
    usedForms.set(String(req.body?.t || '').split('.')[1] || '', Date.now());
    db.save();
    db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', e.id, 'PAGE_ENQUIRY', `Enquiry from the public page of ${u.id}${home ? ` about ${home}` : ''} (consent recorded)`);
    const p = home ? db.byId('properties', home) as Property | undefined : undefined;
    void pushTo(u.id, { kind: 'deals', title: 'New enquiry from your public page', body: `${draft.name!.split(' ')[0]} ${p ? `asked about ${p.title}` : 'sent an enquiry'}. Open My Public Page.`, url: '/?tab=mypage', tag: e.id });
    done();
  });
  return r;
}

// ───────────────────────────── the broker's screen ─────────────────────────────
const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  headline: z.string().trim().max(L.headline).optional(),
  areas: z.union([z.array(z.string().max(80)).max(20), z.string().max(400)]).optional(),
});
const homesSchema = z.object({ ids: z.array(z.string().min(1).max(40)).max(60), ownerOk: z.boolean().optional() });

const thumb = (p: Property) => ({
  id: p.id, title: p.title, locality: p.locality, city: p.city, type: p.propertyType, deal: p.transactionType, price: p.askingPrice,
  photo: pagePhotos(p)[0] || '', negotiating: p.listingStatus === 'under_negotiation',
});

export function pageOverview(u: UserProfile) {
  const s = st(); const card = u.publicCard;
  const code = u.verificationStatus === 'VERIFIED' ? ensureReferralCode(u) : '';
  const shown = shownHomes(u); const chosen = new Set(shown.map(p => p.id));
  // how many OTHER brokers' pages show each of my listings (one pass over the users)
  const showing = new Map<string, number>();
  for (const x of s.users) if (x.id !== u.id && x.role === 'BROKER' && x.publicCard?.enabled) for (const id of x.publicCard.homes || []) showing.set(id, (showing.get(id) || 0) + 1);
  const own = s.properties.filter(p => p.listingBrokerId === u.id && pageLive(p))
    .sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)) || b.updatedAt.localeCompare(a.updatedAt))
    .map(p => ({ ...thumb(p), onPage: chosen.has(p.id), othersCanShow: !!p.publicShareOk, othersShowing: p.publicShareOk ? showing.get(p.id) || 0 : 0 }));
  const myCity = String(u.city || '').trim().toLowerCase();
  const network = s.properties.filter(p => p.listingBrokerId !== u.id && p.publicShareOk && pageLive(p))
    .sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)) || Number(String(b.city).toLowerCase() === myCity) - Number(String(a.city).toLowerCase() === myCity) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 120)
    .map(p => { const lb = db.byId('users', p.listingBrokerId) as UserProfile | undefined; return { ...thumb(p), onPage: chosen.has(p.id), listingBroker: lb ? { name: lb.name, company: lb.companyName || '' } : null }; });
  const enquiries = s.pageEnquiries.filter(e => e.brokerId === u.id).sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)).slice(0, 200).map(e => {
    const p = e.propertyId ? db.byId('properties', e.propertyId) as Property | undefined : undefined;
    const lb = p && p.listingBrokerId !== u.id ? db.byId('users', p.listingBrokerId) as UserProfile | undefined : undefined;
    return { ...e, home: e.propertyId ? { id: e.propertyId, title: p?.title || e.propertyId, deal: p?.transactionType || '', live: pageLive(p), own: p ? p.listingBrokerId === u.id : false, listingBroker: lb ? lb.name : '' } : null };
  });
  return {
    card: { enabled: !!card?.enabled, showPhone: !!card?.showPhone, headline: card?.headline || '', areas: card?.areas || [], views: card?.views || 0, path: code ? `/c/${code}` : '', ownerOk: !!card?.ownerOkAt, verified: u.verificationStatus === 'VERIFIED' },
    homes: { chosen: shown.map(p => p.id), max: L.homes },
    own, network, enquiries,
    counts: { new: enquiries.filter(e => e.status === 'NEW').length, homes: shown.length },
    ownerOkText: OWNER_OK_TEXT, limits: L,
  };
}

export function createPublicPageRouter() {
  const r = Router();
  r.use(needs('publicpage:use'));
  const self = () => db.byId('users', (ctx().user as UserProfile).id) as UserProfile;
  const audit = (u: UserProfile, entity: 'SYSTEM' | 'PROPERTY' | 'LEAD', id: string, action: string, text: string) => db.appendAuditEvent(u.id, u.role, entity as any, id, action, text);
  const ensureCard = (u: UserProfile) => { ensureReferralCode(u); return (u.publicCard ||= { enabled: false, showPhone: false, views: 0 }); };

  r.get('/', (_req, res) => res.json({ success: true, ...pageOverview(self()) }));
  r.get('/badge', (_req, res) => { const u = self(); res.json({ success: true, count: st().pageEnquiries.filter(e => e.brokerId === u.id && e.status === 'NEW').length }); });

  r.put('/settings', (req: Request, res: Response) => {
    const u = self();
    if (u.verificationStatus !== 'VERIFIED') return bad(res, 'Your account must be verified first', 403);
    const p = settingsSchema.safeParse(req.body || {});
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
    const card = ensureCard(u); const was = card.enabled;
    if (p.data.enabled !== undefined) card.enabled = p.data.enabled;
    if (p.data.showPhone !== undefined) card.showPhone = p.data.showPhone;
    if (p.data.headline !== undefined) card.headline = stripPhones(p.data.headline).slice(0, L.headline) || undefined;
    if (p.data.areas !== undefined) card.areas = cleanAreas(p.data.areas);
    db.save();
    if (was !== card.enabled) audit(u, 'SYSTEM', u.id, card.enabled ? 'PUBLIC_CARD_ENABLED' : 'PUBLIC_CARD_DISABLED', `Public page ${card.enabled ? 'on' : 'off'}${card.showPhone ? ' (phone shown)' : ''}`);
    res.json({ success: true, ...pageOverview(u) });
  });

  r.put('/homes', (req: Request, res: Response) => {
    const u = self();
    if (u.verificationStatus !== 'VERIFIED') return bad(res, 'Your account must be verified first', 403);
    const p = homesSchema.safeParse(req.body || {});
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid');
    const ids = [...new Set(p.data.ids)];
    if (ids.length > L.homes) return bad(res, `A page can show ${L.homes} homes`, 400, { code: 'TOO_MANY_HOMES' });
    let own = 0, net = 0;
    for (const id of ids) {
      const k = canShow(u, db.byId('properties', id) as Property | undefined);
      if (!k) return bad(res, `${id} cannot be shown on your page (not live, or its listing broker has not opened it to public pages)`, 400, { code: 'HOME_NOT_SHOWABLE', id });
      if (k === 'OWN') own++; else net++;
    }
    const card = ensureCard(u);
    if (own && !card.ownerOkAt) {
      if (p.data.ownerOk !== true) return bad(res, 'Confirm that the owners agreed before your own listings go on a public page', 400, { code: 'OWNER_OK_NEEDED', text: OWNER_OK_TEXT });
      card.ownerOkAt = nowIso();
      audit(u, 'SYSTEM', u.id, 'PUBLIC_PAGE_OWNER_OK', `Confirmed: "${OWNER_OK_TEXT.en}"`);
    }
    card.homes = ids;
    db.save();
    audit(u, 'SYSTEM', u.id, 'PUBLIC_PAGE_HOMES', `Public page shows ${ids.length} home(s): ${own} own, ${net} of other brokers`);
    res.json({ success: true, ...pageOverview(u) });
  });

  /** the listing broker: may other GENZ brokers show this listing on their public pages? */
  r.post('/others/:id', (req: Request, res: Response) => {
    const u = self();
    const p = db.byId('properties', req.params.id) as Property | undefined;
    if (!p || p.listingBrokerId !== u.id) return bad(res, 'Only the listing broker can decide this', 404);
    const on = req.body?.on === true;
    const card = ensureCard(u);
    if (on && !card.ownerOkAt) {
      if (req.body?.ownerOk !== true) return bad(res, 'Confirm that the owners agreed before other brokers show your listing', 400, { code: 'OWNER_OK_NEEDED', text: OWNER_OK_TEXT });
      card.ownerOkAt = nowIso();
      audit(u, 'SYSTEM', u.id, 'PUBLIC_PAGE_OWNER_OK', `Confirmed: "${OWNER_OK_TEXT.en}"`);
    }
    if (!!p.publicShareOk === on) return res.json({ success: true, ...pageOverview(u) });
    p.publicShareOk = on; p.publicShareAt = nowIso();
    let removed = 0;
    if (!on) for (const x of st().users) if (x.id !== u.id && x.publicCard?.homes?.includes(p.id)) { x.publicCard.homes = x.publicCard.homes.filter(id => id !== p.id); removed++; }
    db.save();
    audit(u, 'PROPERTY', p.id, on ? 'PUBLIC_SHARE_ALLOWED' : 'PUBLIC_SHARE_STOPPED', on ? `Other GENZ brokers may show ${p.id} on their public pages` : `${p.id} closed to other brokers' public pages${removed ? ` (taken off ${removed} page(s))` : ''}`);
    res.json({ success: true, ...pageOverview(u) });
  });

  r.post('/enquiries/:id/status', (req: Request, res: Response) => {
    const u = self();
    const e = st().pageEnquiries.find(x => x.id === req.params.id && x.brokerId === u.id);
    if (!e) return bad(res, 'Enquiry not found', 404);
    if (!isEnqStatus(req.body?.status)) return bad(res, 'status must be NEW, CONTACTED, CLOSED or SPAM');
    e.status = req.body.status; e.updatedAt = nowIso(); db.save();
    res.json({ success: true, ...pageOverview(u) });
  });

  r.delete('/enquiries/:id', (req: Request, res: Response) => {
    const u = self(); const s = st();
    const i = s.pageEnquiries.findIndex(x => x.id === req.params.id && x.brokerId === u.id);
    if (i < 0) return bad(res, 'Enquiry not found', 404);
    const [e] = s.pageEnquiries.splice(i, 1); db.save();
    audit(u, 'LEAD', e.id, 'PAGE_ENQUIRY_DELETED', 'Public page enquiry deleted by the broker');
    res.json({ success: true, ...pageOverview(u) });
  });
  return r;
}

/** home tiles: new enquiries from my page, and the page's short state */
export function pageCounts(uid: string) {
  return { pageNew: st().pageEnquiries.filter(e => e.brokerId === uid && e.status === 'NEW').length };
}
export function pageSummary(u: UserProfile) {
  return { on: !!u.publicCard?.enabled, homes: u.publicCard?.enabled ? shownHomes(u).length : 0, views: u.publicCard?.views || 0 };
}
/** how many page enquiries were about this home (a number only — for its owner's "how my listing is doing") */
export const pageEnquiryCount = (propertyId: string) => st().pageEnquiries.filter(e => e.propertyId === propertyId && e.status !== 'SPAM').length;

/** hourly: an enquiry is erased PAGE_LIMITS.keepDays after it came in */
export function sweepPageEnquiries(now = Date.now()) {
  const s = st(); const before = s.pageEnquiries.length;
  s.pageEnquiries = s.pageEnquiries.filter(e => Date.parse(e.createdAt) + L.keepDays * DAY > now);
  const n = before - s.pageEnquiries.length;
  if (n) db.save();
  return n;
}

/** demo only (SEED_DEMO_DATA + SEED_DEMO_BULK): the first demo broker's page is on, with his homes, two homes of a colleague and a few enquiries */
export function seedDemoPage() {
  if ((process.env.SEED_DEMO_DATA || '').toLowerCase() !== 'true' || (process.env.SEED_DEMO_BULK || '').toLowerCase() !== 'true') return;
  const s = st();
  const u = db.byId('users', 'USR-BRK-001') as UserProfile | undefined;
  if (!u || u.verificationStatus !== 'VERIFIED' || s.pageEnquiries.length || s.users.some(x => (x.publicCard?.homes || []).length)) return;
  const own = s.properties.filter(p => p.listingBrokerId === u.id && pageLive(p)).slice(0, 5);
  const theirs = s.properties.filter(p => p.listingBrokerId === 'USR-BRK-002' && pageLive(p)).slice(0, 2);
  const at = (d: number) => new Date(Date.now() - d * 3600_000).toISOString();
  for (const p of theirs) { p.publicShareOk = true; p.publicShareAt = at(72); }
  const b2 = db.byId('users', 'USR-BRK-002') as UserProfile | undefined;
  if (b2 && theirs.length && !b2.publicCard?.ownerOkAt) { ensureReferralCode(b2); b2.publicCard = { ...(b2.publicCard || { enabled: false, showPhone: false, views: 0 }), ownerOkAt: at(72) }; }
  ensureReferralCode(u);
  u.publicCard = { ...(u.publicCard || {}), enabled: true, showPhone: true, headline: u.publicCard?.headline || 'Raipur ke verified ghar, plot aur dukaan — sahi daam, saaf kaagaz', areas: ['Shankar Nagar', 'Telibandha', 'Naya Raipur'], views: Math.max(u.publicCard?.views || 0, 37), homes: [...own, ...theirs].map(p => p.id), ownerOkAt: at(72) };
  const mk = (name: string, phone: string, p: Property | undefined, message: string | undefined, h: number, status: PageEnquiry['status'] = 'NEW') =>
    s.pageEnquiries.push({ id: `PGE-demo${crypto.randomBytes(3).toString('hex')}`, brokerId: u.id, propertyId: p?.id, name, phone, message, consentAt: at(h), status, createdAt: at(h) });
  mk('Neha Gupta', '9131100011', own[0], 'Is it still available? We can visit on Sunday.', 2);
  mk('Rahul Tiwari', '9131100012', theirs[0], undefined, 20);
  mk('Sunita Yadav', '9131100013', undefined, '2BHK on rent near Telibandha, up to 15,000.', 50, 'CONTACTED');
  db.save();
}
