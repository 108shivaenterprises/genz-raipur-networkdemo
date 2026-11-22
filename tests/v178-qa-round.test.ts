/** v178 — QA round: privacy / security (A), data integrity (B) and the new CONSENT_WITHDRAWAL request. Mostly source guards plus a few pure-function checks. */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findOwnerContact } from '../src/shared/waParse';
import { mmss } from '../src/components/OtpStep';
import { setQueueUser, enqueue, readQueue, clearQueue, isNetworkError } from '../src/lib/offline';

const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('A. security / privacy', () => {
  it('ID review: only SUPERADMIN sees the full PAN, every full view is audited, ADMIN gets it masked; autoVerify is SUPERADMIN-only', () => {
    const s = read('server/idreview.ts');
    expect(s).toContain("const full = me().role === 'SUPERADMIN'");
    expect(s).toContain("'PAN_REVEALED'");
    expect(s).toContain('panFull: showPan(u.panNumber)');
    expect(s).toMatch(/'autoVerify' in req\.body && a\.role !== 'SUPERADMIN'\) return res\.status\(403\)/);
    const srv = read('server.ts');
    expect(srv).toContain("currentUser.role !== 'SUPERADMIN' && outU.panNumber) outU.panNumber = maskPan(outU.panNumber)");
  });
  it('CRM: opt-out is for the employer only; the staff export masks e-mails', () => {
    const c = read('server/crm2.ts');
    expect(c).toMatch(/\/leads\/:id\/optout[^]*?u\.role === 'TEAM_MEMBER'\) return bad\(res, 'Ask your employer/);
    expect(c).toContain("isAdmin(u as any) ? maskEmail(l.email)");
  });
  it('production boot needs TRUST_PROXY (a number or false)', () => {
    const s = read('server.ts');
    expect(s).toContain("/^(\\d+|false)$/.test(TRUST_PROXY)");
    expect(s).toContain('TRUST_PROXY must be set explicitly');
  });
  it('manual OTP: no phone-wide lock, capped locked codes, /sent checks the mode and is idempotent, phone checked before the IP gate', () => {
    const o = read('server/otpManual.ts');
    expect(o).not.toContain('const lock = Math.max(0, ...mine.map(r => r.lockedUntil');
    expect(o).toContain('burnt.length >= 6');   // v179: per (IP, number)
    expect(o).toContain("if (otpMode() !== 'manual') return res.status(409)");
    expect(o).toContain('already: true');
    expect(o.indexOf("PHONE_RE.test(phone)) return res.status(400).json(failBody(fail(400, 'BAD_PHONE'")).toBeLessThan(o.indexOf('const g = ipPhoneGate(req.ip, phone); if (g) return res.status(g.status).json(failBody(g));'));
  });
  it('forgot password does not promise a change; OTP-only owners get a note instead of the password form', () => {
    expect(read('src/components/ForgotPassword.tsx')).toContain('Owners who sign in with a mobile code have no password');
    expect(read('src/components/PrivacyCenter.tsx')).toContain('data-testid="password-otp-only"');
  });
  it('Blacklist button is SUPERADMIN-only and never on your own row; API keys hide TURN while voice is off', () => {
    expect(read('src/components/OnboardingView.tsx')).toContain("isSuperAdmin && u.role !== 'SUPERADMIN' && u.id !== currentUser.id");
    expect(read('server/apiKeys.ts')).toContain("(voiceOn() || !k.group.startsWith('Calls'))");
  });
});

