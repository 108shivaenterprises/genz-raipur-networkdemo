/**
 * v36 — Verified Photo.   /api/profile-photo
 *
 * A broker uploads a face photo (the app shrinks it to ~480px JPEG first) and ticks his consent. It is PENDING until GENZ staff compare it with
 * his PAN / Aadhaar scan and approve it. Only then does it become his `avatarUrl` and show on his ID QR card with a "Photo checked by GENZ" mark.
 * A new photo never replaces an approved one until it is approved itself. A rejected photo is deleted from disk at once (the reason stays).
 * The picture is served only to signed-in members (never public) and is erased with the account (DPDP).
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from './db.js';
import type { ProfilePhoto, UserProfile, DatabaseState } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { sniffMime } from '../src/shared/propDocs.js';
import { pushTo } from './webpush.js';

export const PHOTO_MAX_BYTES = 150 * 1024;
const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const DIR = () => path.resolve(process.cwd(), 'data', 'profilephotos');
const fileOf = (id: string) => path.join(DIR(), `${id}.bin`);
const erase = (id: string) => { try { fs.unlinkSync(fileOf(id)); } catch { /* already gone */ } };
export const photoUrl = (userId: string) => `/api/profile-photo/u/${encodeURIComponent(userId)}`;
const view = (p: ProfilePhoto) => ({ id: p.id, status: p.status, createdAt: p.createdAt, review: p.review ? { at: p.review.at, note: p.review.note } : undefined });

/** DPDP erasure */
export function purgeUserPhotos(s: DatabaseState, userId: string): number {
  const doomed = s.profilePhotos.filter(p => p.userId === userId);
  for (const p of doomed) erase(p.id);
  s.profilePhotos = s.profilePhotos.filter(p => p.userId !== userId);
  return doomed.length;
}

