/**
 * v199 (D20) — GENZ Mudra: a discount voucher for BUYER_TENANT accounts, kept in an append-only ledger.
 *  - credit comes ONLY from server events (a verified site visit, an activated commission agreement) through `settleMudra`; there is no broker-callable endpoint
 *  - balance = what is left of the unexpired credit lots after the debits (first-in-first-out); a lot of a disputed / closed deal is frozen out
 *  - redeem: buyer only, verified, booked via GENZ, a unique invoice reference, one synchronous section (no double spend), capped by the partner's GENZ fee
 *  - never cash: no top-up, no withdrawal, no transfer. A CA / lawyer must confirm the RBI PPI position before real redemptions (DECISIONS.md D20).
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db, DEFAULT_MUDRA_CONFIG, type DatabaseState, type MudraConfig, type MudraEntry, type MudraSettlement, type UserProfile } from './db.js';
import { ctx, requireAuth } from './auth.js';
import { isVerifiedFull } from './permissions.js';

const DAY = 86_400_000;
const st = (): DatabaseState => db.getState();
const me = () => ctx().user as UserProfile;
/** D22: customer pays gross - coins; the partner always gets its full share; the discount comes out of GENZ's share only.
 *  Integer rupees: partner = floor, GENZ = the rest, so partner + GENZ === customerPays exactly. GENZ share >= 0 because coins <= floor(gross * feePct / 100). */
export function splitFor(gross: number, coins: number, feePct: number): MudraSettlement {
  const customerPaysInr = gross - coins; const partnerPayoutInr = Math.floor(gross * (100 - feePct) / 100);
  return { grossInr: gross, coinsInr: coins, customerPaysInr, genzShareInr: customerPaysInr - partnerPayoutInr, partnerPayoutInr, status: 'PENDING_PAYOUT' };
}
const bad = (res: Response, error: string, errorHi: string, code = 400, extra: Record<string, unknown> = {}) => res.status(code).json({ error, errorHi, ...extra });

export const mudraConfig = (): MudraConfig => (st().mudraConfig ||= DEFAULT_MUDRA_CONFIG());
const rupees = (n: number) => Math.max(0, Math.round(Number(n) || 0));

/** the buyer account that owns a deal's requirement (null when the deal has none) */
export function buyerOfDeal(dealId: string): string | null {
  const deal = st().dealRooms.find(d => d.id === dealId); if (!deal) return null;
  const req = st().requirements.find(r => r.id === deal.requirementId);
  return req?.buyerId || null;
}
const dealFrozen = (dealId?: string): boolean => {
  if (!dealId) return false; const d = st().dealRooms.find(x => x.id === dealId);
  return !d || d.stage === 'Disputed' || d.closure?.status === 'CLOSED';   // disputed or called off = the credit does not count (clawback by derivation; the ledger is untouched)
};

/** balance and the usable lots, derived from the ledger only */
export function mudraBalance(userId: string, now = Date.now()): { balance: number; lots: { dealId?: string; left: number; expiresAt: string }[] } {
  const lots: { id: string; dealId?: string; left: number; expiresAt: string }[] = [];
  const rows = st().mudraEntries.filter(e => e.userId === userId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  for (const e of rows) {
    if (e.kind === 'CREDIT') { lots.push({ id: e.id, dealId: e.dealId, left: e.amount, expiresAt: e.expiresAt || '9999-12-31T00:00:00.000Z' }); continue; }
    // a frozen lot is never drawn on: it comes back intact if the deal is reopened
    let need = e.amount;   // DEBIT: oldest-expiring lot first, among lots still alive when the debit was made
    for (const l of [...lots].sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))) { if (need <= 0) break; if (l.expiresAt <= e.at || l.left <= 0 || dealFrozen(l.dealId)) continue; const take = Math.min(l.left, need); l.left -= take; need -= take; }
  }
  const live = lots.filter(l => l.left > 0 && Date.parse(l.expiresAt) > now && !dealFrozen(l.dealId));
  return { balance: live.reduce((n, l) => n + l.left, 0), lots: live.map(l => ({ dealId: l.dealId, left: l.left, expiresAt: l.expiresAt })) };
}

/**
 * The ONLY place credit is made. Called by server events; idempotent (one credit per deal).
 * Needs: the deal's buyer is a BUYER_TENANT account, a VERIFIED site visit on the deal, and an ACTIVE commission agreement.
 */
