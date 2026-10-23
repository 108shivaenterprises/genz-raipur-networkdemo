/**
 * Property Papers library — real PDF / photo papers of a property, kept on the server's disk so they can be searched and
 * shared inside the app instead of through WhatsApp.      Mounted at /api/property-docs.
 *
 *  • Files live in data/propdocs/<id>.bin (the `appdata` Docker volume). The database keeps only the record (title, type, hash, who may open it).
 *  • The kind of file is read from its real bytes (PDF / JPEG / PNG / WebP) — the name and the browser's claim are ignored. 10 MB per file.
 *  • PRIVATE by default: uploader, the property's owner and listing broker, and platform admins. Everyone else needs an explicit share
 *    (optionally with an expiry), a deal room on that property (DEAL_PARTICIPANTS) or the uploader's choice of VERIFIED_BROKERS.
 *  • Every open / download / refused attempt is logged and the uploader can read the log — including when a GENZ admin opened it.
 *  • Uploading needs the uploader to confirm they are the owner or authorised by the owner (DPDP). Aadhaar / PAN copies are discouraged in the UI.
 *  • Search covers title, type (English + Hindi words), reference no., tags, note, file name and the property's title / locality / city —
 *    NOT the text inside the file (scans would need OCR). The owner's name is searchable only by people who may see it.
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, Property, PropertyDoc, DatabaseState } from './db.js';
import { ctx, needs, rateLimit, digits } from './auth.js';
import { scannedPages } from './pdfPages.js';
import { makeViewToken, useViewToken, stampFor } from './viewToken.js';
import { can } from './permissions.js';
import { isAdmin, isDealParticipant, isPropertyPrincipal, canAccessPropertyWorkspace } from './access.js';
import {
  PROP_DOC_TYPES, PROP_DOC_TYPE_IDS, PROP_DOC_VISIBILITY, PROP_DOC_MAX_BYTES, PROP_DOC_MAX_PER_PROPERTY, PROP_DOC_MAX_USER_BYTES,
  matchesQuery, sniffMime,
} from '../src/shared/propDocs.js';
import { ROOM_LIMITS } from '../src/shared/clientRoomRules.js';

const me = () => ctx().user as UserProfile;
const nowIso = () => new Date().toISOString();
const DIR = () => path.resolve(process.cwd(), 'data', 'propdocs');
const fileOf = (id: string) => path.join(DIR(), `${id}.bin`);
const bad = (res: Response, error: string, status = 400) => res.status(status).json({ error });
const LOG_CAP = 5000;

/** v49 — the pages the view-only viewer shows: the photo itself, or the page photos of a scanned PDF (cached by fingerprint) */
const pageCache = new Map<string, Buffer[]>();
export function viewerPages(d: Pick<PropertyDoc, 'id' | 'mime' | 'sha256'>, buf?: Buffer): Buffer[] | null {
  const hit = pageCache.get(d.sha256); if (hit) return hit;
  let b = buf;
  if (!b) { try { b = fs.readFileSync(fileOf(d.id)); } catch { return null; } }
  const pages = d.mime === 'application/pdf' ? scannedPages(b) : [b];
  if (!pages || !pages.length) return null;
  pageCache.set(d.sha256, pages);
  if (pageCache.size > 12) pageCache.delete(pageCache.keys().next().value as string);
  return pages;
}
const NOT_SCANNED = {
  code: 'PDF_NOT_SCANNED',
  error: 'This PDF cannot be protected: it has no page photos (it was typed on a computer, or saved in a way GENZ cannot read). Add photos of its pages, or use “Make one PDF from page photos”, or keep it unprotected.',
  hi: 'यह PDF सुरक्षित नहीं हो सकता: इसमें पेज की फ़ोटो नहीं हैं (कंप्यूटर पर टाइप हुआ है, या ऐसे सेव है जो GENZ पढ़ नहीं पाता)। इसके पेज की फ़ोटो डालें, या “पेज की फ़ोटो से एक PDF बनाएँ” से बनाएँ, या बिना सुरक्षा रखें।',
};

export type DocAccess = { ok: boolean; level?: 'MANAGE' | 'VIEW'; via?: string };
/** v49 — a protected paper's original file (open / download) only for the uploader and the property's owner / listing broker;
 *  everyone else — GENZ admins included — sees it only in the stamped viewer */
export const mayHaveFile = (d: Pick<PropertyDoc, 'protect'>, a: DocAccess) => !d.protect || a.via === 'UPLOADER' || a.via === 'PRINCIPAL';

const activeShare = (d: PropertyDoc, userId: string, now = Date.now()) =>
  d.shares.find(s => s.userId === userId && !s.revoked && (!s.expiresAt || new Date(s.expiresAt).getTime() > now));

