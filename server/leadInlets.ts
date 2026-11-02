/**
 * v107 — lead inlets.
 *
 *   /api/inlets     the owner's side (a broker, or a builder): make an address, see what came through it, test it, pause it, change its secret.
 *   /in/<token>     the public address: GET = a small hosted enquiry form (website kind), POST = the enquiry itself (form post, or JSON from Zapier / Make / a website).
 *
 * Every enquiry goes through `registerLead` — the same door as a lead typed by hand: the builder's intake switch, the broker's mandate and daily cap, the
 * protection-window duplicate check, manual verification, auto-allotment to staff. An inlet adds no way round any of them.
 *
 * Consent: the owner says, when he makes the address, that people who reach it agreed to be contacted (a ticked box on his own form, a portal's own terms,
 * a lead-ad's own consent line). That statement is dated and kept as the lead's consent record (`via: 'API'`). A sender who says "no" is refused; the hosted
 * form will not send without a ticked box.
 */
import express, { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, LeadInlet } from './db.js';
import { ctx, needs, rateLimit, digits } from './auth.js';
import { registerLead, nextId, leadCreateSchema } from './crm.js';
import { alert, firstName } from './alerts.js';
import { brandOf } from './share.js';
import { mandateIsActive } from '../src/shared/pcontrolRules.js';
import { INLET_CHANNELS, INLET_LIMITS, channelOf, pickFields, cleanPhone, inletNote, formSnippet, type InletOutcome } from '../src/shared/inletRules.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const nowIso = () => new Date().toISOString();
/** one address takes at most this many tries a day (the tests lower it with INLET_DAILY_CAP) */
const dailyCap = () => Math.max(1, Number(process.env.INLET_DAILY_CAP) || INLET_LIMITS.dailyCap);
const today = () => new Date().toISOString().slice(0, 10);
const tail = (s: string, n = 140) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const origin = (req: Request) => `${req.protocol}://${req.get('host')}`;

const byToken = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(String(t)) ? db.getState().leadInlets.find(i => i.token === t) : undefined;

/** an inlet belongs to the broker / builder account itself — never to an employee, never to an admin */
const isOwnerRole = (u: UserProfile | undefined) => !!u && (u.role === 'BROKER' || u.role === 'DEVELOPER_BUILDER') && u.verificationStatus === 'VERIFIED';

/** the projects an owner may point an inlet at: a builder's own, a broker's with a live mandate */
function projectsFor(u: UserProfile) {
  const st = db.getState();
  const mandated = new Set(st.associateMandates.filter(m => m.brokerId === u.id && mandateIsActive(m)).map(m => m.projectId));
  return st.builderProjects
    .filter(p => p.status !== 'ARCHIVED' && (u.role === 'DEVELOPER_BUILDER' ? p.builderId === u.id : mandated.has(p.id)))
    .map(p => ({ id: p.id, name: p.projectName, locality: p.locality, city: p.city, paused: p.leadIntake === 'PAUSED' }));
}

const view = (i: LeadInlet, base: string) => {
  const p = db.byId('builderProjects', i.projectId);
  const ch = channelOf(i.channel);
  return {
    id: i.id, projectId: i.projectId, projectName: p?.projectName || i.projectId, label: i.label, channel: i.channel, kind: i.kind, source: i.source, sourceDetail: i.sourceDetail,
    active: i.active, createdAt: i.createdAt, rotatedAt: i.rotatedAt, counts: i.counts, lastAt: i.lastAt, todayCount: i.day === today() ? i.dayCount : 0, dailyCap: dailyCap(),
    token: i.token, path: `/in/${i.token}`, url: `${base}/in/${i.token}`, hasForm: i.kind === 'FORM', channelName: ch?.en || i.channel, log: i.log,
  };
};

