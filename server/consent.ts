/**
 * v26 — WhatsApp paste → draft listings → OWNER CONSENT → publish.   /api/consent  (+ public page /oc/:token)
 *
 *  Broker (`property:create`):
 *    POST   /paste                 text → drafts (private to the broker; never visible to anyone else)
 *    GET    /drafts                his drafts with their consent state
 *    PUT    /drafts/:id            complete / correct a draft
 *    DELETE /drafts/:id            throw it away (an open consent request is withdrawn)
 *    POST   /drafts/:id/check      “is this property already with another GENZ broker?”
 *    POST   /drafts/:id/request    consent LINK for WhatsApp (+ owner code by SMS when a gateway is set)
 *    POST   /drafts/:id/paper      photo of the owner's signed form → GENZ admin checks it
 *    GET    /drafts/:id/form       printable consent form
 *    GET    /mine                  his consents and bonds (protection end dates)
 *  Admin (`property:moderate`):
 *    GET    /admin/queue           signed forms to check, links opened on the broker's own device, owner reports
 *    GET    /admin/:id/paper       the form photo
 *    POST   /admin/:id/decide      accept / reject a signed form
 *    POST   /admin/:id/void        cancel a consent (owner says he never agreed) — the bond ends at once
 *  Owner (no login):
 *    GET/POST /oc/:token           read the details and say yes / no; later: “I never agreed” report
 *
 * Publishing goes through the normal POST /api/properties with `consentId` — that route calls `consentForPublish()` and
 * `findBlockingBond()` here, so the same-property rule also stops a second broker who uses the normal listing form.
 */
