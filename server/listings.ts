/**
 * v14 — listing lifecycle: sold / rented / on-hold / withdrawn, undo, relist (resale), 90-day personal-data purge,
 * site poster + public listing page with enquiry form, and the broker's alert list.   Mounted at /api/listings and /p.
 *
 *  • Sold / rented records HOW it closed (inside the network via an offer or deal, or outside) and optionally the price (private).
 *  • A closed listing leaves matching, feeds and new offers at once; its live offers are closed.
 *  • After SOLD_PURGE_DAYS the owner's and customers' personal data is erased; an anonymous market record and the brokers'
 *    deal timeline stay (8-year compliance retention applies to audit / commission / deal records).
 *  • A resale never reopens the old record — it creates a NEW listing linked by resaleOf, which must be verified again.
 */
import { onPropertyClosed } from './buyerbond.js';
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { joinFooter, reputationHtml } from './publicFooter.js';
import { db } from './db.js';
import type { UserProfile, Property } from './db.js';
import { ctx, needs, rateLimit, hit, digits } from './auth.js';
import { isAdmin } from './access.js';
import { phoneSchema } from './validation.js';
import { closedStatusFor, canUndoSold, purgeDue, priceBand, monthOf, resaleKeyOf, SOLD_PURGE_DAYS, firstName, isLiveOffer } from '../src/shared/dealRules.js';
import { brandOf } from './share.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const profile = (id: string) => db.byId('users', id);
const principal = (u: UserProfile, p: Property) => p.ownerId === u.id || p.listingBrokerId === u.id;
const PUBLIC = ['active', 'under_negotiation'];
const BOT = /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|embedly|curl|wget|python|node-fetch/i;

// ───────────────────────── purge ─────────────────────────
const SETTLING = ['AGREED', 'DUE', 'PARTIALLY_PAID', 'DISPUTED'];
export function purgeBlocked(p: Property): boolean {
  const deals = st().dealRooms.filter(d => d.propertyId === p.id);
  return deals.some(d => SETTLING.includes(d.settlementStatus) || d.stage === 'Disputed')
    || st().disputes.some(x => x.dealRoomId && deals.some(d => d.id === x.dealRoomId) && !['RESOLVED', 'DISMISSED'].includes(x.status));
}

export function purgeProperty(p: Property, actor = { id: 'system', role: 'SUPERADMIN' as any }) {
  const s = st();
  s.marketRecords.push({
    id: `MR-${crypto.randomBytes(4).toString('hex')}`, city: p.city, locality: p.locality, propertyType: p.propertyType, transactionType: p.transactionType,
    areaSqFt: p.plotAreaSqFt || p.builtUpAreaSqFt || 0, month: monthOf(p.soldAt || nowIso()), priceBand: priceBand(p.soldPrice || p.askingPrice), via: p.soldVia || 'OUTSIDE',
  });
  p.title = `${p.propertyType} in ${p.locality} (closed)`; p.description = ''; p.ownerName = 'Owner (data erased)'; p.ownerPhone = '';
  p.addressHidden = ''; p.landmark = ''; p.street = ''; p.googleMapsUrl = ''; p.googleMapsDirectionsUrl = ''; p.videoUrl = '';
  p.latitude = undefined; p.longitude = undefined; p.village = ''; p.images = []; p.documents = []; p.soldNote = undefined; p.soldPrice = undefined;
  p.posterCode = undefined; p.purgedAt = nowIso();
  for (const v of s.siteVisits.filter(x => x.propertyId === p.id)) { v.customerName = firstName(v.customerName); v.customerPhone = undefined; v.otpCode = ''; v.qrToken = ''; }
  for (const o of s.propertyOffers.filter(x => x.propertyId === p.id)) { o.buyerName = firstName(o.buyerName); o.buyerPhoneKey = ''; }
  for (const d of s.dealRooms.filter(x => x.propertyId === p.id)) d.customerId = firstName(d.customerId);
  s.posterEnquiries = s.posterEnquiries.filter(x => x.propertyId !== p.id);
  db.appendAuditEvent(actor.id, actor.role, 'PROPERTY', p.id, 'PROPERTY_PERSONAL_DATA_ERASED', `Personal data erased ${SOLD_PURGE_DAYS} days after closing; anonymous market record kept, deal timeline and audit records retained.`);
}

