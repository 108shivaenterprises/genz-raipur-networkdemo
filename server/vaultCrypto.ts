/**
 * v25 — the KYC vault's encryption (no database import, so it can be tested on its own).
 * AES-256-GCM, a fresh 12-byte IV for every value, and the record + field name bound in as authenticated data.
 * Key: KYC_VAULT_KEY (64 hex characters, or base64 of 32 bytes) — or, when that is not set, a random key file `data/.kyc-vault.key`
 * (mode 0600, created once; override the path with KYC_VAULT_KEY_FILE). A damaged or wrongly sized key means NO key (the vault stays off) — never a weak fallback.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface VaultKey { key: Buffer; id: string; mode: 'env' | 'file' }
let keyCache: VaultKey | null | undefined;
let keyProblem = '';
export const vaultKeyProblem = () => keyProblem;
const keyFile = () => (process.env.KYC_VAULT_KEY_FILE ? path.resolve(process.env.KYC_VAULT_KEY_FILE) : path.resolve(process.cwd(), 'data', '.kyc-vault.key'));
const keyId = (k: Buffer) => crypto.createHash('sha256').update(k).digest('hex').slice(0, 8);

function parseKey(raw: string): Buffer | null {
  const t = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) return Buffer.from(t, 'hex');
  try { const b = Buffer.from(t, 'base64'); if (b.length === 32 && b.toString('base64').replace(/=+$/, '') === t.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/')) return b; } catch { /* not base64 */ }
  return null;
}

/** The vault key, or null when there is none (then the vault stays OFF — it never falls back to a weak key). */
export function vaultKey(): VaultKey | null {
  if (keyCache !== undefined) return keyCache;
  keyProblem = '';
  const env = process.env.KYC_VAULT_KEY;
  if (env && env.trim()) {
    const k = parseKey(env);
    if (!k) { keyProblem = 'KYC_VAULT_KEY is set but is not 32 bytes (use 64 hex characters or base64 of 32 bytes)'; return (keyCache = null); }
    return (keyCache = { key: k, id: keyId(k), mode: 'env' });
  }
  try {
    const f = keyFile();
    if (fs.existsSync(f)) {
      const k = parseKey(fs.readFileSync(f, 'utf8'));
      if (!k) { keyProblem = 'the key file in data/ is damaged'; return (keyCache = null); }
      return (keyCache = { key: k, id: keyId(k), mode: 'file' });
    }
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const k = crypto.randomBytes(32);
    fs.writeFileSync(f, k.toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
    return (keyCache = { key: k, id: keyId(k), mode: 'file' });
  } catch (e: any) {
    if (e?.code === 'EEXIST') { keyCache = undefined; return vaultKey(); }
    keyProblem = 'a key file could not be created in data/';
    return (keyCache = null);
  }
}
export function resetVaultKeyCache() { keyCache = undefined; }
export const vaultReady = () => !!vaultKey();

const b64u = (b: Buffer) => b.toString('base64url');
/** “k1.<keyId>.<iv>.<tag>.<ciphertext>” — `aad` ties the value to its record and field. */
export function seal(plain: string, aad: string): string {
  const k = vaultKey(); if (!k) throw new Error('VAULT_NO_KEY');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k.key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `k1.${k.id}.${b64u(iv)}.${b64u(c.getAuthTag())}.${b64u(ct)}`;
}
export function unseal(sealed: string, aad: string): string {
  const k = vaultKey(); if (!k) throw new Error('VAULT_NO_KEY');
  const [v, kid, iv, tag, ct] = sealed.split('.');
  if (v !== 'k1' || !kid || !iv || !tag || !ct) throw new Error('VAULT_BAD_DATA');
  if (kid !== k.id) throw new Error('VAULT_WRONG_KEY');
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', k.key, Buffer.from(iv, 'base64url'));
    d.setAAD(Buffer.from(aad)); d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  } catch { throw new Error('VAULT_BAD_DATA'); }
}

