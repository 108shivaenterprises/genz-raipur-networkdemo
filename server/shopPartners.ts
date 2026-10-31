/**
 * v46 — Shop QR partners.
 *   Broker API   /api/shop-partners            (`partner:manage`; GENZ desk list `/admin` with `partner:oversee`)
 *   Customer     /q/:code                      (scan the QR at the shop → a short form → the lead goes to that broker, tagged to the shop)
 *                /q/:code/poster               (the printable poster with the QR)
 *   Partner      /sp/:token                    (the shopkeeper's own page: link + his mobile + a code — no account)
 *
 * Why: brokers stick "to-let / for sale" pamphlets in shops and the shopkeeper never learns what came of them. Here the share is agreed
 * when the QR goes up (sale and rent separately, % of the broker's own brokerage or a fixed ₹), every lead from that QR is the
 * shop's for `lockDays`, the shopkeeper sees each lead's progress (never the customer's full number), and GENZ links any later
 * work on that mobile number by the same broker — a lead marked "lost" and then closed quietly shows up for the shop and for GENZ.
 * GENZ never holds this money: the broker pays the shop himself; GENZ records paid / received / not received.
 */
import { sealLink, linkOf } from './linkSeal.js';
import fs from 'node:fs';
import path from 'node:path';
import { brandedQrSvg } from './brandlogo.js';
import { localityFit, areasOf, canonPlace } from '../src/shared/places.js';
import { PROPERTY_TYPES, RELATED_TYPE_GROUPS } from '../src/shared/india.js';
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { db } from './db.js';
import type { ShopPartner, PartnerLead, UserProfile, ClientCard, ShareChange, LeadMsg, Property } from './db.js';
import { ctx, needs, rateLimit, secret, hit, secureOtp, safeEqual, parseCookies, DEMO_MODE } from './auth.js';
import { sendSms } from './notify.js';
import { pushTo, pushToShop, shopAlertInfo, dropShopPush, shopPushKey, allowedEndpoint, brokerWrote, roomAlertInfo, roomPushKey } from './webpush.js';
import { partyBlock } from './partywatch.js';
import { alertNeedNetwork } from './broadcast.js';
import { shownHomes, pagePhotos, canShow, pageLive } from './publicPage.js';
import { containsPhone, PHONE_IN_CHAT_MSG } from '../src/shared/clientRoomRules.js';
import { brandOf } from './share.js';
import { priceShort } from '../src/shared/publicPageRules.js';
import { ackText, ACK_VERSION } from '../src/shared/visitAckRules.js';
import {
  PARTNER_LIMITS as L, LEAD_KINDS, LEAD_STATUSES, PAYOUT_LABEL, checkTerms, cleanTerms, areaWordsMatch, sameTerms, partnerAmount, sideOfKind, termsText, cutText,
  SHARE_CHANGE_LABEL, SHARE_LIMITS, PAY_MODES, refOk, OVERDUE, unpaidDays, daysSince, payRecord, payRecordText, ASK_LIMITS, OUTCOME_CONSENT,
  type PartnerTerms, type LeadKind, type LeadStatus, type ShareChangeBy, type PartnerPayMode,
} from '../src/shared/shopPartner.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
// ───────────── v93 — one shop, one QR: proof of place + "this shop already has a GENZ QR" ─────────────
const PHOTO_MAX = 400 * 1024; const NEAR_M = 25; const MAX_ACC_M = 150; const PENDING_HOLD_DAYS = 14;
const photoDir = () => path.resolve(process.cwd(), 'data', 'shopphotos');
const photoFile = (id: string) => path.join(photoDir(), `${id}.jpg`);
/** required on a real server (production) or when SHOP_PROOF_REQUIRED=true; optional on a local demo unless set */
export const proofRequired = () => process.env.SHOP_PROOF_REQUIRED === 'true' || (process.env.NODE_ENV === 'production' && process.env.SHOP_PROOF_REQUIRED !== 'false');
const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371000; const rad = (x: number) => (x * Math.PI) / 180; const dLat = rad(b.lat - a.lat); const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const nameKey = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, '');
/** another broker's partnership that still holds this shop: active / paused, or pending for less than 14 days */
const holdsShop = (p: ShopPartner) => p.status === 'ACTIVE' || p.status === 'PAUSED' || (p.status === 'PENDING' && Date.now() - Date.parse(p.createdAt) < PENDING_HOLD_DAYS * 86400_000);
function readProof(b: any): { ok: true; proof?: { lat: number; lng: number; acc: number; at: string }; jpg?: Buffer } | { ok: false; error: string; code: string } {
  const g = b?.geo; const raw = typeof b?.photo === 'string' ? b.photo : '';
  if (!raw && !g) return proofRequired() ? { ok: false, error: 'Take the shop’s photo with the in-app camera while standing at the shop — it records the place.', code: 'PROOF_REQUIRED' } : { ok: true };
  const lat = Number(g?.lat), lng = Number(g?.lng), acc = Number(g?.acc);
  if (![lat, lng, acc].every(Number.isFinite) || lat < 6 || lat > 38 || lng < 68 || lng > 98) return { ok: false, error: 'The shop’s location could not be read. Allow location and try again at the shop.', code: 'PROOF_GEO' };
  if (acc > MAX_ACC_M) return { ok: false, error: `GPS is weak (±${Math.round(acc)} m). Step outside the shop for a moment and take the photo again.`, code: 'PROOF_ACC' };
  const buf = Buffer.from(raw.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buf.length || buf.length > PHOTO_MAX) return { ok: false, error: 'The photo is missing or too big. Take it again.', code: 'PROOF_PHOTO' };
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return { ok: false, error: 'The photo must be taken with the in-app camera.', code: 'PROOF_PHOTO' };
  return { ok: true, proof: { lat, lng, acc, at: nowIso() }, jpg: buf };
}

const me = () => ctx().user as UserProfile;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const hmac = (tag: string, v: string) => crypto.createHmac('sha256', secret()).update(`${tag}|${v}`).digest('hex');
const phone10 = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10);
const PHONE_RE = /^[6-9]\d{9}$/;
const newToken = () => crypto.randomBytes(18).toString('base64url');
const QR_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newQrCode = () => Array.from(crypto.randomBytes(8), b => QR_ALPHA[b % QR_ALPHA.length]).join('');
const rid = (p: string) => `${p}-${crypto.randomBytes(5).toString('hex')}`;
const smsOn = () => !!process.env.SMS_WEBHOOK_URL;
/** audit F2 — only a local DEMO shows the customer's / shop's code to the broker; a real server needs SMS (the broker never sees it) */
const brokerReads = () => !smsOn() && DEMO_MODE;
const NO_SMS = 'कोड अभी नहीं भेजा जा सकता — SMS चालू नहीं है। GENZ सहायता से संपर्क करें। / A code cannot be sent right now — SMS is not set up. Please contact GENZ support.';
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const hist = (x: { history: ShopPartner['history']; updatedAt: string }, by: ShopPartner['history'][number]['by'], text: string) => { x.history.push({ at: nowIso(), by, text }); if (x.history.length > 200) x.history.splice(0, x.history.length - 200); x.updatedAt = nowIso(); };
const partnerOf = (id: string) => st().shopPartners.find(p => p.id === id);
const userOf = (id: string) => st().users.find(u => u.id === id);
const audit = (refId: string, action: string, text: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'LEAD', refId, action, text); };


