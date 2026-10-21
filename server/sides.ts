/**
 * v41 — "Apna-apna side".   /api/deals/:id/sides …
 *
 * A deal room opened from an OWN_SIDE offer has no shared brokerage: the seller-side broker keeps the fee of his seller,
 * the buyer-side broker the fee of his buyer. This router holds the three things each broker does for himself:
 *   PUT  /:id/sides/fee          — write down MY fee (private: the other broker never gets the amount)
 *   POST /:id/sides/undertaking  — sign "I deal only with my own client" (both must sign before the stage "Agreement")
 *   POST /:id/sides/received     — write down what I received from MY client (self-recorded — nobody confirms it for me)
 *   GET  /:id/sides              — my view
 * GENZ never holds or moves this money; GENZ's own fee (if an admin set one) is charged on what the broker records as received.
 * A GENZ admin sees both sides only while a dispute is open on the room (same rule as every other brokerage term).
 */
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { DealRoom, UserProfile } from './db.js';
import { ctx, needs } from './auth.js';
import { isAdmin, isDealBroker, openDisputeOf } from './access.js';
import { chargeEvent } from './billing.js';
import {
  SIDE_UNDERTAKING, allSidesDone, brokerDone, feeOf, isOwnSide, otherBrokerOf, sideOf, undertakingDone, validSideFee,
} from '../src/shared/sideFees.js';
import type { DealSideView } from '../src/types/index.js';

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9 \-\/_.,#:]{3,59}$/;

/** what one broker may know about his own-side deal (never the other broker's amount or receipts) */
export function sideViewFor(d: DealRoom, u: Pick<UserProfile, 'id'>): DealSideView {
  const other = otherBrokerOf(d, u.id);
  const rec = d.sideReceipts?.[u.id];
  return {
    mySide: sideOf(d, u.id),
    myFee: d.sideFees?.[u.id]?.amount,
    myFeeNote: d.sideFees?.[u.id]?.note,
    myReceived: rec?.total ?? 0,
    myReceipts: (rec?.entries || []).map(e => ({ id: e.id, amount: e.amount, ref: e.ref, paidOn: e.paidOn })),
    signedByMe: !!d.sideUndertaking?.[u.id],
    signedByOther: !!d.sideUndertaking?.[other],
    otherHasFee: feeOf(d, other) > 0,
    otherDone: brokerDone(d, other),
    myDone: brokerDone(d, u.id),
    ready: undertakingDone(d),
    undertaking: { en: SIDE_UNDERTAKING.en, hi: SIDE_UNDERTAKING.hi },
  };
}

/** the deal as one viewer may read it: a broker gets only his own side; a GENZ admin (dispute open) gets both; everyone else nothing */
export function shapeSideDeal(d: DealRoom, u: UserProfile, dealValue?: number) {
  const { sideFees, sideReceipts, sideUndertaking, ...rest } = d;
  if (isAdmin(u) && !isDealBroker(u, d)) {
    return { ...rest, sideFees, sideReceipts, sideUndertaking, totalCommissionExpected: Object.values(sideFees || {}).reduce((a, f) => a + f.amount, 0), dealValue };
  }
  return { ...rest, dealValue, totalCommissionExpected: feeOf(d, u.id), introducingBrokerSharePct: 0, closingBrokerSharePct: 0, side: sideViewFor(d, u) };
}
/** a viewer without brokerage rights (owner, legal, admin without a dispute): the side data is dropped altogether */
export function stripSideData(d: DealRoom) {
  const { sideFees, sideReceipts, sideUndertaking, ...rest } = d;
  return rest;
}

function load(req: Request, res: Response, write: boolean) {
  const u = ctx().user as UserProfile;
  const deal = db.byId('dealRooms', req.params.id) as DealRoom | undefined;
  if (!deal || !(isDealBroker(u, deal) || isAdmin(u))) { res.status(404).json({ error: 'Deal Room not found' }); return null; }
  if (!isDealBroker(u, deal)) {
    if (write) { res.status(403).json({ error: 'Only the two deal brokers can change their own side. GENZ does not record or confirm brokerage.' }); return null; }
    res.status(403).json({ error: 'Brokerage terms are private to the deal brokers.' }); return null;
  }
  if (!isOwnSide(deal)) { res.status(409).json({ error: 'This deal room shares one brokerage between the two brokers (split mode). "Apna-apna side" is not on.', code: 'NOT_OWN_SIDE' }); return null; }
  if (write) {
    const s = db.getState();
    if (openDisputeOf(s, deal.id) || deal.settlementStatus === 'DISPUTED') { res.status(409).json({ error: 'Frozen while a dispute is open on this deal room — the GENZ admin decides in the dispute.' }); return null; }
  }
  return { u, deal };
}

