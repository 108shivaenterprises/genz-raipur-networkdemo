/**
 * v14 — the broker's deal timeline, registry / payment milestones (two-side confirmation) and private notes.  Mounted at /api/timeline.
 *
 * The timeline is built from what really happened in the app: deal opened, site visits (scheduled / verified), offers, counters,
 * token events, stage changes, milestones, sale. It survives the 90-day personal-data erasure (names are cut to first names).
 * GENZ cannot see a bank or the registrar's office, so a milestone one side marks DONE is shown as "confirmed" only after the
 * OTHER side confirms it.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, DealRoom, DealMilestone } from './db.js';
import { ctx, needs, hit } from './auth.js';
import { canViewDeal, canSeeDealCommercials, dealDetailVia, isAdmin } from './access.js';
import { OWNER_VISIBLE_KINDS, buyerShown } from '../src/shared/dealRules.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const bad = (res: Response, error: string, status = 400) => res.status(status).json({ error });
const profile = (id: string) => db.byId('users', id);

type Party = 'INTRO' | 'CLOSING' | 'OWNER' | 'OTHER';
/** Which side of the deal is this user on? Self-deal (one broker on both sides) → he is INTRO only; the owner confirms. */
export function partyOf(u: { id: string; role?: string }, d: Pick<DealRoom, 'introducingBrokerId' | 'closingBrokerId' | 'ownerId'>): Party {
  if (d.introducingBrokerId === u.id) return 'INTRO';
  if (d.closingBrokerId === u.id) return 'CLOSING';
  if (d.ownerId === u.id) return 'OWNER';
  return 'OTHER';
}

const milestoneSchema = z.object({
  kind: z.enum(['AGREEMENT', 'PAYMENT', 'REGISTRY', 'POSSESSION', 'COMMISSION', 'OTHER']),
  title: z.string().trim().min(3).max(120),
  plannedAt: z.string().max(40).optional(),
  amount: z.number().positive().max(100_000_000_000).optional(),
  ref: z.string().trim().max(40).optional(),
  note: z.string().trim().max(300).optional(),
});

