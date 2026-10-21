import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import crypto from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PROP_DOC_TYPES, matchesQuery, sniffMime, normSearch } from '../src/shared/propDocs.js';
import { PERMISSION_CATALOG, ROLE_PERMISSIONS } from '../server/permissions.js';

/**
 * v16.6 — Property Papers library: real PDF / photo papers kept on the server, searchable, private by default,
 * shared by name, every open logged, linked to due-diligence evidence, deleted for real.
 */
const PORT = 5200 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess;
let dir: string;
let cfg: any;
const jar: Record<string, string> = {};
const root = path.resolve(import.meta.dirname, '..');
const PROP = 'PROP-RAI-101'; // owner USR-OWNER-001 · listing broker B1 · deal room with B2

const pdf = (text = 'registry') => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n% ${text}\ntrailer<<>>\n%%EOF\n`);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

async function login(email: string) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: cfg.demoPassword }) });
  expect(r.status).toBe(200);
  return r.headers.get('set-cookie')!.split(';')[0];
}
const call = (cookie: string | undefined, method: string, url: string, body?: unknown) =>
  fetch(B + url, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
const acct = (role: string, i = 0) => cfg.demoAccounts.filter((a: any) => a.role === role && a.verificationStatus === 'VERIFIED')[i];
const upload = (cookie: string, over: Record<string, unknown> = {}, buf: Buffer = pdf()) =>
  call(cookie, 'POST', '/api/property-docs', { propertyId: PROP, type: 'SALE_DEED', title: 'Plot 14 original', fileName: 'plot14.pdf', data: buf.toString('base64'), attest: true, ...over });
const list = async (cookie: string, qs = '') => (await (await call(cookie, 'GET', `/api/property-docs${qs}`)).json()).docs as any[];
const fileStatus = async (cookie: string, id: string, dl = false) => (await call(cookie, 'GET', `/api/property-docs/${id}/file${dl ? '?dl=1' : ''}`)).status;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v166-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], {
    cwd: dir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  expect(cfg).toBeTruthy();
  expect(acct('PROPERTY_OWNER').id).toBe('USR-OWNER-001');
  jar.ADMIN = await login(acct('ADMIN').email);
  jar.OWNER = await login(acct('PROPERTY_OWNER').email);
  jar.B1 = await login('vikram.realty@gmail.com');
  jar.B2 = await login('amit.verma@shrikriparealty.in');
  jar.B3 = await login('priya@nayaraipurrealty.com');
  jar.B4 = await login('rohit@cghomes.co.in');
  jar.LEGAL = await login(acct('LEGAL_COUNSEL').email);
  jar.BUYER = await login(acct('BUYER_TENANT').email);
}, 60_000);

afterAll(() => { proc?.kill(); if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }); });

describe('the shared rules', () => {
  it('reads the real bytes of a file, not its name', () => {
    expect(sniffMime(pdf())).toBe('application/pdf');
    expect(sniffMime(png())).toBe('image/png');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffMime(Buffer.from('MZ\u0090\u0000'))).toBeNull();
  });
  it('search needs every word, in English or Hindi', () => {
    expect(matchesQuery('Sale deed registry रजिस्ट्री Shankar Nagar', 'registry nagar')).toBe(true);
    expect(matchesQuery('Sale deed registry रजिस्ट्री Shankar Nagar', 'रजिस्ट्री')).toBe(true);
    expect(matchesQuery('Sale deed registry', 'registry khasra')).toBe(false);
    expect(normSearch('खसरा-142/3')).toBe('खसरा 142 3');
    expect(PROP_DOC_TYPES.every(t => t.en && t.hi && t.words)).toBe(true);
  });
  it('the permission is on the right roles only', () => {
    expect(PERMISSION_CATALOG).toHaveProperty('propdoc:use');
    for (const r of ['BROKER', 'PROPERTY_OWNER', 'LEGAL_COUNSEL', 'ADMIN', 'SUPERADMIN'] as const) expect(ROLE_PERMISSIONS[r]).toContain('propdoc:use');
    for (const r of ['BUYER_TENANT', 'CONTRACTOR', 'GENZ_CONNECTOR', 'TEAM_MEMBER', 'DEVELOPER_BUILDER'] as const) expect(ROLE_PERMISSIONS[r]).not.toContain('propdoc:use');
  });
});

describe('uploading', () => {
  it('stores a real PDF on the server and records its fingerprint', async () => {
    const buf = pdf('first');
    const r = await upload(jar.B1, { title: 'Plot 14 original', refNo: 'Reg 4921/2014' }, buf);
    expect(r.status).toBe(200);
    const d = (await r.json()).doc;
    expect(d.size).toBe(buf.length);
    expect(d.sha256).toBe(sha(buf));
    expect(d.visibility).toBe('PRIVATE');
    expect(d.mime).toBe('application/pdf');
    expect(existsSync(path.join(dir, 'data', 'propdocs', `${d.id}.bin`))).toBe(true);
    expect(readFileSync(path.join(dir, 'data', 'propdocs', `${d.id}.bin`)).equals(buf)).toBe(true);
  });
  it('refuses anything that is not a PDF / JPEG / PNG / WebP, whatever it is called', async () => {
    expect((await upload(jar.B1, { fileName: 'virus.pdf' }, Buffer.from('<html><script>alert(1)</script></html>'))).status).toBe(415);
    expect((await upload(jar.B1, { fileName: 'tool.exe' }, Buffer.from('MZ\u0090\u0000\u0003'))).status).toBe(415);
    expect((await upload(jar.B1, { data: '' })).status).toBe(400);
  });
  it('refuses a file over 10 MB and an upload without the owner confirmation', async () => {
    const huge = Buffer.concat([pdf(), Buffer.alloc(10.5 * 1024 * 1024, 1)]);
    expect((await upload(jar.B1, {}, huge)).status).toBe(413);
    const r = await upload(jar.B1, { attest: false });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/confirm/i);
  });
  it('only the owner / listing broker (or admin) can keep papers on a property; other roles cannot even open the library', async () => {
    expect((await upload(jar.B3)).status).toBe(403);
    expect((await upload(jar.B2)).status).toBe(403); // a deal partner is not a principal
    expect((await upload(jar.OWNER, { title: 'Owner copy', fileName: 'own.png' }, png())).status).toBe(200);
    expect((await upload(jar.ADMIN, { title: 'Admin copy' })).status).toBe(200);
    expect((await call(jar.BUYER, 'GET', '/api/property-docs')).status).toBe(403);
    expect((await call(undefined, 'GET', '/api/property-docs')).status).toBe(401);
    expect((await call(jar.BUYER, 'POST', '/api/property-docs', {})).status).toBe(403);
  });
});

describe('who can open a paper', () => {
  let id = '';
  beforeAll(async () => { id = (await (await upload(jar.B1, { title: 'Secret deed', refNo: 'SEC-1' }, pdf('secret'))).json()).doc.id; });

  it('private by default: uploader, owner, listing broker and admin only', async () => {
    for (const k of ['B1', 'OWNER', 'ADMIN']) expect(await fileStatus(jar[k], id)).toBe(200);
    for (const k of ['B2', 'B3', 'LEGAL']) expect(await fileStatus(jar[k], id)).toBe(404);
    expect(await fileStatus(jar.BUYER, id)).toBe(403);
    for (const k of ['B2', 'B3', 'LEGAL']) expect((await list(jar[k])).some(d => d.id === id)).toBe(false);
    for (const k of ['B1', 'OWNER']) expect((await list(jar[k])).some(d => d.id === id)).toBe(true);
  });
  it('serves the exact bytes with safe headers; ?dl=1 forces a download', async () => {
    const r = await call(jar.OWNER, 'GET', `/api/property-docs/${id}/file`);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toMatch(/no-store/);
    expect(r.headers.get('content-disposition')).toMatch(/^inline/);
    expect(Buffer.from(await r.arrayBuffer()).equals(pdf('secret'))).toBe(true);
    expect((await call(jar.OWNER, 'GET', `/api/property-docs/${id}/file?dl=1`)).headers.get('content-disposition')).toMatch(/^attachment/);
  });
  it('a deal partner sees it only when the uploader chooses "deal partners"; the whole network only when chosen too', async () => {
    // a paper you can't even see answers 404 (no hint that it exists)
    expect((await call(jar.B2, 'PATCH', `/api/property-docs/${id}`, { visibility: 'DEAL_PARTICIPANTS' })).status).toBe(404);
    expect((await call(jar.B1, 'PATCH', `/api/property-docs/${id}`, { visibility: 'DEAL_PARTICIPANTS' })).status).toBe(200);
    expect(await fileStatus(jar.B2, id)).toBe(200);
    expect(await fileStatus(jar.B3, id)).toBe(404);
    expect(await fileStatus(jar.B2, id, true)).toBe(200);
    await call(jar.B1, 'PATCH', `/api/property-docs/${id}`, { visibility: 'VERIFIED_BROKERS' });
    expect(await fileStatus(jar.B3, id)).toBe(200);
    expect(await fileStatus(jar.LEGAL, id)).toBe(404); // not a broker, not shared
    await call(jar.B1, 'PATCH', `/api/property-docs/${id}`, { visibility: 'PRIVATE' });
    expect(await fileStatus(jar.B3, id)).toBe(404);
    expect(await fileStatus(jar.B2, id)).toBe(404);
  });
  it('sharing by name works, can be removed, and a viewer cannot re-share or edit', async () => {
    const people = (await (await call(jar.B1, 'GET', `/api/property-docs/${id}/people`)).json()).people as any[];
    expect(people.some(p => p.id === 'USR-BRK-002' && p.inDeal)).toBe(true);
    expect(people.every(p => !('phone' in p) && !('email' in p))).toBe(true);
    expect(people.some(p => p.role === 'BUYER_TENANT' || p.role === 'ADMIN')).toBe(false);
    const sh = await call(jar.B1, 'POST', `/api/property-docs/${id}/share`, { userIds: ['USR-BRK-003', 'USR-BUYER-001', 'NOPE'], expiresInDays: 7 });
    expect(sh.status).toBe(200);
    expect((await sh.json()).shared).toBe(1); // the buyer and the made-up id are ignored
    expect(await fileStatus(jar.B3, id)).toBe(200);
    expect((await list(jar.B3, '?scope=shared')).some(d => d.id === id)).toBe(true);
    expect((await call(jar.B3, 'POST', `/api/property-docs/${id}/share`, { userIds: ['USR-BRK-004'] })).status).toBe(403);
    expect((await call(jar.B3, 'PATCH', `/api/property-docs/${id}`, { title: 'hacked' })).status).toBe(403);
    expect((await call(jar.B3, 'DELETE', `/api/property-docs/${id}`)).status).toBe(403);
    expect((await call(jar.B3, 'GET', `/api/property-docs/${id}/log`)).status).toBe(403);
    // the viewer's own copy of the record does not expose who else has access
    expect((await list(jar.B3)).find(d => d.id === id).shares).toBeUndefined();
    expect((await call(jar.B1, 'POST', `/api/property-docs/${id}/revoke`, { userId: 'USR-BRK-003' })).status).toBe(200);
    expect(await fileStatus(jar.B3, id)).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/property-docs/${id}/revoke`, { userId: 'USR-BRK-003' })).status).toBe(404);
  });
  it('every open, download and refused attempt is logged — including a GENZ admin', async () => {
    await fileStatus(jar.ADMIN, id);
    await fileStatus(jar.B2, id); // refused
    const log = (await (await call(jar.B1, 'GET', `/api/property-docs/${id}/log`)).json()).log as any[];
    expect(log.some(l => l.action === 'VIEW' && l.note === 'GENZ admin')).toBe(true);
    expect(log.some(l => l.action === 'DENIED')).toBe(true);
    expect(log.some(l => l.action === 'SHARE') && log.some(l => l.action === 'REVOKE')).toBe(true);
    expect((await call(jar.OWNER, 'GET', `/api/property-docs/${id}/log`)).status).toBe(200); // the owner can read it too
  });
});

