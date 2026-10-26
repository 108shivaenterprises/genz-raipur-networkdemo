/**
 * v31 — Client Room.   /api/client-rooms  (broker, `clientroom:use`)   +   public page /r/:token  (the client: link + mobile OTP)
 *
 * A broker opens a private room for HIS OWN client (buyer / renter / tenant), shares chosen properties and chats. The client needs no
 * app and no sign-up: he opens the link, types his mobile (must match the one the broker entered) and a code. The code goes by SMS
 * when a gateway is set; otherwise the broker reads it out to him from the room screen.
 *
 * What the client sees of a property: marketing facts only (title, locality + city, type, price, areas, tags, first photo, a cleaned
 * description). Never the exact address, the owner's name or number, the net price or anything from deal rooms.
 * The chat belongs to the client and the introducing broker ONLY: not the listing broker, a co-broker, or GENZ staff. v58: the broker may
 * switch on "client rooms" for his own office staff — they then work in his rooms (never close one), the client page says so.
 * Phone numbers cannot be typed in the chat (the owner's number is only passed through a verified visit).
 * Messages are kept while the room is open; a closed room's chat is erased after 90 days.
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import type { ClientRoom, UserProfile, Property } from './db.js';
import { ctx, needs, rateLimit, secret, hit, secureOtp, safeEqual, parseCookies, setSessionCookie as _unused } from './auth.js';
import { sendSms } from './notify.js';
import fs from 'fs';
import path from 'path';
import { pushTo, pushToRoom, dropRoomPush, roomPushKey, vapidKeys, allowedEndpoint } from './webpush.js';
import { sniffMime } from '../src/shared/propDocs.js';
import { DOC_KINDS, DOC_LIMITS, FULL_AADHAAR_DAYS, isDocKind, isKycKind } from '../src/shared/clientRoomRules.js';
import { ackFor, ackLinkFor, ackBlock } from './visitack.js';
import { stripPhones } from '../src/shared/waParse.js';
import { ROOM_KINDS, ROOM_LIMITS as L, containsPhone, PHONE_IN_CHAT_MSG } from '../src/shared/clientRoomRules.js';
import { joinFooter } from './publicFooter.js';
import { partyBlock, partyCaution } from './partywatch.js';
import { ROOM_MEDIA, okMediaUrl, videoKind, youtubeId } from '../src/shared/roomMedia.js';
import { clientPaperState, viewerPages, logDocOpen } from './propdocs.js';
import { makeViewToken, useViewToken, stampFor } from './viewToken.js';
import { seal, unseal, vaultReady } from './vaultCrypto.js';
import { policyOf } from '../src/shared/pcontrolRules.js';
import { ownerDecideOffer } from './offers.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const hmac = (tag: string, v: string) => crypto.createHmac('sha256', secret()).update(`${tag}|${v}`).digest('hex');
const phone10 = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10);
const PHONE_RE = /^[6-9]\d{9}$/;
const newToken = () => crypto.randomBytes(18).toString('base64url');
const smsOn = () => !!process.env.SMS_WEBHOOK_URL;
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const ev = (r: ClientRoom, text: string) => { r.events.push({ at: nowIso(), text }); r.updatedAt = nowIso(); };
const rid = (p: string) => `${p}-${crypto.randomBytes(5).toString('hex')}`;

const live = (p?: Property) => !!p && p.verificationStatus === 'VERIFIED' && ['active', 'under_negotiation'].includes(p.listingStatus);
const goneText = (p?: Property) => !p ? 'removed' : p.listingStatus === 'sold' ? 'sold' : p.listingStatus === 'rented' ? 'rented' : 'not available now';

/** what a CLIENT may see of a property */
function publicProperty(p: Property) {
  const img = (p.images || []).find(x => typeof x === 'string' && (/^https?:\/\//.test(x) || x.startsWith('/')) && x.length < 400);
  return {
    id: p.id, title: p.title, locality: p.locality, city: p.city, type: p.propertyType, deal: p.transactionType,
    price: p.askingPrice, plotArea: p.plotAreaSqFt || undefined, builtUp: p.builtUpAreaSqFt || undefined,
    tags: (p.tags || []).slice(0, 8), description: stripPhones(p.description || '').slice(0, 500), image: img,
    available: live(p), status: live(p) ? 'available' : goneText(p),
  };
}

// ───────────────────────────── v40: photos & video ─────────────────────────────
/**
 * What this broker may show his client of a property: the listing's own photos and video link, the vault's PUBLIC photos / walkthrough
 * videos, and — when he is the listing broker or the owner — the vault's other photos / videos too (his own listing, his choice).
 * Never documents (title deed, tax receipt, plans…), never a vault item shared with him by someone else.
 */
export function shareableMedia(u: { id: string }, p: Property) {
  const s = st();
  const principal = p.listingBrokerId === u.id || p.ownerId === u.id;
  const listed = live(p);
  const assets = (s.propertyMediaAssets || []).filter((a: any) => a.propertyId === p.id && a.status === 'ACTIVE' && (principal || (listed && a.sensitivity === 'PUBLIC')));
  const photos: string[] = []; const videos: string[] = [];
  const add = (arr: string[], u2: unknown) => { if (okMediaUrl(u2) && !arr.includes(u2)) arr.push(u2); };
  if (listed || principal) { (p.images || []).forEach(x => add(photos, x)); add(videos, (p as any).videoUrl); }
  assets.filter((a: any) => a.category === 'PHOTOGRAPH').forEach((a: any) => add(photos, a.fileUrl));
  assets.filter((a: any) => a.category === 'WALKTHROUGH_VIDEO').forEach((a: any) => add(videos, a.fileUrl));
  return { photos, videos };
}
/** the chosen media that is STILL shareable right now (a photo the owner removed or made private disappears) */
function chosenMedia(room: ClientRoom, item: ClientRoom['items'][number], p?: Property) {
  if (!p || !item.media) return { photos: [] as string[], videos: [] as string[] };
  const ok = shareableMedia({ id: room.brokerId }, p);
  return { photos: item.media.photos.filter(x => ok.photos.includes(x)), videos: item.media.videos.filter(x => ok.videos.includes(x)) };
}
const allMedia = (u: { id: string }, p: Property) => { const m = shareableMedia(u, p); return { photos: m.photos.slice(0, ROOM_MEDIA.maxPhotos), videos: m.videos.slice(0, ROOM_MEDIA.maxVideos), at: nowIso() }; };

// ───────────────────────────── v40: a visit booked from the room ─────────────────────────────
/** called by POST /api/site-visits when the broker books from a Client Room: his room, the client's mobile, a home of the room */
export function roomForVisit(u: UserProfile, b: { clientRoomId?: string; clientRoomItemId?: string; clientRoomRequestId?: string; propertyId: string; customerPhone?: string }):
  { error: string; status: number; code?: string } | { room: ClientRoom; item: ClientRoom['items'][number] } {
  const room = st().clientRooms.find(r => r.id === b.clientRoomId && r.brokerId === u.id);
  if (!room) return { error: 'Client room not found', status: 404 };
  if (room.status !== 'ACTIVE') return { error: 'This client room is closed', status: 409 };
  const item = b.clientRoomItemId ? room.items.find(i => i.id === b.clientRoomItemId) : room.items.find(i => i.propertyId === b.propertyId);
  if (!item || item.propertyId !== b.propertyId) return { error: 'This home is not in the client room', status: 400 };
  if (b.clientRoomRequestId && !item.visitRequests.some(v => v.id === b.clientRoomRequestId)) return { error: 'Visit request not found', status: 404 };
  const phone = phone10(b.customerPhone);
  if (!PHONE_RE.test(phone)) return { error: `Enter your client's full mobile number (ends with ${room.phoneLast4})`, status: 400, code: 'ROOM_PHONE_NEEDED' };
  if (!safeEqual(hmac('cr-phone', phone), room.phoneKey)) return { error: `This mobile does not match the client room — it must be the number that ends with ${room.phoneLast4}`, status: 400, code: 'ROOM_PHONE_MISMATCH' };
  return { room, item };
}
export function linkVisitToRoom(room: ClientRoom, item: ClientRoom['items'][number], requestId: string | undefined, visit: { id: string; scheduledTime: string }) {
  (item.visits ||= []).push({ visitId: visit.id, when: visit.scheduledTime, at: nowIso() });
  const req = requestId ? item.visitRequests.find(v => v.id === requestId) : item.visitRequests.find(v => v.status === 'REQUESTED');
  if (req) { req.status = 'HANDLED'; req.visitId = visit.id; }
  tell(room, 'विज़िट तय / Visit booked', 'तारीख़ और समय देखने के लिए खोलें / Open to see the date and time');
  ev(room, `Visit booked for ${new Date(visit.scheduledTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (${visit.id})`);
}

// ───────────────────────────── broker API ─────────────────────────────
/** v58 — whose rooms: a broker's own, or — for his office staff with the "client rooms" switch — the employer's (the rooms stay his) */
export const roomOwnerOf = (u: UserProfile) => (u.role === 'TEAM_MEMBER' && u.employerId ? u.employerId : u.id);
const isStaff = (u: UserProfile) => u.role === 'TEAM_MEMBER';
const actingAs = () => ({ id: roomOwnerOf(me()) });
const mine = (req: Request) => st().clientRooms.find(r => r.id === req.params.id && r.brokerId === roomOwnerOf(me()));
/** the employer's staff who may read his rooms (the client is told the office team can read the chat) */
export const roomTeam = (brokerId: string) => st().users.filter(m => m.role === 'TEAM_MEMBER' && m.employerId === brokerId && m.verificationStatus === 'VERIFIED' && !!m.teamPolicy?.rooms);
const unread = (r: ClientRoom) => r.messages.filter(m => m.from === 'CLIENT' && (!r.lastBrokerSeenAt || m.at > r.lastBrokerSeenAt)).length;
const openVisits = (r: ClientRoom) => r.items.reduce((n, i) => n + i.visitRequests.filter(v => v.status === 'REQUESTED').length, 0);

/** v63 — the client's full mobile: the broker who owns the room always; his office staff by the same "customer numbers" switch the client list uses */
const phoneAad = (r: ClientRoom) => `clientroom:${r.id}:phone`;
const sealPhone = (r: ClientRoom, phone: string) => { try { if (vaultReady()) r.phoneSealed = seal(phone, phoneAad(r)); } catch { /* no vault key: the room works with the last 4 only */ } };
const openPhone = (r: ClientRoom): string | undefined => { try { return r.phoneSealed ? unseal(r.phoneSealed, phoneAad(r)) : undefined; } catch { return undefined; } };
const phoneAccess = (u: UserProfile): 'FULL' | 'REVEAL' | 'HIDDEN' => !isStaff(u) ? 'FULL' : policyOf(db.byId('users', u.id) as UserProfile).phoneMode;

function summary(r: ClientRoom) {
  const last = r.messages[r.messages.length - 1];
  return {
    id: r.id, clientName: r.clientName, kind: r.kind, phoneLast4: r.phoneLast4, phoneSaved: !!r.phoneSealed && r.status === 'ACTIVE', createdById: r.createdById, createdByName: r.createdByName, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, expiresAt: r.expiresAt,
    items: r.items.length, propertyIds: r.items.map(i => i.propertyId), codeAsk: !!(r.status === 'ACTIVE' && r.otpPlain && r.otpExpires && Date.parse(r.otpExpires) > Date.now()), unread: unread(r), openVisits: openVisits(r), liked: r.items.filter(i => i.reaction === 'LIKE').length,
    lastMessage: last ? { from: last.from, text: last.text.slice(0, 80), at: last.at } : null, lastClientSeenAt: r.lastClientSeenAt,
  };
}
function detail(r: ClientRoom) {
  const props = st().properties;
  const awaiting = r.otpPlain && r.otpExpires && Date.parse(r.otpExpires) > Date.now() ? r.otpPlain : undefined;
  return {
    ...summary(r), note: r.note, messages: r.messages, events: r.events.slice(-30), docs: (r.docs || []).map(docView), docsOn: vaultReady(), fullAadhaar: { on: fullAadhaarOn(), asked: !!r.fullAadhaarAsk },
    ...(r.kind === 'OWNER' ? { propertyId: r.propertyId, propertyTitle: st().properties.find(p => p.id === r.propertyId)?.title, ownerStats: ownerStats(r) } : {}),
    items: r.items.map(i => {
      const p = props.find(x => x.id === i.propertyId);
      const avail = p ? shareableMedia({ id: r.brokerId }, p) : { photos: [], videos: [] };
      return { ...i, property: p ? publicProperty(p) : null, media: chosenMedia(r, i, p), mediaAvailable: { photos: avail.photos.length, videos: avail.videos.length } };
    }),
    /** only when no SMS gateway is set: the code the client has just asked for — the broker reads it out to him */
    codeForClient: awaiting, smsOn: smsOn(),
    /** v46 — the phones signed in to this room (labels only: "Android · Chrome") */
    devices: (r.devices || []).map(d => ({ id: d.id, label: d.label, firstAt: d.firstAt, lastAt: d.lastAt })), maxDevices: L.devices,
    /** v58 — the reader is the broker's office staff (no closing, no papers, no visit booking) */
    staff: (ctx().user as UserProfile | null)?.role === 'TEAM_MEMBER', createdByName: r.createdByName,
    /** v63 — FULL: `phone` is here; REVEAL: one tap (counted per day); HIDDEN: never. `phoneSaved` false = an older room (broker can add it once) */
    ...(() => { const u = ctx().user as UserProfile | null; const acc = u ? phoneAccess(u) : 'HIDDEN'; const has = !!r.phoneSealed && r.status === 'ACTIVE';
      return { phoneAccess: acc, phoneSaved: has, ...(acc === 'FULL' && has ? { phone: openPhone(r) } : {}) }; })(),
  };
}

export function createClientRoomRouter() {
  const r = Router();
  r.use(needs('clientroom:use'));

  /** v70 — my listings that have an ACTIVE mandate and no open owner room yet (what the "Owner room" form offers) */
  r.get('/owner-ready', (_req, res) => {
    const u = me(); if (isStaff(u)) return res.json({ success: true, homes: [] });
    const homes = st().ownerMandates.filter(m => m.brokerId === u.id && m.status === 'ACTIVE' && m.isConfirmed)
      .filter(m => !st().clientRooms.some(c => c.kind === 'OWNER' && c.propertyId === m.propertyId && c.brokerId === u.id && c.status === 'ACTIVE'))
      .map(m => { const p = st().properties.find(x => x.id === m.propertyId); const ph = phone10((p as any)?.ownerPhone); return p ? { id: p.id, title: p.title, ownerName: p.ownerName || '', ownerPhone: PHONE_RE.test(ph) && !/[xX•*]/.test(String((p as any).ownerPhone)) ? ph : '' } : null; }).filter(Boolean);
    res.json({ success: true, homes });
  });
  r.get('/', (_req, res) => {
    const list = st().clientRooms.filter(x => x.brokerId === roomOwnerOf(me())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const u = me();
    res.json({ success: true, rooms: list.map(summary), counts: { active: list.filter(x => x.status === 'ACTIVE').length, unread: list.reduce((n, x) => n + unread(x), 0), visits: list.reduce((n, x) => n + openVisits(x), 0) },
      ...(isStaff(u) ? { staffOf: (db.byId('users', roomOwnerOf(u)) as UserProfile | undefined)?.name || '' } : {}) });
  });

  r.post('/', rateLimit('cr-create', 40, 3600_000), (req: Request, res: Response) => {
    const u = me();
    const name = String(req.body?.clientName || '').trim().slice(0, 80);
    const phone = phone10(req.body?.phone);
    const kind = ROOM_KINDS.find(k => k.id === req.body?.kind && k.id !== 'OWNER')?.id || 'BUYER';
    if (name.length < 2) return bad(res, 'Enter your client\'s name');
    if (!PHONE_RE.test(phone)) return bad(res, 'Enter your client\'s 10-digit mobile number');
    if (req.body?.consent !== true) return bad(res, 'Confirm that your client agreed to receive properties and chat in this room');
    const owner = roomOwnerOf(u);
    if (st().clientRooms.filter(x => x.brokerId === owner && x.status === 'ACTIVE').length >= L.activeRooms) return bad(res, `You can keep ${L.activeRooms} client rooms open — close some old ones`);
    { const pb = partyBlock(phone, 'buyer'); if (pb) return res.status(403).json(pb); } // v35 — Network Watch
    const phoneKey = hmac('cr-phone', phone);
    if (st().clientRooms.some(x => x.brokerId === owner && x.status === 'ACTIVE' && x.phoneKey === phoneKey && x.kind !== 'OWNER')) return bad(res, 'You already have an open room for this mobile number', 409);
    const token = newToken();
    const room: ClientRoom = {
      id: rid('CRM'), brokerId: owner, clientName: name, kind, note: String(req.body?.note || '').trim().slice(0, 300) || undefined,
      ...(isStaff(u) ? { createdById: u.id, createdByName: u.name } : {}),
      phoneKey, phoneLast4: phone.slice(-4), tokenHash: sha(token), sessVersion: 1, status: 'ACTIVE',
      createdAt: nowIso(), updatedAt: nowIso(), expiresAt: new Date(Date.now() + L.linkDays * 86400_000).toISOString(),
      items: [], messages: [], events: [],
    };
    sealPhone(room, phone);
    ev(room, isStaff(u) ? `Room opened by ${u.name} (office team)` : 'Room opened');
    st().clientRooms.push(room);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', room.id, 'CLIENT_ROOM_OPENED', `Client room opened (${kind}), mobile ending ${room.phoneLast4}`);
    res.json({ success: true, room: detail(room), link: `/r/${token}`, watch: partyCaution(phone) || undefined });
  });

  r.get('/:id', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    res.json({ success: true, room: detail(room) });
  });

  r.post('/:id/items', rateLimit('cr-items', 120, 3600_000), (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    if (room.status !== 'ACTIVE') return bad(res, 'This room is closed', 409);
    const p = st().properties.find(x => x.id === String(req.body?.propertyId || ''));
    if (!p || !live(p)) return bad(res, 'That property is not available to share', 404);
    if (room.items.some(i => i.propertyId === p.id)) return bad(res, 'Already shared in this room', 409);
    if (room.items.length >= L.items) return bad(res, `A room can hold ${L.items} properties`);
    const note = stripPhones(String(req.body?.note || '').trim()).slice(0, 200) || undefined;
    const media = req.body?.withMedia === false ? undefined : allMedia(actingAs(), p);
    room.items.push({ id: rid('CRI'), propertyId: p.id, sharedAt: nowIso(), note, visitRequests: [], ...(media && (media.photos.length || media.videos.length) ? { media } : {}) });
    ev(room, `${isStaff(me()) ? `${me().name}: ` : ''}Shared ${p.id}${media && (media.photos.length || media.videos.length) ? ` with ${media.photos.length} photo(s)${media.videos.length ? ' + video' : ''}` : ''}`);
    db.save();
    tell(room, 'नई प्रॉपर्टी / A new property', 'आपके ब्रोकर ने आपके लिए एक प्रॉपर्टी जोड़ी / Your broker added a property for you');
    res.json({ success: true, room: detail(room) });
  });

  /** v40 — the photos / videos the broker may show for one home, and what he chose */
  r.get('/:id/items/:itemId/media', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    const it = room.items.find(i => i.id === req.params.itemId); if (!it) return bad(res, 'Not found', 404);
    const p = st().properties.find(x => x.id === it.propertyId); if (!p) return bad(res, 'Property not found', 404);
    const avail = shareableMedia(actingAs(), p);
    res.json({ success: true, available: { photos: avail.photos, videos: avail.videos.map(url => ({ url, kind: videoKind(url) })) }, chosen: chosenMedia(room, it, p), limits: ROOM_MEDIA });
  });
  r.put('/:id/items/:itemId/media', rateLimit('cr-media', 120, 3600_000), (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    if (room.status !== 'ACTIVE') return bad(res, 'This room is closed', 409);
    const it = room.items.find(i => i.id === req.params.itemId); if (!it) return bad(res, 'Not found', 404);
    const p = st().properties.find(x => x.id === it.propertyId); if (!p || !live(p)) return bad(res, 'That property is not available to share', 404);
    const photos = Array.isArray(req.body?.photos) ? req.body.photos.map(String) : [];
    const videos = Array.isArray(req.body?.videos) ? req.body.videos.map(String) : [];
    if (photos.length > ROOM_MEDIA.maxPhotos) return bad(res, `Share at most ${ROOM_MEDIA.maxPhotos} photos per home`);
    if (videos.length > ROOM_MEDIA.maxVideos) return bad(res, `Share at most ${ROOM_MEDIA.maxVideos} videos per home`);
    const avail = shareableMedia(actingAs(), p);
    if (!photos.every((x: string) => avail.photos.includes(x)) || !videos.every((x: string) => avail.videos.includes(x))) return bad(res, 'You can share only this listing\'s own photos and videos', 400, { code: 'MEDIA_NOT_SHAREABLE' });
    it.media = { photos: [...new Set<string>(photos)], videos: [...new Set<string>(videos)], at: nowIso() };
    ev(room, `Photos & video of ${p.id}: ${it.media.photos.length} photo(s)${it.media.videos.length ? `, ${it.media.videos.length} video(s)` : ''}`);
    db.save();
    res.json({ success: true, room: detail(room) });
  });

  r.delete('/:id/items/:itemId', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    const i = room.items.findIndex(x => x.id === req.params.itemId);
    if (i < 0) return bad(res, 'Not found', 404);
    room.items.splice(i, 1); ev(room, 'A property was taken out'); db.save();
    res.json({ success: true, room: detail(room) });
  });

  r.post('/:id/messages', rateLimit('cr-msg-b', 300, 3600_000), (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    if (room.status !== 'ACTIVE') return bad(res, 'This room is closed', 409);
    const text = String(req.body?.text || '').trim();
    if (!text) return bad(res, 'Write a message');
    if (text.length > L.textChars) return bad(res, `Keep it under ${L.textChars} characters`);
    if (containsPhone(text)) return bad(res, PHONE_IN_CHAT_MSG.en, 400, { code: 'PHONE_IN_CHAT', hi: PHONE_IN_CHAT_MSG.hi });
    if (room.messages.length >= L.messages) return bad(res, 'This chat is full — open a new room or close this one');
    const u = me();
    room.messages.push({ id: rid('CRX'), from: 'BROKER', text, at: nowIso(), propertyId: validPropRef(room, req.body?.propertyId), ...(isStaff(u) ? { byId: u.id, byName: u.name } : {}) });
    room.lastBrokerSeenAt = nowIso(); ev(room, isStaff(u) ? `${u.name} (office team) wrote` : 'Broker wrote');
    db.save();
    tell(room, 'आपके ब्रोकर का संदेश / Message from your broker', 'पढ़ने के लिए खोलें / Tap to read');
    res.json({ success: true, room: detail(room) });
  });

  r.post('/:id/read', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    room.lastBrokerSeenAt = nowIso(); db.save();
    res.json({ success: true });
  });

  r.post('/:id/visit/:itemId/:vid/handled', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    const v = room.items.find(i => i.id === req.params.itemId)?.visitRequests.find(x => x.id === req.params.vid);
    if (!v) return bad(res, 'Not found', 404);
    v.status = 'HANDLED'; ev(room, 'A visit request was handled'); db.save();
    res.json({ success: true, room: detail(room) });
  });

  /** a fresh link: the old one stops working and the client signs in again */
  r.post('/:id/link', rateLimit('cr-link', 40, 3600_000), (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    if (room.status !== 'ACTIVE') return bad(res, 'This room is closed', 409);
    const token = newToken();
    room.tokenHash = sha(token); room.sessVersion += 1; room.otpHash = undefined; room.otpPlain = undefined; room.otpExpires = undefined;
    room.devices = []; room.linkAt = nowIso(); dropRoomPush(room.id); // the old link is dead — so are the alerts that opened it
    room.expiresAt = new Date(Date.now() + L.linkDays * 86400_000).toISOString();
    ev(room, 'New link made — the old link stopped working'); db.save();
    db.appendAuditEvent(me().id, me().role, 'LEAD', room.id, 'CLIENT_ROOM_LINK_RENEWED', 'Client room link renewed');
    res.json({ success: true, link: `/r/${token}`, room: detail(room) });
  });

  /** v46 — remove one of the client's phones: it is signed out at once and the slot is free for another phone */
  r.delete('/:id/devices/:dev', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    const d = (room.devices || []).find(x => x.id === req.params.dev); if (!d) return bad(res, 'That phone is not signed in to this room', 404);
    room.devices = (room.devices || []).filter(x => x.id !== d.id);
    ev(room, `Broker removed a phone from the room (${d.label})`); db.save();
    db.appendAuditEvent(me().id, me().role, 'LEAD', room.id, 'CLIENT_ROOM_DEVICE_REMOVED', `Client room phone removed (${d.label})`);
    res.json({ success: true, room: detail(room) });
  });

  /** v63 — office staff on "tap to reveal": one number at a time, counted against the same daily cap as the client list */
  r.post('/:id/phone/reveal', rateLimit('cr-phone-reveal', 200, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    const acc = phoneAccess(u);
    if (acc === 'HIDDEN') return bad(res, 'Your employer has not allowed you to see customer numbers', 403);
    const phone = room.status === 'ACTIVE' ? openPhone(room) : undefined;
    if (!phone) return bad(res, 'The full number is not saved for this room', 404, { code: 'NO_PHONE' });
    if (acc === 'REVEAL') {
      const pol = policyOf(db.byId('users', u.id) as UserProfile); const s = st();
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const today = s.leadReveals.filter(x => x.userId === u.id && Date.parse(x.at) >= start.getTime());
      if (!today.some(x => x.leadId === room.id)) {
        if (today.length >= pol.revealCap) return bad(res, `Daily limit of ${pol.revealCap} number reveals reached — ask your employer`, 429);
        s.leadReveals.unshift({ id: rid('RV'), employerId: u.employerId!, userId: u.id, userName: u.name, leadId: room.id, at: nowIso() } as any);
        if (s.leadReveals.length > 5000) s.leadReveals.length = 5000;
        db.save();
        db.appendAuditEvent(u.id, u.role, 'LEAD', room.id, 'CLIENT_ROOM_PHONE_REVEALED', `${u.name} revealed the mobile of a client room (ending ${room.phoneLast4})`);
      }
    }
    res.json({ success: true, phone });
  });

  /** v63 — older rooms (opened before v63) only know the last 4: the broker types the number once; it must match the room's key */
  r.put('/:id/phone', rateLimit('cr-phone-save', 60, 3600_000), (req: Request, res: Response) => {
    const u = me(); if (isStaff(u)) return bad(res, 'Only the broker can add the number', 403);
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    if (room.status !== 'ACTIVE') return bad(res, 'This room is closed', 409);
    const phone = phone10(req.body?.phone);
    if (!PHONE_RE.test(phone)) return bad(res, 'Enter your client\'s 10-digit mobile number');
    if (!safeEqual(hmac('cr-phone', phone), room.phoneKey)) return bad(res, `This is not the number of this room (it ends with ${room.phoneLast4})`, 400, { code: 'ROOM_PHONE_MISMATCH' });
    if (!vaultReady()) return bad(res, 'The server has no key to keep the number safely', 503);
    sealPhone(room, phone); db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', room.id, 'CLIENT_ROOM_PHONE_SAVED', `Client room mobile saved (ending ${room.phoneLast4})`);
    res.json({ success: true, room: detail(room) });
  });

  /** v69 — a file the client sent. KYC copies only the broker opens (never his office staff); every open is counted and written to the audit trail. */
  /** v70 — the room of a property OWNER: only for a property of this broker whose mandate is ACTIVE (both signed). The broker types the owner's mobile. */
  r.post('/owner', rateLimit('cr-owner-create', 30, 3600_000), (req: Request, res: Response) => {
    const u = me();
    if (isStaff(u)) return bad(res, 'Owner rooms are opened by the broker himself', 403);
    const prop = st().properties.find(p => p.id === String(req.body?.propertyId || ''));
    if (!prop || prop.listingBrokerId !== u.id) return bad(res, 'Choose one of your own listings', 404);
    const m = st().ownerMandates.find(x => x.propertyId === prop.id && x.brokerId === u.id && x.status === 'ACTIVE' && x.isConfirmed);
    if (!m) return bad(res, 'The owner room opens only after the owner mandate for this property is signed by both of you (active)', 409, { code: 'NO_MANDATE' });
    const phone = phone10(req.body?.phone);
    const name = String(req.body?.ownerName || '').trim().slice(0, 80) || prop.ownerName || 'Owner';
    if (!PHONE_RE.test(phone)) return bad(res, 'Enter the owner\'s 10-digit mobile number');
    if (req.body?.consent !== true) return bad(res, 'Confirm that the owner agreed to use this room');
    if (st().clientRooms.some(x => x.kind === 'OWNER' && x.propertyId === prop.id && x.brokerId === u.id && x.status === 'ACTIVE')) return bad(res, 'This property already has an open owner room', 409);
    if (st().clientRooms.filter(x => x.brokerId === u.id && x.status === 'ACTIVE').length >= L.activeRooms) return bad(res, `You can keep ${L.activeRooms} rooms open — close some old ones`);
    const token = newToken();
    const room: ClientRoom = {
      id: rid('CRM'), brokerId: u.id, clientName: name, kind: 'OWNER', propertyId: prop.id, mandateId: m.id,
      phoneKey: hmac('cr-phone', phone), phoneLast4: phone.slice(-4), tokenHash: sha(token), sessVersion: 1, status: 'ACTIVE',
      createdAt: nowIso(), updatedAt: nowIso(), expiresAt: new Date(Date.now() + L.linkDays * 86400_000).toISOString(),
      items: [], messages: [], events: [],
    };
    sealPhone(room, phone);
    ev(room, `Owner room opened for ${prop.id} (mandate ${m.id})`);
    st().clientRooms.push(room); db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', room.id, 'OWNER_ROOM_OPENED', `Owner room opened for ${prop.id}, mobile ending ${room.phoneLast4}`);
    res.json({ success: true, room: detail(room), link: `/r/${token}` });
  });
  /** v70 — ask this client for his FULL Aadhaar (a paper is being made). Refused while the server switch is off. */
  r.post('/:id/full-aadhaar', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    if (isStaff(me())) return bad(res, 'Only the broker can ask for ID papers', 403);
    if (!fullAadhaarOn()) return bad(res, 'Full Aadhaar is switched off on this server (pending the advocate’s opinion). Ask for the masked Aadhaar instead.', 403, { code: 'FULL_AADHAAR_OFF' });
    room.fullAadhaarAsk = req.body?.ask !== false;
    ev(room, room.fullAadhaarAsk ? 'Broker asked for the full Aadhaar (for a paper being made)' : 'Broker withdrew the full-Aadhaar request');
    room.messages.push({ id: rid('CRX'), from: 'BROKER', text: room.fullAadhaarAsk ? '🪪 काग़ज़ बनाने के लिए पूरा आधार चाहिए — नीचे “काग़ज़ भेजें” में चुनकर भेजें। 7 दिन बाद यह अपने आप मिट जाएगा।' : 'पूरा आधार अब नहीं चाहिए।', at: nowIso() });
    db.save(); tell(room, 'Message from your broker', 'Open your room.');
    res.json({ success: true, room: detail(room) });
  });
  r.get('/:id/docs/:docId', rateLimit('cr-doc-open', 200, 3600_000), (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    const d = (room.docs || []).find(x => x.id === req.params.docId); if (!d) return bad(res, 'Not found', 404);
    if (isKycKind(d.kind) && isStaff(me())) return bad(res, 'ID copies are opened by the broker only', 403, { code: 'KYC_BROKER_ONLY' });
    let buf: Buffer;
    try { buf = Buffer.from(unseal(fs.readFileSync(docFile(room.id, d.id), 'utf8'), docAad(room.id, d.id)), 'base64'); } catch { return bad(res, 'This file can no longer be opened', 410); }
    d.openedByBroker = (d.openedByBroker || 0) + 1; ev(room, `${me().name} opened a file the client sent (${d.kind})`); db.save();
    db.appendAuditEvent(me().id, me().role, 'LEAD', room.id, 'CLIENT_DOC_OPENED', `Client-room file ${d.id} (${d.kind}) opened`);
    res.set({ 'Content-Type': d.mime, 'Content-Disposition': `inline; filename="${d.id}.${d.mime === 'application/pdf' ? 'pdf' : d.mime === 'image/png' ? 'png' : d.mime === 'image/webp' ? 'webp' : 'jpg'}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'" });
    res.send(buf);
  });
  r.delete('/:id/docs/:docId', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    const d = (room.docs || []).find(x => x.id === req.params.docId); if (!d) return bad(res, 'Not found', 404);
    if (isKycKind(d.kind) && isStaff(me())) return bad(res, 'ID copies are removed by the broker only', 403, { code: 'KYC_BROKER_ONLY' });
    try { fs.rmSync(docFile(room.id, d.id), { force: true }); } catch { /* already gone */ }
    room.docs = (room.docs || []).filter(x => x.id !== d.id); ev(room, `${me().name} removed a file the client sent`); db.save();
    db.appendAuditEvent(me().id, me().role, 'LEAD', room.id, 'CLIENT_DOC_REMOVED', `Client-room file ${d.id} (${d.kind}) removed`);
    res.json({ success: true, room: detail(room) });
  });

  r.post('/:id/close', (req: Request, res: Response) => {
    const room = mine(req); if (!room) return bad(res, 'Room not found', 404);
    if (isStaff(me())) return bad(res, 'Only the broker can close a client room', 403, { code: 'STAFF_CANNOT_CLOSE' });
    room.status = 'CLOSED'; room.closedAt = nowIso(); room.tokenHash = sha(crypto.randomBytes(8).toString('hex')); room.sessVersion += 1; room.devices = []; room.otpHash = undefined; room.otpPlain = undefined; room.phoneSealed = undefined; eraseRoomFiles(room);
    ev(room, 'Room closed'); db.save();
    db.appendAuditEvent(me().id, me().role, 'LEAD', room.id, 'CLIENT_ROOM_CLOSED', 'Client room closed');
    res.json({ success: true, room: detail(room) });
  });
  return r;
}

const validPropRef = (room: ClientRoom, id: unknown) => { const s = String(id || ''); return room.items.some(i => i.propertyId === s) ? s : undefined; };
/** broker pushes: only when the client has an account-free session already; the push is to the BROKER, so it never carries chat text */
function pushIfSeen(_room: ClientRoom) { /* the client has no app: the broker sends the link on WhatsApp */ }

// ───────────────────────────── v69 — the client's phones (alerts) and the papers he sends ─────────────────────────────
const tell = (room: ClientRoom, title: string, body: string) => { void pushToRoom(room.id, title, body, `room-${room.id}`); };
const DOCDIR = (roomId: string) => path.resolve(process.cwd(), 'data', 'clientdocs', roomId.replace(/[^A-Za-z0-9-]/g, ''));
const docFile = (roomId: string, docId: string) => path.join(DOCDIR(roomId), docId.replace(/[^A-Za-z0-9-]/g, '') + '.bin');
const docAad = (roomId: string, docId: string) => `clientroom:${roomId}:doc:${docId}`;
/** DPDP — every file the client sent leaves the disk when the room closes or runs out (and the alerts to his phones stop) */
function eraseRoomFiles(room: ClientRoom) {
  try { fs.rmSync(DOCDIR(room.id), { recursive: true, force: true }); } catch { /* nothing there */ }
  room.docs = [];
  dropRoomPush(room.id);
}
const docView = (d: NonNullable<ClientRoom['docs']>[number]) => ({ id: d.id, kind: d.kind, kyc: isKycKind(d.kind), name: d.name, mime: d.mime, size: d.size, at: d.at, note: d.note, opened: d.openedByBroker || 0 });
/** v70 — full Aadhaar is OFF on every server until the advocate says yes: set FULL_AADHAAR_OK=1 to allow a broker to ask for it */
export const fullAadhaarOn = () => process.env.FULL_AADHAAR_OK === '1';
/** v70 — set by server.ts: marks a site visit verified (the same step the on-site OTP / QR check-in takes) */
let verifyVisit: ((visit: any, method: 'OTP' | 'QR', note: string) => void) | null = null;
export const setVisitVerifier = (fn: typeof verifyVisit) => { verifyVisit = fn; };
/** v70 — what a property owner may see: NUMBERS only (never who). Counts the broker's own clients' rooms, QR-page interest and enquiries on this property. */
export function ownerStats(room: ClientRoom) {
  const s = st(); const pid = room.propertyId || '';
  const shown = s.clientRooms.filter(c => c.kind !== 'OWNER' && c.status === 'ACTIVE' && c.items.some(i => i.propertyId === pid));
  const likes = shown.filter(c => c.items.some(i => i.propertyId === pid && i.reaction === 'LIKE')).length;
  const qr = (s.partnerLeads || []).filter((l: any) => l.homeId === pid).length;
  const enq = (s.pageEnquiries || []).filter(e => e.propertyId === pid && e.status !== 'SPAM').length;
  const visits = s.siteVisits.filter(v => v.propertyId === pid);
  return { viewing: shown.length + qr + enq, interested: likes + qr + enq, visitsPlanned: visits.filter(v => !v.isVerified && Date.parse(v.scheduledTime) > Date.now() - 12 * 3600_000).length, visitsDone: visits.filter(v => v.isVerified).length };
}
const pingBroker = (room: ClientRoom, title: string, body: string) => {
  void pushTo(room.brokerId, { kind: 'deals', title, body, url: '/?tab=clientroom' });
  for (const m of roomTeam(room.brokerId)) void pushTo(m.id, { kind: 'deals', title, body, url: '/?tab=clientroom' }); // v58 — his office staff who work the rooms
};

// ───────────────────────────── the client's page (no login: link + mobile OTP) ─────────────────────────────
const SESS_COOKIE = 'genz_cr';
/**
 * v46 — one cookie per room per phone: `<deviceId>.<exp>.<sig>`. The signature covers the room, its link version, the device and the
 * expiry. It lives for the room's whole life (Max-Age), but the session inside it is good only till `exp` (60 days, renewed on every
 * visit) — so a phone whose session lapsed still keeps its device slot and does not count as a new phone.
 * A device the broker removed, a new link (sessVersion) or a closed room → the cookie stops working.
 */
const sessSig = (r: ClientRoom, dev: string, exp: number) => hmac('cr-sess', `${r.id}|${r.sessVersion}|${dev}|${exp}`);
const cookieOf = (req: Request, r: ClientRoom): { dev: string; exp: number } | null => {
  const raw = parseCookies(req.headers.cookie)[`${SESS_COOKIE}_${r.id}`]; if (!raw) return null;
  const [dev, exp, sig] = raw.split('.'); const e = Number(exp);
  if (!dev || !/^[a-f0-9]{12}$/.test(dev) || !Number.isFinite(e) || !sig || !safeEqual(sig, sessSig(r, dev, e))) return null;
  return { dev, exp: e };
};
/** the device id of a still-valid session on this phone (null = must sign in) */
const sessionFor = (req: Request, r: ClientRoom): string | null => {
  const c = cookieOf(req, r);
  if (!c || c.exp <= Date.now()) return null;
  return (r.devices || []).some(d => d.id === c.dev) ? c.dev : null;
};
/** a phone that signed in before (its slot is still there), even if its session has lapsed */
const knownDevice = (req: Request, r: ClientRoom): string | null => {
  const c = cookieOf(req, r);
  return c && (r.devices || []).some(d => d.id === c.dev) ? c.dev : null;
};
const deviceLabel = (ua: unknown) => {
  const u = String(ua || '');
  const os = /iPhone|iPad/i.test(u) ? 'iPhone' : /Android/i.test(u) ? 'Android' : /Windows/i.test(u) ? 'Windows' : /Mac OS/i.test(u) ? 'Mac' : 'Phone';
  const br = /SamsungBrowser/i.test(u) ? 'Samsung Internet' : /CriOS|Chrome/i.test(u) ? 'Chrome' : /FxiOS|Firefox/i.test(u) ? 'Firefox' : /Safari/i.test(u) ? 'Safari' : 'browser';
  return `${os} · ${br}`;
};
const lifeEnd = (r: ClientRoom) => Date.parse(r.linkAt || r.createdAt) + L.maxLifeDays * 86400_000;
function setSession(req: Request, res: Response, r: ClientRoom, dev: string) {
  const exp = Math.min(Date.now() + L.sessionDays * 86400_000, lifeEnd(r));
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  const maxAge = Math.max(60, Math.round((lifeEnd(r) - Date.now()) / 1000));
  res.append('Set-Cookie', `${SESS_COOKIE}_${r.id}=${dev}.${exp}.${sessSig(r, dev, exp)}; Path=/r; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}
/** every visit: the session and the link slide forward (never past the room's maximum life) */
function slide(req: Request, res: Response, r: ClientRoom, dev: string) {
  const c = cookieOf(req, r);
  if (!c || c.exp - Date.now() < (L.sessionDays - 1) * 86400_000) setSession(req, res, r, dev);
  const d = (r.devices || []).find(x => x.id === dev); if (d) d.lastAt = nowIso();
  const want = Math.min(Date.now() + L.linkDays * 86400_000, lifeEnd(r));
  if (want > Date.parse(r.expiresAt)) r.expiresAt = new Date(want).toISOString();
}
const FULL_DEVICES = 'इस रूम में पहले से 2 फ़ोन जुड़े हैं। नए फ़ोन के लिए अपने ब्रोकर से पुराना फ़ोन हटवाएँ। / This room is already open on 2 phones. Ask your broker to remove one first.';

const CSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f2;color:#1b1b1b}.w{max-width:620px;margin:0 auto;padding:14px}
.top{background:#14213d;color:#fff;border-radius:16px;padding:16px}.top h1{margin:0 0 4px;font-size:18px}.top p{margin:0;opacity:.85;font-size:13px}
.card{background:#fff;border-radius:14px;padding:14px;margin-top:12px;box-shadow:0 1px 2px rgba(0,0,0,.06)}.warn{background:#fff6e5}.ok{background:#e9f7ee}
p.t{font-size:14px;line-height:1.55;margin:6px 0}p.h{font-size:15px;line-height:1.6;margin:6px 0}small,.small{color:#666;font-size:12px}
label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}input[type=text],input[type=tel],input[type=datetime-local],textarea{width:100%;padding:12px;border:1px solid #bbb;border-radius:10px;font-size:16px;font-family:inherit}
button,.btn{display:inline-block;padding:11px 16px;border-radius:11px;border:0;font-size:15px;font-weight:700;background:#14213d;color:#fff;text-decoration:none;cursor:pointer}.g{background:#1fa855}.l{background:#eee;color:#222}
.prop{display:flex;gap:10px}.prop img{width:96px;height:96px;object-fit:cover;border-radius:10px;flex:none;background:#eee}.price{font-weight:800;font-size:16px}.tag{display:inline-block;background:#eef1f7;border-radius:99px;padding:2px 8px;font-size:11px;margin:2px 3px 0 0}
.chat{max-height:340px;overflow:auto;display:flex;flex-direction:column;gap:6px;padding:4px 0}.m{max-width:85%;padding:8px 11px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-break:break-word}.mc{align-self:flex-end;background:#dff3e5}.mb{align-self:flex-start;background:#eef1f7}.m small{display:block;margin-top:3px}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.gal{display:flex;gap:6px;overflow-x:auto;margin-top:10px;padding-bottom:4px;scroll-snap-type:x mandatory}.gal img{width:150px;height:110px;object-fit:cover;border-radius:10px;flex:none;background:#eee;scroll-snap-align:start}.vid{position:relative;margin-top:10px;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:16/9}.vid iframe,.vid video{position:absolute;inset:0;width:100%;height:100%;border:0}.sold{opacity:.6}details summary{cursor:pointer;font-size:13px;font-weight:600;margin-top:8px}h2{font-size:15px;margin:16px 4px 0}
.wm{position:fixed;inset:-20%;pointer-events:none;z-index:50;display:flex;flex-wrap:wrap;gap:60px 40px;align-content:space-around;justify-content:space-around;transform:rotate(-24deg);opacity:.07;font-size:15px;font-weight:800;color:#000;user-select:none}`;

function shell(title: string, body: string, lang = 'hi', head = '') {
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" type="image/png" href="/icon-192.png">${head}<title>${esc(title)}</title><style>${CSS}</style></head><body><div class="w">${body}</div><script src="/r/cr.js" defer></script></body></html>`;
}
const CR_JS = `(function(){var TOK=(location.pathname.match(/^\\/r\\/([A-Za-z0-9_-]+)/)||[])[1]||'';var im=document.querySelectorAll('.prop img,.gal img');for(var i=0;i<im.length;i++){(function(e){var h=function(){e.style.display='none'};e.addEventListener('error',h);if(e.complete&&e.naturalWidth===0)h()})(im[i])}
var c=document.getElementById('chat-box');if(c){c.scrollTop=c.scrollHeight}
var f=document.getElementById('msgtext');if(f&&document.body.getAttribute('data-live')==='1'){setInterval(function(){if(document.hidden)return;if(f.value&&f.value.length>0)return;if(document.activeElement&&document.activeElement.tagName==='INPUT')return;location.reload()},30000)}
function $(i){return document.getElementById(i)}
// v69 — the room as an app: service worker, "add to home", alerts, sending papers
var sw=null;if('serviceWorker' in navigator&&TOK&&$('app-card')){navigator.serviceWorker.register('/sw.js').then(function(r){sw=r;setup()}).catch(function(){setup()})}else{setup()}
var dip=null;window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();dip=e;var b=$('app-install');if(b)b.style.display='inline-block'});
function standalone(){return window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}
function setup(){var c=$('app-card');if(!c)return;if(standalone()){var i=$('app-install');if(i)i.style.display='none';var ih=$('app-ios');if(ih)ih.style.display='none'}
var ios=/iphone|ipad|ipod/i.test(navigator.userAgent);if(ios&&!standalone()&&$('app-ios'))$('app-ios').style.display='block';
var bi=$('app-install');if(bi)bi.addEventListener('click',function(){if(dip){dip.prompt();dip=null;bi.style.display='none'}});
var bp=$('app-push');var can='Notification' in window&&'PushManager' in window&&'serviceWorker' in navigator&&(!ios||standalone());
if(bp&&can){bp.style.display='inline-block';if(Notification.permission==='granted'){reg(true)}bp.addEventListener('click',function(){reg(false)})}else if(bp&&ios&&!standalone()){/* iPhone needs the app on the home screen first */}
}
function b64(s){var p='='.repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o}
function reg(quiet){var bp=$('app-push');var m=$('app-push-msg');navigator.serviceWorker.ready.then(function(r){return Notification.requestPermission().then(function(p){if(p!=='granted'){if(m)m.textContent='अलर्ट बंद हैं — फ़ोन की सेटिंग में अनुमति दें। / Alerts are off — allow them in the phone settings.';return}
return fetch('/api/push/key').then(function(x){return x.json()}).then(function(k){if(!k.publicKey){if(m)m.textContent='अलर्ट अभी चालू नहीं हैं। / Alerts are not on yet.';return}
return r.pushManager.getSubscription().then(function(sub){return sub||r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(k.publicKey)})}).then(function(sub){var j=sub.toJSON();return fetch('/r/'+TOK+'/push',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})}).then(function(x){if(x.ok){if(bp)bp.style.display='none';if(m)m.textContent='🔔 अलर्ट चालू हैं / Alerts are on'}else if(m&&!quiet)m.textContent='अलर्ट चालू नहीं हो पाए — दोबारा कोशिश करें। / Could not turn alerts on — try again.'})})})})}).catch(function(){if(m&&!quiet)m.textContent='इस फ़ोन पर अलर्ट नहीं चल सकते। / Alerts do not work on this phone.'})}
// sending a paper / photo / ID copy: a photo is made smaller on the phone first
var df=$('docform');if(df){df.addEventListener('submit',function(e){e.preventDefault();var msg=$('docmsg'),f=$('docfile').files[0];if(!f){msg.textContent='फ़ाइल चुनें। / Choose a file.';return}
if(!$('docok').checked){msg.textContent='सहमति पर टिक करें। / Please tick the consent.';return}
var btn=df.querySelector('button[type=submit]');btn.disabled=true;msg.textContent='भेज रहे हैं… / Sending…';
var send=function(data,name,mime){fetch('/r/'+TOK+'/doc',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:$('dockind').value,name:name,data:data,note:$('docnote').value,consent:true})}).then(function(x){return x.json().then(function(j){return{ok:x.ok,j:j}})}).then(function(r){if(r.ok){location.href='/r/'+TOK+'?doc=1#docs'}else{btn.disabled=false;msg.textContent=(r.j&&r.j.error)||'नहीं भेज पाए। / Could not send.'}}).catch(function(){btn.disabled=false;msg.textContent='नेटवर्क की दिक्कत — दोबारा कोशिश करें। / Network problem — try again.'})};
if(f.type==='application/pdf'){if(f.size>2400000){btn.disabled=false;msg.textContent='PDF 2.4 MB से छोटी हो। / The PDF must be under 2.4 MB.';return}var fr=new FileReader();fr.onload=function(){send(String(fr.result).split(',')[1],f.name,f.type)};fr.readAsDataURL(f);return}
var url=URL.createObjectURL(f),im=new Image();im.onload=function(){var k=Math.min(1,1600/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(im.width*k));cv.height=Math.max(1,Math.round(im.height*k));cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);var d=cv.toDataURL('image/jpeg',0.8);URL.revokeObjectURL(url);send(d.split(',')[1],f.name,'image/jpeg')};im.onerror=function(){btn.disabled=false;msg.textContent='यह फ़ोटो पढ़ी नहीं जा सकी। / This photo could not be read.'};im.src=url})}
var sbtn=$('scan-btn');if(sbtn){var sm=$('scan-msg');function sendScan(c){sm.textContent='जाँच रहे हैं… / Checking…';fetch('/r/'+TOK+'/scan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:c})}).then(function(x){return x.json().then(function(j){return{ok:x.ok,j:j}})}).then(function(r){sm.textContent=r.ok?'✅ विज़िट पक्की हो गई ('+(r.j.who||'')+') / Visit confirmed':((r.j&&r.j.error)||'नहीं हो पाया। / Could not confirm.');if(r.ok){setTimeout(function(){location.reload()},1800)}}).catch(function(){sm.textContent='नेटवर्क की दिक्कत। / Network problem.'})}
var sg=$('scan-go');if(sg)sg.addEventListener('click',function(){sendScan($('scan-code').value)});
sbtn.addEventListener('click',function(){if(!('BarcodeDetector' in window)||!navigator.mediaDevices){sm.textContent='इस फ़ोन में स्कैनर नहीं है — नीचे 6 अंकों का कोड डालें। / No scanner on this phone — type the 6-digit code below.';return}
var vid=$('scan-video');navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}}).then(function(st){vid.srcObject=st;vid.style.display='block';vid.play();var det=new BarcodeDetector({formats:['qr_code']}),done=false;(function loop(){if(done)return;det.detect(vid).then(function(b){if(b&&b.length){done=true;st.getTracks().forEach(function(t){t.stop()});vid.style.display='none';sendScan(b[0].rawValue)}else setTimeout(loop,300)}).catch(function(){setTimeout(loop,500)})})()}).catch(function(){sm.textContent='कैमरा नहीं खुला — कोड डालें। / Camera did not open — type the code.'})})}
var dl=document.querySelectorAll('[data-deldoc]');for(var j=0;j<dl.length;j++){(function(b){b.addEventListener('click',function(){if(!confirm('यह फ़ाइल हटाएँ? / Remove this file?'))return;fetch('/r/'+TOK+'/doc/'+b.getAttribute('data-deldoc')+'/delete',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(function(){location.href='/r/'+TOK+'#docs'})})})(dl[j])}
})();`;

/**
 * v55 — the client's view-only paper viewer (vanilla JS, served from /r/pv.js because the page allows only 'self' scripts).
 * Every page is drawn on a canvas with the client's own stamp tiled across it, his initials large in the middle and a band at the bottom.
 * The page blurs when it loses focus; save / print / copy shortcuts and the long-press / right-click menu are blocked.
 * Honest limit: a web page cannot stop a screenshot or a second phone's camera — the stamp shows whose copy it was.
 */
const PV_JS = `(function(){var R=document.getElementById('pv');if(!R)return;var T=JSON.parse(R.getAttribute('data-t')||'[]'),B=R.getAttribute('data-base')||'',W=R.getAttribute('data-wm')||'',H=document.getElementById('pv-pages'),C=document.getElementById('pv-cover');
function st(img){var c=document.createElement('canvas'),k=Math.min(1,1200/img.width);c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));var g=c.getContext('2d'),w=c.width,h=c.height;g.drawImage(img,0,0,w,h);
var ini=(W.split(' · ')[0]||'').slice(0,8);if(ini){g.save();g.globalAlpha=0.13;g.fillStyle='#b91c1c';g.textAlign='center';g.textBaseline='middle';g.font='800 '+Math.round(Math.min(w,h)/3.2)+'px system-ui,sans-serif';g.translate(w/2,h/2);g.rotate(-Math.PI/7);g.fillText(ini,0,0);g.restore()}
var sz=Math.max(15,Math.round(Math.min(w,h*1.4)/24)),line=W+' · GENZ';g.save();g.translate(w/2,h/2);g.rotate(-Math.PI/7);g.translate(-w/2,-h/2);g.font='700 '+sz+'px system-ui,sans-serif';g.textBaseline='middle';var sx=Math.round(g.measureText(line).width+sz*2.2),sy=Math.round(sz*3.6),row=0;
for(var y=-h;y<h*2;y+=sy,row++){for(var x=-w-(row%2)*(sx/2);x<w*2;x+=sx){g.globalAlpha=0.42;g.lineWidth=Math.max(2,sz/7);g.strokeStyle='#fff';g.strokeText(line,x,y);g.globalAlpha=0.34;g.fillStyle='#b91c1c';g.fillText(line,x,y)}}g.restore();
var band=Math.round(sz*2.3);g.globalAlpha=0.86;g.fillStyle='#0f172a';g.fillRect(0,h-band,w,band);g.globalAlpha=1;g.fillStyle='#fff';g.textBaseline='middle';var f='GENZ · View only — '+W+' · do not forward',fs=Math.round(sz*0.8);g.font='700 '+fs+'px system-ui,sans-serif';while(fs>9&&g.measureText(f).width>w-20){fs--;g.font='700 '+fs+'px system-ui,sans-serif'}g.fillText(f,10,h-band/2);return c}
function nx(i){if(i>=T.length)return;var im=new Image();im.onload=function(){var c=st(im);c.style.cssText='width:100%;height:auto;display:block;margin-bottom:10px;border-radius:6px;pointer-events:none';H.appendChild(c);nx(i+1)};im.onerror=function(){var p=document.createElement('p');p.className='t';p.textContent='यह पेज लोड नहीं हुआ — पेज दोबारा खोलें / This page could not load — open again';H.appendChild(p);nx(i+1)};im.src=B+T[i]}nx(0);
function hd(){var x=document.visibilityState!=='visible'||!document.hasFocus();H.style.filter=x?'blur(24px)':'';C.style.display=x?'flex':'none'}
window.addEventListener('blur',hd);window.addEventListener('focus',hd);document.addEventListener('visibilitychange',hd);document.addEventListener('contextmenu',function(e){e.preventDefault()});
window.addEventListener('keydown',function(e){var k=(e.key||'').toLowerCase();if((e.ctrlKey||e.metaKey)&&['s','p','c','u'].indexOf(k)>=0)e.preventDefault();if(e.key==='PrintScreen'){H.style.filter='blur(24px)';try{navigator.clipboard.writeText('')}catch(x){}}})})();`;

/** what the client sees when a paper cannot be opened (anymore) */
const PAPER_WHY: Record<string, string> = {
  GONE: 'यह कागज़ अब नहीं है। / This paper is no longer here.',
  STOPPED: 'ब्रोकर ने यह कागज़ दिखाना बंद कर दिया है। / Your broker stopped sharing this paper.',
  EXPIRED: 'इसे देखने का समय ख़त्म हो गया। अपने ब्रोकर से दोबारा भेजने को कहें। / The time to view it is over — ask your broker to share it again.',
  USED: 'आप इसे तय बार देख चुके हैं। अपने ब्रोकर से दोबारा भेजने को कहें। / You have opened it the allowed number of times — ask your broker to share it again.',
};
const dayHi = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export function createClientRoomPageRouter() {
  const r = Router();
  const form = express.urlencoded({ extended: false, limit: '20kb' });
  /** v70 — `go-<roomId>`: my OTHER room (same mobile). Works only on a phone that already has a valid session for that room. */
  const find = (token: string, req?: Request) => {
    if (req && /^go-CRM-[a-f0-9]{10}$/.test(token)) {
      const rm = st().clientRooms.find(c => c.id === token.slice(3));
      return rm && sessionFor(req, rm) ? rm : undefined;
    }
    if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return undefined;
    const h = sha(token);
    return st().clientRooms.find(c => safeEqual(c.tokenHash, h));
  };
  const gone = (res: Response) => res.status(404).send(shell('Link not valid', `<div class="card"><p class="h">यह लिंक मान्य नहीं है या बंद हो चुका है। अपने ब्रोकर से नया लिंक माँगें।</p><p class="t">This link is not valid or has been closed. Ask your broker for a new one.</p></div>`));
  const headers = (res: Response) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); };

  r.get('/cr.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.send(CR_JS); });
  r.get('/pv.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.send(PV_JS); });

  const brokerCard = (b?: UserProfile) => {
    const ph = phone10(b?.phone);
    return `<div class="card"><b>${esc(b?.name || 'Your broker')}</b>${b?.companyName ? ` · ${esc(b.companyName)}` : ''}${b?.reraNumber ? `<br><small>RERA ${esc(b.reraNumber)}</small>` : ''}
<div class="row">${ph ? `<a class="btn g" href="tel:+91${ph}">📞 कॉल / Call</a><a class="btn l" href="https://wa.me/91${ph}" rel="noopener">WhatsApp</a>` : ''}</div></div>`;
  };

  const gate = (res: Response, room: ClientRoom, tok: string, msg = '', step: 'phone' | 'code' = 'phone', status = 200) => {
    const b = st().users.find(u => u.id === room.brokerId);
    res.status(status).send(shell('Your private room', `<div class="top"><h1>${esc(b?.name || 'आपके ब्रोकर')} का आपके लिए निजी रूम</h1><p>Your private room · GENZ Broker Network</p></div>
${msg ? `<div class="card warn"><p class="t">${msg}</p></div>` : ''}
<div class="card">${step === 'phone' ? `<p class="h">यह रूम सिर्फ़ आपके लिए है। अपना मोबाइल नंबर डालें — आपको एक कोड मिलेगा।</p><p class="t">This room is only for you. Enter your mobile number to get a code.</p>
<form method="post" action="/r/${esc(tok)}/otp"><label>मोबाइल नंबर / Mobile number</label><input type="tel" name="phone" inputmode="numeric" maxlength="14" required autocomplete="tel-national" placeholder="98XXXXXXXX"><div class="row"><button class="g" type="submit">कोड भेजें / Send code</button></div></form>`
 : `<p class="h">${smsOn() ? 'SMS में आया 6 अंकों का कोड डालें।' : 'आपके ब्रोकर आपको 6 अंकों का कोड बताएँगे — वह यहाँ डालें।'}</p><p class="t">${smsOn() ? 'Enter the 6-digit code sent by SMS.' : 'Your broker will tell you a 6-digit code — enter it here.'}</p>
<form method="post" action="/r/${esc(tok)}/verify"><label>कोड / Code</label><input type="text" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code"><div class="row"><button class="g" type="submit">खोलें / Open</button></div></form>
<div class="row"><a class="btn l" href="/r/${esc(tok)}">दोबारा कोड / Send again</a></div>`}</div>
<p class="small" style="margin:12px 4px">GENZ आपसे कोई पैसा नहीं माँगता और कोड फ़ोन पर किसी को न बताएँ (अपने ब्रोकर को छोड़कर, इस रूम के लिए)।<br>GENZ never asks you for money. Share this code with no one except your own broker for this room.</p>`));
  };

  r.get('/:token', rateLimit('cr-view', 120, 60_000), (req: Request, res: Response) => {
    headers(res);
    const room = find(req.params.token, req); if (!room || room.status !== 'ACTIVE' || Date.parse(room.expiresAt) < Date.now()) return gone(res);
    const dev = sessionFor(req, room);
    if (!dev) return gate(res, room, req.params.token);
    slide(req, res, room, dev);
    render(req, res, room);
  });

  // 1. the client types his mobile → a code is made (SMS, or read out by the broker when no gateway is set)
  r.post('/:token/otp', rateLimit('cr-otp', 30, 3600_000), form, async (req: Request, res: Response) => {
    headers(res);
    const room = find(req.params.token, req); if (!room || room.status !== 'ACTIVE' || Date.parse(room.expiresAt) < Date.now()) return gone(res);
    const phone = phone10(req.body?.phone);
    if (!phone) return gate(res, room, req.params.token, 'अपना मोबाइल नंबर डालें। / Enter your mobile number.');
    if (hit(`cr-phone:${room.id}`, 8, 3600_000, 3600_000) > 0) return gate(res, room, req.params.token, 'बहुत बार कोशिश हो चुकी। एक घंटे बाद फिर करें। / Too many tries — please wait an hour.', 'phone', 429);
    if (!safeEqual(hmac('cr-phone', phone), room.phoneKey)) return gate(res, room, req.params.token, 'यह नंबर इस रूम से मेल नहीं खाता। उसी नंबर से कोशिश करें जो आपने अपने ब्रोकर को दिया था। / This number does not match this room — use the number you gave your broker.');
    if (!knownDevice(req, room) && (room.devices || []).length >= L.devices) return gate(res, room, req.params.token, FULL_DEVICES, 'phone', 403);
    const otp = secureOtp();
    room.otpHash = hmac('cr-otp', `${room.id}|${otp}`); room.otpExpires = new Date(Date.now() + L.otpMinutes * 60_000).toISOString(); room.otpTries = 0;
    room.otpPlain = smsOn() ? undefined : otp;
    if (smsOn()) await sendSms(`+91${phone}`, `GENZ: your code to open your private property room is ${otp}. Valid ${L.otpMinutes} minutes. Do not share it.`);
    ev(room, smsOn() ? 'Code sent to the client by SMS' : 'Client asked for a code — the broker reads it out');
    db.save();
    if (!smsOn()) pingBroker(room, 'Your client is opening the room', `${room.clientName} asked for the code. Open Client Rooms and read it out.`);
    gate(res, room, req.params.token, '', 'code');
  });

  // 2. the code
  r.post('/:token/verify', rateLimit('cr-verify', 40, 3600_000), form, (req: Request, res: Response) => {
    headers(res);
    const room = find(req.params.token, req); if (!room || room.status !== 'ACTIVE' || Date.parse(room.expiresAt) < Date.now()) return gone(res);
    if (!room.otpHash || !room.otpExpires || Date.parse(room.otpExpires) < Date.now()) return gate(res, room, req.params.token, 'कोड की मियाद ख़त्म — नया कोड मँगाएँ। / The code has expired — ask for a new one.');
    if ((room.otpTries || 0) >= L.otpTries) { room.otpHash = undefined; room.otpPlain = undefined; db.save(); return gate(res, room, req.params.token, 'बहुत बार ग़लत कोड — नया कोड मँगाएँ। / Too many wrong codes — ask for a new one.'); }
    const code = String(req.body?.code || '').trim();
    if (!safeEqual(room.otpHash, hmac('cr-otp', `${room.id}|${code}`))) {
      room.otpTries = (room.otpTries || 0) + 1; db.save();
      return gate(res, room, req.params.token, 'कोड सही नहीं है। / The code is not correct.', 'code');
    }
    // v46 — this phone's slot: the same phone again reuses its slot; a new phone takes one of the 2 (or is refused)
    let dev = knownDevice(req, room);
    const devices = room.devices || (room.devices = []);
    let fresh = false;
    if (!dev) {
      if (devices.length >= L.devices) { room.otpHash = undefined; room.otpPlain = undefined; db.save(); return gate(res, room, req.params.token, FULL_DEVICES, 'phone', 403); }
      dev = crypto.randomBytes(6).toString('hex');
      devices.push({ id: dev, label: deviceLabel(req.headers['user-agent']), firstAt: nowIso(), lastAt: nowIso() });
      fresh = true;
    }
    room.otpHash = undefined; room.otpPlain = undefined; room.otpExpires = undefined; room.otpTries = 0;
    room.lastClientSeenAt = nowIso();
    const label = devices.find(d => d.id === dev)!.label;
    ev(room, fresh ? `Client opened the room on a new phone (${label}) — mobile verified` : `Client signed in again on the same phone (${label})`);
    slide(req, res, room, dev);
    // v70 — the same mobile has another room (e.g. he sells a home and also looks for one): the code he just typed opens that one too
    for (const sib of st().clientRooms.filter(c => c.id !== room.id && c.status === 'ACTIVE' && Date.parse(c.expiresAt) > Date.now() && c.phoneKey === room.phoneKey)) {
      const sd = sib.devices || (sib.devices = []);
      let sdev = knownDevice(req, sib);
      if (!sdev) { if (sd.length >= L.devices) continue; sdev = crypto.randomBytes(6).toString('hex'); sd.push({ id: sdev, label: deviceLabel(req.headers['user-agent']), firstAt: nowIso(), lastAt: nowIso() }); ev(sib, 'Opened on a phone through his other room (same mobile)'); }
      setSession(req, res, sib, sdev);
    }
    db.save();
    pingBroker(room, fresh && devices.length > 1 ? 'Your client room opened on a second phone' : 'Your client is in the room',
      fresh && devices.length > 1 ? `${room.clientName}'s room is now open on ${devices.length} phones (${label}). If that is not your client, remove it in Client Rooms → Info.` : `${room.clientName} opened the room.`);
    res.redirect(303, `/r/${req.params.token}`);
  });

  // 3. inside: react, ask for a visit, chat
  const authed = (req: Request, res: Response) => {
    headers(res);
    const room = find(req.params.token, req); if (!room || room.status !== 'ACTIVE' || Date.parse(room.expiresAt) < Date.now()) { gone(res); return null; }
    const dev = sessionFor(req, room);
    if (!dev) { res.redirect(303, `/r/${req.params.token}`); return null; }
    slide(req, res, room, dev);
    return room;
  };
  r.post('/:token/react', rateLimit('cr-react', 200, 3600_000), form, (req: Request, res: Response) => {
    const room = authed(req, res); if (!room) return;
    const it = room.items.find(i => i.id === String(req.body?.item || ''));
    if (it && ['LIKE', 'PASS'].includes(String(req.body?.r))) { it.reaction = req.body.r; it.reactionAt = nowIso(); ev(room, `Client marked ${it.propertyId} ${it.reaction}`); db.save(); if (it.reaction === 'LIKE') pingBroker(room, 'Your client liked a property', `${room.clientName} liked ${it.propertyId}.`); }
    res.redirect(303, `/r/${req.params.token}#p-${esc(String(req.body?.item || ''))}`);
  });
  r.post('/:token/visit', rateLimit('cr-visit', 30, 3600_000), form, (req: Request, res: Response) => {
    const room = authed(req, res); if (!room) return;
    const it = room.items.find(i => i.id === String(req.body?.item || ''));
    const p = it && st().properties.find(x => x.id === it.propertyId);
    if (!it || !live(p)) return render(req, res, room, 'यह प्रॉपर्टी अब उपलब्ध नहीं है। / This property is no longer available.');
    const when = String(req.body?.when || '').trim().slice(0, 40);
    const note = stripPhones(String(req.body?.note || '').trim()).slice(0, 200) || undefined;
    if (!when || Number.isNaN(Date.parse(when))) return render(req, res, room, 'विज़िट के लिए तारीख़ और समय चुनें। / Pick a date and time for the visit.');
    if (it.visitRequests.filter(v => v.status === 'REQUESTED').length >= 3) return render(req, res, room, 'इस प्रॉपर्टी के लिए अनुरोध पहले से भेजे जा चुके हैं। / Requests are already sent for this property.');
    it.visitRequests.push({ id: rid('CRV'), at: nowIso(), preferred: when, note, status: 'REQUESTED' });
    ev(room, `Client asked for a visit to ${it.propertyId}`); db.save();
    pingBroker(room, 'Visit request from your client', `${room.clientName} wants to see ${it.propertyId}. Open Client Rooms.`);
    res.redirect(303, `/r/${req.params.token}?sent=1#p-${esc(it.id)}`);
  });
  r.post('/:token/msg', rateLimit('cr-msg-c', 120, 3600_000), form, (req: Request, res: Response) => {
    const room = authed(req, res); if (!room) return;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.redirect(303, `/r/${req.params.token}#chat`);
    if (text.length > L.textChars) return render(req, res, room, `संदेश ${L.textChars} अक्षरों से छोटा रखें। / Keep the message under ${L.textChars} characters.`);
    if (containsPhone(text)) return render(req, res, room, `${esc(PHONE_IN_CHAT_MSG.hi)}<br><small>${esc(PHONE_IN_CHAT_MSG.en)}</small>`);
    if (room.messages.length >= L.messages) return render(req, res, room, 'यह चैट भर गई है — अपने ब्रोकर को कॉल करें। / This chat is full — please call your broker.');
    room.messages.push({ id: rid('CRX'), from: 'CLIENT', text, at: nowIso(), propertyId: validPropRef(room, req.body?.item) });
    room.lastClientSeenAt = nowIso(); ev(room, 'Client wrote'); db.save();
    pingBroker(room, `New message from ${room.clientName}`, 'Open Client Rooms to read and reply.');
    res.redirect(303, `/r/${req.params.token}#chat`);
  });

  // v55 — 4. a paper the broker showed: a view-only page with the client's own name stamped on every page; each open counts
  r.get('/:token/paper/:sid', rateLimit('cr-paper', 60, 60_000), (req: Request, res: Response) => {
    const room = authed(req, res); if (!room) return;
    const dev = sessionFor(req, room)!;
    const tok = esc(req.params.token);
    const x = clientPaperState(st(), String(req.params.sid), room.id);
    const back = `<div class="row"><a class="btn l" href="/r/${tok}#chat">← रूम पर वापस / Back to the room</a></div>`;
    if (!x.ok) return res.status(403).send(shell('Paper', `<div class="card warn"><p class="h">${PAPER_WHY[x.reason]}</p>${back}</div>`));
    const pages = viewerPages(x.doc);
    if (!pages) return res.status(404).send(shell('Paper', `<div class="card warn"><p class="h">यह कागज़ अभी नहीं खुल रहा। / This paper cannot be opened right now.</p>${back}</div>`));
    x.cs.views += 1; x.cs.lastAt = nowIso();
    ev(room, `Client opened a paper (${x.cs.views} of ${x.cs.maxViews}): ${x.doc.title}`);
    logDocOpen(x.doc.id, x.cs.brokerId, 'VIEW', req.ip || '', `his client ${room.clientName} opened it in the client room (${x.cs.views} of ${x.cs.maxViews})`);
    db.save();
    const who = `cr:${room.id}:${dev}`;
    const tokens = pages.map((_, i) => makeViewToken('CRDOC', `${x.doc.id}|${x.cs.id}`, who, i));
    const wm = stampFor(room.clientName, room.phoneLast4, x.broker.name);
    const left = Math.max(0, x.cs.maxViews - x.cs.views);
    res.send(shell(x.doc.title, `<style>body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}@media print{body{display:none}}#pv-cover{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(15,23,42,.75);color:#fff;font-weight:700;text-align:center;padding:20px;z-index:60}</style>
<div class="top"><h1>📄 ${esc(x.doc.title)}</h1><p>सिर्फ़ देखने के लिए · हर पेज पर आपका नाम छपा है · View only — your name is on every page</p></div>
<div class="card"><p class="t">🔒 ${esc(wm)}</p><p class="small">${left > 0 ? `${left} बार और खोल सकते हैं · ${esc(dayHi(x.cs.expiresAt))} तक / ${left} more open(s) · till ${esc(dayHi(x.cs.expiresAt))}` : 'यह आख़िरी बार था — दोबारा देखना हो तो ब्रोकर से कहें। / This was the last open — ask your broker to share again.'}</p><p class="small">इसका स्क्रीनशॉट या फ़ोटो आगे न भेजें — उस पर आपका नाम दिखेगा। / Please do not forward a screenshot or photo — your name shows on it.</p>${back}</div>
<div id="pv" data-t='${esc(JSON.stringify(tokens))}' data-base="/r/${tok}/pp/" data-wm="${esc(wm)}"><div id="pv-pages" style="margin-top:12px"></div></div>
<div id="pv-cover">यह पेज तभी दिखता है जब यह स्क्रीन सामने हो / Shown only while this screen is in front</div>
<script src="/r/pv.js" defer></script>`));
  });

  r.get('/:token/pp/:pt', (req: Request, res: Response) => {
    headers(res);
    const room = find(req.params.token, req);
    const dev = room && room.status === 'ACTIVE' ? sessionFor(req, room) : null;
    if (!room || !dev) return res.status(403).end();
    const c = useViewToken(req.params.pt, 'CRDOC', `cr:${room.id}:${dev}`);
    if (!c) return res.status(403).end();
    if (String(req.headers['sec-fetch-dest'] || 'image') !== 'image') return res.status(403).end();
    const [, sid] = c.d.split('|');
    const x = clientPaperState(st(), sid, room.id, true);
    if (!x.ok) return res.status(403).end();
    const page = viewerPages(x.doc)?.[c.p];
    if (!page) return res.status(404).end();
    res.setHeader('Content-Type', x.doc.mime === 'application/pdf' ? 'image/jpeg' : x.doc.mime);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(page);
  });

  // ───────── v69 — the room as an app: its own manifest, alerts on the client's phone, papers / KYC sent to the broker ─────────
  r.get('/:token/manifest.webmanifest', (req: Request, res: Response) => {
    const room = find(req.params.token, req);
    if (!room || room.status !== 'ACTIVE') return res.status(404).end();
    const base = `/r/${req.params.token}`;
    res.set({ 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    res.send(JSON.stringify({
      name: 'GENZ — मेरा रूम', short_name: 'मेरा रूम', description: 'Your private property room with your broker',
      id: base, start_url: base, scope: base + '/', display: 'standalone', orientation: 'portrait',
      background_color: '#ffffff', theme_color: '#0f766e',
      icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    }));
  });
  const jsonBody = express.json({ limit: '4mb' });
  const jerr = (res: Response, code: number, error: string) => res.status(code).json({ success: false, error });
  const jsonAuth = (req: Request, res: Response) => {
    headers(res);
    const room = find(req.params.token, req);
    if (!room || room.status !== 'ACTIVE' || Date.parse(room.expiresAt) < Date.now()) { jerr(res, 404, 'यह लिंक बंद हो चुका है। / This link is closed.'); return null; }
    const dev = sessionFor(req, room);
    if (!dev) { jerr(res, 401, 'फिर से खोलें और कोड डालें। / Open the link again and enter the code.'); return null; }
    slide(req, res, room, dev);
    return room;
  };
  r.post('/:token/push', rateLimit('cr-push', 30, 3600_000), jsonBody, (req: Request, res: Response) => {
    const room = jsonAuth(req, res); if (!room) return;
    const endpoint = String(req.body?.endpoint || ''); const k = req.body?.keys || {};
    const p256dh = String(k.p256dh || ''); const auth = String(k.auth || '');
    if (!endpoint || endpoint.length > 1000 || p256dh.length < 80 || p256dh.length > 120 || auth.length < 16 || auth.length > 40) return jerr(res, 400, 'Unusable push address.');
    if (!allowedEndpoint(endpoint)) return jerr(res, 400, 'This browser’s push service is not supported.');
    const state = db.getState(); const key = roomPushKey(room.id);
    const id = crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
    state.pushSubs = state.pushSubs.filter(x => x.id !== id);
    const mine = state.pushSubs.filter(x => x.userId === key);
    if (mine.length >= 3) { const oldest = mine.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]; state.pushSubs = state.pushSubs.filter(x => x.id !== oldest.id); }
    state.pushSubs.push({ id, userId: key, endpoint, p256dh, auth, ua: String(req.headers['user-agent'] || '').slice(0, 120), createdAt: nowIso(), fails: 0, url: `/r/${req.params.token}` });
    ev(room, 'Client turned on alerts on a phone'); db.save();
    res.json({ success: true });
  });
  r.post('/:token/doc', rateLimit('cr-doc', 20, 3600_000), jsonBody, (req: Request, res: Response) => {
    const room = jsonAuth(req, res); if (!room) return;
    const kind = req.body?.kind;
    if (!isDocKind(kind)) return jerr(res, 400, 'किस तरह की फ़ाइल है, चुनें। / Choose what kind of file it is.');
    if (req.body?.consent !== true) return jerr(res, 400, 'सहमति पर टिक करें। / Please tick the consent.');
    if (kind === 'KYC_AADHAAR_FULL' && !(fullAadhaarOn() && room.fullAadhaarAsk)) return jerr(res, 403, 'पूरा आधार अभी नहीं लिया जा रहा — मास्क्ड भेजें। / Full Aadhaar is not being taken — send it masked.');
    if (!vaultReady()) return jerr(res, 503, 'फ़ाइल भेजना अभी उपलब्ध नहीं — ब्रोकर को बताएँ। / Sending files is not available right now — tell your broker.');
    const docs = room.docs || (room.docs = []);
    if (docs.length >= DOC_LIMITS.perRoom) return jerr(res, 400, `एक रूम में ${DOC_LIMITS.perRoom} से ज़्यादा फ़ाइल नहीं। / At most ${DOC_LIMITS.perRoom} files per room.`);
    const b64 = String(req.body?.data || '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return jerr(res, 400, 'फ़ाइल पढ़ी नहीं जा सकी। / The file could not be read.');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 100) return jerr(res, 400, 'फ़ाइल पढ़ी नहीं जा सकी। / The file could not be read.');
    if (buf.length > DOC_LIMITS.maxBytes) return jerr(res, 413, 'फ़ाइल बड़ी है (2.5 MB तक)। / The file is too big (2.5 MB max).');
    const mime = sniffMime(buf);
    if (!mime) return jerr(res, 400, 'सिर्फ़ फ़ोटो (JPG/PNG) या PDF भेजें। / Send a photo (JPG/PNG) or a PDF only.');
    if (kind === 'PHOTO' && mime === 'application/pdf') return jerr(res, 400, 'फ़ोटो के लिए तस्वीर चुनें। / Choose an image for a photo.');
    const note = stripPhones(String(req.body?.note || '').trim()).slice(0, 120) || undefined;
    const name = String(req.body?.name || 'file').replace(/[^\w.\- ]/g, '').slice(0, 60) || 'file';
    const id = rid('CRD');
    try {
      fs.mkdirSync(DOCDIR(room.id), { recursive: true });
      fs.writeFileSync(docFile(room.id, id), seal(buf.toString('base64'), docAad(room.id, id)));
    } catch { return jerr(res, 500, 'सेव नहीं हो पाया — दोबारा कोशिश करें। / Could not save — try again.'); }
    docs.push({ id, kind, name, mime, size: buf.length, at: nowIso(), sha256: crypto.createHash('sha256').update(buf).digest('hex'), note, consentAt: nowIso(), ...(kind === 'KYC_AADHAAR_FULL' ? { eraseAfter: new Date(Date.now() + FULL_AADHAAR_DAYS * 86400_000).toISOString() } : {}) });
    const label = DOC_KINDS.find(d => d.id === kind)!;
    room.messages.push({ id: rid('CRX'), from: 'CLIENT', text: `📎 ${label.hi} भेजा / Sent: ${label.en}`, at: nowIso() });
    room.lastClientSeenAt = nowIso(); ev(room, `Client sent a file: ${label.en}${isKycKind(kind) ? ' (ID — broker only)' : ''}`);
    db.save();
    pingBroker(room, `${room.clientName} sent a ${isKycKind(kind) ? 'document' : 'file'}`, 'Open Client Rooms → Papers.');
    res.json({ success: true, id });
  });
  r.post('/:token/doc/:id/delete', rateLimit('cr-doc-del', 30, 3600_000), jsonBody, (req: Request, res: Response) => {
    const room = jsonAuth(req, res); if (!room) return;
    const d = (room.docs || []).find(x => x.id === req.params.id);
    if (!d) return res.json({ success: true });
    try { fs.rmSync(docFile(room.id, d.id), { force: true }); } catch { /* gone anyway */ }
    room.docs = (room.docs || []).filter(x => x.id !== d.id);
    ev(room, `Client removed a file he had sent (${d.kind})`); db.save();
    res.json({ success: true });
  });

  /** v70 — the OWNER confirms a visit on the spot: he scans the buyer's QR (or types the 6-digit code on the buyer's phone). Only visits of HIS property. */
  r.post('/:token/scan', rateLimit('cr-scan', 40, 600_000), jsonBody, (req: Request, res: Response) => {
    const room = jsonAuth(req, res); if (!room) return;
    if (room.kind !== 'OWNER' || !room.propertyId) return jerr(res, 403, 'यह सिर्फ़ मालिक के रूम में होता है। / Only in an owner room.');
    if (!verifyVisit) return jerr(res, 503, 'अभी उपलब्ध नहीं। / Not available right now.');
    if (hit(`cr-scan:${room.id}`, 12, 600_000, 600_000) > 0) return jerr(res, 429, 'बहुत बार कोशिश — थोड़ी देर बाद। / Too many tries — wait a little.');
    const raw = String(req.body?.code || '').trim().slice(0, 700);
    let visitId = ''; let secret = ''; let otp = '';
    let j: any = null; try { j = JSON.parse(raw); } catch { /* a typed code */ }
    if (j && typeof j === 'object') { visitId = String(j.visitId || ''); secret = String(j.secret || ''); } else otp = raw.replace(/\D/g, '');
    if (!secret && otp.length !== 6) return jerr(res, 400, 'QR पढ़ा नहीं गया या कोड 6 अंकों का नहीं। / The QR could not be read, or the code is not 6 digits.');
    const v = st().siteVisits.find(x => x.propertyId === room.propertyId && !x.isVerified && (!visitId || x.id === visitId)
      && (secret ? !!x.qrToken && safeEqual(String(x.qrToken), secret) : safeEqual(String(x.otpCode), otp)));
    if (!v) return jerr(res, 404, 'यह QR / कोड आपकी प्रॉपर्टी की किसी बाक़ी विज़िट से नहीं मिला। / This QR / code does not match any open visit of your property.');
    if (v.otpExpiresAt && Date.parse(v.otpExpiresAt) < Date.now()) return jerr(res, 410, 'इस विज़िट का कोड पुराना हो गया — ब्रोकर नई विज़िट तय करे। / This visit code has expired.');
    const blk = ackBlock('VISIT', v.id); if (blk) return jerr(res, 409, 'ख़रीदार ने अभी “सीधा सौदा नहीं” की सहमति नहीं दी — उसे पहले अपना QR पेज खोलकर पूरा करने को कहें। / The buyer has not yet confirmed the “no direct deal” promise.');
    verifyVisit(v, secret ? 'QR' : 'OTP', `Confirmed on the spot by the property owner in his room (${secret ? 'QR scanned' : 'code typed'}).`);
    ev(room, `Owner confirmed visit ${v.id}`); db.save();
    pingBroker(room, 'Visit confirmed by the owner', `${room.clientName} confirmed the visit ${v.id} on the spot.`);
    const ini = String(v.customerName || '').split(/\s+/).filter(Boolean).map(w => w[0]!.toUpperCase()).join('.');
    res.json({ success: true, visit: v.id, who: ini });
  });

  /** v72 — the OWNER answers an offer on his property from his room (no account): accept / counter / decline. Never shows who the buyer is. */
  r.post('/:token/offer/:oid', rateLimit('cr-offer', 40, 3600_000), form, (req: Request, res: Response) => {
    const room = authed(req, res); if (!room) return;
    if (room.kind !== 'OWNER' || !room.propertyId) return render(req, res, room, 'यह सिर्फ़ मालिक के रूम में होता है। / Only in an owner room.');
    const p = st().properties.find(x => x.id === room.propertyId); const o = st().propertyOffers.find(x => x.id === req.params.oid && x.propertyId === room.propertyId);
    if (!p || !o) return render(req, res, room, 'ऑफ़र नहीं मिला। / Offer not found.');
    const action = ['ACCEPT', 'COUNTER', 'REJECT'].includes(String(req.body?.action)) ? String(req.body.action) : '';
    const out = ownerDecideOffer(o, p, { id: `owner-room:${room.id}`, name: `${room.clientName} (owner room)` }, action, Number(String(req.body?.amount || '').replace(/\D/g, '')), String(req.body?.note || '').trim());
    if ('error' in out) return render(req, res, room, `${esc(out.error)}`);
    ev(room, `Owner ${action.toLowerCase()}ed an offer`); db.save();
    pingBroker(room, 'Owner replied to an offer', `${room.clientName}: ${action === 'ACCEPT' ? 'accepted' : action === 'COUNTER' ? 'countered' : 'declined'} an offer on ${p.title}.`);
    res.redirect(303, `/r/${req.params.token}#offers`);
  });
  /** v72 — the OWNER says yes / not now to an upcoming visit of his property (numbers and time only, never the buyer's name) */
  r.post('/:token/visit/:vid', rateLimit('cr-visit-ok', 40, 3600_000), form, (req: Request, res: Response) => {
    const room = authed(req, res); if (!room) return;
    if (room.kind !== 'OWNER' || !room.propertyId) return render(req, res, room, 'यह सिर्फ़ मालिक के रूम में होता है। / Only in an owner room.');
    const v = st().siteVisits.find(x => x.id === req.params.vid && x.propertyId === room.propertyId && !x.isVerified);
    if (!v) return render(req, res, room, 'विज़िट नहीं मिली। / Visit not found.');
    const answer = req.body?.answer === 'NO' ? 'NO' : 'YES';
    v.ownerOk = { answer, at: nowIso() }; ev(room, `Owner said ${answer} to visit ${v.id}`); db.save();
    pingBroker(room, answer === 'YES' ? 'Owner is fine with the visit' : 'Owner asks to change the visit', `${room.clientName}: visit ${v.id} — ${answer === 'YES' ? 'OK' : 'please fix another time'}.`);
    res.redirect(303, `/r/${req.params.token}#visits`);
  });

  function render(req: Request, res: Response, room: ClientRoom, msg = '') {
    const b = st().users.find(u => u.id === room.brokerId);
    room.lastClientSeenAt = nowIso();
    const tok = esc(req.params.token);
    const props = st().properties;
    const cards = room.items.map(i => {
      const p = props.find(x => x.id === i.propertyId); if (!p) return '';
      const pub = publicProperty(p);
      const area = [pub.plotArea ? `प्लॉट ${pub.plotArea} sq ft` : '', pub.builtUp ? `बिल्ट-अप ${pub.builtUp} sq ft` : ''].filter(Boolean).join(' · ');
      const sent = i.visitRequests.some(v => v.status === 'REQUESTED');
      const med = chosenMedia(room, i, p);
      const gallery = med.photos.length > 1 || (med.photos.length === 1 && med.photos[0] !== pub.image)
        ? `<div class="gal">${med.photos.map((u, k) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer"><img src="${esc(u)}" alt="photo ${k + 1}" loading="lazy"></a>`).join('')}</div><small>${med.photos.length} फ़ोटो — बड़ा देखने के लिए छुएँ / tap to open</small>` : '';
      const vids = med.videos.map(u => {
        const yt = youtubeId(u); const k = videoKind(u);
        return k === 'YOUTUBE' ? `<div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${esc(yt)}" title="video" loading="lazy" allowfullscreen></iframe></div>`
          : k === 'FILE' ? `<div class="vid"><video src="${esc(u)}" controls preload="metadata" playsinline></video></div>`
          : `<div class="row"><a class="btn l" href="${esc(u)}" target="_blank" rel="noopener noreferrer">▶ वीडियो देखें / Watch video</a></div>`;
      }).join('');
      const booked = (i.visits || []).filter(v => Date.parse(v.when) > Date.now() - 6 * 3600_000).sort((a, b) => a.when.localeCompare(b.when))[0];
      return `<div class="card ${pub.available ? '' : 'sold'}" id="p-${esc(i.id)}"><div class="prop">${pub.image ? `<img src="${esc(pub.image)}" alt="" loading="lazy">` : ''}<div><b>${esc(pub.title)}</b><br><small>${esc(pub.locality)}, ${esc(pub.city)} · ${esc(pub.type)} · ${esc(pub.deal)}</small><div class="price">${esc(inr(pub.price))}${pub.deal === 'Rent' ? ' / माह' : ''}</div>${area ? `<small>${esc(area)}</small>` : ''}</div></div>
${booked ? `<div class="card ok" style="margin:8px 0 0;padding:10px"><p class="t" style="margin:0">🗓 <b>विज़िट तय: ${esc(new Date(booked.when).toLocaleString('hi-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }))}</b><br><small>Visit fixed — your broker will send the visit pass / code.</small></p>${(() => { const ak = ackFor('VISIT', booked.visitId); return ak ? `<div class="row"><a class="btn g" href="${esc(ackLinkFor(ak))}">📲 मेरा QR दिखाएँ / Show my QR</a></div><small>विज़िट पर मालिक या ब्रोकर इसे स्कैन करेंगे — इसके बिना विज़िट पक्की नहीं मानी जाएगी। / The owner or broker scans it at the visit — without it the visit does not count.</small>` : ''; })()}</div>` : ''}
${gallery}${vids}
${i.note ? `<p class="t"><b>ब्रोकर का नोट:</b> ${esc(i.note)}</p>` : ''}${pub.tags.length ? `<div>${pub.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
${pub.description ? `<details><summary>ब्यौरा / Details</summary><p class="t">${esc(pub.description)}</p></details>` : ''}
<p class="small">पूरा पता और मालिक का नंबर वेरिफ़ाइड विज़िट के बाद मिलता है। / Exact address and owner\'s number are shared only after a verified visit.</p>
${pub.available ? `<div class="row"><form method="post" action="/r/${tok}/react"><input type="hidden" name="item" value="${esc(i.id)}"><button class="${i.reaction === 'LIKE' ? 'g' : 'l'}" name="r" value="LIKE" type="submit">👍 पसंद${i.reaction === 'LIKE' ? ' ✔' : ''}</button> <button class="l" name="r" value="PASS" type="submit">${i.reaction === 'PASS' ? '👎 नहीं ✔' : '👎 नहीं'}</button></form></div>
<details${sent ? '' : ''}><summary>🗓 देखने जाना है / Ask for a visit${sent ? ' — अनुरोध भेजा गया ✔' : ''}</summary><form method="post" action="/r/${tok}/visit"><input type="hidden" name="item" value="${esc(i.id)}"><label>कब? / When?</label><input type="datetime-local" name="when" required><label>कुछ बताना है? / Anything to add? (वैकल्पिक)</label><input type="text" name="note" maxlength="200"><div class="row"><button class="g" type="submit">अनुरोध भेजें / Send request</button></div></form></details>`
 : `<p class="t"><b>अब उपलब्ध नहीं (${esc(pub.status)}).</b> / No longer available.</p>`}</div>`;
    }).join('');
    // v55 — a paper the broker showed: an "Open" button while it may still be opened, otherwise why not
    const paperLine = (pp: { shareId: string; title: string }) => {
      const x = clientPaperState(st(), pp.shareId, room.id);
      if (!x.ok) return `<small>🔒 ${esc(PAPER_WHY[x.reason])}</small>`;
      const left = Math.max(0, x.cs.maxViews - x.cs.views);
      return `<div class="row" style="margin-top:6px"><a class="btn g" href="/r/${tok}/paper/${esc(pp.shareId)}">📄 खोलें / Open</a></div><small>${left} बार और · ${esc(dayHi(x.cs.expiresAt))} तक / ${left} more open(s) · till ${esc(dayHi(x.cs.expiresAt))}</small>`;
    };
    const chat = room.messages.map(m => `<div class="m ${m.from === 'CLIENT' ? 'mc' : 'mb'}">${esc(m.text)}${m.paper ? paperLine(m.paper) : ''}${m.propertyId ? `<small>↳ ${esc(m.propertyId)}</small>` : ''}<small>${m.from === 'CLIENT' ? 'आप' : m.byName ? `${esc(m.byName)} (${esc(b?.name || 'Broker')} का ऑफ़िस / office)` : esc(b?.name || 'Broker')} · ${new Date(m.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`).join('');
    db.save();
    const sibs = st().clientRooms.filter(c => c.id !== room.id && c.status === 'ACTIVE' && c.phoneKey === room.phoneKey && sessionFor(req, c));
    const sibsHtml = sibs.length ? `<div class="card"><p class="small">मेरे दूसरे रूम / My other rooms</p><div class="row">${sibs.map(c => `<a class="btn l" href="/r/go-${esc(c.id)}">${c.kind === 'OWNER' ? `🏠 मेरी प्रॉपर्टी / My property${props.find(x => x.id === c.propertyId) ? ' — ' + esc(props.find(x => x.id === c.propertyId)!.title.slice(0, 28)) : ''}` : `🔍 मेरी तलाश / My search — ${esc(st().users.find(u => u.id === c.brokerId)?.name || 'Broker')}`}</a>`).join('')}</div></div>` : '';
    const ow = room.kind === 'OWNER' ? ownerStats(room) : null; const op = props.find(x => x.id === room.propertyId);
    const ownerOffers = room.kind === 'OWNER' ? st().propertyOffers.filter(o => o.propertyId === room.propertyId && ['SUBMITTED', 'COUNTERED'].includes(o.status) && Date.parse(o.validUntil) > Date.now()) : [];
    const ownerVisits = room.kind === 'OWNER' ? st().siteVisits.filter(v => v.propertyId === room.propertyId && !v.isVerified && Date.parse(v.scheduledTime) > Date.now() - 12 * 3600_000).sort((a, z) => a.scheduledTime.localeCompare(z.scheduledTime)).slice(0, 8) : [];
    const offersHtml = room.kind !== 'OWNER' ? '' : `<h2 id="offers">💬 ऑफ़र / Offers (${ownerOffers.length})</h2><div class="card">${ownerOffers.length ? ownerOffers.map(o => `<div class="lead" data-testid="owner-offer"><b>${inr(o.status === 'COUNTERED' && o.counterAmount ? o.counterAmount : o.amount)}</b> <small>${o.status === 'COUNTERED' ? 'आपका काउंटर / your counter' : 'एक ख़रीदार का ऑफ़र / from a buyer'} · ${esc(dayHi(o.validUntil))} तक</small>${o.status === 'SUBMITTED' ? `
<form method="post" action="/r/${tok}/offer/${esc(o.id)}"><input type="hidden" name="action" value="ACCEPT"><div class="row"><button class="g" type="submit">✔ मंज़ूर / Accept</button></div></form>
<form method="post" action="/r/${tok}/offer/${esc(o.id)}"><input type="hidden" name="action" value="COUNTER"><input type="text" name="amount" inputmode="numeric" placeholder="आपकी कीमत ₹ / Your price ₹" required><div class="row"><button class="l" type="submit">↔ काउंटर / Counter</button></div></form>
<form method="post" action="/r/${tok}/offer/${esc(o.id)}"><input type="hidden" name="action" value="REJECT"><input type="text" name="note" maxlength="150" placeholder="कारण (वैकल्पिक) / Reason (optional)"><div class="row"><button class="r" type="submit">✖ मना / Decline</button></div></form>` : '<br><small>ख़रीदार के जवाब का इंतज़ार। / Waiting for the buyer.</small>'}</div>`).join('') : '<p class="t">अभी कोई नया ऑफ़र नहीं। / No new offer.</p>'}<p class="small">ख़रीदार का नाम नहीं दिखता। मंज़ूर करने पर टोकन और आगे की बात आपके ब्रोकर के साथ चलती है। / The buyer\'s name is not shown.</p></div>`;
    const visitsHtml = room.kind !== 'OWNER' ? '' : `<h2 id="visits">🗓 आने वाली विज़िट / Upcoming visits (${ownerVisits.length})</h2><div class="card">${ownerVisits.length ? ownerVisits.map(v => `<div class="lead" data-testid="owner-visit"><b>${esc(new Date(v.scheduledTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</b>${v.ownerOk ? ` <span class="chip ${v.ownerOk.answer === 'YES' ? 'ok' : 'x'}">${v.ownerOk.answer === 'YES' ? 'आपने हाँ कहा' : 'आपने बदलने को कहा'}</span>` : ''}
<form method="post" action="/r/${tok}/visit/${esc(v.id)}"><div class="row"><button class="g" name="answer" value="YES" type="submit">✔ ठीक है / OK</button><button class="l" name="answer" value="NO" type="submit">⏰ दूसरा समय / Another time</button></div></form></div>`).join('') : '<p class="t">अभी कोई विज़िट तय नहीं। / No visit planned.</p>'}</div>`;
    const stat = (n: number, hi: string, en: string) => `<div style="flex:1;min-width:70px;background:#f3f5fa;border-radius:12px;padding:10px;text-align:center"><div style="font-size:24px;font-weight:800">${n}</div><small>${hi}<br>${en}</small></div>`;
    const ownerBlock = ow ? `<h2>आपकी प्रॉपर्टी / Your property</h2><div class="card"><p class="h"><b>🏠 ${esc(op?.title || room.propertyId || '')}</b></p>${op ? `<small>${esc(op.locality)}, ${esc(op.city)}</small>` : ''}
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${stat(ow.viewing, 'लोग देख रहे', 'viewing')}${stat(ow.interested, 'दिलचस्पी', 'interested')}${stat(ow.visitsPlanned, 'विज़िट तय', 'visits planned')}${stat(ow.visitsDone, 'विज़िट हुई', 'visits done')}</div>
<p class="small">सिर्फ़ संख्या दिखती है — कौन देख रहा है यह नहीं बताया जाता। / Only numbers — never who.</p></div>
${offersHtml}${visitsHtml}<h2 id="scan">📷 विज़िट पक्की करें / Confirm a visit</h2><div class="card"><p class="small">जब ख़रीदार आए, उसके फ़ोन का QR स्कैन करें, या उसके फ़ोन पर दिखा 6 अंकों का कोड डालें। इसके बिना विज़िट पक्की नहीं मानी जाती — इसी से सीधा सौदा रुकता है। / When the buyer arrives, scan the QR on his phone or type the 6-digit code he shows. Without this the visit is not counted.</p>
<div class="row"><button type="button" class="g" id="scan-btn">📷 QR स्कैन करें / Scan QR</button></div><video id="scan-video" playsinline muted style="display:none;width:100%;border-radius:12px;margin-top:8px"></video>
<label>या कोड डालें / Or type the code</label><input type="text" id="scan-code" inputmode="numeric" maxlength="6" placeholder="000000"><div class="row"><button type="button" class="l" id="scan-go">कोड से पक्का करें / Confirm with code</button></div><p class="small" id="scan-msg"></p></div>` : '';
    // v46 — the client's own name over the page: a screenshot forwarded to someone else still shows whose room it was
    const mark = esc(`${room.clientName} ••${room.phoneLast4} · ${b?.name || 'GENZ'}`);
    const wm = `<div class="wm" aria-hidden="true">${Array.from({ length: 18 }, () => `<span>${mark}</span>`).join('')}</div>`;
    res.send(shell('Your private room', `${wm}<div class="top"><h1>नमस्ते ${esc(room.clientName.split(' ')[0])} 🙏</h1><p>${room.kind === 'OWNER' ? `${esc(b?.name || 'आपके ब्रोकर')} के साथ आपकी प्रॉपर्टी का रूम · Your property room` : `${esc(b?.name || 'आपके ब्रोकर')} ने आपके लिए ये प्रॉपर्टी चुनी हैं · Properties picked for you`}</p></div>
${sibsHtml}
${req.query.sent === '1' ? '<div class="card ok"><p class="t">आपका विज़िट अनुरोध ब्रोकर को भेज दिया गया। / Your visit request has been sent.</p></div>' : ''}${msg ? `<div class="card warn"><p class="t">${msg}</p></div>` : ''}
${req.query.doc === '1' ? '<div class="card ok"><p class="t">फ़ाइल ब्रोकर को भेज दी गई। / File sent to your broker.</p></div>' : ''}
${brokerCard(b)}
<div class="card" id="app-card"><p class="h">📲 इसे ऐप की तरह रखें / Keep this as an app</p>
<p class="small">होम स्क्रीन पर जोड़ें — हर बार लिंक खोलने या WhatsApp में ढूँढने की ज़रूरत नहीं। ब्रोकर का संदेश आएगा तो फ़ोन पर अलर्ट मिलेगा। / Add it to your home screen — no hunting for the link. You get an alert when your broker writes.</p>
<div class="row"><button type="button" class="g" id="app-install" style="display:none">📲 होम स्क्रीन पर जोड़ें / Add to Home</button> <button type="button" class="l" id="app-push" style="display:none">🔔 अलर्ट चालू करें / Turn on alerts</button></div>
<p class="small" id="app-ios" style="display:none">iPhone: नीचे Share (⬆) दबाएँ → “Add to Home Screen”। फिर ऐप खोलकर अलर्ट चालू करें। (अलर्ट के लिए iOS 16.4+) / iPhone: tap Share → Add to Home Screen, then open the app and turn on alerts (needs iOS 16.4+).</p>
<p class="small" id="app-push-msg"></p></div>
<p class="small" style="margin:10px 4px">📌 इस पेज को बुकमार्क / होम स्क्रीन पर रख लें — इसी फ़ोन पर अगली बार बिना कोड के खुलेगा (${L.sessionDays} दिन में एक बार खोलते रहें)। यह पेज सिर्फ़ आपके लिए है, इसका लिंक या स्क्रीनशॉट आगे न भेजें।<br>Bookmark this page or add it to your home screen — on this phone it opens without a code next time. It is only for you: please do not forward the link or screenshots.</p>
${room.kind === 'OWNER' ? ownerBlock : `<h2>आपके लिए प्रॉपर्टी / Properties (${room.items.length})</h2>${cards || '<div class="card"><p class="t">अभी कोई प्रॉपर्टी नहीं भेजी गई। / Nothing shared yet — your broker will add some.</p></div>'}`}
${(() => {
  const kycOn = vaultReady();
  const list = (room.docs || []).map(d => { const k = DOC_KINDS.find(x => x.id === d.kind); return `<div class="m mc">${isKycKind(d.kind) ? '🪪' : '📎'} ${esc(k?.hi || d.kind)} · <small>${esc(d.name)} · ${Math.max(1, Math.round(d.size / 1024))} KB · ${esc(dayHi(d.at))}</small> <button type="button" class="l" data-deldoc="${esc(d.id)}" style="padding:4px 10px">हटाएँ / Remove</button></div>`; }).join('');
  return `<h2 id="docs">ब्रोकर को फ़ोटो / काग़ज़ / ID भेजें / Send a photo, paper or ID</h2><div class="card">${kycOn ? `<form id="docform"><label>क्या भेज रहे हैं? / What is it?</label><select id="dockind" style="width:100%;padding:10px;border-radius:10px;border:1px solid #bbb;font-size:15px">${DOC_KINDS.filter(d => d.id !== 'KYC_AADHAAR_FULL' || (fullAadhaarOn() && room.fullAadhaarAsk)).map(d => `<option value="${d.id}">${esc(d.hi)} / ${esc(d.en)}</option>`).join('')}</select>
<input type="file" id="docfile" accept="image/*,application/pdf" style="margin:8px 0;width:100%"><input type="text" id="docnote" maxlength="120" placeholder="छोटा नोट (वैकल्पिक) / Short note (optional)" style="width:100%;padding:10px;border-radius:10px;border:1px solid #bbb;font-size:15px">
<p class="small">⚠ आधार सिर्फ़ <b>मास्क्ड</b> भेजें (पहले 8 अंक ढके)। पूरा आधार न भेजें। नंबर चैट में न लिखें। / Send Aadhaar only <b>masked</b> (first 8 digits covered). Never the full Aadhaar.</p>
<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="docok" style="width:auto;margin-top:3px"><span class="small">मैं यह फ़ाइल अपनी मर्ज़ी से इस सौदे के लिए ${esc(b?.name || 'ब्रोकर')} को भेज रहा/रही हूँ। यह सुरक्षित (एन्क्रिप्टेड) रखी जाएगी, सिर्फ़ ब्रोकर खोल सकेगा, और रूम बंद होने पर मिट जाएगी। / I send this willingly for this deal. It is kept encrypted, only the broker can open it, and it is erased when the room closes.</span></label>
<div class="row"><button type="submit" class="g">📤 भेजें / Send</button></div><p class="small" id="docmsg"></p></form>` : '<p class="t">फ़ाइल भेजना अभी उपलब्ध नहीं है — ब्रोकर को चैट में बताएँ। / Sending files is not available right now — tell your broker in the chat.</p>'}${list ? `<div class="chat" style="max-height:none;margin-top:8px">${list}</div>` : ''}</div>`;
})()}
<h2 id="chat">ब्रोकर से बात / Chat with your broker</h2>
<div class="card"><p class="small">${roomTeam(room.brokerId).length ? 'यह चैट सिर्फ़ आप, आपके ब्रोकर और उनकी ऑफ़िस टीम देख सकते हैं। फ़ोन नंबर चैट में न लिखें। / Only you, your broker and his office team can read this chat. Please do not type phone numbers.' : 'यह चैट सिर्फ़ आप और आपके ब्रोकर देख सकते हैं। फ़ोन नंबर चैट में न लिखें। / Only you and your broker can read this chat. Please do not type phone numbers.'}</p>
<div class="chat" id="chat-box">${chat || '<small>अभी कोई संदेश नहीं। / No messages yet.</small>'}</div>
<form method="post" action="/r/${tok}/msg"><textarea name="text" id="msgtext" rows="2" maxlength="${L.textChars}" placeholder="संदेश लिखें / Write a message" required></textarea>
${room.items.length ? `<label>किस प्रॉपर्टी के बारे में? (वैकल्पिक) / About which property?</label><select name="item" style="width:100%;padding:10px;border-radius:10px;border:1px solid #bbb;font-size:15px"><option value="">—</option>${room.items.map(i => `<option value="${esc(i.id)}">${esc(props.find(x => x.id === i.propertyId)?.title || i.propertyId)}</option>`).join('')}</select>` : ''}<div class="row"><button class="g" type="submit">भेजें / Send</button></div></form></div>
<p class="small" style="margin:12px 4px">GENZ एक न्यूट्रल प्लेटफ़ॉर्म है; कीमत और शर्तें आपके, मालिक और ब्रोकर के बीच तय होती हैं। GENZ आपसे पैसा नहीं माँगता। आपका मोबाइल नंबर सिर्फ़ इस रूम को खोलने के लिए जाँचा गया है और सुरक्षित रूप (hash) में रखा जाता है।<br>GENZ is a neutral platform; price and terms are between you, the owner and the broker. GENZ never asks you for money. Your mobile number is only used to open this room and is stored in a one-way hashed form.</p>
${joinFooter(b, b?.city)}`, 'hi', `<link rel="manifest" href="/r/${tok}/manifest.webmanifest" crossorigin="use-credentials"><meta name="theme-color" content="#0f766e"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="मेरा रूम"><link rel="apple-touch-icon" href="/icon-192.png">`).replace('<body>', '<body data-live="1">'));
  }
  return r;
}

/** hourly: closed rooms' chats are erased after 90 days; links that ran out close the room */
export function sweepClientRooms() {
  const s = st(); const now = Date.now(); let n = 0;
  for (const r of s.clientRooms) {
    if (r.status === 'ACTIVE' && Date.parse(r.expiresAt) < now) { r.status = 'CLOSED'; r.closedAt = nowIso(); r.phoneSealed = undefined; eraseRoomFiles(r); ev(r, 'Closed — the link ran out'); n++; }
  }
  for (const r of s.clientRooms) for (const d of (r.docs || []).filter(x => x.eraseAfter && Date.parse(x.eraseAfter) < now)) { try { fs.rmSync(docFile(r.id, d.id), { force: true }); } catch { /* gone */ } r.docs = (r.docs || []).filter(x => x.id !== d.id); ev(r, 'A full-Aadhaar file was erased (7 days passed)'); n++; }
  const before = s.clientRooms.length;
  s.clientRooms = s.clientRooms.filter(r => !(r.status === 'CLOSED' && r.closedAt && Date.parse(r.closedAt) + L.purgeClosedDays * 86400_000 < now));
  if (s.clientRooms.length !== before) n += before - s.clientRooms.length;
  if (n) db.save();
  return n;
}
