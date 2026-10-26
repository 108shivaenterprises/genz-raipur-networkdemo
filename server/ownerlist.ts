/**
 * v73 — owners list on their own.
 *
 *  • An owner signs up / signs in with his MOBILE (OTP) — no password. (Existing password accounts keep the password sign-in.)
 *  • His listing is paid for first (GENZ's own listing fee, set by the superadmin's MASTER PLAN: fee, days in the pool, limits per kind).
 *    He pays outside the app and writes the UTR; a GENZ admin confirms. Fee 0 = free listing.
 *  • Once live it sits in the broker POOL: brokers see it (no owner phone / address) but it is NOT matched, offered or visited until the
 *    owner assigns one broker and that broker's mandate is signed.
 *  • A listing brought by a broker (or a shop-QR partner → broker) is free — but it is live only after the mandate.
 *
 *  POST /api/owner/otp {phone,name?}  /api/owner/verify {phone,code,name?}          (public)
 *  GET  /api/owner-listing/config | quote | mine                                     (owner)
 *  POST /api/owner-listing/:pid/pay | renew | via-broker | assign | unassign        (owner)
 *  POST /api/owner-listing/:pid/request                                              (verified broker asks to take the mandate)
 *  GET/POST/PUT/DELETE /api/owner-listing/admin/*                                    (GENZ staff: master plan, config, confirm payments)
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import type { UserProfile, Property } from './db.js';
import { ctx, needs, rateLimit, hit, resetHits, secureOtp, safeEqual, secret, signSession, setSessionCookie, DEMO_MODE } from './auth.js';
import { sendSms } from './notify.js';
import { alert } from './alerts.js';
import { issueSignCode } from './signing.js';
import { effectivePermissions } from './permissions.js';
import { pickOwnerPlan, planProblem, inPool, type OwnerListPlan, type OwnerListingState } from '../src/shared/ownerListRules.js';

const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const nowIso = () => new Date().toISOString();
const DAY = 86400_000;
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const phone10 = (v: unknown) => String(v || '').replace(/\D/g, '').slice(-10);
const PHONE_RE = /^[6-9]\d{9}$/;
const hm = (k: string, v: string) => crypto.createHmac('sha256', secret()).update(`${k}|${v}`).digest('hex');
const rid = (p: string) => `${p}-${crypto.randomBytes(5).toString('hex')}`;
const safeRef = (v: unknown) => { const r = str(v, 60); return /^[A-Za-z0-9][A-Za-z0-9 \-\/_.,#:]{2,59}$/.test(r) ? r : ''; };
const OPEN = ['draft', 'pending_verification', 'active', 'under_negotiation'];

export { inPool };
/** v73 — a self-listed property (owner paid GENZ) is matched and gets offers at once, but NO token / payment entry before a broker is chosen and the mandate is signed */
export const needsMandateFirst = (p?: Property) => !!p?.ownerListing && ['PAID', 'FREE'].includes(p.ownerListing.feeStatus) && !p.ownerListing.matchedAt;
export const MANDATE_FIRST_MSG = 'पहले मालिक ब्रोकर चुने और मंडेट साइन हो — उसके बाद ही टोकन / पेमेंट की एंट्री होगी। / Choose a broker and sign the mandate first — only then a token or payment can be recorded.';
export function ensureOwnerPlans() {
  const s = st();
  if (s.ownerListPlans.length) return;
  const now = nowIso();
  s.ownerListPlans.push({ id: rid('OLP'), name: 'Pilot — free listing', active: true, transactionTypes: [], propertyTypes: [], fee: 0, durationDays: 60, maxPhotos: 12, maxActivePerOwner: 3, refundable: false, note: 'Change the fee here when the pilot ends.', createdAt: now, updatedAt: now });
  db.save();
}