describe('searching', () => {
  beforeAll(async () => {
    await upload(jar.B1, { type: 'KHASRA_B1', title: 'Nakal', refNo: 'खसरा 142/3', tags: ['original', 'Plot14'], note: 'Tehsil copy', fileName: 'nakal.pdf' }, pdf('khasra'));
    await upload(jar.B1, { type: 'TAX_RECEIPT', title: 'Receipt 2025', fileName: 'tax.png' }, png());
  });
  it('finds by title, type words (English and Hindi), number, tag, note and the property’s locality', async () => {
    const t = async (q: string) => (await list(jar.B1, `?q=${encodeURIComponent(q)}`)).map(d => d.title);
    expect(await t('registry')).toContain('Plot 14 original');            // type words
    expect(await t('रजिस्ट्री')).toContain('Plot 14 original');           // Hindi type word
    expect(await t('4921')).toContain('Plot 14 original');                // reference number
    expect(await t('khasra 142')).toContain('Nakal');                     // type + Hindi number
    expect(await t('खसरा')).toContain('Nakal');
    expect(await t('plot14')).toContain('Nakal');                         // tag
    expect(await t('tehsil')).toContain('Nakal');                         // note
    expect(await t('tax')).toContain('Receipt 2025');                     // file name / type
    expect((await t('shankar')).length).toBeGreaterThanOrEqual(3);        // property locality
    expect(await t('registry khasra')).toEqual([]);                       // every word must match
    expect(await t('zzzz-nothing')).toEqual([]);
    expect((await list(jar.B1, '?type=KHASRA_B1')).every(d => d.type === 'KHASRA_B1')).toBe(true);
    expect((await list(jar.B1, `?propertyId=${PROP}`)).every(d => d.propertyId === PROP)).toBe(true);
    expect(await list(jar.B1, '?propertyId=PROP-NOPE')).toEqual([]);
  });
  it('a person it was shared with can search, but the owner’s name is not searchable for them', async () => {
    const all = await list(jar.B1);
    const nak = all.find(d => d.title === 'Nakal');
    await call(jar.B1, 'POST', `/api/property-docs/${nak.id}/share`, { userIds: ['USR-BRK-003'] });
    expect((await list(jar.B3, '?q=khasra')).some(d => d.id === nak.id)).toBe(true);
    expect((await list(jar.B3, '?q=lalwani')).length).toBe(0);
    expect((await list(jar.OWNER, '?q=lalwani')).length).toBeGreaterThan(0); // the principals can
  });
});

