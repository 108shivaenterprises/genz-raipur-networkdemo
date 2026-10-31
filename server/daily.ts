/**
 * v11 — "open it every day" features for brokers.
 *
 *  F1  Daily digest        rule-based, transparent score; learns from opened / shortlisted / dismissed (no ML, no paid API)
 *  F3  Client pipeline     a broker's private client cards: stages, timeline, follow-ups; phone never leaves the owner
 *  F10 Lead score          Hot / Warm / Cold with the reasons shown
 *  F2  Listing freshness   30-day "still available" rule, auto-expire, report listing / broker, auto-hold, trust breakdown
 *  F6  Map data            locality-level (approximate) pins, never an exact address
 *  F17 Area rate card      median ₹/sq.ft per locality, only with ≥ 10 listings in 90 days
 *
 * Ordering of the digest is documented in docs/V11_FEATURES.md. No builder (including GENZ-related companies) gets any boost;
 * the only booster is a non-cash "profile boost" a broker redeems with points (see community.ts).
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db, CLIENT_STAGES } from './db.js';
import type { UserProfile, ClientCard, ClientStage, Property, BuyerRequirement, DigestPref, ListingReport, DatabaseState } from './db.js';
import { ctx, needs, rateLimit, digits } from './auth.js';
import { phoneSchema } from './validation.js';
import { canBrowseProperty, isPropertyPrincipal } from './access.js';
import { calculatePropertyMatch } from './matching.js';
import { localityFit, inferCity } from '../src/shared/places.js';
import { awardPoints } from './community.js';
import { approxPoint } from '../src/shared/geo.js';
import { normCity } from '../src/shared/cities.js';
import { leadScore, digestScore, rateCard, parseLeadText, RATE_MIN_SAMPLE } from '../src/shared/dailyRules.js';
import { sameCity } from '../src/shared/india.js';
import { policyOf, maskPhone } from '../src/shared/pcontrolRules.js';

const nowIso = () => new Date().toISOString();
const DAY = 86_400_000;
const days = (iso?: string, now = Date.now()) => (iso ? (now - new Date(iso).getTime()) / DAY : Infinity);
const me = () => ctx().user as UserProfile;
const pad = (n: number) => String(n).padStart(4, '0');
export const FRESH_DAYS = 30;
export const WARN_DAYS = 23;
export { leadScore, digestScore, rateCard, parseLeadText };

function clientAsRequirement(c: ClientCard): BuyerRequirement {
  return {
    id: c.id, customerId: c.id, customerName: c.name, customerPhone: '', assignedBrokerId: c.brokerId,
    budgetMin: c.budgetMin, budgetMax: c.budgetMax, city: c.city, preferredLocalities: c.areas, propertyType: c.propertyType as any,
    transactionType: c.transactionType, purpose: 'Self-use', urgency: 'Moderate (1-3 months)', status: 'active', createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

function browsable(st: DatabaseState, u: UserProfile, now = Date.now()) {
  return st.properties.filter(p => p.listingBrokerId !== u.id && canBrowseProperty(u, p) && days(p.confirmedAt, now) <= FRESH_DAYS);
}

function shareViews7d(st: DatabaseState, u: UserProfile, c: ClientCard, now = Date.now()) {
  const label = c.name.trim().toLowerCase();
  if (!label) return 0;
  return st.shareLinks.filter(l => l.ownerId === u.id && !l.revoked && l.clientLabel.trim().toLowerCase() === label)
    .reduce((a, l) => a + (l.viewLog || []).filter(t => now - new Date(t).getTime() < 7 * DAY).length, 0);
}

function matchCountFor(c: ClientCard, props: Property[]) {
  const req = clientAsRequirement(c);
  return props.filter(p => calculatePropertyMatch(p, req).score >= 70).length;
}

// ───────────────────────────── F1 digest (pure-ish) ─────────────────────────────
const pref = (st: DatabaseState, userId: string): DigestPref => {
  let p = st.digestPrefs.find(x => x.userId === userId);
  if (!p) { p = { id: userId, userId, muted: false, hour: 8, seen: {}, typeAffinity: {}, localityAffinity: {} }; st.digestPrefs.push(p); }
  return p;
};

export function buildDigest(u: UserProfile, now = Date.now()) {
  const st = db.getState();
  const pr = pref(st, u.id);
  if (pr.muted) return { muted: true, hour: pr.hour, clients: 0, properties: 0, fresh: 0, matches: [] as any[] };
  const props = browsable(st, u, now);
  const sources: { id: string; name: string; req: BuyerRequirement; kind: 'CLIENT' | 'REQUIREMENT' }[] = [
    ...st.clientCards.filter(c => c.brokerId === u.id && c.stage !== 'DEAL' && c.stage !== 'LOST').map(c => ({ id: c.id, name: c.name, req: clientAsRequirement(c), kind: 'CLIENT' as const })),
    ...st.requirements.filter(r => r.assignedBrokerId === u.id && ['active', 'matching'].includes(r.status)).map(r => ({ id: r.id, name: r.customerName, req: r, kind: 'REQUIREMENT' as const })),
  ];
  const seenKeys = new Set<string>();
  const out: any[] = [];
  // v20: a match needs the same sale/rent intent, and a named city must agree (else the score is capped below 60) —
  // so each client is only scored against those listings, not against every listing in India
  const ck = (c?: string) => String(c || '').trim().toLowerCase().replace(/\s*\(.*\)\s*/g, '');
  const byType = new Map<string, typeof props>(); const byTypeCity = new Map<string, typeof props>(); const byTypeLoc = new Map<string, Map<string, typeof props>>();
  for (const p of props) {
    (byType.get(p.transactionType) || byType.set(p.transactionType, []).get(p.transactionType)!).push(p);
    const k = `${p.transactionType}|${ck(p.city)}`; (byTypeCity.get(k) || byTypeCity.set(k, []).get(k)!).push(p);
    const lm = byTypeLoc.get(p.transactionType) || byTypeLoc.set(p.transactionType, new Map()).get(p.transactionType)!;
    const loc = p.locality.toLowerCase().trim(); (lm.get(loc) || lm.set(loc, []).get(loc)!).push(p);
  }
  // a client with no city named: the broker's own city + any listing in a locality the client asked for
  const cityless = (r: BuyerRequirement) => {
    if (!u.city) return byType.get(r.transactionType) || [];
    const out = new Set(byTypeCity.get(`${r.transactionType}|${ck(u.city)}`) || []);
    const wanted = (r.preferredLocalities || []).map(l => l.trim()).filter(Boolean);
    if (wanted.length) for (const [loc, list] of byTypeLoc.get(r.transactionType) || []) if (localityFit(u.city, wanted, loc).level === 'exact') for (const p of list) out.add(p);
    return [...out];
  };
  for (const s of sources) {
    const rc = s.req.city || inferCity(s.req.preferredLocalities);
    const all = rc ? (byTypeCity.get(`${s.req.transactionType}|${ck(rc)}`) || []) : cityless(s.req);
    const cands = all.length > 4000 ? all.slice(-4000) : all; // worst case bounded: the newest 4,000 compatible listings
    // score cheaply first, keep this client's best 300 by match, then do the (heavier) ranking only for those
    const best: { p: typeof props[number]; m: ReturnType<typeof calculatePropertyMatch>; key: string }[] = [];
    for (const p of cands) {
      const key = `${s.id}|${p.id}`;
      if (seenKeys.has(key) || pr.seen[key] === 'DISMISSED') continue;
      const m = calculatePropertyMatch(p, s.req);
      if (m.score >= 60) best.push({ p, m, key });
    }
    best.sort((a, b) => b.m.score - a.m.score);
    for (const { p, m, key } of best.slice(0, 300)) {
      const broker = db.byId('users', p.listingBrokerId);
      const ds = digestScore(m.score, {
        trust: broker?.trustScore ?? 50, ageDays: days(p.createdAt, now), boosted: !!broker?.boostUntil && new Date(broker.boostUntil).getTime() > now,
        typeAff: pr.typeAffinity[p.propertyType] || 0, locAff: pr.localityAffinity[p.locality.toLowerCase()] || 0, seen: pr.seen[key],
      });
      seenKeys.add(key);
      out.push({
        key, sourceId: s.id, sourceKind: s.kind, clientName: s.name, score: ds.score, parts: ds.parts, reasons: m.reasons.slice(0, 3), status: pr.seen[key] || 'NEW',
        isNew: days(p.createdAt, now) <= 3,
        property: { id: p.id, title: p.title, locality: p.locality, city: p.city, propertyType: p.propertyType, transactionType: p.transactionType, askingPrice: p.askingPrice, image: p.images?.[0] || '', ageDays: Math.floor(days(p.createdAt, now)), daysLeft: Math.max(0, Math.ceil(FRESH_DAYS - days(p.confirmedAt, now))) },
        broker: broker ? { id: broker.id, name: broker.name, trustScore: broker.trustScore ?? null, verified: broker.verificationStatus === 'VERIFIED' } : null,
      });
    }
  }
  out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const top = out.slice(0, 30);
  return {
    muted: false, hour: pr.hour,
    clients: new Set(top.map(x => x.sourceId)).size,
    properties: new Set(top.map(x => x.property.id)).size,
    fresh: top.filter(x => x.isNew).length,
    matches: top,
  };
}

