/**
 * v71 — हिसाब (deal accounts). One simple record per deal of who paid what — GENZ holds NONE of this money, it only keeps the record.
 *
 *   SALE money (buyer → owner): token, part payments, final payment, refunds. A deal broker writes each entry, the owner (or the other
 *   broker) can confirm "मिल गया". Token already recorded on an accepted offer is picked up by itself (never typed twice).
 *   BROKERAGE (private, per broker): what I should get, what I received (from owner / buyer / co-broker) and what I paid out
 *   (co-broker share, partner reward). A paid brokerage bill (v48) is counted by itself. The other broker never sees my book.
 *
 *   GET  /api/deals/:id/hisaab
 *   POST /api/deals/:id/hisaab/payments            { kind, amount, mode, ref?, paidOn, note? }
 *   POST /api/deals/:id/hisaab/payments/:pid/ack | /void
 *   POST /api/deals/:id/hisaab/book                { dir, party, amount, mode, ref?, paidOn, note? }
 *   POST /api/deals/:id/hisaab/book/:eid/void
 *   PUT  /api/deals/:id/hisaab/due                 { amount }   (my brokerage amount, when the automatic figure is not right)
 *   GET  /api/hisaab                                my deals at a glance
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import type { DealRoom, DealPayment, BrokerBookEntry, PayMode, UserProfile, FeeCut } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { isDealBroker } from './access.js';
import { mandateShareAt } from '../src/shared/mandateShare.js';
import { feeOf, isOwnSide } from '../src/shared/sideFees.js';
import { linksFor } from './shopPartners.js';
import { partnerAmount, sideOfKind } from '../src/shared/shopPartner.js';

const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const nowIso = () => new Date().toISOString();
const rid = (p: string) => `${p}-${crypto.randomBytes(5).toString('hex')}`;
const MODES: PayMode[] = ['UPI', 'BANK', 'CASH', 'CHEQUE'];
const MAX = 10_00_00_000;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const safeRef = (v: unknown) => { const r = str(v, 60); return /^[A-Za-z0-9][A-Za-z0-9 \-\/_.,#:]{0,59}$/.test(r) ? r : ''; };

export const priceOf = (d: DealRoom) => {
  if (d.dealValue && d.dealValue > 0) return { price: d.dealValue, source: d.dealValueSource || 'MANUAL' };
  const p = st().properties.find(x => x.id === d.propertyId);
  return { price: p?.askingPrice || 0, source: 'ASKING' as const };
};
const activeMandate = (d: DealRoom) => st().ownerMandates.filter(m => m.propertyId === d.propertyId && m.status === 'ACTIVE' && m.isConfirmed).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];

/** v72 — a fee cut at the FINAL price: % of the price (follows it) or a fixed ₹ */
export const cutAt = (c: FeeCut | undefined, price: number) => (!c ? 0 : c.mode === 'PCT' ? Math.round(price * c.value / 100) : Math.round(c.value));
export function readCut(v: any): FeeCut | null | 'BAD' {
  if (v === null || v === undefined || v === '') return null;
  const mode = v.mode === 'FIXED' ? 'FIXED' : v.mode === 'PCT' ? 'PCT' : null; const n = Number(v.value);
  if (!mode || !Number.isFinite(n) || n <= 0) return 'BAD';
  if (mode === 'PCT') return n > 10 ? 'BAD' : { mode, value: Math.round(n * 100) / 100 };
  return Number.isInteger(n) && n <= MAX ? { mode, value: n } : 'BAD';
}
const cutText = (c: FeeCut) => (c.mode === 'PCT' ? `${c.value}%` : '₹' + c.value.toLocaleString('en-IN'));
/** the other broker of this deal (listing broker / introducing / closing), if any */
export function otherBrokerId(d: DealRoom, uid: string): string | undefined {
  const prop = st().properties.find(x => x.id === d.propertyId);
  return [d.introducingBrokerId, d.closingBrokerId, prop?.listingBrokerId].find(x => x && x !== uid);
}

