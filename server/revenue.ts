/**
 * v20 — Revenue & Growth (superadmin):
 *   1. Master-CP book: GENZ's agreements with builders + one line per unit sold under them (auto from approved CRM
 *      bookings of those projects, or typed in). Expected → invoiced → received from the builder; due → paid to the
 *      broker. Money moves bank-to-bank outside the app; this only records it (and warns about paying a partner twice).
 *   2. Growth & value: monthly active brokers, cohorts, k-factor, cities, GMV, take rate — with a CSV for a data room.
 *   3. Network strength: aggregate numbers to show a builder (why sign a master-CP with GENZ), shareable as an
 *      expiring, revocable read-only link. Never a name, phone, PAN or customer detail.
 * A broker sees only his own master-CP earnings (GET /api/revenue/mine).
 */
import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, type DatabaseState, type UserProfile } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import {
  type MasterCpAgreement, type MasterCpEntry, type BuilderSide, entryMoney, brokerStatusAfter, isOverdue, totals, entriesCsv, clampPct,
} from '../src/shared/revenueRules.js';
import { valueReport, valueCsv, monthOf, lastMonths } from '../src/shared/valueRules.js';
import { pilotFunnel } from '../src/shared/pilotRules.js';
import { sameCity } from '../src/shared/india.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ error: msg });
const audit = (entity: 'COMMISSION' | 'SYSTEM', id: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, entity, id, action, details); };
const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const nextId = (prefix: string, ids: string[], pad: number) => `${prefix}${String(ids.reduce((m, id) => Math.max(m, Number(id.slice(prefix.length)) || 0), 0) + 1).padStart(pad, '0')}`;
const agreementsMap = () => new Map(st().masterCpAgreements.map(a => [a.id, a]));

// ───────────────────────────── book: sync from the CRM ─────────────────────────────
/** Approved partner bookings of projects under a LOI / signed agreement become book lines (once). Cancelled ones follow. */
export function syncMasterCp(now = Date.now()): { added: number; cancelled: number } {
  const s = st(); let added = 0; let cancelled = 0;
  const live = s.masterCpAgreements.filter(a => (a.status === 'SIGNED' || a.status === 'LOI') && a.projectIds.length);
  if (!live.length && !s.masterCpEntries.length) return { added, cancelled };
  const byBooking = new Map(s.masterCpEntries.filter(e => e.bookingId).map(e => [e.bookingId!, e]));
  const agOf = new Map<string, MasterCpAgreement>(); for (const a of live) for (const p of a.projectIds) agOf.set(p, a);
  for (const b of s.crmBookings) {
    const existing = byBooking.get(b.id);
    if (existing) {
      if (b.status === 'CANCELLED' && !existing.cancelled) {
        if (existing.builder.status === 'RECEIVED') {
          if (existing.broker.status !== 'PAID') { existing.broker.status = 'ON_HOLD'; existing.broker.holdReason = 'Booking cancelled after the builder paid — settle the refund first'; }
          existing.history.push({ at: nowIso(), by: 'SYSTEM', what: 'Booking cancelled in the CRM after payment — check the refund with the builder' });
        } else {
          existing.cancelled = { at: nowIso(), by: 'SYSTEM', reason: 'Booking cancelled in the CRM' };
          existing.history.push({ at: nowIso(), by: 'SYSTEM', what: 'Cancelled: booking cancelled in the CRM' });
          cancelled++;
        }
        existing.updatedAt = nowIso();
      }
      continue;
    }
    if (b.status !== 'APPROVED' || b.direct || !b.associateId) continue;
    const a = agOf.get(b.projectId); if (!a) continue;
    const at = b.decidedAt || b.createdAt;
    if (a.validFrom && at < a.validFrom) continue;
    if (a.validTo && at.slice(0, 10) > a.validTo.slice(0, 10)) continue;
    const broker = db.byId('users', b.associateId);
    const e: MasterCpEntry = {
      id: nextId('MCE-', s.masterCpEntries.map(x => x.id), 6), agreementId: a.id, source: 'CRM', bookingId: b.id, projectId: b.projectId, projectName: b.projectName, unitNo: b.unitNo || '',
      brokerId: b.associateId, brokerName: broker?.name || 'Partner', bookedAt: at, agreementValue: b.agreementValue,
      genzRatePct: a.genzRatePct, brokerSharePct: a.brokerSharePct,
      builder: { status: 'EXPECTED' }, broker: { status: brokerStatusAfter('EXPECTED', 'NOT_DUE', a.payWhenPaid) },
      doublePayRisk: (b.brokeragePct || 0) > 0 || (b.brokerageAmount || 0) > 0,
      createdAt: nowIso(), updatedAt: nowIso(), history: [{ at: nowIso(), by: 'SYSTEM', what: `Added from approved booking ${b.id}` }],
    };
    s.masterCpEntries.push(e); byBooking.set(b.id, e); added++;
  }
  if (added || cancelled) db.save();
  void now;
  return { added, cancelled };
}

