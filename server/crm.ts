/**
 * Builder ⇄ Associates CRM
 * ----------------------------------------------------------------------------
 * Lead → follow-ups → site visit → negotiation → booking request → builder approval
 * → payment schedule → associate brokerage (pro-rata with collections) → payout.
 *
 * Design rules (what makes this a *channel-partner* CRM and not a plain lead list):
 *  1. Registration protection — a customer (phone) can be registered once per project while the
 *     protection window is open; a second associate gets a conflict, never the first one's data.
 *  2. Attribution is immutable — the associate on the lead is the associate on the booking; the
 *     builder approves/rejects but cannot silently re-attribute a protected lead (only an audited re-assign).
 *  3. Bookings need evidence — a lead must have reached SITE_VISITED before a booking can be requested,
 *     and a unit number can only be held once per project.
 *  4. Money moves with collections — brokerage becomes payable in proportion to the share of the
 *     agreement value actually collected from the customer.
 *  5. Scope — a builder sees only own projects; an associate sees only own leads/bookings; admins see all (phones masked).
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { chargeEvent, cancelCharges } from './billing.js';
/** v23: projects under a signed / LOI master-CP agreement — GENZ already earns from the builder there, so no booking fee */
const onMasterCp = (projectId: string) => (db.getState().masterCpAgreements || []).some(a => (a.status === 'SIGNED' || a.status === 'LOI') && a.projectIds.includes(projectId));
import type { BuilderProject, SalesAssociateMandate, UserProfile } from './db.js';
import { needsVisitProof } from '../src/shared/visitRules.js';
import { policyOf, mandateIsActive, startOfDayMs, verifyDueAt } from '../src/shared/pcontrolRules.js';
import { autoAssign, leadsForMember, maskLeadForViewer } from './leadflow.js';
import { ctx, needs } from './auth.js';
import { isAdmin, isSuper } from './access.js';
import { maskPhoneNumber, phoneSchema, bonusSchemeSchema } from './validation.js';
import { computeBonus, type BonusScheme } from '../src/shared/bonus.js';
import { digits } from './auth.js';
import { checkBookingUnit, unitBookingRequested, unitBookingDecided } from './inventory.js';
import { commissionPctFor } from '../src/shared/slabs.js';
import { openTrailOn, closeOpenTrails } from '../src/shared/moneyTrail.js';
import { AUTO_FOLLOWUP, LOST_CODES, lostCodeOk, TEMPERATURES, MAX_TAGS, isStale, lastActivityAt, protectionDaysLeft, effectiveTdsPct, isOpenStage } from '../src/shared/crmRules.js';
import {
  LEAD_SOURCE_IDS, cleanProfile, profileCompleteness, callStats, PLAN_TYPE_IDS, TOKEN_MODES, FUNDINGS, scheduleError, MAX_SCHEDULE_LINES,
  type LeadProfile, type BookingPlan,
} from '../src/shared/crmSales.js';
import type {
  CrmLead, CrmBooking, CrmLeadStage, CrmActivityType, CrmPaymentMilestone, CrmLeadSource,
} from '../src/types/crm.js';

const REGISTRATION_VALIDITY_DAYS = 60;

// ───────────────────────── shared with the Builder Launchpad ─────────────────────────
export function applyAssociateSale(
  mandate: SalesAssociateMandate,
  project: BuilderProject,
  saleValue: number,
  commissionPct?: number
): { commission: number } | { error: string; status: number } {
  if (!Number.isFinite(saleValue) || saleValue <= 0) {
    return { error: 'Valid positive booking sale value is required', status: 400 };
  }
  // a booking requested before a pause / expiry is still honoured (attribution is immutable); revoked or never-approved mandates are not
  if (!['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED', 'COMPLETED'].includes(mandate.status)) {
    return { error: `Mandate is ${mandate.status.toLowerCase().replace('_', ' ')} — bookings cannot be recorded against it`, status: 409 };
  }
  if (project.availableUnits <= 0 || project.status === 'SOLD_OUT' || project.status === 'ARCHIVED') {
    return { error: 'This project has no units available', status: 409 };
  }
  if (saleValue < project.priceStartingFrom * 0.5 || saleValue > project.priceMax * 2) {
    return { error: 'Sale value is outside the plausible price range for this project', status: 400 };
  }

  const commission = Math.round(saleValue * ((commissionPct ?? mandate.agreedCommissionPct) / 100));
  mandate.unitsSold = (mandate.unitsSold || 0) + 1;
  mandate.grossSalesDelivered = (mandate.grossSalesDelivered || 0) + saleValue;
  mandate.commissionEarned = (mandate.commissionEarned || 0) + commission;
  if (mandate.unitsSold >= 3) mandate.status = 'TOP_PERFORMER';

  project.totalBookingsGenerated = (project.totalBookingsGenerated || 0) + 1;
  project.totalSalesVolumeDelivered = (project.totalSalesVolumeDelivered || 0) + saleValue;
  project.availableUnits -= 1;
  if (project.availableUnits === 0) project.status = 'SOLD_OUT';
  project.updatedAt = new Date().toISOString();
  return { commission };
}

function reverseAssociateSale(mandate: SalesAssociateMandate | undefined, project: BuilderProject, saleValue: number, commission: number) {
  if (mandate) {
    mandate.unitsSold = Math.max(0, (mandate.unitsSold || 0) - 1);
    mandate.grossSalesDelivered = Math.max(0, (mandate.grossSalesDelivered || 0) - saleValue);
    mandate.commissionEarned = Math.max(0, (mandate.commissionEarned || 0) - commission);
    if (mandate.status === 'TOP_PERFORMER' && mandate.unitsSold < 3) mandate.status = 'ACTIVE_ASSOCIATE';
  }
  project.totalBookingsGenerated = Math.max(0, (project.totalBookingsGenerated || 0) - 1);
  project.totalSalesVolumeDelivered = Math.max(0, (project.totalSalesVolumeDelivered || 0) - saleValue);
  project.availableUnits = Math.min(project.totalUnits, project.availableUnits + 1);
  if (project.status === 'SOLD_OUT' && project.availableUnits > 0) project.status = 'ACTIVE_LAUNCH';
  project.updatedAt = new Date().toISOString();
}

// ───────────────────────── schemas ─────────────────────────
/** An optional "customer details" object, cleaned by the shared rules (unknown keys / bad values are refused with a clear message). */
function profileField() {
  return z.unknown().optional().transform((v, c): LeadProfile | undefined => {
    if (v === undefined) return undefined;
    const r = cleanProfile(v);
    if (typeof r === 'string') { c.addIssue({ code: 'custom', message: r }); return z.NEVER; }
    return Object.keys(r).length ? r : undefined;
  });
}
export const leadCreateSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(2, 'Customer name is required').max(120),
  phone: phoneSchema,
  email: z.union([z.literal(''), z.string().trim().email().max(200)]).optional(),
  source: z.enum(LEAD_SOURCE_IDS as [CrmLeadSource, ...CrmLeadSource[]]).default('ASSOCIATE_REFERRAL'),
  /** v16.7 — campaign / portal / referrer name that goes with the source */
  sourceDetail: z.string().trim().max(100).optional(),
  /** v16.7 — what the salesperson already knows about the customer (strictly validated, see cleanProfile) */
  profile: profileField(),
  budgetMin: z.number().positive().max(100_000_000_000).optional(),
  budgetMax: z.number().positive().max(100_000_000_000).optional(),
  unitInterest: z.string().trim().max(160).optional(),
  /** builder / admin registering on behalf of an associate */
  associateId: z.string().optional(),
  note: z.string().trim().max(1000).optional(),
  /** DPDP: the customer agreed to be contacted about this project (the registering user attests) */
  consent: z.literal(true, { message: 'Confirm that the customer agreed to be contacted' }),
});

const leadPatchSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]),
  budgetMin: z.number().positive().max(100_000_000_000),
  budgetMax: z.number().positive().max(100_000_000_000),
  unitInterest: z.string().trim().max(160),
  temperature: z.enum(TEMPERATURES),
  tags: z.array(z.string().trim().min(1).max(20)).max(MAX_TAGS),
  source: z.enum(LEAD_SOURCE_IDS as [CrmLeadSource, ...CrmLeadSource[]]),
  sourceDetail: z.string().trim().max(100),
  profile: profileField(),
}).partial();

const ACTIVITY_TYPES: CrmActivityType[] = ['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT', 'NOTE'];
const FORWARD_STAGES: CrmLeadStage[] = ['NEW', 'CONTACTED', 'SITE_VISIT_SCHEDULED', 'SITE_VISITED', 'NEGOTIATION'];

const MONEY_MAX = 100_000_000_000;
const planSchema = z.object({
  planType: z.enum(PLAN_TYPE_IDS as [string, ...string[]]),
  funding: z.enum(FUNDINGS.map(f => f.id) as [string, ...string[]]).optional(),
  bank: z.string().trim().max(60).optional(),
  loanAmount: z.number().positive().max(MONEY_MAX).optional(),
  conditions: z.string().trim().max(500).optional(),
  schedule: z.array(z.object({ name: z.string().trim().min(2).max(80), pct: z.number().positive().max(100), dueInDays: z.number().int().min(0).max(1500) })).max(MAX_SCHEDULE_LINES).optional(),
  discountAsked: z.number().nonnegative().max(MONEY_MAX).optional(),
  expectedRegistryBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31').optional(),
}).strict();

