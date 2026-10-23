/**
 * v19 — ID upload + ID review.   Mounted at /api/id-review.
 *
 *  • A member (or the RERA sponsor who registers him) can attach a photo / PDF of the PAN card and a MASKED Aadhaar card.
 *    Files live in data/iddocs/<id>.bin (the `appdata` volume); the database keeps only the record. The file type is read from the real bytes.
 *    The full Aadhaar number is still never stored — only the last 4 digits typed in; a scan is a separate, consented, short-lived copy.
 *  • Who can open a scan: the GENZ ID-review team (every opening is written to the audit trail) and the owner. Never the sponsor once the person has joined.
 *  • An "ID review task" is opened for every broker whose ID is not yet checked. Any reviewer (admin / superadmin) can see the queue,
 *    assign a task to a colleague (or set a default reviewer), mark "ID seen", ask for a clearer copy, or reject/suspend through the normal KYC review.
 *  • Switch (admin AND superadmin): "auto-verify RERA referrals" — a person registered by a verified, strike-free RERA broker is verified at sign-up;
 *    the ID check follows as an open task and the team is notified (badge on the ID Review tab) until it is done. Default OFF.
 *  • Scans are deleted 90 days after the decision, 14 days after a request that never became an account ended, and on DPDP erasure.
 */
import { alert } from './alerts.js';
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, IdDoc, IdReviewTask, DatabaseState } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { can } from './permissions.js';
import { maskPan } from './kyc.js';
import { kycFlags, vaultOn } from './kycvault.js';
import { sponsorOf } from './tiers.js';
import { tierOf, inProbation } from '../src/shared/networkRules.js';
import { sniffMime } from '../src/shared/propDocs.js';
import { maskAadhaar, isSponsorEligible, ID_DOC_KINDS, ID_DOC_MAX_BYTES, ID_DOC_RETENTION_DAYS, ID_DOC_ORPHAN_DAYS } from '../src/shared/idRules.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json(code ? { error, code } : { error });
const DIR = () => path.resolve(process.cwd(), 'data', 'iddocs');
const fileOf = (id: string) => path.join(DIR(), `${id}.bin`);
const ACTIVE: IdReviewTask['status'][] = ['OPEN', 'CHANGES_ASKED'];
const HISTORY_CAP = 40;
const nameOf = (s: DatabaseState, id?: string) => (id ? s.users.find(x => x.id === id)?.name || '—' : '');

// ───────────────────────── files ─────────────────────────
const eraseFile = (id: string) => { try { fs.unlinkSync(fileOf(id)); } catch { /* already gone */ } };
const removeDoc = (s: DatabaseState, d: IdDoc) => { eraseFile(d.id); s.idDocs = s.idDocs.filter(x => x !== d); };

const docMeta = (d: IdDoc) => ({ id: d.id, kind: d.kind, uploadedBy: d.uploadedBy, fileName: d.fileName, mime: d.mime, size: d.size, createdAt: d.createdAt });

/** Docs that belong to a person: attached to his account, or still attached to the sponsor's request that became his account. */
export const docsOfUser = (s: DatabaseState, userId: string) => s.idDocs.filter(d => d.subjectUserId === userId);
export const docsOfApplication = (s: DatabaseState, appId: string) => s.idDocs.filter(d => d.applicationId === appId && !d.subjectUserId);

