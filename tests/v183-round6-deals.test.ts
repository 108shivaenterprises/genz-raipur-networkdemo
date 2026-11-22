/** v183 — round 6 (deal room): settle → property off the market, history, who acts next, commission status, tap targets, help ticket, client step line. */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { hubItem, paymentDue, sweepPaymentDue } from '../server/dealhub';
import { db } from '../server/db';
import { settleListingFromDeal } from '../server/listings';
import { clientStepOf } from '../src/shared/clientRoomRules';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const DAY = 86_400_000; const now = Date.parse('2026-11-22T10:00:00Z'); const iso = (ms: number) => new Date(ms).toISOString();

const broker = (id: string, extra: any = {}) => ({ id, name: `Broker ${id}`, role: 'BROKER', verificationStatus: 'VERIFIED', ...extra });
function world(agStatus = 'ACTIVE', agUpdated = iso(now - 10 * DAY)) {
  const deal: any = { id: 'DEAL-1', propertyId: 'P1', introducingBrokerId: 'A', closingBrokerId: 'B', stage: 'Agreement', createdAt: iso(now - 30 * DAY), updatedAt: iso(now - 9 * DAY), dealValue: 1e7, introducingBrokerSharePct: 50, closingBrokerSharePct: 50, teamMemberIds: [] };
  const ag: any = { dealId: 'DEAL-1', version: 1, status: agStatus, updatedAt: agUpdated, requiredApprovals: [{ userId: 'A', hasAccepted: true }, { userId: 'B', hasAccepted: agStatus === 'ACTIVE' }],
    allocations: [{ participantId: 'A', allocationAmount: 50000, entitlementStatus: 'RECEIVABLE', payments: [{ id: 'PAY-1', status: 'CONFIRMED', amount: 1, recordedAt: iso(now - 8 * DAY), confirmedAt: iso(now - 7 * DAY), recordedById: 'B' }] }, { participantId: 'B', allocationAmount: 50000, entitlementStatus: 'PAID', payments: [] }] };
  const s: any = { properties: [{ id: 'P1', title: 'Flat', transactionType: 'Sale', askingPrice: 1e7 }], users: [broker('A'), broker('B')], siteVisits: [], dealTasks: [], commissionAgreements: [ag], dealMessages: [], disputes: [], dealRooms: [deal], payRequests: [],
    auditEvents: [{ entityType: 'DEAL', entityId: 'DEAL-1', action: 'STAGE_ADVANCED', details: 'Deal stage transitioned to Negotiation', timestamp: iso(now - 20 * DAY) }, { entityType: 'DEAL', entityId: 'DEAL-1', action: 'DEAL_ROOM_REOPENED', details: 'Reopened: secret text', timestamp: iso(now - 15 * DAY) }] };
  return { deal, ag, s };
}

