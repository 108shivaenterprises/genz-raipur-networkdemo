/**
 * v76 — HR for the people a broker / builder / contractor employs (mounted at /api/hr).
 *
 *   attendance  one punch-in a day with GPS + a small selfie (the file is dropped after 30 days, the row stays); the employer can also mark a day by hand
 *   leave       a member asks, the employer approves or rejects; an approved leave covering today puts him "on leave" (his open leads go back / to the rest of the team)
 *   targets     a monthly goal (calls / site visits / bookings) against what the CRM already knows he did
 *   statement   a month's pay slip the employer builds, edits and PUBLISHES; the member sees it only after that, and never sees brokerage
 *   claims      petrol / travel / food / site expenses: member files, employer approves, then marks paid (GENZ moves no money)
 *   assets      what the employer handed over (phone, SIM, keys, brochures …) and whether it came back
 *   holidays    the employer's own list on top of four fixed national days
 *
 * Who gets what is decided by hrFeaturesFor(employer role) in src/shared/hrRules.ts: a broker and a builder get everything, a contractor no targets / statement.
 * An employer sees only his own people; a member sees only himself. Everything that changes a person's record is in the audit trail.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from './db.js';
import type { UserProfile, HrAttendance, HrLeave, HrStatement, HrClaim, HrAsset, HrSettings } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { alert, firstName } from './alerts.js';
import { releaseMemberLeads } from './leadflow.js';
import { sniffMime } from '../src/shared/propDocs.js';
import { inferTeamRole } from '../src/shared/crmSales.js';
import { policyOf } from '../src/shared/pcontrolRules.js';
import * as H from '../src/shared/hrRules.js';

type DbState = ReturnType<typeof db.getState>;
const me = () => ctx().user as UserProfile;
const S = () => db.getState();
const nowIso = () => new Date().toISOString();
const bad = (res: Response, msg: string, code = 400) => res.status(code).json({ error: msg });
const audit = (action: string, id: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'VERIFICATION', id, action, details); };
const rid = (p: string) => `${p}-${crypto.randomBytes(6).toString('hex')}`;
const userById = (id: string) => S().users.find(u => u.id === id);

// ───────────────────────── people & settings ─────────────────────────
/** an employer's own people. `all` also returns suspended ones (their old records still matter) */
const staff = (employerId: string, all = false) => S().users.filter(u => u.role === 'TEAM_MEMBER' && u.employerId === employerId && (all ? u.verificationStatus !== 'REJECTED' : u.verificationStatus === 'VERIFIED'));
const staffOne = (employerId: string, id: string) => staff(employerId, true).find(m => m.id === id);
const joinedOf = (m: UserProfile) => { const t = Date.parse(m.createdAt); return Number.isNaN(t) ? undefined : H.istParts(t).date; };
const who = (m: UserProfile) => ({ id: m.id, name: m.name, teamTitle: m.teamTitle || '', teamRole: inferTeamRole(m.teamTitle, m.teamRole) });

export function settingsOf(employerId: string): H.HrSettingsLike {
  const r = S().hrSettings.find(x => x.employerId === employerId);
  const d = H.DEFAULT_HR_SETTINGS;
  return r
    ? { workStart: r.workStart, graceMin: r.graceMin, weeklyOff: [...r.weeklyOff], leaveAllowance: r.leaveAllowance, holidays: r.holidays.map(h => ({ ...h })), mutedNational: [...r.mutedNational], selfie: r.selfie }
    : { ...d, weeklyOff: [...d.weeklyOff], holidays: [], mutedNational: [] };
}
/** the next few holidays (own + national) from `from`, for the "coming up" strip */
function upcomingHolidays(st: H.HrSettingsLike, from: string, n = 5, horizon = 200): H.HrHoliday[] {
  const out: H.HrHoliday[] = [];
  for (let i = 0; i < horizon && out.length < n; i++) { const d = H.addDays(from, i); const l = H.holidayOn(st, d); if (l) out.push({ date: d, label: l }); }
  return out;
}

// ───────────────────────── selfie files ─────────────────────────
const SELFIE_DIR = () => path.resolve(process.cwd(), 'data', 'hrselfies');
const selfieFile = (id: string) => path.join(SELFIE_DIR(), `${id}.jpg`);
const SELFIE_MAX = 120 * 1024;
export const SELFIE_KEEP_DAYS = 30;
function saveSelfie(id: string, data: unknown): string | null {
  const raw = String(data ?? '').replace(/^data:image\/jpeg;base64,/, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(raw) || raw.length < 200) return 'A selfie is needed to mark the day — take it again';
  const buf = Buffer.from(raw, 'base64');
  if (buf.length > SELFIE_MAX) return 'The selfie is too big — take it again';
  if (sniffMime(buf) !== 'image/jpeg') return 'The selfie must be a photo (JPEG)';
  try { fs.mkdirSync(SELFIE_DIR(), { recursive: true }); const tmp = selfieFile(id) + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, selfieFile(id)); }
  catch { return 'The selfie could not be saved — try again'; }
  return null;
}
function dropSelfie(a: HrAttendance) { try { fs.unlinkSync(selfieFile(a.id)); } catch { /* already gone */ } a.inSelfie = undefined; }

// ───────────────────────── numbers from the CRM ─────────────────────────
const monthOfIso = (iso?: string) => { const t = Date.parse(iso || ''); return Number.isNaN(t) ? '' : H.istParts(t).date.slice(0, 7); };
interface Actual extends H.TargetSet { brokerage: number }
/** what each person did in a month, in one pass over the CRM: calls, site visits (incl. check-ins without a lead), approved bookings of leads he worked
 *  (+ the employer's brokerage on them — only a broker earns brokerage; it is used for the incentive and never shown to a member) */
export function actuals(employerId: string, ids: Set<string>, month: string): Map<string, Actual> {
  const s = S(); const out = new Map<string, Actual>();
  const A = (id: string) => out.get(id) || out.set(id, { calls: 0, visits: 0, bookings: 0, brokerage: 0 }).get(id)!;
  const holder = new Map<string, string>();
  for (const l of s.crmLeads) {
    if (l.assignedMemberId && ids.has(l.assignedMemberId)) holder.set(l.id, l.assignedMemberId);
    for (const a of l.activities) {
      if (!a.byUserId || !ids.has(a.byUserId) || monthOfIso(a.at) !== month) continue;
      if (a.type === 'CALL') A(a.byUserId).calls++;
      else if (a.type === 'SITE_VISIT') A(a.byUserId).visits++;
    }
  }
  for (const c of s.siteCheckins) if (!c.leadId && c.employerId === employerId && ids.has(c.userId) && monthOfIso(c.at) === month) A(c.userId).visits++;
  for (const b of s.crmBookings) {
    if (b.status !== 'APPROVED' || monthOfIso(b.decidedAt) !== month) continue;
    const h = holder.get(b.leadId); if (!h) continue;
    const x = A(h); x.bookings++;
    if (b.associateId === employerId) x.brokerage += b.brokerageAmount || 0;
  }
  return out;
}
const zero = (): Actual => ({ calls: 0, visits: 0, bookings: 0, brokerage: 0 });

