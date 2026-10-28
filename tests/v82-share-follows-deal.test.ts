import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unpaidDays, payRecord, payRecordText, refOk, OVERDUE, SHARE_LIMITS, partnerAmount } from '../src/shared/shopPartner';

/**
 * v82 — the shop partner's share is worked out from the deal (final price + the owner's mandate + the broker's own fee plan), shown fixed,
 * and every change of it is told to the shop (old → new, the reason) — never typed silently. Late payment has a cost: reminders → pause → desk.
 */
describe('v82 rules (pure)', () => {
  it('a UPI / bank payment needs its reference; cash does not', () => {
    expect(refOk('UPI', '')).toBe(false); expect(refOk('UPI', 'abc')).toBe(false); expect(refOk('UPI', '4471 8820 1133')).toBe(true);
    expect(refOk('BANK', 'UTR123456789')).toBe(true); expect(refOk('CASH', '')).toBe(true);
  });
  it('unpaid days only count while the share is due; the pay record counts on-time, late and overdue', () => {
    const day = 86400_000; const now = Date.parse('2026-10-01T10:00:00Z'); const ago = (d: number) => new Date(now - d * day).toISOString();
    expect(unpaidDays({ won: { at: ago(10) }, payout: { status: 'DUE' } }, now)).toBe(10);
    expect(unpaidDays({ won: { at: ago(10) }, payout: { status: 'PAID' } }, now)).toBe(0);
    expect(unpaidDays({}, now)).toBe(0);
    const r = payRecord([
      { won: { at: ago(30) }, payout: { status: 'RECEIVED', paidAt: ago(25) } },   // on time (5 days)
      { won: { at: ago(40) }, payout: { status: 'PAID', paidAt: ago(10) } },       // late (30 days)
      { won: { at: ago(20) }, payout: { status: 'DUE' } },                          // overdue
      { won: { at: ago(3) }, payout: { status: 'DUE' } },                           // still open — not counted
    ], now);
    expect(r).toMatchObject({ onTime: 1, late: 1, overdue: 1, open: 1, counted: 3 });
    expect(payRecordText(r)).toBe('Shop partners paid on time: 1 of 3');
    expect(payRecordText({ onTime: 0, counted: 0 })).toBe('');
  });
});

let db: any; let hv: any; let sp: any; let D: any; let lead: any; let partner: any; const UID = 'USR-BRK-001';
const iso = (ms: number) => new Date(ms).toISOString();
const mkLead = (id: string, phone: string) => {
  const l: any = { id, partnerId: 'SHP-t82', brokerId: UID, kind: 'BUY', name: 'Buyer', phone, phoneLast4: phone.slice(-4), locality: 'x', consentAt: '2000-01-01T00:00:00Z', termsVersion: 1, terms: partner.terms, lockUntil: '2099-01-01T00:00:00Z', status: 'NEW', history: [], createdAt: '2000-01-01T00:00:00Z', updatedAt: '2000-01-01T00:00:00Z' };
  db.getState().partnerLeads.push(l); return l;
};
beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genz-v82u-')); mkdirSync(path.join(dir, 'data')); process.chdir(dir);
  Object.assign(process.env, { SEED_DEMO_DATA: 'true', DEMO_MODE: 'true', NODE_ENV: 'test' });
  ({ db } = await import('../server/db.js')); hv = await import('../server/hisaab.js'); sp = await import('../server/shopPartners.js');
  sp.setLeadShareEstimator((l: any, id: string) => hv.leadShareEstimate(l, id));
  sp.setLeadShareInfo((l: any, id: string) => hv.leadShareInfo(l, id));
  const s = db.getState();
  D = s.dealRooms.find((d: any) => d.ownerId === 'USR-OWNER-001' && [d.introducingBrokerId, d.closingBrokerId].includes(UID) && [d.introducingBrokerId, d.closingBrokerId].includes('USR-BRK-002'));
  expect(D).toBeTruthy();
  const q = s.requirements.find((x: any) => x.id === D.requirementId); q.assignedBrokerId = UID; q.customerPhone = '9131100082';
  partner = { id: 'SHP-t82', brokerId: UID, shopName: 'Gupta Kirana Store', personName: 'M', area: 'x', city: 'Raipur', phoneKey: 'k', phoneLast4: '1101', qrCode: 'QQ82', tokenHash: 'h', sessVersion: 1, linkAt: '', status: 'ACTIVE', terms: { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 }, termsVersion: 1, scans: 1, history: [], createdAt: '', updatedAt: '' };
  s.shopPartners.push(partner);
  D.createdAt = '2024-01-01T00:00:00Z';
  D.feePlans = { [UID]: { buyerSide: { mode: 'PCT', value: 1 } } };
  D.brokerBook = undefined;
  lead = mkLead('PLD-82a', '9131100082');
});

