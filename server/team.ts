/**
 * My Team — a broker or builder adds employees (telecaller, site executive, assistant) and allots them
 * CRM leads and deal rooms.
 *
 * Rules:
 *  1. An employee works ONLY on what the employer allots. Their role (TEAM_MEMBER) has no access to
 *     brokerage, splits, agreements, payouts, bonus, mandates, inventory or the directory, and is treated
 *     like the property owner for deal-room commercials (redacted + no brokers-only channel).
 *  2. The employer creates the account (mobile number + temporary password, shown once). The employer attests
 *     that the member has agreed to the Privacy Policy; the attestation is stored as the consent record.
 *  3. An employer sees and manages only their own members; admins see everyone through the user directory.
 *  4. If the employer is suspended / blacklisted, every member is locked out too (checked on every request).
 *  5. Everything is in the hash-chained audit trail.
 */
import { alert, firstName } from './alerts.js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { ctx, needs, digits, rateLimit, hashPassword, randomPassword } from './auth.js';
import { phoneSchema } from './validation.js';
import { isDealBroker, isSuper } from './access.js';
import { releaseMemberLeads } from './leadflow.js';
import { POLICY_VERSION } from './privacy.js';
import type { SiteCheckin } from './db.js';
import { TEAM_ROLE_IDS, TEAM_ROLES, inferTeamRole, teamMaxFor, teamCapProblem, TEAM_MAX_DEFAULT, TEAM_CAP_ROLES } from '../src/shared/crmSales.js';
import { cleanIncentive, incentiveOf, incentiveModeOf, incentiveBaseFor, isOwnBooking } from '../src/shared/incentiveRules.js';

/** v76b — how many people this employer may add: the superadmin's figure for him, else for his kind of employer, else the built-in one */
export const capOf = (u: Pick<UserProfile, 'role' | 'teamMaxOverride'>) => teamMaxFor(u.role, db.getState().settings.teamMaxByRole, u.teamMaxOverride);

/** kept for older imports; the real limit depends on who employs (v75: a builder may add 60, a contractor 30, a broker 15) */
export const MAX_TEAM = TEAM_MAX_DEFAULT;

const createSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(100),
  phone: phoneSchema,
  title: z.string().trim().min(2, 'Job title is required (e.g. Telecaller)').max(60).optional(),
  /** v16.7 — structured role; the title defaults to the role's name */
  role: z.enum(TEAM_ROLE_IDS as [string, ...string[]]).optional(),
  /** the employer confirms the employee has agreed to the Privacy Policy & Terms */
  consentAttested: z.literal(true, { message: 'Confirm that the member has agreed to the Privacy Policy & Terms' }),
});

const nowIso = () => new Date().toISOString();