// ───────────────────────── views ─────────────────────────
const attView = (a?: HrAttendance) => a ? { id: a.id, date: a.date, inAt: a.inAt, outAt: a.outAt, lateMin: a.lateMin || 0, hasSelfie: !!a.inSelfie, manual: a.manual, note: a.note } : null;
const leaveView = (l: HrLeave) => ({ id: l.id, userId: l.userId, userName: l.userName, from: l.from, to: l.to, days: l.days, type: l.type, reason: l.reason, status: l.status, createdAt: l.createdAt, decidedAt: l.decidedAt, decidedNote: l.decidedNote });
const claimView = (c: HrClaim) => ({ id: c.id, userId: c.userId, userName: c.userName, date: c.date, kind: c.kind, amount: c.amount, note: c.note, status: c.status, createdAt: c.createdAt, decidedAt: c.decidedAt, decidedNote: c.decidedNote, paidAt: c.paidAt });
const assetView = (a: HrAsset) => ({ id: a.id, userId: a.userId, userName: a.userName, kind: a.kind, label: a.label, serial: a.serial, givenOn: a.givenOn, note: a.note, ackAt: a.ackAt, returnedOn: a.returnedOn });
const stmtView = (x: HrStatement, forMember = false) => forMember
  ? { id: x.id, month: x.month, fixed: x.fixed, incentive: x.incentive, adjustments: x.adjustments, net: x.net, calls: x.calls, visits: x.visits, bookings: x.bookings, workingDays: x.workingDays, presentDays: x.presentDays, publishedAt: x.publishedAt, paidAt: x.paidAt }
  : { id: x.id, userId: x.userId, userName: x.userName, month: x.month, fixed: x.fixed, incentive: x.incentive, incentiveEdited: !!x.incentiveEdited, adjustments: x.adjustments, net: x.net, calls: x.calls, visits: x.visits, bookings: x.bookings, workingDays: x.workingDays, presentDays: x.presentDays, absentDays: x.absentDays, monthWorkDays: x.monthWorkDays, suggestDeduct: x.monthWorkDays ? Math.round(x.fixed / x.monthWorkDays * x.absentDays) : 0, published: x.published, publishedAt: x.publishedAt, paidAt: x.paidAt };

/** the paid-leave bookkeeping for one person */
const leavesOf = (userId: string) => S().hrLeaves.filter(l => l.userId === userId);
const covers = (l: { from: string; to: string; status: string }, date: string) => l.status === 'APPROVED' && l.from <= date && date <= l.to;
const monthParam = (q: unknown, today: string) => H.isMonth(q) ? q : today.slice(0, 7);
const charOf = (codes: Array<{ code: string }>) => codes.map(c => c.code).join('');

// ───────────────────────── the "on leave" switch ─────────────────────────
/** put a member on leave because an approved leave covers today; returns how many open leads went back / to the rest of the team */
function applyLeave(m: UserProfile): number {
  const owner = userById(m.employerId || ''); if (!owner) return 0;
  if (m.teamPolicy?.onLeave) return 0; // already on leave by the employer's own switch
  m.teamPolicy = { ...policyOf(m), onLeave: true, onLeaveBy: 'LEAVE' } as UserProfile['teamPolicy'];
  return releaseMemberLeads(owner, m, owner.id, owner.name);
}
function liftLeave(m: UserProfile) {
  if (m.teamPolicy?.onLeave && m.teamPolicy.onLeaveBy === 'LEAVE') m.teamPolicy = { ...m.teamPolicy, onLeave: false, onLeaveBy: undefined };
}
/** bring a member's switch in line with his approved leaves (called when a leave is decided / cancelled, and hourly) */
function syncLeave(m: UserProfile, today = H.istToday()): number {
  const on = leavesOf(m.id).filter(l => covers(l, today));
  if (on.length) { const moved = applyLeave(m); on.forEach(l => { l.applied = true; }); return moved; }
  liftLeave(m); return 0;
}

// ───────────────────────── the router ─────────────────────────
/** the hourly sweep also runs when someone opens the HR screens (at most once a minute) — so it works on a host with no timers too */
let lastSweepAt = 0;
function lazySweep() { if (Date.now() - lastSweepAt < 60_000) return; lastSweepAt = Date.now(); try { sweepHr(); } catch (e) { console.error('[HR] sweep failed', e); } }

