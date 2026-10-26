/**
 * v73 — owner uploads.   /api/owner-media
 *   POST /photo   a listing photo (the app shrinks it to ≤ ~1280 px first) → { url }            (anyone who may list: owner / broker)
 *   POST /video   a short listing video (≤ 3 MB mp4 / webm) → { url }
 *   GET  /f/:id   the photo / video, to any signed-in member (listing media is not secret; the address and the owner's phone never sit in it)
 *   POST /doc     a verification paper: selfie, ID, electricity bill / tax receipt / title … (private: the owner and GENZ staff only)
 *   GET  /doc, GET /doc/:id/file, DELETE /doc/:id (while still PENDING)
 *   GET  /admin/docs, POST /admin/docs/:id   GENZ staff check a paper and write who checked it (approve / send back with a reason)
 * Files live under data/ownermedia and data/ownerdocs (synced to the shared DB by fileSync like every other upload).
 */
import express, { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from './db.js';
import type { OwnerDoc, OwnerDocKind, UserProfile, DatabaseState } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { sniffMime } from '../src/shared/propDocs.js';
import { pushTo } from './webpush.js';

export const PHOTO_MAX = 450 * 1024;
export const VIDEO_MAX = 3 * 1024 * 1024;
export const DOC_MAX = 1536 * 1024;
const MAX_MEDIA_PER_USER = 150;
const MAX_DOCS_PER_USER = 40;
export const DOC_KINDS: Record<OwnerDocKind, { en: string; hi: string; group: 'FACE' | 'ID' | 'PAPER' }> = {
  SELFIE: { en: 'Your face photo (selfie)', hi: 'आपकी चेहरे की फ़ोटो (सेल्फ़ी)', group: 'FACE' },
  ID_AADHAAR_MASKED: { en: 'Aadhaar (masked — hide the first 8 digits)', hi: 'आधार (मास्क्ड — पहले 8 अंक ढकें)', group: 'ID' },
  ID_PAN: { en: 'PAN card', hi: 'पैन कार्ड', group: 'ID' },
  ID_VOTER: { en: 'Voter ID', hi: 'वोटर आईडी', group: 'ID' },
  ID_DL: { en: 'Driving licence', hi: 'ड्राइविंग लाइसेंस', group: 'ID' },
  ELECTRICITY_BILL: { en: 'Electricity bill of the property', hi: 'प्रॉपर्टी का बिजली बिल', group: 'PAPER' },
  TAX_RECEIPT: { en: 'Property tax receipt', hi: 'प्रॉपर्टी टैक्स की रसीद', group: 'PAPER' },
  TITLE_DEED: { en: 'Title / sale deed / registry', hi: 'टाइटल / रजिस्ट्री / बैनामा', group: 'PAPER' },
  OTHER: { en: 'Other paper', hi: 'अन्य काग़ज़', group: 'PAPER' },
};
const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const MEDIA_DIR = () => path.resolve(process.cwd(), 'data', 'ownermedia');
const DOC_DIR = () => path.resolve(process.cwd(), 'data', 'ownerdocs');
const mediaFile = (id: string) => path.join(MEDIA_DIR(), `${id}.bin`);
const docFile = (id: string) => path.join(DOC_DIR(), `${id}.bin`);
const erase = (f: string) => { try { fs.unlinkSync(f); } catch { /* gone */ } };
const rid = (p: string) => `${p}-${crypto.randomBytes(6).toString('hex')}`;
export const mediaUrl = (id: string) => `/api/owner-media/f/${id}`;

function sniffVideo(b: Buffer): string | null {
  if (b.length > 12 && b.slice(4, 8).toString('latin1') === 'ftyp') return b.slice(8, 12).toString('latin1') === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}
function readData(body: any): Buffer | null {
  const raw = String(body?.data ?? '').replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw) || raw.length < 100) return null;
  return Buffer.from(raw, 'base64');
}
function write(file: string, buf: Buffer): boolean {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = file + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, file); return true; } catch { return false; }
}

/** DPDP erasure */
export function purgeOwnerFiles(s: DatabaseState, userId: string): number {
  const m = s.ownerMedia.filter(x => x.userId === userId); const d = s.ownerDocs.filter(x => x.userId === userId);
  for (const x of m) erase(mediaFile(x.id)); for (const x of d) erase(docFile(x.id));
  s.ownerMedia = s.ownerMedia.filter(x => x.userId !== userId); s.ownerDocs = s.ownerDocs.filter(x => x.userId !== userId);
  return m.length + d.length;
}

const docView = (d: OwnerDoc) => ({ id: d.id, kind: d.kind, label: DOC_KINDS[d.kind], propertyId: d.propertyId, name: d.name, mime: d.mime, size: d.size, status: d.status, createdAt: d.createdAt, review: d.review ? { byName: d.review.byName, at: d.review.at, note: d.review.note } : undefined });
/** face + one ID both approved */
export const ownerIdChecked = (s: DatabaseState, userId: string) => {
  const ok = s.ownerDocs.filter(d => d.userId === userId && d.status === 'APPROVED');
  return ok.some(d => d.kind === 'SELFIE') && ok.some(d => DOC_KINDS[d.kind].group === 'ID');
};

