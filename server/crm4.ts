/**
 * v16.9 — Money Trail.  Mounted at /api/crm/money.
 *
 *   collector (the partner's team member) ─▶ partner confirms ─▶ partner hands it to the builder ─▶ builder's authorised accounts person confirms
 *
 * At every moment the screen can say WHO HOLDS THE PAYMENT. GENZ moves no money and holds none: each stage is recorded by the person who has
 * the money, and the next person in the chain confirms it. The shared ledger (booking amount / instalment receipts — and with them the
 * brokerage that becomes payable) changes only on the last step, when the builder side confirms it arrived.
 *
 * Employees (TEAM_MEMBER) never get the booking itself (brokerage, agreement value, payouts stay with the employer): they see only trail rows —
 * the customer, the unit, the amount, the stages — and only as far as the employer's two switches allow (collect money / confirm money).
 */
import { alert, firstName, moneyConfirmers } from './alerts.js';
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { isAdmin } from './access.js';
import { policyOf } from '../src/shared/pcontrolRules.js';
import { auditCrm, confirmToken, paidOf, nowIso, type CrmUser } from './crm.js';
import {
  trailActions, holderOf, holderName, holderTotals, builderNeedsNote, cleanNewTrail, reservedOn, openTrailOn, isOpenTrail, routeOf, startStatus, newTrailId,
  trailAgeDays, TRAIL_MODE_IDS, TRAIL_NOTE_MIN,
  type MoneyTrail, type TrailActor, type TrailSide, type TrailStage,
} from '../src/shared/moneyTrail.js';
import type { CrmBooking, CrmLead } from '../src/types/crm.js';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const NO_ACTOR = (id: string): TrailActor => ({ id, side: null, canCollect: false, canConfirm: false });
const SIDE_EN: Record<TrailSide, string> = { CP_OWNER: 'partner', CP_STAFF: 'partner\'s team', BUILDER_OWNER: 'builder', BUILDER_STAFF: 'builder\'s team' };

/** Which side of this booking is the caller on, and what his employer allows him. */
export function actorOn(u: { id: string; role: string; employerId?: string }, b: CrmBooking): TrailActor {
  if (u.role === 'BROKER') return b.associateId && b.associateId === u.id ? { id: u.id, side: 'CP_OWNER', canCollect: true, canConfirm: true } : NO_ACTOR(u.id);
  if (u.role === 'DEVELOPER_BUILDER') return b.builderId === u.id ? { id: u.id, side: 'BUILDER_OWNER', canCollect: true, canConfirm: true } : NO_ACTOR(u.id);
  if (u.role === 'TEAM_MEMBER') {
    const mu = db.byId('users', u.id);
    if (!mu || mu.verificationStatus !== 'VERIFIED' || !mu.employerId) return NO_ACTOR(u.id);
    const pol = policyOf(mu);
    const base = { id: u.id, canCollect: !!pol.canCollectMoney, canConfirm: !!pol.canConfirmMoney };
    if (b.associateId && mu.employerId === b.associateId) return { ...base, side: 'CP_STAFF' };
    if (mu.employerId === b.builderId) return { ...base, side: 'BUILDER_STAFF' };
  }
  return NO_ACTOR(u.id);
}

/** An employee may start a collection only on a customer he works with — or on any of the employer's bookings when he is the authorised (confirming) person. */
function staffMayCollect(a: TrailActor, b: CrmBooking, lead: CrmLead | undefined): boolean {
  if (a.side !== 'CP_STAFF' && a.side !== 'BUILDER_STAFF') return true;
  if (!a.canCollect) return false;
  return a.canConfirm || b.requestedBy?.id === a.id || lead?.assignedMemberId === a.id;
}

const userName = (id?: string) => (id ? db.byId('users', id)?.name : undefined);

export interface TrailRow extends MoneyTrail {
  customerName: string; projectName: string; unitNo: string; bookingStatus: CrmBooking['status']; cpName: string; builderName: string; direct: boolean;
  holder: { kind: ReturnType<typeof holderOf>; name: string };
  ageDays: number;
  can: ReturnType<typeof trailActions>;
  /** the builder side must write a reason for this confirmation (out of order, or "not received") */
  noteRequired: { received: boolean; notReceived: boolean };
}

