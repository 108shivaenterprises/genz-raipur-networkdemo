/**
 * v25 — read a PAN / Aadhaar photo ON THE PHONE (Tesseract.js running as WebAssembly; free, Apache-2.0).
 *  • loaded only when the member taps “Fill from photo” (a separate chunk; the engine files are fetched from /ocr/ on this server — no CDN)
 *  • the photo is shown to the engine and then dropped: it is not uploaded, stored or logged by this step
 *  • the result is only a SUGGESTION (parseIdText decides what is worth suggesting; the member confirms every value)
 */
import { loadBitmap, dims, documentLook, type Rotation } from './scanPages.js';
import { parseIdText, mergeFound, foundAnything, type OcrFound } from '../shared/idOcrParse.js';

export const OCR_BASE = '/ocr';
// a tiny WebAssembly module that uses a SIMD instruction: true on nearly every phone made after 2021
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export const hasSimd = () => { try { return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE); } catch { return false; } };
export const ocrSupported = () => typeof WebAssembly === 'object' && typeof Worker !== 'undefined' && typeof document !== 'undefined';

export class OcrError extends Error { constructor(public code: 'UNSUPPORTED' | 'UNREADABLE' | 'ENGINE', msg?: string) { super(msg || code); } }

/** The photo as a grey, contrast-stretched canvas ≤ maxEdge px on its long side, turned by `rotation`. */
export async function photoToCanvas(file: File, rotation: Rotation = 0, enhance = true, maxEdge = 1800): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap | HTMLImageElement;
  try { bmp = await loadBitmap(file); } catch { throw new OcrError('UNREADABLE'); }
  const { w, h } = dims(bmp);
  const k = Math.min(1, maxEdge / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * k)); const sh = Math.max(1, Math.round(h * k));
  const turned = rotation === 90 || rotation === 270;
  const c = document.createElement('canvas');
  c.width = turned ? sh : sw; c.height = turned ? sw : sh;
  const g = c.getContext('2d', { willReadFrequently: true } as any) as CanvasRenderingContext2D | null;
  if (!g) throw new OcrError('UNREADABLE');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); g.rotate((rotation * Math.PI) / 180);
  g.drawImage(bmp as any, -sw / 2, -sh / 2, sw, sh);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if ('close' in bmp) (bmp as ImageBitmap).close();
  const img = g.getImageData(0, 0, c.width, c.height);
  if (enhance) documentLook(img.data);
  else { const d = img.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8; d[i] = d[i + 1] = d[i + 2] = l; } }
  g.putImageData(img, 0, 0);
  return c;
}

export interface OcrResult { found: OcrFound; text: string; secs: number }

/**
 * Read one photo: two layout modes on the clean “document look” image (merged), then plain grey if nothing useful came out.
 * `onProgress(0..1, label)` drives the progress bar. The engine is shut down afterwards so a cheap phone gets its memory back.
 */
export async function readIdPhoto(file: File, o: { rotation?: Rotation; onProgress?: (p: number, label: string) => void } = {}): Promise<OcrResult> {
  if (!ocrSupported()) throw new OcrError('UNSUPPORTED');
  const t0 = Date.now();
  const say = o.onProgress || (() => {});
  say(0.02, 'photo');
  let Tess: typeof import('tesseract.js');
  try { Tess = await import('tesseract.js'); } catch { throw new OcrError('ENGINE', 'engine'); }
  let worker: Awaited<ReturnType<typeof Tess.createWorker>> | null = null;
  try {
    worker = await Tess.createWorker('eng', 1, {
      workerPath: `${OCR_BASE}/worker.min.js`,
      corePath: `${OCR_BASE}/${hasSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'}`,
      langPath: `${OCR_BASE}/lang`,
      workerBlobURL: false, // the page's security policy allows scripts from this site only (no blob: workers)
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text') say(0.35 + 0.3 * m.progress, 'reading');
        else if (/loading|initializ/.test(m.status)) say(0.05 + 0.3 * m.progress, 'engine');
      },
    } as any);
    // Two page-layout modes on the clean photo: “one block of text” (keeps address lines in order) and “sparse text” (finds a big number printed on its own, like the PAN).
    // Their readings are merged. Only if nothing useful came out, plain grey is tried the same way.
    const passes: { enhance: boolean; psm: string }[] = [{ enhance: true, psm: '6' }, { enhance: true, psm: '11' }, { enhance: false, psm: '6' }, { enhance: false, psm: '11' }];
    let text = ''; let found: OcrFound = { kind: 'UNKNOWN' };
    let canvas: HTMLCanvasElement | null = null; let canvasEnh: boolean | null = null;
    for (let i = 0; i < passes.length; i++) {
      const p = passes[i];
      if (i >= 2 && foundAnything(found)) break;
      if (canvasEnh !== p.enhance) { if (canvas) canvas.width = canvas.height = 0; canvas = await photoToCanvas(file, o.rotation || 0, p.enhance); canvasEnh = p.enhance; }
      await worker.setParameters({ tessedit_pageseg_mode: p.psm } as any);
      const out = await worker.recognize(canvas!);
      text = out.data.text || '';
      found = mergeFound(found, parseIdText(text));
      say(Math.min(0.95, 0.35 + 0.6 * ((i + 1) / 2)), 'reading');
    }
    if (canvas) (canvas as HTMLCanvasElement).width = (canvas as HTMLCanvasElement).height = 0;
    say(1, 'done');
    return { found, text, secs: Math.round((Date.now() - t0) / 100) / 10 };
  } catch (e: any) {
    if (e instanceof OcrError) throw e;
    throw new OcrError('ENGINE', String(e?.message || e));
  } finally {
    try { await worker?.terminate(); } catch { /* already gone */ }
  }
}
