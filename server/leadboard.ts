/**
 * v73 — Leadership Board: the top brokers of ONE city, by performance points of the last 90 days.
 * Only members who are VERIFIED and have a GENZ-approved face photo can be on it. An owner (who chooses the free route) sees just the
 * rank, the FIRST name and the photo — no phone, no company. `boardFor(city)` is also what the server checks when an owner names a broker.
 */
import { Router } from 'express';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { needs, rateLimit, ctx } from './auth.js';
import { sameCity } from '../src/shared/india.js';

export const BOARD_SIZE = 10;
const DAY = 86_400_000;
export interface BoardRow { rank: number; brokerId: string; firstName: string; photoUrl: string; isNew: boolean }

export function boardFor(city: string, now = Date.now()): BoardRow[] {
  const s = db.getState(); const since = now - 90 * DAY;
  const pts = new Map<string, number>();
  for (const e of s.pointEvents) if (e.points > 0 && Date.parse(e.at) >= since) pts.set(e.userId, (pts.get(e.userId) || 0) + e.points);
  return s.users
    .filter(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED' && !u.erasedAt && !!u.avatarUrl && sameCity(u.city, city))
    .map(u => ({ u, p: pts.get(u.id) || 0 }))
    .sort((a, b) => b.p - a.p || a.u.createdAt.localeCompare(b.u.createdAt) || a.u.id.localeCompare(b.u.id))
    .slice(0, BOARD_SIZE)
    .map(({ u }, i) => ({ rank: i + 1, brokerId: u.id, firstName: String(u.name || '').trim().split(/\s+/)[0] || 'Broker', photoUrl: u.avatarUrl as string, isNew: Date.now() - Date.parse(u.createdAt) < 60 * DAY }));
}

export function createLeadBoardRouter() {
  const r = Router();
  r.get('/', needs('property:read'), rateLimit('leadboard', 120, 3600_000), (req, res) => {
    const u = ctx().user as UserProfile;
    const city = String(req.query.city || u.city || '').trim().slice(0, 60);
    if (!city) return res.json({ success: true, city: '', board: [] });
    res.json({ success: true, city, board: boardFor(city) });
  });
  return r;
}