describe('the share follows the deal', () => {
  it('before the Agreement stage there is no figure; at Agreement the app works it out and records it (no change yet)', () => {
    D.stage = 'Negotiation'; expect(sp.autoShare(lead)).not.toBeNull(); // the figure exists, but the shop is told only from Agreement
    expect(sp.watchLead(lead)).toBe(true); // step moved (Visit/Offer…)
    expect(lead.shareSeen).toBeUndefined();
    D.stage = 'Agreement';
    sp.watchLead(lead);
    const a = sp.autoShare(lead);
    expect(a.brokerage).toBeGreaterThan(0);
    expect(a.amount).toBe(partnerAmount(lead.terms.sale, a.brokerage));
    expect(lead.shareSeen.amount).toBe(a.amount);
    expect(lead.shareChanges ?? []).toHaveLength(0);
  });

  it('the fee plan (or price) moves → the shop is told old → new; quick edits merge into one open change; going back to the shown figure leaves nothing', () => {
    const first = lead.shareSeen.amount;
    D.feePlans[UID].buyerSide = { mode: 'PCT', value: 2 };
    expect(sp.watchLead(lead, 'price firmed up')).toBe(true);
    expect(lead.shareChanges).toHaveLength(1);
    const c = lead.shareChanges[0];
    expect(c).toMatchObject({ from: first, by: 'DEAL', status: 'PENDING', reason: 'price firmed up' });
    const firstTo = c.to; expect(firstTo).toBe(hv.leadShareInfo(lead, D.id).amount); expect(firstTo).toBeGreaterThan(first);
    // a second edit within 30 minutes of the same kind merges into the same open change (the shop is not flooded)
    D.feePlans[UID].buyerSide = { mode: 'PCT', value: 3 };
    sp.watchLead(lead);
    expect(lead.shareChanges).toHaveLength(1); expect(lead.shareChanges[0].to).toBe(hv.leadShareInfo(lead, D.id).amount); expect(lead.shareChanges[0].to).toBeGreaterThan(firstTo);
    // back to the figure he was originally shown → the change disappears
    D.feePlans[UID].buyerSide = { mode: 'PCT', value: 1 };
    sp.watchLead(lead);
    expect(lead.shareChanges).toHaveLength(0);
    expect(lead.shareSeen.amount).toBe(first);
  });

  it('the broker typing his own figure in the हिसाब is a BROKER_EDIT, labelled as such; watchShares finds it by deal', () => {
    const first = lead.shareSeen.amount;
    D.brokerBook = { [UID]: { entries: [], due: 150000 } };
    expect(sp.watchShares({ dealId: D.id, reason: 'agreed lower after the visit' })).toBeGreaterThan(0);
    const c = lead.shareChanges[lead.shareChanges.length - 1];
    expect(c).toMatchObject({ by: 'BROKER_EDIT', from: first, to: partnerAmount(lead.terms.sale, 150000), status: 'PENDING', reason: 'agreed lower after the visit' });
    expect(lead.history.some((h: any) => /BROKER_EDIT|changed his brokerage/i.test(h.text))).toBe(true);
    // the other broker's deal view never learns this
    expect(JSON.stringify(hv.hisaabView(D, db.getState().users.find((u: any) => u.id === 'USR-BRK-002')))).not.toContain('Gupta');
    D.brokerBook = undefined; sp.watchLead(lead);
    lead.shareChanges = []; lead.shareSeen = undefined; sp.watchLead(lead); // reset for the next tests
  });
});

