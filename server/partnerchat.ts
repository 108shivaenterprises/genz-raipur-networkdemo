/**
 * v61 — Builder ↔ channel partner chat: /api/partner-chats  (pchat:use)
 *   GET  /                 my threads — every builder / partner I am linked with through a project, with the last message and unread
 *   POST /open             { withId } → the thread with that partner (builder side) / that builder (partner side), made if new
 *   GET  /:id              the thread (last 300 messages); reading it moves my read mark
 *   GET  /:id/cards        what I may put in it as a card: the pair's leads and bookings, and (builder side) units of the shared projects
 *   POST /:id/messages     { text?, card?: { kind, refId }, photo? }   (a photo: base64 JPEG / PNG / WebP up to 600 KB)
 *   GET  /photo/:pid       a photo of a thread I am in
 *
 * One thread per builder and partner broker. The builder side is the builder and his staff who check partner leads (canVerify); the
 * partner side is the broker. A thread opens when the two are linked by a project (invited, applied, shortlisted, appointed, paused);
 * after the partnership ends it stays readable but closed. Cards never carry a customer's number or surname; GENZ staff do not read
 * these chats. A new message alerts the other side's phone (one alert per person per thread every 3 minutes).
 */
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { PartnerThread, PartnerMsg, UserProfile, SalesAssociateMandate } from './db.js';
import type { CrmLead, CrmBooking } from '../src/types/crm.js';
import { ctx, needs, rateLimit } from './auth.js';
import { alert, builderVerifiers, firstName, once } from './alerts.js';
import { savePhoto, photoById, sendPhoto } from './workphotos.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });
const inr = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
/** may still talk (a closed partnership keeps its old talk readable) */
const OPEN_STATUSES: SalesAssociateMandate['status'][] = ['INVITED', 'APPLIED', 'SHORTLISTED', 'ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'];
const MAX_MSGS = 2000;

type Side = { side: 'BUILDER'; builderId: string } | { side: 'PARTNER'; brokerId: string };
/** which side of the chat this person speaks for (or none) */
export function sideOf(u: UserProfile): Side | null {
  if (u.verificationStatus !== 'VERIFIED') return null;
  if (u.role === 'DEVELOPER_BUILDER') return { side: 'BUILDER', builderId: u.id };
  if (u.role === 'BROKER') return { side: 'PARTNER', brokerId: u.id };
  if (u.role === 'TEAM_MEMBER' && u.employerRole === 'DEVELOPER_BUILDER' && u.employerId && u.teamPolicy?.canVerify && !u.teamPolicy?.onLeave) return { side: 'BUILDER', builderId: u.employerId };
  return null;
}
/** the projects that link a builder and a broker, and whether they may still talk */
function linkOf(builderId: string, brokerId: string) {
  const s = st();
  const projects = new Map(s.builderProjects.filter(p => p.builderId === builderId).map(p => [p.id, p]));
  const ms = s.associateMandates.filter(m => m.brokerId === brokerId && projects.has(m.projectId));
  return { any: ms.length > 0, open: ms.some(m => OPEN_STATUSES.includes(m.status)), projectIds: [...new Set(ms.map(m => m.projectId))], projectNames: [...new Set(ms.map(m => projects.get(m.projectId)!.projectName))] };
}
const pairOf = (sd: Side, withId: string) => sd.side === 'BUILDER' ? { builderId: sd.builderId, brokerId: withId } : { builderId: withId, brokerId: sd.brokerId };
const otherOf = (sd: Side, t: PartnerThread) => sd.side === 'BUILDER' ? t.brokerId : t.builderId;
const mineThread = (sd: Side, t: PartnerThread) => sd.side === 'BUILDER' ? t.builderId === sd.builderId : t.brokerId === sd.brokerId;
const unreadOf = (u: UserProfile, sd: Side, t: PartnerThread) => { const since = t.reads[u.id] || ''; return t.messages.filter(m => m.side !== sd.side && m.at > since).length; };
const label = (id: string) => { const x = db.byId('users', id) as UserProfile | undefined; return x ? (x.companyName ? `${x.name} (${x.companyName})` : x.name) : id; };
const view = (m: PartnerMsg, u: UserProfile, sd: Side) => ({ ...m, mine: m.side === sd.side, ...(m.side === sd.side && m.byId !== u.id ? { by: m.byName } : {}) });

/** the unread count for the chat icon */
export function partnerUnread(u: UserProfile): number {
  const sd = sideOf(u); if (!sd) return 0;
  return st().partnerThreads.filter(t => mineThread(sd, t)).reduce((n, t) => n + unreadOf(u, sd, t), 0);
}

/** a lead / booking card's words — first name only, never a number */
function leadCard(l: CrmLead) { return { kind: 'LEAD' as const, refId: l.id, label: `${firstName(l.name)} · ${l.projectName}`, sub: `${l.stage.replace(/_/g, ' ').toLowerCase()}${l.verify ? ` · ${l.verify.toLowerCase()}` : ''}` }; }
function bookingCard(b: CrmBooking) { return { kind: 'BOOKING' as const, refId: b.id, label: `Unit ${b.unitNo} · ${b.projectName}`, sub: `${b.status.toLowerCase()} · ${firstName(b.customerName)} · ${inr(b.agreementValue)}` }; }

