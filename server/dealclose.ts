/**
 * v47 — /api/deals/:id/close …   and   /api/deals/:id/offline-visit …   (see src/shared/dealClose.ts for the rules)
 *
 *   POST /:id/close               {reason, note}   a deal broker asks to close (a one-broker deal closes at once)
 *   POST /:id/close/answer        {agree, note}    the OTHER broker agrees (closes) or says no (request dropped)
 *   POST /:id/close/withdraw                       the asker takes it back
 *   POST /:id/reopen              {note}           either broker reopens a closed room
 *   POST /:id/offline-visit       {visitedOn, note} one side records a visit that happened outside the app
 *   POST /:id/offline-visit/confirm | /decline     the other side (other broker; in a one-broker deal, the owner) answers
 *   POST /:id/offline-visit/withdraw               the one who recorded it takes it back
 * Nothing here touches buyer protection, the owner's mandate or a dispute.
 */
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { DealRoom, UserProfile } from './db.js';
import { ctx, needs } from './auth.js';
import { isDealBroker, openDisputeOf } from './access.js';
import { pushTo } from './webpush.js';
import { CLOSE_AUTO_DAYS, CLOSE_REASONS, isClosed, reasonText, type CloseReason } from '../src/shared/dealClose.js';

const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** tests may shorten the 7 days (never set in production) */
const autoMs = () => (process.env.NODE_ENV !== 'production' && Number(process.env.DEAL_CLOSE_AUTO_MS)) || CLOSE_AUTO_DAYS * 86400_000;
const STAGES = ['Lead', 'Introduction', 'Site Visit Done', 'Negotiation', 'Agreement', 'Handover', 'Settled'];
const oneBroker = (d: DealRoom) => d.introducingBrokerId === d.closingBrokerId;
const otherBroker = (d: DealRoom, uid: string) => (d.introducingBrokerId === uid ? d.closingBrokerId : d.introducingBrokerId);
const note = (d: DealRoom, text: string) => { d.notes = `${d.notes || ''}\n[${new Date().toLocaleDateString('en-IN')}] ${text}`.trim(); d.updatedAt = nowIso(); };
const ping = (uid: string, d: DealRoom, title: string, body: string) => { if (uid) void pushTo(uid, { kind: 'deals', title, body, url: `/?tab=deals&deal=${d.id}` }); };
const audit = (d: DealRoom, action: string, text: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'DEAL', d.id, action, text); };

/** a request nobody answered for CLOSE_AUTO_DAYS closes by itself (called by the hourly sweep and before deal lists are read) */
export function sweepDealClosures(now = Date.now()) {
  let changed = 0;
  for (const d of db.getState().dealRooms) {
    const c = d.closure;
    if (c?.status === 'ASKED' && Date.parse(c.autoAt) <= now) {
      d.closure = { ...c, status: 'CLOSED', closedAt: new Date(now).toISOString(), how: 'NO_REPLY' };
      note(d, `Deal room closed — no reply to the close request in ${CLOSE_AUTO_DAYS} days (${reasonText(c.reason)})`);
      db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'DEAL', d.id, 'DEAL_ROOM_CLOSED', `Closed after ${CLOSE_AUTO_DAYS} days without a reply to ${c.byName}'s request`);
      ping(otherBroker(d, c.byId), d, 'Deal room closed', `${d.id} closed — no reply to the request in ${CLOSE_AUTO_DAYS} days. You can reopen it.`);
      changed++;
    }
  }
  if (changed) db.save();
  return changed;
}

