import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** v72 — the shop-QR (lead source) fee shows ONLY to the broker who owns that lead; the other broker never learns it; the shop page shows progress but never a price. */
let db: any; let hv: any; let sp: any; let D: any; let B1: any; let B2: any; let lead: any; let PRICE = 0;
beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'genz-v72u-')); mkdirSync(path.join(dir, 'data')); process.chdir(dir);
  Object.assign(process.env, { SEED_DEMO_DATA: 'true', DEMO_MODE: 'true', NODE_ENV: 'test' });
  ({ db } = await import('../server/db.js')); hv = await import('../server/hisaab.js'); sp = await import('../server/shopPartners.js');
  const s = db.getState();
  B1 = s.users.find((u: any) => u.id === 'USR-BRK-001'); B2 = s.users.find((u: any) => u.id === 'USR-BRK-002');
  D = s.dealRooms.find((d: any) => d.ownerId === 'USR-OWNER-001' && [d.introducingBrokerId, d.closingBrokerId].includes('USR-BRK-001') && [d.introducingBrokerId, d.closingBrokerId].includes('USR-BRK-002'));
  expect(D).toBeTruthy();
  const q = s.requirements.find((x: any) => x.id === D.requirementId); q.assignedBrokerId = 'USR-BRK-001'; q.customerPhone = '9131100077';
  const partner = { id: 'SHP-test', brokerId: 'USR-BRK-001', shopName: 'Gupta Kirana Store', personName: 'M', area: 'x', city: 'Raipur', phoneKey: 'k', phoneLast4: '1101', qrCode: 'QQ', tokenHash: 'h', sessVersion: 1, linkAt: '', status: 'ACTIVE', terms: { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 }, termsVersion: 1, scans: 1, history: [], createdAt: '', updatedAt: '' };
  s.shopPartners.push(partner);
  lead = { id: 'PLD-test', partnerId: 'SHP-test', brokerId: 'USR-BRK-001', kind: 'BUY', name: 'Buyer', phone: '9131100077', phoneLast4: '0077', locality: 'x', consentAt: '2000-01-01T00:00:00Z', termsVersion: 1, terms: partner.terms, lockUntil: '2099-01-01T00:00:00Z', status: 'OFFER' in ({} as any) ? 'NEW' : 'NEW', history: [], createdAt: '2000-01-01T00:00:00Z', updatedAt: '2000-01-01T00:00:00Z' };
  s.partnerLeads.push(lead);
  D.createdAt = '2024-01-01T00:00:00Z';
  PRICE = hv.priceOf(D).price;
  D.feePlans = { 'USR-BRK-001': { buyerSide: { mode: 'PCT', value: 1 } } };
});

describe('lead-source fee', () => {
  it('the lead-owning broker sees the shop fee; the other broker sees nothing about it', () => {
    const mine = hv.hisaabView(D, B1).brokerage; const theirs = hv.hisaabView(D, B2);
    expect(mine.leadFees.length).toBe(1); expect(mine.leadFees[0].shopName).toBe('Gupta Kirana Store');
    expect(mine.leadFees[0].amount).toBe(Math.round(mine.due * 20 / 100));
    expect(mine.netEstimate).toBe(mine.due - mine.leadFees[0].amount);
    const t = JSON.stringify(theirs); expect(t).not.toContain('Gupta'); expect(t).not.toContain('leadFees"'.replace('"', '') + ':[{'); expect(theirs.brokerage.leadFees).toEqual([]);
    expect(JSON.stringify(hv.hisaabView(D, { ...B2, id: 'USR-OWNER-001' }))).not.toContain('Gupta');
  });
  it('when the broker writes the closed share on the lead, the final amount is used', () => {
    lead.status = 'WON'; lead.won = { at: 'x', brokerage: 1, amount: 12345, side: 'SALE' }; lead.payout = { status: 'DUE' };
    const mine = hv.hisaabView(D, B1).brokerage; expect(mine.leadFees[0]).toMatchObject({ amount: 12345, final: true });
    lead.status = 'NEW'; lead.won = undefined; lead.payout = undefined;
  });
});

describe('shop partner page progress', () => {
  it('progress goes Lead → Visit → Offer → Agreement → Closed with a share estimate from Agreement, and never the price', () => {
    sp.setLeadShareEstimator((l: any, id: string) => hv.leadShareEstimate(l, id));
    const links = sp.linksFor(lead); expect(links.some((x: any) => x.kind === 'DEAL' && x.id === D.id)).toBe(true);
    D.stage = 'Negotiation'; let p = sp.progressFor(lead); expect(p.step).toBe(2); expect(p.share).toBe(0);
    D.stage = 'Agreement'; p = sp.progressFor(lead); expect(p.step).toBe(3); expect(p.share).toBeGreaterThan(0); expect(p.final).toBe(false);
    expect(JSON.stringify(p)).not.toContain(String(PRICE));
    lead.status = 'WON'; lead.won = { at: 'x', brokerage: 1, amount: 777, side: 'SALE' }; p = sp.progressFor(lead); expect(p.step).toBe(4); expect(p.share).toBe(777); expect(p.final).toBe(true);
  });
});
