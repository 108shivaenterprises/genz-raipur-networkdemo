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
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { db } from './db.js';
import type { ShopPartner, PartnerLead, UserProfile, ClientCard } from './db.js';
import { ctx, needs, rateLimit, secret, hit, secureOtp, safeEqual, parseCookies } from './auth.js';
import { sendSms } from './notify.js';
import { pushTo } from './webpush.js';
import { partyBlock } from './partywatch.js';
import { shownHomes, pagePhotos, canShow } from './publicPage.js';
import { brandOf } from './share.js';
import { priceShort } from '../src/shared/publicPageRules.js';
import { ackText, ACK_VERSION } from '../src/shared/visitAckRules.js';
import {
  PARTNER_LIMITS as L, LEAD_KINDS, LEAD_STATUSES, PAYOUT_LABEL, checkTerms, cleanTerms, sameTerms, partnerAmount, sideOfKind, termsText, cutText,
  type PartnerTerms, type LeadKind, type LeadStatus,
} from '../src/shared/shopPartner.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
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
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const bad = (res: Response, error: string, status = 400, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const when = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const hist = (x: { history: ShopPartner['history']; updatedAt: string }, by: ShopPartner['history'][number]['by'], text: string) => { x.history.push({ at: nowIso(), by, text }); if (x.history.length > 200) x.history.splice(0, x.history.length - 200); x.updatedAt = nowIso(); };
const partnerOf = (id: string) => st().shopPartners.find(p => p.id === id);
const userOf = (id: string) => st().users.find(u => u.id === id);
const audit = (refId: string, action: string, text: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'LEAD', refId, action, text); };

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
  const f: { code: 'AFTER_LOST' | 'DEAL_NOT_RECORDED'; en: string; hi: string }[] = [];
  if (l.status === 'LOST' && l.lostAt && links.some(x => x.at > l.lostAt!)) f.push({ code: 'AFTER_LOST', en: 'Worked on after it was marked “not going ahead”', hi: '“आगे नहीं बढ़ी” बताने के बाद भी इस पर काम हुआ' });
  if (l.status !== 'WON' && links.some(x => x.done && (x.kind === 'DEAL' || x.kind === 'CLIENT'))) f.push({ code: 'DEAL_NOT_RECORDED', en: 'Looks like a deal — the partner’s share is not written yet', hi: 'डील लगती है — पार्टनर का हिस्सा अभी दर्ज नहीं' });
  return f;
}
const locked = (l: PartnerLead) => Date.parse(l.lockUntil) > Date.now();

