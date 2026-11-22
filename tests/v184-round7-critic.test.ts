/** v184 — round 7 (critic report): client OTP keeps the earlier code, agreement screen, Today labels, counts, owner screens, Ask GENZ echo, WhatsApp floor / client name. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findFloor, findClientName, parsePaste, parseNeed } from '../src/shared/waParse';
import { shouldShowWhatsNew, WHATS_NEW } from '../src/lib/whatsNew';
import { actionText } from '../src/components/DealHub';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('7 WhatsApp paste: floor and client name', () => {
  it('floor words and numbers; ground = 0; builder floor is not a number', () => {
    expect(findFloor('2bhk 3rd floor flat')).toBe(3); expect(findFloor('Ground floor shop')).toBe(0); expect(findFloor('Third Floor')).toBe(3);
    expect(findFloor('3 floor')).toBe(3); expect(findFloor('floor no 4')).toBe(4); expect(findFloor('builder floor 2bhk')).toBeUndefined(); expect(findFloor('mobile 9876512 floor')).toBeUndefined();
  });
  it('client name after client / customer, with or without colon; not a sentence', () => {
    expect(findClientName('client Rakesh needs 2bhk')).toBe('Rakesh'); expect(findClientName('Client: Rakesh Verma 98765')).toBe('Rakesh Verma');
    expect(findClientName('Customer - Sunita Devi budget 40 L')).toBe('Sunita Devi'); expect(findClientName('client needs 2bhk')).toBeUndefined(); expect(findClientName('customer rakesh')).toBeUndefined();
  });
  it('a need draft does not ask for the name again; a listing draft carries the floor', () => {
    const n = parseNeed('Client Rakesh Verma 2bhk flat chahiye Shankar Nagar Raipur budget 40-50 lakh');
    expect(n.customerName).toBe('Rakesh Verma'); expect(n.missing).not.toContain('customerName'); expect(n.missing).toContain('customerPhone');
    const l = parsePaste('2BHK flat for sale 3rd floor Shankar Nagar Raipur 45 lakh 1100 sqft Owner Ramesh 9876543210');
    expect(l[0]?.floor).toBe(3);
    expect(read('server/consent.ts')).toContain('customerName: it.customerName');
  });
  it('pathological input stays fast (ReDoS hardening kept)', () => {
    const t0 = Date.now();
    findFloor('1'.repeat(50_000) + ' floor'); findFloor(' '.repeat(50_000) + 'floor'); findFloor('3' + ' '.repeat(50_000) + 'x');
    findClientName('client' + ' '.repeat(50_000) + 'Rakesh'); findClientName('client ' + 'A'.repeat(50_000)); findClientName('client A' + ' A'.repeat(20_000));
    parsePaste(('client ' + 'floor '.repeat(300) + '9'.repeat(5000) + '\n---\n').repeat(40));
    expect(Date.now() - t0).toBeLessThan(2000);
    const src = read('src/shared/waParse.ts'); expect(src).toContain('(?<![\\d.,])'); expect(src).toContain('PASTE_MAX_ITEMS');
  });
});

describe('1 client OTP gate', () => {
  it('the earlier code stays valid; wrong-guess limits and caps kept; text says what to do', () => {
    const c = read('server/clientroom.ts');
    expect(c).toContain('room.otpPrevHash = room.otpHash'); expect(c).toContain('prevOk'); expect(c).toContain('room.otpTries = (room.otpTries || 0) + 1');
    expect(c).toContain("hit(`cr-phone:${room.id}`, 8, 3600_000");   // the existing cap on asking for codes
    expect(c).toContain('Ask your broker for the 6-digit code (valid 10 minutes)'); expect(c).toContain('अपने ब्रोकर से 6 अंकों का कोड माँगें (10 मिनट तक चलेगा)');
    expect(c).toContain('otpPlain = brokerReads() ? otp : undefined');   // the broker sees the code
    expect(read('src/components/ClientRooms.tsx')).toContain('codeAsk');   // …in the room list ("Waiting for code") — reused, not new
  });
});

describe('2/3 agreement screen and action labels', () => {
  it('real status badge, approve on top, technical details collapsed, plain payer, pipeline order, dispute button only with money', () => {
    const d = read('src/components/DealRoomsView.tsx');
    expect(d).toContain("tx('Waiting for approval', 'मंज़ूरी का इंतज़ार')"); expect(d.indexOf('agreement-approve-top')).toBeLessThan(d.indexOf('Agreement Meta Summary Card'));
    expect(d).toContain('agreement-tech'); expect(d).toContain('approval-tech'); expect(d).toContain("tx('Technical details', 'तकनीकी जानकारी')");
    expect(d).toContain('Buyer and seller each pay half of the fee'); expect(d).toContain('STAGE_RANK.indexOf(x.stage)');
    const c = read('src/components/CommissionPayments.tsx'); expect(c).toContain('const hasMoney'); expect(c).toContain('hasMoney ? tx(\'Raise a dispute\'');
  });
  it('every action label says what it does, in both languages (Today rows and the Next-step button)', () => {
    const en = (a: string, _h: string) => a; const hi = (_a: string, h: string) => h;
    expect(actionText('NO_AGREEMENT', en)).toBe('Propose terms'); expect(actionText('NO_AGREEMENT', hi)).toBe('प्रस्ताव भेजें');
    expect(actionText('AGREEMENT_TO_SIGN', en)).toBe('Approve agreement'); expect(actionText('PAYMENTS_TO_CONFIRM', en)).toBe('Confirm payment');
    for (const k of ['AGREEMENT_TO_SIGN', 'NO_AGREEMENT', 'PAYMENTS_TO_CONFIRM', 'PAYMENT_DUE', 'CLIENT_PAYMENT', 'CLOSE_TO_ANSWER', 'OFFLINE_VISIT_TO_CONFIRM', 'VISITS_TO_VERIFY', 'TASKS_TO_DO', 'STALLED', 'DISPUTE_OPEN']) { expect(actionText(k, en).length).toBeGreaterThan(2); expect(/[ऀ-ॿ]/.test(actionText(k, hi))).toBe(true); }
    const h = read('src/components/DealHub.tsx'); expect(h).toContain('badge: actionText(n.kind, tx)'); expect(h).not.toContain("tx('Sign', 'साइन')");
  });
});

describe('4/5 counts, sold, owner screens', () => {
  it('sold / rented are a separate chip; header, chips and cards use the same base list', () => {
    const p = read('src/components/PropertiesView.tsx');
    expect(p).toContain('closed-chip'); expect(p).toContain('const shownList = baseList.filter'); expect(p).toContain('{liveAll}'); expect(p).toContain("properties.filter(p => !isClosedP(p)).length");
    expect(read('src/components/RequirementsView.tsx')).toContain("'my clients' : 'whole network'");
  });
  it('owner what-is-new is owner-only; one status line on a card; owner strip', () => {
    const e = WHATS_NEW[0]; expect(e.owner!.en.length).toBeLessThanOrEqual(3); expect(e.owner!.hi.length).toBe(e.owner!.en.length);
    expect(JSON.stringify(e.owner)).not.toMatch(/offline|queue|follow-up/i);
    expect(read('src/components/WhatsNewCard.tsx')).toContain("role === 'PROPERTY_OWNER'");
    expect(shouldShowWhatsNew(null, e.version, '2020-01-01')).toBe(true);
    const p = read('src/components/PropertiesView.tsx'); expect(p).toContain('pending-chip'); expect(p).not.toContain('Owner approval pending — no bypass');
    expect(read('src/components/OwnerListings.tsx')).toContain('owner-status-strip');
  });
});

describe('6 Ask GENZ echo', () => {
  it('shows the text sent, the ticket id and "GENZ will reply here"; no time promise', () => {
    const d = read('src/components/DealSimple.tsx');
    for (const t of ['deal-help-echo', 'deal-help-id', 'help.id', 'GENZ will reply here', 'GENZ जवाब यहीं देगा']) expect(d).toContain(t);
    expect(d).not.toMatch(/within \d+ (hours|days)/i);
    expect(read('src/components/PrivacyCenter.tsx')).toContain('/api/privacy/requests');   // the same ticket is in the user's own list
  });
});

describe('8-11 Hindi, flag sheet, client page, history, header', () => {
  it('Hindi types in lists, bilingual form validation on signup', async () => {
    expect(read('src/components/ClientsView.tsx')).toContain("label('propertyType', c.propertyType)"); expect(read('src/components/GenzRadar.tsx')).toContain("label('propertyType', r.propertyType)");
    const v = await import('../src/lib/validate'); const el: any = { validity: { valueMissing: true }, msg: '', setCustomValidity(m: string) { this.msg = m; } };
    v.bilingualInvalid(true).onInvalidCapture({ target: el }); expect(el.msg).toBe('यह जानकारी भरना ज़रूरी है।');
    v.bilingualInvalid(false).onInvalidCapture({ target: el }); expect(el.msg).toBe('Please fill in this field.');
    v.bilingualInvalid(false).onInput({ target: el }); expect(el.msg).toBe('');
    expect(read('src/components/JoinView.tsx')).toContain('{...bilingualInvalid(hi)}');
  });
  it('flag sheet marks the chosen reason and confirms after closing', () => {
    const f = read('src/components/ListingTrust.tsx'); for (const t of ['setChosen(reason)', 'quick-flag-done', 'Reported ✓ — thank you', 'border-emerald-500']) expect(f).toContain(t);
  });
  it('client page: honest demand line, small dismissible alerts-blocked line', () => {
    const p = read('server/publicFooter.ts'); expect(p).not.toContain('right now'); expect(p).toContain('(real count)'); expect(p).not.toContain('🔥');
    const c = read('server/clientroom.ts'); expect(c).toContain("st==='denied'||st==='none'"); expect(c).toContain("id='app-x'");
  });
  it('history dedupes the same label in the same minute; phone + copy stay together; one unread badge', async () => {
    const dh = read('server/dealhub.ts'); expect(dh).toContain("x.at.slice(0, 16) === h.at.slice(0, 16)");
    const r = read('src/components/ClientRooms.tsx'); expect(r.indexOf('whitespace-nowrap">\n          <span className="font-mono text-sm font-bold text-slate-900" data-testid="room-phone-num"')).toBeGreaterThan(0);
    expect(read('src/components/Navbar.tsx')).toContain('chatCount !== bellN'); expect(read('src/components/NotificationBell.tsx')).toContain("'genz:bell'");
  });
});
