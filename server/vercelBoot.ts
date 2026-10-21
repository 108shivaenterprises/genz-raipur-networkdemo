/**
 * Public demo on Vercel. Must be the FIRST import of api/_entry.ts: the app reads and writes `<cwd>/data/...`,
 * and the Vercel function folder is read-only — only /tmp is writable. So: remember where the built site is, then work from /tmp.
 *
 * Without DATABASE_URL the data lives per warm instance and starts again from the seeded demo data on a cold start.
 * v39: WITH DATABASE_URL (Supabase pooler) the data is kept in Postgres and shared by every instance — nothing resets
 * (server/sharedSync.ts). Uploaded files (photos, papers) are copied into the same database (server/fileSync.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// This repo is the public demo: demo logins, fake seed data — unless the project sets these itself.
for (const k of ['DEMO_MODE', 'PUBLIC_DEMO', 'SEED_DEMO_DATA', 'SEED_DEMO_BULK', 'ALLOW_FILE_DB', 'TRUST_PROXY']) process.env[k] ||= 'true';

// Secrets every instance must agree on. The project's own values win; otherwise they are derived from a private seed:
// the database URL (it holds a password) when there is one, else this Vercel project's ids. Nothing secret sits in the public repo.
const seed = process.env.DATABASE_URL || ((process.env.VERCEL_PROJECT_ID || '') + (process.env.VERCEL_ORG_ID || '') + (process.env.VERCEL_GIT_REPO_ID || ''));
const derive = (label: string) => seed ? crypto.createHash('sha256').update(`genz-demo:${label}:${seed}`).digest() : crypto.randomBytes(32);
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  process.env.AUTH_SECRET = process.env.DATABASE_URL ? derive('auth').toString('hex')
    : (seed ? crypto.createHash('sha256').update('genz-demo:' + seed).digest('hex') : crypto.randomBytes(32).toString('hex')); // unchanged for the reset-on-cold-start demo
}
if (process.env.DATABASE_URL) {
  process.env.SHARED_DB ||= 'true';          // many instances, one database (pgstore.ts shared mode)
  process.env.DATABASE_SCHEMA ||= 'genz';    // private schema, not exposed by Supabase's public API
  process.env.KYC_VAULT_KEY ||= derive('kyc-vault').toString('hex'); // sealed KYC values must open after a cold start
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    try {
      const ec = crypto.createECDH('prime256v1'); ec.setPrivateKey(derive('vapid'));
      process.env.VAPID_PUBLIC_KEY = ec.getPublicKey('base64url'); process.env.VAPID_PRIVATE_KEY = ec.getPrivateKey('base64url');
    } catch { /* push stays on its file key */ }
  }
}
process.env.DIST_DIR ||= path.resolve(process.cwd(), 'dist');
const work = process.env.GENZ_WORKDIR || '/tmp/genz';
fs.mkdirSync(path.join(work, 'data'), { recursive: true });
process.chdir(work);
