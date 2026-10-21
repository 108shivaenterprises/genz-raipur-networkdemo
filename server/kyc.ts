/** India KYC format validators. These check FORMAT only — authenticity is verified by an admin against the official portals. */

import { normPan as _normPan, isValidPan as _isValidPan } from '../src/shared/idRules.js';
export const normPan = _normPan;
export const normGstin = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toUpperCase();
export const normRera = (v: unknown) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** AAAAA9999A — 4th letter is the holder type (P person, C company, F firm, H HUF, A AOP, T trust, B BOI, L local auth., J juridical, G govt). */
export function isValidPan(pan: string): boolean {
  return _isValidPan(pan); // single source: src/shared/idRules.ts (the join screen uses the same rule)
}

const GST_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** 15-char GSTIN with the official mod-36 check digit. */
export function isValidGstin(g: string): boolean {
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return false;
  const state = Number(g.slice(0, 2));
  if (state < 1 || state > 38) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = GST_CHARS.indexOf(g[i]);
    const prod = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  return GST_CHARS[(36 - (sum % 36)) % 36] === g[14];
}

/**
 * RERA registration numbers differ by state (e.g. CG: PCGRERA…, agents/projects) so we validate a sane shape
 * (8–30 chars, letters/digits and - / .) and leave authenticity to the admin check on the state RERA portal.
 */
export function isPlausibleRera(r: string): boolean {
  return /^[A-Z0-9][A-Z0-9\-\/.]{6,28}[A-Z0-9]$/.test(r) && /[A-Z]/.test(r) && /\d/.test(r);
}

export const maskPan = (p?: string) => (p ? `${p.slice(0, 2)}•••••${p.slice(-2)}` : p);
export const maskGstin = (g?: string) => (g ? `${g.slice(0, 2)}•••••••••${g.slice(-3)}` : g);

export const RERA_PORTAL_CG = 'https://rera.cgstate.gov.in';
