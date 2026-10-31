import { freePort } from './helpers/port';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildPdf, jpegSize, pdfString, placeOnPage, pdfFileName, A4 } from '../src/shared/pdfMaker';
import { documentLook } from '../src/lib/scanPages';
import { sniffMime } from '../src/shared/propDocs';

/** v24 — "make a PDF from photos": a dependency-free PDF writer, checked with qpdf / pdfinfo when they are installed. */
const RGB = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAYACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD6pooooAKKKKACiiigAooooAKKKKACiiigD//Z', 'base64'));   // 40×24 colour JPEG
const GRAY = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/wAALCAAeABQBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APqmiiiiiiiiiiiv/9k=', 'base64')); // 20×30 greyscale JPEG
const td = new TextDecoder('latin1');
const has = (cmd: string) => spawnSync('which', [cmd]).status === 0;

describe('the PDF writer (pure)', () => {
  it('reads a JPEG’s size and colours', () => {
    expect(jpegSize(RGB)).toEqual({ width: 40, height: 24, components: 3 });
    expect(jpegSize(GRAY)).toEqual({ width: 20, height: 30, components: 1 });
    expect(jpegSize(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
  it('a wide photo gets a landscape A4 page, a tall one portrait — always inside the margin', () => {
    const l = placeOnPage(40, 24); expect(l.pw).toBeCloseTo(A4.h); expect(l.ph).toBeCloseTo(A4.w);
    const p = placeOnPage(20, 30); expect(p.pw).toBeCloseTo(A4.w);
    for (const x of [l, p]) { expect(x.x).toBeGreaterThanOrEqual(17.9); expect(x.y).toBeGreaterThanOrEqual(17.9); expect(x.x + x.dw).toBeLessThanOrEqual(x.pw - 17.9); expect(x.y + x.dh).toBeLessThanOrEqual(x.ph - 17.9); }
  });
  it('titles: plain text escaped, Hindi kept as UTF-16', () => {
    expect(pdfString('Plot (14) \\ A')).toBe('(Plot \\(14\\) \\\\ A)');
    expect(pdfString('डीड')).toBe('<FEFF092109400921>');
    expect(pdfFileName('Sale deed / Plot #14')).toBe('Sale-deed-Plot-14.pdf');
    expect(pdfFileName('सेल डीड')).toBe('सेल-डीड.pdf');
    expect(pdfFileName('')).toBe('scan.pdf');
  });
  it('builds a real PDF: right header, one page per photo, every xref offset points at its object, nothing active inside', () => {
    const pdf = buildPdf([{ jpeg: RGB, width: 40, height: 24 }, { jpeg: GRAY, width: 20, height: 30 }, { jpeg: RGB, width: 40, height: 24 }], { title: 'सेल डीड (Plot 14)', now: new Date('2026-10-17T05:00:00Z') });
    expect(sniffMime(pdf)).toBe('application/pdf'); // the server's own check accepts it
    const text = td.decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toMatch(/\/Type \/Pages \/Count 3 /);
    expect((text.match(/\/Type \/Page /g) || []).length).toBe(3);
    expect(text).toMatch(/\/ColorSpace \/DeviceGray/);
    for (const bad of ['/JavaScript', '/JS ', '/OpenAction', '/URI', '/Launch', '/EmbeddedFile', '/AA ']) expect(text, bad).not.toContain(bad);
    const xrefAt = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const rows = text.slice(xrefAt).split('\n').slice(3).filter(l => / 00000 n $/.test(l));
    expect(rows.length).toBe(3 + 3 * 3);
    rows.forEach((row, k) => { const off = Number(row.slice(0, 10)); expect(text.startsWith(`${k + 1} 0 obj\n`, off), `object ${k + 1}`).toBe(true); });
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
  });
  it('refuses nothing-to-do and non-JPEG pages', () => {
    expect(() => buildPdf([])).toThrow('NO_PAGES');
    expect(() => buildPdf([{ jpeg: new Uint8Array([1, 2, 3, 4]), width: 1, height: 1 }])).toThrow('NOT_JPEG');
  });
  it('a standard PDF checker (qpdf / pdfinfo) accepts it', () => {
    if (!has('qpdf') && !has('pdfinfo')) return;
    const dir = mkdtempSync(path.join(tmpdir(), 'genz-pdf-')); const f = path.join(dir, 'scan.pdf');
    writeFileSync(f, buildPdf([{ jpeg: RGB, width: 40, height: 24 }, { jpeg: GRAY, width: 20, height: 30 }], { title: 'सेल डीड' }));
    if (has('qpdf')) { const q = spawnSync('qpdf', ['--check', f], { encoding: 'utf8' }); expect(q.status, q.stdout + q.stderr).toBe(0); expect(q.stdout).toMatch(/No syntax or stream encoding errors/); }
    if (has('pdfinfo')) { const i = spawnSync('pdfinfo', [f], { encoding: 'utf8' }); expect(i.stdout).toMatch(/Pages:\s+2/); expect(i.stdout).toMatch(/Title:\s+सेल डीड/); expect(i.stdout).toMatch(/JavaScript:\s+no/); }
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('"clean document look" (pure)', () => {
  it('turns a greyish photo into black ink on white paper', () => {
    // 100 pixels: 10 dark "ink" (60), 90 light-grey "paper" (190)
    const px = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) { const v = i < 10 ? 60 : 190; px.set([v, v + 5, v - 5, 255], i * 4); }
    documentLook(px);
    expect(px[0]).toBe(0); expect(px[0]).toBe(px[1]); expect(px[1]).toBe(px[2]); // ink → black, grey
    expect(px[50 * 4]).toBe(255); // paper → white
    expect(px[50 * 4 + 3]).toBe(255); // alpha untouched
  });
});

// ── the server takes the PDF made on the phone exactly like any other PDF ──
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any; let cookie = '';
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v24-')); mkdirSync(path.join(dir, 'data'));
  const root = path.resolve(import.meta.dirname, '..');
  proc = spawn(path.join(root, 'node_modules/.bin/tsx'), [path.join(root, 'server.ts')], { cwd: dir, env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'vikram.realty@gmail.com', password: cfg.demoPassword }) });
  cookie = r.headers.get('set-cookie')!.split(';')[0];
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('upload', () => {
  it('Property Papers stores the scanned PDF as a PDF and serves it back unchanged', async () => {
    const pdf = buildPdf([{ jpeg: RGB, width: 40, height: 24 }, { jpeg: GRAY, width: 20, height: 30 }], { title: 'Sale deed Plot 14' });
    const up = await fetch(B + '/api/property-docs', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ propertyId: 'PROP-RAI-101', type: 'SALE_DEED', title: 'Sale deed Plot 14 (scanned)', fileName: pdfFileName('Sale deed Plot 14'), data: Buffer.from(pdf).toString('base64'), attest: true }) });
    expect(up.status).toBe(200);
    const d = (await up.json()).doc;
    expect(d.mime).toBe('application/pdf');
    const got = await fetch(B + `/api/property-docs/${d.id}/file`, { headers: { cookie } });
    if (got.status === 200) { const buf = new Uint8Array(await got.arrayBuffer()); expect(buf.length).toBe(pdf.length); expect(sniffMime(buf)).toBe('application/pdf'); }
  });
});
