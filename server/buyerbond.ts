/**
 * v29 — Buyer bond: buyer ↔ broker protection per property.   /api/buyer-bonds
 *
 * Owner bond (v26) protects the broker who brought the PROPERTY. This protects the broker who brought the BUYER:
 *   - made when a site visit is verified with the buyer's OTP / QR, or when an offer (with the buyer's consent) is sent;
 *   - lasts the GENZ protection days (the superadmin's default), per property and buyer mobile;
 *   - while it lasts, no other broker can book a visit or make an offer for the same buyer on the same property —
 *     unless he works inside a deal room together with the bond holder as the buyer side; he is told to co-broke and can send the first
 *     broker a co-broke request (the first broker's name is never shown to him; his own name / mobile go to the first broker);
 *   - if the listing is marked sold / rented while a bond is active, the bond holder is alerted at once.
 * The buyer's mobile is stored only as an HMAC (+ last 4 digits) — like the owner's in the v26 consent. Push alerts never carry the buyer's name or digits.
 *
 *   GET  /mine                 my bonds + co-broke requests on them
 *   POST /:id/release          the holder lets the bond go (buyer not interested)
 *   POST /:id/ask              another broker, blocked by the bond, asks the holder to co-broke
 *   GET  /admin                GENZ staff: bonds (optionally of one property)
 *   POST /admin/:id/void       GENZ staff: cancel a bond on proof (note ≥ 10)
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import type { BuyerBond, UserProfile, Property } from './db.js';
import { ctx, needs, secret, rateLimit, digits } from './auth.js';
import { pushTo } from './webpush.js';
import { daysFor } from './protection.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const phone10 = (p: unknown) => digits(String(p ?? '')).slice(-10);
const buyerKeyOf = (p: unknown) => crypto.createHmac('sha256', secret()).update(`bb-phone|${phone10(p)}`).digest('hex');
const isActive = (b: BuyerBond, now = Date.now()) => b.status === 'ACTIVE' && Date.parse(b.expiresAt) > now;
const note = (b: BuyerBond, text: string) => { b.events.push({ at: nowIso(), text }); if (b.events.length > 40) b.events.splice(0, b.events.length - 40); };
const dIN = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export const BUYER_BONDED_MSG = {
  en: 'Another GENZ broker brought this buyer to this property first, and that protection is still running. You cannot book a visit or make an offer for this buyer here until it ends — but you can ask that broker to co-broke.',
  hi: 'इस प्रॉपर्टी पर यह खरीदार पहले GENZ का दूसरा ब्रोकर लाया था, और उसकी सुरक्षा अभी चल रही है। सुरक्षा ख़त्म होने तक आप इस खरीदार के लिए यहाँ विज़िट या ऑफ़र नहीं कर सकते — पर उस ब्रोकर से को-ब्रोकिंग के लिए कह सकते हैं।',
};

/** the active bond of this buyer on this property, if any */
export function activeBuyerBond(propertyId: string, buyerPhone: unknown): BuyerBond | undefined {
  if (phone10(buyerPhone).length !== 10) return undefined;
  const key = buyerKeyOf(buyerPhone);
  return st().buyerBonds.find(b => b.propertyId === propertyId && b.buyerKey === key && isActive(b));
}

/**
 * Is `u` allowed to bring this buyer to this property? null = yes.
 * Allowed: no bond; the bond is his; or he works on this property in a deal room together with the holder AS the buyer side —
 * the deal room the bond was made in, or one where the holder is the introducing (buyer-side) broker. Being in some other deal
 * room with the holder is not enough: e.g. a broker's own room with the listing broker must not let him take the listing
 * broker's own buyer.
 */
export function buyerBondBlock(u: Pick<UserProfile, 'id'>, propertyId: string, buyerPhone: unknown, _dealRoomId?: string): Record<string, unknown> | null {
  const b = activeBuyerBond(propertyId, buyerPhone);
  if (!b || b.brokerId === u.id) return null;
  const together = st().dealRooms.some(d => d.propertyId === propertyId && (d.introducingBrokerId === u.id || d.closingBrokerId === u.id)
    && (d.id === b.dealRoomId || d.introducingBrokerId === b.brokerId));
  if (together) return null;
  return { error: BUYER_BONDED_MSG.en, hi: BUYER_BONDED_MSG.hi, code: 'BUYER_BONDED', protectedUntil: b.expiresAt, bondRef: b.id };
}

