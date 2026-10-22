/**
 * v49 — the page photos inside a SCANNED PDF, without any PDF library.
 *
 * A scan (phone scanner apps, office scanners, GENZ's own "photos → PDF") stores every page as one JPEG picture.
 * Those pictures can be read straight out of the file, in page order, and shown in the watermarked viewer.
 * A PDF made on a computer (typed text, drawn tables) has no page photo — for that `scannedPages` returns null and the
 * caller says so; showing such a PDF with a watermark would need a PDF renderer.
 *
 * Handles: plain and compressed object streams (PDF 1.5+), inherited page resources, a page photo wrapped in a form,
 * invisible OCR text (render mode 3, as Adobe Scan / CamScanner add). Refuses: encrypted files, pages with visible text,
 * pages without a picture, pictures stored in any other way than JPEG.
 */
import zlib from 'node:zlib';

type Obj = { dict: string; data?: Buffer };

const MAX_PAGES = 40;

function inflate(b: Buffer): Buffer | null {
  try { return zlib.inflateSync(b); } catch { try { return zlib.inflateRawSync(b); } catch { return null; } }
}

/** every object of the file: top-level ones, plus the ones packed in compressed object streams */
function readObjects(buf: Buffer): Map<number, Obj> | null {
  const s = buf.toString('latin1');
  if (/\/Encrypt\s/.test(s.slice(-4096)) || /\/Encrypt\s+\d+\s+\d+\s+R/.test(s)) return null;
  const objs = new Map<number, Obj>();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  const heads: { num: number; at: number }[] = [];
  while ((m = re.exec(s))) heads.push({ num: Number(m[1]), at: m.index + m[0].length });
  const lengthOf = (dict: string): number | null => {
    const direct = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    if (direct) return Number(direct[1]);
    const ref = /\/Length\s+(\d+)\s+\d+\s+R/.exec(dict);
    if (!ref) return null;
    const h = heads.find(x => x.num === Number(ref[1]));
    if (!h) return null;
    const n = /^\s*(\d+)/.exec(s.slice(h.at, h.at + 40));
    return n ? Number(n[1]) : null;
  };
  let skipUntil = 0; // "12 0 obj" that happens to appear inside a picture's bytes is not an object
  for (let i = 0; i < heads.length; i++) {
    const { num, at } = heads[i];
    if (at < skipUntil) continue;
    let j = i + 1; while (j < heads.length && heads[j].at < skipUntil) j++;
    const end = j < heads.length ? heads[j].at : s.length;
    const chunk = s.slice(at, end);
    const st = /\bstream\r?\n/.exec(chunk);
    if (!st) { const e = chunk.indexOf('endobj'); objs.set(num, { dict: e >= 0 ? chunk.slice(0, e) : chunk }); continue; }
    const dict = chunk.slice(0, st.index);
    const start = at + st.index + st[0].length;
    let len = lengthOf(dict);
    if (len == null || start + len > buf.length) {
      const e = s.indexOf('endstream', start);
      if (e < 0) continue;
      len = e - start;
    }
    objs.set(num, { dict, data: buf.subarray(start, start + len) });
    skipUntil = start + len;
  }
  // objects packed inside compressed object streams (never streams themselves)
  for (const [, o] of [...objs]) {
    if (!o.data || !/\/Type\s*\/ObjStm/.test(o.dict) || !/\/FlateDecode/.test(o.dict)) continue;
    const raw = inflate(o.data); if (!raw) continue;
    const n = Number(/\/N\s+(\d+)/.exec(o.dict)?.[1] || 0), first = Number(/\/First\s+(\d+)/.exec(o.dict)?.[1] || 0);
    const txt = raw.toString('latin1');
    const nums = txt.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k < n && 2 * k + 1 < nums.length; k++) {
      const objNum = nums[2 * k], off = nums[2 * k + 1], next = k + 1 < n ? nums[2 * k + 3] : txt.length - first;
      if (!objs.has(objNum)) objs.set(objNum, { dict: txt.slice(first + off, first + next) });
    }
  }
  return objs;
}