export function createTimelineRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const self = () => profile(me().id)!;
  const loadDeal = (req: Request, res: Response) => {
    const u = self(); const d = db.byId('dealRooms', req.params.dealId);
    if (!d || !canViewDeal(u as any, d)) { bad(res, 'Deal not found', 404); return null; }
    // v21: a GENZ admin reads a deal's timeline only while a dispute is open on it (or when GENZ is a party to the deal)
    if (dealDetailVia(u as any, d, st()) === 'NONE') { res.status(403).json({ error: 'GENZ can open the inside of a deal room only while a dispute is open on it.', code: 'DEAL_SUMMARY_ONLY' }); return null; }
    return { u, d };
  };
  const seeCommercials = (u: UserProfile, d: DealRoom) => canSeeDealCommercials(u as any, d, st());

  r.get('/:dealId', needs('deal:read'), (req, res) => {
    const l = loadDeal(req, res); if (!l) return; const { u, d } = l;
    const s = st(); const p = s.properties.find(x => x.id === d.propertyId);
    const commercial = seeCommercials(u, d);
    const party = partyOf(u, d);
    const ev: Array<{ at: string; kind: string; title: string; detail?: string; by?: string; status?: string }> = [];
    ev.push({ at: d.createdAt, kind: 'DEAL', title: 'Deal room opened', detail: p ? `${p.title}` : undefined });

    const visits = s.siteVisits.filter(v => v.dealRoomId === d.id);
    for (const v of visits) {
      ev.push({ at: v.createdAt, kind: 'VISIT', title: `Site visit scheduled for ${new Date(v.scheduledTime).toLocaleString('en-IN')}`, detail: `Customer: ${commercial ? v.customerName : buyerShown(v.customerName, 'SUBMITTED')}`, by: profile(v.brokerId)?.name });
      if (v.isVerified && v.verifiedAt) ev.push({ at: v.verifiedAt, kind: 'VISIT_DONE', title: `Site visit verified on location (${v.verificationMethod})`, detail: v.feedbackNotes?.slice(0, 160), status: 'CONFIRMED' });
    }
    const offers = s.propertyOffers.filter(o => o.dealRoomId === d.id || (o.propertyId === d.propertyId && o.brokerId === d.introducingBrokerId && o.buyerName === d.customerId));
    for (const o of offers) for (const h of o.history) ev.push({ at: h.at, kind: 'OFFER', title: h.text, by: h.byName === 'GENZ' ? undefined : h.byName, detail: `Offer ${o.id}` });
    const visitIds = new Set(visits.map(v => v.id));
    for (const a of s.auditEvents) {
      if (a.entityType === 'DEAL' && a.entityId === d.id) ev.push({ at: a.timestamp, kind: 'AUDIT', title: a.details.slice(0, 200), by: profile(a.actorId)?.name });
      else if (a.entityType === 'COMMISSION' && commercial && a.details.includes(d.id)) ev.push({ at: a.timestamp, kind: 'COMMISSION', title: a.details.slice(0, 200), by: profile(a.actorId)?.name });
      else if (a.entityType === 'DISPUTE' && a.details.includes(d.id)) ev.push({ at: a.timestamp, kind: 'DISPUTE', title: a.details.slice(0, 200) });
    }
    const ms = s.dealMilestones.filter(m => m.dealRoomId === d.id && (commercial || OWNER_VISIBLE_KINDS.includes(m.kind)));
    for (const m of ms) {
      ev.push({ at: m.createdAt, kind: 'MILESTONE', title: `${m.kind.toLowerCase()} planned: ${m.title}`, by: m.createdByName, detail: m.plannedAt ? `Planned ${new Date(m.plannedAt).toLocaleDateString('en-IN')}` : undefined });
      if (m.status === 'DONE' && m.doneAt) ev.push({ at: m.doneAt, kind: 'MILESTONE_DONE', title: `${m.title} — done${m.amount ? ` (₹${m.amount.toLocaleString('en-IN')})` : ''}`, by: m.createdByName, detail: m.ref ? `Ref ${m.ref}` : undefined, status: m.confirmedAt ? 'CONFIRMED' : 'UNCONFIRMED' });
      if (m.confirmedAt) ev.push({ at: m.confirmedAt, kind: 'MILESTONE_CONFIRMED', title: `${m.title} — confirmed by the other side`, by: m.confirmedByName, status: 'CONFIRMED' });
    }
    if (p?.soldAt && offers.some(o => o.id === p.soldOfferId)) ev.push({ at: p.soldAt, kind: 'SOLD', title: `Property marked ${p.listingStatus} through this deal` });
    ev.sort((a, b) => a.at.localeCompare(b.at));
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify([d.id, ev])).digest('hex').slice(0, 16).toUpperCase();
    const intro = profile(d.introducingBrokerId); const clos = profile(d.closingBrokerId);
    res.json({
      success: true, fingerprint, generatedAt: nowIso(), party,
      deal: { id: d.id, stage: d.stage, settlementStatus: d.settlementStatus, propertyId: d.propertyId, propertyTitle: p?.title, locality: p?.locality, city: p?.city, customer: commercial ? d.customerId : buyerShown(d.customerId, 'SUBMITTED'), propertyPurged: !!p?.purgedAt,
        brokers: { introducing: intro?.name, closing: clos?.name }, ...(commercial ? { commissionExpected: d.totalCommissionExpected, introPct: d.introducingBrokerSharePct, closingPct: d.closingBrokerSharePct } : {}) },
      events: ev,
      milestones: ms.map(m => ({ ...m, canConfirm: m.status === 'DONE' && !m.confirmedAt && party !== 'OTHER' && partyOf({ id: m.createdById }, d) !== party && (m.kind !== 'COMMISSION' || party !== 'OWNER') })),
      notes: s.brokerNotes.filter(n => n.dealRoomId === d.id && n.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      canWrite: party !== 'OTHER',
    });
  });

  r.post('/:dealId/milestones', needs('deal:read'), (req, res) => {
    const l = loadDeal(req, res); if (!l) return; const { u, d } = l;
    const party = partyOf(u, d); if (party === 'OTHER') return bad(res, 'Only the deal\'s brokers and the owner can add milestones', 403);
    const parsed = milestoneSchema.safeParse(req.body); if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid milestone');
    const m = parsed.data;
    if (m.kind === 'COMMISSION' && party === 'OWNER') return bad(res, 'Commission milestones are between the brokers', 403);
    if (m.plannedAt && Number.isNaN(Date.parse(m.plannedAt))) return bad(res, 'Invalid planned date');
    if (hit(`ms:${u.id}`, 60, 3600_000)) return bad(res, 'Too many milestones — slow down', 429);
    const ts = nowIso();
    const x: DealMilestone = { id: `MS-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`, dealRoomId: d.id, kind: m.kind, title: m.title, plannedAt: m.plannedAt ? new Date(m.plannedAt).toISOString() : undefined, amount: m.amount, ref: m.ref, note: m.note, status: 'PLANNED', createdById: u.id, createdByName: u.name, createdAt: ts };
    st().dealMilestones.push(x); db.save();
    db.appendAuditEvent(u.id, u.role as any, 'DEAL', d.id, 'MILESTONE_ADDED', `${u.name} added ${m.kind} milestone "${m.title}"`);
    res.json({ success: true, milestone: x });
  });

  const loadMs = (req: Request, res: Response) => {
    const l = loadDeal(req, res); if (!l) return null;
    const m = st().dealMilestones.find(x => x.id === req.params.mid && x.dealRoomId === l.d.id);
    if (!m) { bad(res, 'Milestone not found', 404); return null; }
    if (m.kind === 'COMMISSION' && !seeCommercials(l.u, l.d)) { bad(res, 'Milestone not found', 404); return null; }
    return { ...l, m };
  };

  r.post('/:dealId/milestones/:mid/done', needs('deal:read'), (req, res) => {
    const l = loadMs(req, res); if (!l) return; const { u, d, m } = l;
    if (m.createdById !== u.id) return bad(res, 'Only the person who added the milestone marks it done — the other side then confirms', 403);
    if (m.status !== 'PLANNED') return bad(res, `Milestone is already ${m.status.toLowerCase()}`, 409);
    const at = req.body?.doneAt ? Date.parse(req.body.doneAt) : Date.now();
    if (Number.isNaN(at) || at > Date.now() + 86400_000) return bad(res, 'Done date cannot be in the future');
    if (req.body?.ref) m.ref = String(req.body.ref).trim().slice(0, 40);
    if (req.body?.amount !== undefined) { const a = Number(req.body.amount); if (!Number.isFinite(a) || a <= 0) return bad(res, 'Invalid amount'); m.amount = a; }
    m.status = 'DONE'; m.doneAt = new Date(at).toISOString(); db.save();
    db.appendAuditEvent(u.id, u.role as any, 'DEAL', d.id, 'MILESTONE_DONE', `${u.name} marked "${m.title}" done (awaiting the other side's confirmation)`);
    res.json({ success: true });
  });

  r.post('/:dealId/milestones/:mid/confirm', needs('deal:read'), (req, res) => {
    const l = loadMs(req, res); if (!l) return; const { u, d, m } = l;
    const party = partyOf(u, d); const creator = partyOf({ id: m.createdById }, d);
    if (party === 'OTHER') return bad(res, 'Not allowed', 403);
    if (m.status !== 'DONE') return bad(res, 'Only a milestone marked done can be confirmed', 409);
    if (m.confirmedAt) return bad(res, 'Already confirmed', 409);
    if (party === creator) return bad(res, 'The other side must confirm — you cannot confirm your own entry', 403);
    if (m.kind === 'COMMISSION' && party === 'OWNER') return bad(res, 'Commission is between the brokers', 403);
    m.confirmedById = u.id; m.confirmedByName = u.name; m.confirmedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role as any, 'DEAL', d.id, 'MILESTONE_CONFIRMED', `${u.name} confirmed "${m.title}"`);
    res.json({ success: true });
  });

  r.post('/:dealId/milestones/:mid/cancel', needs('deal:read'), (req, res) => {
    const l = loadMs(req, res); if (!l) return; const { u, d, m } = l;
    if (m.createdById !== u.id) return bad(res, 'Only the creator can cancel', 403);
    if (m.confirmedAt) return bad(res, 'A confirmed milestone cannot be cancelled', 409);
    m.status = 'CANCELLED'; db.save();
    db.appendAuditEvent(u.id, u.role as any, 'DEAL', d.id, 'MILESTONE_CANCELLED', `${u.name} cancelled "${m.title}"`);
    res.json({ success: true });
  });

  // ── private notes ──
  r.post('/:dealId/notes', needs('deal:read'), (req, res) => {
    const l = loadDeal(req, res); if (!l) return; const { u, d } = l;
    if (partyOf(u, d) === 'OTHER' && !isAdmin(u as any) && u.role !== 'TEAM_MEMBER') return bad(res, 'Not allowed', 403);
    const text = String(req.body?.text || '').trim(); const remind = req.body?.remindAt;
    if (text.length < 2 || text.length > 500) return bad(res, 'Note must be 2–500 characters');
    if (remind && Number.isNaN(Date.parse(remind))) return bad(res, 'Invalid reminder date');
    if (st().brokerNotes.filter(n => n.userId === u.id && n.dealRoomId === d.id).length >= 200) return bad(res, 'Too many notes on this deal', 429);
    const n = { id: `BN-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`, dealRoomId: d.id, userId: u.id, text, remindAt: remind ? new Date(remind).toISOString() : undefined, createdAt: nowIso() };
    st().brokerNotes.push(n); db.save(); res.json({ success: true, note: n });
  });
  r.delete('/:dealId/notes/:nid', needs('deal:read'), (req, res) => {
    const u = self(); const i = st().brokerNotes.findIndex(n => n.id === req.params.nid && n.userId === u.id && n.dealRoomId === req.params.dealId);
    if (i < 0) return bad(res, 'Note not found', 404);
    st().brokerNotes.splice(i, 1); db.save(); res.json({ success: true });
  });
  return r;
}
