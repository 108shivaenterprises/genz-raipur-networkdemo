/**
 * v60 — Rent desk: /api/rent  (broker: rent:use)
 *   GET    /                   my tenancies (+ what needs attention) and where a new one can start from (my rent deal rooms / rent listings)
 *   POST   /                   record a tenancy — from a deal room, from my rent listing, or by hand (an old rental of mine)
 *   GET    /:id                one tenancy
 *   PATCH  /:id                change the terms, the agreement step, the keys / meter note
 *   POST   /:id/police         the tenant's police verification: step, date, police station, acknowledgement no.
 *   POST   /:id/renew          a new term from the day after the end (new rent, months); a new agreement is needed
 *   POST   /:id/notice         the owner or the tenant gave notice → the day the home should be empty
 *   POST   /:id/vacate         the tenant left (+ a deposit note) → ended; a rented listing of mine can go back on the network
 *   DELETE /:id                remove a record made by mistake (never one that was renewed)
 *   GET    /:id/sheet          printable term sheet in Hindi + English — not the agreement
 *
 * GENZ never holds rent or deposit, and never the tenant's ID: only the verification step, date, station and acknowledgement no.
 * The hourly sweep (9 AM – 8 PM IST) alerts the broker 60 / 30 / 7 days before the end, when the term is over, and once when the
 * police verification is still pending a week after the start. Names and numbers are erased RENT_LIMITS.keepDays after the end.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from './db.js';
import type { Tenancy, UserProfile, DealRoom, Property } from './db.js';
import { ctx, needs, rateLimit } from './auth.js';
import { isDealBroker } from './access.js';
import { alert } from './alerts.js';
import { istHour } from './webpush.js';
import { phoneSchema } from './validation.js';
import {
  RENT_LIMITS as L, AGREEMENT_STEPS, POLICE_STEPS, POLICE_CHECKLIST, SHEET_NOTE, endOf, addDays, isDay, todayIst, daysTo, nextRent,
  flagsOf, dueReminder, humanDay, rupees, type RentFlag,
} from '../src/shared/rentRules.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const first = (n?: string) => String(n || '').trim().split(/\s+/)[0] || '';
const phone10 = (p?: string) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };
const isRent = (p?: Property) => !!p && (p.transactionType === 'Rent' || p.transactionType === 'Lease');
const log = (t: Tenancy, u: UserProfile, what: string) => { t.history.push({ at: nowIso(), by: u.name, what: what.slice(0, 200) }); if (t.history.length > 100) t.history.shift(); t.updatedAt = nowIso(); };
const audit = (u: UserProfile, t: Tenancy, action: string, detail: string) => db.appendAuditEvent(u.id, u.role, 'DEAL', t.id, action, detail);

const day = z.string().refine(isDay, 'Pick a date');
const optPhone = z.union([phoneSchema, z.literal('')]).optional();
const terms = {
  place: z.string().trim().min(3, 'Write the home in a few words — e.g. "2 BHK flat, Shankar Nagar"').max(L.place),
  ownerName: z.string().trim().min(2, 'Owner’s name').max(L.name),
  ownerPhone: optPhone,
  tenantName: z.string().trim().min(2, 'Tenant’s name').max(L.name),
  tenantPhone: optPhone,
  rent: z.number().int().min(L.rentMin, `Rent must be at least ${rupees(L.rentMin)}`).max(L.rentMax),
  deposit: z.number().int().min(0).max(L.depositMax),
  maintenance: z.number().int().min(0).max(L.rentMax).optional(),
  startOn: day,
  months: z.number().int().min(L.monthsMin).max(L.monthsMax),
  lockInMonths: z.number().int().min(0).max(L.lockInMax).optional(),
  escalationPct: z.number().min(0).max(L.escalationMax).optional(),
  noticeDays: z.number().int().min(0).max(L.noticeMaxDays),
  agreement: z.enum(AGREEMENT_STEPS.map(a => a.id) as [string, ...string[]]),
  stampRef: z.string().trim().max(L.ref).optional(),
  keysOn: day.optional(),
  meterNote: z.string().trim().max(L.note).optional(),
  note: z.string().trim().max(L.note).optional(),
};
const createSchema = z.object({
  ...terms,
  months: terms.months.default(L.monthsDefault),
  noticeDays: terms.noticeDays.default(L.noticeDefaultDays),
  agreement: terms.agreement.default('NONE'),
  dealRoomId: z.string().max(40).optional(),
  propertyId: z.string().max(40).optional(),
  consent: z.literal(true, { message: 'Confirm that the owner and the tenant know their name and number are kept for this tenancy' }),
}).strict();
const patchSchema = z.object(terms).partial().strict();

/** a start day that makes sense: an old rental up to 2 years back, or one starting within the next 6 months */
const startProblem = (startOn: string) => {
  const d = daysTo(startOn);
  if (d < -731) return 'The start date is more than 2 years back — record only tenancies that are still running.';
  if (d > 183) return 'The start date is more than 6 months ahead.';
  return null;
};