// ───────────────────────────── growth & value ─────────────────────────────
export function buildValueReport(now = Date.now()) {
  const s = st(); const ag = agreementsMap();
  return valueReport({
    now,
    users: s.users.map(u => ({ id: u.id, role: u.role, createdAt: u.createdAt, verificationStatus: u.verificationStatus, city: u.city, invitedById: u.invitedById, sponsorId: u.sponsorId })),
    days: (s.activityDays || []).map(d => ({ day: d.day, seen: d.seen, acted: d.acted })),
    invitations: s.invitations.map(i => ({ issuedBy: i.issuedBy, status: i.status, redeemedAt: i.redeemedAt, redeemedBy: i.redeemedBy })),
    bookings: s.crmBookings.map(b => ({ status: b.status, decidedAt: b.decidedAt, createdAt: b.createdAt, agreementValue: b.agreementValue, direct: b.direct, projectId: b.projectId })),
    offers: s.offers.map(o => ({ createdAt: o.createdAt, proposingBrokerId: o.proposingBrokerId, receivingBrokerId: o.receivingBrokerId })),
    deals: s.dealRooms.map(d => ({ createdAt: d.createdAt, introducingBrokerId: d.introducingBrokerId, closingBrokerId: d.closingBrokerId })),
    revenue: s.masterCpEntries.map(e => { const m = entryMoney(e, ag.get(e.agreementId)); return { bookedAt: e.bookedAt, gross: m.gross, net: m.net, received: e.builder.status === 'RECEIVED' ? (e.builder.receivedAmount ?? m.expectedFromBuilder) : 0, agreementValue: e.agreementValue, cancelled: !!e.cancelled }; }),
  });
}

// ───────────────────────────── network strength (aggregates only) ─────────────────────────────
export function networkStrength(city = '', now = Date.now()) {
  const s = st();
  const inCity = (c?: string) => !city || sameCity(c, city);
  const brokers = s.users.filter(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED' && inCity(u.city));
  const ids = new Set(brokers.map(u => u.id));
  const tier1 = brokers.filter(u => u.reraNumber && u.tier !== 'TIER2').length;
  const team = s.users.filter(u => u.role === 'TEAM_MEMBER' && u.verificationStatus === 'VERIFIED' && u.employerId && ids.has(u.employerId)).length;
  const since30 = now - 30 * 86_400_000; const active = new Set<string>();
  for (const d of s.activityDays || []) if (Date.parse(d.day) >= since30) for (const id of d.seen) if (ids.has(id)) active.add(id);
  const liveListings = s.properties.filter(p => p.verificationStatus === 'VERIFIED' && (p.listingStatus === 'active' || p.listingStatus === 'under_negotiation') && !p.expiredAt && !p.heldAt && inCity(p.city));
  const locCount = new Map<string, number>(); for (const p of liveListings) { const l = (p.locality || '').trim(); if (l) locCount.set(l, (locCount.get(l) || 0) + 1); }
  const needs = s.requirements.filter(r => (r.status === 'active' || r.status === 'matching') && (!city || !r.city || sameCity(r.city, city)));
  const needsByType = new Map<string, number>(); for (const r of needs) needsByType.set(r.propertyType, (needsByType.get(r.propertyType) || 0) + 1);
  const since90 = now - 90 * 86_400_000; const since365 = now - 365 * 86_400_000;
  const propCity = (id?: string) => db.byId('properties', id)?.city;
  const visits = s.siteVisits.filter(v => v.isVerified && Date.parse(v.verifiedAt || v.createdAt) >= since90 && (!city || inCity(propCity(v.propertyId)))).length;
  const projCity = new Map(s.builderProjects.map(p => [p.id, p.city]));
  const bookings = s.crmBookings.filter(b => b.status === 'APPROVED' && !b.direct && Date.parse(b.decidedAt || b.createdAt) >= since365 && (!city || inCity(projCity.get(b.projectId))));
  const leads = s.crmLeads.filter(l => Date.parse(l.createdAt) >= since90 && (!city || inCity(projCity.get(l.projectId))));
  const firstCall = leads.map(l => { const c = [...l.activities].reverse().find(a => a.type === 'CALL'); return c ? (Date.parse(c.at) - Date.parse(l.createdAt)) / 3_600_000 : null; }).filter((x): x is number => x !== null && x >= 0).sort((a, b) => a - b);
  const builders = new Set(s.builderProjects.filter(p => inCity(p.city)).map(p => p.builderId)).size;
  const months = lastMonths(6, now);
  const joined = months.map(m => ({ month: m, brokers: brokers.filter(u => monthOf(u.createdAt) === m).length }));
  return {
    city: city || 'All India',
    generatedAt: new Date(now).toISOString(),
    brokers: { verified: brokers.length, rera: tier1, local: brokers.length - tier1, salesStaff: team, active30d: active.size, joinedByMonth: joined },
    inventory: { liveListings: liveListings.length, localities: locCount.size, topLocalities: [...locCount].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ name, n })), buyerNeeds: needs.length, needsByType: [...needsByType].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([type, n]) => ({ type, n })) },
    work: { verifiedSiteVisits90d: visits, leads90d: leads.length, medianFirstCallHours: firstCall.length ? Math.round(firstCall[Math.floor(firstCall.length / 2)] * 10) / 10 : null },
    sales: { bookings12m: bookings.length, value12m: bookings.reduce((a, b) => a + (b.agreementValue || 0), 0), buildersWorkingWithGenz: builders },
  };
}

