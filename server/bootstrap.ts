/**
 * Imported FIRST by server.ts. When DATABASE_URL is set it connects to Postgres and loads the state
 * before the (synchronous) `db` singleton is constructed. Top-level await blocks later imports.
 *
 * v39: SHARED_DB=true (set by server/vercelBoot.ts on Vercel) = many short-lived instances on one database
 * (see pgstore.ts "shared mode" and server/sharedSync.ts).
 */
import { PgStore, setPgStore } from './pgstore.js';

export const PRELOADED: { state: Record<string, any> | null; usingPg: boolean; dbError?: string } = { state: null, usingPg: false };

const url = process.env.DATABASE_URL;
if (url) {
  const shared = process.env.SHARED_DB === 'true';
  // Supabase runs its connection pooler on two clusters (aws-0-… / aws-1-…); a wrong guess answers "Tenant or user not found".
  const candidates = [url];
  if (/aws-0-[a-z0-9-]+\.pooler\.supabase\.com/.test(url)) candidates.push(url.replace('aws-0-', 'aws-1-'));
  else if (/aws-1-[a-z0-9-]+\.pooler\.supabase\.com/.test(url)) candidates.push(url.replace('aws-1-', 'aws-0-'));
  let store: PgStore | null = null; let lastErr: unknown;
  for (const c of candidates) {
    const s = new PgStore(c, { shared });
    try { await s.connect(); store = s; break; }
    catch (e: any) { lastErr = e; await s.close().catch(() => {}); if (!/tenant or user not found/i.test(String(e?.message))) break; }
  }
  if (store) {
    PRELOADED.state = await store.load();
    PRELOADED.usingPg = true;
    setPgStore(store);
    console.log(`[DB] PostgreSQL connected${shared ? ' (shared mode)' : ''} (${PRELOADED.state ? 'existing data loaded' : 'empty database — first boot'})`);
  } else if (process.env.VERCEL && process.env.ALLOW_FILE_DB === 'true') {
    // v39.1 — the public demo stays up on its per-instance file data instead of failing every request; /api/health shows why
    PRELOADED.dbError = String((lastErr as any)?.message || lastErr).replace(/postgres(ql)?:\/\/[^@\s]*@/gi, 'postgres://***@').slice(0, 200);
    console.error('[DB] PostgreSQL connection failed — running on the file database for now:', PRELOADED.dbError);
  } else {
    throw lastErr;
  }
}