// ───────────────────────────── F2 freshness sweep ─────────────────────────────
/** Expire listings that nobody confirmed for 30 days. Idempotent; called at start-up and hourly. */
export function sweepListings(now = Date.now()): number {
  const st = db.getState();
  let n = 0;
  for (const p of st.properties) {
    if (p.expiredAt || !['active', 'under_negotiation'].includes(p.listingStatus)) continue;
    if (days(p.confirmedAt || p.createdAt, now) > FRESH_DAYS) {
      p.expiredAt = new Date(now).toISOString();
      n++;
      db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'PROPERTY', p.id, 'LISTING_AUTO_EXPIRED', `Not confirmed for ${FRESH_DAYS} days — hidden from the network until the broker taps “still available”.`);
    }
  }
  if (n) db.save();
  return n;
}

// ───────────────────────────── F2 trust breakdown ─────────────────────────────
export function trustBreakdown(u: UserProfile, st = db.getState(), now = Date.now()) {
  const settled = st.dealRooms.filter(d => (d.introducingBrokerId === u.id || d.closingBrokerId === u.id) && d.stage === 'Settled').length;
  const visits = st.siteVisits.filter(v => v.brokerId === u.id && v.isVerified).length;
  const mine = st.properties.filter(p => p.listingBrokerId === u.id && ['active', 'under_negotiation'].includes(p.listingStatus));
  const fresh = mine.filter(p => !p.expiredAt && days(p.confirmedAt, now) <= FRESH_DAYS).length;
  const upheld = st.listingReports.filter(r => r.status === 'UPHELD' && ((r.targetType === 'BROKER' && r.targetId === u.id) || (r.targetType === 'LISTING' && db.byId('properties', r.targetId)?.listingBrokerId === u.id))).length;
  const openBy = new Set(st.listingReports.filter(r => r.status === 'OPEN' && r.targetType === 'BROKER' && r.targetId === u.id).map(r => r.reporterId)).size;
  const parts = [
    { id: 'kyc', max: 30, pts: (u.verificationStatus === 'VERIFIED' ? 25 : 0) + (u.reraNumber ? 5 : 0), en: 'KYC verified + RERA number on profile', hi: 'KYC सत्यापित + प्रोफ़ाइल पर RERA नंबर', tip: { en: 'Complete KYC and add your RERA number.', hi: 'KYC पूरा करें और RERA नंबर जोड़ें।' } },
    { id: 'deals', max: 20, pts: Math.min(20, settled * 5), en: `Deals settled with a counter-party (${settled})`, hi: `काउंटर-पार्टी के साथ पूरी हुई डील (${settled})`, tip: { en: 'Close deals through the deal room — each settled deal adds 5.', hi: 'डील रूम से डील पूरी करें — हर पूरी डील पर 5।' } },
    { id: 'visits', max: 10, pts: Math.min(10, visits * 2), en: `Verified site visits (${visits})`, hi: `सत्यापित साइट विज़िट (${visits})`, tip: { en: 'Use the QR / OTP check-in on every site visit.', hi: 'हर साइट विज़िट पर QR / OTP चेक-इन करें।' } },
    { id: 'fresh', max: 15, pts: mine.length ? Math.round(15 * fresh / mine.length) : 7, en: `Listings confirmed in the last 30 days (${fresh}/${mine.length})`, hi: `पिछले 30 दिनों में कन्फर्म लिस्टिंग (${fresh}/${mine.length})`, tip: { en: 'Tap “Still available” on each listing once a month.', hi: 'हर लिस्टिंग पर महीने में एक बार “अभी भी उपलब्ध” दबाएँ।' } },
    { id: 'profile', max: 10, pts: (u.brand?.tagline || u.brand?.logo ? 5 : 0) + (u.publicCard?.enabled ? 5 : 0), en: 'Brand set in Share Kit + public visiting card on', hi: 'Share Kit में ब्रांड + पब्लिक विज़िटिंग कार्ड चालू', tip: { en: 'Set your brand and switch on your visiting card.', hi: 'अपना ब्रांड सेट करें और विज़िटिंग कार्ड चालू करें।' } },
    { id: 'clean', max: 15, pts: Math.max(0, 15 - upheld * 8 - (openBy >= 3 ? 4 : 0)), en: `No upheld reports (${upheld} upheld, ${openBy} open)`, hi: `कोई सिद्ध शिकायत नहीं (${upheld} सिद्ध, ${openBy} खुली)`, tip: { en: 'Keep listings accurate; remove sold ones quickly.', hi: 'लिस्टिंग सही रखें; बिक चुकी लिस्टिंग तुरंत हटाएँ।' } },
  ];
  const total = Math.max(0, Math.min(100, parts.reduce((a, p) => a + p.pts, 0)));
  return { total, parts, tips: parts.filter(p => p.pts < p.max).map(p => ({ id: p.id, en: p.tip.en, hi: p.tip.hi, gain: p.max - p.pts })).sort((a, b) => b.gain - a.gain).slice(0, 3) };
}

