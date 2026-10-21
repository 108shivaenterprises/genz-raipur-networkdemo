/**
 * v24 — turn phone photos of paper into PDF pages, in the browser (nothing leaves the phone until the user uploads).
 *  • the photo's own orientation is respected, then the user's 90° turns
 *  • long edge shrunk to a readable size (≈200 dpi on A4 at the first try)
 *  • optional "document look": grey, background whitened, ink darkened (simple level stretch — no OCR, no AI)
 *  • the PDF is rebuilt smaller until it fits the place it is going (3 MB for an ID copy, 10 MB for a paper)
 */
import { buildPdf, pdfFileName, type PdfPage } from '../shared/pdfMaker.js';

export type Rotation = 0 | 90 | 180 | 270;
export interface ScanSource { id: string; file: File; rotation: Rotation }

export const loadBitmap = async (file: File): Promise<ImageBitmap | HTMLImageElement> => {
  try { if ('createImageBitmap' in window) return await createImageBitmap(file, { imageOrientation: 'from-image' } as any); } catch { /* fall back to <img> */ }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('UNREADABLE')); im.src = url; });
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
};
export const dims = (b: ImageBitmap | HTMLImageElement) => ('naturalWidth' in b ? { w: b.naturalWidth, h: b.naturalHeight } : { w: b.width, h: b.height });

/** Grey + level stretch: the 2nd percentile becomes black, the 92nd white (paper background). */
export function documentLook(data: Uint8ClampedArray) {
  const hist = new Uint32Array(256); const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[(data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8]++;
  const at = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * p) return v; } return 255; };
  const lo = at(0.02); const hi = Math.max(lo + 40, at(0.92));
  const k = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    const v = l <= lo ? 0 : l >= hi ? 255 : (l - lo) * k;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
}

async function renderPage(src: ScanSource, maxEdge: number, quality: number, enhance: boolean): Promise<PdfPage> {
  const bmp = await loadBitmap(src.file);
  const { w, h } = dims(bmp);
  const k = Math.min(1, maxEdge / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * k)); const sh = Math.max(1, Math.round(h * k));
  const turned = src.rotation === 90 || src.rotation === 270;
  const c = document.createElement('canvas');
  c.width = turned ? sh : sw; c.height = turned ? sw : sh;
  const g = c.getContext('2d', { willReadFrequently: enhance } as any) as CanvasRenderingContext2D | null; if (!g) throw new Error('UNREADABLE');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2); g.rotate((src.rotation * Math.PI) / 180);
  g.drawImage(bmp as any, -sw / 2, -sh / 2, sw, sh);
  g.setTransform(1, 0, 0, 1, 0, 0);
  if ('close' in bmp) (bmp as ImageBitmap).close();
  if (enhance) { const img = g.getImageData(0, 0, c.width, c.height); documentLook(img.data); g.putImageData(img, 0, 0); }
  const blob = await new Promise<Blob>((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('UNREADABLE'))), 'image/jpeg', quality));
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  c.width = c.height = 0; // free the memory on phones
  return { jpeg, width: turned ? sh : sw, height: turned ? sw : sh };
}

/** Bigger first; smaller until it fits. */
const LADDER: [number, number][] = [[1800, 0.82], [1600, 0.72], [1400, 0.64], [1200, 0.56], [1000, 0.5], [850, 0.45]];

export async function makePdfFile(sources: ScanSource[], o: { title: string; author?: string; maxBytes: number; enhance: boolean; onProgress?: (done: number, total: number, pass: number) => void }): Promise<File> {
  if (!sources.length) throw new Error('NO_PAGES');
  let last = 0;
  for (let pass = 0; pass < LADDER.length; pass++) {
    const [edge, q] = LADDER[pass];
    const pages: PdfPage[] = [];
    for (let i = 0; i < sources.length; i++) { o.onProgress?.(i, sources.length, pass); pages.push(await renderPage(sources[i], edge, q, o.enhance)); }
    const bytes = buildPdf(pages, { title: o.title, author: o.author });
    last = bytes.length;
    if (bytes.length <= o.maxBytes) {
      o.onProgress?.(sources.length, sources.length, pass);
      return new File([bytes as unknown as BlobPart], pdfFileName(o.title), { type: 'application/pdf' });
    }
  }
  const e = new Error('TOO_BIG') as Error & { size?: number }; e.size = last; throw e;
}
