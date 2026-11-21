// Journey 5: WhatsApp share of a listing (More menu), Share Kit tracking link + wa.me, public share page opens.
import { launch, login, step, shot, done, BROKER, BASE } from './lib.mjs';
const EXPECT = process.env.EXPECT_BASE || BASE; // set EXPECT_BASE when server has PUBLIC_URL and you browse via another host
const { browser, page } = await launch();
await page.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(String(u)); return null; }; navigator.share = async d => { window.__shared = d; }; });
await login(page, BROKER);
await page.getByTestId('bottom-properties').click();

await step(page, '5a.1', 'listing More menu -> "WhatsApp share" link built with correct base', async () => {
  await page.getByTestId('more-PROP-DMO-001').click();
  const a = page.locator('a[href*="whatsapp.com/send"], a[href*="wa.me"]').first();
  await a.waitFor();
  const dec = decodeURIComponent(await a.getAttribute('href'));
  const link = dec.match(/https?:\/\/[^\s]+propertyId=[^\s]+/);
  if (!link) throw new Error('no deep link in text: ' + dec.slice(0, 200));
  if (!link[0].startsWith(EXPECT)) throw new Error(`deep link base wrong: ${link[0]} (expected ${EXPECT})`);
  if (/Commission|brokerage|owner/i.test(dec.replace(/Owner/g, '')) && /Net Price|ownerApproved/i.test(dec)) throw new Error('private data in WA text');
  return link[0];
});
let token = '';
await step(page, '5b.1', 'Share Kit: create tracking link', async () => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('bottom-more').click();
  await page.getByRole('button', { name: 'Share Kit' }).click();
  await page.getByText('2. What to share').waitFor();
  await page.getByPlaceholder(/Client name/).fill('E2E Client');
  await page.getByRole('button', { name: /Create tracking li/ }).click();
  const box = page.locator('div.break-all', { hasText: '/s/' }).first();
  await box.waitFor();
  const txt = await box.innerText();
  const m = txt.match(/(https?:\/\/\S+?)\/s\/([\w-]+)/);
  if (!m) throw new Error('no /s/ url: ' + txt);
  if (m[1] !== EXPECT) throw new Error(`tracking link base ${m[1]} != ${EXPECT}`);
  token = m[2]; return m[0];
});
await step(page, '5b.2', 'Share Kit: ready message wa.me link carries tracking URL', async () => {
  const wa = page.locator('a[href*="wa.me"], a[href*="whatsapp.com/send"]').first();
  const href = decodeURIComponent(await wa.getAttribute('href'));
  if (!href.includes(`/s/${token}`)) throw new Error('wa link lacks tracking url: ' + href.slice(0, 300));
  await shot(page, '5b2-sharekit');
});
await step(page, '5b.3', 'public share page /s/<token> opens anonymously', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const p = await ctx.newPage();
  const r = await p.goto(`${BASE}/s/${token}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  await shot(p, '5b3-public-share');
  const body = await p.evaluate(() => document.body.innerText);
  if (r.status() !== 200 || body.length < 80) throw new Error(`status ${r.status()} body: ${body.slice(0, 200)}`);
  if (/login|sign in/i.test(body.slice(0, 80))) throw new Error('share page asks login');
  if (/commission|brokerage|net price/i.test(body)) throw new Error('private money wording on public page: ' + (body.match(/.{30}(commission|brokerage|net price).{30}/i) || [''])[0]);
  return body.slice(0, 60).replace(/\n/g, ' ');
});
await step(page, '5b.4', 'view counted in My links', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('bottom-more').click();
  await page.getByRole('button', { name: 'Share Kit' }).click();
  await page.getByText('4. My links').waitFor();
  const row = page.locator('tr', { hasText: 'E2E Client' }).first();
  await row.waitFor();
});
console.log('ERRS', page.errs.filter(e => !/Vite|vite|WebSocket|TUNNEL|401/.test(e)).slice(0, 5));
await browser.close(); done();
