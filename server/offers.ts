/**
 * v14 — multiple offers on one property + token lock.   Mounted at /api/offers.
 *
 *  Buyer-side broker  → may offer for several buyers on the same property (capped), each with amount, token and validity.
 *  Property side      → owner or listing broker sees all offers (buyer first-name only until accepted) and accepts / counters / rejects.
 *                       If the listing broker brought the buyer himself, only the OWNER may decide (maker ≠ checker).
 *  Single winner      → one offer holds the property at a time. Others wait in a BACKUP queue and move up automatically.
 *  Token              → GENZ never touches the money. The buyer pays the owner directly; the owner records "token received"
 *                       (amount + reference + validity). The buyer side acknowledges. The listing is locked (under negotiation)
 *                       until the token is completed, refunded, forfeited after expiry, or auto-released after a grace period.
 */
import { needsMandateFirst, MANDATE_FIRST_MSG } from './ownerlist.js';
import { liveOfferCap } from './tiers.js';
import { tieupSplitFor } from './network.js';
import { PROBATION_LIVE_OFFERS } from '../src/shared/networkRules.js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { daysFor } from './protection.js';
import { pushTo } from './webpush.js';
import { buyerBondBlock, makeBuyerBond } from './buyerbond.js';
import { partyBlock, partyCaution } from './partywatch.js';
import { db } from './db.js';
import type { UserProfile, Property, PropertyOffer } from './db.js';
import { ctx, needs, hit, digits } from './auth.js';
import { isAdmin } from './access.js';
import { canBrowseProperty } from './access.js';
import {
  MAX_LIVE_OFFERS_PER_PROPERTY, MAX_LIVE_OFFERS_PER_BROKER, MAX_COUNTER_ROUNDS, TOKEN_DUE_HOURS, TOKEN_DEFAULT_DAYS, TOKEN_MAX_DAYS, TOKEN_GRACE_DAYS,
  isLiveOffer, checkOfferAmount, validityHours, nextBackup, buyerShown,
} from '../src/shared/dealRules.js';
import { phoneSchema } from './validation.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
const PUBLIC = ['active', 'under_negotiation'];

const makeSchema = z.object({
  propertyId: z.string().min(3).max(40),
  buyerName: z.string().trim().min(2).max(80),
  buyerPhone: phoneSchema,
  requirementId: z.string().max(40).optional(),
  amount: z.number().positive().max(100_000_000_000),
  tokenProposed: z.number().min(0).max(1_000_000_000).default(0),
  validityHours: z.number().optional(),
  note: z.string().trim().max(300).optional(),
  consent: z.literal(true, { message: 'Confirm that the buyer agreed to share their details for this offer' }),
});

const profile = (id: string) => db.byId('users', id);
const propOf = (o: PropertyOffer) => db.byId('properties', o.propertyId);
const isPrincipal = (u: UserProfile, p: Property) => p.ownerId === u.id || p.listingBrokerId === u.id;
/** may this user decide on this offer? owner always; listing broker unless he is the offer's own broker (self-deal). */
export function canDecide(u: UserProfile, p: Property, o: PropertyOffer): boolean {
  if (p.ownerId === u.id) return true;
  return p.listingBrokerId === u.id && o.brokerId !== u.id;
}
const log = (o: PropertyOffer, u: { id: string; name: string }, text: string) => { o.history.push({ at: nowIso(), byId: u.id, byName: u.name, text }); o.updatedAt = nowIso(); };
const audit = (u: { id: string; role: any }, o: PropertyOffer, action: string, details: string) => { db.appendAuditEvent(u.id, u.role, 'PROPERTY', o.propertyId, action, `[${o.id}] ${details}`); notifyOffer(u.id, o, action); };
/** v26 — phone alert to the other side of an offer (never the buyer's name) */
function notifyOffer(byId: string, o: PropertyOffer, action: string) {
  try {
    const p = db.byId('properties', o.propertyId) as Property | undefined;
    const amt = `₹${Math.round(o.amount).toLocaleString('en-IN')}`;
    const to = action === 'OFFER_SUBMITTED' ? p?.listingBrokerId : ['OFFER_ACCEPTED', 'OFFER_REJECTED', 'OFFER_COUNTERED', 'OFFER_PROMOTED'].includes(action) ? o.brokerId : '';
    if (!to || to === byId) return;
    const title = action === 'OFFER_SUBMITTED' ? 'New offer on your listing' : action === 'OFFER_ACCEPTED' ? 'Your offer was accepted ✔' : action === 'OFFER_COUNTERED' ? 'Counter-offer received' : action === 'OFFER_PROMOTED' ? 'Your backup offer is now first' : 'Your offer was not accepted';
    void pushTo(to, { kind: 'deals', title, body: `${p?.title || o.propertyId} · ${amt}`, url: '/?tab=desk', tag: `offer-${o.id}` });
  } catch { /* an alert never blocks the offer */ }
}

