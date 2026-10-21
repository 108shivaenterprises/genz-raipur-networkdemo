/**
 * View-only protected documents.
 *
 *  - The uploader (owner) can download. Everybody they share it with can only VIEW it.
 *  - Pages are stored as images on disk (data/protected) — never in the database, never behind a public URL.
 *  - Viewing = POST /:id/open (checks access, expiry, view limit, writes the access log) → returns one-time page tokens + a watermark
 *    text (viewer name · last 4 digits of phone · date/time). The page image is then fetched ONCE per token, only as an <img>
 *    (Sec-Fetch-Dest check), with no-store caching. The app draws it on a canvas with the tiled watermark and blocks
 *    right-click / print / save shortcuts and hides the page when the tab loses focus.
 *
 * HONEST LIMIT: a browser cannot truly stop a screenshot or a photo of the screen. What this does is stop download / forward /
 * "save as", make casual capture awkward, and — most importantly — stamp every page with the viewer's identity and keep a log,
 * so a leak points back to the person. A real screenshot block exists only in a native Android app (FLAG_SECURE).
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, ProtectedDoc } from './db.js';
import { ctx, needs, rateLimit, digits } from './auth.js';
import { can } from './permissions.js';

const me = () => ctx().user as UserProfile;
const nowIso = () => new Date().toISOString();
const DIR = () => path.resolve(process.cwd(), 'data', 'protected');
const MAX_PAGES = 12;
const MAX_PAGE_BYTES = 1_500_000;

const kindOf = (b: Buffer): string | null => {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
};
const pageFile = (id: string, n: number) => path.join(DIR(), `${id}-${n}.bin`);

// one-time page tokens (memory only; a restart simply asks the viewer to reopen)
const tokens = new Map<string, { docId: string; userId: string; page: number; exp: number }>();
setInterval(() => { const n = Date.now(); for (const [k, v] of tokens) if (v.exp < n) tokens.delete(k); }, 60_000).unref();

export function accessState(doc: ProtectedDoc, userId: string, now = Date.now(), ignoreLimit = false): { ok: boolean; reason?: string; viewer?: ProtectedDoc['viewers'][number] } {
  if (doc.revoked) return { ok: false, reason: 'This document was withdrawn by its owner.' };
  if (doc.ownerId === userId) return { ok: true };
  const v = doc.viewers.find(x => x.userId === userId && !x.revoked);
  if (!v) return { ok: false, reason: 'You do not have access to this document.' };
  if (v.expiresAt && new Date(v.expiresAt).getTime() < now) return { ok: false, reason: 'Your access to this document has expired.', viewer: v };
  if (!ignoreLimit && v.maxViews && v.views >= v.maxViews) return { ok: false, reason: 'You have used all the views allowed for this document.', viewer: v };
  return { ok: true, viewer: v };
}

const log = (docId: string, userId: string, page: number, allowed: boolean, ip: string) => {
  const st = db.getState();
  st.docAccessLogs.push({ id: `DAL-${Date.now().toString(36)}${crypto.randomInt(1000, 9999)}`, docId, userId, page, at: nowIso(), ip, allowed });
  if (st.docAccessLogs.length > 3000) st.docAccessLogs.splice(0, st.docAccessLogs.length - 3000);
};

const summary = (d: ProtectedDoc, u: UserProfile) => {
  const st = db.getState(); const owner = d.ownerId === u.id;
  const mine = d.viewers.find(v => v.userId === u.id);
  return {
    id: d.id, title: d.title, pages: d.pages, propertyId: d.propertyId, createdAt: d.createdAt, revoked: !!d.revoked, owner,
    ownerName: db.byId('users', d.ownerId)?.name || '—',
    access: owner ? 'OWNER' : 'VIEW_ONLY', expiresAt: mine?.expiresAt, viewsLeft: mine?.maxViews ? Math.max(0, mine.maxViews - mine.views) : null,
    viewers: owner ? d.viewers.map(v => ({ userId: v.userId, name: db.byId('users', v.userId)?.name || '—', views: v.views, expiresAt: v.expiresAt, maxViews: v.maxViews, revoked: !!v.revoked })) : undefined,
  };
};

export function createPdocsRouter() {
  const r = Router();
  const big = express.json({ limit: '18mb' });

  r.get('/', needs('pdoc:use'), (_req, res) => {
    const u = me(); const st = db.getState();
    const list = st.protectedDocs.filter(d => d.ownerId === u.id || (d.viewers.some(v => v.userId === u.id && !v.revoked) && !d.revoked));
    res.json({ success: true, docs: list.slice().reverse().map(d => summary(d, u)) });
  });

  r.get('/people', needs('pdoc:use'), (_req, res) => {
    const u = me(); const st = db.getState();
    res.json({ success: true, people: st.users.filter(x => x.id !== u.id && x.verificationStatus === 'VERIFIED' && can(x, 'pdoc:use') && !['SUPERADMIN', 'ADMIN'].includes(x.role)).slice(0, 600).map(x => ({ id: x.id, name: x.name, role: x.role, company: x.companyName || '', city: x.city })) });
  });

  r.post('/', needs('pdoc:use'), rateLimit('pdocup', 20, 60 * 60_000), big, (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const b = z.object({ title: z.string().trim().min(2).max(120), propertyId: z.string().max(60).optional(), pages: z.array(z.string().max(2_100_000)).min(1).max(MAX_PAGES) }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Give the document a title and add 1–12 page images.' });
    if (st.protectedDocs.filter(d => d.ownerId === u.id && !d.revoked).length >= 200) return res.status(400).json({ error: 'You have reached 200 protected documents. Remove old ones first.' });
    const bufs: Buffer[] = []; const mimes: string[] = [];
    for (const p of b.data.pages) {
      const raw = p.replace(/^data:[^;]+;base64,/, '');
      if (!/^[A-Za-z0-9+/=]+$/.test(raw)) return res.status(400).json({ error: 'A page is not a valid image.' });
      const buf = Buffer.from(raw, 'base64');
      if (buf.length > MAX_PAGE_BYTES) return res.status(400).json({ error: 'A page is larger than 1.5 MB. Use a smaller photo / scan.' });
      const mime = kindOf(buf);
      if (!mime) return res.status(400).json({ error: 'Only JPEG, PNG or WebP images are accepted (PDFs: take a photo / screenshot of each page).' });
      bufs.push(buf); mimes.push(mime);
    }
    const id = `PDOC-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(100, 999)}`;
    fs.mkdirSync(DIR(), { recursive: true });
    bufs.forEach((buf, i) => fs.writeFileSync(pageFile(id, i), buf));
    const doc: ProtectedDoc = { id, ownerId: u.id, title: b.data.title, propertyId: b.data.propertyId, pages: bufs.length, mime: mimes, viewers: [], createdAt: nowIso() };
    st.protectedDocs.push(doc); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', id, 'PDOC_UPLOADED', `Protected document “${doc.title}” (${doc.pages} pages)`);
    res.json({ success: true, doc: summary(doc, u) });
  });

  const owned = (req: Request, res: Response) => {
    const d = db.getState().protectedDocs.find(x => x.id === req.params.id && x.ownerId === me().id);
    if (!d) res.status(404).json({ error: 'Document not found' });
    return d;
  };

  r.post('/:id/share', needs('pdoc:use'), (req: Request, res: Response) => {
    const d = owned(req, res); if (!d) return;
    const st = db.getState();
    const b = z.object({ userIds: z.array(z.string()).min(1).max(30), expiresInDays: z.coerce.number().int().min(1).max(365).optional(), maxViews: z.coerce.number().int().min(1).max(100).optional() }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Choose who can view it (and optionally an expiry / view limit).' });
    let n = 0;
    for (const uid of new Set(b.data.userIds)) {
      const t = st.users.find(x => x.id === uid && x.verificationStatus === 'VERIFIED' && can(x, 'pdoc:use') && uid !== d.ownerId);
      if (!t) continue;
      const exp = b.data.expiresInDays ? new Date(Date.now() + b.data.expiresInDays * 86_400_000).toISOString() : undefined;
      const ex = d.viewers.find(v => v.userId === uid);
      if (ex) { ex.revoked = false; ex.expiresAt = exp; ex.maxViews = b.data.maxViews; ex.views = 0; }
      else d.viewers.push({ userId: uid, grantedAt: nowIso(), expiresAt: exp, maxViews: b.data.maxViews, views: 0 });
      n++;
    }
    db.save(); db.appendAuditEvent(me().id, me().role, 'SYSTEM', d.id, 'PDOC_SHARED', `View-only access given to ${n} member(s)`);
    res.json({ success: true, shared: n, doc: summary(d, me()) });
  });
  r.post('/:id/revoke', needs('pdoc:use'), (req: Request, res: Response) => {
    const d = owned(req, res); if (!d) return;
    if (req.body?.userId) { const v = d.viewers.find(x => x.userId === req.body.userId); if (v) v.revoked = true; }
    else d.revoked = true;
    db.save(); db.appendAuditEvent(me().id, me().role, 'SYSTEM', d.id, 'PDOC_REVOKED', req.body?.userId ? 'One viewer removed' : 'Document withdrawn from everyone');
    res.json({ success: true, doc: summary(d, me()) });
  });
  r.delete('/:id', needs('pdoc:use'), (req: Request, res: Response) => {
    const d = owned(req, res); if (!d) return;
    const st = db.getState(); st.protectedDocs.splice(st.protectedDocs.indexOf(d), 1);
    for (let i = 0; i < d.pages; i++) try { fs.unlinkSync(pageFile(d.id, i)); } catch { /* already gone */ }
    db.save(); db.appendAuditEvent(me().id, me().role, 'SYSTEM', d.id, 'PDOC_DELETED', 'Protected document deleted by its owner');
    res.json({ success: true });
  });
  r.get('/:id/log', needs('pdoc:use'), (req: Request, res: Response) => {
    const d = owned(req, res); if (!d) return;
    const st = db.getState();
    res.json({ success: true, log: st.docAccessLogs.filter(l => l.docId === d.id).slice(-100).reverse().map(l => ({ at: l.at, allowed: l.allowed, name: db.byId('users', l.userId)?.name || '—', page: l.page })) });
  });

  /** Start a viewing session: checks access, counts one view, logs it, and returns single-use page tokens + the watermark text. */
  r.post('/:id/open', needs('pdoc:use'), rateLimit('pdocopen', 120, 60 * 60_000), (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const d = st.protectedDocs.find(x => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: 'Document not found' });
    const a = accessState(d, u.id);
    log(d.id, u.id, 0, a.ok, req.ip || '');
    if (!a.ok) { db.save(); return res.status(403).json({ error: a.reason }); }
    if (a.viewer) a.viewer.views += 1;
    const exp = Date.now() + 5 * 60_000;
    const list: string[] = [];
    for (let i = 0; i < d.pages; i++) { const t = crypto.randomBytes(18).toString('base64url'); tokens.set(t, { docId: d.id, userId: u.id, page: i, exp }); list.push(t); }
    db.save();
    const stamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' });
    res.json({ success: true, title: d.title, pages: d.pages, tokens: list, watermark: `${u.name} · ${digits(u.phone).slice(-4).padStart(4, '•')} · ${stamp}`, canDownload: d.ownerId === u.id });
  });

  /** One-time image fetch. Only works as an <img> load for the same logged-in user. */
  r.get('/page/:token', needs('pdoc:use'), (req: Request, res: Response) => {
    const t = tokens.get(req.params.token);
    tokens.delete(req.params.token);
    const dest = String(req.headers['sec-fetch-dest'] || 'image');
    if (!t || t.exp < Date.now() || t.userId !== me().id) return res.status(403).end();
    if (dest !== 'image') { log(t.docId, t.userId, t.page, false, req.ip || ''); return res.status(403).end(); }
    const d = db.getState().protectedDocs.find(x => x.id === t.docId);
    if (!d || !accessState(d, t.userId, Date.now(), true).ok) return res.status(403).end();
    try {
      const buf = fs.readFileSync(pageFile(d.id, t.page));
      res.setHeader('Content-Type', d.mime[t.page] || 'image/jpeg');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(buf);
    } catch { res.status(404).end(); }
  });

  /** Only the owner can download their own original pages. */
  r.get('/:id/download/:n', needs('pdoc:use'), (req: Request, res: Response) => {
    const d = owned(req, res); if (!d) return;
    const n = Number(req.params.n);
    if (!Number.isInteger(n) || n < 0 || n >= d.pages) return res.status(404).json({ error: 'Page not found' });
    try {
      res.setHeader('Content-Type', d.mime[n] || 'image/jpeg');
      res.setHeader('Content-Disposition', `attachment; filename="${d.title.replace(/[^\w.-]+/g, '_')}-page${n + 1}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.send(fs.readFileSync(pageFile(d.id, n)));
    } catch { res.status(404).json({ error: 'Page file missing' }); }
  });

  return r;
}