// ───────────────────────────── router ─────────────────────────────
const clientSchema = z.object({
  name: z.string().trim().min(2, 'Client name is required').max(80),
  phone: phoneSchema,
  budgetMin: z.coerce.number().min(0).max(1e11).default(0),
  budgetMax: z.coerce.number().min(0).max(1e11).default(0),
  city: z.string().trim().max(80).default(''),
  areas: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  propertyType: z.string().trim().max(60).default('Residential Flat'),
  transactionType: z.enum(['Sale', 'Rent', 'Lease']).default('Sale'),
  tags: z.array(z.string().trim().min(1).max(30)).max(8).default([]),
  notes: z.string().trim().max(1000).default(''),
  followUpAt: z.string().datetime().optional(),
  consent: z.literal(true, { message: 'Confirm that the client agreed to be contacted' }),
  clientRef: z.string().trim().max(60).optional(),
});
const reportSchema = z.object({
  targetType: z.enum(['LISTING', 'BROKER']), targetId: z.string().min(1).max(80),
  reason: z.enum(['FAKE', 'SOLD', 'DUPLICATE', 'WRONG_PRICE', 'SPAM', 'ABUSE', 'OTHER']), note: z.string().trim().max(300).default(''),
});

const nextClientId = (list: ClientCard[]) => `CLI-${pad(list.reduce((m, c) => Math.max(m, Number(c.id.split('-').pop()) || 0), 0) + 1)}`;
const view = (st: DatabaseState, u: UserProfile, c: ClientCard, props: Property[], now = Date.now()) => {
  const sc = leadScore(c, { matchCount: matchCountFor(c, props), shareViews7d: shareViews7d(st, u, c, now), now });
  return { ...c, lead: sc };
};
/** v58 — a broker's office staff with the "client list" switch works the EMPLOYER's client cards (they stay his) */
const cardOwner = (u: UserProfile): UserProfile => (u.role === 'TEAM_MEMBER' && u.employerId ? (db.byId('users', u.employerId) as UserProfile) || u : u);
const isStaff = (u: UserProfile) => u.role === 'TEAM_MEMBER';
/** staff see a client's number only when the broker gave them "sees numbers" (FULL) */
const showPhone = (u: UserProfile) => !isStaff(u) || policyOf(u).phoneMode === 'FULL';
const forViewer = <T extends { phone: string }>(u: UserProfile, c: T): T => (showPhone(u) ? c : { ...c, phone: maskPhone(c.phone), phoneHidden: true });
const findCard = (id: string) => db.getState().clientCards.find(c => c.id === id && c.brokerId === cardOwner(me()).id);

