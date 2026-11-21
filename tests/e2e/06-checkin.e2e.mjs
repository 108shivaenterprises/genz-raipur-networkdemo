// Journey 6: agency team member site check-in (GPS via context geolocation + selfie via file input; no real camera needed because the selfie control is <input type=file capture>).
import { launch, login, step, shot, done, BASE } from './lib.mjs';
const TEAM = '9000030001@phone.genz.local';
const { browser, page } = await launch({ geolocation: { latitude: 21.2514, longitude: 81.6296, accuracy: 12 }, permissions: ['geolocation'] });
await step(page, '6.1', 'team member logs in and sees Site check-in', async () => {
  await login(page, TEAM);
  await page.getByRole('button', { name: /Site check-in/ }).waitFor();
  await shot(page, '6-1-team-home');
});
await step(page, '6.2', 'open modal; Check in disabled until GPS + selfie + site name', async () => {
  await page.getByRole('button', { name: /Site check-in/ }).click();
  const dlg = page.getByRole('dialog');
  await dlg.waitFor();
  if (!(await dlg.getByRole('button', { name: 'Check in', exact: true }).isDisabled())) throw new Error('Check in enabled too early');
});
await step(page, '6.3', 'GPS: grant location -> "Location captured"', async () => {
  const dlg = page.getByRole('dialog');
  await dlg.getByPlaceholder(/Site \/ project name/).fill('E2E Emerald Heights Site');
  await dlg.getByRole('button', { name: /Location|लोकेशन|GPS|My location/i }).first().click();
  await dlg.getByText(/Location captured/).waitFor();
});
await step(page, '6.4', 'selfie: attach a generated JPEG to the capture input (fake camera not needed)', async () => {
  const dlg = page.getByRole('dialog');
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const x = c.getContext('2d'); x.fillStyle = '#c96'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#222'; x.beginPath(); x.arc(160, 110, 50, 0, 7); x.fill(); return c.toDataURL('image/jpeg', .8).split(',')[1]; });
  await dlg.locator('input[type=file]').setInputFiles({ name: 'selfie.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  await dlg.getByAltText('selfie').waitFor();
});
await step(page, '6.5', 'submit check-in -> success message; server stored GPS', async () => {
  const dlg = page.getByRole('dialog');
  const resp = page.waitForResponse(r => /checkin/i.test(r.url()) && r.request().method() === 'POST');
  await dlg.getByRole('button', { name: 'Check in', exact: true }).click();
  const r = await resp;
  await dlg.getByText(/Checked in/).waitFor();
  await shot(page, '6-5-checked-in');
  const req = JSON.parse(r.request().postData());
  if (Math.abs(req.lat - 21.2514) > 0.001 || Math.abs(req.lng - 81.6296) > 0.001) throw new Error('lat/lng not sent correctly: ' + req.lat + ',' + req.lng);
  return `HTTP ${r.status()} lat=${req.lat} lng=${req.lng} acc=${req.accuracy}`;
});
await step(page, '6.6', 'permission denied path shows a clear message', async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } }); // no geolocation permission
  const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  await login(p, TEAM);
  await p.getByRole('button', { name: /Site check-in/ }).click();
  const dlg = p.getByRole('dialog');
  await dlg.getByRole('button', { name: /Location|लोकेशन|GPS/i }).first().click();
  await dlg.getByText(/Allow location permission|Could not get location/).waitFor();
});
await browser.close(); done();
