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
  /** v76 — 'LEAVE' while an approved HR leave (not the employer's own switch) keeps him on leave */
  onLeaveBy?: 'LEAVE';
  /** v58 — a BROKER's staff, resale / rent work (all off by default):
   *  listings: OFF · READ = network listings read-only like the employer sees them · ADDRESS = and the address of the employer's OWN listings
   *  (never an owner's name / number, never papers); rooms = work in the employer's client rooms; clients = the employer's client list */
  listings: 'OFF' | 'READ' | 'ADDRESS';
  rooms: boolean;
  clients: boolean;
}

/** Legacy behaviour — an employee without a stored policy keeps exactly what they had before v12. */
export const DEFAULT_POLICY: PolicyLike = {
  phoneMode: 'FULL', revealCap: 30, canRegister: true, canMarkLost: true, canClaim: false, canVerify: false, canScanVisits: false, canForward: true, canRequestBooking: false, canCollectMoney: false, canConfirmMoney: false,
  invMode: 'OFF', invPrice: false, invFeatures: true, invShareOut: false,
  scope: 'ASSIGNED', projectIds: [], onLeave: false,
  listings: 'OFF', rooms: false, clients: false,
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
  if (input.listings !== undefined) {
    if (!['OFF', 'READ', 'ADDRESS'].includes(input.listings)) return 'Listings access must be OFF, READ or ADDRESS';
    out.listings = input.listings;
  }
  for (const k of ['rooms', 'clients'] as const) {
    if (input[k] !== undefined) { if (typeof input[k] !== 'boolean') return `${k} must be true or false`; out[k] = input[k]; }
  }
  for (const k of ['invPrice', 'invFeatures', 'invShareOut'] as const) {
    if (input[k] !== undefined) { if (typeof input[k] !== 'boolean') return `${k} must be true or false`; out[k] = input[k]; }
  }
  for (const k of ['canRegister', 'canMarkLost', 'canClaim', 'canVerify', 'canScanVisits', 'canForward', 'canRequestBooking', 'canCollectMoney', 'canConfirmMoney', 'onLeave'] as const) {
    if (input[k] !== undefined) { if (typeof input[k] !== 'boolean') return `${k} must be true or false`; out[k] = input[k]; }
  }
  // the employer's own leave switch takes over from an HR leave: the sweep must not lift (or re-apply) what he set by hand
  if (input.onLeave !== undefined) delete out.onLeaveBy;
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

// ───────────────────────── v75 — one-tap staff presets ─────────────────────────
/** Which kind of employer is setting the switches: the server refuses verify / scan for non-builders and listings / rooms / clients for non-brokers. */
export type EmployerKind = 'BUILDER' | 'BROKER';
export interface StaffPreset { id: string; en: string; hi: string; hintEn: string; hintHi: string; patch: Partial<PolicyLike> }

const BASE_OFF: Partial<PolicyLike> = {
  canRegister: false, canMarkLost: false, canClaim: false, canForward: false, canRequestBooking: false, canCollectMoney: false, canConfirmMoney: false,
  invMode: 'OFF', invPrice: false, invShareOut: false,
};
/** The four everyday jobs, plus "look only". Every preset sets every switch it cares about, so applying one never leaves an old switch behind. */
export const STAFF_PRESETS: StaffPreset[] = [
  { id: 'CALLER', en: 'Telecaller', hi: 'टेलीकॉलर',
    hintEn: 'Calls leads. Number only by tap (logged), can take from the pool, cannot close a lead as lost.', hintHi: 'लीड को कॉल करता है। नंबर सिर्फ़ टैप करके (लॉग), पूल से ले सकता, लीड “लॉस्ट” नहीं कर सकता।',
    patch: { ...BASE_OFF, phoneMode: 'REVEAL', revealCap: 30, canRegister: true, canClaim: true, canForward: true } },
  { id: 'SALES', en: 'Sales / closing', hi: 'सेल्स / क्लोज़िंग',
    hintEn: 'Works his own leads end to end: sees numbers, raises booking requests, sends unit links.', hintHi: 'अपनी लीड शुरू से अंत तक संभालता है: नंबर दिखते हैं, बुकिंग अनुरोध भेजता है, यूनिट लिंक भेजता है।',
    patch: { ...BASE_OFF, phoneMode: 'FULL', canRegister: true, canMarkLost: true, canForward: true, canRequestBooking: true, invMode: 'SHARED', invPrice: true, invShareOut: true } },
  { id: 'SITE', en: 'Site / visit desk', hi: 'साइट / विज़िट डेस्क',
    hintEn: 'Receives customers at the site. Number by tap only; scans the visit QR (builder staff).', hintHi: 'साइट पर ग्राहक को संभालता है। नंबर सिर्फ़ टैप करके; विज़िट QR स्कैन करता है (बिल्डर का स्टाफ़)।',
    patch: { ...BASE_OFF, phoneMode: 'REVEAL', revealCap: 30, canRegister: true, canForward: true, invMode: 'SHARED' } },
  { id: 'ACCOUNTS', en: 'Accounts', hi: 'अकाउंट्स',
    hintEn: 'Handles money only: records and confirms it. Never sees customer numbers.', hintHi: 'सिर्फ़ पैसे का काम: दर्ज और कन्फ़र्म करता है। ग्राहक के नंबर कभी नहीं दिखते।',
    patch: { ...BASE_OFF, phoneMode: 'HIDDEN', canCollectMoney: true, canConfirmMoney: true } },
  { id: 'VIEW', en: 'Look only', hi: 'सिर्फ़ देखे',
    hintEn: 'Sees what you allot to him, cannot change or forward anything, no numbers.', hintHi: 'जो आप दें वही देखता है, कुछ बदल या आगे भेज नहीं सकता, नंबर नहीं।',
    patch: { ...BASE_OFF, phoneMode: 'HIDDEN' } },
];

/** The full patch to send for a preset: the preset's switches plus the ones only this employer kind may set. */
export function presetPatch(id: string, kind: EmployerKind): Partial<PolicyLike> | null {
  const pr = STAFF_PRESETS.find(x => x.id === id); if (!pr) return null;
  const patch: Partial<PolicyLike> = { ...pr.patch };
  if (kind === 'BUILDER') { patch.canVerify = false; patch.canScanVisits = id === 'SITE'; }
  else {
    patch.listings = id === 'SALES' ? 'READ' : id === 'SITE' ? 'ADDRESS' : 'OFF';
    patch.rooms = id === 'SALES' || id === 'SITE'; patch.clients = id === 'SALES';
  }
  return patch;
}
/** Which preset (if any) does this policy match exactly? null = a custom mix. */
export function presetOf(policy: Partial<PolicyLike> | undefined, kind: EmployerKind): string | null {
  const p = { ...DEFAULT_POLICY, ...(policy || {}) } as Record<string, unknown>;
  for (const pr of STAFF_PRESETS) {
    const patch = presetPatch(pr.id, kind) as Record<string, unknown>;
    // revealCap only matters in REVEAL mode; an unrelated number never makes a preset "custom"
    if (Object.entries(patch).every(([k, v]) => (k === 'revealCap' && p.phoneMode !== 'REVEAL') || p[k] === v)) return pr.id;
  }
  return null;
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
