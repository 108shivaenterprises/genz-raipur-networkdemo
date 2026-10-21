/**
 * v16.8 — GENZ network launch.   /api/launch
 *
 * A builder can sign GENZ as a channel partner (offline). GENZ then launches the project to the network in waves:
 * big RERA firms → independent RERA brokers → (optionally) a local-associate teaser. Rules that never bend:
 *  1. The BUILDER must say yes first (request from the desk → builder grants, or the builder invites GENZ). No consent, no launch.
 *  2. A launch only decides WHO CAN SEE and APPLY. The builder still approves every partner and sets the commission; GENZ
 *     takes no commission, handles no money and never sells to a buyer.
 *  3. Local associates (no RERA no.) never get a selling window — RERA law covers agents who sell registered projects. At most
 *     a teaser (name, place, date), switched on by the desk. Their tier cannot be overridden by anyone.
 *  4. A partner who already has a mandate keeps it, whatever the launch plan says.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { hasFeature } from './billing.js';
import type { BuilderProject, UserProfile } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { mandateIsActive } from '../src/shared/pcontrolRules.js';
import { tierOf } from '../src/shared/networkRules.js';
import {
  SEGMENTS, segmentOf, launchView, launchControls, cleanPlanInput, emptyPlan, pushHistory, type LaunchPlan, type Segment,
} from '../src/shared/launchRules.js';

const nowIso = () => new Date().toISOString();
const VISIBLE_STATUS = ['ACTIVE_LAUNCH', 'PRE_BOOKING'];

export const activeStaff = (employerId: string) =>
  db.getState().users.filter(x => x.role === 'TEAM_MEMBER' && x.employerId === employerId && x.verificationStatus === 'VERIFIED').length;
export const segmentFor = (u: UserProfile): Segment | null => segmentOf(u, activeStaff(u.id));
/** v23: an independent RERA broker whose plan includes "early access" sees launches in the big-firm wave (local associates never get a selling window) */
const launchSegmentFor = (u: UserProfile): Segment | null => { const seg = segmentFor(u); return seg === 'INDEPENDENT' && hasFeature(u, 'LAUNCH_EARLY') ? 'BIG_FIRM' : seg; };

/** Used by the partner project list: may a broker WITHOUT a mandate see / apply to this project right now? */
export function launchGate(p: BuilderProject, broker: UserProfile, now = Date.now()): 'LEGACY' | 'OPEN' | 'CLOSED' {
  if (!launchControls(p.launch)) return 'LEGACY';
  const seg = launchSegmentFor(broker);
  return seg && launchView(p.launch, seg, now) === 'OPEN' ? 'OPEN' : 'CLOSED';
}

const requestSchema = z.object({ note: z.string().trim().max(300).default('') });
const statusSchema = z.object({ status: z.enum(['DRAFT', 'LIVE', 'PAUSED', 'CLOSED']), note: z.string().trim().max(200).default('') });