export function createTeamRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const audit = (entity: 'LEAD' | 'DEAL' | 'VERIFICATION', id: string, action: string, details: string) => {
    const u = me();
    db.appendAuditEvent(u.id, u.role, entity, id, action, details);
  };
  const mine = (employerId: string) => db.getState().users.filter(u => u.role === 'TEAM_MEMBER' && u.employerId === employerId);
  const member = (id: string, employerId: string) => mine(employerId).find(u => u.id === id);

  // ── GPS + selfie site check-in (a member or the broker himself) ──
  const checkinSchema = z.object({
    label: z.string().trim().min(2, 'Site / project name is required').max(100),
    lat: z.number().min(6).max(38.5, 'Location is outside India'),
    lng: z.number().min(68).max(98, 'Location is outside India'),
    accuracy: z.number().min(0).max(100000).optional(),
    leadId: z.string().max(40).optional(),
    selfie: z.string().regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'A selfie with the client is required').max(220_000, 'Selfie is too large'),
  });
  r.post('/checkin', needs('team:checkin'), rateLimit('checkin', 40, 24 * 60 * 60_000), (req: Request, res: Response) => {
    const u = me();
    const p = checkinSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid check-in' });
    const state = db.getState();
    const d = p.data;
    let lead;
    if (d.leadId) {
      lead = db.byId('crmLeads', d.leadId);
      if (!lead || (lead.assignedMemberId !== u.id && lead.associateId !== u.id)) return res.status(404).json({ error: 'Lead not found' });
    }
    const employerId = u.role === 'TEAM_MEMBER' ? (u.employerId as string) : u.id;
    const c: SiteCheckin = {
      id: `CHK-${Date.now().toString(36)}${Math.floor(Math.random() * 900 + 100)}`,
      employerId, userId: u.id, userName: u.name, leadId: d.leadId, label: d.label,
      lat: Math.round(d.lat * 1e6) / 1e6, lng: Math.round(d.lng * 1e6) / 1e6, accuracy: d.accuracy, selfie: d.selfie, at: nowIso(),
    };
    state.siteCheckins.unshift(c);
    // keep the file small: selfies of the oldest check-ins are dropped after the 300 newest
    state.siteCheckins.slice(300).forEach(x => { x.selfie = undefined; });
    if (state.siteCheckins.length > 3000) state.siteCheckins.length = 3000;
    if (lead) {
      lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: 'SITE_VISIT', note: `Site check-in at ${d.label} (GPS ${c.lat}, ${c.lng}) with client selfie`, byUserId: u.id, byName: u.name, at: c.at });
      lead.updatedAt = c.at;
    }
    db.save();
    db.appendAuditEvent(u.id, u.role, lead ? 'LEAD' : 'VERIFICATION', lead?.id || c.id, 'SITE_CHECKIN', `${u.name} checked in at ${d.label} (${c.lat}, ${c.lng}, ±${Math.round(d.accuracy || 0)}m)`);
    res.json({ success: true, checkin: { ...c, selfie: undefined } });
  });

  r.use(needs('team:manage'));

  /** Activity of my team (and myself) for the last N days: calls/notes logged, check-ins, pipeline. */
  r.get('/activity', (req: Request, res: Response) => {
    const u = me(); const state = db.getState();
    const days = Math.min(30, Math.max(1, Number(req.query.days) || 7));
    const since = Date.now() - days * 86400000;
    const people = [{ id: u.id, name: `${u.name} (you)`, title: 'Owner' }, ...mine(u.id).map(m => ({ id: m.id, name: m.name, title: m.teamTitle || '' }))];
    // v20: one pass over leads / check-ins / deals for the whole team (it was a full scan per team member)
    const ids = new Set(people.map(p => p.id));
    const typeBy = new Map<string, Record<string, number>>(); const actsN = new Map<string, number>();
    const leadsBy = new Map<string, typeof state.crmLeads>();
    for (const l of state.crmLeads) {
      for (const a of l.activities) if (a.byUserId && ids.has(a.byUserId) && a.type !== 'SYSTEM' && Date.parse(a.at) >= since) {
        actsN.set(a.byUserId, (actsN.get(a.byUserId) || 0) + 1);
        const t = typeBy.get(a.byUserId) || {}; t[a.type] = (t[a.type] || 0) + 1; typeBy.set(a.byUserId, t);
      }
      const holder = l.assignedMemberId ? (ids.has(l.assignedMemberId) && l.assignedMemberId !== u.id ? l.assignedMemberId : '') : (l.associateId === u.id ? u.id : '');
      if (holder) (leadsBy.get(holder) || leadsBy.set(holder, []).get(holder)!).push(l);
    }
    const chkBy = new Map<string, typeof state.siteCheckins>();
    for (const c of state.siteCheckins) if (ids.has(c.userId) && Date.parse(c.at) >= since) (chkBy.get(c.userId) || chkBy.set(c.userId, []).get(c.userId)!).push(c);
    const dealsBy = new Map<string, number>();
    for (const d of state.dealRooms) for (const m of d.teamMemberIds || []) if (ids.has(m)) dealsBy.set(m, (dealsBy.get(m) || 0) + 1);
    const rows = people.map(pp => {
      const leads = leadsBy.get(pp.id) || [];
      const open = leads.filter(l => !['BOOKED', 'LOST'].includes(l.stage));
      const chk = chkBy.get(pp.id) || [];
      const byType: Record<string, number> = typeBy.get(pp.id) || {};
      const acts = { length: actsN.get(pp.id) || 0 };
      return {
        id: pp.id, name: pp.name, title: pp.title,
        activities: acts.length, calls: byType.CALL || 0, whatsapp: byType.WHATSAPP || 0, meetings: byType.MEETING || 0, notes: byType.NOTE || 0,
        siteVisits: chk.length,
        lastCheckinAt: chk[0]?.at, lastCheckinLabel: chk[0]?.label,
        openLeads: open.length,
        overdueFollowUps: open.filter(l => l.followUps.some(f => !f.done && Date.parse(f.dueAt) < Date.now())).length,
        booked: leads.filter(l => l.stage === 'BOOKED').length,
        deals: pp.id === u.id ? undefined : dealsBy.get(pp.id) || 0,
      };
    });
    res.json({ success: true, days, rows });
  });

  r.get('/checkins', (req: Request, res: Response) => {
    const u = me(); const days = Math.min(90, Math.max(1, Number(req.query.days) || 14));
    const since = Date.now() - days * 86400000;
    const memberId = req.query.memberId ? String(req.query.memberId) : '';
    const list = db.getState().siteCheckins.filter(c => c.employerId === u.id && Date.parse(c.at) >= since && (!memberId || c.userId === memberId))
      .slice(0, 200).map(({ selfie, ...c }) => ({ ...c, hasSelfie: !!selfie }));
    res.json({ success: true, checkins: list });
  });
  r.get('/checkins/:id/selfie', (req: Request, res: Response) => {
    const c = db.getState().siteCheckins.find(x => x.id === req.params.id && x.employerId === me().id);
    if (!c?.selfie) return res.status(404).json({ error: 'No selfie stored for this check-in' });
    res.json({ success: true, selfie: c.selfie });
  });

  /** Firm vs agent split on brokerage from bookings of leads the member worked. Employer-only. */
  r.get('/incentives', (_req: Request, res: Response) => {
    const u = me(); const state = db.getState();
    const team = mine(u.id); const teamIds = new Set(team.map(m => m.id));
    const leadsOf = new Map<string, Set<string>>(); // v20: one pass instead of one per member
    for (const l of state.crmLeads) if (l.assignedMemberId && teamIds.has(l.assignedMemberId)) (leadsOf.get(l.assignedMemberId) || leadsOf.set(l.assignedMemberId, new Set()).get(l.assignedMemberId)!).add(l.id);
    const base = incentiveBaseFor(u.role);
    const rows = team.map(m => {
      const leadIds = leadsOf.get(m.id) || new Set<string>();
      const bs = state.crmBookings.filter(b => b.status === 'APPROVED' && leadIds.has(b.leadId) && isOwnBooking(u.role, u.id, b));
      const brokerage = bs.reduce((a, b) => a + b.brokerageAmount, 0);
      const received = bs.reduce((a, b) => a + b.brokeragePaidAmount, 0);
      const value = bs.reduce((a, b) => a + (b.agreementValue || 0), 0);
      const accrued = incentiveOf(m, u.role, bs.map(b => ({ brokerage: b.brokerageAmount, value: b.agreementValue || 0 })));
      // "on received" is a broker's view: the share of what the builder has actually paid so far (a fixed ₹ counts once the booking's brokerage is fully in)
      const onReceived = base === 'BROKERAGE'
        ? (incentiveModeOf(m) === 'FIXED' ? (m.incentiveFixed || 0) * bs.filter(b => b.brokerageAmount > 0 && b.brokeragePaidAmount >= b.brokerageAmount).length : Math.round(received * (m.incentivePct || 0) / 100))
        : accrued;
      return {
        id: m.id, name: m.name, incentiveMode: incentiveModeOf(m), incentivePct: m.incentivePct || 0, incentiveFixed: m.incentiveFixed || 0, bookings: bs.length,
        brokerage, received, value,
        incentiveAccrued: accrued, incentiveOnReceived: onReceived,
        firmShareAccrued: base === 'BROKERAGE' ? brokerage - accrued : 0,   // a builder earns no brokerage on his own desk sale, so there is no "firm share" to split
      };
    });
    res.json({ success: true, rows, base: base || 'BROKERAGE', note: base === 'VALUE'
      ? 'Incentive is calculated on the booking value (or a fixed ₹ per booking) of approved bookings of leads the member worked. GENZ only calculates — you pay your employee yourself. Members never see these figures.'
      : 'Incentive is calculated on brokerage — fixed when the project was assigned — (or a fixed ₹ per booking) of approved bookings of leads the member worked. GENZ only calculates — you pay your employee yourself. Members never see these figures.' });
  });

  r.get('/', (_req: Request, res: Response) => {
    const u = me();
    const state = db.getState();
    const team = mine(u.id); const ids = new Set(team.map(m => m.id));
    const n = new Map<string, { leads: number; open: number; deals: number }>(); // v20: one pass instead of three per member
    const N = (id: string) => n.get(id) || n.set(id, { leads: 0, open: 0, deals: 0 }).get(id)!;
    for (const l of state.crmLeads) if (l.assignedMemberId && ids.has(l.assignedMemberId)) { const x = N(l.assignedMemberId); x.leads++; if (!['BOOKED', 'LOST'].includes(l.stage)) x.open++; }
    for (const d of state.dealRooms) for (const m of d.teamMemberIds || []) if (ids.has(m)) N(m).deals++;
    const members = team.map(m => ({
      id: m.id, name: m.name, phone: m.phone, teamTitle: m.teamTitle, teamRole: inferTeamRole(m.teamTitle, m.teamRole), incentivePct: m.incentivePct || 0, incentiveMode: incentiveModeOf(m), incentiveFixed: m.incentiveFixed || 0, status: m.verificationStatus,
      lastLoginAt: m.lastLoginAt, createdAt: m.createdAt,
      leads: n.get(m.id)?.leads || 0,
      openLeads: n.get(m.id)?.open || 0,
      deals: n.get(m.id)?.deals || 0,
    }));
    res.json({ success: true, members, max: capOf(me()) });
  });

  r.post('/', rateLimit('team-create', 60, 60 * 60_000), (req: Request, res: Response) => {
    const u = me();
    if (u.verificationStatus !== 'VERIFIED') return res.status(403).json({ error: 'Your account must be verified first' });
    const p = createSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Invalid details' });
    if (!p.data.title && !p.data.role) return res.status(400).json({ error: 'Job title is required (e.g. Telecaller)' });
    const teamRole = inferTeamRole(p.data.title, p.data.role);
    const title = p.data.title || TEAM_ROLES.find(x => x.id === teamRole)?.en || 'Team member';
    const state = db.getState();
    const cap = capOf(u);
    if (mine(u.id).filter(m => m.verificationStatus !== 'REJECTED').length >= cap) return res.status(409).json({ error: `You can add up to ${cap} team members. Need more? Ask the GENZ team to raise your limit.`, code: 'TEAM_LIMIT', cap });
    const phone = digits(p.data.phone);
    if (state.users.some(x => digits(x.phone) === phone)) return res.status(409).json({ error: 'A GENZ account with this mobile number already exists' });
    const email = `${phone.slice(-10)}@phone.genz.local`;
    if (state.users.some(x => x.email.toLowerCase() === email)) return res.status(409).json({ error: 'A GENZ account with this mobile number already exists' });

    const temp = randomPassword();
    const now = nowIso();
    const m: UserProfile = {
      id: `USR-TEAM-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 90 + 10)}`,
      name: p.data.name, email, phone: p.data.phone, role: 'TEAM_MEMBER',
      city: u.city, state: u.state, companyName: u.companyName || u.name,
      employerId: u.id, employerRole: u.role, teamTitle: title, teamRole,
      consent: { policyVersion: POLICY_VERSION, acceptedAt: now, ip: `employer-attested:${u.id}` },
      verificationStatus: 'VERIFIED',
      verificationNotes: `Added by ${u.name} (${u.role}).`,
      createdAt: now,
      passwordHash: hashPassword(temp), mustChangePassword: true, sessionVersion: 1,
    } as UserProfile;
    state.users.push(m);
    db.save();
    audit('VERIFICATION', m.id, 'TEAM_MEMBER_ADDED', `${u.name} added team member ${m.name} (${m.teamTitle}); privacy consent attested by employer`);
    res.json({ success: true, member: { id: m.id, name: m.name, phone: m.phone, teamTitle: m.teamTitle, teamRole: m.teamRole }, loginId: phone.slice(-10), temporaryPassword: temp, note: 'Shown once. The member must change it at first sign-in.' });
  });

  r.put('/:id', (req: Request, res: Response) => {
    const u = me();
    const m = member(req.params.id, u.id);
    if (!m) return res.status(404).json({ error: 'Team member not found' });
    if (req.body?.incentivePct !== undefined || req.body?.incentiveMode !== undefined || req.body?.incentiveFixed !== undefined) {
      const c = cleanIncentive(u.role, { mode: req.body.incentiveMode, pct: req.body.incentivePct, fixed: req.body.incentiveFixed });
      if (typeof c === 'string') return res.status(400).json({ error: c });
      Object.assign(m, c);
      const how = incentiveModeOf(m) === 'FIXED' ? `₹${m.incentiveFixed || 0} for every approved booking` : `${m.incentivePct || 0}% of ${incentiveBaseFor(u.role) === 'VALUE' ? 'the booking value' : 'brokerage'}`;
      audit('VERIFICATION', m.id, 'TEAM_INCENTIVE_SET', `${u.name} set ${m.name}'s incentive to ${how}`);
    }
    const title = req.body?.teamTitle;
    if (typeof title === 'string') {
      if (title.trim().length < 2 || title.length > 60) return res.status(400).json({ error: 'Job title must be 2–60 characters' });
      m.teamTitle = title.trim();
      if (req.body?.teamRole === undefined && !m.teamRole) m.teamRole = inferTeamRole(m.teamTitle);
    }
    if (req.body?.teamRole !== undefined) {
      if (!TEAM_ROLE_IDS.includes(req.body.teamRole)) return res.status(400).json({ error: 'Pick a valid role' });
      m.teamRole = req.body.teamRole;
      if (typeof title !== 'string') m.teamTitle = TEAM_ROLES.find(x => x.id === m.teamRole)?.en || m.teamTitle;
    }
    if (typeof req.body?.active === 'boolean') {
      if (req.body.active) {
        if (m.verificationStatus === 'BLACKLISTED') return res.status(403).json({ error: 'This account was blacklisted by GENZ operations' });
        m.verificationStatus = 'VERIFIED';
      } else {
        m.verificationStatus = 'SUSPENDED';
        m.sessionVersion = (m.sessionVersion || 1) + 1; // kicks out live sessions
        // a suspended employee must not keep customers: open leads go to the rest of the team (routing) or back to the pool
        const moved = releaseMemberLeads(u, m, u.id, u.name);
        if (moved) audit('LEAD', m.id, 'LEADS_HANDED_OVER', `${u.name} suspended ${m.name}; ${moved} open lead(s) taken back`);
      }
      audit('VERIFICATION', m.id, req.body.active ? 'TEAM_MEMBER_ACTIVATED' : 'TEAM_MEMBER_SUSPENDED', `${u.name} ${req.body.active ? 'reactivated' : 'suspended'} ${m.name}`);
    }
    db.save();
    res.json({ success: true });
  });

  r.post('/:id/reset-password', rateLimit('team-reset', 20, 60 * 60_000), (req: Request, res: Response) => {
    const u = me();
    const m = member(req.params.id, u.id);
    if (!m) return res.status(404).json({ error: 'Team member not found' });
    const temp = randomPassword();
    m.passwordHash = hashPassword(temp);
    m.mustChangePassword = true;
    m.sessionVersion = (m.sessionVersion || 1) + 1;
    db.save();
    audit('VERIFICATION', m.id, 'TEAM_MEMBER_PASSWORD_RESET', `${u.name} issued a temporary password for ${m.name}`);
    res.json({ success: true, loginId: digits(m.phone).slice(-10), temporaryPassword: temp, note: 'Shown once.' });
  });

  /** Allot (or take back) a CRM lead. */
  r.post('/allot/lead', (req: Request, res: Response) => {
    const u = me();
    const state = db.getState();
    const lead = state.crmLeads.find(l => l.id === String(req.body?.leadId || ''));
    if (!lead || (lead.associateId !== u.id && lead.builderId !== u.id)) return res.status(404).json({ error: 'Lead not found' });
    // a builder's own desk leads (no associate) belong to the builder; leads registered by an associate belong to that associate
    if (u.role === 'BROKER' && lead.associateId !== u.id) return res.status(403).json({ error: 'Only the associate who owns this lead can allot it' });
    if (u.role === 'DEVELOPER_BUILDER' && lead.associateId) return res.status(403).json({ error: 'This lead belongs to a sales associate — they allot it to their own team' });
    const memberId = req.body?.memberId ? String(req.body.memberId) : '';
    let to: UserProfile | undefined;
    if (memberId) {
      to = member(memberId, u.id);
      if (!to || to.verificationStatus !== 'VERIFIED') return res.status(400).json({ error: 'Pick one of your active team members' });
    }
    const prev = lead.assignedMemberName;
    lead.assignedMemberId = to?.id; lead.assignedMemberName = to?.name;
    lead.updatedAt = nowIso();
    lead.activities.unshift({ id: `A-${Date.now().toString(36)}`, type: 'SYSTEM', note: to ? `Allotted to ${to.name}${prev ? ` (was ${prev})` : ''}` : `Taken back from ${prev || 'team'}`, byUserId: u.id, byName: u.name, at: nowIso() });
    db.save();
    if (to) alert(to.id, 'deals', 'New lead for you', `${firstName(lead.name)} · ${lead.projectName} — allotted by ${u.name}`, '/?tab=crm', { not: u.id, tag: `lead-${lead.id}`, hi: ['आपके लिए नई लीड', `${firstName(lead.name)} · ${lead.projectName} — ${u.name} ने दी`] });
    audit('LEAD', lead.id, to ? 'CRM_LEAD_ALLOTTED' : 'CRM_LEAD_TAKEN_BACK', `${u.name}: ${lead.name} ${to ? `allotted to ${to.name}` : `taken back from ${prev || 'team'}`}`);
    res.json({ success: true, lead });
  });

  /** Choose which of my employees may work in a deal room (read + chat; commercials stay hidden). */
  r.post('/allot/deal', (req: Request, res: Response) => {
    const u = me();
    const state = db.getState();
    const deal = state.dealRooms.find(d => d.id === String(req.body?.dealId || ''));
    if (!deal || !isDealBroker(u, deal)) return res.status(404).json({ error: 'Deal room not found' });
    const ids: string[] = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(String) : [];
    const mineIds = new Set(mine(u.id).map(m => m.id));
    if (ids.some(id => !mineIds.has(id) || member(id, u.id)?.verificationStatus !== 'VERIFIED')) return res.status(400).json({ error: 'Pick only your own active team members' });
    const others = (deal.teamMemberIds || []).filter(id => !mineIds.has(id)); // the other broker's employees stay untouched
    const before = new Set(deal.teamMemberIds || []);
    deal.teamMemberIds = [...new Set([...others, ...ids])];
    alert(ids.filter(id => !before.has(id)), 'deals', 'A deal room was opened for you', `${deal.id} — added by ${u.name}`, '/?tab=deals', { not: u.id, tag: `deal-${deal.id}`, hi: ['आपके लिए डील रूम खुला', `${deal.id} — ${u.name} ने जोड़ा`] });
    db.save();
    audit('DEAL', deal.id, 'DEAL_TEAM_UPDATED', `${u.name} set ${ids.length} team member(s) on deal ${deal.id}`);
    res.json({ success: true, teamMemberIds: deal.teamMemberIds.filter(id => mineIds.has(id)) });
  });

  return r;
}