function provisionDeal(o: PropertyOffer, p: Property): string {
  const s = st();
  const exist = s.dealRooms.find(d => d.propertyId === p.id && d.introducingBrokerId === o.brokerId && d.customerId === o.buyerName);
  if (exist) { if (!(exist as any).dealValue || exist.dealValueSource !== 'AGREEMENT') { exist.dealValue = o.amount; exist.dealValueSource = 'OFFER'; } return exist.id; }
  const seq = s.dealRooms.reduce((m, d) => Math.max(m, Number(/DEAL-2026-(\d+)/.exec(d.id)?.[1] ?? 0)), 0) + 1;
  const id = `DEAL-2026-${String(seq).padStart(3, '0')}`;
  const days = daysFor();
  const ts = nowIso();
  const mandate = s.ownerMandates.some(m => m.propertyId === p.id && m.isConfirmed);
  const tu = tieupSplitFor(o.brokerId, p.listingBrokerId || '', p as any);
  if (tu) { tu.dealsUsed = (tu.dealsUsed || 0) + 1; tu.history.push({ at: ts, by: 'system', action: `DEAL_OPENED ${id}` }); }
  s.dealRooms.unshift({
    id, propertyId: p.id, requirementId: o.requirementId || '', introducingBrokerId: o.brokerId,
    closingBrokerId: p.listingBrokerId === o.brokerId ? '' : p.listingBrokerId, ownerId: p.ownerId || '', customerId: o.buyerName,
    stage: 'Negotiation', introducingBrokerSharePct: tu ? tu.introSharePct : 50, closingBrokerSharePct: tu ? 100 - tu.introSharePct : 50, ...(tu ? { tieupId: tu.id } : {}), totalCommissionExpected: Math.round(o.amount * 0.02),
    antiBypassTailDays: days, antiBypassExpiresAt: new Date(Date.now() + days * 86400_000).toISOString(),
    ownerProtectionExpiresAt: new Date(Date.now() + days * 86400_000).toISOString(),
    settlementStatus: 'PROPOSED', siteVisitsCount: 0, ownerRemunerationConfirmed: mandate,
    dealValue: o.amount, dealValueSource: 'OFFER', notes: `Opened automatically when offer ${o.id} was accepted.`, createdAt: ts, updatedAt: ts,
  } as any);
  return id;
}

const slotTaken = (p: Property, exceptId?: string) => st().propertyOffers.some(x => x.propertyId === p.id && x.id !== exceptId && ['ACCEPTED', 'TOKEN_HELD'].includes(x.status));