const createSchema = z.object({
  projectId: z.string().min(1).max(80),
  channel: z.enum(['WEBSITE', 'PORTAL', 'META', 'OTHER']),
  label: z.string().trim().min(2, 'Give it a short name').max(INLET_LIMITS.labelMax),
  sourceDetail: z.string().trim().max(INLET_LIMITS.detailMax).optional(),
  consent: z.literal(true, { message: 'Confirm that the people who reach this address agreed to be contacted' }),
});
const patchSchema = z.object({
  label: z.string().trim().min(2).max(INLET_LIMITS.labelMax).optional(),
  sourceDetail: z.string().trim().max(INLET_LIMITS.detailMax).optional(),
  active: z.boolean().optional(),
});

// ───────────────────────────── the owner's side ─────────────────────────────
export function createLeadInletRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  r.use(needs('crm:lead_create'));
  r.use((_req, res, next) => isOwnerRole(me()) ? next() : res.status(403).json({ error: 'Lead inlets belong to the broker or builder account itself (verified). Staff and admins cannot make one.', code: 'FORBIDDEN' }));
  const mine = (id: string) => db.getState().leadInlets.find(i => i.id === id && i.ownerId === me().id);

  r.get('/', (req: Request, res: Response) => {
    const u = me();
    const inlets = db.getState().leadInlets.filter(i => i.ownerId === u.id).map(i => view(i, origin(req)));
    res.json({ success: true, inlets, projects: projectsFor(u), channels: INLET_CHANNELS.map(c => ({ id: c.id, kind: c.kind, en: c.en, hi: c.hi, detail: c.detail })), limits: { perOwner: INLET_LIMITS.perOwner, dailyCap: dailyCap() } });
  });

  r.post('/', rateLimit('inlet-make', 30, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const p = createSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid details' });
    const d = p.data;
    if (!projectsFor(u).some(x => x.id === d.projectId)) return res.status(403).json({ error: u.role === 'BROKER' ? 'You are not an appointed associate for this project (or your partnership is paused / expired)' : 'Pick one of your own live projects' });
    if (st.leadInlets.filter(i => i.ownerId === u.id).length >= INLET_LIMITS.perOwner) return res.status(409).json({ error: `At most ${INLET_LIMITS.perOwner} addresses — delete one you no longer use` });
    const ch = channelOf(d.channel)!;
    const at = nowIso();
    const inlet: LeadInlet = {
      id: nextId('INL', st.leadInlets.map(i => i.id)), ownerId: u.id, projectId: d.projectId, label: d.label, channel: d.channel, kind: ch.kind, source: ch.source,
      sourceDetail: d.sourceDetail || ch.detail, token: crypto.randomBytes(24).toString('base64url'), consentAttestedAt: at, active: true, createdAt: at,
      counts: { received: 0, created: 0, duplicate: 0, rejected: 0 }, day: today(), dayCount: 0, log: [],
    };
    st.leadInlets.unshift(inlet); db.save();
    db.appendAuditEvent(u.id, u.role as any, 'LEAD', inlet.id, 'LEAD_INLET_CREATED', `Lead inlet “${inlet.label}” (${inlet.channel}) made for ${db.byId('builderProjects', d.projectId)?.projectName || d.projectId}; the owner confirmed that people who reach it agreed to be contacted`);
    res.json({ success: true, inlet: view(inlet, origin(req)) });
  });

  r.put('/:id', (req: Request, res: Response) => {
    const i = mine(req.params.id); if (!i) return res.status(404).json({ error: 'Address not found' });
    const p = patchSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid details' });
    if (p.data.label !== undefined) i.label = p.data.label;
    if (p.data.sourceDetail !== undefined) i.sourceDetail = p.data.sourceDetail;
    if (p.data.active !== undefined && p.data.active !== i.active) {
      i.active = p.data.active;
      db.appendAuditEvent(me().id, me().role as any, 'LEAD', i.id, 'LEAD_INLET_TOGGLED', `Lead inlet “${i.label}” ${i.active ? 'switched on' : 'paused'}`);
    }
    db.save();
    res.json({ success: true, inlet: view(i, origin(req)) });
  });

  /** a new secret: the old address stops working at once (use it when a link has been pasted somewhere it should not be) */
  r.post('/:id/rotate', rateLimit('inlet-rotate', 20, 24 * 3600_000), (req: Request, res: Response) => {
    const i = mine(req.params.id); if (!i) return res.status(404).json({ error: 'Address not found' });
    i.token = crypto.randomBytes(24).toString('base64url'); i.rotatedAt = nowIso(); db.save();
    db.appendAuditEvent(me().id, me().role as any, 'LEAD', i.id, 'LEAD_INLET_ROTATED', `Lead inlet “${i.label}” got a new secret address; the old one is dead`);
    res.json({ success: true, inlet: view(i, origin(req)) });
  });

  r.delete('/:id', (req: Request, res: Response) => {
    const st = db.getState(); const i = mine(req.params.id); if (!i) return res.status(404).json({ error: 'Address not found' });
    st.leadInlets = st.leadInlets.filter(x => x !== i); db.save();
    db.appendAuditEvent(me().id, me().role as any, 'LEAD', i.id, 'LEAD_INLET_DELETED', `Lead inlet “${i.label}” deleted`);
    res.json({ success: true });
  });

  /** "would a customer be taken right now?" — runs every real rule, writes nothing, counts nothing */
  r.post('/:id/test', rateLimit('inlet-test', 60, 3600_000), (req: Request, res: Response) => {
    const i = mine(req.params.id); if (!i) return res.status(404).json({ error: 'Address not found' });
    const u = me();
    if (!i.active) return res.json({ success: true, ok: false, why: 'This address is paused — switch it on first.', hi: 'यह पता रोका हुआ है — पहले चालू करें।' });
    const probe = leadCreateSchema.safeParse({ projectId: i.projectId, name: 'Test enquiry', phone: '9999900001', source: i.source, sourceDetail: i.sourceDetail || undefined, consent: true });
    if (!probe.success) return res.json({ success: true, ok: false, why: probe.error.issues[0]?.message || 'Invalid', hi: '' });
    const out = registerLead(u, probe.data, { via: 'API', dryRun: true });
    if (out.status === 200) return res.json({ success: true, ok: true, why: 'Yes — a customer sent here would become a lead in your CRM right now.', hi: 'हाँ — यहाँ आया ग्राहक अभी आपके CRM में लीड बन जाएगा।' });
    return res.json({ success: true, ok: false, why: tail(out.body?.error || 'Not taken'), hi: '', code: out.body?.code });
  });

  r.get('/snippet/:id', (req: Request, res: Response) => {
    const i = mine(req.params.id); if (!i) return res.status(404).json({ error: 'Address not found' });
    res.json({ success: true, html: formSnippet(`${origin(req)}/in/${i.token}`, db.byId('builderProjects', i.projectId)?.projectName || i.label) });
  });
  return r;
}

