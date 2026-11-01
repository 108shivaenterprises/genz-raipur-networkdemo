/**
 * v73 — owner uploads.   /api/owner-media
 *   POST /photo   a listing photo (the app shrinks it to ≤ ~1280 px first) → { url }            (anyone who may list: owner / broker)
 *   POST /video   a short listing video (≤ 3 MB mp4 / webm, base64 in JSON) → { url }
 *   POST /video-raw  v104 — a real walkthrough video, streamed as the raw file (≤ 80 MB, set VIDEO_MAX_MB; mp4 / mov / webm) → { url }
 *   GET  /f/:id   the photo / video, to any signed-in member (listing media is not secret; the address and the owner's phone never sit in it) — with Range, so a video can be seeked
 *   GET  /m/:id   v104 — the SAME file for someone with no login (a customer in the QR chat, a client room, a public page): open only while a LIVE listing uses it
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
import { pageLive } from './publicPage.js';

export const PHOTO_MAX = 450 * 1024;
export const VIDEO_MAX = 3 * 1024 * 1024;
export const DOC_MAX = 1536 * 1024;
/** v104 — a streamed walkthrough video (the 3 MB cap above is for the base64 route; a phone clip is 20–80 MB) */
export const VIDEO_RAW_MAX = Math.max(5, Number(process.env.VIDEO_MAX_MB || 80)) * 1024 * 1024;
const MAX_BIG_VIDEOS_PER_USER = 12;
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

