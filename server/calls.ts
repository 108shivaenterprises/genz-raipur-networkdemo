/**
 * v81 — in-app voice calls (mounted at /api/calls). Phone to phone through the browser (WebRTC); this file only introduces the two
 * phones to each other (small signals), keeps the call's record, and — when both sides agree — keeps the recording.
 *
 *   who may call   an employer ↔ his own staff / staff ↔ staff of one employer (TEAM), the people of one deal room (DEAL), a builder ↔ a broker
 *                  linked by a project (PARTNER). Both must be verified. A phone number is never sent, shown or needed.
 *   ringing        the other person gets a phone alert + the app rings while it is open (GET /ring, every few seconds)
 *   recording      see src/shared/callRules.ts — never silent: ALWAYS (employer's rule for his own staff), or one side asks and the other
 *                  taps Allow. The phone that asked records and sends the audio in small pieces (a serverless body limit is a few MB);
 *                  at the end the pieces are joined into one file. Kept 30 days, then deleted. Staff never receive the audio.
 *   not here       GENZ admins never read or hear calls (same as deal-room chats); no number, no surname-less customer, no GPS.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { UserProfile, CallRecord, CallSettings } from './db.js';
import { ctx, needs, hit } from './auth.js';
import { can } from './permissions.js';
import { alert } from './alerts.js';
import { isDealParticipant } from './access.js';
import { sideOf, linkOf } from './partnerchat.js';
import { sigAdd, sigList, sigDrop, sigPrune } from './callsig.js';
import * as R from '../src/shared/callRules.js';

type DbState = ReturnType<typeof db.getState>;
const me = () => ctx().user as UserProfile;
const S = () => db.getState();
const nowIso = () => new Date().toISOString();
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });
const userById = (id?: string) => (id ? S().users.find(u => u.id === id) : undefined);
const isStaff = (u: UserProfile) => u.role === 'TEAM_MEMBER';
const employerIdOf = (u: UserProfile) => (isStaff(u) ? u.employerId : undefined);
const callable = (u?: UserProfile): u is UserProfile => !!u && u.verificationStatus === 'VERIFIED' && can(u, 'call:use');
const audit = (u: { id: string; role: any }, c: CallRecord, action: string, details: string) =>
  db.appendAuditEvent(u.id, u.role, c.context === 'DEAL' ? 'DEAL' : 'VERIFICATION', c.contextId || c.id, action, details);

// ───────────────────────── settings (an employer's rule for his own staff) ─────────────────────────
export function settingsOf(employerId: string): { enabled: boolean; record: R.RecordPolicy } {
  const r = S().callSettings.find(x => x.employerId === employerId);
  return { enabled: r ? r.enabled : true, record: r ? r.record : R.DEFAULT_RECORD_POLICY };
}

// ───────────────────────── files ─────────────────────────
const REC_DIR = () => path.resolve(process.cwd(), 'data', 'callrec');
const partsDir = (id: string) => path.join(REC_DIR(), id);
const partFile = (id: string, seq: number) => path.join(partsDir(id), `${String(seq).padStart(4, '0')}.part`);
const finalFile = (c: CallRecord) => path.join(REC_DIR(), `${c.id}.${c.recExt || 'webm'}`);
function dropAudio(c: CallRecord) {
  try { fs.rmSync(partsDir(c.id), { recursive: true, force: true }); } catch { /* gone */ }
  for (const ext of ['webm', 'mp4', 'ogg']) { try { fs.unlinkSync(path.join(REC_DIR(), `${c.id}.${ext}`)); } catch { /* gone */ } }
  c.recParts = undefined; c.recFileAt = undefined; c.recBytes = undefined;
}
/** join the pieces into one file (the pieces of a MediaRecorder stream simply follow one another) */
function mergeAudio(c: CallRecord): boolean {
  const parts = [...(c.recParts || [])].sort((a, b) => a - b);
  if (!parts.length || c.recFileAt) return !!c.recFileAt;
  try {
    const bufs = parts.map(seq => fs.readFileSync(partFile(c.id, seq)));
    const all = Buffer.concat(bufs);
    const kind = R.sniffAudio(all);
    if (!kind) return false;
    c.recExt = kind.ext; c.recMime = kind.mime;
    fs.mkdirSync(REC_DIR(), { recursive: true });
    const tmp = finalFile(c) + '.tmp'; fs.writeFileSync(tmp, all); fs.renameSync(tmp, finalFile(c));
    fs.rmSync(partsDir(c.id), { recursive: true, force: true });
    c.recParts = undefined; c.recBytes = all.length; c.recFileAt = nowIso();
    return true;
  } catch { return false; }
}
const hasAudio = (c: CallRecord) => !c.recDeletedAt && (!!c.recFileAt || !!c.recParts?.length) && R.recordingKept(c.endedAt || c.createdAt, Date.now());

