import { freePort } from './helpers/port';
/**
 * v107 — lead inlets: a secret address (hosted form / webhook) that files an enquiry into the owner's CRM as an ordinary lead.
 *   · the pure reader understands whatever field names a form, Zapier or Make sends, cleans the phone, keeps HTML out, never guesses a budget;
 *   · only the verified broker / builder account owns one (not staff, not admin), only for its own project;
 *   · every enquiry goes through the same door as a hand-typed lead (intake switch, duplicate protection) — an inlet adds no way round it;
 *   · consent: a hosted form needs a ticked box, a "no" from a bridge is refused; a robot trap thanks and writes nothing;
 *   · nothing of the customer but a first name and four digits is kept in the log; a re-enquiry adds one line to the owner's OWN lead and nothing to a partner's.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pickFields, cleanPhone, parseConsent, inletNote, formSnippet, INLET_LIMITS, INLET_CHANNELS } from '../src/shared/inletRules';

// ───────────────────────── pure rules ─────────────────────────
describe('reading an enquiry, whatever the sender calls its fields', () => {
  it('a plain form, a Zapier / Make style payload and a split first / last name all land in the same places', () => {
    const a = pickFields({ name: 'Ravi Verma', phone: '98765 43210', email: 'ravi@example.com', message: 'Need 3 BHK' });
    expect(a).toMatchObject({ name: 'Ravi Verma', phone: '98765 43210', email: 'ravi@example.com', message: 'Need 3 BHK' });
    const z = pickFields({ full_name: 'Sita Rao', 'Phone Number': '+91 99999 88888', email_address: 's@x.in', Comments: 'call after 6', Campaign: '99acres', BHK: '2 BHK' });
    expect(z).toMatchObject({ name: 'Sita Rao', phone: '+91 99999 88888', email: 's@x.in', message: 'call after 6', detail: '99acres', unitInterest: '2 BHK' });
    expect(pickFields({ first_name: 'Anil', last_name: 'Kumar', mobile: '9876543210' }).name).toBe('Anil Kumar');
    expect(pickFields({ Mobile_No: '9876543210' }).phone).toBe('9876543210');
  });
  it('other answers (a lead-ad question) are kept as "form answers", capped; the robot trap and the consent box are never among them', () => {
    const f = pickFields({ name: 'A B', phone: '9876543210', city: 'Raipur', 'Preferred time': 'evening', hp_url: '', consent: 'yes', ...Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${i}`, `v${i}`])) });
    expect(f.extras.length).toBe(INLET_LIMITS.extraKeys);
    expect(f.extras.map(e => e[0])).toContain('city');
    expect(f.extras.map(e => e[0].toLowerCase())).not.toContain('consent');
    expect(f.extras.map(e => e[0].toLowerCase())).not.toContain('hp_url');
  });
  it('markup and control characters are taken out, long values are cut', () => {
    const f = pickFields({ name: '<img src=x onerror=alert(1)>Ravi\u0007', phone: '9876543210', message: 'x'.repeat(5000) });
    expect(f.name).not.toMatch(/[<>\u0007]/); expect(f.name).toContain('Ravi');
    expect(f.message.length).toBeLessThanOrEqual(600);
    expect(pickFields(null).name).toBe(''); expect(pickFields([1, 2, 3]).phone).toBe(''); expect(pickFields('hello').name).toBe('');
  });
  it('a Indian mobile is cleaned to ten digits; anything else is empty', () => {
    for (const [raw, want] of [['98765 43210', '9876543210'], ['+91-98765-43210', '9876543210'], ['919876543210', '9876543210'], ['09876543210', '9876543210'], ['(98765) 43210', '9876543210']] as const) expect(cleanPhone(raw), raw).toBe(want);
    for (const raw of ['', '12345', '5876543210', '98765432', '98765432100000', 'abc', null, undefined]) expect(cleanPhone(raw as any), String(raw)).toBe('');
  });
  it('a budget is a number only when it is clearly rupees; "45" or "40 lakh" stay words in the note and are never guessed', () => {
    const rupees = pickFields({ budget: '45,00,000' }); expect(rupees.budget).toBe(4_500_000); expect(rupees.budgetText).toBe('');
    const words = pickFields({ budget: '40 lakh' }); expect(words.budget).toBeUndefined(); expect(words.budgetText).toBe('40 lakh');
    const bare = pickFields({ budget: '45' }); expect(bare.budget).toBeUndefined(); expect(bare.budgetText).toBe('45');
    expect(inletNote('Site', words)).toContain('budget: 40 lakh');
  });
  it('consent: a clear yes / no is read, silence is "not said"', () => {
    for (const y of [true, 'yes', 'YES', 'on', '1', 'true', 'agree', 1]) expect(parseConsent(y), String(y)).toBe(true);
    for (const n of [false, 'no', 'off', '0', 'false', 'declined', 0]) expect(parseConsent(n), String(n)).toBe(false);
    for (const q of [undefined, '', 'maybe', null]) expect(parseConsent(q as any), String(q)).toBeUndefined();
    expect(pickFields({ name: 'A', phone: '9876543210', consent: 'no' }).consent).toBe(false);
    expect(pickFields({ name: 'A', phone: '9876543210' }).consent).toBeUndefined();
  });
  it('the note says where it came from, what was written, the other answers — and fits the lead’s 1000-character limit', () => {
    const f = pickFields({ name: 'A B', phone: '9876543210', message: 'Hello', city: 'Raipur' });
    const n = inletNote('My website', f);
    expect(n).toContain('My website'); expect(n).toContain('Hello'); expect(n).toContain('city: Raipur');
    expect(inletNote('L'.repeat(60), pickFields({ message: 'm'.repeat(600), a: 'x'.repeat(120), b: 'y'.repeat(120), c: 'z'.repeat(120), d: 'w'.repeat(120), e: 'v'.repeat(120) })).length).toBeLessThanOrEqual(INLET_LIMITS.noteMax);
  });
  it('the paste-in form carries a consent box and a robot trap, and escapes what is put into it', () => {
    const h = formSnippet('https://x.test/in/abc', 'Green "Enclave" <b>');
    expect(h).toContain('type="checkbox" name="consent"'); expect(h).toContain('name="hp_url"'); expect(h).toContain('method="post"');
    expect(h).not.toContain('<b>'); expect(h).toContain('&quot;Enclave&quot;');
  });
  it('four channels; only the website one has a hosted form; none claims a portal integration it does not have', () => {
    expect(INLET_CHANNELS.map(c => c.id)).toEqual(['WEBSITE', 'PORTAL', 'META', 'OTHER']);
    expect(INLET_CHANNELS.filter(c => c.kind === 'FORM').map(c => c.id)).toEqual(['WEBSITE']);
  });
});

// ───────────────────────── server ─────────────────────────
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const j = (r: Response) => r.json();
const email = (id: string) => cfg.demoAccounts.find((a: any) => a.id === id).email;
async function login(who: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: who, password: cfg.demoPassword }) });
  expect(r.status, who).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const PLOTS = 'PROJ-RAI-02';

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v107-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true', INLET_DAILY_CAP: '20' },
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await wait(250); }
  expect(cfg).toBeTruthy();
  jar.B1 = await login(email('USR-BRK-001')); jar.B2 = await login(email('USR-BRK-002')); jar.B3 = await login(email('USR-BRK-003'));
  jar.BUILDER = await login(email('USR-BUILDER-001')); jar.BUILDER2 = await login(email('USR-BUILDER-002'));
  jar.SUP = await login(cfg.demoAccounts.find((a: any) => a.role === 'SUPERADMIN').email);
  jar.POOJA = await login('9000030001');
}, 90_000);
afterAll(async () => { proc?.kill('SIGTERM'); await wait(300); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

let seq = 0;
const phone = () => `9${String(800_000_000 + (++seq) * 7919).padStart(9, '0')}`.slice(0, 10);
const mk = async (cookie: string, over: Record<string, unknown> = {}) => { const r = await call(cookie, 'POST', '/api/inlets', { projectId: PLOTS, channel: 'WEBSITE', label: 'Test address', consent: true, ...over }); return { status: r.status, body: await j(r) }; };
const list = async (cookie: string) => (await j(await call(cookie, 'GET', '/api/inlets'))).inlets as any[];
const post = (token: string, body: unknown, opts: { form?: boolean; html?: boolean } = {}) => fetch(`${B}/in/${token}`, {
  method: 'POST',
  headers: { 'content-type': opts.form ? 'application/x-www-form-urlencoded' : 'application/json', ...(opts.html ? { accept: 'text/html,application/xhtml+xml' } : {}) },
  body: opts.form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
});
const leadsOf = async (cookie: string, q = '') => (await j(await call(cookie, 'GET', `/api/crm/leads?projectId=${PLOTS}&limit=500${q ? `&q=${encodeURIComponent(q)}` : ''}`))).leads as any[];
const inletOf = async (cookie: string, id: string) => (await list(cookie)).find(i => i.id === id);

describe('who may own an address', () => {
  it('only the verified broker / builder account itself: no login, staff and admin are refused', async () => {
    expect((await call(undefined, 'GET', '/api/inlets')).status).toBe(401);
    expect((await call(jar.POOJA, 'GET', '/api/inlets')).status).toBe(403);
    expect((await call(jar.SUP, 'GET', '/api/inlets')).status).toBe(403);
    expect((await call(jar.POOJA, 'POST', '/api/inlets', { projectId: PLOTS, channel: 'WEBSITE', label: 'x y', consent: true })).status).toBe(403);
  });
  it('only for a project of his own: a builder’s own, a broker’s with a live mandate — not someone else’s, not without one', async () => {
    expect((await mk(jar.B3)).status).toBe(403);                // no mandate on the plots
    expect((await mk(jar.BUILDER2)).status).toBe(403);         // another builder’s project
    const mine = await j(await call(jar.B1, 'GET', '/api/inlets')); expect(mine.projects.map((p: any) => p.id)).toContain(PLOTS);
    const none = await j(await call(jar.B3, 'GET', '/api/inlets')); expect(none.projects.map((p: any) => p.id)).not.toContain(PLOTS);
    expect((await mk(jar.B1, { projectId: 'PROJ-DOES-NOT-EXIST' })).status).toBe(403);
  });
  it('the owner must state that the people reaching it agreed to be contacted; names and channels are checked', async () => {
    expect((await mk(jar.B1, { consent: false })).status).toBe(400);
    expect((await call(jar.B1, 'POST', '/api/inlets', { projectId: PLOTS, channel: 'WEBSITE', label: 'Site' })).status).toBe(400);
    expect((await mk(jar.B1, { label: 'x' })).status).toBe(400);
    expect((await mk(jar.B1, { channel: 'FAX' })).status).toBe(400);
  });
});

describe('a website form address (hosted form)', () => {
  let inl: any;
  it('is made with a long secret, and only its owner sees it', async () => {
    const r = await mk(jar.B1, { label: 'My site form', sourceDetail: 'Landing page' });
    expect(r.status).toBe(200); inl = r.body.inlet;
    expect(inl.token.length).toBeGreaterThanOrEqual(30); expect(inl.path).toBe(`/in/${inl.token}`); expect(inl).toMatchObject({ kind: 'FORM', hasForm: true, source: 'WEBSITE_ENQUIRY', sourceDetail: 'Landing page', active: true, counts: { received: 0, created: 0, duplicate: 0, rejected: 0 } });
    expect((await list(jar.B1)).some(i => i.id === inl.id)).toBe(true);
    expect((await list(jar.B2)).some(i => i.id === inl.id)).toBe(false);
    expect((await list(jar.BUILDER)).some(i => i.id === inl.id)).toBe(false);
  });
  it('the public page is the project’s own enquiry form: consent box, robot trap, no search engines, nothing of the CRM', async () => {
    const r = await fetch(`${B}/in/${inl.token}`); const h = await r.text();
    expect(r.status).toBe(200); expect(r.headers.get('x-robots-tag')).toMatch(/noindex/); expect(r.headers.get('cache-control')).toMatch(/no-store/);
    expect(h).toContain('data-testid="inlet-form"'); expect(h).toContain('name="consent"'); expect(h).toContain('name="hp_url"'); expect(h).toContain(`/in/${inl.token}`);
    expect(h).toMatch(/Plot|Raipur/i); expect(h).not.toMatch(/<script/i); expect(h).not.toMatch(/commission|brokerage/i);
    expect((await fetch(`${B}/in/${'x'.repeat(32)}`)).status).toBe(404);
    expect((await fetch(`${B}/in/short`)).status).toBe(404);
  });
  it('a form post without the ticked box, or with a bad number, is not taken and the page keeps what he typed', async () => {
    const noBox = await post(inl.token, { name: 'Ravi Kant', phone: '9876543210' }, { form: true, html: true }); const h1 = await noBox.text();
    expect(noBox.status).toBe(422); expect(h1).toContain('data-testid="inlet-err"'); expect(h1).toContain('Ravi Kant');
    const bad = await post(inl.token, { name: 'Ravi "><script>x</script>', phone: '123', consent: 'yes' }, { form: true, html: true }); const h2 = await bad.text();
    expect(bad.status).toBe(422); expect(h2).not.toMatch(/<script>x/); expect(h2).toMatch(/10[- ]digit|10 अंक/);
    expect((await leadsOf(jar.B1, 'Ravi Kant')).length).toBe(0);
    const now = await inletOf(jar.B1, inl.id); expect(now.counts).toMatchObject({ created: 0, rejected: 2 });
  });
  it('a ticked form becomes a lead in the owner’s CRM, filed under the right source, with the inlet as the consent record', async () => {
    const ph = phone();
    const r = await post(inl.token, { name: 'Meena Shah', phone: ph, message: 'Need a 1500 sq ft plot', consent: 'yes' }, { form: true, html: true }); const h = await r.text();
    expect(r.status).toBe(200); expect(h).toContain('data-testid="inlet-thanks"');
    const ls = await leadsOf(jar.B1, 'Meena Shah'); expect(ls.length).toBe(1);
    const l = ls[0];
    expect(l).toMatchObject({ name: 'Meena Shah', source: 'WEBSITE_ENQUIRY', sourceDetail: 'Landing page', associateName: expect.any(String), stage: 'NEW' });
    expect(l.consent.via).toBe('API'); expect(l.activities.map((a: any) => a.note).join('|')).toMatch(/My site form/);
    expect(l.activities.map((a: any) => a.note).join('|')).toMatch(/Need a 1500 sq ft plot/);
    const now = await inletOf(jar.B1, inl.id); expect(now.counts.created).toBe(1); expect(now.log[0]).toMatchObject({ outcome: 'CREATED', who: expect.stringContaining(ph.slice(-4)), leadId: l.id });
    expect(JSON.stringify(now.log)).not.toContain(ph);          // the log never holds the number
    expect(now.log[0].who).not.toContain('Shah');               // …or more than a first name
  });
  it('the same customer again: thanked, no second lead, one line on his lead — and not twice within minutes', async () => {
    const before = (await leadsOf(jar.B1, 'Meena Shah'))[0]; const ph = before.phone;
    const again = await post(inl.token, { name: 'Meena S', phone: ph, consent: 'yes' }, { form: true }); expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ ok: true, status: 'RECEIVED' });
    await post(inl.token, { name: 'Meena S', phone: ph, consent: 'yes' }, { form: true });
    const ls = await leadsOf(jar.B1, 'Meena'); expect(ls.length).toBe(1);
    expect(ls[0].activities.filter((a: any) => /enquired again/.test(a.note)).length).toBe(1);
    expect((await inletOf(jar.B1, inl.id)).counts.duplicate).toBe(2);
  });
  it('a robot that fills the hidden box is thanked and nothing is made', async () => {
    const r = await post(inl.token, { name: 'Robo Bot', phone: phone(), consent: 'yes', hp_url: 'http://spam.example' }, { form: true });
    expect(r.status).toBe(200); expect((await leadsOf(jar.B1, 'Robo Bot')).length).toBe(0);
    expect((await inletOf(jar.B1, inl.id)).log[0].why).toMatch(/trap/i);
  });
  it('browsers on other sites may post (CORS preflight) — the secret is the key, no cookies are used', async () => {
    const pre = await fetch(`${B}/in/${inl.token}`, { method: 'OPTIONS', headers: { origin: 'https://builder-site.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    expect(pre.status).toBe(204); expect(pre.headers.get('access-control-allow-origin')).toBe('*'); expect(pre.headers.get('access-control-allow-methods')).toMatch(/POST/);
    const p = await post(inl.token, { name: 'Cors Person', phone: phone(), consent: true }); expect(p.headers.get('access-control-allow-origin')).toBe('*');
  });
  it('a pause stops it at once and the public page says it is closed; switching on again restores it', async () => {
    expect((await call(jar.B1, 'PUT', `/api/inlets/${inl.id}`, { active: false })).status).toBe(200);
    expect((await fetch(`${B}/in/${inl.token}`)).status).toBe(404);
    expect((await post(inl.token, { name: 'Late Person', phone: phone(), consent: true })).status).toBe(404);
    expect((await leadsOf(jar.B1, 'Late Person')).length).toBe(0);
    expect((await call(jar.B1, 'PUT', `/api/inlets/${inl.id}`, { active: true })).status).toBe(200);
    expect((await fetch(`${B}/in/${inl.token}`)).status).toBe(200);
  });
  it('a new secret kills the old address on the spot', async () => {
    const old = inl.token;
    const r = await j(await call(jar.B1, 'POST', `/api/inlets/${inl.id}/rotate`));
    expect(r.inlet.token).not.toBe(old); expect(r.inlet.rotatedAt).toBeTruthy();
    expect((await fetch(`${B}/in/${old}`)).status).toBe(404);
    expect((await post(old, { name: 'Old Link', phone: phone(), consent: true })).status).toBe(404);
    expect((await fetch(`${B}/in/${r.inlet.token}`)).status).toBe(200);
    inl = r.inlet;
  });
  it('someone else cannot change, test, rotate or delete it', async () => {
    for (const [m, u, b] of [['PUT', `/api/inlets/${inl.id}`, { active: false }], ['POST', `/api/inlets/${inl.id}/rotate`, undefined], ['POST', `/api/inlets/${inl.id}/test`, undefined], ['DELETE', `/api/inlets/${inl.id}`, undefined], ['GET', `/api/inlets/snippet/${inl.id}`, undefined]] as const) {
      expect((await call(jar.B2, m, u, b)).status, `${m} ${u}`).toBe(404);
      expect((await call(jar.BUILDER, m, u, b)).status, `${m} ${u} builder`).toBe(404);
    }
  });
  it('the paste-in form for his own website points at his address', async () => {
    const s = await j(await call(jar.B1, 'GET', `/api/inlets/snippet/${inl.id}`));
    expect(s.html).toContain(`${B}/in/${inl.token}`); expect(s.html).toContain('name="consent"');
  });
});

describe('a bridge address (Zapier / Make / portal e-mail parser)', () => {
  let hook: any;
  it('its GET says POST only; it takes JSON with the sender’s own field names', async () => {
    hook = (await mk(jar.B1, { channel: 'PORTAL', label: '99acres via Zapier' })).body.inlet;
    expect(hook).toMatchObject({ kind: 'WEBHOOK', hasForm: false, source: 'PROPERTY_PORTAL' });
    const g = await fetch(`${B}/in/${hook.token}`); expect(g.status).toBe(405); expect(g.headers.get('allow')).toMatch(/POST/);
    const ph = phone();
    const r = await post(hook.token, { full_name: 'Kavita Joshi', 'Phone Number': `+91 ${ph.slice(0, 5)} ${ph.slice(5)}`, email_address: 'kavita@example.com', Comments: 'Saw it on 99acres', Campaign: '99acres', budget: '40 lakh', city: 'Raipur' });
    expect(r.status).toBe(200); expect(await r.json()).toMatchObject({ ok: true, status: 'RECEIVED' });
    const l = (await leadsOf(jar.B1, 'Kavita'))[0];
    expect(l).toMatchObject({ name: 'Kavita Joshi', source: 'PROPERTY_PORTAL', sourceDetail: '99acres', email: 'kavita@example.com' });
    expect(l.activities.map((a: any) => a.note).join('|')).toMatch(/budget: 40 lakh/); expect(l.activities.map((a: any) => a.note).join('|')).toMatch(/city: Raipur/);
    expect(l.budgetMax).toBeUndefined();
  });
  it('a bridge without a consent field stands on the owner’s statement; a clear "no" is refused', async () => {
    const ok = await post(hook.token, { name: 'Silent Consent', phone: phone() }); expect(ok.status).toBe(200);
    const no = await post(hook.token, { name: 'Said No', phone: phone(), consent: 'no' }); expect(no.status).toBe(422);
    expect((await leadsOf(jar.B1, 'Said No')).length).toBe(0);
  });
  it('no number is refused with 422; no name gets a placeholder; a bad e-mail is dropped, not fatal', async () => {
    expect((await post(hook.token, { name: 'No Number' })).status).toBe(422);
    const ph = phone();
    expect((await post(hook.token, { phone: ph, email: 'not-an-email' })).status).toBe(200);
    const l = (await leadsOf(jar.B1, `Enquiry ${ph.slice(-4)}`))[0]; expect(l).toBeTruthy(); expect(l.email).toBeFalsy();
  });
  it('markup in a name never reaches the CRM', async () => {
    const ph = phone();
    await post(hook.token, { name: '<img src=x onerror=alert(1)>Hacker Name', phone: ph });
    const l = (await leadsOf(jar.B1, 'Hacker Name'))[0]; expect(l).toBeTruthy(); expect(l.name).not.toMatch(/[<>]/);
  });
  it('a builder’s intake switch stops a broker’s address with 423, exactly as it stops the broker’s own form; the test button says so; opening it again restores it', async () => {
    expect((await call(jar.BUILDER, 'PUT', `/api/pcontrol/builder/projects/${PLOTS}/settings`, { leadIntake: 'PAUSED', intakeNote: 'Site visit week' })).status).toBe(200);
    const r = await post(hook.token, { name: 'Paused Person', phone: phone() }); expect(r.status).toBe(423); expect((await j(r)).code).toBe('INTAKE_PAUSED');
    expect((await leadsOf(jar.B1, 'Paused Person')).length).toBe(0);
    const t = await j(await call(jar.B1, 'POST', `/api/inlets/${hook.id}/test`)); expect(t).toMatchObject({ ok: false, code: 'INTAKE_PAUSED' }); expect(t.why).toMatch(/paused/i);
    expect((await call(jar.BUILDER, 'PUT', `/api/pcontrol/builder/projects/${PLOTS}/settings`, { leadIntake: 'OPEN' })).status).toBe(200);
    expect((await j(await call(jar.B1, 'POST', `/api/inlets/${hook.id}/test`))).ok).toBe(true);
    expect((await post(hook.token, { name: 'Reopened Person', phone: phone() })).status).toBe(200);
  });
  it('the test button runs the real rules but makes no lead and counts nothing', async () => {
    const before = await inletOf(jar.B1, hook.id); const n = (await leadsOf(jar.B1)).length;
    for (let i = 0; i < 3; i++) expect((await j(await call(jar.B1, 'POST', `/api/inlets/${hook.id}/test`))).ok).toBe(true);
    expect((await leadsOf(jar.B1)).length).toBe(n);
    const after = await inletOf(jar.B1, hook.id); expect(after.counts).toEqual(before.counts); expect(after.todayCount).toBe(before.todayCount);
    await call(jar.B1, 'PUT', `/api/inlets/${hook.id}`, { active: false });
    expect(await j(await call(jar.B1, 'POST', `/api/inlets/${hook.id}/test`))).toMatchObject({ ok: false });
    await call(jar.B1, 'PUT', `/api/inlets/${hook.id}`, { active: true });
  });
  it('one address takes only so many tries a day; the owner is told once and the rest are refused', async () => {
    const small = (await mk(jar.B1, { channel: 'OTHER', label: 'Cap test' })).body.inlet;
    expect(small.dailyCap).toBe(20);
    const codes: number[] = [];
    for (let i = 0; i < 23; i++) codes.push((await post(small.token, { name: `Cap Person ${i}`, phone: phone() })).status);
    expect(codes.slice(0, 20).every(c => c === 200)).toBe(true); expect(codes.slice(20)).toEqual([429, 429, 429]);
    const now = await inletOf(jar.B1, small.id); expect(now.counts.created).toBe(20); expect(now.log.filter((x: any) => x.outcome === 'LIMIT').length).toBe(1);
  });
});

describe('a builder’s own address', () => {
  let mine: any; let partnerPhone: string;
  it('files a lead on the builder’s desk (no partner), and an enquiry never writes into a partner’s timeline', async () => {
    mine = (await mk(jar.BUILDER, { channel: 'META', label: 'Instagram ads' })).body.inlet;
    expect(mine).toMatchObject({ source: 'DIGITAL_CAMPAIGN', sourceDetail: 'Meta Lead Ads' });
    const ph = phone();
    expect((await post(mine.token, { full_name: 'Direct Buyer', phone_number: ph })).status).toBe(200);
    const l = (await leadsOf(jar.BUILDER, 'Direct Buyer'))[0]; expect(l).toMatchObject({ source: 'DIGITAL_CAMPAIGN', associateId: '' });
    expect((await leadsOf(jar.B1, 'Direct Buyer')).length).toBe(0);                // a partner never sees the builder’s own lead
    // the same number was already registered by B1 → the builder’s address does not touch B1’s lead
    partnerPhone = phone();
    const reg = await call(jar.B1, 'POST', '/api/crm/leads', { consent: true, projectId: PLOTS, name: 'Partner Lead', phone: partnerPhone, source: 'ASSOCIATE_REFERRAL' }); expect(reg.status).toBe(200);
    const before = (await leadsOf(jar.B1, 'Partner Lead'))[0];
    const dup = await post(mine.token, { name: 'Partner Lead', phone: partnerPhone }); expect(dup.status).toBe(200); expect(await dup.json()).toMatchObject({ ok: true, status: 'RECEIVED' });
    const after = (await leadsOf(jar.B1, 'Partner Lead'))[0];
    expect(after.activities.length).toBe(before.activities.length);
    expect((await inletOf(jar.BUILDER, mine.id)).log[0]).toMatchObject({ outcome: 'DUPLICATE' });
  });
  it('the builder’s intake switch does not stop his own address, only his partners’', async () => {
    await call(jar.BUILDER, 'PUT', `/api/pcontrol/builder/projects/${PLOTS}/settings`, { leadIntake: 'PAUSED' });
    expect((await post(mine.token, { name: 'Builder During Pause', phone: phone() })).status).toBe(200);
    await call(jar.BUILDER, 'PUT', `/api/pcontrol/builder/projects/${PLOTS}/settings`, { leadIntake: 'OPEN' });
  });
  it('at most ten addresses per owner; deleting one frees a place and kills its link', async () => {
    const made: any[] = [mine];
    for (let i = made.length; i < INLET_LIMITS.perOwner; i++) { const r = await mk(jar.BUILDER, { channel: 'OTHER', label: `Extra ${i}` }); expect(r.status, String(i)).toBe(200); made.push(r.body.inlet); }
    const over = await mk(jar.BUILDER, { channel: 'OTHER', label: 'One too many' }); expect(over.status).toBe(409); expect(over.body.error).toMatch(/10/);
    expect((await call(jar.BUILDER, 'DELETE', `/api/inlets/${made[1].id}`)).status).toBe(200);
    expect((await fetch(`${B}/in/${made[1].token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(404);
    expect((await mk(jar.BUILDER, { channel: 'OTHER', label: 'Fits again' })).status).toBe(200);
  });
});
