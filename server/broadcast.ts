/**
 * v26 — "Mere client ko ye chahiye" (requirement broadcast) + push alerts for new matching listings + the 9 AM digest push.
 *   /api/broadcast
 *
 *   POST /                    { requirementId }  — my client's need goes to the brokers who hold matching listings
 *                                                  (and other verified brokers of that city, who may have it off-app)
 *   GET  /inbox               needs sent to me, with MY listings that fit
 *   POST /:id/respond         { propertyId?, note } — one tap: "mere paas hai"
 *   GET  /mine                my broadcasts and who answered
 *   POST /:id/close
 *
 * Privacy: a broadcast carries only the need (type, sale/rent, city, localities, budget, BHK) — never the client's name or
 * phone. An answer shows the answering broker and his listing; the two brokers then talk through the normal offer flow.
 */
import { inferCity } from '../src/shared/places.js';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { db } from './db.js';
import type { Broadcast, BuyerRequirement, Property, UserProfile } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { calculatePropertyMatch } from './matching.js';
import { pushTo, prefsOf, istHour, istDay } from './webpush.js';
import { buildDigest } from './daily.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
export const BROADCAST_DAYS = 7;
export const BROADCAST_PER_DAY = 5;
export const BROADCAST_MAX_RECIPIENTS = 80;
const MATCH_MIN = 60;
const inr = (n: number) => n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`;
const live = (p: Property) => p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus) && !(p as any).heldAt && !(p as any).expiredAt;
const verifiedBroker = (u?: UserProfile) => !!u && u.role === 'BROKER' && u.verificationStatus === 'VERIFIED';
const ck = (s?: string) => String(s || '').trim().toLowerCase();

function summaryOf(r: BuyerRequirement): Broadcast['summary'] {
  return { transactionType: r.transactionType, propertyTypes: [r.propertyType], city: r.city || '', localities: (r.preferredLocalities || []).slice(0, 6), budgetMin: r.budgetMin, budgetMax: r.budgetMax };
}
export const broadcastLine = (b: Broadcast['summary']) =>
  `${b.propertyTypes.join(' / ')} ${b.transactionType === 'Rent' ? 'on rent' : b.transactionType === 'Lease' ? 'on lease' : 'to buy'}${b.localities.length ? ` · ${b.localities.slice(0, 3).join(', ')}` : ''}${b.city ? ` · ${b.city}` : ''} · ${inr(b.budgetMin)}–${inr(b.budgetMax)}`;

/** listings of OTHER brokers that fit the need */
function fits(r: BuyerRequirement, excludeBrokerId: string) {
  const out: { p: Property; score: number }[] = [];
  for (const p of st().properties) {
    if (!p.listingBrokerId || p.listingBrokerId === excludeBrokerId || !live(p) || p.transactionType !== r.transactionType) continue;
    const rc = r.city || inferCity(r.preferredLocalities);
    if (rc && ck(p.city) !== ck(rc)) continue;
    const m = calculatePropertyMatch(p, r);
    if (m.score >= MATCH_MIN) out.push({ p, score: m.score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** v90 — what the NETWORK (other brokers' live, verified listings) holds for this need, right now. Shown to the broker the moment a need arrives. */
export function networkMatchesFor(r: BuyerRequirement, brokerId: string) {
  const all = fits(r, brokerId);
  return {
    count: all.length,
    top: all.slice(0, 5).map(({ p, score }) => {
      const lb = db.byId('users', p.listingBrokerId) as UserProfile | undefined;
      return { id: p.id, title: p.title, locality: p.locality, city: p.city, type: p.propertyType, deal: p.transactionType, price: p.askingPrice, score, broker: lb ? { name: lb.name, company: lb.companyName || '' } : null, image: (p.images || [])[0] || '' };
    }),
  };
}
/** one push telling the broker what the network holds for a client need that just arrived (never names the client) */
export function alertNeedNetwork(r: BuyerRequirement) {
  try {
    if (!r.assignedBrokerId) return { count: 0 };
    const n = networkMatchesFor(r, r.assignedBrokerId);
    void pushTo(r.assignedBrokerId, {
      kind: 'matches',
      title: n.count ? `Network has ${n.count} home${n.count > 1 ? 's' : ''} for your new client need` : 'No network match yet for your new client need',
      body: n.count ? `${n.top[0].title} · ${inr(n.top[0].price)}${n.count > 1 ? ` and ${n.count - 1} more` : ''}` : `${r.propertyType} · ${(r.preferredLocalities || []).slice(0, 2).join(', ')} — we will tell you when a listing fits.`,
      url: '/?tab=requirements', tag: `need-${r.id}`,
    });
    return { count: n.count };
  } catch { return { count: 0 }; }
}

export function createBroadcastRouter() {
  const r = Router();

  r.get('/network/:reqId', needs('requirement:create'), (req: Request, res: Response) => {
    const u = me(); const rq = st().requirements.find(x => x.id === req.params.reqId);
    if (!rq || rq.assignedBrokerId !== u.id) return bad(res, 'Requirement not found', 404);
    res.json({ success: true, ...networkMatchesFor(rq, u.id) });
  });

  r.post('/', needs('requirement:create'), rateLimit('broadcast', 20, 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const rq = s.requirements.find(x => x.id === String(req.body?.requirementId || ''));
    if (!rq || rq.assignedBrokerId !== u.id) return bad(res, 'Requirement not found', 404);
    if (!['active', 'matching'].includes(rq.status)) return bad(res, 'Only an open requirement can be sent to the network.', 409);
    const today = istDay();
    const sentToday = s.broadcasts.filter(b => b.brokerId === u.id && istDay(new Date(b.createdAt)) === today).length;
    if (sentToday >= BROADCAST_PER_DAY) return bad(res, `You can send ${BROADCAST_PER_DAY} needs to the network per day.`, 429, { code: 'BROADCAST_DAILY' });
    const open = s.broadcasts.find(b => b.requirementId === rq.id && b.status === 'OPEN' && Date.parse(b.closesAt) > Date.now());
    if (open && Date.now() - Date.parse(open.createdAt) < 24 * 3600_000) return bad(res, 'This need was sent less than a day ago. Answers are shown under “My broadcasts”.', 409, { code: 'BROADCAST_RECENT', broadcastId: open.id });
    if (open) open.status = 'CLOSED';
    const withListing = new Map<string, number>();
    for (const f of fits(rq, u.id)) if (!withListing.has(f.p.listingBrokerId)) withListing.set(f.p.listingBrokerId, f.score);
    const recipients = [...withListing.keys()].filter(id => verifiedBroker(db.byId('users', id) as UserProfile));
    const city = ck(rq.city || u.city);
    if (city) {
      for (const x of s.users) {
        if (recipients.length >= BROADCAST_MAX_RECIPIENTS) break;
        if (x.id === u.id || recipients.includes(x.id) || !verifiedBroker(x) || ck(x.city) !== city) continue;
        if (prefsOf(x.id).broadcast === false) continue;
        recipients.push(x.id);
      }
    }
    const b: Broadcast = {
      id: `BC-${Date.now().toString(36).toUpperCase()}${crypto.randomInt(100, 999)}`, brokerId: u.id, requirementId: rq.id, summary: summaryOf(rq),
      recipients: recipients.slice(0, BROADCAST_MAX_RECIPIENTS), responses: [], status: 'OPEN', createdAt: nowIso(), closesAt: new Date(Date.now() + BROADCAST_DAYS * 86400_000).toISOString(),
    };
    s.broadcasts.unshift(b);
    if (s.broadcasts.length > 5000) s.broadcasts.length = 5000;
    db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', rq.id, 'REQUIREMENT_BROADCAST', `${u.name} sent a buyer need to ${b.recipients.length} brokers (${withListing.size} with a matching listing)`);
    const line = broadcastLine(b.summary);
    for (const id of b.recipients) void pushTo(id, { kind: 'broadcast', title: withListing.has(id) ? 'Buyer for your listing? 🔔' : 'Buyer need in your city', body: `${line}. Tap “I have it”.`, url: `/?tab=requirements&bc=${b.id}`, tag: b.id });
    res.json({ success: true, broadcast: { id: b.id, sentTo: b.recipients.length, withListing: withListing.size, line } });
  });

  r.get('/inbox', needs('property:read'), (_req: Request, res: Response) => {
    const u = me(); const s = st(); const now = Date.now();
    const list = s.broadcasts.filter(b => b.status === 'OPEN' && Date.parse(b.closesAt) > now && b.recipients.includes(u.id)).slice(0, 60);
    res.json({
      success: true,
      items: list.map(b => {
        const rq = s.requirements.find(x => x.id === b.requirementId);
        const mine = rq ? fits(rq, '').filter(f => f.p.listingBrokerId === u.id).slice(0, 5).map(f => ({ id: f.p.id, title: f.p.title, locality: f.p.locality, price: f.p.askingPrice, score: f.score })) : [];
        const from = db.byId('users', b.brokerId) as UserProfile | undefined;
        return { id: b.id, line: broadcastLine(b.summary), summary: b.summary, from: from ? { name: from.name, company: from.companyName || '' } : null, createdAt: b.createdAt, closesAt: b.closesAt, myListings: mine, answered: b.responses.filter(x => x.brokerId === u.id).map(x => x.propertyId) };
      }),
    });
  });

  const respondSchema = z.object({ propertyId: z.string().max(40).optional(), note: z.string().trim().max(300).default('') });
  r.post('/:id/respond', needs('property:read'), rateLimit('bc-respond', 120, 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const b = s.broadcasts.find(x => x.id === req.params.id);
    if (!b || !b.recipients.includes(u.id)) return bad(res, 'Not found', 404);
    if (b.status !== 'OPEN' || Date.parse(b.closesAt) < Date.now()) return bad(res, 'This need is closed.', 409);
    const p = respondSchema.safeParse(req.body ?? {});
    if (!p.success) return bad(res, 'Check the answer');
    let prop: Property | undefined;
    if (p.data.propertyId) {
      prop = db.byId('properties', p.data.propertyId) as Property | undefined;
      if (!prop || prop.listingBrokerId !== u.id || !live(prop)) return bad(res, 'Choose one of your own live listings', 400);
    } else if (p.data.note.length < 5) return bad(res, 'Choose your listing, or write a line about what you have (it is not on GENZ yet).');
    const key = prop?.id || '';
    if (b.responses.some(x => x.brokerId === u.id && x.propertyId === key)) return res.json({ success: true, duplicate: true });
    b.responses.push({ brokerId: u.id, propertyId: key, note: p.data.note, at: nowIso() });
    db.save();
    void pushTo(b.brokerId, { kind: 'broadcast', title: `${u.name} has a match for your client`, body: prop ? `${prop.title} · ${inr(prop.askingPrice)}` : p.data.note.slice(0, 120), url: `/?tab=requirements&bcmine=${b.id}`, tag: `${b.id}-r` });
    res.json({ success: true });
  });

  r.get('/mine', needs('requirement:create'), (_req: Request, res: Response) => {
    const u = me(); const s = st();
    const list = s.broadcasts.filter(b => b.brokerId === u.id).slice(0, 60);
    res.json({
      success: true,
      items: list.map(b => ({
        id: b.id, line: broadcastLine(b.summary), requirementId: b.requirementId, status: Date.parse(b.closesAt) < Date.now() ? 'CLOSED' : b.status, sentTo: b.recipients.length, createdAt: b.createdAt, closesAt: b.closesAt,
        responses: b.responses.map(x => {
          const who = db.byId('users', x.brokerId) as UserProfile | undefined;
          const prop = x.propertyId ? db.byId('properties', x.propertyId) as Property | undefined : undefined;
          return { at: x.at, note: x.note, broker: who ? { id: who.id, name: who.name, company: who.companyName || '', trustScore: who.trustScore ?? null } : null, property: prop && live(prop) ? { id: prop.id, title: prop.title, locality: prop.locality, price: prop.askingPrice } : null };
        }),
      })),
    });
  });

  r.post('/:id/close', needs('requirement:create'), (req: Request, res: Response) => {
    const u = me();
    const b = st().broadcasts.find(x => x.id === req.params.id && x.brokerId === u.id);
    if (!b) return bad(res, 'Not found', 404);
    b.status = 'CLOSED'; db.save();
    res.json({ success: true });
  });
  return r;
}

/** after a NEW listing: tell the brokers whose open client needs it fits (no client name in the alert) */
export function alertNewListing(p: Property) {
  try {
    if (!live(p)) return 0;
    const s = st(); const told = new Set<string>();
    for (const rq of s.requirements) {
      if (told.size >= 30) break;
      if (!['active', 'matching'].includes(rq.status) || !rq.assignedBrokerId || rq.assignedBrokerId === p.listingBrokerId || told.has(rq.assignedBrokerId)) continue;
      const rcity = rq.city || inferCity(rq.preferredLocalities);
      if (rq.transactionType !== p.transactionType || (rcity && ck(rcity) !== ck(p.city))) continue;
      if (calculatePropertyMatch(p, rq).score < 70) continue;
      told.add(rq.assignedBrokerId);
      void pushTo(rq.assignedBrokerId, { kind: 'matches', title: 'New match for one of your clients', body: `${p.title} · ${inr(p.askingPrice)}`, url: '/?tab=matches', tag: `m-${p.id}` });
    }
    return told.size;
  } catch { return 0; }
}

/** hourly: at 9 AM (India time) one push per member with alerts on — only when the digest has something */
export async function sweepDigestPush(now = new Date()) {
  if (istHour(now) !== 9) return 0;
  const s = st(); const day = istDay(now); let n = 0;
  const withDevices = new Set(s.pushSubs.map(x => x.userId));
  for (const id of withDevices) {
    const u = db.byId('users', id) as UserProfile | undefined;
    if (!u || u.verificationStatus !== 'VERIFIED') continue;
    const p = prefsOf(id);
    if (!p.digest || p.lastDigestDay === day) continue;
    p.lastDigestDay = day;
    try {
      const d = buildDigest(u);
      if (d.muted || !d.matches.length) continue;
      n++;
      void pushTo(id, { kind: 'digest', title: 'Good morning — today on GENZ', body: `${d.properties} listings fit ${d.clients} of your clients${d.fresh ? ` (${d.fresh} new)` : ''}.`, url: '/?tab=daily', tag: `digest-${day}` });
    } catch { /* one member's digest must not stop the others */ }
  }
  db.save();
  return n;
}