describe('“Deal done” — the share comes from the deal, a correction needs a reason', () => {
  it('with the deal in the app nothing is typed: source DEAL, the fixed share equals what the app worked out, no change is raised', () => {
    const l = mkLead('PLD-82b', '9131100082');
    sp.watchLead(l);
    const a = sp.autoShare(l);
    const r = sp.closeLead(l, undefined, '');
    expect(r.error).toBeUndefined(); expect(r.amount).toBe(a.amount); expect(r.change).toBeNull();
    expect(l.status).toBe('WON'); expect(l.payout.status).toBe('DUE');
    expect(l.won).toMatchObject({ source: 'DEAL', dealId: D.id, brokerage: a.brokerage, amount: a.amount, auto: a.amount });
    expect(sp.closeLead(l, undefined, '').status).toBe(409); // already closed
  });
  it('a different brokerage on a deal in the app needs a reason, and then the shop gets an old → new change', () => {
    const l = mkLead('PLD-82c', '9131100082'); sp.watchLead(l);
    const a = sp.autoShare(l);
    const no = sp.closeLead(l, a.brokerage - 5000, '');
    expect(no.status).toBe(400); expect(no.extra).toMatchObject({ code: 'REASON_NEEDED', auto: a.brokerage }); expect(l.status).toBe('NEW');
    const ok = sp.closeLead(l, a.brokerage - 5000, 'discount to close the deal');
    expect(ok.error).toBeUndefined();
    expect(ok.amount).toBe(partnerAmount(l.terms.sale, a.brokerage - 5000));
    expect(ok.change).toMatchObject({ by: 'BROKER_EDIT', from: partnerAmount(l.terms.sale, a.brokerage), to: ok.amount, status: 'PENDING', reason: 'discount to close the deal' });
    expect(l.won.auto).toBe(partnerAmount(l.terms.sale, a.brokerage)); // what the app had worked out stays on record
  });
  it('a deal that is not in the app: the broker writes his brokerage, and the shop is asked to confirm that figure', () => {
    const l = mkLead('PLD-82d', '9999900001');
    expect(sp.autoShare(l)).toBeNull();
    expect(sp.closeLead(l, undefined, '').status).toBe(400);
    expect(sp.closeLead(l, 0, '').status).toBe(400); expect(sp.closeLead(l, 10.5, '').status).toBe(400);
    const r = sp.closeLead(l, 80000, '');
    expect(r.amount).toBe(16000); expect(r.change).toMatchObject({ by: 'TYPED', from: 0, to: 16000, status: 'PENDING' });
    expect(l.won.source).toBe('TYPED');
  });
});

describe('late payment has a cost', () => {
  let l: any; const day = 86400_000;
  beforeAll(() => { l = db.getState().partnerLeads.find((x: any) => x.id === 'PLD-82b'); vi.useFakeTimers({ toFake: ['Date'] }); });
  afterAll(() => { vi.useRealTimers(); });
  const at = (ms: number) => vi.setSystemTime(ms);

  it('reminders to the broker at 3, 7 and 12 days — once each', () => {
    const wonAt = Date.parse(l.won.at);
    expect(sp.sweepShopPartners(wonAt + 1 * day)).toBe(0);
    expect(sp.sweepShopPartners(wonAt + 3.2 * day)).toBeGreaterThan(0); expect(l.payout.remind).toBe(3);
    expect(sp.sweepShopPartners(wonAt + 3.5 * day)).toBe(0); // same step again → nothing new
    sp.sweepShopPartners(wonAt + 7.2 * day); expect(l.payout.remind).toBe(7);
    sp.sweepShopPartners(wonAt + 12.2 * day); expect(l.payout.remind).toBe(12);
    expect(partner.status).toBe('ACTIVE');
  });
  it('at 15 days GENZ pauses the QR (not the broker): resuming is only possible after the share is paid', () => {
    const wonAt = Date.parse(l.won.at);
    at(wonAt + OVERDUE.pauseDays * day + 1000); sp.sweepShopPartners();
    expect(partner.status).toBe('PAUSED'); expect(partner.pausedBy).toBe('SYSTEM');
    expect(sp.overdueOf(partner).length).toBeGreaterThan(0);
    expect(partner.history.some((h: any) => h.by === 'SYSTEM' && /paused by GENZ/.test(h.text))).toBe(true);
  });
  it('at 30 days it goes to the GENZ desk once (no automatic strike)', () => {
    const wonAt = Date.parse(l.won.at);
    at(wonAt + OVERDUE.deskDays * day + 1000); sp.sweepShopPartners();
    expect(l.payout.deskAt).toBeTruthy();
    const first = l.payout.deskAt; at(wonAt + 31 * day); sp.sweepShopPartners(); expect(l.payout.deskAt).toBe(first);
    expect(sp.flagsFor(l).some((f: any) => f.code === 'PAYOUT_OVERDUE')).toBe(true);
  });
  it('a paid share the shop has not confirmed for 3 days nudges the shop once', () => {
    const k = mkLead('PLD-82e', '9999900002'); sp.closeLead(k, 50000, '');
    k.payout = { status: 'PAID', paidAt: iso(Date.now() - 4 * day), mode: 'UPI', ref: 'UTR1234567' };
    sp.sweepShopPartners(); expect(k.payout.askedAt).toBeTruthy();
    const first = k.payout.askedAt; sp.sweepShopPartners(); expect(k.payout.askedAt).toBe(first);
  });
  it('limits stay sane', () => { expect(SHARE_LIMITS.mergeMinutes).toBeGreaterThanOrEqual(5); expect(OVERDUE.remindDays[0]).toBeLessThan(OVERDUE.pauseDays); expect(OVERDUE.pauseDays).toBeLessThan(OVERDUE.deskDays); });
});