const refs = (txt: string) => [...txt.matchAll(/(\d+)\s+\d+\s+R/g)].map(x => Number(x[1]));
/** the text of a `/Key << … >>` dictionary (balanced), or of the object a `/Key 12 0 R` points to */
function sub(objs: Map<number, Obj>, dict: string, key: string): string | null {
  const i = dict.search(new RegExp(`/${key}\\b`));
  if (i < 0) return null;
  const rest = dict.slice(i + key.length + 1).trimStart();
  const ref = /^(\d+)\s+\d+\s+R/.exec(rest);
  if (ref) return objs.get(Number(ref[1]))?.dict ?? null;
  if (!rest.startsWith('<<')) return null;
  let depth = 0;
  for (let j = 0; j < rest.length; j++) {
    if (rest.startsWith('<<', j)) { depth++; j++; } else if (rest.startsWith('>>', j)) { depth--; j++; if (depth === 0) return rest.slice(0, j + 1); }
  }
  return null;
}
const isPage = (d: string) => /\/Type\s*\/Page(?![a-zA-Z])/.test(d);

/** pages in reading order: the page tree from the catalogue, else page objects in file order */
function pageList(objs: Map<number, Obj>, buf: Buffer): number[] {
  const s = buf.toString('latin1');
  const rootRefs = [...s.matchAll(/\/Root\s+(\d+)\s+\d+\s+R/g)].map(x => Number(x[1]));
  for (const root of rootRefs.reverse()) {
    const cat = objs.get(root)?.dict; if (!cat) continue;
    const pagesRef = /\/Pages\s+(\d+)\s+\d+\s+R/.exec(cat); if (!pagesRef) continue;
    const out: number[] = []; const seen = new Set<number>();
    const walk = (n: number, depth: number) => {
      if (seen.has(n) || depth > 30 || out.length > MAX_PAGES) return; seen.add(n);
      const d = objs.get(n)?.dict; if (!d) return;
      if (isPage(d)) { out.push(n); return; }
      const kids = /\/Kids\s*\[([^\]]*)\]/.exec(d);
      if (kids) for (const k of refs(kids[1])) walk(k, depth + 1);
    };
    walk(Number(pagesRef[1]), 0);
    if (out.length) return out;
  }
  return [...objs.entries()].filter(([, o]) => isPage(o.dict)).map(([n]) => n);
}

function resourcesOf(objs: Map<number, Obj>, pageNum: number): string | null {
  let n: number | undefined = pageNum;
  for (let i = 0; n != null && i < 30; i++) {
    const d = objs.get(n)?.dict; if (!d) return null;
    const r = sub(objs, d, 'Resources'); if (r) return r;
    const p = /\/Parent\s+(\d+)\s+\d+\s+R/.exec(d); n = p ? Number(p[1]) : undefined;
  }
  return null;
}

const dims = (d: string) => ({ w: Number(/\/Width\s+(\d+)/.exec(d)?.[1] || 0), h: Number(/\/Height\s+(\d+)/.exec(d)?.[1] || 0) });

function ascii85(b: Buffer): Buffer | null {
  const s = b.toString('latin1').replace(/\s+/g, '').replace(/^<~/, '');
  const end = s.indexOf('~>'); const t = end >= 0 ? s.slice(0, end) : s;
  const out: number[] = []; let group: number[] = [];
  for (const ch of t) {
    if (ch === 'z' && group.length === 0) { out.push(0, 0, 0, 0); continue; }
    const c = ch.charCodeAt(0) - 33; if (c < 0 || c > 84) return null;
    group.push(c);
    if (group.length === 5) { let v = 0; for (const g of group) v = v * 85 + g; out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); group = []; }
  }
  if (group.length) { const n = group.length; while (group.length < 5) group.push(84); let v = 0; for (const g of group) v = v * 85 + g; const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out.push(...bytes.slice(0, n - 1)); }
  return Buffer.from(out);
}
const asciiHex = (b: Buffer): Buffer | null => { const t = b.toString('latin1').replace(/[\s>]/g, ''); return /^[0-9a-fA-F]*$/.test(t) ? Buffer.from(t.length % 2 ? t + '0' : t, 'hex') : null; };

