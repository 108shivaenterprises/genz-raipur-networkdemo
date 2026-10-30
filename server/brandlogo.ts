/**
 * v91 — GENZ Broker Network logo on every QR, poster, banner, post, story and public page.
 * Only the SUPERADMIN can change it (upload / on-off / per-surface). Everyone can read the public config + image.
 * Default = built-in mark. Uploads: PNG / JPEG / WebP only (no SVG → no script risk), ≤300 KB, type read from the real bytes.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import express from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { db } from './db.js';
import type { BrandLogoSettings } from './db.js';
import { ctx } from './auth.js';

export const LOGO_MAX_BYTES = 300 * 1024;
const DEFAULT_SURFACES = { qr: true, poster: true, share: true, page: true };
const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#14213d"/><text x="50" y="62" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="40" fill="#fca311">GZ</text><rect x="22" y="72" width="56" height="4" rx="2" fill="#fca311"/></svg>`;
const DEFAULT_URI = `data:image/svg+xml;base64,${Buffer.from(DEFAULT_SVG).toString('base64')}`;

export const brandCfg = (): BrandLogoSettings => {
  const b = db.getState().settings.brandLogo;
  return { enabled: b?.enabled !== false, dataUrl: b?.dataUrl, surfaces: { ...DEFAULT_SURFACES, ...(b?.surfaces || {}) }, updatedBy: b?.updatedBy, updatedAt: b?.updatedAt };
};
export const brandUri = () => brandCfg().dataUrl || DEFAULT_URI;
export const brandOn = (surface: keyof typeof DEFAULT_SURFACES) => { const c = brandCfg(); return c.enabled && c.surfaces[surface]; };

function sniff(buf: Buffer): string | null {
  if (buf.length > 12 && buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** A QR as SVG with the GENZ logo in the middle (error-correction H keeps it scannable). UPI QRs must NOT use this. */
export async function brandedQrSvg(text: string, width: number, margin = 1): Promise<string> {
  const on = brandOn('qr');
  const svg = await QRCode.toString(text, { type: 'svg', margin, width, errorCorrectionLevel: on ? 'H' : 'M' });
  if (!on) return svg;
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!m) return svg;
  const n = Number(m[1]); const box = n * 0.22; const x = (n - box) / 2; const pad = box * 0.1;
  const overlay = `<g data-gz-logo="qr"><rect x="${x - pad}" y="${x - pad}" width="${box + pad * 2}" height="${box + pad * 2}" rx="${box * 0.18}" fill="#fff"/><image href="${brandUri()}" x="${x}" y="${x}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"/></g>`;
  return svg.replace('</svg>', `${overlay}</svg>`);
}

/** HTML strip for public pages: the logo + platform name, once, right after <body>. */
export function logoStrip(): string {
  const name = db.getState().settings.platformName || 'GENZ BROKER NETWORK';
  return `<div data-gz-logo="page" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 12px;background:#fff;border-bottom:1px solid #e5e7eb;font:700 12px system-ui,sans-serif;color:#14213d"><img src="/api/brand/logo" alt="" width="24" height="24" style="border-radius:6px;object-fit:contain"><span>${name.replace(/[<>&]/g, '')}</span></div>`;
}

/** Inject the strip into HTML responses of the public pages. */
export function brandInject(req: Request, res: Response, next: NextFunction) {
  const send = res.send.bind(res);
  res.send = ((body?: any) => {
    try {
      const ct = String(res.getHeader('Content-Type') || '');
      if (typeof body === 'string' && (ct.includes('text/html') || (!ct && /^\s*<(!doctype|html)/i.test(body))) && brandOn('page') && !body.includes('data-gz-logo="page"')) {
        const i = body.search(/<body[^>]*>/i);
        if (i >= 0) { const tag = body.slice(i).match(/<body[^>]*>/i)![0]; body = body.slice(0, i + tag.length) + logoStrip() + body.slice(i + tag.length); }
      }
    } catch { /* never break a page for a logo */ }
    return send(body);
  }) as any;
  next();
}

export function createBrandRouter() {
  const r = Router();
  r.get('/logo', (_req, res) => {
    const uri = brandUri();
    const mm = uri.match(/^data:([^;]+);base64,(.*)$/s);
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (!mm) return res.status(404).end();
    res.type(mm[1]).send(Buffer.from(mm[2], 'base64'));
  });
  r.get('/config', (_req, res) => {
    const c = brandCfg();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ success: true, enabled: c.enabled, surfaces: c.surfaces, custom: !!c.dataUrl, v: c.updatedAt || '0' });
  });
  const superOnly = (_req: Request, res: Response, next: NextFunction) => {
    const u = ctx().user;
    if (!u) return res.status(401).json({ error: 'Authentication required' });
    if (u.role !== 'SUPERADMIN') return res.status(403).json({ error: 'Only the superadmin can change the GENZ logo.', code: 'FORBIDDEN' });
    next();
  };
  r.put('/', express.json({ limit: '700kb' }), superOnly, (req: Request, res: Response) => {
    const a = ctx().user!; const s = db.getState();
    const b = z.object({
      enabled: z.boolean().optional(),
      surfaces: z.object({ qr: z.boolean(), poster: z.boolean(), share: z.boolean(), page: z.boolean() }).partial().optional(),
      image: z.string().max(500_000).nullable().optional(), // data URL, null = back to the built-in mark
    }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'Invalid logo setting' });
    const cur = brandCfg(); const changes: string[] = [];
    if (b.data.enabled !== undefined && b.data.enabled !== cur.enabled) { cur.enabled = b.data.enabled; changes.push(`logo ${b.data.enabled ? 'ON' : 'OFF'}`); }
    if (b.data.surfaces) for (const k of Object.keys(b.data.surfaces) as (keyof typeof DEFAULT_SURFACES)[]) {
      const v = b.data.surfaces[k]; if (v !== undefined && v !== cur.surfaces[k]) { cur.surfaces[k] = v; changes.push(`${k} ${v ? 'ON' : 'OFF'}`); }
    }
    if (b.data.image !== undefined) {
      if (b.data.image === null) { if (cur.dataUrl) { cur.dataUrl = undefined; changes.push('logo reset to default'); } }
      else {
        const raw = b.data.image.replace(/^data:[^;]+;base64,/, '');
        if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) return res.status(400).json({ error: 'The image could not be read. Choose it again.' });
        const buf = Buffer.from(raw, 'base64');
        if (!buf.length) return res.status(400).json({ error: 'The image is empty.' });
        if (buf.length > LOGO_MAX_BYTES) return res.status(413).json({ error: 'Logo is larger than 300 KB. Use a smaller image.' });
        const mime = sniff(buf);
        if (!mime) return res.status(400).json({ error: 'Use a PNG, JPEG or WebP logo (SVG is not allowed).' });
        cur.dataUrl = `data:${mime};base64,${buf.toString('base64')}`; changes.push('new logo uploaded');
      }
    }
    if (changes.length) {
      cur.updatedBy = a.id; cur.updatedAt = new Date().toISOString();
      s.settings.brandLogo = cur; db.save();
      db.appendAuditEvent(a.id, a.role, 'SYSTEM', 'BRAND-LOGO', 'BRAND_LOGO_CHANGED', `${a.name}: ${changes.join('; ')}`);
    }
    const c = brandCfg();
    res.json({ success: true, enabled: c.enabled, surfaces: c.surfaces, custom: !!c.dataUrl, v: c.updatedAt || '0' });
  });
  return r;
}
