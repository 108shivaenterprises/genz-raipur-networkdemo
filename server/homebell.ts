/**
 * v79 — the Home counters in the notification bell.
 *
 * A broker's Home shows what is waiting for him (co-broking offers, clients asking to visit, brokers looking for what he has, drafts
 * waiting for the owner's yes, listings under bypass protection …). Those same counters are kept as "to do" lines in his bell
 * (src/shared/homeTodoRules.ts says how a line follows its number). The lines are written when he opens the bell / the header asks
 * for the unread count / the Home loads, at most once every 20 seconds per person — so nothing is polled for a person who is not looking.
 *
 * Only a verified broker has such a Home. They are the bell's own lines: no phone push is sent for them (a counter is not an event).
 */
import crypto from 'node:crypto';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { brokerHomeCounts } from './reputation.js';
import { reconcileTodos } from '../src/shared/homeTodoRules.js';

const lastSync = new Map<string, number>();
const SYNC_MS = 20_000;

export function syncHomeBell(u: UserProfile, force = false): boolean {
  try {
    if (u.role !== 'BROKER' || u.verificationStatus !== 'VERIFIED') return false;
    const now = Date.now();
    if (!force && now - (lastSync.get(u.id) || 0) < SYNC_MS) return false;
    lastSync.set(u.id, now);
    if (lastSync.size > 5000) for (const [k, t] of lastSync) if (now - t > SYNC_MS) lastSync.delete(k);
    const r = reconcileTodos(db.getState().inbox, u.id, brokerHomeCounts(u), now, () => `NTF-${now.toString(36)}${crypto.randomBytes(3).toString('hex')}`);
    if (r.added || r.updated || r.removed) { db.save(); return true; }
  } catch (e) { console.error('[INBOX] could not sync the to-do lines:', (e as Error).message); }
  return false;
}