/** called by POST /api/properties for a listing an owner makes on his own (or names a broker for). Returns an error or the fields to merge. */
export function applyOwnerListing(owner: UserProfile, data: { transactionType: string; propertyType: string; images?: string[] }, listingBrokerId: string): { error: string; status: number; code?: string } | { patch: Partial<Property> } {
  const s = st();
  if (!s.ownerListCfg.enabled && !listingBrokerId) return { error: 'Owners cannot list on their own right now — ask a GENZ broker to list it for you.', status: 403, code: 'OWNER_LISTING_OFF' };
  const now = nowIso();
  if (listingBrokerId) {
    // brought through a GENZ broker: no listing fee, live only after his mandate is signed
    return { patch: { listingStatus: 'pending_verification', verificationStatus: 'PENDING', ownerListing: { planId: '', planName: 'Via broker', fee: 0, durationDays: 0, refundable: false, feeStatus: 'WAIVED_BROKER', assignedBrokerId: listingBrokerId, assignedAt: now, requests: [], createdAt: now } } };
  }
  const plan = pickOwnerPlan(s.ownerListPlans, data.transactionType, data.propertyType);
  if (!plan) return { error: 'GENZ has no listing plan for this kind of property yet. Ask a GENZ broker to list it for you.', status: 409, code: 'NO_PLAN' };
  const live = s.properties.filter(p => p.ownerId === owner.id && p.ownerListing && OPEN.includes(p.listingStatus)).length;
  if (live >= plan.maxActivePerOwner) return { error: `You can keep ${plan.maxActivePerOwner} listing(s) open at a time on this plan. Close or withdraw one first.`, status: 429, code: 'PLAN_LIMIT' };
  if ((data.images || []).length > plan.maxPhotos) return { error: `This plan allows ${plan.maxPhotos} photos per listing.`, status: 400, code: 'PHOTO_LIMIT' };
  const ol: OwnerListingState = { planId: plan.id, planName: plan.name, fee: plan.fee, durationDays: plan.durationDays, refundable: plan.refundable, feeStatus: plan.fee > 0 ? 'PENDING' : 'FREE', requests: [], createdAt: now };
  if (plan.fee === 0) { ol.liveFrom = now; ol.liveUntil = new Date(Date.now() + plan.durationDays * DAY).toISOString(); return { patch: { listingStatus: 'active', verificationStatus: 'VERIFIED', ownerListing: ol } }; }
  return { patch: { listingStatus: 'draft', verificationStatus: 'PENDING', ownerListing: ol } };
}

/** the broker's mandate on a self-listed property just became ACTIVE → now it is matched */
export function onMandateActive(prop: Property) {
  const o = prop.ownerListing; if (!o) return;
  if (!prop.listingBrokerId || (o.assignedBrokerId && o.assignedBrokerId !== prop.listingBrokerId)) return;
  o.matchedAt = nowIso(); prop.listingStatus = 'active'; prop.verificationStatus = 'VERIFIED'; prop.updatedAt = nowIso();
  if (!['PAID', 'FREE', 'WAIVED_BROKER'].includes(o.feeStatus)) o.feeStatus = 'WAIVED_BROKER';
}

/** pool listings whose paid days ran out go back to the owner (renew to bring them back) */
export function sweepOwnerListings(now = Date.now()): number {
  let n = 0;
  for (const p of st().properties) {
    const o = p.ownerListing; if (!o || !['pending_verification', 'active'].includes(p.listingStatus) || o.assignedBrokerId || o.matchedAt) continue;
    if (['FREE', 'PAID'].includes(o.feeStatus) && o.liveUntil && Date.parse(o.liveUntil) < now) {
      o.feeStatus = 'EXPIRED'; p.listingStatus = 'draft'; p.updatedAt = nowIso(); n++;
      alert(p.ownerId, 'deals', 'Your listing time is over', `${p.title} — renew to show it to brokers again.`, '/');
    }
  }
  if (n) db.save();
  return n;
}

