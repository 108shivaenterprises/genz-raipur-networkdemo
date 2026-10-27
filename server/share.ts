/**
 * Share kit: broker branding, tracked brochure links and flyers.
 *
 * - `/api/share/*`  (needs `share:use`) — manage brand profile and links, see who viewed what.
 * - `/s/:token`     public brochure page rendered on the server (no login). It carries ONLY marketing information plus
 *                   the sharing broker's contact card. It never shows the builder's commission, owner details,
 *                   exact address or anything from deal rooms.
 * - `/s/track.js`   tiny script (served from our own origin so the production CSP allows it) that reports how long each
 *                   section was visible, so the broker can see "viewed 3 times, 45 s on plans & pricing".
 *
 * Alerts are shown inside the app (Share Kit tab). Push alerts on WhatsApp would need the WhatsApp Business API.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { joinFooter } from './publicFooter.js';
import { db } from './db.js';
import type { UserProfile, ShareLink } from './db.js';
import { ctx, needs, rateLimit, digits } from './auth.js';
import { actorFor, seenBy } from './invaccess.js';
import { policyOf } from '../src/shared/pcontrolRules.js';
import { docAccessFor } from './projdocs.js';
import { embedFor, stampName, stampInitials, watermarkTile } from '../src/shared/docViewRules.js';
import { impliedFeatures, featureLabel, facingLabel, roadSidesLabel, kindWord } from '../src/shared/inventoryRules.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const SECTIONS = ['overview', 'plans', 'location'] as const;
const BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|embedly|curl|wget|python|node-fetch/i;

const brandSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  tagline: z.string().trim().max(120).optional(),
  reraId: z.string().trim().max(40).regex(/^[A-Za-z0-9\-\/ ]*$/, 'RERA ID can contain letters, numbers, - and /').optional(),
  logo: z.union([z.literal(''), z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(180_000, 'Logo is too large (max ~130 KB)')]).optional(),
});
const linkSchema = z.object({
  kind: z.enum(['PROJECT', 'PROPERTY']),
  refId: z.string().min(1).max(60),
  clientLabel: z.string().trim().max(60).default(''),
  lang: z.enum(['en', 'hi']).default('en'),
});

export function brandOf(u: UserProfile) {
  return {
    displayName: u.brand?.displayName || u.name,
    company: u.companyName || '',
    tagline: u.brand?.tagline || '',
    reraId: u.brand?.reraId || u.reraNumber || '',
    logo: u.brand?.logo || '',
    phone: digits(u.phone).slice(-10),
    city: u.city,
  };
}

/** What a broker/builder is allowed to share. */
function sourcesFor(u: UserProfile) {
  const st = db.getState();
  const mandated = new Set(st.associateMandates.filter(m => m.brokerId === u.id && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status)).map(m => m.projectId));
  const projects = st.builderProjects.filter(p => u.role === 'DEVELOPER_BUILDER' ? p.builderId === u.id : (mandated.has(p.id) || p.status === 'ACTIVE_LAUNCH' || p.status === 'PRE_BOOKING'))
    .filter(p => p.status !== 'ARCHIVED').map(p => ({ kind: 'PROJECT' as const, id: p.id, title: p.projectName, sub: `${p.locality}, ${p.city}`, price: `From ${inr(p.priceStartingFrom)}`, lines: [p.projectType, ...(p.unitConfigurations || []).slice(0, 3), p.reraNumber ? `RERA ${p.reraNumber}` : ''].filter(Boolean) }));
  const props = u.role === 'BROKER'
    ? st.properties.filter(p => p.listingBrokerId === u.id && p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus))
        .map(p => ({ kind: 'PROPERTY' as const, id: p.id, title: p.title, sub: `${p.locality}, ${p.city}`, price: inr(p.askingPrice), lines: [p.propertyType, p.transactionType, p.plotAreaSqFt ? `${p.plotAreaSqFt} sq ft` : ''].filter(Boolean) }))
    : [];
  return [...projects, ...props];
}

const canShare = (u: UserProfile, kind: string, refId: string) => sourcesFor(u).some(s => s.kind === kind && s.id === refId);