const filters = (dict: string) => { const f = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict); return f ? [...f[1].matchAll(/\/(\w+)/g)].map(x => x[1]) : []; };
/** undo zip / text wrappers; null on any other filter */
function undo(chain: string[], data: Buffer): Buffer | null {
  let b: Buffer | null = data;
  for (const name of chain) {
    if (!b) return null;
    if (name === 'FlateDecode') b = inflate(b);
    else if (name === 'ASCII85Decode') b = ascii85(b);
    else if (name === 'ASCIIHexDecode') b = asciiHex(b);
    else return null;
  }
  return b;
}
/** the JPEG bytes of a picture whose LAST filter is DCTDecode (earlier text / zip wrappers are undone); null for any other picture */
function jpegOf(dict: string, data: Buffer): Buffer | null {
  const chain = filters(dict);
  if (chain[chain.length - 1] !== 'DCTDecode') return null;
  const b = undo(chain.slice(0, -1), data);
  return b && b[0] === 0xff && b[1] === 0xd8 ? b : null;
}

/** the biggest JPEG picture drawn on a page (looking one level into forms) */
function pagePicture(objs: Map<number, Obj>, res: string | null, depth = 0): { data: Buffer; area: number } | null {
  if (!res || depth > 2) return null;
  const xo = sub(objs, res, 'XObject'); if (!xo) return null;
  let best: { data: Buffer; area: number } | null = null;
  for (const n of refs(xo)) {
    const o = objs.get(n); if (!o) continue;
    let cand: { data: Buffer; area: number } | null = null;
    if (/\/Subtype\s*\/Image/.test(o.dict) && o.data) { const jpg = jpegOf(o.dict, o.data); const { w, h } = dims(o.dict); if (jpg) cand = { data: jpg, area: w * h }; }
    else if (/\/Subtype\s*\/Form/.test(o.dict)) cand = pagePicture(objs, sub(objs, o.dict, 'Resources'), depth + 1);
    if (cand && (!best || cand.area > best.area)) best = cand;
  }
  return best;
}

/** does the page draw readable text (not the invisible OCR layer of a scan)? */
function hasVisibleText(objs: Map<number, Obj>, pageDict: string): boolean {
  const c = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(pageDict); if (!c) return false;
  let text = '';
  for (const n of refs(c[1])) {
    const o = objs.get(n); if (!o?.data) continue;
    const raw = undo(filters(o.dict), o.data);
    if (!raw) return true; // cannot read the page's drawing — do not call it a plain scan
    text += raw.toString('latin1') + '\n';
  }
  if (!/\b(Tj|TJ)\b/.test(text) || !/\bBT\b/.test(text)) return false;
  // every text block of an OCR'd scan is drawn invisibly (3 Tr)
  const blocks = text.split(/\bBT\b/).slice(1);
  return blocks.some(b => /\b(Tj|TJ)\b/.test(b.split(/\bET\b/)[0]) && !/\b3\s+Tr\b/.test(b.split(/\bET\b/)[0]));
}

/** JPEG of every page, in order — or null when this is not a plain scan (see the header). `minSide` skips logos and icons. */
export function scannedPages(buf: Buffer, opts: { minSide?: number } = {}): Buffer[] | null {
  if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
  const objs = readObjects(buf); if (!objs) return null;
  const pages = pageList(objs, buf);
  if (!pages.length || pages.length > MAX_PAGES) return null;
  const min = opts.minSide ?? 300;
  const out: Buffer[] = [];
  for (const p of pages) {
    const d = objs.get(p)!.dict;
    if (hasVisibleText(objs, d)) return null;
    const pic = pagePicture(objs, resourcesOf(objs, p));
    if (!pic || pic.area < min * min) return null;
    const jpg = pic.data;
    if (!(jpg[0] === 0xff && jpg[1] === 0xd8)) return null;
    out.push(Buffer.from(jpg));
  }
  return out;
}