export function createSidesRouter() {
  const r = Router();

  r.get('/:id/sides', needs('deal:read'), (req: Request, res: Response) => {
    const c = load(req, res, false); if (!c) return;
    res.json({ success: true, side: sideViewFor(c.deal, c.u) });
  });

  r.put('/:id/sides/fee', needs('deal:commission'), (req: Request, res: Response) => {
    const c = load(req, res, true); if (!c) return;
    const { u, deal } = c;
    const amount = Number(req.body?.amount);
    if (!validSideFee(amount)) return res.status(400).json({ error: 'Write your fee as a whole rupee amount (₹1 or more).' });
    if ((deal.sideReceipts?.[u.id]?.total ?? 0) > amount) return res.status(409).json({ error: 'You have already written down more received than this fee.' });
    if (deal.sideUndertaking?.[u.id] && (deal.sideReceipts?.[u.id]?.total ?? 0) > 0) return res.status(409).json({ error: 'You have already started receiving — the fee can no longer be changed.' });
    const now = new Date().toISOString();
    deal.sideFees = { ...(deal.sideFees || {}), [u.id]: { amount, note: str(req.body?.note, 200) || undefined, at: now } };
    deal.updatedAt = now;
    db.save();
    // the amount is NOT written into the trail: the other broker can read it
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', deal.id, 'SIDE_FEE_SET', `${u.name} wrote down the brokerage of their own client (${sideOf(deal, u.id) === 'SELLER' ? 'seller' : 'buyer'} side). The amount stays private.`);
    res.json({ success: true, side: sideViewFor(deal, u) });
  });

  r.post('/:id/sides/undertaking', needs('agreement:sign'), (req: Request, res: Response) => {
    const c = load(req, res, true); if (!c) return;
    const { u, deal } = c;
    if (deal.sideUndertaking?.[u.id]) return res.status(409).json({ error: 'You have already signed this.' });
    const now = new Date().toISOString();
    deal.sideUndertaking = { ...(deal.sideUndertaking || {}), [u.id]: now };
    deal.updatedAt = now;
    db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', deal.id, 'SIDE_UNDERTAKING_SIGNED',
      `${u.name} signed: brokerage only from their own client, no direct dealing with the other broker's client.${undertakingDone(deal) ? ' Both brokers have signed.' : ''}`);
    res.json({ success: true, side: sideViewFor(deal, u) });
  });

  r.post('/:id/sides/received', needs('deal:commission'), (req: Request, res: Response) => {
    const c = load(req, res, true); if (!c) return;
    const { u, deal } = c;
    const fee = feeOf(deal, u.id);
    if (fee <= 0) return res.status(409).json({ error: 'Write down your fee first.' });
    if (!undertakingDone(deal)) return res.status(409).json({ error: 'Both brokers must sign the "own client only" undertaking first.' });
    const amount = Number(req.body?.amount);
    const rec = deal.sideReceipts?.[u.id] || { entries: [], total: 0 };
    const outstanding = fee - rec.total;
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0 || amount > outstanding) {
      return res.status(400).json({ error: `Received amount must be between ₹1 and your outstanding ₹${Math.max(0, outstanding).toLocaleString('en-IN')}` });
    }
    const ref = str(req.body?.ref, 60);
    if (!REF_RE.test(ref)) return res.status(400).json({ error: 'Write the bank reference (UTR / cheque no. / transaction id), 4–60 characters' });
    const day = str(req.body?.paidOn, 10);
    const dayMs = Date.parse(`${day}T00:00:00+05:30`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(dayMs) || dayMs > Date.now() + 86_400_000 || dayMs < Date.now() - 2 * 365 * 86_400_000) {
      return res.status(400).json({ error: 'Date must be a real date (YYYY-MM-DD) within the last two years, not in the future' });
    }
    if (rec.entries.some(e => e.ref.toLowerCase() === ref.toLowerCase() && e.amount === amount)) return res.status(409).json({ error: 'This reference and amount is already written down' });
    const now = new Date().toISOString();
    const entry = { id: `SR-${rec.entries.length + 1}`, amount, ref, paidOn: day, at: now };
    deal.sideReceipts = { ...(deal.sideReceipts || {}), [u.id]: { entries: [...rec.entries, entry], total: rec.total + amount } };
    deal.updatedAt = now;
    // GENZ's own fee (if an admin set one) on what this broker recorded — same event as a split-deal receipt
    const prop = db.byId('properties', deal.propertyId);
    if (u.role === 'BROKER') chargeEvent({ event: 'BROKER_DEAL', payerId: u.id, base: amount, refId: `${deal.id}/${entry.id}/${u.id}`, refLabel: `Deal ${deal.id} · own-side receipt ${entry.id}`, dealId: deal.id, state: prop?.state || undefined });
    db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', deal.id, 'SIDE_RECEIPT_RECORDED', `${u.name} wrote down a receipt from their own client (ref ${ref}). The amount stays private.${brokerDone(deal, u.id) ? ' Their side is complete.' : ''}`);
    res.json({ success: true, side: sideViewFor(deal, u), allDone: allSidesDone(deal) });
  });

  return r;
}
