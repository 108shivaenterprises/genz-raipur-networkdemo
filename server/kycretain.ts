/**
 * v74 — KYC kept after the member deletes his account.   Mounted at /api/kyc-retain (superadmin only).
 *
 * Krishna's rule: "KYC document and details must stay with GENZ, even if someone deletes his ID". When a DPDP erasure is completed we therefore
 * COPY the member's KYC into a sealed store BEFORE the normal erasure runs, and keep it for KYC_RETAIN_DAYS (3 years; the period and the consent wording are for GENZ's advocate to confirm):
 *   • face photo, ID scans (PAN / Aadhaar / voter / licence), the owner's selfie + ID, and the vault row (full Aadhaar + address, already sealed);
 *   • the identity details as they were (name, phone, e-mail, PAN, Aadhaar last 4, company, RERA, city) — sealed;
 *   • every file is AES-256-GCM sealed with the KYC vault key (no key = nothing is deleted and the erasure is refused with a clear message — never a weak copy);
 *   • the live copies are deleted as before: the member is gone from every list, card, board and search; only this sealed store holds KYC;
 *   • opened ONLY by a superadmin (`kyc:reveal`) with a purpose, a written reason, his own password (+ authenticator code) — every opening and every file is logged;
 *   • after the retention date the sealed files, the details and the vault row are deleted by the hourly sweep. Property papers, listing photos and chats are NOT kept.
 */
import { Router, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, DatabaseState, KycHold } from './db.js';
import { ctx, needs, rateLimit, verifyPassword, IS_PROD } from './auth.js';
import { twoFactorOn, verifySecondFactor } from './twofactor.js';
import { seal, unseal, vaultReady } from './vaultCrypto.js';
import { REVEAL_PURPOSES, REVEAL_PURPOSE_LABEL, REVEAL_MIN_REASON, REVEAL_MAX_REASON, KYC_RETAIN_DAYS, VIEW_LOG_CAP, type RevealPurpose } from '../src/shared/kycRules.js';

const DAY = 86_400_000;
const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json(code ? { error, code } : { error });
const DIR = () => path.resolve(process.cwd(), 'data', 'kycretained');
const sealedFile = (holdId: string, n: number) => path.join(DIR(), `${holdId}.${n}.sealed`);
/** KYC_RETAIN_DAYS, or the server's own number (a test uses 0) */
export const retainDays = () => { const v = process.env.KYC_RETAIN_DAYS; const n = v === undefined || v === '' ? NaN : Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : KYC_RETAIN_DAYS; };

interface Src { source: KycHold['files'][number]['source']; kind: string; file: string }
/** the member's KYC files that still exist on disk (property papers, listing photos and videos are not KYC) */
function kycSources(s: DatabaseState, userId: string): Src[] {
  const out: Src[] = []; const root = path.resolve(process.cwd(), 'data');
  for (const d of s.idDocs.filter(x => x.subjectUserId === userId || (x.uploadedBy === 'SELF' && x.uploaderId === userId))) out.push({ source: 'ID_DOC', kind: d.kind, file: path.join(root, 'iddocs', `${d.id}.bin`) });
  for (const p of s.profilePhotos.filter(x => x.userId === userId)) out.push({ source: 'PROFILE_PHOTO', kind: 'FACE_PHOTO', file: path.join(root, 'profilephotos', `${p.id}.bin`) });
  for (const d of s.ownerDocs.filter(x => x.userId === userId && ['SELFIE', 'ID_AADHAAR_MASKED', 'ID_PAN', 'ID_VOTER', 'ID_DL'].includes(x.kind))) out.push({ source: 'OWNER_DOC', kind: d.kind, file: path.join(root, 'ownerdocs', `${d.id}.bin`) });
  return out.filter(x => fs.existsSync(x.file));
}

/**
 * Called by the erasure BEFORE anything is blanked or deleted. { ok:true } with no hold = this member has no KYC to keep.
 * { ok:false } = could not be kept safely → the erasure must stop (nothing has been deleted).
 */