describe('the shop’s cut comes only from the brokerage on its OWN lead’s side', () => {
  it('a broker who earns from both sides: a buyer lead counts only the buyer-side fee, an owner lead only the owner’s mandate; the other side is none of the shop’s business', () => {
    const s = db.getState(); const prop = s.properties.find((p: any) => p.id === D.propertyId); const was = prop.listingBrokerId;
    prop.listingBrokerId = UID;
    s.ownerMandates.push({ id: 'OM-t82', propertyId: prop.id, status: 'ACTIVE', isConfirmed: true, remunerationBasis: 'PERCENTAGE', agreedCommissionPct: 2, createdAt: '2099-01-01T00:00:00Z' });
    D.brokerBook = undefined; D.feePlans = { [UID]: { buyerSide: { mode: 'PCT', value: 1 } } };
    try {
      const price = hv.priceOf(D).price; const mandate = Math.round(price * 2 / 100); const buyerFee = Math.round(price * 1 / 100);
      expect(mandate).toBeGreaterThan(0); expect(buyerFee).toBeGreaterThan(0);
      const terms = partner.terms;
      const buy = hv.leadShareInfo({ brokerId: UID, kind: 'BUY', terms }, D.id);
      expect(buy).toMatchObject({ brokerage: buyerFee, basis: 'PLAN' }); expect(buy.amount).toBe(partnerAmount(terms.sale, buyerFee));
      const sell = hv.leadShareInfo({ brokerId: UID, kind: 'SELL', terms }, D.id);
      expect(sell).toMatchObject({ brokerage: mandate, basis: 'MANDATE' }); expect(sell.amount).toBe(partnerAmount(terms.sale, mandate));
      const rent = hv.leadShareInfo({ brokerId: UID, kind: 'RENT_IN', terms }, D.id); expect(rent.brokerage).toBe(buyerFee);
      const out = hv.leadShareInfo({ brokerId: UID, kind: 'RENT_OUT', terms }, D.id); expect(out.brokerage).toBe(mandate);
      // the broker's own हिसाब still adds up both sides for HIM — only the shop's cut is side-specific
      expect(hv.hisaabView(D, db.getState().users.find((u: any) => u.id === UID)).brokerage.due).toBe(mandate + buyerFee);
      // a buyer lead on a deal where the broker takes nothing from the buyer: the app has no figure for that side → the broker must write it (the shop confirms)
      D.feePlans = {}; const none = hv.leadShareInfo({ brokerId: UID, kind: 'BUY', terms }, D.id);
      expect(none.brokerage).toBe(0); expect(none.amount).toBe(0);
    } finally {
      prop.listingBrokerId = was; s.ownerMandates = s.ownerMandates.filter((m: any) => m.id !== 'OM-t82'); D.feePlans = { [UID]: { buyerSide: { mode: 'PCT', value: 1 } } };
    }
  });
});