/** the money a deal broker should get from his OWN clients: the owner's mandate (listing broker), his buyer-side fee (% of the final price or fixed), or the older own-side / split figure */
function dueFor(d: DealRoom, uid: string, price: number): { amount: number; basis: 'MANDATE' | 'OWN_SIDE' | 'SPLIT' | 'MANUAL' | 'PLAN' | 'MANDATE_PLAN' | 'NONE'; parts: { key: 'MANDATE' | 'BUYER_FEE' | 'OTHER'; amount: number; cut?: FeeCut }[] } {
  const typed = d.brokerBook?.[uid]?.due;
  if (typeof typed === 'number') return { amount: typed, basis: 'MANUAL', parts: [{ key: 'OTHER', amount: typed }] };
  const prop = st().properties.find(x => x.id === d.propertyId);
  const m = activeMandate(d); const plan = d.feePlans?.[uid]?.buyerSide;
  const parts: { key: 'MANDATE' | 'BUYER_FEE' | 'OTHER'; amount: number; cut?: FeeCut }[] = [];
  const mand = m && prop?.listingBrokerId === uid ? mandateShareAt(m, price).broker : 0;
  if (mand) parts.push({ key: 'MANDATE', amount: mand });
  if (plan) { parts.push({ key: 'BUYER_FEE', amount: cutAt(plan, price), cut: plan }); return { amount: parts.reduce((n, x) => n + x.amount, 0), basis: mand ? 'MANDATE_PLAN' : 'PLAN', parts }; }
  if (mand) return { amount: mand, basis: 'MANDATE', parts };
  if (isOwnSide(d)) { const a = feeOf(d, uid); return { amount: a, basis: 'OWN_SIDE', parts: [{ key: 'OTHER', amount: a }] }; }
  const total = d.totalCommissionExpected || 0;
  const share = d.introducingBrokerId === uid && d.closingBrokerId === uid ? 100 : d.introducingBrokerId === uid ? d.introducingBrokerSharePct : d.closingBrokerId === uid ? d.closingBrokerSharePct : 0;
  return total > 0 && share > 0 ? { amount: Math.round(total * share / 100), basis: 'SPLIT', parts: [{ key: 'OTHER', amount: Math.round(total * share / 100) }] } : { amount: 0, basis: 'NONE', parts: [] };
}

/** v72 — estimate of a shop partner's share on a deal (for his own page: from the Agreement stage). The deal price itself is never passed out. */
export function leadShareEstimate(l: { brokerId: string; kind: any; terms: any; won?: { amount: number } }, dealId: string): number {
  if (l.won) return l.won.amount;
  const d = db.byId('dealRooms', dealId) as DealRoom | undefined; if (!d) return 0;
  const cut = sideOfKind(l.kind) === 'SALE' ? l.terms.sale : l.terms.rent;
  return partnerAmount(cut, dueFor(d, l.brokerId, priceOf(d).price).amount);
}
/** v72 — the shop-QR partner share on THIS deal. Only the broker who owns that lead ever gets it (the co-broker never learns where a lead came from). */
function leadFeesFor(d: DealRoom, uid: string, myBrokerage: number) {
  return st().partnerLeads.filter(l => l.brokerId === uid && l.status !== 'LOST' && linksFor(l).some(x => x.kind === 'DEAL' && x.id === d.id)).map(l => {
    const sh = st().shopPartners.find(p => p.id === l.partnerId);
    const cut = sideOfKind(l.kind) === 'SALE' ? l.terms.sale : l.terms.rent;
    const amount = l.won ? l.won.amount : partnerAmount(cut, myBrokerage);
    return { leadId: l.id, shopName: sh?.shopName || '', amount, final: !!l.won, paid: !!l.payout && ['PAID', 'RECEIVED'].includes(l.payout.status) };
  });
}

const billTotal = (b: { items: { amount: number }[]; gstPct: number }) => { const sub = b.items.reduce((n, i) => n + i.amount, 0); return sub + Math.round(sub * (b.gstPct || 0) / 100); };