export function createShareRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  r.use(needs('share:use'));

  r.get('/brand', (_req, res) => res.json({ success: true, brand: brandOf(me()) }));
  r.put('/brand', (req: Request, res: Response) => {
    const p = brandSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid details' });
    const u = me();
    const stored = db.byId('users', u.id)!;
    stored.brand = { ...stored.brand, ...Object.fromEntries(Object.entries(p.data).filter(([, v]) => v !== undefined)) };
    if (p.data.logo === '') delete stored.brand.logo;
    db.save();
    res.json({ success: true, brand: brandOf(stored) });
  });

  r.get('/sources', (_req, res) => res.json({ success: true, sources: sourcesFor(me()) }));

  r.get('/links', (_req, res) => {
    const u = me(); const st = db.getState();
    const links = st.shareLinks.filter(l => l.ownerId === u.id).map(l => {
      const title = l.kind === 'PROJECT' ? db.byId('builderProjects', l.refId)?.projectName
        : l.kind === 'UNITS' ? `${db.byId('builderProjects', l.refId)?.projectName || l.refId} · ${(l.unitIds || []).length} unit(s)`
        : l.kind === 'DOC' ? `${db.byId('builderProjects', l.refId)?.projectName || l.refId} · ${(db.byId('builderProjects', l.refId)?.collateral || []).find(c => c.id === l.docId)?.title || 'paper'}`
        : db.byId('properties', l.refId)?.title;
      return { token: l.token, kind: l.kind, refId: l.refId, title: title || l.refId, clientLabel: l.clientLabel, lang: l.lang, createdAt: l.createdAt, views: l.views, lastViewAt: l.lastViewAt, seconds: l.seconds, revoked: !!l.revoked };
    }).sort((a, b) => (b.lastViewAt || b.createdAt).localeCompare(a.lastViewAt || a.createdAt));
    res.json({ success: true, links });
  });

  r.post('/links', rateLimit('share-create', 60, 24 * 60 * 60_000), (req: Request, res: Response) => {
    const u = me();
    const p = linkSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid request' });
    if (!canShare(u, p.data.kind, p.data.refId)) return res.status(404).json({ error: 'You cannot share this item' });
    const st = db.getState();
    if (st.shareLinks.filter(l => l.ownerId === u.id).length >= 500) return res.status(409).json({ error: 'Too many links — revoke old ones first' });
    const link: ShareLink = {
      token: crypto.randomBytes(8).toString('base64url'), ownerId: u.id, kind: p.data.kind, refId: p.data.refId,
      clientLabel: p.data.clientLabel, lang: p.data.lang, createdAt: new Date().toISOString(), views: 0, seconds: {}, viewLog: [],
    };
    st.shareLinks.unshift(link); db.save();
    res.json({ success: true, token: link.token, path: `/s/${link.token}` });
  });

  r.post('/links/:token/revoke', (req: Request, res: Response) => {
    const l = db.getState().shareLinks.find(x => x.token === req.params.token && x.ownerId === me().id);
    if (!l) return res.status(404).json({ error: 'Link not found' });
    l.revoked = true; db.save();
    res.json({ success: true });
  });

  return r;
}

// ───────────────────────── public pages ─────────────────────────
const seen = new Map<string, number>();
const T = {
  en: { price: 'Price', config: 'Configurations', amen: 'Amenities', loc: 'Location', plans: 'Plans & pricing', over: 'Overview', call: 'Call', wa: 'WhatsApp', rera: 'RERA', by: 'Shared by', unavailable: 'This link is no longer active.', note: 'Information is indicative. Please verify RERA registration and all approvals before booking.', from: 'Starting from', stage: 'Stage', possession: 'Completion target', area: 'Area', type: 'Type', units: 'Available now', onReq: 'Price on request', gone: 'were sold or are on hold since this link was made', none: 'These units are no longer available. Ask for the current list.', size: 'Size', doc: 'Document', openDoc: 'Open the document', notShowing: 'Not showing here? Open the document', sentBy: 'Sent to you by', noFwd: 'please do not forward' },
  hi: { price: 'कीमत', config: 'विकल्प', amen: 'सुविधाएँ', loc: 'लोकेशन', plans: 'प्लान और कीमत', over: 'विवरण', call: 'कॉल', wa: 'व्हाट्सऐप', rera: 'रेरा', by: 'भेजने वाले', unavailable: 'यह लिंक अब सक्रिय नहीं है।', note: 'जानकारी संकेतात्मक है। बुकिंग से पहले रेरा पंजीयन और सभी अनुमतियाँ जाँच लें।', from: 'शुरुआती कीमत', stage: 'चरण', possession: 'पूर्णता लक्ष्य', area: 'क्षेत्रफल', type: 'प्रकार', units: 'अभी उपलब्ध', onReq: 'कीमत पूछें', gone: 'इस लिंक के बाद बिक गईं या होल्ड पर हैं', none: 'ये यूनिट अब उपलब्ध नहीं हैं। ताज़ा सूची माँगें।', size: 'साइज़', doc: 'दस्तावेज़', openDoc: 'दस्तावेज़ खोलें', notShowing: 'यहाँ नहीं दिख रहा? दस्तावेज़ खोलें', sentBy: 'आपको भेजने वाले', noFwd: 'कृपया आगे न भेजें' },
} as const;

