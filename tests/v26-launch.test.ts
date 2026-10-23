/**
 * v26 — launch batch: WhatsApp paste → owner consent → publish; one property = one consented broker (co-broke instead of a
 * duplicate); bypass protection days under the superadmin's maximum; Web Push (RFC 8291 / 8292); buyer-need broadcast;
 * two-step sign-in (RFC 6238) incl. the KYC vault.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import { parsePaste, parseOne, findPhones, findPrice, findArea } from '../src/shared/waParse';
import { protectionConfig, protectionProblem, safeDays, PROTECTION_CEILING } from '../src/shared/protectionRules';
import { looseKeyText, sameArea, draftMissing } from '../src/shared/consentRules';
import { encryptPayload, decryptPayload, generateVapidKeys, vapidAuth, verifyVapidJwt, allowedEndpoint } from '../server/webpush';
import { hotp, base32Encode, base32Decode, checkTotp } from '../server/twofactor';
import { pilotFunnel } from '../src/shared/pilotRules';

const ROOT = path.resolve(__dirname, '..');
const u8 = (s: string) => Buffer.from(s, 'base64url');

// ───────────────────────── pure ─────────────────────────
describe('WhatsApp forwards → drafts', () => {
  const PASTE = `[17/10/26, 10:15 AM] Ramesh Broker: *2BHK Flat for Sale* 📍 Shankar Nagar, Raipur
1150 sqft, 3rd floor, east facing, lift + parking
Price: 45 Lakh negotiable
Contact: 98271 12345
[17/10/26, 11:02 AM] Suresh: Plot for sale in Kachna 25x60 rate 2100/sqft diversion done registry ready call 9876543210
[17/10/26, 11:30 AM] Amit: Rent - 3BHK independent house Avanti Vihar 25k/month furnished. 9123456789
[17/10/26, 12:00 PM] Amit: Good morning sir 🙏
[17/10/26, 12:05 PM] X: 2 acre agricultural land near Arang highway touch 1.2 cr
[17/10/26, 12:10 PM] Y: दुकान किराये पर, पंडरी, 300 वर्ग फुट, किराया 18000 प्रति महीना`;
  it('splits a WhatsApp chat export into one draft per property message (greetings dropped)', () => {
    const all = parsePaste(PASTE);
    expect(all).toHaveLength(5);
    expect(all[0]).toMatchObject({ propertyType: 'Residential Flat', transactionType: 'Sale', bhk: 2, city: 'Raipur', state: 'Chhattisgarh', locality: 'Shankar Nagar', areaSqft: 1150, price: 4_500_000 });
    expect(all[0].tags).toEqual(expect.arrayContaining(['East Facing', 'Lift', 'Covered Parking']));
    expect(all[1]).toMatchObject({ propertyType: 'Residential Plot', areaSqft: 1500, dimensions: '25×60', pricePerSqft: 2100, price: 3_150_000 });
    expect(all[2]).toMatchObject({ propertyType: 'Independent House', transactionType: 'Rent', price: 25_000, locality: 'Avanti Vihar' });
    expect(all[3]).toMatchObject({ propertyType: 'Agricultural Land', areaSqft: 87_120, price: 12_000_000 });
    expect(all[4]).toMatchObject({ propertyType: 'Commercial Shop', transactionType: 'Rent', areaSqft: 300, price: 18_000 });
  });
  it('a phone number is never read as a price or an area; numbers are found with +91 / spaces', () => {
    expect(findPhones('call +91 98271-12345 or 09876543210')).toEqual(['9827112345', '9876543210']);
    expect(findPrice('2BHK call 9827112345').price).toBeUndefined();
    expect(findArea('contact 9827112345').sqft).toBeUndefined();
    expect(findPrice('3 BHK 1.15 Cr').price).toBe(11_500_000);
    expect(findPrice('₹ 3,50,00,000').price).toBe(35_000_000);
    expect(findArea('1500 sq yd').sqft).toBe(13_500);
    expect(findArea('5 dismil').sqft).toBe(2178);
  });
  it('separator lists and numbered lists split too; owner name / phone / address are always asked for', () => {
    const all = parsePaste('1) 3 BHK duplex Telibandha 1800 sq ft 1.15 Cr\n-----\n2) Office space VIP Road 900 sqft rent 40,000 per month');
    expect(all.map(x => x.propertyType)).toEqual(['Independent House', 'Commercial Office']);
    expect(all[1]).toMatchObject({ transactionType: 'Rent', price: 40_000 });
    for (const x of all) expect(x.missing).toEqual(expect.arrayContaining(['ownerName', 'ownerPhone', 'address']));
    expect(parsePaste('Good morning 🙏 have a nice day')).toEqual([]);
    expect(parseOne('xyz').confidence).toBe(0);
  });
});

describe('bypass protection days', () => {
  it('presets never go above the superadmin’s maximum; the maximum itself is a preset', () => {
    expect(protectionConfig({}).presets).toEqual([30, 60, 90, 180]);
    expect(protectionConfig({ bypassMaxDays: 90 }).presets).toEqual([30, 60, 90]);
    expect(protectionConfig({ bypassMaxDays: 120 }).presets).toEqual([30, 60, 90, 120]);
    expect(protectionConfig({ bypassMaxDays: 99999 }).max).toBe(PROTECTION_CEILING);
    expect(protectionConfig({ bypassMaxDays: 45, defaultProtectionPeriodDays: 60 }).defaultDays).toBe(45);
  });
  it('custom days: whole number, at least 7, never above the maximum', () => {
    const cfg = protectionConfig({ bypassMaxDays: 90 });
    expect(protectionProblem(75, cfg)).toBeNull();
    expect(protectionProblem(91, cfg)?.code).toBe('PROTECTION_OVER_MAX');
    expect(protectionProblem(3, cfg)?.code).toBe('PROTECTION_SHORT');
    expect(protectionProblem(7.5, cfg)?.code).toBe('PROTECTION_WHOLE');
    expect(protectionProblem(91, cfg)?.hi).toMatch(/90 दिन/);
    expect(safeDays(500, cfg)).toBe(90); expect(safeDays(undefined, cfg)).toBe(30);
  });
});

describe('same property = same owner phone + city + locality + type (+ area within 10 %)', () => {
  it('spacing, case and +91 do not matter', () => {
    expect(looseKeyText({ ownerPhone: '+91 98271 12345', city: 'Raipur', locality: 'Shankar  Nagar', propertyType: 'Residential Flat' }))
      .toBe(looseKeyText({ ownerPhone: '9827112345', city: 'raipur', locality: 'shankar-nagar', propertyType: 'residential flat' }));
    expect(sameArea(1150, 1200)).toBe(true); expect(sameArea(1150, 2400)).toBe(false); expect(sameArea(undefined, 2400)).toBe(true);
  });
  it('a draft says exactly what is still missing', () => {
    expect(draftMissing({})).toEqual(['propertyType', 'transactionType', 'state', 'city', 'locality', 'askingPrice', 'ownerName', 'ownerPhone', 'addressHidden']);
    expect(draftMissing({ propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', locality: 'Pandri', askingPrice: 1, ownerName: 'Ram', ownerPhone: '9827112345', addressHidden: 'House 4, Lane 2' })).toEqual([]);
  });
});

describe('Web Push crypto (no package)', () => {
  it('RFC 8291 Appendix A: the exact same encrypted message as the standard', () => {
    const body = encryptPayload(Buffer.from('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
      { asPrivate: u8('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'), salt: u8('DGv6ra1nlYgDCS1FRnbzlw') });
    expect(body.toString('base64url')).toBe('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  });
  it('a random message opens with the browser’s private key (and not with another one)', () => {
    const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
    const auth = crypto.randomBytes(16).toString('base64url');
    const msg = Buffer.from(JSON.stringify({ t: 'New match', b: '2BHK Shankar Nagar ₹45 L' }));
    const body = encryptPayload(msg, ua.getPublicKey().toString('base64url'), auth);
    expect(decryptPayload(body, ua.getPrivateKey(), ua.getPublicKey().toString('base64url'), auth).equals(msg)).toBe(true);
    const other = crypto.createECDH('prime256v1'); other.generateKeys();
    expect(() => decryptPayload(body, other.getPrivateKey(), ua.getPublicKey().toString('base64url'), auth)).toThrow();
  });
  it('VAPID: an ES256 token for the push service origin, signed with our key', () => {
    const k = generateVapidKeys();
    const h = vapidAuth('https://fcm.googleapis.com/fcm/send/abc', k, 'mailto:ops@example.in', 2_000_000_000);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(h)!; expect(m[2]).toBe(k.publicKey);
    expect(verifyVapidJwt(m[1], k.publicKey)).toBe(true);
    expect(JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: 2_000_000_000, sub: 'mailto:ops@example.in' });
    expect(verifyVapidJwt(m[1], generateVapidKeys().publicKey)).toBe(false);
  });
  it('only https addresses of real push services are accepted (no request to our own network)', () => {
    for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) expect(allowedEndpoint(ok), ok).toBe(true);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com.evil.in/x', 'https://evil.in/fcm.googleapis.com', 'https://fcm.googleapis.com:8443/x', 'file:///etc/passwd']) expect(allowedEndpoint(bad), bad).toBe(false);
  });
});

describe('two-step sign-in codes (RFC 6238)', () => {
  it('RFC 6238 SHA-1 test vectors', () => {
    const key = Buffer.from('12345678901234567890');
    expect(hotp(key, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(hotp(key, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(hotp(key, Math.floor(2000000000 / 30), 8)).toBe('69279037');
  });
  it('base32 round trip; ±30 seconds accepted, older codes not', () => {
    const k = crypto.randomBytes(20);
    expect(base32Decode(base32Encode(k)).equals(k)).toBe(true);
    const t = 1_800_000_000_000; const code = hotp(k, Math.floor(t / 30000));
    expect(checkTotp(k, code, t)).toBeGreaterThan(0); expect(checkTotp(k, code, t + 30_000)).toBeGreaterThan(0);
    expect(checkTotp(k, code, t + 90_000)).toBe(-1); expect(checkTotp(k, '12345', t)).toBe(-1);
  });
});

describe('static guarantees', () => {
  it('the service worker shows pushes and opens only our own pages; no push package was added', () => {
    const sw = readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
    expect(sw).toContain("addEventListener('push'"); expect(sw).toContain("addEventListener('notificationclick'"); expect(sw).toContain("d.u.startsWith('/')");
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.dependencies['web-push']).toBeUndefined();
  });
  it('mandates and settings no longer hard-code 180 days; deal rooms show their own days', () => {
    expect(readFileSync(path.join(ROOT, 'server/validation.ts'), 'utf8')).not.toContain('protectionPeriodDays: z.number().int().min(7).max(180)');
    expect(readFileSync(path.join(ROOT, 'src/components/DealRoomsView.tsx'), 'utf8')).not.toMatch(/30-day anti-bypass|30 दिन (?:का|की) एंटी-बायपास/);
  });
});

// ───────────────────────── the server ─────────────────────────
const PORT = 5000 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const acct = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id);
async function login(id: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct(id).email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
// v27: the owner's yes also needs his signature (typed initials here; the drawn one is tested in v27-brokerage-sign)
const ownerPost = (token: string, form: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(`${B}/oc/${token}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(form.action === 'agree' && !form.sigMode ? { sigMode: 'type', initials: 'RP', ...form } : form).toString() });
let phoneSeq = 1000;
const ownerPhone = () => `98${String(27100000 + ++phoneSeq)}`;
const LOCALITY = () => `Test Colony ${Math.floor(Math.random() * 1e6)}`;

async function draftFor(cookie: string, f: Record<string, any>) {
  const p = await j(await call(cookie, 'POST', '/api/consent/paste', { text: `*2BHK Flat for Sale* ${f.locality}, Raipur 1150 sqft Price: 45 Lakh` }));
  expect(p.drafts?.length, JSON.stringify(p)).toBe(1);
  const d = p.drafts[0];
  const full = { title: `2BHK Flat in ${f.locality}`, propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur', askingPrice: 4_500_000, areaSqft: 1150, ownerName: 'Ram Prasad', addressHidden: 'House 12, Lane 3, near temple', ...f };
  const s = await call(cookie, 'PUT', `/api/consent/drafts/${d.id}`, { fields: full });
  expect(s.status, await s.clone().text()).toBe(200);
  return d.id as string;
}
async function askLink(cookie: string, draftId: string, days = 60, headers: Record<string, string> = {}) {
  const r = await call(cookie, 'POST', `/api/consent/drafts/${draftId}/request`, { protectionDays: days }, headers);
  const b = await r.json();
  return { status: r.status, body: b, token: b.url ? String(b.url).split('/oc/')[1] : '' };
}
const publishBody = (f: Record<string, any>, consentId?: string) => ({
  title: `2BHK Flat in ${f.locality}`, description: 'Nice 2BHK flat, east facing, lift and parking.', propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Chhattisgarh', city: 'Raipur',
  locality: f.locality, addressHidden: 'House 12, Lane 3, near temple', builtUpAreaSqFt: 1150, askingPrice: 4_500_000 + Math.floor(Math.random() * 1000), ownerApprovedNetPrice: 4_400_000, ownerName: 'Ram Prasad', ownerPhone: f.ownerPhone, ...(consentId ? { consentId } : {}),
});

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v26-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', TRUST_PROXY: 'true' }, stdio: 'ignore',
  });
  // the whole suite starts ~60 servers at once: give this one up to 50 s to boot (it was 20 s, and missed it under load)
  for (let i = 0; i < 200; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN')?.id || 'USR-SUPERADMIN';
  for (const [k, id] of Object.entries({ BRK1: 'USR-BRK-001', BRK2: 'USR-BRK-002', ADMIN: 'USR-ADMIN-1', SUP: sup })) jar[k] = await login(id);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('protection limit (superadmin only)', () => {
  it('anyone signed in reads the rule; only the superadmin changes it; existing default follows a lower maximum', async () => {
    expect(await j(await call(jar.BRK1, 'GET', '/api/protection/config'))).toMatchObject({ max: 180, defaultDays: 30, presets: [30, 60, 90, 180] });
    expect((await call(jar.BRK1, 'PUT', '/api/protection/settings', { maxDays: 365 })).status).toBe(403);
    expect((await call(jar.ADMIN, 'PUT', '/api/protection/settings', { maxDays: 365 })).status).toBe(403);
    expect((await call(jar.SUP, 'PUT', '/api/protection/settings', { maxDays: 90, defaultDays: 120 })).status).toBe(400);
    expect(await j(await call(jar.SUP, 'PUT', '/api/protection/settings', { maxDays: 90 }))).toMatchObject({ max: 90, presets: [30, 60, 90] });
  });
  it('a consent asking for more than the maximum is refused (hi + en)', async () => {
    const d = await draftFor(jar.BRK1, { locality: LOCALITY(), ownerPhone: ownerPhone() });
    const r = await askLink(jar.BRK1, d, 120);
    expect(r.status).toBe(400); expect(r.body.code).toBe('PROTECTION_OVER_MAX'); expect(r.body.hi).toMatch(/90/);
    expect((await askLink(jar.BRK1, d, 75)).status).toBe(200);
    expect(await j(await call(jar.SUP, 'PUT', '/api/protection/settings', { maxDays: 180, defaultDays: 30 }))).toMatchObject({ max: 180 });
  });
});

describe('WhatsApp paste → owner consent → publish', () => {
  const f = { locality: LOCALITY(), ownerPhone: ownerPhone() };
  let draftId = ''; let token = ''; let consentId = ''; let propertyId = '';
  it('drafts are private to the broker who pasted them', async () => {
    draftId = await draftFor(jar.BRK1, f);
    const mine = await j(await call(jar.BRK1, 'GET', '/api/consent/drafts'));
    expect(mine.drafts.some((d: any) => d.id === draftId)).toBe(true);
    const other = await j(await call(jar.BRK2, 'GET', '/api/consent/drafts'));
    expect(other.drafts.some((d: any) => d.id === draftId)).toBe(false);
    expect((await call(jar.BRK2, 'PUT', `/api/consent/drafts/${draftId}`, { fields: { title: 'mine now' } })).status).toBe(404);
  });
  it('an incomplete draft cannot ask the owner', async () => {
    const p = await j(await call(jar.BRK1, 'POST', '/api/consent/paste', { text: '3 BHK duplex Telibandha 1800 sq ft 1.15 Cr' }));
    const r = await askLink(jar.BRK1, p.drafts[0].id);
    expect(r.status).toBe(400); expect(r.body.code).toBe('DRAFT_INCOMPLETE'); expect(r.body.missing).toEqual(expect.arrayContaining(['ownerName', 'ownerPhone', 'addressHidden']));
  });
  it('the link goes on WhatsApp to the owner’s number; the page shows broker, price and protection days', async () => {
    const r = await askLink(jar.BRK1, draftId, 90);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    token = r.token; expect(token.length).toBeGreaterThan(16);
    expect(r.body.whatsapp.link).toContain(`https://wa.me/91${f.ownerPhone}?text=`);
    consentId = r.body.draft.consent.id; expect(r.body.draft.status).toBe('CONSENT_PENDING');
    const page = await (await fetch(`${B}/oc/${token}`)).text();
    expect(page).toContain(f.locality); expect(page).toContain('90 दिन (3 महीने)'); expect(page).toContain('₹45 L');
    expect(page).not.toContain(f.ownerPhone);                                   // the owner's own number is not printed on the page
    expect((await fetch(`${B}/oc/not-a-real-token-123456`)).status).toBe(404);
  });
  it('the broker cannot say yes for the owner from his own signed-in phone', async () => {
    const r = await ownerPost(token, { action: 'agree', name: 'Ram Prasad', ok: '1' }, { cookie: jar.BRK1 });
    expect(await r.text()).toMatch(/OWNER's phone|मालिक के फ़ोन/);
    const d = (await j(await call(jar.BRK1, 'GET', '/api/consent/drafts'))).drafts.find((x: any) => x.id === draftId);
    expect(d.consent.status).toBe('PENDING');
  });
  it('a draft cannot be published before the owner agrees', async () => {
    const r = await call(jar.BRK1, 'POST', '/api/properties', publishBody(f, consentId));
    expect(r.status).toBe(409); expect((await r.json()).code).toBe('CONSENT_NOT_ACCEPTED');
  });
  it('the owner says yes → bond for 90 days → the broker publishes; the listing carries the protection date', async () => {
    const r = await ownerPost(token, { action: 'agree', name: 'Ram Prasad', ok: '1' }, { 'user-agent': 'OwnerPhone/1.0', 'x-forwarded-for': '10.99.1.1' });
    expect(await r.text()).toMatch(/आपने \d{1,2} \w{3} \d{4} को सहमति दी/);
    const d = (await j(await call(jar.BRK1, 'GET', '/api/consent/drafts'))).drafts.find((x: any) => x.id === draftId);
    expect(d.status).toBe('READY'); expect(d.consent).toMatchObject({ status: 'ACCEPTED', bondActive: true, protectionDays: 90, flagged: false });
    expect(Math.round((Date.parse(d.consent.expiresAt) - Date.parse(d.consent.acceptedAt)) / 86400_000)).toBe(90);
    const p = await call(jar.BRK1, 'POST', '/api/properties', publishBody(f, consentId));
    const pb = await p.json(); expect(p.status, JSON.stringify(pb)).toBe(200);
    propertyId = pb.property.id;
    expect(pb.property.ownerConsentId).toBe(consentId); expect(pb.property.protectionUntil).toBe(d.consent.expiresAt);
    expect(JSON.stringify(pb)).not.toContain('ownerKeyHash');
    expect((await call(jar.BRK1, 'POST', '/api/properties', publishBody(f, consentId))).status).toBe(409); // a consent is used once
  });
  it('a second broker cannot list the same property — by the normal form or by paste — and is sent to co-broke', async () => {
    const r = await call(jar.BRK2, 'POST', '/api/properties', publishBody({ ...f, locality: f.locality.toUpperCase() }));
    const b = await r.json();
    expect(r.status).toBe(409); expect(b.code).toBe('CONSENT_TAKEN'); expect(b.coBrokePropertyId).toBe(propertyId); expect(b.hi).toMatch(/को-ब्रोकिंग/);
    expect(JSON.stringify(b)).not.toMatch(/Rajesh|USR-BRK-001/);              // the first broker is not named
    const d2 = await draftFor(jar.BRK2, f);
    const chk = await j(await call(jar.BRK2, 'POST', `/api/consent/drafts/${d2}/check`));
    expect(chk.state).toBe('TAKEN');
    expect((await askLink(jar.BRK2, d2)).body.code).toBe('CONSENT_TAKEN');
  });
  it('the same owner with a different property (other locality) is fine', async () => {
    const r = await call(jar.BRK2, 'POST', '/api/properties', publishBody({ ...f, locality: LOCALITY() }));
    expect(r.status, await r.clone().text()).toBe(200);
  });
  it('the owner can later tell GENZ he never agreed → GENZ queue; GENZ cancels → the bond ends at once', async () => {
    await ownerPost(token, { action: 'report', note: 'I never spoke to this broker' });
    const q = await j(await call(jar.ADMIN, 'GET', '/api/consent/admin/queue'));
    const item = q.items.find((x: any) => x.id === consentId);
    expect(item.ownerReport.note).toBe('I never spoke to this broker');
    expect((await call(jar.BRK1, 'GET', '/api/consent/admin/queue')).status).toBe(403);
    expect((await call(jar.ADMIN, 'POST', `/api/consent/admin/${consentId}/void`, { note: 'short' })).status).toBe(400);
    expect((await call(jar.ADMIN, 'POST', `/api/consent/admin/${consentId}/void`, { note: 'Owner confirmed on call he did not agree' })).status).toBe(200);
    const r = await call(jar.BRK2, 'POST', '/api/properties', publishBody(f));
    expect(r.status, await r.clone().text()).toBe(200);                       // nothing blocks the property any more
  });
});

describe('owner says no / link opened on the broker’s own phone / paper form', () => {
  it('“No” sends the draft back and tells nobody else', async () => {
    const d = await draftFor(jar.BRK1, { locality: LOCALITY(), ownerPhone: ownerPhone() });
    const { token } = await askLink(jar.BRK1, d);
    expect(await (await ownerPost(token, { action: 'decline' })).text()).toMatch(/लिस्ट नहीं होगी/);
    const x = (await j(await call(jar.BRK1, 'GET', '/api/consent/drafts'))).drafts.find((y: any) => y.id === d);
    expect(x.status).toBe('DRAFT'); expect(x.consent.status).toBe('DECLINED');
    expect((await fetch(`${B}/oc/${token}`)).status).toBe(404);             // the link is dead after a no
  });
  it('“Yes” from the same phone + browser that made the link is accepted but flagged for a GENZ call', async () => {
    const d = await draftFor(jar.BRK1, { locality: LOCALITY(), ownerPhone: ownerPhone() });
    const H = { 'user-agent': 'SamePhone/9', 'x-forwarded-for': '10.77.7.7' };
    const { token, body } = await askLink(jar.BRK1, d, 30, H);
    await ownerPost(token, { action: 'agree', name: 'Owner', ok: '1' }, H);
    const q = await j(await call(jar.ADMIN, 'GET', '/api/consent/admin/queue'));
    expect(q.items.find((x: any) => x.id === body.draft.consent.id)?.sameDevice).toBe(true);
  });
  it('a signed paper form → GENZ checks → accepted; a bad file type is refused', async () => {
    const d = await draftFor(jar.BRK1, { locality: LOCALITY(), ownerPhone: ownerPhone() });
    expect((await call(jar.BRK1, 'POST', `/api/consent/drafts/${d}/paper`, { protectionDays: 60, data: Buffer.from('hello world, not an image').toString('base64') })).status).toBe(415);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const r = await j(await call(jar.BRK1, 'POST', `/api/consent/drafts/${d}/paper`, { protectionDays: 60, data: `data:image/png;base64,${png.toString('base64')}` }));
    expect(r.draft.consent).toMatchObject({ method: 'PAPER', status: 'PAPER_REVIEW' });
    const id = r.draft.consent.id;
    const img = await call(jar.ADMIN, 'GET', `/api/consent/admin/${id}/paper`);
    expect(img.status).toBe(200); expect(img.headers.get('content-type')).toBe('image/png');
    expect((await call(jar.ADMIN, 'POST', `/api/consent/admin/${id}/decide`, { approve: false, note: '' })).status).toBe(400);
    const ok = await j(await call(jar.ADMIN, 'POST', `/api/consent/admin/${id}/decide`, { approve: true, note: 'Signature and name match' }));
    expect(ok.consent).toMatchObject({ status: 'ACCEPTED', bondActive: true, protectionDays: 60 });
    const form = await call(jar.BRK1, 'GET', `/api/consent/drafts/${d}/form?days=60`);
    expect(await form.text()).toMatch(/60 days.*bypass protection/s);
  });
  it('when the superadmin requires consent, a broker listing without it is stopped (428); switching off restores the old flow', async () => {
    expect((await call(jar.SUP, 'PUT', '/api/admin/settings', { ownerConsentRequired: true })).status).toBe(200);
    const r = await call(jar.BRK2, 'POST', '/api/properties', publishBody({ locality: LOCALITY(), ownerPhone: ownerPhone() }));
    expect(r.status).toBe(428); expect((await r.json()).code).toBe('CONSENT_REQUIRED');
    expect((await call(jar.SUP, 'PUT', '/api/admin/settings', { ownerConsentRequired: false })).status).toBe(200);
    expect((await call(jar.BRK2, 'POST', '/api/properties', publishBody({ locality: LOCALITY(), ownerPhone: ownerPhone() }))).status).toBe(200);
  });
});

describe('phone alerts (Web Push)', () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const keys = { p256dh: ua.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
  it('the server has a VAPID key; only real push services and valid keys are accepted', async () => {
    const k = await j(await call(undefined, 'GET', '/api/push/key'));
    expect(Buffer.from(k.publicKey, 'base64url')).toHaveLength(65);
    expect((await call(jar.BRK1, 'POST', '/api/push/subscribe', { endpoint: 'https://127.0.0.1/steal', keys })).status).toBe(400);
    expect((await call(jar.BRK1, 'POST', '/api/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'A'.repeat(87), auth: keys.auth } })).status).toBe(400);
    expect((await call(undefined, 'POST', '/api/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys })).status).toBe(401);
    expect(await j(await call(jar.BRK1, 'POST', '/api/push/subscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device', keys }))).toMatchObject({ success: true, devices: 1 });
  });
  it('choices are per member; switching a kind off is kept', async () => {
    const p = await j(await call(jar.BRK1, 'GET', '/api/push/prefs'));
    expect(p).toMatchObject({ devices: 1, ready: true, prefs: { matches: true, broadcast: true, consent: true, quiet: true } });
    expect((await j(await call(jar.BRK1, 'PUT', '/api/push/prefs', { digest: false }))).prefs.digest).toBe(false);
    expect((await call(jar.BRK1, 'PUT', '/api/push/prefs', { hack: true })).status).toBe(400);
    expect((await j(await call(jar.BRK1, 'POST', '/api/push/unsubscribe', { endpoint: 'https://fcm.googleapis.com/fcm/send/test-device' }))).devices).toBe(0);
  });
});

describe('buyer need → network (“mere paas hai”)', () => {
  let bcId = ''; let listingId = '';
  it('BRK1 has a live listing; BRK2 sends his client’s need; BRK1 is among the receivers and sees his fitting listing', async () => {
    const loc = LOCALITY();
    const p = await j(await call(jar.BRK1, 'POST', '/api/properties', { ...publishBody({ locality: loc, ownerPhone: ownerPhone() }), askingPrice: 4_600_000, ownerApprovedNetPrice: 4_500_000 }));
    listingId = p.property.id;
    const rq = await j(await call(jar.BRK2, 'POST', '/api/requirements', { customerName: 'Client Secret Name', customerPhone: '9811122233', budgetMin: 4_000_000, budgetMax: 5_000_000, state: 'Chhattisgarh', city: 'Raipur', preferredLocalities: [loc], propertyType: 'Residential Flat', transactionType: 'Sale', minAreaSqFt: 1000, purpose: 'Self-use', urgency: 'Immediate (< 15 days)' }));
    expect(rq.requirement?.id, JSON.stringify(rq)).toBeTruthy();
    const b = await j(await call(jar.BRK2, 'POST', '/api/broadcast', { requirementId: rq.requirement.id }));
    expect(b.broadcast.withListing).toBeGreaterThanOrEqual(1); bcId = b.broadcast.id;
    expect((await call(jar.BRK2, 'POST', '/api/broadcast', { requirementId: rq.requirement.id })).status).toBe(409); // not twice a day
    const inbox = await j(await call(jar.BRK1, 'GET', '/api/broadcast/inbox'));
    const it2 = inbox.items.find((x: any) => x.id === bcId);
    expect(it2.myListings.map((x: any) => x.id)).toContain(listingId);
    expect(JSON.stringify(inbox)).not.toMatch(/Client Secret Name|9811122233/); // the client stays private
  });
  it('one tap answer → the sender sees who has it and which listing; strangers cannot answer', async () => {
    expect((await call(jar.BRK1, 'POST', `/api/broadcast/${bcId}/respond`, { propertyId: 'PROP-NOT-MINE' })).status).toBe(400);
    expect(await j(await call(jar.BRK1, 'POST', `/api/broadcast/${bcId}/respond`, { propertyId: listingId }))).toMatchObject({ success: true });
    expect(await j(await call(jar.BRK1, 'POST', `/api/broadcast/${bcId}/respond`, { propertyId: listingId }))).toMatchObject({ duplicate: true });
    const mine = await j(await call(jar.BRK2, 'GET', '/api/broadcast/mine'));
    const row = mine.items.find((x: any) => x.id === bcId);
    expect(row.responses[0].property.id).toBe(listingId); expect(row.responses[0].broker.id).toBe('USR-BRK-001');
    expect((await call(jar.ADMIN, 'POST', `/api/broadcast/${bcId}/respond`, { note: 'I have one too' })).status).toBe(404);
  });
});

describe('two-step sign-in for the superadmin (and the KYC vault)', () => {
  let key: Buffer; let recovery: string[] = [];
  const now = () => hotp(key, Math.floor(Date.now() / 30000));
  const prev = () => hotp(key, Math.floor(Date.now() / 30000) - 1);
  it('setup needs the password; enabling needs a correct code; 10 recovery codes are shown once', async () => {
    expect((await call(jar.SUP, 'POST', '/api/auth/2fa/setup', { password: 'wrong' })).status).toBe(400);
    const s = await j(await call(jar.SUP, 'POST', '/api/auth/2fa/setup', { password: cfg.demoPassword }));
    expect(s.otpauth).toMatch(/^otpauth:\/\/totp\/GENZ(:|%3A)/); expect(s.otpauth).toContain('issuer=GENZ'); key = base32Decode(s.secret);
    expect((await call(jar.SUP, 'POST', '/api/auth/2fa/enable', { code: '000000' })).status).toBe(400);
    const e = await j(await call(jar.SUP, 'POST', '/api/auth/2fa/enable', { code: prev() }));
    recovery = e.recoveryCodes; expect(recovery).toHaveLength(10);
    expect(await j(await call(jar.SUP, 'GET', '/api/auth/2fa/status'))).toMatchObject({ enabled: true, recoveryLeft: 10 });
  });
  it('sign-in: the password alone gives no session; the code does; the same code twice does not', async () => {
    const email = acct(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').id).email;
    const r1 = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
    const b1 = await r1.json(); expect(b1.twoFactorRequired).toBe(true); expect(r1.headers.get('set-cookie')).toBeNull();
    expect((await call(undefined, 'POST', '/api/auth/login/2fa', { ticket: b1.ticket, code: '123456' })).status).toBe(401);
    const code = now();
    const r2 = await call(undefined, 'POST', '/api/auth/login/2fa', { ticket: b1.ticket, code });
    expect(r2.status).toBe(200); expect(r2.headers.get('set-cookie')).toContain('genz_session=');
    expect((await call(undefined, 'POST', '/api/auth/login/2fa', { ticket: b1.ticket, code })).status).toBe(401); // replay
    expect((await call(undefined, 'POST', '/api/auth/login/2fa', { ticket: b1.ticket + 'x', code })).status).toBe(401);
    const r3 = await call(undefined, 'POST', '/api/auth/login/2fa', { ticket: b1.ticket, code: recovery[0] });
    expect(r3.status).toBe(200);
    expect((await call(undefined, 'POST', '/api/auth/login/2fa', { ticket: b1.ticket, code: recovery[0] })).status).toBe(401); // a recovery code works once
  });
  it('the KYC vault needs the code while 2FA is on (the code is checked before anything opens)', async () => {
    const r = await call(jar.SUP, 'POST', '/api/kyc-vault/reveal/USR-BRK-001', { purpose: 'LEGAL_CASE', reason: 'Notice for unpaid commission — advocate needs the address', password: cfg.demoPassword, code: '000000' });
    expect(r.status).toBe(403); expect((await r.json()).code).toBe('BAD_CODE');
  });
  it('turning off needs password + code', async () => {
    await new Promise(r => setTimeout(r, 31_000)); // a fresh time step (the last code was used)
    expect((await call(jar.SUP, 'POST', '/api/auth/2fa/disable', { password: cfg.demoPassword, code: '000000' })).status).toBe(400);
    expect((await call(jar.SUP, 'POST', '/api/auth/2fa/disable', { password: cfg.demoPassword, code: now() })).status).toBe(200);
    expect((await j(await call(jar.SUP, 'GET', '/api/auth/2fa/status'))).enabled).toBe(false);
  }, 45_000);
});

// ───────────────────────── growth loops ─────────────────────────
describe('pilot check (activation in 7 days, day-7 return)', () => {
  it('counts only real first actions within 7 days and only brokers old enough for D7', () => {
    const now = Date.parse('2026-10-17T06:00:00Z'); const D = 86400_000;
    const joined = (d: number) => new Date(now - d * D).toISOString();
    const r = pilotFunnel({
      now,
      brokers: [{ id: 'a', createdAt: joined(30) }, { id: 'b', createdAt: joined(20) }, { id: 'c', createdAt: joined(3) }, { id: 'old', createdAt: joined(400) }],
      firstListingAt: { a: now - 28 * D, b: now - 2 * D },            // a: day 2 ✔, b: day 18 ✘
      firstClientAt: { c: now - 1 * D },                               // c: day 2 ✔
      firstConsentAt: {},
      days: [{ day: new Date(now - 21 * D + 330 * 60_000).toISOString().slice(0, 10), seen: ['a'] }], // a back on day 9
    }, 60);
    expect(r.joined).toBe(3); expect(r.activation).toMatchObject({ any: 2, listing: 1, client: 1, pct: 67 });
    expect(r.d7).toEqual({ base: 2, returned: 1, pct: 50 });
  });
});

describe('broker home, reputation, public pages', () => {
  it('home summary: first steps, counts, rank and the broker’s own referral code', async () => {
    const h = await j(await call(jar.BRK1, 'GET', '/api/home/broker'));
    expect(h.firstRun.listing).toBe(true);
    expect(h.counts).toMatchObject({ drafts: expect.any(Number), inbox: expect.any(Number), protectedListings: expect.any(Number) });
    expect(h.refCode).toMatch(/^GZ-/); expect(h.rank.of).toBeGreaterThan(0);
  });
  it('“deal sahi hui” can only confirm a settled deal you were part of', async () => {
    const p = await j(await call(jar.BRK1, 'GET', '/api/reputation/pending'));
    expect(Array.isArray(p.items)).toBe(true); expect(p.mine).toMatchObject({ closed: expect.any(Number), confirmers: expect.any(Number) });
    expect((await call(jar.BRK1, 'POST', '/api/reputation/confirm', { refId: 'DEAL-2026-001', toId: 'USR-BRK-002' })).status).toBe(404); // not settled
  });
  it('a shared listing board carries the GENZ join line with the sharing broker’s code', async () => {
    const props = await j(await call(jar.BRK1, 'GET', '/api/listings/mine'));
    const live = (props.listings || props.items || []).find((x: any) => ['active', 'under_negotiation'].includes(x.listingStatus) && x.verificationStatus === 'VERIFIED') || (props.listings || props.items || [])[0];
    expect(live, JSON.stringify(props).slice(0, 300)).toBeTruthy();
    const poster = await j(await call(jar.BRK1, 'POST', `/api/listings/${live.id}/poster`, {}));
    const html = await (await fetch(`${B}${poster.path}`)).text();
    const h = await j(await call(jar.BRK1, 'GET', '/api/home/broker'));
    expect(html).toContain('data-genz-join'); expect(html).toContain(`/?ref=${encodeURIComponent(h.refCode)}`);
  });
  it('the public city report shows only aggregates (or says it is not ready) and invites with ?ref', async () => {
    const h = await j(await call(jar.BRK1, 'GET', '/api/home/broker'));
    const r = await fetch(`${B}/report/Raipur?ref=${encodeURIComponent(h.refCode)}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('Raipur Property Report'); expect(html).toContain(`/?ref=${encodeURIComponent(h.refCode)}`);
    expect(html).not.toMatch(/\b[6-9]\d{9}\b/);                                  // no phone number anywhere
    expect(html).not.toMatch(/Ram Prasad|House 12/);                            // no owner, no address
  });
});