// ───────────────────────────── router ─────────────────────────────
const agreementBody = z.object({
  builderId: z.string().max(60).optional().nullable(),
  builderName: z.string().trim().min(2).max(120).optional(),
  projectIds: z.array(z.string().max(60)).max(50).optional(),
  projectNames: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  genzRatePct: z.number().min(0).max(20).optional(),
  brokerSharePct: z.number().min(0).max(20).optional(),
  tdsOnGenzPct: z.number().min(0).max(20).optional(),
  tdsOnBrokerPct: z.number().min(0).max(20).optional(),
  paymentDays: z.number().int().min(0).max(365).optional(),
  payWhenPaid: z.boolean().optional(),
  status: z.enum(['DRAFT', 'LOI', 'SIGNED', 'ENDED']).optional(),
  validFrom: z.string().max(30).optional().nullable(),
  validTo: z.string().max(30).optional().nullable(),
  note: z.string().max(500).optional(),
});
const entryBody = z.object({
  agreementId: z.string().max(40),
  projectName: z.string().trim().min(1).max(120),
  unitNo: z.string().trim().max(40).optional().default(''),
  brokerId: z.string().max(60).optional().nullable(),
  brokerName: z.string().trim().max(120).optional(),
  bookedAt: z.string().max(30),
  agreementValue: z.number().positive().max(1e11),
  genzRatePct: z.number().min(0).max(20).optional(),
  brokerSharePct: z.number().min(0).max(20).optional(),
});
const actionBody = z.object({
  action: z.enum(['EDIT', 'INVOICE', 'RECEIVE', 'WRITE_OFF', 'PAY', 'HOLD', 'RELEASE', 'CANCEL', 'REOPEN']),
  agreementValue: z.number().positive().max(1e11).optional(),
  genzRatePct: z.number().min(0).max(20).optional(),
  brokerSharePct: z.number().min(0).max(20).optional(),
  unitNo: z.string().max(40).optional(),
  invoiceNo: z.string().trim().max(60).optional(),
  amount: z.number().min(0).max(1e11).optional(),
  ref: z.string().trim().max(80).optional(),
  date: z.string().max(30).optional(),
  reason: z.string().trim().max(300).optional(),
});

function shapeAgreement(a: MasterCpAgreement, entries: MasterCpEntry[]) {
  const mine = entries.filter(e => e.agreementId === a.id);
  return { ...a, totals: totals(mine, new Map([[a.id, a]])) };
}
function shapeEntry(e: MasterCpEntry, a?: MasterCpAgreement, now = Date.now()) {
  return { ...e, money: entryMoney(e, a), overdue: isOverdue(e, a, now), builderName: a?.builderName || '' };
}