/** May THIS user open THIS paper, and may they also manage (edit / share / delete) it? */
export function docAccess(st: DatabaseState, u: Pick<UserProfile, 'id' | 'role' | 'verificationStatus'>, d: PropertyDoc, now = Date.now()): DocAccess {
  const prop = db.byId('properties', d.propertyId);
  if (isAdmin(u)) return { ok: true, level: 'MANAGE', via: 'ADMIN' };
  if (d.uploaderId === u.id) return { ok: true, level: 'MANAGE', via: 'UPLOADER' };
  if (prop && isPropertyPrincipal(u, prop)) return { ok: true, level: 'MANAGE', via: 'PRINCIPAL' };
  if (u.verificationStatus !== 'VERIFIED') return { ok: false };
  if (activeShare(d, u.id, now)) return { ok: true, level: 'VIEW', via: 'SHARED' };
  if (u.role === 'LEGAL_COUNSEL' && d.ddItemId) return { ok: true, level: 'VIEW', via: 'LEGAL_DD' };
  if (prop && d.visibility === 'DEAL_PARTICIPANTS' && u.role !== 'TEAM_MEMBER' && st.dealRooms.some(r => r.propertyId === prop.id && isDealParticipant(u, r))) return { ok: true, level: 'VIEW', via: 'DEAL' };
  if (prop && d.visibility === 'VERIFIED_BROKERS' && u.role === 'BROKER') return { ok: true, level: 'VIEW', via: 'NETWORK' };
  return { ok: false };
}

const log = (docId: string, userId: string, action: 'VIEW' | 'DOWNLOAD' | 'DENIED' | 'SHARE' | 'REVOKE', ip: string, note?: string) => {
  const st = db.getState();
  st.propertyDocLogs.push({ id: `PDL-${Date.now().toString(36)}${crypto.randomInt(1000, 9999)}`, docId, userId, action, at: nowIso(), ip, note });
  if (st.propertyDocLogs.length > LOG_CAP) st.propertyDocLogs.splice(0, st.propertyDocLogs.length - LOG_CAP);
};

const nameOf = (st: DatabaseState, id: string) => db.byId('users', id)?.name || '—';
/** v55 — the client-room page writes to the same "who opened" log */
export const logDocOpen = log;

// ───────────── v55: limits on a share (how many days, how many opens) and showing a paper to one's own client ─────────────
const shareOf = (d: PropertyDoc, userId: string) => d.shares.find(s => s.userId === userId && !s.revoked);
const shareLive = (s: PropertyDoc['shares'][number], now = Date.now()) => !s.revoked && (!s.expiresAt || Date.parse(s.expiresAt) > now);
const viewsLeft = (s: { maxViews?: number; views?: number }) => (s.maxViews ? Math.max(0, s.maxViews - (s.views || 0)) : null);
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

/** make a paper view-only when it is shared from a chat; false when it cannot be (a PDF typed on a computer) */
function ensureProtected(d: PropertyDoc, u: UserProfile): boolean {
  if (d.protect) return true;
  const pp = viewerPages(d); if (!pp) return false;
  d.protect = true; d.protectedAt = nowIso(); d.pages = pp.length;
  db.appendAuditEvent(u.id, u.role, 'SYSTEM', d.id, 'PROPDOC_PROTECT', `“${d.title}” protected while sharing it from a chat: view-only, every viewer's name stamped, no download (except the uploader)`);
  return true;
}

export type ClientPaperState = { ok: true; doc: PropertyDoc; cs: NonNullable<PropertyDoc['clientShares']>[number]; broker: UserProfile } | { ok: false; reason: 'GONE' | 'STOPPED' | 'EXPIRED' | 'USED' };
/**
 * v55 — may the client of a Client Room open this paper right now? Only while: the broker's own showing is not stopped / expired / used up,
 * the paper is still view-only, and the broker himself may still open it (his own share from the chat is live and allows showing clients —
 * or he is the uploader / owner / listing broker). `ignoreViews` is for the page images of a view that was already counted.
 */
export function clientPaperState(st: DatabaseState, shareId: string, roomId: string, ignoreViews = false, now = Date.now()): ClientPaperState {
  const doc = st.propertyDocs.find(d => (d.clientShares || []).some(c => c.id === shareId));
  const cs = doc?.clientShares?.find(c => c.id === shareId && c.roomId === roomId);
  if (!doc || !cs) return { ok: false, reason: 'GONE' };
  if (cs.revoked || !doc.protect) return { ok: false, reason: 'STOPPED' };
  if (Date.parse(cs.expiresAt) <= now) return { ok: false, reason: 'EXPIRED' };
  if (!ignoreViews && cs.views >= cs.maxViews) return { ok: false, reason: 'USED' };
  const broker = st.users.find(x => x.id === cs.brokerId);
  if (!broker) return { ok: false, reason: 'STOPPED' };
  const a = docAccess(st, broker, doc, now);
  if (!a.ok) return { ok: false, reason: 'STOPPED' };
  if (a.level !== 'MANAGE') {
    const own = shareOf(doc, broker.id);
    if (!own || !shareLive(own, now) || !own.clientShare) return { ok: false, reason: 'STOPPED' };
  }
  return { ok: true, doc, cs, broker };
}

/** What a viewer may search / see about the property a paper belongs to. */
function propLine(p: Property | undefined) {
  return p ? { propertyTitle: p.title, locality: p.locality, city: p.city, propertyType: p.propertyType } : { propertyTitle: '—', locality: '', city: '', propertyType: '' };
}