function view(t: Tenancy, now = Date.now()) {
  const flags = flagsOf(t, now);
  return {
    ...t,
    flags, daysLeft: daysTo(t.endOn, now), nextRent: nextRent(t.rent, t.escalationPct),
    property: t.propertyId ? (() => { const p = db.byId('properties', t.propertyId) as Property | undefined; return p ? { id: p.id, status: p.listingStatus, relisted: st().properties.some(x => x.resaleOf === p.id && !['withdrawn', 'sold', 'rented'].includes(x.listingStatus)), purged: !!p.purgedAt, mine: p.listingBrokerId === t.brokerId } : null; })() : null,
  };
}
const ORDER: RentFlag[] = ['OVERDUE', 'ENDING_7', 'POLICE', 'ENDING_30', 'NOTICE', 'ENDING_60'];
const urgency = (f: RentFlag[]) => f.length ? Math.min(...f.map(x => ORDER.indexOf(x))) : 99;

/** where a new tenancy can start from: my rent deal rooms and my rent listings that have no running tenancy yet */
function sourcesFor(u: UserProfile) {
  const s = st(); const taken = new Set(s.tenancies.filter(t => t.brokerId === u.id && t.status !== 'ENDED').flatMap(t => [t.dealRoomId, t.propertyId].filter(Boolean) as string[]));
  const out: { kind: 'DEAL' | 'LISTING'; id: string; propertyId: string; dealRoomId?: string; label: string; place: string; rent: number; ownerName?: string; ownerPhone?: string }[] = [];
  const placeOf = (p: Property) => `${p.propertyType}, ${p.locality}`.slice(0, L.place);
  for (const d of s.dealRooms.filter(d => isDealBroker(u, d))) {
    const p = db.byId('properties', d.propertyId) as Property | undefined;
    if (!isRent(p) || taken.has(d.id) || taken.has(p!.id)) continue;
    const own = p!.listingBrokerId === u.id; // the owner's details only to the broker who holds the listing
    out.push({ kind: 'DEAL', id: d.id, propertyId: p!.id, dealRoomId: d.id, label: `${d.id} · ${p!.title}`.slice(0, 120), place: placeOf(p!), rent: p!.askingPrice, ...(own && !p!.purgedAt ? { ownerName: p!.ownerName, ownerPhone: p!.ownerPhone } : {}) });
  }
  for (const p of s.properties.filter(p => p.listingBrokerId === u.id && isRent(p) && ['active', 'under_negotiation', 'rented'].includes(p.listingStatus) && !p.purgedAt)) {
    if (taken.has(p.id) || out.some(x => x.propertyId === p.id)) continue;
    out.push({ kind: 'LISTING', id: p.id, propertyId: p.id, label: `${p.id} · ${p.title}`.slice(0, 120), place: placeOf(p), rent: p.askingPrice, ownerName: p.ownerName, ownerPhone: p.ownerPhone });
  }
  return out.slice(0, 60);
}

