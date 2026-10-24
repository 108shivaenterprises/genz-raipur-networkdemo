import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * v62 — Title Check "my open items": what waits on ME across properties —
 *   ISSUE  issues I must resolve (overdue / critical first),
 *   REVIEW checks I verify whose papers are in,
 *   PAPER  papers still missing on my own listing once its deal is live (negotiation / agreement / handover).
 * Only properties whose workspace the person may open.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 7900 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (c: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  expect(a, id).toBeTruthy();
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const PROP = 'PROP-RAI-101'; const DEAL = 'DEAL-2026-001';
let VERIFIER = ''; let ITEM = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v62-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 160; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  const sup = cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').id;
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', B3: 'USR-BRK-003', L1: 'USR-LEGAL-001', ADMIN: 'USR-ADMIN-1', SUP: sup })) jar[k] = await login(id);
}, 90000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

const mine = async (c: string) => { const r = await call(c, 'GET', '/api/due-diligence/mine'); expect(r.status).toBe(200); return j(r); };

describe('my open items in Title Check', () => {
  it('needs a login; a broker outside the property sees nothing of it', async () => {
    expect((await call(undefined, 'GET', '/api/due-diligence/mine')).status).toBe(401);
    const d = await j(await call(jar.B1, 'GET', `/api/due-diligence/property/${PROP}`)); // the checklist is made on first open
    const item = d.items.find((i: any) => i.isApplicable && ['NOT_STARTED', 'PENDING_DOCUMENT'].includes(i.status));
    expect(item).toBeTruthy(); ITEM = item.id; VERIFIER = item.responsibleVerifierId;
    expect((await mine(jar.B3)).items.some((x: any) => x.propertyId === PROP)).toBe(false);
  });
  it('papers on my own listing show only once its deal is live', async () => {
    expect((await mine(jar.B1)).items.some((x: any) => x.kind === 'PAPER' && x.propertyId === PROP)).toBe(false); // deal at "site visit"
    const st = await call(jar.B1, 'POST', `/api/deals/${DEAL}/stage`, { stage: 'Negotiation', notes: 'Price talks started' });
    expect(st.status, await st.clone().text()).toBe(200);
    const m = await mine(jar.B1);
    const p = m.items.filter((x: any) => x.kind === 'PAPER' && x.propertyId === PROP);
    expect(p.length).toBeGreaterThan(0); expect(m.counts.papers).toBe(p.length); expect(p[0].requiredDocument).toBeTruthy();
    expect((await mine(jar.B2)).items.some((x: any) => x.kind === 'PAPER')).toBe(false); // not his listing
  });
  it('a paper uploaded → it waits on its verifier (and leaves my papers list)', async () => {
    const before = (await mine(jar.B1)).counts.papers;
    const up = await call(jar.B1, 'POST', `/api/due-diligence/items/${ITEM}/evidence`, { fileName: 'khasra-b1.pdf', documentType: 'TITLE_DOCUMENT' });
    expect(up.status, await up.clone().text()).toBe(200);
    expect((await mine(jar.B1)).counts.papers).toBe(before - 1);
    const who = Object.entries({ L1: 'USR-LEGAL-001', ADMIN: 'USR-ADMIN-1' }).find(([, id]) => id === VERIFIER)?.[0];
    expect(who, VERIFIER).toBeTruthy();
    const r = (await mine(jar[who!])).items.find((x: any) => x.kind === 'REVIEW' && x.id === ITEM);
    expect(r, who).toBeTruthy(); expect(r.propertyId).toBe(PROP);
  });
  it('an issue I must resolve comes first — overdue before the rest', async () => {
    const mk = (title: string, deadline: string, severity = 'MEDIUM') => call(jar.B1, 'POST', '/api/due-diligence/issues', {
      propertyId: PROP, severity, title, description: 'Found during the title check — needs the owner’s answer.', responsibleResolverId: 'USR-BRK-001', responsibleResolverName: 'Vikramaditya Sharma', deadline, resolutionPlan: 'Ask the owner for the mutation copy.',
    });
    const a = await mk('Mutation copy missing', new Date(Date.now() + 10 * 86400_000).toISOString(), 'LOW');
    expect(a.status, await a.clone().text()).toBe(200);
    const b = await mk('Old mortgage entry in the record', new Date(Date.now() - 2 * 86400_000).toISOString(), 'HIGH');
    expect(b.status, await b.clone().text()).toBe(200);
    const m = await mine(jar.B1);
    expect(m.items[0]).toMatchObject({ kind: 'ISSUE', title: 'Old mortgage entry in the record', overdue: true });
    expect(m.items[1]).toMatchObject({ kind: 'ISSUE', overdue: false });
    expect(m.counts.overdue).toBe(1); expect(m.counts.issues).toBe(2);
    expect((await mine(jar.B3)).items).toEqual([]);
  });
});