/** a verified visit / an offer made → the buyer's bond with this broker on this property (the first one stays) */
export function makeBuyerBond(a: { brokerId: string; propertyId: string; buyerPhone: unknown; buyerName: string; source: BuyerBond['source']; sourceId: string; dealRoomId?: string }): BuyerBond | null {
  if (phone10(a.buyerPhone).length !== 10) return null;
  const existing = activeBuyerBond(a.propertyId, a.buyerPhone);
  if (existing) {
    if (existing.brokerId === a.brokerId) { note(existing, `${a.source === 'VISIT' ? 'Another verified visit' : 'Another offer'} (${a.sourceId})`); }
    return existing.brokerId === a.brokerId ? existing : null; // someone else's bond: never a second one
  }
  const days = daysFor();
  const now = Date.now();
  const b: BuyerBond = {
    id: `BB-${now.toString(36).toUpperCase()}${crypto.randomInt(100, 999)}`, propertyId: a.propertyId, brokerId: a.brokerId,
    buyerKey: buyerKeyOf(a.buyerPhone), buyerPhoneLast4: phone10(a.buyerPhone).slice(-4), buyerName: String(a.buyerName || '').trim().slice(0, 120) || 'Buyer',
    source: a.source, sourceId: a.sourceId, dealRoomId: a.dealRoomId || undefined, status: 'ACTIVE',
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + days * 86400_000).toISOString(), days, asks: [], events: [],
  };
  note(b, a.source === 'VISIT' ? `Site visit ${a.sourceId} verified with the buyer — buyer bond for ${days} days` : `Offer ${a.sourceId} sent with the buyer's consent — buyer bond for ${days} days`);
  st().buyerBonds.unshift(b);
  const u = db.byId('users', a.brokerId) as UserProfile | undefined;
  db.appendAuditEvent(a.brokerId, u?.role || 'BROKER', 'PROPERTY', a.propertyId, 'BUYER_BOND_CREATED', `Buyer bond ${b.id}: ${u?.name || a.brokerId} brought buyer …${b.buyerPhoneLast4} to ${a.propertyId} (${a.source} ${a.sourceId}), protected until ${b.expiresAt.slice(0, 10)}`);
  return b;
}

/** the listing was marked sold / rented: every OTHER broker who holds an active buyer bond on it is told at once */
export function onPropertyClosed(p: Pick<Property, 'id' | 'title'>, status: string, via: string | undefined, closedByIds: string[]) {
  const ts = nowIso(); let n = 0;
  for (const b of st().buyerBonds) {
    if (b.propertyId !== p.id || !isActive(b) || closedByIds.includes(b.brokerId)) continue;
    b.closedNotice = { at: ts, status, via }; n++;
    note(b, `Listing marked ${status}${via ? ` (${via === 'NETWORK' ? 'through GENZ' : 'outside GENZ'})` : ''} while this bond was active`);
    void pushTo(b.brokerId, { kind: 'deals', title: `Your buyer's property was marked ${status}`, body: `“${p.title}” (${p.id}) — your buyer protection there runs till ${dIN(b.expiresAt)}. If your buyer bought it, raise a dispute in the deal room.`, url: '/?tab=desk&sub=bonds' });
  }
  if (n) db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'PROPERTY', p.id, 'BUYER_BOND_CLOSED_ALERT', `${p.id} marked ${status} while ${n} buyer bond(s) of other brokers were active — holders alerted`);
  return n;
}

function bondView(b: BuyerBond, forHolder: boolean) {
  const p = db.byId('properties', b.propertyId) as Property | undefined;
  return {
    id: b.id, propertyId: b.propertyId, propertyTitle: p?.title, locality: p?.locality, city: p?.city, listingStatus: p?.listingStatus,
    buyerName: forHolder ? b.buyerName : undefined, buyerPhoneLast4: forHolder ? b.buyerPhoneLast4 : undefined,
    source: b.source, sourceId: b.sourceId, dealRoomId: forHolder ? b.dealRoomId : undefined, status: b.status, active: isActive(b),
    createdAt: b.createdAt, expiresAt: b.expiresAt, days: b.days, closedNotice: b.closedNotice, asks: forHolder ? b.asks : undefined, void: b.void,
  };
}