export function createDealCloseRouter() {
  const r = Router();
  const load = (req: Request, res: Response, opts: { owner?: boolean } = {}) => {
    const u = me(); const d = db.byId('dealRooms', req.params.id) as DealRoom | undefined;
    if (!d) { bad(res, 'Deal room not found', 404); return null; }
    const broker = isDealBroker(u, d); const owner = !!opts.owner && d.ownerId === u.id;
    if (!broker && !owner) { bad(res, 'Only the deal-room brokers can do this', 403); return null; }
    if (openDisputeOf(db.getState(), d.id) || d.settlementStatus === 'DISPUTED' || d.stage === 'Disputed') { bad(res, 'A dispute is open on this deal room — the GENZ desk decides there', 409); return null; }
    return { u, d, broker };
  };

  // ── close ──
  r.post('/:id/close', needs('deal:update_stage'), (req: Request, res: Response) => {
    const c = load(req, res); if (!c) return; const { u, d } = c;
    if (d.stage === 'Settled') return bad(res, 'A settled deal is already finished', 409);
    if (isClosed(d)) return bad(res, 'This deal room is already closed', 409);
    const reason = String(req.body?.reason || '') as CloseReason;
    if (!CLOSE_REASONS.some(x => x.id === reason)) return bad(res, 'Choose why the deal did not happen');
    const text = str(req.body?.note, 300);
    if (reason === 'OTHER' && text.length < 3) return bad(res, 'Write a short reason');
    const now = nowIso();
    if (d.closure?.status === 'ASKED' && d.closure.byId !== u.id) { // the other broker had asked already → this is a yes
      d.closure = { ...d.closure, status: 'CLOSED', closedAt: now, how: 'AGREED', agreedById: u.id };
      note(d, `Deal room closed — both brokers agreed (${reasonText(d.closure.reason)})`);
      audit(d, 'DEAL_ROOM_CLOSED', 'Deal room closed — both brokers agreed'); db.save();
      ping(d.closure.byId, d, 'Deal room closed', `${u.name} agreed — ${d.id} is closed.`);
      return res.json({ success: true, closure: d.closure });
    }
    if (d.closure?.status === 'ASKED') return bad(res, 'You have already asked to close this deal room', 409);
    const single = oneBroker(d);
    d.closure = {
      status: single ? 'CLOSED' : 'ASKED', reason, note: text || undefined, byId: u.id, byName: u.name, askedAt: now,
      autoAt: new Date(Date.now() + autoMs()).toISOString(), ...(single ? { closedAt: now, how: 'ONE_BROKER' as const } : {}),
    };
    note(d, single ? `Deal room closed by ${u.name} (${reasonText(reason)})` : `${u.name} asked to close the deal room (${reasonText(reason)}) — closes in ${CLOSE_AUTO_DAYS} days unless the other broker says no`);
    audit(d, single ? 'DEAL_ROOM_CLOSED' : 'DEAL_ROOM_CLOSE_ASKED', `${single ? 'Closed' : 'Close asked'}: ${reasonText(reason)}`);
    db.save();
    if (!single) ping(otherBroker(d, u.id), d, 'Close this deal room?', `${u.name}: ${reasonText(reason)}${text ? ` — ${text}` : ''}. Answer within ${CLOSE_AUTO_DAYS} days.`);
    res.json({ success: true, closure: d.closure });
  });

  r.post('/:id/close/answer', needs('deal:update_stage'), (req: Request, res: Response) => {
    const c = load(req, res); if (!c) return; const { u, d } = c;
    const cl = d.closure;
    if (!cl || cl.status !== 'ASKED') return bad(res, 'No close request is waiting', 409);
    if (cl.byId === u.id) return bad(res, 'The other broker answers your request', 409);
    const text = str(req.body?.note, 300);
    if (req.body?.agree === true) {
      d.closure = { ...cl, status: 'CLOSED', closedAt: nowIso(), how: 'AGREED', agreedById: u.id };
      note(d, `Deal room closed — ${u.name} agreed with ${cl.byName} (${reasonText(cl.reason)})`);
      audit(d, 'DEAL_ROOM_CLOSED', 'Deal room closed — both brokers agreed');
      ping(cl.byId, d, 'Deal room closed', `${u.name} agreed — ${d.id} is closed.`);
    } else {
      if (text.length < 3) return bad(res, 'Tell the other broker why the deal is still on');
      d.closure = undefined;
      note(d, `${u.name} said the deal is still on — close request dropped: ${text}`);
      audit(d, 'DEAL_ROOM_CLOSE_REFUSED', 'Close request refused by the other broker');
      ping(cl.byId, d, 'Deal is still on', `${u.name}: ${text}`);
    }
    db.save();
    res.json({ success: true, closure: d.closure || null });
  });

  r.post('/:id/close/withdraw', needs('deal:update_stage'), (req: Request, res: Response) => {
    const c = load(req, res); if (!c) return; const { u, d } = c;
    if (d.closure?.status !== 'ASKED' || d.closure.byId !== u.id) return bad(res, 'You have no close request waiting', 409);
    d.closure = undefined; note(d, `${u.name} took back the close request`); db.save();
    res.json({ success: true, closure: null });
  });

  r.post('/:id/reopen', needs('deal:update_stage'), (req: Request, res: Response) => {
    const c = load(req, res); if (!c) return; const { u, d } = c;
    if (!isClosed(d)) return bad(res, 'This deal room is not closed', 409);
    const text = str(req.body?.note, 300);
    if (text.length < 3) return bad(res, 'Write why you are reopening it (the other broker sees this)');
    d.closure = undefined;
    note(d, `Deal room reopened by ${u.name}: ${text}`);
    audit(d, 'DEAL_ROOM_REOPENED', `Reopened: ${text}`); db.save();
    if (!oneBroker(d)) ping(otherBroker(d, u.id), d, 'Deal room reopened', `${u.name}: ${text}`);
    res.json({ success: true, closure: null });
  });

  // ── a visit that happened outside the app ──
  const confirmerOf = (d: DealRoom, byId: string) => (oneBroker(d) ? d.ownerId : otherBroker(d, byId));
  r.post('/:id/offline-visit', needs('deal:update_stage'), (req: Request, res: Response) => {
    const c = load(req, res); if (!c) return; const { u, d } = c;
    if (isClosed(d)) return bad(res, 'This deal room is closed — reopen it first', 409);
    const s = db.getState();
    if (STAGES.indexOf(d.stage) >= 2) return bad(res, 'This deal is already past “Site Visit Done”', 409);
    if (s.siteVisits.some(v => v.dealRoomId === d.id && v.isVerified)) return bad(res, 'A verified visit is already on this deal', 409);
    if (d.offlineVisit && !d.offlineVisit.confirmedAt) return bad(res, 'A visit outside the app is already waiting for confirmation', 409);
    if (oneBroker(d) && !(d.ownerId && s.users.some(x => x.id === d.ownerId))) return bad(res, 'You are on both sides of this deal and the owner is not on GENZ — verify the visit with the buyer’s OTP / QR instead', 409);
    const day = str(req.body?.visitedOn, 10); const ms = Date.parse(`${day}T00:00:00+05:30`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(ms) || ms > Date.now() + 86400_000 || ms < Date.now() - 365 * 86400_000) return bad(res, 'Write the visit date (within the last year, not in the future)');
    const text = str(req.body?.note, 300);
    if (text.length < 5) return bad(res, 'Write who visited and what happened (the other side reads this)');
    d.offlineVisit = { byId: u.id, byName: u.name, at: nowIso(), visitedOn: day, note: text };
    note(d, `${u.name} recorded a site visit outside the app on ${day} — waiting for the other side to confirm`);
    audit(d, 'OFFLINE_VISIT_RECORDED', `Visit outside the app recorded (${day}) — not verified`); db.save();
    ping(confirmerOf(d, u.id), d, 'Confirm a site visit', `${u.name} says the buyer saw the property on ${day}. Confirm it in the deal room.`);
    res.json({ success: true, offlineVisit: d.offlineVisit });
  });
  for (const what of ['confirm', 'decline', 'withdraw'] as const) {
    r.post(`/:id/offline-visit/${what}`, needs('deal:read'), (req: Request, res: Response) => {
      const c = load(req, res, { owner: true }); if (!c) return; const { u, d } = c;
      const ov = d.offlineVisit;
      if (!ov || ov.confirmedAt) return bad(res, 'No visit is waiting for confirmation', 409);
      if (what === 'withdraw') {
        if (ov.byId !== u.id) return bad(res, 'Only the one who recorded it can take it back', 403);
        d.offlineVisit = undefined; note(d, `${u.name} took back the visit outside the app`);
      } else {
        if (ov.byId === u.id) return bad(res, 'The other side must confirm the visit you recorded (maker ≠ checker)', 403);
        if (u.id !== confirmerOf(d, ov.byId)) return bad(res, 'Only the other broker (or, in a one-broker deal, the owner) confirms this', 403);
        if (what === 'confirm') {
          d.offlineVisit = { ...ov, confirmedById: u.id, confirmedByName: u.name, confirmedAt: nowIso() };
          note(d, `${u.name} confirmed the visit outside the app (${ov.visitedOn}) — NOT verified by OTP / QR`);
          audit(d, 'OFFLINE_VISIT_CONFIRMED', `Visit outside the app confirmed by the other side (${ov.visitedOn}) — unverified, no buyer protection`);
          ping(ov.byId, d, 'Visit confirmed', `${u.name} confirmed the visit of ${ov.visitedOn}. You can move the deal to “Site Visit Done”.`);
        } else {
          const why = str(req.body?.note, 300); if (why.length < 3) return bad(res, 'Write why (the other side reads this)');
          d.offlineVisit = undefined; note(d, `${u.name} did not confirm the visit outside the app: ${why}`);
          ping(ov.byId, d, 'Visit not confirmed', `${u.name}: ${why}`);
        }
      }
      db.save();
      res.json({ success: true, offlineVisit: d.offlineVisit || null });
    });
  }
  return r;
}