export function sweepSoldPurge(now = Date.now()): number {
  let n = 0;
  for (const p of st().properties) {
    if (p.purgedAt || !['sold', 'rented'].includes(p.listingStatus) || !purgeDue(p.soldAt, now)) continue;
    if (purgeBlocked(p)) continue;
    purgeProperty(p); n++;
  }
  if (n) db.save();
  return n;
}

// ───────────────────────── router ─────────────────────────
const statusSchema = z.object({
  status: z.enum(['active', 'under_negotiation', 'sold', 'rented', 'withdrawn']),
  soldVia: z.enum(['NETWORK', 'OUTSIDE']).optional(),
  offerId: z.string().max(30).optional(),
  dealRoomId: z.string().max(30).optional(),
  soldPrice: z.number().positive().max(100_000_000_000).optional(),
  soldNote: z.string().trim().max(200).optional(),
});
const relistSchema = z.object({
  confirm: z.literal(true, { message: 'Confirm that the property is available for sale / rent again' }),
  askingPrice: z.number().positive().max(100_000_000_000),
  ownerApprovedNetPrice: z.number().min(0).optional(),
  ownerName: z.string().trim().min(2).max(80).optional(),
  ownerPhone: phoneSchema.optional(),
  addressHidden: z.string().trim().min(5).max(300).optional(),
});

