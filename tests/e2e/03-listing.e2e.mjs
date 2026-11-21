// Journey 3: add listing via WhatsApp paste and via manual form; verify in property list.
import { launch, login, step, shot, results, done, BROKER, BASE } from './lib.mjs';
const { browser, page } = await launch();
const stamp = String(Date.now()).slice(-5);
const word = [...stamp].map(d => 'abcdefghij'[d]).join(''); // parser strips digits from locality
const waTitleKey = 'Ravi Nagar';
await login(page, BROKER);
await page.getByTestId('bottom-properties').click();
await page.getByTestId('open-wa-drafts').waitFor();

let ownerLink = '';
await step(page, '3a.1', 'WA paste -> draft created', async () => {
  await page.getByTestId('open-wa-drafts').click();
  await page.getByTestId('wa-paste-text').fill(`*3BHK flat for sale* ${waTitleKey} Raipur 1450 sqft 85 L\nOwner Suresh 9876501234`);
  await page.getByTestId('wa-paste-go').click();
  await page.getByTestId('paste-note').waitFor({ timeout: 10000 });
  const t = await page.getByTestId('paste-note').innerText();
  if (!/1 listing draft/.test(t)) throw new Error('paste note: ' + t);
});
await step(page, '3a.2', 'draft opens, fill owner/address/state/area and save', async () => {
  if (!(await page.getByTestId('draft-owner-name').first().isVisible())) await page.locator('li[data-testid^="draft-"]').first().locator('> button').click(); // newest draft may auto-open
  await page.getByTestId('draft-owner-name').waitFor({ timeout: 5000 });
  await page.getByTestId('draft-type').selectOption('Residential Flat');
  await page.getByTestId('draft-state').selectOption('Chhattisgarh');
  await page.getByTestId('draft-owner-name').fill('Suresh Test');
  await page.getByTestId('draft-owner-phone').fill('9876501234');
  await page.getByTestId('draft-address').fill(`Plot 7, ${waTitleKey}, Raipur`);
  await page.getByTestId('terms-net').fill('7500000').catch(() => {});
  await page.getByTestId('draft-save').click();
  await page.waitForTimeout(1000);
});
await step(page, '3a.3', 'ask owner on WhatsApp -> wa.me link produced', async () => {
  // choose brokerage basis, terms
  await page.getByTestId('basis-PERCENTAGE').click().catch(() => {});
  await page.getByTestId('terms-pct').fill('1').catch(() => {});
  await page.getByTestId('terms-agree').check().catch(() => {});
  const ask = page.getByTestId('draft-ask');
  if (await ask.isDisabled()) throw new Error('draft-ask disabled: ' + (await page.locator('[data-testid="terms-problem"], [role=alert]').allInnerTexts()).join(' / '));
  await ask.click();
  const wa = page.locator('a[href*="wa.me"], a[href*="whatsapp.com"]').first();
  await wa.waitFor({ timeout: 10000 });
  const href = await wa.getAttribute('href');
  const dec = decodeURIComponent(href);
  const m = dec.match(/https?:\/\/[^\s]+\/[^\s]*(?:owner|consent|c\/|o\/)[^\s]*/i) || dec.match(/https?:\/\/[^\s]+/);
  ownerLink = m ? m[0] : '';
  if (!ownerLink) throw new Error('no owner link inside wa.me text: ' + dec.slice(0, 200));
  return ownerLink;
});
await step(page, '3a.4', 'owner link public base URL is correct (not localhost:wrong / empty)', async () => {
  if (!ownerLink.startsWith(BASE) && !/^https:\/\//.test(ownerLink)) throw new Error('unexpected base: ' + ownerLink);
  return ownerLink.replace(/\/[^/]*$/, '/…');
});
await step(page, '3a.5', 'owner page opens in new anon context', async () => {
  const ctx2 = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const p2 = await ctx2.newPage();
  const u = ownerLink.replace(/^https?:\/\/[^/]+/, BASE);
  await p2.goto(u, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2500);
  const body = await p2.evaluate(() => document.body.innerText);
  await shot(p2, '3a5-owner-page');
  if (!/Suresh|owner|मालिक|consent|agree/i.test(body)) throw new Error('owner page body: ' + body.slice(0, 200));
  page._owner = p2;
});
await step(page, '3a.6', 'owner agrees on the page', async () => {
  const p2 = page._owner;
  const btns = await p2.$$eval('button', b => b.map(x => x.innerText.trim()).filter(Boolean));
  const agree = p2.getByRole('button', { name: /agree|yes|haan|हाँ|सहमत|confirm/i }).first();
  // owner page may need a checkbox / name / signature
  for (const cb of await p2.locator('input[type=checkbox]').all()) await cb.check().catch(() => {});
  const nameBox = p2.locator('input[type=text]').first();
  if (await nameBox.count()) await nameBox.fill('Suresh Test').catch(() => {});
  await p2.getByPlaceholder(/e\.g\. RP/).fill('ST').catch(() => {});
  await shot(p2, '3a6-owner-before');
  await agree.click({ timeout: 5000 }).catch(e => { throw new Error('no agree button; buttons=' + btns.join(' | ')); });
  await p2.waitForTimeout(2000);
  const body = await p2.evaluate(() => document.body.innerText);
  await shot(p2, '3a6-owner-after');
  if (!/thank|done|recorded|धन्यवाद|agreed|सहमति दर्ज|protected/i.test(body)) throw new Error('after agree: ' + body.slice(0, 250));
});
await step(page, '3a.7', 'publish the draft; listing appears in property list', async () => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('bottom-properties').click();
  await page.getByTestId('open-wa-drafts').click();
  if (!(await page.getByTestId('draft-owner-name').first().isVisible())) await page.locator('li[data-testid^="draft-"]').first().locator('> button').click(); // newest draft may auto-open
  const pub = page.getByTestId('draft-publish');
  await pub.waitFor({ timeout: 8000 });
  await pub.click();
  await page.waitForTimeout(2500);
  await shot(page, '3a7-published');
  await page.getByLabel('Close').first().click().catch(() => {});
  await page.getByPlaceholder(/Title, locality/).fill('Ravi Nagar');
  await page.waitForTimeout(1500);
  const n = await page.getByText(/Ravi Nagar/).count();
  if (!n) throw new Error('listing not found in list after publish');
});

