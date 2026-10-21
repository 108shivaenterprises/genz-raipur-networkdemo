/**
 * Public demo on Vercel. Must be the FIRST import of api/_entry.ts: the app reads and writes `<cwd>/data/...`,
 * and the Vercel function folder is read-only — only /tmp is writable. So: remember where the built site is, then work from /tmp.
 * Data therefore lives per warm instance and starts again from the seeded demo data on a cold start. That is the point of this demo.
 */
import fs from 'node:fs';
import path from 'node:path';

process.env.DIST_DIR ||= path.resolve(process.cwd(), 'dist');
const work = '/tmp/genz';
fs.mkdirSync(path.join(work, 'data'), { recursive: true });
process.chdir(work);