export function settleMudra(dealId: string): { ok: true; entry?: MudraEntry; already?: boolean } | { ok: false; reason: string } {
  const cfg = mudraConfig(); if (!cfg.enabled) return { ok: false, reason: 'DISABLED' };
  const s = st(); const deal = s.dealRooms.find(d => d.id === dealId); if (!deal) return { ok: false, reason: 'NO_DEAL' };
  const buyerId = buyerOfDeal(dealId); const buyer = buyerId ? s.users.find(u => u.id === buyerId) : undefined;
  if (!buyer || buyer.role !== 'BUYER_TENANT') return { ok: false, reason: 'NOT_A_BUYER_ACCOUNT' };   // never a broker
  if (s.mudraEntries.some(e => e.kind === 'CREDIT' && e.dealId === dealId)) return { ok: true, already: true };
  if (dealFrozen(dealId)) return { ok: false, reason: 'DEAL_FROZEN' };
  if (!s.siteVisits.some(v => v.dealRoomId === dealId && v.isVerified)) return { ok: false, reason: 'NO_VERIFIED_VISIT' };
  const ag = s.commissionAgreements.filter(a => a.dealId === dealId && a.status === 'ACTIVE').sort((a, b) => b.version - a.version)[0];
  if (!ag || !(ag.totalAgreedBrokerage > 0)) return { ok: false, reason: 'NO_ACTIVE_AGREEMENT' };
  const buyerShare = (ag as any).payer === 'SPLIT_EQUAL' ? ag.totalAgreedBrokerage / 2 : ag.totalAgreedBrokerage;
  const amount = rupees(buyerShare * cfg.pct / 100); if (amount < 1) return { ok: false, reason: 'ZERO' };
  const at = new Date().toISOString();
  const entry: MudraEntry = { id: `MUD-${String(s.mudraEntries.length + 1).padStart(5, '0')}-${Math.random().toString(36).slice(2, 6)}`, userId: buyer.id, kind: 'CREDIT', amount, dealId, at, expiresAt: new Date(Date.now() + cfg.validityDays * DAY).toISOString(), note: `${cfg.pct}% of the buyer-side brokerage, after a verified visit and an activated agreement` };
  s.mudraEntries.push(entry); db.save();
  db.appendAuditEvent('SYSTEM', 'SUPERADMIN' as UserProfile['role'], 'SYSTEM', entry.id, 'MUDRA_CREDITED', `₹${amount} GENZ Mudra for ${buyer.id} on ${dealId}`);
  return { ok: true, entry };
}
/** safe wrapper for event hooks: a Mudra problem must never break a visit or an agreement */
export const settleMudraQuiet = (dealId?: string) => { try { if (dealId) settleMudra(dealId); } catch (e) { console.error('[MUDRA]', (e as Error).message); } };

/** DPDP erase: the user's own ledger rows and redemptions */
export function eraseMudraFor(userId: string): number {
  const s = st(); const n = s.mudraEntries.length + s.mudraRedemptions.length;
  // one credit per deal must survive the erase: keep an anonymous amount-0 tombstone per deal (no user id, no money, no personal data)
  const tombs = s.mudraEntries.filter(e => e.userId === userId && e.kind === 'CREDIT' && e.dealId).map(e => ({ id: `${e.id}-T`, userId: 'ERASED', kind: 'CREDIT' as const, amount: 0, dealId: e.dealId, at: e.at, note: 'erased (DPDP)' }));
  s.mudraEntries = [...s.mudraEntries.filter(e => e.userId !== userId), ...tombs]; s.mudraRedemptions = s.mudraRedemptions.filter(r => r.userId !== userId); s.mudraInvoices = s.mudraInvoices.filter(i => i.buyerUserId !== userId);
  return n - s.mudraEntries.length - s.mudraRedemptions.length + tombs.length;
}