/** Accept → this offer holds the property, or waits in the BACKUP queue if another offer already does. */
function acceptOffer(o: PropertyOffer, p: Property, by: { id: string; name: string; role: any }): 'ACCEPTED' | 'BACKUP' {
  if (slotTaken(p, o.id)) {
    const q = st().propertyOffers.filter(x => x.propertyId === p.id && x.status === 'BACKUP').reduce((m, x) => Math.max(m, x.queueNo ?? 0), 0) + 1;
    o.status = 'BACKUP'; o.queueNo = q; log(o, by, `Accepted by the property side but another offer holds the property — on backup #${q}`);
    audit(by, o, 'OFFER_BACKUP', `Offer ${o.amount} placed on backup #${q}`);
    return 'BACKUP';
  }
  o.status = 'ACCEPTED'; o.acceptedAt = nowIso(); o.tokenDueBy = new Date(Date.now() + TOKEN_DUE_HOURS * 3600_000).toISOString(); o.queueNo = undefined;
  o.dealRoomId = provisionDeal(o, p);
  log(o, by, `Accepted at ₹${o.amount.toLocaleString('en-IN')}. Token due within ${TOKEN_DUE_HOURS} h`);
  audit(by, o, 'OFFER_ACCEPTED', `Offer ₹${o.amount} accepted; deal room ${o.dealRoomId}`);
  return 'ACCEPTED';
}

/** When the holder falls away, the next valid backup is accepted automatically. */
export function promoteNext(p: Property): PropertyOffer | undefined {
  if (slotTaken(p)) return undefined;
  const b = nextBackup(st().propertyOffers.filter(x => x.propertyId === p.id));
  if (!b) return undefined;
  const sys = { id: 'system', name: 'GENZ', role: 'SUPERADMIN' };
  b.status = 'ACCEPTED'; b.acceptedAt = nowIso(); b.tokenDueBy = new Date(Date.now() + TOKEN_DUE_HOURS * 3600_000).toISOString(); b.queueNo = undefined;
  b.dealRoomId = provisionDeal(b, p);
  log(b, sys, `Moved up from backup — property is free again. Token due within ${TOKEN_DUE_HOURS} h`);
  audit(sys, b, 'OFFER_PROMOTED', 'Backup offer promoted');
  return b;
}

/** v72 — the property OWNER answers an offer from his room page (he has no account): accept, counter or reject. Same rules as /:id/decide. */
export function ownerDecideOffer(o: PropertyOffer, p: Property, by: { id: string; name: string }, action: string, counterAmount?: number, note?: string): { ok: true; result?: string } | { error: string; status: number } {
  if (o.propertyId !== p.id) return { error: 'Offer not found', status: 404 };
  if (!['SUBMITTED', 'COUNTERED'].includes(o.status)) return { error: `Offer is ${o.status.toLowerCase()} — nothing to decide`, status: 409 };
  if (Date.parse(o.validUntil) < Date.now()) { o.status = 'EXPIRED'; db.save(); return { error: 'This offer has expired', status: 409 }; }
  if (!PUBLIC.includes(p.listingStatus)) return { error: 'This listing is no longer open', status: 409 };
  const u = { id: by.id, name: by.name, role: 'OWNER' as any };
  if (action === 'REJECT') {
    o.status = 'REJECTED'; o.reason = String(note || 'Declined by the owner').trim().slice(0, 200); o.decidedById = u.id; o.decidedByName = u.name; o.decidedAt = nowIso(); log(o, u, `Rejected: ${o.reason}`);
    audit(u, o, 'OFFER_REJECTED', o.reason);
  } else if (action === 'COUNTER') {
    const c = Number(counterAmount);
    if (!Number.isFinite(c) || c <= 0) return { error: 'Counter amount is required', status: 400 };
    if (o.rounds >= MAX_COUNTER_ROUNDS) return { error: `At most ${MAX_COUNTER_ROUNDS} counter rounds — accept or reject`, status: 409 };
    const err = checkOfferAmount(c, p.askingPrice, 0); if (err) return { error: err, status: 400 };
    o.status = 'COUNTERED'; o.counterAmount = c; o.counterNote = note ? String(note).slice(0, 200) : undefined; o.rounds++; o.decidedById = u.id; o.decidedByName = u.name; o.decidedAt = nowIso();
    o.validUntil = new Date(Math.max(Date.parse(o.validUntil), Date.now() + 24 * 3600_000)).toISOString();
    log(o, u, `Counter ₹${c.toLocaleString('en-IN')}${o.counterNote ? ` — ${o.counterNote}` : ''}`); audit(u, o, 'OFFER_COUNTERED', `Counter ₹${c}`);
  } else if (action === 'ACCEPT') {
    if (o.status !== 'SUBMITTED') return { error: 'You already sent a counter — wait for the buyer side to answer', status: 409 };
    o.decidedById = u.id; o.decidedByName = u.name; o.decidedAt = nowIso();
    const out = acceptOffer(o, p, u); db.save(); return { ok: true, result: out };
  } else return { error: 'action must be ACCEPT, COUNTER or REJECT', status: 400 };
  db.save(); promoteNext(p); db.save();
  return { ok: true };
}

