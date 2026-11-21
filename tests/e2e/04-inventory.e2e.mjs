// Journey 4: CRM -> Inventory: pick each project, matrix/grid renders units, unit sheet opens, counts reconcile.
import { launch, login, step, shot, done, BROKER } from './lib.mjs';
const { browser, page } = await launch();
await login(page, BROKER);
await step(page, '4.1', 'More -> Associates CRM -> Inventory tab opens', async () => {
  await page.getByTestId('bottom-more').click();
  await page.getByRole('button', { name: 'Associates CRM' }).click();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.locator('select').filter({ hasText: /available/ }).first().waitFor();
});
const sel = () => page.locator('select').filter({ hasText: /available/ }).first();
const labels = await sel().locator('option').allInnerTexts().catch(() => []);
console.log('projects:', labels);
for (const [i, lab] of labels.entries()) {
  await step(page, `4.2.${i + 1}`, `project "${lab.slice(0, 40)}": units render and counts match`, async () => {
    await sel().selectOption({ index: i });
    const m = lab.match(/\((\d+)\/(\d+) available\)/);
    const total = m ? +m[2] : 0;
    await page.getByText(`Showing ${total} of ${total}`).waitFor({ timeout: 6000 }); // wait for THIS project (not the previous one)
    const cells = await page.getByTestId('unit-cell').count() + await page.getByTestId('block-chip').count();
    await shot(page, `4-2-${i + 1}-matrix`);
    if (!cells) throw new Error('no unit cells rendered');
    const avail = await page.locator('[data-testid="unit-cell"][data-status="AVAILABLE"]').count();
    if (m && cells !== total) throw new Error(`cells ${cells} != total units ${total}`);
    if (m && avail !== +m[1]) throw new Error(`available cells ${avail} != label ${m[1]}`);
    return `cells=${cells} availableCells=${avail} expectedAvail=${m?.[1]}/${total}`;
  });
}
await step(page, '4.3', 'tap a unit: detail sheet shows status + price, closes', async () => {
  await sel().selectOption({ index: 0 });
  const cell = page.locator('[data-testid="unit-cell"][data-status="AVAILABLE"]').first();
  await cell.click();
  await page.locator('.fixed.inset-0.z-40').waitFor();
  await shot(page, '4-3-unit-sheet');
  const sheet = await page.locator('.fixed.inset-0.z-40').innerText();
  if (!/₹|Price on request/.test(sheet)) throw new Error('no price on sheet: ' + sheet.slice(0, 120));
  await page.locator('.fixed.inset-0.z-40').getByLabel('Close').click();
  await page.locator('.fixed.inset-0.z-40').waitFor({ state: 'detached' });
});
await step(page, '4.4', 'filter chips (Available) change visible cells', async () => {
  const before = await page.getByTestId('unit-cell').count();
  await page.getByRole('button', { name: /Filters/ }).first().click().catch(() => {});
  await page.getByText(/^Booked \/ sold$/).first().click();
  await page.waitForTimeout(500);
  const after = await page.getByTestId('unit-cell').count();
  if (after === before && before > 3) throw new Error(`filter had no effect (${before} -> ${after})`);
  return `${before} -> ${after}`;
});
console.log('ERRS', page.errs.filter(e => !/Vite|vite|WebSocket|TUNNEL|401/.test(e)).slice(0, 5));
await browser.close(); done();
