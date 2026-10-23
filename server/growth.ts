/**
 * Growth loop for an invite-only network that has to spread city by city through word of mouth.
 *
 *  - Members (`growth:nominate`) get a personal invite code, can nominate peers, see the pipeline of the people they
 *    brought in, earn badges, and switch on an opt-in public "digital visiting card" (`/c/<code>`).
 *  - Anyone can ask for access (public waitlist) — this is how demand per city becomes visible. Nothing is auto-approved:
 *    GENZ ops approves a lead → a normal phone-bound invitation is issued → normal KYC. The network stays invite-only.
 *  - GENZ ops (`growth:manage`) get a City Launch board: where members, listings, deals and demand are, which city
 *    is Waitlist / Seeding / Live / Hub, and which city to open next.
 *  - "Forgot password" requests (public, no account enumeration) land in an ops queue; ops issue a one-time password.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { reputationOf } from './reputation.js';
import { db } from './db.js';
import type { UserProfile, GrowthLead, ResetRequest } from './db.js';
import { ctx, needs, rateLimit, digits, secureCode, hit, randomPassword, hashPassword } from './auth.js';
import { can } from './permissions.js';
import { phoneSchema } from './validation.js';
import { findState } from '../src/shared/india.js';
import { brandOf } from './share.js';
import { makeChallenge, checkChallenge } from './spam.js';
import { TOP_CITIES, normCity, cityStage, badgesFor, CITY_THRESHOLDS, type CityStage } from '../src/shared/cities.js';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const nowIso = () => new Date().toISOString();

export const PRO_ROLES = ['BROKER', 'DEVELOPER_BUILDER', 'CONTRACTOR', 'LEGAL_COUNSEL'] as const;
const JOIN_ROLES = [...PRO_ROLES, 'PROPERTY_OWNER'] as const;
const ROLE_LABEL: Record<string, string> = { BROKER: 'Broker', DEVELOPER_BUILDER: 'Builder / Developer', CONTRACTOR: 'Contractor', LEGAL_COUNSEL: 'Legal counsel', PROPERTY_OWNER: 'Property owner' };
const isPro = (u: UserProfile) => (PRO_ROLES as readonly string[]).includes(u.role);
const isVerified = (u: UserProfile) => u.verificationStatus === 'VERIFIED';

const nominateSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  phone: phoneSchema,
  city: z.string().trim().min(2, 'City is required').max(80),
  state: z.string().trim().max(60).optional(),
  role: z.enum(JOIN_ROLES),
  note: z.string().trim().max(200).optional(),
  consent: z.literal(true, { message: 'Confirm that this person agreed to be contacted by GENZ' }),
});
const waitlistSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  phone: phoneSchema,
  city: z.string().trim().min(2, 'City is required').max(80),
  state: z.string().trim().max(60).optional(),
  role: z.enum(JOIN_ROLES),
  ref: z.string().trim().max(24).optional(),
  consent: z.literal(true, { message: 'Please agree to be contacted by GENZ' }),
  website: z.string().max(0).optional(), // honeypot: real people leave it empty
  challengeToken: z.string().max(400).optional(),
  challengeAnswer: z.union([z.string(), z.number()]).optional(),
});
const cardSchema = z.object({
  enabled: z.boolean(),
  showPhone: z.boolean().default(false),
  headline: z.string().trim().max(120).optional(),
});

/** Stable, human-friendly personal code, e.g. GZ-VIKR-4821. */
export function ensureReferralCode(u: UserProfile): string {
  if (u.referralCode) return u.referralCode;
  const letters = (u.name || 'GENZ').replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(4, 'X').slice(0, 4);
  const taken = new Set(db.getState().users.map(x => x.referralCode).filter(Boolean));
  let code = '';
  do { code = `GZ-${letters}-${crypto.randomInt(1000, 10000)}`; } while (taken.has(code));
  u.referralCode = code;
  db.save();
  return code;
}

export const findByCode = (code: string) => {
  const c = String(code || '').trim().toUpperCase();
  return db.getState().users.find(u => u.referralCode && u.referralCode.toUpperCase() === c && isVerified(u) && isPro(u));
};

