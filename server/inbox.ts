/**
 * v77 — the notification bell. One list for every role.
 *
 *   GET    /api/inbox            my lines (newest first, in my language) + how many are unread
 *   GET    /api/inbox/count      just the unread number (the header polls this)
 *   POST   /api/inbox/read       { ids?: string[] }  mark some (or, with no ids, all) as read
 *   DELETE /api/inbox/:id        remove one line
 *   DELETE /api/inbox            "Clear all" — remove every line of mine
 *
 * Lines are written in one place only — `pushTo()` in webpush.ts — so whatever reaches a phone also reaches the bell, and the bell
 * works for a person whose phone alerts are off. A person sees and changes only his own lines. Kept 14 days, at most 60 each.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { ctx, requireAuth } from './auth.js';
import { inboxAdd, inboxTrim, inboxView, inboxUnread, type InboxKind } from '../src/shared/inboxRules.js';
import { isTodoLine } from '../src/shared/homeTodoRules.js';

const nowIso = () => new Date().toISOString();

/** v79 — set by homebell.ts: brings a person's “to do” lines (the Home counters) in step before the bell is read */
let todoSync: ((u: UserProfile) => void) | null = null;
export const setTodoSync = (fn: (u: UserProfile) => void) => { todoSync = fn; };
const newId = () => `NTF-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

/** called by pushTo for every alert that is for this person (before his phone settings, quiet hours or the daily cap — those are about interrupting, not about keeping a record) */
export function recordInbox(userId: string, msg: { kind: InboxKind; title: string; body: string; url?: string; tag?: string; hi?: { title: string; body: string } }): void {
  try {
    inboxAdd(db.getState().inbox, { userId, kind: msg.kind, title: msg.title, body: msg.body, hi: msg.hi, url: msg.url, tag: msg.tag, at: nowIso() }, newId());
  } catch (e) { console.error('[INBOX] could not keep a line:', (e as Error).message); }
}

/** a person's lines leave with him (erasure) */
export function eraseInbox(s: { inbox: unknown[] }, userId: string): number {
  const before = s.inbox.length;
  s.inbox = (s.inbox as { userId: string }[]).filter(x => x.userId !== userId);
  return before - s.inbox.length;
}

/** lines nobody opened for 14 days go (the hourly sweep) */
export function sweepInbox(now = Date.now()): number {
  const s = db.getState(); let n = 0;
  for (const uid of new Set(s.inbox.map(x => x.userId))) n += inboxTrim(s.inbox, uid, now);
  if (n) db.save();
  return n;
}

const readSchema = z.object({ ids: z.array(z.string().min(1).max(60)).max(100).optional() }).strict();

export function createInboxRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const langOf = () => (db.getState().pushPrefs.find(p => p.userId === me().id)?.lang === 'hi' ? 'hi' : 'en') as 'en' | 'hi';

  r.get('/', requireAuth, (req: Request, res: Response) => {
    todoSync?.(me());
    const s = db.getState(); const id = me().id;
    const lang = req.query.lang === 'hi' ? 'hi' : req.query.lang === 'en' ? 'en' : langOf();
    res.json({ success: true, items: inboxView(s.inbox, id, lang), unread: inboxUnread(s.inbox, id) });
  });

  r.get('/count', requireAuth, (_req: Request, res: Response) => {
    todoSync?.(me());
    res.json({ success: true, unread: inboxUnread(db.getState().inbox, me().id) });
  });

  r.post('/read', requireAuth, (req: Request, res: Response) => {
    const p = readSchema.safeParse(req.body || {});
    if (!p.success) return res.status(400).json({ error: 'Invalid request' });
    const s = db.getState(); const id = me().id; let n = 0;
    const ids = p.data.ids ? new Set(p.data.ids) : null;
    for (const x of s.inbox) if (x.userId === id && !x.read && (!ids || ids.has(x.id))) { x.read = true; n++; }
    if (n) db.save();
    res.json({ success: true, marked: n, unread: inboxUnread(s.inbox, id) });
  });

  r.delete('/:id', requireAuth, (req: Request, res: Response) => {
    const s = db.getState(); const id = me().id;
    const row = s.inbox.find(x => x.id === req.params.id && x.userId === id && !x.hidden);
    if (!row) return res.status(404).json({ error: 'Notification not found' });
    // v79 — a “to do” line is kept out of sight (it comes back only if its number grows); every other line is removed
    if (isTodoLine(row)) { row.hidden = true; row.read = true; } else s.inbox = s.inbox.filter(x => x !== row);
    db.save();
    res.json({ success: true, unread: inboxUnread(s.inbox, id) });
  });

  r.delete('/', requireAuth, (_req: Request, res: Response) => {
    const s = db.getState(); const id = me().id;
    let cleared = 0;
    s.inbox = s.inbox.filter(x => {
      if (x.userId !== id) return true;
      if (isTodoLine(x)) { if (!x.hidden) cleared++; x.hidden = true; x.read = true; return true; }   // v79 — to-do lines stay (out of sight) until their number grows
      cleared++; return false;
    });
    if (cleared) db.save();
    res.json({ success: true, cleared, unread: 0 });
  });

  return r;
}
