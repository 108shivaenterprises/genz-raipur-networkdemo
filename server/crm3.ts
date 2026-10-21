/**
 * v16.7 — Sales Desk: telecaller call log + call list, and forwarding a lead to the next executive / coordinator.
 *
 * Mounted at /api/crm BEFORE the v16 and base CRM routers.
 *
 *  • POST /leads/:id/call      — a telecaller's structured call result (spoke / no answer / wrong number / visit fixed …).
 *                                It moves a NEW lead forward, books the follow-up the outcome calls for, and keeps a count of tries.
 *  • GET  /call-queue          — "who do I call next": overdue follow-ups first, then fresh leads nobody has called yet.
 *  • POST /leads/:id/forward   — hand the lead to a teammate with a note (what was done, what next). The history is kept,
 *                                the receiver sees it as "forwarded to you" until they open it, and the owner sees if it sits unseen.
 *
 * A team member only ever works leads their employer allotted to them; forwarding stays inside the same employer's team.
 */
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { needs } from './auth.js';
import { isAdmin } from './access.js';
import { policyOf } from '../src/shared/pcontrolRules.js';
import { leadsForUser, canWork, auditCrm, currentUser, viewLead, nowIso, autoFollowUp } from './crm.js';
import { ownerIdOf, membersOf, openLoad } from './leadflow.js';
import { isOpenStage } from '../src/shared/crmRules.js';
import {
  CALL_OUTCOMES, callOutcome, callStats, MAX_CALL_ATTEMPTS, FORWARD_PURPOSES, FORWARD_PURPOSE_IDS, MAX_HANDOFFS, inferTeamRole, optLabel,
} from '../src/shared/crmSales.js';
import type { CrmLead, CrmHandoff } from '../src/types/crm.js';