// ───────────────────────────── public: owner mobile sign-in ─────────────────────────────
const OTPS = new Map<string, { hash: string; exp: number; tries: number }>();
export function createOwnerAuthRouter() {
  const r = Router();
  r.post('/otp', rateLimit('owner-otp-ip', 20, 3600_000), async (req: Request, res: Response) => {
    const phone = phone10(req.body?.phone);
    if (!PHONE_RE.test(phone)) return bad(res, 'Enter your 10-digit mobile number');
    if (hit(`owner-otp:${phone}`, 5, 3600_000, 3600_000) > 0) return bad(res, 'Too many codes for this number — try again in an hour.', 429);
    const smsOn = !!process.env.SMS_WEBHOOK_URL;
    if (!smsOn && !DEMO_MODE) return bad(res, 'SMS is not set up on this server, so a code cannot be sent.', 503, 'NO_SMS');
    const ex = st().users.find(u => phone10(u.phone) === phone && u.role === 'PROPERTY_OWNER');
    if (ex && !ex.selfSignup) return bad(res, 'This number already has a GENZ owner account with a password — sign in with it.', 409, 'USE_PASSWORD');
    const code = secureOtp();
    OTPS.set(phone, { hash: hm('owner-otp', `${phone}|${code}`), exp: Date.now() + 10 * 60_000, tries: 0 });
    await sendSms(phone, `GENZ: your code is ${code} (valid 10 minutes). Do not share it.`);
    res.json({ success: true, exists: !!ex, ...(!smsOn && DEMO_MODE ? { devCode: code } : {}) });
  });
  r.post('/verify', rateLimit('owner-verify-ip', 40, 3600_000), (req: Request, res: Response) => {
    const phone = phone10(req.body?.phone); const code = String(req.body?.code || '').replace(/\D/g, '');
    const o = OTPS.get(phone);
    if (!o || o.exp < Date.now()) return bad(res, 'The code has expired — ask for a new one.', 400, 'EXPIRED');
    if (++o.tries > 5) { OTPS.delete(phone); return bad(res, 'Too many wrong tries — ask for a new code.', 429); }
    if (!safeEqual(o.hash, hm('owner-otp', `${phone}|${code}`))) return bad(res, 'That code is not right.', 400, 'WRONG_CODE');
    const s = st(); const now = nowIso();
    let u = s.users.find(x => phone10(x.phone) === phone && x.role === 'PROPERTY_OWNER');
    if (u && !u.selfSignup) return bad(res, 'This number already has a GENZ owner account with a password — sign in with it.', 409, 'USE_PASSWORD');
    if (u && ['BLACKLISTED', 'REJECTED', 'SUSPENDED'].includes(u.verificationStatus)) return bad(res, `This account is ${u.verificationStatus.toLowerCase()}. Contact GENZ.`, 403);
    if (!u) {
      const name = str(req.body?.name, 80);
      if (name.length < 2) return bad(res, 'Write your name to create your account', 400, 'NAME_REQUIRED');
      if (s.users.some(x => phone10(x.phone) === phone && x.role !== 'PROPERTY_OWNER')) return bad(res, 'This number belongs to another kind of GENZ account.', 409);
      if (req.body?.consent !== true) return bad(res, 'Please agree to GENZ keeping your name and mobile number to run your listing', 400, 'CONSENT_REQUIRED');
      u = {
        id: `USR-OWN-${Date.now()}${crypto.randomBytes(2).toString('hex')}`, name, email: `owner-${phone}@phone.genz.local`, phone: `+91 ${phone}`, role: 'PROPERTY_OWNER', city: str(req.body?.city, 60),
        consent: { policyVersion: 'owner-1', acceptedAt: now }, verificationStatus: 'VERIFIED', verificationNotes: 'Self sign-up with mobile OTP (mobile verified; ID / title checks are separate).',
        createdAt: now, sessionVersion: 1, selfSignup: true,
      } as UserProfile;
      s.users.push(u);
      db.appendAuditEvent(u.id, u.role, 'VERIFICATION', u.id, 'OWNER_SELF_SIGNUP', `Owner ${name} signed up with a mobile OTP (••${phone.slice(-4)})`);
    }
    OTPS.delete(phone); resetHits(`owner-otp:${phone}`);
    u.lastLoginAt = now; db.save();
    setSessionCookie(req, res, signSession(u.id, u.sessionVersion || 1));
    res.json({ success: true, created: !s.users.some(x => x !== u && x.id === u!.id), user: { id: u.id, name: u.name, role: u.role, phone: u.phone, city: u.city, verificationStatus: u.verificationStatus }, permissions: effectivePermissions(u) });
  });
  /** an owner without a password asks for the one-time code that stands in for it when he signs a mandate */
  r.post('/sign-code', rateLimit('owner-sign-code', 10, 3600_000), async (_req: Request, res: Response) => {
    const u = ctx().user as UserProfile | null;
    if (!u) return bad(res, 'Authentication required', 401);
    if (!u.selfSignup) return bad(res, 'You sign with your password', 409);
    const code = issueSignCode(u.id); const smsOn = !!process.env.SMS_WEBHOOK_URL;
    if (!smsOn && !DEMO_MODE) return bad(res, 'SMS is not set up on this server, so a code cannot be sent.', 503, 'NO_SMS');
    await sendSms(phone10(u.phone), `GENZ: your signing code is ${code} (valid 10 minutes). Share it with nobody.`);
    res.json({ success: true, ...(!smsOn && DEMO_MODE ? { devCode: code } : {}) });
  });
  return r;
}

