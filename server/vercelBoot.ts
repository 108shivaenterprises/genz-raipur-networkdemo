/**
 * Public demo on Vercel. Must be the FIRST import of api/_entry.ts: the app reads and writes `<cwd>/data/...`,
 * and the Vercel function folder is read-only — only /tmp is writable. So: remember where the built site is, then work from /tmp.
 * Data therefore lives per warm instance and starts again from the seeded demo data on a cold start. That is the point of this demo.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// This repo is the public demo: demo logins, fake seed data, file DB in /tmp — unless the project sets these itself.
for (const k of ['DEMO_MODE', 'PUBLIC_DEMO', 'SEED_DEMO_DATA', 'SEED_DEMO_BULK', 'ALLOW_FILE_DB', 'TRUST_PROXY']) process.env[k] ||= 'true';
// Session-cookie secret: the project's own AUTH_SECRET if set; otherwise one derived from this Vercel project's private ids,
// so every instance of the demo agrees (a cookie from one still works on another) and nothing secret sits in the public repo.
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  const seed = (process.env.VERCEL_PROJECT_ID || '') + (process.env.VERCEL_ORG_ID || '') + (process.env.VERCEL_GIT_REPO_ID || '');
  process.env.AUTH_SECRET = seed ? crypto.createHash('sha256').update('genz-demo:' + seed).digest('hex') : crypto.randomBytes(32).toString('hex');
}
process.env.DIST_DIR ||= path.resolve(process.cwd(), 'dist');
const work = '/tmp/genz';
fs.mkdirSync(path.join(work, 'data'), { recursive: true });
process.chdir(work);