const bookingRequestSchema = z.object({
  unitNo: z.string().trim().min(1, 'Unit / plot number is required').max(40),
  unitConfig: z.string().trim().max(160).optional(),
  agreementValue: z.number().positive().max(MONEY_MAX),
  /** the booking amount the customer says they have paid (can be 0 — then no token is claimed) */
  tokenAmount: z.number().nonnegative().max(MONEY_MAX),
  tokenMode: z.enum(TOKEN_MODES.map(m => m.id) as [string, ...string[]]).optional(),
  tokenRef: z.string().trim().max(60).optional(),
  tokenPaidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14').optional(),
  plan: planSchema.optional(),
  coApplicantName: z.string().trim().max(100).optional(),
  note: z.string().trim().max(1000).optional(),
});

const scheduleSchema = z.array(z.object({
  name: z.string().trim().min(2).max(80),
  pct: z.number().positive().max(100),
  dueInDays: z.number().int().min(0).max(1500),
})).min(1).max(12);

// ───────────────────────── helpers ─────────────────────────
export const nowIso = () => new Date().toISOString();

export function nextId(prefix: string, ids: string[]) {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = ids.reduce((m, id) => Math.max(m, Number(re.exec(id)?.[1] ?? 0)), 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function buildSchedule(agreementValue: number, tokenAmount: number, template?: z.infer<typeof scheduleSchema>): CrmPaymentMilestone[] {
  const t = template ?? [
    { name: 'Booking amount', pct: 10, dueInDays: 0 },
    { name: 'Within 30 days (agreement)', pct: 20, dueInDays: 30 },
    { name: 'On development / structure milestone', pct: 40, dueInDays: 150 },
    { name: 'On registry / possession', pct: 30, dueInDays: 300 },
  ];
  const total = t.reduce((a, m) => a + m.pct, 0);
  const sched = t.map((m, i) => ({
    id: `PM-${Date.now().toString(36)}-${i + 1}`,
    name: m.name,
    pct: m.pct,
    amount: Math.round((agreementValue * m.pct) / total),
    dueDate: new Date(Date.now() + m.dueInDays * 86400000).toISOString(),
    paid: false,
  } as CrmPaymentMilestone));
  // rounding fix on the last line so the schedule sums exactly to the agreement value
  const diff = agreementValue - sched.reduce((a, m) => a + m.amount, 0);
  sched[sched.length - 1].amount += diff;
  // token already received counts towards the first milestone
  if (tokenAmount > 0 && sched[0]) {
    if (tokenAmount >= sched[0].amount) {
      sched[0].paid = true;
      sched[0].paidAt = nowIso();
      sched[0].receiptNo = 'TOKEN';
    }
  }
  return sched;
}

/** money received on a milestone: the sum of live (non-reversed) receipts, or the full amount on older records marked paid */
export function paidOf(m: CrmPaymentMilestone): number {
  if (m.paidAmount !== undefined) return Math.min(m.amount, m.paidAmount);
  return m.paid ? m.amount : 0;
}

export function collectedPct(b: CrmBooking) {
  const total = b.paymentSchedule.reduce((a, m) => a + m.amount, 0) || 1;
  const paid = b.paymentSchedule.reduce((a, m) => a + paidOf(m), 0);
  return { collected: paid, total, pct: Math.min(100, (paid / total) * 100) };
}

export function payableBrokerage(b: CrmBooking) {
  if (b.status !== 'APPROVED') return 0;
  const { pct } = collectedPct(b);
  return Math.max(0, Math.round((b.brokerageAmount * pct) / 100) - b.brokeragePaidAmount);
}

export function viewLead(l0: CrmLead, user: { id: string; role: string }) {
  const cs = callStats(l0); const dc = profileCompleteness(l0); const lastHo = (l0.handoffs || [])[0];
  const l: CrmLead = {
    ...l0, stale: isStale(l0), protectionDaysLeft: isOpenStage(l0.stage) ? protectionDaysLeft(l0) : undefined, lastActivityAt: lastActivityAt(l0),
    callAttempts: cs.attempts, callsConnected: cs.connected, lastCallOutcome: cs.lastOutcome, lastCallAt: cs.lastAt, detailsFilled: dc.filled, detailsTotal: dc.total,
    forwardUnseen: !!(lastHo && !lastHo.seenAt && l0.assignedMemberId === lastHo.toId && isOpenStage(l0.stage)),
  };
  // which other projects the customer is looking at is the associate's own business: the builder (and the platform) never see it
  if (l0.associateId && l.profile?.competitors && (user.role === 'DEVELOPER_BUILDER' || isAdmin(user as any))) { const { competitors: _hidden, ...rest } = l.profile; l.profile = Object.keys(rest).length ? rest : undefined; }
  // admins oversee but don't get raw customer phone numbers; employees see numbers as their employer's policy allows
  if (user.role === 'TEAM_MEMBER') {
    const pol = policyOf(db.byId('users', user.id));
    return { ...maskLeadForViewer(l, user as any), memberCan: { forward: !!pol.canForward, requestBooking: !!pol.canRequestBooking } };
  }
  return isAdmin(user as any) && !isSuper(user as any) ? { ...l, phone: maskPhoneNumber(l.phone) } : l;
}

/** What an employee may see of a booking: the unit, the plan and the booking-amount status — never brokerage, payouts, TDS or the collection ledger. */
export function bookingForMember(b: CrmBooking, memberId: string) {
  const mine = b.requestedBy?.id === memberId;
  return {
    id: b.id, leadId: b.leadId, projectName: b.projectName, customerName: b.customerName, unitNo: b.unitNo, unitConfig: b.unitConfig, status: b.status, direct: b.direct,
    ...(mine ? { agreementValue: b.agreementValue } : {}), tokenAmount: b.tokenAmount, token: b.token, plan: b.plan, coApplicantName: b.coApplicantName, requestedBy: b.requestedBy,
    decisionNote: b.decisionNote, createdAt: b.createdAt, updatedAt: b.updatedAt, forMember: true as const,
  };
}

/** A sale by the builder's own desk: unit counters on the project move, but there is no associate mandate and no brokerage. */
function applyDirectSale(project: BuilderProject, saleValue: number): { ok: true } | { error: string; status: number } {
  if (!Number.isFinite(saleValue) || saleValue <= 0) return { error: 'Valid positive booking sale value is required', status: 400 };
  if (project.availableUnits <= 0 || project.status === 'SOLD_OUT' || project.status === 'ARCHIVED') return { error: 'This project has no units available', status: 409 };
  if (saleValue < project.priceStartingFrom * 0.5 || saleValue > project.priceMax * 2) return { error: 'Sale value is outside the plausible price range for this project', status: 400 };
  project.totalBookingsGenerated = (project.totalBookingsGenerated || 0) + 1;
  project.totalSalesVolumeDelivered = (project.totalSalesVolumeDelivered || 0) + saleValue;
  project.availableUnits -= 1;
  if (project.availableUnits === 0) project.status = 'SOLD_OUT';
  project.updatedAt = new Date().toISOString();
  return { ok: true };
}

/**
 * The builder says the booking amount arrived (or did not). RECEIVED spreads it over the first instalments as ordinary receipts,
 * exactly as if the builder had recorded them one by one — so collections, brokerage-payable and reversals keep working.
 * GENZ moves no money; this is the builder's word, recorded.
 */
export function confirmToken(booking: CrmBooking, user: { id: string; name: string }, received: boolean, note?: string, via?: { trailId?: string; receiptNo?: string }): { ok: true } | { error: string; status: number } {
  const t = booking.token;
  if (!t) return { error: 'No booking amount was claimed on this booking', status: 409 };
  if (t.status === 'RECEIVED') return { error: 'The booking amount is already confirmed', status: 409 };
  const ts = nowIso();
  if (received) {
    if (booking.status !== 'APPROVED') return { error: 'Approve the booking first, then confirm that the booking amount arrived', status: 409 };
    let left = t.amount;
    for (const m of booking.paymentSchedule) {
      if (left <= 0) break;
      const pending = m.amount - paidOf(m); if (pending <= 0) continue;
      const amt = Math.min(left, pending); left -= amt;
      const rref = (via?.receiptNo && via.receiptNo.length >= 3 ? via.receiptNo : t.ref && t.ref.length >= 3 ? t.ref : 'TOKEN').slice(0, 40);
      m.receipts = [...(m.receipts || []), { id: `RC-${Date.now().toString(36)}-${m.id.slice(-2)}`, amount: amt, mode: (t.mode as any) || 'OTHER', ref: rref, at: ts, byId: user.id, byName: user.name, ...(via?.trailId ? { trailId: via.trailId } : {}) }];
      m.paidAmount = paidOf(m) + amt;
      if (m.paidAmount >= m.amount) { m.paid = true; m.paidAt = ts; m.receiptNo = rref; }
    }
  }
  booking.token = { ...t, status: received ? 'RECEIVED' : 'NOT_RECEIVED', confirmedAt: ts, confirmedByName: user.name, ...(note ? { note: String(note).slice(0, 200) } : {}) };
  booking.updatedAt = ts;
  return { ok: true };
}

export function viewBooking(b: CrmBooking) {
  const { collected, pct } = collectedPct(b);
  return { ...b, collectedAmount: collected, collectedPct: Math.round(pct * 10) / 10, payableBrokerage: payableBrokerage(b) };
}


export const regDays = (p: BuilderProject) => Math.min(180, Math.max(15, p.registrationDays || REGISTRATION_VALIDITY_DAYS));

/**
 * Register a lead for a project. Used by the CRM form, by "shortlist → register" and by tests.
 * Rules (v12): project intake switch, partner daily cap, mandate validity, per-project protection window,
 * builder verification mode, employee policy, auto-routing to staff.
 */
export function registerLead(worker: UserProfile, d: z.infer<typeof leadCreateSchema>, opts: { shortlistId?: string; via?: 'FORM' | 'IMPORT' | 'SHORTLIST' | 'API' } = {}): { status: number; body: any } {
  const fail = (status: number, error: string, code?: string) => ({ status, body: { error, ...(code ? { code } : {}) } });
  const state = db.getState();
  const emp = worker.role === 'TEAM_MEMBER' ? db.byId('users', worker.employerId) : worker;
  const user = (worker.role === 'TEAM_MEMBER' ? (emp && emp.verificationStatus === 'VERIFIED' ? emp : worker) : worker) as UserProfile; // an employee registers leads under the employer's name
  if (worker.role === 'TEAM_MEMBER' && user.id === worker.id) return fail(403, 'Your employer account is not active');
  if (d.budgetMin && d.budgetMax && d.budgetMax < d.budgetMin) return fail(400, 'Maximum budget must be ≥ minimum budget');
  const project = db.byId('builderProjects', d.projectId);
  if (!project) return fail(404, 'Project not found');
  if (project.status === 'ARCHIVED') return fail(409, 'Project is archived');
  if (worker.role === 'TEAM_MEMBER') {
    const pol = policyOf(worker);
    if (!pol.canRegister) return fail(403, 'Your employer has not allowed you to register new leads');
    if (pol.projectIds.length && !pol.projectIds.includes(project.id)) return fail(403, 'You are not assigned to this project');
  }

  // Who owns the lead?
  let associateId = '';
  let associateName = 'Builder desk';
  let mandateId: string | undefined;
  let mandate: SalesAssociateMandate | undefined;
  if (user.role === 'BROKER') {
    mandate = state.associateMandates.find(m => m.projectId === project.id && m.brokerId === user.id && mandateIsActive(m));
    if (!mandate) return fail(403, 'You are not an appointed sales associate for this project (or your partnership is paused / expired)');
    if (project.leadIntake === 'PAUSED') return fail(423, `The builder has paused new lead registrations for ${project.projectName}${project.intakeNote ? ` — ${project.intakeNote}` : ''}`, 'INTAKE_PAUSED');
    if (mandate.dailyLeadCap) {
      const today = startOfDayMs();
      const n = state.crmLeads.filter(l => l.mandateId === mandate!.id && Date.parse(l.createdAt) >= today).length;
      if (n >= mandate.dailyLeadCap) return fail(429, `Daily limit of ${mandate.dailyLeadCap} new leads for this project reached — try again tomorrow`, 'DAILY_CAP');
    }
    associateId = user.id; associateName = user.name; mandateId = mandate.id;
  } else if (user.role === 'DEVELOPER_BUILDER' || isSuper(user as any)) {
    if (user.role === 'DEVELOPER_BUILDER' && project.builderId !== user.id) return fail(403, 'Not your project');
    if (d.associateId) {
      mandate = state.associateMandates.find(m => m.projectId === project.id && m.brokerId === d.associateId && mandateIsActive(m));
      if (!mandate) return fail(400, 'That broker is not an active associate on this project');
      associateId = mandate.brokerId; associateName = mandate.brokerName; mandateId = mandate.id;
    }
  } else {
    return fail(403, 'Not permitted');
  }

  // Registration protection / duplicate detection
  const phoneKey = digits(d.phone);
  const now = Date.now();
  const clash = state.crmLeads.find(l =>
    l.projectId === project.id && l.phoneKey === phoneKey && l.verify !== 'REJECTED' &&
    (l.stage === 'BOOKED' || l.stage === 'BOOKING_REQUESTED' || (l.stage !== 'LOST' && Date.parse(l.protectedUntil) > now)));
  if (clash) {
    const builderView = user.role === 'DEVELOPER_BUILDER' || isAdmin(user as any);
    const detail = builderView
      ? ` Registered by ${clash.associateName || 'Builder desk'} on ${new Date(clash.createdAt).toLocaleDateString('en-IN')} (${clash.id}).`
      : '';
    return fail(409, `This customer is already registered for ${project.projectName} and is under registration protection until ${new Date(clash.protectedUntil).toLocaleDateString('en-IN')}.${detail}`, 'LEAD_DUPLICATE');
  }

  const id = nextId('CRM-L', state.crmLeads.map(l => l.id));
  const ts = nowIso();
  const manual = project.leadVerification === 'MANUAL' && user.role === 'BROKER';
  const lead: CrmLead = {
    id, projectId: project.id, projectName: project.projectName, builderId: project.builderId,
    associateId, associateName, mandateId,
    name: d.name, phone: d.phone, phoneKey, email: d.email || undefined, source: d.source, sourceDetail: d.sourceDetail || undefined, profile: d.profile,
    budgetMin: d.budgetMin, budgetMax: d.budgetMax,
    unitInterest: d.unitInterest || project.unitConfigurations[0] || '',
    stage: 'NEW', followUps: [],
    consent: { at: ts, byId: worker.id, byName: worker.name, via: opts.via || 'FORM' },
    activities: [{ id: `A-${Date.now().toString(36)}`, type: 'SYSTEM', note: d.note ? `Lead registered. ${d.note}` : 'Lead registered', byUserId: worker.id, byName: worker.name, at: ts }],
    assignedMemberId: worker.role === 'TEAM_MEMBER' ? worker.id : undefined,
    assignedMemberName: worker.role === 'TEAM_MEMBER' ? worker.name : undefined,
    protectedUntil: new Date(now + regDays(project) * 86400000).toISOString(),
    ...(manual ? { verify: 'PENDING' as const, verifyDueAt: verifyDueAt(now) } : {}),
    ...(opts.shortlistId ? { shortlistId: opts.shortlistId } : {}),
    createdAt: ts, updatedAt: ts,
  };
  if (worker.role !== 'TEAM_MEMBER') autoAssign(user, lead);
  state.crmLeads.unshift(lead);
  db.save();
  db.appendAuditEvent(worker.id, worker.role as any, 'LEAD', id, 'CRM_LEAD_REGISTERED', `Lead ${d.name} registered for ${project.projectName} by ${worker.role === 'TEAM_MEMBER' ? `${worker.name} (team of ${associateName})` : associateName} (protection until ${new Date(lead.protectedUntil).toLocaleDateString('en-IN')})${manual ? '; awaiting builder verification' : ''}${lead.assignedMemberName && worker.role !== 'TEAM_MEMBER' ? `; auto-allotted to ${lead.assignedMemberName}` : ''}`);
  return { status: 200, body: { success: true, lead: viewLead(lead, worker) } };
}



/** Suggest the next follow-up when a lead reaches a stage — unless an open follow-up already exists or the customer opted out. */
export function autoFollowUp(lead: CrmLead, stage: string, user: { id: string }) {
  const rule = AUTO_FOLLOWUP[stage];
  if (!rule || lead.optedOutAt || lead.followUps.some(f => !f.done)) return;
  const dueAt = new Date(Date.now() + rule.days * 86400000).toISOString();
  lead.followUps.push({ id: `FU-${Date.now().toString(36)}a`, dueAt, note: rule.note, channel: rule.channel, done: false, createdBy: user.id });
  lead.nextFollowUpAt = dueAt;
}

// ───────────────────────── shared scope helpers (also used by crm2.ts) ─────────────────────────
export type CrmUser = { id: string; name: string; role: string; verificationStatus: string };
export const currentUser = () => ctx().user as CrmUser;
export function leadsForUser(user: CrmUser): CrmLead[] {
  const all = db.getState().crmLeads;
  if (isAdmin(user as any)) return all;
  if (user.role === 'TEAM_MEMBER') return leadsForMember(db.byId('users', user.id) as UserProfile);
  if (user.role === 'DEVELOPER_BUILDER') return all.filter(l => l.builderId === user.id);
  return all.filter(l => l.associateId === user.id);
}
export function bookingsForUser(user: CrmUser): CrmBooking[] {
  const all = db.getState().crmBookings;
  if (isAdmin(user as any)) return all;
  if (user.role === 'TEAM_MEMBER') return []; // brokerage / agreement values are the employer's business
  if (user.role === 'DEVELOPER_BUILDER') return all.filter(b => b.builderId === user.id);
  return all.filter(b => b.associateId === user.id);
}
export const canWork = (user: CrmUser, l: CrmLead) => isSuper(user as any) || l.builderId === user.id || l.associateId === user.id || l.assignedMemberId === user.id;
export function auditCrm(action: string, entityId: string, details: string, entity: 'LEAD' | 'COMMISSION' = 'LEAD') {
  const u = currentUser();
  db.appendAuditEvent(u.id, u.role as any, entity, entityId, action, details);
}


/**
 * Cancel an approved booking. Money already collected can be refunded / forfeited (recorded — GENZ moves no money).
 * If brokerage was already paid out, the builder must state how much of it is clawed back (0 is allowed, but it must be said).
 */
export function cancelBooking(user: CrmUser, booking: CrmBooking, reasonIn: string, b: { refundAmount?: unknown; forfeitAmount?: unknown; clawbackAmount?: unknown; settlementNote?: unknown }): { status: number; body: any } {
  const state = db.getState();
  if (booking.status !== 'APPROVED') return { status: 409, body: { error: 'Only approved bookings can be cancelled' } };
  const reason = reasonIn.trim();
  if (reason.length < 5) return { status: 400, body: { error: 'A cancellation reason (min 5 chars) is required' } };
  const { collected } = collectedPct(booking);
  const num = (v: unknown) => (v === undefined || v === '' || v === null ? 0 : Math.round(Number(v)));
  const refund = num(b.refundAmount); const forfeit = num(b.forfeitAmount);
  if (![refund, forfeit].every(x => Number.isFinite(x) && x >= 0)) return { status: 400, body: { error: 'Refund / forfeit must be zero or a positive number' } };
  if (refund + forfeit > collected) return { status: 400, body: { error: `Refund + forfeit cannot exceed the ₹${collected.toLocaleString('en-IN')} collected so far` } };
  let clawback = 0;
  if (booking.brokeragePaidAmount > 0) {
    if (b.clawbackAmount === undefined || b.clawbackAmount === '' || b.clawbackAmount === null) return { status: 409, body: { error: `₹${booking.brokeragePaidAmount.toLocaleString('en-IN')} brokerage was already paid. State the amount to be taken back (clawbackAmount, 0 if none) before cancelling.`, code: 'CLAWBACK_REQUIRED' } };
    clawback = num(b.clawbackAmount);
    if (!Number.isFinite(clawback) || clawback < 0 || clawback > booking.brokeragePaidAmount) return { status: 400, body: { error: 'Clawback must be between 0 and the brokerage already paid' } };
  }
  const project = db.byId('builderProjects', booking.projectId);
  const mandate = db.byId('associateMandates', booking.mandateId);
  if (project) reverseAssociateSale(mandate, project, booking.agreementValue, booking.brokerageAmount);
  const ts = nowIso();
  booking.status = 'CANCELLED';
  cancelCharges('BUILDER_BOOKING', booking.id, `Booking ${booking.id} cancelled`);
  closeOpenTrails(booking.trails, { id: user.id, name: user.name, side: 'BUILDER_OWNER' }, `Booking cancelled — return this money to the customer`, ts);
  unitBookingDecided(booking.projectId, booking.unitNo, booking.id, 'RELEASED');
  booking.decisionNote = reason.slice(0, 500);
  booking.settlement = { refundAmount: refund, forfeitAmount: forfeit, clawbackAmount: clawback, clawbackStatus: clawback > 0 ? 'DUE' : 'NONE', note: String(b.settlementNote || '').slice(0, 300), at: ts };
  if (booking.cancelRequest?.status === 'OPEN') booking.cancelRequest.status = 'APPROVED';
  booking.updatedAt = ts;
  const lead = db.byId('crmLeads', booking.leadId);
  if (lead) {
    lead.stage = 'LOST'; lead.lostReason = `Booking cancelled: ${reason.slice(0, 200)}`; lead.lostCode = 'OTHER'; lead.bookingId = undefined; lead.updatedAt = ts;
  }
  db.save();
  auditCrm('CRM_BOOKING_CANCELLED', booking.id, `Booking ${booking.id} cancelled by ${user.name}: ${reason}. Refund ₹${refund.toLocaleString('en-IN')}, forfeit ₹${forfeit.toLocaleString('en-IN')}${clawback ? `, brokerage clawback ₹${clawback.toLocaleString('en-IN')} due` : ''}`, 'COMMISSION');
  return { status: 200, body: { success: true, booking: viewBooking(booking) } };
}

// ───────────────────────── router ─────────────────────────
export function createCrmRouter() {
  const r = Router();

  const me = currentUser;
  const leadsFor = leadsForUser;
  const bookingsFor = bookingsForUser;
  const findLead = (id: string, user: ReturnType<typeof me>) => leadsFor(user).find(l => l.id === id);
  const findBooking = (id: string, user: ReturnType<typeof me>) => bookingsFor(user).find(b => b.id === id);
  const audit = auditCrm;
  const canWorkLead = canWork;

  /** A TEAM_MEMBER acts on behalf of the employer (broker / builder) who allotted work to them. */
  const employerOf = (user: ReturnType<typeof me>) => {
    if (user.role !== 'TEAM_MEMBER') return user;
    const emp = db.getState().users.find(x => x.id === (db.byId('users', user.id)?.employerId));
    return emp && emp.verificationStatus === 'VERIFIED' ? (emp as unknown as ReturnType<typeof me>) : user;
  };

  r.use(needs('crm:read'));

  // ── overview ──
  r.get('/overview', (_req: Request, res: Response) => {
    const user = me();
    const leads = leadsFor(user);
    const bookings = bookingsFor(user);
    const now = Date.now();
    const byStage: Record<string, number> = {};
    leads.forEach(l => { byStage[l.stage] = (byStage[l.stage] || 0) + 1; });
    const overdue = leads.filter(l => !['BOOKED', 'LOST'].includes(l.stage) && l.followUps.some(f => !f.done && Date.parse(f.dueAt) < now)).length;
    const approved = bookings.filter(b => b.status === 'APPROVED');
    const decided = leads.filter(l => l.stage === 'BOOKED' || l.stage === 'LOST').length;
    res.json({
      success: true,
      overview: {
        totalLeads: leads.length,
        activeLeads: leads.filter(l => !['BOOKED', 'LOST'].includes(l.stage)).length,
        byStage,
        overdueFollowUps: overdue,
        pendingBookingRequests: bookings.filter(b => b.status === 'REQUESTED').length,
        approvedBookings: approved.length,
        salesValue: approved.reduce((a, b) => a + b.agreementValue, 0),
        collected: approved.reduce((a, b) => a + collectedPct(b).collected, 0),
        brokerageAccrued: approved.reduce((a, b) => a + b.brokerageAmount, 0),
        brokeragePayable: approved.reduce((a, b) => a + payableBrokerage(b), 0),
        brokeragePaid: approved.reduce((a, b) => a + b.brokeragePaidAmount, 0),
        conversionPct: decided ? Math.round((leads.filter(l => l.stage === 'BOOKED').length / decided) * 100) : 0,
        role: user.role,
        invMode: user.role === 'TEAM_MEMBER' ? policyOf(db.byId('users', user.id)).invMode : undefined,
        moneyTrail: user.role === 'TEAM_MEMBER' ? (() => { const p = policyOf(db.byId('users', user.id)); return { collect: !!p.canCollectMoney, confirm: !!p.canConfirmMoney }; })() : undefined,
      },
    });
  });

  // ── projects the user can register leads on ──
  r.get('/projects', (_req: Request, res: Response) => {
    const user = employerOf(me());
    const state = db.getState();
    let projects = state.builderProjects || [];
    let mandates = state.associateMandates || [];
    if (user.role === 'DEVELOPER_BUILDER') projects = projects.filter(p => p.builderId === user.id);
    else if (user.role === 'BROKER') {
      mandates = mandates.filter(m => m.brokerId === user.id && mandateIsActive(m));
      const ids = new Set(mandates.map(m => m.projectId));
      projects = projects.filter(p => ids.has(p.id));
    }
    res.json({
      success: true,
      projects: projects.map(p => ({
        id: p.id, projectName: p.projectName, builderId: p.builderId, builderName: p.builderName, locality: p.locality,
        unitConfigurations: p.unitConfigurations, availableUnits: p.availableUnits, totalUnits: p.totalUnits,
        priceStartingFrom: p.priceStartingFrom, priceMax: p.priceMax, channelPartnerCommissionPct: p.channelPartnerCommissionPct, status: p.status, tdsPct: p.tdsPct,
      })),
      mandates: mandates.map(m => ({ id: m.id, projectId: m.projectId, brokerId: m.brokerId, brokerName: m.brokerName, agreedCommissionPct: m.agreedCommissionPct, status: m.status })),
    });
  });

  // ── leads ──
  r.get('/leads', (req: Request, res: Response) => {
    const user = me();
    const { projectId, stage, q, temperature, source, associateId, from, to } = req.query as Record<string, string | undefined>;
    let leads = leadsFor(user);
    if (projectId) leads = leads.filter(l => l.projectId === String(projectId));
    if (stage) leads = leads.filter(l => l.stage === String(stage));
    if (temperature) leads = leads.filter(l => l.temperature === temperature);
    if (source) leads = leads.filter(l => l.source === source);
    if (associateId && (user.role === 'DEVELOPER_BUILDER' || isAdmin(user as any))) leads = leads.filter(l => l.associateId === associateId);
    if (from && !Number.isNaN(Date.parse(from))) leads = leads.filter(l => l.createdAt >= new Date(from).toISOString());
    if (to && !Number.isNaN(Date.parse(to))) leads = leads.filter(l => l.createdAt <= new Date(Date.parse(to) + 86400000).toISOString());
    if (req.query.stale === '1') leads = leads.filter(l => isStale(l));
    if (req.query.overdue === '1') { const now = Date.now(); leads = leads.filter(l => isOpenStage(l.stage) && l.followUps.some(f => !f.done && Date.parse(f.dueAt) < now)); }
    if (req.query.expiring === '1') leads = leads.filter(l => isOpenStage(l.stage) && protectionDaysLeft(l) <= 7);
    if (q) {
      const needle = String(q).toLowerCase();
      const phoneSearch = user.role !== 'TEAM_MEMBER' || policyOf(db.byId('users', user.id)).phoneMode === 'FULL';
      leads = leads.filter(l => l.name.toLowerCase().includes(needle) || (l.tags || []).some(t => t.toLowerCase().includes(needle)) || (phoneSearch && l.phoneKey.includes(digits(needle)) && digits(needle).length >= 3));
    }
    const total = leads.length;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json({ success: true, total, offset, limit, leads: leads.slice(offset, offset + limit).map(l => viewLead(l, user)) });
  });

  r.get('/leads/:id', (req: Request, res: Response) => {
    const user = me();
    const lead = findLead(req.params.id, user);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const booking = lead.bookingId ? db.byId('crmBookings', lead.bookingId) : undefined;
    // opening a lead that was forwarded to you is the "seen" receipt the sender and the owner can rely on
    const ho = (lead.handoffs || [])[0];
    if (ho && !ho.seenAt && ho.toId === user.id) { ho.seenAt = nowIso(); db.save(); }
    res.json({ success: true, lead: viewLead(lead, user), booking: booking ? (user.role === 'TEAM_MEMBER' ? bookingForMember(booking, user.id) : viewBooking(booking)) : undefined });
  });

  r.post('/leads', needs('crm:lead_create'), (req: Request, res: Response) => {
    const parsed = leadCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid lead' });
    const out = registerLead(me() as any, parsed.data);
    res.status(out.status).json(out.body);
  });

  r.patch('/leads/:id', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const user = me();
    const lead = findLead(req.params.id, user);
    if (!lead || !canWorkLead(user, lead)) return res.status(404).json({ error: 'Lead not found' });
    const parsed = leadPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid update' });
    const d = parsed.data;
    if ((lead.optedOutAt || lead.erasedAt) && (d.profile !== undefined || d.name !== undefined || d.email !== undefined)) return res.status(409).json({ error: 'This customer opted out of contact — their details can no longer be edited', code: 'OPTED_OUT' });
    if ((d.source !== undefined || d.sourceDetail !== undefined) && user.role === 'TEAM_MEMBER') return res.status(403).json({ error: 'Only your employer can change where a lead came from — it feeds the source report' });
    const ts = nowIso();
    const note = (t: string) => lead.activities.unshift({ id: `A-${Date.now().toString(36)}${Math.floor(Math.random() * 99)}`, type: 'SYSTEM', note: t, byUserId: user.id, byName: user.name, at: ts });
    if (d.source !== undefined && d.source !== lead.source) note(`Lead source changed: ${lead.source} → ${d.source}${d.sourceDetail ? ` (${d.sourceDetail})` : ''}`);
    if (d.profile !== undefined) {
      const before = JSON.stringify(lead.profile || {}); const next = d.profile || {};
      if (before !== JSON.stringify(next)) note(`Customer details updated (${Object.keys(next).length} filled)`);
    }
    const { profile, ...rest } = d;
    Object.assign(lead, rest, { updatedAt: ts });
    if (profile !== undefined || 'profile' in (req.body || {})) {
      // a full replace: sending {} clears every detail — except what the builder never sees on an associate's lead (it must survive the builder saving the rest)
      const keep = lead.associateId && (user.role === 'DEVELOPER_BUILDER' || isAdmin(user as any)) ? lead.profile?.competitors : undefined;
      const next: LeadProfile | undefined = keep ? { ...(profile || {}), competitors: keep } : profile;
      lead.profile = next;
    }
    db.save();
    res.json({ success: true, lead: viewLead(lead, user) });
  });

  r.post('/leads/:id/stage', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const user = me();
    const lead = findLead(req.params.id, user);
    if (!lead || !canWorkLead(user, lead)) return res.status(404).json({ error: 'Lead not found' });
    const { stage, note, lostReason } = req.body || {};

    if (lead.stage === 'BOOKED' || lead.stage === 'BOOKING_REQUESTED') {
      return res.status(409).json({ error: `Lead is ${lead.stage === 'BOOKED' ? 'booked' : 'awaiting booking approval'} — manage it from the booking` });
    }
    if ((lead.optedOutAt || lead.erasedAt) && stage !== 'LOST') return res.status(409).json({ error: 'This customer opted out of contact (or the data was erased) — the lead cannot be re-opened.', code: 'OPTED_OUT' });
    if (lead.stage === 'LOST') {
      if (stage !== 'NEW' || !(user.role === 'DEVELOPER_BUILDER' || isSuper(user as any))) {
        return res.status(409).json({ error: 'Only the builder can re-open a lost lead' });
      }
    }
    if (stage === 'LOST' && user.role === 'TEAM_MEMBER' && !policyOf(db.byId('users', user.id)).canMarkLost) {
      return res.status(403).json({ error: 'Only your employer can mark a lead lost — add a note and ask them' });
    }
    if (stage === 'LOST') {
      const code = req.body?.lostCode;
      if (code !== undefined && !lostCodeOk(code)) return res.status(400).json({ error: 'Pick a valid lost reason: ' + LOST_CODES.map(c => c.id).join(', ') });
      const label = LOST_CODES.find(c => c.id === code)?.en;
      if ((!lostReason || String(lostReason).trim().length < 3) && !label) return res.status(400).json({ error: 'A reason is required to mark a lead lost' });
      if (!lostReason || String(lostReason).trim().length < 3) req.body.lostReason = label;
    } else if (!FORWARD_STAGES.includes(stage)) {
      return res.status(400).json({ error: 'Stage must be one of ' + [...FORWARD_STAGES, 'LOST'].join(', ') + '. Booking stages are driven by the booking workflow.' });
    }

    if (['SITE_VISITED', 'NEGOTIATION'].includes(stage) && needsVisitProof(db.byId('builderProjects', lead.projectId), lead)) {
      return res.status(409).json({ error: 'This project needs a QR-verified site visit first — issue a visit pass and have the builder scan it', code: 'VISIT_QR_REQUIRED' });
    }
    const prev = lead.stage;
    lead.stage = stage;
    if (stage === 'LOST') { lead.lostReason = String(req.body.lostReason).slice(0, 300); lead.lostCode = lostCodeOk(req.body?.lostCode) ? req.body.lostCode : 'OTHER'; }
    if (prev === 'LOST' && stage === 'NEW') { lead.lostReason = undefined; lead.lostCode = undefined; lead.protectedUntil = new Date(Date.now() + regDays(db.byId('builderProjects', lead.projectId) || ({} as BuilderProject)) * 86400000).toISOString(); }
    lead.updatedAt = nowIso();
    lead.activities.unshift({
      id: `A-${Date.now().toString(36)}`, type: 'STAGE_CHANGE', byUserId: user.id, byName: user.name, at: lead.updatedAt,
      note: `Stage ${prev} → ${stage}${note ? `: ${String(note).slice(0, 300)}` : ''}${stage === 'LOST' ? ` (${lead.lostReason})` : ''}`,
    });
    autoFollowUp(lead, stage, user);
    db.save();
    audit('CRM_LEAD_STAGE', lead.id, `${lead.name}: ${prev} → ${stage}`);
    res.json({ success: true, lead: viewLead(lead, user) });
  });

  r.post('/leads/:id/activity', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const user = me();
    const lead = findLead(req.params.id, user);
    if (!lead || !canWorkLead(user, lead)) return res.status(404).json({ error: 'Lead not found' });
    const { type, note } = req.body || {};
    if (!ACTIVITY_TYPES.includes(type)) return res.status(400).json({ error: 'type must be ' + ACTIVITY_TYPES.join(', ') });
    if (lead.optedOutAt && ['CALL', 'WHATSAPP', 'MEETING'].includes(type)) return res.status(409).json({ error: 'Customer has opted out of contact — only notes are allowed.', code: 'OPTED_OUT' });
    if (!note || String(note).trim().length < 2 || String(note).length > 1000) return res.status(400).json({ error: 'A note (2–1000 chars) is required' });
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type, note: String(note).trim(), byUserId: user.id, byName: user.name, at: nowIso() });
    // contacting a brand-new lead moves it forward automatically
    if (lead.stage === 'NEW' && (type === 'CALL' || type === 'WHATSAPP' || type === 'MEETING')) { lead.stage = 'CONTACTED'; autoFollowUp(lead, 'CONTACTED', user); }
    lead.updatedAt = nowIso();
    db.save();
    res.json({ success: true, lead: viewLead(lead, user) });
  });

  r.post('/leads/:id/followups', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const user = me();
    const lead = findLead(req.params.id, user);
    if (!lead || !canWorkLead(user, lead)) return res.status(404).json({ error: 'Lead not found' });
    if (lead.optedOutAt) return res.status(409).json({ error: 'Customer has opted out of contact — no follow-ups can be scheduled.', code: 'OPTED_OUT' });
    const { dueAt, note, channel } = req.body || {};
    if (!dueAt || Number.isNaN(Date.parse(dueAt))) return res.status(400).json({ error: 'A valid due date/time is required' });
    if (!['CALL', 'WHATSAPP', 'MEETING', 'SITE_VISIT'].includes(channel)) return res.status(400).json({ error: 'Invalid channel' });
    if (!note || String(note).trim().length < 2) return res.status(400).json({ error: 'Follow-up note is required' });
    lead.followUps.push({ id: `FU-${Date.now().toString(36)}`, dueAt: new Date(dueAt).toISOString(), note: String(note).trim().slice(0, 300), channel, done: false, createdBy: user.id });
    const open = lead.followUps.filter(f => !f.done).map(f => f.dueAt).sort();
    lead.nextFollowUpAt = open[0];
    lead.updatedAt = nowIso();
    db.save();
    res.json({ success: true, lead: viewLead(lead, user) });
  });

  r.post('/leads/:id/followups/:fid/done', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const user = me();
    const lead = findLead(req.params.id, user);
    if (!lead || !canWorkLead(user, lead)) return res.status(404).json({ error: 'Lead not found' });
    const fu = lead.followUps.find(f => f.id === req.params.fid);
    if (!fu) return res.status(404).json({ error: 'Follow-up not found' });
    fu.done = true;
    fu.doneAt = nowIso();
    const open = lead.followUps.filter(f => !f.done).map(f => f.dueAt).sort();
    lead.nextFollowUpAt = open[0];
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: fu.channel === 'SITE_VISIT' ? 'SITE_VISIT' : (fu.channel as CrmActivityType), note: `Follow-up done: ${fu.note}`, byUserId: user.id, byName: user.name, at: fu.doneAt });
    lead.updatedAt = fu.doneAt;
    db.save();
    res.json({ success: true, lead: viewLead(lead, user) });
  });

  // Re-assign between associates — the only sanctioned way to change attribution; audited.
  r.post('/leads/:id/assign', needs('crm:assign'), (req: Request, res: Response) => {
    const user = me();
    const lead = findLead(req.params.id, user);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    if (user.role === 'DEVELOPER_BUILDER' && lead.builderId !== user.id) return res.status(403).json({ error: 'Not your project' });
    if (lead.stage === 'BOOKED' || lead.stage === 'BOOKING_REQUESTED') return res.status(409).json({ error: 'Cannot re-assign a lead that is booked / awaiting approval' });
    const state = db.getState();
    const { associateId, reason } = req.body || {};
    if (!reason || String(reason).trim().length < 5) return res.status(400).json({ error: 'A reason (min 5 chars) is required' });
    const mandate = state.associateMandates.find(m => m.projectId === lead.projectId && m.brokerId === associateId && mandateIsActive(m));
    if (!mandate) return res.status(400).json({ error: 'Target broker is not an active associate on this project' });
    const prev = lead.associateName;
    lead.associateId = mandate.brokerId; lead.associateName = mandate.brokerName; lead.mandateId = mandate.id;
    lead.assignedMemberId = undefined; lead.assignedMemberName = undefined; // the previous associate's employee no longer works it
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: 'SYSTEM', note: `Re-assigned ${prev} → ${mandate.brokerName}: ${String(reason).slice(0, 200)}`, byUserId: user.id, byName: user.name, at: nowIso() });
    lead.updatedAt = nowIso();
    db.save();
    audit('CRM_LEAD_REASSIGNED', lead.id, `${lead.name} re-assigned ${prev} → ${mandate.brokerName}. Reason: ${reason}`);
    res.json({ success: true, lead: viewLead(lead, user) });
  });

  // ── bookings ──
  r.get('/bookings', (_req: Request, res: Response) => {
    res.json({ success: true, bookings: bookingsFor(me()).map(viewBooking) });
  });

  r.post('/leads/:id/booking-request', needs('crm:booking_request'), (req: Request, res: Response) => {
    const user = me();
    const state = db.getState();
    const lead = findLead(req.params.id, user);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    // who may raise it: the associate who owns the lead; the builder (or a builder employee) for the builder's own desk leads;
    // an associate's employee on the associate's behalf. The builder still decides every request.
    let onBehalfOf: string | undefined;
    if (user.role === 'BROKER') {
      if (lead.associateId !== user.id) return res.status(404).json({ error: 'Lead not found' });
    } else if (user.role === 'DEVELOPER_BUILDER') {
      if (lead.builderId !== user.id) return res.status(404).json({ error: 'Lead not found' });
      if (lead.associateId) return res.status(403).json({ error: 'This lead belongs to a sales associate — the associate raises the booking request' });
    } else if (user.role === 'TEAM_MEMBER') {
      const mu = db.byId('users', user.id);
      if (!policyOf(mu).canRequestBooking) return res.status(403).json({ error: 'Your employer has not allowed you to raise booking requests' });
      if (lead.assignedMemberId !== user.id || (lead.associateId || lead.builderId) !== mu?.employerId) return res.status(404).json({ error: 'Lead not found' });
      onBehalfOf = db.byId('users', mu?.employerId)?.name;
    } else return res.status(403).json({ error: 'Not permitted' });
    const direct = !lead.associateId;
    const ownerId = lead.associateId || lead.builderId;
    const parsed = bookingRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid booking request' });
    const d = parsed.data;
    if (lead.optedOutAt || lead.erasedAt) return res.status(409).json({ error: 'This customer opted out of contact — a booking cannot be requested', code: 'OPTED_OUT' });
    if (!['SITE_VISITED', 'NEGOTIATION'].includes(lead.stage)) {
      return res.status(409).json({ error: 'A booking can be requested only after the customer has visited the site (stage SITE_VISITED / NEGOTIATION)' });
    }
    const project = db.byId('builderProjects', lead.projectId);
    const mandate = direct ? undefined : db.byId('associateMandates', lead.mandateId);
    if (needsVisitProof(project, lead)) return res.status(409).json({ error: 'This project needs a QR-verified site visit before a booking can be requested', code: 'VISIT_QR_REQUIRED' });
    if (!project || (!direct && !mandate)) return res.status(409).json({ error: 'Project or mandate no longer available' });
    if (mandate && !mandateIsActive(mandate)) return res.status(409).json({ error: 'Your mandate on this project is not active' });
    if (lead.verify === 'PENDING') return res.status(409).json({ error: 'The builder has not verified this lead yet — a booking can be requested once it is accepted' });
    if (lead.verify === 'REJECTED') return res.status(409).json({ error: 'This lead was rejected by the builder' });
    if (project.availableUnits <= 0) return res.status(409).json({ error: 'Project is sold out' });
    if (d.agreementValue < project.priceStartingFrom * 0.5 || d.agreementValue > project.priceMax * 2) {
      return res.status(400).json({ error: 'Agreement value is outside the plausible price range for this project' });
    }
    if (d.tokenAmount > d.agreementValue) return res.status(400).json({ error: 'The booking amount cannot exceed the agreement value' });
    // the booking amount is a CLAIM the builder must confirm — say how it was paid so the builder can match it to the bank / cheque book
    const ref = (d.tokenRef || '').trim();
    if (d.tokenAmount > 0) {
      if (!d.tokenMode) return res.status(400).json({ error: 'How did the customer pay the booking amount? (cheque / UPI / NEFT / cash …)' });
      if (d.tokenMode !== 'CASH' && ref.length < 3) return res.status(400).json({ error: 'Give the cheque number / UTR of the booking amount (min 3 characters) — the builder needs it to confirm' });
      if (d.tokenPaidOn && Date.parse(d.tokenPaidOn) > Date.now() + 86400000) return res.status(400).json({ error: 'The payment date cannot be in the future' });
    }
    const plan = d.plan;
    if (plan) {
      if (plan.loanAmount !== undefined && plan.loanAmount > d.agreementValue) return res.status(400).json({ error: 'The loan amount cannot exceed the agreement value' });
      if (plan.discountAsked !== undefined && plan.discountAsked > d.agreementValue) return res.status(400).json({ error: 'The discount asked cannot exceed the agreement value' });
      const se = scheduleError(plan.schedule); if (se) return res.status(400).json({ error: se });
      if (plan.planType === 'CUSTOM' && !plan.schedule?.length && (plan.conditions || '').length < 5) return res.status(400).json({ error: 'Describe the custom payment plan — add the lines or write the condition' });
      if (plan.funding === 'SELF') { delete plan.bank; delete plan.loanAmount; }
    }
    const gridCheck = checkBookingUnit(project, d.unitNo, ownerId);
    if (!gridCheck.ok) return res.status(409).json({ error: gridCheck.error });
    const held = state.crmBookings.find(b => b.projectId === project.id && b.unitNo.toLowerCase() === d.unitNo.toLowerCase() && (b.status === 'REQUESTED' || b.status === 'APPROVED'));
    if (held) return res.status(409).json({ error: `Unit ${d.unitNo} is already held by another booking in this project` });

    const ts = nowIso();
    const booking: CrmBooking = {
      id: nextId('CRM-B', state.crmBookings.map(b => b.id)),
      leadId: lead.id, projectId: project.id, projectName: project.projectName, builderId: project.builderId,
      associateId: lead.associateId, mandateId: mandate?.id, customerName: lead.name,
      unitNo: d.unitNo, unitConfig: d.unitConfig || lead.unitInterest, agreementValue: d.agreementValue, tokenAmount: d.tokenAmount,
      status: 'REQUESTED',
      // nothing is marked paid until the builder says so (v16.7: the old "token ≥ first instalment ⇒ paid" shortcut trusted the requester)
      paymentSchedule: buildSchedule(d.agreementValue, 0, plan?.schedule),
      ...(d.tokenAmount > 0 ? { token: { amount: d.tokenAmount, mode: d.tokenMode, ref: ref || undefined, paidOn: d.tokenPaidOn, status: 'CLAIMED' as const, claimedAt: ts, claimedByName: user.name } } : {}),
      ...(plan ? { plan: plan as BookingPlan } : {}),
      ...(d.coApplicantName ? { coApplicantName: d.coApplicantName } : {}),
      requestedBy: { id: user.id, name: user.name, role: user.role, ...(onBehalfOf ? { onBehalfOf } : {}) },
      ...(direct ? { direct: true } : {}),
      brokeragePct: mandate ? mandate.agreedCommissionPct : 0, // fixed by the builder's mandate, not by the associate; a direct sale has none
      brokerageAmount: mandate ? Math.round((d.agreementValue * mandate.agreedCommissionPct) / 100) : 0,
      brokeragePaidAmount: 0, tdsPct: 5, createdAt: ts, updatedAt: ts,
    };
    state.crmBookings.unshift(booking);
    unitBookingRequested(gridCheck.unit, booking.id);
    if (gridCheck.unit) {
      const h = gridCheck.unit.hold;
      if (h && !h.brokerId) { if (!direct) { h.brokerId = lead.associateId; h.brokerName = lead.associateName; } h.leadId = lead.id; h.customerName = lead.name; h.tokenAmount = d.tokenAmount; h.tokenRef = 'BOOKING-REQUEST'; }
    }
    lead.stage = 'BOOKING_REQUESTED';
    lead.bookingId = booking.id;
    lead.updatedAt = ts;
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: 'SYSTEM', note: `Booking requested: unit ${d.unitNo}, ₹${d.agreementValue.toLocaleString('en-IN')}${d.tokenAmount > 0 ? `, booking amount ₹${d.tokenAmount.toLocaleString('en-IN')} claimed (${d.tokenMode}${ref ? ` ${ref}` : ''})` : ''}${plan ? `, plan ${plan.planType}` : ''}${d.note ? ` — ${d.note}` : ''}`, byUserId: user.id, byName: user.name, at: ts });
    db.save();
    audit('CRM_BOOKING_REQUESTED', booking.id, `Booking requested for ${lead.name}: unit ${d.unitNo}, ₹${d.agreementValue.toLocaleString('en-IN')} by ${user.name}${onBehalfOf ? ` (for ${onBehalfOf})` : ''}${direct ? ' — builder-desk sale' : ''}`, 'COMMISSION');
    res.json({ success: true, booking: user.role === 'TEAM_MEMBER' ? bookingForMember(booking, user.id) : viewBooking(booking), lead: viewLead(lead, user) });
  });

  r.post('/bookings/:id/decision', needs('crm:booking_decide'), (req: Request, res: Response) => {
    const user = me();
    const state = db.getState();
    const booking = findBooking(req.params.id, user);
    if (!booking || (user.role === 'DEVELOPER_BUILDER' && booking.builderId !== user.id)) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'REQUESTED') return res.status(409).json({ error: `Booking is already ${booking.status.toLowerCase()}` });
    const { decision, note, schedule, tokenReceived } = req.body || {};
    if (!['APPROVE', 'REJECT'].includes(decision)) return res.status(400).json({ error: 'decision must be APPROVE or REJECT' });
    if (tokenReceived !== undefined && typeof tokenReceived !== 'boolean') return res.status(400).json({ error: 'tokenReceived must be true or false' });
    if (tokenReceived !== undefined && openTrailOn(booking.trails, 'TOKEN')) return res.status(409).json({ error: 'The booking amount is travelling through the Money Trail — approve now and confirm it there once it reaches you', code: 'MONEY_TRAIL_OPEN' });
    const lead = db.byId('crmLeads', booking.leadId);
    const project = db.byId('builderProjects', booking.projectId);
    const mandate = db.byId('associateMandates', booking.mandateId);
    if (!lead || !project) return res.status(409).json({ error: 'Lead or project missing' });
    const ts = nowIso();

    if (decision === 'REJECT') {
      if (!note || String(note).trim().length < 5) return res.status(400).json({ error: 'A reason (min 5 chars) is required to reject' });
      booking.status = 'REJECTED';
      closeOpenTrails(booking.trails, { id: user.id, name: user.name, side: 'BUILDER_OWNER' }, 'Booking rejected — return this money to the customer', ts);
      unitBookingDecided(booking.projectId, booking.unitNo, booking.id, 'RELEASED');
      lead.stage = 'NEGOTIATION';
      lead.bookingId = undefined;
    } else {
      if (!booking.direct && !mandate) return res.status(409).json({ error: 'Mandate missing' });
      if (schedule !== undefined) {
        const s = scheduleSchema.safeParse(schedule);
        if (!s.success) return res.status(400).json({ error: 'Invalid payment schedule' });
        const sum = s.data.reduce((a, m) => a + m.pct, 0);
        if (Math.abs(sum - 100) > 0.01) return res.status(400).json({ error: `Payment schedule must total 100% (currently ${sum}%)` });
        booking.paymentSchedule = buildSchedule(booking.agreementValue, 0, s.data);
      }
      if (booking.direct) {
        // the builder's own desk made this sale — units move, no associate, no brokerage
        const applied = applyDirectSale(project, booking.agreementValue);
        if ('error' in applied) return res.status(applied.status).json({ error: applied.error });
        booking.brokeragePct = 0; booking.brokerageAmount = 0;
      } else {
        // escalator slabs: the associate's n-th approved booking on this project decides the commission %
        const nth = state.crmBookings.filter(b => b.mandateId === mandate!.id && b.status === 'APPROVED').length + 1;
        const pct = commissionPctFor(project.cpSlabs, nth, mandate!.agreedCommissionPct);
        const applied = applyAssociateSale(mandate!, project, booking.agreementValue, pct);
        if ('error' in applied) return res.status(applied.status).json({ error: applied.error });
        booking.brokeragePct = pct;
        booking.brokerageAmount = applied.commission;
      }
      booking.status = 'APPROVED';
      unitBookingDecided(booking.projectId, booking.unitNo, booking.id, 'APPROVED');
      // v23: GENZ's fee for a booking a network broker brought (never the builder's own desk; never a master-CP project, where GENZ already earns)
      if (!booking.direct && !onMasterCp(booking.projectId)) {
        chargeEvent({ event: 'BUILDER_BOOKING', payerId: booking.builderId, base: booking.agreementValue, refId: booking.id, refLabel: `Booking ${booking.id} · ${project.projectName} · unit ${booking.unitNo}`, state: project.state || undefined });
      }
      lead.stage = 'BOOKED';
      // the builder may confirm the booking amount in the same step; otherwise it stays "claimed" and shows up as an alert
      if (booking.token && tokenReceived !== undefined) {
        const c = confirmToken(booking, user, tokenReceived, note);
        if ('error' in c) return res.status(c.status).json({ error: c.error });
      }
    }
    booking.decidedBy = user.id;
    booking.decidedAt = ts;
    booking.decisionNote = note ? String(note).slice(0, 500) : undefined;
    booking.updatedAt = ts;
    lead.updatedAt = ts;
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: 'SYSTEM', note: `Booking ${booking.status.toLowerCase()} by ${user.name}${note ? `: ${String(note).slice(0, 200)}` : ''}`, byUserId: user.id, byName: user.name, at: ts });
    db.save();
    audit(decision === 'APPROVE' ? 'CRM_BOOKING_APPROVED' : 'CRM_BOOKING_REJECTED', booking.id, `Booking ${booking.id} (${booking.customerName}, unit ${booking.unitNo}) ${booking.status} by ${user.name}`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(booking), lead: viewLead(lead, user) });
  });

  /**
   * The builder says whether the booking amount the requester claimed has really arrived.
   * RECEIVED needs an approved booking and is spread over the first instalments as ordinary receipts. GENZ moves no money.
   */
  r.post('/bookings/:id/token', needs('crm:booking_decide'), (req: Request, res: Response) => {
    const user = me();
    const booking = findBooking(req.params.id, user);
    if (!booking || (user.role === 'DEVELOPER_BUILDER' && booking.builderId !== user.id)) return res.status(404).json({ error: 'Booking not found' });
    if (typeof req.body?.received !== 'boolean') return res.status(400).json({ error: 'received must be true or false' });
    if (openTrailOn(booking.trails, 'TOKEN')) return res.status(409).json({ error: 'This booking amount is travelling through the Money Trail — confirm or cancel it there', code: 'MONEY_TRAIL_OPEN' });
    const note = String(req.body?.note || '').trim();
    if (req.body.received === false && note.length < 3) return res.status(400).json({ error: 'Say why — e.g. "cheque bounced" or "not in the bank yet"' });
    const c = confirmToken(booking, user, req.body.received, note || undefined);
    if ('error' in c) return res.status(c.status).json({ error: c.error });
    const lead = db.byId('crmLeads', booking.leadId);
    if (lead) lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: 'SYSTEM', note: `Booking amount ₹${booking.token!.amount.toLocaleString('en-IN')} ${req.body.received ? 'confirmed received' : 'marked NOT received'} by ${user.name}${note ? `: ${note.slice(0, 200)}` : ''}`, byUserId: user.id, byName: user.name, at: nowIso() });
    db.save();
    audit('CRM_TOKEN_CONFIRMED', booking.id, `Booking amount ₹${booking.token!.amount.toLocaleString('en-IN')} on ${booking.id} ${req.body.received ? 'RECEIVED' : 'NOT RECEIVED'} (${booking.token!.mode || '—'} ${booking.token!.ref || ''}) — by ${user.name}`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(booking) });
  });

  r.post('/bookings/:id/payments/:mid/receive', needs('crm:booking_decide'), (req: Request, res: Response) => {
    const user = me();
    const booking = findBooking(req.params.id, user);
    if (!booking || (user.role === 'DEVELOPER_BUILDER' && booking.builderId !== user.id)) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'APPROVED') return res.status(409).json({ error: 'Collections can be recorded only on approved bookings' });
    const m = booking.paymentSchedule.find(x => x.id === req.params.mid);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (m.paid) return res.status(409).json({ error: 'Milestone already collected' });
    if (openTrailOn(booking.trails, m.id)) return res.status(409).json({ error: 'Money for this instalment is travelling through the Money Trail — confirm or cancel it there', code: 'MONEY_TRAIL_OPEN' });
    const receiptNo = String(req.body?.receiptNo || '').trim();
    if (receiptNo.length < 3 || receiptNo.length > 40) return res.status(400).json({ error: 'A receipt number (3–40 chars) is required' });
    const remaining = m.amount - paidOf(m);
    const amount = req.body?.amount === undefined || req.body?.amount === '' ? remaining : Math.round(Number(req.body.amount));
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than zero' });
    if (amount > remaining) return res.status(400).json({ error: `Only ₹${remaining.toLocaleString('en-IN')} is pending on this milestone` });
    const mode = ['CASH', 'CHEQUE', 'UPI', 'NEFT_RTGS', 'DD', 'LOAN', 'OTHER'].includes(req.body?.mode) ? req.body.mode : 'OTHER';
    const ts = nowIso();
    m.receipts = [...(m.receipts || (m.paid ? [] : [])), { id: `RC-${Date.now().toString(36)}`, amount, mode, ref: receiptNo, at: ts, byId: user.id, byName: user.name }];
    m.paidAmount = paidOf(m) + amount;
    if (m.paidAmount >= m.amount) { m.paid = true; m.paidAt = ts; m.receiptNo = receiptNo; }
    if (m.claim?.status === 'OPEN') m.claim.status = 'RESOLVED';
    booking.updatedAt = ts;
    db.save();
    audit('CRM_PAYMENT_COLLECTED', booking.id, `₹${amount.toLocaleString('en-IN')} (${m.name}${m.paid ? '' : ', part'}) collected on ${booking.id}; ${mode} ref ${receiptNo}`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(booking) });
  });

  r.post('/bookings/:id/payout', needs('crm:payout'), (req: Request, res: Response) => {
    const user = me();
    const state = db.getState();
    const booking = findBooking(req.params.id, user);
    if (!booking || (user.role === 'DEVELOPER_BUILDER' && booking.builderId !== user.id)) return res.status(404).json({ error: 'Booking not found' });
    if (booking.status !== 'APPROVED') return res.status(409).json({ error: 'Payout is possible only on approved bookings' });
    if (booking.direct || booking.brokerageAmount <= 0) return res.status(409).json({ error: 'This booking has no brokerage — it was a sale by the builder\'s own desk' });
    const amount = Number(req.body?.amount);
    const payable = payableBrokerage(booking);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'A positive payout amount is required' });
    if (amount > payable) return res.status(400).json({ error: `Only ₹${payable.toLocaleString('en-IN')} is payable at the current collection level` });
    const ref = String(req.body?.ref || '').trim();
    if (ref.length < 3 || ref.length > 40) return res.status(400).json({ error: 'The payment reference (UTR / cheque no.) is required — the associate needs it as proof' });
    const mode = ['CASH', 'CHEQUE', 'UPI', 'NEFT_RTGS', 'OTHER'].includes(req.body?.mode) ? req.body.mode : 'OTHER';
    const paidOn = req.body?.paidOn && !Number.isNaN(Date.parse(req.body.paidOn)) ? new Date(req.body.paidOn).toISOString() : nowIso();
    if (Date.parse(paidOn) > Date.now() + 86400000) return res.status(400).json({ error: 'Payment date cannot be in the future' });
    const assoc = db.byId('users', booking.associateId);
    const proj = db.byId('builderProjects', booking.projectId);
    const tdsPct = effectiveTdsPct(proj?.tdsPct ?? booking.tdsPct, !!assoc?.panNumber);
    const amt = Math.round(amount);
    const tds = Math.round((amt * tdsPct) / 100);
    const ts = nowIso();
    booking.payouts = [...(booking.payouts || []), { id: `PO-${Date.now().toString(36)}`, amount: amt, tdsPct, tds, net: amt - tds, mode, ref, paidOn, byId: user.id, byName: user.name, at: ts, status: 'RECORDED' as const }];
    booking.brokeragePaidAmount += amt;
    booking.updatedAt = ts;
    const mandate = db.byId('associateMandates', booking.mandateId);
    if (mandate) {
      const all = state.crmBookings.filter(b => b.mandateId === mandate.id && b.status === 'APPROVED');
      mandate.commissionPaid = all.length > 0 && all.every(b => b.brokeragePaidAmount >= b.brokerageAmount);
    }
    db.save();
    audit('CRM_BROKERAGE_PAID', booking.id, `Brokerage ₹${amt.toLocaleString('en-IN')} released on ${booking.id} (${mode} ref ${ref}; TDS @${tdsPct}% = ₹${tds.toLocaleString('en-IN')}, net ₹${(amt - tds).toLocaleString('en-IN')}) — awaiting the associate's confirmation`, 'COMMISSION');
    res.json({ success: true, booking: viewBooking(booking), tds, net: amt - tds });
  });

  // ── volume bonus (extra payout for selling more units) ──
  const bonusFor = (project: BuilderProject) => {
    const state = db.getState();
    const mandates = state.associateMandates.filter(m => m.projectId === project.id && (m.status === 'ACTIVE_ASSOCIATE' || m.status === 'TOP_PERFORMER' || m.status === 'COMPLETED'));
    const bookings = state.crmBookings.filter(b => b.projectId === project.id && b.status === 'APPROVED').map(b => ({
      mandateId: b.mandateId || '', associateId: b.associateId, agreementValue: b.agreementValue, approvedAt: b.decidedAt, collectedPct: collectedPct(b).pct,
    }));
    const paid: Record<string, number> = {};
    state.bonusPayouts.filter(p => p.projectId === project.id).forEach(p => { paid[p.mandateId] = (paid[p.mandateId] || 0) + p.amount; });
    const status = computeBonus(project.bonusScheme, mandates.map(m => ({ mandateId: m.id, associateId: m.brokerId })), bookings, paid);
    return { mandates, status };
  };

  /** Brokers see the ladder + their own progress; builders see every associate on their own projects; admins see all. */
  r.get('/bonus', (_req: Request, res: Response) => {
    const user = me();
    if (user.role === 'TEAM_MEMBER') return res.status(403).json({ error: 'Bonus details are visible to your employer only' });
    const state = db.getState();
    let projects = state.builderProjects || [];
    if (user.role === 'DEVELOPER_BUILDER') projects = projects.filter(p => p.builderId === user.id);
    else if (user.role === 'BROKER') {
      const ids = new Set(state.associateMandates.filter(m => m.brokerId === user.id).map(m => m.projectId));
      projects = projects.filter(p => ids.has(p.id));
    }
    const out = projects.map(p => {
      const { mandates, status } = bonusFor(p);
      const broker = user.role === 'BROKER';
      const rows = status.rows
        .filter(r => !broker || r.associateId === user.id)
        .map(r => ({ ...r, brokerName: mandates.find(m => m.id === r.mandateId)?.brokerName }));
      return {
        projectId: p.id, projectName: p.projectName, scheme: p.bonusScheme || null,
        projectUnits: status.projectUnits, nextProject: status.nextProject, rows,
        payouts: state.bonusPayouts.filter(x => x.projectId === p.id && (!broker || x.brokerId === user.id)),
      };
    }).filter(p => p.scheme || user.role === 'DEVELOPER_BUILDER');
    res.json({ success: true, projects: out, canManage: user.role === 'DEVELOPER_BUILDER' || isSuper(user as any) });
  });

  r.put('/projects/:id/bonus-scheme', needs('crm:bonus_manage'), (req: Request, res: Response) => {
    const user = me();
    const state = db.getState();
    const project = db.byId('builderProjects', req.params.id);
    if (!project || (user.role === 'DEVELOPER_BUILDER' && project.builderId !== user.id)) return res.status(404).json({ error: 'Project not found' });
    const parsed = bonusSchemeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid bonus scheme' });
    const d = parsed.data;
    const scheme: BonusScheme = {
      enabled: d.enabled, qualifyCollectionPct: d.qualifyCollectionPct,
      windowFrom: d.windowFrom || undefined, windowTo: d.windowTo || undefined, note: d.note || undefined,
      slabs: d.slabs.map((s, i) => ({ id: `BS-${i + 1}`, level: s.level, minUnits: s.minUnits, kind: s.kind, value: s.value })),
    };
    project.bonusScheme = scheme;
    project.updatedAt = nowIso();
    db.save();
    audit('CRM_BONUS_SCHEME_UPDATED', project.id, `${user.name} ${scheme.enabled ? 'set' : 'switched off'} the volume-bonus scheme on ${project.projectName}: ${scheme.slabs.length} slab(s), qualify at ${scheme.qualifyCollectionPct}% collection${scheme.windowFrom ? `, window ${scheme.windowFrom} → ${scheme.windowTo || 'open'}` : ''}`, 'COMMISSION');
    res.json({ success: true, scheme });
  });

  r.post('/projects/:id/bonus/pay', needs('crm:payout'), (req: Request, res: Response) => {
    const user = me();
    const state = db.getState();
    const project = db.byId('builderProjects', req.params.id);
    if (!project || (user.role === 'DEVELOPER_BUILDER' && project.builderId !== user.id)) return res.status(404).json({ error: 'Project not found' });
    const mandateId = String(req.body?.mandateId || '');
    const amount = Math.round(Number(req.body?.amount));
    const reference = String(req.body?.reference || '').trim().slice(0, 60);
    const { status } = bonusFor(project);
    const row = status.rows.find(x => x.mandateId === mandateId);
    if (!row) return res.status(404).json({ error: 'No bonus record for this associate on this project' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'A positive payout amount is required' });
    if (amount > row.payable) return res.status(400).json({ error: `Only ₹${row.payable.toLocaleString('en-IN')} bonus is payable right now` });
    if (reference.length < 4) return res.status(400).json({ error: 'Enter the bank / UPI payout reference (UTR)' });
    const mandate = db.byId('associateMandates', mandateId)!;
    const rec = { id: `BP-${String(state.bonusPayouts.length + 1).padStart(4, '0')}`, projectId: project.id, mandateId, brokerId: mandate.brokerId, amount, tdsPct: 5, reference, paidBy: user.id, paidAt: nowIso() };
    state.bonusPayouts.push(rec);
    db.save();
    const tds = Math.round((amount * rec.tdsPct) / 100);
    audit('CRM_BONUS_PAID', project.id, `Volume bonus ₹${amount.toLocaleString('en-IN')} paid to ${mandate.brokerName} on ${project.projectName} (ref ${reference}; TDS @${rec.tdsPct}% = ₹${tds.toLocaleString('en-IN')})`, 'COMMISSION');
    res.json({ success: true, payout: rec, tds, net: amount - tds });
  });

  r.post('/bookings/:id/cancel', needs('crm:booking_decide'), (req: Request, res: Response) => {
    const user = me();
    const booking = findBooking(req.params.id, user);
    if (!booking || (user.role === 'DEVELOPER_BUILDER' && booking.builderId !== user.id)) return res.status(404).json({ error: 'Booking not found' });
    const out = cancelBooking(user, booking, String(req.body?.reason || ''), req.body || {});
    res.status(out.status).json(out.body);
  });

  return r;
}
