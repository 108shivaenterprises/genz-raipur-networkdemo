// Journey 1: new broker signs up with an invitation code (+ mobile OTP in demo mode), then what happens after.
import { launch, login, step, shot, done, BASE, PW } from './lib.mjs';
const { browser, page } = await launch();
const rnd = String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
const phone = '98' + rnd;
const email = `e2e.${Date.now()}@example.test`;
const PAN = 'ABCPD' + String(1000 + Math.floor(Math.random() * 8999)) + 'E';
// Verhoeff-valid Aadhaar
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const INV = [0,4,3,2,1,5,6,7,8,9];
const body = '2' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
let c = 0; [...body].reverse().forEach((d, i) => { c = D[c][P[(i + 1) % 8][+d]]; });
const AADHAAR = body + INV[c];
const MYPW = 'E2e#Pass2026';

let code = '';
await step(page, '1.0', 'setup: admin creates broker invitation (API via logged-in UI session)', async () => {
  await login(page, 'operations@genzbroker.in');
  await page.getByTestId('header-profile').waitFor();
  const r = await page.evaluate(async ({ phone, email }) => {
    const x = await fetch('/api/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ invitedPhone: phone, invitedEmail: email, targetRole: 'BROKER' }) });
    return { s: x.status, j: await x.json() };
  }, { phone, email });
  if (r.s >= 300) throw new Error('invite create ' + JSON.stringify(r).slice(0, 200));
  code = r.j.invitation.code; return code;
});
const ctx2 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true });
const p = await ctx2.newPage(); p.setDefaultTimeout(8000); p.errs = [];
p.on('pageerror', e => { if (!/WebSocket/.test(e.message)) p.errs.push(e.message); }); // Vite HMR ws noise ignored
await step(p, '1.1', 'login page -> "Join" -> invitation code validates', async () => {
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.getByRole('button', { name: /invitation code/i }).click();
  await p.getByPlaceholder('GZ-XXX-XXXXXXXXXXXX').fill(code);
  await p.locator('form button[type=submit], form button:not([type])').first().click();
  await p.getByPlaceholder('9XXXXXXXXX').waitFor();
});
await step(p, '1.2', 'form: name, mobile OTP (demo code shown), email, password, city, PAN, Aadhaar, consent', async () => {
  const lab = t => p.locator('label', { hasText: t }).locator('xpath=following-sibling::*[self::input or self::textarea][1]');
  await p.locator('label', { hasText: /Full name|^Name|Your name/i }).first().locator('xpath=following-sibling::input[1]').fill('E2E Test Broker').catch(async () => { await p.locator('input[required]').first().fill('E2E Test Broker'); });
  await shot(p, '1-2a-form-top');
  await p.getByTestId('join-otp-send').click();
  const note = p.getByText(/Demo code: \d{6}/);
  await note.waitFor();
  const otp = (await note.innerText()).match(/\d{6}/)[0];
  await p.getByTestId('join-otp-code').fill(otp);
  p._otp = otp;
});
await step(p, '1.3', 'fill remaining fields and submit', async () => {
  const inputs = p.locator('form input:visible, form textarea:visible');
  const info = await inputs.evaluateAll(els => els.map(e => ({ t: e.type, ph: e.placeholder, req: e.required, id: e.getAttribute('data-testid') || '', lab: (e.closest('div')?.querySelector('label')?.innerText || '').slice(0, 30), v: e.value })));
  p._info = info;
  const byLab = re => inputs.filter({ has: p.locator('xpath=self::*') }).nth(info.findIndex(i => re.test(i.lab + i.ph + i.id)));
  const set = async (re, val) => { const i = info.findIndex(x => re.test(x.lab + ' ' + x.ph + ' ' + x.id) && !x.v); if (i < 0) throw new Error('field not found ' + re); await inputs.nth(i).fill(val); };
  if (!(info.find(x => /name/i.test(x.lab))?.v)) await set(/name/i, 'E2E Test Broker').catch(() => {});
  const emailI = info.findIndex(x => x.t === 'email' || /email/i.test(x.lab));
  if (emailI >= 0 && !info[emailI].v) await inputs.nth(emailI).fill(email);
  await inputs.filter({}).evaluateAll(() => {});
  const pw = p.locator('form input[type=password]'); await pw.first().fill(MYPW);
  if (await pw.count() > 1) await pw.nth(1).fill(MYPW);
  // city
  await p.getByPlaceholder('Pick or type').fill('Raipur').catch(() => {});
  await p.locator('form select').first().selectOption('Chhattisgarh').catch(() => {});
  await p.getByPlaceholder('Pick or type').fill('Raipur').catch(() => {});
  await p.locator('label:has-text("PAN *") + input').first().fill(PAN);
  await p.getByTestId('loc-locality').fill('Shankar Nagar');
  await p.getByPlaceholder('XXXX XXXX XXXX').fill(AADHAAR);
  await p.getByTestId('join-address').fill('House 12, Shankar Nagar, Raipur');
  await p.getByTestId('join-pin').fill('492001');
  for (const cb of await p.locator('form input[type=checkbox]').all()) await cb.check().catch(() => {});
  await shot(p, '1-3-filled');
  await p.locator('form button:not([type=button])').last().click();
  await p.waitForTimeout(3500);
  await shot(p, '1-3-after-submit');
  const txt = await p.evaluate(() => document.body.innerText);
  if (!/verified|submitted|Sign in later/i.test(txt)) { const bad = await p.locator('form [role=alert], form p.text-red-700').allInnerTexts(); const invalid = await p.evaluate(() => [...document.querySelectorAll('form :invalid')].map(e => (e.closest('div')?.querySelector('label')?.innerText || e.placeholder || e.type).slice(0, 40))); throw new Error('no success; errors=' + JSON.stringify(bad) + ' invalid-fields=' + JSON.stringify(invalid)); }
  p._done = txt;
  return /You are verified/.test(txt) ? 'auto-verified (live at once)' : 'submitted, awaiting admin';
});
await step(p, '1.4', 'after OTP: new broker can sign in right away', async () => {
  await login(p, phone, MYPW).catch(() => {});
  const ok = await p.getByTestId('header-profile').waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
  await shot(p, '1-4-first-login');
  if (!ok) throw new Error('cannot sign in; page: ' + (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 250));
});
await step(p, '1.5', 'new account lands on a usable home (no blank/crash), shows onboarding or chats', async () => {
  await p.waitForTimeout(2500);
  const txt = await p.evaluate(() => document.body.innerText);
  if (txt.length < 100) throw new Error('almost empty page: ' + txt);
  if (p.errs.length) throw new Error('page errors: ' + p.errs.slice(0, 2).join(' ; '));
  return txt.replace(/\n+/g, ' | ').slice(0, 160);
});
console.log('creds', { phone, email, code });
await browser.close(); done();