export function holdKyc(s: DatabaseState, t: UserProfile, now = Date.now()): { ok: true; hold?: KycHold } | { ok: false; error: string } {
  const srcs = kycSources(s, t.id); const vault = (s.kycVault || []).find(r => r.userId === t.id);
  const hasKyc = srcs.length > 0 || !!vault || !!t.panNumber || !!t.aadhaarLast4 || !!t.idCheckedAt;
  if (!hasKyc) return { ok: true };
  if (!vaultReady()) return { ok: false, error: 'This member has KYC that GENZ must keep for 3 years, but this server has no encryption key (KYC_VAULT_KEY), so it cannot be kept safely. Set the key first — nothing was deleted.' };
  const id = `KRH-${crypto.randomBytes(5).toString('hex')}`; const written: string[] = []; const files: KycHold['files'] = [];
  try {
    fs.mkdirSync(DIR(), { recursive: true });
    srcs.forEach((x, i) => {
      const buf = fs.readFileSync(x.file); const f = sealedFile(id, i + 1);
      const tmp = f + '.tmp'; fs.writeFileSync(tmp, seal(buf.toString('base64'), `${id}|file|${i + 1}`)); fs.renameSync(tmp, f); written.push(f);
      files.push({ n: i + 1, source: x.source, kind: x.kind, mime: sniff(buf), size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
    });
    const identity = { name: t.name, email: t.email, phone: t.phone, panNumber: t.panNumber, aadhaarLast4: t.aadhaarLast4, companyName: t.companyName, reraNumber: t.reraNumber, gstin: t.gstin, brokerId: t.brokerId, role: t.role, city: t.city, state: t.state, memberSince: t.createdAt, idCheckedAt: t.idCheckedAt, idCheckedBy: t.idCheckedBy };
    const hold: KycHold = { id, userId: t.id, erasedAt: new Date(now).toISOString(), retainUntil: new Date(now + retainDays() * DAY).toISOString(), identitySealed: seal(JSON.stringify(identity), `${id}|identity`), files, vault: vault ? JSON.parse(JSON.stringify(vault)) : undefined, openLog: [] };
    s.kycHolds.push(hold);
    return { ok: true, hold };
  } catch {
    for (const f of written) { try { fs.unlinkSync(f); } catch { /* */ } }
    return { ok: false, error: 'GENZ could not keep this member\'s KYC safely, so nothing was deleted. Try again, or check the server\'s disk and the KYC key.' };
  }
}
function sniff(b: Buffer): string {
  if (b.length > 4 && b.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.length > 8 && b.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (b.length > 12 && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}

/** Hourly: after the retention date the sealed files, the details and the vault row are deleted (a small tombstone stays so the audit trail still makes sense). */
export function sweepKycHolds(now = Date.now()): number {
  const s = st(); let n = 0;
  for (const h of s.kycHolds) {
    if (h.purgedAt || Date.parse(h.retainUntil) >= now) continue;
    for (const f of h.files) { try { fs.unlinkSync(sealedFile(h.id, f.n)); } catch { /* already gone */ } }
    h.filesPurged = h.files.length; h.files = []; h.vault = undefined; h.identitySealed = undefined; h.purgedAt = new Date(now).toISOString(); n++;
    db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'VERIFICATION', h.id, 'KYC_HOLD_PURGED', `The retained KYC of ${h.userId} was deleted: its ${Math.round(retainDays() / 365 * 10) / 10}-year retention period was over`);
  }
  if (n) db.save();
  return n;
}

const GRANT_MS = 10 * 60_000;
const grants = new Map<string, number>(); // `${adminId}|${holdId}` → until

export function createKycRetainRouter() {
  const r = Router();
  const sup = needs('kyc:reveal');
  const audit = (entityId: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'VERIFICATION', entityId, action, details); };

  r.get('/', sup, (_req, res) => {
    const s = st();
    res.json({ success: true, retainDays: retainDays(), holds: [...s.kycHolds].sort((a, b) => b.erasedAt.localeCompare(a.erasedAt)).slice(0, 200).map(h => ({
      id: h.id, userId: h.userId, label: s.users.find(u => u.id === h.userId)?.name || h.userId, erasedAt: h.erasedAt, retainUntil: h.retainUntil, purgedAt: h.purgedAt || null,
      files: h.files.map(f => ({ n: f.n, kind: f.kind })), filesPurged: h.filesPurged || 0, hasVault: !!(h.vault && (h.vault.aadhaarEnc || h.vault.addressEnc)), opened: h.openLog.length,
    })) });
  });

  /** same guard as the live vault: purpose + a written reason + the superadmin's own password (+ authenticator code) */
  r.post('/:id/open', sup, rateLimit('kyc-hold-open', 20, 3600_000), (req: Request, res: Response) => {
    const a = me(); const s = st(); const h = s.kycHolds.find(x => x.id === req.params.id);
    if (!h) return bad(res, 'Not found', 404);
    const b = z.object({ purpose: z.enum(REVEAL_PURPOSES), reason: z.string().trim().min(REVEAL_MIN_REASON, `Write why you need this (at least ${REVEAL_MIN_REASON} characters)`).max(REVEAL_MAX_REASON), ref: z.string().trim().max(60).optional(), password: z.string().min(1).max(200), code: z.string().trim().max(20).optional() }).safeParse(req.body);
    if (!b.success) return bad(res, b.error.issues[0]?.message || 'Choose a purpose and write the reason', 400, 'REVEAL_FIELDS');
    const me2 = s.users.find(x => x.id === a.id);
    if (!verifyPassword(b.data.password, me2?.passwordHash)) { audit(h.id, 'KYC_HOLD_DENIED', `${a.name} tried to open retained KYC ${h.id} with a wrong password`); return bad(res, 'Your password is not correct.', 403, 'BAD_PASSWORD'); }
    if (twoFactorOn(a.id)) {
      const v = verifySecondFactor(a.id, b.data.code || '');
      if (v === 'LOCKED') return bad(res, 'Too many wrong codes. Wait 15 minutes.', 429, 'TWO_FACTOR_LOCKED');
      if (v !== 'OK') { audit(h.id, 'KYC_HOLD_DENIED', `${a.name} tried to open retained KYC ${h.id} with a wrong two-step code`); return bad(res, 'The code from your authenticator app is not correct.', 403, 'BAD_CODE'); }
    } else if (IS_PROD) return bad(res, 'Turn on two-step sign-in (authenticator app) first — retained KYC does not open without it.', 403, 'TWO_FACTOR_REQUIRED');
    if (h.purgedAt || !h.identitySealed) return bad(res, 'The retention period is over and this KYC has been deleted.', 410, 'HOLD_PURGED');
    let identity: any; let aadhaar = ''; let address = ''; let pincode = '';
    try {
      identity = JSON.parse(unseal(h.identitySealed, `${h.id}|identity`));
      if (h.vault?.aadhaarEnc) aadhaar = unseal(h.vault.aadhaarEnc, `${h.vault.id}|aadhaar`);
      if (h.vault?.addressEnc) { const j = JSON.parse(unseal(h.vault.addressEnc, `${h.vault.id}|address`)); address = j.a || ''; pincode = j.p || ''; }
    } catch (e: any) { return bad(res, e?.message === 'VAULT_WRONG_KEY' ? 'The encryption key on this server is not the one this KYC was sealed with.' : 'This KYC could not be decrypted.', 500, e?.message || 'VAULT_BAD_DATA'); }
    h.openLog.push({ at: nowIso(), byId: a.id, byName: a.name, purpose: b.data.purpose, reason: b.data.reason, what: 'DETAILS' });
    if (h.openLog.length > VIEW_LOG_CAP) h.openLog.splice(0, h.openLog.length - VIEW_LOG_CAP);
    db.save(); grants.set(`${a.id}|${h.id}`, Date.now() + GRANT_MS);
    audit(h.id, 'KYC_HOLD_OPENED', `${a.name} opened the retained KYC ${h.id} — ${REVEAL_PURPOSE_LABEL[b.data.purpose as RevealPurpose].en}${b.data.ref ? ` [${b.data.ref}]` : ''}: ${b.data.reason}`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, member: { name: identity.name || '', phone: identity.phone || '', email: String(identity.email || '').endsWith('@phone.genz.local') ? '' : identity.email || '', city: identity.city || '', role: identity.role || '', company: identity.companyName || '', rera: identity.reraNumber || '', memberSince: identity.memberSince || '', idCheckedBy: identity.idCheckedBy || '' },
      pan: identity.panNumber || '', aadhaarLast4: identity.aadhaarLast4 || '', aadhaar, address, pincode, erasedAt: h.erasedAt, retainUntil: h.retainUntil,
      files: h.files.map(f => ({ n: f.n, kind: f.kind, source: f.source, mime: f.mime, size: f.size })), hideAfterSeconds: 90 });
  });

  /** a retained file — only within 10 minutes of a recorded opening by the same superadmin; each file opened is logged */
  r.get('/:id/file/:n', sup, rateLimit('kyc-hold-file', 60, 3600_000), (req: Request, res: Response) => {
    const a = me(); const s = st(); const h = s.kycHolds.find(x => x.id === req.params.id);
    const f = h?.files.find(x => x.n === Number(req.params.n));
    if (!h || !f || h.purgedAt) return bad(res, 'Not found', 404);
    if ((grants.get(`${a.id}|${h.id}`) || 0) < Date.now()) return bad(res, 'Open this KYC with a reason first (the access lasts 10 minutes).', 403, 'OPEN_FIRST');
    let buf: Buffer;
    try { buf = Buffer.from(unseal(fs.readFileSync(sealedFile(h.id, f.n), 'utf8'), `${h.id}|file|${f.n}`), 'base64'); } catch { return bad(res, 'This file could not be opened.', 500); }
    const last = h.openLog[h.openLog.length - 1];
    h.openLog.push({ at: nowIso(), byId: a.id, byName: a.name, purpose: last?.purpose || 'OTHER', reason: last?.reason || '', what: `FILE:${f.kind}` });
    if (h.openLog.length > VIEW_LOG_CAP) h.openLog.splice(0, h.openLog.length - VIEW_LOG_CAP);
    db.save(); audit(h.id, 'KYC_HOLD_FILE', `${a.name} opened ${f.kind} of the retained KYC ${h.id}`);
    res.set({ 'Content-Type': f.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(buf);
  });

  /** what the hourly sweep does, on demand: delete holds whose retention date has passed */
  r.post('/sweep', sup, (_req, res) => res.json({ success: true, purged: sweepKycHolds() }));
  return r;
}