function unlockIfFree(p: Property) {
  if (p.listingStatus === 'under_negotiation' && !st().propertyOffers.some(x => x.propertyId === p.id && x.status === 'TOKEN_HELD')) p.listingStatus = 'active';
}

export function sweepOffers(now = Date.now()): number {
  const s = st(); let n = 0;
  const sys = { id: 'system', name: 'GENZ', role: 'SUPERADMIN' };
  const touched = new Set<string>();
  for (const o of s.propertyOffers) {
    const p = propOf(o);
    if (['SUBMITTED', 'COUNTERED', 'BACKUP'].includes(o.status) && Date.parse(o.validUntil) < now) {
      o.status = 'EXPIRED'; o.reason = 'Offer validity ended'; log(o, sys, 'Expired'); n++;
    } else if (o.status === 'ACCEPTED' && o.tokenDueBy && Date.parse(o.tokenDueBy) < now) {
      o.status = 'EXPIRED'; o.reason = 'Token not received in time'; log(o, sys, 'Expired — token was not received within the time limit'); audit(sys, o, 'OFFER_TOKEN_MISSED', 'Token not received in time'); n++; if (p) touched.add(p.id);
    } else if (o.status === 'TOKEN_HELD' && o.token && !o.token.outcome && Date.parse(o.token.validUntil) + TOKEN_GRACE_DAYS * 86400_000 < now) {
      o.status = 'RELEASED'; o.token.outcome = 'RELEASED'; o.token.outcomeAt = nowIso(); o.token.outcomeNote = 'Auto-released: token validity and grace period ended without any action. Money matters stay between the parties.';
      log(o, sys, 'Lock auto-released after the token grace period'); audit(sys, o, 'TOKEN_AUTO_RELEASED', 'Token lock released'); n++; if (p) touched.add(p.id);
    }
  }
  for (const id of touched) { const p = s.properties.find(x => x.id === id); if (p) { unlockIfFree(p); promoteNext(p); } }
  if (n) db.save();
  return n;
}

function view(o: PropertyOffer, u: UserProfile) {
  const p = propOf(o); const mine = o.brokerId === u.id;
  const principal = !!p && isPrincipal(u, p);
  const { buyerPhoneKey, history, ...rest } = o;
  return {
    ...rest,
    role: mine ? 'BUYER_SIDE' : 'PROPERTY_SIDE',
    buyerName: mine || isAdmin(u) ? o.buyerName : buyerShown(o.buyerName, o.status),
    buyerPhoneLast4: mine ? o.buyerPhoneKey.slice(-4) : undefined,
    canDecide: !!p && principal && canDecide(u, p, o),
    needsOwner: !!p && principal && !canDecide(u, p, o),
    property: p ? { id: p.id, title: p.title, locality: p.locality, city: p.city, askingPrice: p.askingPrice, listingStatus: p.listingStatus, transactionType: p.transactionType } : undefined,
    history,
  };
}