describe('due diligence uses the stored copy', () => {
  let item = '';
  beforeAll(async () => { item = (await (await call(jar.B1, 'GET', `/api/due-diligence/property/${PROP}`)).json()).items[0].id; });

  it('evidence linked to an uploaded paper carries its real size, type and fingerprint and opens the stored file', async () => {
    const buf = pdf('dd-evidence');
    const up = await (await upload(jar.B1, { ddItemId: item, title: 'Title deed (evidence)' }, buf)).json();
    const ev = await call(jar.B1, 'POST', `/api/due-diligence/items/${item}/evidence`, {
      fileName: 'plot14.pdf', documentType: 'TITLE_DEED', accessScope: 'OWNER_AND_ADMIN_ONLY', libraryDocId: up.doc.id, contentSha256: 'a'.repeat(64), fileSizeBytes: 1,
    });
    expect(ev.status).toBe(200);
    const e = (await ev.json()).evidence;
    expect(e.libraryDocId).toBe(up.doc.id);
    expect(e.fileUrl).toBe(`/api/property-docs/${up.doc.id}/file`);
    expect(e.checksumSha256).toBe(sha(buf));
    expect(e.fileSizeBytes).toBe(buf.length);
    expect(e.mimeType).toBe('application/pdf');
    // legal counsel reviews due diligence, so they can open DD evidence; a deal partner cannot (restricted scope)
    expect(await fileStatus(jar.LEGAL, up.doc.id)).toBe(200);
    expect(await fileStatus(jar.B2, up.doc.id)).toBe(404);
    // widening the evidence to deal participants widens the stored copy to the same people
    const up2 = await (await upload(jar.B1, { ddItemId: item, title: 'Deal partners may see' }, pdf('dd2'))).json();
    await call(jar.B1, 'POST', `/api/due-diligence/items/${item}/evidence`, { fileName: 'x.pdf', accessScope: 'DEAL_PARTICIPANTS_ONLY', libraryDocId: up2.doc.id });
    expect(await fileStatus(jar.B2, up2.doc.id)).toBe(200);
    expect(await fileStatus(jar.B3, up2.doc.id)).toBe(404);
  });
  it('cannot link somebody else’s paper or one from another property; a stranger cannot attach evidence', async () => {
    const mine = (await list(jar.B1)).find(d => d.title === 'Secret deed');
    expect((await call(jar.B2, 'POST', `/api/due-diligence/items/${item}/evidence`, { fileName: 'x.pdf', libraryDocId: mine.id })).status).toBe(404);
    expect((await call(jar.B1, 'POST', `/api/due-diligence/items/${item}/evidence`, { fileName: 'x.pdf', libraryDocId: 'PD-NOPE' })).status).toBe(404);
    expect((await upload(jar.B3, { ddItemId: item })).status).toBe(403);
    expect((await upload(jar.B1, { ddItemId: 'DD-NOPE' })).status).toBe(404);
  });
  it('the old "record a link only" path still works for people who have no file', async () => {
    const r = await call(jar.B1, 'POST', `/api/due-diligence/items/${item}/evidence`, { fileName: 'Drive link', fileUrl: 'https://example.com/a.pdf' });
    expect(r.status).toBe(200);
    expect((await r.json()).evidence.libraryDocId).toBeUndefined();
  });
});