const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json(code ? { error, code } : { error });
const me = currentUser;
const rid = (p: string) => `${p}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
const DAY = 86400_000;

export function createCrmSalesRouter() {
  const r = Router();
  r.use(needs('crm:read'));

  const loadLead = (req: Request, res: Response): CrmLead | null => {
    const u = me(); const lead = leadsForUser(u).find(l => l.id === req.params.id);
    if (!lead || !canWork(u, lead)) { bad(res, 'Lead not found', 404); return null; }
    return lead;
  };
  const nextFu = (l: CrmLead) => { l.nextFollowUpAt = l.followUps.filter(f => !f.done).map(f => f.dueAt).sort()[0]; };

  // ═════════════════════════ telecaller: log a call ═════════════════════════
  r.post('/leads/:id/call', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    if (lead.optedOutAt || lead.erasedAt) return bad(res, 'This customer opted out of contact — calls cannot be logged', 409, 'OPTED_OUT');
    if (lead.stage === 'LOST') return bad(res, 'This lead is marked lost', 409);
    const b = req.body || {};
    const oc = callOutcome(String(b.outcome || ''));
    if (!oc) return bad(res, 'Pick what happened on the call: ' + CALL_OUTCOMES.map(o => o.id).join(', '));
    const note = String(b.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (b.durationMin !== undefined && b.durationMin !== '' && b.durationMin !== null) {
      const d = Number(b.durationMin); if (!Number.isInteger(d) || d < 0 || d > 600) return bad(res, 'Call length must be a whole number of minutes (0–600)');
    }
    let when: string | undefined;
    if (oc.needsWhen) {
      const t = Date.parse(String(b.when || ''));
      if (!Number.isFinite(t)) return bad(res, oc.needsWhen === 'VISIT' ? 'Give the date and time the customer will visit' : 'Give the date and time to call back');
      if (t < Date.now() - 5 * 60_000) return bad(res, 'That time has already passed');
      if (t > Date.now() + 120 * DAY) return bad(res, 'Pick a date within the next 120 days');
      when = new Date(t).toISOString();
    }
    const ts = nowIso();
    const before = callStats(lead);
    const attempt = before.attempts + 1;
    const dur = b.durationMin === undefined || b.durationMin === '' || b.durationMin === null ? undefined : Number(b.durationMin);
    lead.activities.unshift({
      id: rid('A'), type: 'CALL', note: `${oc.en}${note ? `: ${note}` : ''}`, byUserId: u.id, byName: u.name, at: ts,
      call: { outcome: oc.id, ...(dur !== undefined ? { durationMin: dur } : {}), attempt },
    });
    const sys = (t: string) => lead.activities.unshift({ id: rid('A'), type: 'SYSTEM', note: t, byUserId: u.id, byName: u.name, at: ts });
    const addFu = (dueAt: string, text: string, channel: 'CALL' | 'SITE_VISIT') => { lead.followUps.push({ id: rid('FU'), dueAt, note: text, channel, done: false, createdBy: u.id }); };
    // answering a follow-up that was due: the call itself closes the open "call" reminder that is already due
    for (const f of lead.followUps) if (!f.done && f.channel === 'CALL' && Date.parse(f.dueAt) <= Date.now()) { f.done = true; f.doneAt = ts; }

    let suggest: 'LOST' | 'TRY_WHATSAPP' | 'FIX_NUMBER' | undefined;
    if (oc.id === 'VISIT_FIXED') {
      addFu(when!, note || 'Site visit', 'SITE_VISIT');
      if (['NEW', 'CONTACTED'].includes(lead.stage)) { const prev = lead.stage; lead.stage = 'SITE_VISIT_SCHEDULED'; sys(`Stage ${prev} → SITE_VISIT_SCHEDULED (visit fixed on the call)`); }
    } else if (oc.id === 'CALLBACK') {
      addFu(when!, note || 'Call back as agreed', 'CALL');
      if (lead.stage === 'NEW') { lead.stage = 'CONTACTED'; sys('Stage NEW → CONTACTED (first call)'); }
    } else if (oc.connected) {
      if (lead.stage === 'NEW') { lead.stage = 'CONTACTED'; sys('Stage NEW → CONTACTED (first call)'); autoFollowUp(lead, 'CONTACTED', u); }
      if (oc.id === 'NOT_INTERESTED') suggest = 'LOST';
    } else if (oc.id === 'WRONG_NUMBER') {
      lead.tags = [...new Set([...(lead.tags || []), 'wrong-number'])].slice(0, 5);
      suggest = 'FIX_NUMBER';
    } else {
      const after = callStats(lead);
      if (after.unreached) { sys(`${after.attempts} calls and never reached — try WhatsApp or mark the lead “not responding”`); suggest = 'TRY_WHATSAPP'; }
      else if (oc.retryHours && !lead.followUps.some(f => !f.done)) addFu(new Date(Date.now() + oc.retryHours * 3600_000).toISOString(), `Retry call (${oc.en.toLowerCase()})`, 'CALL');
    }
    nextFu(lead);
    lead.updatedAt = ts;
    db.save();
    res.json({ success: true, lead: viewLead(lead, u), suggest, attemptsLeft: Math.max(0, MAX_CALL_ATTEMPTS - callStats(lead).attempts) });
  });

  // ═════════════════════════ telecaller: who to call next ═════════════════════════
  r.get('/call-queue', (req: Request, res: Response) => {
    const u = me(); const now = Date.now();
    const memberFilter = typeof req.query.memberId === 'string' && u.role !== 'TEAM_MEMBER' ? req.query.memberId : '';
    const leads = leadsForUser(u).filter(l => isOpenStage(l.stage) && l.stage !== 'BOOKING_REQUESTED' && !l.optedOutAt && !l.erasedAt && l.verify !== 'REJECTED' && (!memberFilter || l.assignedMemberId === memberFilter));
    type Row = { id: string; name: string; projectName: string; phone: string; phoneMasked?: boolean; stage: string; reason: 'FOLLOWUP_DUE' | 'NEW_UNCALLED' | 'TODAY'; dueAt?: string; followUpNote?: string; attempts: number; lastOutcome?: string; lastCallAt?: string; source: string; temperature?: string; assignedMemberName?: string; forwardUnseen: boolean; detailsFilled: number; detailsTotal: number; createdAt: string };
    const rows: Row[] = [];
    for (const l of leads) {
      const v = viewLead(l, u); const open = l.followUps.filter(f => !f.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      const due = open[0]; const cs = callStats(l);
      let reason: Row['reason'] | null = null; let dueAt: string | undefined; let followUpNote: string | undefined;
      if (due && Date.parse(due.dueAt) <= now) { reason = 'FOLLOWUP_DUE'; dueAt = due.dueAt; followUpNote = due.note; }
      else if (l.stage === 'NEW' && cs.attempts === 0 && !l.activities.some(a => ['WHATSAPP', 'MEETING'].includes(a.type))) { reason = 'NEW_UNCALLED'; }
      else if (due && Date.parse(due.dueAt) <= now + DAY) { reason = 'TODAY'; dueAt = due.dueAt; followUpNote = due.note; }
      if (!reason) continue;
      rows.push({
        id: l.id, name: l.name, projectName: l.projectName, phone: v.phone, phoneMasked: v.phoneMasked, stage: l.stage, reason, dueAt, followUpNote, attempts: cs.attempts, lastOutcome: cs.lastOutcome, lastCallAt: cs.lastAt,
        source: l.source, temperature: l.temperature, assignedMemberName: l.assignedMemberName, forwardUnseen: !!v.forwardUnseen, detailsFilled: v.detailsFilled || 0, detailsTotal: v.detailsTotal || 10, createdAt: l.createdAt,
      });
    }
    const rank = { FOLLOWUP_DUE: 0, NEW_UNCALLED: 1, TODAY: 2 } as const;
    rows.sort((a, b) => (Number(b.forwardUnseen) - Number(a.forwardUnseen)) || rank[a.reason] - rank[b.reason] || (a.dueAt || a.createdAt).localeCompare(b.dueAt || b.createdAt));
    const counts = { due: rows.filter(x => x.reason === 'FOLLOWUP_DUE').length, fresh: rows.filter(x => x.reason === 'NEW_UNCALLED').length, today: rows.filter(x => x.reason === 'TODAY').length };
    res.json({ success: true, queue: rows.slice(0, 100), total: rows.length, counts });
  });

  // ═════════════════════════ forward to the next executive / coordinator ═════════════════════════
  /** Teammates a lead can be forwarded to (never the person holding it). Contact-free: name, role, load. */
  r.get('/leads/:id/forward-targets', (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    const ownerId = ownerIdOf(lead);
    const out = membersOf(ownerId).filter(m => m.verificationStatus === 'VERIFIED' && m.id !== lead.assignedMemberId).map(m => {
      const p = policyOf(m);
      const blocked = p.onLeave ? 'on leave' : (p.maxOpenLeads && openLoad(m.id) >= p.maxOpenLeads) ? 'open-lead limit reached' : (p.projectIds.length && !p.projectIds.includes(lead.projectId)) ? 'not on this project' : '';
      return { id: m.id, name: m.name, title: m.teamTitle || '', role: inferTeamRole(m.teamTitle, m.teamRole), openLeads: openLoad(m.id), blocked };
    });
    res.json({ success: true, targets: out, current: lead.assignedMemberId ? { id: lead.assignedMemberId, name: lead.assignedMemberName } : null, canForwardNow: canForward(u, lead) === '' });
  });

  /** '' when the caller may forward this lead, else why not. */
  function canForward(u: ReturnType<typeof me>, lead: CrmLead): string {
    if (lead.stage === 'LOST') return 'This lead is marked lost';
    if (lead.optedOutAt || lead.erasedAt) return 'This customer opted out of contact';
    if (isAdmin(u as any)) return 'Admins do not work leads';
    if (u.role === 'TEAM_MEMBER') {
      if (lead.assignedMemberId !== u.id) return 'This lead is not allotted to you';
      if (!policyOf(db.byId('users', u.id)).canForward) return 'Your employer has not allowed you to forward leads';
      return '';
    }
    if (u.role === 'BROKER') return lead.associateId === u.id ? '' : 'Only the associate who owns this lead can forward it';
    if (u.role === 'DEVELOPER_BUILDER') return lead.builderId === u.id && !lead.associateId ? '' : 'This lead belongs to a sales associate — they forward it within their own team';
    return 'Not permitted';
  }

  r.post('/leads/:id/forward', needs('crm:lead_manage'), (req: Request, res: Response) => {
    const u = me(); const lead = loadLead(req, res); if (!lead) return;
    const why = canForward(u, lead); if (why) return bad(res, why, 403);
    const b = req.body || {};
    const to = db.getState().users.find(x => x.id === String(b.toMemberId || ''));
    const ownerId = ownerIdOf(lead);
    if (!to || to.role !== 'TEAM_MEMBER' || to.employerId !== ownerId || to.verificationStatus !== 'VERIFIED') return bad(res, 'Pick an active member of the same team');
    if (to.id === lead.assignedMemberId) return bad(res, 'The lead is already with this person', 409);
    const purpose = FORWARD_PURPOSE_IDS.includes(b.purpose) ? b.purpose : 'FOLLOW_UP';
    const note = String(b.note ?? '').replace(/\s+/g, ' ').trim();
    if (note.length < 5) return bad(res, 'Write what you did and what the next person should do (min 5 characters)');
    if (note.length > 400) return bad(res, 'Keep the hand-off note under 400 characters');
    const p = policyOf(to as UserProfile);
    if (p.onLeave) return bad(res, `${to.name} is on leave`, 409);
    if (p.maxOpenLeads && openLoad(to.id) >= p.maxOpenLeads) return bad(res, `${to.name} has reached the open-lead limit`, 409);
    if (p.projectIds.length && !p.projectIds.includes(lead.projectId)) return bad(res, `${to.name} is not assigned to this project`, 409);
    const ts = nowIso();
    const fromId = lead.assignedMemberId || u.id; const fromName = lead.assignedMemberName || u.name;
    const ho: CrmHandoff = { id: rid('HO'), at: ts, fromId, fromName, toId: to.id, toName: to.name, purpose, note };
    lead.handoffs = [ho, ...(lead.handoffs || [])].slice(0, MAX_HANDOFFS);
    lead.assignedMemberId = to.id; lead.assignedMemberName = to.name;
    lead.activities.unshift({ id: rid('A'), type: 'SYSTEM', note: `Forwarded ${fromName} → ${to.name} (${optLabel(FORWARD_PURPOSES, purpose, false)}): ${note}`, byUserId: u.id, byName: u.name, at: ts });
    lead.updatedAt = ts;
    db.save();
    auditCrm('CRM_LEAD_FORWARDED', lead.id, `${u.name}: ${lead.name} forwarded ${fromName} → ${to.name} (${purpose})`);
    // the sender usually loses sight of the lead (a team member only sees what is allotted to them) — return a small receipt, not the lead
    res.json({ success: true, forwardedTo: { id: to.id, name: to.name }, handoff: { id: ho.id, at: ho.at, purpose } });
  });

  return r;
}