/**
 * v76b — the superadmin decides how many team members each employer may add.
 *  GET /api/admin/team-limits                  → the figure per kind of employer + every employer with his own override
 *  PUT /api/admin/team-limits/role  {role, max|null}   → one figure for a whole kind (null = back to the built-in one)
 *  PUT /api/admin/team-limits/user/:id {max|null}      → one person (beats his kind; null = back to his kind's figure)
 * Lowering a limit never removes anyone: it only stops new additions until the team is under the figure again.
 */
export function createTeamLimitsRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  r.use(needs('admin:control_center'));
  r.use((_req: Request, res: Response, next) => (isSuper(me()) ? next() : res.status(403).json({ error: 'Only the superadmin sets team limits', code: 'SUPERADMIN_ONLY' })));
  const used = (id: string) => db.getState().users.filter(x => x.role === 'TEAM_MEMBER' && x.employerId === id && x.verificationStatus !== 'REJECTED').length;
  const view = () => {
    const s = db.getState();
    return {
      roles: TEAM_CAP_ROLES.map(role => ({ role, cap: teamMaxFor(role, s.settings.teamMaxByRole), builtIn: teamMaxFor(role), custom: s.settings.teamMaxByRole?.[role] ?? null })),
      employers: s.users.filter(x => (TEAM_CAP_ROLES as readonly string[]).includes(x.role) && x.verificationStatus !== 'REJECTED')
        .map(x => ({ id: x.id, name: x.name, role: x.role, city: x.city, used: used(x.id), cap: capOf(x), override: x.teamMaxOverride ?? null }))
        .sort((a, b) => (b.override !== null ? 1 : 0) - (a.override !== null ? 1 : 0) || b.used - a.used || a.name.localeCompare(b.name)).slice(0, 400),
    };
  };
  r.get('/', (_req: Request, res: Response) => res.json({ success: true, ...view() }));
  r.put('/role', (req: Request, res: Response) => {
    const u = me(); const role = String(req.body?.role || '');
    if (!(TEAM_CAP_ROLES as readonly string[]).includes(role)) return res.status(400).json({ error: 'Pick broker, builder or contractor' });
    const s = db.getState().settings; const before = teamMaxFor(role, s.teamMaxByRole);
    if (req.body?.max === null) { if (s.teamMaxByRole) { delete s.teamMaxByRole[role]; if (!Object.keys(s.teamMaxByRole).length) delete s.teamMaxByRole; } }
    else { const p = teamCapProblem(req.body?.max); if (p) return res.status(400).json({ error: p }); s.teamMaxByRole = { ...(s.teamMaxByRole || {}), [role]: req.body.max }; }
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', `TEAM-LIMIT-${role}`, 'TEAM_LIMIT_CHANGED', `Team limit for ${role}: ${before} → ${teamMaxFor(role, s.teamMaxByRole)}. Nobody is removed; only new additions are held back while a team is over the figure.`);
    res.json({ success: true, ...view() });
  });
  r.put('/user/:id', (req: Request, res: Response) => {
    const u = me(); const t = db.getState().users.find(x => x.id === req.params.id && (TEAM_CAP_ROLES as readonly string[]).includes(x.role));
    if (!t) return res.status(404).json({ error: 'Broker, builder or contractor not found' });
    const before = capOf(t);
    if (req.body?.max === null) delete t.teamMaxOverride;
    else { const p = teamCapProblem(req.body?.max); if (p) return res.status(400).json({ error: p }); t.teamMaxOverride = req.body.max; }
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', t.id, 'TEAM_LIMIT_CHANGED', `Team limit for ${t.name} (${t.role}): ${before} → ${capOf(t)}${t.teamMaxOverride === undefined ? ' (his kind\'s figure)' : ' (his own figure)'}`);
    res.json({ success: true, ...view() });
  });
  return r;
}
