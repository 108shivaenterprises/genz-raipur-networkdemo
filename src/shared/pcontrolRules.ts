/**
 * v12 — pure rules for builder control, partner scorecards and staff lead handling.
 * No server imports, so the unit tests (and the browser) can use them directly.
 */

export type PhoneMode = 'FULL' | 'REVEAL' | 'HIDDEN';

export interface PolicyLike {
  phoneMode: PhoneMode;
  revealCap: number;
  canRegister: boolean;
  canMarkLost: boolean;
  canClaim: boolean;
  canVerify: boolean;
  canScanVisits: boolean;
  /** v16.7 — may pass a lead on to a teammate (telecaller → executive → coordinator) */
  canForward: boolean;
  /** v16.7 — may raise a booking request for a lead they work (the employer / builder still decides) */
  canRequestBooking: boolean;
  /** v16.9 — may record customer money he collected, and (CP side) hand it over to the builder */
  canCollectMoney: boolean;
  /** v16.9 — may confirm a stage of the money trail: the CP's team confirming a colleague's money, or the builder's authorised accounts person confirming it arrived */
  canConfirmMoney: boolean;
  /** v16.8 — the employer's unit grid: OFF = none, SHARED = only the units posted to him, ALL = whole grid the employer can see */
  invMode: 'OFF' | 'SHARED' | 'ALL';
  /** v16.8 — may he see the rate? (never more than the employer sees) */
  invPrice: boolean;
  /** v16.8 — may he see road sides / facing / features? */
  invFeatures: boolean;
  /** v16.8 — may he send customers a share link of units */
  invShareOut: boolean;
  maxOpenLeads?: number;
  scope: 'ASSIGNED' | 'PROJECTS';
  projectIds: string[];
  onLeave: boolean;
}

/** Legacy behaviour — an employee without a stored policy keeps exactly what they had before v12. */
export const DEFAULT_POLICY: PolicyLike = {
  phoneMode: 'FULL', revealCap: 30, canRegister: true, canMarkLost: true, canClaim: false, canVerify: false, canScanVisits: false, canForward: true, canRequestBooking: false, canCollectMoney: false, canConfirmMoney: false,
  invMode: 'OFF', invPrice: false, invFeatures: true, invShareOut: false,
  scope: 'ASSIGNED', projectIds: [], onLeave: false,
};

export function policyOf(u: { teamPolicy?: Partial<PolicyLike> } | undefined | null): PolicyLike {
  return { ...DEFAULT_POLICY, ...(u?.teamPolicy || {}), projectIds: [...(u?.teamPolicy?.projectIds || [])] };
}