export function createListingsRouter() {
  const r = Router();
  const me = () => ctx().user as UserProfile;
  const self = () => profile(me().id)!;
  const audit = (u: UserProfile, p: Property, action: string, d: string) => db.appendAuditEvent(u.id, u.role as any, 'PROPERTY', p.id, action, d);
  const load = (req: Request, res: Response) => {
    const u = self(); const p = db.byId('properties', req.params.id);
    if (!p || !principal(u, p)) { bad(res, 'Listing not found', 404); return null; }
    return { u, p };
  };

  r.get('/mine', needs('listing:lifecycle'), (_req, res) => {
    const u = self(); const now = Date.now();
    const rows = st().properties.filter(p => principal(u, p)).map(p => {
      const offers = st().propertyOffers.filter(o => o.propertyId === p.id);
      return {
        id: p.id, title: p.title, locality: p.locality, city: p.city, propertyType: p.propertyType, transactionType: p.transactionType, askingPrice: p.askingPrice,
        listingStatus: p.listingStatus, verificationStatus: p.verificationStatus, expired: !!p.expiredAt, soldAt: p.soldAt, soldVia: p.soldVia, soldPrice: p.soldPrice,
        canUndo: ['sold', 'rented'].includes(p.listingStatus) && canUndoSold(p.soldAt, now), purgedAt: p.purgedAt,
        purgeOn: p.soldAt && !p.purgedAt ? new Date(Date.parse(p.soldAt) + SOLD_PURGE_DAYS * 86400_000).toISOString() : undefined,
        resaleOf: p.resaleOf, isListingBroker: p.listingBrokerId === u.id, posterCode: p.posterCode, posterViews: p.posterViews || 0,
        liveOffers: offers.filter(o => isLiveOffer(o.status)).length, tokenHeld: offers.some(o => o.status === 'TOKEN_HELD'),
        newEnquiries: st().posterEnquiries.filter(e => e.propertyId === p.id && e.status === 'NEW').length,
      };
    });
    res.json({ success: true, listings: rows, purgeDays: SOLD_PURGE_DAYS });
  });

  r.post('/:id/status', needs('listing:lifecycle'), (req, res) => {
    const l = load(req, res); if (!l) return; const { u, p } = l;
    const parsed = statusSchema.safeParse(req.body); if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid request');
    const d = parsed.data; const s = st(); const ts = nowIso();
    if (!['active', 'under_negotiation', 'sold', 'rented', 'withdrawn'].includes(p.listingStatus)) return bad(res, `A ${p.listingStatus.replace('_', ' ')} listing cannot be changed here`, 409);
    if (['sold', 'rented', 'withdrawn'].includes(p.listingStatus)) return bad(res, `This listing is already ${p.listingStatus}. Use undo (within 24 h) or relist.`, 409);
    const offers = s.propertyOffers.filter(o => o.propertyId === p.id);
    const held = offers.find(o => o.status === 'TOKEN_HELD');

    if (d.status === 'active' || d.status === 'under_negotiation') {
      if (held) return bad(res, 'A token is held on this property — it stays "under negotiation" until the token is closed', 409, 'TOKEN_LOCK');
      p.listingStatus = d.status; p.updatedAt = ts; db.save(); audit(u, p, 'LISTING_STATUS', `${u.name} set ${p.id} to ${d.status}`);
      return res.json({ success: true });
    }
    if (d.status === 'withdrawn') {
      const live = s.dealRooms.some(x => x.propertyId === p.id && !['Settled'].includes(x.stage) && x.settlementStatus !== 'PAID' && x.stage !== 'Lead' && x.stage !== 'Introduction');
      if (live || held) return bad(res, 'Cannot withdraw: this property has live deals or a held token. Settle, refund or dispute them first.', 409);
      for (const o of offers.filter(o => isLiveOffer(o.status))) { o.status = 'CLOSED'; o.reason = 'Listing withdrawn'; o.updatedAt = ts; o.history.push({ at: ts, byId: u.id, byName: u.name, text: 'Closed — listing withdrawn' }); }
      p.prevStatus = p.listingStatus; p.listingStatus = 'withdrawn'; p.updatedAt = ts; db.save(); audit(u, p, 'PROPERTY_WITHDRAWN', `${u.name} withdrew ${p.id}`);
      return res.json({ success: true });
    }
    // sold / rented
    if (d.status !== closedStatusFor(p.transactionType)) return bad(res, p.transactionType === 'Sale' ? 'A sale listing is marked "sold"' : 'A rent / lease listing is marked "rented"');
    if (!d.soldVia) return bad(res, 'Tell us how it closed: inside the GENZ network, or outside', 400, 'SOLD_VIA');
    let winner = undefined as (typeof offers)[number] | undefined;
    if (d.soldVia === 'NETWORK') {
      if (d.offerId) {
        winner = offers.find(o => o.id === d.offerId && ['ACCEPTED', 'TOKEN_HELD'].includes(o.status));
        if (!winner) return bad(res, 'Pick an accepted offer on this property', 404);
      } else if (d.dealRoomId) {
        if (!s.dealRooms.some(x => x.id === d.dealRoomId && x.propertyId === p.id)) return bad(res, 'Deal room does not belong to this property', 404);
      } else return bad(res, 'Pick the offer or deal room through which it was sold');
    } else if (held) return bad(res, 'A token is held on this property — refund or release it before marking it sold outside the network', 409, 'TOKEN_LOCK');
    for (const o of offers.filter(o => isLiveOffer(o.status))) {
      if (winner && o.id === winner.id) { o.status = 'CLOSED'; if (o.token) { o.token.outcome = 'COMPLETED'; o.token.outcomeAt = ts; o.token.outcomeNote = 'Deal completed — listing marked sold'; } o.history.push({ at: ts, byId: u.id, byName: u.name, text: 'Closed — property sold through this offer' }); }
      else { o.status = 'CLOSED'; o.reason = 'Property sold'; o.history.push({ at: ts, byId: u.id, byName: u.name, text: 'Closed — property was sold' }); }
      o.updatedAt = ts;
    }
    p.resaleKey = p.resaleKey || resaleKeyOf(p);
    p.prevStatus = p.listingStatus; p.listingStatus = d.status; p.soldAt = ts; p.soldVia = d.soldVia; p.soldPrice = d.soldPrice ?? winner?.amount; p.soldNote = d.soldNote; p.soldOfferId = winner?.id; p.updatedAt = ts;
    { // v29 — buyer bonds of OTHER brokers on this property: alert them (the closing side is not alerted about itself)
      const dr = d.dealRoomId ? s.dealRooms.find(x => x.id === d.dealRoomId) : undefined;
      onPropertyClosed(p, d.status, d.soldVia, [u.id, p.listingBrokerId, winner?.brokerId, dr?.introducingBrokerId, dr?.closingBrokerId].filter(Boolean) as string[]);
    }
    db.save();
    audit(u, p, 'LISTING_CLOSED', `${u.name} marked ${p.id} ${d.status} (${d.soldVia === 'NETWORK' ? `via GENZ ${winner ? `offer ${winner.id}` : `deal ${d.dealRoomId}`}` : 'outside the network'}); personal data will be erased after ${SOLD_PURGE_DAYS} days`);
    res.json({ success: true, purgeOn: new Date(Date.parse(ts) + SOLD_PURGE_DAYS * 86400_000).toISOString() });
  });

  r.post('/:id/undo', needs('listing:lifecycle'), (req, res) => {
    const l = load(req, res); if (!l) return; const { u, p } = l;
    if (!['sold', 'rented'].includes(p.listingStatus) || !canUndoSold(p.soldAt)) return bad(res, 'Undo is possible only within 24 hours of marking sold / rented. After that, relist the property.', 409);
    if (p.purgedAt) return bad(res, 'Already erased', 409);
    const ts = nowIso();
    const w = st().propertyOffers.find(o => o.id === p.soldOfferId);
    if (w && w.status === 'CLOSED') { w.status = w.token ? 'TOKEN_HELD' : 'ACCEPTED'; if (w.token) { w.token.outcome = undefined; w.token.outcomeAt = undefined; w.token.outcomeNote = undefined; } w.history.push({ at: ts, byId: u.id, byName: u.name, text: 'Sale undone — offer is live again' }); w.updatedAt = ts; }
    p.listingStatus = p.prevStatus && ['active', 'under_negotiation'].includes(p.prevStatus) ? p.prevStatus : 'active';
    p.soldAt = p.soldVia = p.soldPrice = p.soldNote = p.soldOfferId = undefined as any; p.prevStatus = undefined; p.updatedAt = ts;
    db.save(); audit(u, p, 'LISTING_CLOSE_UNDONE', `${u.name} undid the sold / rented mark on ${p.id}`);
    res.json({ success: true, note: 'Other offers that were closed stay closed — ask buyers to re-submit.' });
  });

  r.post('/:id/relist', needs('listing:lifecycle'), (req, res) => {
    const l = load(req, res); if (!l) return; const { u, p } = l;
    if (!['sold', 'rented', 'withdrawn'].includes(p.listingStatus)) return bad(res, 'Only a sold, rented or withdrawn listing can be relisted', 409);
    if (st().properties.some(x => x.resaleOf === p.id && !['withdrawn', 'sold', 'rented'].includes(x.listingStatus))) return bad(res, 'This property has already been relisted', 409);
    const parsed = relistSchema.safeParse(req.body); if (!parsed.success) return bad(res, parsed.error.issues[0]?.message || 'Invalid request');
    const d = parsed.data;
    const erased = !!p.purgedAt;
    if (erased && (!d.ownerName || !d.ownerPhone || !d.addressHidden)) return bad(res, 'The old details were erased — enter the owner name, owner phone and address again', 400, 'DETAILS_NEEDED');
    const s = st(); const ts = nowIso();
    const seq = s.properties.reduce((m, x) => Math.max(m, Number(/PROP-(?:RAI-)?(\d+)/.exec(x.id)?.[1] ?? 0)), 100) + 1;
    const id = `PROP-${seq}`;
    const np: any = {
      ...p, id, title: erased ? `${p.propertyType} in ${p.locality}` : p.title, askingPrice: d.askingPrice, ownerApprovedNetPrice: d.ownerApprovedNetPrice ?? 0,
      ownerName: d.ownerName || p.ownerName, ownerPhone: d.ownerPhone || p.ownerPhone, addressHidden: d.addressHidden || p.addressHidden,
      listingBrokerId: p.listingBrokerId || (u.role === 'BROKER' ? u.id : ''), listingStatus: 'active', verificationStatus: 'PENDING',
      priceHistory: [{ price: d.askingPrice, changedAt: ts, reason: `Relisted (resale of ${p.id})` }],
      duplicateHash: crypto.createHash('sha256').update(`${p.city}:${p.locality}:${p.propertyType}:${p.plotAreaSqFt || p.builtUpAreaSqFt || 0}:${d.askingPrice}:${id}`).digest('hex'),
      soldAt: undefined, soldVia: undefined, soldPrice: undefined, soldNote: undefined, soldOfferId: undefined, prevStatus: undefined, purgedAt: undefined, posterCode: undefined, posterViews: 0,
      resaleOf: p.id, resaleKey: resaleKeyOf(p), confirmedAt: ts, expiredAt: undefined, heldAt: undefined, createdAt: ts, updatedAt: ts, documents: [],
    };
    s.properties.unshift(np); db.save();
    audit(u, np, 'LISTING_RELISTED', `${u.name} relisted ${p.id} as ${id} (resale). Verification is required again; old deals and commissions stay with ${p.id}.`);
    res.json({ success: true, propertyId: id, note: 'The new listing needs verification before it is visible on the network.' });
  });

  // ── poster (listing broker only) ──
  r.post('/:id/poster', needs('listing:lifecycle'), (req, res) => {
    const l = load(req, res); if (!l) return; const { u, p } = l;
    if (p.listingBrokerId !== u.id) return bad(res, 'Only the listing broker can make the site poster — it carries the broker\'s contact', 403);
    if (!PUBLIC.includes(p.listingStatus) || p.verificationStatus !== 'VERIFIED') return bad(res, 'Poster is available for verified, live listings', 409);
    if (!p.posterCode) { p.posterCode = crypto.randomBytes(5).toString('hex').toUpperCase(); db.save(); audit(u, p, 'POSTER_CREATED', `Site poster code created for ${p.id}`); }
    const bp = brandOf(u);
    res.json({
      success: true, code: p.posterCode, path: `/p/${p.posterCode}`,
      poster: {
        headline: p.transactionType === 'Sale' ? 'FOR SALE' : 'FOR RENT', title: p.title, type: p.propertyType, locality: p.locality, city: p.city,
        area: p.plotAreaSqFt || p.builtUpAreaSqFt || 0, price: p.askingPrice, tx: p.transactionType,
        broker: { name: bp.displayName, company: bp.company, rera: bp.reraId, phone: bp.phone, logo: bp.logo },
      },
    });
  });

  r.get('/enquiries', needs('listing:lifecycle'), (_req, res) => {
    const u = self();
    const mine = new Set(st().properties.filter(p => p.listingBrokerId === u.id).map(p => p.id));
    res.json({ success: true, enquiries: st().posterEnquiries.filter(e => mine.has(e.propertyId)).map(e => ({ ...e, propertyTitle: db.byId('properties', e.propertyId)?.title })) });
  });
  r.post('/enquiries/:id/status', needs('listing:lifecycle'), (req, res) => {
    const u = self(); const e = st().posterEnquiries.find(x => x.id === req.params.id); const p = e && db.byId('properties', e.propertyId);
    if (!e || !p || p.listingBrokerId !== u.id) return bad(res, 'Enquiry not found', 404);
    if (!['CONTACTED', 'CLOSED'].includes(req.body?.status)) return bad(res, 'status must be CONTACTED or CLOSED');
    e.status = req.body.status; db.save(); res.json({ success: true });
  });

  // ── alerts ──
  r.get('/alerts', needs('listing:lifecycle', 'offer:make'), (_req, res) => {
    const u = self(); const s = st(); const now = Date.now(); const out: Array<{ kind: string; en: string; hi: string; refId: string; at: string }> = [];
    const mineProps = s.properties.filter(p => principal(u, p));
    const ids = new Set(mineProps.map(p => p.id));
    for (const o of s.propertyOffers) {
      const p = s.properties.find(x => x.id === o.propertyId);
      if (ids.has(o.propertyId) && p && ['SUBMITTED', 'COUNTERED'].includes(o.status) && (p.ownerId === u.id || (p.listingBrokerId === u.id && o.brokerId !== u.id)) && o.status === 'SUBMITTED')
        out.push({ kind: 'OFFER_DECIDE', en: `New offer ₹${o.amount.toLocaleString('en-IN')} on ${p.title} — decide before ${new Date(o.validUntil).toLocaleDateString('en-IN')}`, hi: `${p.title} पर नया ऑफ़र ₹${o.amount.toLocaleString('en-IN')} — ${new Date(o.validUntil).toLocaleDateString('en-IN')} से पहले तय करें`, refId: o.id, at: o.updatedAt });
      if (ids.has(o.propertyId) && o.status === 'ACCEPTED' && o.tokenDueBy) out.push({ kind: 'TOKEN_DUE', en: `Token for ${o.id} due by ${new Date(o.tokenDueBy).toLocaleString('en-IN')}`, hi: `${o.id} का टोकन ${new Date(o.tokenDueBy).toLocaleString('en-IN')} तक`, refId: o.id, at: o.updatedAt });
      if (o.status === 'TOKEN_HELD' && o.token && !o.token.outcome && (ids.has(o.propertyId) || o.brokerId === u.id) && Date.parse(o.token.validUntil) - now < 2 * 86400_000)
        out.push({ kind: 'TOKEN_EXPIRING', en: `Token on ${o.id} expires ${new Date(o.token.validUntil).toLocaleDateString('en-IN')} — extend, complete or refund`, hi: `${o.id} का टोकन ${new Date(o.token.validUntil).toLocaleDateString('en-IN')} को खत्म — बढ़ाएँ, पूरा या वापस करें`, refId: o.id, at: o.updatedAt });
      if (o.brokerId === u.id && o.status === 'COUNTERED') out.push({ kind: 'COUNTER', en: `Counter ₹${(o.counterAmount || 0).toLocaleString('en-IN')} on your offer ${o.id}`, hi: `आपके ऑफ़र ${o.id} पर काउंटर ₹${(o.counterAmount || 0).toLocaleString('en-IN')}`, refId: o.id, at: o.updatedAt });
    }
    for (const rep of s.listingReports) if (rep.status === 'OPEN' && rep.targetType === 'LISTING' && rep.reason === 'SOLD' && ids.has(rep.targetId))
      out.push({ kind: 'REPORTED_SOLD', en: `A member reports ${rep.targetId} is already sold — update its status if so`, hi: `किसी सदस्य के अनुसार ${rep.targetId} बिक चुकी है — सही हो तो स्टेटस बदलें`, refId: rep.id, at: rep.createdAt });
    for (const e of s.posterEnquiries) if (e.status === 'NEW' && s.properties.find(p => p.id === e.propertyId)?.listingBrokerId === u.id)
      out.push({ kind: 'ENQUIRY', en: `Poster enquiry from ${e.name}`, hi: `पोस्टर से पूछताछ: ${e.name}`, refId: e.id, at: e.createdAt });
    for (const n of s.brokerNotes) if (n.userId === u.id && n.remindAt && Date.parse(n.remindAt) <= now + 86400_000 && Date.parse(n.remindAt) > now - 3 * 86400_000)
      out.push({ kind: 'REMINDER', en: `Reminder: ${n.text.slice(0, 80)}`, hi: `याद दिलाना: ${n.text.slice(0, 80)}`, refId: n.dealRoomId, at: n.remindAt });
    for (const p of mineProps) if (p.soldAt && !p.purgedAt && Date.parse(p.soldAt) + SOLD_PURGE_DAYS * 86400_000 - now < 7 * 86400_000)
      out.push({ kind: 'PURGE_SOON', en: `${p.id}: personal data will be erased within 7 days — download anything you need`, hi: `${p.id}: 7 दिन में निजी डेटा मिट जाएगा — ज़रूरी हो तो सेव करें`, refId: p.id, at: p.soldAt });
    res.json({ success: true, alerts: out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60) });
  });

  // Super-admin: run the erase sweep now (it also runs at start-up and hourly).
  r.post('/admin/purge-now', needs(), (_req, res) => {
    if (me().role !== 'SUPERADMIN') return bad(res, 'Only a super-admin can run this', 403);
    res.json({ success: true, erased: sweepSoldPurge() });
  });

  // anonymous market records (no names, no addresses)
  r.get('/market', needs('property:read'), (req, res) => {
    const city = String(req.query.city || '').toLowerCase(); const loc = String(req.query.locality || '').toLowerCase();
    res.json({ success: true, records: st().marketRecords.filter(m => (!city || m.city.toLowerCase() === city) && (!loc || m.locality.toLowerCase().includes(loc))).slice(-200).reverse() });
  });
  return r;
}