describe('B/C/D deal hub', () => {
  it('history carries stage, payment and reopen lines (words only), more than 6 are kept', () => {
    const { deal, s } = world(); const h = hubItem(deal, s.users[0], s, new Set(), now);
    const ks = (h.history || []).map((x: any) => x.k);
    expect(ks).toEqual(expect.arrayContaining(['CREATED', 'STAGE', 'REOPENED', 'PAY_ENTERED', 'PAY_CONFIRMED']));
    expect((h.history || []).find((x: any) => x.k === 'STAGE')?.t).toBe('Negotiation');
    expect(JSON.stringify(h.history)).not.toContain('secret');
    expect(read('server/dealhub.ts')).toContain('.slice(0, 40)');
  });
  it('an unrelated user gets no history; commission payment lines need the agreement view', () => {
    const { deal, s } = world(); s.users.push(broker('Z'));
    const h = hubItem(deal, s.users[2], s, new Set(), now);
    expect(h.history).toBeUndefined();
  });
  it('who acts next: waiting-on name and date, next items carry an `at`', () => {
    const { deal, ag, s } = world('SENT_TO_PARTICIPANTS'); ag.requiredApprovals[1].hasAccepted = false;
    const h = hubItem(deal, s.users[0], s, new Set(), now);
    expect(h.agreement).toMatchObject({ waitingOn: 1, waitingName: 'Broker B' }); expect(h.agreement!.waitingSince).toBe(ag.updatedAt);
    const w = world(); const h2 = hubItem(w.deal, w.s.users[0], w.s, new Set(), now);
    expect(h2.next.length).toBeGreaterThan(0); for (const n of h2.next) expect(typeof n.at).toBe('string');
  });
  it('PAYMENT_DUE: active agreement, unpaid share, 7+ days untouched; chip shows Paid / Pending / Hold', () => {
    expect(paymentDue({ status: 'ACTIVE', updatedAt: iso(now - 8 * DAY), allocations: [{ entitlementStatus: 'RECEIVABLE' }] }, now)).toBeTruthy();
    expect(paymentDue({ status: 'ACTIVE', updatedAt: iso(now - 6 * DAY), allocations: [{ entitlementStatus: 'RECEIVABLE' }] }, now)).toBeUndefined();
    expect(paymentDue({ status: 'ACTIVE', updatedAt: iso(now - 9 * DAY), allocations: [{ entitlementStatus: 'PAID' }] }, now)).toBeUndefined();
    expect(paymentDue({ status: 'SENT_TO_PARTICIPANTS', updatedAt: iso(now - 9 * DAY), allocations: [{ entitlementStatus: 'RECEIVABLE' }] }, now)).toBeUndefined();
    const { deal, s } = world();
    expect(hubItem(deal, s.users[0], s, new Set(), now).next.some((n: any) => n.kind === 'PAYMENT_DUE')).toBe(true);
    expect(hubItem(deal, s.users[0], s, new Set(), now).money?.payStatus).toBe('PENDING');
    expect(hubItem(deal, s.users[1], s, new Set(), now).money?.payStatus).toBe('PAID');
    s.disputes.push({ dealRoomId: 'DEAL-1', status: 'OPEN', createdAt: iso(now - DAY), updatedAt: iso(now) });
    expect(hubItem(deal, s.users[0], s, new Set(), now).money?.payStatus).toBe('HOLD');
  });
  it('the nudge sweep is skipped in quiet hours and capped to once per 3 days', () => {
    const src = read('server/dealhub.ts');
    expect(src).toContain('if (isQuietHour(now)) return 0;'); expect(src).toContain('3 * DAY');
    expect(sweepPaymentDue(Date.UTC(2026, 10, 22, 18, 0))).toBe(0);   // 23:30 IST
  });
  it('another open deal on a property settled elsewhere is flagged', () => {
    const { deal, s } = world(); s.properties[0].soldDealRoomId = 'DEAL-9';
    expect(hubItem(deal, s.users[0], s, new Set(), now).settledElsewhere).toBe(true);
    s.properties[0].soldDealRoomId = 'DEAL-1'; expect(hubItem(deal, s.users[0], s, new Set(), now).settledElsewhere).toBe(false);
  });
});

describe('A settle → property', () => {
  it('Settled marks sold / rented, moving out of Settled restores; other deals are not auto-closed', () => {
    const s = read('server.ts'); const i = s.indexOf('v183 (D13)'); const b = s.slice(i, i + 1800);
    expect(b).toContain('settleListingFromDeal'); expect(b).toContain("prevStage === 'Settled' && stage !== 'Settled'");
    expect(b).not.toContain("stage = 'Closed'");
    expect(read('server/offers.ts')).toContain('!PUBLIC.includes(p.listingStatus)');
  });
});

const realGetState = db.getState.bind(db);
afterEach(() => { (db as any).getState = realGetState; });
describe('A2 settle safeguards and restore guards', () => {
  const deal = { id: 'DEAL-1', introducingBrokerId: 'A', closingBrokerId: 'B' };
  const mk = (offers: any[] = [], extra: any = {}) => { const p: any = { id: 'P1', title: 'Flat', transactionType: 'Sale', listingStatus: 'active', listingBrokerId: 'A', ...extra }; const st: any = { propertyOffers: offers, properties: [p], bonds: [], buyerBonds: [], inbox: [], pushSubs: [], pushPrefs: [], users: [], auditEvents: [] }; (db as any).getState = () => st; return p; };
  it('a held token blocks the flip; live offers are closed; the winner is the deal', () => {
    let p = mk([{ propertyId: 'P1', status: 'TOKEN_HELD', history: [] }]);
    expect(settleListingFromDeal(p, deal, { id: 'A', name: 'A' })).toEqual({ ok: false, reason: 'TOKEN_LOCK' }); expect(p.listingStatus).toBe('active');
    const o: any = { propertyId: 'P1', status: 'SUBMITTED', history: [] }; p = mk([o]);
    expect(settleListingFromDeal(p, deal, { id: 'A', name: 'A' }).ok).toBe(true);
    expect(p).toMatchObject({ listingStatus: 'sold', soldDealRoomId: 'DEAL-1', soldVia: 'NETWORK' }); expect(o.status).toBe('CLOSED');
    p = mk([], { transactionType: 'Rent' }); settleListingFromDeal(p, deal, { id: 'A', name: 'A' }); expect(p.listingStatus).toBe('rented');
    p = mk([], { listingStatus: 'withdrawn' }); expect(settleListingFromDeal(p, deal, { id: 'A', name: 'A' }).reason).toBe('NOT_OPEN');
  });
  it('un-Settle restores only a still-sold, unpurged sale made by this deal; undo / manual sale / relist clear the link', () => {
    const sv = read('server.ts'); const i = sv.indexOf('v183 (D13)'); const b = sv.slice(i, sv.indexOf('const cleanNotes', i));
    expect(b).toContain("prop.soldDealRoomId === deal.id && ['sold', 'rented'].includes(prop.listingStatus) && !prop.purgedAt");
    expect(b).toContain('settleListingFromDeal(prop, deal, currentUser)'); expect(b).toContain('LISTING_NOT_CLOSED_TOKEN_HELD');
    const l = read('server/listings.ts');
    expect(l).toContain("p.soldDealRoomId = d.soldVia === 'NETWORK' ? d.dealRoomId : undefined");   // a manual sale overwrites the link (outside → cleared)
    expect(l).toContain('p.soldDealRoomId = undefined; p.prevStatus = undefined');   // undo
    expect(l).toContain('soldDealRoomId: undefined, soldVia: undefined');            // relist object
  });
});