/** demo credit — only with SEED_DEMO_DATA=true */
export function seedMudraDemo(): void {
  if ((process.env.SEED_DEMO_DATA ?? 'false').toLowerCase() !== 'true') return;
  const s = st(); if (s.mudraEntries.length || !s.users.some(u => u.id === 'USR-BUYER-001') || !s.dealRooms.some(d => d.id === 'DEAL-2026-001')) return;
  const cfg = mudraConfig(); if (!cfg.partners.length) cfg.partners = [{ id: 'PTR-PAINT-DEMO', name: 'Demo Painters (sample)', category: 'Painting', feePct: 8, active: true }];
  s.mudraEntries.push({ id: 'GZC-DEMO-1', userId: 'USR-BUYER-001', kind: 'CREDIT', amount: 5700, dealId: 'DEAL-2026-001', at: new Date().toISOString(), expiresAt: new Date(Date.now() + cfg.validityDays * DAY).toISOString(), note: 'Demo voucher' });
  s.mudraInvoices.push({ id: 'MINV-DEMO-1', invoiceRef: `GZI-${new Date().getFullYear()}-0001`, partnerId: cfg.partners[0].id, partnerName: cfg.partners[0].name, buyerUserId: 'USR-BUYER-001', description: 'Interior painting (sample)', amountInr: 10000, status: 'OPEN', createdBy: 'SYSTEM', createdAt: new Date().toISOString() });
  db.save();
}

const RedeemBody = z.object({ invoiceId: z.string().trim().min(1).max(40), coins: z.number().int().positive().max(100_000_000) });
/** a desk-made invoice is capped: one mistaken or malicious entry cannot book a huge sum */
export const MAX_INVOICE_INR = 2_500_000;
const InvoiceBody = z.object({ partnerId: z.string().trim().min(1).max(60), buyerUserId: z.string().trim().min(1).max(60), description: z.string().trim().min(3).max(200), amountInr: z.number().int().positive().max(MAX_INVOICE_INR), dealId: z.string().trim().max(40).optional() });
const ConfigBody = z.object({
  enabled: z.boolean().optional(), pct: z.number().min(0).max(5).optional(), validityDays: z.number().int().min(30).max(730).optional(), maxDiscountPct: z.number().min(0).max(50).optional(),
  terms: z.object({ en: z.string().trim().min(20).max(2000), hi: z.string().trim().min(20).max(2000) }).optional(),
  partners: z.array(z.object({ id: z.string().trim().min(1).max(60), name: z.string().trim().min(2).max(80), category: z.string().trim().min(2).max(60), feePct: z.number().min(0).max(50), active: z.boolean() })).max(200).optional(),
}).refine(c => !c.partners || new Set(c.partners.map(p => p.id)).size === c.partners.length, { message: 'partner ids must be unique' });