// ───────────────────────── who may call whom ─────────────────────────
type Gate = { ok: true; sameBusiness: boolean; mode: R.RecordMode; employerIds: string[] } | { ok: false; error: string; code: string; status?: number };
const no = (error: string, code = 'NOT_ALLOWED', status = 403): Gate => ({ ok: false, error, code, status });

function mayCall(a: UserProfile, b: UserProfile, context: R.CallContext, contextId?: string): Gate {
  if (a.id === b.id) return no('You cannot call yourself', 'SELF');
  if (!callable(a)) return no('Your account cannot make calls yet', 'NOT_ALLOWED');
  if (!callable(b)) return no('That person cannot take calls on GENZ', 'NOT_ALLOWED');
  const ea = employerIdOf(a); const eb = employerIdOf(b);
  let sameBusiness = false;
  if (context === 'TEAM') {
    const ok = (ea && ea === b.id) || (eb && eb === a.id) || (ea && ea === eb);
    if (!ok) return no('You can call your own employer or staff here', 'NOT_ALLOWED');
    sameBusiness = true;
  } else if (context === 'DEAL') {
    const deal = S().dealRooms.find(d => d.id === contextId);
    if (!deal) return no('Deal room not found', 'NOT_FOUND', 404);
    if (!isDealParticipant(a, deal) || !isDealParticipant(b, deal)) return no('Both of you must be in this deal room', 'NOT_ALLOWED');
  } else if (context === 'PARTNER') {
    const sa = sideOf(a); const sb = sideOf(b);
    if (!sa || !sb || sa.side === sb.side) return no('Calls here are between a builder and a partner broker', 'NOT_ALLOWED');
    const builderId = sa.side === 'BUILDER' ? sa.builderId : (sb as any).builderId;
    const brokerId = sa.side === 'PARTNER' ? sa.brokerId : (sb as any).brokerId;
    if (!linkOf(builderId, brokerId).open) return no('You can call once you are linked by a project', 'NOT_LINKED', 404);
  } else return no('Unknown call type', 'BAD_CONTEXT', 400);
  // every employer of a staff member on the call has a say
  const employerIds = [...new Set([ea, eb].filter((x): x is string => !!x))];
  const sets = employerIds.map(settingsOf);
  if (sets.some(x => !x.enabled)) return no('Calls are switched off for this person by his employer', 'CALLS_OFF');
  const policy: R.RecordPolicy | undefined = sets.some(x => x.record === 'OFF') ? 'OFF' : sets.some(x => x.record === 'ALWAYS') ? 'ALWAYS' : sets.length ? 'ASK' : undefined;
  const mode = R.recordMode(context, policy, sameBusiness);
  return { ok: true, sameBusiness, mode, employerIds };
}

