/** v182 — QA round 5 (competitor-review themes): listing trust label + one-tap report, quiet hours + 1 follow-up a day, What's new, first-run checklists. Source guards + pure logic. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { confirmLabel, addQuickReport, hidesBy, QUICK_REASONS } from '../src/shared/listingTrust';
import { isQuietHour, parseQuiet, autoFollowAllowed, AUTO_PUSH_KINDS } from '../src/shared/quietHours';
import { shouldShowWhatsNew, WHATS_NEW, LATEST_VERSION } from '../src/lib/whatsNew';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const DAY = 86_400_000;
const ist = (h: number, m = 0) => Date.UTC(2026, 10, 22, h, m) - 330 * 60_000;   // 22 Nov 2026, h:m India time

describe('I1 listing trust label + quick report', () => {
  const now = Date.parse('2026-11-22T10:00:00Z');
  it('label thresholds: today / N days / warning only after 20 days; falls back to createdAt', () => {
    expect(confirmLabel({ confirmedAt: new Date(now).toISOString() }, now)).toMatchObject({ en: 'confirmed today', stale: false });
    expect(confirmLabel({ confirmedAt: new Date(now - 1 * DAY).toISOString() }, now).en).toBe('confirmed 1 day ago');
    expect(confirmLabel({ confirmedAt: new Date(now - 20 * DAY).toISOString() }, now).stale).toBe(false);
    const l = confirmLabel({ confirmedAt: new Date(now - 21 * DAY).toISOString() }, now);
    expect(l).toMatchObject({ en: 'confirmed 21 days ago', hi: '21 दिन पहले कन्फर्म', stale: true });
    expect(confirmLabel({ createdAt: new Date(now - 25 * DAY).toISOString() }, now).stale).toBe(true);
  });
  it('one report per person per 7 days; the 2nd distinct reporter flags; an old report no longer counts', () => {
    let r = addQuickReport(undefined, 'A', 'SOLD', now);
    expect(r.result).toBe('OK');
    expect(addQuickReport(r.list, 'A', 'WRONG_INFO', now + DAY).result).toBe('DUPLICATE');
    const b = addQuickReport(r.list, 'B', 'WRONG_PRICE', now + DAY);
    expect(b.result).toBe('FLAGGED');
    expect(addQuickReport(b.list, 'A', 'SOLD', now + 8 * DAY).result).toBe('OK');   // A's 7-day window is over, B's too → only one live reporter
    expect(QUICK_REASONS).toEqual(['SOLD', 'RENTED', 'WRONG_PRICE', 'WRONG_INFO', 'UNREACHABLE']);
  });
  it('after the lister re-confirms: the same reporter is still a duplicate, old reports do not count, new ones do; 5-hide cap per reporter', () => {
    const t0 = Date.parse('2026-11-22T10:00:00Z'); const cleared = new Date(t0 + DAY).toISOString();
    const a = addQuickReport(undefined, 'A', 'SOLD', t0); const b = addQuickReport(a.list, 'B', 'SOLD', t0 + 1000);
    expect(b.result).toBe('FLAGGED');
    expect(addQuickReport(b.list, 'A', 'SOLD', t0 + 2 * DAY, cleared).result).toBe('DUPLICATE');   // A cannot re-hide it after the re-confirm
    const c = addQuickReport(b.list, 'C', 'SOLD', t0 + 2 * DAY, cleared);
    expect(c.result).toBe('OK');   // A and B are older than the re-confirm: only C counts
    expect(addQuickReport(c.list, 'D', 'SOLD', t0 + 2 * DAY + 1, cleared).result).toBe('FLAGGED');
    expect(hidesBy([c.list, undefined], 'B', t0 + 2 * DAY)).toBe(1);
    expect(hidesBy([b.list], 'B', t0 + 9 * DAY)).toBe(0);
  });
  it('endpoint is permission-gated, rate-limited, audited, reuses expiredAt, and never touches owner identity / net price', () => {
    const s = read('server/daily.ts'); const i = s.indexOf("'/listings/:id/flag'"); const body = s.slice(i, s.indexOf("r.get('/trust'", i));
    expect(body).toContain("needs('report:create')"); expect(body).toContain('rateLimit(');
    expect(body).toContain('LISTING_QUICK_REPORT'); expect(body).toContain('p.expiredAt = nowIso()'); expect(body).toContain('pushTo(p.listingBrokerId');
    expect(body).not.toMatch(/ownerPhone|ownerName|netPrice|\.ownerId/);
    expect(s).toContain('p.quickReportsClearedAt = p.confirmedAt'); expect(s).not.toContain('p.quickReports = undefined');
    expect(body).toContain('if (p.listingBrokerId) void pushTo'); expect(body).toContain('MAX_HIDES_PER_REPORTER'); expect(body).toContain('employerId');
    const sv = read('server.ts'); expect(sv).toContain('delete out.quickReports;'); expect(sv).toMatch(/isAdmin\(user\) \|\| p\.ownerId === user\.id \|\| p\.listingBrokerId === user\.id\) out\.quickReportCount/);
  });
  it('the chip shows on PropertiesView, Daily matches and the Share Kit', () => {
    for (const f of ['src/components/PropertiesView.tsx', 'src/components/DailyView.tsx', 'src/components/ShareKit.tsx']) expect(read(f), f).toContain('ConfirmChip');
    expect(read('src/components/ListingTrust.tsx')).toContain('गलत जानकारी या बिक चुकी');
  });
});

describe('I2 quiet hours', () => {
  it('21-8 IST with a fake clock; edges; custom and off', () => {
    expect(isQuietHour(ist(20, 59), '21-8')).toBe(false);
    expect(isQuietHour(ist(21, 0), '21-8')).toBe(true);
    expect(isQuietHour(ist(2, 0), '21-8')).toBe(true);
    expect(isQuietHour(ist(7, 59), '21-8')).toBe(true);
    expect(isQuietHour(ist(8, 0), '21-8')).toBe(false);
    expect(isQuietHour(ist(23, 0), 'off')).toBe(false);
    expect(isQuietHour(ist(13, 0), '12-14')).toBe(true);
    expect(parseQuiet('garbage')).toEqual({ from: 21, to: 8 });
    expect(isQuietHour(ist(22, 0), undefined)).toBe(true);   // default 21-8 (QUIET_HOURS unset in the test env)
  });
  it('at most one automatic follow-up per client per IST day, none in quiet hours', () => {
    expect(autoFollowAllowed(ist(10), undefined, '21-8')).toBe(true);
    expect(autoFollowAllowed(ist(15), '2026-11-22', '21-8')).toBe(false);
    expect(autoFollowAllowed(ist(10), '2026-11-21', '21-8')).toBe(true);
    expect(autoFollowAllowed(ist(22), undefined, '21-8')).toBe(false);
  });
  it('wiring: sahayak follow/remind, web push kinds; customer-initiated, OTP and deal alerts are not gated', () => {
    const sa = read('server/sahayak.ts');
    expect(sa).toContain('autoFollowAllowed(now, botOf(l).autoFollowDay)'); expect(sa).toContain('isQuietHour(now)');
    expect(read('server/shopPartners.ts')).toContain('sahayak.follow(l, Date.now(), true)');   // the customer opened his chat
    expect(AUTO_PUSH_KINDS).toEqual(['digest', 'community']);   // buyer-need / match / broadcast / chat alerts to a broker still go out
    expect(read('server/webpush.ts')).toContain('AUTO_PUSH_KINDS.includes(msg.kind) && isQuietHour(');
  });
});

describe('I3 what is new', () => {
  it('version gating: shown once per version; a brand-new account sees nothing', () => {
    const now = Date.parse('2026-11-22T10:00:00Z');
    expect(shouldShowWhatsNew(LATEST_VERSION, LATEST_VERSION, '2020-01-01', now)).toBe(false);
    expect(shouldShowWhatsNew('2026.01.01', LATEST_VERSION, '2026-11-22', now)).toBe(true);
    expect(shouldShowWhatsNew(null, LATEST_VERSION, '2026-11-21T00:00:00Z', now)).toBe(false);   // first-ever login
    expect(shouldShowWhatsNew(null, LATEST_VERSION, '2026-01-01', now)).toBe(true);
  });
  it('entries: max 3 bullets, en and hi, one list; shown on broker, owner and team home', () => {
    for (const e of WHATS_NEW) { expect(e.en.length).toBeLessThanOrEqual(3); expect(e.hi.length).toBe(e.en.length); }
    expect(read('src/App.tsx')).toMatch(/\['BROKER', 'TEAM_MEMBER', 'PROPERTY_OWNER'\]\.includes\(currentUser\.role\) && <WhatsNewCard/);
    expect(read('src/lib/whatsNew.ts')).toContain('catch');
  });
});

describe('round 5 browser findings', () => {
  it('what is new + first-run strip are on the Chats home (one mount per screen); Report button is 44px', () => {
    const a = read('src/App.tsx');
    expect(a).toMatch(/activeTab === 'chats' && \['BROKER', 'TEAM_MEMBER', 'PROPERTY_OWNER'\]\.includes\(currentUser\.role\) && <WhatsNewCard/);
    expect(a).toContain("activeTab === 'chats' && currentUser.role === 'BROKER'"); expect(a).toContain('<FirstRunStrip');
    expect(a.match(/<WhatsNewCard/g)!.length).toBe(2);   // dashboard + chats, never both screens at once
    expect(read('src/components/FirstRunStrip.tsx')).toMatch(/min-h-11/);
    expect(read('src/components/ReportButton.tsx')).not.toContain('min-h-8');
  });
});

describe('I4 first-run checklists', () => {
  it('broker: 4 steps from real data; server sends share + invite flags; hideable', () => {
    const h = read('src/components/BrokerHome.tsx');
    for (const id of ['step-listing', 'step-client', 'step-share', 'step-invite', 'first-steps-hide']) expect(h, id).toContain(id);
    expect(h).toContain('const allSteps = [...steps, alertStep]');
    expect(read('server/reputation.ts')).toMatch(/share: s\.shareLinks\.some/);
  });
  it('owner: a new owner lands on Properties with a big add button and a 3-step guide', () => {
    expect(read('src/App.tsx')).toContain("d?.listings?.length ? 'chats' : 'properties'");
    const o = read('src/components/OwnerListings.tsx');
    expect(o).toContain('owner-add-big'); expect(o).toContain('अपनी प्रॉपर्टी जोड़ें'); expect(o).toContain('min-h-14');
  });
});