export function createHrRouter() {
  const r = Router();
  r.use((_req: Request, _res: Response, next: NextFunction) => { lazySweep(); next(); });

  /** employer side: a broker / builder / contractor with HR on; `feature` narrows to one tool */
  const employer = (feature?: H.HrFeature) => (_req: Request, res: Response, next: NextFunction) => {
    const feats = H.hrFeaturesFor(me().role);
    if (!feats.length) return bad(res, 'HR tools are for brokers, builders and contractors', 403);
    if (feature && !feats.includes(feature)) return bad(res, 'This HR tool is not part of your account type', 403);
    next();
  };
  /** member side: only a TEAM_MEMBER whose employer is active and whose account type has the tool */
  const self = (feature?: H.HrFeature) => (_req: Request, res: Response, next: NextFunction) => {
    const u = me();
    if (u.role !== 'TEAM_MEMBER' || !u.employerId) return bad(res, 'These tools are for team members', 403);
    const emp = userById(u.employerId);
    if (!emp || emp.verificationStatus !== 'VERIFIED') return bad(res, 'Your employer\'s account is not active', 403);
    const feats = H.hrFeaturesFor(u.employerRole);
    if (!feats.length || (feature && !feats.includes(feature))) return bad(res, 'This tool is not available for your employer', 403);
    next();
  };
  const M = [needs('hr:manage'), employer()];
  const MF = (f: H.HrFeature) => [needs('hr:manage'), employer(f)];
  const I = [needs('hr:self'), self()];
  const IF = (f: H.HrFeature) => [needs('hr:self'), self(f)];

  // ═════════════ employer ═════════════
  /** the home of the People tab: today's board, what waits for a decision, and the coming holidays */
  r.get('/overview', ...M, (_req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.id); const now = Date.now(); const today = H.istToday(now);
    const feats = H.hrFeaturesFor(u.role); const people = staff(u.id);
    const todayRec = new Map(S().hrAttendance.filter(a => a.employerId === u.id && a.date === today).map(a => [a.userId, a]));
    const allLeaves = S().hrLeaves.filter(l => l.employerId === u.id);
    const board = people.map(m => {
      const rec = todayRec.get(m.id);
      const state = H.todayState(st, rec, allLeaves.filter(l => l.userId === m.id), now, joinedOf(m));
      return { ...who(m), state, inAt: rec?.inAt, outAt: rec?.outAt, lateMin: rec?.lateMin || 0, hasSelfie: !!rec?.inSelfie, attId: rec?.id, assetsOut: S().hrAssets.filter(a => a.userId === m.id && !a.returnedOn).length };
    });
    const count = (k: string) => board.filter(b => b.state === k).length;
    res.json({
      success: true, features: feats, settings: st, today, holiday: H.holidayOn(st, today), weeklyOff: H.isWeeklyOff(st, today), upcoming: upcomingHolidays(st, today),
      board, counts: { in: count('IN') + count('OUT'), late: count('LATE'), absent: count('ABSENT'), onLeave: count('ON_LEAVE'), notYet: count('NOT_YET'), half: count('HALF') },
      pending: {
        leaves: allLeaves.filter(l => l.status === 'PENDING').length,
        claims: feats.includes('CLAIMS') ? S().hrClaims.filter(c => c.employerId === u.id && c.status === 'PENDING').length : 0,
        toPay: feats.includes('CLAIMS') ? S().hrClaims.filter(c => c.employerId === u.id && c.status === 'APPROVED').length : 0,
      },
    });
  });

  r.get('/settings', ...M, (_req: Request, res: Response) => {
    const st = settingsOf(me().id);
    res.json({ success: true, settings: st, national: H.NATIONAL_HOLIDAYS, leaveTypes: H.LEAVE_TYPES });
  });
  r.put('/settings', ...M, (req: Request, res: Response) => {
    const u = me(); const cur = settingsOf(u.id);
    const clean = H.cleanSettings(req.body || {}, cur);
    if (typeof clean === 'string') return bad(res, clean);
    let rec = S().hrSettings.find(x => x.employerId === u.id);
    const row: HrSettings = { employerId: u.id, ...clean, updatedAt: nowIso() };
    if (rec) Object.assign(rec, row); else S().hrSettings.push(row);
    db.save();
    audit('HR_SETTINGS_SET', u.id, `${u.name}: work starts ${clean.workStart} (+${clean.graceMin} min), weekly off ${clean.weeklyOff.join(',') || 'none'}, ${clean.leaveAllowance} paid leave days, ${clean.holidays.length} own holiday(s), selfie ${clean.selfie}`);
    res.json({ success: true, settings: clean });
  });

  // ── attendance ──
  /** one month for everybody: a letter a day (P present · L late · H half · A absent · V leave · O off · - not yet) */
  r.get('/attendance', ...MF('ATTENDANCE'), (req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.id); const today = H.istToday(); const month = monthParam(req.query.month, today);
    const { from, days } = H.monthBounds(month);
    const recs = S().hrAttendance.filter(a => a.employerId === u.id && a.date.slice(0, 7) === month);
    const rows = staff(u.id, true).map(m => {
      const codes = H.monthCodes(st, month, recs.filter(a => a.userId === m.id), leavesOf(m.id), today, joinedOf(m));
      return { ...who(m), active: m.verificationStatus === 'VERIFIED', codes: charOf(codes), summary: H.summarize(codes.map(c => c.code)) };
    });
    res.json({ success: true, month, from, days, today, rows, legend: H.DAY_LABEL });
  });
  /** one day with times and where the phone was */
  r.get('/attendance/day', ...MF('ATTENDANCE'), (req: Request, res: Response) => {
    const u = me(); const today = H.istToday(); const date = H.isDate(req.query.date) ? String(req.query.date) : today;
    const recs = new Map(S().hrAttendance.filter(a => a.employerId === u.id && a.date === date).map(a => [a.userId, a]));
    const rows = staff(u.id).map(m => { const a = recs.get(m.id); return { ...(attView(a) || {}), ...who(m), attId: a?.id, lat: a?.inLat, lng: a?.inLng, accuracy: a?.inAcc, outLat: a?.outLat, outLng: a?.outLng }; });
    res.json({ success: true, date, rows });
  });
  r.get('/attendance/:id/selfie', ...MF('ATTENDANCE'), (req: Request, res: Response) => {
    const a = S().hrAttendance.find(x => x.id === req.params.id && x.employerId === me().id);
    if (!a?.inSelfie) return bad(res, `No selfie is kept for this day (selfies are deleted after ${SELFIE_KEEP_DAYS} days)`, 404);
    try { res.json({ success: true, selfie: 'data:image/jpeg;base64,' + fs.readFileSync(selfieFile(a.id)).toString('base64') }); }
    catch { bad(res, 'The selfie is no longer available', 404); }
  });
  /** the employer marks a day himself (the member forgot, or was on the road): PRESENT · HALF · ABSENT · CLEAR */
  r.post('/attendance/mark', ...MF('ATTENDANCE'), (req: Request, res: Response) => {
    const u = me(); const today = H.istToday();
    const m = staffOne(u.id, String(req.body?.userId || '')); if (!m) return bad(res, 'Team member not found', 404);
    const date = String(req.body?.date || today);
    if (!H.isDate(date) || date > today) return bad(res, 'Pick a day up to today');
    if (H.daysBetween(date, today) > 31) return bad(res, 'Only the last 31 days can be changed');
    const status = String(req.body?.status || '');
    if (!['PRESENT', 'HALF', 'ABSENT', 'CLEAR'].includes(status)) return bad(res, 'Pick present, half day, absent or clear');
    const note = String(req.body?.note || '').trim().slice(0, 120);
    let a = S().hrAttendance.find(x => x.userId === m.id && x.date === date);
    if (status === 'CLEAR') {
      if (a) { a.manual = undefined; a.note = undefined; a.markedBy = undefined; if (!a.inAt) { dropSelfie(a); S().hrAttendance = S().hrAttendance.filter(x => x !== a); } }
    } else {
      if (!a) { a = { id: rid('HRA'), employerId: u.id, userId: m.id, userName: m.name, date }; S().hrAttendance.push(a); }
      a.manual = status as HrAttendance['manual']; a.note = note || undefined; a.markedBy = u.id;
    }
    db.save();
    audit('HR_DAY_MARKED', m.id, `${u.name} marked ${m.name} ${status.toLowerCase()} for ${date}${note ? ` — ${note}` : ''}`);
    res.json({ success: true });
  });

  // ── leave ──
  r.get('/leaves', ...MF('LEAVE'), (req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.id); const year = H.istToday().slice(0, 4);
    const status = String(req.query.status || '');
    const all = S().hrLeaves.filter(l => l.employerId === u.id);
    const list = all.filter(l => !status || l.status === status).sort((a, b) => (a.status === 'PENDING' ? 0 : 1) - (b.status === 'PENDING' ? 0 : 1) || b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map(leaveView);
    const balances = staff(u.id).map(m => ({ ...who(m), ...H.leaveBalance(st, leavesOf(m.id), year) }));
    res.json({ success: true, leaves: list, balances, year, types: H.LEAVE_TYPES });
  });
  /** approve / reject a pending request */
  r.post('/leaves/:id/decide', ...MF('LEAVE'), (req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.id); const today = H.istToday();
    const l = S().hrLeaves.find(x => x.id === req.params.id && x.employerId === u.id); if (!l) return bad(res, 'Leave request not found', 404);
    if (l.status !== 'PENDING') return bad(res, `This request is already ${l.status.toLowerCase()}`, 409);
    const m = staffOne(u.id, l.userId); if (!m) return bad(res, 'Team member not found', 404);
    const decision = String(req.body?.decision || ''); if (!['APPROVE', 'REJECT'].includes(decision)) return bad(res, 'decision must be APPROVE or REJECT');
    const note = String(req.body?.note || '').trim().slice(0, 200);
    if (decision === 'REJECT' && note.length < 3) return bad(res, 'Write a short reason for the member');
    if (decision === 'APPROVE') {
      const others = leavesOf(m.id).filter(x => x.id !== l.id);
      if (others.some(x => x.status === 'APPROVED' && H.overlaps(x, l))) return bad(res, 'He already has an approved leave on these dates', 409);
      if (H.isPaidLeave(l.type)) {
        const used = others.filter(x => x.status === 'APPROVED' && H.isPaidLeave(x.type) && x.from.slice(0, 4) === l.from.slice(0, 4)).reduce((a, x) => a + x.days, 0);
        if (l.days > st.leaveAllowance - used) return bad(res, `Only ${Math.max(0, st.leaveAllowance - used)} paid leave day(s) are left for him this year — reject it, or ask him to take unpaid leave`, 409);
      }
    }
    l.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'; l.decidedAt = nowIso(); l.decidedNote = note || undefined;
    const moved = decision === 'APPROVE' ? syncLeave(m, today) : 0;
    db.save();
    audit('HR_LEAVE_DECIDED', l.id, `${u.name} ${l.status.toLowerCase()} ${m.name}'s ${l.type.toLowerCase()} leave ${l.from}..${l.to} (${l.days} day(s))${moved ? `; ${moved} open lead(s) taken back` : ''}`);
    alert(m.id, 'deals', decision === 'APPROVE' ? 'Leave approved' : 'Leave not approved', `${l.from === l.to ? l.from : `${l.from} → ${l.to}`}${note ? ` · ${note}` : ''}`, '/?tab=team', { not: u.id, tag: `hrl-${l.id}`, hi: [decision === 'APPROVE' ? 'छुट्टी मंज़ूर' : 'छुट्टी मंज़ूर नहीं हुई', `${l.from === l.to ? l.from : `${l.from} → ${l.to}`}${note ? ` · ${note}` : ''}`] });
    res.json({ success: true, leave: leaveView(l), handedBack: moved });
  });
  /** the employer enters a leave himself (a phone call): it is approved at once */
  r.post('/leaves', ...MF('LEAVE'), (req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.id); const today = H.istToday();
    const m = staffOne(u.id, String(req.body?.userId || '')); if (!m) return bad(res, 'Team member not found', 404);
    const mine = leavesOf(m.id);
    const c = H.checkLeave(st, { from: req.body?.from, to: req.body?.to, type: req.body?.type, reason: req.body?.reason || 'Entered by employer' }, mine, today);
    if (typeof c === 'string') return bad(res, c);
    const l: HrLeave = { id: rid('HRL'), employerId: u.id, userId: m.id, userName: m.name, ...c, status: 'APPROVED', createdAt: nowIso(), decidedAt: nowIso(), decidedNote: 'Entered by employer' } as HrLeave;
    S().hrLeaves.push(l);
    const moved = syncLeave(m, today);
    db.save();
    audit('HR_LEAVE_GRANTED', l.id, `${u.name} entered ${m.name}'s ${l.type.toLowerCase()} leave ${l.from}..${l.to} (${l.days} day(s))${moved ? `; ${moved} open lead(s) taken back` : ''}`);
    alert(m.id, 'deals', 'Leave noted', `${l.from === l.to ? l.from : `${l.from} → ${l.to}`} — entered by ${u.name}`, '/?tab=team', { not: u.id, tag: `hrl-${l.id}`, hi: ['छुट्टी दर्ज हुई', `${l.from === l.to ? l.from : `${l.from} → ${l.to}`} — ${u.name} ने दर्ज की`] });
    res.json({ success: true, leave: leaveView(l), handedBack: moved });
  });
  /** the employer calls off a leave that has not finished */
  r.post('/leaves/:id/cancel', ...MF('LEAVE'), (req: Request, res: Response) => {
    const u = me(); const today = H.istToday();
    const l = S().hrLeaves.find(x => x.id === req.params.id && x.employerId === u.id); if (!l) return bad(res, 'Leave not found', 404);
    if (l.status !== 'APPROVED' && l.status !== 'PENDING') return bad(res, `This leave is already ${l.status.toLowerCase()}`, 409);
    if (l.to < today) return bad(res, 'This leave is already over', 409);
    l.status = 'CANCELLED'; l.decidedAt = nowIso(); l.decidedNote = String(req.body?.note || '').trim().slice(0, 200) || undefined;
    const m = userById(l.userId); if (m) syncLeave(m, today);
    db.save();
    audit('HR_LEAVE_CANCELLED', l.id, `${u.name} cancelled ${l.userName}'s leave ${l.from}..${l.to}`);
    if (m) alert(m.id, 'deals', 'Leave cancelled', `${l.from === l.to ? l.from : `${l.from} → ${l.to}`} — by ${u.name}`, '/?tab=team', { not: u.id, tag: `hrl-${l.id}`, hi: ['छुट्टी रद्द', `${l.from === l.to ? l.from : `${l.from} → ${l.to}`} — ${u.name} ने रद्द की`] });
    res.json({ success: true });
  });

  // ── targets ──
  r.get('/targets', ...MF('TARGETS'), (req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.id); const today = H.istToday(); const month = monthParam(req.query.month, today);
    const people = staff(u.id); const act = actuals(u.id, new Set(people.map(m => m.id)), month); const elapsed = H.monthElapsed(st, month, today);
    const canPay = H.hrFeaturesFor(u.role).includes('STATEMENT');
    const rows = people.map(m => {
      const tg = S().hrTargets.find(t => t.userId === m.id);
      const target: H.TargetSet | null = tg && H.TARGET_METRICS.some(k => tg[k] > 0) ? { calls: tg.calls, visits: tg.visits, bookings: tg.bookings } : null;
      const a = act.get(m.id) || zero();
      return { ...who(m), target, suggested: H.suggestTarget(inferTeamRole(m.teamTitle, m.teamRole)), fixedPay: canPay ? (tg?.fixedPay ?? null) : undefined, incentivePct: canPay ? (m.incentivePct || 0) : undefined,
        actual: { calls: a.calls, visits: a.visits, bookings: a.bookings }, progress: target ? H.targetProgress(target, a, elapsed) : null };
    });
    res.json({ success: true, month, elapsed: Math.round(elapsed * 100), rows, metrics: H.METRIC_LABEL });
  });
  /** set (or clear) one person's monthly goal and, for a broker / builder, his fixed monthly pay */
  r.put('/targets/:userId', ...MF('TARGETS'), (req: Request, res: Response) => {
    const u = me(); const m = staffOne(u.id, req.params.userId); if (!m) return bad(res, 'Team member not found', 404);
    let rec = S().hrTargets.find(t => t.userId === m.id);
    const b = req.body || {};
    let next: H.TargetSet | undefined;
    if (b.clear === true) next = { calls: 0, visits: 0, bookings: 0 };
    else if (b.calls !== undefined || b.visits !== undefined || b.bookings !== undefined) { const c = H.cleanTarget(b); if (typeof c === 'string') return bad(res, c); next = c; }
    let fixed: number | undefined;
    if (b.fixedPay !== undefined) {
      if (!H.hrFeaturesFor(u.role).includes('STATEMENT')) return bad(res, 'Pay statements are not part of your account type', 403);
      const f = H.cleanFixed(b.fixedPay); if (typeof f === 'string') return bad(res, f); fixed = f;
    }
    if (!next && fixed === undefined) return bad(res, 'Nothing to change');
    if (!rec) { rec = { id: rid('HRT'), employerId: u.id, userId: m.id, calls: 0, visits: 0, bookings: 0, updatedAt: nowIso() }; S().hrTargets.push(rec); }
    if (next) Object.assign(rec, next);
    if (fixed !== undefined) rec.fixedPay = fixed;
    rec.updatedAt = nowIso();
    db.save();
    audit('HR_TARGET_SET', m.id, `${u.name} set ${m.name}: ${next ? (H.TARGET_METRICS.some(k => next![k] > 0) ? `monthly target ${next.calls} calls / ${next.visits} visits / ${next.bookings} bookings` : 'target cleared') : ''}${fixed !== undefined ? `${next ? '; ' : ''}fixed pay set` : ''}`);
    alert(m.id, 'deals', 'Your monthly target', next && H.TARGET_METRICS.some(k => next![k] > 0) ? `${next.calls} calls · ${next.visits} visits · ${next.bookings} bookings` : 'Your target was updated', '/?tab=team', { not: u.id, tag: `hrt-${m.id}`, hi: ['आपका मासिक टारगेट', next && H.TARGET_METRICS.some(k => next![k] > 0) ? `${next.calls} कॉल · ${next.visits} विज़िट · ${next.bookings} बुकिंग` : 'आपका टारगेट बदला गया'] });
    res.json({ success: true });
  });

  // ── monthly statement ──
  r.get('/statements', ...MF('STATEMENT'), (req: Request, res: Response) => {
    const u = me(); const month = monthParam(req.query.month, H.istToday());
    const list = S().hrStatements.filter(x => x.employerId === u.id && x.month === month).map(x => stmtView(x));
    const missing = staff(u.id, true).filter(m => !list.some(x => x.userId === m.id)).map(who);
    res.json({ success: true, month, statements: list, missing, note: 'GENZ only calculates — you pay your employee yourself. A member sees a statement only after you publish it, and never sees brokerage.' });
  });
  /** (re)build the month's statements from attendance + CRM. A published one is never touched. */
  r.post('/statements/build', ...MF('STATEMENT'), (req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.id); const today = H.istToday();
    const month = H.isMonth(req.body?.month) ? String(req.body.month) : '';
    if (!month) return bad(res, 'Pick the month');
    if (month > today.slice(0, 7)) return bad(res, 'A statement can be built only for this month or an earlier one');
    const only = req.body?.userId ? String(req.body.userId) : '';
    const people = staff(u.id, true).filter(m => !only || m.id === only);
    if (only && !people.length) return bad(res, 'Team member not found', 404);
    const act = actuals(u.id, new Set(people.map(m => m.id)), month);
    const { from, days } = H.monthBounds(month);
    let monthWorkDays = 0; for (let i = 0; i < days; i++) if (H.isWorkingDay(st, H.addDays(from, i))) monthWorkDays++;
    let made = 0, kept = 0;
    for (const m of people) {
      let x = S().hrStatements.find(s => s.userId === m.id && s.month === month);
      if (x?.published) { kept++; continue; }
      const lv = leavesOf(m.id); const recs = S().hrAttendance.filter(a => a.userId === m.id && a.date.slice(0, 7) === month);
      const codes = H.monthCodes(st, month, recs, lv, today, joinedOf(m)); const sum = H.summarize(codes.map(c => c.code));
      let unpaid = 0;
      for (const l of lv) if (l.status === 'APPROVED' && l.type === 'UNPAID' && H.overlaps(l, { from, to: H.addDays(from, days - 1) })) unpaid += H.leaveDays(st, l.from < from ? from : l.from, l.to > H.addDays(from, days - 1) ? H.addDays(from, days - 1) : l.to);
      const a = act.get(m.id) || zero();
      const tg = S().hrTargets.find(t => t.userId === m.id);
      const auto = u.role === 'BROKER' ? Math.round(a.brokerage * (m.incentivePct || 0) / 100) : 0;
      if (!x) { x = { id: rid('HRS'), employerId: u.id, userId: m.id, userName: m.name, month, fixed: tg?.fixedPay ?? 0, incentive: auto, adjustments: [], net: 0, calls: 0, visits: 0, bookings: 0, workingDays: 0, presentDays: 0, absentDays: 0, monthWorkDays, published: false, createdAt: nowIso(), updatedAt: nowIso() }; S().hrStatements.push(x); }
      if (!x.incentiveEdited) x.incentive = auto;
      x.userName = m.name; x.calls = a.calls; x.visits = a.visits; x.bookings = a.bookings; x.workingDays = sum.workingDays; x.presentDays = sum.presentDays;
      x.absentDays = Math.round((sum.A + sum.H * 0.5 + unpaid) * 2) / 2; x.monthWorkDays = monthWorkDays;
      x.net = H.netPay(x.fixed, x.incentive, x.adjustments); x.updatedAt = nowIso(); made++;
    }
    db.save();
    audit('HR_STATEMENTS_BUILT', month, `${u.name} built ${made} statement(s) for ${month}${kept ? `; ${kept} already published were left as they are` : ''}`);
    res.json({ success: true, built: made, kept });
  });
  r.put('/statements/:id', ...MF('STATEMENT'), (req: Request, res: Response) => {
    const u = me(); const x = S().hrStatements.find(s => s.id === req.params.id && s.employerId === u.id); if (!x) return bad(res, 'Statement not found', 404);
    if (x.published) return bad(res, 'This statement is published — take it back to edit it', 409);
    const b = req.body || {};
    if (b.fixed !== undefined) { const f = H.cleanFixed(b.fixed); if (typeof f === 'string') return bad(res, f); x.fixed = f; }
    if (b.incentive !== undefined) { const f = H.cleanFixed(b.incentive); if (typeof f === 'string') return bad(res, f.replace('Fixed pay', 'Incentive')); x.incentive = f; x.incentiveEdited = true; }
    if (b.adjustments !== undefined) { const a = H.cleanAdjustments(b.adjustments); if (typeof a === 'string') return bad(res, a); x.adjustments = a; }
    x.net = H.netPay(x.fixed, x.incentive, x.adjustments); x.updatedAt = nowIso();
    db.save();
    audit('HR_STATEMENT_EDITED', x.id, `${u.name} edited ${x.userName}'s ${x.month} statement draft`);
    res.json({ success: true, statement: stmtView(x) });
  });
  r.post('/statements/:id/publish', ...MF('STATEMENT'), (req: Request, res: Response) => {
    const u = me(); const x = S().hrStatements.find(s => s.id === req.params.id && s.employerId === u.id); if (!x) return bad(res, 'Statement not found', 404);
    if (x.published) return bad(res, 'Already published', 409);
    x.published = true; x.publishedAt = nowIso(); x.updatedAt = nowIso();
    db.save();
    audit('HR_STATEMENT_PUBLISHED', x.id, `${u.name} shared ${x.userName}'s ${x.month} statement with him`);
    alert(x.userId, 'deals', 'Your statement is ready', `${x.month} — ${u.name} shared it with you`, '/?tab=team', { not: u.id, tag: `hrs-${x.id}`, hi: ['आपका वेतन-विवरण तैयार', `${x.month} — ${u.name} ने साझा किया`] });
    res.json({ success: true, statement: stmtView(x) });
  });
  r.post('/statements/:id/unpublish', ...MF('STATEMENT'), (req: Request, res: Response) => {
    const u = me(); const x = S().hrStatements.find(s => s.id === req.params.id && s.employerId === u.id); if (!x) return bad(res, 'Statement not found', 404);
    if (!x.published) return bad(res, 'It is not published', 409);
    x.published = false; x.publishedAt = undefined; x.paidAt = undefined; x.updatedAt = nowIso();
    db.save();
    audit('HR_STATEMENT_WITHDRAWN', x.id, `${u.name} took back ${x.userName}'s ${x.month} statement`);
    res.json({ success: true, statement: stmtView(x) });
  });
  /** the employer notes that he has paid it (GENZ moves no money) */
  r.post('/statements/:id/paid', ...MF('STATEMENT'), (req: Request, res: Response) => {
    const u = me(); const x = S().hrStatements.find(s => s.id === req.params.id && s.employerId === u.id); if (!x) return bad(res, 'Statement not found', 404);
    if (!x.published) return bad(res, 'Publish it first', 409);
    x.paidAt = req.body?.paid === false ? undefined : (x.paidAt || nowIso()); x.updatedAt = nowIso();
    db.save();
    audit('HR_STATEMENT_PAID', x.id, `${u.name} marked ${x.userName}'s ${x.month} statement ${x.paidAt ? 'paid' : 'unpaid'}`);
    res.json({ success: true, statement: stmtView(x) });
  });
  r.delete('/statements/:id', ...MF('STATEMENT'), (req: Request, res: Response) => {
    const u = me(); const x = S().hrStatements.find(s => s.id === req.params.id && s.employerId === u.id); if (!x) return bad(res, 'Statement not found', 404);
    if (x.published) return bad(res, 'Take a published statement back before deleting it', 409);
    S().hrStatements = S().hrStatements.filter(s => s !== x);
    db.save();
    audit('HR_STATEMENT_DELETED', x.id, `${u.name} deleted ${x.userName}'s ${x.month} statement draft`);
    res.json({ success: true });
  });

  // ── claims ──
  r.get('/claims', ...MF('CLAIMS'), (req: Request, res: Response) => {
    const u = me(); const status = String(req.query.status || '');
    const all = S().hrClaims.filter(c => c.employerId === u.id);
    const order = { PENDING: 0, APPROVED: 1, PAID: 2, REJECTED: 3 } as Record<string, number>;
    const list = all.filter(c => !status || c.status === status).sort((a, b) => (order[a.status] - order[b.status]) || b.createdAt.localeCompare(a.createdAt)).slice(0, 150).map(claimView);
    const total = (st: string) => all.filter(c => c.status === st).reduce((a, c) => a + c.amount, 0);
    res.json({ success: true, claims: list, totals: { pending: total('PENDING'), toPay: total('APPROVED') }, kinds: H.CLAIM_KINDS });
  });
  r.post('/claims/:id/decide', ...MF('CLAIMS'), (req: Request, res: Response) => {
    const u = me(); const c = S().hrClaims.find(x => x.id === req.params.id && x.employerId === u.id); if (!c) return bad(res, 'Claim not found', 404);
    if (c.status !== 'PENDING') return bad(res, `This claim is already ${c.status.toLowerCase()}`, 409);
    const decision = String(req.body?.decision || ''); if (!['APPROVE', 'REJECT'].includes(decision)) return bad(res, 'decision must be APPROVE or REJECT');
    const note = String(req.body?.note || '').trim().slice(0, 200);
    if (decision === 'REJECT' && note.length < 3) return bad(res, 'Write a short reason for the member');
    c.status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'; c.decidedAt = nowIso(); c.decidedNote = note || undefined;
    db.save();
    audit('HR_CLAIM_DECIDED', c.id, `${u.name} ${c.status.toLowerCase()} ${c.userName}'s ${c.kind.toLowerCase()} claim of ₹${c.amount}`);
    alert(c.userId, 'deals', decision === 'APPROVE' ? 'Claim approved' : 'Claim not approved', `₹${Math.round(c.amount).toLocaleString('en-IN')} ${c.kind.toLowerCase()}${note ? ` · ${note}` : ''}`, '/?tab=team', { not: u.id, tag: `hrc-${c.id}`, hi: [decision === 'APPROVE' ? 'दावा मंज़ूर' : 'दावा मंज़ूर नहीं हुआ', `₹${Math.round(c.amount).toLocaleString('en-IN')}${note ? ` · ${note}` : ''}`] });
    res.json({ success: true, claim: claimView(c) });
  });
  r.post('/claims/:id/paid', ...MF('CLAIMS'), (req: Request, res: Response) => {
    const u = me(); const c = S().hrClaims.find(x => x.id === req.params.id && x.employerId === u.id); if (!c) return bad(res, 'Claim not found', 404);
    if (c.status !== 'APPROVED') return bad(res, 'Only an approved claim can be marked paid', 409);
    c.status = 'PAID'; c.paidAt = nowIso();
    db.save();
    audit('HR_CLAIM_PAID', c.id, `${u.name} marked ${c.userName}'s ${c.kind.toLowerCase()} claim of ₹${c.amount} paid`);
    alert(c.userId, 'deals', 'Claim paid', `₹${Math.round(c.amount).toLocaleString('en-IN')} — marked paid by ${u.name}`, '/?tab=team', { not: u.id, tag: `hrc-${c.id}`, hi: ['दावे का भुगतान हुआ', `₹${Math.round(c.amount).toLocaleString('en-IN')} — ${u.name} ने भुगतान दर्ज किया`] });
    res.json({ success: true, claim: claimView(c) });
  });

  // ── assets ──
  r.get('/assets', ...MF('ASSETS'), (_req: Request, res: Response) => {
    const u = me();
    const list = S().hrAssets.filter(a => a.employerId === u.id).sort((a, b) => (a.returnedOn ? 1 : 0) - (b.returnedOn ? 1 : 0) || b.givenOn.localeCompare(a.givenOn)).slice(0, 300).map(assetView);
    res.json({ success: true, assets: list, kinds: H.ASSET_KINDS });
  });
  r.post('/assets', ...MF('ASSETS'), (req: Request, res: Response) => {
    const u = me(); const today = H.istToday();
    const m = staffOne(u.id, String(req.body?.userId || '')); if (!m) return bad(res, 'Team member not found', 404);
    const kind = String(req.body?.kind || ''); if (!H.ASSET_KINDS.some(k => k.id === kind)) return bad(res, 'Pick what you are handing over');
    const label = String(req.body?.label || '').trim().slice(0, 60); if (label.length < 2) return bad(res, 'Name the item (e.g. "Redmi Note 12")');
    const serial = String(req.body?.serial || '').trim().slice(0, 40) || undefined;
    const givenOn = req.body?.givenOn ? String(req.body.givenOn) : today;
    if (!H.isDate(givenOn) || givenOn > today) return bad(res, 'The handing-over date cannot be in the future');
    const mine = S().hrAssets.filter(a => a.employerId === u.id);
    if (mine.length >= 400) return bad(res, 'Too many items on record — delete old returned ones first');
    if (mine.filter(a => a.userId === m.id && !a.returnedOn).length >= 20) return bad(res, 'He already has 20 items out');
    const a: HrAsset = { id: rid('HRX'), employerId: u.id, userId: m.id, userName: m.name, kind, label, serial, givenOn, note: String(req.body?.note || '').trim().slice(0, 120) || undefined };
    S().hrAssets.push(a);
    db.save();
    audit('HR_ASSET_GIVEN', a.id, `${u.name} gave ${m.name}: ${label}${serial ? ` (${serial})` : ''}`);
    alert(m.id, 'deals', 'Item handed to you', `${label} — tap to confirm you received it`, '/?tab=team', { not: u.id, tag: `hrx-${a.id}`, hi: ['आपको सामान दिया गया', `${label} — मिलने की पुष्टि करें`] });
    res.json({ success: true, asset: assetView(a) });
  });
  /** mark returned / not returned */
  r.put('/assets/:id', ...MF('ASSETS'), (req: Request, res: Response) => {
    const u = me(); const a = S().hrAssets.find(x => x.id === req.params.id && x.employerId === u.id); if (!a) return bad(res, 'Item not found', 404);
    if (typeof req.body?.returned !== 'boolean') return bad(res, 'returned must be true or false');
    a.returnedOn = req.body.returned ? (a.returnedOn || H.istToday()) : undefined;
    if (req.body?.note !== undefined) a.note = String(req.body.note || '').trim().slice(0, 120) || undefined;
    db.save();
    audit('HR_ASSET_RETURNED', a.id, `${u.name} marked ${a.userName}'s ${a.label} ${a.returnedOn ? 'returned' : 'not returned'}`);
    res.json({ success: true, asset: assetView(a) });
  });
  r.delete('/assets/:id', ...MF('ASSETS'), (req: Request, res: Response) => {
    const u = me(); const a = S().hrAssets.find(x => x.id === req.params.id && x.employerId === u.id); if (!a) return bad(res, 'Item not found', 404);
    if (!a.returnedOn && a.ackAt) return bad(res, 'He has confirmed receiving it — mark it returned instead', 409);
    S().hrAssets = S().hrAssets.filter(x => x !== a);
    db.save();
    audit('HR_ASSET_DELETED', a.id, `${u.name} removed ${a.userName}'s ${a.label} from the list`);
    res.json({ success: true });
  });

  // ═════════════ member (himself only) ═════════════
  /** My day: today, this month, leave left, my target, and what waits for me */
  r.get('/me', ...I, (_req: Request, res: Response) => {
    const u = me(); const empId = u.employerId as string; const st = settingsOf(empId); const feats = H.hrFeaturesFor(u.employerRole);
    const now = Date.now(); const today = H.istToday(now); const month = today.slice(0, 7);
    const emp = userById(empId);
    const recs = S().hrAttendance.filter(a => a.userId === u.id && a.date.slice(0, 7) === month);
    const lv = leavesOf(u.id); const rec = recs.find(a => a.date === today);
    const codes = H.monthCodes(st, month, recs, lv, today, joinedOf(u));
    const out: Record<string, unknown> = {
      success: true, features: feats, employerName: emp?.companyName || emp?.name || '', today, month,
      settings: { workStart: st.workStart, graceMin: st.graceMin, weeklyOff: st.weeklyOff, selfie: st.selfie, leaveAllowance: st.leaveAllowance },
      holiday: H.holidayOn(st, today), upcoming: upcomingHolidays(st, today, 4),
      state: H.todayState(st, rec, lv, now, joinedOf(u)), record: attView(rec),
      codes: charOf(codes), summary: H.summarize(codes.map(c => c.code)),
      balance: feats.includes('LEAVE') ? H.leaveBalance(st, lv, today.slice(0, 4)) : undefined,
      pending: {
        leaves: lv.filter(l => l.status === 'PENDING').length,
        claims: feats.includes('CLAIMS') ? S().hrClaims.filter(c => c.userId === u.id && c.status === 'PENDING').length : 0,
        assetsToConfirm: feats.includes('ASSETS') ? S().hrAssets.filter(a => a.userId === u.id && !a.ackAt && !a.returnedOn).length : 0,
        statements: feats.includes('STATEMENT') ? S().hrStatements.filter(s => s.userId === u.id && s.published).length : 0,
      },
    };
    if (feats.includes('TARGETS')) {
      const tg = S().hrTargets.find(t => t.userId === u.id);
      const target = tg && H.TARGET_METRICS.some(k => tg[k] > 0) ? { calls: tg.calls, visits: tg.visits, bookings: tg.bookings } : null;
      const a = actuals(empId, new Set([u.id]), month).get(u.id) || zero();
      out.target = target ? { ...H.targetProgress(target, a, H.monthElapsed(st, month, today)), elapsed: Math.round(H.monthElapsed(st, month, today) * 100) } : null;
      out.actual = { calls: a.calls, visits: a.visits, bookings: a.bookings };
    }
    res.json(out);
  });
  /** punch in / out — GPS always, a small selfie with the punch-in when the employer wants it */
  r.post('/me/punch', needs('hr:self'), self('ATTENDANCE'), rateLimit('hr-punch', 600, 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const empId = u.employerId as string; const st = settingsOf(empId); const now = Date.now(); const today = H.istToday(now);
    const kind = req.body?.kind; if (kind !== 'in' && kind !== 'out') return bad(res, 'kind must be in or out');
    const lat = Number(req.body?.lat), lng = Number(req.body?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 6 || lat > 38.5 || lng < 68 || lng > 98) return bad(res, 'Switch on your location — the day is marked with your GPS (India)');
    const accRaw = req.body?.accuracy; const acc = accRaw === undefined || accRaw === null ? undefined : Number(accRaw);
    if (acc !== undefined && (!Number.isFinite(acc) || acc < 0 || acc > 100000)) return bad(res, 'Invalid GPS accuracy');
    const round = (x: number) => Math.round(x * 1e6) / 1e6;
    let rec = S().hrAttendance.find(a => a.userId === u.id && a.date === today);
    if (kind === 'in') {
      if (rec?.inAt) return bad(res, `You are already in since ${H.timeOf(Date.parse(rec.inAt))}`, 409);
      if (leavesOf(u.id).some(l => covers(l, today))) return bad(res, 'You are on approved leave today', 409);
      if (st.selfie && !req.body?.selfie) return bad(res, 'Take a selfie to mark the day');
      if (!rec) { rec = { id: rid('HRA'), employerId: empId, userId: u.id, userName: u.name, date: today }; S().hrAttendance.push(rec); }
      if (st.selfie) { const e = saveSelfie(rec.id, req.body.selfie); if (e) return bad(res, e); rec.inSelfie = true; }
      rec.inAt = new Date(now).toISOString(); rec.inLat = round(lat); rec.inLng = round(lng); rec.inAcc = acc === undefined ? undefined : Math.round(acc);
      rec.lateMin = H.lateMinutes(st, now);
      if (rec.manual === 'ABSENT') rec.manual = undefined; // he came after all
    } else {
      if (!rec?.inAt) return bad(res, 'Punch in first', 409);
      rec.outAt = new Date(now).toISOString(); rec.outLat = round(lat); rec.outLng = round(lng);
    }
    db.save();
    res.json({ success: true, record: attView(rec), state: H.todayState(st, rec, leavesOf(u.id), now, joinedOf(u)) });
  });
  r.get('/me/attendance', ...IF('ATTENDANCE'), (req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.employerId as string); const today = H.istToday(); const month = monthParam(req.query.month, today);
    const recs = S().hrAttendance.filter(a => a.userId === u.id && a.date.slice(0, 7) === month);
    const codes = H.monthCodes(st, month, recs, leavesOf(u.id), today, joinedOf(u));
    res.json({ success: true, month, today, codes: charOf(codes), summary: H.summarize(codes.map(c => c.code)), records: recs.sort((a, b) => b.date.localeCompare(a.date)).map(attView), holidays: H.holidaysIn(st, month), legend: H.DAY_LABEL });
  });

  r.get('/me/leaves', ...IF('LEAVE'), (_req: Request, res: Response) => {
    const u = me(); const st = settingsOf(u.employerId as string); const lv = leavesOf(u.id);
    res.json({ success: true, leaves: lv.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50).map(leaveView), balance: H.leaveBalance(st, lv, H.istToday().slice(0, 4)), types: H.LEAVE_TYPES, maxBackdate: H.MAX_BACKDATE });
  });
  r.post('/me/leaves', needs('hr:self'), self('LEAVE'), rateLimit('hr-leave', 60, 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const empId = u.employerId as string; const st = settingsOf(empId); const lv = leavesOf(u.id);
    if (lv.filter(l => l.status === 'PENDING').length >= 5) return bad(res, 'You already have 5 requests waiting — wait for a reply', 409);
    const c = H.checkLeave(st, { from: req.body?.from, to: req.body?.to, type: req.body?.type, reason: req.body?.reason }, lv, H.istToday());
    if (typeof c === 'string') return bad(res, c);
    const l: HrLeave = { id: rid('HRL'), employerId: empId, userId: u.id, userName: u.name, ...c, status: 'PENDING', createdAt: nowIso() } as HrLeave;
    S().hrLeaves.push(l);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', l.id, 'HR_LEAVE_ASKED', `${u.name} asked ${l.type.toLowerCase()} leave ${l.from}..${l.to} (${l.days} day(s))`);
    const span = l.from === l.to ? l.from : `${l.from} → ${l.to}`;
    alert(empId, 'deals', 'Leave request', `${firstName(u.name)} · ${l.days} day(s) · ${span}`, '/?tab=team', { tag: `hrl-${l.id}`, hi: ['छुट्टी की अर्ज़ी', `${firstName(u.name)} · ${l.days} दिन · ${span}`] });
    res.json({ success: true, leave: leaveView(l) });
  });
  r.post('/me/leaves/:id/cancel', ...IF('LEAVE'), (req: Request, res: Response) => {
    const u = me(); const today = H.istToday();
    const l = S().hrLeaves.find(x => x.id === req.params.id && x.userId === u.id); if (!l) return bad(res, 'Leave not found', 404);
    if (l.status !== 'PENDING' && !(l.status === 'APPROVED' && l.to >= today)) return bad(res, 'This leave cannot be cancelled now', 409);
    const wasApproved = l.status === 'APPROVED';
    l.status = 'CANCELLED'; l.decidedAt = nowIso();
    syncLeave(u, today);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', l.id, 'HR_LEAVE_WITHDRAWN', `${u.name} withdrew his leave ${l.from}..${l.to}`);
    if (wasApproved) alert(u.employerId, 'deals', 'Leave cancelled', `${firstName(u.name)} cancelled ${l.from === l.to ? l.from : `${l.from} → ${l.to}`}`, '/?tab=team', { not: u.id, tag: `hrl-${l.id}`, hi: ['छुट्टी रद्द की गई', `${firstName(u.name)} ने रद्द की`] });
    res.json({ success: true });
  });

  r.get('/me/claims', ...IF('CLAIMS'), (_req: Request, res: Response) => {
    const u = me();
    res.json({ success: true, claims: S().hrClaims.filter(c => c.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 60).map(claimView), kinds: H.CLAIM_KINDS, max: H.CLAIM_MAX });
  });
  r.post('/me/claims', needs('hr:self'), self('CLAIMS'), rateLimit('hr-claim', 60, 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const empId = u.employerId as string;
    if (S().hrClaims.filter(c => c.userId === u.id && c.status === 'PENDING').length >= H.CLAIM_PENDING_MAX) return bad(res, `You already have ${H.CLAIM_PENDING_MAX} claims waiting — wait for a reply`, 409);
    const c = H.cleanClaim(req.body, H.istToday()); if (typeof c === 'string') return bad(res, c);
    if (S().hrClaims.some(x => x.userId === u.id && x.date === c.date && x.kind === c.kind && x.amount === c.amount && x.status !== 'REJECTED')) return bad(res, 'This claim is already filed', 409);
    const x: HrClaim = { id: rid('HRC'), employerId: empId, userId: u.id, userName: u.name, ...c, status: 'PENDING', createdAt: nowIso() };
    S().hrClaims.push(x);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', x.id, 'HR_CLAIM_FILED', `${u.name} claimed ₹${x.amount} (${x.kind.toLowerCase()}) for ${x.date}`);
    alert(empId, 'deals', 'Expense claim', `${firstName(u.name)} · ₹${Math.round(x.amount).toLocaleString('en-IN')} · ${x.kind.toLowerCase()}`, '/?tab=team', { tag: `hrc-${x.id}`, hi: ['ख़र्च का दावा', `${firstName(u.name)} · ₹${Math.round(x.amount).toLocaleString('en-IN')}`] });
    res.json({ success: true, claim: claimView(x) });
  });
  r.post('/me/claims/:id/cancel', ...IF('CLAIMS'), (req: Request, res: Response) => {
    const u = me(); const c = S().hrClaims.find(x => x.id === req.params.id && x.userId === u.id); if (!c) return bad(res, 'Claim not found', 404);
    if (c.status !== 'PENDING') return bad(res, 'Only a claim that is still waiting can be withdrawn', 409);
    S().hrClaims = S().hrClaims.filter(x => x !== c);
    db.save();
    res.json({ success: true });
  });

  r.get('/me/assets', ...IF('ASSETS'), (_req: Request, res: Response) => {
    const u = me();
    res.json({ success: true, assets: S().hrAssets.filter(a => a.userId === u.id).sort((a, b) => (a.returnedOn ? 1 : 0) - (b.returnedOn ? 1 : 0) || b.givenOn.localeCompare(a.givenOn)).map(assetView) });
  });
  r.post('/me/assets/:id/ack', ...IF('ASSETS'), (req: Request, res: Response) => {
    const u = me(); const a = S().hrAssets.find(x => x.id === req.params.id && x.userId === u.id); if (!a) return bad(res, 'Item not found', 404);
    if (a.returnedOn) return bad(res, 'This item is already marked returned', 409);
    a.ackAt = a.ackAt || nowIso();
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', a.id, 'HR_ASSET_RECEIVED', `${u.name} confirmed receiving ${a.label}`);
    res.json({ success: true, asset: assetView(a) });
  });

  /** only what the employer has published — and never brokerage */
  r.get('/me/statements', ...IF('STATEMENT'), (_req: Request, res: Response) => {
    const u = me();
    res.json({ success: true, statements: S().hrStatements.filter(s => s.userId === u.id && s.published).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 24).map(s => stmtView(s, true)) });
  });

  return r;
}

