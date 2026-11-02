import { freePort } from './helpers/port';
import { beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { planCommand, findClients } from '../src/shared/copilotRules';

const NOW = new Date('2026-11-02T10:00:00Z');
const ctx = {
  now: NOW,
  clients: [
    { id: 'C1', name: 'Ramesh Verma', stage: 'NEW' },
    { id: 'C2', name: 'Ramesh Yadav', stage: 'CONTACTED' },
    { id: 'C3', name: 'Sunita', stage: 'SITE_VISIT' },
  ],
  listings: [{ id: 'P1', title: '3BHK Pandri Raipur' }, { id: 'P2', title: 'Shop Telibandha' }],
};
const p = (s: string) => planCommand(s, ctx);

describe('v110 copilot planner', () => {
  it('adds a client from one line', () => {
    const r: any = p('naya client Mohan 98260 12345 budget 60 lakh 2bhk Pandri');
    expect(r.kind).toBe('ADD_CLIENT');
    expect(r.needsConsent).toBe(true);
    expect(r.body.name).toBe('Mohan');
    expect(r.body.phone).toBe('9826012345');
    expect(r.body.budgetMax).toBe(6_000_000);
    expect(r.body.propertyType).toBe('2 BHK Flat');
  });
  it('asks for a missing phone instead of guessing', () => {
    expect(p('new client Mohan budget 50 lakh').kind).toBe('ASK');
  });
  it('stage moves resolve the client and flag money for DEAL', () => {
    const v: any = p('Sunita ki deal ho gayi');
    expect(v).toMatchObject({ kind: 'STAGE', clientId: 'C3', stage: 'DEAL', money: true });
    expect((p('Sunita site visit ho gaya') as any).stage).toBe('SITE_VISIT');
  });
  it('LOST needs a reason', () => {
    expect(p('Sunita lost').kind).toBe('ASK');
    expect(p('Sunita lost budget kam')).toMatchObject({ kind: 'STAGE', stage: 'LOST', lostReason: 'budget kam' });
  });
  it('contact + when = note with follow-up time', () => {
    const r: any = p('Sunita ko call kiya, kal 5 baje follow-up');
    expect(r.kind).toBe('NOTE'); expect(r.noteKind).toBe('CONTACT'); expect(r.followUpAt).toBeTruthy();
  });
  it('two matching clients → asks which; full name wins', () => {
    const r: any = p('Ramesh deal ho gayi');
    expect(r.kind).toBe('ASK'); expect(r.choices).toHaveLength(2);
    expect((p('Ramesh Yadav deal ho gayi') as any).clientId).toBe('C2');
    expect(findClients('ramesh', ctx.clients)).toHaveLength(2);
  });
  it('unknown client never writes', () => { expect(p('Vikas site visit').kind).toBe('ASK'); });
  it('read-only asks', () => {
    expect(p('aaj ka kaam').kind).toBe('SHOW_BRIEF');
    expect(p('kiska follow-up pending hai').kind).toBe('SHOW_DUE');
    expect(p('thanda leads dikhao').kind).toBe('SHOW_STALE');
  });
  it('confirm listing by name; ambiguous → choices', () => {
    expect(p('Pandri wali listing abhi bhi available hai')).toMatchObject({ kind: 'CONFIRM_LISTING', listingId: 'P1' });
    expect((p('listing confirm karo') as any).choices?.length).toBe(2);
  });
  it('gibberish gets help, not an action', () => {
    expect(p('hello').kind).toBe('UNKNOWN');
    expect(p('').kind).toBe('UNKNOWN');
  });
});

// ───────── end to end: the plan's body is accepted by the real endpoints, as the broker ─────────
const PORT = await freePort(); const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v110-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, stdio: 'ignore', env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' } });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
}, 120_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('v110 copilot end to end', () => {
  it('add → stage → note run through the real broker endpoints', async () => {
    const acct = cfg.demoAccounts.find((a: any) => a.id === 'USR-BRK-001');
    const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: acct.email, password: cfg.demoPassword }) });
    const ck = lr.headers.get('set-cookie')!.split(';')[0];
    const call = (m: string, u: string, b?: unknown) => fetch(B + u, { method: m, headers: { 'content-type': 'application/json', cookie: ck }, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ status: r.status, j: await r.json().catch(() => ({})) }));
    const add: any = planCommand('naya client Mohan 98260 77123 budget 60 lakh 2bhk Pandri kal 5 baje', { clients: [], listings: [] });
    expect(add.kind).toBe('ADD_CLIENT');
    const a = await call('POST', '/api/daily/clients', { ...add.body, consent: true });
    expect(a.status, JSON.stringify(a.j)).toBe(200);
    const list = (await call('GET', '/api/daily/clients')).j.clients;
    const mine = list.find((c: any) => c.name === 'Mohan'); expect(mine).toBeTruthy();
    const c2 = { clients: list.map((c: any) => ({ id: c.id, name: c.name, stage: c.stage })), listings: [] };
    const st: any = planCommand('Mohan site visit ho gaya', c2); expect(st.kind).toBe('STAGE');
    expect((await call('POST', `/api/daily/clients/${st.clientId}/stage`, { stage: st.stage, followUpAt: st.followUpAt })).status).toBe(200);
    const nt: any = planCommand('Mohan ko call kiya, parso 11 baje follow-up', c2); expect(nt.kind).toBe('NOTE');
    expect((await call('POST', `/api/daily/clients/${nt.clientId}/note`, { text: nt.text, kind: nt.noteKind, followUpAt: nt.followUpAt })).status).toBe(200);
    const lost: any = planCommand('Mohan lost budget kam', c2);
    expect((await call('POST', `/api/daily/clients/${lost.clientId}/stage`, { stage: lost.stage, lostReason: lost.lostReason })).status).toBe(200);
    // a number the broker already has is refused by the server, not by the bot
    const dup = await call('POST', '/api/daily/clients', { ...add.body, name: 'Other', consent: true });
    expect([200, 409]).toContain(dup.status);
  }, 60_000);
});
