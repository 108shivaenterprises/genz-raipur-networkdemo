// Shared helpers for GENZ e2e scripts. Usage: BASE=http://localhost:3302 node <name>.e2e.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire('/home/claude/work/app/package.json');
export const { chromium } = require('playwright');
export const BASE = process.env.BASE || 'http://localhost:3302';
export const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-claude/ab7d8b00-45dc-598b-be10-ccf191308573/scratchpad/e2e1';
export const PW = 'Genz@2026';
export const BROKER = 'amit.verma@shrikriparealty.in';
fs.mkdirSync(SHOTS, { recursive: true });
export const results = [];
export async function launch(extra = {}) {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, ...extra });
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', e => page.errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page.errs.push('console: ' + m.text().slice(0, 200)); });
  return { browser, ctx, page };
}
export async function shot(page, name) { const p = `${SHOTS}/${name}.png`; await page.screenshot({ path: p, fullPage: false }).catch(() => {}); return p; }
/** Run one step; on failure take screenshot and record FAIL, never throws. */
export async function step(page, id, name, fn) {
  try { const note = await fn(); results.push({ id, name, ok: true, note: note || '' }); console.log('PASS', id, name, note || ''); return true; }
  catch (e) { const s = await shot(page, 'FAIL-' + id.replace(/\W+/g, '_')); results.push({ id, name, ok: false, note: e.message.split('\n')[0].slice(0, 300), shot: s }); console.log('FAIL', id, name, '|', e.message.split('\n')[0].slice(0, 300), '|', s); return false; }
}
export async function login(page, email, pw = PW) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(pw);
  await page.locator('form button').filter({ hasText: /^\s*Sign in\s*$/ }).first().click();
}
export function done() { fs.writeFileSync(`${SHOTS}/results-${process.argv[1].split('/').pop()}.json`, JSON.stringify(results, null, 2)); process.exitCode = results.some(r => !r.ok) ? 1 : 0; }