// ───────────────────────── hourly sweep ─────────────────────────
/** leave switches follow approved leaves; selfie files older than 30 days go (the day's row stays); attendance older than ~18 months is dropped */
export function sweepHr(now = Date.now()) {
  const s = S(); const today = H.istToday(now); let changed = false;
  for (const l of s.hrLeaves) {
    if (l.status !== 'APPROVED' || l.applied || !(l.from <= today && today <= l.to)) continue;
    const m = s.users.find(u => u.id === l.userId && u.role === 'TEAM_MEMBER');
    if (!m) continue;
    const moved = applyLeave(m); l.applied = true; changed = true;
    if (moved) db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'SYSTEM', m.id, 'HR_LEAVE_STARTED', `${m.name} is on approved leave; ${moved} open lead(s) taken back`);
  }
  for (const m of s.users) {
    if (m.role === 'TEAM_MEMBER' && m.teamPolicy?.onLeave && m.teamPolicy.onLeaveBy === 'LEAVE' && !s.hrLeaves.some(l => l.userId === m.id && covers(l, today))) { liftLeave(m); changed = true; }
  }
  const selfieCut = H.addDays(today, -SELFIE_KEEP_DAYS);
  for (const a of s.hrAttendance) if (a.inSelfie && a.date < selfieCut) { dropSelfie(a); changed = true; }
  const rowCut = H.addDays(today, -550);
  const old = s.hrAttendance.filter(a => a.date < rowCut);
  if (old.length) { old.forEach(dropSelfie); s.hrAttendance = s.hrAttendance.filter(a => a.date >= rowCut); changed = true; }
  if (changed) db.save();
}