export function createOffersRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const self = () => profile(me().id)!;

  r.get('/', needs('offer:make', 'offer:decide'), (_req, res) => {
    const u = self();
    const mine = st().propertyOffers.filter(o => o.brokerId === u.id);
    const props = new Set(st().properties.filter(p => isPrincipal(u, p)).map(p => p.id));
    const incoming = st().propertyOffers.filter(o => props.has(o.propertyId) && o.brokerId !== u.id || (props.has(o.propertyId) && o.brokerId === u.id && db.byId('properties', o.propertyId)?.ownerId === u.id));
    const sort = (a: PropertyOffer, b: PropertyOffer) => b.updatedAt.localeCompare(a.updatedAt);
    res.json({ success: true, made: mine.sort(sort).map(o => view(o, u)), incoming: incoming.sort(sort).map(o => view(o, u)), limits: { perProperty: MAX_LIVE_OFFERS_PER_PROPERTY } });
  });

  r.post('/', needs('offer:make'), (req, res) => {
    const u = self();
    const parsed = makeSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid offer');
    const d = parsed.data;
    if (hit(`offer:${u.id}`, 30, 3600_000)) return bad(res, 'Too many offers this hour — slow down', 429);
    const p = db.byId('properties', d.propertyId);
    if (!p || !canBrowseProperty(u as any, p) || !PUBLIC.includes(p.listingStatus)) return bad(res, 'Property not found or not open for offers', 404);
    if (p.ownerId === u.id) return bad(res, 'You cannot make an offer on your own property', 403);
    const err = checkOfferAmount(d.amount, p.askingPrice, d.tokenProposed); if (err) return bad(res, err);
    if (d.requirementId) { const rq = db.byId('requirements', d.requirementId); if (!rq || rq.assignedBrokerId !== u.id) return bad(res, 'Requirement not found', 404); }
    const key = digits(d.buyerPhone).slice(-10);
    const live = st().propertyOffers.filter(o => isLiveOffer(o.status));
    if (live.some(o => o.propertyId === p.id && o.buyerPhoneKey === key && o.brokerId !== u.id)) return bad(res, 'This buyer already has an active offer on this property', 409, 'BUYER_TAKEN');
    { const pb = partyBlock(d.buyerPhone, 'buyer'); if (pb) return res.status(403).json(pb); } // v35 — Network Watch
    { const blocked = buyerBondBlock(u, p.id, d.buyerPhone); if (blocked) return res.status(409).json(blocked); } // v29 — buyer bond
    if (live.some(o => o.propertyId === p.id && o.buyerPhoneKey === key && o.brokerId === u.id)) return bad(res, 'You already have an active offer for this buyer on this property — withdraw it to submit a new one', 409, 'OFFER_EXISTS');
    if (live.filter(o => o.propertyId === p.id && o.brokerId === u.id).length >= MAX_LIVE_OFFERS_PER_PROPERTY) return bad(res, `You can keep at most ${MAX_LIVE_OFFERS_PER_PROPERTY} live offers on one property`, 429, 'OFFER_CAP');
    { const cap = liveOfferCap(u, MAX_LIVE_OFFERS_PER_BROKER, PROBATION_LIVE_OFFERS); if (live.filter(o => o.brokerId === u.id).length >= cap) return bad(res, `You can keep at most ${cap} live offers in total${cap < MAX_LIVE_OFFERS_PER_BROKER ? ' during your 30-day probation' : ''}`, 429, 'OFFER_CAP'); }
    const ts = nowIso();
    const seq = st().propertyOffers.reduce((m, o) => Math.max(m, Number(/OFR-(\d+)/.exec(o.id)?.[1] ?? 0)), 0) + 1;
    const o: PropertyOffer = {
      id: `OFR-${String(seq).padStart(4, '0')}`, propertyId: p.id, brokerId: u.id, brokerName: u.name, buyerName: d.buyerName, buyerPhoneKey: key,
      requirementId: d.requirementId, amount: d.amount, tokenProposed: d.tokenProposed, validUntil: new Date(Date.now() + validityHours(d.validityHours) * 3600_000).toISOString(),
      note: d.note, status: 'SUBMITTED', rounds: 0, history: [], createdAt: ts, updatedAt: ts,
    };
    log(o, u, `Offer ₹${d.amount.toLocaleString('en-IN')} (token ₹${d.tokenProposed.toLocaleString('en-IN')}) submitted`);
    st().propertyOffers.unshift(o);
    makeBuyerBond({ brokerId: u.id, propertyId: p.id, buyerPhone: d.buyerPhone, buyerName: d.buyerName, source: 'OFFER', sourceId: o.id }); // v29 — the buyer agreed to this offer
    db.save();
    audit(u, o, 'OFFER_SUBMITTED', `${u.name} offered ₹${d.amount} (token ₹${d.tokenProposed}) for a buyer on ${p.id}`);
    res.json({ success: true, offer: view(o, u), watch: partyCaution(d.buyerPhone) || undefined });
  });

  const load = (req: Request, res: Response) => {
    const o = st().propertyOffers.find(x => x.id === req.params.id); const p = o && propOf(o);
    if (!o || !p) { bad(res, 'Offer not found', 404); return null; }
    return { o, p };
  };

  r.post('/:id/withdraw', needs('offer:make'), (req, res) => {
    const u = self(); const l = load(req, res); if (!l) return; const { o, p } = l;
    if (o.brokerId !== u.id) return bad(res, 'Offer not found', 404);
    if (!isLiveOffer(o.status)) return bad(res, `Offer is already ${o.status.toLowerCase()}`, 409);
    if (o.status === 'TOKEN_HELD') return bad(res, 'A token is held on this offer — ask the property side to refund or release it first', 409);
    o.status = 'WITHDRAWN'; log(o, u, 'Withdrawn by the buyer side'); db.save(); audit(u, o, 'OFFER_WITHDRAWN', 'Offer withdrawn');
    promoteNext(p); db.save();
    res.json({ success: true });
  });

  r.post('/:id/decide', needs('offer:decide'), (req, res) => {
    const u = self(); const l = load(req, res); if (!l) return; const { o, p } = l;
    if (!isPrincipal(u, p)) return bad(res, 'Offer not found', 404);
    if (!canDecide(u, p, o)) return bad(res, 'The listing broker brought this buyer — only the property owner can decide on this offer', 403, 'OWNER_ONLY');
    const { action, counterAmount, note } = req.body || {};
    if (!['SUBMITTED', 'COUNTERED'].includes(o.status) && !(action === 'REJECT' && o.status === 'BACKUP')) return bad(res, `Offer is ${o.status.toLowerCase()} — nothing to decide`, 409);
    if (Date.parse(o.validUntil) < Date.now()) { o.status = 'EXPIRED'; db.save(); return bad(res, 'This offer has expired', 409); }
    if (!PUBLIC.includes(p.listingStatus)) return bad(res, 'This listing is no longer open', 409);
    if (action === 'REJECT') {
      if (!note || String(note).trim().length < 3) return bad(res, 'A short reason is required to reject');
      o.status = 'REJECTED'; o.reason = String(note).slice(0, 200); o.decidedById = u.id; o.decidedByName = u.name; o.decidedAt = nowIso(); log(o, u, `Rejected: ${o.reason}`);
      audit(u, o, 'OFFER_REJECTED', o.reason);
    } else if (action === 'COUNTER') {
      const c = Number(counterAmount);
      if (!Number.isFinite(c) || c <= 0) return bad(res, 'Counter amount is required');
      if (o.rounds >= MAX_COUNTER_ROUNDS) return bad(res, `At most ${MAX_COUNTER_ROUNDS} counter rounds — accept or reject`, 409);
      const err = checkOfferAmount(c, p.askingPrice, 0); if (err) return bad(res, err);
      o.status = 'COUNTERED'; o.counterAmount = c; o.counterNote = note ? String(note).slice(0, 200) : undefined; o.rounds++; o.decidedById = u.id; o.decidedByName = u.name; o.decidedAt = nowIso();
      o.validUntil = new Date(Math.max(Date.parse(o.validUntil), Date.now() + 24 * 3600_000)).toISOString();
      log(o, u, `Counter ₹${c.toLocaleString('en-IN')}${o.counterNote ? ` — ${o.counterNote}` : ''}`); audit(u, o, 'OFFER_COUNTERED', `Counter ₹${c}`);
    } else if (action === 'ACCEPT') {
      o.decidedById = u.id; o.decidedByName = u.name; o.decidedAt = nowIso();
      const out = acceptOffer(o, p, { id: u.id, name: u.name, role: u.role });
      db.save(); return res.json({ success: true, result: out, offer: view(o, u) });
    } else return bad(res, 'action must be ACCEPT, COUNTER or REJECT');
    db.save(); promoteNext(p); db.save();
    res.json({ success: true, offer: view(o, u) });
  });

  r.post('/:id/respond', needs('offer:make'), (req, res) => {
    const u = self(); const l = load(req, res); if (!l) return; const { o, p } = l;
    if (o.brokerId !== u.id) return bad(res, 'Offer not found', 404);
    if (o.status !== 'COUNTERED' || !o.counterAmount) return bad(res, 'There is no counter to answer', 409);
    if (req.body?.action === 'DECLINE') { o.status = 'WITHDRAWN'; log(o, u, 'Counter declined — offer withdrawn'); db.save(); promoteNext(p); db.save(); return res.json({ success: true }); }
    if (req.body?.action !== 'ACCEPT') return bad(res, 'action must be ACCEPT or DECLINE');
    if (!PUBLIC.includes(p.listingStatus)) return bad(res, 'This listing is no longer open', 409);
    o.amount = o.counterAmount; log(o, u, `Buyer side accepted the counter ₹${o.amount.toLocaleString('en-IN')}`);
    const out = acceptOffer(o, p, { id: u.id, name: u.name, role: u.role }); db.save();
    res.json({ success: true, result: out, offer: view(o, u) });
  });

  // ── token ──
  r.post('/:id/token/received', needs('offer:decide'), (req, res) => {
    const u = self(); const l = load(req, res); if (!l) return; const { o, p } = l;
    if (!isPrincipal(u, p) || !canDecide(u, p, o)) return bad(res, 'Only the property side (the owner if the listing broker brought the buyer) can record a token', 403);
    if (o.status !== 'ACCEPTED') return bad(res, 'A token can be recorded only on an accepted offer', 409);
    if (needsMandateFirst(p)) return bad(res, MANDATE_FIRST_MSG, 409);
    const amount = Number(req.body?.amount); const ref = String(req.body?.ref || '').trim();
    const days = Math.min(TOKEN_MAX_DAYS, Math.max(1, Math.round(Number(req.body?.validDays ?? TOKEN_DEFAULT_DAYS))));
    if (!Number.isFinite(amount) || amount <= 0 || amount > o.amount) return bad(res, 'Token amount must be more than 0 and not more than the offer');
    if (ref.length < 3 || ref.length > 40) return bad(res, 'Enter the payment reference (UTR / cheque no. / receipt no.)');
    const ts = nowIso();
    o.token = { amount, ref, receivedAt: ts, receivedById: u.id, validUntil: new Date(Date.now() + days * 86400_000).toISOString() };
    o.status = 'TOKEN_HELD';
    for (const x of st().propertyOffers.filter(x => x.propertyId === p.id && ['SUBMITTED', 'COUNTERED'].includes(x.status))) {
      const q = st().propertyOffers.filter(y => y.propertyId === p.id && y.status === 'BACKUP').reduce((m, y) => Math.max(m, y.queueNo ?? 0), 0) + 1;
      x.status = 'BACKUP'; x.queueNo = q; log(x, { id: 'system', name: 'GENZ' }, `Another offer now holds the property (token received) — moved to backup #${q}`);
    }
    p.listingStatus = 'under_negotiation'; p.updatedAt = ts;
    log(o, u, `Token ₹${amount.toLocaleString('en-IN')} recorded (ref ${ref}), valid ${days} days`);
    db.save(); audit(u, o, 'TOKEN_RECEIVED', `Token ₹${amount} ref ${ref}, valid till ${o.token.validUntil.slice(0, 10)}`);
    res.json({ success: true, offer: view(o, u) });
  });

  r.post('/:id/token/ack', needs('offer:make'), (req, res) => {
    const u = self(); const l = load(req, res); if (!l) return; const { o } = l;
    if (o.brokerId !== u.id || !o.token) return bad(res, 'Offer not found', 404);
    const what = req.body?.what === 'OUTCOME' ? 'OUTCOME' : 'PAID';
    if (what === 'PAID') { if (o.token.buyerSideAckAt) return bad(res, 'Already acknowledged', 409); o.token.buyerSideAckAt = nowIso(); log(o, u, 'Buyer side confirmed the token was paid'); audit(u, o, 'TOKEN_ACK', 'Buyer side confirmed token paid'); }
    else { if (!o.token.outcome) return bad(res, 'No outcome to acknowledge yet', 409); o.token.outcomeAckAt = nowIso(); log(o, u, `Buyer side confirmed the outcome (${o.token.outcome})`); audit(u, o, 'TOKEN_OUTCOME_ACK', o.token.outcome); }
    db.save(); res.json({ success: true });
  });

  r.post('/:id/token/extend', needs('offer:decide'), (req, res) => {
    const u = self(); const l = load(req, res); if (!l) return; const { o, p } = l;
    if (!isPrincipal(u, p) || !canDecide(u, p, o)) return bad(res, 'Not allowed', 403);
    if (o.status !== 'TOKEN_HELD' || !o.token || o.token.outcome) return bad(res, 'No token lock to extend', 409);
    if (o.token.extended) return bad(res, 'A token can be extended only once', 409);
    const days = Math.min(7, Math.max(1, Math.round(Number(req.body?.days ?? 3))));
    o.token.validUntil = new Date(Math.max(Date.parse(o.token.validUntil), Date.now()) + days * 86400_000).toISOString(); o.token.extended = true;
    log(o, u, `Token validity extended by ${days} days`); db.save(); audit(u, o, 'TOKEN_EXTENDED', `+${days} days`);
    res.json({ success: true, offer: view(o, u) });
  });

  r.post('/:id/token/close', needs('offer:decide'), (req, res) => {
    const u = self(); const l = load(req, res); if (!l) return; const { o, p } = l;
    if (!isPrincipal(u, p) || !canDecide(u, p, o)) return bad(res, 'Not allowed', 403);
    if (o.status !== 'TOKEN_HELD' || !o.token || o.token.outcome) return bad(res, 'No open token on this offer', 409);
    const outcome = req.body?.outcome; const note = String(req.body?.note || '').trim().slice(0, 300);
    if (!['REFUNDED', 'FORFEITED'].includes(outcome)) return bad(res, 'outcome must be REFUNDED or FORFEITED (a completed deal is closed by marking the listing sold)');
    if (outcome === 'FORFEITED' && Date.parse(o.token.validUntil) > Date.now()) return bad(res, 'A token can be marked forfeited only after its validity has ended', 409);
    if (note.length < 3) return bad(res, 'Add a short note');
    o.token.outcome = outcome; o.token.outcomeAt = nowIso(); o.token.outcomeNote = note; o.status = 'RELEASED';
    log(o, u, `Token ${outcome.toLowerCase()}: ${note}`); unlockIfFree(p); promoteNext(p); db.save();
    audit(u, o, outcome === 'REFUNDED' ? 'TOKEN_REFUNDED' : 'TOKEN_FORFEITED', note);
    res.json({ success: true, offer: view(o, u) });
  });

  return r;
}
