/**
 * Imported FIRST by server.ts. When DATABASE_URL is set it connects to Postgres and loads the state
 * before the (synchronous) `db` singleton is constructed. Top-level await blocks later imports.
 */
import { PgStore, setPgStore } from './pgstore.js';

export const PRELOADED: { state: Record<string, any> | null; usingPg: boolean } = { state: null, usingPg: false };

const url = process.env.DATABASE_URL;
if (url) {
  const store = new PgStore(url);
  await store.connect();
  PRELOADED.state = await store.load();
  PRELOADED.usingPg = true;
  setPgStore(store);
  console.log(`[DB] PostgreSQL connected (${PRELOADED.state ? 'existing data loaded' : 'empty database — first boot'})`);
}