/** Validate + store one scan; a new scan of the same kind replaces the old one. Returns the record or an error. */
function storeDoc(owner: { userId?: string; appId?: string }, kind: string, fileName: string, data: string, uploadedBy: 'SPONSOR' | 'SELF', uploaderId: string): { doc: IdDoc } | { error: string; status: number } {
  const s = st();
  if (!(ID_DOC_KINDS as readonly string[]).includes(kind)) return { error: 'Choose PAN or Aadhaar', status: 400 };
  const raw = data.replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return { error: 'The file could not be read. Please choose it again.', status: 400 };
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 0) return { error: 'The file is empty.', status: 400 };
  if (buf.length > ID_DOC_MAX_BYTES) return { error: `The file is larger than ${ID_DOC_MAX_BYTES / 1024 / 1024} MB. Send a smaller photo.`, status: 413 };
  const mime = sniffMime(buf);
  if (!mime) return { error: 'Only a PDF, JPEG, PNG or WebP file is accepted.', status: 415 };
  const id = `IDD-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(1000, 9999)}`;
  try {
    fs.mkdirSync(DIR(), { recursive: true });
    const tmp = fileOf(id) + '.tmp';
    fs.writeFileSync(tmp, buf); fs.renameSync(tmp, fileOf(id));
  } catch { return { error: 'The file could not be saved on the server. Please try again.', status: 500 }; }
  const old = owner.userId ? docsOfUser(s, owner.userId).filter(d => d.kind === kind) : docsOfApplication(s, owner.appId || '').filter(d => d.kind === kind);
  for (const d of old) removeDoc(s, d);
  const doc: IdDoc = {
    id, kind: kind as IdDoc['kind'], subjectUserId: owner.userId, applicationId: owner.appId, uploadedBy, uploaderId,
    fileName: fileName.replace(/[\\/\0\r\n]+/g, '_').slice(0, 160), mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), createdAt: nowIso(),
  };
  s.idDocs.push(doc);
  return { doc };
}

/** DPDP erasure + withdrawn requests: delete scans from disk and from the database. */
export function purgeUserIdDocs(s: DatabaseState, userId: string): number {
  const doomed = s.idDocs.filter(d => d.subjectUserId === userId || (d.uploadedBy === 'SELF' && d.uploaderId === userId));
  for (const d of doomed) eraseFile(d.id);
  s.idDocs = s.idDocs.filter(d => !doomed.includes(d));
  s.idReviewTasks = s.idReviewTasks.filter(t => t.userId !== userId);
  return doomed.length;
}
export function purgeApplicationDocs(appId: string): number {
  const s = st();
  const doomed = docsOfApplication(s, appId);
  for (const d of doomed) removeDoc(s, d);
  return doomed.length;
}
/** Hourly: scans of a decided check go after ID_DOC_RETENTION_DAYS; scans of a request that never became an account after ID_DOC_ORPHAN_DAYS. */
export function sweepIdDocs() {
  const s = st(); const now = Date.now(); let changed = false;
  for (const d of [...s.idDocs]) {
    const decided = d.reviewedAt && Date.parse(d.reviewedAt) + ID_DOC_RETENTION_DAYS * 86400_000 < now;
    const app = d.applicationId && !d.subjectUserId ? s.tier2Applications.find(a => a.id === d.applicationId) : undefined;
    const orphan = d.applicationId && !d.subjectUserId && (!app || (!['OPEN', 'INVITED'].includes(app.status) && Date.parse(app.updatedAt) + ID_DOC_ORPHAN_DAYS * 86400_000 < now));
    const gone = d.subjectUserId && !s.users.some(u => u.id === d.subjectUserId);
    if (decided || orphan || gone) { removeDoc(s, d); changed = true; }
  }
  if (changed) db.save();
}

// ───────────────────────── tasks ─────────────────────────
const push = (t: IdReviewTask, by: string, action: string, note?: string) => {
  t.history.push({ at: nowIso(), by, action, note });
  if (t.history.length > HISTORY_CAP) t.history.splice(0, t.history.length - HISTORY_CAP);
};

/** Someone who may do ID checks right now (verified, holds users:review). */
export const isReviewer = (u?: UserProfile) => !!u && u.verificationStatus === 'VERIFIED' && can(u, 'users:review');
const reviewerList = (s: DatabaseState) => s.users.filter(isReviewer).map(u => ({ id: u.id, name: u.name, role: u.role })).sort((a, b) => a.name.localeCompare(b.name));

function defaultAssignee(s: DatabaseState, subjectId: string): string | undefined {
  const id = s.settings.idReviewDefaultAssigneeId;
  const u = id ? s.users.find(x => x.id === id) : undefined;
  return u && isReviewer(u) && u.id !== subjectId ? u.id : undefined;
}