describe('review fixes: help text, payment nudge, client line', () => {
  it('help ticket: the text is length-checked before the deal prefix; only the writer and admins read it', () => {
    const p = read('server/privacy.ts');
    expect(p).toContain("const body = String(details || '').trim().slice(0, 2000);"); expect(p).toContain("body.length < 5");
    expect(p).toContain('s.privacyRequests.filter(p => p.userId === u.id)');
  });
  it('no PAYMENT_DUE once Settled', () => {
    const { deal, s } = world(); deal.stage = 'Settled';
    expect(hubItem(deal, s.users[0], s, new Set(), now).next.some((n: any) => n.kind === 'PAYMENT_DUE')).toBe(false);
    expect(read('server/dealhub.ts')).toContain("d.stage === 'Settled' || isOwnSide(d)");
  });
  it('client line: rooms of his broker first, then the phone', () => {
    const c = read('server/clientroom.ts'); const i = c.indexOf('function stepLine'); const b = c.slice(i, c.indexOf('function render', i));
    expect(b.indexOf('const mine')).toBeLessThan(b.indexOf('safeEqual')); expect(b).toContain('mine.has(sv.dealRoomId) && sv.customerPhone');
  });
});

describe('frontend review fixes', () => {
  it('help ticket state is per deal and per user; rejected is Closed; load failure shows retry', () => {
    const d = read('src/components/DealSimple.tsx'); expect(d).toContain('let live = true'); expect(d).toContain('x.userId === meId'); expect(d).toContain("help.status === 'REJECTED'");
    expect(d).toContain('deal-help-retry'); expect(d).toContain('भेज नहीं पाए। फिर कोशिश करें।'); expect(d).toContain('break-words');
    const r = read('src/components/DealRoomsView.tsx'); expect(r).toContain('<DealSimple key={activeDeal.id} meId={currentUser.id}'); expect(r).toMatch(/genz:deals-home', h\); return \(\) => window\.removeEventListener\('genz:deals-home', h\); \}, \[\]\)/);
  });
  it('invalid dates are blank; "1 day" singular', async () => {
    const { formatDate } = await import('../src/lib/utils'); expect(formatDate('not a date')).toBe('');
    expect(read('src/components/CommissionPayments.tsx')).toContain("day${d > 1 ? 's' : ''}"); expect(read('src/components/DealStatusPanel.tsx')).toContain('Number.isNaN(Date.parse(iso))');
  });
});

describe('browser-verification fixes', () => {
  it('"since N days" text with N > 0 (fake clock), singular and Hindi', async () => {
    const { nextText } = await import('../src/components/DealHub');
    const tx = (en: string, hi: string) => en; const txHi = (en: string, hi: string) => hi; const ago = (d: number) => new Date(Date.now() - d * 86_400_000 - 3_600_000).toISOString();
    expect(nextText({ kind: 'AGREEMENT_TO_SIGN', n: 1, at: ago(3) }, 0, tx)).toMatch(/since 3 days$/);
    expect(nextText({ kind: 'AGREEMENT_TO_SIGN', n: 1, at: ago(1) }, 0, tx)).toMatch(/since 1 day$/);
    expect(nextText({ kind: 'AGREEMENT_TO_SIGN', n: 1, at: ago(5) }, 0, txHi)).toMatch(/5 दिन से$/);
    expect(nextText({ kind: 'STALLED', n: 1, at: ago(5) }, 20, tx)).not.toContain('since');
  });
  it('bottom Deals tab uses the raw setter (no stale guard); same stage is a no-op; sizes; Hindi stage and date', () => {
    const r = read('src/components/DealRoomsView.tsx'); expect(r).toContain("if (modeRef.current !== 'PIPELINE') setModeRaw('PIPELINE')");
    expect(read('server.ts')).toContain('if (deal.stage === stage) return res.json({ success: true, unchanged: true');
    expect(read('src/components/PaymentRequestsPanel.tsx')).toContain("const btn = 'inline-flex min-h-11");
    expect(read('src/components/PropertiesView.tsx')).toContain("const btn = 'inline-flex min-h-11");
    expect(read('src/components/PropertiesView.tsx').split('\n').slice(400).join('\n')).not.toMatch(/text-\[1[01]px\]/);
    expect(read('src/components/NotificationBell.tsx')).not.toMatch(/text-\[10px\]|h-9 w-9/);
    expect(read('src/components/DealSimple.tsx')).toContain("label('dealStage', h.t || '')"); expect(read('src/components/CommissionPayments.tsx')).toContain('formatDate(p.paidOn)');
    expect(read('src/components/DealStatusPanel.tsx')).toContain("const btn = 'inline-flex min-h-11 min-w-11");
  });
});

describe('E/F tap targets and behaviour', () => {
  it('doors flex, money path inputs 44px, listed buttons 44px', () => {
    expect(read('src/components/DealSimple.tsx')).toContain('flex min-h-11 min-w-0 flex-1 flex-col'); expect(read('src/components/DealSimple.tsx')).not.toContain('w-[68px]');
    const c = read('src/components/CommissionPayments.tsx');
    expect((c.match(/className="[^"]*\bpy-1(\.5)?\b[^"]*"/g) || []).every(x => x.includes('min-h-11'))).toBe(true);
    expect(read('src/components/DealStatusPanel.tsx')).toContain("const btn = 'inline-flex min-h-11");
    expect(read('src/components/FinalRateCard.tsx')).not.toContain('min-h-10'); expect(read('src/components/NotificationBell.tsx')).not.toContain('min-h-9');
    expect(read('src/components/ShareToRoom.tsx')).toContain('min-h-11');
    expect(read('src/components/PropertiesView.tsx')).not.toContain('min-h-9');
  });
  it('only the next stage pill is tappable; bottom Deals tab returns to the pipeline; dates follow the language; cost sheet only with access', () => {
    expect(read('src/components/DealHub.tsx')).toContain('canEdit && cur >= 0 && i === cur + 1');
    expect(read('src/components/NavigationTabs.tsx')).toContain("genz:deals-home"); expect(read('src/components/DealRoomsView.tsx')).toContain("setMainMode('PIPELINE')");
    expect(read('src/lib/utils.ts')).toContain("'hi-IN'"); expect(read('src/components/DealStatusPanel.tsx')).toContain('dateLocale()');
    expect(read('src/components/DealRoomsView.tsx')).toContain("canCostSheet={perm('inventory:share')}");
    expect(read('src/components/DealSimple.tsx')).toContain('!canCostSheet');
  });
});

describe('G help ticket, H client step line', () => {
  it('deal help reuses the grievance queue: deal-scoped, needs an admin answer, freezes nothing', () => {
    const p = read('server/privacy.ts');
    expect(p).toContain('canViewDeal(u, dr)'); expect(p).toContain('pr.dealRoomId && String(note'); expect(p).not.toMatch(/settlementHold|DISPUTED/);
    const d = read('src/components/DealSimple.tsx'); for (const t of ['deal-help-open', 'deal-help-status', 'Ask GENZ', 'GENZ से पूछें', 'Answered', 'Open']) expect(d).toContain(t);
  });
  it('client room step line: stage → Visit / Offer / Deal, no money', () => {
    expect(clientStepOf('Lead')).toBe(0); expect(clientStepOf('Site Visit Done')).toBe(0); expect(clientStepOf('Negotiation')).toBe(1); expect(clientStepOf('Agreement')).toBe(2); expect(clientStepOf('Settled')).toBe(2);
    const c = read('server/clientroom.ts'); const i = c.indexOf('function stepLine'); const b = c.slice(i, c.indexOf('function render', i));
    expect(b).not.toMatch(/\bfee|commission|allocation|dealValue|SharePct/); expect(c).toContain('${stepLine(room)}');
  });
});