import express, { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { db } from './db.js';
import type { ListingDraft, OwnerConsent, UserProfile, Property } from './db.js';
import { ctx, needs, rateLimit, secret, verifySession, parseCookies, COOKIE_NAME, hit, secureOtp, safeEqual } from './auth.js';
import { sendSms } from './notify.js';
import { generateMandateHash } from './validation.js';
import { can } from './permissions.js';
import { awardPoints } from './community.js';
import { pushTo } from './webpush.js';
import { checkDays, daysFor, currentProtection } from './protection.js';
import { parsePaste, PASTE_MAX_CHARS, priceLabel, stripPhones } from '../src/shared/waParse.js';
import { draftMissing, needMissing, termsOf, termsLine, validInitials, SIGN_MIN_POINTS, SIGN_MAX_BYTES } from '../src/shared/consentRules.js';
import { looseKeyText, sameArea, phone10, consentWords, CONSENT_LINK_DAYS, CONSENT_FORM_VERSION, MAX_OPEN_DRAFTS, TAKEN_MSG, STATUS_LABEL } from '../src/shared/consentRules.js';
import { PROPERTY_TYPES, findState } from '../src/shared/india.js';
import { sniffMime } from '../src/shared/propDocs.js';
import { daysLabel } from '../src/shared/protectionRules.js';
import { TOP_CITIES, normCity } from '../src/shared/cities.js';
/** v28 — older listings often carry only the city: take the state from the city when we know it */
const stateFor = (state: unknown, city: unknown) => findState(String(state || ''))?.name || TOP_CITIES.find(c => c.name === normCity(city))?.state || String(state || '');

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
import { partyBlock } from './partywatch.js';
const hmac = (tag: string, v: string) => crypto.createHmac('sha256', secret()).update(`${tag}|${v}`).digest('hex');
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const PAPER_DIR = () => path.resolve(process.cwd(), 'data', 'consent-papers');
const PAPER_MAX = 4 * 1024 * 1024;
const SIG_DIR = () => path.resolve(process.cwd(), 'data', 'consent-signatures');
const PHONE_RE = /^[6-9]\d{9}$/;

export const keyOf = (p: { ownerPhone: string; city: string; locality: string; propertyType: string }) => hmac('oc-key', looseKeyText(p));
const ipOf = (req: Request) => hmac('oc-ip', String(req.ip || req.socket.remoteAddress || ''));
const uaOf = (req: Request) => hmac('oc-ua', String(req.headers['user-agent'] || ''));
const bondActive = (c: OwnerConsent, now = Date.now()) => c.status === 'ACCEPTED' && !!c.expiresAt && Date.parse(c.expiresAt) > now;
const note = (c: OwnerConsent, text: string) => { c.events.push({ at: nowIso(), text }); if (c.events.length > 40) c.events.splice(0, c.events.length - 40); c.updatedAt = nowIso(); };
const smsOn = () => !!process.env.SMS_WEBHOOK_URL;
/** 15 Jan 2027 — the owner reads Indian dates, not ISO */
const dIN = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
const publicBase = (req: Request) => (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

/** an ACTIVE bond of ANOTHER broker on the same property (owner phone + city + locality + type, area within 10 %) */
export function findBlockingBond(p: { ownerPhone: string; city: string; locality: string; propertyType: string; areaSqft?: number }, brokerId: string, exceptConsentId = ''): OwnerConsent | undefined {
  if (!PHONE_RE.test(phone10(p.ownerPhone))) return undefined;
  const key = keyOf(p);
  return st().ownerConsents.find(c => c.id !== exceptConsentId && c.brokerId !== brokerId && c.looseKeyHash === key && bondActive(c) && sameArea(c.snapshot.areaSqft, p.areaSqft));
}
/** what the blocked broker may see: when the protection ends and (if the listing is live) which listing to co-broke on */
export function blockedAnswer(c: OwnerConsent) {
  const prop = c.propertyId ? db.byId('properties', c.propertyId) as Property | undefined : undefined;
  const live = prop && prop.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(prop.listingStatus);
  return { error: TAKEN_MSG.en, hi: TAKEN_MSG.hi, code: 'CONSENT_TAKEN', protectedUntil: c.expiresAt, coBrokePropertyId: live ? prop!.id : undefined };
}

/** POST /api/properties with consentId → the consent if this broker may publish this property with it */
export function consentForPublish(consentId: string, brokerId: string, data: { ownerPhone: string; city: string; locality: string; propertyType: string }): { consent: OwnerConsent } | { error: string; status: number; code: string } {
  const c = st().ownerConsents.find(x => x.id === consentId);
  if (!c || c.brokerId !== brokerId) return { error: 'Consent not found', status: 404, code: 'CONSENT_NOT_FOUND' };
  if (!bondActive(c)) return { error: c.status === 'ACCEPTED' ? 'This consent has run out — ask the owner again.' : 'The owner has not given consent yet.', status: 409, code: 'CONSENT_NOT_ACCEPTED' };
  if (c.propertyId) return { error: 'This consent is already used for a listing.', status: 409, code: 'CONSENT_USED' };
  if (keyOf(data) !== c.looseKeyHash) return { error: 'The owner agreed to a different property (owner phone, city, locality or type changed). Ask the owner again for these details.', status: 409, code: 'CONSENT_MISMATCH' };
  if (c.terms && Number((data as any).askingPrice) !== c.terms.advertised) return { error: `The owner agreed to the price ${priceLabel(c.terms.advertised, false)} with this brokerage. To list at another price, ask the owner again.`, status: 409, code: 'CONSENT_MISMATCH' };
  return { consent: c };
}
export function markPublished(c: OwnerConsent, prop: Property) {
  c.propertyId = prop.id;
  note(c, `Published as listing ${prop.id}`);
  prop.ownerConsentId = c.id; prop.protectionUntil = c.expiresAt; prop.ownerKeyHash = c.looseKeyHash;
  const d = c.draftId ? st().listingDrafts.find(x => x.id === c.draftId) : undefined;
  if (d) { d.status = 'PUBLISHED'; d.propertyId = prop.id; d.updatedAt = nowIso(); }
  activateMandate(c, prop);
}

/** v27 — the owner said yes to the brokerage (and signed), the broker signed with his password: the mandate is ACTIVE the moment the listing is live */
function activateMandate(c: OwnerConsent, prop: Property) {
  const t = c.terms; if (!t || c.mandateId) return;
  const s = st(); const now = nowIso();
  for (const m of s.ownerMandates) {
    if (m.propertyId !== prop.id) continue;
    if (m.status === 'ACTIVE') { m.status = 'SUPERSEDED'; m.isConfirmed = false; } else if (m.status === 'PENDING_BROKER') m.status = 'WITHDRAWN';
  }
  const nums = s.ownerMandates.map(m => Number(/OM-2026-(\d+)/.exec(m.id)?.[1] || 0));
  const id = `OM-2026-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
  const m: any = {
    id, propertyId: prop.id, ownerId: '', brokerId: c.brokerId, advertisedPrice: t.advertised, approvedNetPrice: t.net, remunerationBasis: t.basis,
    agreedCommissionPct: t.pct, fixedFeeAmount: t.fee, protectionPeriodDays: c.protectionDays,
    agreementHash: generateMandateHash({ propertyId: prop.id, ownerId: `consent:${c.id}`, approvedNetPrice: t.net, agreedCommissionPct: t.pct, remunerationBasis: t.basis, fixedFeeAmount: t.fee, timestamp: now }),
    status: 'ACTIVE', ownerSignedAt: c.acceptedAt || now, brokerSignedAt: t.brokerSignedAt || now, isConfirmed: true, confirmedAt: now, createdAt: now,
    consentId: c.id, offPlatformOwner: { name: c.ownerTypedName || c.ownerName, phoneLast4: c.ownerPhoneLast4 },
  };
  s.ownerMandates.unshift(m); c.mandateId = id;
  if (prop.askingPrice !== t.advertised) { prop.priceHistory = [...(prop.priceHistory || []), { price: t.advertised, changedAt: now, reason: `Brokerage mandate ${id}` }]; prop.askingPrice = t.advertised; }
  if (t.basis === 'SURPLUS_ABOVE_NET') prop.ownerApprovedNetPrice = t.net;
  prop.updatedAt = now;
  s.dealRooms.filter(d => d.propertyId === prop.id).forEach(d => { d.ownerRemunerationConfirmed = true; });
  const u = db.byId('users', c.brokerId) as UserProfile | undefined;
  note(c, `Brokerage mandate ${id} is ACTIVE (owner signed on the link / form, broker signed with his password)`);
  db.appendAuditEvent(c.brokerId, u?.role || 'BROKER', 'PROPERTY', id, 'OWNER_MANDATE_ACTIVATED', `Mandate ${id} for ${prop.id} is ACTIVE from owner consent ${c.id}: ${termsLine(t).kind.en}. Seal ${m.agreementHash.slice(0, 16)}…`);
}
/** the published listing's own key, so the same-property rule also covers listings made with the normal form */
export const listingKey = keyOf;
export { draftMissing };

// ───────────────────────── drafts ─────────────────────────
const draftFields = z.object({
  title: z.string().trim().max(160), description: z.string().trim().max(5000),
  propertyType: z.enum(PROPERTY_TYPES).or(z.literal('')), transactionType: z.enum(['Sale', 'Rent', 'Lease']).or(z.literal('')),
  state: z.string().trim().max(80), city: z.string().trim().max(80), locality: z.string().trim().max(80), addressHidden: z.string().trim().max(300),
  areaSqft: z.number().nonnegative().max(100_000_000).nullable(), bhk: z.number().int().min(0).max(20).nullable(),
  askingPrice: z.number().nonnegative().max(1e12).nullable(), ownerApprovedNetPrice: z.number().nonnegative().max(1e12).nullable(),
  ownerName: z.string().trim().max(120), ownerPhone: z.string().trim().max(20), tags: z.array(z.string().max(40)).max(20),
  /** v27 — how the listing broker is paid (optional; chosen → the owner signs it with his yes and a mandate is made at publish) */
  remunerationBasis: z.enum(['SURPLUS_ABOVE_NET', 'PERCENTAGE', 'FIXED_FEE']).or(z.literal('')),
  /** v28 — buyer-need drafts */
  customerName: z.string().trim().max(120), customerPhone: z.string().trim().max(20),
  budgetMin: z.number().nonnegative().max(1e12).nullable(), budgetMax: z.number().nonnegative().max(1e12).nullable(),
  localities: z.array(z.string().trim().max(80)).max(10),
  purpose: z.enum(['Self-use', 'Investment', 'Rental Yield', 'Commercial Relocation']), urgency: z.enum(['Immediate (< 15 days)', 'Moderate (1-3 months)', 'Exploratory (3-6 months)']),
  agreedCommissionPct: z.number().nonnegative().max(100).nullable(), fixedFeeAmount: z.number().nonnegative().max(1e12).nullable(),
}).partial();

function draftView(d: ListingDraft) {
  const c = d.consentId ? st().ownerConsents.find(x => x.id === d.consentId) : undefined;
  return {
    id: d.id, kind: d.kind || 'LISTING', status: d.status, raw: d.raw, fields: d.fields, missing: d.kind === 'NEED' ? needMissing(d.fields) : draftMissing(d.fields), propertyId: d.propertyId, requirementId: d.requirementId, createdAt: d.createdAt, updatedAt: d.updatedAt,
    consent: c ? consentView(c) : null,
  };
}
function consentView(c: OwnerConsent) {
  return {
    id: c.id, method: c.method, status: c.status, label: STATUS_LABEL[c.status], protectionDays: c.protectionDays, acceptedAt: c.acceptedAt, expiresAt: c.expiresAt,
    bondActive: bondActive(c), linkExpiresAt: c.linkExpiresAt, ownerName: c.ownerName, ownerPhoneLast4: c.ownerPhoneLast4, propertyId: c.propertyId,
    title: c.snapshot.title, locality: c.snapshot.locality, city: c.snapshot.city, flagged: !!c.evidence?.sameDeviceSuspected, ownerReported: !!c.ownerReport,
    reviewNote: c.review && !c.review.approve ? c.review.note : undefined, otpNeeded: !!c.otpHash && c.status === 'PENDING',
    terms: c.terms || null, signature: signatureSummary(c.id), ownerTypedName: c.ownerTypedName, mandateId: c.mandateId,
  };
}
/** what the owner signed with: typed initials and / or a drawn signature (never the picture itself) */
export function signatureSummary(consentId: string) {
  const c = st().ownerConsents.find(x => x.id === consentId);
  return c?.ownerSignature ? { initials: c.ownerSignature.initials, drawn: c.ownerSignature.drawn, at: c.ownerSignature.at, name: c.ownerTypedName } : null;
}
function nextId(prefix: string, list: { id: string }[]) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(100, 999)}${list.length % 10}`;
}
function myDraft(req: Request, res: Response): ListingDraft | null {
  const d = st().listingDrafts.find(x => x.id === req.params.id && x.brokerId === me().id && x.status !== 'DISCARDED');
  if (!d) { bad(res, 'Draft not found', 404); return null; }
  return d;
}
function snapshotOf(f: Record<string, any>) {
  return {
    title: String(f.title || '').slice(0, 160) || `${f.propertyType} in ${f.locality}`, propertyType: f.propertyType, transactionType: f.transactionType,
    city: String(f.city).trim(), state: findState(f.state)?.name, locality: String(f.locality).trim(), price: Number(f.askingPrice) || 0, areaSqft: Number(f.areaSqft) || undefined,
  };
}
const openConsentOf = (d: ListingDraft) => d.consentId ? st().ownerConsents.find(x => x.id === d.consentId && ['PENDING', 'PAPER_REVIEW', 'ACCEPTED'].includes(x.status)) : undefined;

/**
 * v28 — an owner-approval draft for a listing that went live WITHOUT the owner's consent (normal form, older listings):
 * the broker sends the owner the WhatsApp link from it; the yes then puts the protection date (and mandate) on the listing.
 */
export function draftForProperty(u: UserProfile, p: Property): { draft: ListingDraft } | { error: string; code: string } {
  const s = st();
  if (['sold', 'rented', 'withdrawn', 'suspended'].includes(p.listingStatus)) return { error: `This listing is ${p.listingStatus}.`, code: 'LISTING_CLOSED' };
  const c = p.ownerConsentId ? s.ownerConsents.find(x => x.id === p.ownerConsentId) : undefined;
  if (c && bondActive(c)) return { error: 'The owner has already approved this listing.', code: 'ALREADY_APPROVED' };
  const have = s.listingDrafts.find(d => d.brokerId === u.id && d.fields?.forPropertyId === p.id && ['DRAFT', 'CONSENT_PENDING', 'READY'].includes(d.status));
  if (have) return { draft: have };
  const fields: Record<string, any> = {
    title: p.title, description: p.description, propertyType: p.propertyType, transactionType: p.transactionType, state: stateFor(p.state, p.city), city: p.city, locality: p.locality,
    addressHidden: p.addressHidden || '', areaSqft: p.builtUpAreaSqFt || p.plotAreaSqFt || null, bhk: null, askingPrice: p.askingPrice, ownerApprovedNetPrice: null,
    ownerName: p.ownerName || '', ownerPhone: phone10(p.ownerPhone), tags: p.tags || [], forPropertyId: p.id, remunerationBasis: '', agreedCommissionPct: null, fixedFeeAmount: null,
  };
  const d: ListingDraft = { id: nextId('LD', s.listingDrafts), brokerId: u.id, kind: 'LISTING', status: 'DRAFT', raw: `Listing ${p.id} — owner approval`, fields, createdAt: nowIso(), updatedAt: nowIso() };
  s.listingDrafts.unshift(d);
  return { draft: d };
}

export function createConsentRouter() {
  const r = Router();
  const big = express.json({ limit: '6mb' });

  r.post('/paste', needs('property:create'), rateLimit('wa-paste', 30, 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const text = String(req.body?.text ?? '');
    if (!text.trim()) return bad(res, 'Paste the WhatsApp messages first.');
    if (text.length > PASTE_MAX_CHARS) return bad(res, `Paste at most ${PASTE_MAX_CHARS.toLocaleString('en-IN')} characters at a time.`);
    const open = s.listingDrafts.filter(d => d.brokerId === u.id && ['DRAFT', 'CONSENT_PENDING', 'READY'].includes(d.status)).length;
    const items = parsePaste(text);
    if (!items.length) return bad(res, 'No property message was found in the text. Each message needs at least the kind of property and a price or size.', 400, { code: 'NOTHING_FOUND' });
    if (open + items.length > MAX_OPEN_DRAFTS) return bad(res, `You already have ${open} drafts. Finish or delete some first (at most ${MAX_OPEN_DRAFTS}).`, 409);
    const homeCity = String(u.city || '').trim();
    const out: ListingDraft[] = [];
    for (const it of items) {
      const city = it.city || homeCity;
      if (it.kind === 'NEED') {
        const nf: Record<string, any> = {
          title: it.title, description: stripPhones(it.raw).slice(0, 1500), propertyType: it.propertyType || '', transactionType: it.transactionType || 'Sale',
          state: it.state || (city === homeCity && u.state ? u.state : stateFor('', city)), city, localities: it.localities || [], budgetMin: it.budgetMin ?? null, budgetMax: it.budgetMax ?? null,
          minAreaSqFt: it.areaSqft ?? null, bhk: it.bhk ?? null, customerName: '', customerPhone: '', tags: it.tags, phonesFound: it.phones,
          purpose: 'Self-use', urgency: 'Moderate (1-3 months)',
        };
        out.push({ id: nextId('LD', s.listingDrafts), brokerId: u.id, kind: 'NEED', status: 'DRAFT', raw: it.raw, fields: nf, createdAt: nowIso(), updatedAt: nowIso() });
        continue;
      }
      const fields: Record<string, any> = {
        title: it.title, description: stripPhones(it.raw).slice(0, 1500), propertyType: it.propertyType || '', transactionType: it.transactionType || '',
        state: it.state || (city === homeCity && u.state ? u.state : stateFor('', city)), city, locality: it.locality || '', addressHidden: '',
        areaSqft: it.areaSqft ?? null, bhk: it.bhk ?? null, askingPrice: it.price ?? null, ownerApprovedNetPrice: null,
        ownerName: '', ownerPhone: '', tags: it.tags, phonesFound: it.phones,
      };
      const d: ListingDraft = { id: nextId('LD', s.listingDrafts), brokerId: u.id, status: 'DRAFT', raw: it.raw, fields, createdAt: nowIso(), updatedAt: nowIso() };
      out.push(d);
    }
    s.listingDrafts.unshift(...out); // newest paste on top, in the order the messages were pasted
    db.save();
    res.json({ success: true, drafts: out.map(draftView), found: out.length, needs: out.filter(d => d.kind === 'NEED').length });
  });

  /** v28 — a pasted requirement was saved as a Buyer Need (POST /api/requirements) → the draft is done */
  r.post('/drafts/:id/saved-need', needs('property:create'), (req: Request, res: Response) => {
    const d = myDraft(req, res); if (!d) return;
    if (d.kind !== 'NEED') return bad(res, 'Not a buyer-need draft', 400);
    const rq = db.byId('requirements', String(req.body?.requirementId || '')) as any;
    if (!rq || rq.assignedBrokerId !== me().id) return bad(res, 'Buyer need not found', 404);
    d.status = 'PUBLISHED'; d.requirementId = rq.id; d.updatedAt = nowIso();
    db.save();
    res.json({ success: true, draft: draftView(d) });
  });

  r.get('/drafts', needs('property:create'), (_req: Request, res: Response) => {
    const u = me();
    const list = st().listingDrafts.filter(d => d.brokerId === u.id && d.status !== 'DISCARDED').slice(0, 300);
    res.json({ success: true, drafts: list.map(draftView), protection: currentProtection(), smsCodes: smsOn() });
  });

  r.put('/drafts/:id', needs('property:create'), (req: Request, res: Response) => {
    const d = myDraft(req, res); if (!d) return;
    if (d.status === 'PUBLISHED') return bad(res, 'This draft is already published — edit the listing instead.', 409);
    const p = draftFields.safeParse(req.body?.fields ?? {});
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Check the details');
    const c = openConsentOf(d);
    const next = { ...d.fields, ...p.data };
    if (p.data.ownerPhone !== undefined) next.ownerPhone = phone10(p.data.ownerPhone) || p.data.ownerPhone;
    // the owner agreed to THESE facts: changing who / where / what after the request needs a fresh consent
    if (c && ['ownerPhone', 'city', 'locality', 'propertyType'].some(k => String((next as any)[k] ?? '') !== String((d.fields as any)[k] ?? ''))) {
      return bad(res, 'The owner was asked about the current owner phone, city, locality and type. To change these, withdraw the request first.', 409, { code: 'CONSENT_LOCKED' });
    }
    // the owner also read the price and the brokerage: changing them needs a fresh yes
    if (c && ['remunerationBasis', 'agreedCommissionPct', 'fixedFeeAmount', 'askingPrice', 'ownerApprovedNetPrice'].some(k => String((next as any)[k] ?? '') !== String((d.fields as any)[k] ?? ''))) {
      return bad(res, 'The owner was shown this price and brokerage. To change them, withdraw the request first.', 409, { code: 'CONSENT_LOCKED' });
    }
    d.fields = next; d.updatedAt = nowIso();
    db.save();
    res.json({ success: true, draft: draftView(d) });
  });

  r.delete('/drafts/:id', needs('property:create'), (req: Request, res: Response) => {
    const d = myDraft(req, res); if (!d) return;
    if (d.status === 'PUBLISHED') return bad(res, 'This draft is already a listing.', 409);
    const c = openConsentOf(d);
    if (c && c.status !== 'ACCEPTED') { c.status = 'WITHDRAWN'; c.tokenHash = undefined; note(c, 'Withdrawn by the broker (draft deleted)'); }
    d.status = 'DISCARDED'; d.updatedAt = nowIso();
    db.save();
    res.json({ success: true });
  });

  r.post('/drafts/:id/check', needs('property:create'), (req: Request, res: Response) => {
    const d = myDraft(req, res); if (!d) return;
    const f = d.fields;
    if (!PHONE_RE.test(phone10(f.ownerPhone)) || !f.city || !f.locality || !f.propertyType) return res.json({ success: true, state: 'INCOMPLETE' });
    const b = findBlockingBond({ ownerPhone: f.ownerPhone, city: f.city, locality: f.locality, propertyType: f.propertyType, areaSqft: f.areaSqft }, d.brokerId);
    if (b) return res.json({ success: true, state: 'TAKEN', ...blockedAnswer(b) });
    res.json({ success: true, state: 'FREE' });
  });

  /** shared by link + paper: everything that has to be true before the owner is asked */
  const prepare = (req: Request, res: Response, d: ListingDraft) => {
    if (d.kind === 'NEED') { bad(res, 'A buyer need does not need owner consent — save it as a Buyer Need.', 400, { code: 'NEED_DRAFT' }); return null; }
    if (d.status === 'PUBLISHED') { bad(res, 'Already published.', 409); return null; }
    const open = openConsentOf(d);
    if (open && open.status === 'ACCEPTED') { bad(res, 'The owner has already agreed — publish the listing.', 409, { code: 'ALREADY_ACCEPTED' }); return null; }
    const missing = draftMissing(d.fields);
    if (missing.length) { bad(res, 'Fill in the missing details first.', 400, { code: 'DRAFT_INCOMPLETE', missing }); return null; }
    const days = req.body?.protectionDays === undefined ? daysFor() : Number(req.body.protectionDays);
    const pp = checkDays(days);
    if (pp) { bad(res, pp.en, 400, { hi: pp.hi, code: pp.code }); return null; }
    const f = d.fields;
    { const pb = partyBlock(f.ownerPhone, 'owner'); if (pb) { res.status(403).json(pb); return null; } } // v35 — Network Watch
    const b = findBlockingBond({ ownerPhone: f.ownerPhone, city: f.city, locality: f.locality, propertyType: f.propertyType, areaSqft: f.areaSqft }, d.brokerId);
    if (b) { res.status(409).json(blockedAnswer(b)); return null; }
    // v27/v28 — brokerage: the broker (already signed in) confirms the terms with a tick; the owner signs them with his yes.
    // (v27 asked for the password here; browsers auto-filled a saved superadmin password into it, so it is a tick now.)
    const tt = termsOf(f);
    if (tt.problem) { bad(res, tt.problem.en, 400, { hi: tt.problem.hi, code: 'TERMS_INVALID' }); return null; }
    let terms: OwnerConsent['terms'];
    if (tt.terms) {
      if (req.body?.agreeTerms !== true) { bad(res, 'Tick “I agree to these brokerage terms” before sending them to the owner.', 400, { hi: 'मालिक को भेजने से पहले “मैं इन ब्रोकरेज शर्तों पर सहमत हूँ” पर टिक करें।', code: 'TERMS_NOT_AGREED' }); return null; }
      terms = { ...tt.terms, brokerSignedAt: nowIso() };
    }
    if (open) { open.status = 'WITHDRAWN'; open.tokenHash = undefined; note(open, 'Replaced by a new request'); }
    const s = st();
    const c: OwnerConsent = {
      id: nextId('OC', s.ownerConsents), brokerId: d.brokerId, draftId: d.id, method: 'LINK', status: 'PENDING',
      ownerName: String(f.ownerName).trim(), ownerPhoneLast4: phone10(f.ownerPhone).slice(-4), ownerPhoneHash: hmac('oc-phone', phone10(f.ownerPhone)),
      keyHash: keyOf(f as any), looseKeyHash: keyOf(f as any), snapshot: snapshotOf(f), protectionDays: days, ...(terms ? { terms } : {}),
      evidence: { brokerIpHash: ipOf(req), brokerUaHash: uaOf(req) }, events: [], createdAt: nowIso(), updatedAt: nowIso(),
    };
    return { c, f, s };
  };

  r.post('/drafts/:id/request', needs('property:create'), rateLimit('oc-request', 60, 3600_000), (req: Request, res: Response) => {
    const u = me();
    const d = myDraft(req, res); if (!d) return;
    const prep = prepare(req, res, d); if (!prep) return;
    const { c, f, s } = prep;
    const token = crypto.randomBytes(18).toString('base64url');
    c.tokenHash = sha(token);
    c.linkExpiresAt = new Date(Date.now() + CONSENT_LINK_DAYS * 86400_000).toISOString();
    const url = `${publicBase(req)}/oc/${token}`;
    let otp = '';
    if (smsOn()) { otp = secureOtp(); c.otpHash = hmac('oc-otp', `${c.id}|${otp}`); c.otpTries = 0; }
    note(c, `Consent link created (${c.protectionDays} days protection${c.terms ? `, brokerage ${c.terms.basis}` : ''})${otp ? ', code sent by SMS' : ''}`);
    s.ownerConsents.unshift(c);
    d.consentId = c.id; d.status = 'CONSENT_PENDING'; d.updatedAt = nowIso();
    db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', c.id, 'OWNER_CONSENT_REQUESTED', `${u.name} asked owner ${c.ownerName} (…${c.ownerPhoneLast4}) to agree to list “${c.snapshot.title}” with ${c.protectionDays} days protection (link)`);
    if (otp) void sendSms(phone10(f.ownerPhone), `GENZ: ${u.name} wants to list your property "${c.snapshot.title}". Open ${url} and enter code ${otp} only if you agree. Do not share this code on a call.`);
    const msgHi = `नमस्ते ${c.ownerName} जी, मैं ${u.name}${u.companyName ? ` (${u.companyName})` : ''}। आपकी प्रॉपर्टी "${c.snapshot.title}" को GENZ ब्रोकर नेटवर्क पर डालने के लिए आपकी सहमति चाहिए। कृपया यह लिंक खोलकर पढ़ें और "हाँ" दबाएँ: ${url}`;
    const msgEn = `Hello ${c.ownerName}, this is ${u.name}${u.companyName ? ` (${u.companyName})` : ''}. To list your property "${c.snapshot.title}" on GENZ Broker Network I need your consent. Please open this link, read it and tap "Yes": ${url}`;
    res.json({ success: true, draft: draftView(d), url, whatsapp: { hi: msgHi, en: msgEn, link: `https://wa.me/91${phone10(f.ownerPhone)}?text=${encodeURIComponent(`${msgHi}\n\n${msgEn}`)}` } });
  });

  r.post('/drafts/:id/paper', needs('property:create'), rateLimit('oc-paper', 30, 3600_000), big, (req: Request, res: Response) => {
    const u = me();
    const d = myDraft(req, res); if (!d) return;
    const raw = String(req.body?.data ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!raw || !/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return bad(res, 'Choose the photo of the signed form.');
    const buf = Buffer.from(raw, 'base64');
    if (!buf.length) return bad(res, 'The file is empty.');
    if (buf.length > PAPER_MAX) return bad(res, 'The photo is larger than 4 MB. Take it again or send a smaller one.', 413);
    const mime = sniffMime(buf);
    if (!mime) return bad(res, 'Only a photo (JPEG, PNG, WebP) or a PDF is accepted.', 415);
    const prep = prepare(req, res, d); if (!prep) return;
    const { c, s } = prep;
    c.method = 'PAPER'; c.status = 'PAPER_REVIEW';
    try { fs.mkdirSync(PAPER_DIR(), { recursive: true }); fs.writeFileSync(path.join(PAPER_DIR(), `${c.id}.bin`), buf); }
    catch { return bad(res, 'The photo could not be saved. Please try again.', 500); }
    c.paper = { mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), uploadedAt: nowIso() };
    note(c, `Signed form uploaded (${Math.round(buf.length / 1024)} KB) — waiting for a GENZ check`);
    s.ownerConsents.unshift(c);
    d.consentId = c.id; d.status = 'CONSENT_PENDING'; d.updatedAt = nowIso();
    db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', c.id, 'OWNER_CONSENT_PAPER', `${u.name} uploaded owner ${c.ownerName}'s signed consent form for “${c.snapshot.title}” (${c.protectionDays} days), SHA-256 ${c.paper.sha256.slice(0, 16)}…`);
    res.json({ success: true, draft: draftView(d) });
  });

  r.get('/drafts/:id/form', needs('property:create'), (req: Request, res: Response) => {
    const u = me();
    const d = myDraft(req, res); if (!d) return;
    const f = d.fields;
    const days = req.query.days ? Number(req.query.days) : daysFor();
    const words = consentWords({ brokerName: u.name, company: u.companyName, rera: u.reraNumber, title: f.title || 'Property', locality: f.locality || '—', city: f.city || '—', priceText: priceLabel(Number(f.askingPrice) || 0, f.transactionType === 'Rent') || '—', days: checkDays(days) ? daysFor() : days, terms: termsOf(f).terms || undefined, rent: f.transactionType === 'Rent', paper: true });
    res.set('Cache-Control', 'no-store');
    const shownDays = checkDays(days) ? daysFor() : days;
    const addr = String(f.addressHidden || '').trim();
    res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owner consent form — GENZ</title>
<style>@page{size:A4;margin:16mm}body{font-family:system-ui,"Noto Sans Devanagari","Mangal","Nirmala UI",sans-serif;max-width:760px;margin:24px auto;padding:0 18px;color:#111;line-height:1.55}h1{font-size:20px;margin:6px 0}p{font-size:14px}.box{border:1px solid #999;border-radius:8px;padding:12px 16px;margin:12px 0}.sig{display:flex;gap:24px;margin-top:44px}.sig div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:12px}.w{margin-top:30px;font-size:13px}.w span{display:inline-block;border-bottom:1px solid #333;min-width:170px;margin:0 10px 0 4px}small{color:#555}button{margin-bottom:8px}@media print{button{display:none}body{margin:0 auto}.box,.sig,p{break-inside:avoid}}</style></head>
<body><button onclick="window.print()">Print</button><h1>Owner consent to list a property — GENZ Broker Network<br><span style="font-size:15px;font-weight:600">मालिक की सहमति — प्रॉपर्टी GENZ ब्रोकर नेटवर्क पर डालने के लिए</span></h1><small>Form ${CONSENT_FORM_VERSION} · Draft ${esc(d.id)}</small>
<div class="box"><p><b>Property / प्रॉपर्टी:</b> ${esc(f.title)}<br><b>Place / जगह:</b> ${esc(f.locality)}, ${esc(f.city)}${f.state ? `, ${esc(f.state)}` : ''}${addr ? `<br><b>Address / पता:</b> ${esc(addr)}` : ''}<br><b>Price / क़ीमत:</b> ${esc(priceLabel(Number(f.askingPrice) || 0, f.transactionType === 'Rent'))}<br><b>Owner / मालिक:</b> ${esc(f.ownerName)} · mobile ending ${esc(phone10(f.ownerPhone).slice(-4))}<br><b>Broker / ब्रोकर:</b> ${esc(u.name)}${u.companyName ? `, ${esc(u.companyName)}` : ''}${u.reraNumber ? ` · RERA ${esc(u.reraNumber)}` : ''}<br><b>Protection / सुरक्षा:</b> ${esc(shownDays)} days from the date of signing / साइन की तारीख़ से ${esc(shownDays)} दिन</p></div>
<p>${esc(words.en)}</p><p>${esc(words.hi)}</p>
<p class="w">Date / तारीख़: <span></span> Place / स्थान: <span></span></p>
<div class="sig"><div>Owner's signature or thumb impression<br>मालिक के हस्ताक्षर / अंगूठा, और नाम</div><div>Broker's signature<br>ब्रोकर के हस्ताक्षर</div></div>
<div class="sig"><div>Witness name and signature (if thumb impression)<br>गवाह का नाम और हस्ताक्षर (अंगूठे की स्थिति में)</div><div>Witness mobile / गवाह का मोबाइल</div></div></body></html>`);
  });

  /** an existing listing that has no owner consent / brokerage yet: make a draft from it so the owner can sign */
  r.post('/from-property/:propertyId', needs('property:create'), (req: Request, res: Response) => {
    const u = me();
    const p = db.byId('properties', req.params.propertyId) as Property | undefined;
    if (!p || p.listingBrokerId !== u.id) return bad(res, 'Listing not found', 404);
    const r2 = draftForProperty(u, p);
    if ('error' in r2) return bad(res, r2.error, 409, { code: r2.code });
    db.save();
    res.json({ success: true, draft: draftView(r2.draft) });
  });

  /** v28 — the normal "List property" form when GENZ needs the owner's consent first: the form becomes a draft (nothing goes live) */
  r.post('/drafts/from-form', needs('property:create'), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const b = req.body || {};
    const parsed = draftFields.safeParse({
      title: String(b.title || '').slice(0, 160), description: String(b.description || '').slice(0, 5000), propertyType: b.propertyType || '', transactionType: b.transactionType || '',
      state: stateFor(b.state, b.city), city: String(b.city || ''), locality: String(b.locality || ''), addressHidden: String(b.addressHidden || '').slice(0, 300),
      areaSqft: Number(b.builtUpAreaSqFt || b.plotAreaSqFt) || null, askingPrice: Number(b.askingPrice) || null, ownerApprovedNetPrice: Number(b.ownerApprovedNetPrice) || null,
      ownerName: String(b.ownerName || '').slice(0, 120), ownerPhone: phone10(b.ownerPhone), tags: Array.isArray(b.tags) ? b.tags.slice(0, 20) : [],
    });
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Check the details');
    const open = s.listingDrafts.filter(d => d.brokerId === u.id && ['DRAFT', 'CONSENT_PENDING', 'READY'].includes(d.status)).length;
    if (open >= MAX_OPEN_DRAFTS) return bad(res, `You already have ${open} drafts. Finish or delete some first.`, 409);
    const d: ListingDraft = { id: nextId('LD', s.listingDrafts), brokerId: u.id, kind: 'LISTING', status: 'DRAFT', raw: 'From the “List property” form', fields: { ...parsed.data, images: Array.isArray(b.images) ? b.images.slice(0, 12) : [], remunerationBasis: '', extra: Object.fromEntries(['landmark', 'pincode', 'district', 'village', 'street', 'googleMapsUrl', 'videoUrl'].filter(k => typeof b[k] === 'string' && b[k].trim()).map(k => [k, String(b[k]).trim().slice(0, 500)])) }, createdAt: nowIso(), updatedAt: nowIso() };
    s.listingDrafts.unshift(d); db.save();
    res.json({ success: true, draft: draftView(d) });
  });

  /** the owner has said yes for an EXISTING listing → protection date + mandate go onto it */
  r.post('/drafts/:id/attach', needs('property:create'), (req: Request, res: Response) => {
    const u = me();
    const d = myDraft(req, res); if (!d) return;
    const p = db.byId('properties', String(d.fields?.forPropertyId || '')) as Property | undefined;
    if (!p || p.listingBrokerId !== u.id) return bad(res, 'Listing not found', 404);
    const c = d.consentId ? st().ownerConsents.find(x => x.id === d.consentId) : undefined;
    if (!c || c.brokerId !== u.id || !bondActive(c)) return bad(res, 'The owner has not given consent yet.', 409, { code: 'CONSENT_NOT_ACCEPTED' });
    if (c.propertyId) return bad(res, 'This consent is already used.', 409, { code: 'CONSENT_USED' });
    if (keyOf({ ownerPhone: p.ownerPhone, city: p.city, locality: p.locality, propertyType: p.propertyType }) !== c.looseKeyHash) return bad(res, 'This listing’s owner phone, city, locality or type changed after the owner agreed. Ask the owner again.', 409, { code: 'CONSENT_MISMATCH' });
    markPublished(c, p);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', p.id, 'OWNER_CONSENT_ATTACHED', `${u.name} attached owner consent ${c.id} (${c.protectionDays} days) to existing listing ${p.id}${c.mandateId ? ` and activated mandate ${c.mandateId}` : ''}`);
    res.json({ success: true, propertyId: p.id, mandateId: c.mandateId, draft: draftView(d) });
  });

  /** the owner's drawn signature — only the broker who asked and GENZ staff */
  r.get('/:id/signature', needs('property:create', 'property:moderate'), (req: Request, res: Response) => {
    const u = me();
    const c = st().ownerConsents.find(x => x.id === req.params.id);
    if (!c?.ownerSignature?.drawn || (c.brokerId !== u.id && !can(u, 'property:moderate'))) return bad(res, 'No signature', 404);
    try {
      const buf = fs.readFileSync(path.join(SIG_DIR(), `${c.id}.png`));
      res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Content-Disposition': 'inline' });
      res.send(buf);
    } catch { bad(res, 'The file is missing on the server', 404); }
  });

  r.get('/mine', needs('property:create'), (_req: Request, res: Response) => {
    const u = me();
    res.json({ success: true, consents: st().ownerConsents.filter(c => c.brokerId === u.id).slice(0, 300).map(consentView) });
  });

  // ── GENZ admin ──
  r.get('/admin/queue', needs('property:moderate'), (_req: Request, res: Response) => {
    const s = st();
    const usersById = new Map(s.users.map(x => [x.id, x]));
    const list = s.ownerConsents.filter(c => c.status === 'PAPER_REVIEW' || (c.status === 'ACCEPTED' && (c.evidence?.sameDeviceSuspected || c.ownerReport) && !c.review)).slice(0, 200);
    res.json({ success: true, items: list.map(c => ({ ...consentView(c), brokerName: usersById.get(c.brokerId)?.name || c.brokerId, events: c.events.slice(-8), paper: c.paper ? { mime: c.paper.mime, size: c.paper.size } : null, ownerReport: c.ownerReport || null, sameDevice: !!c.evidence?.sameDeviceSuspected })) });
  });
  r.get('/admin/:id/paper', needs('property:moderate'), (req: Request, res: Response) => {
    const c = st().ownerConsents.find(x => x.id === req.params.id);
    if (!c?.paper) return bad(res, 'No form photo', 404);
    try {
      const buf = fs.readFileSync(path.join(PAPER_DIR(), `${c.id}.bin`));
      res.set('Content-Type', c.paper.mime); res.set('Cache-Control', 'no-store'); res.set('Content-Disposition', 'inline');
      res.send(buf);
    } catch { bad(res, 'The file is missing on the server', 404); }
  });
  r.post('/admin/:id/decide', needs('property:moderate'), (req: Request, res: Response) => {
    const a = me();
    const c = st().ownerConsents.find(x => x.id === req.params.id);
    if (!c) return bad(res, 'Not found', 404);
    const approve = req.body?.approve === true; const why = String(req.body?.note ?? '').trim().slice(0, 300);
    if (c.status === 'PAPER_REVIEW') {
      if (!approve && why.length < 5) return bad(res, 'Write what is wrong with the form (the broker sees it).');
      c.review = { byId: a.id, byName: a.name, at: nowIso(), approve, note: why };
      if (approve) accept(c, 'Signed form accepted by GENZ');
      else { c.status = 'PAPER_REJECTED'; note(c, `Form not accepted: ${why}`); const d = draftOf(c); if (d) { d.status = 'DRAFT'; d.updatedAt = nowIso(); } }
      void pushTo(c.brokerId, approve
        ? { kind: 'consent', title: 'Owner consent accepted ✔', body: `“${c.snapshot.title}” — you can publish it now. Protected for ${c.protectionDays} days.`, url: '/?tab=properties&drafts=1' }
        : { kind: 'consent', title: 'Signed form not accepted', body: why, url: '/?tab=properties&drafts=1' });
    } else {
      c.review = { byId: a.id, byName: a.name, at: nowIso(), approve: true, note: why || 'Checked — keep' };
      note(c, `Checked by GENZ: ${c.review.note}`);
    }
    db.save();
    db.appendAuditEvent(a.id, a.role, 'PROPERTY', c.id, approve ? 'OWNER_CONSENT_APPROVED' : 'OWNER_CONSENT_REJECTED', `${a.name}: ${approve ? 'accepted' : 'rejected'} consent ${c.id}${why ? ` — ${why}` : ''}`);
    res.json({ success: true, consent: consentView(c) });
  });
  r.post('/admin/:id/void', needs('property:moderate'), (req: Request, res: Response) => {
    const a = me();
    const c = st().ownerConsents.find(x => x.id === req.params.id);
    if (!c) return bad(res, 'Not found', 404);
    const why = String(req.body?.note ?? '').trim().slice(0, 300);
    if (why.length < 10) return bad(res, 'Write why the consent is cancelled (at least 10 characters).');
    c.status = 'VOID'; c.expiresAt = nowIso(); c.tokenHash = undefined;
    c.review = { byId: a.id, byName: a.name, at: nowIso(), approve: false, note: why };
    note(c, `Cancelled by GENZ: ${why}`);
    if (c.propertyId) { const p = db.byId('properties', c.propertyId) as Property | undefined; if (p) p.protectionUntil = nowIso(); }
    db.save();
    db.appendAuditEvent(a.id, a.role, 'PROPERTY', c.id, 'OWNER_CONSENT_VOID', `${a.name} cancelled consent ${c.id}: ${why}`);
    void pushTo(c.brokerId, { kind: 'consent', title: 'Owner consent cancelled by GENZ', body: why, url: '/?tab=properties&drafts=1' });
    res.json({ success: true, consent: consentView(c) });
  });
  return r;
}

