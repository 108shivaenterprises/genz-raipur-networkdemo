import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scannedPages } from '../server/pdfPages.js';

/**
 * v49 — "Protect" inside Property Papers (view only, the opener's own name stamped on every page, no download),
 * signed page tokens that work across server copies, Protected Docs stamped for everyone (owner too),
 * and the mandate showing the owner's name + full mobile (and the broker's details) to the parties.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 6700 + Math.floor(Math.random() * 90);
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const PROP = 'PROP-RAI-101'; // owner USR-OWNER-001 · listing broker USR-BRK-001

const call = (cookie: string | undefined, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(B + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const j = async (r: Response) => r.json();
async function login(id: string) {
  const a = cfg.demoAccounts.find((x: any) => x.id === id);
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, id).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}

// --- test files -------------------------------------------------------------------------------------------------
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 9)]);
/** a stand-in JPEG body (only the SOI marker matters to the server) */
const jpeg = (fill: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, fill), Buffer.from([0xff, 0xd9])]);
/** a PDF the way scanner apps write it: every page is one JPEG picture (optionally an invisible OCR text layer) */
function scannedPdf(pages: Buffer[], ocr = false): Buffer {
  const parts: Buffer[] = []; const offs: number[] = []; let n = 0;
  const add = (body: Buffer | string) => { offs.push(Buffer.concat(parts).length); parts.push(Buffer.isBuffer(body) ? body : Buffer.from(body, 'latin1')); };
  const kids: number[] = [];
  const objs: (Buffer | string)[] = [];
  // 1 catalog, 2 pages, then per page: page, content, image
  pages.forEach((_, i) => kids.push(3 + i * 3));
  objs.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objs.push(`2 0 obj\n<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`);
  pages.forEach((img, i) => {
    const p = 3 + i * 3, c = p + 1, im = p + 2;
    const draw = `q 595 0 0 842 0 0 cm /Im${i} Do Q${ocr ? ` BT 3 Tr /F1 12 Tf 50 700 Td (Registry page ${i + 1}) Tj ET` : ''}`;
    objs.push(`${p} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${c} 0 R >>\nendobj\n`);
    objs.push(`${c} 0 obj\n<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\n`);
    objs.push(Buffer.concat([Buffer.from(`${im} 0 obj\n<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`, 'latin1'), img, Buffer.from('\nendstream\nendobj\n', 'latin1')]));
  });
  add('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  for (const o of objs) { add(o); n++; }
  const body = Buffer.concat(parts);
  let xref = `xref\n0 ${n + 1}\n0000000000 65535 f \n`;
  for (let k = 1; k <= n; k++) xref += `${String(offs[k]).padStart(10, '0')} 00000 n \n`;
  return Buffer.concat([body, Buffer.from(`${xref}trailer\n<< /Size ${n + 1} /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`, 'latin1')]);
}
/** a PDF typed on a computer: visible text, no page picture */
const typedPdf = () => {
  const draw = 'BT /F1 14 Tf 72 720 Td (Sale deed - typed) Tj ET';
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length ${draw.length} >>\nstream\n${draw}\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`, 'latin1');
};
const upload = (cookie: string, buf: Buffer, over: Record<string, unknown> = {}) =>
  call(cookie, 'POST', '/api/property-docs', { propertyId: PROP, type: 'SALE_DEED', title: 'Registry copy', fileName: 'registry.jpg', data: buf.toString('base64'), attest: true, ...over });

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v49-'));
  mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, KYC_VAULT_KEY: '', KYC_VAULT_KEY_FILE: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const [k, id] of Object.entries({ B1: 'USR-BRK-001', B2: 'USR-BRK-002', B3: 'USR-BRK-003', OWNER: 'USR-OWNER-001', ADMIN: 'USR-ADMIN-1' })) jar[k] = await login(id);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('scanned-PDF pages without a PDF library', () => {
  it('reads every page photo in order; refuses typed PDFs; accepts an invisible OCR layer', () => {
    const a = jpeg(1), b = jpeg(2);
    const pages = scannedPages(scannedPdf([a, b]))!;
    expect(pages).toHaveLength(2);
    expect(pages[0].equals(a)).toBe(true); expect(pages[1].equals(b)).toBe(true);
    expect(scannedPages(scannedPdf([a], true))).toHaveLength(1);
    expect(scannedPages(typedPdf())).toBeNull();
    expect(scannedPages(Buffer.from('not a pdf'))).toBeNull();
  });
});

describe('Protect a property paper: view only, every opener stamped, no download', () => {
  let id = ''; let me3 = '';
  it('the listing broker uploads a protected photo and shares it with another broker', async () => {
    const r = await upload(jar.B1, png(), { protect: true, fileName: 'registry.png' });
    const b = await j(r); expect(r.status, JSON.stringify(b)).toBe(200);
    expect(b.doc).toMatchObject({ protect: true, canDownload: true, pages: 1 });
    id = b.doc.id;
    const s = await call(jar.B1, 'POST', `/api/property-docs/${id}/share`, { userIds: ['USR-BRK-003'] });
    expect(s.status).toBe(200);
    me3 = cfg.demoAccounts.find((x: any) => x.id === 'USR-BRK-003').name; expect(me3.length).toBeGreaterThan(2);
  });
  it('the broker it was shared with cannot get the file — in the browser he is sent to the viewer', async () => {
    const docs = (await j(await call(jar.B3, 'GET', '/api/property-docs?scope=shared'))).docs;
    expect(docs.find((d: any) => d.id === id)).toMatchObject({ protect: true, canDownload: false });
    const f = await call(jar.B3, 'GET', `/api/property-docs/${id}/file?dl=1`);
    expect(f.status).toBe(403); const fb = await j(f); expect(fb.code).toBe('PROTECTED'); expect(fb.hi).toMatch(/सुरक्षित/);
    const nav = await call(jar.B3, 'GET', `/api/property-docs/${id}/file`, undefined, { 'sec-fetch-dest': 'document' });
    expect(nav.status).toBe(303); expect(nav.headers.get('location')).toBe(`/?tab=propdocs&view=${id}`);
  });
  it('the viewer: his own name + ••last 4 stamped, single-use signed page tokens served only as an image to him', async () => {
    const v = await j(await call(jar.B3, 'POST', `/api/property-docs/${id}/view`));
    expect(v).toMatchObject({ success: true, pages: 1, protect: true, canDownload: false });
    expect(v.watermark).toContain(me3); expect(v.watermark).toMatch(/· ••\d{4} ·/);
    const t = v.tokens[0];
    expect((await call(jar.B2, 'GET', `/api/property-docs/view/${t}`, undefined, { 'sec-fetch-dest': 'image' })).status).toBe(403); // not his token
    const pg = await call(jar.B3, 'GET', `/api/property-docs/view/${t}`, undefined, { 'sec-fetch-dest': 'image' });
    expect(pg.status).toBe(200); expect(pg.headers.get('cache-control')).toMatch(/no-store/);
    expect(Buffer.from(await pg.arrayBuffer()).equals(png())).toBe(true);
    expect((await call(jar.B3, 'GET', `/api/property-docs/view/${t}`, undefined, { 'sec-fetch-dest': 'image' })).status).toBe(403); // used once
    const v2 = await j(await call(jar.B3, 'POST', `/api/property-docs/${id}/view`));
    expect((await call(jar.B3, 'GET', `/api/property-docs/view/${v2.tokens[0]}`, undefined, { 'sec-fetch-dest': 'document' })).status).toBe(403); // opened outside the viewer
    const forged = v2.tokens[0].replace(/.$/, (c: string) => (c === 'A' ? 'B' : 'A'));
    expect((await call(jar.B3, 'GET', `/api/property-docs/view/${forged}`, undefined, { 'sec-fetch-dest': 'image' })).status).toBe(403);
    const log = (await j(await call(jar.B1, 'GET', `/api/property-docs/${id}/log`))).log;
    expect(log.some((l: any) => l.action === 'VIEW' && /stamped/.test(l.note || ''))).toBe(true);
    expect(log.some((l: any) => l.action === 'DENIED')).toBe(true);
  });
  it('the uploader and the property owner keep the original; the uploader is stamped too; a GENZ admin is view-only', async () => {
    expect((await call(jar.B1, 'GET', `/api/property-docs/${id}/file?dl=1`)).status).toBe(200);
    expect((await call(jar.OWNER, 'GET', `/api/property-docs/${id}/file?dl=1`)).status).toBe(200);
    const mine = await j(await call(jar.B1, 'POST', `/api/property-docs/${id}/view`));
    expect(mine.watermark).toContain('Vikramaditya Sharma'); expect(mine.canDownload).toBe(true);
    expect((await call(jar.ADMIN, 'GET', `/api/property-docs/${id}/file`)).status).toBe(403);
    const adm = await j(await call(jar.ADMIN, 'POST', `/api/property-docs/${id}/view`));
    expect(adm.canDownload).toBe(false); expect(adm.watermark).toBeTruthy();
  });
  it('only a manager may switch protection; switching it off gives the file back to the people it is shared with', async () => {
    expect((await call(jar.B3, 'PATCH', `/api/property-docs/${id}`, { protect: false })).status).toBe(403);
    const off = await j(await call(jar.B1, 'PATCH', `/api/property-docs/${id}`, { protect: false }));
    expect(off.doc.protect).toBe(false);
    expect((await call(jar.B3, 'GET', `/api/property-docs/${id}/file`)).status).toBe(200);
    const on = await j(await call(jar.B1, 'PATCH', `/api/property-docs/${id}`, { protect: true }));
    expect(on.doc.protect).toBe(true);
    expect((await call(jar.B3, 'GET', `/api/property-docs/${id}/file`)).status).toBe(403);
  });
  it('a scanned PDF is protected page by page; a typed PDF cannot be protected (clear message), but uploads unprotected', async () => {
    const s = await upload(jar.B1, scannedPdf([jpeg(3), jpeg(4), jpeg(5)]), { protect: true, fileName: 'registry-scan.pdf' });
    const sb = await j(s); expect(s.status, JSON.stringify(sb)).toBe(200); expect(sb.doc).toMatchObject({ protect: true, pages: 3 });
    const v = await j(await call(jar.B1, 'POST', `/api/property-docs/${sb.doc.id}/view`));
    expect(v.tokens).toHaveLength(3);
    const p2 = await call(jar.B1, 'GET', `/api/property-docs/view/${v.tokens[1]}`, undefined, { 'sec-fetch-dest': 'image' });
    expect(p2.headers.get('content-type')).toBe('image/jpeg'); expect(Buffer.from(await p2.arrayBuffer()).equals(jpeg(4))).toBe(true);

    const t = await upload(jar.B1, typedPdf(), { protect: true, fileName: 'deed.pdf' });
    expect(t.status).toBe(400); const tb = await j(t); expect(tb.code).toBe('PDF_NOT_SCANNED'); expect(tb.hi).toMatch(/पेज की फ़ोटो/);
    const plain = await j(await upload(jar.B1, typedPdf(), { fileName: 'deed.pdf' }));
    expect(plain.doc.protect).toBe(false);
    const pr = await call(jar.B1, 'PATCH', `/api/property-docs/${plain.doc.id}`, { protect: true });
    expect(pr.status).toBe(400); expect((await j(pr)).code).toBe('PDF_NOT_SCANNED');
  });
});

describe('Protected Docs: everyone who opens is stamped — the owner too', () => {
  it('owner and shared viewer both get their own stamp; only the owner may download', async () => {
    const page = `data:image/jpeg;base64,${jpeg(7).toString('base64')}`;
    const up = await call(jar.B1, 'POST', '/api/pdocs', { title: 'Approved map', pages: [page] });
    const ub = await j(up); expect(up.status, JSON.stringify(ub)).toBe(200);
    const id = ub.doc?.id || ub.id;
    const own = await j(await call(jar.B1, 'POST', `/api/pdocs/${id}/open`));
    expect(own.watermark).toContain('Vikramaditya Sharma'); expect(own.canDownload).toBe(true);
    const img = await call(jar.B1, 'GET', `/api/pdocs/page/${own.tokens[0]}`, undefined, { 'sec-fetch-dest': 'image' });
    expect(img.status).toBe(200);
  });
});

describe('Mandate: the owner’s name and full mobile, and the broker’s details, for the parties', () => {
  it('the listing broker and the owner see the full mobile; the listing’s owner name is used', async () => {
    const ms = (await j(await call(jar.B1, 'GET', `/api/owner-mandates?propertyId=${PROP}`))).mandates;
    const m = ms.find((x: any) => x.status === 'ACTIVE');
    expect(m).toMatchObject({ ownerName: 'Sunil Lalwani', brokerName: 'Vikramaditya Sharma' });
    expect(m.ownerPhone).toMatch(/^\+91 \d{5} \d{5}$/);
    expect(m.ownerPhoneLast4).toBe(m.ownerPhone.replace(/\D/g, '').slice(-4));
    expect(m.brokerPhone).toMatch(/^\+91 \d{5} \d{5}$/); expect(m.brokerCode).toMatch(/^GZ-BRK-/);
    const om = (await j(await call(jar.OWNER, 'GET', `/api/owner-mandates?propertyId=${PROP}`))).mandates.find((x: any) => x.id === m.id);
    expect(om.ownerPhone).toBe(m.ownerPhone);
  });
});