// ───────────────────────────── owner + broker + admin ─────────────────────────────
const feeView = (p: Property) => {
  const o = p.ownerListing!;
  return { ...o, propertyId: p.id, title: p.title, listingStatus: p.listingStatus, locality: p.locality, city: p.city, askingPrice: p.askingPrice, transactionType: p.transactionType, propertyType: p.propertyType, inPool: inPool(p), listingBrokerId: p.listingBrokerId || '' };
};
const mineProp = (req: Request, res: Response): Property | null => {
  const u = me(); const p = st().properties.find(x => x.id === req.params.pid);
  if (!p || !p.ownerListing || p.ownerId !== u.id) { bad(res, 'Listing not found', 404); return null; }
  return p;
};
const staffAlert = (text: string, body: string) => alert(st().users.filter(a => (a.role === 'ADMIN' || a.role === 'SUPERADMIN') && a.verificationStatus === 'VERIFIED').slice(0, 20).map(a => a.id), 'deals', text, body, '/');

export function createOwnerListingRouter() {
  const r = Router();
  const manage = needs('ownerlist:manage');

  r.get('/config', needs('property:read'), (_req, res) => {
    const s = st();
    res.json({ success: true, enabled: s.ownerListCfg.enabled, upiId: s.ownerListCfg.upiId, payeeName: s.ownerListCfg.payeeName, plans: s.ownerListPlans.filter(p => p.active).map(({ id, name, transactionTypes, propertyTypes, fee, durationDays, maxPhotos, maxActivePerOwner, refundable, note }) => ({ id, name, transactionTypes, propertyTypes, fee, durationDays, maxPhotos, maxActivePerOwner, refundable, note })) });
  });
  r.get('/quote', needs('property:read'), (req, res) => {
    const p = pickOwnerPlan(st().ownerListPlans, String(req.query.transactionType || ''), String(req.query.propertyType || ''));
    res.json({ success: true, plan: p ? { id: p.id, name: p.name, fee: p.fee, durationDays: p.durationDays, maxPhotos: p.maxPhotos, refundable: p.refundable, note: p.note } : null });
  });
  r.get('/mine', needs('property:read'), (_req, res) => {
    const u = me(); const s = st();
    const rows = s.properties.filter(p => p.ownerId === u.id && p.ownerListing).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(feeView);
    res.json({ success: true, listings: rows, upiId: s.ownerListCfg.upiId, payeeName: s.ownerListCfg.payeeName });
  });

  /** verified brokers: the owner-listed homes open in the pool (seen, not matched) and whether I already asked */
  r.get('/pool', needs('property:read'), (_req, res) => {
    const u = me(); if (u.role !== 'BROKER') return res.json({ success: true, pool: [] });
    const rows = st().properties.filter(p => inPool(p)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 100).map(p => ({
      id: p.id, title: p.title, locality: p.locality, city: p.city, propertyType: p.propertyType, transactionType: p.transactionType, askingPrice: p.askingPrice, image: p.images?.[0] || '',
      requested: !!p.ownerListing!.requests.find(x => x.brokerId === u.id), requests: p.ownerListing!.requests.length, liveUntil: p.ownerListing!.liveUntil }));
    res.json({ success: true, pool: rows });
  });
  r.post('/:pid/pay', needs('property:create'), rateLimit('olist-pay', 30, 3600_000), (req, res) => {
    const p = mineProp(req, res); if (!p) return; const o = p.ownerListing!; const u = me();
    if (!['PENDING', 'REJECTED', 'EXPIRED'].includes(o.feeStatus) || !(o.fee > 0)) return bad(res, 'Nothing to pay on this listing', 409);
    const ref = safeRef(req.body?.ref); if (!ref) return bad(res, 'Write the UPI / bank reference (UTR) of your payment');
    const paidOn = str(req.body?.paidOn, 10) || nowIso().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Date.parse(paidOn) > Date.now() + DAY) return bad(res, 'Choose the date you paid (not a future date)');
    if (st().properties.some(x => x.id !== p.id && x.ownerListing?.ref === ref && ['WAITING_CONFIRM', 'PAID'].includes(x.ownerListing.feeStatus))) return bad(res, 'This reference is already used on another listing', 409);
    o.ref = ref; o.paidOn = paidOn; o.payNote = str(req.body?.note, 200) || undefined; o.rejectNote = undefined; o.feeStatus = 'WAITING_CONFIRM'; p.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', p.id, 'OWNER_LISTING_FEE_WRITTEN', `Owner wrote the listing fee payment ₹${o.fee} (ref ${ref})`);
    staffAlert('Listing fee to confirm', `${u.name}: ₹${o.fee} for ${p.title} (ref ${ref}).`);
    res.json({ success: true, listing: feeView(p) });
  });
  r.post('/:pid/renew', needs('property:create'), (req, res) => {
    const p = mineProp(req, res); if (!p) return; const o = p.ownerListing!;
    if (o.feeStatus !== 'EXPIRED') return bad(res, 'Only a listing whose time is over can be renewed', 409);
    const plan = pickOwnerPlan(st().ownerListPlans, p.transactionType, p.propertyType); if (!plan) return bad(res, 'No listing plan covers this kind of property now', 409, 'NO_PLAN');
    Object.assign(o, { planId: plan.id, planName: plan.name, fee: plan.fee, durationDays: plan.durationDays, refundable: plan.refundable, ref: undefined, paidOn: undefined, confirmedAt: undefined, confirmedById: undefined });
    if (plan.fee === 0) { o.feeStatus = 'FREE'; o.liveFrom = nowIso(); o.liveUntil = new Date(Date.now() + plan.durationDays * DAY).toISOString(); p.listingStatus = 'active'; p.verificationStatus = 'VERIFIED'; } else o.feeStatus = 'PENDING';
    p.updatedAt = nowIso(); db.save(); res.json({ success: true, listing: feeView(p) });
  });
  r.post('/:pid/via-broker', needs('property:create'), (req, res) => {
    const p = mineProp(req, res); if (!p) return; const o = p.ownerListing!; const u = me();
    if (!['PENDING', 'REJECTED', 'EXPIRED'].includes(o.feeStatus)) return bad(res, 'This listing is already paid for or with a broker', 409);
    const b = st().users.find(x => x.id === String(req.body?.brokerId) && x.role === 'BROKER' && x.verificationStatus === 'VERIFIED');
    if (!b) return bad(res, 'Choose a verified GENZ broker');
    o.feeStatus = 'WAIVED_BROKER'; o.assignedBrokerId = b.id; o.assignedAt = nowIso(); p.listingBrokerId = b.id; p.listingStatus = 'pending_verification'; p.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', p.id, 'OWNER_LISTING_VIA_BROKER', `Owner chose ${b.name} — no listing fee, live after the mandate`);
    alert(b.id, 'deals', 'An owner chose you', `${p.title} — create / sign the mandate to take it live.`, '/');
    res.json({ success: true, listing: feeView(p) });
  });
  r.post('/:pid/request', needs('property:read'), rateLimit('olist-req', 40, 3600_000), (req, res) => {
    const u = me(); const p = st().properties.find(x => x.id === req.params.pid);
    if (u.role !== 'BROKER' || u.verificationStatus !== 'VERIFIED') return bad(res, 'Only a verified GENZ broker can ask for a mandate', 403);
    if (!p || !p.ownerListing || !inPool(p)) return bad(res, 'This listing is not open in the pool', 404);
    const o = p.ownerListing;
    if (o.requests.some(x => x.brokerId === u.id)) return bad(res, 'You have already asked for this listing', 409);
    if (o.requests.length >= 20) return bad(res, 'Enough brokers have asked already', 409);
    o.requests.push({ brokerId: u.id, brokerName: u.name, note: str(req.body?.note, 200) || undefined, at: nowIso() }); p.updatedAt = nowIso(); db.save();
    alert(p.ownerId, 'deals', 'A broker wants your property', `${u.name} asked to take the mandate for ${p.title}.`, '/');
    res.json({ success: true });
  });
  r.post('/:pid/assign', needs('property:create'), (req, res) => {
    const p = mineProp(req, res); if (!p) return; const o = p.ownerListing!; const u = me();
    if (!inPool(p)) return bad(res, 'Only a listing that is open in the pool can be given to a broker', 409);
    const rq = o.requests.find(x => x.brokerId === String(req.body?.brokerId)); if (!rq) return bad(res, 'Choose one of the brokers who asked', 400);
    const b = st().users.find(x => x.id === rq.brokerId && x.role === 'BROKER' && x.verificationStatus === 'VERIFIED'); if (!b) return bad(res, 'That broker is not active now', 409);
    o.assignedBrokerId = b.id; o.assignedAt = nowIso(); p.listingBrokerId = b.id; p.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', p.id, 'OWNER_LISTING_ASSIGNED', `Owner gave the listing to ${b.name} — matched only after the mandate is signed`);
    alert(b.id, 'deals', 'The owner chose you ✔', `${p.title} — create / sign the mandate to start matching.`, '/');
    res.json({ success: true, listing: feeView(p) });
  });
  r.post('/:pid/unassign', needs('property:create'), (req, res) => {
    const p = mineProp(req, res); if (!p) return; const o = p.ownerListing!; const u = me();
    if (!o.assignedBrokerId || p.listingStatus === 'active' || o.matchedAt) return bad(res, 'The mandate is already signed — use the mandate to change the broker', 409);
    const was = o.assignedBrokerId; o.assignedBrokerId = undefined; o.assignedAt = undefined; p.listingBrokerId = '';
    if (o.feeStatus === 'WAIVED_BROKER') { o.feeStatus = 'PENDING'; p.listingStatus = 'draft'; }
    p.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', p.id, 'OWNER_LISTING_UNASSIGNED', 'Owner took the listing back before the mandate was signed');
    alert(was, 'deals', 'The owner changed his mind', `${p.title} is no longer assigned to you.`, '/');
    res.json({ success: true, listing: feeView(p) });
  });

  // ── GENZ staff ──
  r.get('/admin/overview', manage, (_req, res) => {
    const s = st();
    const waiting = s.properties.filter(p => p.ownerListing?.feeStatus === 'WAITING_CONFIRM').map(p => ({ ...feeView(p), ownerName: p.ownerName, ownerId: p.ownerId }));
    res.json({ success: true, cfg: s.ownerListCfg, plans: s.ownerListPlans, waiting, counts: { pool: s.properties.filter(p => inPool(p)).length, total: s.properties.filter(p => p.ownerListing).length } });
  });
  r.put('/admin/config', manage, (req, res) => {
    const s = st(); const b = req.body || {};
    if (typeof b.enabled === 'boolean') s.ownerListCfg.enabled = b.enabled;
    if (typeof b.upiId === 'string') { const v = b.upiId.trim(); if (v && !/^[A-Za-z0-9._-]{2,40}@[A-Za-z]{2,20}$/.test(v)) return bad(res, 'That UPI ID does not look right (like name@bank)'); s.ownerListCfg.upiId = v; }
    if (typeof b.payeeName === 'string') s.ownerListCfg.payeeName = b.payeeName.trim().slice(0, 60) || 'GENZ BUILDCON';
    db.save(); const u = me(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', 'ownerListCfg', 'OWNER_LISTING_CONFIG', `Owner listing ${s.ownerListCfg.enabled ? 'on' : 'off'}`);
    res.json({ success: true, cfg: s.ownerListCfg });
  });
  const readPlan = (b: any, base?: OwnerListPlan): Partial<OwnerListPlan> | string => {
    const tx = Array.isArray(b?.transactionTypes) ? b.transactionTypes.filter((x: any) => ['Sale', 'Rent', 'Lease'].includes(x)) : base?.transactionTypes || [];
    const pt = Array.isArray(b?.propertyTypes) ? b.propertyTypes.map((x: any) => str(x, 60)).filter(Boolean).slice(0, 20) : base?.propertyTypes || [];
    const p = { name: str(b?.name, 60) || base?.name, active: typeof b?.active === 'boolean' ? b.active : base?.active ?? true, transactionTypes: tx, propertyTypes: pt,
      fee: b?.fee === undefined ? base?.fee : Number(b.fee), durationDays: b?.durationDays === undefined ? base?.durationDays : Number(b.durationDays), maxPhotos: b?.maxPhotos === undefined ? base?.maxPhotos : Number(b.maxPhotos),
      maxActivePerOwner: b?.maxActivePerOwner === undefined ? base?.maxActivePerOwner : Number(b.maxActivePerOwner), refundable: typeof b?.refundable === 'boolean' ? b.refundable : base?.refundable ?? false, note: str(b?.note, 200) || undefined };
    return planProblem(p) || p;
  };
  r.post('/admin/plans', manage, (req, res) => {
    const p = readPlan(req.body); if (typeof p === 'string') return bad(res, p);
    const now = nowIso(); const plan: OwnerListPlan = { id: rid('OLP'), createdAt: now, updatedAt: now, ...(p as any) };
    st().ownerListPlans.push(plan); db.save(); const u = me(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', plan.id, 'OWNER_PLAN_CREATED', `Owner listing plan "${plan.name}" ₹${plan.fee} / ${plan.durationDays} days`);
    res.json({ success: true, plan });
  });
  r.put('/admin/plans/:id', manage, (req, res) => {
    const plan = st().ownerListPlans.find(x => x.id === req.params.id); if (!plan) return bad(res, 'Plan not found', 404);
    const p = readPlan(req.body, plan); if (typeof p === 'string') return bad(res, p);
    Object.assign(plan, p, { updatedAt: nowIso() }); db.save(); const u = me(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', plan.id, 'OWNER_PLAN_CHANGED', `Owner listing plan "${plan.name}" changed — new listings only`);
    res.json({ success: true, plan });
  });
  r.delete('/admin/plans/:id', manage, (req, res) => {
    const s = st(); const plan = s.ownerListPlans.find(x => x.id === req.params.id); if (!plan) return bad(res, 'Plan not found', 404);
    if (s.properties.some(p => p.ownerListing?.planId === plan.id && OPEN.includes(p.listingStatus))) { plan.active = false; db.save(); return res.json({ success: true, deactivated: true }); }
    s.ownerListPlans = s.ownerListPlans.filter(x => x.id !== plan.id); db.save(); res.json({ success: true });
  });
  r.post('/:pid/confirm', manage, (req, res) => {
    const u = me(); const p = st().properties.find(x => x.id === req.params.pid); const o = p?.ownerListing;
    if (!p || !o || o.feeStatus !== 'WAITING_CONFIRM') return bad(res, 'No payment is waiting on this listing', 404);
    o.feeStatus = 'PAID'; o.confirmedById = u.id; o.confirmedAt = nowIso(); o.liveFrom = nowIso(); o.liveUntil = new Date(Date.now() + o.durationDays * DAY).toISOString();
    p.listingStatus = 'active'; p.verificationStatus = 'VERIFIED'; p.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', p.id, 'OWNER_LISTING_FEE_CONFIRMED', `Listing fee ₹${o.fee} confirmed — listing is in the pool for ${o.durationDays} days`);
    alert(p.ownerId, 'deals', 'Your listing is live ✔', `${p.title} — it is live — buyers can be matched and offers can come. Before any token or payment, choose a broker and sign the mandate.`, '/');
    res.json({ success: true, listing: feeView(p) });
  });
  r.post('/:pid/reject', manage, (req, res) => {
    const u = me(); const p = st().properties.find(x => x.id === req.params.pid); const o = p?.ownerListing;
    if (!p || !o || o.feeStatus !== 'WAITING_CONFIRM') return bad(res, 'No payment is waiting on this listing', 404);
    const note = str(req.body?.note, 200); if (note.length < 3) return bad(res, 'Write a short reason');
    o.feeStatus = 'REJECTED'; o.rejectNote = note; p.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', p.id, 'OWNER_LISTING_FEE_REJECTED', `Listing fee not received: ${note}`);
    alert(p.ownerId, 'deals', 'Payment not found', `${p.title}: ${note}. Write the correct reference.`, '/');
    res.json({ success: true, listing: feeView(p) });
  });
  return r;
}