function summary(st: DatabaseState, d: PropertyDoc, u: UserProfile, a: DocAccess) {
  const prop = db.byId('properties', d.propertyId);
  const manage = a.level === 'MANAGE';
  return {
    id: d.id, propertyId: d.propertyId, ...propLine(prop),
    type: d.type, title: d.title, refNo: d.refNo, tags: d.tags, note: d.note,
    fileName: d.fileName, mime: d.mime, size: d.size, sha256: d.sha256,
    visibility: d.visibility, ddItemId: d.ddItemId, createdAt: d.createdAt, updatedAt: d.updatedAt,
    uploaderId: d.uploaderId, uploaderName: nameOf(st, d.uploaderId), mine: d.uploaderId === u.id,
    access: a.level, via: a.via, canManage: manage,
    protect: !!d.protect, pages: d.pages || 1, canDownload: mayHaveFile(d, a),
    missing: !fs.existsSync(fileOf(d.id)),
    shares: manage ? d.shares.filter(s => !s.revoked).map(s => ({ userId: s.userId, name: nameOf(st, s.userId), expiresAt: s.expiresAt, expired: !!s.expiresAt && new Date(s.expiresAt).getTime() < Date.now(), maxViews: s.maxViews || null, views: s.views || 0, dealId: s.dealId, clientShare: !!s.clientShare })) : undefined,
    // v55 — what I was given (opens left, until when, may I show my client) and to which of my clients I showed it
    myShare: a.via === 'SHARED' ? (() => { const s = shareOf(d, u.id); return s ? { expiresAt: s.expiresAt, viewsLeft: viewsLeft(s), maxViews: s.maxViews || null, clientShare: !!s.clientShare, dealId: s.dealId } : undefined; })() : undefined,
    clientShares: (d.clientShares || []).filter(c => c.brokerId === u.id && !c.revoked).map(c => {
      const room = st.clientRooms.find(r => r.id === c.roomId);
      return { id: c.id, roomId: c.roomId, clientName: room?.clientName || '—', expiresAt: c.expiresAt, maxViews: c.maxViews, views: c.views, lastAt: c.lastAt };
    }),
  };
}

/** Text a given viewer's search is matched against: only fields that viewer may see. */
function haystack(st: DatabaseState, d: PropertyDoc, a: DocAccess) {
  const prop = db.byId('properties', d.propertyId);
  const t = PROP_DOC_TYPES.find(x => x.id === d.type);
  const parts = [d.title, d.refNo, d.tags.join(' '), d.note, d.fileName, t?.en, t?.hi, t?.words, prop?.title, prop?.locality, prop?.city, prop?.pincode, d.id, d.propertyId];
  if (a.level === 'MANAGE' && prop) parts.push(prop.village, prop.tehsil, prop.district, nameOf(st, prop.ownerId), nameOf(st, d.uploaderId));
  return parts.filter(Boolean).join(' ');
}

const usedBytes = (st: DatabaseState, userId: string) => st.propertyDocs.filter(d => d.uploaderId === userId).reduce((a, d) => a + d.size, 0);

/** Properties the user may attach papers to. */
function uploadableProperties(st: DatabaseState, u: UserProfile) {
  return st.properties.filter(p => isAdmin(u) || isPropertyPrincipal(u, p));
}

/** Remove a paper's bytes from disk (the record is removed by the caller). */
export function eraseDocFile(id: string) { try { fs.unlinkSync(fileOf(id)); } catch { /* already gone */ } }

/** DPDP erasure: delete every paper the user uploaded and every paper on properties they own. */
export function purgeUserDocs(st: DatabaseState, userId: string): number {
  const owned = new Set(st.properties.filter(p => p.ownerId === userId).map(p => p.id));
  const doomed = st.propertyDocs.filter(d => d.uploaderId === userId || owned.has(d.propertyId));
  for (const d of doomed) eraseDocFile(d.id);
  st.propertyDocs = st.propertyDocs.filter(d => !doomed.includes(d));
  for (const d of st.propertyDocs) for (const s of d.shares) if (s.userId === userId) s.revoked = true;
  return doomed.length;
}

const cleanTags = (t: unknown): string[] =>
  Array.isArray(t) ? [...new Set(t.map(x => String(x).trim().toLowerCase().slice(0, 30)).filter(Boolean))].slice(0, 10) : [];