/** v104 — send a stored file with Range support (a phone will not play or seek a video without it) */
function serveFile(req: Request, res: Response, file: string, mime: string, cache: string) {
  let size = 0; try { size = fs.statSync(file).size; } catch { return bad(res, 'Not found', 404); }
  res.set({ 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Referrer-Policy': 'no-referrer' });
  const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  const pipe = (opts?: { start: number; end: number }) => { if (req.method === 'HEAD') return void res.end(); const rs = fs.createReadStream(file, opts); rs.on('error', () => res.destroy()); res.on('close', () => rs.destroy()); rs.pipe(res); };
  if (rg && (rg[1] || rg[2])) {
    const start = rg[1] ? Number(rg[1]) : Math.max(0, size - Number(rg[2]));
    const end = rg[1] && rg[2] ? Math.min(Number(rg[2]), size - 1) : size - 1;
    if (!(start < size) || start > end) { res.status(416).set('Content-Range', `bytes */${size}`).end(); return; }
    res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
    return pipe({ start, end });
  }
  res.set('Content-Length', String(size));
  return pipe();
}
/** v104 — is this uploaded file used by a LIVE listing (its photos, its video, or a PUBLIC vault photo / video)? Then anybody may open it at /m/<id>. */
export function mediaIsPublic(s: DatabaseState, id: string): boolean {
  const own = mediaUrl(id); const pub = `/m/${id}`; const is = (x: unknown) => x === own || x === pub;
  for (const p of s.properties) if ((p.images || []).some(is) || is((p as any).videoUrl)) { if (pageLive(p)) return true; }
  for (const a of s.propertyMediaAssets || []) if (a.status === 'ACTIVE' && a.sensitivity === 'PUBLIC' && is(a.fileUrl) && pageLive(s.properties.find(p => p.id === a.propertyId))) return true;
  return false;
}
/** v104 — a closed listing's personal data is erased: the uploaded photos / video it used go too (unless another listing still uses the same file) */
export function eraseOwnerMediaOf(s: DatabaseState, p: { id: string; images?: string[]; videoUrl?: string }): number {
  const ids = new Set<string>(); const take = (x: unknown) => { const m = /^(?:\/api\/owner-media\/f|\/m)\/((?:IMG|VID)-[0-9a-f]{12})$/.exec(String(x || '')); if (m) ids.add(m[1]); };
  (p.images || []).forEach(take); take(p.videoUrl);
  let n = 0;
  for (const id of ids) {
    const own = mediaUrl(id); const pub = `/m/${id}`; const is = (x: unknown) => x === own || x === pub;
    if (s.properties.some(q => q.id !== p.id && !q.purgedAt && ((q.images || []).some(is) || is((q as any).videoUrl)))) continue;
    if (s.ownerMedia.some(m => m.id === id)) { erase(mediaFile(id)); s.ownerMedia = s.ownerMedia.filter(m => m.id !== id); n++; }
  }
  return n;
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
    serveFile(req, res, mediaFile(m.id), m.mime, 'private, max-age=3600');
  });
  /** v104 — a walkthrough video of a real length, streamed to disk as the raw file (no base64, never held in memory). The first bytes are checked, the size is counted while it arrives. */
  r.post('/video-raw', may, rateLimit('omedia-vraw', 20, 3600_000), (req, res) => {
    const u = me(); const s = st();
    if (process.env.VERCEL) return bad(res, 'This demo copy has no disk for big videos — paste a YouTube / Drive link, or choose a clip under 3 MB.', 501, { code: 'NO_DISK', hi: 'इस डेमो कॉपी में बड़े वीडियो के लिए जगह नहीं है — YouTube / Drive का लिंक डालें, या 3 MB से छोटी क्लिप चुनें।' });
    const mine = s.ownerMedia.filter(x => x.userId === u.id);
    if (mine.length >= MAX_MEDIA_PER_USER || mine.filter(x => x.kind === 'VIDEO').length >= MAX_BIG_VIDEOS_PER_USER) return bad(res, 'Too many videos uploaded — delete a closed listing first or use a link.', 429);
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!/^video\/(mp4|webm|quicktime|x-m4v|mov)$/.test(type)) return bad(res, 'Only an MP4, MOV or WebM video is accepted.', 415);
    const mb = Math.round(VIDEO_RAW_MAX / 1048576);
    const tooBig = () => bad(res, `This video is over ${mb} MB — record it shorter or in 720p, or paste a YouTube / Drive link.`, 413, { hi: `वीडियो ${mb} MB से बड़ा है — छोटा या 720p में बनाएँ, या YouTube / Drive का लिंक डालें।` });
    const len = Number(req.headers['content-length']); if (Number.isFinite(len) && len > VIDEO_RAW_MAX) { if (len > VIDEO_RAW_MAX * 4) res.set('Connection', 'close'); return tooBig(); }   // a little over: Node drops the rest of the body itself, so the phone can read the “too big” answer; far over: the connection is closed
    const id = rid('VID'); const file = mediaFile(id); const tmp = `${file}.up`;
    try { fs.mkdirSync(MEDIA_DIR(), { recursive: true }); } catch { return bad(res, 'The video could not be saved. Please try again.', 500); }
    const ws = fs.createWriteStream(tmp); let n = 0; let head = Buffer.alloc(0); let over = false;
    const drop = () => { try { ws.destroy(); } catch { /* closed */ } erase(tmp); };
    req.on('data', (c: Buffer) => {
      n += c.length; if (head.length < 16) head = Buffer.concat([head, c.subarray(0, 16 - head.length)]);
      if (n > VIDEO_RAW_MAX && !over) { over = true; req.unpipe(ws); drop(); res.set('Connection', 'close'); tooBig(); res.on('finish', () => req.destroy()); }
    });
    req.pipe(ws);
    req.on('aborted', drop); req.on('error', drop);
    ws.on('error', () => { drop(); if (!res.headersSent) bad(res, 'The video could not be saved. Please try again.', 500); });
    ws.on('finish', () => {
      if (over) return;
      const mime = sniffVideo(head);
      if (n < 1024 || !mime) { erase(tmp); return bad(res, 'Only an MP4, MOV or WebM video is accepted.', 415); }
      try { fs.renameSync(tmp, file); } catch { erase(tmp); return bad(res, 'The video could not be saved. Please try again.', 500); }
      s.ownerMedia.push({ id, userId: u.id, kind: 'VIDEO', mime, size: n, createdAt: nowIso() }); db.save();
      res.json({ success: true, id, url: mediaUrl(id), size: n, max: VIDEO_RAW_MAX });
    });
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

/**
 * v104 — GET /m/:id  (no login). The customer in a QR chat, a client-room visitor and a public page cannot sign in, so the photo / video they were
 * shown is read here. It opens ONLY while a live, verified listing uses the file; the id is random (12 hex), nothing lists them, and the address /
 * owner phone never sit inside a listing photo or clip. A closed listing's files are erased with its personal data (eraseOwnerMediaOf).
 */
export function createPublicMediaRouter() {
  const r = Router();
  r.get('/:id', rateLimit('pmedia', 4000, 3600_000), (req, res) => {
    const id = String(req.params.id || '');
    if (!/^(IMG|VID)-[0-9a-f]{12}$/.test(id)) return bad(res, 'Not found', 404);
    const s = st(); const m = s.ownerMedia.find(x => x.id === id);
    if (!m || !mediaIsPublic(s, id)) return bad(res, 'Not found', 404);
    serveFile(req, res, mediaFile(id), m.mime, 'private, max-age=600');
  });
  return r;
}