export function createProfilePhotoRouter() {
  const r = Router();
  const send = (res: Response, p: ProfilePhoto) => {
    try {
      const buf = fs.readFileSync(fileOf(p.id));
      res.set({ 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(buf);
    } catch { bad(res, 'Photo not found', 404); }
  };

  r.get('/mine', needs('self:read'), (_req, res) => {
    const u = me();
    const list = st().profilePhotos.filter(p => p.userId === u.id);
    res.json({ success: true, approved: list.find(p => p.status === 'APPROVED') ? view(list.find(p => p.status === 'APPROVED')!) : null,
      latest: list.length ? view(list[list.length - 1]) : null, pending: list.find(p => p.status === 'PENDING') ? view(list.find(p => p.status === 'PENDING')!) : null, url: u.avatarUrl || null, maxBytes: PHOTO_MAX_BYTES });
  });

  r.post('/mine', needs('self:update'), rateLimit('photo-up', 10, 86400_000), (req: Request, res: Response) => {
    const u = me();
    if (req.body?.consent !== true) return bad(res, 'Tick that you agree to GENZ keeping your photo for your ID card.', 400, { hi: 'टिक करें कि आप अपनी ID कार्ड के लिए फ़ोटो GENZ के पास रखने पर सहमत हैं।', code: 'NO_CONSENT' });
    const raw = String(req.body?.data ?? '').replace(/^data:[^;]+;base64,/, '');
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw) || raw.length < 100) return bad(res, 'The photo could not be read. Please choose it again.');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length > PHOTO_MAX_BYTES) return bad(res, 'The photo is too big. Take it again or pick a smaller one.', 413);
    const mime = sniffMime(buf);
    if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') return bad(res, 'Only a JPEG, PNG or WebP photo is accepted.', 415);
    const s = st();
    for (const old of s.profilePhotos.filter(p => p.userId === u.id && p.status !== 'APPROVED')) erase(old.id); // a pending / rejected one is replaced
    s.profilePhotos = s.profilePhotos.filter(p => p.userId !== u.id || p.status === 'APPROVED');
    const id = `PHO-${crypto.randomBytes(5).toString('hex')}`;
    try { fs.mkdirSync(DIR(), { recursive: true }); const tmp = fileOf(id) + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, fileOf(id)); }
    catch { return bad(res, 'The photo could not be saved. Please try again.', 500); }
    s.profilePhotos.push({ id, userId: u.id, status: 'PENDING', mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), consentAt: nowIso(), createdAt: nowIso() });
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', u.id, 'PROFILE_PHOTO_UPLOADED', `${u.name} uploaded a profile photo ${id} for GENZ to check`);
    for (const a of s.users.filter(x => x.role === 'ADMIN' || x.role === 'SUPERADMIN').slice(0, 20)) void pushTo(a.id, { kind: 'deals', title: 'A broker photo needs checking', body: `${u.name} — open Disputes → Photo check.`, url: '/?tab=disputes' });
    res.json({ success: true });
  });

  /** the photo of a member: approved ones to any signed-in member; the owner and staff also see a pending one */
  r.get('/u/:userId', needs('self:read'), rateLimit('photo-open', 600, 3600_000), (req: Request, res: Response) => {
    const viewer = me();
    const list = st().profilePhotos.filter(p => p.userId === req.params.userId);
    const staff = viewer.role === 'ADMIN' || viewer.role === 'SUPERADMIN';
    const p = list.find(x => x.status === 'APPROVED') || ((viewer.id === req.params.userId || staff) ? list.find(x => x.status === 'PENDING') : undefined);
    if (!p) return bad(res, 'Photo not found', 404);
    send(res, p);
  });

  // ---- GENZ staff ----
  r.get('/admin', needs('users:review'), (_req, res) => {
    const users = new Map(st().users.map(x => [x.id, x]));
    const list = st().profilePhotos.filter(p => p.status === 'PENDING').map(p => {
      const u = users.get(p.userId);
      return { ...view(p), userId: p.userId, name: u?.name, companyName: u?.companyName, reraNumber: u?.reraNumber, pan: u?.panNumber ? `${u.panNumber.slice(0, 2)}…${u.panNumber.slice(-2)}` : undefined,
        idSeen: !!u?.idCheckedAt, idDocs: st().idDocs.filter(d => d.subjectUserId === p.userId).map(d => ({ id: d.id, kind: d.kind })), url: `/api/profile-photo/u/${encodeURIComponent(p.userId)}` };
    });
    res.json({ success: true, photos: list });
  });

  r.post('/admin/:id', needs('users:review'), (req: Request, res: Response) => {
    const a = me();
    const p = st().profilePhotos.find(x => x.id === req.params.id && x.status === 'PENDING');
    if (!p) return bad(res, 'Not found or already decided', 404);
    const approve = req.body?.verdict === 'APPROVE';
    const reason = String(req.body?.note ?? '').trim().slice(0, 200);
    if (!approve && reason.length < 5) return bad(res, 'Tell the broker what is wrong (e.g. “face not clear”).');
    const u = db.byId('users', p.userId) as UserProfile | undefined;
    if (!u) return bad(res, 'Member not found', 404);
    p.review = { byId: a.id, byName: a.name, at: nowIso(), note: reason || undefined };
    if (approve) {
      for (const old of st().profilePhotos.filter(x => x.userId === p.userId && x.status === 'APPROVED')) erase(old.id);
      st().profilePhotos = st().profilePhotos.filter(x => x.userId !== p.userId || x.status !== 'APPROVED');
      p.status = 'APPROVED'; u.avatarUrl = photoUrl(u.id);
    } else { p.status = 'REJECTED'; erase(p.id); }
    db.save();
    db.appendAuditEvent(a.id, a.role, 'VERIFICATION', u.id, approve ? 'PROFILE_PHOTO_APPROVED' : 'PROFILE_PHOTO_REJECTED', `${a.name} ${approve ? 'approved' : 'rejected'} ${u.name}'s photo ${p.id}${reason ? `: ${reason}` : ''}`);
    void pushTo(u.id, { kind: 'deals', title: approve ? 'Your photo is verified' : 'Your photo was not accepted', body: approve ? 'It now shows on your ID card.' : reason, url: '/?tab=network' });
    res.json({ success: true });
  });
  return r;
}