function rowOf(t: MoneyTrail, b: CrmBooking, a: TrailActor | null): TrailRow {
  const cpName = b.associateId ? (userName(b.associateId) || 'Partner') : '—';
  const builderName = userName(b.builderId) || 'Builder';
  return {
    ...t, customerName: b.customerName, projectName: b.projectName, unitNo: b.unitNo, bookingStatus: b.status, cpName, builderName, direct: !!b.direct,
    holder: { kind: holderOf(t), name: holderName(t, cpName, builderName) }, ageDays: trailAgeDays(t),
    can: trailActions(t, a), noteRequired: { received: builderNeedsNote(t, true), notReceived: true },
  };
}

/** Every trail the caller may see, as rows. Owners see all of their bookings; staff see the ones they collected, or all of the employer's when authorised to confirm; admins see all (read-only). */
export function trailsFor(u: CrmUser & { employerId?: string }): TrailRow[] {
  const out: TrailRow[] = [];
  const admin = isAdmin(u as any);
  for (const b of db.getState().crmBookings) {
    if (!b.trails?.length) continue;
    const a = admin ? null : actorOn(u, b);
    if (!admin && !a?.side) continue;
    for (const t of b.trails) {
      if (!admin) {
        const staff = a!.side === 'CP_STAFF' || a!.side === 'BUILDER_STAFF';
        if (staff && !a!.canConfirm && t.collector.id !== u.id) continue;
        if (staff && !a!.canConfirm && !a!.canCollect) continue;
      }
      out.push(rowOf(t, b, a));
    }
  }
  return out.sort((x, y) => Date.parse(y.updatedAt) - Date.parse(x.updatedAt));
}