// ───────────────────────────── v85 — the number stays hidden until the need is confirmed in chat and a matching home is shared ─────────────────────────────
/** a lead from before v85 has no chat (its number is already visible); a new one is visible only after `revealedAt` */
const revealed = (l: PartnerLead) => !l.chat || !!l.chat.revealedAt;
const MSG_MAX = 600; const MSGS_KEEP = 300;
const ownerSide = (l: PartnerLead) => l.kind === 'SELL' || l.kind === 'RENT_OUT';
const addMsg = (l: PartnerLead, m: Omit<LeadMsg, 'at'>) => { if (!l.chat) return; l.chat.msgs.push({ at: nowIso(), ...m }); if (l.chat.msgs.length > MSGS_KEEP) l.chat.msgs.splice(0, l.chat.msgs.length - MSGS_KEEP); l.updatedAt = nowIso(); };
/** "40 lakh" / "1.2 cr" / "12,000 महीना" / "12k" → rupees, or null when it cannot be read (then the budget is not used to match) */
export function parseMoney(t?: string): number | null {
  const x = String(t || '').toLowerCase().replace(/,/g, '').trim(); const m = /(\d+(?:\.\d+)?)/.exec(x); if (!m) return null; const n = Number(m[1]); if (!(n > 0)) return null;
  if (/(cr|crore|करोड़|करोड)/.test(x)) return n * 1e7;
  if (/(lakh|lac|lakhs|लाख)/.test(x)) return n * 1e5;
  if (/(\bk\b|\d\s*k\b|thousand|हज़ार|हजार)/.test(x)) return n * 1e3;
  return n;
}
const norm = (t: unknown) => String(t || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** audit F3 — a listing made AFTER the customer scanned only counts as his "matching home" once it is this old (a home typed in just to open the number does not) */
export const REVEAL_FRESH_LISTING_MS = Number(process.env.REVEAL_FRESH_LISTING_HOURS || 48) * 3600_000;
const tooFreshFor = (l: Pick<PartnerLead, 'createdAt'>, h: Property, now = Date.now()) => {
  const made = Date.parse(String((h as any).createdAt || (h as any).listedAt || '')); if (!Number.isFinite(made)) return false;
  return made > Date.parse(l.createdAt) && now - made < REVEAL_FRESH_LISTING_MS;
};
/** does this home fit what the customer asked for? buy/rent side, the area (or the very home he tapped), and the budget when it can be read. Owner-side leads have no "match" */
export function homeFits(l: Pick<PartnerLead, 'kind' | 'locality' | 'budget' | 'homeId'> & { propertyType?: string }, h: Property): boolean {
  if (l.kind !== 'BUY' && l.kind !== 'RENT_IN') return false;
  if ((l.kind === 'BUY') !== (h.transactionType === 'Sale')) return false;
  const chosen = !!l.homeId && l.homeId === h.id;
  const a = norm(l.locality); const b = norm(h.locality);
  const fit = localityFit(h.city || '', l.locality, h.locality).level; // v90: spelling slips and a bare city name count; a merely "nearby" area does not (this gate decides when the number opens)
  // audit F4 — the word fallback (src/shared/shopPartner.ts areaWordsMatch) compares whole, distinctive words of the area name only
  const area = chosen || fit === 'exact' || fit === 'city' || (!!a && areaWordsMatch(a, b, norm(h.city)));
  if (!area) return false;
  // v91: a plot customer is not offered a flat — the picked type (or its close family) must fit; blank / "Other" means any
  if (!chosen && (l as any).propertyType && (l as any).propertyType !== 'Other' && !typeFits(inferPtype((l as any).propertyType), h.propertyType)) return false;
  const cap = parseMoney(l.budget); const price = Number(h.askingPrice) || 0;
  if (cap && price && price > cap * 1.25) return false;
  return true;
}
function typeFits(want: string, have: string): boolean { return want === have || RELATED_TYPE_GROUPS.some(g => g.includes(want) && g.includes(have)); }
/** the homes this broker may show (own live listings + other brokers' listings opened to pages) that fit the lead */
function matchesFor(l: PartnerLead): Property[] {
  const b = userOf(l.brokerId); if (!b) return [];
  const pool = new Map<string, Property>();
  for (const p of st().properties) if (p.listingBrokerId === b.id && pageLive(p)) pool.set(p.id, p);
  for (const h of shownHomes(b)) pool.set(h.id, h);
  return [...pool.values()].filter(h => homeFits(l, h) && !tooFreshFor(l, h)).slice(0, 12);
}
const homeBrief = (h: Property) => ({ id: h.id, title: h.title, price: priceShort(h.askingPrice), place: `${h.locality}, ${h.city}`, rent: h.transactionType !== 'Sale' });
/** the customer's need, as one readable line (what the broker asks him to confirm) */
const needLine = (l: PartnerLead) => `${LEAD_KINDS.find(k => k.id === l.kind)?.hi || ''} · ${l.locality}${l.budget ? ` · ${l.budget}` : ''}${l.propertyType ? ` · ${l.propertyType}` : ''}${l.note ? ` · “${l.note}”` : ''}`;
/** the moment the number becomes visible: the buyer / renter also lands in the broker's own client list now (not before) */
/** v87 — a number in the shop's budget box → rupees. "50 lakh", "1.2 cr", "15k" read as written; a bare small number is read the way a customer means it (sale: lakh, rent: thousand). null when it cannot be read */
export function budgetRupees(text: string | undefined, rent: boolean): number | null {
  const n = parseMoney(text); if (n == null) return null;
  const hasUnit = /(cr|crore|करोड़|करोड|lakh|lac|लाख|\bk\b|\dk\b|thousand|हज़ार|हजार)/i.test(String(text || ''));
  const v = !hasUnit && n < 1000 ? n * (rent ? 1e3 : 1e5) : n;
  return v > 0 && v <= 1e11 ? Math.round(v) : null;
}
/** the type the customer picked (any of the 14 app types, or an older short name); blank / "Other" → guessed from his note, else a flat */
const KNOWN_TYPES = new Set(PROPERTY_TYPES as readonly string[]);
export function inferPtype(picked: string | undefined, note = ''): string {
  if (picked && KNOWN_TYPES.has(picked)) return picked;
  if (picked && REQ_TYPES[picked]) return REQ_TYPES[picked];
  const t = `${picked || ''} ${note}`.toLowerCase();
  const rules: [RegExp, string][] = [[/farm\s*house|फ़ार्म|फार्म/, 'Farm House'], [/agri|khet|खेत|कृषि/, 'Agricultural Land'], [/godown|warehouse|गोदाम/, 'Warehouse / Godown'], [/factory|industr|फैक्ट्री|उद्योग/, 'Industrial Plot'], [/showroom|शोरूम/, 'Showroom'], [/shop|dukaan|dukan|दुकान/, 'Commercial Shop'], [/office|ऑफ़िस|ऑफिस/, 'Commercial Office'], [/villa|विला/, 'Residential Villa'], [/penthouse/, 'Penthouse'], [/plot|zameen|जमीन|ज़मीन|प्लॉट/, 'Residential Plot'], [/house|makaan|makan|मकान|कोठी/, 'Independent House']];
  for (const [re, ty] of rules) if (re.test(t)) return ty;
  return 'Residential Flat';
}
const REQ_TYPES: Record<string, string> = { Flat: 'Residential Flat', House: 'Independent House', Plot: 'Residential Plot', Shop: 'Commercial Shop', Office: 'Commercial Office', Warehouse: 'Warehouse / Godown' };
/** v87 — the client card and the buyer need are two lists the broker looks at (Today & Clients / Buyers + Magic Match). A shop lead must land in BOTH, or he sees a client with no need, or a need with no client */
function ensureNeed(l: PartnerLead, rent: boolean, city: string): string | undefined {
  const s = st(); const max = budgetRupees(l.budget, rent); if (!max) return undefined;
  const has = s.requirements.find(q => q.assignedBrokerId === l.brokerId && phone10(q.customerPhone) === l.phone && q.status !== 'closed' && q.status !== 'fulfilled');
  if (has) return has.id;
  const seq = s.requirements.reduce((m, q) => Math.max(m, Number(/REQ-(?:RAI-)?(\d+)/.exec(q.id)?.[1] ?? 0)), 200) + 1; const now = nowIso();
  const prior = s.requirements.find(q => phone10(q.customerPhone) === l.phone);
  s.requirements.unshift({ id: `REQ-${seq}`, customerId: prior?.customerId || `CUST-${Date.now().toString(36).toUpperCase()}`, customerName: l.name, customerPhone: l.phone, assignedBrokerId: l.brokerId, budgetMin: Math.max(1, Math.round(max * 0.7)), budgetMax: max, city, preferredLocalities: [l.locality || city], preferredTags: [], propertyType: inferPtype(l.propertyType, l.note) as any, transactionType: rent ? 'Rent' : 'Sale', purpose: 'Self-use', urgency: 'Moderate (1-3 months)', status: 'matching', createdAt: now, updatedAt: now } as any);
  { const made = s.requirements.find(q => q.id === `REQ-${seq}`); if (made) void alertNeedNetwork(made as any); } // v90: tell the broker what the network already holds for this need
  return `REQ-${seq}`;
}

function revealNumber(l: PartnerLead, how: { homeId?: string; title?: string }) {
  if (!l.chat || l.chat.revealedAt) return;
  const s = st(); const now = nowIso(); const p = partnerOf(l.partnerId);
  l.chat.revealedAt = now; l.chat.revealedBy = how;
  if (l.kind === 'BUY' || l.kind === 'RENT_IN') {
    const has = s.clientCards.find(c => c.brokerId === l.brokerId && phone10(c.phone) === l.phone && c.stage !== 'LOST');
    const bud = budgetRupees(l.budget, l.kind === 'RENT_IN');
    ensureNeed(l, l.kind === 'RENT_IN', p?.city || 'Raipur');
    if (has) l.clientCardId = has.id;
    else {
      const n = s.clientCards.reduce((m, c) => Math.max(m, Number(c.id.split('-').pop()) || 0), 0) + 1;
      const card: ClientCard = {
        id: `CLI-${String(n).padStart(4, '0')}`, brokerId: l.brokerId, name: l.name, phone: l.phone, budgetMin: bud ? Math.round(bud * 0.7) : 0, budgetMax: bud || 0, city: p?.city || 'Raipur', areas: [l.locality],
        propertyType: l.propertyType || 'Any', transactionType: l.kind === 'BUY' ? 'Sale' : 'Rent', tags: ['Shop QR'], notes: `Via ${p?.shopName || 'shop'} QR · need confirmed in chat${how.title ? ` · home: ${how.title}` : ''}${l.budget ? ` · budget ${l.budget}` : ''}`,
        stage: 'NEW', consent: true, timeline: [{ at: now, kind: 'CREATED', text: `From the QR at ${p?.shopName || 'a shop'} (number shown after the need was confirmed${how.title ? ' and a matching home shared' : ''})` }], createdAt: now, updatedAt: now,
      };
      s.clientCards.unshift(card); l.clientCardId = card.id;
    }
  }
  hist(l, 'SYSTEM', `Number shown to the broker${how.title ? ` after he shared “${how.title}”` : ' after the owner confirmed the property details'}`);
  addMsg(l, { by: 'SYSTEM', kind: 'INFO', text: how.title ? 'आपका नंबर अब ब्रोकर को दिख गया है — आपकी ज़रूरत से मेल खाता घर शेयर हुआ। / The broker can now see your number — a home matching your need was shared.' : 'आपका नंबर अब ब्रोकर को दिख गया है। / The broker can now see your number.' });
}

// ───────────────────────────── links: later work on the same mobile by the same broker ─────────────────────────────
export interface LeadLink { kind: 'VISIT' | 'ROOM' | 'NEED' | 'DEAL' | 'BOND' | 'CLIENT' | 'LISTING'; id: string; at: string; done?: boolean; en: string; hi: string }
export function linksFor(l: PartnerLead): LeadLink[] {
  const s = st(); const ph = l.phone; const b = l.brokerId;
  const inWin = (at?: string) => !!at && at >= l.createdAt && at <= l.lockUntil;
  const out: LeadLink[] = [];
  for (const v of s.siteVisits) if (v.brokerId === b && phone10(v.customerPhone) === ph && inWin(v.createdAt)) out.push({ kind: 'VISIT', id: v.id, at: v.createdAt, done: v.isVerified, en: v.isVerified ? 'Site visit verified' : 'Site visit booked', hi: v.isVerified ? 'साइट विज़िट हुई' : 'साइट विज़िट तय हुई' });
  const roomKey = hmac('cr-phone', ph);
  for (const r of s.clientRooms) if (r.brokerId === b && r.phoneKey === roomKey && inWin(r.createdAt)) out.push({ kind: 'ROOM', id: r.id, at: r.createdAt, en: 'Client room opened', hi: 'क्लाइंट रूम खुला' });
  const reqIds = new Set<string>();
  for (const q of s.requirements) if (q.assignedBrokerId === b && phone10(q.customerPhone) === ph && inWin(q.createdAt)) { reqIds.add(q.id); out.push({ kind: 'NEED', id: q.id, at: q.createdAt, en: 'Buyer need added', hi: 'खरीदार की ज़रूरत दर्ज' }); }
  const propIds = new Set<string>();
  for (const p of s.properties) if (p.listingBrokerId === b && phone10(p.ownerPhone) === ph && inWin((p as any).createdAt || (p as any).listedAt)) { propIds.add(p.id); out.push({ kind: 'LISTING', id: p.id, at: (p as any).createdAt || (p as any).listedAt, en: 'Property listed', hi: 'प्रॉपर्टी लिस्ट हुई' }); }
  for (const d of s.dealRooms) {
    if (d.introducingBrokerId !== b && d.closingBrokerId !== b) continue;
    if (!(reqIds.has(d.requirementId) || propIds.has(d.propertyId) || (() => { const q = s.requirements.find(x => x.id === d.requirementId); return !!q && phone10(q.customerPhone) === ph; })())) continue;
    if (!inWin(d.createdAt)) continue;
    const late = ['Agreement', 'Handover', 'Settled'].includes(d.stage);
    out.push({ kind: 'DEAL', id: d.id, at: d.createdAt, done: late, en: late ? `Deal room at “${d.stage}”` : 'Deal room opened', hi: late ? `डील रूम “${d.stage}” पर` : 'डील रूम खुला' });
  }
  const bondKey = hmac('bb-phone', ph);
  for (const x of s.buyerBonds) if (x.brokerId === b && x.buyerKey === bondKey && inWin(x.createdAt)) out.push({ kind: 'BOND', id: x.id, at: x.createdAt, en: 'Buyer protection started', hi: 'खरीदार सुरक्षा शुरू' });
  for (const c of s.clientCards) {
    if (c.brokerId !== b || phone10(c.phone) !== ph) continue;
    if (c.id === l.clientCardId) { if (c.stage === 'DEAL') out.push({ kind: 'CLIENT', id: c.id, at: c.updatedAt, done: true, en: 'Client card marked “Deal”', hi: 'क्लाइंट कार्ड पर “डील”' }); continue; }
    if (inWin(c.createdAt)) out.push({ kind: 'CLIENT', id: c.id, at: c.createdAt, done: c.stage === 'DEAL', en: c.stage === 'DEAL' ? 'Client card marked “Deal”' : 'Client card added', hi: c.stage === 'DEAL' ? 'क्लाइंट कार्ड पर “डील”' : 'क्लाइंट कार्ड बना' });
  }
  return out.sort((a, z) => a.at.localeCompare(z.at));
}
/** what GENZ and the shop should look at: work after "lost", or a deal that looks done but no share was written */
export function flagsFor(l: PartnerLead, links = linksFor(l)) {
  const f: { code: 'AFTER_LOST' | 'DEAL_NOT_RECORDED' | 'PAYOUT_OVERDUE' | 'SHARE_DISPUTED' | 'CUSTOMER_NO' | 'CUSTOMER_YES'; en: string; hi: string }[] = [];
  if (l.status === 'LOST' && l.lostAt && links.some(x => x.at > l.lostAt!)) f.push({ code: 'AFTER_LOST', en: 'Worked on after it was marked “not going ahead”', hi: '“आगे नहीं बढ़ी” बताने के बाद भी इस पर काम हुआ' });
  if (l.status !== 'WON' && links.some(x => x.done && (x.kind === 'DEAL' || x.kind === 'CLIENT'))) f.push({ code: 'DEAL_NOT_RECORDED', en: 'Looks like a deal — the partner’s share is not written yet', hi: 'डील लगती है — पार्टनर का हिस्सा अभी दर्ज नहीं' });
  // v82
  const unpaid = unpaidDays(l);
  if (unpaid >= OVERDUE.deskDays) f.push({ code: 'PAYOUT_OVERDUE', en: `The partner’s share has been unpaid for ${unpaid} days`, hi: `पार्टनर का हिस्सा ${unpaid} दिन से बाकी है` });
  if ((l.shareChanges || []).some(c => c.status === 'DISPUTED')) f.push({ code: 'SHARE_DISPUTED', en: 'The shop says the changed share is not right', hi: 'दुकान कहती है बदला हुआ हिस्सा सही नहीं' });
  if (l.status !== 'WON' && l.ask?.answer === 'YES') f.push({ code: 'CUSTOMER_YES', en: 'The customer says it went ahead through this broker, but no deal is written', hi: 'ग्राहक कहता है इस ब्रोकर के ज़रिए बात आगे बढ़ी, पर डील दर्ज नहीं' });
  if (l.status === 'WON' && l.ask?.answer === 'NO') f.push({ code: 'CUSTOMER_NO', en: 'The customer says it did not go ahead through this broker', hi: 'ग्राहक कहता है इस ब्रोकर के ज़रिए बात आगे नहीं बढ़ी' });
  return f;
}
/** v72 — hook (wired in server.ts) giving the partner's estimated share on a deal; the deal price never reaches the shop page */
let shareEstimator: (l: PartnerLead, dealId: string) => number = () => 0;
export const setLeadShareEstimator = (fn: (l: PartnerLead, dealId: string) => number) => { shareEstimator = fn; };
const DEAL_STEPS = [['Lead', 'लीड'], ['Visit', 'विज़िट'], ['Offer', 'ऑफ़र'], ['Agreement', 'एग्रीमेंट'], ['Closed', 'पूरा']] as const;
/** how far this lead has got, in 5 plain steps (Lead → Visit → Offer → Agreement → Closed) — no price, no names */
export function progressFor(l: PartnerLead, links = linksFor(l)) {
  const s = st(); const dl = links.find(x => x.kind === 'DEAL'); const d = dl ? s.dealRooms.find(x => x.id === dl.id) : undefined;
  const order = ['Lead', 'Introduction', 'Site Visit Done', 'Negotiation', 'Agreement', 'Handover', 'Settled'];
  const at = d ? order.indexOf(d.stage) : -1;
  let step = 0;
  if (links.some(x => x.kind === 'VISIT') || at >= 2) step = 1;
  if (at >= 3 || (d && s.propertyOffers.some(o => o.dealRoomId === d.id))) step = 2;
  if (at >= 4) step = 3;
  if (l.status === 'WON' || at >= 6) step = 4;
  if (l.status === 'LOST') step = Math.min(step, 4);
  const share = d && step >= 3 ? shareEstimator(l, d.id) : 0;
  return { step, steps: DEAL_STEPS.map(x => x[1]), stepsEn: DEAL_STEPS.map(x => x[0]), share, final: !!l.won, lost: l.status === 'LOST' };
}
const locked = (l: PartnerLead) => Date.parse(l.lockUntil) > Date.now();

// ───────────────────────────── v82 — the share follows the deal ─────────────────────────────
type ShareInfo = { amount: number; brokerage: number; basis: string };
/** hook (wired in server.ts): the broker's own brokerage on a deal (owner's mandate at the final price + his fee plan) and the share that gives */
let shareInfoFn: (l: PartnerLead, dealId: string) => ShareInfo | null = (l, id) => { const a = shareEstimator(l, id); return a > 0 ? { amount: a, brokerage: 0, basis: 'ESTIMATE' } : null; };
export const setLeadShareInfo = (fn: (l: PartnerLead, dealId: string) => ShareInfo | null) => { shareInfoFn = fn; };
const lastDealOf = (links: LeadLink[]) => { const dl = [...links].reverse().find(x => x.kind === 'DEAL'); return dl ? st().dealRooms.find(x => x.id === dl.id) : undefined; };
/** what the app itself works out for this lead from the linked deal — null when there is no deal in the app (or no brokerage figure on it) */
export function autoShare(l: PartnerLead, links = linksFor(l)) {
  const d = lastDealOf(links); if (!d) return null;
  const i = shareInfoFn(l, d.id); if (!i || i.brokerage <= 0) return null;
  return { ...i, dealId: d.id };
}
const sysAudit = (refId: string, action: string, text: string) => db.appendAuditEvent('SYSTEM', 'SUPERADMIN', 'LEAD', refId, action, text);
const tellShop = (p: ShopPartner, hi: string, en: string, body: string, tag = 'shop') => void pushToShop(p.id, `${hi} / ${en}`, body, tag);
const tellBroker = (p: ShopPartner | undefined, brokerId: string, title: string, body: string) => void pushTo(brokerId, { kind: 'deals', title, body, url: '/?tab=partners' });

/** record a change of the shop's share (merging quick edits into one open change so the shop is not flooded); returns the change and whether it is new */
function addChange(l: PartnerLead, from: number, to: number, by: ShareChangeBy, reason?: string): { change: ShareChange | null; fresh: boolean } {
  const list = (l.shareChanges ||= []); const last = list[list.length - 1]; const now = nowIso();
  if (last && last.status === 'PENDING' && last.by === by && Date.now() - Date.parse(last.at) < SHARE_LIMITS.mergeMinutes * 60_000) {
    last.to = to; last.at = now; if (reason) last.reason = reason;
    if (last.from === last.to) { list.pop(); return { change: null, fresh: false }; } // back to what he was shown — nothing to tell
    return { change: last, fresh: false };
  }
  const c: ShareChange = { id: rid('SCH'), at: now, from, to, by, ...(reason ? { reason } : {}), status: 'PENDING' };
  list.push(c); if (list.length > SHARE_LIMITS.keep) list.splice(0, list.length - SHARE_LIMITS.keep);
  return { change: c, fresh: true };
}
const changeWords = (c: { from: number; to: number }) => (c.from > 0 ? `${inr(c.from)} → ${inr(c.to)}` : inr(c.to));
function tellChange(p: ShopPartner, c: ShareChange) {
  tellShop(p, 'हिस्सा बदला', 'Share changed', `आपकी एक लीड पर हिस्सा ${changeWords(c)} हुआ — पेज खोलकर “ठीक है / सही नहीं” बताएँ। / Open your page to confirm.`, `share-${c.id}`);
}

/**
 * Watch one open lead: tell the shop when it moves a step, when the app first has a share figure for it (Agreement), and whenever that figure changes
 * (the price, the mandate, the fee plan, or the broker typing his own brokerage). Returns true when something was written.
 */
export function watchLead(l: PartnerLead, reason?: string): boolean {
  if (l.status === 'WON' || l.status === 'LOST') return false;
  const p = partnerOf(l.partnerId); if (!p) return false;
  const links = linksFor(l); const pg = progressFor(l, links); let changed = false;
  if (pg.step > (l.stepSeen ?? 0)) {
    l.stepSeen = pg.step; changed = true;
    if (pg.step >= 1 && pg.step <= 3) tellShop(p, `लीड आगे बढ़ी: ${pg.steps[pg.step]}`, `Lead moved: ${pg.stepsEn[pg.step]}`, 'अपना पेज खोलकर देखें। / Open your page.', `lead-${l.id}`);
  }
  if (pg.step < 3) return changed;
  const a = autoShare(l, links); if (!a) return changed;
  if (!l.shareSeen) {
    l.shareSeen = { amount: a.amount, at: nowIso() }; hist(l, 'SYSTEM', `Share worked out from the deal: ${inr(a.amount)} (${cutText(sideOfKind(l.kind) === 'SALE' ? l.terms.sale : l.terms.rent)})`);
    tellShop(p, 'आपका हिस्सा बन रहा है', 'Your share is being worked out', `अनुमान: ${inr(a.amount)} — डील पूरी होने पर तय। / Estimate: ${inr(a.amount)}.`, `share-${l.id}`);
    return true;
  }
  if (Math.round(a.amount) === Math.round(l.shareSeen.amount)) return changed;
  const by: ShareChangeBy = a.basis === 'MANUAL' ? 'BROKER_EDIT' : 'DEAL';
  const from = l.shareSeen.amount; const r = addChange(l, from, a.amount, by, reason);
  l.shareSeen = { amount: a.amount, at: nowIso() }; l.updatedAt = nowIso();
  hist(l, 'SYSTEM', `Share ${inr(from)} → ${inr(a.amount)} (${SHARE_CHANGE_LABEL[by].en}${reason ? `: ${reason}` : ''})`);
  if (r.change) { sysAudit(l.id, 'SHOP_SHARE_CHANGED', `Shop share ${inr(from)} → ${inr(a.amount)} (${by})`); if (r.fresh) tellChange(p, r.change); }
  return true;
}
/** watch every open lead of a broker / on a deal (called when the deal's money moves, when the broker opens his list, and by the hourly sweep) */
export function watchShares(f: { dealId?: string; brokerId?: string; partnerId?: string; reason?: string } = {}): number {
  let n = 0;
  for (const l of st().partnerLeads) {
    if (f.brokerId && l.brokerId !== f.brokerId) continue;
    if (f.partnerId && l.partnerId !== f.partnerId) continue;
    if (l.status === 'WON' || l.status === 'LOST') continue;
    if (f.dealId && !linksFor(l).some(x => x.kind === 'DEAL' && x.id === f.dealId)) continue;
    if (watchLead(l, f.reason)) n++;
  }
  if (n) db.save();
  return n;
}

// ───────────────────────────── v82 — late payment has a cost (reminders → auto-pause → GENZ desk) ─────────────────────────────
/** the leads of this shop whose share has been unpaid for `OVERDUE.pauseDays` or more */
export const overdueOf = (p: ShopPartner) => st().partnerLeads.filter(l => l.partnerId === p.id && unpaidDays(l) >= OVERDUE.pauseDays);

/**
 * Run the late-payment rules once:
 *  · 3 / 7 / 12 days after "deal done" and still unpaid → the broker is reminded (once per step)
 *  · 15 days → the QR is paused by GENZ (only paying it lets the broker resume), the shop is told
 *  · 30 days → the case is put in front of the GENZ desk (no automatic strike — a person decides)
 *  · paid but the shop has not said "received" for 3 days → the shop is nudged once
 * Returns how many things were written. Safe to call often (it only writes when a step is newly reached).
 */
export function sweepShopPartners(nowMs = Date.now()): number {
  let n = 0;
  for (const l of st().partnerLeads) {
    const p = partnerOf(l.partnerId); if (!p || !l.won || !l.payout) continue;
    const days = unpaidDays(l, nowMs);
    if (days > 0) {
      const tier = OVERDUE.remindDays.filter(d => days >= d).pop() || 0;
      if (tier > (l.payout.remind || 0)) {
        l.payout.remind = tier; n++;
        hist(l, 'SYSTEM', `Reminder to the broker: the partner’s share ${inr(l.won.amount)} has been unpaid for ${days} days`);
        tellBroker(p, l.brokerId, `${p.shopName}: हिस्सा बाकी / share pending`, `${inr(l.won.amount)} — ${days} दिन से बाकी। ${OVERDUE.pauseDays} दिन पर QR अपने आप रुक जाएगा। / ${days} days unpaid; the QR pauses itself at ${OVERDUE.pauseDays} days.`);
        if (tier >= OVERDUE.remindDays[1]) tellShop(p, 'ब्रोकर को याद दिलाया गया', 'We reminded the broker', `आपका ${inr(l.won.amount)} का हिस्सा ${days} दिन से बाकी है — GENZ ने ब्रोकर को याद दिलाया। / Your share of ${inr(l.won.amount)} is ${days} days old; GENZ reminded the broker.`, `late-${l.id}`);
      }
      if (days >= OVERDUE.pauseDays && p.status === 'ACTIVE') {
        p.status = 'PAUSED'; p.pausedBy = 'SYSTEM'; p.pauseReason = `Share unpaid for ${days} days`; n++;
        hist(p, 'SYSTEM', `QR paused by GENZ — the share on one lead has been unpaid for ${days} days (it starts again once that is paid)`);
        sysAudit(p.id, 'SHOP_PARTNER_AUTOPAUSED', `Shop QR ${p.id} paused automatically: share unpaid for ${days} days`);
        tellBroker(p, l.brokerId, `${p.shopName}: QR रुक गया / QR paused`, `हिस्सा ${days} दिन से बाकी है। चुकाकर “चुका दिया” दबाएँ — QR फिर चालू हो जाएगा। / Pay the share and mark it paid — the QR starts again.`);
        tellShop(p, 'QR रोका गया', 'QR paused', 'आपका हिस्सा देर से मिल रहा है, इसलिए GENZ ने नया QR फ़िलहाल रोका है। / Because your share is late, GENZ has paused new requests on your QR.', `pause-${p.id}`);
      }
      if (days >= OVERDUE.deskDays && !l.payout.deskAt) {
        l.payout.deskAt = nowIso(); n++;
        sysAudit(l.id, 'SHOP_PAYOUT_OVERDUE', `Shop partner share ${inr(l.won.amount)} unpaid for ${days} days — for the GENZ desk to look at`);
      }
    }
    if (l.payout.status === 'PAID' && l.payout.paidAt && !l.payout.askedAt && daysSince(l.payout.paidAt, nowMs) >= 3) {
      l.payout.askedAt = nowIso(); n++;
      tellShop(p, 'पैसा मिला?', 'Did you get it?', `ब्रोकर ने ${inr(l.won.amount)} भेजने की बात लिखी है — मिल गया हो तो पेज पर “मिल गया” दबाएँ, न मिला हो तो “नहीं मिला”। / The broker says ${inr(l.won.amount)} was sent — please confirm on your page.`, `got-${l.id}`);
    }
  }
  if (n) db.save();
  return n;
}
/** the serverless host may never run an hourly timer, so the broker's list and the shop's page also run the sweep (at most every 10 minutes) */
let lastLazy = 0;
export function lazySweep(force = false): number {
  if (!force && Date.now() - lastLazy < 10 * 60_000) return 0;
  lastLazy = Date.now(); return sweepShopPartners();
}

/**
 * v82 — "Deal done", the rules in one place (the route only checks who is asking).
 * With a deal in the app the brokerage and the shop's share are WORKED OUT (final price + the owner's mandate + the broker's fee plan);
 * the broker may still correct the brokerage, but must say why, and the shop is told (old → new, with the reason) and can confirm or object.
 * With no deal in the app the broker writes his brokerage and the shop is asked to confirm that figure too.
 */
export function closeLead(l: PartnerLead, sent: number | undefined, reason: string): { error: string; status: number; extra?: Record<string, unknown> } | { amount: number; change: ShareChange | null; auditText: string } {
  if (l.status === 'WON') return { error: 'Already written as a closed deal', status: 409 };
  const p = partnerOf(l.partnerId); if (!p) return { error: 'Partner not found', status: 404 };
  const side = sideOfKind(l.kind); const cut = side === 'SALE' ? l.terms.sale : l.terms.rent;
  const a = autoShare(l);
  if (sent !== undefined && (!Number.isInteger(sent) || sent < 1 || sent > 50_00_00_000)) return { error: 'Write your own brokerage on this deal in whole rupees', status: 400 };
  let brokerage: number; let source: 'DEAL' | 'TYPED'; let byWhat: ShareChangeBy | null = null; let fromAmt = 0;
  if (a) {
    source = 'DEAL'; brokerage = a.brokerage;
    if (sent !== undefined && sent !== a.brokerage) {
      if (reason.length < SHARE_LIMITS.reasonMin) return { error: 'The app has worked out your brokerage from the deal. To change it, write why — the shop is told.', status: 400, extra: { code: 'REASON_NEEDED', auto: a.brokerage } };
      brokerage = sent; byWhat = 'BROKER_EDIT'; fromAmt = partnerAmount(cut, a.brokerage);
    }
  } else {
    if (sent === undefined) return { error: 'This deal is not in GENZ, so write your own brokerage on it in whole rupees', status: 400 };
    source = 'TYPED'; brokerage = sent; byWhat = 'TYPED';
  }
  const amount = partnerAmount(cut, brokerage);
  // the shop had been shown a different figure during the deal → that is a change too
  if (!byWhat && l.shareSeen && Math.round(l.shareSeen.amount) !== amount) { byWhat = 'DEAL'; fromAmt = l.shareSeen.amount; }
  l.status = 'WON'; l.lostAt = undefined; l.lostReason = undefined;
  l.won = { at: nowIso(), brokerage, amount, side, source, ...(a ? { dealId: a.dealId, auto: partnerAmount(cut, a.brokerage) } : {}) };
  l.payout = { status: 'DUE' };
  l.shareSeen = { amount, at: nowIso() };
  let change: ShareChange | null = null;
  if (byWhat) change = addChange(l, fromAmt, amount, byWhat, reason || undefined).change;
  hist(l, 'BROKER', `Deal done — partner’s share ${inr(amount)} (${cutText(cut)}${source === 'DEAL' ? ', worked out from the deal' : ', brokerage written by the broker'}${byWhat === 'BROKER_EDIT' ? `, brokerage changed by the broker: ${reason}` : ''})`);
  db.save();
  if (change) tellChange(p, change);
  else tellShop(p, 'डील हुई 🎉', 'Deal done', `आपका हिस्सा: ${inr(amount)}। / Your share: ${inr(amount)}.`, `won-${l.id}`);
  return { amount, change, auditText: `Shop QR lead closed — partner share recorded (${cutText(cut)}; ${source === 'DEAL' ? 'from the deal' : 'written by the broker'}${byWhat === 'BROKER_EDIT' ? '; brokerage changed by the broker' : ''})` };
}

// ───────────────────────────── views ─────────────────────────────
function partnerView(p: ShopPartner) {
  const leads = st().partnerLeads.filter(l => l.partnerId === p.id);
  return {
    id: p.id, shopName: p.shopName, personName: p.personName, area: p.area, city: p.city, phoneLast4: p.phoneLast4, status: p.status,
    proof: p.proof ? { at: p.proof.at, acc: Math.round(p.proof.acc), photo: p.proof.photo } : null,
    terms: p.terms, termsVersion: p.termsVersion, pending: p.pending || null, qrCode: p.qrCode,
    qrUrl: `/q/${p.qrCode}`, posterUrl: `/q/${p.qrCode}/poster`, pageUrl: (() => { const t = linkOf(p, `sp|${p.id}`); return t ? `/sp/${t}` : ''; })(),
    scans: p.scans, lastScanAt: p.lastScanAt, lastPartnerSeenAt: p.lastPartnerSeenAt, acceptedAt: p.acceptedAt, createdAt: p.createdAt,
    pausedBy: p.pausedBy, pauseReason: p.pauseReason, alerts: shopAlertInfo(p.id), overdue: overdueOf(p).length,
    devices: (p.devices || []).map(d => ({ id: d.id, label: d.label, lastAt: d.lastAt })),
    codeForPartner: brokerReads() && p.otpPlain && p.otpExpires && Date.parse(p.otpExpires) > Date.now() ? p.otpPlain : undefined, smsOn: smsOn(),
    counts: {
      leads: leads.length, open: leads.filter(l => !['WON', 'LOST'].includes(l.status)).length, won: leads.filter(l => l.status === 'WON').length,
      due: leads.filter(l => l.payout && ['DUE', 'NOT_RECEIVED'].includes(l.payout.status)).reduce((n, l) => n + (l.won?.amount || 0), 0),
      paid: leads.filter(l => l.payout && ['PAID', 'RECEIVED'].includes(l.payout.status)).reduce((n, l) => n + (l.won?.amount || 0), 0),
    },
    history: p.history.slice(-30),
  };
}
function leadView(l: PartnerLead) {
  const links = linksFor(l); const p = partnerOf(l.partnerId); const { ask, chat, phone, ...rest } = l; const a = autoShare(l, links); const rev = revealed(l);
  return {
    ...rest, ...(rev ? { phone } : {}), masked: !rev,
    // v85 — the in-app chat (never the customer's link token); `matches` = the homes he may share now (only offered once the need is confirmed)
    chat: chat ? { msgs: chat.msgs.slice(-80), reqAskedAt: chat.reqAskedAt || null, reqConfirmedAt: chat.reqConfirmedAt || null, reqText: chat.reqText || null, revealedAt: chat.revealedAt || null, unread: chat.msgs.filter(m => m.by === 'CUSTOMER' && (!chat.brokerSeenAt || m.at > chat.brokerSeenAt)).length } : null,
    alerts: chat ? roomAlertInfo(`lc-${l.id}`).phones : 0,
    matches: chat && !chat.revealedAt && chat.reqConfirmedAt && !ownerSide(l) ? matchesFor(l).map(homeBrief) : [], needLine: needLine(l),
    shopName: p?.shopName || '', city: p?.city || '', links, flags: flagsFor(l, links), locked: locked(l), history: l.history.slice(-30),
    // v82 — what the app itself works out from the deal (shown fixed to the broker), the changes the shop was told about, how long it has been unpaid, and the customer's answer
    auto: a ? { amount: a.amount, brokerage: a.brokerage, basis: a.basis } : null, shareChanges: (l.shareChanges || []).slice(-5), unpaidDays: unpaidDays(l),
    askState: ask ? { at: ask.at, n: ask.n, ...(ask.answer ? { answer: ask.answer, answeredAt: ask.answeredAt } : {}) } : null,
  };
}

// ───────────────────────────── broker API ─────────────────────────────
export function createShopPartnerRouter() {
  const r = Router();
  const mine = (id: string) => { const p = partnerOf(id); return p && p.brokerId === me().id ? p : undefined; };
  const mineLead = (id: string) => { const l = st().partnerLeads.find(x => x.id === id); return l && l.brokerId === me().id ? l : undefined; };

  r.get('/admin', needs('partner:oversee'), (_req, res) => {
    const rows = st().partnerLeads.map(l => ({ l, links: linksFor(l) })).map(x => ({ ...x, flags: flagsFor(x.l, x.links) }))
      .filter(x => x.l.payout?.status === 'NOT_RECEIVED' || x.flags.length > 0)
      .map(({ l, links, flags }) => { const p = partnerOf(l.partnerId); const b = userOf(l.brokerId); return {
        id: l.id, kind: l.kind, status: l.status, createdAt: l.createdAt, phoneLast4: l.phoneLast4, locality: l.locality,
        brokerId: l.brokerId, brokerName: b?.name || l.brokerId, shopName: p?.shopName || '', partnerLast4: p?.phoneLast4 || '',
        won: l.won || null, payout: l.payout || null, flags, links: links.map(x => ({ kind: x.kind, at: x.at, en: x.en })), terms: l.terms,
        unpaidDays: unpaidDays(l), shareChanges: (l.shareChanges || []).filter(c => c.status !== 'OK').slice(-3), customerSaid: l.ask?.answer || null,
      }; });
    res.json({ success: true, items: rows });
  });

  r.get('/', needs('partner:manage'), (_req, res) => {
    const u = me();
    try { watchShares({ brokerId: u.id }); lazySweep(); } catch (e: any) { console.error('[SHOP] watch failed:', e?.message || e); }
    const partners = st().shopPartners.filter(p => p.brokerId === u.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const mineLeads = st().partnerLeads.filter(l => l.brokerId === u.id);
    const leads = mineLeads.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(leadView);
    // v84 — how many homes the customer will SEE on this broker's QR pages (they show only while the broker is verified and his public page is ON) — so a broker is told when the QR shows none
    const verified = u.verificationStatus === 'VERIFIED'; const pageOn = !!u.publicCard?.enabled;
    const homes = { shown: verified && pageOn ? shownHomes(u).length : 0, verified, pageOn };
    res.json({ success: true, partners: partners.map(partnerView), leads, limits: L, record: payRecord(mineLeads), homes });
  });

  r.post('/', needs('partner:manage'), rateLimit('sp-create', 40, 3600_000), express.json({ limit: '1mb' }), (req: Request, res: Response) => {
    const u = me(); const b = req.body || {};
    const shopName = str(b.shopName, 80), personName = str(b.personName, 80), area = str(b.area, 80), city = str(b.city, 60) || u.city || '';
    const phone = phone10(b.phone);
    if (shopName.length < 2) return bad(res, 'Write the shop / place name');
    if (personName.length < 2) return bad(res, 'Write the shopkeeper’s name');
    if (!PHONE_RE.test(phone)) return bad(res, 'Write the shopkeeper’s 10-digit mobile number');
    if (area.length < 2) return bad(res, 'Write the area / locality of the shop');
    const tErr = checkTerms(b.terms); if (tErr) return bad(res, tErr);
    if (b.consent !== true) return bad(res, 'Confirm that the shopkeeper agreed to keep your QR and to be contacted');
    const mineAll = st().shopPartners.filter(p => p.brokerId === u.id && p.status !== 'ENDED');
    if (mineAll.length >= L.partners) return bad(res, `You can keep ${L.partners} partners — end old ones first`);
    const phoneKey = hmac('sp-phone', phone);
    if (mineAll.some(p => p.phoneKey === phoneKey)) return bad(res, 'You already have a partner with this mobile number', 409);
    const pr = readProof(b); if (!pr.ok) return bad(res, pr.error, 400, { code: pr.code });
    // v93 — the same shop cannot carry two brokers' QRs: same shopkeeper mobile, or the same place + name, held by ANOTHER broker. Never says who.
    for (const o of st().shopPartners) {
      if (o.brokerId === u.id || !holdsShop(o)) continue;
      const samePhone = o.phoneKey === phoneKey;
      const near = !!(pr.proof && o.proof && metersBetween(pr.proof, o.proof) <= NEAR_M);
      if (samePhone || (near && nameKey(o.shopName) === nameKey(shopName))) {
        db.appendAuditEvent(u.id, u.role, 'LEAD', o.id, 'SHOP_ALREADY_HAS_QR', `${u.name} tried to add a QR at a shop that already has a GENZ QR (${samePhone ? 'same mobile' : 'same place + name'})`);
        return bad(res, 'This shop already has a GENZ QR from another broker. A shop keeps one QR — ask the shopkeeper to end the old partnership on his page first.', 409, { code: 'SHOP_TAKEN' });
      }
    }
    const token = newToken(); let qrCode = newQrCode(); while (st().shopPartners.some(p => p.qrCode === qrCode)) qrCode = newQrCode();
    const now = nowIso();
    const p: ShopPartner = {
      id: rid('SHP'), brokerId: u.id, shopName, personName, area, city, phoneKey, phoneLast4: phone.slice(-4), qrCode,
      tokenHash: sha(token), sessVersion: 1, linkAt: now, status: 'PENDING', terms: cleanTerms(b.terms), termsVersion: 1,
      scans: 0, history: [], createdAt: now, updatedAt: now,
    };
    if (pr.proof && pr.jpg) {
      try { fs.mkdirSync(photoDir(), { recursive: true }); fs.writeFileSync(photoFile(p.id), pr.jpg); p.proof = { ...pr.proof, photo: true }; } catch (e: any) { console.error('[SHOP] photo save failed:', e?.message || e); }
      // a different shop within 25 m is fine (a market), but GENZ keeps a note
      const nearby = st().shopPartners.filter(o => o.brokerId !== u.id && holdsShop(o) && o.proof && metersBetween(pr.proof!, o.proof) <= NEAR_M);
      if (nearby.length) db.appendAuditEvent(u.id, u.role, 'LEAD', p.id, 'SHOP_QR_NEAR_ANOTHER', `A new shop QR was placed within ${NEAR_M} m of ${nearby.length} other GENZ shop QR(s) — different shop name / mobile`);
    }
    p.tokenSealed = sealLink(token, `sp|${p.id}`); // the broker can send the same page link again; the page still needs the partner's mobile + a code
    hist(p, 'BROKER', `Partner added — terms proposed: ${termsText(p.terms)}`);
    st().shopPartners.unshift(p); db.save();
    audit(p.id, 'SHOP_PARTNER_ADDED', `Shop QR partner added (${shopName}, ••${p.phoneLast4}) — waiting for the partner to accept the terms`);
    res.json({ success: true, partner: partnerView(p), link: `/sp/${token}`, phone });
  });

  /** the proof photo: the broker who owns the partnership, or GENZ staff */
  r.get('/:id/photo', needs('partner:manage', 'partner:oversee'), (req: Request, res: Response) => {
    const u = me(); const p = partnerOf(req.params.id);
    if (!p || (p.brokerId !== u.id && !['ADMIN', 'SUPERADMIN'].includes(u.role))) return bad(res, 'Not found', 404);
    try { const b = fs.readFileSync(photoFile(p.id)); res.setHeader('Cache-Control', 'private, max-age=300'); res.type('image/jpeg').send(b); } catch { bad(res, 'No photo', 404); }
  });

  r.post('/:id/link', needs('partner:manage'), (req: Request, res: Response) => {
    const p = mine(req.params.id); if (!p) return bad(res, 'Partner not found', 404);
    if (p.status === 'ENDED') return bad(res, 'This partnership has ended', 409);
    const token = newToken(); p.tokenHash = sha(token); p.tokenSealed = sealLink(token, `sp|${p.id}`); delete p.token; p.sessVersion += 1; p.linkAt = nowIso(); p.devices = [];
    hist(p, 'BROKER', 'New page link made — the old link stopped working'); db.save();
    res.json({ success: true, partner: partnerView(p), link: `/sp/${token}` });
  });

  r.post('/:id/terms', needs('partner:manage'), (req: Request, res: Response) => {
    const p = mine(req.params.id); if (!p) return bad(res, 'Partner not found', 404);
    if (p.status === 'ENDED') return bad(res, 'This partnership has ended', 409);
    const tErr = checkTerms(req.body?.terms); if (tErr) return bad(res, tErr);
    const t = cleanTerms(req.body.terms);
    if (p.status === 'PENDING') { // not accepted yet: just correct the proposal
      p.terms = t; hist(p, 'BROKER', `Proposal corrected before acceptance: ${termsText(t)}`); db.save();
      return res.json({ success: true, partner: partnerView(p) });
    }
    if (sameTerms(t, p.terms)) { p.pending = undefined; db.save(); return res.json({ success: true, partner: partnerView(p) }); }
    p.pending = { terms: t, at: nowIso(), note: str(req.body?.note, 200) || undefined };
    hist(p, 'BROKER', `Change proposed: ${termsText(t)} (current stays until the partner accepts)`); db.save();
    audit(p.id, 'SHOP_PARTNER_TERMS_PROPOSED', `New share proposed to shop partner ${p.id}`);
    res.json({ success: true, partner: partnerView(p) });
  });
  r.post('/:id/terms/withdraw', needs('partner:manage'), (req: Request, res: Response) => {
    const p = mine(req.params.id); if (!p) return bad(res, 'Partner not found', 404);
    if (!p.pending) return bad(res, 'No change is waiting', 409);
    p.pending = undefined; hist(p, 'BROKER', 'Proposed change withdrawn'); db.save();
    res.json({ success: true, partner: partnerView(p) });
  });
  /** v82 — a one-page leaflet the broker prints / shares to explain the partnership to a shopkeeper (his terms, a worked example, how the share is fixed, what happens when payment is late) */
  r.get('/:id/leaflet', needs('partner:manage'), (req: Request, res: Response) => {
    const p = mine(req.params.id); if (!p) return bad(res, 'Partner not found', 404);
    const b = me(); const t = p.terms;
    const ex = (c: typeof t.sale, brokerage: number) => `${inr(brokerage)} की ब्रोकरेज पर आपका हिस्सा ${inr(partnerAmount(c, brokerage))}`;
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    res.send(`<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>GENZ QR पार्टनर — ${esc(p.shopName)}</title>
<style>@page{size:A4;margin:12mm}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#eee;color:#14213d}.pg{max-width:190mm;margin:10px auto;background:#fff;padding:12mm;border-radius:6px}h1{margin:0;font-size:28px}h2{font-size:17px;margin:16px 0 4px;color:#b45309}.en{color:#555;font-size:12px}p,li{font-size:14px;line-height:1.55}ul,ol{padding-left:20px;margin:4px 0}.box{background:#f3f4f6;border-radius:10px;padding:10px 12px;margin-top:8px}.p{text-align:center;margin:12px}@media print{body{background:#fff}.p{display:none}.pg{margin:0;padding:0}}</style></head>
<body><div class="p"><button id="pr" style="padding:10px 18px;font-size:15px;font-weight:700;border-radius:10px;border:0;background:#14213d;color:#fff">🖨 Print / PDF</button></div>
<div class="pg" data-testid="leaflet"><h1>GENZ QR पार्टनर बनिए</h1><div class="en">${esc(p.shopName)} · ${esc(b.name)}${b.reraNumber ? ` · RERA ${esc(b.reraNumber)}` : ''}</div>
<h2>यह क्या है?</h2><p>आपकी दुकान / गेट पर ${esc(b.name)} का QR रहेगा। आपके यहाँ आने वाला कोई भी मकान, दुकान या प्लॉट किराये पर लेना-देना या ख़रीदना-बेचना चाहे तो QR स्कैन करके अपनी ज़रूरत लिख देता है। ब्रोकर उससे बात करता है। डील हो जाए तो <b>आपको ब्रोकरेज में से हिस्सा</b> मिलता है।</p>
<h2>आपका हिस्सा</h2><div class="box"><p><b>बिक्री:</b> ${esc(cutText(t.sale, true))} · <b>किराया:</b> ${esc(cutText(t.rent, true))}<br><small>उदाहरण — बिक्री: ${esc(ex(t.sale, 100000))} · किराया: ${esc(ex(t.rent, 10000))}</small></p><p class="en">यह सिर्फ़ उदाहरण है; असली हिस्सा हर डील की ब्रोकरेज से बनता है।</p></div>
<h2>हिस्सा कैसे तय होता है — बिना बहस</h2><ol><li>डील का <b>अंतिम भाव</b> ऐप में दर्ज होता है।</li><li>आपके लाए ग्राहक की तरफ़ की ब्रोकरेज देखी जाती है — ख़रीदार/किरायेदार आपके QR से आया तो उससे तय फ़ीस; मालिक आया तो उससे ऐप में साइन हुई ब्रोकरेज। <b>दूसरी तरफ़ की कमाई गिनी नहीं जाती।</b></li><li>उसमें से आपका हिस्सा <b>ऐप ख़ुद निकालता है</b> — कोई हाथ से नहीं लिखता।</li><li>अगर बाद में भाव या ब्रोकरेज बदले, तो <b>आपके फ़ोन पर अलर्ट</b> आता है — पुराना और नया हिस्सा, और वजह। आप “ठीक है” या “सही नहीं” दबा सकते हैं, ब्रोकर या ग्राहक से पूछ सकते हैं।</li></ol>
<h2>पैसा कैसे मिलता है</h2><ul><li>ब्रोकर आपको सीधे UPI / बैंक से भेजता है और रेफ़रेंस नंबर लिखता है। GENZ कोई पैसा नहीं रखता।</li><li>आप अपने पेज पर “मिल गया” या “नहीं मिला” दबाते हैं।</li><li>देर होने पर: ३, ७, १२ दिन पर ब्रोकर को याद दिलाया जाता है; <b>१५ दिन</b> पर नए अनुरोध लेने वाला QR अपने आप रुक जाता है; <b>३० दिन</b> पर मामला GENZ डेस्क के पास जाता है।</li></ul>
<h2>आपकी लीड सुरक्षित</h2><ul><li>जो ग्राहक आपके QR से आया, वह ${t.lockDays} दिन तक आपकी लीड है। ब्रोकर उसी नंबर पर बाद में कोई भी काम करे (विज़िट, क्लाइंट रूम, डील) तो वह आपके पेज पर अपने आप दिखता है।</li><li>ग्राहक का पूरा नंबर और नाम आपको नहीं दिखता — सिर्फ़ आख़िरी 4 अंक।</li></ul>
<h2>आपको क्या नहीं करना</h2><ul><li>ग्राहक से कोई पैसा न लें, कोई वादा न करें।</li><li>काग़ज़ या भाव की बात ब्रोकर पर छोड़ें।</li></ul>
<p class="en" style="margin-top:14px">यह एक रेफ़रल साझेदारी की जानकारी है; यह नौकरी या एजेंसी नहीं है। / This explains a referral partnership; it is not employment or an agency.</p></div>
<script src="/q/poster.js" defer></script></body></html>`);
  });
  for (const [path, to, text] of [['pause', 'PAUSED', 'Paused — the QR form says “not taking requests right now”'], ['resume', 'ACTIVE', 'Resumed'], ['end', 'ENDED', 'Partnership ended — the QR stops; leads already in keep their terms']] as const) {
    r.post(`/:id/${path}`, needs('partner:manage'), (req: Request, res: Response) => {
      const p = mine(req.params.id); if (!p) return bad(res, 'Partner not found', 404);
      if (p.status === 'ENDED') return bad(res, 'This partnership has ended', 409);
      if (to === 'ACTIVE' && p.status !== 'PAUSED') return bad(res, 'Only a paused partnership can be resumed', 409);
      if (to === 'PAUSED' && p.status !== 'ACTIVE') return bad(res, 'Only an active partnership can be paused', 409);
      // v82 — GENZ paused it because a share stayed unpaid: it resumes once what is overdue is paid
      if (to === 'ACTIVE' && p.pausedBy === 'SYSTEM' && overdueOf(p).length) return bad(res, `The QR was paused because the shop’s share is unpaid for over ${OVERDUE.pauseDays} days. Pay it (mark it paid with the reference) and the QR starts again.`, 409, { code: 'PAUSED_UNPAID' });
      p.status = to; if (to === 'ENDED') { p.endedAt = nowIso(); p.pending = undefined; }
      p.pausedBy = to === 'PAUSED' ? 'BROKER' : undefined; p.pauseReason = undefined;
      hist(p, 'BROKER', text); db.save();
      audit(p.id, `SHOP_PARTNER_${path.toUpperCase()}`, `Shop QR partner ${p.id}: ${text}`);
      res.json({ success: true, partner: partnerView(p) });
    });
  }
  r.delete('/:id/devices/:dev', needs('partner:manage'), (req: Request, res: Response) => {
    const p = mine(req.params.id); if (!p) return bad(res, 'Partner not found', 404);
    const d = (p.devices || []).find(x => x.id === req.params.dev); if (!d) return bad(res, 'That phone is not signed in', 404);
    p.devices = (p.devices || []).filter(x => x.id !== d.id); hist(p, 'BROKER', `Removed a phone from the partner page (${d.label})`); db.save();
    res.json({ success: true, partner: partnerView(p) });
  });

  // leads
  // ───────── v85 — the broker's side of the lead chat ─────────
  const chatLead = (req: Request, res: Response) => { const l = mineLead(req.params.id); if (!l || !l.chat) { bad(res, 'Lead not found', 404); return undefined; } return l; };
  r.post('/leads/:id/chat', needs('partner:manage'), (req: Request, res: Response) => {
    const l = chatLead(req, res); if (!l?.chat) return;
    const text = str(req.body?.text, MSG_MAX);
    if (text.length < 1) return bad(res, 'Write a message');
    if (containsPhone(text)) return bad(res, PHONE_IN_CHAT_MSG.en, 400, { code: 'PHONE_IN_CHAT', hi: PHONE_IN_CHAT_MSG.hi });
    addMsg(l, { by: 'BROKER', kind: 'MSG', text }); l.chat.brokerSeenAt = nowIso(); db.save();
    void brokerWrote(`lc-${l.id}`, me().name, 'MSG');
    res.json({ success: true, lead: leadView(l) });
  });
  r.post('/leads/:id/chat/seen', needs('partner:manage'), (req: Request, res: Response) => {
    const l = chatLead(req, res); if (!l?.chat) return; l.chat.brokerSeenAt = nowIso(); db.save(); res.json({ success: true });
  });
  /** "confirm your need": the customer sees his need as one line with ✅ / ✏️ buttons */
  r.post('/leads/:id/ask-need', needs('partner:manage'), (req: Request, res: Response) => {
    const l = chatLead(req, res); if (!l?.chat) return;
    if (l.chat.reqConfirmedAt) return bad(res, 'He has already confirmed his need', 409);
    if (l.chat.reqAskedAt) return bad(res, 'Already asked — waiting for his answer', 409);
    l.chat.reqAskedAt = nowIso(); addMsg(l, { by: 'BROKER', kind: 'ASK', text: needLine(l) }); l.chat.brokerSeenAt = nowIso(); db.save();
    void brokerWrote(`lc-${l.id}`, me().name, 'MSG');
    res.json({ success: true, lead: leadView(l) });
  });
  /** share a home that fits the confirmed need → the customer sees it in his chat and the broker's screen shows the number (once) */
  r.post('/leads/:id/offer', needs('partner:manage'), (req: Request, res: Response) => {
    const l = chatLead(req, res); if (!l?.chat) return;
    if (ownerSide(l)) return bad(res, 'An owner lead needs no matching home — his number shows once he confirms the property details');
    if (!l.chat.reqConfirmedAt) return bad(res, 'Ask him to confirm his need first — the number stays hidden until he does', 409);
    const h = matchesFor(l).find(x => x.id === str(req.body?.homeId, 40));
    if (!h) {
      const asked = st().properties.find(x => x.id === str(req.body?.homeId, 40));
      if (asked && homeFits(l, asked) && tooFreshFor(l, asked)) return bad(res, `A listing added after this customer scanned counts as his matching home only after ${Math.round(REVEAL_FRESH_LISTING_MS / 3600_000)} hours. Share it in the chat later, or pick an older home.`, 409, { code: 'LISTING_TOO_NEW' });
      return bad(res, 'That home does not match what he asked for (or is not on your page). Pick one from the list.', 400);
    }
    const b = homeBrief(h);
    addMsg(l, { by: 'BROKER', kind: 'HOME', text: h.title, homeId: h.id, title: h.title, price: b.price, place: b.place });
    l.chat.brokerSeenAt = nowIso();
    const first = !l.chat.revealedAt;
    revealNumber(l, { homeId: h.id, title: h.title });
    hist(l, 'BROKER', `Shared “${h.title}” in the chat`);
    audit(l.id, first ? 'SHOP_LEAD_NUMBER_SHOWN' : 'SHOP_LEAD_HOME_SHARED', first ? `Number shown to the broker after the need was confirmed in chat and a matching home (${h.id}, listed ${(h as any).createdAt || 'before v92'}) was shared` : `Another home (${h.id}) shared in the chat`);
    db.save();
    void brokerWrote(`lc-${l.id}`, me().name, 'HOME');
    res.json({ success: true, lead: leadView(l) });
  });
  r.post('/leads/:id/status', needs('partner:manage'), (req: Request, res: Response) => {
    const l = mineLead(req.params.id); if (!l) return bad(res, 'Lead not found', 404);
    const to = String(req.body?.status || '') as LeadStatus;
    if (!['NEW', 'CONTACTED', 'VISIT', 'NEGOTIATION', 'LOST'].includes(to)) return bad(res, 'Choose a stage (a closed deal is written with “Deal done”)');
    if (l.status === 'WON') return bad(res, 'This lead is already a closed deal', 409);
    if (to === 'LOST') {
      const reason = str(req.body?.reason, 200);
      if (reason.length < 3) return bad(res, 'Write why it is not going ahead (the partner sees this)');
      l.lostAt = nowIso(); l.lostReason = reason;
    } else { l.lostAt = undefined; l.lostReason = undefined; }
    l.status = to; hist(l, 'BROKER', `Stage → ${LEAD_STATUSES.find(x => x.id === to)!.en}${to === 'LOST' ? ` (${l.lostReason})` : ''}`); db.save();
    res.json({ success: true, lead: leadView(l) });
  });
  /**
   * v82 — "Deal done". When the deal is in the app, the brokerage and the shop's share are WORKED OUT by the app (final price + the owner's mandate +
   * the broker's own fee plan) — nothing is typed. The broker may still correct the brokerage, but then he must say why, and the shop is told
   * (old → new, with the reason) and can confirm it or object. With no deal in the app he types his brokerage and the shop is asked to confirm that too.
   */
  r.post('/leads/:id/won', needs('partner:manage'), (req: Request, res: Response) => {
    const l = mineLead(req.params.id); if (!l) return bad(res, 'Lead not found', 404);
    const sent = req.body?.brokerage === undefined || req.body?.brokerage === null || req.body?.brokerage === '' ? undefined : Number(req.body.brokerage);
    const r2 = closeLead(l, sent, str(req.body?.reason, 160));
    if ('error' in r2) return bad(res, r2.error, r2.status, r2.extra);
    db.saveNow();
    audit(l.id, 'SHOP_PARTNER_LEAD_WON', r2.auditText);
    res.json({ success: true, lead: leadView(l) });
  });

  /** v82 — correct the share after "deal done" while it is still unpaid (a reason is needed; the shop is told and can confirm or object) */
  r.post('/leads/:id/share', needs('partner:manage'), (req: Request, res: Response) => {
    const l = mineLead(req.params.id); if (!l || !l.won || !l.payout) return bad(res, 'Lead not found', 404);
    if (!['DUE', 'NOT_RECEIVED'].includes(l.payout.status)) return bad(res, 'The share is already paid — ask the GENZ desk to look at it', 409);
    const p = partnerOf(l.partnerId); if (!p) return bad(res, 'Partner not found', 404);
    const brokerage = Number(req.body?.brokerage); const reason = str(req.body?.reason, 160);
    if (!Number.isInteger(brokerage) || brokerage < 1 || brokerage > 50_00_00_000) return bad(res, 'Write your own brokerage on this deal in whole rupees');
    if (reason.length < SHARE_LIMITS.reasonMin) return bad(res, 'Write why the share is being changed — the shop is told');
    const cut = l.won.side === 'SALE' ? l.terms.sale : l.terms.rent; const amount = partnerAmount(cut, brokerage); const from = l.won.amount;
    if (amount === from) return bad(res, 'That gives the same share', 409);
    l.won = { ...l.won, brokerage, amount }; l.shareSeen = { amount, at: nowIso() };
    const { change } = addChange(l, from, amount, 'REVISED', reason);
    hist(l, 'BROKER', `Share corrected ${inr(from)} → ${inr(amount)}: ${reason}`); db.saveNow();
    audit(l.id, 'SHOP_PARTNER_SHARE_REVISED', `Broker corrected the shop’s share ${inr(from)} → ${inr(amount)}`);
    if (change) tellChange(p, change);
    res.json({ success: true, lead: leadView(l) });
  });

  /** v82 — the broker answers a shop that said "not right" (the shop sees it; a dispute stays on the GENZ desk until it is settled) */
  r.post('/leads/:id/changes/:cid/reply', needs('partner:manage'), (req: Request, res: Response) => {
    const l = mineLead(req.params.id); if (!l) return bad(res, 'Lead not found', 404);
    const c = (l.shareChanges || []).find(x => x.id === req.params.cid); if (!c) return bad(res, 'Change not found', 404);
    const note = str(req.body?.note, 300); if (note.length < 2) return bad(res, 'Write your reply');
    c.brokerNote = note; c.brokerAt = nowIso(); hist(l, 'BROKER', `Reply on the share change: ${note}`); db.save();
    const p = partnerOf(l.partnerId); if (p) tellShop(p, 'ब्रोकर का जवाब', 'Broker replied', `हिस्से के बारे में ब्रोकर ने जवाब दिया — पेज खोलें। / The broker replied about your share.`, `share-${c.id}`);
    res.json({ success: true, lead: leadView(l) });
  });

  /** v82 — "I have paid": how (UPI / bank / cash) and, for UPI and bank, the reference — the shop then confirms on his page */
  r.post('/leads/:id/paid', needs('partner:manage'), (req: Request, res: Response) => {
    const l = mineLead(req.params.id); if (!l) return bad(res, 'Lead not found', 404);
    if (!l.payout || !['DUE', 'NOT_RECEIVED'].includes(l.payout.status)) return bad(res, 'Nothing is due on this lead', 409);
    const mode = (PAY_MODES.find(m => m.id === String(req.body?.mode || 'UPI'))?.id || 'UPI') as PartnerPayMode;
    const ref = str(req.body?.ref, 60);
    if (!refOk(mode, ref)) return bad(res, 'Write the UPI / bank reference of the payment (at least 6 letters or digits). For cash, choose “Cash” — the shop must then confirm.', 400, { code: 'REF_NEEDED' });
    l.payout = { ...l.payout, status: 'PAID', paidAt: nowIso(), mode, ref: ref || undefined, askedAt: undefined };
    hist(l, 'BROKER', `Marked paid to the partner (${mode}${ref ? `, ref ${ref}` : ''}) — waiting for the partner to confirm`);
    const p = partnerOf(l.partnerId);
    if (p && p.status === 'PAUSED' && p.pausedBy === 'SYSTEM' && !overdueOf(p).length) { p.status = 'ACTIVE'; p.pausedBy = undefined; p.pauseReason = undefined; hist(p, 'SYSTEM', 'Resumed — the overdue share is paid'); }
    db.saveNow();
    audit(l.id, 'SHOP_PARTNER_PAID', `Broker marked the partner share as paid (${mode})`);
    if (p) tellShop(p, 'हिस्सा भेजा गया', 'Share sent', `${inr(l.won?.amount || 0)} भेजा गया (${mode}) — मिल गया हो तो पेज पर “पैसा मिल गया” दबाएँ। / Confirm on your page once you have it.`, `paid-${l.id}`);
    res.json({ success: true, lead: leadView(l) });
  });

  return r;
}

// ───────────────────────────── public pages: shared look ─────────────────────────────
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}.w{max-width:560px;margin:0 auto;padding:14px}
.top{background:#14213d;color:#fff;border-radius:16px;padding:16px}.top h1{margin:0 0 4px;font-size:19px}.top p{margin:0;opacity:.85;font-size:13px}
.card{background:#fff;border-radius:14px;padding:14px;margin-top:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}.warn{background:#fff6e5}.ok{background:#e9f7ee}.red{background:#fdecec}
p.t{font-size:14px;line-height:1.55;margin:6px 0}small,.small{color:#666;font-size:12px}h2{font-size:15px;margin:16px 4px 0}
label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}input[type=text],input[type=tel],input[type=number],textarea,select{width:100%;padding:12px;border:1px solid #bbb;border-radius:10px;font-size:16px;font-family:inherit;background:#fff}
button,.btn{display:inline-block;padding:12px 16px;border-radius:11px;border:0;font-size:15px;font-weight:700;background:#14213d;color:#fff;text-decoration:none;cursor:pointer}.g{background:#1fa855}.l{background:#eee;color:#222}.r{background:#c0392b}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.kinds{display:grid;grid-template-columns:1fr 1fr;gap:8px}.kinds label{margin:0;display:flex;align-items:center;gap:8px;border:1px solid #ccc;border-radius:12px;padding:12px;font-size:14px;background:#fff}
.ck{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:13px}.ck input{width:20px;height:20px;margin-top:2px}.hp{position:absolute;left:-9999px}
.lead{border-top:1px solid #eee;padding:10px 0}.prog{display:flex;gap:3px;margin:8px 0 4px}.prog .st{flex:1;text-align:center;font-size:10px;font-weight:700;padding:5px 0;border-radius:6px;background:#eef1f7;color:#64748b}.prog .st.on{background:#16a34a;color:#fff}.prog .st.now{background:#fde68a;color:#92400e}.chip{display:inline-block;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700;background:#eef1f7;margin:2px 4px 0 0}.chip.ok{background:#dcfce7;color:#166534}.chip.w{background:#fef3c7;color:#92400e}.chip.x{background:#fee2e2;color:#991b1b}
.hms{display:grid;gap:10px;margin-top:8px}.hm{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}.hm .ph{position:relative;background:#e5e7eb;aspect-ratio:16/10;overflow:hidden}.hm .ph canvas{display:block;width:100%;height:100%;-webkit-touch-callout:none;user-select:none}
.hm .np{position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#64748b;font-size:13px;font-weight:600}.hm .ph.nophoto .np{display:flex}.hm .ph.nophoto canvas{display:none}.hm .bd{padding:10px 12px 12px}.hm .pr{font-size:19px;font-weight:800}.hm .tt{font-weight:700;font-size:14px;margin-top:2px}.hm .sb{color:#555;font-size:12px;margin-top:2px}
.net{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700;margin-top:6px}.big2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.big2 .btn{text-align:center;padding:14px 8px}.pick{background:#e9f7ee;border:1px solid #86efac}
.lang{display:flex;gap:6px;justify-content:flex-end;margin:0 0 8px}.lang a{font-size:12px;padding:4px 10px;border-radius:999px;background:#e5e7eb;color:#14213d;text-decoration:none}.lang a.on{background:#14213d;color:#fff}.say{background:#fff7ed;border:1px solid #fdba74;border-radius:12px;padding:12px}.say b{font-size:17px;line-height:1.5;display:block;margin-bottom:8px}.more>summary{cursor:pointer;font-size:13px;font-weight:600;color:#14213d;padding:6px 0;list-style:none}.more>summary::-webkit-details-marker{display:none}.more>summary::before{content:'▸ ';color:#6b7280}.more[open]>summary::before{content:'▾ '}.more[open]>summary{margin-bottom:6px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stats div{background:#f3f4f6;border-radius:10px;padding:10px;text-align:center}.stats b{display:block;font-size:18px}
.app{background:#ecfdf5;border:1px solid #0f766e}.chg{border:2px solid #f59e0b;background:#fffbeb}.fig{font-size:22px;font-weight:800}.old{text-decoration:line-through;color:#888}.rank{background:linear-gradient(135deg,#14213d,#1e3a8a);color:#fff;box-shadow:none}.rank small{color:#cbd5e1}details.ask{margin-top:8px}details summary{cursor:pointer;font-size:13px;font-weight:600;min-height:32px}`;

/** v95 — the shopkeeper's page is written "हिन्दी / English". Hindi only (default), English only, or both — chosen with ?lang= and remembered. */
export type SpLang = 'hi' | 'en' | 'both';
export function pickLang(html: string, mode: SpLang): string {
  if (mode === 'both') return html;
  const parts = html.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>)/i);
  const dev = /[ऀ-ॿ]/;
  for (let i = 0; i < parts.length; i += 2) {
    const t = parts[i]; if (!t || !dev.test(t)) continue;
    const m = /\s\/\s(?=[A-Za-z0-9“"'(₹])/.exec(t); if (!m) continue;
    const a = t.slice(0, m.index), b = t.slice(m.index + m[0].length);
    if (!dev.test(a) || dev.test(b)) continue;     // only "हिन्दी / English"
    parts[i] = mode === 'hi' ? a : b;
  }
  return parts.join('');
}
const langOf = (req: Request): SpLang => { const q = String(req.query.lang || ''); if (q === 'hi' || q === 'en' || q === 'both') return q; const c = parseCookies(req.headers.cookie)['sp_lang']; return c === 'en' || c === 'both' ? c : 'hi'; };
const langBar = (cur: SpLang) => `<div class="lang" data-testid="sp-lang">${(['hi', 'en', 'both'] as const).map(l => `<a href="?lang=${l}" class="${l === cur ? 'on' : ''}">${l === 'hi' ? 'हिन्दी' : l === 'en' ? 'English' : 'दोनों'}</a>`).join('')}</div>`;

const shell = (title: string, body: string, head = '', js = '') => `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" type="image/png" href="/icon-192.png">${head}<title>${esc(title)}</title><style>${CSS}</style></head><body><div class="w">${body}</div>${js ? `<script src="${js}" defer></script>` : ''}</body></html>`;
const noStore = (res: Response) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); res.set('X-Robots-Tag', 'noindex, nofollow'); };
const formTs = () => { const t = Date.now(); return `${t}.${hmac('sp-form', String(t)).slice(0, 16)}`; };
const formTsOk = (v: unknown) => { const [t, sig] = String(v || '').split('.'); const n = Number(t); return Number.isFinite(n) && !!sig && safeEqual(sig, hmac('sp-form', String(n)).slice(0, 16)) && Date.now() - n > 2500 && Date.now() - n < 2 * 3600_000; };

// ───────────────────────────── /q/:code — the customer scans the QR ─────────────────────────────
export function createPartnerQrRouter() {
  const r = Router();
  const form = express.urlencoded({ extended: false, limit: '20kb' });
  const byCode = (code: string) => /^[A-Z2-9]{8}$/.test(String(code).toUpperCase()) ? st().shopPartners.find(p => p.qrCode === String(code).toUpperCase()) : undefined;
  const notLive = (res: Response, p?: ShopPartner) => res.status(p ? 200 : 404).send(shell('GENZ', `<div class="card"><p class="t"><b>${p?.status === 'PENDING' ? 'यह QR अभी चालू नहीं हुआ है।' : 'यह QR अभी अनुरोध नहीं ले रहा।'}</b></p><p class="t">${p?.status === 'PENDING' ? 'This QR is not active yet.' : 'This QR is not taking requests right now.'}</p></div>`));

  /** the homes on this broker's public page (his own + other brokers' that opened theirs to pages) — only when his page is ON */
  const homesOf = (b?: UserProfile) => (b && b.role === 'BROKER' && b.verificationStatus === 'VERIFIED' && b.publicCard?.enabled ? shownHomes(b) : []);
  const homeCards = (b: UserProfile, p: ShopPartner, homes: ReturnType<typeof shownHomes>) => {
    const wm = `${brandOf(b).displayName} · GENZ`;
    const one = (h: ReturnType<typeof shownHomes>[number]) => {
      const ph = pagePhotos(h)[0]; const rent = h.transactionType !== 'Sale'; const net = canShow(b, h) === 'NETWORK';
      return `<article class="hm" id="h-${esc(h.id)}"><div class="ph${ph ? '' : ' nophoto'}"><canvas width="640" height="400"${ph ? ` data-src="${esc(ph)}"` : ''} data-wm="${esc(wm)}" aria-label="${esc(h.title)}"></canvas><span class="np">📷 फ़ोटो जल्द / Photo coming soon</span></div>
<div class="bd"><div class="pr">${esc(priceShort(h.askingPrice))}${rent ? ' <small>/ माह</small>' : ''}</div><div class="tt">${esc(h.title)}</div><div class="sb">${esc(h.propertyType)} · ${esc(h.locality)}, ${esc(h.city)}</div>${net ? '<span class="net">GENZ नेटवर्क लिस्टिंग / GENZ network listing</span>' : ''}
<div class="row"><a class="btn g" href="/q/${esc(p.qrCode)}?home=${encodeURIComponent(h.id)}#form" data-testid="qr-interested">👍 मुझे पसंद है / I'm interested</a></div></div></article>`;
    };
    const first = homes.slice(0, 6); const rest = homes.slice(6);
    return `<h2 id="homes">मेरे पास ये प्रॉपर्टी हैं / Properties I can show you <small>(${homes.length})</small></h2><div class="hms">${first.map(one).join('')}</div>${rest.length ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:700;min-height:36px">और ${rest.length} घर / ${rest.length} more homes</summary><div class="hms">${rest.map(one).join('')}</div></details>` : ''}<p class="small" style="margin:8px 4px">🔒 पूरा पता और मालिक की जानकारी वेरिफ़ाइड विज़िट पर। / Exact address and owner details only on a verified visit.</p>`;
  };

  /** v84 — the home the customer chose stays in front of him ON the form: photo, price, title, place, and a way to change it (before, only a text line was left and he had to scroll back up to see the home again) */
  const pickedCard = (b: UserProfile, p: ShopPartner, h: ReturnType<typeof shownHomes>[number]) => {
    const ph = pagePhotos(h)[0]; const rent = h.transactionType !== 'Sale'; const wm = `${brandOf(b).displayName} · GENZ`;
    return `<article class="hm" data-testid="qr-picked-home" style="box-shadow:none;border:1px solid #86efac"><div class="ph${ph ? '' : ' nophoto'}"><canvas width="640" height="400"${ph ? ` data-src="${esc(ph)}"` : ''} data-wm="${esc(wm)}" aria-label="${esc(h.title)}"></canvas><span class="np">📷 फ़ोटो जल्द / Photo coming soon</span></div>
<div class="bd"><div class="small" style="font-weight:700;color:#166534">👍 आपने यह घर चुना है / You chose this home</div><div class="pr">${esc(priceShort(h.askingPrice))}${rent ? ' <small>/ माह</small>' : ''}</div><div class="tt">${esc(h.title)}</div><div class="sb">${esc(h.propertyType)} · ${esc(h.locality)}, ${esc(h.city)}</div>
<div class="row"><a class="btn l" href="/q/${esc(p.qrCode)}#homes" data-testid="qr-change-home">↩ दूसरा घर देखें / See other homes</a></div></div></article>`;
  };

  const page = (res: Response, p: ShopPartner, msg = '', keep: Record<string, string> = {}, wantQuery: Record<string, unknown> = {}) => {
    const b = userOf(p.brokerId);
    const homes = homesOf(b);
    const picked = homes.find(h => h.id === (keep.home || str(wantQuery.home, 40)));
    const want = str(wantQuery.want, 6);
    const preKind = keep.kind || (picked ? (picked.transactionType === 'Sale' ? 'BUY' : 'RENT_IN') : want === 'buy' ? 'BUY' : want === 'sell' ? 'SELL' : '');
    const sellerSide = preKind === 'SELL' || preKind === 'RENT_OUT';   // v89 — the big buttons above the form follow what was chosen (they used to stay "I need a home" green even for a seller)
    const kinds = LEAD_KINDS.map(k => `<label><input type="radio" name="kind" value="${k.id}" ${preKind === k.id ? 'checked' : ''} required> ${k.hi}<br><small>${k.en}</small></label>`).join('');
    const typeGroups: [string, string[]][] = [['🏠 घर / Homes', ['Residential Flat', 'Independent House', 'Residential Villa', 'Builder Floor', 'Penthouse', 'Farm House']], ['🌱 प्लॉट · ज़मीन / Plots & land', ['Residential Plot', 'Commercial Plot', 'Industrial Plot', 'Agricultural Land']], ['🏪 दुकान · ऑफ़िस / Commercial', ['Commercial Shop', 'Showroom', 'Commercial Office']], ['🏭 गोदाम · उद्योग / Industry', ['Warehouse / Godown']]];
    const who = b?.name || 'ब्रोकर';
    const ack = ackText(who, picked ? picked.title : 'ब्रोकर द्वारा दिखाई जाने वाली प्रॉपर्टी / the properties shown by the broker');
    res.send(shell('मकान / दुकान / प्लॉट — GENZ', `<div class="top"><h1>मकान · दुकान · प्लॉट · फ़ार्म · गोदाम</h1><p>किराया या ख़रीद-बिक्री — अपनी ज़रूरत लिखें · ${esc(p.shopName)}</p></div>
${msg ? `<div class="card warn"><p class="t">${msg}</p></div>` : ''}
<div class="card"><p class="t">${esc(who)}${b?.reraNumber ? ` · RERA ${esc(b.reraNumber)}` : ''} आपसे संपर्क करेंगे। <small>A GENZ-verified broker will call you.</small></p>
<div class="big2"><a class="btn ${sellerSide ? 'l' : 'g'}" href="/q/${esc(p.qrCode)}?want=buy#form" data-testid="qr-want-home" ${sellerSide ? '' : 'aria-current="true"'}>🏠 मुझे प्रॉपर्टी चाहिए<br><small${sellerSide ? '' : ' style="color:#e9ffe9"'}>I need a property (home · plot · shop · godown)</small></a><a class="btn ${sellerSide ? 'g' : 'l'}" href="/q/${esc(p.qrCode)}?want=sell#form" data-testid="qr-want-list" ${sellerSide ? 'aria-current="true"' : ''}>📋 मुझे अपनी प्रॉपर्टी देनी है<br><small${sellerSide ? ' style="color:#e9ffe9"' : ''}>I want to list my property</small></a></div></div>
${homes.length && b ? homeCards(b, p, homes) : ''}
<style>#form form:has(input[name=kind][value=SELL]:checked) #promise,#form form:has(input[name=kind][value=RENT_OUT]:checked) #promise{display:none}#sellnote{display:none}#form form:has(input[name=kind][value=SELL]:checked) #sellnote,#form form:has(input[name=kind][value=RENT_OUT]:checked) #sellnote{display:block}.kinds label{min-width:0}.w{padding-bottom:96px}</style>
<div class="card${picked ? ' pick' : ''}" id="form">${picked && b ? pickedCard(b, p, picked) : ''}
<form method="post" action="/q/${esc(p.qrCode)}"><input type="hidden" name="t" value="${formTs()}">${picked ? `<input type="hidden" name="home" value="${esc(picked.id)}">` : ''}<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<label>आपको क्या चाहिए? / What do you need?</label><div class="kinds">${kinds}</div>
<p class="small" id="sellnote" data-testid="qr-seller-note">🏠 मालिक के लिए: प्रॉपर्टी कहाँ है, किस तरह की है, और आप कितना चाहते हैं (कीमत / किराया) — नीचे लिखें। <small>For owners: write where the property is, its type, and the price or rent you expect.</small></p>
<label>नाम / Name</label><input type="text" name="name" maxlength="80" required value="${esc(keep.name || '')}" autocomplete="name">
<label>मोबाइल / Mobile</label><input type="tel" name="phone" inputmode="numeric" maxlength="14" required value="${esc(keep.phone || '')}" autocomplete="tel-national" placeholder="98XXXXXXXX">
<label>इलाका / Area</label><input type="text" name="locality" maxlength="80" required list="areas" autocomplete="off" value="${esc(keep.locality || (picked ? picked.locality : p.area))}"><datalist id="areas">${areasOf(p.city || 'Raipur').slice(0, 80).map(a => `<option value="${esc(a.replace(/\s*\(.*\)\s*/g, ''))}">`).join('')}</datalist><p class="small" style="margin:2px 0 0">पूरा शहर चाहिए तो शहर का नाम लिख दें / For the whole city just write the city name.</p>
<label>बजट / किराया (अंदाज़न) / Budget or rent</label><input type="text" name="budget" maxlength="60" value="${esc(keep.budget || '')}" placeholder="जैसे 40 लाख / 12,000 महीना">
<label>प्रॉपर्टी / Property type</label><select name="ptype"><option value="">— कोई भी / Any —</option>${typeGroups.map(([g, list]) => `<optgroup label="${g}">${list.map(x => `<option value="${x}" ${keep.ptype === x ? 'selected' : ''}>${x}</option>`).join('')}</optgroup>`).join('')}<option value="Other" ${keep.ptype === 'Other' ? 'selected' : ''}>कुछ और / Other</option></select>
<label>कुछ और / Anything else</label><textarea name="note" rows="2" maxlength="300">${esc(keep.note || '')}</textarea>
<div class="card warn" style="margin-top:12px" id="promise"><p class="t"><b>ख़रीदने या किराये पर लेने वालों के लिए · For buyers and renters</b></p><p class="t">${esc(ack.hi)}</p><p class="t"><small>${esc(ack.en)}</small></p>
<label class="ck"><input type="checkbox" name="direct" value="1" ${keep.direct === '1' ? 'checked' : ''}><span>मैं यह मानता/मानती हूँ। <small>I agree to this.</small></span></label>
<label>अपना नाम लिखकर हस्ताक्षर करें / Sign by typing your name</label><input type="text" name="sign" maxlength="80" value="${esc(keep.sign || '')}" autocomplete="off"><p class="small">यह आपकी सहमति का रिकॉर्ड है — GENZ आपसे कोई पैसा नहीं लेता। / This is a record of your agreement — GENZ takes no money from you.</p></div>
<label class="ck"><input type="checkbox" name="consent" value="1" required><span>मैं सहमत हूँ कि ${esc(who)} मुझसे इस ऐप की चैट में बात करें। मेरा नंबर ब्रोकर को तभी दिखेगा जब मैं अपनी ज़रूरत पक्की कर दूँ और मेरी ज़रूरत से मेल खाता घर शेयर हो; दुकान वाले को पूरा नंबर कभी नहीं दिखेगा। <small>I agree that this broker may talk to me in this app’s chat. My number is shown to him only after I confirm my need and a home matching it is shared; the shop never sees my full number.</small></span></label>
<label class="ck"><input type="checkbox" name="outcome" value="1" ${keep.outcome === '1' ? 'checked' : ''} data-testid="qr-outcome"><span>${esc(OUTCOME_CONSENT.hi)} <small>${esc(OUTCOME_CONSENT.en)}</small></span></label>
<div class="row"><button class="g" type="submit">भेजें / Send</button></div></form></div>
<p class="small" style="margin:12px 4px">GENZ आपसे कोई पैसा नहीं माँगता। कोई भी रकम देने से पहले कागज़ और RERA ज़रूर जाँचें। / GENZ never asks you for money.</p>${homes.length ? '<script src="/c/page.js" defer></script>' : ''}`));
  };

  // v82 — the customer's one-tap answer to "did it go ahead?" (the link came by SMS, which he agreed to on the QR page). GET only shows the question; POST records it.
  const askBy = (token: string) => /^[A-Za-z0-9_-]{20,40}$/.test(token) ? st().partnerLeads.find(l => l.ask && safeEqual(l.ask.hash, sha(token))) : undefined;
  const askLive = (l: PartnerLead) => !!l.ask && !l.ask.answer && Date.now() - Date.parse(l.ask.at) < ASK_LIMITS.validDays * 86400_000;
  const askPage = (res: Response, l: PartnerLead | undefined, tok: string, done = false) => {
    noStore(res);
    if (!l || !l.ask) return res.status(404).send(shell('GENZ', `<div class="card"><p class="t">यह लिंक मान्य नहीं है।<br><small>This link is not valid.</small></p></div>`));
    const who = userOf(l.brokerId)?.name || 'ब्रोकर';
    if (done || l.ask.answer) return res.send(shell('धन्यवाद — GENZ', `<div class="top"><h1>धन्यवाद 🙏</h1><p>Thank you</p></div><div class="card ok"><p class="t">आपका जवाब दर्ज हो गया।<br><small>Your answer has been recorded.</small></p></div>`));
    if (!askLive(l)) return res.status(410).send(shell('GENZ', `<div class="card"><p class="t">इस लिंक की मियाद ख़त्म हो चुकी है।<br><small>This link has expired.</small></p></div>`));
    res.send(shell('GENZ', `<div class="top"><h1>एक छोटा सवाल</h1><p>One quick question</p></div><div class="card"><p class="t">क्या <b>${esc(who)}</b> के साथ आपकी प्रॉपर्टी की बात आगे बढ़ी — यानी डील हुई?<br><small>Did your property matter go ahead with ${esc(who)} — was a deal done?</small></p>
<form method="post" action="/q/ok/${esc(tok)}"><div class="big2"><button class="g" type="submit" name="a" value="YES" data-testid="ok-yes">हाँ, हुई<br><small style="color:#e9ffe9">Yes</small></button><button class="l" type="submit" name="a" value="NO" data-testid="ok-no">नहीं हुई<br><small>No</small></button></div></form>
<p class="small">आपका जवाब सिर्फ़ “हाँ / नहीं” के रूप में दुकान वाले और GENZ को दिखेगा — आपका नाम या नंबर नहीं। GENZ आपसे कोई पैसा नहीं माँगता। / Only “yes / no” is shown to the shop and GENZ — never your name or number. GENZ never asks you for money.</p></div>`));
  };
  r.get('/ok/:token', rateLimit('sp-ok', 60, 3600_000), (req: Request, res: Response) => askPage(res, askBy(req.params.token), req.params.token));
  r.post('/ok/:token', rateLimit('sp-ok', 40, 3600_000), form, (req: Request, res: Response) => {
    const l = askBy(req.params.token);
    if (!l || !askLive(l)) return askPage(res, l, req.params.token);
    const a = String(req.body?.a || '') === 'YES' ? 'YES' : String(req.body?.a || '') === 'NO' ? 'NO' : '';
    if (!a) return askPage(res, l, req.params.token);
    l.ask = { ...l.ask!, answer: a, answeredAt: nowIso() };
    hist(l, 'CUSTOMER', `Customer answered the SMS: ${a === 'YES' ? 'it went ahead (deal done)' : 'it did not go ahead'}`);
    db.save();
    db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', l.id, 'SHOP_CUSTOMER_ANSWER', `Customer answered “${a}” to the one-tap question (${l.status === 'WON' ? 'deal is written' : 'no deal written'})`);
    const p = partnerOf(l.partnerId); if (p) tellShop(p, 'ग्राहक ने जवाब दिया', 'The customer answered', 'अपना पेज खोलकर देखें। / Open your page to see it.', `ans-${l.id}`);
    askPage(res, l, req.params.token, true);
  });

  r.get('/poster.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.send("(function(){var b=document.getElementById('pr');if(b)b.addEventListener('click',function(){window.print()})})();"); });

  /** v82 — the counter poster: A5 (default) or A4 (`?size=a4`), big QR, three steps, the broker's name and RERA. It never says "no fee": the broker's own brokerage still applies — only that GENZ takes no money from the customer. */
  r.get('/:code/poster', rateLimit('sp-poster', 60, 60_000), async (req: Request, res: Response) => {
    const p = byCode(req.params.code); if (!p || p.status === 'ENDED') return notLive(res, p);
    const b = userOf(p.brokerId);
    const a4 = String(req.query.size || '').toLowerCase() === 'a4';
    const url = `${req.protocol}://${req.get('host')}/q/${p.qrCode}`;
    const svg = await brandedQrSvg(url, 400);
    noStore(res);
    res.send(`<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>QR poster — ${esc(p.shopName)}</title>
<style>@page{size:${a4 ? 'A4' : 'A5'};margin:0}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#e5e7eb;color:#14213d}
.pg{width:${a4 ? '210mm' : '148mm'};min-height:${a4 ? '297mm' : '210mm'};margin:10px auto;background:#fff;text-align:center;display:flex;flex-direction:column;border-radius:6px;overflow:hidden}
.hd{background:#14213d;color:#fff;padding:${a4 ? '14mm 12mm 10mm' : '9mm 8mm 7mm'}}.hd h1{font-size:${a4 ? '46px' : '32px'};margin:0;letter-spacing:.5px}.hd .en{color:#cbd5e1;font-size:${a4 ? '17px' : '13px'};margin-top:3px}
.q{font-size:${a4 ? '28px' : '20px'};font-weight:800;margin:${a4 ? '12mm 10mm 2mm' : '7mm 8mm 1mm'};color:#b45309}.qe{font-size:${a4 ? '16px' : '12px'};color:#555}
.qr{width:${a4 ? '100mm' : '66mm'};margin:${a4 ? '8mm' : '4mm'} auto 2mm;padding:3mm;border:3px solid #14213d;border-radius:10px}.qr svg{width:100%;height:auto;display:block}
.steps{display:flex;justify-content:center;gap:${a4 ? '14px' : '8px'};margin:${a4 ? '8mm 8mm 0' : '3mm 5mm 0'}}.steps div{flex:1;background:#f3f4f6;border-radius:10px;padding:${a4 ? '10px' : '6px'};font-size:${a4 ? '16px' : '12px'};font-weight:700}.steps b{display:block;font-size:${a4 ? '26px' : '18px'};color:#1fa855}
.tr{margin:${a4 ? '8mm 12mm 0' : '4mm 8mm 0'};font-size:${a4 ? '15px' : '11px'};color:#374151}
.f{margin-top:auto;padding:${a4 ? '8mm 10mm' : '5mm 6mm'};border-top:2px dashed #cbd5e1;font-size:${a4 ? '15px' : '12px'};color:#333}.code{font-family:monospace;font-size:11px;color:#777}.p{margin:12px auto;text-align:center}@media print{body{background:#fff}.p{display:none}.pg{margin:0;border-radius:0}}</style></head>
<body><div class="p"><button id="pr" style="padding:10px 18px;font-size:15px;font-weight:700;border-radius:10px;border:0;background:#14213d;color:#fff">🖨 Print / PDF</button> <a href="?size=${a4 ? 'a5' : 'a4'}" style="margin-left:10px;font-size:14px">${a4 ? 'A5' : 'A4'}</a></div>
<div class="pg" data-testid="poster"><div class="hd"><h1>मकान · दुकान · प्लॉट</h1><div class="en">House · Shop · Plot</div></div>
<div class="q">किराये पर लेना-देना या ख़रीदना-बेचना है?</div><div class="qe">To rent, buy or sell a property?</div>
<div class="qr">${svg}</div><div class="qe">📱 फ़ोन के कैमरे से QR स्कैन करें / Scan with your phone camera</div>
<div class="steps"><div><b>1</b>QR स्कैन<br><small>Scan</small></div><div><b>2</b>ज़रूरत लिखें<br><small>Write your need</small></div><div><b>3</b>ब्रोकर का कॉल<br><small>The broker calls</small></div></div>
<div class="tr">GENZ आपसे कोई पैसा नहीं लेता। कोई भी रकम देने से पहले काग़ज़ और RERA ज़रूर जाँचें।<br>GENZ takes no money from you. Check the papers and RERA before you pay anything.</div>
<div class="f"><b>${esc(b?.name || '')}</b>${b?.reraNumber ? ` · RERA ${esc(b.reraNumber)}` : ''} · GENZ verified broker<br>${esc(p.shopName)}, ${esc(p.area)}<br><span class="code">${p.qrCode}</span></div></div>
<script src="/q/poster.js" defer></script></body></html>`);
  });


  // ───────── v85 — the customer's private chat with the broker (the link comes right after he sends the QR form; no signup, no number goes either way) ─────────
  const chatBy = (token: string) => /^[A-Za-z0-9_-]{20,40}$/.test(token) ? st().partnerLeads.find(l => l.chat && safeEqual(l.chat.keyHash, sha(token))) : undefined;
  const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  const askPending = (l: PartnerLead) => !!l.chat?.reqAskedAt && !l.chat.reqConfirmedAt;
  const chatPage = (res: Response, l: PartnerLead | undefined, tok: string, msg = '', status = 200) => {
    noStore(res);
    if (!l || !l.chat) return res.status(404).send(shell('GENZ', `<div class="card"><p class="t">यह लिंक मान्य नहीं है।<br><small>This link is not valid.</small></p></div>`));
    const b = userOf(l.brokerId); const who = b?.name || 'ब्रोकर';
    l.chat.customerSeenAt = nowIso(); db.save();
    const bubbles = l.chat.msgs.map(m => {
      const t = `<small style="color:#64748b">${hm(m.at)}</small>`;
      if (m.by === 'SYSTEM') return `<div class="bub sys">${esc(m.text)}</div>`;
      if (m.kind === 'HOME') return `<div class="bub br"><b>🏠 ${esc(m.title || '')}</b><br>${esc(m.price || '')} · ${esc(m.place || '')}${b?.publicCard?.enabled && b.referralCode && m.homeId ? `<br><a href="/c/${esc(b.referralCode)}#h-${esc(m.homeId)}" rel="noopener">देखें / View</a>` : ''}<br>${t}</div>`;
      if (m.kind === 'ASK') return `<div class="bub br ask"><b>✔ क्या आपकी ज़रूरत यही है?</b><br>${esc(m.text)}<br>${t}</div>`;
      return `<div class="bub ${m.by === 'CUSTOMER' ? 'me' : 'br'}">${esc(m.text)}<br>${t}</div>`;
    }).join('');
    const ask = askPending(l) ? `<div class="card pick" data-testid="chat-confirm"><p class="t"><b>${esc(who)} पूछ रहे हैं: क्या आपकी ज़रूरत यही है?</b><br><small>${esc(who)} asks: is this what you need?</small></p><p class="t">${esc(needLine(l))}</p>
<form method="post" action="/q/chat/${esc(tok)}/ans"><div class="big2"><button class="g" type="submit" name="a" value="YES" data-testid="chat-yes">✅ हाँ, सही है<br><small style="color:#e9ffe9">Yes, correct</small></button><button class="l" type="submit" name="a" value="EDIT" data-testid="chat-edit">✏️ बदलाव भेजें<br><small>Send a change</small></button></div>
<label>बदलाव (सिर्फ़ ✏️ के लिए) / Change (only for ✏️)</label><textarea name="text" rows="2" maxlength="${MSG_MAX}" placeholder="जैसे: बजट 50 लाख, 3BHK"></textarea></form></div>` : '';
    const done = l.chat.reqConfirmedAt && !l.chat.revealedAt ? `<div class="card ok"><p class="t">✔ आपकी ज़रूरत पक्की हो गई। ${esc(who)} अब आपके लिए मेल खाता घर ढूँढ रहे हैं।<br><small>Your need is confirmed. ${esc(who)} is now looking for a home that matches.</small></p></div>` : '';
    const showApp = l.chat.msgs.some(m => m.by === 'CUSTOMER' && m.kind !== 'INFO');   // offered once he has written / confirmed — not on the very first look
    const appCard = showApp ? `<div class="card app" id="app-card" style="display:none" data-testid="chat-app-card"><p class="t"><b id="app-title"></b></p><p class="small" id="app-sub"></p><div class="row"><button class="g" id="app-push" type="button" style="display:none">🔔 अलर्ट चालू करें / Turn alerts on</button><button class="l" id="app-later" type="button" style="display:none">बाद में / Later</button><button class="l" id="app-install" type="button" style="display:none">📲 होम स्क्रीन पर जोड़ें / Add to home screen</button></div><p class="small" id="app-ios" style="display:none">iPhone: Safari में नीचे “Share” → “Add to Home Screen”, फिर उस ऐप को खोलें। / On iPhone: Safari → Share → Add to Home Screen, then open that app.</p><p class="small" id="app-push-msg"></p></div>` : '';
    res.send(shell('GENZ चैट', `<style>.bub{max-width:85%;padding:8px 10px;border-radius:12px;font-size:14px;line-height:1.4;margin:6px 0;background:#fff;box-shadow:0 1px 1px #0002}.bub.me{margin-left:auto;background:#d9fdd3}.bub.sys{max-width:100%;text-align:center;background:#fef9c3;font-size:12px}.bub.ask{border:2px solid #86efac}.cb{background:#efeae2;border-radius:14px;padding:8px 10px;min-height:120px}</style>
<div class="top"><h1>${esc(who)}</h1><p>GENZ verified broker${b?.reraNumber ? ` · RERA ${esc(b.reraNumber)}` : ''} · ${esc(partnerOf(l.partnerId)?.shopName || '')}</p></div>
${msg ? `<div class="card warn"><p class="t">${msg}</p></div>` : ''}
<div class="cb" data-testid="chat-box">${bubbles}</div>${appCard}${ask}${done}
<div class="card"><form method="post" action="/q/chat/${esc(tok)}/msg"><label>संदेश / Message</label><textarea name="text" rows="2" maxlength="${MSG_MAX}" required placeholder="अपना सवाल या ज़रूरत लिखें…"></textarea><div class="row"><button class="g" type="submit" data-testid="chat-send">भेजें / Send</button><a class="btn l" href="/q/chat/${esc(tok)}">🔄 नया देखें / Refresh</a></div></form>
<p class="small" style="margin-top:8px">🔒 इस चैट में फ़ोन नंबर न लिखें। आपका नंबर ब्रोकर को तभी दिखेगा जब आप अपनी ज़रूरत पक्की कर दें और आपकी ज़रूरत से मेल खाता घर शेयर हो। इस पेज को बुकमार्क कर लें — जवाब देखने के लिए यही लिंक खोलें। GENZ आपसे कोई पैसा नहीं माँगता।<br>Do not type phone numbers here. Your number is shown to the broker only after you confirm your need and a matching home is shared. Bookmark this page — open this link to see replies. GENZ never asks you for money.</p></div>`, showApp ? `<link rel="manifest" href="/q/chat/${tok}/manifest.webmanifest"><meta name="theme-color" content="#14213d">` : '', showApp ? '/q/chat-app.js' : ''));
  };
  r.get('/chat-app.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.send(CHAT_JS); });
  r.get('/chat/:token/manifest.webmanifest', (req: Request, res: Response) => {
    const l = chatBy(req.params.token); if (!l) return res.status(404).end();
    const base = `/q/chat/${req.params.token}`; const who = userOf(l.brokerId)?.name || 'Broker';
    res.set({ 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.send(JSON.stringify({
      name: `GENZ — ${who}`.slice(0, 45), short_name: 'GENZ चैट', description: 'Your private chat with your broker',
      id: base, start_url: base, scope: '/q/chat/', display: 'standalone', orientation: 'portrait', background_color: '#ffffff', theme_color: '#14213d',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    }));
  });
  /** the customer's phone asks for alerts (no account: the private link is the key). Lock-screen words carry the broker's name only — never a message, a home or a number. */
  r.post('/chat/:token/push', rateLimit('sp-chatpushsub', 30, 3600_000), express.json({ limit: '4kb' }), (req: Request, res: Response) => {
    noStore(res);
    const l = chatBy(req.params.token); if (!l) return res.status(404).json({ success: false, error: 'This link is not valid.' });
    const endpoint = String(req.body?.endpoint || ''); const k = req.body?.keys || {};
    const p256dh = String(k.p256dh || ''); const auth = String(k.auth || '');
    if (!endpoint || endpoint.length > 1000 || p256dh.length < 80 || p256dh.length > 120 || auth.length < 16 || auth.length > 40) return res.status(400).json({ success: false, error: 'Unusable push address.' });
    if (!allowedEndpoint(endpoint)) return res.status(400).json({ success: false, error: 'This browser’s push service is not supported.' });
    const s = st(); const key = roomPushKey(`lc-${l.id}`); const id = sha(endpoint).slice(0, 32);
    const before = s.pushSubs.find(x => x.id === id && x.userId === key);
    s.pushSubs = s.pushSubs.filter(x => x.id !== id);
    const mine = s.pushSubs.filter(x => x.userId === key);
    if (mine.length >= 3) { const oldest = mine.sort((a, z) => a.createdAt.localeCompare(z.createdAt))[0]; s.pushSubs = s.pushSubs.filter(x => x.id !== oldest.id); }
    s.pushSubs.push({ id, userId: key, endpoint, p256dh, auth, ua: String(req.headers['user-agent'] || '').slice(0, 120), createdAt: before?.createdAt || nowIso(), lastOkAt: before?.lastOkAt, fails: 0, url: `/q/chat/${req.params.token}` });
    if (!before) { hist(l, 'CUSTOMER', 'Turned on chat alerts on his phone'); }
    db.save();
    res.json({ success: true, fresh: !before });
  });
  r.get('/chat/:token', rateLimit('sp-chat', 120, 3600_000), (req: Request, res: Response) => chatPage(res, chatBy(req.params.token), req.params.token));
  r.post('/chat/:token/msg', rateLimit('sp-chat', 120, 3600_000), form, (req: Request, res: Response) => {
    const l = chatBy(req.params.token); if (!l?.chat) return chatPage(res, undefined, req.params.token);
    const text = str(req.body?.text, MSG_MAX);
    if (text.length < 1) return chatPage(res, l, req.params.token, 'कुछ लिखें। / Write something.');
    if (containsPhone(text)) return chatPage(res, l, req.params.token, `${esc(PHONE_IN_CHAT_MSG.hi)}<br><small>${esc(PHONE_IN_CHAT_MSG.en)}</small>`);
    if (hit(`sp-chatmsg:${l.id}`, 40, 3600_000) > 0) return chatPage(res, l, req.params.token, 'बहुत संदेश हो गए — थोड़ी देर बाद। / Too many messages — try later.');
    addMsg(l, { by: 'CUSTOMER', kind: 'MSG', text }); db.save();
    if (hit(`sp-chatpush:${l.id}`, 1, 300_000) === 0) void pushTo(l.brokerId, { kind: 'matches', title: `${l.name} wrote in the chat`, body: text.slice(0, 80), url: '/?tab=partners' });
    res.redirect(303, `/q/chat/${req.params.token}`);
  });
  r.post('/chat/:token/ans', rateLimit('sp-chat', 120, 3600_000), form, (req: Request, res: Response) => {
    const l = chatBy(req.params.token); if (!l?.chat) return chatPage(res, undefined, req.params.token);
    if (!askPending(l)) return res.redirect(303, `/q/chat/${req.params.token}`);
    const a = String(req.body?.a || '');
    if (a === 'YES') {
      l.chat.reqConfirmedAt = nowIso(); l.chat.reqText = needLine(l);
      addMsg(l, { by: 'CUSTOMER', kind: 'ANSWER', text: '✅ हाँ, मेरी ज़रूरत सही है।' });
      hist(l, 'CUSTOMER', 'Confirmed his need in the chat');
      db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', l.id, 'SHOP_LEAD_NEED_CONFIRMED', 'The customer confirmed his need in the in-app chat (number still hidden from the broker)');
      if (ownerSide(l)) revealNumber(l, {});   // an owner has no "matching home": confirming the property details is the step
      db.save();
      void pushTo(l.brokerId, { kind: 'matches', title: `${l.name} confirmed his need`, body: ownerSide(l) ? 'His number is now visible.' : 'Share a matching home to see his number.', url: '/?tab=partners' });
    } else if (a === 'EDIT') {
      const text = str(req.body?.text, MSG_MAX);
      if (text.length < 2) return chatPage(res, l, req.params.token, 'बदलाव लिखें। / Write the change.');
      if (containsPhone(text)) return chatPage(res, l, req.params.token, `${esc(PHONE_IN_CHAT_MSG.hi)}<br><small>${esc(PHONE_IN_CHAT_MSG.en)}</small>`);
      addMsg(l, { by: 'CUSTOMER', kind: 'ANSWER', text: `✏️ ${text}` }); l.chat.reqAskedAt = undefined; db.save();   // the broker asks again with the corrected need
      if (hit(`sp-chatpush:${l.id}`, 1, 300_000) === 0) void pushTo(l.brokerId, { kind: 'matches', title: `${l.name} changed his need`, body: text.slice(0, 80), url: '/?tab=partners' });
    }
    res.redirect(303, `/q/chat/${req.params.token}`);
  });

  r.get('/:code', rateLimit('sp-view', 90, 60_000), (req: Request, res: Response) => {
    noStore(res);
    const p = byCode(req.params.code); if (!p || p.status !== 'ACTIVE') return notLive(res, p);
    p.scans += 1; p.lastScanAt = nowIso(); db.save();
    page(res, p, '', {}, req.query as Record<string, unknown>);
  });

  r.post('/:code', rateLimit('sp-lead-ip', 20, 3600_000), form, (req: Request, res: Response) => {
    noStore(res);
    const p = byCode(req.params.code); if (!p || p.status !== 'ACTIVE') return notLive(res, p);
    const body = req.body || {};
    const keep = { kind: str(body.kind, 10), name: str(body.name, 80), phone: str(body.phone, 14), locality: canonPlace(p.city || 'Raipur', str(body.locality, 80)), budget: str(body.budget, 60), ptype: str(body.ptype, 30), note: str(body.note, 300), home: str(body.home, 40), sign: str(body.sign, 80), direct: body.direct === '1' ? '1' : '', outcome: body.outcome === '1' ? '1' : '' };
    if (str(body.website, 50)) return res.redirect(303, `/q/${p.qrCode}/thanks`); // a bot filled the hidden field
    if (!formTsOk(body.t)) return page(res, p, 'कृपया फ़ॉर्म दोबारा भरें। / Please fill the form again.', keep);
    const kind = LEAD_KINDS.find(k => k.id === keep.kind)?.id as LeadKind | undefined;
    if (!kind) return page(res, p, 'बताएँ कि आपको क्या चाहिए। / Choose what you need.', keep);
    const phone = phone10(keep.phone);
    if (keep.name.length < 2) return page(res, p, 'अपना नाम लिखें। / Write your name.', keep);
    if (!PHONE_RE.test(phone)) return page(res, p, 'सही 10 अंकों का मोबाइल नंबर लिखें। / Write a valid 10-digit mobile number.', keep);
    if (keep.locality.length < 2) return page(res, p, 'इलाका लिखें। / Write the area.', keep);
    if (body.consent !== '1') return page(res, p, 'सहमति वाले बॉक्स पर टिक करें। / Tick the consent box.', keep);
    // v64 — a buyer / renter ticks and signs the "no direct deal" promise (the wording is versioned, like the visit acknowledgement)
    const buyerSide = kind === 'BUY' || kind === 'RENT_IN';
    if (buyerSide && (keep.direct !== '1' || keep.sign.length < 2)) return page(res, p, 'ख़रीदने / किराये पर लेने के लिए “सीधा सौदा नहीं” पर टिक करें और अपना नाम लिखकर हस्ताक्षर करें। / To continue, tick the “no direct deal” promise and sign with your name.', keep);
    const broker = userOf(p.brokerId);
    const home = keep.home ? homesOf(broker).find(h => h.id === keep.home) : undefined; // only a home really on this broker's page counts
    if (hit(`sp-qr:${p.id}`, L.leadsPerQrPerDay, 86400_000) > 0) return page(res, p, 'आज इस QR पर बहुत अनुरोध आ चुके — कल फिर कोशिश करें। / Too many requests on this QR today.', keep);
    if (hit(`sp-ph:${p.id}:${phone}`, 3, 86400_000) > 0) return res.redirect(303, `/q/${p.qrCode}/thanks`);
    const blocked = partyBlock(phone, kind === 'SELL' || kind === 'RENT_OUT' ? 'owner' : 'buyer');
    if (blocked) return page(res, p, 'इस नंबर से अभी अनुरोध नहीं लिया जा सकता। / A request from this number cannot be taken right now.', keep);
    const s = st(); const now = nowIso();
    // the same mobile already with this broker (any of his shops) while that lead is protected → the first shop keeps it
    // v89 — a buyer / renter and an owner are two different leads: a mobile that came as a buyer and now comes to sell is NOT swallowed by the first one
    const side = (k: string) => (k === 'BUY' || k === 'RENT_IN') ? 'B' : 'O';
    const prior = s.partnerLeads.find(l => l.brokerId === p.brokerId && l.phone === phone && locked(l) && l.status !== 'WON' && side(l.kind) === side(kind));
    if (prior) {
      const same = norm(prior.name) === norm(keep.name);
      hist(prior, 'CUSTOMER', `Scanned again${prior.partnerId === p.id ? '' : ' at another shop'} — new details (not checked, the first ones stay): ${same ? '' : `name “${keep.name}”, `}${LEAD_KINDS.find(k => k.id === kind)!.en}, ${keep.locality}${keep.budget ? `, budget ${keep.budget}` : ''}${keep.note ? `, “${keep.note.slice(0, 80)}”` : ''}`);
      db.save();
      if (hit(`sp-rescan:${prior.id}`, 1, 3600_000) === 0) void pushTo(p.brokerId, { kind: 'matches', title: `${prior.name} scanned again`, body: `New details came in${same ? '' : ` under the name “${keep.name}”`} — see the lead history.`, url: '/?tab=partners' });
      return res.redirect(303, `/q/${p.qrCode}/thanks?again=1`);
    }
    const lockUntil = new Date(Date.now() + p.terms.lockDays * 86400_000).toISOString();
    const chatToken = newToken();
    const lead: PartnerLead = {
      id: rid('PLD'), partnerId: p.id, brokerId: p.brokerId, kind, name: keep.name, phone, phoneLast4: phone.slice(-4),
      locality: keep.locality, budget: keep.budget || undefined, propertyType: keep.ptype || undefined, note: keep.note || undefined, consentAt: now,
      termsVersion: p.termsVersion, terms: cleanTerms(p.terms), lockUntil, status: 'NEW', history: [], createdAt: now, updatedAt: now,
      ...(keep.outcome === '1' ? { outcomeOk: true } : {}),
      chat: { keyHash: sha(chatToken), msgs: [] },
      ...(home ? { homeId: home.id, homeTitle: home.title.slice(0, 120), homeOwn: home.listingBrokerId === p.brokerId } : {}),
      ...(buyerSide ? (() => { const a = ackText(broker?.name || 'broker', home ? home.title : 'the properties shown by the broker'); return { promise: { at: now, signName: keep.sign, version: ACK_VERSION, text: a.en } }; })() : {}),
    };
    hist(lead, 'CUSTOMER', `Came in by scanning the QR at ${p.shopName} (consent recorded${lead.outcomeOk ? '; agreed to one SMS asking whether it went ahead' : ''})${home ? ` · interested in “${home.title}”${lead.homeOwn ? '' : ' (another GENZ broker’s listing)'}` : ''}`);
    if (lead.promise) hist(lead, 'CUSTOMER', `Agreed “no direct deal” (wording ${ACK_VERSION}) and signed as “${lead.promise.signName}”`);
    // v85 — the number is hidden: the buyer / renter lands in the broker's client list only when it is shown (after the need is confirmed and a matching home is shared)
    addMsg(lead, { by: 'SYSTEM', kind: 'INFO', text: `आपकी ज़रूरत: ${needLine(lead)}${lead.homeTitle ? ` · पसंद आया: ${lead.homeTitle}` : ''}` });
    s.partnerLeads.unshift(lead);
    hist(p, 'CUSTOMER', `New ${LEAD_KINDS.find(k => k.id === kind)!.en.toLowerCase()} lead (••${lead.phoneLast4})`);
    db.save();
    db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', lead.id, 'SHOP_QR_LEAD', `Lead from shop QR ${p.id} (consent recorded${lead.promise ? `; no-direct-deal promise ${ACK_VERSION}` : ''}${home ? `; home ${home.id}` : ''})`);
    void pushTo(p.brokerId, { kind: 'matches', title: `New lead from ${p.shopName}`, body: `${keep.name} — ${LEAD_KINDS.find(k => k.id === kind)!.en}, ${keep.locality}${home ? ` · ${home.title}` : ''}. Chat with him in the app — his number shows after he confirms his need and you share a matching home.`, url: '/?tab=partners' });
    res.redirect(303, `/q/chat/${chatToken}`);
  });

  r.get('/:code/thanks', (req: Request, res: Response) => {
    noStore(res);
    const p = byCode(req.params.code); if (!p) return notLive(res);
    const b = userOf(p.brokerId);
    const again = req.query.again === '1';
    res.send(shell('धन्यवाद — GENZ', `<div class="top"><h1>धन्यवाद 🙏</h1><p>Thank you</p></div><div class="card ok"><p class="t"><b>${esc(b?.name || 'ब्रोकर')}</b> आपसे जल्द संपर्क करेंगे।</p><p class="t">${esc(b?.name || 'The broker')} will contact you soon.</p></div>${again ? `<div class="card" data-testid="qr-again"><p class="t">ℹ️ यह मोबाइल नंबर पहले से इस ब्रोकर के पास दर्ज है। आपकी नई जानकारी उन्हें भेज दी गई है — पहले वाला नाम और ज़रूरत वैसी ही रहेगी।</p><p class="t"><small>This mobile number is already with this broker. Your new details were passed on — the first name and need stay as they were. To talk to him, open the chat link you got the first time (bookmark / home-screen icon). A new request for something different (for example, selling after buying) is taken as a separate one.</small></p></div>` : ''}`));
  });
  return r;
}

// ───────────────────────────── /sp/:token — the shopkeeper's own page ─────────────────────────────
const SP_COOKIE = 'genz_sp';
const spSig = (p: ShopPartner, dev: string, exp: number) => hmac('sp-sess', `${p.id}|${p.sessVersion}|${dev}|${exp}`);
const spCookie = (req: Request, p: ShopPartner) => {
  const raw = parseCookies(req.headers.cookie)[`${SP_COOKIE}_${p.id}`]; if (!raw) return null;
  const [dev, exp, sig] = raw.split('.'); const e = Number(exp);
  if (!dev || !/^[a-f0-9]{12}$/.test(dev) || !Number.isFinite(e) || !sig || !safeEqual(sig, spSig(p, dev, e))) return null;
  return { dev, exp: e };
};
const spKnown = (req: Request, p: ShopPartner) => { const c = spCookie(req, p); return c && (p.devices || []).some(d => d.id === c.dev) ? c.dev : null; };
const spSession = (req: Request, p: ShopPartner) => { const c = spCookie(req, p); return c && c.exp > Date.now() && (p.devices || []).some(d => d.id === c.dev) ? c.dev : null; };
function spSet(req: Request, res: Response, p: ShopPartner, dev: string) {
  const exp = Date.now() + L.sessionDays * 86400_000;
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  res.append('Set-Cookie', `${SP_COOKIE}_${p.id}=${dev}.${exp}.${spSig(p, dev, exp)}; Path=/sp; HttpOnly; SameSite=Lax; Max-Age=${365 * 86400}${secure ? '; Secure' : ''}`);
}
const devLabel = (ua: unknown) => { const u = String(ua || ''); return `${/iPhone|iPad/i.test(u) ? 'iPhone' : /Android/i.test(u) ? 'Android' : 'Phone'} · ${/CriOS|Chrome/i.test(u) ? 'Chrome' : /Safari/i.test(u) ? 'Safari' : 'browser'}`; };

/** the shop page as an app (served as /sp/app.js — public pages allow only same-origin scripts): service worker, "add to home", alerts */
const SP_JS = `(function(){var TOK=(location.pathname.split('/')[2]||'');function $(i){return document.getElementById(i)}
var sw=null;if('serviceWorker' in navigator&&TOK&&$('app-card')){navigator.serviceWorker.register('/sw.js').then(function(r){sw=r;setup()}).catch(function(){setup()})}else{setup()}
var dip=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();dip=e;var b=$('app-install');if(b&&standalone()===false)b.style.display='inline-block'});
function standalone(){return window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
var IOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
function show(st){var c=$('app-card');if(!c)return;c.style.display='block';c.setAttribute('data-alerts',st);
var t=$('app-title'),s2=$('app-sub'),bp=$('app-push'),bl=$('app-later'),ih=$('app-ios'),bi=$('app-install');
var on=st==='on';c.style.background=on?'#f0fdf4':'#ecfdf5';c.style.borderColor=on?'#86efac':'#0f766e';
if(bp)bp.style.display=st==='ask'?'inline-block':'none';if(bl)bl.style.display=st==='ask'?'inline-block':'none';
if(ih)ih.style.display=st==='ios'?'block':'none';if(bi&&(on||st==='ios'||standalone())&&!dip)bi.style.display='none';
if(st==='on'){t.textContent='🔔 अलर्ट चालू हैं ✔ / Alerts are on';s2.textContent='लीड आगे बढ़ने, हिस्सा बदलने या पैसा भेजे जाने पर इस फ़ोन पर अलर्ट आएगा। / You will be alerted here when a lead moves, your share changes or money is sent.'}
else if(st==='ios'){t.textContent='🔔 iPhone पर अलर्ट के लिए पहले होम स्क्रीन पर जोड़ें / On iPhone, add this to your home screen first';s2.textContent='iPhone में अलर्ट सिर्फ़ होम स्क्रीन वाले ऐप में आते हैं (iOS 16.4+)। / On iPhone, alerts work only in the home-screen app (iOS 16.4 or newer).'}
else if(st==='denied'){t.textContent='🔕 अलर्ट रुके हुए हैं / Alerts are blocked';s2.textContent='फ़ोन की सेटिंग → ब्राउज़र/ऐप → Notifications में “Allow” करें, फिर यह पेज दोबारा खोलें। / Allow notifications for this page in the phone settings, then open it again.'}
else if(st==='none'){t.textContent='🔕 इस ब्राउज़र में अलर्ट नहीं चलते / Alerts do not work in this browser';s2.textContent='Chrome (Android) या Safari-होम-स्क्रीन ऐप (iPhone) में खोलें। / Open this page in Chrome (Android) or the Safari home-screen app (iPhone).'}
else{t.textContent='🔔 लीड और हिस्से की ख़बर सीधे फ़ोन पर पाएँ / Get lead and share news on your phone';s2.textContent='एक बार नीचे का बटन दबाएँ — पेज बार-बार खोलना नहीं पड़ेगा। / Tap once — no need to open this page again and again.'}
}
function setup(){var c=$('app-card');if(!c)return;
var bi=$('app-install');if(bi)bi.addEventListener('click',function(){if(dip){dip.prompt();dip=null;bi.style.display='none'}});
var bp=$('app-push');if(bp)bp.addEventListener('click',function(){reg(false)});
var bl=$('app-later');if(bl)bl.addEventListener('click',function(){try{localStorage.setItem('sp_later_'+TOK,String(Date.now()))}catch(e){}c.style.display='none'});
var can='Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator;
if(IOS&&!standalone()){show('ios');return}
if(!can){show('none');return}
if(Notification.permission==='denied'){show('denied');return}
if(Notification.permission==='granted'){reg(true);return}
var later=0;try{later=Number(localStorage.getItem('sp_later_'+TOK))||0}catch(e){}
if(later&&Date.now()-later<86400000){return}
show('ask')}
function b64(s){var p='='.repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o}
function say(m){var e=$('app-push-msg');if(e)e.textContent=m||''}
function reg(quiet){say('');var fail=function(m){if(!quiet){say(m);show(Notification.permission==='denied'?'denied':'ask')}};
var ready=Promise.race([navigator.serviceWorker.ready,new Promise(function(_,no){setTimeout(function(){no(new Error('sw'))},7000)})]);
ready.then(function(r){return Notification.requestPermission().then(function(p){if(p==='denied'){show('denied');return}if(p!=='granted'){fail('अलर्ट के लिए “Allow” दबाएँ। / Please tap “Allow” to get alerts.');return}
return fetch('/api/push/key').then(function(x){return x.json()}).then(function(k){if(!k.publicKey){fail('अलर्ट अभी इस सर्वर पर चालू नहीं हैं — ब्रोकर को बताएँ। / Alerts are not switched on for this server — tell your broker.');return}
return r.pushManager.getSubscription().then(function(sub){return sub||r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(k.publicKey)})}).then(function(sub){var j=sub.toJSON();return fetch('/sp/'+TOK+'/push',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})}).then(function(x){if(x.ok){show('on')}else{fail('अलर्ट चालू नहीं हो पाए — दोबारा कोशिश करें। / Could not turn alerts on — try again.')}})})})})}).catch(function(){fail('इस फ़ोन पर अलर्ट नहीं चल पाए — दोबारा कोशिश करें। / Could not turn alerts on here — try again.')})}
})();`;

/** v85 — the customer's chat page as an app (served as /q/chat-app.js): the same "add to home" + alerts card as the shop page, pointed at his chat link */
const CHAT_JS = SP_JS
  .replace("(location.pathname.split('/')[2]||'')", "(location.pathname.split('/')[3]||'')")
  .replace("fetch('/sp/'+TOK+'/push'", "fetch('/q/chat/'+TOK+'/push'")
  .replace('🔔 लीड और हिस्से की ख़बर सीधे फ़ोन पर पाएँ / Get lead and share news on your phone', '🔔 ब्रोकर का जवाब सीधे फ़ोन पर पाएँ / Get your broker’s reply on your phone')
  .replace('लीड आगे बढ़ने, हिस्सा बदलने या पैसा भेजे जाने पर इस फ़ोन पर अलर्ट आएगा। / You will be alerted here when a lead moves, your share changes or money is sent.', 'ब्रोकर का संदेश या घर आते ही इस फ़ोन पर अलर्ट आएगा — लिंक बार-बार नहीं खोलना पड़ेगा। / You will be alerted here when your broker writes or shares a home — no need to keep opening the link.')
  .replace('एक बार नीचे का बटन दबाएँ — पेज बार-बार खोलना नहीं पड़ेगा। / Tap once — no need to open this page again and again.', 'एक बार नीचे का बटन दबाएँ — चैट बार-बार खोलनी नहीं पड़ेगी। / Tap once — no need to keep opening the chat.');

export function createPartnerPageRouter() {
  const r = Router();
  r.get('/app.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.send(SP_JS); });
  const form = express.urlencoded({ extended: false, limit: '10kb' });
  const find = (token: string) => { if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return undefined; const h = sha(token); return st().shopPartners.find(p => safeEqual(p.tokenHash, h)); };
  const gone = (res: Response) => res.status(404).send(shell('Link not valid', `<div class="card"><p class="t">यह लिंक मान्य नहीं है। अपने ब्रोकर से नया लिंक माँगें।<br><small>This link is not valid. Ask the broker for a new one.</small></p></div>`));
  const ping = (p: ShopPartner, title: string, body: string) => void pushTo(p.brokerId, { kind: 'deals', title, body, url: '/?tab=partners' });

  const gate = (res: Response, p: ShopPartner, tok: string, msg = '', step: 'phone' | 'code' = 'phone', status = 200) => {
    const b = userOf(p.brokerId);
    res.status(status).send(shell('QR पार्टनर', `<div class="top"><h1>${esc(p.shopName)} · QR पार्टनर</h1><p>${esc(b?.name || '')} के साथ · GENZ Broker Network</p></div>
${msg ? `<div class="card warn"><p class="t">${msg}</p></div>` : ''}
<div class="card">${step === 'phone' ? `<p class="t">अपना मोबाइल नंबर डालें — एक कोड मिलेगा। <small>Enter your mobile number to get a code.</small></p>
<form method="post" action="/sp/${esc(tok)}/otp"><label>मोबाइल / Mobile</label><input type="tel" name="phone" inputmode="numeric" maxlength="14" required placeholder="98XXXXXXXX"><div class="row"><button class="g" type="submit">कोड भेजें / Send code</button></div></form>`
      : `<p class="t">${smsOn() ? 'SMS में आया 6 अंकों का कोड डालें।' : 'ब्रोकर आपको 6 अंकों का कोड बताएँगे — वह यहाँ डालें।'} <small>${smsOn() ? 'Enter the code sent by SMS.' : 'The broker will tell you a 6-digit code.'}</small></p>
<form method="post" action="/sp/${esc(tok)}/verify"><label>कोड / Code</label><input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"><div class="row"><button class="g" type="submit">खोलें / Open</button></div></form>`}</div>`));
  };

  /** run the late-payment rules and the share watch before the shop looks (serverless hosts may never run the hourly timer) */
  const fresh = (p: ShopPartner) => { try { lazySweep(); watchShares({ partnerId: p.id }); } catch (e: any) { console.error('[SHOP] page refresh failed:', e?.message || e); } };
  const payModeHi = (m?: string) => PAY_MODES.find(x => x.id === m)?.hi || 'UPI';

  /** "ask": the broker (always) and the customer (only if he agreed on the QR page and SMS is on) */
  const askBox = (l: PartnerLead, tok: string) => {
    const a = l.ask; const can = !!l.outcomeOk && smsOn() && (locked(l) || !!l.won);
    const wait = !!a && (a.n >= ASK_LIMITS.perLead || Date.now() - Date.parse(a.at) < ASK_LIMITS.gapHours * 3600_000);
    const cust = !can && !a?.answer ? ''
      : a?.answer ? `<p class="small" data-testid="customer-answer">ग्राहक का जवाब: <b>${a.answer === 'YES' ? 'हाँ, बात आगे बढ़ी' : 'नहीं, बात आगे नहीं बढ़ी'}</b> (${when(a.answeredAt)}) · Customer says: ${a.answer === 'YES' ? 'it went ahead' : 'it did not go ahead'}</p>`
      : wait ? `<p class="small">ग्राहक से पूछा जा चुका है (${when(a!.at)}) — जवाब आने पर यहाँ दिखेगा। / The customer has been asked — the answer shows here.</p>`
      : `<form method="post" action="/sp/${tok}/lead/${esc(l.id)}/ask-customer"><button class="l" type="submit" data-testid="ask-customer">📲 ग्राहक से पूछें / Ask the customer</button><p class="small">ग्राहक को एक SMS जाएगा — उसने QR पर इसकी अनुमति दी है। आपको उसका नंबर नहीं दिखेगा। / One SMS goes to the customer (he agreed on the QR page). You do not see his number.</p></form>`;
    return `<details class="ask"><summary>💬 पूछें / Ask</summary><form method="post" action="/sp/${tok}/lead/${esc(l.id)}/ask-broker"><label>ब्रोकर से पूछें / Ask the broker</label><input type="text" name="note" maxlength="300" required placeholder="जैसे: यह हिस्सा कैसे निकला? / e.g. how was this worked out?"><div class="row"><button type="submit" data-testid="ask-broker">भेजें / Send</button></div></form>${cust}</details>`;
  };
  /** one change of the shop's share: old → new, why, and the shop's answer (OK / not right → GENZ desk) */
  const chgCard = (l: PartnerLead, c: ShareChange, tok: string) => {
    const kind = LEAD_KINDS.find(k => k.id === l.kind)!; const by = SHARE_CHANGE_LABEL[c.by];
    return `<div class="card chg" data-testid="share-change"><p class="t"><b>⚠ आपका हिस्सा बदला है / Your share changed</b><br><small>${kind.hi} · ${esc(l.locality)} · ••${esc(l.phoneLast4)}</small></p>
<p class="t">${c.from > 0 ? `<span class="old">${inr(c.from)}</span> → ` : ''}<b class="fig">${inr(c.to)}</b></p>
<p class="small"><span>${esc(by.hi)} / ${esc(by.en)}</span>${c.reason ? ` — “${esc(c.reason)}”` : ''} · ${when(c.at)}</p>
${c.brokerNote ? `<p class="small"><span>ब्रोकर का जवाब / Broker’s reply:</span> ${esc(c.brokerNote)}</p>` : ''}
${c.status === 'PENDING' ? `<div class="row"><form method="post" action="/sp/${tok}/lead/${esc(l.id)}/change/${esc(c.id)}/ok"><button class="g" type="submit" data-testid="change-ok">✔ ठीक है / It is fine</button></form></div>
<details><summary>✖ सही नहीं है / This is not right</summary><form method="post" action="/sp/${tok}/lead/${esc(l.id)}/change/${esc(c.id)}/no"><input type="text" name="note" maxlength="300" required placeholder="क्या सही नहीं? / What is not right?"><div class="row"><button class="r" type="submit" data-testid="change-no">GENZ को बताएँ / Tell GENZ</button></div></form></details>`
  : c.status === 'OK' ? `<p class="small">✔ आपने मान लिया (${when(c.answeredAt)})</p>`
  : `<p class="small">✖ आपने कहा सही नहीं — GENZ डेस्क देख रहा है (${when(c.answeredAt)})${c.note ? `: ${esc(c.note)}` : ''}</p>`}
${askBox(l, tok)}</div>`;
  };

  const render = (req: Request, res: Response, p: ShopPartner, msg = '') => {
    const b = userOf(p.brokerId); const tok = esc(req.params.token);
    const leads = st().partnerLeads.filter(l => l.partnerId === p.id).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
    const due = leads.filter(l => l.payout && ['DUE', 'NOT_RECEIVED'].includes(l.payout.status)).reduce((n, l) => n + (l.won?.amount || 0), 0);
    const got = leads.filter(l => l.payout?.status === 'RECEIVED').reduce((n, l) => n + (l.won?.amount || 0), 0);
    const onWay = leads.filter(l => l.payout?.status === 'PAID').reduce((n, l) => n + (l.won?.amount || 0), 0);
    const month = Date.now() - 30 * 86400_000;
    const inMonth = (x: ShopPartner) => st().partnerLeads.filter(l => l.partnerId === x.id && Date.parse(l.createdAt) >= month).length;
    const mates = st().shopPartners.filter(x => x.status === 'ACTIVE' && x.city === p.city);
    const mine30 = inMonth(p);
    const rank = p.status === 'ACTIVE' && mates.length >= 3 && mine30 > 0 ? 1 + mates.filter(x => inMonth(x) > mine30).length : 0;
    const rec = payRecord(st().partnerLeads.filter(l => l.brokerId === p.brokerId));
    const recText = payRecordText(rec, true);
    const agree = p.status === 'PENDING'
      ? `<div class="card warn"><p class="t"><b>शर्तें / Terms</b></p><p class="t">${esc(termsText(p.terms, true))}</p><p class="small">${esc(termsText(p.terms))}. हिस्सा ब्रोकर सीधे आपको देंगे — GENZ पैसा नहीं रखता। / The broker pays you directly; GENZ holds no money.</p>
<form method="post" action="/sp/${tok}/accept"><label class="ck"><input type="checkbox" name="ok" value="1" required><span>मैं इन शर्तों से सहमत हूँ और ब्रोकर का QR अपनी दुकान पर रखूँगा। / I agree to these terms and will keep the broker's QR at my shop.</span></label><div class="row"><button class="g" type="submit">मंज़ूर / Accept</button></div></form></div>`
      : p.pending ? `<div class="card warn"><p class="t"><b>ब्रोकर ने शर्त बदलने को कहा है / The broker proposes a change</b></p><p class="t">अभी: ${esc(termsText(p.terms, true))}</p><p class="t">नई: <b>${esc(termsText(p.pending.terms, true))}</b></p>${p.pending.note ? `<p class="small">${esc(p.pending.note)}</p>` : ''}<p class="small">मंज़ूर करने पर नई शर्त सिर्फ़ आगे आने वाली लीड पर लगेगी। / Applies only to leads after you accept.</p>
<div class="row"><form method="post" action="/sp/${tok}/change/accept"><button class="g" type="submit">मंज़ूर / Accept</button></form><form method="post" action="/sp/${tok}/change/decline"><button class="l" type="submit">नहीं / Decline</button></form></div></div>`
      : `<div class="card"><p class="t"><b>आपकी शर्तें / Your terms</b> (v${p.termsVersion})</p><p class="t">${esc(termsText(p.terms, true))}</p><p class="small">${p.status === 'PAUSED' ? 'QR अभी रुका हुआ है। / The QR is paused.' : p.status === 'ENDED' ? 'साझेदारी ख़त्म — पुरानी लीड पर हिस्सा पहले की तरह। / Partnership ended — earlier leads keep their terms.' : 'QR चालू है। / The QR is active.'}</p><details class="more"><summary>ℹ️ हिस्सा कैसे बनता है / How your share is worked out</summary><p class="small">हिस्सा ऐप ख़ुद निकालता है — सिर्फ़ आपके लाए ग्राहक की तरफ़ की ब्रोकरेज से (ख़रीदार/किरायेदार लाए तो उससे तय फ़ीस; मालिक लाए तो मालिक से साइन हुई ब्रोकरेज), डील के अंतिम भाव पर। दूसरी तरफ़ की कमाई से आपका कोई लेना-देना नहीं। कोई बदलाव हो तो आपको अलर्ट और यहाँ दिखेगा। / The app works your share out from the brokerage on your customer’s own side of the deal only; the other side’s earnings are none of your business. If anything changes you are told here.</p></details></div>`;
    const need = leads.flatMap(l => (l.shareChanges || []).filter(c => c.status === 'PENDING' || (c.status === 'DISPUTED' && daysSince(c.answeredAt) <= 14)).map(c => ({ l, c }))).sort((a, z) => z.c.at.localeCompare(a.c.at)).slice(0, 6);
    const rows = leads.map(l => {
      const kind = LEAD_KINDS.find(k => k.id === l.kind)!; const stt = LEAD_STATUSES.find(x => x.id === l.status)!;
      const links = linksFor(l); const flags = flagsFor(l, links).filter(f => f.code !== 'CUSTOMER_NO' && f.code !== 'CUSTOMER_YES' && f.code !== 'SHARE_DISPUTED');
      const pay = l.payout ? PAYOUT_LABEL[l.payout.status] : null;
      const pg = progressFor(l, links); const cut = sideOfKind(l.kind) === 'SALE' ? l.terms.sale : l.terms.rent;
      const prog = l.status === 'LOST' ? '' : `<details class="more"><summary>कहाँ तक पहुँचा / Progress</summary><div class="prog" data-testid="lead-progress">${pg.steps.map((t, i) => `<span class="st ${i < pg.step ? 'on' : i === pg.step ? 'now' : ''}">${t}</span>`).join('')}</div></details>${pg.share > 0 && !l.won ? `<small>आपका हिस्सा (अनुमान): <b>${inr(pg.share)}</b> — डील पूरी होने पर तय · ${esc(cutText(cut, true))}</small>` : ''}`;
      const act = l.payout && ['DUE', 'PAID'].includes(l.payout.status)
        ? `<div class="row">${l.payout.status === 'PAID' ? `<form method="post" action="/sp/${tok}/lead/${esc(l.id)}/received"><button class="g" type="submit" data-testid="got-it">✔ पैसा मिल गया / Received</button></form>` : ''}
<form method="post" action="/sp/${tok}/lead/${esc(l.id)}/not-received" style="flex:1"><input type="text" name="note" maxlength="200" required placeholder="क्या हुआ? / What happened?"><div class="row"><button class="r" type="submit">✖ नहीं मिला / Not received</button></div></form></div>` : '';
      const late = unpaidDays(l);
      const wonLine = l.won
        ? `<br><b data-testid="fixed-share">आपका हिस्सा: ${inr(l.won.amount)}</b> ${pay ? `<span class="chip ${l.payout!.status === 'RECEIVED' ? 'ok' : l.payout!.status === 'NOT_RECEIVED' ? 'x' : 'w'}">${pay.hi}</span>` : ''}<br><small>${esc(cutText(cut, true))} · ${l.won.source === 'TYPED' ? 'इस डील की ब्रोकरेज ब्रोकर ने ख़ुद लिखी' : 'डील के अंतिम भाव पर, आपके ग्राहक की तरफ़ की ब्रोकरेज से ऐप ने निकाला'}</small>${l.payout && ['PAID', 'RECEIVED'].includes(l.payout.status) ? `<br><small>भेजा गया: ${esc(payModeHi(l.payout.mode))}${l.payout.ref ? ` · रेफ़रेंस ${esc(l.payout.ref)}` : ''}${l.payout.paidAt ? ` · ${when(l.payout.paidAt)}` : ''}</small>` : ''}${late >= OVERDUE.remindDays[0] ? `<br><small style="color:#b91c1c">⏳ ${late} दिन से बाकी / unpaid for ${late} days</small>` : ''}`
        : '';
      const last = (l.shareChanges || []).slice(-1)[0];
      const lastLine = last && last.status === 'OK' ? `<br><small>हिस्सा ${last.from > 0 ? `${inr(last.from)} → ` : ''}${inr(last.to)} (${when(last.at)}) · आपने मान लिया ✔</small>` : '';
      return `<div class="lead"><b>${kind.hi}</b> · ${esc(l.locality)} · ••${esc(l.phoneLast4)} <small>(${when(l.createdAt)})</small><br>
<span class="chip ${l.status === 'WON' ? 'ok' : l.status === 'LOST' ? 'x' : ''}">${stt.hi}</span>${links.map(x => `<span class="chip">${esc(x.hi)}</span>`).join('')}${flags.map(f => `<span class="chip x">⚠ ${esc(f.hi)}</span>`).join('')}
${prog}
${l.status === 'LOST' && l.lostReason ? `<br><small>कारण: ${esc(l.lostReason)}</small>` : ''}
${wonLine}${lastLine}
<br><small>${locked(l) ? `यह लीड ${when(l.lockUntil)} तक आपकी है` : 'सुरक्षा का समय पूरा'}</small>${act}${need.some(x => x.l.id === l.id) ? '' : askBox(l, tok)}</div>`;
    }).join('');
    const cert = p.acceptedAt && p.status !== 'PENDING' && p.status !== 'ENDED' ? `<a class="btn l" href="/sp/${tok}/certificate" target="_blank" rel="noopener" data-testid="cert-link">🏅 प्रमाणपत्र / Certificate</a>` : '';
    const html = shell('QR पार्टनर', `<div class="top"><h1>नमस्ते ${esc(p.personName.split(' ')[0])} 🙏</h1><p>${esc(p.shopName)} · ${esc(b?.name || '')} के साथ QR पार्टनर</p></div>
${langBar(langOf(req))}
${msg ? `<div class="card ok"><p class="t">${msg}</p></div>` : ''}
${p.status === 'ACTIVE' ? `<div class="say" data-testid="shop-say"><b>🗣️ ग्राहक से कहें: “भैया, घर, दुकान या प्लॉट लेना या बेचना हो तो ये QR स्कैन करके अपनी ज़रूरत भर दीजिए — सही प्रॉपर्टी वाले आपको ख़ुद फ़ोन करेंगे।” / Tell customers: “Scan this QR, fill what you need — we’ll find it for you.”</b><div class="row"><a class="btn g" href="/sp/${tok}/show" data-testid="shop-show-qr">📲 QR ग्राहक को दिखाएँ / Show QR</a><a class="btn l" href="https://wa.me/?text=${encodeURIComponent(`भैया, घर / दुकान / प्लॉट लेना या बेचना हो तो ये लिंक खोलकर अपनी ज़रूरत भर दीजिए: ${req.protocol}://${req.get('host')}/q/${p.qrCode}`)}" target="_blank" rel="noopener" data-testid="shop-wa">💬 WhatsApp पर भेजें / Send on WhatsApp</a></div></div>` : ''}
${p.status === 'PAUSED' && p.pausedBy === 'SYSTEM' ? `<div class="card red" data-testid="auto-paused"><p class="t"><b>⏸ आपका QR GENZ ने रोका है</b></p><p class="t">आपका हिस्सा ${OVERDUE.pauseDays} दिन से ज़्यादा बाकी है, इसलिए नए अनुरोध फ़िलहाल रुके हैं। ब्रोकर के चुकाते ही QR फिर चालू हो जाएगा। <small>GENZ paused new requests because your share is over ${OVERDUE.pauseDays} days late; it starts again once it is paid.</small></p></div>` : ''}
${need.length ? `<h2>आपके ध्यान के लिए / Needs your eye (${need.length})</h2>${need.map(x => chgCard(x.l, x.c, tok)).join('')}` : ''}
${agree}
<div class="card"><div class="stats"><div><b>${leads.length}</b><small>लीड</small></div><div><b>${leads.filter(l => l.status === 'WON').length}</b><small>डील</small></div><div><b>${inr(due)}</b><small>बाकी ₹ / due</small></div></div>
<p class="small" style="margin-top:8px" data-testid="shop-money"><span>मिला / Received ${inr(got)}</span> · <span>रास्ते में / On the way ${inr(onWay)}</span> · <span>स्कैन / Scans ${p.scans}</span></p>
${rank ? `<div class="rank card" style="margin-top:10px" data-testid="shop-rank"><b>🏆 इस महीने आप ${esc(p.city)} के ${mates.length} QR पार्टनर्स में #${rank}</b><br><small>पिछले 30 दिन में ${mine30} लीड · This month you are #${rank} of ${mates.length} QR partners in ${esc(p.city)}</small></div>` : ''}
${recText ? `<p class="small" style="margin-top:8px" data-testid="broker-record">🤝 ${esc(b?.name || 'ब्रोकर')}: ${esc(recText)}</p>` : ''}
<div class="row"><a class="btn l" href="/q/${esc(p.qrCode)}/poster" target="_blank" rel="noopener">🖨 QR पोस्टर / Poster</a>${cert}</div></div>
<h2>आपके QR से आई लीड / Leads from your QR (${leads.length})</h2><div class="card">${rows || '<p class="t">अभी कोई लीड नहीं। / No leads yet.</p>'}<details class="more"><summary>🔒 पूरा नंबर क्यों नहीं दिखता / Why only 4 digits</summary><p class="small">ग्राहक का पूरा नंबर आपको नहीं दिखता — सिर्फ़ आख़िरी 4 अंक। अगर ब्रोकर इसी नंबर पर बाद में काम करता है तो वह यहाँ अपने आप दिखता है। / You see only the last 4 digits. If the broker works this number later, it shows here by itself.</p></details></div>
<div class="card" data-testid="shop-tips"><details class="more"><summary>💡 ज़्यादा लीड कैसे लाएँ / How to get more leads</summary><p class="small">1) पोस्टर काउंटर के सामने, आँख की ऊँचाई पर लगाएँ। 2) ग्राहक से कहें: “घर, दुकान या प्लॉट चाहिए तो यह QR स्कैन करें”। 3) अपने WhatsApp स्टेटस पर पोस्टर डालें। / Put the poster at eye level near the counter · tell customers “scan if you need or want to sell a home” · post it on your WhatsApp status.</p></details></div>
<div class="card app" id="app-card" style="display:none"><p class="t"><b id="app-title"></b></p><p class="small" id="app-sub"></p><div class="row"><button class="g" id="app-push" type="button" style="display:none">🔔 अलर्ट चालू करें / Turn alerts on</button><button class="l" id="app-later" type="button" style="display:none">बाद में / Later</button><button class="l" id="app-install" type="button" style="display:none">📲 होम स्क्रीन पर जोड़ें / Add to home screen</button></div><p class="small" id="app-ios" style="display:none">iPhone: Safari में नीचे “Share” → “Add to Home Screen”, फिर उस ऐप को खोलें। / On iPhone: Safari → Share → Add to Home Screen, then open that app.</p><p class="small" id="app-push-msg"></p></div>
<div class="card"><details class="more"><summary>✉️ ब्रोकर से कुछ कहना है? / Message the broker</summary><form method="post" action="/sp/${tok}/ask"><label class="small">संदेश / Message</label><textarea name="note" rows="2" maxlength="300" required></textarea><div class="row"><button type="submit">भेजें / Send</button></div></form></details></div>
<p class="small" style="margin:12px 4px">इस पेज को बुकमार्क कर लें — इसी फ़ोन पर बिना कोड के खुलेगा। / Bookmark this page — on this phone it opens without a code. GENZ never asks you for money.</p>`,
    `<link rel="manifest" href="/sp/${tok}/manifest.webmanifest"><meta name="theme-color" content="#14213d">`, '/sp/app.js');
    const mode = langOf(req);
    if (typeof req.query.lang === 'string' && ['hi', 'en', 'both'].includes(req.query.lang)) res.append('Set-Cookie', `sp_lang=${req.query.lang}; Path=/sp; Max-Age=31536000; SameSite=Lax`);
    res.send(pickLang(html, mode));
  };

  const authed = (req: Request, res: Response) => {
    noStore(res);
    const p = find(req.params.token); if (!p) { gone(res); return null; }
    const dev = spSession(req, p); if (!dev) { res.redirect(303, `/sp/${req.params.token}`); return null; }
    const c = spCookie(req, p); if (!c || c.exp - Date.now() < (L.sessionDays - 1) * 86400_000) spSet(req, res, p, dev);
    const d = (p.devices || []).find(x => x.id === dev); if (d) d.lastAt = nowIso();
    p.lastPartnerSeenAt = nowIso();
    return p;
  };

  r.get('/:token', rateLimit('sp-page', 120, 60_000), (req: Request, res: Response) => {
    noStore(res);
    const p = find(req.params.token); if (!p) return gone(res);
    if (!spSession(req, p)) return gate(res, p, req.params.token);
    const q = authed(req, res); if (!q) return;
    fresh(q); db.save(); render(req, res, q, req.query.done === '1' ? 'हो गया ✔ / Done' : '');
  });
  r.post('/:token/otp', rateLimit('sp-otp', 30, 3600_000), form, async (req: Request, res: Response) => {
    noStore(res);
    const p = find(req.params.token); if (!p) return gone(res);
    const phone = phone10(req.body?.phone);
    if (hit(`sp-phone:${p.id}`, 8, 3600_000, 3600_000) > 0) return gate(res, p, req.params.token, 'बहुत बार कोशिश हुई — एक घंटे बाद। / Too many tries — wait an hour.', 'phone', 429);
    if (!PHONE_RE.test(phone) || !safeEqual(hmac('sp-phone', phone), p.phoneKey)) return gate(res, p, req.params.token, 'यह नंबर इस पेज से मेल नहीं खाता। / This number does not match.');
    if (!spKnown(req, p) && (p.devices || []).length >= L.devices) return gate(res, p, req.params.token, 'यह पेज पहले से 2 फ़ोन पर खुला है — ब्रोकर से एक हटवाएँ। / Already open on 2 phones — ask the broker to remove one.', 'phone', 403);
    if (!smsOn() && !DEMO_MODE) return gate(res, p, req.params.token, NO_SMS, 'phone', 503);
    const otp = secureOtp();
    p.otpHash = hmac('sp-otp', `${p.id}|${otp}`); p.otpExpires = new Date(Date.now() + L.otpMinutes * 60_000).toISOString(); p.otpTries = 0; p.otpPlain = brokerReads() ? otp : undefined;
    if (smsOn()) await sendSms(`+91${phone}`, `GENZ: your code to open your QR partner page is ${otp}. Valid ${L.otpMinutes} minutes.`);
    db.save();
    if (brokerReads()) ping(p, 'Your shop partner wants his code', `${p.shopName} is opening his page — read the code out from Shop QR partners.`);
    gate(res, p, req.params.token, '', 'code');
  });
  r.post('/:token/verify', rateLimit('sp-verify', 40, 3600_000), form, (req: Request, res: Response) => {
    noStore(res);
    const p = find(req.params.token); if (!p) return gone(res);
    if (!p.otpHash || !p.otpExpires || Date.parse(p.otpExpires) < Date.now()) return gate(res, p, req.params.token, 'कोड की मियाद ख़त्म — नया कोड मँगाएँ। / The code expired.');
    if ((p.otpTries || 0) >= L.otpTries) { p.otpHash = undefined; p.otpPlain = undefined; db.save(); return gate(res, p, req.params.token, 'बहुत बार ग़लत कोड। / Too many wrong codes.'); }
    if (!safeEqual(p.otpHash, hmac('sp-otp', `${p.id}|${String(req.body?.code || '').trim()}`))) { p.otpTries = (p.otpTries || 0) + 1; db.save(); return gate(res, p, req.params.token, 'कोड सही नहीं है। / Wrong code.', 'code'); }
    let dev = spKnown(req, p); const devices = p.devices || (p.devices = []);
    if (!dev) {
      if (devices.length >= L.devices) return gate(res, p, req.params.token, 'यह पेज पहले से 2 फ़ोन पर खुला है। / Already open on 2 phones.', 'phone', 403);
      dev = crypto.randomBytes(6).toString('hex'); devices.push({ id: dev, label: devLabel(req.headers['user-agent']), firstAt: nowIso(), lastAt: nowIso() });
      hist(p, 'PARTNER', `Opened the partner page on a phone (${devices[devices.length - 1].label})`);
    }
    p.otpHash = undefined; p.otpPlain = undefined; p.otpExpires = undefined; p.otpTries = 0;
    spSet(req, res, p, dev); db.save();
    res.redirect(303, `/sp/${req.params.token}`);
  });

  const back = (res: Response, tok: string) => res.redirect(303, `/sp/${tok}?done=1`);
  r.post('/:token/accept', rateLimit('sp-act', 60, 3600_000), form, (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    if (p.status !== 'PENDING') return back(res, req.params.token);
    if (req.body?.ok !== '1') return render(req, res, p, 'सहमति वाले बॉक्स पर टिक करें। / Tick the box.');
    p.status = 'ACTIVE'; p.acceptedAt = nowIso();
    hist(p, 'PARTNER', `Accepted the terms: ${termsText(p.terms)} — QR is live`); db.saveNow();
    db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', p.id, 'SHOP_PARTNER_ACCEPTED', `Shop partner accepted the terms on a phone opened with a code sent ${smsOn() ? 'by SMS to his registered mobile' : 'in DEMO mode (read out by the broker — not proof of the shop\'s consent)'} — v${p.termsVersion}`);
    ping(p, `${p.shopName} accepted`, 'The QR is live now. Print the poster and put it up.');
    back(res, req.params.token);
  });
  r.post('/:token/change/:answer', rateLimit('sp-act', 60, 3600_000), form, (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    if (!p.pending) return back(res, req.params.token);
    if (req.params.answer === 'accept') {
      const old = p.terms; p.terms = p.pending.terms; p.termsVersion += 1; p.pending = undefined;
      hist(p, 'PARTNER', `Accepted the change (v${p.termsVersion}): ${termsText(p.terms)} — was ${termsText(old)}; earlier leads keep their terms`);
      db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', p.id, 'SHOP_PARTNER_TERMS_ACCEPTED', `Shop partner accepted new terms v${p.termsVersion} (mobile verified)`);
      ping(p, `${p.shopName} accepted the new share`, termsText(p.terms));
    } else if (req.params.answer === 'decline') {
      hist(p, 'PARTNER', `Declined the proposed change (${termsText(p.pending.terms)}) — current terms stay`); p.pending = undefined;
      ping(p, `${p.shopName} declined the new share`, 'The current terms stay.');
    }
    db.saveNow(); back(res, req.params.token);
  });
  r.post('/:token/lead/:id/change/:cid/:answer', rateLimit('sp-act', 60, 3600_000), form, (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    const l = st().partnerLeads.find(x => x.id === req.params.id && x.partnerId === p.id);
    const c = (l?.shareChanges || []).find(x => x.id === req.params.cid);
    if (!l || !c || c.status !== 'PENDING') return back(res, req.params.token);
    if (req.params.answer === 'ok') {
      c.status = 'OK'; c.answeredAt = nowIso(); hist(l, 'PARTNER', `Partner accepted the share ${changeWords(c)}`);
      ping(p, `${p.shopName}: हिस्सा ठीक है / share accepted`, `${changeWords(c)} — दुकान ने मान लिया। / The shop accepted it.`);
    } else if (req.params.answer === 'no') {
      const note = str(req.body?.note, 300); if (note.length < 3) return render(req, res, p, 'लिखें कि क्या सही नहीं है। / Write what is not right.');
      c.status = 'DISPUTED'; c.answeredAt = nowIso(); c.note = note; hist(l, 'PARTNER', `Partner says the share ${changeWords(c)} is NOT right: ${note}`);
      db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', l.id, 'SHOP_SHARE_DISPUTED', `Shop partner says the changed share ${changeWords(c)} is not right (GENZ desk sees it)`);
      ping(p, `${p.shopName}: हिस्सा सही नहीं / share not right`, `${changeWords(c)} — ${note.slice(0, 100)}`);
    } else return back(res, req.params.token);
    db.saveNow(); back(res, req.params.token);
  });
  r.post('/:token/lead/:id/:what', rateLimit('sp-act', 60, 3600_000), form, async (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    const l = st().partnerLeads.find(x => x.id === req.params.id && x.partnerId === p.id);
    if (!l) return back(res, req.params.token);
    const what = req.params.what;
    if (what === 'received' && l.payout?.status === 'PAID') {
      l.payout = { ...l.payout, status: 'RECEIVED', partnerAt: nowIso() }; hist(l, 'PARTNER', 'Partner confirmed: share received');
      ping(p, `${p.shopName} confirmed the payment`, `${inr(l.won?.amount || 0)} received.`);
    } else if (what === 'not-received' && l.payout && ['DUE', 'PAID'].includes(l.payout.status)) {
      const note = str(req.body?.note, 200); if (note.length < 3) return render(req, res, p, 'बताएँ क्या हुआ। / Write what happened.');
      l.payout = { ...l.payout, status: 'NOT_RECEIVED', partnerAt: nowIso(), partnerNote: note }; hist(l, 'PARTNER', `Partner says NOT received: ${note}`);
      db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', l.id, 'SHOP_PARTNER_NOT_RECEIVED', 'Shop partner says the share was not received (GENZ desk sees it)');
      ping(p, `${p.shopName}: share not received`, note);
    } else if (what === 'ask-broker') {
      const note = str(req.body?.note, 300); if (note.length < 2) return back(res, req.params.token);
      hist(l, 'PARTNER', `Partner asks the broker: ${note}`);
      ping(p, `${p.shopName}: सवाल / question`, `••${l.phoneLast4}: ${note.slice(0, 100)}`);
    } else if (what === 'ask-customer') {
      // the customer is asked ONLY if he ticked the separate, optional SMS box on the QR page — never otherwise
      if (!l.outcomeOk) return render(req, res, p, 'इस ग्राहक ने SMS की अनुमति नहीं दी है। / This customer did not agree to an SMS.');
      if (!smsOn()) return render(req, res, p, 'SMS अभी चालू नहीं है — ब्रोकर से पूछें। / SMS is not switched on — ask the broker instead.');
      if (!locked(l) && !l.won) return render(req, res, p, 'इस लीड की सुरक्षा अवधि पूरी हो चुकी है। / This lead’s protection period is over.');
      const a = l.ask;
      if (a?.answer) return back(res, req.params.token);
      if (a && a.n >= ASK_LIMITS.perLead) return render(req, res, p, 'ग्राहक से दो बार पूछा जा चुका है। / The customer has already been asked twice.');
      if (a && Date.now() - Date.parse(a.at) < ASK_LIMITS.gapHours * 3600_000) return render(req, res, p, 'ग्राहक से अभी पूछा गया है — कल फिर कोशिश करें। / He was asked just now — try again tomorrow.');
      if (hit(`sp-ask:${p.id}`, 10, 86400_000) > 0) return render(req, res, p, 'आज बहुत सवाल भेजे जा चुके। / Too many questions today.');
      const token = newToken(); l.ask = { hash: sha(token), at: nowIso(), n: (a?.n || 0) + 1 };
      const who = userOf(l.brokerId)?.name || 'ब्रोकर';
      hist(l, 'PARTNER', 'Partner asked the customer (one SMS) whether it went ahead'); db.save();
      db.appendAuditEvent('public', 'PUBLIC' as any, 'LEAD', l.id, 'SHOP_CUSTOMER_ASKED', 'Shop partner asked the customer by SMS (he had agreed on the QR page)');
      await sendSms(`+91${l.phone}`, `GENZ: क्या ${who} के साथ आपकी प्रॉपर्टी की बात आगे बढ़ी? हाँ/नहीं बताने के लिए खोलें: ${req.protocol}://${req.get('host')}/q/ok/${token} (${ASK_LIMITS.validDays} दिन मान्य)`);
      ping(p, `${p.shopName}: ग्राहक से पूछा गया`, `••${l.phoneLast4} पर GENZ का SMS गया।`);
      return render(req, res, p, 'ग्राहक को SMS भेज दिया गया। / The customer has been sent an SMS.');
    } else return back(res, req.params.token);
    db.save(); back(res, req.params.token);
  });
  r.post('/:token/ask', rateLimit('sp-act', 60, 3600_000), form, (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    const note = str(req.body?.note, 300); if (note.length < 2) return back(res, req.params.token);
    hist(p, 'PARTNER', `Message: ${note}`); db.save();
    ping(p, `Message from ${p.shopName}`, note.slice(0, 120));
    back(res, req.params.token);
  });

  // ───────── v82 — the page as an app: its own manifest, alerts on the shop's phone, a "GENZ network partner" certificate ─────────
  r.get('/:token/manifest.webmanifest', (req: Request, res: Response) => {
    const p = find(req.params.token); if (!p || p.status === 'ENDED') return res.status(404).end();
    const base = `/sp/${req.params.token}`;
    res.set({ 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.send(JSON.stringify({
      name: `GENZ — ${p.shopName}`.slice(0, 45), short_name: 'QR पार्टनर', description: 'Your QR partner page with your broker',
      id: base, start_url: base, scope: '/sp/', display: 'standalone', orientation: 'portrait', background_color: '#ffffff', theme_color: '#14213d',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    }));
  });
  const jsonBody = express.json({ limit: '4kb' });
  r.post('/:token/push', rateLimit('sp-push', 30, 3600_000), jsonBody, (req: Request, res: Response) => {
    noStore(res);
    const p = find(req.params.token); if (!p || p.status === 'ENDED') return res.status(404).json({ success: false, error: 'This link is closed.' });
    if (!spSession(req, p)) return res.status(401).json({ success: false, error: 'Open the page again and enter the code.' });
    const endpoint = String(req.body?.endpoint || ''); const k = req.body?.keys || {};
    const p256dh = String(k.p256dh || ''); const auth = String(k.auth || '');
    if (!endpoint || endpoint.length > 1000 || p256dh.length < 80 || p256dh.length > 120 || auth.length < 16 || auth.length > 40) return res.status(400).json({ success: false, error: 'Unusable push address.' });
    if (!allowedEndpoint(endpoint)) return res.status(400).json({ success: false, error: 'This browser’s push service is not supported.' });
    const s = st(); const key = shopPushKey(p.id); const id = sha(endpoint).slice(0, 32);
    const before = s.pushSubs.find(x => x.id === id && x.userId === key);
    s.pushSubs = s.pushSubs.filter(x => x.id !== id);
    const mineSubs = s.pushSubs.filter(x => x.userId === key);
    if (mineSubs.length >= 3) { const oldest = mineSubs.sort((a, z) => a.createdAt.localeCompare(z.createdAt))[0]; s.pushSubs = s.pushSubs.filter(x => x.id !== oldest.id); }
    s.pushSubs.push({ id, userId: key, endpoint, p256dh, auth, ua: String(req.headers['user-agent'] || '').slice(0, 120), createdAt: before?.createdAt || nowIso(), lastOkAt: before?.lastOkAt, fails: 0, url: `/sp/${req.params.token}` });
    if (!before) { hist(p, 'PARTNER', 'Turned on alerts on a phone'); db.save(); tellShop(p, '🔔 अलर्ट चालू हैं', 'Alerts are on', 'अब लीड और हिस्से की ख़बर सीधे इस फ़ोन पर आएगी। / Lead and share news now come straight to this phone.', `on-${p.id}`); }
    else db.save();
    res.json({ success: true, fresh: !before });
  });
  /** v95 — a full-screen QR the shopkeeper holds up (or turns the phone) for the customer, with the line to say */
  r.get('/:token/show', rateLimit('sp-page', 60, 60_000), async (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    if (p.status !== 'ACTIVE') return back(res, req.params.token);
    const svg = await brandedQrSvg(`${req.protocol}://${req.get('host')}/q/${p.qrCode}`, 320);
    const mode = langOf(req);
    const html = shell('QR स्कैन', `<div class="top" style="text-align:center"><h1>📲 स्कैन करें / Scan</h1><p>घर · दुकान · प्लॉट — लेना या बेचना / Buy · sell · rent</p></div>
<div class="card" style="text-align:center" data-testid="show-qr"><div style="width:min(80vw,320px);margin:0 auto">${svg}</div><p class="t" style="font-size:18px;margin-top:10px"><b>कैमरा खोलें, QR पर रखें, अपनी ज़रूरत भरें / Open the camera, point at the QR, fill what you need</b></p><p class="small">ब्रोकर आपको सही प्रॉपर्टी बताएँगे। / The broker will show you the right property.</p></div>
<div class="row"><a class="btn l" href="/sp/${esc(req.params.token)}">← वापस / Back</a></div>`);
    res.send(pickLang(html, mode));
  });

  r.get('/:token/certificate', rateLimit('sp-page', 60, 60_000), async (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    if (!p.acceptedAt || p.status === 'PENDING' || p.status === 'ENDED') return back(res, req.params.token);
    const b = userOf(p.brokerId);
    const svg = await brandedQrSvg(`${req.protocol}://${req.get('host')}/q/${p.qrCode}`, 200);
    res.send(`<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>GENZ नेटवर्क पार्टनर — ${esc(p.shopName)}</title>
<style>@page{size:A4 landscape;margin:12mm}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#eee}.c{max-width:277mm;margin:10px auto;background:#fff;border:6px double #14213d;padding:14mm 12mm;text-align:center}
.k{letter-spacing:3px;color:#b45309;font-weight:700;font-size:13px}h1{font-size:34px;margin:6px 0 2px;color:#14213d}h2{font-size:26px;margin:14px 0 4px}.s{color:#444;font-size:15px}.qr{width:38mm;margin:12px auto 4px}.qr svg{width:100%;height:auto}.f{margin-top:12px;font-size:12px;color:#555}.p{margin:12px auto;text-align:center}@media print{body{background:#fff}.p{display:none}.c{margin:0}}</style></head>
<body><div class="p"><button id="pr" style="padding:10px 18px;font-size:15px;font-weight:700;border-radius:10px;border:0;background:#14213d;color:#fff">🖨 Print / PDF</button></div>
<div class="c" data-testid="certificate"><div class="k">GENZ BROKER NETWORK</div><h1>GENZ नेटवर्क पार्टनर</h1><div class="s">GENZ network partner</div>
<h2>${esc(p.shopName)}</h2><div class="s">${esc(p.personName)} · ${esc(p.area)}, ${esc(p.city)}</div>
<p class="s" style="margin-top:14px">यह दुकान ${esc(b?.name || 'ब्रोकर')}${b?.reraNumber ? ` (RERA ${esc(b.reraNumber)})` : ''} की QR पार्टनर है — ${esc(when(p.acceptedAt))} से।<br>This shop is a QR partner of ${esc(b?.name || 'the broker')} since ${esc(when(p.acceptedAt))}.</p>
<div class="qr">${svg}</div><div class="s">मकान · दुकान · प्लॉट — किराया या ख़रीद-बिक्री के लिए स्कैन करें</div>
<div class="f">यह एक रेफ़रल साझेदारी का प्रमाण है — कोई लाइसेंस या सरकारी मान्यता नहीं। / This shows a referral partnership; it is not a licence or a government approval.</div></div>
<script src="/q/poster.js" defer></script></body></html>`);
  });
  return r;
}

/** home tiles for the broker */
export function partnerCounts(uid: string) {
  const leads = st().partnerLeads.filter(l => l.brokerId === uid);
  return {
    partnerNew: leads.filter(l => l.status === 'NEW').length,
    // v90: the first reply wins the lead — a customer who wrote and has waited more than 2 hours (for up to 3 days) with no answer from the broker
    partnerReply: leads.filter(l => {
      if (['WON', 'LOST'].includes(l.status) || !l.chat) return false;
      const last = [...l.chat.msgs].reverse().find(m => m.by !== 'SYSTEM'); if (!last || last.by !== 'CUSTOMER' || last.kind !== 'MSG') return false;
      const age = Date.now() - Date.parse(last.at); return age > 2 * 3600_000 && age < 3 * 86400_000;
    }).length,
    partnerDue: leads.filter(l => l.payout && ['DUE', 'NOT_RECEIVED'].includes(l.payout.status)).length,
    partnerCodes: st().shopPartners.filter(p => p.brokerId === uid && p.otpPlain && p.otpExpires && Date.parse(p.otpExpires) > Date.now()).length,
  };
}

/**
 * v91 — a site visit was booked / verified ANYWHERE in the app (a client room, the visit screen, the owner's room page): the shop lead
 * moves by itself (Contacted → Visit done), the client card follows, and the shop is told on his phone. Nobody has to press a stage button.
 * Runs once per visit and phase; only the broker's own, still-locked, open lead with the same mobile is touched.
 */
export function leadVisitEvent(v: { id: string; brokerId: string; customerPhone?: string; propertyId?: string }, phase: 'BOOKED' | 'DONE'): number {
  try {
    const ph = phone10(v.customerPhone); if (!ph) return 0;
    const s = st(); let n = 0;
    for (const l of s.partnerLeads) {
      if (l.brokerId !== v.brokerId || l.phone !== ph || ['WON', 'LOST'].includes(l.status) || !locked(l)) continue;
      const tag = `[${v.id}:${phase}]`; if (l.history.some(h => h.text.includes(tag))) continue;
      const p = s.shopPartners.find(x => x.id === l.partnerId); if (!p) continue;
      if (phase === 'DONE' && ['NEW', 'CONTACTED'].includes(l.status)) l.status = 'VISIT';
      if (phase === 'BOOKED' && l.status === 'NEW') l.status = 'CONTACTED';
      const card = l.clientCardId ? s.clientCards.find(c => c.id === l.clientCardId) : undefined;
      if (card && phase === 'DONE' && ['NEW', 'CONTACTED'].includes(card.stage)) { card.stage = 'SITE_VISIT'; card.updatedAt = nowIso(); card.timeline.push({ at: nowIso(), kind: 'STAGE', text: 'Site visit verified — stage moved automatically' }); }
      hist(l, 'SYSTEM', phase === 'DONE' ? `Site visit verified ${tag} — lead moved to “Visit done” automatically` : `Site visit booked ${tag}`);
      n++;
      if (phase === 'DONE') tellShop(p, 'विज़िट हो गई ✔', 'Visit done', `${l.locality} वाली आपकी लीड का ग्राहक घर देख आया — लीड आगे बढ़ी।`, `visit-${l.id}`);
      else tellShop(p, 'विज़िट तय हुई 📍', 'Visit booked', `${l.locality} वाली आपकी लीड की घर-विज़िट तय हो गई है।`, `visit-${l.id}`);
    }
    if (n) db.save();
    return n;
  } catch (e: any) { console.error('[SHOP] visit mark failed:', e?.message || e); return 0; }
}

/** demo only (SEED_DEMO_DATA + SEED_DEMO_BULK): three shop partners and a few leads for the first demo broker, so the screen is not empty */
export function seedDemoPartners() {
  const s = st();
  if ((process.env.SEED_DEMO_DATA || '').toLowerCase() !== 'true' || (process.env.SEED_DEMO_BULK || '').toLowerCase() !== 'true') return;
  if (s.shopPartners.length || !s.users.some(u => u.id === 'USR-BRK-001')) return;
  const brokerId = 'USR-BRK-001'; const day = 86400_000; const ago = (d: number) => new Date(Date.now() - d * day).toISOString();
  const mk = (shopName: string, personName: string, phone: string, area: string, status: ShopPartner['status'], terms: PartnerTerms, scans: number, d: number): ShopPartner => {
    const token = newToken();
    const p: ShopPartner = { id: rid('SHP'), brokerId, shopName, personName, area, city: 'Raipur', phoneKey: hmac('sp-phone', phone), phoneLast4: phone.slice(-4), qrCode: newQrCode(),
      tokenHash: sha(token), token, sessVersion: 1, linkAt: ago(d), status, terms, termsVersion: 1, scans, history: [{ at: ago(d), by: 'BROKER', text: `Partner added — terms proposed: ${termsText(terms)}` }],
      createdAt: ago(d), updatedAt: ago(1), ...(status === 'ACTIVE' ? { acceptedAt: ago(d - 1) } : {}) };
    if (status === 'ACTIVE') p.history.push({ at: ago(d - 1), by: 'PARTNER', text: `Accepted the terms: ${termsText(terms)} — QR is live` });
    s.shopPartners.push(p); return p;
  };
  const gupta = mk('Gupta Kirana Store', 'Mohan Gupta', '9826011101', 'Shankar Nagar', 'ACTIVE', { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 }, 46, 40);
  mk('Sai Medical', 'Rakesh Sahu', '9826011102', 'Telibandha', 'PENDING', { sale: { mode: 'PCT', value: 15 }, rent: { mode: 'FIXED', value: 1500 }, lockDays: 180 }, 0, 2);
  const gate = mk('Green Valley Society — main gate', 'Ramesh (guard)', '9826011103', 'Amlidih', 'ACTIVE', { sale: { mode: 'FIXED', value: 10000 }, rent: { mode: 'FIXED', value: 1500 }, lockDays: 120 }, 18, 25);
  let n = s.clientCards.reduce((m, c) => Math.max(m, Number(c.id.split('-').pop()) || 0), 0);
  const card = (name: string, phone: string, area: string, tx: 'Sale' | 'Rent', at: string, shop: string) => {
    n += 1; const c: ClientCard = { id: `CLI-${String(n).padStart(4, '0')}`, brokerId, name, phone, budgetMin: 0, budgetMax: 0, city: 'Raipur', areas: [area], propertyType: 'Any', transactionType: tx, tags: ['Shop QR'],
      notes: shop ? `Via ${shop} QR` : 'Met at site', stage: 'NEW', consent: true, timeline: [{ at, kind: 'CREATED', text: shop ? `From the QR at ${shop}` : 'Client added' }], createdAt: at, updatedAt: at };
    s.clientCards.unshift(c); return c.id;
  };
  const lead = (p: ShopPartner, kind: LeadKind, name: string, phone: string, locality: string, budget: string, d: number, extra: Partial<PartnerLead> = {}) => {
    const at = ago(d);
    const l: PartnerLead = { id: rid('PLD'), partnerId: p.id, brokerId, kind, name, phone, phoneLast4: phone.slice(-4), locality, budget, consentAt: at, termsVersion: 1, terms: cleanTerms(p.terms),
      lockUntil: new Date(Date.parse(at) + p.terms.lockDays * day).toISOString(), status: 'NEW', history: [{ at, by: 'CUSTOMER', text: `Came in by scanning the QR at ${p.shopName} (consent recorded)` }], createdAt: at, updatedAt: at, ...extra };
    if ((kind === 'BUY' || kind === 'RENT_IN') && !extra.clientCardId && extra.status !== 'LOST') l.clientCardId = card(name, phone, locality, kind === 'BUY' ? 'Sale' : 'Rent', at, p.shopName);
    s.partnerLeads.unshift(l); return l;
  };
  lead(gupta, 'BUY', 'Sanjay Verma', '9131100001', 'Shankar Nagar', '60 लाख तक', 1);
  lead(gupta, 'RENT_IN', 'Pooja Sinha', '9131100002', 'Telibandha', '15,000 / महीना', 6, { status: 'CONTACTED' });
  lead(gupta, 'SELL', 'Harish Agrawal', '9131100003', 'Shankar Nagar', '1.2 करोड़', 30, { status: 'WON', won: { at: ago(4), brokerage: 120000, amount: 24000, side: 'SALE' }, payout: { status: 'PAID', paidAt: ago(2), ref: 'UPI 4471' } });
  lead(gupta, 'BUY', 'Deepak Soni', '9131100004', 'Pandri', '40 लाख', 20, { status: 'LOST', lostAt: ago(10), lostReason: 'बजट नहीं था' });
  card('Deepak Soni', '9131100004', 'Pandri', 'Sale', ago(5), ''); // worked again after "lost" → the shop and GENZ see a flag
  lead(gate, 'RENT_OUT', 'Kavita Jain', '9131100005', 'Amlidih', '18,000 / महीना', 3);
  lead(gate, 'BUY', 'Anil Dubey', '9131100006', 'Amlidih', '75 लाख', 12, { status: 'VISIT' });
  db.save();
}