export function createPartnerChatRouter() {
  const r = Router();
  r.use(needs('pchat:use'));
  const side = (res: Response) => { const sd = sideOf(me()); if (!sd) { bad(res, 'Only a builder (or his sales manager) and his channel partners use this chat', 403); return null; } return sd; };
  const load = (req: Request, res: Response) => {
    const sd = side(res); if (!sd) return null;
    const t = st().partnerThreads.find(x => x.id === req.params.id);
    if (!t || !mineThread(sd, t)) { bad(res, 'Chat not found', 404); return null; }
    return { sd, t };
  };

  r.get('/', (_req, res) => {
    const u = me(); const sd = sideOf(u);
    // someone who holds the permission but speaks for neither side (the super admin) simply has no partner chats
    if (!sd) return res.json({ success: true, side: null, threads: [], unread: 0 });
    const s = st();
    // everyone I am linked with through a project, plus any thread that already exists
    const others = new Set<string>();
    if (sd.side === 'BUILDER') { const mine = new Set(s.builderProjects.filter(p => p.builderId === sd.builderId).map(p => p.id)); for (const m of s.associateMandates) if (mine.has(m.projectId)) others.add(m.brokerId); }
    else { const pids = new Set(s.associateMandates.filter(m => m.brokerId === sd.brokerId).map(m => m.projectId)); for (const p of s.builderProjects) if (pids.has(p.id)) others.add(p.builderId); }
    for (const t of s.partnerThreads) if (mineThread(sd, t)) others.add(otherOf(sd, t));
    const rows = [...others].map(o => {
      const pair = pairOf(sd, o); const link = linkOf(pair.builderId, pair.brokerId);
      const t = s.partnerThreads.find(x => x.builderId === pair.builderId && x.brokerId === pair.brokerId);
      const last = t?.messages[t.messages.length - 1];
      return {
        id: t?.id || null, withId: o, with: label(o), projects: link.projectNames, open: link.open,
        last: last ? { text: last.card && !last.text ? last.card.label : last.text.slice(0, 140), at: last.at, mine: last.side === sd.side, by: last.byName, photo: last.card?.kind === 'PHOTO' } : undefined,
        unread: t ? unreadOf(u, sd, t) : 0,
      };
    }).filter(x => x.id || x.open)
      .sort((a, b) => String(b.last?.at || '').localeCompare(String(a.last?.at || '')) || a.with.localeCompare(b.with));
    res.json({ success: true, side: sd.side, threads: rows, unread: rows.reduce((n, x) => n + x.unread, 0) });
  });

  r.post('/open', (req, res) => {
    const u = me(); const sd = side(res); if (!sd) return;
    const withId = String(req.body?.withId || '');
    const pair = pairOf(sd, withId); const link = linkOf(pair.builderId, pair.brokerId);
    const s = st();
    let t = s.partnerThreads.find(x => x.builderId === pair.builderId && x.brokerId === pair.brokerId);
    if (!t) {
      if (!link.open) return bad(res, 'You can chat once the two of you are linked by a project (invited, applied or appointed)', 404, 'NOT_LINKED');
      const ts = nowIso();
      t = { id: `PCH-${crypto.randomBytes(5).toString('hex')}`, builderId: pair.builderId, brokerId: pair.brokerId, messages: [], reads: {}, createdAt: ts, updatedAt: ts };
      s.partnerThreads.push(t); db.save();
      db.appendAuditEvent(u.id, u.role, 'LEAD', t.id, 'PARTNER_CHAT_OPENED', `${u.name} opened the builder–partner chat (${label(pair.builderId)} ↔ ${label(pair.brokerId)})`);
    }
    res.json({ success: true, id: t.id });
  });

  r.get('/:id', (req, res) => {
    const l = load(req, res); if (!l) return; const { sd, t } = l; const u = me();
    const link = linkOf(t.builderId, t.brokerId);
    const last = t.messages[t.messages.length - 1];
    if (last && (t.reads[u.id] || '') < last.at) { t.reads[u.id] = last.at; db.save(); }
    res.json({
      success: true, side: sd.side,
      thread: { id: t.id, with: label(otherOf(sd, t)), withId: otherOf(sd, t), projects: link.projectNames, open: link.open, messages: t.messages.slice(-300).map(m => view(m, u, sd)) },
    });
  });

  r.get('/:id/cards', (req, res) => {
    const l = load(req, res); if (!l) return; const { sd, t } = l;
    const s = st(); const link = linkOf(t.builderId, t.brokerId);
    const leads = (s.crmLeads as CrmLead[]).filter(x => x.builderId === t.builderId && x.associateId === t.brokerId).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 60).map(leadCard);
    const bookings = (s.crmBookings as CrmBooking[]).filter(x => x.builderId === t.builderId && x.associateId === t.brokerId).slice(-40).reverse().map(bookingCard);
    const units = sd.side === 'BUILDER'
      ? s.inventoryUnits.filter(x => x.builderId === t.builderId && link.projectIds.includes(x.projectId) && x.status === 'AVAILABLE').slice(0, 80)
        .map(x => ({ kind: 'UNIT' as const, refId: x.id, label: `${x.label} · ${x.config}`, sub: `${s.builderProjects.find(p => p.id === x.projectId)?.projectName || ''}${x.vis?.priceHidden ? '' : ` · ${inr(x.price)}`}` }))
      : [];
    res.json({ success: true, leads, bookings, units });
  });

  r.post('/:id/messages', express.json({ limit: '1mb' }), rateLimit('pchat-msg', 300, 3600_000), (req, res) => {
    const l = load(req, res); if (!l) return; const { sd, t } = l; const u = me(); const s = st();
    if (!linkOf(t.builderId, t.brokerId).open) return bad(res, 'This partnership has ended — the chat is read-only now', 409, 'CLOSED');
    const p = z.object({ text: z.string().trim().max(1000).optional(), card: z.object({ kind: z.enum(['LEAD', 'BOOKING', 'UNIT']), refId: z.string().max(60) }).optional(), photo: z.string().max(900_000).optional() }).strict().safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid message');
    const d = p.data;
    if (!d.text && !d.card && !d.photo) return bad(res, 'Write a message');
    if (d.card && d.photo) return bad(res, 'Send one card or one photo at a time');
    let card: PartnerMsg['card'];
    if (d.card) {
      if (d.card.kind === 'LEAD') {
        const x = (s.crmLeads as CrmLead[]).find(y => y.id === d.card!.refId && y.builderId === t.builderId && y.associateId === t.brokerId);
        if (!x) return bad(res, 'That lead is not between the two of you', 404); card = leadCard(x);
      } else if (d.card.kind === 'BOOKING') {
        const x = (s.crmBookings as CrmBooking[]).find(y => y.id === d.card!.refId && y.builderId === t.builderId && y.associateId === t.brokerId);
        if (!x) return bad(res, 'That booking is not between the two of you', 404); card = bookingCard(x);
      } else {
        if (sd.side !== 'BUILDER') return bad(res, 'Only the builder shares units here', 403);
        const x = s.inventoryUnits.find(y => y.id === d.card!.refId && y.builderId === t.builderId && linkOf(t.builderId, t.brokerId).projectIds.includes(y.projectId));
        if (!x) return bad(res, 'Unit not found', 404);
        card = { kind: 'UNIT', refId: x.id, label: `${x.label} · ${x.config}`, sub: `${s.builderProjects.find(q => q.id === x.projectId)?.projectName || ''}${x.vis?.priceHidden ? '' : ` · ${inr(x.price)}`} · ${x.status.toLowerCase()}` };
      }
    }
    if (d.photo) {
      const sp = savePhoto(d.photo, { kind: 'PCHAT', id: t.id, byId: u.id });
      if (!sp.ok) return bad(res, sp.error, sp.status);
      card = { kind: 'PHOTO', refId: sp.photo.id, label: 'Photo' };
    }
    const m: PartnerMsg = { id: `PCM-${crypto.randomBytes(5).toString('hex')}`, at: nowIso(), byId: u.id, byName: u.name, side: sd.side, text: d.text || '', ...(card ? { card } : {}) };
    t.messages.push(m); if (t.messages.length > MAX_MSGS) t.messages.splice(0, t.messages.length - MAX_MSGS);
    t.lastAt = m.at; t.updatedAt = m.at; t.reads[u.id] = m.at;
    db.save();
    if (card) db.appendAuditEvent(u.id, u.role, 'LEAD', t.id, 'PARTNER_CHAT_CARD', `${card.kind} ${card.refId} shared in the builder–partner chat`);
    // the other side's phones: one alert per person per thread every 3 minutes
    const to = (sd.side === 'PARTNER' ? builderVerifiers(t.builderId) : [t.brokerId]).filter((id): id is string => !!id && id !== u.id && once(`pc:${id}:${t.id}`, 180_000));
    const what = m.text ? m.text.slice(0, 100) : card?.kind === 'PHOTO' ? '📷 Photo' : `${card?.label || ''}`;
    const whatHi = m.text ? m.text.slice(0, 100) : card?.kind === 'PHOTO' ? '📷 फ़ोटो' : `${card?.label || ''}`;
    const from = sd.side === 'BUILDER' ? label(t.builderId) : u.name;
    alert(to, 'deals', `${from} · partner chat`, what, `/?tab=chats&chat=p:${t.id}`, { tag: `pch-${t.id}`, hi: [`${from} · पार्टनर चैट`, whatHi] });
    res.json({ success: true, message: view(m, u, sd) });
  });

  r.get('/photo/:pid', rateLimit('pchat-photo', 600, 3600_000), (req, res) => {
    const sd = side(res); if (!sd) return;
    const p = photoById(req.params.pid);
    const t = p && p.ownerKind === 'PCHAT' ? st().partnerThreads.find(x => x.id === p.ownerId) : undefined;
    if (!p || !t || !mineThread(sd, t)) return bad(res, 'Photo not found', 404);
    sendPhoto(res, p);
  });

  return r;
}