/** Open (or reopen) the ID check of a broker. Safe to call again and again. */
export function openIdTask(userId: string, source: IdReviewTask['source'], opts: { autoVerified?: boolean; note?: string; by?: string } = {}): IdReviewTask | null {
  const s = st(); const u = s.users.find(x => x.id === userId);
  if (!u || u.role !== 'BROKER') return null;
  const by = opts.by || 'system'; const at = nowIso();
  let t = s.idReviewTasks.find(x => x.userId === userId);
  if (t) {
    if (!ACTIVE.includes(t.status)) { t.status = 'OPEN'; t.doneAt = undefined; t.doneBy = undefined; push(t, by, 'REOPENED', opts.note || source); }
    else if (t.status === 'CHANGES_ASKED' && (source === 'NEW_FILE' || source === 'ID_CHANGED')) { t.status = 'OPEN'; push(t, by, 'RESUBMITTED', opts.note); }
    else if (opts.note) push(t, by, source, opts.note);
    if (opts.autoVerified) t.autoVerified = true;
    t.updatedAt = at;
  } else {
    t = { id: `IDR-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(100, 999)}`, userId, status: 'OPEN', source, autoVerified: opts.autoVerified || undefined, createdAt: at, updatedAt: at, history: [] };
    push(t, by, source, opts.note);
    s.idReviewTasks.push(t);
  }
  if (!t.assigneeId) { const a = defaultAssignee(s, userId); if (a) { t.assigneeId = a; t.assignedBy = 'system'; t.assignedAt = at; push(t, 'system', 'ASSIGNED', `default reviewer ${nameOf(s, a)}`); } }
  return t;
}

/** Brokers who already have an ID on file but no task yet (older data, or created by another route) get one; tasks of people who left the network are closed. */
export function ensureIdTasks(): boolean {
  const s = st(); let changed = false;
  for (const u of s.users) {
    if (u.role !== 'BROKER') continue;
    const has = s.idReviewTasks.some(t => t.userId === u.id);
    if (!has && (u.panNumber || u.aadhaarLast4) && !u.idCheckedAt && ['PENDING', 'VERIFIED'].includes(u.verificationStatus)) {
      openIdTask(u.id, 'BACKFILL', { autoVerified: !!u.autoVerifiedAt }); changed = true;
    }
  }
  for (const t of s.idReviewTasks) {
    const u = s.users.find(x => x.id === t.userId);
    if (ACTIVE.includes(t.status) && (!u || !['PENDING', 'VERIFIED'].includes(u.verificationStatus))) { t.status = 'REJECTED'; t.doneAt = nowIso(); t.doneBy = 'system'; push(t, 'system', 'CLOSED', 'account is no longer active'); changed = true; }
  }
  if (changed) db.save();
  return changed;
}

/** The tick "I have seen the PAN card and Aadhaar card" — the single place that sets or clears it (KYC table, sponsor chain and ID review all call this). */
export function recordIdTick(subject: UserProfile, reviewer: UserProfile, checked: boolean, note: string) {
  const s = st(); const at = nowIso();
  if (checked) {
    subject.idCheckedAt = at; subject.idCheckedBy = reviewer.id; subject.idCheckNote = note || undefined;
    const t = s.idReviewTasks.find(x => x.userId === subject.id) || openIdTask(subject.id, 'REOPENED', { by: reviewer.id });
    if (t) { t.status = 'DONE'; t.doneAt = at; t.doneBy = reviewer.id; t.note = note || undefined; t.updatedAt = at; push(t, reviewer.id, 'SEEN', note || undefined); }
    for (const d of docsOfUser(s, subject.id)) d.reviewedAt = at;
  } else {
    subject.idCheckedAt = undefined; subject.idCheckedBy = undefined; subject.idCheckNote = undefined;
    const t = s.idReviewTasks.find(x => x.userId === subject.id);
    if (t && !ACTIVE.includes(t.status)) openIdTask(subject.id, 'REOPENED', { by: reviewer.id, note: 'tick cleared' });
  }
}

/** A suspend / reject / blacklist decision closes the ID check too, and starts the delete clock on the scans. */
export function closeIdTaskOnAdverse(userId: string, byId: string, action: string, note?: string) {
  const s = st(); const at = nowIso();
  const t = s.idReviewTasks.find(x => x.userId === userId);
  if (t && ACTIVE.includes(t.status)) { t.status = 'REJECTED'; t.doneAt = at; t.doneBy = byId; t.updatedAt = at; push(t, byId, action, note); }
  for (const d of docsOfUser(s, userId)) d.reviewedAt = at;
}