describe('B. data integrity', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  });
  it('the offline queue is per user (v181: kept across sign-out)', () => {
    setQueueUser('A'); enqueue({ kind: 'add', body: { name: 'x' } }); expect(readQueue()).toHaveLength(1);
    setQueueUser('B'); expect(readQueue()).toHaveLength(0);
    setQueueUser('A'); expect(readQueue()).toHaveLength(1); clearQueue('A'); expect(readQueue()).toHaveLength(0);
    expect(isNetworkError({ code: 'OFFLINE' })).toBe(true);
    expect(read('src/App.tsx')).not.toContain('clearQueue(currentUser?.id)');   // v181: reversed, the queue now stays per user across sign-out
  });
  it('site visits cannot be booked in the past; the chat line carries the year', () => {
    const s = read('server.ts');
    expect(s).toContain("code: 'VISIT_PAST'");
    expect(s).toContain("day: 'numeric', month: 'short', year: 'numeric'");
    expect(read('src/components/Modals.tsx')).toContain('min={toLocal(new Date().toISOString())}');
  });
  it('shop QR form: strict Indian mobile, no 14-char cut, no name / link in the shopkeeper WhatsApp text', () => {
    const s = read('server/shopPartners.ts');
    expect(s).toContain('const normPhone');
    expect(s).toContain('const phone = normPhone(keep.phone)');
    expect(s).toContain('phone: str(body.phone, 24)');
    const u = read('src/components/ShopPartners.tsx');
    expect(u).not.toContain('Live tracker:'); expect(u).not.toContain('लाइव ट्रैकर:');
    expect(u).toContain("slice(-4)");
  });
  it('check-in selfie must be a real image', () => {
    const t = read('server/team.ts');
    expect(t).toContain('b.length >= 1500 && sniffMime(b) !== null');
    expect(t).toContain('(jpeg|png|webp)');
  });
  it('owner OTP survives a reload; long waits read as hours / tomorrow', () => {
    expect(read('src/components/OwnerListings.tsx')).toContain("sessionStorage.setItem(OTP_KEEP");
    expect(mmss(125)).toBe('2:05'); expect(mmss(14389)).toBe('3h 59m');
    expect(read('src/components/OtpStep.tsx')).toContain('कल फिर कोशिश करें');
    expect(read('server/ownerlist.ts')).toContain("'USE_PASSWORD', 'इस नंबर पर पासवर्ड");
  });
});

describe('UX + language', () => {
  it('Back button: tab changes push history, sheets close on Back / Escape', () => {
    expect(read('src/App.tsx')).toContain('pushTabEntry(t)');
    expect(read('src/components/NavigationTabs.tsx')).toContain('useBackClose(more');
    expect(read('src/lib/backStack.ts')).toContain("e.key === 'Escape'");
  });
  it('lazy views do not hard-reload while offline', () => { expect(read('src/lib/lazyView.ts')).toContain("navigator.onLine === false"); });
  it('Hindi: errorHi table, browser language default, offline message', () => {
    expect(read('server/errorHi.ts')).toContain('Phone numbers cannot be shared in the deal room');
    expect(read('src/lib/i18n.tsx')).toContain("/^hi/i.test(navigator.language");
    expect(read('src/lib/api.ts')).toContain("'OFFLINE'");
  });
  it('WhatsApp paste picks up "Owner <name> <mobile>"', () => {
    expect(findOwnerContact('3BHK Shankar Nagar 85 L. Owner Ramesh Patel 98765 43210')).toEqual({ name: 'Ramesh Patel', phone: '9876543210' });
    expect(findOwnerContact('Owner is out of town 9876543210')).toBeNull();
  });
});

describe('CONSENT_WITHDRAWAL privacy request', () => {
  it('is accepted by the API, closed with a note, offered in My Data, labelled in Hindi; "No" on the consent page needs a confirm', () => {
    const p = read('server/privacy.ts');
    expect(p).toContain("['ERASURE', 'CORRECTION', 'GRIEVANCE', 'CONSENT_WITHDRAWAL'].includes(type)");
    expect(p).toContain("pr.type === 'CONSENT_WITHDRAWAL' && String(note || '').trim().length < 5");
    expect(read('server/db.ts')).toContain("'CONSENT_WITHDRAWAL'");
    expect(read('src/components/PrivacyCenter.tsx')).toContain("file('CONSENT_WITHDRAWAL')");
    expect(read('src/lib/labels.ts')).toContain('CONSENT_WITHDRAWAL:');
    expect(read('server/consent.ts')).toContain('data-testid="oc-decline-confirm"');
  });
});
