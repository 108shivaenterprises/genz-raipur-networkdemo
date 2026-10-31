/**
 * Audit F16 — page links that the broker may need to send again (shop partner page, brokerage bill) are kept SEALED
 * (AES-256-GCM, key derived from the server secret), never in plain text next to their hash. A copy of the database
 * alone no longer opens anyone's page.
 */
import crypto from 'node:crypto';
import { secret } from './auth.js';

const key = () => crypto.createHmac('sha256', secret()).update('genz-link-seal-v1').digest();

export function sealLink(token: string, aad: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv); c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(token, 'utf8'), c.final()]);
  return `l1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${ct.toString('base64url')}`;
}

export function openLink(sealed: string | undefined, aad: string): string {
  const [v, iv, tag, ct] = String(sealed || '').split('.');
  if (v !== 'l1' || !iv || !tag || !ct) return '';
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url')); d.setAAD(Buffer.from(aad)); d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { return ''; }
}

/** an old record still holding the plain link: seal it and drop the plain copy (returns the link) */
export function linkOf(x: { token?: string; tokenSealed?: string }, aad: string): string {
  if (x.token) { x.tokenSealed = sealLink(x.token, aad); const t = x.token; delete x.token; return t; }
  return openLink(x.tokenSealed, aad);
}