/**
 * Decides whether a brand-new member, registered by `sponsor`, is verified at sign-up.
 * `apply` only when the switch is ON and the sponsor is a verified, strike-free, not-paused RERA broker. `why` explains a skip (kept in the task history).
 */
export function autoVerifyDecision(sponsor: UserProfile | undefined): { apply: boolean; why: string } {
  if (!st().settings.autoVerifyReraReferrals) return { apply: false, why: '' };
  if (!isSponsorEligible(sponsor)) return { apply: false, why: 'auto-verify skipped: the sponsor is not an active RERA-registered member' };
  if ((sponsor!.vouchStrikes || 0) > 0) return { apply: false, why: 'auto-verify skipped: the sponsor already has a strike' };
  if (sponsor!.vouchBanUntil && Date.parse(sponsor!.vouchBanUntil) > Date.now()) return { apply: false, why: 'auto-verify skipped: the sponsor’s right to register is paused' };
  return { apply: true, why: '' };
}

// ───────────────────────── views ─────────────────────────
function taskRow(s: DatabaseState, t: IdReviewTask) {
  const u = s.users.find(x => x.id === t.userId);
  const sp = u ? s.users.find(x => x.id === sponsorOf(u)) : undefined;
  const app = u ? s.tier2Applications.find(a => a.userId === u.id) : undefined;
  const docs = docsOfUser(s, t.userId);
  const mismatch = {
    pan: !!(app?.panNumber && u?.panNumber && app.panNumber !== u.panNumber),
    aadhaar: !!(app?.aadhaarLast4 && u?.aadhaarLast4 && app.aadhaarLast4 !== u.aadhaarLast4),
  };
  return {
    id: t.id, status: t.status, source: t.source, autoVerified: !!t.autoVerified, createdAt: t.createdAt, updatedAt: t.updatedAt, doneAt: t.doneAt || null,
    doneBy: nameOf(s, t.doneBy), note: t.note || '',
    assignee: t.assigneeId ? { id: t.assigneeId, name: nameOf(s, t.assigneeId) } : null,
    user: u ? {
      id: u.id, name: u.name, city: u.city || '', company: u.companyName || '', tier: tierOf(u), status: u.verificationStatus, joinedAt: u.createdAt,
      probation: inProbation(u), autoVerifiedAt: u.autoVerifiedAt || null,
    } : null,
    sponsor: sp ? { id: sp.id, name: sp.name, company: sp.companyName || '', city: sp.city || '', rera: sp.reraNumber || '', strikes: sp.vouchStrikes || 0 } : null,
    idInfo: {
      pan: u?.panNumber ? maskPan(u.panNumber) : '', hasPan: !!u?.panNumber, aadhaar: maskAadhaar(u?.aadhaarLast4), hasAadhaar: !!u?.aadhaarLast4,
      consent: !!u?.idConsentAt, checked: !!u?.idCheckedAt, checkedAt: u?.idCheckedAt || null, checkedBy: nameOf(s, u?.idCheckedBy), checkNote: u?.idCheckNote || '',
    },
    docs: docs.map(docMeta), mismatch: mismatch.pan || mismatch.aadhaar,
    _mismatch: mismatch,
    sponsorGave: !!app && !!(app.panNumber || app.aadhaarLast4 || docsOfUser(s, t.userId).some(d => d.uploadedBy === 'SPONSOR')),
  };
}

function inQueue(t: IdReviewTask, f: string, meId: string, now: number): boolean {
  switch (f) {
    case 'auto': return t.status === 'OPEN' && !!t.autoVerified;
    case 'mine': return t.status === 'OPEN' && t.assigneeId === meId;
    case 'unassigned': return t.status === 'OPEN' && !t.assigneeId;
    case 'asked': return t.status === 'CHANGES_ASKED';
    case 'done': return (t.status === 'DONE' || t.status === 'REJECTED') && !!t.doneAt && now - Date.parse(t.doneAt) < 90 * 86400_000;
    case 'all': return true;
    default: return t.status === 'OPEN'; // 'todo'
  }
}