export function createLaunchRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const st = () => db.getState();
  const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ error: msg });
  const audit = (id: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', id, action, details); };

  const planRow = (p: BuilderProject) => ({
    id: p.id, projectName: p.projectName, builderName: p.builderName, city: p.city, locality: p.locality, status: p.status, access: p.access || 'OPEN_APPLY',
    priceStartingFrom: p.priceStartingFrom, priceMax: p.priceMax, commissionPct: p.channelPartnerCommissionPct, hasRera: !!p.reraNumber,
    partners: st().associateMandates.filter(m => m.projectId === p.id && mandateIsActive(m)).length,
    plan: p.launch ? { ...p.launch } : undefined,
  });

  // ═════════════════ GENZ desk ═════════════════
  r.get('/admin/projects', needs('launch:manage'), (_req, res) => {
    const rows = st().builderProjects.filter(p => p.status !== 'ARCHIVED').map(planRow)
      .sort((a, b) => (a.plan?.status === 'LIVE' ? 0 : 1) - (b.plan?.status === 'LIVE' ? 0 : 1) || a.projectName.localeCompare(b.projectName));
    res.json({ success: true, projects: rows });
  });

  /** Who is in which group (names and city only — no phone, no e-mail). */
  r.get('/admin/segments', needs('launch:manage'), (_req, res) => {
    // v20: staff counted once for everybody (it re-scanned all users for every broker)
    const staffOf = new Map<string, number>();
    for (const x of st().users) if (x.role === 'TEAM_MEMBER' && x.employerId && x.verificationStatus === 'VERIFIED') staffOf.set(x.employerId, (staffOf.get(x.employerId) || 0) + 1);
    const members = st().users.filter(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED').map(u => {
      const staff = staffOf.get(u.id) || 0;
      return { id: u.id, name: u.name, company: u.companyName || '', city: u.city, staff, segment: segmentOf(u, staff) as Segment, override: u.firmSegment, tier: tierOf(u) };
    });
    const counts: Record<Segment, number> = { BIG_FIRM: 0, INDEPENDENT: 0, LOCAL: 0 };
    for (const m of members) counts[m.segment]++;
    res.json({ success: true, counts, members: members.sort((a, b) => a.segment.localeCompare(b.segment) || a.name.localeCompare(b.name)) });
  });

  r.put('/admin/partners/:id/segment', needs('launch:manage'), (req: Request, res: Response) => {
    const u = st().users.find(x => x.id === req.params.id && x.role === 'BROKER');
    if (!u) return bad(res, 'Partner not found', 404);
    if (tierOf(u) === 'TIER2') return bad(res, 'A local associate (no RERA no.) cannot be moved to a RERA group — add the RERA registration first', 409);
    const seg = req.body?.segment;
    if (seg !== null && seg !== 'BIG_FIRM' && seg !== 'INDEPENDENT') return bad(res, 'Segment must be BIG_FIRM, INDEPENDENT or null (automatic)');
    if (seg === null) delete u.firmSegment; else u.firmSegment = seg;
    db.save();
    audit(u.id, 'LAUNCH_SEGMENT_SET', `${me().name} set ${u.name} to ${seg ?? 'automatic (by team size)'}`);
    res.json({ success: true, segment: segmentFor(u) });
  });

  r.post('/admin/projects/:id/request', needs('launch:manage'), rateLimit('launch-req', 40, 24 * 3600_000), (req: Request, res: Response) => {
    const p = db.byId('builderProjects', req.params.id);
    if (!p || p.status === 'ARCHIVED') return bad(res, 'Project not found', 404);
    const parsed = requestSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid request');
    const plan = p.launch ?? emptyPlan();
    if (plan.consent === 'GRANTED') return bad(res, 'The builder has already agreed — plan the launch', 409);
    if (plan.consent === 'REQUESTED') return bad(res, 'A request is already waiting for the builder', 409);
    plan.consent = 'REQUESTED'; plan.requestedBy = me().name; plan.requestedAt = nowIso(); plan.requestNote = parsed.data.note; plan.decidedAt = undefined; plan.decidedBy = undefined;
    pushHistory(plan, me().name, 'Asked the builder to let GENZ launch this project to the network');
    p.launch = plan; db.save();
    audit(p.id, 'LAUNCH_REQUESTED', `${me().name} asked ${p.builderName} for permission to launch ${p.projectName} on the GENZ network`);
    res.json({ success: true, plan });
  });

  r.put('/admin/projects/:id/plan', needs('launch:manage'), (req: Request, res: Response) => {
    const p = db.byId('builderProjects', req.params.id);
    if (!p || p.status === 'ARCHIVED') return bad(res, 'Project not found', 404);
    if (!p.launch || p.launch.consent !== 'GRANTED') return bad(res, 'The builder has not agreed to a GENZ launch yet', 409);
    const next = cleanPlanInput(req.body || {}, p.launch);
    if (typeof next === 'string') return bad(res, next);
    pushHistory(next, me().name, `Launch plan edited${p.launch.status === 'LIVE' ? ' (while live)' : ''}`);
    p.launch = next; db.save();
    audit(p.id, 'LAUNCH_PLAN_SET', `${me().name} set the launch plan of ${p.projectName}: big firms ${next.waves.BIG_FIRM.on ? next.waves.BIG_FIRM.at.slice(0, 10) : 'off'}, independents ${next.waves.INDEPENDENT.on ? next.waves.INDEPENDENT.at.slice(0, 10) : 'off'}, locals ${next.waves.LOCAL.mode}`);
    res.json({ success: true, plan: next });
  });

  r.post('/admin/projects/:id/status', needs('launch:manage'), (req: Request, res: Response) => {
    const p = db.byId('builderProjects', req.params.id);
    if (!p || p.status === 'ARCHIVED') return bad(res, 'Project not found', 404);
    const plan = p.launch;
    if (!plan || plan.consent !== 'GRANTED') return bad(res, 'The builder has not agreed to a GENZ launch yet', 409);
    const parsed = statusSchema.safeParse(req.body || {});
    if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid status');
    const to = parsed.data.status;
    if (to === 'LIVE') {
      if (!VISIBLE_STATUS.includes(p.status)) return bad(res, 'This project is not taking new partners (status must be Active launch or Pre-booking)', 409);
      if ((p.access || 'OPEN_APPLY') !== 'OPEN_APPLY') return bad(res, 'The builder set this project to invite-only. Ask the builder to open it to applications first.', 409);
    }
    if (plan.status === to) return bad(res, `Already ${to.toLowerCase()}`, 409);
    plan.status = to;
    pushHistory(plan, me().name, `Launch ${to.toLowerCase()}${parsed.data.note ? ` — ${parsed.data.note}` : ''}`);
    db.save();
    audit(p.id, `LAUNCH_${to}`, `${me().name} set the GENZ launch of ${p.projectName} to ${to}${parsed.data.note ? `: ${parsed.data.note}` : ''}`);
    res.json({ success: true, plan });
  });

  // ═════════════════ builder ═════════════════
  const ownProject = (u: UserProfile, id: string) => {
    const p = db.byId('builderProjects', id);
    return p && u.role === 'DEVELOPER_BUILDER' && p.builderId === u.id ? p : undefined;
  };

  r.get('/builder/projects', needs('pcontrol:manage'), (_req, res) => {
    const u = me();
    const rows = st().builderProjects.filter(p => p.builderId === u.id && p.status !== 'ARCHIVED').map(p => ({
      id: p.id, projectName: p.projectName, status: p.status, access: p.access || 'OPEN_APPLY',
      plan: p.launch ? { consent: p.launch.consent, status: p.launch.status, headline: p.launch.headline, requestedBy: p.launch.requestedBy, requestedAt: p.launch.requestedAt, requestNote: p.launch.requestNote, decidedAt: p.launch.decidedAt, waves: p.launch.waves, history: p.launch.history.slice(0, 8) } : undefined,
    }));
    res.json({ success: true, projects: rows });
  });

  r.post('/builder/projects/:id/consent', needs('pcontrol:manage'), (req: Request, res: Response) => {
    const u = me(); const p = ownProject(u, req.params.id);
    if (!p) return bad(res, 'Project not found', 404);
    const decision = req.body?.decision;
    const note = String(req.body?.note || '').trim().slice(0, 200);
    if (!['GRANT', 'DECLINE', 'WITHDRAW'].includes(decision)) return bad(res, 'Decision must be GRANT, DECLINE or WITHDRAW');
    const plan = p.launch ?? emptyPlan();
    const at = nowIso();
    if (decision === 'GRANT') {
      if (plan.consent === 'GRANTED') return bad(res, 'Already agreed', 409);
      plan.consent = 'GRANTED'; plan.decidedBy = u.name; plan.decidedAt = at;
      pushHistory(plan, u.name, plan.requestedAt ? 'Builder agreed to the GENZ launch' : 'Builder invited GENZ to launch this project', at);
    } else if (decision === 'DECLINE') {
      if (plan.consent !== 'REQUESTED') return bad(res, 'There is no pending request to decline', 409);
      plan.consent = 'DECLINED'; plan.decidedBy = u.name; plan.decidedAt = at;
      pushHistory(plan, u.name, `Builder declined the GENZ launch${note ? ` — ${note}` : ''}`, at);
    } else {
      if (plan.consent !== 'GRANTED') return bad(res, 'Nothing to withdraw', 409);
      plan.consent = 'DECLINED'; plan.status = 'CLOSED'; plan.decidedBy = u.name; plan.decidedAt = at;
      pushHistory(plan, u.name, `Builder withdrew the permission — launch closed${note ? ` — ${note}` : ''}`, at);
    }
    p.launch = plan; db.save();
    audit(p.id, `LAUNCH_CONSENT_${decision}`, `${u.name} ${decision === 'GRANT' ? 'agreed to' : decision === 'DECLINE' ? 'declined' : 'withdrew'} a GENZ network launch of ${p.projectName}${note ? `: ${note}` : ''}`);
    res.json({ success: true, consent: plan.consent, status: plan.status });
  });

  // ═════════════════ partners ═════════════════
  /** Launches open to the caller's group right now (and what is coming). Local associates get the teaser board only. */
  r.get('/feed', needs('launch:read'), (_req, res) => {
    const u = me(); const seg = launchSegmentFor(u);
    if (!seg || u.verificationStatus !== 'VERIFIED') return res.json({ success: true, segment: seg, items: [] });
    const now = Date.now();
    const items: any[] = [];
    for (const p of st().builderProjects) {
      if (!p.launch || p.status === 'ARCHIVED') continue;
      const view = launchView(p.launch, seg, now);
      if (view === 'HIDDEN') continue;
      const m = st().associateMandates.find(x => x.projectId === p.id && x.brokerId === u.id);
      const base = { id: p.id, projectName: p.projectName, city: p.city, locality: p.locality, headline: p.launch.headline, view };
      if (view === 'OPEN') {
        items.push({ ...base, builderName: p.builderName, projectType: p.projectType, projectStage: p.projectStage, launchDate: p.launchDate, priceStartingFrom: p.priceStartingFrom, priceMax: p.priceMax, defaultCommissionPct: p.channelPartnerCommissionPct, note: p.launch.note, relation: m?.status || 'NONE' });
      } else if (view === 'SOON') {
        items.push({ ...base, opensAt: (p.launch.waves as any)[seg].at });
      } else {
        items.push({ ...base, projectType: p.projectType, projectStage: p.projectStage, launchDate: p.launchDate, opensAt: p.launch.waves.LOCAL.at });
      }
    }
    items.sort((a, b) => (a.view === 'OPEN' ? 0 : 1) - (b.view === 'OPEN' ? 0 : 1) || a.projectName.localeCompare(b.projectName));
    res.json({ success: true, segment: seg, items });
  });

  return r;
}