export function createDailyRouter() {
  const r = Router();
  const audit = (action: string, entityId: string, details: string, entity: 'PROPERTY' | 'SYSTEM' = 'SYSTEM') => db.appendAuditEvent(me().id, me().role, entity, entityId, action, details);

  r.get('/flags', needs('self:read'), (_req, res) => {
    const u = me();
    res.json({ success: true, plan: u.plan || 'free', flags: { sponsoredSlots: false, premiumTeams: false } });
  });

  // ── F1 digest ──
  r.get('/digest', needs('daily:use'), (_req, res) => {
    const u = me();
    const d = buildDigest(u);
    const p = pref(db.getState(), u.id);
    // v20: remember "last opened" at most every 10 minutes (each save rewrites what changed; opening is not a change worth it)
    if (!p.lastOpenAt || Date.now() - Date.parse(p.lastOpenAt) > 10 * 60_000) { p.lastOpenAt = nowIso(); db.save(); }
    res.json({ success: true, ...d });
  });
  r.post('/digest/feedback', needs('daily:use'), rateLimit('digestfb', 240, 60_000), (req: Request, res: Response) => {
    const u = me();
    const body = z.object({ key: z.string().max(120), action: z.enum(['OPENED', 'SHORTLISTED', 'DISMISSED']) }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid feedback' });
    const st = db.getState();
    const [, propId] = body.data.key.split('|');
    const prop = db.byId('properties', propId);
    if (!prop || !canBrowseProperty(u, prop)) return res.status(404).json({ error: 'Property not found' });
    const pr = pref(st, u.id);
    const prev = pr.seen[body.data.key];
    if (prev === 'SHORTLISTED' && body.data.action === 'OPENED') return res.json({ success: true });
    pr.seen[body.data.key] = body.data.action;
    const loc = prop.locality.toLowerCase();
    const bump = body.data.action === 'DISMISSED' ? -1 : 1;
    pr.typeAffinity[prop.propertyType] = Math.max(0, Math.min(5, (pr.typeAffinity[prop.propertyType] || 0) + (prev === body.data.action ? 0 : bump)));
    pr.localityAffinity[loc] = Math.max(0, Math.min(5, (pr.localityAffinity[loc] || 0) + (prev === body.data.action ? 0 : bump)));
    const keys = Object.keys(pr.seen); if (keys.length > 600) for (const k of keys.slice(0, keys.length - 600)) delete pr.seen[k];
    db.save();
    res.json({ success: true });
  });
  r.put('/digest/prefs', needs('daily:use'), (req: Request, res: Response) => {
    const body = z.object({ muted: z.boolean().optional(), hour: z.number().int().min(0).max(23).optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'Invalid preference' });
    const pr = pref(db.getState(), me().id);
    if (body.data.muted !== undefined) pr.muted = body.data.muted;
    if (body.data.hour !== undefined) pr.hour = body.data.hour;
    db.save();
    res.json({ success: true, muted: pr.muted, hour: pr.hour });
  });

  // ── F3 clients ──
  r.get('/clients', needs('daily:use'), (_req, res) => {
    const viewer = me(); const u = cardOwner(viewer); const st = db.getState(); const props = browsable(st, u);
    const list = st.clientCards.filter(c => c.brokerId === u.id).map(c => forViewer(viewer, view(st, u, c, props)));
    res.json({ success: true, clients: list, stages: CLIENT_STAGES, staff: isStaff(viewer) ? { employer: u.name, phones: showPhone(viewer) } : undefined });
  });
  r.get('/clients/due', needs('daily:use'), (_req, res) => {
    const viewer = me(); const u = cardOwner(viewer); const now = Date.now();
    const due = db.getState().clientCards.filter(c => c.brokerId === u.id && c.followUpAt && c.stage !== 'DEAL' && c.stage !== 'LOST' && new Date(c.followUpAt).getTime() <= now);
    res.json({ success: true, due: due.map(c => forViewer(viewer, { id: c.id, name: c.name, phone: c.phone, followUpAt: c.followUpAt, stage: c.stage })) });
  });
  r.post('/clients', needs('daily:use'), rateLimit('clientadd', 120, 60 * 60_000), (req: Request, res: Response) => {
    const viewer = me(); const u = cardOwner(viewer); const st = db.getState();
    const p = clientSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Please check the form' });
    const d = p.data;
    if (d.clientRef) { const dup = st.clientCards.find(c => c.brokerId === u.id && c.clientRef === d.clientRef); if (dup) return res.json({ success: true, client: dup, duplicate: true }); }
    const mine = st.clientCards.filter(c => c.brokerId === u.id);
    if (mine.length >= 2000) return res.status(400).json({ error: 'Client limit reached (2000). Archive old clients first.' });
    if (mine.some(c => digits(c.phone).slice(-10) === digits(d.phone).slice(-10) && c.stage !== 'LOST')) return res.status(409).json({ error: 'You already have a client with this mobile number.' });
    const now = nowIso();
    const card: ClientCard = {
      id: nextClientId(st.clientCards), brokerId: u.id, name: d.name, phone: d.phone, budgetMin: d.budgetMin, budgetMax: Math.max(d.budgetMax, d.budgetMin),
      city: normCity(d.city || u.city), areas: d.areas, propertyType: d.propertyType, transactionType: d.transactionType, tags: d.tags, notes: d.notes,
      stage: 'NEW', followUpAt: d.followUpAt, consent: true, clientRef: d.clientRef, timeline: [{ at: now, kind: 'CREATED', text: isStaff(viewer) ? `Client added by ${viewer.name} (office team)` : 'Client added' }], createdAt: now, updatedAt: now,
    };
    st.clientCards.unshift(card); db.save();
    audit('CLIENT_CARD_CREATED', card.id, `Client card created (consent recorded)${isStaff(viewer) ? ` by ${viewer.name} for ${u.name}` : ''}`);
    res.json({ success: true, client: forViewer(viewer, view(st, u, card, browsable(st, u))) });
  });
  r.put('/clients/:id', needs('daily:use'), (req: Request, res: Response) => {
    const c = findCard(req.params.id); if (!c) return res.status(404).json({ error: 'Client not found' });
    const p = clientSchema.partial().safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Please check the form' });
    const d = p.data as any; delete d.consent; delete d.clientRef;
    if (!showPhone(me())) delete d.phone; // a masked number cannot be edited by someone who cannot see it
    Object.assign(c, d); if (d.city) c.city = normCity(d.city); c.updatedAt = nowIso();
    db.save(); res.json({ success: true, client: forViewer(me(), view(db.getState(), cardOwner(me()), c, browsable(db.getState(), cardOwner(me())))) });
  });
  r.post('/clients/:id/stage', needs('daily:use'), (req: Request, res: Response) => {
    const c = findCard(req.params.id); if (!c) return res.status(404).json({ error: 'Client not found' });
    const b = z.object({ stage: z.enum(CLIENT_STAGES as [ClientStage, ...ClientStage[]]), lostReason: z.string().trim().max(200).optional(), followUpAt: z.string().datetime().optional() }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Invalid stage' });
    if (b.data.stage === 'LOST' && !b.data.lostReason) return res.status(400).json({ error: 'Please say why the lead was lost (one line).' });
    if (c.stage === b.data.stage) return res.json({ success: true, client: forViewer(me(), view(db.getState(), cardOwner(me()), c, browsable(db.getState(), cardOwner(me())))) });
    const now = nowIso();
    c.timeline.unshift({ at: now, kind: 'STAGE', text: `${c.stage} → ${b.data.stage}${b.data.lostReason ? ` (${b.data.lostReason})` : ''}` });
    c.stage = b.data.stage; c.lostReason = b.data.stage === 'LOST' ? b.data.lostReason : undefined; c.updatedAt = now;
    if (b.data.followUpAt) c.followUpAt = b.data.followUpAt;
    if (c.stage === 'DEAL' || c.stage === 'LOST') c.followUpAt = undefined;
    c.timeline = c.timeline.slice(0, 80);
    db.save(); res.json({ success: true, client: forViewer(me(), view(db.getState(), cardOwner(me()), c, browsable(db.getState(), cardOwner(me())))) });
  });
  r.post('/clients/:id/note', needs('daily:use'), (req: Request, res: Response) => {
    const c = findCard(req.params.id); if (!c) return res.status(404).json({ error: 'Client not found' });
    const b = z.object({ text: z.string().trim().min(1).max(500), kind: z.enum(['NOTE', 'CONTACT', 'FOLLOWUP', 'SHARE']).default('NOTE'), followUpAt: z.string().datetime().nullable().optional() }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Write a short note' });
    const now = nowIso();
    c.timeline.unshift({ at: now, kind: b.data.kind, text: isStaff(me()) ? `${b.data.text} — ${me().name}` : b.data.text }); c.timeline = c.timeline.slice(0, 80);
    if (b.data.kind === 'CONTACT') c.lastContactAt = now;
    if (b.data.followUpAt !== undefined) c.followUpAt = b.data.followUpAt || undefined;
    c.updatedAt = now; db.save();
    res.json({ success: true, client: forViewer(me(), view(db.getState(), cardOwner(me()), c, browsable(db.getState(), cardOwner(me())))) });
  });
  r.delete('/clients/:id', needs('daily:use'), (req: Request, res: Response) => {
    if (isStaff(me())) return res.status(403).json({ error: 'Only the broker can delete a client', code: 'STAFF_CANNOT_DELETE' });
    const st = db.getState(); const i = st.clientCards.findIndex(c => c.id === req.params.id && c.brokerId === me().id);
    if (i < 0) return res.status(404).json({ error: 'Client not found' });
    st.clientCards.splice(i, 1); db.save();
    audit('CLIENT_CARD_DELETED', req.params.id, 'Client card deleted by the broker');
    res.json({ success: true });
  });
  r.post('/clients/parse', needs('daily:use'), rateLimit('parse', 60, 60_000), (req: Request, res: Response) => {
    res.json({ success: true, parsed: parseLeadText(String(req.body?.text || '')) });
  });

  // ── F2 freshness, reports, trust ──
  r.get('/listings', needs('daily:use'), (_req, res) => {
    const u = me(); const now = Date.now();
    const mine = db.getState().properties.filter(p => p.listingBrokerId === u.id && ['active', 'under_negotiation'].includes(p.listingStatus));
    res.json({ success: true, listings: mine.map(p => {
      const age = days(p.confirmedAt || p.createdAt, now);
      return { id: p.id, title: p.title, locality: p.locality, city: p.city, confirmedAt: p.confirmedAt, daysLeft: Math.max(0, Math.ceil(FRESH_DAYS - age)), state: p.heldAt ? 'HELD' : p.expiredAt ? 'EXPIRED' : age >= WARN_DAYS ? 'EXPIRING' : 'FRESH' };
    }) });
  });
  r.post('/listings/:id/confirm', needs('daily:use'), rateLimit('confirm', 120, 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const p = db.byId('properties', req.params.id);
    if (!p || !isPropertyPrincipal(u, p)) return res.status(404).json({ error: 'Listing not found' });
    if (p.heldAt) return res.status(409).json({ error: 'This listing is on hold after reports. GENZ will review it.' });
    const wasStale = !!p.expiredAt;
    p.confirmedAt = nowIso(); p.expiredAt = undefined; p.updatedAt = p.confirmedAt;
    db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', p.id, 'LISTING_CONFIRMED', `Broker confirmed “still available”${wasStale ? ' (re-listed after expiry)' : ''}`);
    awardPoints(u.id, 'LISTING_CONFIRMED', `${p.id}:${p.confirmedAt!.slice(0, 7)}`, 5);
    res.json({ success: true, confirmedAt: p.confirmedAt });
  });
  r.get('/trust', needs('daily:use'), (_req, res) => res.json({ success: true, ...trustBreakdown(me()) }));

  r.post('/report', needs('report:create'), rateLimit('report', 30, 24 * 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const p = reportSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Choose what you are reporting and why.' });
    const d = p.data;
    let ownerId = '';
    if (d.targetType === 'LISTING') {
      const prop = db.byId('properties', d.targetId);
      if (!prop || !canBrowseProperty(u, prop)) return res.status(404).json({ error: 'Listing not found' });
      ownerId = prop.listingBrokerId;
    } else {
      const t = db.byId('users', d.targetId);
      if (!t || ['SUPERADMIN', 'ADMIN'].includes(t.role)) return res.status(404).json({ error: 'Member not found' });
      ownerId = t.id;
    }
    if (ownerId === u.id) return res.status(400).json({ error: 'You cannot report your own listing or profile.' });
    if (st.listingReports.some(x => x.reporterId === u.id && x.targetType === d.targetType && x.targetId === d.targetId && x.status === 'OPEN')) return res.json({ success: true, duplicate: true, message: 'You have already reported this. GENZ is reviewing it.' });
    const rep: ListingReport = { id: `RPT-${pad(st.listingReports.length + 1)}`, targetType: d.targetType, targetId: d.targetId, reporterId: u.id, reason: d.reason, note: d.note, status: 'OPEN', createdAt: nowIso() };
    st.listingReports.push(rep);
    // auto-hold: three different members report the same listing → hidden until GENZ reviews it
    let held = false;
    if (d.targetType === 'LISTING') {
      const who = new Set(st.listingReports.filter(x => x.targetType === 'LISTING' && x.targetId === d.targetId && x.status === 'OPEN').map(x => x.reporterId));
      const prop = db.byId('properties', d.targetId)!;
      if (who.size >= 3 && !prop.heldAt) { prop.heldAt = nowIso(); held = true; }
    }
    db.save();
    audit('REPORT_FILED', rep.id, `${d.targetType} ${d.targetId} reported: ${d.reason}${held ? ' — listing auto-held after 3 reports' : ''}`);
    res.json({ success: true, message: 'Thank you. GENZ will review this report.' });
  });
  r.get('/reports', needs('report:manage'), (_req, res) => {
    const st = db.getState();
    res.json({ success: true, reports: st.listingReports.slice().reverse().slice(0, 200).map(x => ({
      ...x, reporterName: db.byId('users', x.reporterId)?.name || '—',
      targetLabel: x.targetType === 'LISTING' ? db.byId('properties', x.targetId)?.title || x.targetId : db.byId('users', x.targetId)?.name || x.targetId,
      held: x.targetType === 'LISTING' ? !!db.byId('properties', x.targetId)?.heldAt : undefined,
    })) });
  });
  r.post('/reports/:id/resolve', needs('report:manage'), (req: Request, res: Response) => {
    const st = db.getState(); const rep = st.listingReports.find(x => x.id === req.params.id);
    if (!rep) return res.status(404).json({ error: 'Report not found' });
    const action = req.body?.action === 'UPHOLD' ? 'UPHOLD' : req.body?.action === 'DISMISS' ? 'DISMISS' : '';
    if (!action) return res.status(400).json({ error: 'Choose UPHOLD or DISMISS' });
    rep.status = action === 'UPHOLD' ? 'UPHELD' : 'DISMISSED'; rep.resolvedAt = nowIso(); rep.resolvedBy = me().id;
    if (rep.targetType === 'LISTING') {
      const prop = db.byId('properties', rep.targetId);
      if (prop) {
        if (action === 'UPHOLD') { prop.listingStatus = 'withdrawn'; prop.heldAt = undefined; }
        else if (!st.listingReports.some(x => x.targetId === prop.id && x.targetType === 'LISTING' && x.status === 'OPEN')) prop.heldAt = undefined;
      }
    }
    db.save();
    audit('REPORT_RESOLVED', rep.id, `${rep.targetType} ${rep.targetId}: ${rep.status}`);
    res.json({ success: true, report: rep });
  });

  // ── F6 map ──
  r.get('/map', needs('daily:use'), (req, res) => {
    const u = me(); const st = db.getState(); const now = Date.now();
    const listings = st.properties.filter(p => canBrowseProperty(u, p) && days(p.confirmedAt, now) <= FRESH_DAYS).map(p => {
      const pt = approxPoint(p.city, p.locality, p.latitude, p.longitude, p.state);
      return { kind: 'LISTING', id: p.id, title: p.title, locality: p.locality, city: p.city, propertyType: p.propertyType, transactionType: p.transactionType, price: p.askingPrice, mine: p.listingBrokerId === u.id, lat: pt.lat, lng: pt.lng };
    });
    // requirements are shown without any customer detail: only what the need is and where
    const reqs = st.requirements.filter(q => ['active', 'matching'].includes(q.status)).flatMap(q => (q.preferredLocalities.length ? q.preferredLocalities.slice(0, 1) : ['']).map(loc => {
      const pt = approxPoint(q.city || '', loc);
      return { kind: 'REQUIREMENT', id: q.id, title: `${q.propertyType} wanted`, locality: loc || (q.city || ''), city: q.city || '', propertyType: q.propertyType, transactionType: q.transactionType, price: q.budgetMax, priceMin: q.budgetMin, mine: q.assignedBrokerId === u.id, lat: pt.lat, lng: pt.lng };
    }));
    const all = [...listings, ...reqs];
    // v20 — one city at a time (all of India was one 15 MB answer). Default: my city, else the busiest one; mine always included.
    const counts = new Map<string, number>();
    for (const p of all) if (p.city) counts.set(p.city, (counts.get(p.city) || 0) + 1);
    const cities = [...counts].sort((a, b) => b[1] - a[1]).map(([city, n]) => ({ city, n }));
    const wanted = String(req.query.city || '').trim();
    const city = wanted === 'ALL' ? 'ALL' : wanted || cities.find(c => sameCity(c.city, u.city))?.city || cities[0]?.city || 'ALL';
    const CAP = 2500;
    const inCity = city === 'ALL' ? all : all.filter(p => p.mine || sameCity(p.city, city));
    const pins = inCity.length > CAP ? [...inCity.filter(p => p.mine), ...inCity.filter(p => !p.mine).slice(0, CAP)] : inCity;
    res.json({ success: true, city, cities, total: all.length, capped: inCity.length > pins.length, pins, note: 'Locations are approximate (locality level). Exact address is shown only after a verified site visit.' });
  });

  // ── F17 rate card ──
  r.get('/rate-card', needs('daily:use'), (req, res) => {
    const city = req.query.city ? String(req.query.city) : '';
    const st = db.getState();
    const all = rateCard(st.properties.filter(p => !p.heldAt && p.verificationStatus === 'VERIFIED'));
    res.json({ success: true, minSample: RATE_MIN_SAMPLE, cards: city ? all.filter(c => sameCity(c.city, city)) : all, disclaimer: 'Indicative only. Based on asking prices of GENZ listings in the last 90 days.' });
  });

  return r;
}