export function createPropDocsRouter() {
  const r = Router();
  const big = express.json({ limit: '15mb' });
  const need = needs('propdoc:use');

  /** Everything the screen needs to start: properties I can upload to, my storage, the file rules. */
  r.get('/meta', need, (_req, res) => {
    const u = me(); const st = db.getState();
    const counts = new Map<string, number>();
    for (const d of st.propertyDocs) counts.set(d.propertyId, (counts.get(d.propertyId) || 0) + 1);
    res.json({
      success: true,
      properties: uploadableProperties(st, u).slice(0, 400).map(p => ({ id: p.id, title: p.title, locality: p.locality, city: p.city, docs: counts.get(p.id) || 0 })),
      usedBytes: usedBytes(st, u.id), maxBytes: PROP_DOC_MAX_USER_BYTES, maxFileBytes: PROP_DOC_MAX_BYTES, maxPerProperty: PROP_DOC_MAX_PER_PROPERTY,
    });
  });

  /** Search + list: only papers this user may open. */
  r.get('/', need, (req: Request, res: Response) => {
    const u = me(); const st = db.getState(); const now = Date.now();
    const q = String(req.query.q || '').slice(0, 120);
    const propertyId = String(req.query.propertyId || '');
    const type = String(req.query.type || '');
    const scope = String(req.query.scope || 'all'); // all | mine | shared
    const out: ReturnType<typeof summary>[] = [];
    for (const d of st.propertyDocs.slice().reverse()) {
      if (propertyId && d.propertyId !== propertyId) continue;
      if (type && d.type !== type) continue;
      const a = docAccess(st, u, d, now);
      if (!a.ok) continue;
      if (scope === 'mine' && a.level !== 'MANAGE') continue;
      if (scope === 'shared' && a.level !== 'VIEW') continue;
      if (q && !matchesQuery(haystack(st, d, a), q)) continue;
      out.push(summary(st, d, u, a));
      if (out.length >= 300) break;
    }
    res.json({ success: true, docs: out });
  });

  /** Upload one paper. */
  r.post('/', need, rateLimit('propdocup', 80, 60 * 60_000), big, (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const b = z.object({
      propertyId: z.string().min(2).max(60),
      type: z.enum(PROP_DOC_TYPE_IDS),
      title: z.string().trim().min(2, 'Give the paper a title (at least 2 letters).').max(120),
      refNo: z.string().trim().max(60).optional(),
      tags: z.array(z.string()).max(20).optional(),
      note: z.string().trim().max(400).optional(),
      fileName: z.string().trim().min(1).max(160),
      data: z.string().min(8),
      visibility: z.enum(PROP_DOC_VISIBILITY).default('PRIVATE'),
      ddItemId: z.string().max(80).optional(),
      protect: z.boolean().optional(),
      attest: z.literal(true, { message: 'Please confirm you are the owner or authorised by the owner to keep this paper here.' }),
    }).safeParse(req.body);
    if (!b.success) return bad(res, b.error.issues[0]?.message || 'Please fill the form properly.');
    const prop = db.byId('properties', b.data.propertyId);
    if (!prop) return bad(res, 'Property not found', 404);

    // who may attach a paper: owner / listing broker / admin — or, for due-diligence evidence, anyone already working on that checklist item
    let ddItemId: string | undefined;
    const principal = isAdmin(u) || isPropertyPrincipal(u, prop);
    if (b.data.ddItemId) {
      const item = st.dueDiligenceItems.find(i => i.id === b.data.ddItemId && i.propertyId === prop.id);
      if (!item) return bad(res, 'That due-diligence item does not belong to this property.', 404);
      if (!can(u, 'dd:upload') || !canAccessPropertyWorkspace(st, u, prop)) return bad(res, 'You cannot add evidence to this property.', 403);
      ddItemId = item.id;
    } else if (!principal) {
      return bad(res, 'Only the property owner or listing broker can keep papers here.', 403);
    }

    if (st.propertyDocs.filter(d => d.propertyId === prop.id).length >= PROP_DOC_MAX_PER_PROPERTY) return bad(res, `This property already has ${PROP_DOC_MAX_PER_PROPERTY} papers. Delete old ones first.`);

    const raw = b.data.data.replace(/^data:[^;]+;base64,/, '');
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return bad(res, 'The file could not be read. Please choose it again.');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 0) return bad(res, 'The file is empty.');
    if (buf.length > PROP_DOC_MAX_BYTES) return bad(res, `The file is larger than ${PROP_DOC_MAX_BYTES / 1024 / 1024} MB. Send a smaller / compressed copy.`, 413);
    const mime = sniffMime(buf);
    if (!mime) return bad(res, 'Only PDF, JPEG, PNG or WebP files are accepted.', 415);
    if (usedBytes(st, u.id) + buf.length > PROP_DOC_MAX_USER_BYTES) return bad(res, 'Your storage is full. Delete old papers first.', 413);
    let pages = 1;
    if (b.data.protect && mime === 'application/pdf') {
      const pp = scannedPages(buf);
      if (!pp) return res.status(400).json(NOT_SCANNED);
      pages = pp.length;
    }

    const id = `PD-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(1000, 9999)}`;
    try {
      fs.mkdirSync(DIR(), { recursive: true });
      const tmp = fileOf(id) + '.tmp';
      fs.writeFileSync(tmp, buf); fs.renameSync(tmp, fileOf(id));
    } catch { return bad(res, 'The file could not be saved on the server. Please try again.', 500); }

    const ts = nowIso();
    const doc: PropertyDoc = {
      id, propertyId: prop.id, uploaderId: u.id, type: b.data.type, title: b.data.title, refNo: b.data.refNo || undefined,
      tags: cleanTags(b.data.tags), note: b.data.note || undefined,
      fileName: b.data.fileName.replace(/[\\/\0\r\n]+/g, '_'), mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      visibility: b.data.visibility, shares: [], ddItemId, attestedAt: ts, createdAt: ts, updatedAt: ts,
      ...(b.data.protect ? { protect: true, protectedAt: ts, pages } : {}),
    };
    st.propertyDocs.push(doc); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', id, 'PROPDOC_UPLOADED', `Paper “${doc.title}” (${doc.type}, ${(doc.size / 1024).toFixed(0)} KB, SHA-256 ${doc.sha256.slice(0, 16)}…) added to ${prop.id}${ddItemId ? ` as evidence for ${ddItemId}` : ''}${doc.protect ? ' — protected (view-only, watermarked)' : ''}`);
    res.json({ success: true, doc: summary(st, doc, u, docAccess(st, u, doc)) });
  });

  const load = (req: Request, res: Response) => {
    const u = me(); const st = db.getState();
    const d = st.propertyDocs.find(x => x.id === req.params.id);
    const a = d ? docAccess(st, u, d) : { ok: false };
    if (!d || !a.ok) { if (d) { log(d.id, u.id, 'DENIED', req.ip || ''); db.save(); } res.status(404).json({ error: 'Paper not found' }); return null; }
    return { u, st, d, a: a as DocAccess };
  };
  const loadManage = (req: Request, res: Response) => {
    const x = load(req, res); if (!x) return null;
    if (x.a.level !== 'MANAGE') { res.status(403).json({ error: 'Only the uploader, the property owner or listing broker can do this.' }); return null; }
    return x;
  };

  /** v49 — start the stamped viewer: signed page tokens + the viewer's OWN stamp (everyone, the uploader too). */
  r.post('/:id/view', need, rateLimit('propdocview', 300, 60 * 60_000), (req: Request, res: Response) => {
    const x = load(req, res); if (!x) return;
    const { u, d, a } = x;
    const pages = viewerPages(d);
    if (!pages) return fs.existsSync(fileOf(d.id)) ? res.status(400).json(NOT_SCANNED) : bad(res, 'The file is missing on the server. Please upload it again.', 404);
    // v55 — a share with a limit: every open counts; when they are used up the paper does not open again (unless re-shared)
    const s = a.via === 'SHARED' ? shareOf(d, u.id) : undefined;
    if (s?.maxViews && (s.views || 0) >= s.maxViews) {
      log(d.id, u.id, 'DENIED', req.ip || '', 'all allowed opens used'); db.save();
      return res.status(403).json({ code: 'VIEWS_USED', error: `You have opened this paper the ${s.maxViews} time(s) you were allowed. Ask the sender to share it again.`, hi: `आप यह कागज़ तय ${s.maxViews} बार खोल चुके हैं। भेजने वाले से दोबारा शेयर करवाएँ।` });
    }
    if (s?.maxViews) s.views = (s.views || 0) + 1;
    log(d.id, u.id, 'VIEW', req.ip || '', `${d.protect ? 'view-only viewer' : 'viewer'}, stamped${a.via === 'ADMIN' ? ' — GENZ admin' : ''}${s?.maxViews ? ` — open ${s.views} of ${s.maxViews}` : ''}`); db.save();
    res.json({
      success: true, id: d.id, title: d.title, pages: pages.length, protect: !!d.protect,
      tokens: pages.map((_, i) => makeViewToken('PROPDOC', d.id, u.id, i)),
      watermark: stampFor(u.name, digits(u.phone)), canDownload: mayHaveFile(d, a),
      viewsLeft: s ? viewsLeft(s) : null, expiresAt: s?.expiresAt,
    });
  });

  /** v49 — one page of the viewer. Only as an <img> for the signed-in person the token was made for. */
  r.get('/view/:token', need, (req: Request, res: Response) => {
    const u = me();
    const c = useViewToken(req.params.token, 'PROPDOC', u.id);
    if (!c) return res.status(403).end();
    if (String(req.headers['sec-fetch-dest'] || 'image') !== 'image') { log(c.d, u.id, 'DENIED', req.ip || '', 'page opened outside the viewer'); db.save(); return res.status(403).end(); }
    const st = db.getState();
    const d = st.propertyDocs.find(v => v.id === c.d);
    if (!d || !docAccess(st, u, d).ok) return res.status(403).end();
    const pages = viewerPages(d); const page = pages?.[c.p];
    if (!page) return res.status(404).end();
    res.setHeader('Content-Type', d.mime === 'application/pdf' ? 'image/jpeg' : d.mime);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(page);
  });

  /** Open (inline) or download (?dl=1). Same-origin, cookie-authenticated, never cached. */
  r.get('/:id/file', need, rateLimit('propdocopen', 300, 60 * 60_000), (req: Request, res: Response) => {
    const x = load(req, res); if (!x) return;
    const { u, d, a } = x;
    const dl = req.query.dl === '1';
    // v49 — a protected paper: only the uploader / owner / listing broker get the file; everyone else opens the stamped viewer
    if (!mayHaveFile(d, a)) {
      log(d.id, u.id, 'DENIED', req.ip || '', 'protected — file refused, viewer only'); db.save();
      if (String(req.headers['sec-fetch-dest'] || '') === 'document') return res.redirect(303, `/?tab=propdocs&view=${encodeURIComponent(d.id)}`);
      return res.status(403).json({ code: 'PROTECTED', error: 'This paper is protected — open it in the app to view it (your name is stamped on it). It cannot be downloaded.', hi: 'यह कागज़ सुरक्षित है — ऐप में खोलकर देखें (आपका नाम उस पर छपेगा)। डाउनलोड नहीं हो सकता।' });
    }
    let buf: Buffer;
    try { buf = fs.readFileSync(fileOf(d.id)); } catch { return bad(res, 'The file is missing on the server. Please upload it again.', 404); }
    log(d.id, u.id, dl ? 'DOWNLOAD' : 'VIEW', req.ip || '', a.via === 'ADMIN' ? 'GENZ admin' : undefined); db.save();
    const safe = d.fileName.replace(/[^\w.\- ]+/g, '_');
    res.setHeader('Content-Type', d.mime);
    res.setHeader('Content-Disposition', `${dl ? 'attachment' : 'inline'}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(d.fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(buf.length));
    if (d.mime !== 'application/pdf') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.send(buf);
  });

  // ───────────── v55: papers in a deal chat ─────────────
  /** The papers of a deal's property that I may open (and those I may share), and who in the deal can receive one. */
  r.get('/for-deal/:dealId', need, (req: Request, res: Response) => {
    const u = me(); const st = db.getState(); const now = Date.now();
    const deal = st.dealRooms.find(x => x.id === req.params.dealId);
    if (!deal || !isDealParticipant(u, deal)) return bad(res, 'Deal room not found', 404);
    const docs = st.propertyDocs.filter(d => d.propertyId === deal.propertyId)
      .map(d => { const a = docAccess(st, u, d, now); return a.ok ? summary(st, d, u, a) : null; })
      .filter(Boolean);
    const people = [...new Set([deal.introducingBrokerId, deal.closingBrokerId, deal.ownerId])]
      .filter(id => id && id !== u.id)
      .map(id => st.users.find(x => x.id === id))
      .filter((x): x is UserProfile => !!x && x.verificationStatus === 'VERIFIED' && can(x, 'propdoc:use') && !isAdmin(x))
      .map(x => ({ id: x.id, name: x.name, role: x.role }));
    res.json({ success: true, docs, people, canClientShare: can(u, 'clientroom:use') });
  });

  /** Share a paper from the deal chat: chosen people of the deal, for N days, M opens, and (optionally) "may show his client". */
  r.post('/:id/chat-share', need, rateLimit('propdocchat', 60, 60 * 60_000), (req: Request, res: Response) => {
    const x = loadManage(req, res); if (!x) return;
    const { u, st, d } = x;
    const b = z.object({
      dealId: z.string().min(3).max(60),
      userIds: z.array(z.string()).min(1).max(5),
      days: z.coerce.number().int().min(1).max(30),
      maxViews: z.coerce.number().int().min(0).max(50),
      clientShare: z.boolean().default(false),
      note: z.string().trim().max(200).optional(),
    }).safeParse(req.body);
    if (!b.success) return bad(res, 'Choose who may see it, for how many days and how many times.');
    const deal = st.dealRooms.find(r2 => r2.id === b.data.dealId);
    if (!deal || deal.propertyId !== d.propertyId || !isDealParticipant(u, deal)) return bad(res, 'This paper does not belong to that deal room.', 400);
    const inDeal = new Set([deal.introducingBrokerId, deal.closingBrokerId, deal.ownerId].filter(Boolean) as string[]);
    const targets = [...new Set(b.data.userIds)].map(id => st.users.find(p => p.id === id))
      .filter((p): p is UserProfile => !!p && inDeal.has(p.id) && p.id !== u.id && p.verificationStatus === 'VERIFIED' && can(p, 'propdoc:use') && !isAdmin(p));
    if (!targets.length) return bad(res, 'Choose someone of this deal room to share with.');
    if (!ensureProtected(d, u)) return res.status(400).json(NOT_SCANNED);
    const expiresAt = daysAhead(b.data.days);
    for (const t of targets) {
      const ex = d.shares.find(s => s.userId === t.id);
      const fresh = { userId: t.id, grantedBy: u.id, grantedAt: nowIso(), expiresAt, revoked: false, maxViews: b.data.maxViews || undefined, views: 0, dealId: deal.id, clientShare: b.data.clientShare };
      if (ex) Object.assign(ex, fresh); else d.shares.push(fresh);
      log(d.id, t.id, 'SHARE', req.ip || '', `from the deal chat by ${u.name} — ${b.data.days} day(s), ${b.data.maxViews || 'unlimited'} open(s)${b.data.clientShare ? ', may show own client' : ''}`);
    }
    d.updatedAt = nowIso();
    const names = targets.map(t => t.name).join(', ');
    const msg = {
      id: `MSG-${deal.id}-${Date.now().toString(36)}`, dealRoomId: deal.id, senderId: u.id, senderName: u.name, senderRole: u.role,
      text: b.data.note || `Shared a paper (view-only): ${d.title}`, audience: 'ALL' as const, kind: 'PAPER' as const, refId: d.id,
      ...(b.data.note ? {} : { auto: true }), timestamp: nowIso(),
    };
    st.dealMessages.push(msg);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'DEAL', deal.id, 'PROPDOC_CHAT_SHARED', `Paper “${d.title}” (${d.id}) shared in the deal chat with ${names}: ${b.data.days} day(s), ${b.data.maxViews || 'unlimited'} open(s), view-only${b.data.clientShare ? ', may show own client' : ''}`);
    res.json({ success: true, message: msg, doc: summary(st, d, u, x.a) });
  });

  /** Show a paper to my own client in one of my Client Rooms (view-only; never longer / more than I was allowed). */
  r.post('/:id/client-share', need, rateLimit('propdocclient', 60, 60 * 60_000), (req: Request, res: Response) => {
    const x = load(req, res); if (!x) return;
    const { u, st, d, a } = x;
    if (!can(u, 'clientroom:use')) return bad(res, 'Client Rooms are not part of your account.', 403);
    const b = z.object({ roomId: z.string().min(3).max(40), days: z.coerce.number().int().min(1).max(30), maxViews: z.coerce.number().int().min(1).max(10) }).safeParse(req.body);
    if (!b.success) return bad(res, 'Choose the client room, for how many days and how many times.');
    const room = st.clientRooms.find(r2 => r2.id === b.data.roomId && r2.brokerId === u.id);
    if (!room) return bad(res, 'Client room not found', 404);
    if (room.status !== 'ACTIVE') return bad(res, 'This client room is closed', 409);
    let until = Date.now() + b.data.days * 86_400_000;
    if (a.level !== 'MANAGE') {
      const own = shareOf(d, u.id);
      if (!own || !shareLive(own) || !own.clientShare) return res.status(403).json({ code: 'CLIENT_SHARE_OFF', error: 'The sender did not allow showing this paper to your client.', hi: 'भेजने वाले ने यह कागज़ आपके क्लाइंट को दिखाने की अनुमति नहीं दी।' });
      if (own.maxViews && (own.views || 0) >= own.maxViews) return res.status(403).json({ code: 'VIEWS_USED', error: 'Your own opens of this paper are used up.', hi: 'इस कागज़ को खोलने की आपकी तय गिनती पूरी हो चुकी है।' });
      if (own.expiresAt) until = Math.min(until, Date.parse(own.expiresAt));
    }
    if (!ensureProtected(d, u)) return res.status(400).json(NOT_SCANNED);
    if (room.messages.length >= ROOM_LIMITS.messages) return bad(res, 'This chat is full — open a new room or close this one');
    const cs = { id: `CPS-${crypto.randomBytes(5).toString('hex')}`, roomId: room.id, brokerId: u.id, grantedAt: nowIso(), expiresAt: new Date(until).toISOString(), maxViews: b.data.maxViews, views: 0 };
    (d.clientShares ||= []).push(cs);
    room.messages.push({ id: `CRX-${crypto.randomBytes(5).toString('hex')}`, from: 'BROKER', text: `📄 ${d.title} — सिर्फ़ देखने के लिए / view only`, at: nowIso(), paper: { shareId: cs.id, docId: d.id, title: d.title } });
    room.events.push({ at: nowIso(), text: `Paper shown (view-only): ${d.title}` }); room.updatedAt = nowIso(); room.lastBrokerSeenAt = nowIso();
    log(d.id, u.id, 'SHARE', req.ip || '', `shown to his client ${room.clientName} (client room) — ${Math.ceil((until - Date.now()) / 86_400_000)} day(s), ${b.data.maxViews} open(s)`);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', room.id, 'PROPDOC_CLIENT_SHARED', `Paper “${d.title}” (${d.id}) shown to the client of room ${room.id}: until ${cs.expiresAt.slice(0, 10)}, ${cs.maxViews} open(s), view-only`);
    res.json({ success: true, share: cs, doc: summary(st, d, u, a) });
  });

  /** Stop showing a paper to a client (the broker who showed it, or whoever manages the paper). */
  r.post('/:id/client-revoke', need, (req: Request, res: Response) => {
    const x = load(req, res); if (!x) return;
    const { u, st, d, a } = x;
    const cs = (d.clientShares || []).find(c => c.id === String(req.body?.shareId || '') && !c.revoked);
    if (!cs) return bad(res, 'Not found', 404);
    if (cs.brokerId !== u.id && a.level !== 'MANAGE') return bad(res, 'Only the broker who showed it can stop it.', 403);
    cs.revoked = true; d.updatedAt = nowIso();
    log(d.id, cs.brokerId, 'REVOKE', req.ip || '', `client showing stopped by ${u.name}`); db.save();
    res.json({ success: true, doc: summary(st, d, u, a) });
  });

  r.patch('/:id', need, (req: Request, res: Response) => {
    const x = loadManage(req, res); if (!x) return;
    const { u, d } = x;
    const b = z.object({
      type: z.enum(PROP_DOC_TYPE_IDS).optional(), title: z.string().trim().min(2).max(120).optional(), refNo: z.string().trim().max(60).optional(),
      tags: z.array(z.string()).max(20).optional(), note: z.string().trim().max(400).optional(), visibility: z.enum(PROP_DOC_VISIBILITY).optional(),
      protect: z.boolean().optional(),
    }).safeParse(req.body);
    if (!b.success) return bad(res, b.error.issues[0]?.message || 'Please check the details.');
    if (b.data.protect === true && !d.protect) {
      const pp = viewerPages(d);
      if (!pp) return fs.existsSync(fileOf(d.id)) ? res.status(400).json(NOT_SCANNED) : bad(res, 'The file is missing on the server. Please upload it again.', 404);
      d.protect = true; d.protectedAt = nowIso(); d.pages = pp.length;
      db.appendAuditEvent(u.id, u.role, 'SYSTEM', d.id, 'PROPDOC_PROTECT', `“${d.title}” protected: view-only, every viewer's name stamped, no download (except the uploader)`);
    } else if (b.data.protect === false && d.protect) {
      d.protect = false;
      db.appendAuditEvent(u.id, u.role, 'SYSTEM', d.id, 'PROPDOC_UNPROTECT', `Protection removed from “${d.title}” — people it is shared with can open and download it again`);
    }
    if (b.data.type) d.type = b.data.type;
    if (b.data.title) d.title = b.data.title;
    if (b.data.refNo !== undefined) d.refNo = b.data.refNo || undefined;
    if (b.data.tags) d.tags = cleanTags(b.data.tags);
    if (b.data.note !== undefined) d.note = b.data.note || undefined;
    const widened = b.data.visibility && b.data.visibility !== d.visibility;
    if (b.data.visibility) d.visibility = b.data.visibility;
    d.updatedAt = nowIso(); db.save();
    if (widened) db.appendAuditEvent(u.id, u.role, 'SYSTEM', d.id, 'PROPDOC_VISIBILITY', `Visibility of “${d.title}” set to ${d.visibility}`);
    res.json({ success: true, doc: summary(x.st, d, u, x.a) });
  });

  /** Members this paper can be shared with (contact-free). */
  r.get('/:id/people', need, (req: Request, res: Response) => {
    const x = loadManage(req, res); if (!x) return;
    const { u, st, d } = x;
    const inDeal = new Set<string>();
    for (const r2 of st.dealRooms.filter(r3 => r3.propertyId === d.propertyId)) for (const id of [r2.introducingBrokerId, r2.closingBrokerId, r2.ownerId]) if (id) inDeal.add(id);
    const people = st.users
      .filter(p => p.id !== u.id && p.id !== d.uploaderId && p.verificationStatus === 'VERIFIED' && can(p, 'propdoc:use') && !isAdmin(p))
      .map(p => ({ id: p.id, name: p.name, role: p.role, company: p.companyName || '', city: p.city || '', inDeal: inDeal.has(p.id) }))
      .sort((a, b) => Number(b.inDeal) - Number(a.inDeal) || a.name.localeCompare(b.name))
      .slice(0, 500);
    res.json({ success: true, people });
  });

  r.post('/:id/share', need, (req: Request, res: Response) => {
    const x = loadManage(req, res); if (!x) return;
    const { u, st, d } = x;
    const b = z.object({ userIds: z.array(z.string()).min(1).max(30), expiresInDays: z.coerce.number().int().min(1).max(365).optional() }).safeParse(req.body);
    if (!b.success) return bad(res, 'Choose who to share with (and optionally for how many days).');
    let n = 0;
    for (const uid of new Set(b.data.userIds)) {
      const t = st.users.find(p => p.id === uid && p.verificationStatus === 'VERIFIED' && can(p, 'propdoc:use') && p.id !== d.uploaderId && !isAdmin(p));
      if (!t) continue;
      const expiresAt = b.data.expiresInDays ? new Date(Date.now() + b.data.expiresInDays * 86_400_000).toISOString() : undefined;
      const ex = d.shares.find(s => s.userId === uid);
      if (ex) { ex.revoked = false; ex.expiresAt = expiresAt; ex.grantedAt = nowIso(); ex.grantedBy = u.id; }
      else d.shares.push({ userId: uid, grantedBy: u.id, grantedAt: nowIso(), expiresAt });
      log(d.id, uid, 'SHARE', req.ip || '', `by ${u.name}`);
      n++;
    }
    if (!n) return bad(res, 'None of the chosen members can receive papers.');
    d.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', d.id, 'PROPDOC_SHARED', `“${d.title}” shared with ${n} member(s)${b.data.expiresInDays ? ` for ${b.data.expiresInDays} day(s)` : ''}`);
    res.json({ success: true, shared: n, doc: summary(st, d, u, x.a) });
  });

  r.post('/:id/revoke', need, (req: Request, res: Response) => {
    const x = loadManage(req, res); if (!x) return;
    const { u, st, d } = x;
    const uid = String(req.body?.userId || '');
    const s = d.shares.find(v => v.userId === uid && !v.revoked);
    if (!s) return bad(res, 'That member does not have a share on this paper.', 404);
    s.revoked = true; log(d.id, uid, 'REVOKE', req.ip || '', `by ${u.name}`); d.updatedAt = nowIso(); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', d.id, 'PROPDOC_REVOKED', `Share on “${d.title}” removed for one member`);
    res.json({ success: true, doc: summary(st, d, u, x.a) });
  });

  r.get('/:id/log', need, (req: Request, res: Response) => {
    const x = loadManage(req, res); if (!x) return;
    const { st, d } = x;
    res.json({ success: true, log: st.propertyDocLogs.filter(l => l.docId === d.id).slice(-150).reverse().map(l => ({ at: l.at, action: l.action, name: nameOf(st, l.userId), note: l.note })) });
  });

  r.delete('/:id', need, (req: Request, res: Response) => {
    const x = loadManage(req, res); if (!x) return;
    const { u, st, d } = x;
    st.propertyDocs = st.propertyDocs.filter(v => v !== d);
    eraseDocFile(d.id); db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', d.id, 'PROPDOC_DELETED', `Paper “${d.title}” deleted (file removed from the server)`);
    res.json({ success: true });
  });

  return r;
}
