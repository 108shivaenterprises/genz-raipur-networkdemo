/** v91 — GENZ Broker Network logo for client-made QRs, posters, banners, stories. Controlled by the superadmin (GET /api/brand/config). */
import QRCode from 'qrcode';

export type BrandSurface = 'qr' | 'poster' | 'share' | 'page';
interface Cfg { enabled: boolean; surfaces: Record<BrandSurface, boolean> }
let cfgP: Promise<Cfg> | null = null;
let at = 0;
export const brandConfig = (): Promise<Cfg> => {
  if (!cfgP || Date.now() - at > 60_000) {
    at = Date.now();
    cfgP = fetch('/api/brand/config').then(r => r.json()).then(j => ({ enabled: j.enabled !== false, surfaces: { qr: true, poster: true, share: true, page: true, ...(j.surfaces || {}) } }))
      .catch(() => ({ enabled: true, surfaces: { qr: true, poster: true, share: true, page: true } }));
  }
  return cfgP;
};
export const resetBrandConfig = () => { cfgP = null; };
export const brandOnFor = async (s: BrandSurface) => { const c = await brandConfig(); return c.enabled && c.surfaces[s]; };

let imgP: Promise<HTMLImageElement | null> | null = null;
let imgAt = 0;
export const brandImage = (): Promise<HTMLImageElement | null> => {
  if (!imgP || Date.now() - imgAt > 60_000) {
    imgAt = Date.now();
    imgP = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `/api/brand/logo?t=${Math.floor(Date.now() / 60_000)}`; });
  }
  return imgP;
};

/** Draw the logo (rounded, with a white plate) onto a canvas if the superadmin has it on for this surface. */
export async function drawBrandLogo(g: CanvasRenderingContext2D, x: number, y: number, size: number, surface: BrandSurface, plate = true) {
  if (!(await brandOnFor(surface))) return false;
  const im = await brandImage(); if (!im) return false;
  g.save();
  if (plate) { g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x - size * 0.08, y - size * 0.08, size * 1.16, size * 1.16, size * 0.2); g.fill(); }
  const k = Math.min(size / im.width, size / im.height); const w = im.width * k; const h = im.height * k;
  g.drawImage(im, x + (size - w) / 2, y + (size - h) / 2, w, h);
  g.restore();
  return true;
}

/** QR as a PNG data URL with the logo in the middle (error-correction H keeps it scannable); plain QR when the logo is off. */
export async function qrDataUrl(text: string, opts: { width: number; margin?: number; dark?: string; light?: string } ): Promise<string> {
  const on = await brandOnFor('qr');
  const base = await QRCode.toDataURL(text, { width: opts.width, margin: opts.margin ?? 1, errorCorrectionLevel: on ? 'H' : 'M', color: { dark: opts.dark || '#000000', light: opts.light || '#ffffff' } });
  if (!on) return base;
  const im = await brandImage(); if (!im) return base;
  const qr = await new Promise<HTMLImageElement | null>(res => { const q = new Image(); q.onload = () => res(q); q.onerror = () => res(null); q.src = base; });
  if (!qr) return base;
  const c = document.createElement('canvas'); c.width = qr.width; c.height = qr.height;
  const g = c.getContext('2d')!; g.drawImage(qr, 0, 0);
  const box = c.width * 0.22; const x = (c.width - box) / 2;
  g.fillStyle = opts.light || '#fff'; g.beginPath(); g.roundRect(x - box * 0.1, x - box * 0.1, box * 1.2, box * 1.2, box * 0.2); g.fill();
  const k = Math.min(box / im.width, box / im.height);
  g.drawImage(im, x + (box - im.width * k) / 2, x + (box - im.height * k) / 2, im.width * k, im.height * k);
  return c.toDataURL('image/png');
}
