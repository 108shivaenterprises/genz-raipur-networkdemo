/**
 * v50 — Chats inbox.
 *
 * The deal-room chats a person is part of, as one list (the client-room chats come from /api/client-rooms, as before).
 *   GET  /api/chats/deals            (deal:chat)  last message, number of messages and unread of every deal-room chat
 *   GET  /api/chats/summary          (deal:chat)  { unread } — the dot on the chat icon in the header
 *   POST /api/chats/deals/:id/read   (deal:chat)  "I have read it" — moves the person's read mark to the newest message he may see
 *
 * Visibility is exactly that of GET /api/deals/:id/messages: only people in the deal room (the two brokers, the owner, an employee the
 * brokers allotted to it) — never a GENZ admin or legal counsel — and the brokers-only channel only for those who may read it.
 * Nothing here shows a message that route would hide, and nothing here posts a message.
 */
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { DealRoom, UserProfile, DatabaseState } from './db.js';
import { ctx, needs } from './auth.js';
import { canSeeDealCommercials, isDealParticipant, openDisputeDeals } from './access.js';
import { isClosed } from '../src/shared/dealClose.js';

/** a person with no read mark yet (before this feature) is not told about old talk: only the last 3 days count as unread */
const FRESH_MS = 3 * 86400_000;

type Msg = DatabaseState['dealMessages'][number];

function mine(u: UserProfile, s: DatabaseState): DealRoom[] {
  if (u.role === 'SUPERADMIN' || u.role === 'ADMIN') return [];
  return s.dealRooms.filter(d => isDealParticipant(u, d));
}

function visibleMessages(u: UserProfile, d: DealRoom, s: DatabaseState, open: Set<string>, byDeal: Map<string, Msg[]>): Msg[] {
  const all = byDeal.get(d.id) || [];
  const brokersChannel = canSeeDealCommercials(u, d, s, open);
  return all.filter(m => brokersChannel || (m.audience || 'ALL') === 'ALL');
}

function groupByDeal(s: DatabaseState): Map<string, Msg[]> {
  const g = new Map<string, Msg[]>();
  for (const m of s.dealMessages) { const a = g.get(m.dealRoomId); if (a) a.push(m); else g.set(m.dealRoomId, [m]); }
  return g;
}

const newest = (ms: Msg[]) => ms.reduce<Msg | undefined>((b, m) => (!b || m.timestamp > b.timestamp ? m : b), undefined);

function unreadOf(u: UserProfile, d: DealRoom, ms: Msg[], s: DatabaseState): number {
  const mark = s.chatReads.find(x => x.id === `${u.id}|${d.id}`);
  const since = mark ? Date.parse(mark.at) : Date.now() - FRESH_MS;
  return ms.filter(m => m.senderId !== u.id && Date.parse(m.timestamp) > since).length;
}

export function createChatsRouter() {
  const r = Router();

  r.get('/deals', needs('deal:chat'), (_req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const s = db.getState();
    const open = openDisputeDeals(s);
    const byDeal = groupByDeal(s);
    const name = (id: string) => s.users.find(x => x.id === id)?.name;
    const items = mine(u, s).map(d => {
      const ms = visibleMessages(u, d, s, open, byDeal);
      const last = newest(ms);
      const p = s.properties.find(x => x.id === d.propertyId);
      // the same names the deal room itself shows its participants (no phone numbers here)
      const withNames = [...new Set([d.introducingBrokerId, d.closingBrokerId, d.ownerId])]
        .filter(id => id && id !== u.id && id !== u.employerId).map(id => name(id as string)).filter(Boolean) as string[];
      return {
        id: d.id, propertyId: d.propertyId, propertyTitle: p?.title || d.propertyId, locality: p?.locality || '', propertyType: p?.propertyType || '', cover: p?.images?.[0] || undefined, stage: d.stage, closed: isClosed(d),
        with: withNames,
        count: ms.length, unread: unreadOf(u, d, ms, s),
        last: last ? { text: String(last.text || '').slice(0, 140), at: last.timestamp, mine: last.senderId === u.id, by: last.senderName, media: !!last.mediaUrl } : undefined,
        updatedAt: d.updatedAt,
      };
    });
    items.sort((a, b) => String(b.last?.at || '').localeCompare(String(a.last?.at || '')) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
    res.json({ success: true, deals: items, unread: items.reduce((n, i) => n + i.unread, 0) });
  });

  r.get('/summary', needs('deal:chat'), (_req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const s = db.getState();
    const open = openDisputeDeals(s);
    const byDeal = groupByDeal(s);
    let unread = 0;
    for (const d of mine(u, s)) unread += unreadOf(u, d, visibleMessages(u, d, s, open, byDeal), s);
    res.json({ success: true, unread });
  });

  r.post('/deals/:id/read', needs('deal:chat'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const s = db.getState();
    const d = mine(u, s).find(x => x.id === req.params.id);
    if (!d) return res.status(404).json({ error: 'Deal Room not found' });
    const ms = visibleMessages(u, d, s, openDisputeDeals(s), groupByDeal(s));
    const top = newest(ms);
    if (!top) return res.json({ success: true, unread: 0 });
    const id = `${u.id}|${d.id}`;
    const mark = s.chatReads.find(x => x.id === id);
    if (!mark) { s.chatReads.push({ id, userId: u.id, dealId: d.id, at: top.timestamp }); db.save(); }
    else if (mark.at < top.timestamp) { mark.at = top.timestamp; db.save(); }
    res.json({ success: true, unread: 0 });
  });

  return r;
}