// ───────────────────────────── the public address ─────────────────────────────
const CSS = `*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#14213d;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.w{max-width:520px;margin:0 auto;padding:12px 14px 40px}
.top{background:#14213d;color:#fff;border-radius:14px;padding:16px 16px 14px;margin:6px 0 12px}.top h1{margin:0 0 2px;font-size:21px}.top p{margin:0;color:#cbd5e1;font-size:14px}
.card{background:#fff;border-radius:14px;padding:14px;margin:10px 0;box-shadow:0 1px 3px #0001}.card.ok{border:2px solid #86efac}.card.warn{border:2px solid #fcd34d}
label{display:block;font-weight:700;margin:12px 0 4px;font-size:14px}input[type=text],input[type=tel],input[type=email],textarea{width:100%;font:inherit;padding:12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff}
textarea{min-height:76px;resize:vertical}.ck{display:flex;gap:10px;align-items:flex-start;font-weight:400;margin:14px 0 6px}.ck input{width:22px;height:22px;margin-top:2px;flex:none}
button{width:100%;margin-top:12px;font:inherit;font-weight:800;padding:14px;border:0;border-radius:12px;background:#1fa855;color:#fff;min-height:48px;cursor:pointer}
small,.small{color:#475569;font-size:13px}.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}.err{color:#b91c1c;font-weight:700}
.logo{max-height:34px;max-width:120px;border-radius:6px;background:#fff;padding:3px;margin-bottom:8px;display:block}`;

const shell = (title: string, body: string) => `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" type="image/png" href="/icon-192.png"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="w">${body}</div></body></html>`;
const noStore = (res: Response) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }); };
const cors = (res: Response) => { res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }); };