// ───────────────────────── DPDP: erase / export ─────────────────────────
/** an erased MEMBER keeps his rows for the employer's books but loses name, GPS, selfies and free text; an erased EMPLOYER takes his whole HR record with him */
export function eraseHr(s: DbState, userId: string, anonName: string) {
  const drop = (a: HrAttendance) => { try { fs.unlinkSync(selfieFile(a.id)); } catch { /* gone */ } };
  s.hrAttendance.filter(a => a.employerId === userId).forEach(drop);
  s.hrAttendance = s.hrAttendance.filter(a => a.employerId !== userId);
  s.hrSettings = s.hrSettings.filter(x => x.employerId !== userId);
  s.hrLeaves = s.hrLeaves.filter(x => x.employerId !== userId);
  s.hrTargets = s.hrTargets.filter(x => x.employerId !== userId && x.userId !== userId);
  s.hrStatements = s.hrStatements.filter(x => x.employerId !== userId);
  s.hrClaims = s.hrClaims.filter(x => x.employerId !== userId);
  s.hrAssets = s.hrAssets.filter(x => x.employerId !== userId);
  for (const a of s.hrAttendance) if (a.userId === userId) { drop(a); a.userName = anonName; a.inSelfie = undefined; a.inLat = a.inLng = a.inAcc = a.outLat = a.outLng = undefined; a.note = undefined; }
  for (const l of s.hrLeaves) if (l.userId === userId) { l.userName = anonName; l.reason = '—'; l.decidedNote = undefined; }
  for (const c of s.hrClaims) if (c.userId === userId) { c.userName = anonName; c.note = '—'; c.decidedNote = undefined; }
  for (const x of s.hrStatements) if (x.userId === userId) x.userName = anonName;
  for (const a of s.hrAssets) if (a.userId === userId) { a.userName = anonName; a.note = undefined; }
}
/** what a person may download about himself: his own rows only (no GPS, no employer-only notes) */
export function exportHr(s: DbState, userId: string) {
  return {
    attendance: s.hrAttendance.filter(a => a.userId === userId).map(a => ({ date: a.date, inAt: a.inAt, outAt: a.outAt, lateMin: a.lateMin, manual: a.manual })),
    leaves: s.hrLeaves.filter(l => l.userId === userId).map(leaveView),
    claims: s.hrClaims.filter(c => c.userId === userId).map(claimView),
    assets: s.hrAssets.filter(a => a.userId === userId).map(assetView),
    statements: s.hrStatements.filter(x => x.userId === userId && x.published).map(x => stmtView(x, true)),
  };
}
