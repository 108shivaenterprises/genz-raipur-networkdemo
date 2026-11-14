import { freePort } from './helpers/port';
/** v137 — owner and client (buyer / tenant) screens: what they see is theirs, nothing blank, no broker-only tools. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const get = (cookie: string, url: string) => fetch(B + url, { headers: { cookie } });
async function login(role: string) {
  const a = cfg.demoAccounts.find((x: any) => x.role === role && x.verificationStatus === 'VERIFIED');
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, role).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v137-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const role of ['BROKER', 'BUYER_TENANT', 'PROPERTY_OWNER']) jar[role] = await login(role);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('v137 owner + client screens', () => {
  it('the broker-to-broker feed is for members only — not buyers or owners', async () => {
    expect((await get(jar.BROKER, '/api/feed')).status).toBe(200);
    expect((await get(jar.BUYER_TENANT, '/api/feed')).status).toBe(403);
    expect((await get(jar.PROPERTY_OWNER, '/api/feed')).status).toBe(403);
  });
  it('menu: a buyer sees "My needs" and no feed; owner and buyer get no technical audit table', () => {
    const nav = src('src/components/NavigationTabs.tsx');
    expect(nav).toContain("has('requirement:create') && role0 !== 'BUYER_TENANT'");
    expect(nav).toContain("role0 === 'BUYER_TENANT' ? t('nav.myNeeds', 'My needs')");
    expect(nav).toContain("has('audit:read_all', 'audit:read_own') && role0 !== 'BUYER_TENANT' && !isOwner");
    expect(nav).toContain("role === 'BUYER_TENANT' || role === 'PROPERTY_OWNER' || tabs.length > 6");   // a buyer has 5 tabs now — the bottom bar must stay
  });
  it('owner: Deal Desk says so when no offer has come; My Property has no second reach strip and no ID form before he lists himself', () => {
    expect(src('src/components/DealDesk.tsx')).toContain('data-testid="offers-empty"');
    const ol = src('src/components/OwnerListings.tsx');
    expect(ol.match(/<NetworkStrip \/>/g) || []).toHaveLength(0);
    expect(ol).toContain('{d.listings.length > 0 && <VerifySection');
    expect(ol).toContain('homes a broker listed for you are under “My properties” below');
  });
  it('wording: a listing is "Live" (GENZ does not verify homes); the owner sees terms "with your broker"', () => {
    const pv = src('src/components/PropertiesView.tsx');
    expect(pv).toContain("<span>{tx('Live', 'लाइव')}</span>"); expect(pv).not.toContain("<span>{tx('Verified', 'वेरिफ़ाइड')}</span>");
    expect(pv).toContain("'Brokerage terms with your broker'");
    expect(src('src/components/RoleHome.tsx')).toContain('verified} live · ');
  });
  it('v138 — My profile has the photo card (it was only on the ID-card screen)', () => {
    expect(src('src/components/ProfilesView.tsx')).toContain("{c.role !== 'GENZ_CONNECTOR' && <VerifiedPhotoCard />}");
  });
  it('v139 — profile photo and the signed form open the phone chooser (camera OR gallery / PDF), not the camera only', () => {
    expect(src('src/components/VerifiedPhoto.tsx')).not.toContain('capture=');
    expect(src('src/components/ListingDrafts.tsx')).not.toContain('capture=');
  });
});