export function hisaabView(d: DealRoom, u: UserProfile) {
  const owner = d.ownerId === u.id; const broker = isDealBroker(u, d);
  const { price, source } = priceOf(d);
  const offerTok = st().propertyOffers.filter(o => o.dealRoomId === d.id && o.token && o.token.outcome !== 'REFUNDED' && o.token.outcome !== 'RELEASED');
  // v72 — a part the buyer paid straight to a broker: only the owner, the writer and that broker see its amount (it is a brokerage, not the other broker's business)
  const seesDirect = (p: DealPayment) => owner || p.byId === u.id || p.toBrokerId === u.id;
  const entries = [
    ...offerTok.map(o => ({ id: `offer:${o.id}`, kind: 'TOKEN' as const, amount: o.token!.amount, mode: undefined as PayMode | undefined, ref: o.token!.ref, paidOn: o.token!.receivedAt.slice(0, 10), note: 'ऑफ़र का टोकन / Token recorded on the offer', byName: 'offer', at: o.token!.receivedAt, ack: o.token!.buyerSideAckAt ? { at: o.token!.buyerSideAckAt } : undefined, auto: true, void: undefined as any, masked: false, toBrokerId: undefined as string | undefined })),
    ...(d.payments || []).map(p => (p.kind === 'TO_BROKER' && !seesDirect(p) ? { ...p, amount: 0, ref: undefined, note: undefined, mode: undefined as any, auto: false, masked: true } : { ...p, auto: false, masked: false })),
  ].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.at.localeCompare(b.at));
  const live = entries.filter(e => !e.void);
  const received = live.reduce((n, e) => n + (e.kind === 'REFUND' ? -e.amount : e.amount), 0);
  const tokenIn = live.filter(e => e.kind === 'TOKEN').reduce((n, e) => n + e.amount, 0);
  const direct = live.filter(e => e.kind === 'TO_BROKER').reduce((n, e) => n + e.amount, 0);
  const sauda = { price, priceSource: source, entries, received, token: tokenIn, direct, directHidden: live.some(e => (e as any).masked), balance: Math.max(0, price - received), over: Math.max(0, received - price), done: price > 0 && received >= price };
  const out: any = { dealId: d.id, me: u.id, role: broker ? 'BROKER' : owner ? 'OWNER' : 'NONE', sauda, canRecord: broker, canAck: owner || broker };
  const m = activeMandate(d); const prop = st().properties.find(x => x.id === d.propertyId);
  if (owner && m) {
    const fee = mandateShareAt(m, price).broker;
    // the owner's brokerage is paid to the listing broker; a paid bill (v48) to the owner, or money the buyer paid the broker directly, counts as paid
    const bills = st().paymentRequests.filter(b => b.dealId === d.id && b.party === 'OWNER' && b.status !== 'CANCELLED');
    const billPaid = bills.filter(b => b.status === 'PAID').reduce((n, b) => n + billTotal(b), 0);
    const viaBuyer = (d.payments || []).filter(p => !p.void && p.kind === 'TO_BROKER' && p.toBrokerId === prop?.listingBrokerId).reduce((n, p) => n + p.amount, 0);
    const paid = billPaid + viaBuyer;
    out.ownerBrokerage = { due: fee, paid, viaBuyer, left: Math.max(0, fee - paid), bills: bills.length };
    out.ownerHand = received - direct - billPaid; // received from the buyer minus what went straight to a broker, minus brokerage he paid himself
  }
  if (broker) {
    const due = dueFor(d, u.id, price);
    const book = (d.brokerBook?.[u.id]?.entries || []);
    const bills = st().paymentRequests.filter(b => b.dealId === d.id && b.brokerId === u.id && b.status === 'PAID').map(b => ({ id: `bill:${b.id}`, dir: 'IN' as const, party: b.party as BrokerBookEntry['party'], amount: billTotal(b), mode: undefined as PayMode | undefined, ref: b.paid?.ref, paidOn: (b.paid?.at || b.updatedAt).slice(0, 10), note: `बिल ${b.number}`, at: b.paid?.at || b.updatedAt, auto: true, void: undefined as any }));
    const viaBuyer = (d.payments || []).filter(p => !p.void && p.kind === 'TO_BROKER' && p.toBrokerId === u.id).map(p => ({ id: `direct:${p.id}`, dir: 'IN' as const, party: 'BUYER' as BrokerBookEntry['party'], amount: p.amount, mode: p.mode as PayMode | undefined, ref: p.ref, paidOn: p.paidOn, note: 'ख़रीदार ने सीधे दिया / buyer paid directly', at: p.at, auto: true, void: undefined as any }));
    const all = [...bills, ...viaBuyer, ...book.map(e => ({ ...e, auto: false }))].sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.at.localeCompare(b.at));
    const lv = all.filter(e => !e.void);
    const inn = lv.filter(e => e.dir === 'IN' && e.party !== 'BROKER').reduce((n, e) => n + e.amount, 0);
    const outt = lv.filter(e => e.dir === 'OUT' && e.party !== 'BROKER').reduce((n, e) => n + e.amount, 0);
    // v72 — between the two brokers only the DIFFERENCE moves
    const oid = otherBrokerId(d, u.id); const other = oid ? st().users.find(x => x.id === oid) : undefined;
    const myOut = d.feePlans?.[u.id]?.shareOut; const theirs = oid ? d.feePlans?.[oid]?.shareOut : undefined;
    const give = cutAt(myOut, price); const get = cutAt(theirs, price);
    const paidTo = lv.filter(e => e.dir === 'OUT' && e.party === 'BROKER').reduce((n, e) => n + e.amount, 0);
    const gotFrom = lv.filter(e => e.dir === 'IN' && e.party === 'BROKER').reduce((n, e) => n + e.amount, 0);
    const net = give - get; // + = I pay him, − = he pays me
    const left = net - (paidTo - gotFrom);
    const aapas = oid ? { otherName: other?.name || '', shareOut: myOut ? { ...myOut, amount: give } : null, shareIn: theirs ? { ...theirs, amount: get } : null, give, get, net, settled: paidTo - gotFrom, left, who: left > 0 ? 'I_PAY' : left < 0 ? 'HE_PAYS' : 'SQUARE' } : null;
    const leadFees = leadFeesFor(d, u.id, due.amount);
    const leadTotal = leadFees.filter(x => !x.paid).reduce((n, x) => n + x.amount, 0);
    const leadPaid = leadFees.filter(x => x.paid).reduce((n, x) => n + x.amount, 0);
    out.brokers = [...new Set([d.introducingBrokerId, d.closingBrokerId, prop?.listingBrokerId].filter(Boolean) as string[])].map(id => ({ id, name: st().users.find(x => x.id === id)?.name || id, me: id === u.id }));
    out.plan = { buyerSide: d.feePlans?.[u.id]?.buyerSide || null, shareOut: myOut || null };
    out.brokerage = { due: due.amount, dueBasis: due.basis, dueParts: due.parts, entries: all, received: inn, paidOut: outt, left: Math.max(0, due.amount - inn), over: Math.max(0, inn - due.amount), inHand: inn - outt + gotFrom - paidTo,
      aapas, leadFees, leadTotal, netEstimate: due.amount + get - give - leadTotal - leadPaid };
  }
  return out;
}