describe('deleting for real', () => {
  it('removes the file from the server for everyone; only a manager can', async () => {
    const id = (await (await upload(jar.B1, { title: 'To delete' }, pdf('bye'))).json()).doc.id;
    const f = path.join(dir, 'data', 'propdocs', `${id}.bin`);
    expect(existsSync(f)).toBe(true);
    expect((await call(jar.B3, 'DELETE', `/api/property-docs/${id}`)).status).toBe(404);
    expect((await call(jar.B1, 'DELETE', `/api/property-docs/${id}`)).status).toBe(200);
    expect(existsSync(f)).toBe(false);
    expect(await fileStatus(jar.OWNER, id)).toBe(404);
    expect((await list(jar.OWNER)).some(d => d.id === id)).toBe(false);
  });
  it('a DPDP erasure request deletes the member’s papers from the disk', async () => {
    const mk = await call(jar.B3, 'POST', '/api/properties', {
      title: 'Erasure test flat in Pune', description: 'A flat used to test that erasure removes papers.',
      propertyType: 'Residential Flat', transactionType: 'Sale', state: 'Maharashtra', city: 'Pune', locality: 'Baner',
      pincode: '411045', addressHidden: 'Flat 9, Test Society, Baner, Pune', askingPrice: 9500000, ownerApprovedNetPrice: 9000000,
      ownerName: 'Someone Else', ownerPhone: '9876500012', tags: ['Gated Society'],
    });
    const mkBody = await mk.json();
    expect([200, 201], JSON.stringify(mkBody)).toContain(mk.status);
    const pid = mkBody.property.id;
    const up = await (await upload(jar.B3, { propertyId: pid, title: 'B3 paper' }, pdf("b3"))).json();
    const f = path.join(dir, 'data', 'propdocs', `${up.doc.id}.bin`);
    expect(existsSync(f)).toBe(true);
    const req = await (await call(jar.B3, 'POST', '/api/privacy/requests', { type: 'ERASURE' })).json();
    expect(req.success).toBe(true);
    const done = await call(jar.ADMIN, 'POST', `/api/privacy/requests/${req.request.id}/resolve`, { decision: 'COMPLETE' });
    expect(done.status).toBe(200);
    expect(existsSync(f)).toBe(false);
    expect(readdirSync(path.join(dir, 'data', 'propdocs')).some(n => n.startsWith(up.doc.id))).toBe(false);
  });
});

describe('the screens', () => {
  const read = (rel: string) => readFileSync(path.join(root, rel), 'utf-8');
  it('Property Papers is bilingual, reachable from the nav and from a property, and DD no longer says the file is not stored', () => {
    const v = read('src/components/PropertyPapersView.tsx');
    expect((v.match(/tx\(/g) || []).length).toBeGreaterThan(80);
    expect(v).not.toMatch(/>\s*[A-Z][a-z]+ [a-z]+ [a-z]+\s*</); // no bare English sentences between tags
    expect(read('src/components/NavigationTabs.tsx')).toContain("has('propdoc:use')");
    expect(read('src/App.tsx')).toContain('PropertyPapersView');
    expect(read('src/components/PropertiesView.tsx')).toContain('openPapersFor');
    const dd = read('src/components/SecureDocumentUploadModal.tsx');
    expect(dd).not.toMatch(/the file itself is not stored/i);
    expect(dd).toContain('libraryDocId');
    expect(read('src/lib/i18n.tsx')).toContain("'nav.propdocs'");
  });
});