// ───────────────────────── call record helpers ─────────────────────────
const involved = (c: CallRecord, u: UserProfile) => c.callerId === u.id || c.calleeId === u.id;
/** a ring nobody answered becomes MISSED, a call past the limit ENDED (returns whether it changed) */
function settle(c: CallRecord, nowMs = Date.now()): boolean {
  const next = R.lazyStatus(c, nowMs);
  if (next === c.status) return false;
  c.status = next; c.endedAt = c.endedAt || nowIso();
  void sigDrop(c.id);
  return true;
}
function endCall(c: CallRecord, status: CallRecord['status'], by?: string) {
  c.status = status; c.endedAt = nowIso(); if (by) c.endedBy = by;
  void sigDrop(c.id);
}
/** calls are kept newest first and a live one is never older than the limit, so a scan can stop early */
function* liveCalls(): Generator<CallRecord> {
  const cut = Date.now() - (R.CALL_MAX_SECONDS + 600) * 1000;
  for (const c of S().calls) { if (Date.parse(c.createdAt) < cut) break; if (R.isLive(c.status)) yield c; }
}
const busyWith = (uid: string) => { for (const c of liveCalls()) if (R.lazyStatus(c, Date.now()) === c.status && (c.callerId === uid || c.calleeId === uid)) return c; return undefined; };

/** who may listen to / delete the audio: the businesses on the call (never a staff member himself) and the employer of any staff member on it */
export function canListen(u: UserProfile, c: CallRecord): boolean {
  if (u.role === 'ADMIN' || u.role === 'SUPERADMIN') return false;
  if ((c.callerId === u.id || c.calleeId === u.id) && !isStaff(u)) return true;
  return (c.callerEmployerId === u.id) || (c.calleeEmployerId === u.id);
}
const nameOf = (id?: string) => userById(id)?.name || 'Someone';

function view(c: CallRecord, u: UserProfile) {
  const caller = c.callerId === u.id;
  const peerId = caller ? c.calleeId : c.callerId;
  const live = R.isLive(c.status);
  const recordByMe = c.recordBy === u.id;
  return {
    id: c.id, context: c.context, contextId: c.contextId, status: c.status, role: caller ? 'caller' : 'callee',
    peer: { id: peerId, name: caller ? c.calleeName : c.callerName },
    createdAt: c.createdAt, answeredAt: c.answeredAt, endedAt: c.endedAt, durationSec: R.durationSec(c),
    ringLeftSec: c.status === 'RINGING' ? Math.max(0, R.RING_SECONDS - Math.round((Date.now() - Date.parse(c.createdAt)) / 1000)) : 0,
    record: c.record, recordMode: c.recordMode, recordByMe, recordByName: c.recordBy ? nameOf(c.recordBy) : undefined,
    askedByMe: c.record === 'ASKED' && recordByMe,
    live, maxSeconds: R.CALL_MAX_SECONDS,
  };
}

// ───────────────────────── router ─────────────────────────
const perUser = (name: string, limit: number, windowMs: number) => (req: Request, res: Response, next: () => void) => {
  const wait = hit(`${name}:${(ctx().user as UserProfile | null)?.id || req.ip}`, limit, windowMs);
  if (wait) { res.setHeader('Retry-After', String(wait)); return res.status(429).json({ error: 'Too many requests. Please slow down.' }); }
  next();
};

