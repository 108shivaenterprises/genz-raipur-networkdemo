/**
 * v12 — Project Control Room (builder), project-wise partner view + shortlist (channel partner)
 * and lead control for staff.  Mounted at /api/pcontrol.
 *
 * Principles
 *  • The builder owns the project: who may work it (apply → shortlist → approve), on what terms (commission,
 *    quota, daily cap, end date), whether new leads are accepted at all, and whether every lead needs a
 *    builder check first (auto-accepted after 48 h so a partner is never blocked by silence).
 *  • Fair to partners: a lead already registered keeps its attribution through pause / revoke (unless the builder
 *    explicitly takes the open leads back, with a reason); a booking requested earlier is still honoured; commission
 *    changes apply only to bookings requested afterwards.
 *  • Staff only get what the employer allows (phone mode, scope, claim, caps) — and every reveal is logged.
 *  • No cash, no paid third party; everything is audited in the hash-chained trail.
 */
import { tier1Gate } from './tiers.js';
import { tierOf } from '../src/shared/networkRules.js';
import { Router, type Request, type Response, type RequestHandler } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, SalesAssociateMandate, BuilderProject, ProjectShortlist } from './db.js';
import { ctx, needs, rateLimit, isSafeUrl, digits } from './auth.js';
import { isAdmin, isSuper } from './access.js';
import { registerLead, leadCreateSchema } from './crm.js';
import { launchGate } from './launch.js';
import { availableUnitsForPartner } from './invaccess.js';
import { membersOf, openLoad, poolFor, leadsForMember, maskLeadForViewer, releaseMemberLeads, ownerIdOf } from './leadflow.js';
import {
  policyOf, cleanPolicy, mandateIsActive, partnerCard, staffCard, startOfDayMs,
} from '../src/shared/pcontrolRules.js';
import type { CrmLead } from '../src/types/crm.js';

const nowIso = () => new Date().toISOString();
const isOpen = (l: CrmLead) => !['BOOKED', 'LOST'].includes(l.stage);
const VISIBLE_STATUS = ['ACTIVE_LAUNCH', 'PRE_BOOKING'];

function mandateSeq(): string {
  const ids = db.getState().associateMandates.map(m => m.id);
  const max = ids.reduce((m, id) => Math.max(m, Number(/MAND-(?:RAI-)?0*(\d+)/.exec(id)?.[1] ?? 0)), 0);
  return `MAND-${String(max + 1).padStart(2, '0')}`;
}
const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Called at start-up and hourly: auto-accept stale verifications, end expired partnerships. */
export function sweepControl(now = Date.now()): { accepted: number; expired: number } {
  const st = db.getState();
  let accepted = 0, expired = 0;
  for (const l of st.crmLeads) {
    if (l.verify === 'PENDING' && l.verifyDueAt && Date.parse(l.verifyDueAt) < now) {
      l.verify = 'ACCEPTED'; l.verifiedAt = nowIso(); l.verifiedBy = 'auto'; l.verifyNote = 'Auto-accepted: builder did not respond within 48 hours';
      l.activities.unshift({ id: uid('A'), type: 'SYSTEM', note: 'Auto-accepted (no builder response in 48 h)', byUserId: 'system', byName: 'GENZ', at: nowIso() });
      accepted++;
    }
  }
  for (const m of st.associateMandates) {
    if (m.validUntil && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'].includes(m.status) && Date.parse(m.validUntil) < now) {
      m.status = 'COMPLETED'; m.statusReason = 'Partnership period ended'; m.decidedAt = nowIso(); expired++;
    }
  }
  if (accepted || expired) db.save();
  return { accepted, expired };
}

const settingsSchema = z.object({
  access: z.enum(['OPEN_APPLY', 'INVITE_ONLY']).optional(),
  leadIntake: z.enum(['OPEN', 'PAUSED']).optional(),
  intakeNote: z.string().trim().max(200).optional(),
  leadVerification: z.enum(['AUTO', 'MANUAL']).optional(),
  registrationDays: z.number().int().min(15).max(180).optional(),
  visitProof: z.enum(['OFF', 'QR_REQUIRED']).optional(),
  desk: z.boolean().optional(),
});
const detailsSchema = z.object({
  tagline: z.string().trim().max(160).optional(),
  projectStage: z.enum(['Pre-Launch / Upcoming', 'Under Construction', 'Ready to Move']).optional(),
  status: z.enum(['ACTIVE_LAUNCH', 'PRE_BOOKING', 'SOLD_OUT', 'ARCHIVED']).optional(),
  priceStartingFrom: z.number().positive().max(100_000_000_000).optional(),
  priceMax: z.number().positive().max(100_000_000_000).optional(),
  channelPartnerCommissionPct: z.number().min(0.1).max(10).optional(),
  availableUnits: z.number().int().min(0).max(100000).optional(),
  completionTarget: z.string().trim().max(40).optional(),
  amenities: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  unitConfigurations: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});
const updateSchema = z.object({
  kind: z.enum(['OFFER', 'UPDATE', 'PRICE', 'LAUNCH', 'NOTICE']).default('UPDATE'),
  title: z.string().trim().min(3, 'Title is required').max(120),
  body: z.string().trim().max(1000).default(''),
  validUntil: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  audience: z.enum(['ASSOCIATES', 'ALL_CPS']).default('ASSOCIATES'),
});
const collateralSchema = z.object({
  title: z.string().trim().min(2).max(100),
  kind: z.enum(['BROCHURE', 'PRICE_LIST', 'PAYMENT_PLAN', 'RERA', 'LAYOUT', 'OTHER']).default('OTHER'),
  url: z.string().max(2048).refine(isSafeUrl, 'Only http(s) links are allowed'),
  audience: z.enum(['ASSOCIATES', 'ALL_CPS']).default('ASSOCIATES'),
});
const pctOk = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0.1 && v <= 10;