function pageShell(title: string, desc: string, image: string | undefined, body: string, token?: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}
.w{max-width:640px;margin:0 auto;padding:16px}.hero{background:#14213d;color:#fff;border-radius:16px;padding:22px}
.hero h1{margin:0 0 4px;font-size:22px}.hero p{margin:0;opacity:.85;font-size:14px}.card{background:#fff;border-radius:14px;padding:16px;margin-top:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
h2{font-size:15px;margin:0 0 8px;color:#14213d}.row{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:6px 0;border-bottom:1px solid #eee}.row:last-child{border:0}
.tags span{display:inline-block;background:#eef1f7;border-radius:999px;padding:4px 10px;margin:3px 4px 3px 0;font-size:12px}.imgs{display:flex;gap:8px;overflow-x:auto;margin-top:12px}.imgs img{height:150px;border-radius:10px}
.broker{display:flex;gap:12px;align-items:center}.broker img{width:56px;height:56px;border-radius:12px;object-fit:contain;background:#fff}.btns{display:flex;gap:8px;margin-top:10px}
.vw{position:relative;overflow:hidden;min-height:220px;border-radius:10px;border:1px solid #e3e3e3;background:#fff;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}.vw img,.vw iframe{display:block;width:100%;border:0}.vw iframe{height:68vh;min-height:420px}
.vw .wmo{position:absolute;inset:0;pointer-events:none;background-repeat:repeat}.vw .wmi{position:absolute;left:0;right:0;top:42%;text-align:center;font-size:84px;font-weight:800;color:#b91c1c;opacity:.12;transform:rotate(-24deg);pointer-events:none}
.vw .wmb{position:absolute;left:0;right:0;bottom:0;padding:7px 10px;background:rgba(15,23,42,.88);color:#fff;font-size:11px;line-height:1.3;pointer-events:none}@media print{.vw{display:none}}
.btns a{flex:1;text-align:center;padding:11px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px}.call{background:#14213d;color:#fff}.wa{background:#1fa855;color:#fff}.small{font-size:11px;color:#666;margin-top:12px}</style></head>
<body><div class="w">${body}</div>${token ? `<script src="/s/track.js" data-token="${esc(token)}" defer></script>` : ''}</body></html>`;
}

export function createPublicShareRouter() {
  const r = Router();

  r.get('/track.js', (_req, res) => {
    res.type('application/javascript').set('Cache-Control', 'public, max-age=3600').send(`(function(){
var s=document.currentScript,t=s&&s.getAttribute('data-token');if(!t)return;
var acc={},cur={},last=Date.now();
var io='IntersectionObserver' in window?new IntersectionObserver(function(es){es.forEach(function(e){cur[e.target.getAttribute('data-sec')]=e.isIntersecting})},{threshold:0.35}):null;
document.querySelectorAll('[data-sec]').forEach(function(el){if(io)io.observe(el);else cur[el.getAttribute('data-sec')]=true});
document.querySelectorAll('.vw').forEach(function(el){el.addEventListener('contextmenu',function(e){e.preventDefault()})});
function tick(){var n=Date.now(),d=(n-last)/1000;last=n;if(document.visibilityState!=='visible'||d>15)return;for(var k in cur){if(cur[k])acc[k]=(acc[k]||0)+d}}
function flush(){tick();var out={};for(var k in acc){var v=Math.round(acc[k]);if(v>0)out[k]=v}if(!Object.keys(out).length)return;acc={};
var b=JSON.stringify({s:out});try{navigator.sendBeacon('/s/'+t+'/ping',new Blob([b],{type:'application/json'}))}catch(e){}}
setInterval(tick,1000);setInterval(flush,10000);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flush()});window.addEventListener('pagehide',flush);
})();`);
  });

  r.post('/:token/ping', rateLimit('share-ping', 120, 60_000), (req: Request, res: Response) => {
    const l = db.getState().shareLinks.find(x => x.token === req.params.token && !x.revoked);
    const s = req.body?.s;
    if (l && s && typeof s === 'object') {
      for (const k of SECTIONS) {
        const v = Number(s[k]);
        if (Number.isFinite(v) && v > 0) l.seconds[k] = Math.min(36000, (l.seconds[k] || 0) + Math.min(v, 60));
      }
      db.save();
    }
    res.status(204).end();
  });

  r.get('/:token', rateLimit('share-view', 120, 60_000), (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const st = db.getState();
    const l = st.shareLinks.find(x => x.token === req.params.token);
    const owner = l && db.byId('users', l.ownerId);
    const lang = (l?.lang || 'en') as 'en' | 'hi';
    const t = T[lang];
    const gone = () => res.status(404).send(pageShell('Link inactive', '', undefined, `<div class="card"><p>${esc(t.unavailable)}</p></div>`));
    if (!l || l.revoked || !owner || owner.verificationStatus !== 'VERIFIED') return gone();
    // an employee's link carries the employer's card, and dies when the employer stops it (switch off, leave, suspension)
    let card: UserProfile = owner;
    if (owner.role === 'TEAM_MEMBER') {
      const emp = db.byId('users', owner.employerId);
      const pol = policyOf(owner);
      if (!emp || emp.verificationStatus !== 'VERIFIED' || pol.invMode === 'OFF' || !pol.invShareOut || pol.onLeave) return gone();
      card = emp;
    }

    // content
    let title = ''; let sub = ''; let image: string | undefined; let overview = ''; let plans = ''; let location = ''; let plansHead: string = t.plans;
    if (l.kind === 'UNITS') {
      const a = actorFor(owner, l.refId);
      if (!a || a.project.status === 'ARCHIVED') return gone();
      const p = a.project;
      title = p.projectName; sub = p.tagline || `${p.locality}, ${p.city}`; image = p.images?.find(i => /^https:\/\//.test(i));
      const hi = lang === 'hi';
      let off = 0; const cards: string[] = [];
      for (const id of l.unitIds || []) {
        const x = st.inventoryUnits.find(u => u.id === id && u.projectId === p.id);
        const seen = x && seenBy(a.actor, p, x);
        if (!x || !seen || !seen.visible || x.status !== 'AVAILABLE') { off++; continue; }
        const showP = !!l.showPrice && seen.price; const showF = !!l.showFeatures && seen.features;
        const chips: string[] = [];
        if (showF) {
          const rs = roadSidesLabel(x.roadSides, hi); if (rs) chips.push(rs + (x.roadWidthFt ? ` · ${x.roadWidthFt} ft` : ''));
          const fc = facingLabel(x.facing, hi); if (fc) chips.push(`${fc} ${hi ? 'मुखी' : 'facing'}`);
          for (const f of impliedFeatures(x)) chips.push(featureLabel(f, hi));
        }
        const facts = [kindWord(x.kind, x.config, hi), x.config, x.areaSqft ? `${x.areaSqft} ${hi ? 'वर्ग फ़ुट' : 'sq ft'}` : '', x.dimensions].filter(Boolean).map(esc).join(' · ');
        cards.push(`<div style="padding:10px 0;border-bottom:1px solid #eee"><div style="display:flex;justify-content:space-between;gap:12px"><b>${esc(x.label)}${x.group ? ` <span style="font-weight:400;color:#666;font-size:12px">${esc(x.group)}</span>` : ''}</b><b>${showP ? inr(x.price) : (l.showPrice ? t.onReq : '')}</b></div>${facts ? `<div style="font-size:13px;color:#444;margin-top:2px">${facts}</div>` : ''}${chips.length ? `<div class="tags">${chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}${showF && x.note ? `<div style="font-size:12px;color:#555;margin-top:4px">${esc(x.note)}</div>` : ''}</div>`);
      }
      overview = `<div class="row"><span>${t.type}</span><b>${esc(p.projectType)}</b></div><div class="row"><span>${t.stage}</span><b>${esc(p.projectStage)}</b></div><div class="row"><span>${t.possession}</span><b>${esc(p.completionTarget)}</b></div>${p.reraNumber ? `<div class="row"><span>${t.rera}</span><b>${esc(p.reraNumber)}</b></div>` : ''}`;
      plans = (cards.length ? `<div style="font-size:12px;color:#666;margin-bottom:2px">${t.units} (${cards.length})</div>${cards.join('')}` : `<p style="font-size:14px;margin:0">${t.none}</p>`)
        + (off && cards.length ? `<p class="small">${off} ${t.gone}.</p>` : '');
      location = `<div class="row"><span>${t.loc}</span><b>${esc(p.locality)}, ${esc(p.city)}</b></div><div class="tags">${(p.amenities || []).map(c => `<span>${esc(c)}</span>`).join('')}</div>`;
    } else if (l.kind === 'DOC') {
      // v77 — one project paper, sent by a partner or his team. It is valid only while the builder still lets it go to clients and the partnership runs.
      const p = db.byId('builderProjects', l.refId);
      const doc = p && (p.collateral || []).find(c => c.id === l.docId);
      if (!p || !doc || !docAccessFor(owner, p, doc).client) return gone();
      title = p.projectName; sub = doc.title; image = p.images?.find(i => /^https:\/\//.test(i));
      overview = `<div class="row"><span>${t.type}</span><b>${esc(p.projectType)}</b></div><div class="row"><span>${t.stage}</span><b>${esc(p.projectStage)}</b></div>${p.reraNumber ? `<div class="row"><span>${t.rera}</span><b>${esc(p.reraNumber)}</b></div>` : ''}`;
      plansHead = t.doc;
      // v78 — the paper is shown inside the page with the SENDER's name laid over it (tiled + large initials + a band at the foot): a screenshot or a photo of the screen
      // shows whose link it was. A paper that is only a link cannot carry the stamp once opened on its own, so that fallback is a plain link below the frame.
      const who = stampName(owner, brandOf(card).displayName); const when = new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
      const emb = embedFor(doc.url);
      const frame = !emb ? '' : `<div class="vw">${emb.mode === 'image' ? `<img src="${esc(emb.src)}" alt="${esc(doc.title)}" draggable="false">` : `<iframe src="${esc(emb.src)}" title="${esc(doc.title)}" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`}`
        + `<div class="wmo" style='background-image:url("${watermarkTile(who)}")'></div><div class="wmi">${esc(stampInitials(who))}</div><div class="wmb">${t.sentBy} ${esc(who)} · ${esc(when)} · ${t.noFwd}</div></div>`;
      plans = `<p style="font-size:15px;margin:0 0 10px"><b>${esc(doc.title)}</b></p>${frame}<div class="btns"><a class="call" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer">${emb ? t.notShowing : t.openDoc}</a></div>`;
      location = `<div class="row"><span>${t.loc}</span><b>${esc(p.locality)}, ${esc(p.city)}</b></div>`;
    } else if (l.kind === 'PROJECT') {
      const p = db.byId('builderProjects', l.refId);
      if (!p || p.status === 'ARCHIVED') return gone();
      title = p.projectName; sub = p.tagline || `${p.locality}, ${p.city}`; image = p.images?.find(i => /^https:\/\//.test(i));
      overview = `<div class="row"><span>${t.type}</span><b>${esc(p.projectType)}</b></div><div class="row"><span>${t.stage}</span><b>${esc(p.projectStage)}</b></div><div class="row"><span>${t.possession}</span><b>${esc(p.completionTarget)}</b></div>${p.reraNumber ? `<div class="row"><span>${t.rera}</span><b>${esc(p.reraNumber)}</b></div>` : ''}`;
      plans = `<div class="row"><span>${t.from}</span><b>${inr(p.priceStartingFrom)}</b></div><div class="row"><span>${t.price}</span><b>${inr(p.priceStartingFrom)} – ${inr(p.priceMax)}</b></div><div class="tags">${(p.unitConfigurations || []).map(c => `<span>${esc(c)}</span>`).join('')}</div>`;
      location = `<div class="row"><span>${t.loc}</span><b>${esc(p.locality)}, ${esc(p.city)}</b></div><div class="tags">${(p.amenities || []).map(c => `<span>${esc(c)}</span>`).join('')}</div>`;
    } else {
      const p = db.byId('properties', l.refId);
      if (!p || p.verificationStatus !== 'VERIFIED' || !['active', 'under_negotiation'].includes(p.listingStatus) || p.listingBrokerId !== owner.id) return gone();
      title = p.title; sub = `${p.locality}, ${p.city}`; image = p.images?.find(i => /^https:\/\//.test(i));
      overview = `<p style="font-size:14px;line-height:1.5;margin:0">${esc(p.description)}</p><div class="row"><span>${t.type}</span><b>${esc(p.propertyType)} · ${esc(p.transactionType)}</b></div>`;
      plans = `<div class="row"><span>${t.price}</span><b>${inr(p.askingPrice)}</b></div>${p.plotAreaSqFt ? `<div class="row"><span>${t.area}</span><b>${p.plotAreaSqFt} sq ft</b></div>` : ''}${p.builtUpAreaSqFt ? `<div class="row"><span>Built-up</span><b>${p.builtUpAreaSqFt} sq ft</b></div>` : ''}`;
      location = `<div class="row"><span>${t.loc}</span><b>${esc(p.locality)}, ${esc(p.city)}</b></div><div class="tags">${(p.tags || []).map(c => `<span>${esc(c)}</span>`).join('')}</div><p class="small">Exact address is shared after a verified site-visit.</p>`;
    }

    // count the view (not for link-preview bots, and not twice within 20 s from the same device)
    const ua = String(req.headers['user-agent'] || '');
    if (!BOT.test(ua)) {
      const key = crypto.createHash('sha256').update(`${l.token}|${req.ip}|${ua}`).digest('hex').slice(0, 20);
      const prev = seen.get(key) || 0;
      if (Date.now() - prev > 20_000) {
        l.views += 1; l.lastViewAt = new Date().toISOString(); l.viewLog.unshift(l.lastViewAt); l.viewLog.length = Math.min(l.viewLog.length, 50);
        db.save();
      }
      seen.set(key, Date.now());
      if (seen.size > 5000) seen.clear();
    }

    const b = brandOf(card);
    const wa = `https://wa.me/91${b.phone}?text=${encodeURIComponent(`Hello ${b.displayName}, I saw ${title}. Please share details.`)}`;
    const body = `<div class="hero" data-sec="overview"><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>
${image ? `<div class="imgs"><img src="${esc(image)}" alt="" loading="lazy"></div>` : ''}
<div class="card" data-sec="overview"><h2>${t.over}</h2>${overview}</div>
<div class="card" data-sec="plans"><h2>${plansHead}</h2>${plans}</div>
<div class="card" data-sec="location"><h2>${t.loc} · ${t.amen}</h2>${location}</div>
<div class="card"><div class="broker">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<div><div class="small" style="margin:0">${t.by}</div><b>${esc(b.displayName)}</b>${b.company ? `<div style="font-size:13px">${esc(b.company)}</div>` : ''}${b.reraId ? `<div style="font-size:12px;color:#555">${t.rera}: ${esc(b.reraId)}</div>` : ''}${b.tagline ? `<div style="font-size:12px;color:#555">${esc(b.tagline)}</div>` : ''}</div></div>
<div class="btns"><a class="call" href="tel:+91${esc(b.phone)}">${t.call}</a><a class="wa" href="${esc(wa)}">${t.wa}</a></div></div>
<p class="small">${t.note}</p>${joinFooter(card)}`;
    // the shared page frames the paper's own host, so its CSP differs from the app's (which allows only YouTube frames); nothing here runs outside our own script
    if (l.kind === 'DOC') res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src https:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    res.send(pageShell(`${title} — ${b.displayName}`, sub, image, body, l.token));
  });

  return r;
}