/** the relay servers for the phones: a public STUN always, a TURN relay when the owner has set one (mobile networks often need it) */
export function iceServers() {
  const out: Array<{ urls: string | string[]; username?: string; credential?: string }> = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const urls = String(process.env.TURN_URLS || '').split(',').map(x => x.trim()).filter(x => /^turns?:/i.test(x));
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) out.push({ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  return { servers: out, relay: urls.length > 0 && !!process.env.TURN_USERNAME && !!process.env.TURN_CREDENTIAL };
}

export function createCallsRouter() {
  const r = Router();
  r.use(needs('call:use'));

  /** what the call screen needs: relay servers + the rule that applies to me */
  r.get('/config', (_req, res) => {
    const u = me(); const ice = iceServers();
    const employerId = isStaff(u) ? u.employerId : u.id;
    res.json({ success: true, iceServers: ice.servers, relay: ice.relay, canManage: !isStaff(u), settings: employerId ? settingsOf(employerId) : { enabled: true, record: R.DEFAULT_RECORD_POLICY }, keepDays: R.REC_KEEP_DAYS });
  });

  /** an employer's rule for the calls of his own staff */
  r.put('/settings', (req: Request, res: Response) => {
    const u = me();
    if (isStaff(u)) return bad(res, 'Only the owner of the business can change this', 403, 'FORBIDDEN');
    const enabled = req.body?.enabled; const record = String(req.body?.record || '');
    if (typeof enabled !== 'boolean') return bad(res, 'Say whether calls are on or off');
    if (!R.RECORD_POLICIES.includes(record as R.RecordPolicy)) return bad(res, 'Recording must be OFF, ASK or ALWAYS');
    let row = S().callSettings.find(x => x.employerId === u.id);
    if (!row) { row = { id: `CS-${crypto.randomBytes(5).toString('hex')}`, employerId: u.id, enabled, record: record as R.RecordPolicy, updatedAt: nowIso() } as CallSettings; S().callSettings.push(row); }
    else { row.enabled = enabled; row.record = record as R.RecordPolicy; row.updatedAt = nowIso(); }
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', u.id, 'CALL_SETTINGS_SET', `${u.name}: in-app calls ${enabled ? 'on' : 'off'}, recording rule ${record}`);
    res.json({ success: true, settings: settingsOf(u.id) });
  });

  /** the people I can call from here: my team (TEAM) or the others of a deal room (DEAL) */
  r.get('/people', (req: Request, res: Response) => {
    const u = me(); const context = String(req.query.context || '') as R.CallContext; const id = String(req.query.id || '');
    if (!R.CALL_CONTEXTS.includes(context)) return bad(res, 'Unknown call type');
    const s = S(); let pool: UserProfile[] = [];
    if (context === 'TEAM') {
      const eid = isStaff(u) ? u.employerId : u.id;
      pool = s.users.filter(x => x.id !== u.id && (x.id === eid || (x.role === 'TEAM_MEMBER' && x.employerId === eid)));
    } else if (context === 'DEAL') {
      const d = s.dealRooms.find(x => x.id === id);
      if (!d || !isDealParticipant(u, d)) return bad(res, 'Deal room not found', 404, 'NOT_FOUND');
      const ids = new Set([d.introducingBrokerId, d.closingBrokerId, d.ownerId, ...(d.teamMemberIds || [])]);
      pool = s.users.filter(x => ids.has(x.id) && x.id !== u.id);
    } else {
      const x = userById(id); pool = x ? [x] : [];
    }
    const people = pool.filter(x => { const g = mayCall(u, x, context, id || undefined); return g.ok; })
      .map(x => ({ id: x.id, name: x.name, title: x.role === 'TEAM_MEMBER' ? (x.teamTitle || 'Team') : x.role === 'BROKER' ? 'Broker' : x.role === 'DEVELOPER_BUILDER' ? 'Builder' : x.role }));
    res.json({ success: true, people });
  });

  /** ring someone */
  r.post('/start', perUser('call-start', 60, 3600_000), (req: Request, res: Response) => {
    const u = me(); const to = userById(String(req.body?.toUserId || ''));
    const context = String(req.body?.context || '') as R.CallContext; const contextId = req.body?.contextId ? String(req.body.contextId).slice(0, 60) : undefined;
    if (!R.CALL_CONTEXTS.includes(context)) return bad(res, 'Unknown call type');
    if (!to) return bad(res, 'Person not found', 404, 'NOT_FOUND');
    const g = mayCall(u, to, context, contextId);
    if (!g.ok) return bad(res, g.error, g.status || 403, g.code);
    const mine = busyWith(u.id); if (mine) return bad(res, 'You are already on a call', 409, 'BUSY');
    if (busyWith(to.id)) return bad(res, `${to.name} is on another call — try again in a minute`, 409, 'BUSY');
    const c: CallRecord = {
      id: `CALL-${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`, context, contextId,
      callerId: u.id, callerName: u.name, calleeId: to.id, calleeName: to.name,
      callerEmployerId: employerIdOf(u), calleeEmployerId: employerIdOf(to),
      status: 'RINGING', createdAt: nowIso(),
      record: g.mode === 'ALWAYS' ? 'ON' : 'OFF', recordMode: g.mode, recordBy: g.mode === 'ALWAYS' ? u.id : undefined,
    };
    S().calls.unshift(c);
    if (S().calls.length > 6000) S().calls.length = 6000;
    db.save();
    audit(u, c, 'CALL_STARTED', `${u.name} called ${to.name} (${context})${g.mode === 'ALWAYS' ? ' — recorded under the employer\'s rule' : ''}`);
    alert(to.id, 'deals', `📞 ${u.name} is calling`, 'Open GENZ to answer the call', `/?call=${c.id}`, { tag: `call-${c.id}`, hi: [`📞 ${u.name} कॉल कर रहे हैं`, 'कॉल उठाने के लिए GENZ खोलें'] });
    res.json({ success: true, call: view(c, u) });
  });

  /** is someone calling me? (and my own live call, so a reload can go back into it) */
  r.get('/ring', perUser('call-ring', 1500, 3600_000), (_req, res) => {
    const u = me(); let changed = false; let ring: CallRecord | undefined; let active: CallRecord | undefined;
    for (const c of liveCalls()) {
      if (!involved(c, u)) continue;
      if (settle(c)) { changed = true; continue; }
      if (c.status === 'RINGING' && c.calleeId === u.id) ring = ring || c;
      else if (c.status === 'ACTIVE' || (c.status === 'RINGING' && c.callerId === u.id)) active = active || c;
    }
    if (changed) db.save();
    res.json({ success: true, ring: ring ? view(ring, u) : null, active: active ? view(active, u) : null });
  });

  /** my calls (and my staff's calls when I am the employer) — never a number */
  r.get('/log', (_req, res) => {
    const u = me(); const s = S(); const now = Date.now();
    const staffIds = new Set(isStaff(u) ? [] : s.users.filter(x => x.role === 'TEAM_MEMBER' && x.employerId === u.id).map(x => x.id));
    const rows = s.calls.filter(c => R.isLive(c.status) ? false : (involved(c, u) || staffIds.has(c.callerId) || staffIds.has(c.calleeId)))
      .slice(0, 150).map(c => {
        const mine = involved(c, u); const out = c.callerId === u.id;
        const withName = mine ? (out ? c.calleeName : c.callerName) : `${c.callerName} → ${c.calleeName}`;
        const audio = hasAudio(c);
        return {
          id: c.id, context: c.context, with: withName, staff: !mine, direction: mine ? (out ? 'out' : 'in') : 'staff', status: c.status,
          at: c.createdAt, durationSec: R.durationSec(c), recorded: !!(c.recFileAt || c.recParts?.length || c.recDeletedAt),
          audio: audio && canListen(u, c), deleted: !!c.recDeletedAt, expired: !c.recDeletedAt && (!!c.recFileAt) && !R.recordingKept(c.endedAt || c.createdAt, now),
        };
      });
    res.json({ success: true, calls: rows, keepDays: R.REC_KEEP_DAYS });
  });

  const mineCall = (req: Request, res: Response): CallRecord | null => {
    const u = me(); const c = S().calls.find(x => x.id === req.params.id);
    if (!c || !involved(c, u)) { bad(res, 'Call not found', 404, 'NOT_FOUND'); return null; }
    return c;
  };

  r.get('/:id', (req: Request, res: Response) => {
    const c = mineCall(req, res); if (!c) return; if (settle(c)) db.save();
    res.json({ success: true, call: view(c, me()) });
  });

  r.post('/:id/answer', (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (settle(c)) db.save();
    if (c.calleeId !== u.id) return bad(res, 'Only the person called can answer', 403);
    if (c.status !== 'RINGING') return bad(res, c.status === 'MISSED' ? 'The call was missed' : 'The call is over', 409, 'GONE');
    c.status = 'ACTIVE'; c.answeredAt = nowIso(); if (c.record === 'ON') c.recordStartedAt = c.answeredAt;
    db.save(); audit(u, c, 'CALL_ANSWERED', `${u.name} answered ${c.callerName}`);
    res.json({ success: true, call: view(c, u) });
  });
  r.post('/:id/decline', (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (c.calleeId !== u.id || c.status !== 'RINGING') return bad(res, 'Nothing to decline', 409, 'GONE');
    endCall(c, 'DECLINED', u.id); db.save(); res.json({ success: true });
  });
  r.post('/:id/cancel', (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (c.callerId !== u.id || c.status !== 'RINGING') return bad(res, 'Nothing to cancel', 409, 'GONE');
    endCall(c, 'CANCELLED', u.id); db.save(); res.json({ success: true });
  });
  r.post('/:id/end', (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (R.isLive(c.status)) { endCall(c, c.status === 'RINGING' ? (c.callerId === u.id ? 'CANCELLED' : 'DECLINED') : 'ENDED', u.id); db.save(); audit(u, c, 'CALL_ENDED', `${u.name} ended the call (${R.fmtDuration(R.durationSec(c))})`); }
    res.json({ success: true, call: view(c, u) });
  });

  // ── the phones finding each other ──
  r.post('/:id/signal', perUser('call-sig', 1500, 3600_000), async (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (settle(c)) db.save();
    if (!R.isLive(c.status)) return bad(res, 'The call is over', 409, 'GONE');
    const kind = String(req.body?.kind || ''); const data = typeof req.body?.data === 'string' ? req.body.data : JSON.stringify(req.body?.data ?? null);
    if (!['offer', 'answer', 'ice', 'bye'].includes(kind)) return bad(res, 'Unknown signal');
    if (data.length > R.SIGNAL_MAX_BYTES) return bad(res, 'Signal too large', 413);
    await sigAdd(c.id, c.callerId === u.id ? c.calleeId : c.callerId, kind, data);
    res.json({ success: true });
  });
  /** the hot path: what the other phone sent me + the call's state (one small request about once a second) */
  r.get('/:id/signals', perUser('call-poll', 8000, 3600_000), async (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (settle(c)) db.save();
    const after = Math.max(0, Number(req.query.after) || 0);
    const signals = R.isLive(c.status) || c.status === 'ENDED' ? await sigList(c.id, u.id, after) : [];
    res.json({ success: true, call: view(c, u), signals });
  });

  // ── recording ──
  r.post('/:id/record', (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (settle(c)) db.save();
    const action = String(req.body?.action || '');
    if (c.status !== 'ACTIVE') return bad(res, 'The call is not running', 409, 'GONE');
    if (c.recordMode === 'FORBIDDEN') return bad(res, 'Recording is not allowed on this call', 403, 'RECORD_FORBIDDEN');
    if (c.recordMode === 'ALWAYS') return bad(res, 'This call is recorded under the employer\'s rule', 409, 'ALWAYS');
    if (action === 'ask') {
      if (c.record === 'ON' || c.record === 'ASKED') return bad(res, 'Already asked', 409, 'ASKED');
      if (c.recParts?.length || c.recFileAt) return bad(res, 'The recording of this call was stopped — it cannot be started again', 409, 'STOPPED');
      if ((c.recordAsks || 0) >= R.REC_ASK_MAX) return bad(res, 'You have asked enough times on this call', 429, 'ASK_LIMIT');
      c.record = 'ASKED'; c.recordBy = u.id; c.recordAsks = (c.recordAsks || 0) + 1;
      db.save(); audit(u, c, 'CALL_RECORD_ASKED', `${u.name} asked to record the call`);
    } else if (action === 'allow' || action === 'deny') {
      if (c.record !== 'ASKED' || c.recordBy === u.id) return bad(res, 'Nothing to answer', 409, 'NOTHING');
      c.record = action === 'allow' ? 'ON' : 'DENIED';
      if (action === 'allow') c.recordStartedAt = nowIso(); else c.recordBy = undefined;
      db.save(); audit(u, c, action === 'allow' ? 'CALL_RECORD_ALLOWED' : 'CALL_RECORD_DENIED', `${u.name} ${action === 'allow' ? 'allowed' : 'declined'} recording`);
    } else if (action === 'stop') {
      if (c.record !== 'ON') return bad(res, 'Not recording', 409, 'NOTHING');
      c.record = 'OFF'; db.save(); audit(u, c, 'CALL_RECORD_STOPPED', `${u.name} stopped the recording`);
    } else return bad(res, 'Unknown action');
    res.json({ success: true, call: view(c, u) });
  });

  /** one piece of the recording, sent by the phone that is recording (about a minute of audio each) */
  r.post('/:id/chunk', perUser('call-chunk', 400, 3600_000), express.raw({ type: () => true, limit: `${R.CHUNK_MAX_BYTES}b` }), (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (c.recordBy !== u.id || c.recordMode === 'FORBIDDEN' || !c.recordStartedAt) return bad(res, 'This phone is not the one recording', 403, 'NOT_RECORDER');
    if (c.recFileAt) return bad(res, 'The recording is already saved', 409, 'DONE');
    if (!R.isLive(c.status) && (!c.endedAt || Date.now() - Date.parse(c.endedAt) > R.REC_GRACE_SECONDS * 1000)) return bad(res, 'Too late for this call', 409, 'LATE');
    const seq = Number(req.query.seq); const body = req.body as Buffer;
    if (!Number.isInteger(seq) || seq < 0 || seq >= R.REC_MAX_PARTS) return bad(res, 'Bad piece number');
    if (!Buffer.isBuffer(body) || body.length < 16) return bad(res, 'Empty piece');
    if (body.length > R.CHUNK_MAX_BYTES) return bad(res, 'Piece too large', 413);
    if (seq === 0 && !R.sniffAudio(body)) return bad(res, 'That is not an audio recording', 415);
    const parts = new Set(c.recParts || []);
    const before = (c.recBytes || 0);
    if (before + body.length > R.REC_TOTAL_MAX_BYTES && !parts.has(seq)) return bad(res, 'The recording is too long to keep', 413, 'TOO_LONG');
    try {
      fs.mkdirSync(partsDir(c.id), { recursive: true });
      const tmp = partFile(c.id, seq) + '.tmp'; fs.writeFileSync(tmp, body); fs.renameSync(tmp, partFile(c.id, seq));
    } catch { return bad(res, 'Could not save this piece — it will be tried again', 500); }
    if (!parts.has(seq)) { parts.add(seq); c.recBytes = before + body.length; }
    c.recParts = [...parts].sort((a, b) => a - b);
    db.save();
    res.json({ success: true, parts: c.recParts.length });
  });
  /** the recording phone says "that was the last piece" */
  r.post('/:id/record/finish', (req: Request, res: Response) => {
    const u = me(); const c = mineCall(req, res); if (!c) return;
    if (c.recordBy !== u.id) return bad(res, 'This phone is not the one recording', 403, 'NOT_RECORDER');
    if (!c.recParts?.length && !c.recFileAt) return res.json({ success: true, saved: false });
    const ok = c.recFileAt ? true : mergeAudio(c);
    db.save();
    if (ok) audit(u, c, 'CALL_RECORDED', `Recording of ${c.callerName} ↔ ${c.calleeName} saved (${Math.round((c.recBytes || 0) / 1024)} KB, kept ${R.REC_KEEP_DAYS} days)`);
    res.json({ success: true, saved: ok });
  });

  r.get('/:id/audio', perUser('call-audio', 120, 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = S(); const c = s.calls.find(x => x.id === req.params.id);
    if (!c || !canListen(u, c)) return bad(res, 'Recording not found', 404, 'NOT_FOUND');
    if (!hasAudio(c)) return bad(res, c.recDeletedAt ? 'This recording was deleted' : `Recordings are kept ${R.REC_KEEP_DAYS} days`, 404, 'GONE');
    if (!c.recFileAt && R.isLive(c.status) === false && !mergeAudio(c)) return bad(res, 'The recording could not be put together', 404, 'GONE');
    if (!c.recFileAt) return bad(res, 'The recording is still being saved — try in a minute', 409, 'BUSY');
    let buf: Buffer; try { buf = fs.readFileSync(finalFile(c)); } catch { return bad(res, 'The recording is no longer available', 404, 'GONE'); }
    db.appendAuditEvent(u.id, u.role, c.context === 'DEAL' ? 'DEAL' : 'VERIFICATION', c.contextId || c.id, 'CALL_AUDIO_OPENED', `${u.name} listened to the call ${c.callerName} ↔ ${c.calleeName}`);
    res.set({ 'Content-Type': c.recMime || 'audio/webm', 'Content-Length': String(buf.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(buf);
  });
  r.delete('/:id/audio', (req: Request, res: Response) => {
    const u = me(); const c = S().calls.find(x => x.id === req.params.id);
    if (!c || !canListen(u, c)) return bad(res, 'Recording not found', 404, 'NOT_FOUND');
    if (R.isLive(c.status)) return bad(res, 'Wait until the call ends', 409);
    dropAudio(c); c.recDeletedAt = nowIso(); db.save();
    audit(u, c, 'CALL_AUDIO_DELETED', `${u.name} deleted the recording of ${c.callerName} ↔ ${c.calleeName}`);
    res.json({ success: true });
  });

  return r;
}

// ───────────────────────── sweeps, erase, export ─────────────────────────
export function sweepCalls(now = Date.now()) {
  const s = S(); let changed = false;
  for (const c of s.calls) {
    if (R.isLive(c.status) && settle(c, now)) changed = true;
    // a recording phone that never said "finished": join what arrived once the grace is over
    if (!R.isLive(c.status) && c.recParts?.length && !c.recFileAt && c.endedAt && now - Date.parse(c.endedAt) > (R.REC_GRACE_SECONDS + 30) * 1000) { mergeAudio(c); changed = true; }
    if (!c.recDeletedAt && (c.recFileAt || c.recParts?.length) && !R.recordingKept(c.endedAt || c.createdAt, now)) { dropAudio(c); c.recDeletedAt = nowIso(); changed = true; }
  }
  const old = s.calls.filter(c => now - Date.parse(c.createdAt) > 400 * 86_400_000);
  if (old.length) { old.forEach(dropAudio); s.calls = s.calls.filter(c => !old.includes(c)); changed = true; }
  if (changed) db.save();
  void sigPrune().catch(() => { /* a failed prune is tried again next hour */ });
}
/** an erased person: his recordings go (they were heard on his say-so too), his name leaves the call log; an employer's settings go */
export function eraseCalls(s: DbState, userId: string, anonName: string) {
  for (const c of s.calls) {
    if (c.callerId !== userId && c.calleeId !== userId && c.callerEmployerId !== userId && c.calleeEmployerId !== userId) continue;
    dropAudio(c); if (!c.recDeletedAt && (c.recBytes || c.recMime)) c.recDeletedAt = nowIso();
    if (c.callerId === userId) c.callerName = anonName; if (c.calleeId === userId) c.calleeName = anonName;
  }
  s.callSettings = s.callSettings.filter(x => x.employerId !== userId);
}
/** what a person may download about himself: the log of his own calls (no audio, no other person's employer data) */
export function exportCalls(s: DbState, userId: string) {
  return s.calls.filter(c => c.callerId === userId || c.calleeId === userId).slice(0, 500)
    .map(c => ({ at: c.createdAt, with: c.callerId === userId ? c.calleeName : c.callerName, direction: c.callerId === userId ? 'out' : 'in', status: c.status, seconds: R.durationSec(c), recorded: !!(c.recFileAt || c.recDeletedAt) }));
}