function loadDeal(req: Request, res: Response, who: 'any' | 'broker' = 'any'): DealRoom | null {
  const u = me(); const d = db.byId('dealRooms', req.params.id) as DealRoom | undefined;
  if (!d) { bad(res, 'Deal not found', 404); return null; }
  const ok = isDealBroker(u, d) || (who === 'any' && d.ownerId === u.id);
  if (!ok) { bad(res, 'Only the people of this deal can see its accounts', 403); return null; }
  return d;
}
function readEntry(body: any) {
  const amount = Math.round(Number(body?.amount));
  if (!Number.isFinite(amount) || amount < 1 || amount > MAX) return { error: 'Enter the amount in rupees (₹1 – ₹10 crore)' } as const;
  const mode = MODES.includes(body?.mode) ? (body.mode as PayMode) : null; if (!mode) return { error: 'Choose how it was paid (UPI / Bank / Cash / Cheque)' } as const;
  const paidOn = str(body?.paidOn, 10) || nowIso().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Date.parse(paidOn) > Date.now() + 86400_000 || paidOn < '2020-01-01') return { error: 'Choose the date it was paid (not a future date)' } as const;
  const ref = safeRef(body?.ref); if (mode !== 'CASH' && !ref && (str(body?.ref, 60) !== '')) return { error: 'The reference may have letters, numbers and - / _ . only' } as const;
  return { amount, mode, paidOn, ref: ref || undefined, note: str(body?.note, 200) || undefined } as const;
}