export function createRevenueRouter() {
  const r = Router();
  const admin = needs('admin:control_center');

  r.get('/summary', admin, (_req, res) => {
    syncMasterCp();
    const s = st(); const ag = agreementsMap(); const now = Date.now();
    const months = lastMonths(12, now);
    const monthly = months.map(m => {
      const es = s.masterCpEntries.filter(e => !e.cancelled && monthOf(e.bookedAt) === m);
      const t = totals(es, ag, now);
      return { month: m, units: t.entries, value: t.agreementValue, gross: t.gross, net: t.net, received: t.received };
    });
    const overdue = s.masterCpEntries.filter(e => isOverdue(e, ag.get(e.agreementId), now)).sort((a, b) => a.bookedAt.localeCompare(b.bookedAt)).slice(0, 25).map(e => shapeEntry(e, ag.get(e.agreementId), now));
    res.json({ success: true, totals: totals(s.masterCpEntries, ag, now), agreements: s.masterCpAgreements.map(a => shapeAgreement(a, s.masterCpEntries)), monthly, overdue });
  });

  r.get('/projects', admin, (_req, res) => {
    res.json({ success: true, projects: st().builderProjects.map(p => ({ id: p.id, name: p.projectName, builderId: p.builderId, builderName: p.builderName, city: p.city, cpPct: p.channelPartnerCommissionPct })) });
  });

  r.post('/agreements', admin, (req: Request, res: Response) => {
    const p = agreementBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid agreement');
    const d = p.data; const s = st();
    const builder = d.builderId ? db.byId('users', d.builderId) : undefined;
    const builderName = d.builderName || builder?.companyName || builder?.name;
    if (!builderName) return bad(res, 'Builder name is required');
    const projectIds = (d.projectIds || []).filter(id => !!db.byId('builderProjects', id));
    if (!projectIds.length && !(d.projectNames || []).length) return bad(res, 'Add at least one project');
    if (d.brokerSharePct !== undefined && d.genzRatePct !== undefined && d.brokerSharePct > d.genzRatePct) return bad(res, 'The broker share cannot be more than what the builder pays GENZ');
    const taken = projectIds.find(id => s.masterCpAgreements.some(a => a.status !== 'ENDED' && a.projectIds.includes(id)));
    if (taken) return bad(res, `Project ${db.byId('builderProjects', taken)?.projectName || taken} already has a live agreement`, 409);
    const a: MasterCpAgreement = {
      id: nextId('MCP-', s.masterCpAgreements.map(x => x.id), 4), builderId: builder?.id, builderName,
      projectIds, projectNames: d.projectNames || [],
      genzRatePct: clampPct(d.genzRatePct ?? 3), brokerSharePct: clampPct(d.brokerSharePct ?? 2), tdsOnGenzPct: clampPct(d.tdsOnGenzPct ?? 2), tdsOnBrokerPct: clampPct(d.tdsOnBrokerPct ?? 2),
      paymentDays: d.paymentDays ?? 45, payWhenPaid: d.payWhenPaid ?? true, status: d.status || 'DRAFT',
      validFrom: d.validFrom || undefined, validTo: d.validTo || undefined, note: d.note,
      createdAt: nowIso(), createdBy: me().name, updatedAt: nowIso(), history: [{ at: nowIso(), by: me().name, what: 'Created' }],
    };
    if (a.brokerSharePct > a.genzRatePct) return bad(res, 'The broker share cannot be more than what the builder pays GENZ');
    s.masterCpAgreements.push(a); db.save();
    audit('COMMISSION', a.id, 'MASTER_CP_AGREEMENT_CREATED', `${a.builderName}: GENZ ${a.genzRatePct}% · broker ${a.brokerSharePct}% · ${a.status}`);
    const sync = syncMasterCp();
    res.json({ success: true, agreement: shapeAgreement(a, st().masterCpEntries), synced: sync });
  });

  r.put('/agreements/:id', admin, (req: Request, res: Response) => {
    const a = st().masterCpAgreements.find(x => x.id === req.params.id); if (!a) return bad(res, 'Agreement not found', 404);
    const p = agreementBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid agreement');
    const d = p.data; const changed: string[] = [];
    const set = <K extends keyof MasterCpAgreement>(k: K, v: MasterCpAgreement[K] | undefined) => { if (v !== undefined && JSON.stringify(a[k]) !== JSON.stringify(v)) { changed.push(`${String(k)}: ${JSON.stringify(a[k])} → ${JSON.stringify(v)}`); a[k] = v as any; } };
    if (d.projectIds) {
      const ids = d.projectIds.filter(id => !!db.byId('builderProjects', id));
      const taken = ids.find(id => st().masterCpAgreements.some(x => x.id !== a.id && x.status !== 'ENDED' && x.projectIds.includes(id)));
      if (taken) return bad(res, `Project ${db.byId('builderProjects', taken)?.projectName || taken} already has a live agreement`, 409);
      set('projectIds', ids);
    }
    set('projectNames', d.projectNames); set('builderName', d.builderName);
    if (d.genzRatePct !== undefined) set('genzRatePct', clampPct(d.genzRatePct));
    if (d.brokerSharePct !== undefined) set('brokerSharePct', clampPct(d.brokerSharePct));
    if (a.brokerSharePct > a.genzRatePct) return bad(res, 'The broker share cannot be more than what the builder pays GENZ');
    if (d.tdsOnGenzPct !== undefined) set('tdsOnGenzPct', clampPct(d.tdsOnGenzPct));
    if (d.tdsOnBrokerPct !== undefined) set('tdsOnBrokerPct', clampPct(d.tdsOnBrokerPct));
    set('paymentDays', d.paymentDays); set('payWhenPaid', d.payWhenPaid); set('status', d.status);
    if (d.validFrom !== undefined) set('validFrom', d.validFrom || undefined);
    if (d.validTo !== undefined) set('validTo', d.validTo || undefined);
    set('note', d.note);
    if (!changed.length) return res.json({ success: true, agreement: shapeAgreement(a, st().masterCpEntries) });
    a.updatedAt = nowIso(); a.history.push({ at: nowIso(), by: me().name, what: changed.join('; ').slice(0, 400) }); if (a.history.length > 60) a.history.splice(0, a.history.length - 60);
    db.save();
    audit('COMMISSION', a.id, 'MASTER_CP_AGREEMENT_UPDATED', changed.join('; ').slice(0, 500));
    syncMasterCp();
    res.json({ success: true, agreement: shapeAgreement(a, st().masterCpEntries), note: 'New rates apply to new lines; existing lines keep the rate they were booked with (edit a line to change it).' });
  });

  r.get('/entries', admin, (req, res) => {
    syncMasterCp();
    const ag = agreementsMap(); const now = Date.now();
    const agreementId = String(req.query.agreementId || ''); const q = String(req.query.q || '').trim().toLowerCase();
    const view = String(req.query.view || 'all');
    let list = st().masterCpEntries.slice();
    if (agreementId) list = list.filter(e => e.agreementId === agreementId);
    if (q) list = list.filter(e => `${e.id} ${e.projectName} ${e.unitNo} ${e.brokerName} ${e.bookingId || ''} ${e.builder.invoiceNo || ''}`.toLowerCase().includes(q));
    const views: Record<string, (e: MasterCpEntry) => boolean> = {
      all: () => true,
      expected: e => !e.cancelled && e.builder.status === 'EXPECTED',
      invoiced: e => !e.cancelled && e.builder.status === 'INVOICED',
      overdue: e => isOverdue(e, ag.get(e.agreementId), now),
      payable: e => !e.cancelled && e.broker.status === 'DUE',
      hold: e => !e.cancelled && e.broker.status === 'ON_HOLD',
      risk: e => !e.cancelled && !!e.doublePayRisk && e.broker.status !== 'PAID',
      received: e => !e.cancelled && e.builder.status === 'RECEIVED',
      paid: e => !e.cancelled && e.broker.status === 'PAID',
      done: e => !e.cancelled && e.builder.status === 'RECEIVED' && (e.broker.status === 'PAID' || !e.brokerId),
      cancelled: e => !!e.cancelled,
    };
    const f = views[view] || views.all;
    const counts = Object.fromEntries(Object.entries(views).map(([k, fn]) => [k, st().masterCpEntries.filter(e => (!agreementId || e.agreementId === agreementId) && fn(e)).length]));
    list = list.filter(f).sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
    res.json({ success: true, entries: list.slice(0, 500).map(e => shapeEntry(e, ag.get(e.agreementId), now)), total: list.length, counts });
  });

  r.post('/entries', admin, (req: Request, res: Response) => {
    const p = entryBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid line');
    const d = p.data; const a = st().masterCpAgreements.find(x => x.id === d.agreementId); if (!a) return bad(res, 'Agreement not found', 404);
    if (a.status === 'DRAFT' || a.status === 'ENDED') return bad(res, 'Lines can be added only to an LOI or signed agreement', 409);
    if (Number.isNaN(Date.parse(d.bookedAt))) return bad(res, 'Booking date is not a date');
    const broker = d.brokerId ? db.byId('users', d.brokerId) : undefined;
    if (d.brokerId && (!broker || broker.role !== 'BROKER')) return bad(res, 'Broker not found', 404);
    const s = st();
    const e: MasterCpEntry = {
      id: nextId('MCE-', s.masterCpEntries.map(x => x.id), 6), agreementId: a.id, source: 'MANUAL', projectName: d.projectName, unitNo: d.unitNo,
      brokerId: broker?.id, brokerName: broker?.name || d.brokerName || 'GENZ direct', bookedAt: new Date(d.bookedAt).toISOString(), agreementValue: Math.round(d.agreementValue),
      genzRatePct: clampPct(d.genzRatePct ?? a.genzRatePct), brokerSharePct: broker ? clampPct(d.brokerSharePct ?? a.brokerSharePct) : 0,
      builder: { status: 'EXPECTED' }, broker: { status: broker ? brokerStatusAfter('EXPECTED', 'NOT_DUE', a.payWhenPaid) : 'NOT_DUE' },
      createdAt: nowIso(), updatedAt: nowIso(), history: [{ at: nowIso(), by: me().name, what: 'Added by hand' }],
    };
    if (e.brokerSharePct > e.genzRatePct) return bad(res, 'The broker share cannot be more than what the builder pays GENZ');
    s.masterCpEntries.push(e); db.save();
    audit('COMMISSION', e.id, 'MASTER_CP_LINE_ADDED', `${a.builderName} · ${e.projectName} ${e.unitNo} · ${inr(e.agreementValue)} · broker ${e.brokerName}`);
    res.json({ success: true, entry: shapeEntry(e, a) });
  });

  r.put('/entries/:id', admin, (req: Request, res: Response) => {
    const e = st().masterCpEntries.find(x => x.id === req.params.id); if (!e) return bad(res, 'Line not found', 404);
    const p = actionBody.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid action');
    const d = p.data; const a = st().masterCpAgreements.find(x => x.id === e.agreementId);
    const m = entryMoney(e, a); const when = d.date && !Number.isNaN(Date.parse(d.date)) ? new Date(d.date).toISOString() : nowIso();
    let what = '';
    const builderMoved = (to: BuilderSide) => { e.builder.status = to; e.broker.status = brokerStatusAfter(to, e.broker.status, a?.payWhenPaid ?? true); };
    if (e.cancelled && d.action !== 'REOPEN') return bad(res, 'This line is cancelled — reopen it first', 409);
    switch (d.action) {
      case 'EDIT':
        if (e.builder.status === 'RECEIVED' || e.broker.status === 'PAID') return bad(res, 'Money has moved on this line — amounts can no longer be edited (cancel and add a corrected line)', 409);
        if (d.agreementValue !== undefined) e.agreementValue = Math.round(d.agreementValue);
        if (d.genzRatePct !== undefined) e.genzRatePct = clampPct(d.genzRatePct);
        if (d.brokerSharePct !== undefined) e.brokerSharePct = clampPct(d.brokerSharePct);
        if (d.unitNo !== undefined) e.unitNo = d.unitNo;
        if (e.brokerSharePct > e.genzRatePct) return bad(res, 'The broker share cannot be more than what the builder pays GENZ');
        what = `Edited: value ${inr(e.agreementValue)}, GENZ ${e.genzRatePct}%, broker ${e.brokerSharePct}%`;
        break;
      case 'INVOICE':
        if (e.builder.status !== 'EXPECTED') return bad(res, 'Already invoiced', 409);
        if (!d.invoiceNo) return bad(res, 'Invoice number is required');
        e.builder.invoiceNo = d.invoiceNo; e.builder.invoicedAt = when; builderMoved('INVOICED');
        what = `Invoiced to the builder: ${d.invoiceNo} (${inr(m.expectedFromBuilder)} after TDS)`;
        break;
      case 'RECEIVE':
        if (e.builder.status === 'RECEIVED' || e.builder.status === 'WRITTEN_OFF') return bad(res, 'Already closed on the builder side', 409);
        if (!d.ref) return bad(res, 'Bank reference (UTR) is required');
        e.builder.receivedAt = when; e.builder.receivedAmount = Math.round(d.amount ?? m.expectedFromBuilder); e.builder.ref = d.ref; builderMoved('RECEIVED');
        what = `Received from the builder: ${inr(e.builder.receivedAmount)} (UTR ${d.ref})${e.builder.receivedAmount < m.expectedFromBuilder ? ` — ${inr(m.expectedFromBuilder - e.builder.receivedAmount)} short` : ''}`;
        break;
      case 'WRITE_OFF':
        if (e.builder.status === 'RECEIVED') return bad(res, 'Already received', 409);
        if (!d.reason || d.reason.length < 5) return bad(res, 'Say why (at least 5 letters)');
        builderMoved('WRITTEN_OFF'); what = `Written off: ${d.reason}`;
        break;
      case 'PAY':
        if (!e.brokerId) return bad(res, 'No broker on this line', 409);
        if (e.broker.status === 'PAID') return bad(res, 'Already paid', 409);
        if (e.broker.status === 'ON_HOLD') return bad(res, 'On hold — release it first', 409);
        if ((a?.payWhenPaid ?? true) && e.builder.status !== 'RECEIVED') return bad(res, 'Pay-when-paid: the builder has not paid GENZ for this unit yet', 409);
        if (e.doublePayRisk && (!d.reason || d.reason.length < 5)) return bad(res, 'The builder also recorded a brokerage to this partner in the CRM — confirm in a note (5+ letters) that the partner is not being paid twice', 409);
        if (!d.ref) return bad(res, 'Bank reference (UTR) is required');
        e.broker.status = 'PAID'; e.broker.paidAt = when; e.broker.paidAmount = Math.round(d.amount ?? m.payableToBroker); e.broker.ref = d.ref;
        what = `Paid to ${e.brokerName}: ${inr(e.broker.paidAmount)} (UTR ${d.ref})${d.reason ? ` — ${d.reason}` : ''}`;
        break;
      case 'HOLD':
        if (e.broker.status === 'PAID') return bad(res, 'Already paid', 409);
        if (!d.reason || d.reason.length < 5) return bad(res, 'Say why (at least 5 letters)');
        e.broker.status = 'ON_HOLD'; e.broker.holdReason = d.reason; what = `Broker payout on hold: ${d.reason}`;
        break;
      case 'RELEASE':
        if (e.broker.status !== 'ON_HOLD') return bad(res, 'Not on hold', 409);
        e.broker.status = brokerStatusAfter(e.builder.status, 'NOT_DUE', a?.payWhenPaid ?? true); e.broker.holdReason = undefined; what = 'Hold released';
        break;
      case 'CANCEL':
        if (e.builder.status === 'RECEIVED' || e.broker.status === 'PAID') return bad(res, 'Money has moved on this line — record the refund / recovery outside, then write it off', 409);
        if (!d.reason || d.reason.length < 5) return bad(res, 'Say why (at least 5 letters)');
        e.cancelled = { at: nowIso(), by: me().name, reason: d.reason }; what = `Cancelled: ${d.reason}`;
        break;
      case 'REOPEN':
        if (!e.cancelled) return bad(res, 'Not cancelled', 409);
        e.cancelled = undefined; what = 'Reopened';
        break;
    }
    e.updatedAt = nowIso(); e.history.push({ at: nowIso(), by: me().name, what }); if (e.history.length > 60) e.history.splice(0, e.history.length - 60);
    db.save();
    audit('COMMISSION', e.id, `MASTER_CP_${d.action}`, `${e.projectName} ${e.unitNo}: ${what}`.slice(0, 500));
    res.json({ success: true, entry: shapeEntry(e, a) });
  });

  r.get('/export.csv', admin, (_req, res) => {
    syncMasterCp();
    const csv = entriesCsv(st().masterCpEntries, agreementsMap());
    audit('SYSTEM', 'MASTER-CP-BOOK', 'MASTER_CP_EXPORTED', `${st().masterCpEntries.length} lines exported (CSV)`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="genz-master-cp-${nowIso().slice(0, 10)}.csv"`);
    res.send('﻿' + csv);
  });

  /** a broker's own master-CP earnings — his share only (not GENZ's rate / margin) */
  r.get('/mine', (req: Request, res: Response) => {
    const u = ctx().user as UserProfile | undefined; if (!u) return bad(res, 'Authentication required', 401);
    if (u.role !== 'BROKER') return res.json({ success: true, entries: [], totals: null });
    syncMasterCp();
    const ag = agreementsMap();
    const mine = st().masterCpEntries.filter(e => e.brokerId === u.id && !e.cancelled).sort((a, b) => b.bookedAt.localeCompare(a.bookedAt));
    const rows = mine.map(e => {
      const m = entryMoney(e, ag.get(e.agreementId));
      return { id: e.id, projectName: e.projectName, unitNo: e.unitNo, bookedAt: e.bookedAt, agreementValue: e.agreementValue, sharePct: e.brokerSharePct, share: m.brokerShare, tds: m.tdsOnBroker, payable: m.payableToBroker,
        status: e.broker.status, builderPaid: e.builder.status === 'RECEIVED', paidAt: e.broker.paidAt, paidAmount: e.broker.paidAmount, ref: e.broker.ref, holdReason: e.broker.holdReason };
    });
    const sum = (f: (x: typeof rows[number]) => boolean) => rows.filter(f).reduce((a, x) => a + (x.status === 'PAID' ? (x.paidAmount ?? x.payable) : x.payable), 0);
    res.json({ success: true, entries: rows, totals: { units: rows.length, earned: rows.reduce((a, x) => a + x.payable, 0), paid: sum(x => x.status === 'PAID'), due: sum(x => x.status === 'DUE'), waiting: sum(x => x.status === 'NOT_DUE'), onHold: sum(x => x.status === 'ON_HOLD') } });
    void req;
  });

  // v26 — pilot readiness: activation in 7 days + day-7 return
  r.get('/pilot', admin, (req, res) => {
    const s = st(); const now = Date.now();
    const first = (pairs: [string, string | undefined][]) => { const m: Record<string, number> = {}; for (const [id, at] of pairs) { const t = Date.parse(at || ''); if (id && Number.isFinite(t) && (m[id] === undefined || t < m[id])) m[id] = t; } return m; };
    const days = Math.min(365, Math.max(7, Number(req.query.days) || 60));
    res.json({ success: true, pilot: pilotFunnel({
      now,
      brokers: s.users.filter(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED').map(u => ({ id: u.id, createdAt: u.createdAt, city: u.city })),
      firstListingAt: first(s.properties.map(p => [p.listingBrokerId, p.createdAt])),
      firstClientAt: first([...s.clientCards.map(c => [c.brokerId, c.createdAt] as [string, string]), ...s.requirements.map(r => [r.assignedBrokerId, r.createdAt] as [string, string])]),
      firstConsentAt: first(s.ownerConsents.filter(c => c.acceptedAt).map(c => [c.brokerId, c.acceptedAt])),
      days: (s.activityDays || []).map(d => ({ day: d.day, seen: d.seen })),
    }, days, String(req.query.city || '').slice(0, 60)) });
  });

  // growth & value
  r.get('/value', admin, (_req, res) => { syncMasterCp(); res.json({ success: true, report: buildValueReport() }); });
  r.get('/value.csv', admin, (_req, res) => {
    syncMasterCp();
    audit('SYSTEM', 'VALUE-REPORT', 'VALUE_REPORT_EXPORTED', 'Monthly growth & value table exported (CSV)');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="genz-growth-${nowIso().slice(0, 10)}.csv"`);
    res.send('﻿' + valueCsv(buildValueReport()));
  });

  // network strength (builder pitch)
  r.get('/strength', admin, (req, res) => {
    const cities = [...new Set(st().users.filter(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED' && u.city).map(u => u.city!.trim()))].sort();
    res.json({ success: true, strength: networkStrength(String(req.query.city || '').trim()), cities });
  });
  r.get('/strength/links', admin, (_req, res) => {
    res.json({ success: true, links: st().strengthLinks.slice().reverse().map(l => ({ ...l, token: undefined, path: `/#/strength/${l.token}`, live: !l.revokedAt && Date.parse(l.expiresAt) > Date.now() })) });
  });
  r.post('/strength/links', admin, rateLimit('strength-link', 30, 24 * 3600_000), (req: Request, res: Response) => {
    const p = z.object({ city: z.string().trim().max(80).optional().default(''), label: z.string().trim().min(2).max(80), days: z.number().int().min(1).max(90).optional().default(30) }).safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid link');
    const s = st();
    const l = { id: nextId('SL-', s.strengthLinks.map(x => x.id), 4), token: crypto.randomBytes(18).toString('base64url'), city: p.data.city, label: p.data.label, createdAt: nowIso(), createdBy: me().name, expiresAt: new Date(Date.now() + p.data.days * 86_400_000).toISOString(), views: 0 };
    s.strengthLinks.push(l); db.save();
    audit('SYSTEM', l.id, 'STRENGTH_LINK_CREATED', `Network-strength link for "${l.label}" (${l.city || 'All India'}), ${p.data.days} days`);
    res.json({ success: true, link: { ...l, path: `/#/strength/${l.token}` } });
  });
  r.delete('/strength/links/:id', admin, (req: Request, res: Response) => {
    const l = st().strengthLinks.find(x => x.id === req.params.id); if (!l) return bad(res, 'Link not found', 404);
    if (!l.revokedAt) { l.revokedAt = nowIso(); db.save(); audit('SYSTEM', l.id, 'STRENGTH_LINK_REVOKED', `Link for "${l.label}" switched off`); }
    res.json({ success: true });
  });
  return r;
}

/** public, read-only: what a builder sees when opening the link (aggregate numbers; no login) */
export function createPublicStrengthRouter() {
  const r = Router();
  r.get('/strength/:token', rateLimit('strength-public', 60, 60_000), (req: Request, res: Response) => {
    const l = st().strengthLinks.find(x => x.token === req.params.token);
    if (!l || l.revokedAt || Date.parse(l.expiresAt) < Date.now()) return res.status(404).json({ error: 'This link has expired or was switched off. Ask GENZ for a new one.' });
    l.views++; l.lastViewAt = nowIso(); db.save(); // saves are coalesced, so a busy link cannot flood the store
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, label: l.label, expiresAt: l.expiresAt, strength: networkStrength(l.city), platform: { name: st().settings.platformName || 'GENZ Broker Network', poweredBy: st().settings.poweredBy || 'GENZ BUILDCON' } });
  });
  return r;
}

export function sweepRevenue() { syncMasterCp(); }
export type { DatabaseState };
