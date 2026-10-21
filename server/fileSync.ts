/**
 * v42 — uploaded files survive a serverless restart.
 * On Vercel the disk (/tmp) is wiped whenever a copy of the app stops, and several copies run side by side. The photos and papers
 * the app writes under data/<folder>/ are therefore also kept in the database (table genz_files) and copied back before a request:
 *   pullFiles()  — before the request: if another copy added / removed a file, bring this copy's disk in line (one cheap checksum query);
 *   pushFiles()  — after a request that wrote (POST/PUT/PATCH/DELETE): upload new or changed files, mark removed ones.
 * The app itself keeps reading and writing plain files — nothing else changed. Only used in shared-DB mode (see sharedSync.ts).
 * Files stay as protected as the rest of the database (private schema, role genz_app only). Very large files are skipped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pgStore } from './pgstore.js';

const MAX_FILE = 12 * 1024 * 1024;
const root = () => path.resolve(process.cwd(), 'data');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

interface Known { sha: string; mtimeMs: number; size: number }

/** every file under data/<folder>/…, as relative posix paths (top-level files like the JSON database are not synced) */
function walk(): string[] {
  const out: string[] = [];
  const base = root();
  let dirs: fs.Dirent[] = [];
  try { dirs = fs.readdirSync(base, { withFileTypes: true }); } catch { return out; }
  const rec = (dir: string, rel: string) => {
    let ents: fs.Dirent[] = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) rec(path.join(dir, e.name), r);
      else if (e.isFile() && !e.name.endsWith('.tmp')) out.push(r);
    }
  };
  for (const d of dirs) if (d.isDirectory()) rec(path.join(base, d.name), d.name);
  return out;
}
const abs = (rel: string) => path.join(root(), ...rel.split('/'));
const safe = (rel: string) => !!rel && !rel.split('/').some(p => p === '..' || p === '' || p === '.') && !path.isAbsolute(rel);

/** one copy of the app = one syncer (the tests make two) */
export function createFileSync() {
const known = new Map<string, Known>();   // relative path -> what this copy last synced
let lastSig: string | null = null;

async function pullFiles() {
  const s = pgStore; if (!s) return;
  const sig = await s.filesSignature();
  if (sig === lastSig) return;
  const rows = await s.filesList();
  const inDb = new Set<string>();
  for (const r of rows) {
    if (!safe(r.path)) continue;
    if (r.deleted) {
      if (known.has(r.path) || fs.existsSync(abs(r.path))) { try { fs.rmSync(abs(r.path), { force: true }); } catch { /* ignore */ } known.delete(r.path); }
      continue;
    }
    inDb.add(r.path);
    if (known.get(r.path)?.sha === r.sha && fs.existsSync(abs(r.path))) continue;
    const buf = await s.fileGet(r.path); if (!buf) continue;
    fs.mkdirSync(path.dirname(abs(r.path)), { recursive: true });
    fs.writeFileSync(abs(r.path), buf);
    const st = fs.statSync(abs(r.path));
    known.set(r.path, { sha: r.sha, mtimeMs: st.mtimeMs, size: st.size });
  }
  lastSig = sig;
}

async function pushFiles() {
  const s = pgStore; if (!s) return;
  let changed = false;
  const here = new Set<string>();
  for (const rel of walk()) {
    here.add(rel);
    let st: fs.Stats; try { st = fs.statSync(abs(rel)); } catch { continue; }
    const k = known.get(rel);
    if (k && k.mtimeMs === st.mtimeMs && k.size === st.size) continue;
    if (st.size > MAX_FILE) continue;
    const buf = fs.readFileSync(abs(rel));
    const h = sha(buf);
    if (k?.sha !== h) { await s.filePut(rel, h, buf); changed = true; }
    known.set(rel, { sha: h, mtimeMs: st.mtimeMs, size: st.size });
  }
  for (const rel of [...known.keys()]) {
    if (here.has(rel)) continue;
    await s.fileDel(rel); known.delete(rel); changed = true;
  }
  if (changed) lastSig = null; // re-read the checksum next time (our own change is already on disk)
}
return { pullFiles, pushFiles };
}

const main = createFileSync();
export const pullFiles = main.pullFiles;
export const pushFiles = main.pushFiles;
