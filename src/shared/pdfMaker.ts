/**
 * v24 — a tiny, dependency-free PDF writer: one JPEG per page (what a phone "scan" is).
 * Pure (Uint8Array in, Uint8Array out) so the browser builds the PDF on the phone and the tests can check it in Node.
 *
 *  • Each page is A4 (portrait, or landscape for a wide photo) with the photo fitted inside a small margin.
 *  • The JPEG bytes go in unchanged (/DCTDecode) — no re-encoding, no fonts, no scripts, no links.
 *  • The title is stored as UTF-16 so Hindi names survive.
 */

export interface PdfPage { jpeg: Uint8Array; width: number; height: number; gray?: boolean }
export interface PdfOptions { title?: string; author?: string; margin?: number; now?: Date }

export const A4 = { w: 595.28, h: 841.89 };
const enc = new TextEncoder();

/** Width / height of a baseline or progressive JPEG (reads the SOF marker). Null if it is not a JPEG we can read. */
export function jpegSize(b: Uint8Array): { width: number; height: number; components: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xd9 || m === 0xda) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    const isSof = m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
    if (isSof) return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], components: b[i + 9] };
    i += 2 + len;
  }
  return null;
}

/** PDF text string: plain ASCII in (...) with escapes, anything else as UTF-16BE hex with a BOM. */
export function pdfString(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return '(' + s.replace(/[\\()]/g, m => '\\' + m) + ')';
  let hex = 'FEFF';
  for (let k = 0; k < s.length; k++) hex += s.charCodeAt(k).toString(16).padStart(4, '0').toUpperCase();
  return '<' + hex + '>';
}
const pdfDate = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
};
const num = (n: number) => (Math.round(n * 100) / 100).toString();

/** Where a w×h photo sits on its page: A4 portrait or landscape (whichever fits the photo), centred, inside the margin. */
export function placeOnPage(w: number, h: number, margin = 18) {
  const landscape = w > h;
  const pw = landscape ? A4.h : A4.w; const ph = landscape ? A4.w : A4.h;
  const k = Math.min((pw - 2 * margin) / w, (ph - 2 * margin) / h);
  const dw = w * k; const dh = h * k;
  return { pw, ph, x: (pw - dw) / 2, y: (ph - dh) / 2, dw, dh };
}

export function buildPdf(pages: PdfPage[], opts: PdfOptions = {}): Uint8Array {
  if (!pages.length) throw new Error('NO_PAGES');
  const chunks: Uint8Array[] = []; let size = 0; const offsets: number[] = [];
  const push = (x: string | Uint8Array) => { const u = typeof x === 'string' ? enc.encode(x) : x; chunks.push(u); size += u.length; };
  const obj = (id: number, body: string | (string | Uint8Array)[]) => {
    offsets[id] = size; push(`${id} 0 obj\n`);
    if (typeof body === 'string') push(body); else body.forEach(push);
    push('\nendobj\n');
  };
  // header + a binary comment so tools treat the file as binary
  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  // ids: 1 catalog, 2 pages, 3 info, then 3 per page (page, content, image)
  const n = pages.length; const pageId = (i: number) => 4 + i * 3;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`);
  const info = [`/Producer ${pdfString('GENZ Broker Network')}`, `/CreationDate (${pdfDate(opts.now || new Date())})`];
  if (opts.title) info.push(`/Title ${pdfString(opts.title.slice(0, 200))}`);
  if (opts.author) info.push(`/Author ${pdfString(opts.author.slice(0, 120))}`);
  obj(3, `<< ${info.join(' ')} >>`);

  pages.forEach((p, i) => {
    const sz = jpegSize(p.jpeg);
    if (!sz) throw new Error('NOT_JPEG');
    const w = sz.width || p.width; const h = sz.height || p.height;
    const at = placeOnPage(w, h, opts.margin ?? 18);
    const id = pageId(i);
    const content = `q ${num(at.dw)} 0 0 ${num(at.dh)} ${num(at.x)} ${num(at.y)} cm /Im0 Do Q`;
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(at.pw)} ${num(at.ph)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> /ProcSet [/PDF /ImageB /ImageC] >> /Contents ${id + 1} 0 R >>`);
    obj(id + 1, [`<< /Length ${enc.encode(content).length} >>\nstream\n`, content, '\nendstream']);
    const cs = sz.components === 1 ? '/DeviceGray' : sz.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    obj(id + 2, [`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`, p.jpeg, '\nendstream']);
  });

  const total = 4 + n * 3;
  const xref = size;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) x += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(size); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** "Sale deed / Plot 14" → "Sale-deed-Plot-14.pdf" (keeps Hindi letters; strips what file systems dislike) */
export function pdfFileName(title: string): string {
  const base = (title || 'scan').replace(/[\\/:*?"<>|#%{}~&]+/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'scan';
  return `${base}.pdf`;
}