export function createHisaabRouter() {
  const r = Router();
  r.get('/:id/hisaab', needs('deal:read'), (req, res) => { const d = loadDeal(req, res); if (!d) return; res.json({ success: true, hisaab: hisaabView(d, me()) }); });

  r.post('/:id/hisaab/payments', needs('deal:read'), rateLimit('hisaab-pay', 60, 3600_000), (req, res) => {
    const d = loadDeal(req, res, 'broker'); if (!d) return; const u = me();
    const e = readEntry(req.body); if ('error' in e) return bad(res, e.error || 'Check the entry');
    const kind = ['TOKEN', 'PART', 'FINAL', 'REFUND', 'TO_BROKER'].includes(req.body?.kind) ? req.body.kind as DealPayment['kind'] : null; if (!kind) return bad(res, 'Choose what this payment is (token / part / final / refund)');
    if (kind === 'TOKEN' && st().propertyOffers.some(o => o.dealRoomId === d.id && o.token)) return bad(res, 'The token is already recorded on the accepted offer — it is counted here by itself', 409, { code: 'TOKEN_FROM_OFFER' });
    let toBrokerId: string | undefined;
    if (kind === 'TO_BROKER') { toBrokerId = str(req.body?.toBrokerId, 80) || u.id; const tb = st().users.find(x => x.id === toBrokerId); if (!tb || !isDealBroker(tb, d)) return bad(res, 'Choose which broker of this deal received it'); }
    const list = d.payments || (d.payments = []);
    if (list.length >= 60) return bad(res, 'Too many entries on this deal');
    const p: DealPayment = { id: rid('PAY'), kind, toBrokerId, amount: e.amount, mode: e.mode, ref: e.ref, paidOn: e.paidOn, note: e.note, byId: u.id, byName: u.name, at: nowIso() };
    list.push(p); d.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'DEAL', d.id, 'DEAL_PAYMENT_RECORDED', `${kind} ₹${e.amount.toLocaleString('en-IN')} (${e.mode}) recorded on the sale`);
    res.json({ success: true, hisaab: hisaabView(d, u) });
  });
  r.post('/:id/hisaab/payments/:pid/ack', needs('deal:read'), (req, res) => {
    const d = loadDeal(req, res); if (!d) return; const u = me();
    const p = (d.payments || []).find(x => x.id === req.params.pid); if (!p || p.void) return bad(res, 'Entry not found', 404);
    if (p.byId === u.id) return bad(res, 'You wrote this entry — the owner or the other broker confirms it', 403);
    p.ack = { byId: u.id, byName: u.name, at: nowIso() }; db.save();
    db.appendAuditEvent(u.id, u.role, 'DEAL', d.id, 'DEAL_PAYMENT_CONFIRMED', `${p.kind} ₹${p.amount.toLocaleString('en-IN')} confirmed`);
    res.json({ success: true, hisaab: hisaabView(d, u) });
  });
  r.post('/:id/hisaab/payments/:pid/void', needs('deal:read'), (req, res) => {
    const d = loadDeal(req, res, 'broker'); if (!d) return; const u = me();
    const p = (d.payments || []).find(x => x.id === req.params.pid); if (!p || p.void) return bad(res, 'Entry not found', 404);
    if (p.byId !== u.id) return bad(res, 'Only the broker who wrote it can cancel it', 403);
    if (p.ack) return bad(res, 'The other side has already confirmed this entry — add a correcting entry (refund) instead', 409, { code: 'CONFIRMED' });
    const reason = str(req.body?.reason, 120); if (reason.length < 3) return bad(res, 'Write a short reason');
    p.void = { at: nowIso(), byId: u.id, reason }; db.save();
    db.appendAuditEvent(u.id, u.role, 'DEAL', d.id, 'DEAL_PAYMENT_VOIDED', `${p.kind} ₹${p.amount.toLocaleString('en-IN')} cancelled: ${reason}`);
    res.json({ success: true, hisaab: hisaabView(d, u) });
  });

  r.post('/:id/hisaab/book', needs('deal:read'), rateLimit('hisaab-book', 60, 3600_000), (req, res) => {
    const d = loadDeal(req, res, 'broker'); if (!d) return; const u = me();
    const e = readEntry(req.body); if ('error' in e) return bad(res, e.error || 'Check the entry');
    const dir = req.body?.dir === 'OUT' ? 'OUT' : req.body?.dir === 'IN' ? 'IN' : null; if (!dir) return bad(res, 'Choose: money received or money paid out');
    const party = ['OWNER', 'BUYER', 'BROKER', 'OTHER'].includes(req.body?.party) ? req.body.party : 'OTHER';
    const book = (d.brokerBook ||= {}); const mine = (book[u.id] ||= { entries: [] });
    if (mine.entries.length >= 80) return bad(res, 'Too many entries on this deal');
    const row: BrokerBookEntry = { id: rid('BKE'), dir, party, amount: e.amount, mode: e.mode, ref: e.ref, paidOn: e.paidOn, note: e.note, at: nowIso() };
    mine.entries.push(row); db.save();
    db.appendAuditEvent(u.id, u.role, 'DEAL', d.id, 'BROKERAGE_ENTRY', `Brokerage ${dir === 'IN' ? 'received' : 'paid out'} ₹${e.amount.toLocaleString('en-IN')} noted by the broker`);
    res.json({ success: true, hisaab: hisaabView(d, u) });
  });
  r.post('/:id/hisaab/book/:eid/void', needs('deal:read'), (req, res) => {
    const d = loadDeal(req, res, 'broker'); if (!d) return; const u = me();
    const row = d.brokerBook?.[u.id]?.entries.find(x => x.id === req.params.eid); if (!row || row.void) return bad(res, 'Entry not found', 404);
    const reason = str(req.body?.reason, 120); if (reason.length < 3) return bad(res, 'Write a short reason');
    row.void = { at: nowIso(), reason }; db.save();
    db.appendAuditEvent(u.id, u.role, 'DEAL', d.id, 'BROKERAGE_ENTRY_VOIDED', `A brokerage entry of ₹${row.amount.toLocaleString('en-IN')} was cancelled`);
    res.json({ success: true, hisaab: hisaabView(d, u) });
  });
  /** v72 — my fee plan: buyer-side fee and what I give the co-broker, as % of the FINAL price (or fixed ₹). Private: the co-broker sees only my share-out cut. */
  r.put('/:id/hisaab/plan', needs('deal:read'), (req, res) => {
    const d = loadDeal(req, res, 'broker'); if (!d) return; const u = me();
    const plans = (d.feePlans ||= {}); const mine = (plans[u.id] ||= {});
    for (const k of ['buyerSide', 'shareOut'] as const) {
      if (!(k in (req.body || {}))) continue;
      const c = readCut(req.body[k]); if (c === 'BAD') return bad(res, 'Write the fee as a % of the final price (0.1 – 10) or a fixed amount in rupees');
      if (c === null) delete mine[k]; else mine[k] = c;
    }
    if (mine.shareOut && !otherBrokerId(d, u.id)) return bad(res, 'There is no second broker on this deal to share with');
    d.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'DEAL', d.id, 'FEE_PLAN_SET', 'A broker updated his own fee plan');
    res.json({ success: true, hisaab: hisaabView(d, u) });
  });
  r.put('/:id/hisaab/due', needs('deal:read'), (req, res) => {
    const d = loadDeal(req, res, 'broker'); if (!d) return; const u = me();
    const raw = req.body?.amount;
    const book = (d.brokerBook ||= {}); const mine = (book[u.id] ||= { entries: [] });
    if (raw === null || raw === '') mine.due = undefined;
    else { const n = Math.round(Number(raw)); if (!Number.isFinite(n) || n < 0 || n > MAX) return bad(res, 'Enter your brokerage amount in rupees'); mine.due = n; }
    db.save(); res.json({ success: true, hisaab: hisaabView(d, u) });
  });
  return r;
}