/** Sanitise a policy coming from the client. Returns an error string or the clean policy. */
export function cleanPolicy(input: any, current: PolicyLike): PolicyLike | string {
  const out: PolicyLike = { ...current };
  if (input.phoneMode !== undefined) {
    if (!['FULL', 'REVEAL', 'HIDDEN'].includes(input.phoneMode)) return 'Phone mode must be FULL, REVEAL or HIDDEN';
    out.phoneMode = input.phoneMode;
  }
  if (input.revealCap !== undefined) {
    const v = Number(input.revealCap);
    if (!Number.isInteger(v) || v < 1 || v > 500) return 'Daily reveal limit must be between 1 and 500';
    out.revealCap = v;
  }
  if (input.invMode !== undefined) {
    if (!['OFF', 'SHARED', 'ALL'].includes(input.invMode)) return 'Unit access must be OFF, SHARED or ALL';
    out.invMode = input.invMode;
  }
  for (const k of ['invPrice', 'invFeatures', 'invShareOut'] as const) {
    if (input[k] !== undefined) { if (typeof input[k] !== 'boolean') return `${k} must be true or false`; out[k] = input[k]; }
  }
  for (const k of ['canRegister', 'canMarkLost', 'canClaim', 'canVerify', 'canScanVisits', 'canForward', 'canRequestBooking', 'canCollectMoney', 'canConfirmMoney', 'onLeave'] as const) {
    if (input[k] !== undefined) { if (typeof input[k] !== 'boolean') return `${k} must be true or false`; out[k] = input[k]; }
  }
  if (input.maxOpenLeads !== undefined) {
    if (input.maxOpenLeads === null || input.maxOpenLeads === '') delete out.maxOpenLeads;
    else {
      const v = Number(input.maxOpenLeads);
      if (!Number.isInteger(v) || v < 1 || v > 1000) return 'Open-lead limit must be between 1 and 1000';
      out.maxOpenLeads = v;
    }
  }
  if (input.scope !== undefined) {
    if (!['ASSIGNED', 'PROJECTS'].includes(input.scope)) return 'Scope must be ASSIGNED or PROJECTS';
    out.scope = input.scope;
  }
  if (input.projectIds !== undefined) {
    if (!Array.isArray(input.projectIds) || input.projectIds.length > 100 || input.projectIds.some((x: unknown) => typeof x !== 'string' || x.length > 40)) return 'Invalid project list';
    out.projectIds = [...new Set(input.projectIds as string[])];
  }
  if (out.scope === 'PROJECTS' && out.projectIds.length === 0) return 'Pick at least one project for "all leads of these projects" access';
  return out;
}

export function maskPhone(phone: string): string {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 6) return '••••••••••';
  return `••••••••${d.slice(-2)}`;
}

// ───────────────────────── routing ─────────────────────────
export interface Assignable {
  id: string;
  openLeads: number;
  onLeave?: boolean;
  maxOpenLeads?: number;
  /** projects this member may work; empty = any */
  projectIds?: string[];
  canRegister?: boolean;
}

/**
 * Pick who gets a new lead. Deterministic: ROUND_ROBIN walks the id-sorted list from a cursor,
 * LEAST_LOADED takes the lowest open-lead count (ties → lowest id). Members on leave, at their cap
 * or limited to other projects are skipped. Returns null when nobody is eligible (lead stays with the owner / pool).
 */
export function pickAssignee(
  members: Assignable[], mode: 'OFF' | 'ROUND_ROBIN' | 'LEAST_LOADED', cursor: number, projectId: string,
): { id: string; cursor: number } | null {
  if (mode === 'OFF') return null;
  const ok = members
    .filter(m => !m.onLeave && (m.maxOpenLeads === undefined || m.openLeads < m.maxOpenLeads)
      && (!m.projectIds || m.projectIds.length === 0 || m.projectIds.includes(projectId)))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (ok.length === 0) return null;
  if (mode === 'LEAST_LOADED') {
    const best = [...ok].sort((a, b) => a.openLeads - b.openLeads || a.id.localeCompare(b.id))[0];
    return { id: best.id, cursor };
  }
  const i = ((cursor % ok.length) + ok.length) % ok.length;
  return { id: ok[i].id, cursor: cursor + 1 };
}

// ───────────────────────── mandates ─────────────────────────
export const ACTIVE_MANDATE = ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'];
export function mandateIsActive(m: { status: string; validUntil?: string }, now = Date.now()): boolean {
  if (!ACTIVE_MANDATE.includes(m.status)) return false;
  return !m.validUntil || Date.parse(m.validUntil) > now;
}

export const VERIFY_HOURS = 48;
export const verifyDueAt = (from = Date.now()) => new Date(from + VERIFY_HOURS * 3600_000).toISOString();

export const startOfDayMs = (now = Date.now()) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); };

// ───────────────────────── partner scorecard ─────────────────────────
export interface LeadLike {
  stage: string; createdAt: string; updatedAt: string; associateId?: string; verify?: string;
  activities?: { at: string; type: string }[];
}
export interface PartnerCard {
  leads: number; active: number; visits: number; negotiation: number; booked: number; lost: number;
  conversionPct: number; lastActivityAt?: string; inactiveDays: number; flag: 'ACTIVE' | 'QUIET' | 'INACTIVE';
}

