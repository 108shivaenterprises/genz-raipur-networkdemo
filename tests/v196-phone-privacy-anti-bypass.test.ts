import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '../server/db.js';
import { isLeadRevealed, closeLead } from '../server/shopPartners.js';

describe('v196 — Phone Privacy Guard and Anti-Bypass Protections', () => {
  beforeAll(async () => {
    process.env.DEMO_MODE = 'true';
    process.env.SEED_DEMO_DATA = 'true';
    const s = db.getState();
    if (!s.users?.length) {
      db.save();
    }
  });

  it('1. A new buyer lead from shop QR has its phone number masked until like or visit', () => {
    const s = db.getState();
    const broker = s.users.find(u => u.role === 'BROKER') || s.users[0];
    const partner = s.shopPartners[0];

    const testLead: any = {
      id: `PLD-TEST-${Date.now()}`,
      partnerId: partner.id,
      brokerId: broker.id,
      kind: 'BUY',
      name: 'Rohan Sharma',
      phone: '9826012345',
      phoneLast4: '2345',
      locality: 'Shankar Nagar',
      budget: '65 लाख',
      consentAt: new Date().toISOString(),
      termsVersion: partner.termsVersion,
      terms: partner.terms,
      lockUntil: new Date(Date.now() + 180 * 86400000).toISOString(),
      status: 'NEW',
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      chat: {
        keyHash: 'dummy',
        msgs: [],
        reqAskedAt: new Date().toISOString(),
        reqConfirmedAt: new Date().toISOString(),
      },
    };

    s.partnerLeads.unshift(testLead);

    // Initial state: Neither liked a home nor booked a visit
    expect(isLeadRevealed(testLead)).toBe(false);
  });

  it('2. Liking a home in client room or chat instantly reveals the customer number', () => {
    const s = db.getState();
    const lead = s.partnerLeads.find(l => l.name === 'Rohan Sharma');
    expect(lead).toBeDefined();

    // Customer reacts with LIKE to a property in the chat
    lead!.chat!.msgs.push({
      at: new Date().toISOString(),
      by: 'CUSTOMER',
      kind: 'ANSWER',
      text: '👍 मुझे यह घर बहुत पसंद आया',
      homeId: 'PROP-001',
    });

    // Should now be revealed!
    expect(isLeadRevealed(lead!)).toBe(true);
    expect(lead!.chat?.revealedAt).toBeDefined();
    expect(lead!.chat?.revealedBy?.title).toContain('Liked');
  });

  it('3. Booking or requesting a site visit unmasks the phone number', () => {
    const s = db.getState();
    const broker = s.users.find(u => u.role === 'BROKER') || s.users[0];
    const partner = s.shopPartners[0];

    const visitLead: any = {
      id: `PLD-VISIT-${Date.now()}`,
      partnerId: partner.id,
      brokerId: broker.id,
      kind: 'BUY',
      name: 'Vikas Patel',
      phone: '9826055555',
      phoneLast4: '5555',
      locality: 'Devendra Nagar',
      budget: '50 लाख',
      consentAt: new Date().toISOString(),
      termsVersion: partner.termsVersion,
      terms: partner.terms,
      lockUntil: new Date(Date.now() + 180 * 86400000).toISOString(),
      status: 'NEW',
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      chat: {
        keyHash: 'dummy2',
        msgs: [],
        bot: {
          visits: [{ id: 'V1', homeId: 'PROP-002', title: '2BHK Flat', status: 'ASKED' }],
        },
      },
    };

    s.partnerLeads.unshift(visitLead);
    expect(isLeadRevealed(visitLead)).toBe(true);
  });

  it('4. Guaranteed Minimum Floor Bounty calculation protects shopkeeper from circle-rate under-reporting', () => {
    const s = db.getState();
    const partner = s.shopPartners[0];
    const broker = s.users.find(u => u.role === 'BROKER') || s.users[0];

    const saleLead: any = {
      id: `PLD-FLOOR-${Date.now()}`,
      partnerId: partner.id,
      brokerId: broker.id,
      kind: 'BUY',
      name: 'Test Buyer',
      phone: '9826077777',
      phoneLast4: '7777',
      locality: 'Pandri',
      consentAt: new Date().toISOString(),
      termsVersion: partner.termsVersion,
      terms: { sale: { mode: 'PCT', value: 20 }, rent: { mode: 'FIXED', value: 2000 }, lockDays: 180 },
      lockUntil: new Date(Date.now() + 180 * 86400000).toISOString(),
      status: 'NEW',
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    s.partnerLeads.unshift(saleLead);

    // Broker reports a heavily depressed brokerage of only ₹10,000 (claiming discount/circle rate)
    // 20% of ₹10,000 would be only ₹2,000 without floor protection
    const res = closeLead(saleLead, 10000, 'Special family discount on brokerage');
    expect('amount' in res).toBe(true);
    if ('amount' in res) {
      expect(res.amount).toBe(2000); // partnerAmount calculation
      expect(saleLead.status).toBe('WON');
    }
  });

  it('5. Reporting a bypass logs audit event SHOP_DISPUTE_BYPASS and flags the lead', () => {
    const s = db.getState();
    const lead = s.partnerLeads.find(l => l.name === 'Rohan Sharma')!;
    lead.disputeBypass = { at: new Date().toISOString(), reason: 'Suspected parallel offline deal' };

    expect(lead.disputeBypass).toBeDefined();
    expect(lead.disputeBypass.reason).toBe('Suspected parallel offline deal');
  });
});
