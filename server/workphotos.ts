/**
 * v61 — work photos: a photo sent in the builder ↔ partner chat, or put on a builder's project notice.
 * The phone shrinks it first (src/lib/photoFile.ts); the server keeps only JPEG / PNG / WebP up to PHOTO_LIMIT, as a file under
 * data/workphotos/ (shared-DB mode syncs it like every other upload) and a small record. Who may open one is decided by the module that
 * owns it (the chat: the two sides of that thread; a notice: whoever may read that notice) — this file only stores, reads and erases.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.js';
import type { WorkPhoto } from './db.js';
import { sniffMime } from '../src/shared/propDocs.js';

export const PHOTO_LIMIT = 600 * 1024;
const DIR = () => path.resolve(process.cwd(), 'data', 'workphotos');
const fileOf = (id: string) => path.join(DIR(), `${id}.bin`);

/** base64 (with or without the data: prefix) → a stored photo, or a user-readable error */
export function savePhoto(data: unknown, owner: { kind: WorkPhoto['ownerKind']; id: string; byId: string }): { ok: true; photo: WorkPhoto } | { ok: false; error: string; status: number } {
  const raw = String(data ?? '').replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw) || raw.length < 100) return { ok: false, error: 'The photo could not be read. Please choose it again.', status: 400 };
  const buf = Buffer.from(raw, 'base64');
  if (buf.length > PHOTO_LIMIT) return { ok: false, error: 'The photo is too big — pick a smaller one.', status: 413 };
  const mime = sniffMime(buf);
  if (mime !== 'image/jpeg' && mime !== 'image/png' && mime !== 'image/webp') return { ok: false, error: 'Only a JPEG, PNG or WebP photo is accepted.', status: 415 };
  const id = `WPH-${crypto.randomBytes(6).toString('hex')}`;
  try { fs.mkdirSync(DIR(), { recursive: true }); const tmp = fileOf(id) + '.tmp'; fs.writeFileSync(tmp, buf); fs.renameSync(tmp, fileOf(id)); }
  catch { return { ok: false, error: 'The photo could not be saved. Please try again.', status: 500 }; }
  const photo: WorkPhoto = { id, ownerKind: owner.kind, ownerId: owner.id, byId: owner.byId, mime, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), createdAt: new Date().toISOString() };
  db.getState().workPhotos.push(photo);
  return { ok: true, photo };
}

export const photoById = (id: string) => db.getState().workPhotos.find(p => p.id === id);

/** send the picture (private cache: it is never public) */
export function sendPhoto(res: import('express').Response, p: WorkPhoto) {
  try {
    const buf = fs.readFileSync(fileOf(p.id));
    res.set({ 'Content-Type': p.mime, 'Cache-Control': 'private, max-age=600', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'; sandbox" }).send(buf);
  } catch { res.status(404).json({ error: 'Photo not found' }); }
}

export function erasePhoto(id: string) {
  try { fs.unlinkSync(fileOf(id)); } catch { /* already gone */ }
  const s = db.getState(); s.workPhotos = s.workPhotos.filter(p => p.id !== id);
}