export function createPcontrolRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const audit = (entity: 'DEAL' | 'LEAD' | 'SYSTEM' | 'VERIFICATION', id: string, action: string, details: string) => {
    const u = me(); db.appendAuditEvent(u.id, u.role as any, entity, id, action, details);
  };
  const state = () => db.getState();
  const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ error: msg });

  /** the builder's project, or (read-only) any project for an admin */
  const projectFor = (id: string, write: boolean): BuilderProject | undefined => {
    const u = me(); const p = state().builderProjects.find(x => x.id === id);
    if (!p) return undefined;
    if (isSuper(u)) return p;
    if (u.role === 'DEVELOPER_BUILDER') return p.builderId === u.id ? p : undefined;
    if (!write && isAdmin(u)) return p;
    return undefined;
  };
  const myProjectIds = (employer: UserProfile): string[] =>
    employer.role === 'DEVELOPER_BUILDER'
      ? state().builderProjects.filter(p => p.builderId === employer.id).map(p => p.id)
      : state().associateMandates.filter(m => m.brokerId === employer.id && mandateIsActive(m)).map(m => m.projectId);

  const unitCounts = (projectId: string) => {
    const c = { AVAILABLE: 0, HOLD: 0, BOOKED: 0, RESERVED: 0, total: 0 };
    for (const x of state().inventoryUnits.filter(u => u.projectId === projectId)) { c[x.status]++; c.total++; }
    return c;
  };

  // ═══════════════════════ BUILDER — project control room ═══════════════════════
  r.get('/builder/projects', needs('pcontrol:manage', 'pcontrol:oversee'), (_req, res) => {
    const u = me(); const st = state();
    const projects = st.builderProjects.filter(p => isAdmin(u) || p.builderId === u.id).map(p => {
      const ms = st.associateMandates.filter(m => m.projectId === p.id);
      const leads = st.crmLeads.filter(l => l.projectId === p.id);
      return {
        id: p.id, projectName: p.projectName, city: p.city, locality: p.locality, status: p.status, builderName: p.builderName,
        access: p.access || 'OPEN_APPLY', leadIntake: p.leadIntake || 'OPEN', leadVerification: p.leadVerification || 'AUTO',
        partners: ms.filter(m => mandateIsActive(m)).length,
        paused: ms.filter(m => m.status === 'PAUSED').length,
        applications: ms.filter(m => m.status === 'APPLIED').length,
        shortlisted: ms.filter(m => m.status === 'SHORTLISTED').length,
        leads: leads.length, openLeads: leads.filter(isOpen).length,
        pendingVerification: leads.filter(l => l.verify === 'PENDING').length,
        verifiedVisits: leads.filter(l => l.visitProof).length,
        pendingBookings: st.crmBookings.filter(b => b.projectId === p.id && b.status === 'REQUESTED').length,
      };
    });
    res.json({ success: true, projects });
  });

  r.get('/builder/projects/:id', needs('pcontrol:manage', 'pcontrol:oversee'), (req, res) => {
    const u = me(); const st = state();
    const p = projectFor(req.params.id, false);
    if (!p) return bad(res, 'Project not found', 404);
    const leads = st.crmLeads.filter(l => l.projectId === p.id);
    const mask = (l: CrmLead) => (isAdmin(u) && !isSuper(u) ? { ...l, phone: l.phone.slice(0, -5) + '•••••' } : l);
    const partners = st.associateMandates.filter(m => m.projectId === p.id).map(m => {
      const broker = db.byId('users', m.brokerId);
      return {
        ...m,
        brokerCity: broker?.city, brokerRera: broker?.reraNumber || m.brokerReraNumber, brokerCompany: m.brokerCompany || broker?.companyName,
        card: partnerCard(leads.filter(l => l.mandateId === m.id), m.assignedAt),
        verifiedVisits: leads.filter(l => l.mandateId === m.id && l.visitProof).length,
        pendingBookings: st.crmBookings.filter(b => b.mandateId === m.id && b.status === 'REQUESTED').length,
        leadsToday: leads.filter(l => l.mandateId === m.id && Date.parse(l.createdAt) >= startOfDayMs()).length,
      };
    }).sort((a, b) => (a.status === 'APPLIED' ? -1 : 0) - (b.status === 'APPLIED' ? -1 : 0));
    const staff = membersOf(p.builderId).map(m => ({ id: m.id, name: m.name, title: m.teamTitle, status: m.verificationStatus, policy: policyOf(m) }));
    const shortlists = st.projectShortlists.filter(s => s.projectId === p.id && s.status !== 'DROPPED');
    res.json({
      success: true,
      project: {
        id: p.id, projectName: p.projectName, builderName: p.builderName, city: p.city, locality: p.locality, tagline: p.tagline, status: p.status, projectStage: p.projectStage,
        priceStartingFrom: p.priceStartingFrom, priceMax: p.priceMax, channelPartnerCommissionPct: p.channelPartnerCommissionPct,
        totalUnits: p.totalUnits, availableUnits: p.availableUnits, completionTarget: p.completionTarget, amenities: p.amenities, unitConfigurations: p.unitConfigurations,
        access: p.access || 'OPEN_APPLY', leadIntake: p.leadIntake || 'OPEN', intakeNote: p.intakeNote || '',
        leadVerification: p.leadVerification || 'AUTO', registrationDays: p.registrationDays || 60, visitProof: p.visitProof || 'OFF',
      },
      partners,
      verification: leads.filter(l => l.verify === 'PENDING').map(mask),
      updates: st.projectUpdates.filter(x => x.projectId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      collateral: p.collateral || [],
      demand: { clients: new Set(shortlists.map(s => `${s.ownerId}:${s.clientName.toLowerCase()}`)).size, partners: new Set(shortlists.map(s => s.ownerId)).size, registered: shortlists.filter(s => s.status === 'LEAD_REGISTERED').length },
      units: unitCounts(p.id),
      staff,
      summary: {
        leads: leads.length, open: leads.filter(isOpen).length, booked: leads.filter(l => l.stage === 'BOOKED').length,
        bySource: leads.reduce((a, l) => { a[l.source] = (a[l.source] || 0) + 1; return a; }, {} as Record<string, number>),
      },
    });
  });

  r.put('/builder/projects/:id/details', needs('pcontrol:manage'), (req, res) => {
    const p = projectFor(req.params.id, true);
    if (!p) return bad(res, 'Project not found', 404);
    const parsed = detailsSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid details');
    const d = parsed.data;
    const lo = d.priceStartingFrom ?? p.priceStartingFrom; const hi = d.priceMax ?? p.priceMax;
    if (hi < lo) return bad(res, 'Maximum price must be ≥ starting price');
    if (d.availableUnits !== undefined && d.availableUnits > p.totalUnits) return bad(res, `Available units cannot exceed total units (${p.totalUnits})`);
    const changed: string[] = [];
    for (const [k, v] of Object.entries(d)) { if (v !== undefined && JSON.stringify((p as any)[k]) !== JSON.stringify(v)) { changed.push(k); (p as any)[k] = v; } }
    if (changed.length) { p.updatedAt = nowIso(); db.save(); audit('SYSTEM', p.id, 'PROJECT_DETAILS_UPDATED', `${me().name} changed ${changed.join(', ')} on ${p.projectName}${changed.includes('channelPartnerCommissionPct') ? ' (default commission applies to NEW appointments only)' : ''}`); }
    res.json({ success: true, changed });
  });

  r.put('/builder/projects/:id/settings', needs('pcontrol:manage'), (req, res) => {
    const p = projectFor(req.params.id, true);
    if (!p) return bad(res, 'Project not found', 404);
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid settings');
    const d = parsed.data;
    const was = `${p.access || 'OPEN_APPLY'}/${p.leadIntake || 'OPEN'}/${p.leadVerification || 'AUTO'}/${p.registrationDays || 60}d`;
    if (d.access) p.access = d.access;
    if (d.desk !== undefined && d.desk !== !!p.desk) { p.desk = d.desk; audit('SYSTEM', p.id, 'PROJECT_DESK', `${me().name}: ${p.projectName} GENZ desk coordination → ${d.desk ? 'ON' : 'OFF'}`); }
    if (d.leadIntake) { p.leadIntake = d.leadIntake; if (d.leadIntake === 'OPEN') p.intakeNote = ''; }
    if (d.intakeNote !== undefined) p.intakeNote = d.intakeNote;
    if (d.leadVerification) p.leadVerification = d.leadVerification;
    if (d.registrationDays) p.registrationDays = d.registrationDays;
    if (d.visitProof && d.visitProof !== (p.visitProof || 'OFF')) { p.visitProof = d.visitProof; p.visitProofSince = d.visitProof === 'QR_REQUIRED' ? nowIso() : undefined; audit('SYSTEM', p.id, 'VISIT_PROOF_RULE', `${me().name}: ${p.projectName} visit proof → ${d.visitProof}`); }
    p.updatedAt = nowIso(); db.save();
    audit('SYSTEM', p.id, 'PROJECT_CONTROL_SETTINGS', `${me().name}: ${p.projectName} ${was} → ${p.access || 'OPEN_APPLY'}/${p.leadIntake || 'OPEN'}/${p.leadVerification || 'AUTO'}/${p.registrationDays || 60}d`);
    res.json({ success: true });
  });

  // ── notices & collateral ──
  r.post('/builder/projects/:id/updates', needs('pcontrol:manage'), rateLimit('pc-update', 60, 24 * 3600_000), (req, res) => {
    const p = projectFor(req.params.id, true);
    if (!p) return bad(res, 'Project not found', 404);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid notice');
    if (state().projectUpdates.filter(x => x.projectId === p.id).length >= 100) return bad(res, 'Notice board is full (100) — delete old notices first', 409);
    const x = { id: uid('PU'), projectId: p.id, builderId: p.builderId, ...parsed.data, createdBy: me().id, createdAt: nowIso() };
    state().projectUpdates.unshift(x); db.save();
    audit('SYSTEM', x.id, 'PROJECT_NOTICE_POSTED', `${me().name} posted "${x.title}" (${x.kind}) for ${p.projectName} to ${x.audience === 'ASSOCIATES' ? 'appointed partners' : 'all brokers'}`);
    res.json({ success: true, update: x });
  });
  r.delete('/builder/updates/:uid', needs('pcontrol:manage'), (req, res) => {
    const x = state().projectUpdates.find(y => y.id === req.params.uid);
    if (!x || !projectFor(x.projectId, true)) return bad(res, 'Notice not found', 404);
    state().projectUpdates = state().projectUpdates.filter(y => y.id !== x.id); db.save();
    audit('SYSTEM', x.id, 'PROJECT_NOTICE_DELETED', `${me().name} deleted notice "${x.title}"`);
    res.json({ success: true });
  });
  r.post('/builder/projects/:id/collateral', needs('pcontrol:manage'), (req, res) => {
    const p = projectFor(req.params.id, true);
    if (!p) return bad(res, 'Project not found', 404);
    const parsed = collateralSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid link');
    p.collateral ||= [];
    if (p.collateral.length >= 30) return bad(res, 'Up to 30 files per project', 409);
    const c = { id: uid('PC'), ...parsed.data, addedAt: nowIso() };
    p.collateral.unshift(c); db.save();
    audit('SYSTEM', p.id, 'PROJECT_COLLATERAL_ADDED', `${me().name} added "${c.title}" (${c.kind}) to ${p.projectName}`);
    res.json({ success: true, collateral: c });
  });
  r.delete('/builder/projects/:id/collateral/:cid', needs('pcontrol:manage'), (req, res) => {
    const p = projectFor(req.params.id, true);
    if (!p) return bad(res, 'Project not found', 404);
    const before = (p.collateral || []).length;
    p.collateral = (p.collateral || []).filter(c => c.id !== req.params.cid);
    if (p.collateral.length === before) return bad(res, 'File not found', 404);
    db.save(); audit('SYSTEM', p.id, 'PROJECT_COLLATERAL_REMOVED', `${me().name} removed a file from ${p.projectName}`);
    res.json({ success: true });
  });

  // ── partners: decide / pause / revoke / terms ──
  const mandateFor = (id: string): { m: SalesAssociateMandate; p: BuilderProject } | undefined => {
    const m = state().associateMandates.find(x => x.id === id);
    const p = m && projectFor(m.projectId, true);
    return m && p ? { m, p } : undefined;
  };

  r.post('/builder/mandates/:id/decide', needs('pcontrol:manage'), (req, res) => {
    const f = mandateFor(req.params.id);
    if (!f) return bad(res, 'Partner request not found', 404);
    const { m, p } = f;
    if (!['APPLIED', 'SHORTLISTED', 'INVITED', 'DECLINED'].includes(m.status)) return bad(res, `This partner is already ${m.status.toLowerCase().replace('_', ' ')}`, 409);
    const { action, commissionPct, quota, dailyLeadCap, validUntil, note } = req.body || {};
    const broker = state().users.find(x => x.id === m.brokerId);
    if (action === 'APPROVE') {
      if (!broker || broker.verificationStatus !== 'VERIFIED') return bad(res, 'Only KYC-verified brokers can be appointed');
      if (tierOf(broker) === 'TIER2') return bad(res, 'This broker is a Tier 2 local associate (no RERA). Builder projects need a RERA-verified (Tier 1) broker.', 409);
      const pct = commissionPct === undefined || commissionPct === '' ? p.channelPartnerCommissionPct : Number(commissionPct);
      if (!pctOk(pct)) return bad(res, 'Commission must be between 0.1% and 10%');
      const q = quota === undefined || quota === '' ? 5 : Number(quota);
      if (!Number.isInteger(q) || q < 1 || q > 1000) return bad(res, 'Target units must be a whole number between 1 and 1000');
      let cap: number | undefined;
      if (dailyLeadCap !== undefined && dailyLeadCap !== '' && dailyLeadCap !== null) { cap = Number(dailyLeadCap); if (!Number.isInteger(cap) || cap < 1 || cap > 200) return bad(res, 'Daily lead limit must be 1–200'); }
      if (validUntil && (Number.isNaN(Date.parse(validUntil)) || Date.parse(validUntil) < Date.now())) return bad(res, 'End date must be in the future');
      m.status = 'ACTIVE_ASSOCIATE'; m.agreedCommissionPct = pct; m.targetUnitsQuota = q; m.dailyLeadCap = cap; m.validUntil = validUntil || undefined;
      m.statusReason = note ? String(note).slice(0, 200) : undefined; m.decidedAt = nowIso(); m.marketingKitAccess = true;
      m.termsHistory = [...(m.termsHistory || []), { at: nowIso(), by: me().name, commissionPct: pct, quota: q, dailyLeadCap: cap, validUntil: m.validUntil, note: 'Appointed' }];
      p.assignedAssociatesCount = (p.assignedAssociatesCount || 0) + 1; p.updatedAt = nowIso();
    } else if (action === 'SHORTLIST') {
      m.status = 'SHORTLISTED'; m.statusReason = note ? String(note).slice(0, 200) : 'Shortlisted — builder will confirm'; m.decidedAt = nowIso();
    } else if (action === 'DECLINE') {
      if (!note || String(note).trim().length < 3) return bad(res, 'Give the partner a short reason');
      m.status = 'DECLINED'; m.statusReason = String(note).slice(0, 200); m.decidedAt = nowIso();
    } else return bad(res, 'Action must be APPROVE, SHORTLIST or DECLINE');
    db.save();
    audit('DEAL', m.id, `PARTNER_${action}`, `${me().name}: ${m.brokerName} on ${p.projectName} → ${m.status}${action === 'APPROVE' ? ` (${m.agreedCommissionPct}%, quota ${m.targetUnitsQuota}${m.dailyLeadCap ? `, ${m.dailyLeadCap}/day` : ''}${m.validUntil ? `, until ${m.validUntil.slice(0, 10)}` : ''})` : m.statusReason ? `: ${m.statusReason}` : ''}`);
    res.json({ success: true, mandate: m });
  });

  r.post('/builder/mandates/:id/status', needs('pcontrol:manage'), (req, res) => {
    const f = mandateFor(req.params.id);
    if (!f) return bad(res, 'Partner not found', 404);
    const { m, p } = f; const st = state();
    const { action, reason, takeOpenLeads } = req.body || {};
    const active = ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status);
    if (action === 'PAUSE') {
      if (!active) return bad(res, 'Only an active partner can be paused', 409);
      if (!reason || String(reason).trim().length < 3) return bad(res, 'Give a short reason');
      m.status = 'PAUSED'; m.statusReason = String(reason).slice(0, 200);
    } else if (action === 'RESUME') {
      if (m.status !== 'PAUSED') return bad(res, 'Only a paused partner can be resumed', 409);
      m.status = 'ACTIVE_ASSOCIATE'; m.statusReason = undefined;
    } else if (action === 'REVOKE') {
      if (!active && m.status !== 'PAUSED') return bad(res, 'Only an active or paused partner can be revoked', 409);
      if (!reason || String(reason).trim().length < 5) return bad(res, 'A reason (min 5 characters) is required to revoke');
      if (st.crmBookings.some(b => b.mandateId === m.id && b.status === 'REQUESTED')) return bad(res, 'Decide this partner\'s pending booking requests first, then revoke', 409);
      m.status = 'REVOKED'; m.statusReason = String(reason).slice(0, 200);
      p.assignedAssociatesCount = Math.max(0, (p.assignedAssociatesCount || 1) - 1);
      // free unit holds that never became a booking request
      for (const u of st.inventoryUnits.filter(x => x.projectId === p.id && x.status === 'HOLD' && x.hold?.brokerId === m.brokerId && !x.hold?.bookingId)) { u.status = 'AVAILABLE'; u.hold = undefined; u.updatedAt = nowIso(); }
      if (takeOpenLeads === true) {
        for (const l of st.crmLeads.filter(x => x.mandateId === m.id && isOpen(x) && x.stage !== 'BOOKING_REQUESTED')) {
          l.activities.unshift({ id: uid('A'), type: 'SYSTEM', note: `Taken back by builder desk after partnership ended: ${String(reason).slice(0, 120)}`, byUserId: me().id, byName: me().name, at: nowIso() });
          l.associateId = ''; l.associateName = 'Builder desk'; l.mandateId = undefined; l.assignedMemberId = undefined; l.assignedMemberName = undefined; l.updatedAt = nowIso();
        }
      }
    } else return bad(res, 'Action must be PAUSE, RESUME or REVOKE');
    m.decidedAt = nowIso(); p.updatedAt = nowIso(); db.save();
    audit('DEAL', m.id, `PARTNER_${action}`, `${me().name}: ${m.brokerName} on ${p.projectName} → ${m.status}${m.statusReason ? ` (${m.statusReason})` : ''}${action === 'REVOKE' ? (takeOpenLeads === true ? '; open leads taken back' : '; registered leads keep attribution') : ''}`);
    res.json({ success: true, mandate: m });
  });

  r.put('/builder/mandates/:id/terms', needs('pcontrol:manage'), (req, res) => {
    const f = mandateFor(req.params.id);
    if (!f) return bad(res, 'Partner not found', 404);
    const { m, p } = f;
    if (!['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'].includes(m.status)) return bad(res, 'Terms can be changed for appointed partners only', 409);
    const { commissionPct, quota, dailyLeadCap, validUntil, note } = req.body || {};
    if (!note || String(note).trim().length < 3) return bad(res, 'Add a short note — the partner will see why the terms changed');
    const next = { commissionPct: m.agreedCommissionPct, quota: m.targetUnitsQuota, cap: m.dailyLeadCap, until: m.validUntil };
    if (commissionPct !== undefined) { if (!pctOk(Number(commissionPct))) return bad(res, 'Commission must be between 0.1% and 10%'); next.commissionPct = Number(commissionPct); }
    if (quota !== undefined) { const q = Number(quota); if (!Number.isInteger(q) || q < 1 || q > 1000) return bad(res, 'Target units must be 1–1000'); next.quota = q; }
    if (dailyLeadCap !== undefined) { if (dailyLeadCap === null || dailyLeadCap === '') next.cap = undefined; else { const c = Number(dailyLeadCap); if (!Number.isInteger(c) || c < 1 || c > 200) return bad(res, 'Daily lead limit must be 1–200'); next.cap = c; } }
    if (validUntil !== undefined) { if (!validUntil) next.until = undefined; else { if (Number.isNaN(Date.parse(validUntil)) || Date.parse(validUntil) < Date.now()) return bad(res, 'End date must be in the future'); next.until = String(validUntil); } }
    const before = `${m.agreedCommissionPct}%/${m.targetUnitsQuota}/${m.dailyLeadCap ?? '∞'}/${m.validUntil?.slice(0, 10) ?? '∞'}`;
    m.agreedCommissionPct = next.commissionPct; m.targetUnitsQuota = next.quota; m.dailyLeadCap = next.cap; m.validUntil = next.until;
    m.termsHistory = [...(m.termsHistory || []), { at: nowIso(), by: me().name, commissionPct: next.commissionPct, quota: next.quota, dailyLeadCap: next.cap, validUntil: next.until, note: String(note).slice(0, 200) }];
    db.save();
    audit('DEAL', m.id, 'PARTNER_TERMS_CHANGED', `${me().name}: ${m.brokerName} on ${p.projectName} ${before} → ${m.agreedCommissionPct}%/${m.targetUnitsQuota}/${m.dailyLeadCap ?? '∞'}/${m.validUntil?.slice(0, 10) ?? '∞'} (${String(note).slice(0, 100)}). Applies to bookings requested from now on.`);
    res.json({ success: true, mandate: m });
  });

  // ── lead verification (builder or builder staff with canVerify) ──
  const canVerify = (u: UserProfile, l: CrmLead): boolean => {
    if (isSuper(u) || (u.role === 'DEVELOPER_BUILDER' && l.builderId === u.id)) return true;
    if (u.role === 'TEAM_MEMBER' && u.employerId === l.builderId && u.verificationStatus === 'VERIFIED') {
      const pol = policyOf(u);
      return pol.canVerify && (pol.projectIds.length === 0 || pol.projectIds.includes(l.projectId));
    }
    return false;
  };

  r.get('/builder/verification-queue', needs('crm:read'), (_req, res) => {
    const u = me();
    const q = state().crmLeads.filter(l => l.verify === 'PENDING' && canVerify(u, l)).map(l => maskLeadForViewer(l, u));
    res.json({ success: true, leads: q });
  });

  r.post('/builder/leads/:id/verify', needs('crm:read'), (req, res) => {
    const u = me();
    const l = state().crmLeads.find(x => x.id === req.params.id);
    if (!l || !canVerify(u, l)) return bad(res, 'Lead not found', 404);
    if (l.verify !== 'PENDING') return bad(res, 'This lead is not waiting for verification', 409);
    const { decision, note } = req.body || {};
    if (decision === 'REJECT' && (!note || String(note).trim().length < 3)) return bad(res, 'Give the partner a short reason');
    if (decision !== 'ACCEPT' && decision !== 'REJECT') return bad(res, 'Decision must be ACCEPT or REJECT');
    l.verify = decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED'; l.verifiedBy = u.name; l.verifiedAt = nowIso(); l.verifyNote = note ? String(note).slice(0, 200) : undefined;
    if (decision === 'REJECT') { l.stage = 'LOST'; l.lostReason = `Rejected by builder: ${String(note).slice(0, 200)}`; l.protectedUntil = nowIso(); }
    l.updatedAt = nowIso();
    l.activities.unshift({ id: uid('A'), type: 'SYSTEM', note: `Builder ${decision === 'ACCEPT' ? 'accepted' : 'rejected'} the lead${note ? `: ${String(note).slice(0, 200)}` : ''}`, byUserId: u.id, byName: u.name, at: nowIso() });
    db.save();
    audit('LEAD', l.id, decision === 'ACCEPT' ? 'CRM_LEAD_ACCEPTED' : 'CRM_LEAD_REJECTED', `${u.name} ${decision === 'ACCEPT' ? 'accepted' : 'rejected'} ${l.name} (${l.associateName}) on ${l.projectName}${note ? `: ${String(note).slice(0, 100)}` : ''}`);
    res.json({ success: true, lead: maskLeadForViewer(l, u) });
  });

  // ═══════════════════════ PARTNER (broker) — project-wise ═══════════════════════
  const partnerNeeds = needs('pcontrol:partner');
  const partnerOnly: RequestHandler = (req, res, next) => partnerNeeds(req, res, () => tier1Gate(req, res, next));
  const myMandate = (projectId: string, brokerId: string) => state().associateMandates.find(m => m.projectId === projectId && m.brokerId === brokerId);
  const visibleTo = (p: BuilderProject, brokerId: string) => {
    const m = myMandate(p.id, brokerId);
    if (m) return true;
    if (!VISIBLE_STATUS.includes(p.status) || (p.access || 'OPEN_APPLY') !== 'OPEN_APPLY') return false;
    // v16.8: once the builder has agreed to a GENZ launch, the launch plan (waves by group) decides who may see the project
    const b = state().users.find(x => x.id === brokerId);
    return !b || launchGate(p, b) !== 'CLOSED';
  };
  const relationOf = (m?: SalesAssociateMandate): string => {
    if (!m) return 'NONE';
    if (['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status)) return mandateIsActive(m) ? 'ACTIVE' : 'COMPLETED';
    return m.status;
  };
  const audienceOk = (aud: string, rel: string) => aud === 'ALL_CPS' || ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(rel);

  r.get('/partner/projects', partnerOnly, (_req, res) => {
    const u = me(); const st = state();
    const order: Record<string, number> = { ACTIVE: 0, PAUSED: 1, SHORTLISTED: 2, APPLIED: 3, INVITED: 4, NONE: 5, COMPLETED: 6, DECLINED: 7, REVOKED: 8 };
    const rows = st.builderProjects.filter(p => p.status !== 'ARCHIVED' || myMandate(p.id, u.id)).filter(p => visibleTo(p, u.id)).map(p => {
      const m = myMandate(p.id, u.id); const rel = relationOf(m);
      const mine = st.crmLeads.filter(l => l.projectId === p.id && l.associateId === u.id);
      const now = Date.now();
      return {
        id: p.id, projectName: p.projectName, builderName: p.builderName, city: p.city, locality: p.locality, status: p.status, projectStage: p.projectStage,
        priceStartingFrom: p.priceStartingFrom, priceMax: p.priceMax, unitConfigurations: p.unitConfigurations, availableUnits: p.availableUnits,
        defaultCommissionPct: p.channelPartnerCommissionPct,
        relation: rel, statusReason: m?.statusReason, mandateId: m?.id,
        myTerms: m && ['ACTIVE', 'PAUSED'].includes(rel) ? { commissionPct: m.agreedCommissionPct, quota: m.targetUnitsQuota, sold: m.unitsSold, dailyLeadCap: m.dailyLeadCap, validUntil: m.validUntil } : undefined,
        leadIntake: p.leadIntake || 'OPEN', intakeNote: p.intakeNote, leadVerification: p.leadVerification || 'AUTO',
        myLeads: mine.length, myOpen: mine.filter(isOpen).length, myBooked: mine.filter(l => l.stage === 'BOOKED').length,
        myPendingVerify: mine.filter(l => l.verify === 'PENDING').length,
        shortlisted: st.projectShortlists.filter(s => s.ownerId === u.id && s.projectId === p.id && s.status === 'SHORTLISTED').length,
        notices: st.projectUpdates.filter(x => x.projectId === p.id && audienceOk(x.audience, rel) && (!x.validUntil || Date.parse(x.validUntil) + 86400000 > now)).length,
      };
    }).sort((a, b) => (order[a.relation] ?? 9) - (order[b.relation] ?? 9) || a.projectName.localeCompare(b.projectName));
    res.json({ success: true, projects: rows });
  });

  r.get('/partner/projects/:id', partnerOnly, (req, res) => {
    const u = me(); const st = state();
    const p = db.byId('builderProjects', req.params.id);
    if (!p || !visibleTo(p, u.id)) return bad(res, 'Project not found', 404);
    const m = myMandate(p.id, u.id); const rel = relationOf(m); const now = Date.now();
    const mine = st.crmLeads.filter(l => l.projectId === p.id && l.associateId === u.id);
    const showUnits = ['ACTIVE', 'PAUSED'].includes(rel);
    res.json({
      success: true,
      project: {
        id: p.id, projectName: p.projectName, builderName: p.builderName, tagline: p.tagline, city: p.city, locality: p.locality, status: p.status, projectStage: p.projectStage,
        priceStartingFrom: p.priceStartingFrom, priceMax: p.priceMax, unitConfigurations: p.unitConfigurations, amenities: p.amenities, completionTarget: p.completionTarget,
        availableUnits: p.availableUnits, totalUnits: p.totalUnits, defaultCommissionPct: p.channelPartnerCommissionPct,
        leadIntake: p.leadIntake || 'OPEN', intakeNote: p.intakeNote || '', leadVerification: p.leadVerification || 'AUTO', registrationDays: p.registrationDays || 60,
      },
      relation: rel, statusReason: m?.statusReason, mandateId: m?.id,
      terms: m && ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(rel) ? { commissionPct: m.agreedCommissionPct, quota: m.targetUnitsQuota, sold: m.unitsSold, dailyLeadCap: m.dailyLeadCap, validUntil: m.validUntil, history: m.termsHistory || [] } : undefined,
      updates: st.projectUpdates.filter(x => x.projectId === p.id && audienceOk(x.audience, rel) && (!x.validUntil || Date.parse(x.validUntil) + 86400000 > now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      collateral: (p.collateral || []).filter(c => audienceOk(c.audience, rel)),
      units: unitCounts(p.id),
      // same rules as the unit grid: units the builder hid stay hidden, a hidden rate shows as "price on request"
      availableUnits_list: showUnits ? availableUnitsForPartner(p, u, 300).map(x => ({ id: x.id, label: x.label, group: x.group, config: x.config, floor: x.floor, areaSqft: x.areaSqft, dimensions: x.dimensions, price: x.price, priceHidden: x.priceHidden, ratePerSqft: x.ratePerSqft, facing: x.facing, roadSides: x.roadSides, roadWidthFt: x.roadWidthFt, features: x.features, note: x.note })) : [],
      leads: mine.map(l => ({ id: l.id, name: l.name, stage: l.stage, verify: l.verify, nextFollowUpAt: l.nextFollowUpAt, assignedMemberName: l.assignedMemberName, unitInterest: l.unitInterest, updatedAt: l.updatedAt, protectedUntil: l.protectedUntil })),
      shortlist: st.projectShortlists.filter(s => s.ownerId === u.id && s.projectId === p.id && s.status !== 'DROPPED').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      bookings: st.crmBookings.filter(b => b.projectId === p.id && b.associateId === u.id).map(b => ({ id: b.id, customerName: b.customerName, unitNo: b.unitNo, status: b.status, agreementValue: b.agreementValue, brokerageAmount: b.brokerageAmount })),
    });
  });

  r.post('/partner/projects/:id/apply', partnerOnly, rateLimit('pc-apply', 20, 24 * 3600_000), (req, res) => {
    const u = me(); const st = state();
    const p = db.byId('builderProjects', req.params.id);
    if (!p || !visibleTo(p, u.id)) return bad(res, 'Project not found', 404);
    if (u.verificationStatus !== 'VERIFIED') return bad(res, 'Your account must be KYC-verified to apply', 403);
    if (!VISIBLE_STATUS.includes(p.status)) return bad(res, 'This project is not taking new partners', 409);
    if ((p.access || 'OPEN_APPLY') === 'INVITE_ONLY') return bad(res, 'This project is invite-only', 403);
    const note = String(req.body?.note || '').trim().slice(0, 300);
    const ex = myMandate(p.id, u.id);
    if (ex) {
      if (ex.status === 'DECLINED' && ex.decidedAt && Date.now() - Date.parse(ex.decidedAt) > 30 * 86400000) { ex.status = 'APPLIED'; ex.appliedNote = note; ex.statusReason = undefined; ex.assignedAt = nowIso(); db.save(); return res.json({ success: true, relation: 'APPLIED' }); }
      return bad(res, ex.status === 'DECLINED' ? 'The builder declined your request recently — you can apply again after 30 days' : `You already have a ${relationOf(ex).toLowerCase()} request / partnership on this project`, 409);
    }
    const m: SalesAssociateMandate = {
      id: mandateSeq(), projectId: p.id, projectName: p.projectName, builderId: p.builderId, builderName: p.builderName,
      brokerId: u.id, brokerName: u.name, brokerCompany: u.companyName || 'Independent Broker', brokerReraNumber: u.reraNumber,
      agreedCommissionPct: p.channelPartnerCommissionPct, targetUnitsQuota: 5, unitsSold: 0, grossSalesDelivered: 0, commissionEarned: 0, commissionPaid: false,
      marketingKitAccess: false, status: 'APPLIED', assignedAt: nowIso(), appliedNote: note,
    };
    st.associateMandates.unshift(m); db.save();
    audit('DEAL', m.id, 'PARTNER_APPLIED', `${u.name} applied to partner on ${p.projectName}${note ? `: ${note.slice(0, 100)}` : ''}`);
    res.json({ success: true, relation: 'APPLIED' });
  });

  // ── shortlist ──
  const shortlistSchema = z.object({
    clientId: z.string().max(60).optional(),
    clientName: z.string().trim().min(2).max(120).optional(),
    units: z.array(z.string().trim().min(1).max(20)).max(10).default([]),
    note: z.string().trim().max(300).default(''),
  });

  r.get('/partner/shortlist', partnerOnly, (_req, res) => {
    res.json({ success: true, shortlist: state().projectShortlists.filter(s => s.ownerId === me().id && s.status !== 'DROPPED') });
  });
  r.get('/partner/clients', partnerOnly, (_req, res) => {
    res.json({ success: true, clients: state().clientCards.filter(c => c.brokerId === me().id && !['CLOSED', 'LOST'].includes(String(c.stage))).map(c => ({ id: c.id, name: c.name, budgetMax: c.budgetMax, city: c.city, stage: c.stage })) });
  });

  r.post('/partner/projects/:id/shortlist', partnerOnly, rateLimit('pc-short', 200, 24 * 3600_000), (req, res) => {
    const u = me(); const st = state();
    const p = db.byId('builderProjects', req.params.id);
    if (!p || !visibleTo(p, u.id)) return bad(res, 'Project not found', 404);
    const parsed = shortlistSchema.safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid shortlist');
    const d = parsed.data;
    let name = d.clientName || ''; let clientId: string | undefined;
    if (d.clientId) {
      const c = st.clientCards.find(x => x.id === d.clientId && x.brokerId === u.id);
      if (!c) return bad(res, 'Client not found', 404);
      clientId = c.id; name = c.name;
    }
    if (!name) return bad(res, 'Pick a client or type a name');
    if (st.projectShortlists.filter(s => s.ownerId === u.id && s.status !== 'DROPPED').length >= 300) return bad(res, 'Shortlist limit (300) reached', 409);
    const key = (clientId || name.toLowerCase());
    if (st.projectShortlists.some(s => s.ownerId === u.id && s.projectId === p.id && s.status !== 'DROPPED' && (s.clientId || s.clientName.toLowerCase()) === key)) return bad(res, 'This client is already on your shortlist for this project', 409);
    const ts = nowIso();
    const s: ProjectShortlist = { id: uid('SL'), ownerId: u.id, projectId: p.id, projectName: p.projectName, clientId, clientName: name, units: d.units, note: d.note, status: 'SHORTLISTED', createdAt: ts, updatedAt: ts };
    st.projectShortlists.unshift(s); db.save();
    res.json({ success: true, shortlist: s });
  });

  const myShortlist = (id: string) => state().projectShortlists.find(s => s.id === id && s.ownerId === me().id);
  r.put('/partner/shortlist/:sid', partnerOnly, (req, res) => {
    const s = myShortlist(req.params.sid);
    if (!s) return bad(res, 'Not found', 404);
    const parsed = shortlistSchema.pick({ units: true, note: true }).partial().safeParse(req.body);
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid');
    if (parsed.data.units) s.units = parsed.data.units;
    if (parsed.data.note !== undefined) s.note = parsed.data.note;
    s.updatedAt = nowIso(); db.save();
    res.json({ success: true, shortlist: s });
  });
  r.delete('/partner/shortlist/:sid', partnerOnly, (req, res) => {
    const s = myShortlist(req.params.sid);
    if (!s) return bad(res, 'Not found', 404);
    s.status = 'DROPPED'; s.updatedAt = nowIso(); db.save();
    res.json({ success: true });
  });

  r.post('/partner/shortlist/:sid/register', partnerOnly, (req, res) => {
    const u = me(); const st = state();
    const s = myShortlist(req.params.sid);
    if (!s || s.status === 'DROPPED') return bad(res, 'Not found', 404);
    if (s.status === 'LEAD_REGISTERED') return bad(res, 'Already registered as a lead', 409);
    const card = s.clientId ? st.clientCards.find(c => c.id === s.clientId && c.brokerId === u.id) : undefined;
    const phone = String(req.body?.phone || card?.phone || '');
    if (!card && digits(phone).length < 10) return bad(res, 'Enter the client\'s 10-digit mobile number');
    const input = leadCreateSchema.safeParse({
      projectId: s.projectId, name: s.clientName, phone, source: 'ASSOCIATE_REFERRAL',
      unitInterest: s.units.join(', ') || String(req.body?.unitInterest || ''),
      budgetMax: card?.budgetMax && card.budgetMax > 0 ? card.budgetMax : undefined,
      budgetMin: card?.budgetMin && card.budgetMin > 0 ? card.budgetMin : undefined,
      note: s.note ? `From shortlist: ${s.note}` : 'From project shortlist',
      consent: req.body?.consent === true ? true : undefined,
    });
    if (!input.success) return bad(res, input.error.issues[0]?.message || 'Invalid details');
    const out = registerLead(u, input.data, { shortlistId: s.id, via: 'SHORTLIST' });
    if (out.status !== 200) return res.status(out.status).json(out.body);
    s.status = 'LEAD_REGISTERED'; s.leadId = out.body.lead.id; s.updatedAt = nowIso(); db.save();
    res.json({ success: true, lead: out.body.lead, shortlist: s });
  });

  // ═══════════════════════ EMPLOYER — staff lead control ═══════════════════════
  const teamGate = needs('team:manage');
  /** brokers and builders only — an admin has no team of their own to control */
  const employerOnly = (req: Request, res: Response, next: () => void) => {
    teamGate(req, res, () => (['BROKER', 'DEVELOPER_BUILDER'].includes(me().role) ? next() : bad(res, 'Only a broker or builder manages a team', 403)));
  };
  const myMember = (id: string) => membersOf(me().id).find(m => m.id === id);

  r.get('/team/control', employerOnly, (_req, res) => {
    const u = me(); const st = state(); const today = startOfDayMs(); const wk = Date.now() - 7 * 86400000;
    const mine = st.crmLeads.filter(l => ownerIdOf(l) === u.id);
    const members = membersOf(u.id).map(m => {
      const rev = st.leadReveals.filter(x => x.userId === m.id);
      return {
        id: m.id, name: m.name, title: m.teamTitle, status: m.verificationStatus, policy: policyOf(m),
        card: staffCard(m.id, mine as any),
        revealsToday: rev.filter(x => Date.parse(x.at) >= today).length, reveals7d: rev.filter(x => Date.parse(x.at) >= wk).length,
      };
    });
    const projects = (u.role === 'DEVELOPER_BUILDER' ? st.builderProjects.filter(p => p.builderId === u.id) : st.builderProjects.filter(p => myProjectIds(u).includes(p.id))).map(p => ({ id: p.id, name: p.projectName }));
    res.json({ success: true, routing: u.leadRouting?.mode || 'OFF', pool: poolFor(u.id).length, members, projects, canVerifyEnabled: u.role === 'DEVELOPER_BUILDER' });
  });

  r.put('/team/routing', employerOnly, (req, res) => {
    const u = me(); const mode = req.body?.mode;
    if (!['OFF', 'ROUND_ROBIN', 'LEAST_LOADED'].includes(mode)) return bad(res, 'Mode must be OFF, ROUND_ROBIN or LEAST_LOADED');
    u.leadRouting = { mode, cursor: u.leadRouting?.cursor || 0 }; db.save();
    audit('LEAD', u.id, 'LEAD_ROUTING_SET', `${u.name} set new-lead routing to ${mode}`);
    res.json({ success: true });
  });

  r.put('/team/:id/policy', employerOnly, (req, res) => {
    const u = me(); const m = myMember(req.params.id);
    if (!m) return bad(res, 'Team member not found', 404);
    const clean = cleanPolicy(req.body || {}, policyOf(m));
    if (typeof clean === 'string') return bad(res, clean);
    if (clean.canVerify && u.role !== 'DEVELOPER_BUILDER') return bad(res, 'Only a builder can let staff verify partner leads');
    if (clean.canScanVisits && u.role !== 'DEVELOPER_BUILDER') return bad(res, 'Only a builder can let staff scan visit QR passes (a partner\'s staff cannot verify their own visits)');
    const mine = new Set(u.role === 'DEVELOPER_BUILDER' ? state().builderProjects.filter(p => p.builderId === u.id).map(p => p.id) : state().associateMandates.filter(x => x.brokerId === u.id).map(x => x.projectId));
    if (clean.projectIds.some(id => !mine.has(id))) return bad(res, 'Pick only your own projects');
    const prev = policyOf(m);
    m.teamPolicy = clean;
    let handed = 0;
    if (clean.onLeave && !prev.onLeave) handed = releaseMemberLeads(u, m, u.id, u.name);
    db.save();
    audit('VERIFICATION', m.id, 'TEAM_POLICY_SET', `${u.name} set ${m.name}: phone ${clean.phoneMode}${clean.phoneMode === 'REVEAL' ? `/${clean.revealCap}/day` : ''}, scope ${clean.scope}${clean.projectIds.length ? ` [${clean.projectIds.join(',')}]` : ''}, register ${clean.canRegister}, claim ${clean.canClaim}, mark-lost ${clean.canMarkLost}, forward ${clean.canForward}, request-booking ${clean.canRequestBooking}, collect-money ${clean.canCollectMoney}, confirm-money ${clean.canConfirmMoney}, units ${clean.invMode}${clean.invMode !== 'OFF' ? ` (price ${clean.invPrice}, features ${clean.invFeatures}, share-out ${clean.invShareOut})` : ''}, verify ${clean.canVerify}, cap ${clean.maxOpenLeads ?? '∞'}, leave ${clean.onLeave}${handed ? `; ${handed} open lead(s) handed back` : ''}`);
    res.json({ success: true, policy: clean, handedBack: handed });
  });

  r.post('/team/handover', employerOnly, (req, res) => {
    const u = me(); const from = myMember(String(req.body?.fromMemberId || ''));
    if (!from) return bad(res, 'Team member not found', 404);
    const toId = req.body?.toMemberId ? String(req.body.toMemberId) : null;
    if (toId && !membersOf(u.id).some(m => m.id === toId && m.verificationStatus === 'VERIFIED' && m.id !== from.id)) return bad(res, 'Pick another active team member');
    const n = releaseMemberLeads(u, from, u.id, u.name, toId);
    db.save();
    audit('LEAD', from.id, 'LEADS_HANDED_OVER', `${u.name} handed ${n} open lead(s) of ${from.name} to ${toId ? membersOf(u.id).find(m => m.id === toId)?.name : 'the pool / routing'}`);
    res.json({ success: true, moved: n });
  });

  r.post('/team/bulk-allot', employerOnly, (req, res) => {
    const u = me(); const st = state();
    const ids: string[] = Array.isArray(req.body?.leadIds) ? req.body.leadIds.map(String).slice(0, 100) : [];
    if (!ids.length) return bad(res, 'Select at least one lead');
    const memberId = req.body?.memberId ? String(req.body.memberId) : '';
    const to = memberId ? myMember(memberId) : undefined;
    if (memberId && (!to || to.verificationStatus !== 'VERIFIED')) return bad(res, 'Pick one of your active team members');
    let n = 0;
    for (const l of st.crmLeads.filter(x => ids.includes(x.id) && ownerIdOf(x) === u.id && isOpen(x) && x.stage !== 'BOOKING_REQUESTED')) {
      const prev = l.assignedMemberName;
      l.assignedMemberId = to?.id; l.assignedMemberName = to?.name; l.updatedAt = nowIso();
      l.activities.unshift({ id: uid('A'), type: 'SYSTEM', note: to ? `Allotted to ${to.name}${prev ? ` (was ${prev})` : ''}` : `Taken back from ${prev || 'team'}`, byUserId: u.id, byName: u.name, at: nowIso() });
      n++;
    }
    db.save();
    audit('LEAD', u.id, 'LEADS_BULK_ALLOTTED', `${u.name} ${to ? `allotted ${n} lead(s) to ${to.name}` : `took back ${n} lead(s)`}`);
    res.json({ success: true, moved: n });
  });

  r.get('/team/reveals', employerOnly, (_req, res) => {
    res.json({ success: true, reveals: state().leadReveals.filter(x => x.employerId === me().id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100) });
  });

  // ═══════════════════════ STAFF ═══════════════════════
  const staffOnly = (req: Request, res: Response, next: () => void) => {
    const u = me();
    if (u.role !== 'TEAM_MEMBER') return bad(res, 'Only team members use this', 403);
    next();
  };

  r.post('/leads/:id/reveal', needs('pcontrol:staff'), staffOnly, rateLimit('pc-reveal', 200, 24 * 3600_000), (req, res) => {
    const u = me(); const st = state();
    const pol = policyOf(u);
    const l = leadsForMember(u).find(x => x.id === req.params.id);
    if (!l) return bad(res, 'Lead not found', 404);
    if (pol.phoneMode === 'HIDDEN') return bad(res, 'Your employer has not allowed you to see customer numbers', 403);
    if (pol.phoneMode === 'FULL') return res.json({ success: true, phone: l.phone });
    if (l.assignedMemberId !== u.id) return bad(res, 'You can reveal the number only of leads allotted to you', 403);
    const today = st.leadReveals.filter(x => x.userId === u.id && Date.parse(x.at) >= startOfDayMs());
    if (!today.some(x => x.leadId === l.id) && today.length >= pol.revealCap) return bad(res, `Daily limit of ${pol.revealCap} number reveals reached — ask your employer`, 429);
    if (!today.some(x => x.leadId === l.id)) {
      st.leadReveals.unshift({ id: uid('RV'), employerId: u.employerId!, userId: u.id, userName: u.name, leadId: l.id, at: nowIso() });
      if (st.leadReveals.length > 5000) st.leadReveals.length = 5000;
      db.save();
      audit('LEAD', l.id, 'CRM_PHONE_REVEALED', `${u.name} revealed the number of ${l.name} (${l.projectName})`);
    }
    res.json({ success: true, phone: l.phone });
  });

  r.get('/staff/pool', needs('pcontrol:staff'), staffOnly, (_req, res) => {
    const u = me(); const pol = policyOf(u);
    if (!pol.canClaim) return res.json({ success: true, enabled: false, leads: [] });
    const leads = poolFor(u.employerId!).filter(l => pol.projectIds.length === 0 || pol.projectIds.includes(l.projectId))
      .map(l => ({ id: l.id, name: l.name, projectName: l.projectName, stage: l.stage, unitInterest: l.unitInterest, createdAt: l.createdAt, phone: '••••••••' + l.phone.replace(/\D/g, '').slice(-2) }));
    res.json({ success: true, enabled: true, leads, open: openLoad(u.id), cap: pol.maxOpenLeads ?? 50 });
  });

  r.post('/staff/claim', needs('pcontrol:staff'), staffOnly, (req, res) => {
    const u = me(); const pol = policyOf(u);
    if (!pol.canClaim) return bad(res, 'Your employer has not enabled lead claiming for you', 403);
    if (pol.onLeave) return bad(res, 'You are marked on leave', 403);
    const cap = pol.maxOpenLeads ?? 50;
    if (openLoad(u.id) >= cap) return bad(res, `You already hold ${cap} open leads — close some first`, 409);
    const l = poolFor(u.employerId!).find(x => x.id === String(req.body?.leadId || '') && (pol.projectIds.length === 0 || pol.projectIds.includes(x.projectId)));
    if (!l) return bad(res, 'This lead is no longer available', 409);
    l.assignedMemberId = u.id; l.assignedMemberName = u.name; l.updatedAt = nowIso();
    l.activities.unshift({ id: uid('A'), type: 'SYSTEM', note: `Allotted to ${u.name} (claimed from pool)`, byUserId: u.id, byName: u.name, at: nowIso() });
    db.save();
    audit('LEAD', l.id, 'CRM_LEAD_CLAIMED', `${u.name} claimed ${l.name} from the pool`);
    res.json({ success: true, lead: maskLeadForViewer(l, u) });
  });

  return r;
}