/** Per-partner performance on one project. INACTIVE = nothing registered or touched for 21 days. */
export function partnerCard(leads: LeadLike[], mandateAt: string, now = Date.now()): PartnerCard {
  const visited = new Set(['SITE_VISITED', 'NEGOTIATION', 'BOOKING_REQUESTED', 'BOOKED']);
  let last = 0;
  for (const l of leads) last = Math.max(last, Date.parse(l.updatedAt) || 0, Date.parse(l.createdAt) || 0);
  const booked = leads.filter(l => l.stage === 'BOOKED').length;
  const lost = leads.filter(l => l.stage === 'LOST').length;
  const decided = booked + lost;
  const ref = last || Date.parse(mandateAt) || now;
  const inactiveDays = Math.floor((now - ref) / 86400000);
  return {
    leads: leads.length,
    active: leads.filter(l => !['BOOKED', 'LOST'].includes(l.stage)).length,
    visits: leads.filter(l => visited.has(l.stage)).length,
    negotiation: leads.filter(l => ['NEGOTIATION', 'BOOKING_REQUESTED', 'BOOKED'].includes(l.stage)).length,
    booked, lost,
    conversionPct: decided ? Math.round((booked / decided) * 100) : 0,
    lastActivityAt: last ? new Date(last).toISOString() : undefined,
    inactiveDays,
    flag: inactiveDays >= 21 ? 'INACTIVE' : inactiveDays >= 10 ? 'QUIET' : 'ACTIVE',
  };
}

// ───────────────────────── staff accountability ─────────────────────────
export interface StaffLead {
  id: string; stage: string; createdAt: string; updatedAt: string;
  assignedMemberId?: string;
  activities: { at: string; type: string; byUserId: string; note?: string }[];
  followUps: { dueAt: string; done: boolean }[];
}
export interface StaffCard {
  assigned: number; open: number; untouched: number; stale: number; overdue: number; avgFirstResponseHrs: number | null;
}

/**
 * untouched = allotted > 24 h ago and the member never logged an action on it;
 * stale     = open and nothing logged for 3 days;
 * first response = hours from the allotment note (or lead creation) to the member's first logged action.
 */
export function staffCard(memberId: string, leads: StaffLead[], now = Date.now()): StaffCard {
  const mine = leads.filter(l => l.assignedMemberId === memberId);
  const open = mine.filter(l => !['BOOKED', 'LOST'].includes(l.stage));
  const touch = (l: StaffLead) => l.activities.filter(a => a.byUserId === memberId && a.type !== 'SYSTEM').map(a => Date.parse(a.at)).sort((a, b) => a - b);
  const allotAt = (l: StaffLead) => {
    const a = l.activities.filter(x => x.type === 'SYSTEM' && /Allotted to/i.test(x.note || '')).map(x => Date.parse(x.at));
    return a.length ? Math.max(...a) : Date.parse(l.createdAt);
  };
  let untouched = 0, stale = 0, overdue = 0; const resp: number[] = [];
  for (const l of open) {
    const t = touch(l);
    if (t.length === 0 && now - allotAt(l) > 24 * 3600_000) untouched++;
    const lastT = t.length ? t[t.length - 1] : allotAt(l);
    if (now - lastT > 3 * 86400_000) stale++;
    if (l.followUps.some(f => !f.done && Date.parse(f.dueAt) < now)) overdue++;
  }
  for (const l of mine) { const t = touch(l); if (t.length) resp.push((t[0] - allotAt(l)) / 3600_000); }
  return {
    assigned: mine.length, open: open.length, untouched, stale, overdue,
    avgFirstResponseHrs: resp.length ? Math.round((resp.reduce((a, b) => a + Math.max(0, b), 0) / resp.length) * 10) / 10 : null,
  };
}