// ---- manual form
const manualTitle = `Manual Flat Test ${stamp}`;
await step(page, '3b.1', 'manual form: fill and register', async () => {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('bottom-properties').click();
  await page.getByRole('button', { name: '+ New property' }).click();
  const f = page.locator('.fixed form');
  await f.getByPlaceholder(/3 BHK flat, east-facing/).fill(manualTitle);
  await f.locator('textarea').first().fill('Test description for e2e: bright flat near park, vastu compliant.');
  await f.locator('select').nth(2).selectOption('Chhattisgarh');
  await f.getByPlaceholder('Pick or type').fill('Raipur');
  await page.getByTestId('loc-locality').fill(`Manual Colony ${stamp}`);
  const nums = f.locator('input[type=number]');
  await nums.nth(0).fill('6500000'); await nums.nth(1).fill('6000000'); await nums.nth(2).fill('1200');
  await f.getByPlaceholder(/Plot 18, Block B/).fill(`Flat 3, Manual Colony ${stamp}, Raipur`);
  const txt = f.locator('input[type=text]');
  const c = await txt.count();
  // last two text inputs are owner name, mobile
  await txt.nth(c - 2).fill('Meena Owner'); await txt.nth(c - 1).fill('9812345678');
  await shot(page, '3b1-manual-filled');
  await f.locator('button[type=submit]').click();
  await page.waitForTimeout(3000);
  await shot(page, '3b1-manual-after');
});
await step(page, '3b.2', 'manual listing visible in list (or in draft/owner-approval flow)', async () => {
  const body = await page.evaluate(() => document.body.innerText);
  const url = page.url();
  // listing either live, or a draft awaiting owner consent (GENZ rule). Report which.
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('bottom-properties').click();
  await page.getByPlaceholder(/Title, locality/).fill(manualTitle);
  await page.waitForTimeout(1500);
  const inList = await page.getByText(manualTitle).count();
  if (inList) return 'in property list';
  await page.getByTestId('open-wa-drafts').click();
  await page.waitForTimeout(1000);
  const inDraft = await page.getByText(new RegExp(manualTitle.slice(0, 20) + '|Manual Colony ' + stamp)).count();
  if (inDraft) return 'NOT in list; present as owner-consent DRAFT (by design: consent first)';
  throw new Error('neither in list nor in drafts; url=' + url + ' body=' + body.slice(0, 200));
});
console.log('ERRS', page.errs.filter(e => !/Vite|vite|WebSocket|TUNNEL|401/.test(e)).slice(0, 5));
await browser.close(); done();