export function createLeadInletPublicRouter() {
  const r = Router();
  const form = express.urlencoded({ extended: false, limit: '20kb' });

  const formPage = (res: Response, i: LeadInlet, msg = '', keep: Record<string, string> = {}, status = 200) => {
    const owner = db.byId('users', i.ownerId); const project = db.byId('builderProjects', i.projectId);
    const b = owner ? brandOf(owner) : undefined;
    const who = b?.displayName || 'GENZ';
    const goes = owner?.role === 'BROKER' ? [`${who} और इस प्रोजेक्ट के बिल्डर को`, `${who} and the project’s builder`] : [`${who} और उनकी टीम को`, `${who} and their team`];
    noStore(res);
    res.status(status).send(shell(`${project?.projectName || 'Enquiry'} — ${who}`, `<div class="top">${b?.logo ? `<img class="logo" src="${esc(b.logo)}" alt="">` : ''}<h1>${esc(project?.projectName || 'पूछताछ')}</h1><p>${esc([project?.locality, project?.city].filter(Boolean).join(', '))}${b?.reraId ? ` · RERA ${esc(b.reraId)}` : ''}</p></div>
${msg ? `<div class="card warn"><p class="err" data-testid="inlet-err">${msg}</p></div>` : ''}
<div class="card"><p style="margin:0 0 4px"><b>अपनी जानकारी भेजें — ${esc(who)} आपको कॉल करेंगे।</b><br><small>Send your details — ${esc(who)} will call you.</small></p>
<form method="post" action="/in/${esc(i.token)}" data-testid="inlet-form"><input class="hp" type="text" name="hp_url" tabindex="-1" autocomplete="off" aria-hidden="true">
<label>नाम / Name</label><input type="text" name="name" maxlength="${INLET_LIMITS.nameMax}" required autocomplete="name" value="${esc(keep.name || '')}">
<label>मोबाइल / Mobile</label><input type="tel" name="phone" inputmode="numeric" maxlength="16" required autocomplete="tel-national" placeholder="98XXXXXXXX" value="${esc(keep.phone || '')}">
<label>आप क्या ढूँढ रहे हैं? (ज़रूरी नहीं) / What are you looking for? (optional)</label><textarea name="message" maxlength="400">${esc(keep.message || '')}</textarea>
<label class="ck"><input type="checkbox" name="consent" value="yes" required><span>मैं सहमत हूँ कि ${esc(who)} मुझे इस प्रोजेक्ट के बारे में कॉल या WhatsApp करें। <small>I agree that ${esc(who)} may call or WhatsApp me about this project.</small></span></label>
<button type="submit">भेजें / Send</button></form>
<p class="small" style="margin-top:10px">आपकी जानकारी सिर्फ़ ${esc(goes[0])} मिलेगी। <small>Your details go only to ${esc(goes[1])}.</small></p></div>`));
  };
  const thanks = (res: Response, i: LeadInlet) => {
    const owner = db.byId('users', i.ownerId); const who = owner ? brandOf(owner).displayName : 'GENZ';
    noStore(res);
    res.send(shell('धन्यवाद', `<div class="top"><h1>धन्यवाद 🙏</h1><p>Thank you</p></div><div class="card ok" data-testid="inlet-thanks"><p style="margin:0"><b>आपकी जानकारी पहुँच गई।</b> ${esc(who)} जल्द आपसे संपर्क करेंगे।<br><small>We got your details. ${esc(who)} will contact you soon.</small></p></div>`));
  };
  const closed = (res: Response, status = 404) => { noStore(res); res.status(status).send(shell('GENZ', `<div class="card"><p style="margin:0"><b>यह फ़ॉर्म अभी पूछताछ नहीं ले रहा।</b><br><small>This form is not taking enquiries right now.</small></p></div>`)); };

  r.options('/:token', (_req, res) => { cors(res); res.status(204).end(); });

  r.get('/:token', rateLimit('inlet-view', 120, 60_000), (req: Request, res: Response) => {
    const i = byToken(req.params.token);
    if (!i || !i.active) return closed(res);
    if (i.kind !== 'FORM') { cors(res); return res.status(405).set('Allow', 'POST').json({ ok: false, error: 'This address takes enquiries by POST (JSON or form fields).' }); }
    formPage(res, i);
  });

  r.post('/:token', rateLimit('inlet-post', 120, 60_000), form, (req: Request, res: Response) => {
    cors(res);
    const i = byToken(req.params.token);
    // a browser form post is answered with a page; Zapier / Make / a script is answered with JSON
    const wantsPage = !!req.is('application/x-www-form-urlencoded') && /text\/html/i.test(String(req.headers.accept || ''));
    const reply = (status: number, body: Record<string, unknown>, formMsg = '', keep: Record<string, string> = {}) => {
      if (!wantsPage || !i) return res.status(status).json(body);
      if (status === 200) return thanks(res, i);
      if (status === 422 && i.kind === 'FORM') return formPage(res, i, formMsg, keep, 422);
      return closed(res, status === 404 ? 404 : 503);
    };
    if (!i || !i.active) return reply(404, { ok: false, error: 'This address is not taking enquiries' });

    const st = db.getState();
    const day = today(); if (i.day !== day) { i.day = day; i.dayCount = 0; }
    const note = (outcome: InletOutcome, why: string, who = '', leadId?: string) => {
      i.counts.received++; i.lastAt = nowIso();
      if (outcome === 'CREATED') i.counts.created++; else if (outcome === 'DUPLICATE') i.counts.duplicate++; else i.counts.rejected++;
      i.log.unshift({ at: i.lastAt, outcome, why: tail(why), who, ...(leadId ? { leadId } : {}) });
      if (i.log.length > INLET_LIMITS.logKeep) i.log.length = INLET_LIMITS.logKeep;
      db.save();
    };

    if (i.dayCount >= dailyCap()) {
      if (i.dayCount === dailyCap()) { i.dayCount++; note('LIMIT', `More than ${dailyCap()} enquiries today — the rest are not taken until tomorrow`); const o = db.byId('users', i.ownerId); if (o) alert(o.id, 'deals', `Lead address “${i.label}” hit today's limit`, `More than ${dailyCap()} enquiries came in — check it is not spam`, '/?tab=crm', { tag: `inl-cap-${i.id}` }); }
      return reply(429, { ok: false, code: 'DAILY_LIMIT', error: 'Too many enquiries today — try again tomorrow' });
    }
    i.dayCount++;

    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const f = pickFields(body);
    const keep = { name: f.name, phone: f.phone, message: f.message };
    // a hidden field a person never sees: a robot that fills every box fills this one too — it is thanked, and nothing is made
    if (String(body.hp_url ?? '').trim()) { note('REJECTED', 'Spam trap was filled'); return reply(200, { ok: true }); }

    const owner = db.byId('users', i.ownerId) as UserProfile | undefined;
    if (!isOwnerRole(owner)) { note('REJECTED', 'The owner account is not active'); return reply(403, { ok: false, error: 'The owner of this address is not active' }); }

    const phone = cleanPhone(f.phone);
    if (!phone) { note('REJECTED', 'No valid Indian mobile number in the enquiry'); return reply(422, { ok: false, error: 'A valid 10-digit mobile number is required' }, 'कृपया सही 10 अंकों का मोबाइल नंबर लिखें। / Please enter a valid 10-digit mobile number.', keep); }
    // the hosted form (and the owner's own website form) must carry a ticked box; a portal / lead-ad bridge stands on the owner's statement unless the sender says "no"
    if (f.consent === false || (i.kind === 'FORM' && f.consent !== true)) { note('REJECTED', 'The customer did not agree to be contacted', `${firstName(f.name)} ··${phone.slice(-4)}`); return reply(422, { ok: false, error: 'The customer must agree to be contacted' }, 'आगे बढ़ने के लिए सहमति का बॉक्स टिक करें। / Please tick the box to agree.', keep); }

    const name = f.name.length >= 2 ? f.name : `Enquiry ${phone.slice(-4)}`;
    const email = z.string().email().max(200).safeParse(f.email).success ? f.email : undefined;
    const parsed = leadCreateSchema.safeParse({
      projectId: i.projectId, name, phone, ...(email ? { email } : {}), source: i.source, sourceDetail: f.detail || i.sourceDetail || undefined,
      note: inletNote(i.label, f), ...(f.budget ? { budgetMax: f.budget } : {}), ...(f.unitInterest ? { unitInterest: f.unitInterest } : {}), consent: true,
    });
    const who = `${firstName(name)} ··${phone.slice(-4)}`;
    if (!parsed.success) { note('REJECTED', parsed.error.issues[0]?.message || 'Invalid enquiry', who); return reply(422, { ok: false, error: parsed.error.issues[0]?.message || 'Invalid enquiry' }, 'कुछ जानकारी सही नहीं है — जाँचकर फिर भेजें। / Something is not right — please check and send again.', keep); }

    const out = registerLead(owner!, parsed.data, { via: 'API' });
    if (out.status === 200) {
      const lead = db.byId('crmLeads', out.body.lead.id);
      note('CREATED', `Lead made from “${i.label}”`, who, out.body.lead.id);
      if (lead) {
        lead.activities.unshift({ id: `A-${Date.now().toString(36)}i`, type: 'SYSTEM', note: `Enquiry came through the lead address “${i.label}” (${i.channel === 'WEBSITE' ? 'website form' : i.channel === 'PORTAL' ? 'property portal' : i.channel === 'META' ? 'Facebook / Instagram lead ad' : 'webhook'}); consent given by the owner's statement on ${i.consentAttestedAt.slice(0, 10)}`, byUserId: owner!.id, byName: 'Lead address', at: nowIso() });
        db.save();
        alert([owner!.id, lead.assignedMemberId || ''], 'deals', `New lead · ${lead.projectName}`, `${firstName(name)} enquired via ${i.label}`, '/?tab=crm', { tag: `lead-${lead.id}`, hi: [`नई लीड · ${lead.projectName}`, `${firstName(name)} ने ${i.label} से पूछताछ की`] });
      }
      return reply(200, { ok: true, status: 'CREATED' });
    }
    if (out.status === 409 && out.body?.code === 'LEAD_DUPLICATE') {
      // already his customer: no second lead, but his timeline learns the customer came again
      // only a customer on the OWNER'S OWN list gets the line: a broker's own lead, or a lead on the builder's own desk — a builder's website never writes into a partner's timeline
      const nowMs = Date.now();
      const clash = st.crmLeads.find(l => l.projectId === i.projectId && l.phoneKey === digits(phone) && l.verify !== 'REJECTED'
        && (l.stage === 'BOOKED' || l.stage === 'BOOKING_REQUESTED' || (l.stage !== 'LOST' && Date.parse(l.protectedUntil) > nowMs))
        && (owner!.role === 'BROKER' ? l.associateId === owner!.id : !l.associateId && l.builderId === owner!.id));
      const line = `Customer enquired again through “${i.label}”`;
      if (clash && !(clash.activities[0]?.note === line && Date.now() - Date.parse(clash.activities[0].at) < 600_000)) {
        clash.activities.unshift({ id: `A-${Date.now().toString(36)}d`, type: 'SYSTEM', note: line, byUserId: owner!.id, byName: 'Lead address', at: nowIso() }); clash.updatedAt = nowIso();
        alert([clash.assignedMemberId || owner!.id], 'deals', `Enquired again · ${clash.name}`, `${firstName(clash.name)} came through ${i.label} again`, '/?tab=crm', { tag: `again-${clash.id}` });
      }
      note('DUPLICATE', clash ? 'Already in your CRM — a line was added to the lead' : 'Already registered for this project (by someone else) — nothing added', who, clash?.id);
      return reply(200, { ok: true, status: 'DUPLICATE', duplicate: true });
    }
    note('REJECTED', out.body?.error || 'Not taken', who);
    return reply(out.status === 423 || out.status === 429 ? out.status : out.status >= 500 ? 503 : 403, { ok: false, code: out.body?.code, error: tail(out.body?.error || 'Not taken') });
  });
  return r;
}

