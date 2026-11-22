/** v191 (round 11) — source guards for the security / DB / critic fixes. HTTP behaviour of S1 is in v117. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const read = (f: string) => readFileSync(path.join(root, f), 'utf8');

describe('v191 · server guards', () => {
  it('S1-S3 /my-rera files a pending claim for Basic and Tier 2; approve and tier route share the RERA_CONFLICT check; approve needs an active account', () => {
    const n = read('server/network.ts');
    expect(n).toContain("u.basicTier || tierOf(u) === 'TIER2'");
    expect(n).toContain('RERA_CLAIM_TIER2');
    expect(n.match(/reraHeldByOther\(/g)!.length).toBeGreaterThanOrEqual(2);
    expect(n).toContain('ACCOUNT_NOT_ACTIVE');
  });
  it('S4 wrong-code guesses on a client room are capped per hour, resend cannot reset it', () => {
    expect(read('server/clientroom.ts')).toContain('`cr-guess:${room.id}`');
  });
  it('S5 owner-answer refuses a closed visit; S6 admin ID upload ticks Basic; D1 erase clears reraClaim and basicTier', () => {
    expect(read('server.ts')).toContain('VISIT_CLOSED');
    expect(read('server/idreview.ts')).toContain("recordIdTick(t, a, false, '')");
    expect(read('server/privacy.ts')).toMatch(/reraClaim = undefined/); expect(read('server/privacy.ts')).toMatch(/basicTier = undefined/);
  });
  it('D2/D3 sweeps: latest-agreement map once per tick; signup counters pruned hourly', () => {
    expect(read('server/dealhub.ts')).toContain('latest.get(d.id)');
    expect(read('server/openSignup.ts')).toContain('export function pruneSignupCounters');
    expect(read('server.ts')).toContain('pruneSignupCounters');
  });
  it('C1 preview: IP pool default 3000, honest limitedNote, N exposed in auth config', () => {
    const a = read('server/auth.ts');
    expect(a).toMatch(/BASIC_IP_ROWS_PER_DAY[^\n]*3000/);
    expect(a).toContain("Today\\'s preview limit reached — verify KYC for full access");
    expect(read('server.ts')).toContain('basicPreviewPerDay');
  });
});

describe('v191 · UI guards', () => {
  it('C1/C2/C3/C5 Basic copy, public signup success, Deals lock, broker name', () => {
    expect(read('src/components/BasicBanner.tsx')).toContain('Preview: up to');
    expect(read('src/components/BasicBanner.tsx')).toContain('basic-deals-locked');
    expect(read('src/components/PropertiesView.tsx')).toContain('Network preview');
    expect(read('src/components/JoinView.tsx')).toContain('setBasicDone(true)');
    expect(read('src/components/Modals.tsx')).toContain('receivingBrokerName');
  });
  it('C7 admin approve is disabled until the ID is ticked; pills translated; placeholder email hidden', () => {
    const o = read('src/components/OnboardingView.tsx');
    expect(o).toContain('disabled={!u.idCheckedAt}'); expect(o).toContain('सभी सदस्य'); expect(o).toContain('phone\\.genz\\.local');
    expect(o).not.toContain('All Participants (');
  });
  it('C8 Ask GENZ queue uses the app prompt, 44px buttons, EN/HI labels; reply days shown when reopened', () => {
    const p = read('src/components/PrivacyCenter.tsx');
    expect(p).toContain('ui.prompt('); expect(p).not.toMatch(/[^.]prompt\(/.source ? /\bwindow\.prompt\(/ : /x/);
    expect(p).toContain('min-h-11'); expect(p).toContain('जवाब बाकी');
    expect(read('src/components/DealSimple.tsx')).toContain('replyDays || 15');
  });
});