const draftOf = (c: OwnerConsent) => c.draftId ? st().listingDrafts.find(x => x.id === c.draftId) : undefined;
function accept(c: OwnerConsent, how: string) {
  const now = Date.now();
  c.status = 'ACCEPTED'; c.acceptedAt = new Date(now).toISOString();
  c.expiresAt = new Date(now + c.protectionDays * 86400_000).toISOString();
  c.tokenHash = c.method === 'LINK' ? c.tokenHash : undefined;
  note(c, `${how} — protected until ${c.expiresAt.slice(0, 10)}`);
  const d = draftOf(c); if (d && d.status !== 'PUBLISHED') { d.status = 'READY'; d.updatedAt = nowIso(); }
  awardPoints(c.brokerId, 'OWNER_CONSENT', c.id, 5);
}

// ───────────────────────── the owner's page (no login) ─────────────────────────
function ownerPage(title: string, body: string) {
  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><link rel="icon" type="image/png" href="/icon-192.png"><title>${esc(title)}</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}.w{max-width:560px;margin:0 auto;padding:16px}
.top{background:#14213d;color:#fff;border-radius:16px;padding:18px}.top h1{margin:0 0 4px;font-size:19px}.top p{margin:0;opacity:.85;font-size:13px}
.card{background:#fff;border-radius:14px;padding:16px;margin-top:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}.row{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:7px 0;border-bottom:1px solid #eee}.row:last-child{border:0}.row b{text-align:right}
p.t{font-size:14px;line-height:1.55;margin:8px 0}p.h{font-size:15px;line-height:1.6}label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}input[type=text]{width:100%;padding:12px;border:1px solid #bbb;border-radius:10px;font-size:16px}
.chk{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-top:12px}.chk input{width:22px;height:22px;flex:none;margin-top:2px}
.btns{display:flex;gap:10px;margin-top:16px}button{flex:1;padding:14px;border-radius:12px;border:0;font-size:16px;font-weight:700}.yes{background:#1fa855;color:#fff}.no{background:#eee;color:#333}
.tabs{display:flex;gap:8px;margin:6px 0}.tabs label{flex:1;margin:0;padding:10px;border:1px solid #bbb;border-radius:10px;font-size:13px;font-weight:600;display:flex;gap:6px;align-items:center;cursor:pointer}.tabs input{width:18px;height:18px}canvas#sigpad{width:100%;height:150px;border:1px dashed #888;border-radius:10px;background:#fff;touch-action:none;display:block}.mini{padding:8px 12px;font-size:13px;flex:none}small{color:#666;font-weight:400}.ok{background:#e8f7ee;border:1px solid #1fa855;color:#0c5f2c}.warn{background:#fff4e5;border:1px solid #f0a020;color:#7a4b00}.small{font-size:12px;color:#666;margin-top:14px;text-align:center}</style></head><body><div class="w">${body}</div></body></html>`;
}

/** the signature part of the owner's form: typed initials or a drawn picture (or both); one of them is required */
function readSignature(body: any): { initials?: string; png?: Buffer } | { error: string } {
  const mode = body?.sigMode === 'draw' ? 'draw' : 'type';
  const initials = validInitials(body?.initials);
  let png: Buffer | undefined;
  const raw = String(body?.sigPng || '');
  if (raw) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(raw);
    const buf = m ? Buffer.from(m[1], 'base64') : undefined;
    if (buf && buf.length > 300 && buf.length <= SIGN_MAX_BYTES && sniffMime(buf) === 'image/png' && Number(body?.sigPts) >= SIGN_MIN_POINTS) png = buf;
  }
  if (mode === 'draw' && !png) return { error: 'ऊपर के बॉक्स में साइन करें (या "नाम के अक्षर लिखें" चुनें)। / Please sign in the box (or choose “Type initials”).' };
  if (mode === 'type' && !initials) return { error: 'अपने नाम के अक्षर लिखें, जैसे RP (या "उँगली से साइन" चुनें)। / Type your initials, like RP (or choose “Draw signature”).' };
  return { initials: initials || undefined, png: mode === 'draw' ? png : undefined };
}

const SIGN_JS = `(function(){
var $=function(i){return document.getElementById(i)};
var pad=$('sigpad'),box=$('sig-draw'),typ=$('sig-type'),ini=$('sigInitials'),png=$('sigPng'),pts=$('sigPts');
if(!pad||!pad.getContext)return;
var ctx=pad.getContext('2d'),down=false,n=0,last=null;
ctx.lineWidth=3.2;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#14213d';
function pos(e){var r=pad.getBoundingClientRect();return{x:(e.clientX-r.left)*pad.width/r.width,y:(e.clientY-r.top)*pad.height/r.height}}
pad.addEventListener('pointerdown',function(e){e.preventDefault();down=true;last=pos(e);try{pad.setPointerCapture(e.pointerId)}catch(x){}ctx.beginPath();ctx.arc(last.x,last.y,1.4,0,6.3);ctx.fillStyle='#14213d';ctx.fill();n++});
pad.addEventListener('pointermove',function(e){if(!down)return;e.preventDefault();var p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;n++});
function up(){down=false}
pad.addEventListener('pointerup',up);pad.addEventListener('pointercancel',up);pad.addEventListener('pointerleave',up);
$('sigclear').addEventListener('click',function(){ctx.clearRect(0,0,pad.width,pad.height);n=0});
function mode(){var m=document.querySelector('input[name=sigMode]:checked');var d=m&&m.value==='draw';box.hidden=!d;typ.hidden=d;if(ini){ini.required=!d}}
var rs=document.querySelectorAll('input[name=sigMode]');for(var i=0;i<rs.length;i++)rs[i].addEventListener('change',mode);mode();
var f=pad.closest('form');
if(f)f.addEventListener('submit',function(e){var m=document.querySelector('input[name=sigMode]:checked');if(m&&m.value==='draw'){if(n<${SIGN_MIN_POINTS}){e.preventDefault();alert('कृपया पहले साइन करें। / Please sign first.');return}png.value=pad.toDataURL('image/png');pts.value=String(n)}else{png.value='';pts.value='0'}});
})();`;

export function createOwnerConsentPageRouter() {
  const r = Router();
  const form = express.urlencoded({ extended: false, limit: '300kb' });
  const find = (token: string) => {
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return undefined;
    const h = sha(token);
    return st().ownerConsents.find(c => c.tokenHash && safeEqual(c.tokenHash, h));
  };
  /** a signed-in GENZ broker / staff member opening the owner's link on his own phone */
  const memberHere = (req: Request) => {
    const p = verifySession(parseCookies(req.headers.cookie)[COOKIE_NAME]);
    const u = p ? db.byId('users', p.uid) as UserProfile | undefined : undefined;
    return u && !['PROPERTY_OWNER', 'BUYER_TENANT'].includes(u.role) ? u : undefined;
  };
  const gone = (res: Response) => res.status(404).send(ownerPage('Link not valid', `<div class="card"><p class="h">यह लिंक मान्य नहीं है या इसकी मियाद ख़त्म हो गई।</p><p class="t">This link is not valid or has expired. Ask the broker for a new one.</p></div>`));

  const render = (req: Request, res: Response, c: OwnerConsent, msg = '') => {
    const broker = db.byId('users', c.brokerId) as UserProfile | undefined;
    const rent = c.snapshot.transactionType === 'Rent';
    const words = consentWords({ brokerName: broker?.name || 'the broker', company: broker?.companyName, rera: broker?.reraNumber, title: c.snapshot.title, locality: c.snapshot.locality, city: c.snapshot.city, priceText: priceLabel(c.snapshot.price, rent), days: c.protectionDays, terms: c.terms, rent });
    const tl = c.terms ? termsLine(c.terms) : null;
    const head = `<div class="top"><h1>प्रॉपर्टी लिस्ट करने की सहमति</h1><p>Consent to list your property · GENZ Broker Network</p></div>
<div class="card"><div class="row"><span>प्रॉपर्टी / Property</span><b>${esc(c.snapshot.title)}</b></div><div class="row"><span>जगह / Place</span><b>${esc(c.snapshot.locality)}, ${esc(c.snapshot.city)}</b></div>
<div class="row"><span>कीमत / Price</span><b>${esc(priceLabel(c.snapshot.price, c.snapshot.transactionType === 'Rent'))}</b></div><div class="row"><span>ब्रोकर / Broker</span><b>${esc(broker?.name || '')}${broker?.companyName ? `<br><small>${esc(broker.companyName)}</small>` : ''}${broker?.reraNumber ? `<br><small>RERA ${esc(broker.reraNumber)}</small>` : ''}</b></div>
<div class="row"><span>सुरक्षा / Protection</span><b>${esc(daysLabel(c.protectionDays, true))}</b></div>${tl ? `<div class="row"><span>ब्रोकरेज / Brokerage</span><b>${esc(tl.kind.hi)}<br><small>${esc(tl.kind.en)}</small><br><small>${esc(tl.atAsking.hi)}</small></b></div>` : ''}</div>`;
    const tok = esc(req.params.token);
    if (c.status === 'ACCEPTED') {
      return res.send(ownerPage('Consent given', `${head}<div class="card ok"><p class="h">✔ आपने ${esc(dIN(c.acceptedAt))} को सहमति दी। सुरक्षा ${esc(dIN(c.expiresAt))} तक।</p><p class="t">You agreed on ${esc(dIN(c.acceptedAt))}. Protection lasts until ${esc(dIN(c.expiresAt))}.</p>${c.ownerSignature ? `<p class="t">हस्ताक्षर दर्ज / Signature on record: ${c.ownerSignature.initials ? `<b>${esc(c.ownerSignature.initials)}</b> ` : ''}${c.ownerSignature.drawn ? '✔ हाथ का साइन / drawn' : ''}</p>` : ''}</div>
${c.ownerReport ? `<div class="card warn"><p class="t">आपकी शिकायत GENZ को मिल गई है। / GENZ has your report.</p></div>` : `<div class="card"><form method="post" action="/oc/${tok}"><input type="hidden" name="action" value="report"><label>अगर आपने यह सहमति नहीं दी — GENZ को बताएँ / If you did NOT agree, tell GENZ</label><input type="text" name="note" maxlength="300" placeholder="क्या हुआ / what happened"><div class="btns"><button class="no" type="submit">शिकायत भेजें / Report</button></div></form></div>`}
<p class="small">GENZ कोई पैसा नहीं लेता। / GENZ never asks you for money.</p>`));
    }
    if (c.status !== 'PENDING' || !c.linkExpiresAt || Date.parse(c.linkExpiresAt) < Date.now()) {
      const label = STATUS_LABEL[Date.parse(c.linkExpiresAt || '') < Date.now() && c.status === 'PENDING' ? 'LINK_EXPIRED' : c.status];
      return res.send(ownerPage('Consent', `${head}<div class="card warn"><p class="h">${esc(label.hi)}</p><p class="t">${esc(label.en)}</p></div>`));
    }
    res.send(ownerPage('Consent to list your property', `${head}${msg ? `<div class="card warn"><p class="t">${msg}</p></div>` : ''}
<div class="card"><p class="h">${esc(words.hi)}</p><p class="t">${esc(words.en)}</p>
<form method="post" action="/oc/${tok}"><input type="hidden" name="action" value="agree">
<label>आपका नाम / Your name</label><input type="text" name="name" required minlength="2" maxlength="120" autocomplete="name">
<label>आपका हस्ताक्षर / Your signature <small>— एक तरीका चुनें / choose one</small></label>
<div class="tabs"><label><input type="radio" name="sigMode" value="type" checked> ✍️ नाम के अक्षर लिखें<br>Type initials</label><label><input type="radio" name="sigMode" value="draw"> 🖊️ उँगली से साइन करें<br>Draw signature</label></div>
<div id="sig-type"><input type="text" name="initials" id="sigInitials" required minlength="2" maxlength="8" placeholder="जैसे / e.g. RP" autocomplete="off"></div>
<div id="sig-draw" hidden><canvas id="sigpad" width="640" height="240" aria-label="Signature"></canvas><div class="btns" style="margin-top:8px"><button class="no mini" type="button" id="sigclear">मिटाएँ / Clear</button></div><p class="small" style="margin:6px 0 0">ऊपर के बॉक्स में उँगली या माउस से साइन करें। / Sign in the box with your finger or mouse.</p></div>
<input type="hidden" name="sigPng" id="sigPng"><input type="hidden" name="sigPts" id="sigPts" value="0">
${c.otpHash ? `<label>SMS में आया कोड / Code from SMS</label><input type="text" name="otp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required>` : ''}
<div class="chk"><input type="checkbox" name="ok" value="1" id="ok" required><label for="ok" style="margin:0;font-weight:500">मैंने ऊपर लिखा पढ़ लिया है और मैं सहमत हूँ। / I have read the above and I agree.</label></div>
<div class="btns"><button class="yes" type="submit">हाँ, सहमत हूँ / Yes</button></div></form><script src="/oc/sign.js" defer></script>
<form method="post" action="/oc/${tok}"><input type="hidden" name="action" value="decline"><div class="btns"><button class="no" type="submit">नहीं / No</button></div></form></div>
<p class="small">यह लिंक सिर्फ़ प्रॉपर्टी मालिक के लिए है। GENZ आपसे कोई पैसा या OTP फ़ोन पर नहीं माँगता।<br>This link is only for the property owner. GENZ never asks you for money.</p>`));
  };

  /** the signature pad — a file of our own, because the page's security policy allows no inline scripts */
  r.get('/sign.js', (_req: Request, res: Response) => {
    res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.send(SIGN_JS);
  });

  r.get('/:token', rateLimit('oc-view', 120, 60_000), (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    const c = find(req.params.token); if (!c) return gone(res);
    render(req, res, c);
  });

  r.post('/:token', rateLimit('oc-post', 30, 60_000), form, (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    const c = find(req.params.token); if (!c) return gone(res);
    const action = String(req.body?.action || '');
    if (action === 'report') {
      if (c.status !== 'ACCEPTED' || c.ownerReport) return render(req, res, c);
      c.ownerReport = { at: nowIso(), note: String(req.body?.note || '').trim().slice(0, 300) || '(no note)' };
      note(c, 'Owner reported: did not agree');
      db.save();
      db.appendAuditEvent('PUBLIC', 'PROPERTY_OWNER', 'PROPERTY', c.id, 'OWNER_CONSENT_REPORTED', `Owner of “${c.snapshot.title}” says he did not agree — GENZ to check`);
      return render(req, res, c);
    }
    if (c.status !== 'PENDING' || !c.linkExpiresAt || Date.parse(c.linkExpiresAt) < Date.now()) return render(req, res, c);
    const member = memberHere(req);
    if (member) {
      note(c, `Link opened while signed in as a GENZ member (${member.id === c.brokerId ? 'the broker himself' : member.role}) — refused`);
      db.save();
      return render(req, res, c, 'यह लिंक प्रॉपर्टी मालिक के फ़ोन पर खोलें — आप GENZ में लॉगिन हैं, इसलिए यहाँ से सहमति नहीं दी जा सकती।<br>Open this link on the OWNER\'s phone. You are signed in to GENZ, so consent cannot be given from here.');
    }
    if (action === 'decline') {
      c.status = 'DECLINED'; c.tokenHash = undefined; note(c, 'Owner said no');
      const d = draftOf(c); if (d) { d.status = 'DRAFT'; d.updatedAt = nowIso(); }
      db.save();
      db.appendAuditEvent('PUBLIC', 'PROPERTY_OWNER', 'PROPERTY', c.id, 'OWNER_CONSENT_DECLINED', `Owner declined to list “${c.snapshot.title}”`);
      void pushTo(c.brokerId, { kind: 'consent', title: 'Owner said no', body: `${c.ownerName} did not agree to list “${c.snapshot.title}”.`, url: '/?tab=properties&drafts=1' });
      return res.send(ownerPage('Thank you', `<div class="card"><p class="h">ठीक है — आपकी प्रॉपर्टी लिस्ट नहीं होगी।</p><p class="t">Understood — your property will not be listed.</p></div>`));
    }
    if (action !== 'agree') return render(req, res, c);
    const name = String(req.body?.name || '').trim().slice(0, 120);
    if (name.length < 2 || req.body?.ok !== '1') return render(req, res, c, 'अपना नाम लिखें और "मैं सहमत हूँ" पर टिक करें। / Write your name and tick “I agree”.');
    const sig = readSignature(req.body);
    if ('error' in sig) return render(req, res, c, sig.error);
    if (c.otpHash) {
      if (hit(`oc-otp:${c.id}`, 5, 3600_000, 3600_000) > 0 || (c.otpTries || 0) >= 5) return render(req, res, c, 'बहुत बार ग़लत कोड। एक घंटे बाद कोशिश करें। / Too many wrong codes — try again in an hour.');
      const ok = safeEqual(c.otpHash, hmac('oc-otp', `${c.id}|${String(req.body?.otp || '').trim()}`));
      if (!ok) { c.otpTries = (c.otpTries || 0) + 1; db.save(); return render(req, res, c, 'कोड सही नहीं है। / The code is not correct.'); }
    }
    const ev = c.evidence || {};
    ev.ipHash = ipOf(req); ev.uaHash = uaOf(req); ev.at = nowIso(); ev.otpVerified = !!c.otpHash;
    ev.sameDeviceSuspected = !!(ev.brokerIpHash && ev.brokerUaHash && ev.ipHash === ev.brokerIpHash && ev.uaHash === ev.brokerUaHash);
    c.evidence = ev; c.ownerTypedName = name;
    c.ownerSignature = { initials: sig.initials, drawn: !!sig.png, at: nowIso() };
    if (sig.png) {
      try { fs.mkdirSync(SIG_DIR(), { recursive: true }); fs.writeFileSync(path.join(SIG_DIR(), `${c.id}.png`), sig.png); c.ownerSignature.sha256 = crypto.createHash('sha256').update(sig.png).digest('hex'); c.ownerSignature.size = sig.png.length; }
      catch { return render(req, res, c, 'साइन सेव नहीं हो पाया, फिर कोशिश करें। / The signature could not be saved — please try again.'); }
    }
    accept(c, `Owner agreed on the link as “${name}” (signed: ${[sig.initials ? `initials ${sig.initials}` : '', sig.png ? 'drawn signature' : ''].filter(Boolean).join(' + ')})${ev.otpVerified ? ' with the SMS code' : ''}${ev.sameDeviceSuspected ? ' (same phone/browser as the broker — GENZ will check)' : ''}`);
    db.save();
    db.appendAuditEvent('PUBLIC', 'PROPERTY_OWNER', 'PROPERTY', c.id, 'OWNER_CONSENT_ACCEPTED', `Owner “${name}” agreed to list “${c.snapshot.title}” — ${c.protectionDays} days protection until ${c.expiresAt!.slice(0, 10)}${ev.sameDeviceSuspected ? ' — SAME DEVICE AS BROKER, flagged' : ''}`);
    void pushTo(c.brokerId, { kind: 'consent', title: 'Owner agreed ✔', body: `${c.ownerName} said yes to “${c.snapshot.title}”. Publish it now — protected for ${c.protectionDays} days.`, url: '/?tab=properties&drafts=1' });
    render(req, res, c);
  });
  return r;
}

/** hourly: links that ran out */
export function sweepConsents() {
  const s = st(); const now = Date.now(); let n = 0;
  for (const c of s.ownerConsents) {
    if (c.status === 'PENDING' && c.linkExpiresAt && Date.parse(c.linkExpiresAt) < now) {
      c.status = 'LINK_EXPIRED'; c.tokenHash = undefined; note(c, 'Link expired'); n++;
      const d = draftOf(c); if (d && d.status === 'CONSENT_PENDING') { d.status = 'DRAFT'; d.updatedAt = nowIso(); }
    }
  }
  if (n) db.save();
  return n;
}