function nextLeadId(list: GrowthLead[]) {
  const n = list.reduce((m, r) => Math.max(m, Number(r.id.split('-').pop()) || 0), 0) + 1;
  return `GL-${String(n).padStart(4, '0')}`;
}
function nextResetId(list: ResetRequest[]) {
  const n = list.reduce((m, r) => Math.max(m, Number(r.id.split('-').pop()) || 0), 0) + 1;
  return `RR-${String(n).padStart(4, '0')}`;
}

const phoneKnown = (phone: string) => db.getState().users.some(u => digits(u.phone).slice(-10) === digits(phone).slice(-10));

function checklistFor(u: UserProfile) {
  const st = db.getState();
  const mine = st.growthLeads.filter(l => l.nominatorId === u.id);
  const invitees = st.users.filter(x => x.invitedById === u.id);
  const items: { id: string; en: string; hi: string; done: boolean }[] = [
    { id: 'kyc', en: 'Get your KYC verified', hi: 'अपना KYC सत्यापित कराएँ', done: isVerified(u) },
  ];
  // Share Kit is only open to some roles — never ask a role for a step it cannot do (e.g. a legal counsel has no Share Kit).
  if (can(u, 'share:use')) items.push({ id: 'brand', en: 'Set your brand (name, tagline, logo) in Share Kit', hi: 'Share Kit में अपना ब्रांड (नाम, टैगलाइन, लोगो) सेट करें', done: !!(u.brand?.tagline || u.brand?.logo) });
  if (u.role === 'BROKER') items.push({ id: 'listing', en: 'Post your first verified listing', hi: 'अपनी पहली सत्यापित लिस्टिंग डालें', done: st.properties.some(p => p.listingBrokerId === u.id) });
  if (u.role === 'DEVELOPER_BUILDER') items.push({ id: 'project', en: 'Launch your first project', hi: 'अपना पहला प्रोजेक्ट लॉन्च करें', done: st.builderProjects.some(p => p.builderId === u.id) });
  if (u.role === 'BROKER' || u.role === 'DEVELOPER_BUILDER') items.push({ id: 'share', en: 'Send one tracked link to a client', hi: 'किसी ग्राहक को एक ट्रैक्ड लिंक भेजें', done: st.shareLinks.some(l => l.ownerId === u.id) });
  items.push(
    { id: 'card', en: 'Switch on your public visiting card', hi: 'अपना पब्लिक विज़िटिंग कार्ड चालू करें', done: !!u.publicCard?.enabled },
    { id: 'nominate', en: 'Nominate your first trusted peer', hi: 'अपने पहले भरोसेमंद साथी को नामांकित करें', done: mine.length > 0 },
    { id: 'verified-invite', en: 'Get one of your nominees verified', hi: 'अपने एक नामांकित व्यक्ति को सत्यापित करवाएँ', done: invitees.some(isVerified) },
  );
  return items;
}

function shareTexts(u: UserProfile, code: string) {
  return {
    en: `Hi! I use GENZ Broker Network — an invite-only network of verified brokers, builders and contractors. Request access with my code ${code}: {link}`,
    hi: `नमस्ते! मैं GENZ Broker Network इस्तेमाल करता/करती हूँ — सत्यापित ब्रोकर, बिल्डर और ठेकेदारों का इनवाइट-ओनली नेटवर्क। मेरा कोड ${code} डालकर एक्सेस माँगें: {link}`,
  };
}