export function rentCounts(uid: string, now = Date.now()) {
  const s = st();
  const all = s.tenancies.filter(t => t.brokerId === uid);
  const fl = all.filter(t => t.status !== 'ENDED').map(t => flagsOf(t, now));
  // a rent deal of his that reached the agreement / handover in the last 90 days and is not on his desk yet
  const linked = new Set(all.flatMap(t => [t.dealRoomId, t.propertyId].filter(Boolean) as string[]));
  const toRecord = s.dealRooms.filter(d => (d.introducingBrokerId === uid || d.closingBrokerId === uid) && ['Agreement', 'Handover', 'Settled'].includes(d.stage)
    && !linked.has(d.id) && !linked.has(d.propertyId) && Date.parse((d as any).updatedAt || (d as any).createdAt || '') > now - 90 * 86400_000
    && isRent(db.byId('properties', d.propertyId) as Property | undefined)).length;
  return {
    rentEnding: fl.filter(f => f.some(x => x === 'OVERDUE' || x.startsWith('ENDING_'))).length,
    rentPolice: fl.filter(f => f.includes('POLICE')).length,
    rentToRecord: toRecord,
  };
}

export function createRentRouter() {
  const r = Router();
  // the print button of the term sheet (a script file: the page allows no inline script)
  r.get('/sheet.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }); res.send("(function(){var b=document.getElementById('pr');if(b)b.addEventListener('click',function(){window.print()})})();"); });
  r.use(needs('rent:use'));
  const load = (req: Request, res: Response) => {
    const t = st().tenancies.find(x => x.id === req.params.id && x.brokerId === me().id);
    if (!t) { bad(res, 'Tenancy not found', 404); return null; }
    return t;
  };

  r.get('/', (_req, res) => {
    const u = me(); const now = Date.now();
    const items = st().tenancies.filter(t => t.brokerId === u.id).map(t => view(t, now))
      .sort((a, b) => (a.status === 'ENDED' ? 1 : 0) - (b.status === 'ENDED' ? 1 : 0) || urgency(a.flags) - urgency(b.flags) || a.endOn.localeCompare(b.endOn));
    const live = items.filter(t => t.status !== 'ENDED');
    res.json({
      success: true, items, sources: sourcesFor(u), keepDays: L.keepDays,
      counts: { running: live.length, ...rentCounts(u.id, now), notice: live.filter(t => t.status === 'NOTICE').length, ended: items.length - live.length },
    });
  });

  r.post('/', rateLimit('rent-new', 60, 3600_000), (req, res) => {
    const u = me(); const s = st();
    const p = createSchema.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Check the form');
    const d = p.data;
    if (s.tenancies.filter(t => t.brokerId === u.id).length >= L.perBroker) return bad(res, 'Too many tenancies on one account', 409);
    const sp = startProblem(d.startOn); if (sp) return bad(res, sp);
    if ((d.lockInMonths || 0) > d.months) return bad(res, 'The lock-in cannot be longer than the term');
    let dealRoomId: string | undefined; let propertyId: string | undefined;
    if (d.dealRoomId) {
      const deal = s.dealRooms.find(x => x.id === d.dealRoomId) as DealRoom | undefined;
      if (!deal || !isDealBroker(u, deal)) return bad(res, 'Deal room not found', 404);
      if (!isRent(db.byId('properties', deal.propertyId) as Property | undefined)) return bad(res, 'This deal room is not for a rent / lease home', 409, 'NOT_RENT');
      dealRoomId = deal.id; propertyId = deal.propertyId;
    } else if (d.propertyId) {
      const prop = db.byId('properties', d.propertyId) as Property | undefined;
      if (!prop || prop.listingBrokerId !== u.id) return bad(res, 'Listing not found', 404);
      if (!isRent(prop)) return bad(res, 'This listing is not for rent / lease', 409, 'NOT_RENT');
      propertyId = prop.id;
    }
    if (s.tenancies.some(t => t.brokerId === u.id && t.status !== 'ENDED' && ((dealRoomId && t.dealRoomId === dealRoomId) || (propertyId && t.propertyId === propertyId))))
      return bad(res, 'A running tenancy for this home is already on your Rent desk', 409, 'DUPLICATE');
    const ts = nowIso();
    const t: Tenancy = {
      id: `TEN-${crypto.randomBytes(5).toString('hex')}`, brokerId: u.id, dealRoomId, propertyId,
      place: d.place, ownerName: d.ownerName, ownerPhone: phone10(d.ownerPhone) || undefined, tenantName: d.tenantName, tenantPhone: phone10(d.tenantPhone) || undefined,
      rent: d.rent, deposit: d.deposit, maintenance: d.maintenance || undefined,
      startOn: d.startOn, months: d.months, endOn: endOf(d.startOn, d.months),
      lockInMonths: d.lockInMonths || undefined, escalationPct: d.escalationPct || undefined, noticeDays: d.noticeDays,
      agreement: d.agreement as Tenancy['agreement'], stampRef: d.stampRef || undefined,
      police: { status: 'NOT_STARTED' }, keysOn: d.keysOn, meterNote: d.meterNote || undefined, note: d.note || undefined,
      status: 'ACTIVE', renewals: [], reminded: {}, consentAt: ts, history: [], createdAt: ts, updatedAt: ts,
    };
    // a term that is already over when it is recorded starts with its past reminders marked (no burst of old alerts)
    for (const k of ['d60', 'd30', 'd7'] as const) if (daysTo(t.endOn) <= Number(k.slice(1))) t.reminded[k] = ts;
    if (daysTo(t.endOn) < 0) t.reminded.over = ts;
    log(t, u, `Recorded: ${rupees(t.rent)}/month, deposit ${rupees(t.deposit)}, ${t.startOn} to ${t.endOn}${dealRoomId ? ` (deal ${dealRoomId})` : propertyId ? ` (listing ${propertyId})` : ''}`);
    s.tenancies.unshift(t); db.save();
    audit(u, t, 'RENT_TENANCY_RECORDED', `${u.name} recorded a tenancy (${t.place}) ${t.startOn} → ${t.endOn}; owner and tenant told their name and number are kept for it`);
    res.json({ success: true, tenancy: view(t) });
  });

  r.get('/:id', (req, res) => { const t = load(req, res); if (!t) return; res.json({ success: true, tenancy: view(t) }); });

  r.patch('/:id', (req, res) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.erasedAt) return bad(res, 'This old tenancy’s details were erased', 409);
    const p = patchSchema.safeParse(req.body); if (!p.success) return bad(res, p.error.issues[0]?.message || 'Check the form');
    const d = p.data; const changes: string[] = [];
    const startOn = d.startOn ?? t.startOn; const months = d.months ?? t.months;
    if (d.startOn !== undefined && d.startOn !== t.startOn) { const sp = startProblem(d.startOn); if (sp) return bad(res, sp); }
    if ((d.lockInMonths ?? t.lockInMonths ?? 0) > months) return bad(res, 'The lock-in cannot be longer than the term');
    for (const [k, v] of Object.entries(d) as [keyof typeof d, unknown][]) {
      const cur = (t as any)[k];
      const next = (k === 'ownerPhone' || k === 'tenantPhone') ? (phone10(v as string) || undefined) : (v === '' ? undefined : v);
      if (next === cur) continue;
      (t as any)[k] = next;
      changes.push(k === 'ownerPhone' || k === 'tenantPhone' ? `${k} changed` : `${k}: ${cur ?? '—'} → ${next ?? '—'}`);
    }
    if (d.startOn !== undefined || d.months !== undefined) {
      const end = endOf(startOn, months);
      if (end !== t.endOn) { t.endOn = end; t.reminded = { ...(t.police.status !== 'DONE' && t.reminded.police ? { police: t.reminded.police } : {}) }; changes.push(`term now ends ${end}`); }
    }
    if (!changes.length) return res.json({ success: true, tenancy: view(t) });
    log(t, u, `Changed — ${changes.join('; ')}`); db.save();
    audit(u, t, 'RENT_TENANCY_CHANGED', `${u.name}: ${changes.join('; ').slice(0, 300)}`);
    res.json({ success: true, tenancy: view(t) });
  });

  r.post('/:id/police', (req, res) => {
    const t = load(req, res); if (!t) return; const u = me();
    const p = z.object({ status: z.enum(POLICE_STEPS.map(x => x.id) as [string, ...string[]]), on: day.optional(), station: z.string().trim().max(L.name).optional(), ref: z.string().trim().max(L.ref).optional() }).strict().safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Check the form');
    const d = p.data;
    if (d.on && daysTo(d.on) > 0) return bad(res, 'That date is in the future');
    if (d.status === 'DONE' && !d.on && !t.police.on) return bad(res, 'Write the date the police verified the tenant');
    if (d.ref && /^\d{12}$/.test(d.ref.replace(/\s/g, ''))) return bad(res, 'That looks like an Aadhaar number — write only the police acknowledgement number', 400, 'LOOKS_LIKE_AADHAAR');
    t.police = { status: d.status as Tenancy['police']['status'], on: d.on ?? t.police.on, station: d.station ?? t.police.station, ref: d.ref ?? t.police.ref };
    if (d.status === 'NOT_STARTED') t.police = { status: 'NOT_STARTED' };
    log(t, u, `Police verification: ${POLICE_STEPS.find(x => x.id === d.status)!.en}${t.police.station ? ` at ${t.police.station}` : ''}${t.police.ref ? ` (ack. ${t.police.ref})` : ''}`); db.save();
    audit(u, t, 'RENT_POLICE_STEP', `${u.name}: police verification ${d.status}`);
    res.json({ success: true, tenancy: view(t) });
  });

  r.post('/:id/renew', (req, res) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.status === 'ENDED') return bad(res, 'This tenancy has ended — record a new one', 409);
    const p = z.object({ months: z.number().int().min(L.monthsMin).max(L.monthsMax).optional(), rent: z.number().int().min(L.rentMin).max(L.rentMax).optional(), startOn: day.optional() }).strict().safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Check the form');
    const from = p.data.startOn || addDays(t.endOn, 1);
    if (from <= t.startOn) return bad(res, 'The new term must start after the current one started');
    const months = p.data.months || t.months; const rent = p.data.rent || nextRent(t.rent, t.escalationPct);
    const to = endOf(from, months);
    t.renewals.push({ at: nowIso(), fromOn: from, toOn: to, rent, byName: u.name });
    log(t, u, `Renewed: ${from} to ${to} at ${rupees(rent)}/month (was ${rupees(t.rent)})`);
    t.startOn = from; t.months = months; t.endOn = to; t.rent = rent; t.status = 'ACTIVE'; t.noticeOn = undefined; t.vacateBy = undefined;
    t.agreement = 'NONE'; t.stampRef = undefined; // a new term needs a new agreement
    t.reminded = t.police.status === 'DONE' ? {} : { police: t.reminded.police };
    db.save();
    audit(u, t, 'RENT_RENEWED', `${u.name} renewed ${t.id}: ${from} → ${to}, ${rupees(rent)}/month`);
    res.json({ success: true, tenancy: view(t) });
  });

  r.post('/:id/notice', (req, res) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.status === 'ENDED') return bad(res, 'This tenancy has already ended', 409);
    const p = z.object({ on: day, by: z.enum(['OWNER', 'TENANT']) }).strict().safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Check the form');
    if (daysTo(p.data.on) > 0) return bad(res, 'Notice is recorded on the day it was given — not a future day');
    t.status = 'NOTICE'; t.noticeOn = p.data.on; t.vacateBy = addDays(p.data.on, t.noticeDays);
    log(t, u, `Notice given by the ${p.data.by === 'OWNER' ? 'owner' : 'tenant'} on ${p.data.on}; home to be empty by ${t.vacateBy}`); db.save();
    audit(u, t, 'RENT_NOTICE', `${u.name}: notice by ${p.data.by.toLowerCase()} on ${p.data.on}`);
    res.json({ success: true, tenancy: view(t) });
  });

  r.post('/:id/vacate', (req, res) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.status === 'ENDED') return bad(res, 'Already ended', 409);
    const p = z.object({ on: day, depositNote: z.string().trim().max(L.note).optional() }).strict().safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Check the form');
    if (daysTo(p.data.on) > 0) return bad(res, 'Record the vacating on the day the tenant actually left');
    if (p.data.on < t.startOn && !t.renewals.length) return bad(res, 'That is before the tenancy started');
    t.status = 'ENDED'; t.vacatedOn = p.data.on; t.depositNote = p.data.depositNote || undefined;
    log(t, u, `Tenant left on ${p.data.on}${t.depositNote ? ` — deposit: ${t.depositNote}` : ''}`); db.save();
    audit(u, t, 'RENT_VACATED', `${u.name}: ${t.id} ended on ${p.data.on}; names and numbers erased after ${L.keepDays} days`);
    res.json({ success: true, tenancy: view(t), eraseOn: addDays(p.data.on, L.keepDays) });
  });

  r.delete('/:id', (req, res) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.renewals.length) return bad(res, 'A renewed tenancy is a record of real work — end it instead of deleting it', 409);
    st().tenancies = st().tenancies.filter(x => x.id !== t.id); db.save();
    audit(u, t, 'RENT_TENANCY_DELETED', `${u.name} deleted ${t.id} (made by mistake)`);
    res.json({ success: true });
  });

  r.get('/:id/sheet', (req, res) => {
    const t = load(req, res); if (!t) return; const u = me();
    const row = (en: string, hi: string, v: string) => `<tr><th>${esc(en)}<br><span class="hi">${esc(hi)}</span></th><td>${esc(v)}</td></tr>`;
    const notice = t.noticeDays;
    const body = `<div class="bar"><button id="pr" type="button">Print / Save as PDF · प्रिंट / PDF</button></div>
<div class="sheet"><h1>Agreed rent terms <span class="hi">· किराये की तय शर्तें</span></h1>
<p class="muted">${esc(t.place)} · ${esc(t.id)} · prepared by ${esc(u.name)}${u.companyName ? `, ${esc(u.companyName)}` : ''} · ${esc(humanDay(todayIst()))}</p>
<table>
${row('Owner', 'मालिक', t.ownerName)}
${row('Tenant', 'किरायेदार', t.tenantName)}
${row('Home', 'घर', t.place)}
${row('Rent per month', 'मासिक किराया', rupees(t.rent))}
${t.maintenance ? row('Maintenance per month', 'मासिक मेंटेनेंस', rupees(t.maintenance)) : ''}
${row('Security deposit (refundable)', 'सिक्योरिटी डिपॉज़िट (वापसी योग्य)', rupees(t.deposit))}
${row('Term', 'अवधि', `${humanDay(t.startOn)} – ${humanDay(t.endOn)} (${t.months} months · महीने)`)}
${t.lockInMonths ? row('Lock-in', 'लॉक-इन', `${t.lockInMonths} months · महीने`) : ''}
${t.escalationPct ? row('Yearly increase', 'सालाना बढ़ोतरी', `${t.escalationPct}%`) : ''}
${row('Notice to leave', 'ख़ाली करने का नोटिस', `${notice} days · दिन`)}
${t.keysOn ? row('Keys handed over', 'चाबी सौंपी', humanDay(t.keysOn)) : ''}
${t.meterNote ? row('Meter readings / fittings', 'मीटर रीडिंग / फ़िटिंग', t.meterNote) : ''}
${row('Tenant police verification', 'किरायेदार का पुलिस वेरिफ़िकेशन', POLICE_STEPS.find(x => x.id === t.police.status)!.en + ' · ' + POLICE_STEPS.find(x => x.id === t.police.status)!.hi + (t.police.ref ? ` (ack. ${t.police.ref})` : ''))}
</table>
<p class="note">${esc(SHEET_NOTE.en)}</p><p class="note hi">${esc(SHEET_NOTE.hi)}</p>
<h2>Police verification — carry <span class="hi">· पुलिस वेरिफ़िकेशन — साथ ले जाएँ</span></h2>
<ul>${POLICE_CHECKLIST.map(c => `<li>${esc(c.en)}<br><span class="hi">${esc(c.hi)}</span></li>`).join('')}</ul>
<div class="sign"><div>Owner · मालिक</div><div>Tenant · किरायेदार</div><div>Broker · ब्रोकर</div></div>
<p class="muted">Made with GENZ Broker Network. GENZ is not a party to this tenancy and holds no money.</p></div>`;
    const css = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,'Noto Sans Devanagari',sans-serif;background:#eef0f3;color:#1b1b1b}.sheet{max-width:760px;margin:0 auto 24px;background:#fff;border-radius:10px;padding:24px}.bar{max-width:760px;margin:12px auto;text-align:right}.bar button{background:#0f172a;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:700}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 6px}.hi{color:#475569;font-weight:500}.muted{color:#666;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}th,td{padding:8px 6px;border-bottom:1px solid #eee;text-align:left;vertical-align:top}th{width:46%;font-weight:600}.note{font-size:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px;margin:12px 0 0}ul{font-size:13px;padding-left:18px}li{margin:4px 0}.sign{display:flex;gap:16px;margin-top:40px}.sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:12px;text-align:center}@media print{body{background:#fff}.bar{display:none}.sheet{box-shadow:none;border-radius:0;padding:0}}`;
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' });
    res.send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>Rent terms · ${esc(t.place)}</title><style>${css}</style></head><body>${body}<script src="/api/rent/sheet.js" defer></script></body></html>`);
  });

  return r;
}

/** hourly: reminders to the broker (only 9 AM – 8 PM IST, so a reminder is never lost to the night silence) and the erasing of old names */
export function sweepRent(now = Date.now()): { reminders: number; erased: number } {
  const s = st(); let reminders = 0; let erased = 0; let changed = false;
  // (tests may send at any hour — never set in production)
  const awake = (process.env.NODE_ENV !== 'production' && process.env.RENT_REMIND_ANY_HOUR === 'true') || (() => { const h = istHour(new Date(now)); return h >= 9 && h < 20; })();
  for (const t of s.tenancies) {
    if (t.erasedAt) continue;
    if (t.status === 'ENDED') {
      const end = t.vacatedOn || t.endOn;
      if (daysTo(end, now) <= -L.keepDays) {
        t.ownerName = 'Owner'; t.tenantName = 'Tenant'; t.ownerPhone = undefined; t.tenantPhone = undefined;
        t.note = undefined; t.meterNote = undefined; t.depositNote = undefined; t.stampRef = undefined; t.police = { status: t.police.status };
        t.history = [{ at: new Date(now).toISOString(), by: 'GENZ', what: `Names and numbers erased ${L.keepDays} days after the tenancy ended` }];
        t.erasedAt = new Date(now).toISOString(); erased++; changed = true;
      }
      continue;
    }
    if (!awake) continue;
    const k = dueReminder(t, now);
    if (k) {
      const left = daysTo(t.endOn, now);
      const [en, hi] = k === 'over'
        ? [[`Rent term is over · ${t.place}`, `Renew it or record the vacating on your Rent desk`], [`किराये की अवधि ख़त्म · ${t.place}`, 'किराया डेस्क पर रिन्यू करें या ख़ाली होना दर्ज करें']]
        : [[`Rent agreement ends in ${left} day(s) · ${t.place}`, `Ask ${first(t.ownerName)} and ${first(t.tenantName)}: renew or re-let? WhatsApp lines are ready.`], [`किराया अनुबंध ${left} दिन में ख़त्म · ${t.place}`, `${first(t.ownerName)} और ${first(t.tenantName)} से पूछें: रिन्यू या नया किरायेदार? WhatsApp संदेश तैयार है।`]];
      alert(t.brokerId, 'deals', en[0], en[1], '/?tab=rentdesk', { tag: `rent-${t.id}`, hi: [hi[0], hi[1]] });
      t.reminded[k] = new Date(now).toISOString(); reminders++; changed = true;
    }
    if (t.police.status !== 'DONE' && !t.reminded.police && daysTo(t.startOn, now) <= -L.policeAfterDays) {
      alert(t.brokerId, 'deals', `Police verification pending · ${t.place}`, `${first(t.tenantName)} moved in ${-daysTo(t.startOn, now)} days ago — send the owner the checklist on WhatsApp`, '/?tab=rentdesk',
        { tag: `rentp-${t.id}`, hi: [`पुलिस वेरिफ़िकेशन बाक़ी · ${t.place}`, `${first(t.tenantName)} को आए ${-daysTo(t.startOn, now)} दिन हुए — मालिक को WhatsApp पर चेकलिस्ट भेजें`] });
      t.reminded.police = new Date(now).toISOString(); reminders++; changed = true;
    }
  }
  if (changed) db.save();
  return { reminders, erased };
}

/** demo only: three tenancies on the demo broker's desk (ending soon / police pending / ended) */
export function seedDemoRent() {
  if ((process.env.SEED_DEMO_DATA || '').toLowerCase() !== 'true' || (process.env.SEED_DEMO_BULK || '').toLowerCase() !== 'true') return;
  const s = st(); const u = db.byId('users', 'USR-BRK-001') as UserProfile | undefined;
  if (!u || s.tenancies.length) return;
  const today = todayIst(); const ts = nowIso();
  const mk = (place: string, owner: string, ownerPhone: string, tenant: string, tenantPhone: string, rent: number, deposit: number, startOn: string, police: Tenancy['police'], agreement: Tenancy['agreement'], extra: Partial<Tenancy> = {}): Tenancy => ({
    id: `TEN-demo${crypto.randomBytes(3).toString('hex')}`, brokerId: u.id, place, ownerName: owner, ownerPhone, tenantName: tenant, tenantPhone, rent, deposit,
    startOn, months: 11, endOn: endOf(startOn, 11), noticeDays: 30, escalationPct: 5, lockInMonths: 6, agreement, police, status: 'ACTIVE',
    renewals: [], reminded: {}, consentAt: ts, history: [{ at: ts, by: u.name, what: 'Recorded' }], createdAt: ts, updatedAt: ts, ...extra,
  });
  s.tenancies.push(
    mk('2 BHK flat, Shankar Nagar', 'Ramesh Agrawal', '9131200021', 'Ankit Verma', '9131200022', 16000, 32000, addDays(today, -310), { status: 'DONE', on: addDays(today, -300), station: 'Telibandha thana', ref: 'CG-TV-48211' }, 'SIGNED', { maintenance: 1500, meterNote: 'Electricity 14231 · Water 0412' }),
    mk('1 BHK, Telibandha', 'Kavita Sahu', '9131200023', 'Rohit Nair', '9131200024', 9500, 19000, addDays(today, -12), { status: 'NOT_STARTED' }, 'DRAFTED'),
    mk('Shop 12, Pandri market', 'Harish Jain', '9131200025', 'Meena Traders', '9131200026', 22000, 66000, addDays(today, -400), { status: 'DONE', on: addDays(today, -395) }, 'SIGNED', { status: 'ENDED', vacatedOn: addDays(today, -20), depositNote: 'Full deposit returned' }),
  );
  db.save();
}