function counts(s: DatabaseState, meId: string) {
  const now = Date.now(); const c = (f: string) => s.idReviewTasks.filter(t => inQueue(t, f, meId, now)).length;
  return {
    todo: c('todo'), auto: c('auto'), mine: c('mine'), unassigned: c('unassigned'), asked: c('asked'), done: c('done'),
    // the badge on the ID Review tab: checks waiting for ME (assigned to me) or for ANYONE (not assigned yet)
    badge: s.idReviewTasks.filter(t => t.status === 'OPEN' && (!t.assigneeId || t.assigneeId === meId)).length,
  };
}

// ───────────────────────── router ─────────────────────────
export function createIdReviewRouter() {
  const r = Router();
  const big = express.json({ limit: '6mb' });
  const uploadBody = z.object({ kind: z.enum(ID_DOC_KINDS), fileName: z.string().trim().min(1).max(160), data: z.string().min(8) });

  // ── the member's own side (also while PENDING) ──
  r.get('/mine', needs('self:read'), (_req, res) => {
    const u = me(); const s = st();
    if (u.role !== 'BROKER') return bad(res, 'Only brokers give an ID here', 403);
    const t = s.idReviewTasks.find(x => x.userId === u.id);
    res.json({
      success: true, docs: docsOfUser(s, u.id).map(docMeta), maxBytes: ID_DOC_MAX_BYTES, retentionDays: ID_DOC_RETENTION_DAYS,
      review: t ? { status: t.status, note: t.status === 'CHANGES_ASKED' ? t.note || '' : '', updatedAt: t.updatedAt } : null,
    });
  });

  r.post('/mine/docs', needs('self:update'), rateLimit('iddoc-up', 40, 3600_000), big, (req: Request, res: Response) => {
    const u = me(); const s = st();
    if (u.role !== 'BROKER') return bad(res, 'Only brokers give an ID here', 403);
    if (!['PENDING', 'VERIFIED'].includes(u.verificationStatus)) return bad(res, 'Your account cannot add ID copies right now', 403);
    const b = uploadBody.safeParse(req.body); if (!b.success) return bad(res, 'Choose the file and what it is (PAN or Aadhaar).');
    const out = storeDoc({ userId: u.id }, b.data.kind, b.data.fileName, b.data.data, 'SELF', u.id);
    if ('error' in out) return bad(res, out.error, out.status);
    openIdTask(u.id, 'NEW_FILE', { by: u.id });
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', u.id, 'IDDOC_UPLOADED', `${u.name} added a ${b.data.kind === 'PAN' ? 'PAN card' : 'masked Aadhaar'} copy (${(out.doc.size / 1024).toFixed(0)} KB, SHA-256 ${out.doc.sha256.slice(0, 16)}…)`);
    res.json({ success: true, doc: docMeta(out.doc), docs: docsOfUser(s, u.id).map(docMeta) });
  });

  r.delete('/mine/docs/:id', needs('self:update'), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const d = s.idDocs.find(x => x.id === req.params.id && x.subjectUserId === u.id);
    if (!d) return bad(res, 'Copy not found', 404);
    removeDoc(s, d); db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', u.id, 'IDDOC_DELETED', `${u.name} deleted a ${d.kind === 'PAN' ? 'PAN card' : 'masked Aadhaar'} copy`);
    res.json({ success: true, docs: docsOfUser(s, u.id).map(docMeta) });
  });

  // ── the sponsor's side: copies attached to his own request, before the person has an account ──
  const myApp = (req: Request, res: Response) => {
    const u = me(); const s = st();
    const a = s.tier2Applications.find(x => x.id === req.params.appId && x.proposerId === u.id);
    if (!a) { bad(res, 'Request not found', 404); return null; }
    if (!['OPEN', 'INVITED'].includes(a.status)) { bad(res, 'This request is closed — copies can no longer be added', 409); return null; }
    return { u, s, a };
  };
  r.get('/applications/:appId/docs', needs('tier2:vouch'), (req, res) => {
    const x = myApp(req, res); if (!x) return;
    res.json({ success: true, docs: docsOfApplication(x.s, x.a.id).map(docMeta), maxBytes: ID_DOC_MAX_BYTES });
  });
  r.post('/applications/:appId/docs', needs('tier2:vouch'), rateLimit('iddoc-up', 40, 3600_000), big, (req: Request, res: Response) => {
    const x = myApp(req, res); if (!x) return;
    const b = uploadBody.safeParse(req.body); if (!b.success) return bad(res, 'Choose the file and what it is (PAN or Aadhaar).');
    const out = storeDoc({ appId: x.a.id }, b.data.kind, b.data.fileName, b.data.data, 'SPONSOR', x.u.id);
    if ('error' in out) return bad(res, out.error, out.status);
    x.a.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(x.u.id, x.u.role, 'SYSTEM', x.a.id, 'IDDOC_UPLOADED', `${x.u.name} attached a ${b.data.kind === 'PAN' ? 'PAN card' : 'masked Aadhaar'} copy to the request for ${x.a.name} (${(out.doc.size / 1024).toFixed(0)} KB, SHA-256 ${out.doc.sha256.slice(0, 16)}…)`);
    res.json({ success: true, doc: docMeta(out.doc), docs: docsOfApplication(x.s, x.a.id).map(docMeta) });
  });
  r.delete('/applications/:appId/docs/:id', needs('tier2:vouch'), (req: Request, res: Response) => {
    const x = myApp(req, res); if (!x) return;
    const d = docsOfApplication(x.s, x.a.id).find(v => v.id === req.params.id);
    if (!d) return bad(res, 'Copy not found', 404);
    removeDoc(x.s, d); db.save();
    res.json({ success: true, docs: docsOfApplication(x.s, x.a.id).map(docMeta) });
  });

  // ── opening a scan ──
  r.get('/docs/:id/file', needs('self:read'), rateLimit('iddoc-open', 300, 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const d = s.idDocs.find(x => x.id === req.params.id);
    const reviewer = isReviewer(u);
    const own = !!d && ((d.subjectUserId === u.id) || (!d.subjectUserId && d.uploaderId === u.id));
    if (!d || (!reviewer && !own)) return bad(res, 'Copy not found', 404);
    let buf: Buffer;
    try { buf = fs.readFileSync(fileOf(d.id)); } catch { return bad(res, 'The file is missing on the server. Please upload it again.', 404); }
    if (reviewer && !own) {
      const who = d.subjectUserId ? nameOf(s, d.subjectUserId) : `request ${d.applicationId}`;
      db.appendAuditEvent(u.id, u.role, 'VERIFICATION', d.subjectUserId || d.applicationId || d.id, 'IDDOC_VIEWED', `${u.name} opened the ${d.kind === 'PAN' ? 'PAN card' : 'masked Aadhaar'} copy of ${who}`);
    }
    const safe = d.fileName.replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', d.mime);
    res.setHeader('Content-Disposition', `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(d.fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(buf.length));
    if (d.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.send(buf);
  });

  // ── the review team (admin + superadmin: users:review) ──
  const review = needs('users:review');

  r.get('/summary', review, (_req, res) => {
    const u = me(); ensureIdTasks();
    const s = st();
    res.json({ success: true, ...counts(s, u.id), autoVerifyOn: !!s.settings.autoVerifyReraReferrals });
  });

  r.get('/queue', review, (req, res) => {
    const u = me(); ensureIdTasks();
    const s = st(); const now = Date.now();
    const f = String(req.query.filter || 'todo'); const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
    const tier = String(req.query.tier || '');
    let list = s.idReviewTasks.filter(t => inQueue(t, f, u.id, now));
    let rows = list.map(t => taskRow(s, t)).filter(x => x.user);
    if (tier === 'TIER1' || tier === 'TIER2') rows = rows.filter(x => x.user!.tier === tier);
    if (q) rows = rows.filter(x => `${x.user!.name} ${x.user!.city} ${x.user!.company} ${x.sponsor?.name || ''}`.toLowerCase().includes(q));
    // oldest waiting first for the to-do lists, newest first for history
    rows.sort((a, b) => (['done', 'all'].includes(f) ? b.updatedAt.localeCompare(a.updatedAt) : a.createdAt.localeCompare(b.createdAt)));
    res.json({ success: true, filter: f, tasks: rows.slice(0, 200).map(({ _mismatch, ...x }) => x), total: rows.length, counts: counts(s, u.id) });
  });

  r.get('/tasks/:id', review, (req, res) => {
    const s = st();
    const t = s.idReviewTasks.find(x => x.id === req.params.id);
    if (!t) return bad(res, 'Task not found', 404);
    const u = s.users.find(x => x.id === t.userId); if (!u) return bad(res, 'Member not found', 404);
    const app = s.tier2Applications.find(a => a.userId === u.id);
    const row = taskRow(s, t);
    res.json({
      success: true,
      task: { ...row, _mismatch: undefined },
      // the reviewer is about to compare the card with the number — the full PAN and a phone for the video call are shown here (and only here)
      detail: {
        vault: { on: vaultOn(), ...kycFlags(u.id), canReveal: can(me(), 'kyc:reveal') },
        panFull: u.panNumber || '', phone: u.phone || '', email: u.email.endsWith('@phone.genz.local') ? '' : u.email, reraNumber: u.reraNumber || '',
        sponsorGave: app ? { companyName: app.companyName || '', pan: app.panNumber || '', aadhaarLast4: app.aadhaarLast4 || '', docs: docsOfUser(s, u.id).filter(d => d.uploadedBy === 'SPONSOR').map(d => d.kind) } : null,
        mismatch: row._mismatch,
        history: t.history.slice().reverse().map(h => ({ at: h.at, by: h.by === 'system' ? 'system' : nameOf(s, h.by), action: h.action, note: h.note || '' })),
      },
    });
  });

  r.post('/tasks/:id/assign', review, (req: Request, res: Response) => {
    const a = me(); const s = st();
    const t = s.idReviewTasks.find(x => x.id === req.params.id);
    if (!t) return bad(res, 'Task not found', 404);
    if (!ACTIVE.includes(t.status)) return bad(res, 'This check is already finished', 409);
    const to = req.body?.assigneeId ? String(req.body.assigneeId) : '';
    if (to) {
      const target = s.users.find(x => x.id === to);
      if (!isReviewer(target)) return bad(res, 'Only a GENZ admin / superadmin who can review KYC can be given this task', 400);
      if (target!.id === t.userId) return bad(res, 'A member cannot check his own ID', 400);
    }
    t.assigneeId = to || undefined; t.assignedBy = to ? a.id : undefined; t.assignedAt = to ? nowIso() : undefined; t.updatedAt = nowIso();
    push(t, a.id, to ? 'ASSIGNED' : 'UNASSIGNED', to ? nameOf(s, to) : undefined);
    db.save();
    db.appendAuditEvent(a.id, a.role, 'VERIFICATION', t.userId, to ? 'ID_TASK_ASSIGNED' : 'ID_TASK_UNASSIGNED', to ? `${a.name} gave the ID check of ${nameOf(s, t.userId)} to ${nameOf(s, to)}` : `${a.name} took the ID check of ${nameOf(s, t.userId)} off its reviewer`);
    res.json({ success: true });
  });

  r.post('/assign-unassigned', review, (req: Request, res: Response) => {
    const a = me(); const s = st();
    const to = String(req.body?.assigneeId || '');
    const target = s.users.find(x => x.id === to);
    if (!isReviewer(target)) return bad(res, 'Choose a GENZ admin / superadmin who can review KYC', 400);
    let n = 0;
    for (const t of s.idReviewTasks) if (t.status === 'OPEN' && !t.assigneeId && t.userId !== to) { t.assigneeId = to; t.assignedBy = a.id; t.assignedAt = nowIso(); t.updatedAt = nowIso(); push(t, a.id, 'ASSIGNED', nameOf(s, to)); n++; }
    db.save();
    if (n) db.appendAuditEvent(a.id, a.role, 'SYSTEM', 'ID-REVIEW', 'ID_TASKS_ASSIGNED', `${a.name} gave ${n} unassigned ID check(s) to ${nameOf(s, to)}`);
    res.json({ success: true, assigned: n });
  });

  r.post('/tasks/:id/decide', review, (req: Request, res: Response) => {
    const a = me(); const s = st();
    const t = s.idReviewTasks.find(x => x.id === req.params.id);
    if (!t) return bad(res, 'Task not found', 404);
    const subject = s.users.find(x => x.id === t.userId); if (!subject) return bad(res, 'Member not found', 404);
    if (subject.id === a.id) return bad(res, 'You cannot check your own ID', 403);
    const b = z.object({ decision: z.enum(['SEEN', 'ASK_AGAIN']), note: z.string().trim().max(300).optional() }).safeParse(req.body);
    if (!b.success) return bad(res, 'Choose what you decided.');
    const note = b.data.note || '';
    if (b.data.decision === 'SEEN') {
      if (!subject.panNumber || !subject.aadhaarLast4) return bad(res, 'PAN and Aadhaar are not on file yet — ask the member to add them first', 409, 'ID_MISSING');
      recordIdTick(subject, a, true, note);
      db.save();
      db.appendAuditEvent(a.id, a.role, 'VERIFICATION', subject.id, 'ID_CHECKED', `${a.name} saw the PAN card and Aadhaar card of ${subject.name}${note ? `: ${note}` : ''}`);
    } else {
      if (note.length < 5) return bad(res, 'Tell the member what is wrong (e.g. “Aadhaar photo is blurry — send a clearer one”).');
      if (subject.idCheckedAt) recordIdTick(subject, a, false, '');
      t.status = 'CHANGES_ASKED'; t.note = note; t.updatedAt = nowIso(); push(t, a.id, 'ASKED_AGAIN', note);
      db.save();
      db.appendAuditEvent(a.id, a.role, 'VERIFICATION', subject.id, 'ID_CHANGES_ASKED', `${a.name} asked ${subject.name} for a clearer / corrected ID: ${note}`);
      alert(subject.id, 'system', 'GENZ asked for a change in your ID copy', String(note || '').slice(0, 140), '/', { not: a.id, hi: ['GENZ ने आपकी ID कॉपी में बदलाव माँगा', String(note || '').slice(0, 140)] });
    }
    res.json({ success: true, task: taskRow(s, t) });
  });

  // ── the switches (admin AND superadmin) ──
  r.get('/settings', review, (_req, res) => {
    const s = st(); const set = s.settings;
    res.json({
      success: true, autoVerify: !!set.autoVerifyReraReferrals, changedBy: nameOf(s, set.autoVerifyChangedBy), changedAt: set.autoVerifyChangedAt || null,
      defaultAssigneeId: set.idReviewDefaultAssigneeId || '', reviewers: reviewerList(s),
      retentionDays: ID_DOC_RETENTION_DAYS,
    });
  });

  r.put('/settings', review, (req: Request, res: Response) => {
    const a = me(); const s = st(); const set = s.settings;
    const b = z.object({ autoVerify: z.boolean().optional(), defaultAssigneeId: z.string().max(80).nullable().optional() }).safeParse(req.body);
    if (!b.success) return bad(res, 'Invalid setting');
    const changes: string[] = [];
    if (b.data.autoVerify !== undefined && b.data.autoVerify !== !!set.autoVerifyReraReferrals) {
      set.autoVerifyReraReferrals = b.data.autoVerify; set.autoVerifyChangedBy = a.id; set.autoVerifyChangedAt = nowIso();
      changes.push(`auto-verify RERA referrals ${b.data.autoVerify ? 'ON' : 'OFF'}`);
    }
    if (b.data.defaultAssigneeId !== undefined) {
      const to = b.data.defaultAssigneeId || '';
      if (to && !isReviewer(s.users.find(x => x.id === to))) return bad(res, 'Choose a GENZ admin / superadmin who can review KYC', 400);
      if ((set.idReviewDefaultAssigneeId || '') !== to) { set.idReviewDefaultAssigneeId = to || undefined; changes.push(to ? `default ID reviewer = ${nameOf(s, to)}` : 'no default ID reviewer'); }
    }
    if (changes.length) { db.save(); db.appendAuditEvent(a.id, a.role, 'SYSTEM', 'ID-REVIEW-SETTINGS', 'ID_REVIEW_SETTINGS', `${a.name}: ${changes.join('; ')}`); }
    res.json({ success: true, autoVerify: !!set.autoVerifyReraReferrals, defaultAssigneeId: set.idReviewDefaultAssigneeId || '' });
  });

  return r;
}
