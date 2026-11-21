// Journey 2: wrong password, login, reload keeps session, logout, session really ended, login again.
import { launch, login, step, shot, done, BROKER, BASE, PW } from './lib.mjs';
const { browser, page } = await launch();
const home = () => page.getByTestId('header-profile').waitFor();
await step(page, '2.1', 'wrong password is rejected with a message', async () => {
  await login(page, BROKER, 'Wrong#Pass1');
  await page.getByText(/Invalid email or password|incorrect|wrong/i).waitFor();
  if (await page.getByTestId('header-profile').count()) throw new Error('logged in with wrong password!');
});
await step(page, '2.2', 'correct login reaches home', async () => { await login(page, BROKER); await home(); });
await step(page, '2.3', 'reload keeps session (HttpOnly cookie)', async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await home(); });
await step(page, '2.4', 'sign out returns to login screen', async () => {
  await page.getByTestId('header-profile').click();
  await page.getByTestId('menu-signout').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign Out' }).click().catch(() => page.getByRole('button', { name: 'Sign Out' }).last().click());
  await page.locator('#login-email').waitFor();
});
await step(page, '2.5', 'after logout API is closed (401) and reload stays on login', async () => {
  const s = await page.evaluate(async () => (await fetch('/api/properties', { credentials: 'include' })).status);
  if (s !== 401 && s !== 403) throw new Error('API after logout returned ' + s);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').waitFor();
  await page.goBack().catch(() => {});
  await page.waitForTimeout(800);
  if (await page.getByTestId('header-profile').count()) throw new Error('back button shows app after logout');
});
await step(page, '2.6', 'login again works (fresh session)', async () => { await login(page, BROKER); await home(); await page.getByTestId('bottom-properties').click(); await page.getByTestId('open-wa-drafts').waitFor(); });
await step(page, '2.7', 'login by 10-digit mobile works (phone sign-in)', async () => {
  await page.getByTestId('header-profile').click(); await page.getByTestId('menu-signout').click(); await page.getByRole('button', { name: 'Sign Out' }).last().click();
  // needs an account with a known phone: use creds printed by 01-signup.e2e.mjs
  if (!process.env.PHONE_LOGIN) return 'skipped (set PHONE_LOGIN=<10-digit> PHONE_PW=<pw>; 01-signup prints creds)';
  await login(page, process.env.PHONE_LOGIN, process.env.PHONE_PW); await home();
});
await browser.close(); done();