export function createBuyerBondRouter() {
  const r = Router();

  r.get('/mine', needs('offer:make', 'sitevisit:create'), (_req: Request, res: Response) => {
    const u = me();
    const list = st().buyerBonds.filter(b => b.brokerId === u.id).slice(0, 300).map(b => bondView(b, true));
    res.json({ success: true, bonds: list, active: list.filter(b => b.active).length, asks: list.reduce((n, b) => n + (b.active ? (b.asks?.length || 0) : 0), 0) });
  });

  r.post('/:id/release', needs('offer:make', 'sitevisit:create'), (req: Request, res: Response) => {
    const u = me();
    const b = st().buyerBonds.find(x => x.id === req.params.id && x.brokerId === u.id);
    if (!b) return bad(res, 'Buyer bond not found', 404);
    if (!isActive(b)) return bad(res, 'This bond has already ended', 409);
    b.status = 'RELEASED'; note(b, 'Released by the broker'); db.save();
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', b.propertyId, 'BUYER_BOND_RELEASED', `${u.name} released buyer bond ${b.id} (…${b.buyerPhoneLast4})`);
    res.json({ success: true, bond: bondView(b, true) });
  });

  /** a broker who was stopped by a bond asks its (unnamed) holder to co-broke; his own name and mobile go to the holder */
  r.post('/:id/ask', needs('offer:make', 'sitevisit:create'), rateLimit('bb-ask', 20, 3600_000), (req: Request, res: Response) => {
    const u = me();
    const b = st().buyerBonds.find(x => x.id === req.params.id);
    if (!b || !isActive(b)) return bad(res, 'This protection has ended — you can go ahead now.', 404, { code: 'BOND_ENDED' });
    if (b.brokerId === u.id) return bad(res, 'This is your own buyer bond', 400);
    if (b.asks.some(a => a.fromId === u.id)) return bad(res, 'You already asked — the broker has your name and mobile.', 409, { code: 'ALREADY_ASKED' });
    const text = String(req.body?.note ?? '').trim().slice(0, 300);
    b.asks.push({ id: crypto.randomBytes(4).toString('hex'), fromId: u.id, fromName: u.name, fromCompany: u.companyName, fromPhone: u.phone, note: text, at: nowIso() });
    note(b, `Co-broke request from ${u.name}`);
    db.save();
    const p = db.byId('properties', b.propertyId) as Property | undefined;
    void pushTo(b.brokerId, { kind: 'deals', title: 'A broker wants to co-broke your buyer', body: `${u.name}${u.companyName ? ` (${u.companyName})` : ''} has the same buyer for “${p?.title || b.propertyId}”. Open Deal Desk → Buyer protection.`, url: '/?tab=desk&sub=bonds' });
    db.appendAuditEvent(u.id, u.role, 'PROPERTY', b.propertyId, 'BUYER_BOND_COBROKE_ASK', `${u.name} asked the holder of buyer bond ${b.id} to co-broke`);
    res.json({ success: true });
  });

  r.get('/admin', needs('property:moderate'), (req: Request, res: Response) => {
    const pid = String(req.query.propertyId || '');
    const users = new Map(st().users.map(x => [x.id, x]));
    const list = st().buyerBonds.filter(b => !pid || b.propertyId === pid).slice(0, 300)
      .map(b => ({ ...bondView(b, true), brokerName: users.get(b.brokerId)?.name || b.brokerId, events: b.events.slice(-8) }));
    res.json({ success: true, bonds: list });
  });

  r.post('/admin/:id/void', needs('property:moderate'), (req: Request, res: Response) => {
    const a = me();
    const b = st().buyerBonds.find(x => x.id === req.params.id);
    if (!b) return bad(res, 'Not found', 404);
    const why = String(req.body?.note ?? '').trim().slice(0, 300);
    if (why.length < 10) return bad(res, 'Write why the bond is cancelled (at least 10 characters).');
    b.status = 'VOID'; b.void = { byId: a.id, byName: a.name, at: nowIso(), note: why }; note(b, `Cancelled by GENZ: ${why}`);
    db.save();
    db.appendAuditEvent(a.id, a.role, 'PROPERTY', b.propertyId, 'BUYER_BOND_VOID', `${a.name} cancelled buyer bond ${b.id}: ${why}`);
    void pushTo(b.brokerId, { kind: 'deals', title: 'Buyer protection cancelled by GENZ', body: `On ${b.propertyId}. The reason is in Deal Desk → Buyer protection.`, url: '/?tab=desk&sub=bonds' });
    res.json({ success: true, bond: bondView(b, true) });
  });
  return r;
}