export function createGrowthRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;

  // ───────────── public: waitlist + forgot password (no login, rate-limited, no account enumeration) ─────────────
  r.get('/public/challenge', rateLimit('challenge', 60, 60 * 60_000), (_req: Request, res: Response) => { res.setHeader('Cache-Control', 'no-store'); res.json(makeChallenge()); });

  r.post('/public/waitlist', rateLimit('waitlist', 8, 60 * 60_000), (req: Request, res: Response) => {
    const p = waitlistSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Please check the form' });
    const d = p.data;
    const chk = checkChallenge(d.challengeToken, d.challengeAnswer);
    if (chk !== 'OK') return res.status(400).json({ error: chk === 'TOO_FAST' ? 'That was very quick — please wait a moment and try again.' : 'Please solve the small sum correctly (it refreshes if you reload).', code: 'CHALLENGE' });
    const generic = { success: true, message: 'Thank you! GENZ will contact you on WhatsApp once your city is opened for your role.' };
    const st = db.getState();
    const phone = digits(d.phone).slice(-10);
    if (phoneKnown(d.phone) || st.growthLeads.some(l => digits(l.phone).slice(-10) === phone && (l.status === 'NEW' || l.status === 'INVITED'))) return res.json(generic);
    const nominator = d.ref ? findByCode(d.ref) : undefined;
    const lead: GrowthLead = {
      id: nextLeadId(st.growthLeads), name: d.name, phone: d.phone, city: normCity(d.city), state: findState(d.state)?.name, role: d.role,
      source: nominator ? 'NOMINATION' : 'WAITLIST', nominatorId: nominator?.id, consent: true, status: 'NEW', createdAt: nowIso(), updatedAt: nowIso(),
    };
    st.growthLeads.unshift(lead);
    db.save();
    db.appendAuditEvent(nominator?.id || 'PUBLIC', nominator?.role || 'BUYER_TENANT', 'SYSTEM', lead.id, 'GROWTH_WAITLIST_JOINED', `${lead.role} request from ${lead.city}${nominator ? ` via ${nominator.name}'s code` : ''}`);
    res.json(generic);
  });

  r.post('/public/forgot', rateLimit('forgot', 6, 60 * 60_000), (req: Request, res: Response) => {
    const generic = { success: true, message: 'If this number is registered, GENZ Operations will contact you on it with a temporary password.' };
    const parsed = phoneSchema.safeParse(req.body?.phone);
    if (!parsed.success) return res.json(generic);
    const phone = digits(parsed.data).slice(-10);
    if (hit(`forgot-phone:${phone}`, 3, 24 * 60 * 60_000)) return res.json(generic);
    const st = db.getState();
    const matches = st.users.filter(u => digits(u.phone).slice(-10) === phone && u.verificationStatus !== 'BLACKLISTED' && u.verificationStatus !== 'REJECTED');
    if (matches.length === 0) return res.json(generic);
    if (st.resetRequests.some(x => x.status === 'NEW' && x.phone === phone)) return res.json(generic);
    st.resetRequests.unshift({ id: nextResetId(st.resetRequests), phone, userId: matches.length === 1 ? matches[0].id : undefined, status: 'NEW', createdAt: nowIso() });
    db.save();
    res.json(generic);
  });

  // ───────────── member side ─────────────
  r.get('/me', needs('growth:nominate'), (_req: Request, res: Response) => {
    const u = me();
    const st = db.getState();
    const code = ensureReferralCode(u);
    const invitees = st.users.filter(x => x.invitedById === u.id);
    const verified = invitees.filter(isVerified).length;
    const leads = st.growthLeads.filter(l => l.nominatorId === u.id)
      .map(l => ({ id: l.id, name: l.name, phone: l.phone, city: l.city, role: l.role, status: l.status, source: l.source, createdAt: l.createdAt, rejectReason: l.status === 'REJECTED' ? undefined : undefined }));
    const checklist = checklistFor(u);
    res.json({
      success: true, code, shareText: shareTexts(u, code),
      stats: { nominated: leads.length, joined: invitees.length, verified, pending: leads.filter(l => l.status === 'NEW').length },
      badges: badgesFor(verified), pipeline: leads, checklist,
      progress: Math.round((checklist.filter(c => c.done).length / checklist.length) * 100),
      card: { enabled: !!u.publicCard?.enabled, showPhone: !!u.publicCard?.showPhone, headline: u.publicCard?.headline || '', views: u.publicCard?.views || 0, path: `/c/${code}`, page: u.role === 'BROKER' },
      city: normCity(u.city),
    });
  });

  r.post('/nominations', needs('growth:nominate'), rateLimit('nominate', 10, 24 * 60 * 60_000), (req: Request, res: Response) => {
    const u = me();
    if (!isVerified(u)) return res.status(403).json({ error: 'Your account must be verified before you can nominate others' });
    const p = nominateSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Please check the form' });
    const d = p.data;
    const st = db.getState();
    if (digits(d.phone).slice(-10) === digits(u.phone).slice(-10)) return res.status(400).json({ error: 'That is your own number' });
    if (phoneKnown(d.phone)) return res.status(409).json({ error: 'This person is already on GENZ' });
    if (st.growthLeads.some(l => digits(l.phone).slice(-10) === digits(d.phone).slice(-10) && (l.status === 'NEW' || l.status === 'INVITED'))) {
      return res.status(409).json({ error: 'This person has already been nominated' });
    }
    const lead: GrowthLead = {
      id: nextLeadId(st.growthLeads), name: d.name, phone: d.phone, city: normCity(d.city), state: findState(d.state)?.name, role: d.role,
      source: 'NOMINATION', nominatorId: u.id, note: d.note, consent: true, status: 'NEW', createdAt: nowIso(), updatedAt: nowIso(),
    };
    st.growthLeads.unshift(lead);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', lead.id, 'GROWTH_NOMINATED', `${u.name} nominated a ${d.role} in ${lead.city}`);
    res.json({ success: true, lead: { id: lead.id, name: lead.name, city: lead.city, role: lead.role, status: lead.status } });
  });

  r.put('/card', needs('growth:nominate'), (req: Request, res: Response) => {
    const u = me();
    if (!isVerified(u)) return res.status(403).json({ error: 'Your account must be verified first' });
    const p = cardSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid' });
    const stored = db.byId('users', u.id)!;
    ensureReferralCode(stored);
    // v57 — keep the public page's homes, areas and the owners' promise (they are set on My Public Page)
    stored.publicCard = { ...(stored.publicCard || {}), enabled: p.data.enabled, showPhone: p.data.showPhone, headline: p.data.headline || undefined, views: stored.publicCard?.views || 0 };
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', u.id, p.data.enabled ? 'PUBLIC_CARD_ENABLED' : 'PUBLIC_CARD_DISABLED', `Public visiting card ${p.data.enabled ? 'on' : 'off'}${p.data.showPhone ? ' (phone shown)' : ''}`);
    res.json({ success: true, card: { ...stored.publicCard, path: `/c/${stored.referralCode}` } });
  });

  // ───────────── ops side ─────────────
  r.get('/queue', needs('growth:manage'), (req: Request, res: Response) => {
    const st = db.getState();
    const status = String(req.query.status || '');
    let list = st.growthLeads;
    if (status) list = list.filter(l => l.status === status);
    res.json({
      success: true,
      leads: list.slice(0, 300).map(l => ({ ...l, nominatorName: l.nominatorId ? db.byId('users', l.nominatorId)?.name : undefined })),
      resets: st.resetRequests.filter(x => x.status === 'NEW').map(x => ({ ...x, userName: x.userId ? db.byId('users', x.userId)?.name : undefined, userRole: x.userId ? db.byId('users', x.userId)?.role : undefined })),
    });
  });

  r.post('/queue/:id/approve', needs('growth:manage'), (req: Request, res: Response) => {
    const actor = me();
    const st = db.getState();
    const lead = db.byId('growthLeads', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (lead.status !== 'NEW') return res.status(409).json({ error: `Already ${lead.status.toLowerCase()}` });
    if (phoneKnown(lead.phone)) return res.status(409).json({ error: 'This person already has a GENZ account' });
    const email = `${digits(lead.phone).slice(-10)}@phone.genz.local`;
    if (st.invitations.some(i => i.invitedEmail === email && i.status === 'PENDING' && new Date(i.expiresAt) > new Date())) return res.status(409).json({ error: 'An active invitation already exists for this number' });
    const inv = {
      id: `INV-${Date.now()}`, code: `GZ-${lead.role.slice(0, 3)}-${secureCode(9)}`, invitedEmail: email, invitedPhone: lead.phone, targetRole: lead.role,
      issuedBy: actor.id, status: 'PENDING' as const, expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(), createdAt: nowIso(),
      nominatedBy: lead.nominatorId, growthLeadId: lead.id,
    };
    st.invitations.unshift(inv);
    lead.status = 'INVITED'; lead.invitationId = inv.id; lead.updatedAt = nowIso();
    db.save();
    db.appendAuditEvent(actor.id, actor.role, 'SYSTEM', inv.id, 'GROWTH_LEAD_APPROVED', `Approved ${lead.id} (${lead.role}, ${lead.city}); invitation issued`);
    const link = '{link}';
    res.json({
      success: true, invitation: { id: inv.id, code: inv.code, expiresAt: inv.expiresAt },
      whatsappText: `नमस्ते ${lead.name}! GENZ Broker Network में आपका स्वागत है। जुड़ने के लिए इन्विटेशन कोड: ${inv.code} (14 दिन वैध)। ऐप खोलकर "Have an invitation code? Join here" पर कोड डालें, रजिस्ट्रेशन में यही मोबाइल नंबर (${digits(lead.phone).slice(-10)}) इस्तेमाल करें। Hello ${lead.name}! Your GENZ Broker Network invitation code: ${inv.code}. ${link}`.replace(' {link}', ''),
    });
  });

  r.post('/queue/:id/reject', needs('growth:manage'), (req: Request, res: Response) => {
    const actor = me();
    const lead = db.byId('growthLeads', req.params.id);
    if (!lead) return res.status(404).json({ error: 'Not found' });
    if (lead.status !== 'NEW') return res.status(409).json({ error: `Already ${lead.status.toLowerCase()}` });
    lead.status = 'REJECTED'; lead.rejectReason = String(req.body?.reason || '').slice(0, 200) || undefined; lead.updatedAt = nowIso();
    db.save();
    db.appendAuditEvent(actor.id, actor.role, 'SYSTEM', lead.id, 'GROWTH_LEAD_REJECTED', `Rejected ${lead.id}${lead.rejectReason ? ': ' + lead.rejectReason : ''}`);
    res.json({ success: true });
  });

  r.post('/resets/:id/issue', needs('users:reset_password'), (req: Request, res: Response) => {
    const actor = me();
    const st = db.getState();
    const rr = st.resetRequests.find(x => x.id === req.params.id);
    if (!rr || rr.status !== 'NEW') return res.status(404).json({ error: 'Request not found' });
    const target = rr.userId ? db.byId('users', rr.userId) : undefined;
    if (!target) return res.status(409).json({ error: 'More than one account uses this number — reset the right one from Users' });
    if (target.id === actor.id) return res.status(400).json({ error: 'Use "Change password" for your own account' });
    if (actor.role !== 'SUPERADMIN' && (target.role === 'ADMIN' || target.role === 'SUPERADMIN')) return res.status(403).json({ error: 'Only a SUPERADMIN can reset administrator credentials' });
    const temp = randomPassword();
    target.passwordHash = hashPassword(temp);
    target.mustChangePassword = true;
    target.sessionVersion = (target.sessionVersion || 1) + 1;
    rr.status = 'DONE'; rr.handledBy = actor.id; rr.handledAt = nowIso();
    db.save();
    db.appendAuditEvent(actor.id, actor.role, 'SYSTEM', target.id, 'PASSWORD_RESET_ISSUED', `Temporary password issued for ${target.name} (${target.role}) via reset request ${rr.id}`);
    res.json({
      success: true, name: target.name, loginId: digits(target.phone).slice(-10), temporaryPassword: temp,
      whatsappText: `GENZ Broker Network: आपका अस्थायी पासवर्ड ${temp} है। लॉगिन (${digits(target.phone).slice(-10)} या ईमेल) के बाद नया पासवर्ड सेट करना होगा। Temporary password: ${temp}`,
    });
  });

  r.post('/resets/:id/dismiss', needs('users:reset_password'), (req: Request, res: Response) => {
    const actor = me();
    const rr = db.getState().resetRequests.find(x => x.id === req.params.id);
    if (!rr || rr.status !== 'NEW') return res.status(404).json({ error: 'Request not found' });
    rr.status = 'DISMISSED'; rr.handledBy = actor.id; rr.handledAt = nowIso();
    db.save();
    res.json({ success: true });
  });

  r.get('/cities', needs('growth:manage'), (_req: Request, res: Response) => {
    const st = db.getState();
    type Row = { city: string; state?: string; tier?: number; brokers: number; builders: number; contractors: number; legal: number; verifiedPros: number; pendingKyc: number; waitlist: number; listings: number; deals: number; stage: CityStage; demand: number; target: boolean };
    const rows = new Map<string, Row>();
    const row = (city: string, state?: string): Row => {
      const key = city.toLowerCase();
      if (!rows.has(key)) rows.set(key, { city, state, brokers: 0, builders: 0, contractors: 0, legal: 0, verifiedPros: 0, pendingKyc: 0, waitlist: 0, listings: 0, deals: 0, stage: 'WAITLIST', demand: 0, target: false });
      return rows.get(key)!;
    };
    for (const c of TOP_CITIES) { const x = row(c.name, c.state); x.tier = c.tier; x.target = true; }
    for (const u of st.users) {
      if (!isPro(u) || !u.city) continue;
      const x = row(normCity(u.city), u.state);
      if (isVerified(u)) {
        x.verifiedPros++;
        if (u.role === 'BROKER') x.brokers++; else if (u.role === 'DEVELOPER_BUILDER') x.builders++; else if (u.role === 'CONTRACTOR') x.contractors++; else x.legal++;
      } else if (u.verificationStatus === 'PENDING') x.pendingKyc++;
    }
    for (const l of st.growthLeads) if (l.status === 'NEW' || l.status === 'INVITED') row(normCity(l.city), l.state).waitlist++;
    const cityOfProp = new Map<string, string>();
    for (const p of st.properties) { const c = normCity(p.city); if (!c) continue; cityOfProp.set(p.id, c); row(c).listings++; }
    for (const d of st.dealRooms) { const c = cityOfProp.get(d.propertyId); if (c) row(c).deals++; }
    const list = [...rows.values()].map(x => ({ ...x, stage: cityStage(x.verifiedPros), demand: x.waitlist * 2 + x.pendingKyc + x.listings }));
    const order = (c: string) => { const i = TOP_CITIES.findIndex(t => t.name === c); return i < 0 ? 999 : i; };
    list.sort((a, b) => b.verifiedPros - a.verifiedPros || b.demand - a.demand || order(a.city) - order(b.city));
    const next = list.filter(x => x.stage === 'WAITLIST' && x.demand > 0).sort((a, b) => b.demand - a.demand || order(a.city) - order(b.city))[0];
    const since = Date.now() - 30 * 86400000;
    const recent = st.growthLeads.filter(l => Date.parse(l.createdAt) >= since);
    const inviters = new Map<string, { id: string; name: string; city: string; verified: number; joined: number }>();
    for (const u of st.users) {
      if (!u.invitedById) continue;
      const inv = db.byId('users', u.invitedById);
      if (!inv) continue;
      const e = inviters.get(inv.id) || { id: inv.id, name: inv.name, city: normCity(inv.city), verified: 0, joined: 0 };
      e.joined++; if (isVerified(u)) e.verified++;
      inviters.set(inv.id, e);
    }
    const pros = st.users.filter(u => isPro(u) && isVerified(u)).length;
    res.json({
      success: true,
      thresholds: CITY_THRESHOLDS,
      summary: {
        verifiedPros: pros,
        citiesLive: list.filter(x => x.stage === 'LIVE' || x.stage === 'HUB').length,
        citiesSeeding: list.filter(x => x.stage === 'SEEDING').length,
        waitlistOpen: st.growthLeads.filter(l => l.status === 'NEW').length,
        invitedViaMembers: st.users.filter(u => u.invitedById).length,
        invitesPerMember: pros ? Math.round((st.users.filter(u => u.invitedById).length / pros) * 100) / 100 : 0,
        last30d: { requests: recent.length, invited: recent.filter(l => l.status === 'INVITED' || l.status === 'JOINED').length, joined: recent.filter(l => l.status === 'JOINED').length },
      },
      nextCity: next ? { city: next.city, demand: next.demand, waitlist: next.waitlist, pendingKyc: next.pendingKyc } : null,
      cities: list.filter(x => x.target || x.verifiedPros > 0 || x.waitlist > 0 || x.pendingKyc > 0),
      topInviters: [...inviters.values()].sort((a, b) => b.verified - a.verified || b.joined - a.joined).slice(0, 10),
    });
  });

  return r;
}

// ───────────── public visiting card ─────────────
export function createPublicCardRouter() {
  const r = Router();
  const BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|embedly|curl|wget|python|node-fetch/i;
  r.get('/:code', rateLimit('card-view', 120, 60_000), (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const u = findByCode(req.params.code);
    const gone = () => res.status(404).send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Card not available</title><body style="font-family:system-ui;padding:24px"><p>This card is not available.</p></body>`);
    if (!u || !u.publicCard?.enabled) return gone();
    const st = db.getState();
    const b = brandOf(u);
    if (!BOT.test(String(req.headers['user-agent'] || ''))) { u.publicCard.views = (u.publicCard.views || 0) + 1; db.save(); }
    const activeListings = u.role === 'BROKER' ? st.properties.filter(p => p.listingBrokerId === u.id && p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus)).length : 0;
    const projects = u.role === 'DEVELOPER_BUILDER' ? st.builderProjects.filter(p => p.builderId === u.id && p.status !== 'ARCHIVED').length : 0;
    const since = new Date(u.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    const code = u.referralCode!;
    const phone = digits(u.phone).slice(-10);
    const wa = `https://wa.me/91${phone}?text=${encodeURIComponent(`Hello ${b.displayName}, I found your GENZ card.`)}`;
    const joinHref = `/?ref=${encodeURIComponent(code)}`;
    const title = `${b.displayName} — GENZ Verified ${ROLE_LABEL[u.role] || ''}`;
    const desc = u.publicCard.headline || `${ROLE_LABEL[u.role] || 'Professional'} in ${normCity(u.city)} on GENZ Broker Network`;
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}.w{max-width:520px;margin:0 auto;padding:16px}
.hero{background:#14213d;color:#fff;border-radius:18px;padding:24px;text-align:center}.hero img{width:72px;height:72px;border-radius:16px;background:#fff;object-fit:contain;margin-bottom:8px}
.hero h1{margin:4px 0;font-size:22px}.hero p{margin:2px 0;opacity:.85;font-size:14px}.badge{display:inline-block;background:#1fa855;border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;margin-top:10px}
.card{background:#fff;border-radius:14px;padding:16px;margin-top:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}.row{display:flex;justify-content:space-between;font-size:14px;padding:7px 0;border-bottom:1px solid #eee}.row:last-child{border:0}
.btns{display:flex;gap:8px;margin-top:12px}.btns a{flex:1;text-align:center;padding:12px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px}.call{background:#14213d;color:#fff}.wa{background:#1fa855;color:#fff}
.join{display:block;text-align:center;background:#fff;border:2px dashed #14213d;color:#14213d;border-radius:12px;padding:14px;margin-top:12px;text-decoration:none;font-weight:600;font-size:14px}.small{font-size:11px;color:#666;margin-top:14px;text-align:center}</style></head>
<body><div class="w"><div class="hero">${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<h1>${esc(b.displayName)}</h1>${b.company ? `<p>${esc(b.company)}</p>` : ''}<p>${esc(ROLE_LABEL[u.role] || '')} · ${esc(normCity(u.city))}${u.state ? ', ' + esc(u.state) : ''}</p>${b.tagline || u.publicCard.headline ? `<p>${esc(u.publicCard.headline || b.tagline)}</p>` : ''}<span class="badge">✔ GENZ Verified</span></div>
<div class="card">${b.reraId ? `<div class="row"><span>RERA</span><b>${esc(b.reraId)}</b></div>` : ''}<div class="row"><span>Member since</span><b>${esc(since)}</b></div>${(() => { const r = reputationOf(u.id); return r.closed || r.confirmers ? `<div class="row"><span>Deals closed on GENZ</span><b>${r.closed}</b></div>${r.confirmers ? `<div class="row"><span>Confirmed by brokers</span><b>${r.confirmers}</b></div>` : ''}` : ''; })()}${activeListings ? `<div class="row"><span>Active verified listings</span><b>${activeListings}</b></div>` : ''}${projects ? `<div class="row"><span>Projects</span><b>${projects}</b></div>` : ''}
${u.publicCard.showPhone ? `<div class="btns"><a class="call" href="tel:+91${esc(phone)}">Call</a><a class="wa" href="${esc(wa)}">WhatsApp</a></div>` : ''}</div>
<a class="join" href="${esc(joinHref)}">Are you a broker, builder, contractor or lawyer?<br>Request access to GENZ Broker Network →</a>
<p class="small">GENZ verifies KYC and RERA details of every member. Always check RERA registration and approvals before any booking.</p></div></body></html>`);
  });
  return r;
}
