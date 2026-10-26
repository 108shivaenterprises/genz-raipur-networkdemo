/**
 * v48 — Brokerage bills ("payment requests") from a deal broker to the OWNER or the BUYER, one per party.
 *   Broker API   GET/POST /api/deals/:id/payment-requests        (the deal's bills that I made + prefill for the form)
 *                GET      /api/payment-requests                   (all my bills — home tile / list)
 *                POST     /api/payment-requests/:id/remind | /received | /cancel
 *   Party        /pay/:token   (no login: the bill, UPI QR, Print / Save as PDF, "I have paid" with the UTR)
 *
 * GENZ never holds this money: the party pays the broker directly (UPI / bank / cash). The bill is the broker's own document; it is
 * a "tax invoice" only when the broker has a GSTIN and charges GST, otherwise it says so. Reminders go on the broker's own WhatsApp
 * (no paid SMS); GENZ counts them and nudges the broker when a bill is past its due date.
 */
import { priceOf, cutAt } from './hisaab.js';
import { Router, type Request, type Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { db } from './db.js';
import type { DealRoom, PaymentRequest, UserProfile } from './db.js';
import { ctx, needs, rateLimit, safeEqual } from './auth.js';
import { isDealBroker } from './access.js';
import { pushTo } from './webpush.js';
import { isClosed } from '../src/shared/dealClose.js';

const st = () => db.getState();
const nowIso = () => new Date().toISOString();
const me = () => ctx().user as UserProfile;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const phone10 = (p: unknown) => String(p ?? '').replace(/\D/g, '').slice(-10);
const PHONE_RE = /^[6-9]\d{9}$/;
const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,30}$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const bad = (res: Response, error: string, status = 400) => res.status(status).json({ error });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const inr = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const day = (d?: string) => (d ? new Date(`${d.slice(0, 10)}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const STAGES = ['Lead', 'Introduction', 'Site Visit Done', 'Negotiation', 'Agreement', 'Handover', 'Settled'];
export const BILL_FROM_STAGE = 'Agreement';
import { mandateShareAt } from '../src/shared/mandateShare.js';
const MAX_AMOUNT = 10_00_00_000;

const fy = (d = new Date()) => { const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; };
const totals = (items: { amount: number }[], gstPct: number) => { const sub = items.reduce((n, i) => n + i.amount, 0); const gst = Math.round(sub * gstPct / 100); return { sub, gst, total: sub + gst }; };
const overdue = (r: PaymentRequest) => r.status === 'SENT' && Date.parse(`${r.dueOn}T23:59:59+05:30`) < Date.now();
const view = (r: PaymentRequest) => {
  const { tokenHash: _h, ...rest } = r;
  return { ...rest, link: r.token ? `/pay/${r.token}` : '', overdue: overdue(r), ...totals(r.items, r.gstPct) };
};

/** who the bill can be addressed to, with what this broker may already know (names / numbers only where he is allowed to see them) */
function prefillFor(d: DealRoom, u: UserProfile) {
  const s = st(); const p = s.properties.find(x => x.id === d.propertyId);
  const q = s.requirements.find(x => x.id === d.requirementId);
  // the property's own owner record first (a deal's ownerId can be a stand-in in older data)
  const ownerUser = (p?.ownerId && s.users.find(x => x.id === p.ownerId)) || (d.ownerId ? s.users.find(x => x.id === d.ownerId) : undefined);
  const iList = p?.listingBrokerId === u.id;
  const iBroughtBuyer = q?.assignedBrokerId === u.id || d.introducingBrokerId === u.id && d.introducingBrokerId === d.closingBrokerId;
  // amount hints: my own-side fee, or the owner's mandate at the asking / agreed price
  let ownerHint: number | undefined; let buyerHint: number | undefined;
  if (d.feeMode === 'OWN_SIDE') {
    const fee = d.sideFees?.[u.id]?.amount;
    if (d.sellerBrokerId === u.id) ownerHint = fee; if (d.buyerBrokerId === u.id) buyerHint = fee;
  } else if (iList) {
    const m = s.ownerMandates.filter(x => x.propertyId === d.propertyId && x.status === 'ACTIVE').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const price = d.dealValue || m?.advertisedPrice || p?.askingPrice || 0;
    if (m && price) ownerHint = mandateShareAt(m, price).broker;
  }
  // v72 — the buyer-side fee I wrote as % of the final price (or fixed) fills the buyer's bill by itself
  const plan = d.feePlans?.[u.id]?.buyerSide;
  if (plan) buyerHint = cutAt(plan, priceOf(d).price);
  const last = s.paymentRequests.filter(x => x.brokerId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return {
    property: { id: d.propertyId, title: p?.title || d.propertyId, locality: p?.locality || '', city: p?.city || '', dealValue: d.dealValue || p?.askingPrice || 0, transactionType: p?.transactionType },
    owner: { name: p?.ownerName || ownerUser?.name || '', phone: iList ? phone10(p?.ownerPhone || ownerUser?.phone) : '', amount: ownerHint },
    buyer: { name: q?.customerName || '', phone: iBroughtBuyer ? phone10(q?.customerPhone) : '', amount: buyerHint },
    upiId: last?.upiId || '', gstin: u.gstin || last?.gstin || '',
  };
}

export function createPaymentRequestRouter() {
  const r = Router();
  const dealOf = (req: Request, res: Response) => {
    const u = me(); const d = db.byId('dealRooms', req.params.id) as DealRoom | undefined;
    if (!d || !isDealBroker(u, d)) { bad(res, 'Deal room not found', 404); return null; }
    return { u, d };
  };
  const mine = (id: string) => { const x = st().paymentRequests.find(p => p.id === id); return x && x.brokerId === me().id ? x : undefined; };

  r.get('/deals/:id/payment-requests', needs('deal:read'), (req: Request, res: Response) => {
    const c = dealOf(req, res); if (!c) return;
    const list = st().paymentRequests.filter(x => x.dealId === c.d.id && x.brokerId === c.u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, requests: list.map(view), prefill: prefillFor(c.d, c.u), canBill: STAGES.indexOf(c.d.stage) >= STAGES.indexOf(BILL_FROM_STAGE) && !isClosed(c.d) });
  });

  r.post('/deals/:id/payment-requests', needs('deal:commission'), rateLimit('payreq', 60, 3600_000), (req: Request, res: Response) => {
    const c = dealOf(req, res); if (!c) return; const { u, d } = c; const b = req.body || {};
    if (isClosed(d)) return bad(res, 'This deal room is closed — reopen it first', 409);
    if (STAGES.indexOf(d.stage) < STAGES.indexOf(BILL_FROM_STAGE)) return bad(res, `A brokerage bill can be sent from the “${BILL_FROM_STAGE}” stage on`, 409);
    const party = b.party === 'OWNER' || b.party === 'BUYER' ? b.party : null;
    if (!party) return bad(res, 'Choose who pays: the owner or the buyer');
    const partyName = str(b.partyName, 80); const partyPhone = phone10(b.partyPhone);
    if (partyName.length < 2) return bad(res, 'Write the name of the person who pays');
    if (!PHONE_RE.test(partyPhone)) return bad(res, 'Write his 10-digit mobile number (the reminder goes there on WhatsApp)');
    const rawItems = Array.isArray(b.items) ? b.items.slice(0, 5) : [];
    const items = rawItems.map((i: any) => ({ text: str(i?.text, 120), amount: Number(i?.amount) })).filter((i: any) => i.text || i.amount);
    if (!items.length || items.some((i: any) => i.text.length < 3 || !Number.isInteger(i.amount) || i.amount < 1 || i.amount > MAX_AMOUNT)) return bad(res, 'Each line needs a description and a whole-rupee amount');
    const gstPct = Number(b.gstPct || 0);
    if (![0, 5, 12, 18].includes(gstPct)) return bad(res, 'GST must be 0, 5, 12 or 18%');
    const gstin = str(b.gstin, 15).toUpperCase();
    if (gstPct > 0 && !GSTIN_RE.test(gstin)) return bad(res, 'GST can be charged only with a valid GSTIN');
    if (gstin && !GSTIN_RE.test(gstin)) return bad(res, 'That GSTIN does not look right');
    const upiId = str(b.upiId, 100);
    if (upiId && !UPI_RE.test(upiId)) return bad(res, 'That UPI ID does not look right (like name@bank)');
    const dueOn = str(b.dueOn, 10); const due = Date.parse(`${dueOn}T00:00:00+05:30`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || !Number.isFinite(due) || due < Date.now() - 86400_000 || due > Date.now() + 365 * 86400_000) return bad(res, 'Choose a due date (today or later, within a year)');
    const s = st();
    if (s.paymentRequests.some(x => x.dealId === d.id && x.brokerId === u.id && x.party === party && ['SENT', 'PARTY_SAYS_PAID'].includes(x.status))) return bad(res, `You already have an open bill to the ${party === 'OWNER' ? 'owner' : 'buyer'} on this deal — cancel it or mark it received first`, 409);
    const p = s.properties.find(x => x.id === d.propertyId);
    const seq = s.paymentRequests.filter(x => x.brokerId === u.id && x.number.includes(`/${fy()}/`)).length + 1;
    const token = crypto.randomBytes(18).toString('base64url');
    const now = nowIso();
    const pr: PaymentRequest = {
      id: `PRQ-${crypto.randomBytes(5).toString('hex')}`, number: `${(u.brokerId || u.id).replace(/[^A-Za-z0-9-]/g, '').slice(-16)}/${fy()}/${String(seq).padStart(4, '0')}`,
      dealId: d.id, brokerId: u.id, party, partyName, partyPhone,
      propertyTitle: p?.title || d.propertyId, propertyPlace: [p?.locality, p?.city].filter(Boolean).join(', '),
      items, gstPct, gstin: gstin || undefined, upiId: upiId || undefined, dueOn, note: str(b.note, 300) || undefined,
      tokenHash: sha(token), token, status: 'SENT', reminders: [], views: 0, createdAt: now, updatedAt: now,
    };
    s.paymentRequests.unshift(pr); db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', d.id, 'PAYMENT_REQUEST_SENT', `Brokerage bill ${pr.number} made for the ${party === 'OWNER' ? 'owner' : 'buyer'} (••${partyPhone.slice(-4)})`);
    res.json({ success: true, request: view(pr) });
  });

  r.get('/payment-requests', needs('deal:read'), (_req: Request, res: Response) => {
    const u = me();
    const list = st().paymentRequests.filter(x => x.brokerId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ success: true, requests: list.map(view) });
  });

  r.post('/payment-requests/:id/remind', needs('deal:read'), (req: Request, res: Response) => {
    const x = mine(req.params.id); if (!x) return bad(res, 'Bill not found', 404);
    if (!['SENT', 'PARTY_SAYS_PAID'].includes(x.status)) return bad(res, 'This bill is not open', 409);
    x.reminders.push({ at: nowIso() }); x.updatedAt = nowIso(); db.save();
    res.json({ success: true, request: view(x) });
  });
  r.post('/payment-requests/:id/received', needs('deal:commission'), (req: Request, res: Response) => {
    const x = mine(req.params.id); if (!x) return bad(res, 'Bill not found', 404);
    if (!['SENT', 'PARTY_SAYS_PAID'].includes(x.status)) return bad(res, 'This bill is not open', 409);
    const ref = str(req.body?.ref, 60) || x.partySaid?.ref || '';
    if (ref.length < 2) return bad(res, 'Write how it was paid (UTR / cheque no. / “cash”)');
    x.status = 'PAID'; x.paid = { at: nowIso(), ref }; x.updatedAt = nowIso(); db.save();
    const u = me(); db.appendAuditEvent(u.id, u.role, 'COMMISSION', x.dealId, 'PAYMENT_REQUEST_PAID', `Brokerage bill ${x.number} marked received by the broker`);
    res.json({ success: true, request: view(x) });
  });
  r.post('/payment-requests/:id/cancel', needs('deal:read'), (req: Request, res: Response) => {
    const x = mine(req.params.id); if (!x) return bad(res, 'Bill not found', 404);
    if (x.status === 'PAID' || x.status === 'CANCELLED') return bad(res, 'This bill is already closed', 409);
    x.status = 'CANCELLED'; x.cancelledAt = nowIso(); x.updatedAt = nowIso(); db.save();
    res.json({ success: true, request: view(x) });
  });
  return r;
}

// ───────────────────────────── /pay/:token — the party's bill page ─────────────────────────────
const CSS = `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#eef0f3;color:#1b1b1b}.w{max-width:720px;margin:0 auto;padding:14px}
.bill{background:#fff;border-radius:10px;padding:22px;box-shadow:0 1px 3px rgba(0,0,0,.08)}h1{font-size:20px;margin:0}.muted{color:#666;font-size:12px}.row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}th,td{padding:8px 6px;border-bottom:1px solid #eee;text-align:left}td.r,th.r{text-align:right}tr.t td{font-weight:800;font-size:16px;border-top:2px solid #222}
.chip{display:inline-block;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:700}.due{background:#fef3c7;color:#92400e}.paid{background:#dcfce7;color:#166534}.cx{background:#e5e7eb;color:#374151}
.pay{margin-top:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap;border:1px dashed #bbb;border-radius:10px;padding:12px}.pay svg{width:150px;height:150px}
.card{background:#fff;border-radius:10px;padding:14px;margin-top:12px}label{display:block;font-size:13px;font-weight:600;margin:8px 0 4px}input{width:100%;padding:11px;border:1px solid #bbb;border-radius:10px;font-size:16px}
button,.btn{display:inline-block;padding:11px 16px;border-radius:10px;border:0;font-size:15px;font-weight:700;background:#14213d;color:#fff;text-decoration:none;cursor:pointer}.g{background:#1fa855}.l{background:#e5e7eb;color:#111}
.ok{background:#e9f7ee;color:#166534}.top{margin:6px 0 12px;display:flex;gap:8px;flex-wrap:wrap}@media print{body{background:#fff}.np{display:none!important}.w{padding:0}.bill{box-shadow:none;border-radius:0}}`;
const page = (title: string, body: string) => `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><link rel="icon" type="image/png" href="/icon-192.png"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="w">${body}</div><script src="/pay/bill.js" defer></script></body></html>`;

export function createPaymentPageRouter() {
  const r = Router();
  const form = express.urlencoded({ extended: false, limit: '10kb' });
  const find = (token: string) => { if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return undefined; const h = sha(token); return st().paymentRequests.find(x => safeEqual(x.tokenHash, h)); };
  const gone = (res: Response) => res.status(404).send(page('Bill not found', '<div class="card">यह लिंक मान्य नहीं है। / This link is not valid.</div>'));
  r.get('/bill.js', (_req, res) => { res.set({ 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' }); res.send("(function(){var b=document.getElementById('pr');if(b)b.addEventListener('click',function(){window.print()})})();"); });

  const render = async (req: Request, res: Response, x: PaymentRequest, msg = '') => {
    const b = st().users.find(u => u.id === x.brokerId);
    const t = totals(x.items, x.gstPct);
    const open = x.status === 'SENT' || x.status === 'PARTY_SAYS_PAID';
    const upi = x.upiId && open ? `upi://pay?pa=${encodeURIComponent(x.upiId)}&pn=${encodeURIComponent(b?.name || 'Broker')}&am=${t.total}&cu=INR&tn=${encodeURIComponent(`Brokerage ${x.number}`)}` : '';
    const qr = upi ? await QRCode.toString(upi, { type: 'svg', margin: 1, width: 150 }) : '';
    const chip = x.status === 'PAID' ? `<span class="chip paid">भुगतान मिला / PAID</span>` : x.status === 'CANCELLED' ? `<span class="chip cx">रद्द / CANCELLED</span>` : x.status === 'PARTY_SAYS_PAID' ? `<span class="chip due">आपने भुगतान बताया — ब्रोकर की पुष्टि बाकी</span>` : `<span class="chip due">देय / DUE ${esc(day(x.dueOn))}</span>`;
    const taxLine = x.gstPct > 0 ? `Tax invoice · GSTIN ${esc(x.gstin)}` : x.gstin ? `GSTIN ${esc(x.gstin)} · no GST charged on this bill` : 'GST नहीं लगाया गया — यह टैक्स इनवॉइस नहीं है / No GST charged — not a tax invoice';
    res.send(page(`Brokerage bill ${x.number}`, `${msg ? `<div class="card ok np">${msg}</div>` : ''}
<div class="top np"><button id="pr" type="button">🖨 Print / PDF</button>${b?.phone ? `<a class="btn l" href="tel:+91${phone10(b.phone)}">📞 ${esc(b.name)}</a>` : ''}</div>
<div class="bill">
<div class="row"><div><h1>ब्रोकरेज बिल / Brokerage bill</h1><div class="muted">No. ${esc(x.number)} · ${esc(day(x.createdAt))}</div></div><div>${chip}</div></div>
<div class="row" style="margin-top:14px"><div><div class="muted">From / ब्रोकर</div><b>${esc(b?.name || '')}</b>${b?.companyName ? `<br>${esc(b.companyName)}` : ''}${b?.reraNumber ? `<br><span class="muted">RERA ${esc(b.reraNumber)}</span>` : ''}<br><span class="muted">${taxLine}</span></div>
<div><div class="muted">To / भुगतान करने वाले</div><b>${esc(x.partyName)}</b><br><span class="muted">${x.party === 'OWNER' ? 'मालिक / Owner' : 'खरीदार / Buyer'} · ••${esc(x.partyPhone.slice(-4))}</span></div></div>
<div style="margin-top:12px"><div class="muted">Property / प्रॉपर्टी</div><b>${esc(x.propertyTitle)}</b>${x.propertyPlace ? `, ${esc(x.propertyPlace)}` : ''}</div>
<table><thead><tr><th>विवरण / Description</th><th class="r">₹</th></tr></thead><tbody>
${x.items.map(i => `<tr><td>${esc(i.text)}</td><td class="r">${inr(i.amount)}</td></tr>`).join('')}
${x.gstPct > 0 ? `<tr><td>GST ${x.gstPct}%</td><td class="r">${inr(t.gst)}</td></tr>` : ''}
<tr class="t"><td>कुल / Total</td><td class="r">${inr(t.total)}</td></tr></tbody></table>
<p class="muted">भुगतान की आख़िरी तारीख़ / Due by: <b>${esc(day(x.dueOn))}</b>${x.note ? `<br>${esc(x.note)}` : ''}</p>
${x.status === 'PAID' ? `<p class="muted">Received on ${esc(day(x.paid?.at))} · ref ${esc(x.paid?.ref)}</p>` : ''}
${upi ? `<div class="pay"><div>${qr}</div><div><b>UPI से भुगतान / Pay by UPI</b><br><span class="muted">UPI ID: ${esc(x.upiId)}</span><br><a class="btn g np" style="margin-top:8px" href="${esc(upi)}">UPI ऐप खोलें / Open UPI app</a></div></div>` : ''}
<p class="muted" style="margin-top:14px">पैसा सीधे ब्रोकर को दें — GENZ यह पैसा न रखता है न भेजता है। / Pay the broker directly — GENZ does not hold or move this money. Made on GENZ Broker Network.</p>
</div>
${x.status === 'SENT' ? `<div class="card np"><form method="post" action="/pay/${esc(req.params.token)}/paid"><b>भुगतान कर दिया? / Already paid?</b><label>UTR / चेक नं. / “cash”</label><input name="ref" maxlength="60" required><div style="margin-top:10px"><button class="g" type="submit">ब्रोकर को बताएँ / Tell the broker</button></div></form></div>` : ''}`));
  };

  r.get('/:token', rateLimit('pay-view', 90, 60_000), async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
    const x = find(req.params.token); if (!x) return gone(res);
    if (!/bot|crawl|spider|preview|facebookexternalhit|whatsapp/i.test(String(req.headers['user-agent'] || ''))) { x.views += 1; x.lastViewAt = nowIso(); db.save(); }
    await render(req, res, x, req.query.told === '1' ? 'ब्रोकर को बता दिया गया — वे पुष्टि करेंगे। / The broker has been told — he will confirm.' : '');
  });
  r.post('/:token/paid', rateLimit('pay-told', 10, 3600_000), form, (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const x = find(req.params.token); if (!x) return gone(res);
    const ref = str(req.body?.ref, 60);
    if (x.status === 'SENT' && ref.length >= 2) {
      x.status = 'PARTY_SAYS_PAID'; x.partySaid = { at: nowIso(), ref }; x.updatedAt = nowIso(); db.save();
      void pushTo(x.brokerId, { kind: 'deals', title: `${x.partyName} says the brokerage is paid`, body: `Bill ${x.number} · ref ${ref}. Check your account and mark it received.`, url: `/?tab=deals&deal=${x.dealId}` });
    }
    res.redirect(303, `/pay/${req.params.token}?told=1`);
  });
  return r;
}

/** home tile + deal next step: my bills still open, and how many are past the due date */
export function billCounts(uid: string) {
  const mine = st().paymentRequests.filter(x => x.brokerId === uid);
  return {
    billsOpen: mine.filter(x => x.status === 'SENT' || x.status === 'PARTY_SAYS_PAID').length,
    billsOverdue: mine.filter(overdue).length,
    billsToConfirm: mine.filter(x => x.status === 'PARTY_SAYS_PAID').length,
  };
}
export const overdueBillsOnDeal = (dealId: string, uid: string) => st().paymentRequests.filter(x => x.dealId === dealId && x.brokerId === uid && (overdue(x) || x.status === 'PARTY_SAYS_PAID')).length;