export function createMoneyTrailRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json(code ? { error, code } : { error });
  const st = () => db.getState();
  const leadOf = (b: CrmBooking) => db.byId('crmLeads', b.leadId);
  const lead = (b: CrmBooking, note: string) => {
    const l = leadOf(b); const u = me(); if (!l) return;
    l.activities.unshift({ id: `A-${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`, type: 'SYSTEM', note, byUserId: u.id, byName: u.name, at: nowIso() });
    l.updatedAt = nowIso();
  };

  /** the booking + trail the caller may open (404 otherwise, never revealing others' rows) */
  const open = (req: Request, res: Response): { b: CrmBooking; t: MoneyTrail; a: TrailActor } | null => {
    const u = me();
    const b = st().crmBookings.find(x => (x.trails || []).some(t => t.id === req.params.id));
    const t = b?.trails?.find(x => x.id === req.params.id);
    if (!b || !t) { bad(res, 'Money entry not found', 404); return null; }
    const a = actorOn(u, b);
    const seen = trailsFor(u as any).some(x => x.id === t.id);
    if (!a.side || !seen) { bad(res, 'Money entry not found', 404); return null; }
    return { b, t, a };
  };
  const step = (t: MoneyTrail, stage: TrailStage, a: TrailActor, extra: { note?: string; ref?: string; mode?: string } = {}) => {
    const u = me(); const ts = nowIso();
    t.steps.push({ stage, at: ts, byId: u.id, byName: u.name, side: a.side!, ...(extra.note ? { note: extra.note.slice(0, 200) } : {}), ...(extra.ref ? { ref: extra.ref } : {}), ...(extra.mode ? { mode: extra.mode } : {}) });
    t.updatedAt = ts;
  };
  const cleanNote = (v: unknown) => String(v ?? '').trim().slice(0, 200);

  // ── the list + the "who holds the money" totals ──
  r.get('/trails', needs('crm:read'), (req: Request, res: Response) => {
    const u = me();
    let rows = trailsFor(u as any);
    const bookingId = typeof req.query.bookingId === 'string' ? req.query.bookingId : '';
    if (bookingId) rows = rows.filter(x => x.bookingId === bookingId);
    const totals = holderTotals(rows);
    const pol = u.role === 'TEAM_MEMBER' ? policyOf(u) : null;
    res.json({
      success: true, rows: rows.slice(0, 300), totals,
      canCollect: u.role === 'BROKER' || u.role === 'DEVELOPER_BUILDER' || !!pol?.canCollectMoney,
      canConfirm: u.role === 'BROKER' || u.role === 'DEVELOPER_BUILDER' || !!pol?.canConfirmMoney,
      readOnly: isAdmin(u as any),
    });
  });

  // ── what money can this person record right now (bookings → targets still open) ──
  r.get('/collectables', needs('crm:money_collect'), (_req: Request, res: Response) => {
    const u = me();
    const out: { bookingId: string; customerName: string; projectName: string; unitNo: string; status: CrmBooking['status']; targets: { target: string; name: string; amount: number; fixed: boolean }[] }[] = [];
    for (const b of st().crmBookings) {
      if (b.status !== 'REQUESTED' && b.status !== 'APPROVED') continue;
      const a = actorOn(u, b);
      if (!a.side || !a.canCollect || !staffMayCollect(a, b, leadOf(b))) continue;
      const targets: { target: string; name: string; amount: number; fixed: boolean }[] = [];
      if (b.token && b.token.status !== 'RECEIVED' && !openTrailOn(b.trails, 'TOKEN')) targets.push({ target: 'TOKEN', name: 'Booking amount', amount: b.token.amount, fixed: true });
      if (b.status === 'APPROVED') {
        for (const m of b.paymentSchedule) {
          const pending = m.amount - paidOf(m) - reservedOn(b.trails, m.id);
          if (pending > 0) targets.push({ target: m.id, name: m.name, amount: pending, fixed: false });
        }
      }
      if (targets.length) out.push({ bookingId: b.id, customerName: b.customerName, projectName: b.projectName, unitNo: b.unitNo, status: b.status, targets });
    }
    res.json({ success: true, bookings: out });
  });

  // ── 1. the collector records the money he took ──
  r.post('/trails', needs('crm:money_collect'), rateLimit('money-trail-start', 300, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me();
    if (isAdmin(u as any)) return bad(res, 'The platform only watches the money trail — the partner and the builder record it', 403);
    const b = st().crmBookings.find(x => x.id === String(req.body?.bookingId || ''));
    const a = b ? actorOn(u, b) : NO_ACTOR(u.id);
    if (!b || !a.side) return bad(res, 'Booking not found', 404);
    if (!a.canCollect) return bad(res, 'Your employer has not allowed you to record collected money', 403, 'MONEY_NOT_ALLOWED');
    if (!staffMayCollect(a, b, leadOf(b))) return bad(res, 'You can record money only for customers you work with', 403);
    if (b.status !== 'REQUESTED' && b.status !== 'APPROVED') return bad(res, `This booking is ${b.status.toLowerCase()} — no money can be recorded on it`, 409);
    const c = cleanNewTrail(req.body);
    if ('error' in c) return bad(res, c.error);
    const d = c.ok;
    let targetName: string;
    if (d.target === 'TOKEN') {
      if (!b.token || b.token.status === 'RECEIVED') return bad(res, 'There is no pending booking amount on this booking', 409);
      if (d.amount !== b.token.amount) return bad(res, `The booking amount on this request is ${inr(b.token.amount)} — record exactly that`, 400);
      if (openTrailOn(b.trails, 'TOKEN')) return bad(res, 'The booking amount is already travelling through the Money Trail', 409, 'MONEY_TRAIL_OPEN');
      targetName = 'Booking amount';
    } else {
      if (b.status !== 'APPROVED') return bad(res, 'Instalments can be recorded only after the builder approves the booking', 409);
      const m = b.paymentSchedule.find(x => x.id === d.target);
      if (!m) return bad(res, 'Instalment not found', 404);
      const pending = m.amount - paidOf(m) - reservedOn(b.trails, m.id);
      if (pending <= 0) return bad(res, 'Nothing is pending on this instalment', 409);
      if (d.amount > pending) return bad(res, `Only ${inr(pending)} is pending on this instalment`, 400);
      targetName = m.name;
    }
    const ts = nowIso();
    const t: MoneyTrail = {
      id: newTrailId(), bookingId: b.id, target: d.target, targetName, amount: d.amount, mode: d.mode, ...(d.ref ? { ref: d.ref } : {}), ...(d.paidOn ? { paidOn: d.paidOn } : {}),
      collector: { id: u.id, name: u.name, side: a.side }, route: routeOf(a.side), status: startStatus(a.side), steps: [], createdAt: ts, updatedAt: ts,
    };
    b.trails = [t, ...(b.trails || [])];
    step(t, 'COLLECTED', a, { note: d.note, ref: d.ref, mode: d.mode });
    b.updatedAt = ts;
    lead(b, `${inr(d.amount)} (${targetName}) collected by ${u.name} — with ${a.side === 'CP_OWNER' ? 'the partner' : u.name}`);
    db.save();
    // v59 — the person who must confirm next: the partner (money his staff collected) or the builder's accounts side
    if (t.route === 'CP') alert(moneyConfirmers(b.associateId), 'deals', 'Money to confirm', `${u.name} collected ${inr(d.amount)} (${targetName}) from ${firstName(b.customerName)} — did it reach you?`, '/?tab=crm', { not: u.id, tag: `mt-${t.id}`, hi: ['पैसा कन्फ़र्म करें', `${u.name} ने ${firstName(b.customerName)} से ${inr(d.amount)} (${targetName}) लिए — क्या आपके पास पहुँचे?`] });
    else alert(moneyConfirmers(b.builderId), 'deals', 'Money to confirm', `${inr(d.amount)} (${targetName}) for unit ${b.unitNo} recorded by ${u.name} — confirm when it is in the account`, '/?tab=crm', { not: u.id, tag: `mt-${t.id}`, hi: ['पैसा कन्फ़र्म करें', `यूनिट ${b.unitNo} के लिए ${inr(d.amount)} (${targetName}) — ${u.name} ने दर्ज किया; खाते में आने पर कन्फ़र्म करें`] });
    auditCrm('MONEY_TRAIL_COLLECTED', t.id, `${inr(d.amount)} for ${targetName} on ${b.id} (${b.customerName}) collected by ${u.name} (${SIDE_EN[a.side]}); ${d.mode}${d.ref ? ` ref ${d.ref}` : ''}`, 'COMMISSION');
    res.json({ success: true, trail: rowOf(t, b, a) });
  });

  // ── 2. the partner confirms the money reached him from his team member (or says it did not) ──
  r.post('/trails/:id/cp-confirm', needs('crm:money_confirm'), (req: Request, res: Response) => {
    const o = open(req, res); if (!o) return;
    const { b, t, a } = o; const u = me();
    if (typeof req.body?.received !== 'boolean') return bad(res, 'received must be true or false');
    const can = trailActions(t, a);
    if (!can.cpConfirm) {
      if (t.route !== 'CP') return bad(res, 'This money was collected on the builder\'s side — the builder confirms it', 409);
      if (a.id === t.collector.id) return bad(res, 'You cannot confirm money you collected yourself — someone else must', 403);
      if (a.side !== 'CP_OWNER' && !(a.side === 'CP_STAFF' && a.canConfirm)) return bad(res, 'Only the partner or a team member he has authorised can confirm this', 403, 'MONEY_NOT_ALLOWED');
      return bad(res, 'This money is not waiting for the partner\'s confirmation', 409);
    }
    const note = cleanNote(req.body?.note);
    if (!req.body.received && note.length < TRAIL_NOTE_MIN) return bad(res, `Say why — e.g. "${t.collector.name} has not given it to me yet"`);
    if (req.body.received) { t.status = 'WITH_CP'; step(t, 'CP_CONFIRMED', a, { note }); }
    else { t.status = 'DISPUTED'; step(t, 'CP_NOT_RECEIVED', a, { note }); }
    b.updatedAt = nowIso();
    lead(b, `${inr(t.amount)} (${t.targetName}): ${req.body.received ? 'partner confirmed it received the money from' : 'partner says it has NOT received the money from'} ${t.collector.name}${note ? ` — ${note}` : ''}`);
    db.save();
    auditCrm(req.body.received ? 'MONEY_TRAIL_CP_CONFIRMED' : 'MONEY_TRAIL_DISPUTED', t.id, `${inr(t.amount)} on ${b.id}: ${u.name} (${SIDE_EN[a.side!]}) ${req.body.received ? 'confirmed receiving it from' : 'says it was NOT received from'} ${t.collector.name}${note ? ` — ${note}` : ''}`, 'COMMISSION');
    res.json({ success: true, trail: rowOf(t, b, a) });
  });

  // ── 3. the partner hands the money to the builder ──
  r.post('/trails/:id/handover', needs('crm:money_collect'), (req: Request, res: Response) => {
    const o = open(req, res); if (!o) return;
    const { b, t, a } = o; const u = me();
    const can = trailActions(t, a);
    if (!can.handover) {
      if (t.route !== 'CP') return bad(res, 'This money was collected on the builder\'s side — there is no hand-over', 409);
      if (a.side !== 'CP_OWNER' && !(a.side === 'CP_STAFF' && a.canConfirm)) return bad(res, 'Only the partner or a team member he has authorised can hand money over to the builder', 403, 'MONEY_NOT_ALLOWED');
      return bad(res, t.status === 'WITH_COLLECTOR' ? 'The partner must first confirm that he received this money from his team member' : 'This money is not with the partner right now', 409);
    }
    let mode: string | undefined; let ref: string | undefined;
    if (req.body?.mode !== undefined && req.body.mode !== '') {
      mode = String(req.body.mode);
      if (!TRAIL_MODE_IDS.includes(mode)) return bad(res, 'Pick how it was handed over — cash / cheque / UPI / NEFT …');
      ref = String(req.body?.ref ?? '').trim().slice(0, 40);
      if (mode !== 'CASH' && ref.length < 3) return bad(res, 'Give the cheque number / UTR of the hand-over (min 3 characters) — the builder\'s accounts need it to match');
    }
    const note = cleanNote(req.body?.note);
    t.status = 'HANDED_OVER';
    step(t, 'HANDED_OVER', a, { note, mode, ref: ref || undefined });
    b.updatedAt = nowIso();
    lead(b, `${inr(t.amount)} (${t.targetName}) handed over to the builder by ${u.name}${mode ? ` (${mode}${ref ? ` ${ref}` : ''})` : ''} — waiting for the builder's confirmation`);
    db.save();
    alert(moneyConfirmers(b.builderId), 'deals', `Money handed over · ${b.projectName}`, `${u.name} handed over ${inr(t.amount)} (${t.targetName}) for unit ${b.unitNo} — confirm when it arrives`, '/?tab=crm', { not: u.id, tag: `mt-${t.id}`, hi: [`पैसा सौंपा गया · ${b.projectName}`, `${u.name} ने यूनिट ${b.unitNo} के ${inr(t.amount)} (${t.targetName}) सौंपे — मिलने पर कन्फ़र्म करें`] });
    auditCrm('MONEY_TRAIL_HANDED_OVER', t.id, `${inr(t.amount)} on ${b.id} handed to the builder by ${u.name}${mode ? ` — ${mode}${ref ? ` ${ref}` : ''}` : ''}${note ? ` — ${note}` : ''}`, 'COMMISSION');
    res.json({ success: true, trail: rowOf(t, b, a) });
  });

  // ── 4. the builder's authorised person confirms it arrived (this is the only step that touches the ledger) ──
  r.post('/trails/:id/builder-confirm', needs('crm:money_confirm'), (req: Request, res: Response) => {
    const o = open(req, res); if (!o) return;
    const { b, t, a } = o; const u = me();
    if (typeof req.body?.received !== 'boolean') return bad(res, 'received must be true or false');
    const received: boolean = req.body.received;
    const can = trailActions(t, a);
    if (!can.builderConfirm) {
      if (a.id === t.collector.id) return bad(res, 'You cannot confirm money you collected yourself — someone else must', 403);
      if (a.side !== 'BUILDER_OWNER' && !(a.side === 'BUILDER_STAFF' && a.canConfirm)) return bad(res, 'Only the builder or the accounts person he has authorised can confirm that the money arrived', 403, 'MONEY_NOT_ALLOWED');
      return bad(res, 'This money is already settled', 409);
    }
    const note = cleanNote(req.body?.note);
    if (builderNeedsNote(t, received) && note.length < TRAIL_NOTE_MIN) {
      return bad(res, received ? 'This money has not been handed over yet — say why you are confirming it now (e.g. "customer paid our account directly")' : 'Say why — e.g. "cheque bounced" or "not in the bank yet"', 400, 'NOTE_REQUIRED');
    }
    const ts = nowIso();
    const hand = [...t.steps].reverse().find(s => s.stage === 'HANDED_OVER');
    // how the builder actually got it: the hand-over details when given, otherwise what the customer paid with
    const mode = hand?.mode || t.mode; const ref = hand?.mode ? hand.ref : t.ref;
    const rn = String(req.body?.receiptNo ?? '').trim();
    if (rn && (rn.length < 3 || rn.length > 40)) return bad(res, 'The receipt number must be 3–40 characters');
    if (received) {
      if (b.status !== 'APPROVED') return bad(res, 'Approve the booking first, then confirm that the money arrived', 409);
      if (t.target === 'TOKEN') {
        if (!b.token || b.token.status === 'RECEIVED') return bad(res, 'The booking amount is already confirmed', 409);
        b.token = { ...b.token, mode, ...(ref ? { ref } : {}), ...(t.paidOn ? { paidOn: t.paidOn } : {}) };
        const c = confirmToken(b, u, true, note || undefined, { trailId: t.id, ...(rn ? { receiptNo: rn } : {}) });
        if ('error' in c) return bad(res, c.error, c.status);
      } else {
        const m = b.paymentSchedule.find(x => x.id === t.target);
        if (!m) return bad(res, 'Instalment not found', 404);
        const pending = m.amount - paidOf(m);
        if (t.amount > pending) return bad(res, `Only ${inr(pending)} is pending on this instalment now — cancel this entry or ask for a corrected amount`, 409);
        const rref = (rn || (ref && ref.length >= 3 ? ref : 'CASH')).slice(0, 40);
        m.receipts = [...(m.receipts || []), { id: `RC-${Date.now().toString(36)}-${m.id.slice(-2)}`, amount: t.amount, mode: mode as any, ref: rref, at: ts, byId: u.id, byName: u.name, trailId: t.id }];
        m.paidAmount = paidOf(m) + t.amount;
        if (m.paidAmount >= m.amount) { m.paid = true; m.paidAt = ts; m.receiptNo = rref; }
        if (m.claim?.status === 'OPEN') m.claim.status = 'RESOLVED';
      }
      t.status = 'CONFIRMED'; if (rn) t.receiptNo = rn;
      step(t, 'BUILDER_CONFIRMED', a, { note });
    } else {
      if (t.target === 'TOKEN' && b.token && b.token.status !== 'RECEIVED') { const c = confirmToken(b, u, false, note || undefined); if ('error' in c) return bad(res, c.error, c.status); }
      t.status = 'NOT_RECEIVED';
      step(t, 'BUILDER_NOT_RECEIVED', a, { note });
    }
    b.updatedAt = ts;
    lead(b, `${inr(t.amount)} (${t.targetName}) ${received ? 'confirmed received by the builder side' : 'marked NOT received by the builder side'} (${u.name})${note ? ` — ${note}` : ''}`);
    db.save();
    alert([b.associateId, t.collector.id], 'deals', received ? `Builder confirmed the money ✔` : `Builder says money NOT received`, `${inr(t.amount)} (${t.targetName}) for unit ${b.unitNo}${note ? ` — ${note.slice(0, 80)}` : ''}`, '/?tab=crm', { not: u.id, tag: `mt-${t.id}`, hi: [received ? 'बिल्डर ने पैसा कन्फ़र्म किया ✔' : 'बिल्डर के अनुसार पैसा नहीं मिला', `यूनिट ${b.unitNo} के लिए ${inr(t.amount)} (${t.targetName})${note ? ` — ${note.slice(0, 80)}` : ''}`] });
    auditCrm(received ? 'MONEY_TRAIL_BUILDER_CONFIRMED' : 'MONEY_TRAIL_NOT_RECEIVED', t.id, `${inr(t.amount)} for ${t.targetName} on ${b.id}: ${u.name} (${SIDE_EN[a.side!]}) ${received ? 'confirmed it ARRIVED' : 'says it did NOT arrive'}${note ? ` — ${note}` : ''}`, 'COMMISSION');
    res.json({ success: true, trail: rowOf(t, b, a) });
  });

  // ── cancel an entry made by mistake, or one that cannot be settled ──
  r.post('/trails/:id/cancel', needs('crm:money_collect'), (req: Request, res: Response) => {
    const o = open(req, res); if (!o) return;
    const { b, t, a } = o; const u = me();
    if (!trailActions(t, a).cancel) return bad(res, isOpenTrail(t) ? 'You cannot cancel this entry at this stage' : 'This money is already settled', isOpenTrail(t) ? 403 : 409);
    const reason = cleanNote(req.body?.reason);
    if (reason.length < TRAIL_NOTE_MIN) return bad(res, 'Say why this entry is being cancelled');
    t.status = 'CANCELLED';
    step(t, 'CANCELLED', a, { note: reason });
    b.updatedAt = nowIso();
    lead(b, `${inr(t.amount)} (${t.targetName}) money entry cancelled by ${u.name} — ${reason}`);
    db.save();
    auditCrm('MONEY_TRAIL_CANCELLED', t.id, `${inr(t.amount)} on ${b.id} cancelled by ${u.name} (${SIDE_EN[a.side!]}): ${reason}`, 'COMMISSION');
    res.json({ success: true, trail: rowOf(t, b, a) });
  });

  return r;
}