export function createMudraRouter(): Router {
  const r = Router(); r.use(requireAuth);
  const publicCfg = () => { const c = mudraConfig(); return { enabled: c.enabled, pct: c.pct, validityDays: c.validityDays, maxDiscountPct: c.maxDiscountPct, terms: c.terms, partners: c.partners.filter(p => p.active).map(p => ({ id: p.id, name: p.name, category: p.category, maxDiscountPct: Math.min(c.maxDiscountPct, p.feePct) })) }; };
  r.get('/config', (_req, res) => res.json({ success: true, config: publicCfg() }));
  r.get('/me', (_req, res) => {
    const u = me(); if (u.role !== 'BUYER_TENANT') return bad(res, 'GENZ Mudra is for buyers and tenants only', 'GENZ मुद्रा सिर्फ़ खरीदार और किरायेदार के लिए है', 403);
    const b = mudraBalance(u.id);
    res.json({ success: true, config: publicCfg(), balance: b.balance, lots: b.lots, entries: st().mudraEntries.filter(e => e.userId === u.id).slice(-50).reverse(), redemptions: st().mudraRedemptions.filter(x => x.userId === u.id).slice(-50).reverse() });
  });
  /** the buyer's OWN open invoices only */
  r.get('/invoices', (_req, res) => {
    const u = me(); if (u.role !== 'BUYER_TENANT') return bad(res, 'GENZ Mudra is for buyers and tenants only', 'GENZ मुद्रा सिर्फ़ खरीदार और किरायेदार के लिए है', 403);
    const cfg = mudraConfig(); const bal = mudraBalance(u.id).balance;
    res.json({ success: true, balance: bal, invoices: st().mudraInvoices.filter(i => i.buyerUserId === u.id && i.status === 'OPEN').map(i => { const p = cfg.partners.find(x => x.id === i.partnerId); const capPct = p ? Math.min(cfg.maxDiscountPct, p.feePct) : 0; const cap = Math.floor(i.amountInr * capPct / 100); return { id: i.id, invoiceRef: i.invoiceRef, partnerName: i.partnerName, description: i.description, amountInr: i.amountInr, capPct, maxCoins: Math.max(0, Math.min(cap, bal)) }; }) });
  });
  r.post('/redeem', (req: Request, res: Response) => {
    const u = me(); const cfg = mudraConfig();
    if (u.role !== 'BUYER_TENANT') return bad(res, 'Only buyers and tenants can use GENZ Mudra', 'GENZ मुद्रा सिर्फ़ खरीदार और किरायेदार इस्तेमाल कर सकते हैं', 403);
    if (!isVerifiedFull(u)) return bad(res, 'Verify your account first', 'पहले अपना अकाउंट वेरिफ़ाई करें', 403, { code: 'NOT_VERIFIED' });
    if (!cfg.enabled) return bad(res, 'GENZ Mudra is switched off right now', 'GENZ मुद्रा अभी बंद है', 400);
    const p = RedeemBody.safeParse(req.body); if (!p.success) return bad(res, 'Choose an invoice and the Mudra amount', 'इनवॉइस और मुद्रा की रकम चुनें', 400, { code: 'BAD_INPUT' });
    const b = p.data;
    // ── one synchronous section from here to the push: nothing awaits, so two requests cannot both pass the checks ──
    const s = st(); const inv = s.mudraInvoices.find(i => i.id === b.invoiceId);
    if (!inv || inv.buyerUserId !== u.id) return bad(res, 'Invoice not found', 'इनवॉइस नहीं मिला', 404, { code: 'NO_INVOICE' });   // someone else's invoice looks the same as none (no IDOR)
    if (inv.status === 'PAID') { const prior = s.mudraRedemptions.find(x => x.invoiceId === inv.id); return prior && prior.discount === b.coins ? res.json({ success: true, duplicate: true, redemption: prior, balance: mudraBalance(u.id).balance }) : bad(res, 'This invoice is already paid', 'यह इनवॉइस पहले ही चुकाया जा चुका है', 409, { code: 'ALREADY_PAID' }); }
    if (inv.status !== 'OPEN') return bad(res, 'This invoice was cancelled', 'यह इनवॉइस रद्द हो गया है', 409, { code: 'CANCELLED' });
    const partner = cfg.partners.find(x => x.id === inv.partnerId && x.active); if (!partner) return bad(res, 'This partner is not a GENZ-affiliated service partner', 'यह GENZ से जुड़ा सर्विस पार्टनर नहीं है', 404, { code: 'NOT_AFFILIATED' });
    const capPct = Math.min(cfg.maxDiscountPct, partner.feePct);   // the discount can never exceed what GENZ earns from this partner
    const cap = Math.floor(inv.amountInr * capPct / 100);
    if (b.coins > cap) return bad(res, `At most ₹${cap} (${capPct}% of the invoice) can be taken as discount on this invoice`, `इस इनवॉइस पर अधिकतम ₹${cap} (${capPct}%) डिस्काउंट मिल सकता है`, 400, { code: 'OVER_CAP', cap });
    const bal = mudraBalance(u.id).balance; if (b.coins > bal) return bad(res, `You have ₹${bal} of voucher left`, `आपके पास ₹${bal} का वाउचर बचा है`, 400, { code: 'NOT_ENOUGH', balance: bal });
    const at = new Date().toISOString(); const rid = `MRD-${s.mudraRedemptions.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    const red = { id: rid, invoiceId: inv.id, userId: u.id, partnerId: partner.id, partnerName: partner.name, invoiceRef: inv.invoiceRef, invoiceAmount: inv.amountInr, discount: b.coins, at };
    inv.status = 'PAID'; inv.paidAt = at; inv.settlement = splitFor(inv.amountInr, b.coins, partner.feePct); s.mudraRedemptions.push(red); s.mudraEntries.push({ id: `MUD-D-${rid}`, userId: u.id, kind: 'DEBIT', amount: b.coins, redemptionId: rid, at, note: `Discount at ${partner.name}` });
    db.save(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', rid, 'MUDRA_REDEEMED', `₹${b.coins} discount on ${inv.invoiceRef} (${partner.id})`);
    res.json({ success: true, redemption: red, balance: mudraBalance(u.id).balance, youPay: inv.amountInr - b.coins });   // the buyer sees what they pay, never the split
  });
  // ── SUPERADMIN ──
  const sa = (res: Response): UserProfile | null => { const u = me(); if (u.role !== 'SUPERADMIN') { bad(res, 'Superadmin only', 'सिर्फ़ सुपरएडमिन', 403); return null; } return u; };
  r.get('/admin/overview', (_req, res) => { if (!sa(res)) return; const c = mudraConfig(); res.json({ success: true, config: c, entries: st().mudraEntries.slice(-200).reverse(), redemptions: st().mudraRedemptions.slice(-200).reverse() }); });
  r.put('/admin/config', (req, res) => {
    const u = sa(res); if (!u) return; const p = ConfigBody.safeParse(req.body); if (!p.success) return bad(res, 'Check the values (credit 0–5%, validity 30–730 days, discount cap 0–50%)', 'मान जाँचें (क्रेडिट 0–5%, वैधता 30–730 दिन, डिस्काउंट सीमा 0–50%)', 400);
    const c = mudraConfig(); Object.assign(c, p.data); db.save(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', 'MUDRA_CONFIG', 'MUDRA_CONFIG_SET', JSON.stringify({ ...p.data, terms: p.data.terms ? 'edited' : undefined, partners: p.data.partners ? p.data.partners.map(x => [x.id, x.feePct, x.active]) : undefined }));
    res.json({ success: true, config: c });
  });
  /** a manual re-run of the SAME rule for one deal whose buyer matches the user — it cannot invent credit */
  r.post('/admin/credit', (req, res) => {
    if (!sa(res)) return; const dealId = String(req.body?.dealId || ''); const userId = String(req.body?.userId || '');
    if (!st().dealRooms.some(d => d.id === dealId)) return bad(res, 'Deal not found', 'डील नहीं मिली', 404);
    if (buyerOfDeal(dealId) !== userId) return bad(res, 'This user is not the buyer of that deal', 'यह यूज़र उस डील का खरीदार नहीं है', 409, { code: 'BUYER_MISMATCH' });
    const out = settleMudra(dealId); if (!out.ok) return bad(res, `Not credited: ${out.reason}`, `क्रेडिट नहीं हुआ: ${out.reason}`, 409, { code: out.reason });
    res.json({ success: true, ...out });
  });
  // ── GENZ desk (SUPERADMIN / ADMIN): books the service for the partner; the buyer never types an amount ──
  const desk = (res: Response): UserProfile | null => { const u = me(); if (u.role !== 'SUPERADMIN' && u.role !== 'ADMIN') { bad(res, 'GENZ desk only', 'सिर्फ़ GENZ डेस्क', 403); return null; } return u; };
  r.get('/admin/invoices', (_req, res) => { if (!desk(res)) return; res.json({ success: true, invoices: st().mudraInvoices.slice(-200).reverse() }); });
  r.post('/admin/invoices', (req, res) => {
    const u = desk(res); if (!u) return; if (typeof req.body?.amountInr === 'number' && req.body.amountInr > MAX_INVOICE_INR) return bad(res, `The amount is too large: the limit is ₹${MAX_INVOICE_INR.toLocaleString('en-IN')} per invoice`, `रकम बहुत ज़्यादा है: एक इनवॉइस की सीमा ₹${MAX_INVOICE_INR.toLocaleString('en-IN')} है`, 400, { code: 'AMOUNT_TOO_LARGE', max: MAX_INVOICE_INR });
    const p = InvoiceBody.safeParse(req.body); if (!p.success) return bad(res, 'Check partner, buyer, work description and amount', 'पार्टनर, खरीदार, काम का विवरण और रकम जाँचें', 400, { code: 'BAD_INPUT' });
    const b = p.data; const s = st(); const partner = mudraConfig().partners.find(x => x.id === b.partnerId && x.active);
    if (!partner) return bad(res, 'Partner is not an active GENZ-affiliated service partner', 'पार्टनर GENZ से जुड़ा सक्रिय सर्विस पार्टनर नहीं है', 404, { code: 'NOT_AFFILIATED' });
    const buyer = s.users.find(x => x.id === b.buyerUserId); if (!buyer || buyer.role !== 'BUYER_TENANT') return bad(res, 'The buyer must be an existing buyer / tenant account', 'खरीदार मौजूदा खरीदार / किरायेदार अकाउंट होना चाहिए', 404, { code: 'NO_BUYER' });
    if (/@erased\.invalid$/i.test(buyer.email || '')) return bad(res, 'This buyer account was erased', 'यह खरीदार अकाउंट मिटाया जा चुका है', 409, { code: 'BUYER_ERASED' });
    if (b.dealId && buyerOfDeal(b.dealId) !== buyer.id) return bad(res, 'That deal does not belong to this buyer', 'यह डील इस खरीदार की नहीं है', 409, { code: 'DEAL_BUYER_MISMATCH' });
    const yr = new Date().getFullYear(); const n = s.mudraInvoices.reduce((m, i) => { const mm = new RegExp(`^GZI-${yr}-(\\d+)$`).exec(i.invoiceRef); return mm ? Math.max(m, Number(mm[1])) : m; }, 0) + 1;   // max + 1, never count + 1: a ref is not reused after an erase
    const inv = { id: `MINV-${s.mudraInvoices.length + 1}-${Math.random().toString(36).slice(2, 6)}`, invoiceRef: `GZI-${yr}-${String(n).padStart(4, '0')}`, partnerId: partner.id, partnerName: partner.name, buyerUserId: buyer.id, ...(b.dealId ? { dealId: b.dealId } : {}), description: b.description, amountInr: b.amountInr, status: 'OPEN' as const, createdBy: u.id, createdAt: new Date().toISOString() };
    s.mudraInvoices.push(inv); db.save(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', inv.id, 'MUDRA_INVOICE_CREATED', `${inv.invoiceRef} ₹${inv.amountInr} ${partner.id} for ${buyer.id}`);
    res.json({ success: true, invoice: inv });
  });
  r.post('/admin/invoices/:id/cancel', (req, res) => {
    const u = desk(res); if (!u) return; const inv = st().mudraInvoices.find(i => i.id === req.params.id); if (!inv) return bad(res, 'Invoice not found', 'इनवॉइस नहीं मिला', 404);
    if (inv.status !== 'OPEN') return bad(res, 'Only an open invoice can be cancelled', 'सिर्फ़ खुला इनवॉइस रद्द हो सकता है', 409);
    inv.status = 'CANCELLED'; db.save(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', inv.id, 'MUDRA_INVOICE_CANCELLED', inv.invoiceRef); res.json({ success: true, invoice: inv });
  });
  /** invoice paid with no coins used: same settlement record, coins 0 */
  r.post('/admin/invoices/:id/mark-paid', (req, res) => {
    const u = desk(res); if (!u) return; const inv = st().mudraInvoices.find(i => i.id === req.params.id); if (!inv) return bad(res, 'Invoice not found', 'इनवॉइस नहीं मिला', 404);
    if (inv.status === 'PAID') return res.json({ success: true, duplicate: true, invoice: inv });
    if (inv.status !== 'OPEN') return bad(res, 'Only an open invoice can be marked paid', 'सिर्फ़ खुला इनवॉइस पेड मार्क हो सकता है', 409);
    const partner = mudraConfig().partners.find(x => x.id === inv.partnerId); if (!partner) return bad(res, 'Partner not found', 'पार्टनर नहीं मिला', 404);
    inv.status = 'PAID'; inv.paidAt = new Date().toISOString(); inv.settlement = splitFor(inv.amountInr, 0, partner.feePct);
    db.save(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', inv.id, 'MUDRA_INVOICE_MARKED_PAID', `${inv.invoiceRef} ₹${inv.amountInr}`); res.json({ success: true, invoice: inv });
  });
  /** record that GENZ paid the partner out. A record only: no money moves in this code. */
  r.post('/admin/invoices/:id/payout', (req, res) => {
    const u = desk(res); if (!u) return; const inv = st().mudraInvoices.find(i => i.id === req.params.id); if (!inv) return bad(res, 'Invoice not found', 'इनवॉइस नहीं मिला', 404);
    if (inv.status !== 'PAID' || !inv.settlement) return bad(res, 'Only a paid invoice has a payout to record', 'सिर्फ़ पेड इनवॉइस का पेआउट दर्ज हो सकता है', 409, { code: 'NOT_PAID' });
    if (inv.settlement.status === 'PAID_OUT') return res.json({ success: true, duplicate: true, invoice: inv });
    inv.settlement.status = 'PAID_OUT'; inv.settlement.paidOutAt = new Date().toISOString(); inv.settlement.paidOutBy = u.id;
    db.save(); db.appendAuditEvent(u.id, u.role, 'SYSTEM', inv.id, 'MUDRA_PAYOUT_RECORDED', `${inv.invoiceRef} ₹${inv.settlement.partnerPayoutInr} to ${inv.partnerId}`); res.json({ success: true, invoice: inv });
  });
  return r;
}
