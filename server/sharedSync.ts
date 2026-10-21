/**
 * v39 — shared-database request wrapper for serverless hosting (Vercel), where several short-lived copies of the app run
 * at once and any of them can be stopped between requests. Per request:
 *   1. if another copy changed the database since we last looked (revision moved) → reload it;
 *   2. let the app handle the request;
 *   3. before the response leaves, write what this request changed (one transaction) and move the revision on.
 * Requests inside one copy run one at a time, so a reload never swaps the data under a running request.
 * Two copies writing the same record at the same moment: the later write wins (fine for a demo / pilot; a big network
 * runs on one long-lived server — see docs/DEPLOY_INDIA.md).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from './db.js';
import { pgStore } from './pgstore.js';
import { pullFiles, pushFiles } from './fileSync.js';

export const sharedMode = () => !!pgStore?.shared;

let chain: Promise<void> = Promise.resolve();
const MAX_MS = 60_000;

async function refresh() {
  const s = pgStore!;
  const rev = await s.revNow();
  if (rev === s.rev) return;
  const next = await s.load();
  if (next) db.replaceState(next as any);
  s.rev = rev;
}

async function persist(writes: boolean) {
  const s = pgStore!;
  if (s.isDirty) await s.commitShared(db.getState() as any);
  if (writes) await pushFiles();
}

export function handleShared(req: IncomingMessage, res: ServerResponse, app: (a: IncomingMessage, b: ServerResponse) => void): Promise<void> {
  const job = chain.then(() => new Promise<void>((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(t); resolve(); } };
    const t = setTimeout(finish, MAX_MS);
    res.on('finish', finish); res.on('close', finish);
    (async () => {
      try { await refresh(); } catch (e: any) { console.error('[SHARED] reload failed:', e?.message || e); }
      try { await pullFiles(); } catch (e: any) { console.error('[SHARED] file pull failed:', e?.message || e); }
      const writes = !['GET', 'HEAD', 'OPTIONS'].includes(req.method || 'GET');
      const end = res.end.bind(res) as (...a: any[]) => ServerResponse;
      let held = false;
      (res as any).end = (...args: any[]) => {
        if (held) return res;
        held = true;
        persist(writes)
          .catch((e: any) => console.error('[SHARED] save failed:', e?.message || e))
          .finally(() => { end(...args); });
        return res;
      };
      app(req, res);
    })().catch((e) => { console.error('[SHARED] request failed:', e); try { if (!res.headersSent) { res.statusCode = 500; res.end('{"error":"Internal server error"}'); } } catch { /* ignore */ } finish(); });
  }));
  chain = job.catch(() => {});
  return job;
}