export function createOwnerMediaRouter() {
  const r = Router();
  const big = express.json({ limit: '6mb' });
  const may = needs('property:create');

  const saveMedia = (kind: 'PHOTO' | 'VIDEO', req: Request, res: Response) => {
    const u = me(); const s = st();
    if (s.ownerMedia.filter(x => x.userId === u.id).length >= MAX_MEDIA_PER_USER) return bad(res, 'Too many files uploaded — remove some listings first.', 429);
    const buf = readData(req.body); if (!buf) return bad(res, 'The file could not be read. Please choose it again.');
    let mime: string | null;
    if (kind === 'PHOTO') {
      if (buf.length > PHOTO_MAX) return bad(res, 'This photo is too big. Pick a smaller one.', 413);
      const m = sniffMime(buf); mime = m === 'image/jpeg' || m === 'image/png' || m === 'image/webp' ? m : null;
      if (!mime) return bad(res, 'Only a JPEG, PNG or WebP photo is accepted.', 415);
    } else {
      if (buf.length > VIDEO_MAX) return bad(res, 'This video is over 3 MB — paste a YouTube / Drive link instead, or record a shorter clip.', 413, { hi: 'वीडियो 3 MB से बड़ा है — YouTube / Drive का लिंक डालें या छोटी क्लिप बनाएँ।' });
      mime = sniffVideo(buf); if (!mime) return bad(res, 'Only an MP4, MOV or WebM video is accepted.', 415);
    }
    const id = rid(kind === 'PHOTO' ? 'IMG' : 'VID');
    if (!write(mediaFile(id), buf)) return bad(res, 'The file could not be saved. Please try again.', 500);
    s.ownerMedia.push({ id, userId: u.id, kind, mime, size: buf.length, createdAt: nowIso() }); db.save();
    res.json({ success: true, id, url: mediaUrl(id), size: buf.length });
  };
  r.post('/photo', may, rateLimit('omedia-photo', 200, 3600_000), big, (req, res) => saveMedia('PHOTO', req, res));
  r.post('/video', may, rateLimit('omedia-video', 30, 3600_000), big, (req, res) => saveMedia('VIDEO', req, res));
  r.get('/f/:id', needs('property:read'), rateLimit('omedia-open', 1500, 3600_000), (req, res) => {
    const m = st().ownerMedia.find(x => x.id === req.params.id); if (!m) return bad(res, 'Not found', 404);
    try { res.set({ 'Content-Type': m.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(fs.readFileSync(mediaFile(m.id))); } catch { bad(res, 'Not found', 404); }
  });

  // ── verification papers ──
  r.get('/doc-kinds', needs('self:read'), (_req, res) => res.json({ success: true, kinds: Object.fromEntries(Object.entries(DOC_KINDS).filter(([, v]) => v.group !== 'PAPER')), maxBytes: DOC_MAX }));
  r.get('/doc', needs('self:read'), (_req, res) => {
    const u = me(); const s = st();
    res.json({ success: true, docs: s.ownerDocs.filter(d => d.userId === u.id).map(docView), idChecked: ownerIdChecked(s, u.id) });
  });
  r.post('/doc', needs('self:update'), rateLimit('odoc-up', 40, 86400_000), big, (req, res) => {
    const u = me(); const s = st(); const b = req.body || {};
    const kind = String(b.kind) as OwnerDocKind; if (!DOC_KINDS[kind]) return bad(res, 'Choose which paper this is');
    if (b.consent !== true) return bad(res, 'Tick that you agree to GENZ keeping this paper to check you / your property.', 400, { hi: 'टिक करें कि आप इस काग़ज़ को जाँच के लिए GENZ के पास रखने से सहमत हैं।' });
    const propertyId = b.propertyId ? String(b.propertyId) : undefined;
    if (propertyId && !s.properties.some(p => p.id === propertyId && p.ownerId === u.id)) return bad(res, 'Choose one of your own properties', 403);
    // property papers (bill, tax receipt, deed…) are uploaded ONCE in Property Papers and shared per broker with days + views — not here
    if (DOC_KINDS[kind].group === 'PAPER') return bad(res, 'Property papers go in the “Property Papers” tab — upload once, share with each broker for a limited time.', 400, { code: 'USE_PROPERTY_PAPERS', hi: 'प्रॉपर्टी के काग़ज़ “Property Papers” टैब में डालें — एक बार अपलोड, हर ब्रोकर को सीमित समय के लिए शेयर।' });
    if (s.ownerDocs.filter(d => d.userId === u.id).length >= MAX_DOCS_PER_USER) return bad(res, 'Too many papers — remove an old one first', 429);
    const buf = readData(b); if (!buf) return bad(res, 'The file could not be read. Please choose it again.');
    if (buf.length > DOC_MAX) return bad(res, 'This file is too big (max 1.5 MB). Take the photo again or scan smaller.', 413);
    const mime = sniffMime(buf); if (!mime) return bad(res, 'Only a photo (JPEG / PNG / WebP) or a PDF is accepted.', 415);
    if (DOC_KINDS[kind].group === 'FACE' && mime === 'application/pdf') return bad(res, 'The face photo must be a photo, not a PDF.', 415);
    // a new selfie / ID of the same kind replaces a pending or rejected one
    for (const old of s.ownerDocs.filter(d => d.userId === u.id && d.kind === kind && (DOC_KINDS[kind].group !== 'PAPER') && d.status !== 'APPROVED')) erase(docFile(old.id));
    s.ownerDocs = s.ownerDocs.filter(d => !(d.userId === u.id && d.kind === kind && DOC_KINDS[kind].group !== 'PAPER' && d.status !== 'APPROVED'));
    const id = rid('ODC');
    if (!write(docFile(id), buf)) return bad(res, 'The file could not be saved. Please try again.', 500);
    s.ownerDocs.push({ id, userId: u.id, propertyId, kind, name: String(b.name || '').slice(0, 80) || DOC_KINDS[kind].en, mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), createdAt: nowIso(), status: 'PENDING' });
    db.save();
    db.appendAuditEvent(u.id, u.role, 'VERIFICATION', id, 'OWNER_DOC_UPLOADED', `${u.name} uploaded ${kind}${propertyId ? ' for ' + propertyId : ''} for GENZ to check`);
    for (const a of s.users.filter(x => (x.role === 'ADMIN' || x.role === 'SUPERADMIN') && x.verificationStatus === 'VERIFIED').slice(0, 20)) void pushTo(a.id, { kind: 'deals', title: 'An owner paper needs checking', body: `${u.name} — open Owner Listing Plans → Papers to check.`, url: '/' });
    res.json({ success: true, doc: docView(s.ownerDocs[s.ownerDocs.length - 1]) });
  });
  r.get('/doc/:id/file', needs('self:read'), rateLimit('odoc-open', 300, 3600_000), (req, res) => {
    const v = me(); const d = st().ownerDocs.find(x => x.id === req.params.id);
    const staff = v.role === 'ADMIN' || v.role === 'SUPERADMIN';
    if (!d || (d.userId !== v.id && !staff)) return bad(res, 'Not found', 404);
    try { res.set({ 'Content-Type': d.mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' }).send(fs.readFileSync(docFile(d.id))); } catch { bad(res, 'Not found', 404); }
    if (staff && d.userId !== v.id) db.appendAuditEvent(v.id, v.role, 'VERIFICATION', d.id, 'OWNER_DOC_OPENED', `${v.name} opened an owner paper (${d.kind})`);
  });
  r.delete('/doc/:id', needs('self:update'), (req, res) => {
    const u = me(); const s = st(); const d = s.ownerDocs.find(x => x.id === req.params.id && x.userId === u.id);
    if (!d) return bad(res, 'Not found', 404);
    if (d.status === 'APPROVED') return bad(res, 'GENZ has already checked this paper — it stays on record', 409);
    erase(docFile(d.id)); s.ownerDocs = s.ownerDocs.filter(x => x.id !== d.id); db.save(); res.json({ success: true });
  });

  // ── GENZ staff ──
  const staff = needs('ownerlist:manage');
  r.get('/admin/docs', staff, (_req, res) => {
    const s = st(); const users = new Map(s.users.map(x => [x.id, x]));
    const docs = s.ownerDocs.filter(d => d.status === 'PENDING').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(d => ({ ...docView(d), userId: d.userId, ownerName: users.get(d.userId)?.name, ownerPhoneLast4: String(users.get(d.userId)?.phone || '').replace(/\D/g, '').slice(-4), propertyTitle: s.properties.find(p => p.id === d.propertyId)?.title }));
    res.json({ success: true, docs });
  });
  r.post('/admin/docs/:id', staff, (req, res) => {
    const a = me(); const s = st(); const d = s.ownerDocs.find(x => x.id === req.params.id && x.status === 'PENDING');
    if (!d) return bad(res, 'Not found or already decided', 404);
    const approve = req.body?.approve === true; const note = String(req.body?.note || '').trim().slice(0, 200);
    if (!approve && note.length < 3) return bad(res, 'Write a short reason so the owner knows what to fix');
    d.status = approve ? 'APPROVED' : 'REJECTED'; d.review = { byId: a.id, byName: a.name, at: nowIso(), note: note || undefined };
    if (!approve) { erase(docFile(d.id)); }
    db.save(); db.appendAuditEvent(a.id, a.role, 'VERIFICATION', d.id, approve ? 'OWNER_DOC_APPROVED' : 'OWNER_DOC_REJECTED', `${a.name} ${approve ? 'approved' : 'sent back'} an owner paper (${d.kind})${note ? ': ' + note : ''}`);
    void pushTo(d.userId, { kind: 'deals', title: approve ? 'Your paper was checked ✔' : 'A paper needs to be sent again', body: approve ? `${DOC_KINDS[d.kind].en} — checked by ${a.name}.` : `${DOC_KINDS[d.kind].en}: ${note}`, url: '/' });
    res.json({ success: true });
  });
  return r;
}