// ───────────────────────── public poster page ─────────────────────────
export function createPublicPosterRouter() {
  const r = Router();
  const page = (title: string, body: string, code = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)}</title>
<style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}.w{max-width:520px;margin:0 auto;padding:14px}
.card{background:#fff;border-radius:16px;padding:16px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.07)}h1{font-size:20px;margin:0 0 4px}.s{color:#555;font-size:13px}.price{font-size:24px;font-weight:800;margin:8px 0}
.tag{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:999px;padding:3px 10px;font-size:12px;margin:2px 4px 2px 0}.sold{background:#fee2e2;color:#991b1b;border-radius:12px;padding:12px;font-weight:700;text-align:center}
.neg{background:#fef3c7;color:#92400e;border-radius:12px;padding:10px;font-weight:600;text-align:center;font-size:13px}img.hero{width:100%;max-height:260px;object-fit:cover;border-radius:12px;margin-bottom:10px}
.btns{display:flex;gap:8px;margin-top:10px}.btns a{flex:1;text-align:center;padding:12px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px}.call{background:#14213d;color:#fff}.wa{background:#1fa855;color:#fff}
label{display:block;font-size:12px;font-weight:600;margin-top:10px}input,textarea{width:100%;min-height:44px;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:15px;font-family:inherit}button.go{margin-top:12px;width:100%;min-height:46px;border:0;border-radius:10px;background:#14213d;color:#fff;font-weight:700;font-size:15px}
.ck{display:flex;gap:8px;align-items:flex-start;font-size:12px;font-weight:400}.ck input{width:20px;min-height:20px;margin-top:2px}.small{font-size:11px;color:#666;margin-top:14px;text-align:center;line-height:1.5}.ok{background:#dcfce7;color:#166534;border-radius:12px;padding:12px;font-weight:600;display:none;margin-top:10px}</style></head>
<body><div class="w">${body}</div>${code ? `<script src="/p/enquiry.js" data-code="${esc(code)}" defer></script>` : ''}</body></html>`;

  r.get('/enquiry.js', (_req, res) => {
    res.type('application/javascript').set('Cache-Control', 'public, max-age=3600').send(`(function(){var s=document.currentScript,c=s&&s.getAttribute('data-code');var f=document.getElementById('enq');if(!f||!c)return;
f.addEventListener('submit',function(e){e.preventDefault();var b=f.querySelector('button'),m=document.getElementById('enqmsg');b.disabled=true;
fetch('/p/'+c+'/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,phone:f.phone.value,message:f.message.value,consent:f.consent.checked})})
.then(function(r){return r.json().then(function(j){return{ok:r.ok,j:j}})}).then(function(x){m.style.display='block';if(x.ok){m.style.background='#dcfce7';m.style.color='#166534';m.textContent='Thank you! The broker will contact you shortly. / धन्यवाद! ब्रोकर जल्द संपर्क करेंगे।';f.style.display='none'}else{m.style.background='#fee2e2';m.style.color='#991b1b';m.textContent=x.j.error||'Could not send';b.disabled=false}})
.catch(function(){m.style.display='block';m.textContent='Network error — please try again';b.disabled=false})})})();`);
  });

  const find = (code: string) => st().properties.find(p => p.posterCode && p.posterCode === String(code).toUpperCase());

  r.get('/:code', rateLimit('poster-view', 90, 60_000), (req: Request, res: Response) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const p = find(req.params.code);
    if (!p) return res.status(404).send(page('Not available', '<div class="card">This listing page is not available.</div>'));
    if (!BOT.test(String(req.headers['user-agent'] || ''))) { p.posterViews = (p.posterViews || 0) + 1; db.save(); }
    const sold = ['sold', 'rented'].includes(p.listingStatus);
    const live = PUBLIC.includes(p.listingStatus) && p.verificationStatus === 'VERIFIED' && !p.expiredAt && !p.heldAt;
    const broker = profile(p.listingBrokerId);
    const area = p.plotAreaSqFt || p.builtUpAreaSqFt || 0;
    const img = p.images.find(i => /^https?:\/\//.test(i) || /^data:image\//.test(i));
    const phone = broker ? digits(broker.phone).slice(-10) : '';
    const head = `<div class="card">${img && live ? `<img class="hero" src="${esc(img)}" alt="">` : ''}<h1>${esc(p.title)}</h1><div class="s">${esc(p.propertyType)} · ${esc(p.locality)}, ${esc(p.city)}${area ? ` · ${Math.round(area).toLocaleString('en-IN')} sq ft` : ''}</div>`;
    if (sold) return res.send(page('Property closed', `${head}<div class="sold" style="margin-top:12px">${p.transactionType === 'Sale' ? 'This property has been sold.' : 'This property has been rented.'}<br>यह प्रॉपर्टी ${p.transactionType === 'Sale' ? 'बिक' : 'किराए पर जा'} चुकी है।</div></div><p class="small">Listed via GENZ Broker Network</p>${joinFooter(broker)}`));
    if (!live) return res.status(404).send(page('Not available', '<div class="card">This listing is not available right now.</div>'));
    const desc = String(p.description || '').slice(0, 400);
    res.send(page(`${p.title} — GENZ`, `${head}<div class="price">${inr(p.askingPrice)}${p.transactionType !== 'Sale' ? ' / month' : ''}</div>${(p.tags || []).slice(0, 8).map(t => `<span class="tag">${esc(t)}</span>`).join('')}${desc ? `<p class="s" style="margin-top:10px">${esc(desc)}</p>` : ''}${p.listingStatus === 'under_negotiation' ? '<div class="neg" style="margin-top:10px">Under negotiation — you can still enquire / बातचीत जारी है, फिर भी पूछ सकते हैं</div>' : ''}</div>
${broker ? `<div class="card"><b>${esc(broker.name)}</b>${broker.companyName ? `<div class="s">${esc(broker.companyName)}</div>` : ''}${broker.reraNumber ? `<div class="s">RERA: ${esc(broker.reraNumber)}</div>` : ''}${reputationHtml(broker)}<div class="btns"><a class="call" href="tel:+91${esc(phone)}">Call</a><a class="wa" href="https://wa.me/91${esc(phone)}?text=${encodeURIComponent(`Hello, I saw your board for ${p.title}`)}">WhatsApp</a></div></div>` : ''}
<div class="card"><b>Send an enquiry / पूछताछ भेजें</b><form id="enq"><label>Name / नाम<input name="name" required maxlength="80" autocomplete="name"></label><label>Mobile / मोबाइल<input name="phone" required inputmode="numeric" maxlength="14" autocomplete="tel"></label><label>Message (optional)<textarea name="message" rows="2" maxlength="300"></textarea></label>
<label class="ck"><input type="checkbox" name="consent" required><span>I agree that GENZ and this broker may contact me about this property. / मैं सहमत हूँ कि इस प्रॉपर्टी के बारे में मुझसे संपर्क किया जाए।</span></label><button class="go" type="submit">Send enquiry</button></form><div id="enqmsg" class="ok"></div></div>
<p class="small">Exact address and owner details are shared only on an arranged visit. Always verify RERA / title before paying any amount.</p>${joinFooter(broker, p.city)}`, p.posterCode));
  });

  r.post('/:code/enquiry', rateLimit('poster-enquiry-ip', 20, 3600_000), (req: Request, res: Response) => {
    const origin = req.headers.origin; if (origin) { try { if (new URL(String(origin)).host !== req.headers.host) return bad(res, 'Cross-origin request blocked', 403); } catch { return bad(res, 'Invalid origin', 403); } }
    const p = find(req.params.code);
    if (!p || !PUBLIC.includes(p.listingStatus) || p.verificationStatus !== 'VERIFIED') return bad(res, 'This listing is not available', 404);
    const name = String(req.body?.name || '').trim(); const msg = String(req.body?.message || '').trim().slice(0, 300);
    const ph = phoneSchema.safeParse(String(req.body?.phone || '').trim());
    if (name.length < 2 || name.length > 80) return bad(res, 'Please enter your name');
    if (!ph.success) return bad(res, 'Please enter a valid mobile number');
    if (req.body?.consent !== true) return bad(res, 'Please tick the consent box so the broker may contact you');
    if (hit(`penq:${digits(ph.data).slice(-10)}:${p.id}`, 2, 24 * 3600_000)) return bad(res, 'You have already sent an enquiry for this property today', 429);
    if (hit(`penq-prop:${p.id}`, 60, 24 * 3600_000)) return bad(res, 'Too many enquiries for this listing today', 429);
    st().posterEnquiries.unshift({ id: `PE-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`, propertyId: p.id, brokerId: p.listingBrokerId, name, phone: ph.data, message: msg || undefined, consentAt: nowIso(), status: 'NEW', createdAt: nowIso() });
    db.save(); db.appendAuditEvent('public', 'SUPERADMIN', 'PROPERTY', p.id, 'POSTER_ENQUIRY', `Enquiry received via site poster for ${p.id} (consent recorded)`);
    res.json({ success: true });
  });
  return r;
}