/** my deals at a glance (Deal Desk → हिसाब) */
export function createHisaabListRouter() {
  const r = Router();
  r.get('/', needs('deal:read'), (_req, res) => {
    const u = me();
    const deals = st().dealRooms.filter(d => isDealBroker(u, d) || d.ownerId === u.id);
    const rows = deals.map(d => {
      const v = hisaabView(d, u); const prop = st().properties.find(p => p.id === d.propertyId);
      return { dealId: d.id, title: prop?.title || d.propertyId, stage: d.stage, role: v.role, price: v.sauda.price, received: v.sauda.received, balance: v.sauda.balance, token: v.sauda.token,
        brokerage: v.brokerage ? { due: v.brokerage.due, received: v.brokerage.received, left: v.brokerage.left, paidOut: v.brokerage.paidOut, inHand: v.brokerage.inHand } : undefined,
        ownerHand: v.ownerHand, ownerBrokerage: v.ownerBrokerage, updatedAt: d.updatedAt };
    }).filter(x => x.price > 0 || x.received > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const tot = rows.reduce((t, x) => ({ received: t.received + x.received, balance: t.balance + x.balance, brokerDue: t.brokerDue + (x.brokerage?.due || 0), brokerGot: t.brokerGot + (x.brokerage?.received || 0), brokerOut: t.brokerOut + (x.brokerage?.paidOut || 0) }), { received: 0, balance: 0, brokerDue: 0, brokerGot: 0, brokerOut: 0 });
    res.json({ success: true, deals: rows, totals: tot });
  });
  return r;
}