// ───────────────────────────── views ─────────────────────────────
function partnerView(p: ShopPartner) {
  const leads = st().partnerLeads.filter(l => l.partnerId === p.id);
  return {
    id: p.id, shopName: p.shopName, personName: p.personName, area: p.area, city: p.city, phoneLast4: p.phoneLast4, status: p.status,
    terms: p.terms, termsVersion: p.termsVersion, pending: p.pending || null, qrCode: p.qrCode,
    qrUrl: `/q/${p.qrCode}`, posterUrl: `/q/${p.qrCode}/poster`, pageUrl: p.token ? `/sp/${p.token}` : '',
    scans: p.scans, lastScanAt: p.lastScanAt, lastPartnerSeenAt: p.lastPartnerSeenAt, acceptedAt: p.acceptedAt, createdAt: p.createdAt,
    devices: (p.devices || []).map(d => ({ id: d.id, label: d.label, lastAt: d.lastAt })),
    codeForPartner: p.otpPlain && p.otpExpires && Date.parse(p.otpExpires) > Date.now() ? p.otpPlain : undefined, smsOn: smsOn(),
    counts: {
      leads: leads.length, open: leads.filter(l => !['WON', 'LOST'].includes(l.status)).length, won: leads.filter(l => l.status === 'WON').length,
      due: leads.filter(l => l.payout && ['DUE', 'NOT_RECEIVED'].includes(l.payout.status)).reduce((n, l) => n + (l.won?.amount || 0), 0),
      paid: leads.filter(l => l.payout && ['PAID', 'RECEIVED'].includes(l.payout.status)).reduce((n, l) => n + (l.won?.amount || 0), 0),
    },
    history: p.history.slice(-30),
  };
}
function leadView(l: PartnerLead) {
  const links = linksFor(l); const p = partnerOf(l.partnerId);
  return { ...l, shopName: p?.shopName || '', city: p?.city || '', links, flags: flagsFor(l, links), locked: locked(l), history: l.history.slice(-30) };
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
      }; });
    res.json({ success: true, items: rows });
  });

  r.get('/', needs('partner:manage'), (_req, res) => {
    const u = me();
    const partners = st().shopPartners.filter(p => p.brokerId === u.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const leads = st().partnerLeads.filter(l => l.brokerId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(leadView);
    res.json({ success: true, partners: partners.map(partnerView), leads, limits: L });
  });

  r.post('/', needs('partner:manage'), rateLimit('sp-create', 40, 3600_000), (req: Request, res: Response) => {
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
    const token = newToken(); let qrCode = newQrCode(); while (st().shopPartners.some(p => p.qrCode === qrCode)) qrCode = newQrCode();
    const now = nowIso();
    const p: ShopPartner = {
      id: rid('SHP'), brokerId: u.id, shopName, personName, area, city, phoneKey, phoneLast4: phone.slice(-4), qrCode,
      tokenHash: sha(token), sessVersion: 1, linkAt: now, status: 'PENDING', terms: cleanTerms(b.terms), termsVersion: 1,
      scans: 0, history: [], createdAt: now, updatedAt: now,
    };
    p.token = token; // the broker can send the same page link again; the page still needs the partner's mobile + a code
    hist(p, 'BROKER', `Partner added — terms proposed: ${termsText(p.terms)}`);
    st().shopPartners.unshift(p); db.save();
    audit(p.id, 'SHOP_PARTNER_ADDED', `Shop QR partner added (${shopName}, ••${p.phoneLast4}) — waiting for the partner to accept the terms`);
    res.json({ success: true, partner: partnerView(p), link: `/sp/${token}`, phone });
  });

  r.post('/:id/link', needs('partner:manage'), (req: Request, res: Response) => {
    const p = mine(req.params.id); if (!p) return bad(res, 'Partner not found', 404);
    if (p.status === 'ENDED') return bad(res, 'This partnership has ended', 409);
    const token = newToken(); p.tokenHash = sha(token); p.token = token; p.sessVersion += 1; p.linkAt = nowIso(); p.devices = [];
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
  for (const [path, to, text] of [['pause', 'PAUSED', 'Paused — the QR form says “not taking requests right now”'], ['resume', 'ACTIVE', 'Resumed'], ['end', 'ENDED', 'Partnership ended — the QR stops; leads already in keep their terms']] as const) {
    r.post(`/:id/${path}`, needs('partner:manage'), (req: Request, res: Response) => {
      const p = mine(req.params.id); if (!p) return bad(res, 'Partner not found', 404);
      if (p.status === 'ENDED') return bad(res, 'This partnership has ended', 409);
      if (to === 'ACTIVE' && p.status !== 'PAUSED') return bad(res, 'Only a paused partnership can be resumed', 409);
      if (to === 'PAUSED' && p.status !== 'ACTIVE') return bad(res, 'Only an active partnership can be paused', 409);
      p.status = to; if (to === 'ENDED') { p.endedAt = nowIso(); p.pending = undefined; }
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
  r.post('/leads/:id/won', needs('partner:manage'), (req: Request, res: Response) => {
    const l = mineLead(req.params.id); if (!l) return bad(res, 'Lead not found', 404);
    if (l.status === 'WON') return bad(res, 'Already written as a closed deal', 409);
    const brokerage = Number(req.body?.brokerage);
    if (!Number.isInteger(brokerage) || brokerage < 1 || brokerage > 50_00_00_000) return bad(res, 'Write your own brokerage on this deal in whole rupees');
    const side = sideOfKind(l.kind); const cut = side === 'SALE' ? l.terms.sale : l.terms.rent;
    const amount = partnerAmount(cut, brokerage);
    l.status = 'WON'; l.lostAt = undefined; l.lostReason = undefined;
    l.won = { at: nowIso(), brokerage, amount, side };
    l.payout = { status: 'DUE' };
    hist(l, 'BROKER', `Deal done — partner’s share ${inr(amount)} (${cutText(cut)})`); db.save();
    audit(l.id, 'SHOP_PARTNER_LEAD_WON', `Shop QR lead closed — partner share recorded (${cutText(cut)})`);
    res.json({ success: true, lead: leadView(l) });
  });
  r.post('/leads/:id/paid', needs('partner:manage'), (req: Request, res: Response) => {
    const l = mineLead(req.params.id); if (!l) return bad(res, 'Lead not found', 404);
    if (!l.payout || !['DUE', 'NOT_RECEIVED'].includes(l.payout.status)) return bad(res, 'Nothing is due on this lead', 409);
    const ref = str(req.body?.ref, 60);
    l.payout = { ...l.payout, status: 'PAID', paidAt: nowIso(), ref: ref || undefined };
    hist(l, 'BROKER', `Marked paid to the partner${ref ? ` (ref ${ref})` : ''} — waiting for the partner to confirm`); db.save();
    audit(l.id, 'SHOP_PARTNER_PAID', 'Broker marked the partner share as paid');
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
.lead{border-top:1px solid #eee;padding:10px 0}.chip{display:inline-block;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700;background:#eef1f7;margin:2px 4px 0 0}.chip.ok{background:#dcfce7;color:#166534}.chip.w{background:#fef3c7;color:#92400e}.chip.x{background:#fee2e2;color:#991b1b}
.hms{display:grid;gap:10px;margin-top:8px}.hm{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}.hm .ph{position:relative;background:#e5e7eb;aspect-ratio:16/10;overflow:hidden}.hm .ph canvas{display:block;width:100%;height:100%;-webkit-touch-callout:none;user-select:none}
.hm .np{position:absolute;inset:0;display:none;align-items:center;justify-content:center;color:#64748b;font-size:13px;font-weight:600}.hm .ph.nophoto .np{display:flex}.hm .ph.nophoto canvas{display:none}.hm .bd{padding:10px 12px 12px}.hm .pr{font-size:19px;font-weight:800}.hm .tt{font-weight:700;font-size:14px;margin-top:2px}.hm .sb{color:#555;font-size:12px;margin-top:2px}
.net{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700;margin-top:6px}.big2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.big2 .btn{text-align:center;padding:14px 8px}.pick{background:#e9f7ee;border:1px solid #86efac}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.stats div{background:#f3f4f6;border-radius:10px;padding:10px;text-align:center}.stats b{display:block;font-size:18px}`;
const shell = (title: string, body: string) => `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" type="image/png" href="/icon-192.png"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="w">${body}</div></body></html>`;
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
      return `<article class="hm" id="h-${esc(h.id)}"><div class="ph${ph ? '' : ' nophoto'}"><canvas width="640" height="400"${ph ? ` data-src="${esc(ph)}"` : ''} data-wm="${esc(wm)}" aria-label="${esc(h.title)}"></canvas><span class="np">📷</span></div>
<div class="bd"><div class="pr">${esc(priceShort(h.askingPrice))}${rent ? ' <small>/ माह</small>' : ''}</div><div class="tt">${esc(h.title)}</div><div class="sb">${esc(h.propertyType)} · ${esc(h.locality)}, ${esc(h.city)}</div>${net ? '<span class="net">GENZ नेटवर्क लिस्टिंग / GENZ network listing</span>' : ''}
<div class="row"><a class="btn g" href="/q/${esc(p.qrCode)}?home=${encodeURIComponent(h.id)}#form" data-testid="qr-interested">👍 मुझे पसंद है / I'm interested</a></div></div></article>`;
    };
    const first = homes.slice(0, 6); const rest = homes.slice(6);
    return `<h2>मेरे पास ये घर हैं / Homes I can show you <small>(${homes.length})</small></h2><div class="hms">${first.map(one).join('')}</div>${rest.length ? `<details style="margin-top:10px"><summary class="small" style="cursor:pointer;font-weight:700;min-height:36px">और ${rest.length} घर / ${rest.length} more homes</summary><div class="hms">${rest.map(one).join('')}</div></details>` : ''}<p class="small" style="margin:8px 4px">🔒 पूरा पता और मालिक की जानकारी वेरिफ़ाइड विज़िट पर। / Exact address and owner details only on a verified visit.</p>`;
  };

  const page = (res: Response, p: ShopPartner, msg = '', keep: Record<string, string> = {}, wantQuery: Record<string, unknown> = {}) => {
    const b = userOf(p.brokerId);
    const homes = homesOf(b);
    const picked = homes.find(h => h.id === (keep.home || str(wantQuery.home, 40)));
    const want = str(wantQuery.want, 6);
    const preKind = keep.kind || (picked ? (picked.transactionType === 'Sale' ? 'BUY' : 'RENT_IN') : want === 'buy' ? 'BUY' : want === 'sell' ? 'SELL' : '');
    const kinds = LEAD_KINDS.map(k => `<label><input type="radio" name="kind" value="${k.id}" ${preKind === k.id ? 'checked' : ''} required> ${k.hi}<br><small>${k.en}</small></label>`).join('');
    const types = ['', 'Flat', 'House', 'Plot', 'Shop', 'Office', 'Warehouse', 'Other'];
    const who = b?.name || 'ब्रोकर';
    const ack = ackText(who, picked ? picked.title : 'ब्रोकर द्वारा दिखाई जाने वाली प्रॉपर्टी / the properties shown by the broker');
    res.send(shell('मकान / दुकान / प्लॉट — GENZ', `<div class="top"><h1>मकान · दुकान · प्लॉट</h1><p>किराया या ख़रीद-बिक्री — अपनी ज़रूरत लिखें · ${esc(p.shopName)}</p></div>
${msg ? `<div class="card warn"><p class="t">${msg}</p></div>` : ''}
<div class="card"><p class="t">${esc(who)}${b?.reraNumber ? ` · RERA ${esc(b.reraNumber)}` : ''} आपसे संपर्क करेंगे। <small>A GENZ-verified broker will call you.</small></p>
<div class="big2"><a class="btn g" href="/q/${esc(p.qrCode)}?want=buy#form" data-testid="qr-want-home">🏠 मुझे घर चाहिए<br><small style="color:#e9ffe9">I need a home</small></a><a class="btn l" href="/q/${esc(p.qrCode)}?want=sell#form" data-testid="qr-want-list">📋 मुझे अपनी प्रॉपर्टी देनी है<br><small>I want to list my property</small></a></div></div>
${homes.length && b ? homeCards(b, p, homes) : ''}
<div class="card${picked ? ' pick' : ''}" id="form">${picked ? `<p class="t"><b>👍 ${esc(picked.title)}</b> · ${esc(priceShort(picked.askingPrice))}<br><small>${esc(picked.locality)}, ${esc(picked.city)} — आपने यह घर चुना है / you chose this home</small></p>` : ''}
<form method="post" action="/q/${esc(p.qrCode)}"><input type="hidden" name="t" value="${formTs()}">${picked ? `<input type="hidden" name="home" value="${esc(picked.id)}">` : ''}<input class="hp" type="text" name="website" tabindex="-1" autocomplete="off">
<label>आपको क्या चाहिए? / What do you need?</label><div class="kinds">${kinds}</div>
<label>नाम / Name</label><input type="text" name="name" maxlength="80" required value="${esc(keep.name || '')}" autocomplete="name">
<label>मोबाइल / Mobile</label><input type="tel" name="phone" inputmode="numeric" maxlength="14" required value="${esc(keep.phone || '')}" autocomplete="tel-national" placeholder="98XXXXXXXX">
<label>इलाका / Area</label><input type="text" name="locality" maxlength="80" required value="${esc(keep.locality || (picked ? picked.locality : p.area))}">
<label>बजट / किराया (अंदाज़न) / Budget or rent</label><input type="text" name="budget" maxlength="60" value="${esc(keep.budget || '')}" placeholder="जैसे 40 लाख / 12,000 महीना">
<label>प्रॉपर्टी / Property type</label><select name="ptype">${types.map(x => `<option value="${x}" ${keep.ptype === x ? 'selected' : ''}>${x || '— कोई भी / Any —'}</option>`).join('')}</select>
<label>कुछ और / Anything else</label><textarea name="note" rows="2" maxlength="300">${esc(keep.note || '')}</textarea>
<div class="card warn" style="margin-top:12px" id="promise"><p class="t"><b>ख़रीदने या किराये पर लेने वालों के लिए · For buyers and renters</b></p><p class="t">${esc(ack.hi)}</p><p class="t"><small>${esc(ack.en)}</small></p>
<label class="ck"><input type="checkbox" name="direct" value="1" ${keep.direct === '1' ? 'checked' : ''}><span>मैं यह मानता/मानती हूँ। <small>I agree to this.</small></span></label>
<label>अपना नाम लिखकर हस्ताक्षर करें / Sign by typing your name</label><input type="text" name="sign" maxlength="80" value="${esc(keep.sign || '')}" autocomplete="off"><p class="small">यह आपकी सहमति का रिकॉर्ड है — GENZ आपसे कोई पैसा नहीं लेता। / This is a record of your agreement — GENZ takes no money from you.</p></div>
<label class="ck"><input type="checkbox" name="consent" value="1" required><span>मैं सहमत हूँ कि ${esc(who)} इस बारे में मुझसे फ़ोन / WhatsApp पर संपर्क करें। मेरा पूरा नंबर दुकान वाले को नहीं दिखेगा। <small>I agree that this broker may contact me by phone / WhatsApp. The shop will not see my full number.</small></span></label>
<div class="row"><button class="g" type="submit">भेजें / Send</button></div></form></div>
<p class="small" style="margin:12px 4px">GENZ आपसे कोई पैसा नहीं माँगता। कोई भी रकम देने से पहले कागज़ और RERA ज़रूर जाँचें। / GENZ never asks you for money.</p>${homes.length ? '<script src="/c/page.js" defer></script>' : ''}`));
  };

  r.get('/poster.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.send("(function(){var b=document.getElementById('pr');if(b)b.addEventListener('click',function(){window.print()})})();"); });

  r.get('/:code/poster', rateLimit('sp-poster', 60, 60_000), async (req: Request, res: Response) => {
    const p = byCode(req.params.code); if (!p || p.status === 'ENDED') return notLive(res, p);
    const b = userOf(p.brokerId);
    const url = `${req.protocol}://${req.get('host')}/q/${p.qrCode}`;
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 300 });
    noStore(res);
    res.send(`<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>QR poster — ${esc(p.shopName)}</title>
<style>@page{size:A5;margin:10mm}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#eee}.pg{max-width:148mm;margin:10px auto;background:#fff;padding:12mm 10mm;text-align:center;border-radius:6px}
h1{font-size:30px;margin:0;color:#14213d}h2{font-size:18px;margin:6px 0 2px;color:#b45309}.en{color:#555;font-size:13px}.qr{width:62mm;margin:10px auto}.qr svg{width:100%;height:auto}.how{font-size:15px;font-weight:700;margin-top:6px}
.f{margin-top:10px;font-size:12px;color:#333;border-top:1px dashed #bbb;padding-top:8px}.code{font-family:monospace;font-size:12px;color:#666}.p{margin:12px auto;text-align:center}@media print{body{background:#fff}.p{display:none}.pg{margin:0;border-radius:0}}</style></head>
<body><div class="p"><button id="pr" style="padding:10px 18px;font-size:15px;font-weight:700;border-radius:10px;border:0;background:#14213d;color:#fff">🖨 Print / PDF</button></div>
<div class="pg"><h1>मकान · दुकान · प्लॉट</h1><h2>किराये पर लेना-देना या ख़रीदना-बेचना है?</h2><div class="en">House · Shop · Plot — to rent or to buy / sell?</div>
<div class="qr">${svg}</div><div class="how">📱 QR स्कैन करें, अपनी ज़रूरत लिखें — हम कॉल करेंगे</div><div class="en">Scan, write what you need — we will call you</div>
<div class="f">${esc(p.shopName)}, ${esc(p.area)}<br><b>${esc(b?.name || '')}</b>${b?.reraNumber ? ` · RERA ${esc(b.reraNumber)}` : ''} · GENZ verified broker<br><span class="code">${p.qrCode}</span></div></div>
<script src="/q/poster.js" defer></script></body></html>`);
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
    const keep = { kind: str(body.kind, 10), name: str(body.name, 80), phone: str(body.phone, 14), locality: str(body.locality, 80), budget: str(body.budget, 60), ptype: str(body.ptype, 20), note: str(body.note, 300), home: str(body.home, 40), sign: str(body.sign, 80), direct: body.direct === '1' ? '1' : '' };
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
    const prior = s.partnerLeads.find(l => l.brokerId === p.brokerId && l.phone === phone && locked(l) && l.status !== 'WON');
    if (prior) {
      hist(prior, 'CUSTOMER', `Scanned again${prior.partnerId === p.id ? '' : ' at another shop'} (${LEAD_KINDS.find(k => k.id === kind)!.en}${keep.note ? `: ${keep.note.slice(0, 80)}` : ''})`);
      db.save(); return res.redirect(303, `/q/${p.qrCode}/thanks`);
    }
    const lockUntil = new Date(Date.now() + p.terms.lockDays * 86400_000).toISOString();
    const lead: PartnerLead = {
      id: rid('PLD'), partnerId: p.id, brokerId: p.brokerId, kind, name: keep.name, phone, phoneLast4: phone.slice(-4),
      locality: keep.locality, budget: keep.budget || undefined, propertyType: keep.ptype || undefined, note: keep.note || undefined, consentAt: now,
      termsVersion: p.termsVersion, terms: cleanTerms(p.terms), lockUntil, status: 'NEW', history: [], createdAt: now, updatedAt: now,
      ...(home ? { homeId: home.id, homeTitle: home.title.slice(0, 120), homeOwn: home.listingBrokerId === p.brokerId } : {}),
      ...(buyerSide ? (() => { const a = ackText(broker?.name || 'broker', home ? home.title : 'the properties shown by the broker'); return { promise: { at: now, signName: keep.sign, version: ACK_VERSION, text: a.en } }; })() : {}),
    };
    hist(lead, 'CUSTOMER', `Came in by scanning the QR at ${p.shopName} (consent recorded)${home ? ` · interested in “${home.title}”${lead.homeOwn ? '' : ' (another GENZ broker’s listing)'}` : ''}`);
    if (lead.promise) hist(lead, 'CUSTOMER', `Agreed “no direct deal” (wording ${ACK_VERSION}) and signed as “${lead.promise.signName}”`);
    // a buyer / renter also lands in the broker's own client list (Today & Clients) so the follow-up is not missed
    if (kind === 'BUY' || kind === 'RENT_IN') {
      const has = s.clientCards.find(c => c.brokerId === p.brokerId && phone10(c.phone) === phone && c.stage !== 'LOST');
      if (has) lead.clientCardId = has.id;
      else {
        const n = s.clientCards.reduce((m, c) => Math.max(m, Number(c.id.split('-').pop()) || 0), 0) + 1;
        const card: ClientCard = {
          id: `CLI-${String(n).padStart(4, '0')}`, brokerId: p.brokerId, name: keep.name, phone, budgetMin: 0, budgetMax: 0, city: p.city, areas: [keep.locality],
          propertyType: keep.ptype || 'Any', transactionType: kind === 'BUY' ? 'Sale' : 'Rent', tags: ['Shop QR'], notes: `Via ${p.shopName} QR${home ? ` · home: ${home.title}` : ''}${keep.budget ? ` · budget ${keep.budget}` : ''}${keep.note ? ` · ${keep.note}` : ''}`,
          stage: 'NEW', consent: true, timeline: [{ at: now, kind: 'CREATED', text: `From the QR at ${p.shopName}` }], createdAt: now, updatedAt: now,
        };
        s.clientCards.unshift(card); lead.clientCardId = card.id;
      }
    }
    s.partnerLeads.unshift(lead);
    hist(p, 'CUSTOMER', `New ${LEAD_KINDS.find(k => k.id === kind)!.en.toLowerCase()} lead (••${lead.phoneLast4})`);
    db.save();
    db.appendAuditEvent('public', 'SUPERADMIN', 'LEAD', lead.id, 'SHOP_QR_LEAD', `Lead from shop QR ${p.id} (consent recorded${lead.promise ? `; no-direct-deal promise ${ACK_VERSION}` : ''}${home ? `; home ${home.id}` : ''})`);
    void pushTo(p.brokerId, { kind: 'matches', title: `New lead from ${p.shopName}`, body: `${keep.name} — ${LEAD_KINDS.find(k => k.id === kind)!.en}, ${keep.locality}${home ? ` · ${home.title}` : ''}. Call soon.`, url: '/?tab=partners' });
    res.redirect(303, `/q/${p.qrCode}/thanks`);
  });

  r.get('/:code/thanks', (req: Request, res: Response) => {
    noStore(res);
    const p = byCode(req.params.code); if (!p) return notLive(res);
    const b = userOf(p.brokerId);
    res.send(shell('धन्यवाद — GENZ', `<div class="top"><h1>धन्यवाद 🙏</h1><p>Thank you</p></div><div class="card ok"><p class="t"><b>${esc(b?.name || 'ब्रोकर')}</b> आपसे जल्द संपर्क करेंगे।</p><p class="t">${esc(b?.name || 'The broker')} will contact you soon.</p></div>`));
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

export function createPartnerPageRouter() {
  const r = Router();
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

  const render = (req: Request, res: Response, p: ShopPartner, msg = '') => {
    const b = userOf(p.brokerId); const tok = esc(req.params.token);
    const leads = st().partnerLeads.filter(l => l.partnerId === p.id).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
    const due = leads.filter(l => l.payout && ['DUE', 'NOT_RECEIVED'].includes(l.payout.status)).reduce((n, l) => n + (l.won?.amount || 0), 0);
    const got = leads.filter(l => l.payout?.status === 'RECEIVED').reduce((n, l) => n + (l.won?.amount || 0), 0);
    const agree = p.status === 'PENDING'
      ? `<div class="card warn"><p class="t"><b>शर्तें / Terms</b></p><p class="t">${esc(termsText(p.terms, true))}</p><p class="small">${esc(termsText(p.terms))}. हिस्सा ब्रोकर सीधे आपको देंगे — GENZ पैसा नहीं रखता। / The broker pays you directly; GENZ holds no money.</p>
<form method="post" action="/sp/${tok}/accept"><label class="ck"><input type="checkbox" name="ok" value="1" required><span>मैं इन शर्तों से सहमत हूँ और ब्रोकर का QR अपनी दुकान पर रखूँगा। / I agree to these terms and will keep the broker's QR at my shop.</span></label><div class="row"><button class="g" type="submit">मंज़ूर / Accept</button></div></form></div>`
      : p.pending ? `<div class="card warn"><p class="t"><b>ब्रोकर ने शर्त बदलने को कहा है / The broker proposes a change</b></p><p class="t">अभी: ${esc(termsText(p.terms, true))}</p><p class="t">नई: <b>${esc(termsText(p.pending.terms, true))}</b></p>${p.pending.note ? `<p class="small">${esc(p.pending.note)}</p>` : ''}<p class="small">मंज़ूर करने पर नई शर्त सिर्फ़ आगे आने वाली लीड पर लगेगी। / Applies only to leads after you accept.</p>
<div class="row"><form method="post" action="/sp/${tok}/change/accept"><button class="g" type="submit">मंज़ूर / Accept</button></form><form method="post" action="/sp/${tok}/change/decline"><button class="l" type="submit">नहीं / Decline</button></form></div></div>`
      : `<div class="card"><p class="t"><b>आपकी शर्तें / Your terms</b> (v${p.termsVersion})</p><p class="t">${esc(termsText(p.terms, true))}</p><p class="small">${p.status === 'PAUSED' ? 'QR अभी रुका हुआ है। / The QR is paused.' : p.status === 'ENDED' ? 'साझेदारी ख़त्म — पुरानी लीड पर हिस्सा पहले की तरह। / Partnership ended — earlier leads keep their terms.' : 'QR चालू है। / The QR is active.'}</p></div>`;
    const rows = leads.map(l => {
      const kind = LEAD_KINDS.find(k => k.id === l.kind)!; const stt = LEAD_STATUSES.find(x => x.id === l.status)!;
      const links = linksFor(l); const flags = flagsFor(l, links);
      const pay = l.payout ? PAYOUT_LABEL[l.payout.status] : null;
      const act = l.payout && ['DUE', 'PAID'].includes(l.payout.status)
        ? `<div class="row">${l.payout.status === 'PAID' ? `<form method="post" action="/sp/${tok}/lead/${esc(l.id)}/received"><button class="g" type="submit">✔ पैसा मिल गया / Received</button></form>` : ''}
<form method="post" action="/sp/${tok}/lead/${esc(l.id)}/not-received" style="flex:1"><input type="text" name="note" maxlength="200" required placeholder="क्या हुआ? / What happened?"><div class="row"><button class="r" type="submit">✖ नहीं मिला / Not received</button></div></form></div>` : '';
      return `<div class="lead"><b>${kind.hi}</b> · ${esc(l.locality)} · ••${esc(l.phoneLast4)} <small>(${when(l.createdAt)})</small><br>
<span class="chip ${l.status === 'WON' ? 'ok' : l.status === 'LOST' ? 'x' : ''}">${stt.hi}</span>${links.map(x => `<span class="chip">${esc(x.hi)}</span>`).join('')}${flags.map(f => `<span class="chip x">⚠ ${esc(f.hi)}</span>`).join('')}
${l.status === 'LOST' && l.lostReason ? `<br><small>कारण: ${esc(l.lostReason)}</small>` : ''}
${l.won ? `<br><b>आपका हिस्सा: ${inr(l.won.amount)}</b> ${pay ? `<span class="chip ${l.payout!.status === 'RECEIVED' ? 'ok' : l.payout!.status === 'NOT_RECEIVED' ? 'x' : 'w'}">${pay.hi}</span>` : ''}` : ''}
<br><small>${locked(l) ? `यह लीड ${when(l.lockUntil)} तक आपकी है` : 'सुरक्षा का समय पूरा'}</small>${act}</div>`;
    }).join('');
    res.send(shell('QR पार्टनर', `<div class="top"><h1>नमस्ते ${esc(p.personName.split(' ')[0])} 🙏</h1><p>${esc(p.shopName)} · ${esc(b?.name || '')} के साथ QR पार्टनर</p></div>
${msg ? `<div class="card ok"><p class="t">${msg}</p></div>` : ''}${agree}
<div class="card"><div class="stats"><div><b>${p.scans}</b><small>स्कैन</small></div><div><b>${leads.length}</b><small>लीड</small></div><div><b>${leads.filter(l => l.status === 'WON').length}</b><small>डील</small></div></div>
<div class="stats" style="margin-top:8px;grid-template-columns:1fr 1fr"><div><b>${inr(due)}</b><small>बाकी / due</small></div><div><b>${inr(got)}</b><small>मिला / received</small></div></div>
<div class="row"><a class="btn l" href="/q/${esc(p.qrCode)}/poster" target="_blank" rel="noopener">🖨 QR पोस्टर / Poster</a></div></div>
<h2>आपके QR से आई लीड / Leads from your QR (${leads.length})</h2><div class="card">${rows || '<p class="t">अभी कोई लीड नहीं। / No leads yet.</p>'}<p class="small">ग्राहक का पूरा नंबर आपको नहीं दिखता — सिर्फ़ आख़िरी 4 अंक। अगर ब्रोकर इसी नंबर पर बाद में काम करता है तो वह यहाँ अपने आप दिखता है। / You see only the last 4 digits. If the broker works this number later, it shows here by itself.</p></div>
<div class="card"><form method="post" action="/sp/${tok}/ask"><label>ब्रोकर से कुछ कहना है? / Message the broker</label><textarea name="note" rows="2" maxlength="300" required></textarea><div class="row"><button type="submit">भेजें / Send</button></div></form></div>
<p class="small" style="margin:12px 4px">इस पेज को बुकमार्क कर लें — इसी फ़ोन पर बिना कोड के खुलेगा। / Bookmark this page — on this phone it opens without a code. GENZ never asks you for money.</p>`));
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
    db.save(); render(req, res, q, req.query.done === '1' ? 'हो गया ✔ / Done' : '');
  });
  r.post('/:token/otp', rateLimit('sp-otp', 30, 3600_000), form, async (req: Request, res: Response) => {
    noStore(res);
    const p = find(req.params.token); if (!p) return gone(res);
    const phone = phone10(req.body?.phone);
    if (hit(`sp-phone:${p.id}`, 8, 3600_000, 3600_000) > 0) return gate(res, p, req.params.token, 'बहुत बार कोशिश हुई — एक घंटे बाद। / Too many tries — wait an hour.', 'phone', 429);
    if (!PHONE_RE.test(phone) || !safeEqual(hmac('sp-phone', phone), p.phoneKey)) return gate(res, p, req.params.token, 'यह नंबर इस पेज से मेल नहीं खाता। / This number does not match.');
    if (!spKnown(req, p) && (p.devices || []).length >= L.devices) return gate(res, p, req.params.token, 'यह पेज पहले से 2 फ़ोन पर खुला है — ब्रोकर से एक हटवाएँ। / Already open on 2 phones — ask the broker to remove one.', 'phone', 403);
    const otp = secureOtp();
    p.otpHash = hmac('sp-otp', `${p.id}|${otp}`); p.otpExpires = new Date(Date.now() + L.otpMinutes * 60_000).toISOString(); p.otpTries = 0; p.otpPlain = smsOn() ? undefined : otp;
    if (smsOn()) await sendSms(`+91${phone}`, `GENZ: your code to open your QR partner page is ${otp}. Valid ${L.otpMinutes} minutes.`);
    db.save();
    if (!smsOn()) ping(p, 'Your shop partner wants his code', `${p.shopName} is opening his page — read the code out from Shop QR partners.`);
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
    hist(p, 'PARTNER', `Accepted the terms: ${termsText(p.terms)} — QR is live`); db.save();
    db.appendAuditEvent('public', 'SUPERADMIN', 'LEAD', p.id, 'SHOP_PARTNER_ACCEPTED', `Shop partner accepted the terms on his own phone (mobile verified) — v${p.termsVersion}`);
    ping(p, `${p.shopName} accepted`, 'The QR is live now. Print the poster and put it up.');
    back(res, req.params.token);
  });
  r.post('/:token/change/:answer', rateLimit('sp-act', 60, 3600_000), form, (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    if (!p.pending) return back(res, req.params.token);
    if (req.params.answer === 'accept') {
      const old = p.terms; p.terms = p.pending.terms; p.termsVersion += 1; p.pending = undefined;
      hist(p, 'PARTNER', `Accepted the change (v${p.termsVersion}): ${termsText(p.terms)} — was ${termsText(old)}; earlier leads keep their terms`);
      db.appendAuditEvent('public', 'SUPERADMIN', 'LEAD', p.id, 'SHOP_PARTNER_TERMS_ACCEPTED', `Shop partner accepted new terms v${p.termsVersion} (mobile verified)`);
      ping(p, `${p.shopName} accepted the new share`, termsText(p.terms));
    } else if (req.params.answer === 'decline') {
      hist(p, 'PARTNER', `Declined the proposed change (${termsText(p.pending.terms)}) — current terms stay`); p.pending = undefined;
      ping(p, `${p.shopName} declined the new share`, 'The current terms stay.');
    }
    db.save(); back(res, req.params.token);
  });
  r.post('/:token/lead/:id/:what', rateLimit('sp-act', 60, 3600_000), form, (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    const l = st().partnerLeads.find(x => x.id === req.params.id && x.partnerId === p.id);
    if (!l || !l.payout) return back(res, req.params.token);
    if (req.params.what === 'received' && l.payout.status === 'PAID') {
      l.payout = { ...l.payout, status: 'RECEIVED', partnerAt: nowIso() }; hist(l, 'PARTNER', 'Partner confirmed: share received');
      ping(p, `${p.shopName} confirmed the payment`, `${inr(l.won?.amount || 0)} received.`);
    } else if (req.params.what === 'not-received' && ['DUE', 'PAID'].includes(l.payout.status)) {
      const note = str(req.body?.note, 200); if (note.length < 3) return render(req, res, p, 'बताएँ क्या हुआ। / Write what happened.');
      l.payout = { ...l.payout, status: 'NOT_RECEIVED', partnerAt: nowIso(), partnerNote: note }; hist(l, 'PARTNER', `Partner says NOT received: ${note}`);
      db.appendAuditEvent('public', 'SUPERADMIN', 'LEAD', l.id, 'SHOP_PARTNER_NOT_RECEIVED', 'Shop partner says the share was not received (GENZ desk sees it)');
      ping(p, `${p.shopName}: share not received`, note);
    }
    db.save(); back(res, req.params.token);
  });
  r.post('/:token/ask', rateLimit('sp-act', 60, 3600_000), form, (req: Request, res: Response) => {
    const p = authed(req, res); if (!p) return;
    const note = str(req.body?.note, 300); if (note.length < 2) return back(res, req.params.token);
    hist(p, 'PARTNER', `Message: ${note}`); db.save();
    ping(p, `Message from ${p.shopName}`, note.slice(0, 120));
    back(res, req.params.token);
  });
  return r;
}

/** home tiles for the broker */
export function partnerCounts(uid: string) {
  const leads = st().partnerLeads.filter(l => l.brokerId === uid);
  return {
    partnerNew: leads.filter(l => l.status === 'NEW').length,
    partnerDue: leads.filter(l => l.payout && ['DUE', 'NOT_RECEIVED'].includes(l.payout.status)).length,
    partnerCodes: st().shopPartners.filter(p => p.brokerId === uid && p.otpPlain && p.otpExpires && Date.parse(p.otpExpires) > Date.now()).length,
  };
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
