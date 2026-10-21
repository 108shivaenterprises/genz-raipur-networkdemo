/**
 * PostgreSQL persistence (write-behind).
 *
 * The app keeps the working set in memory (fast, synchronous handlers) and every `db.save()` schedules
 * a coalesced, transactional flush of ONLY the documents that changed into Postgres. Documents live in a
 * single table (collection, id, jsonb) so no schema migration is needed when the data model grows.
 *
 * Single-writer by design: an advisory lock makes a second instance refuse to start instead of
 * silently overwriting the first one's data. Scale-out needs a move to per-request queries.
 *
 * v20 (scale): the change check used to JSON-encode EVERY document and hold a second full JSON copy of the database
 * in memory, all in one go — at a year's data (300k audit lines, 40k listings) that blocked every request for seconds
 * on each save. Now: append-only collections (audit trail) only look at new rows, the remembered fingerprint is a
 * 20-byte hash instead of the whole JSON, the scan yields to waiting requests every few milliseconds, rows are
 * written in batches, and saves are spaced by how long the last one took.
 */
import { Pool } from 'pg';
import { createHash } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS genz_docs (
  collection  text        NOT NULL,
  id          text        NOT NULL,
  data        jsonb       NOT NULL,
  ord         integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);
CREATE TABLE IF NOT EXISTS genz_meta (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE genz_docs ADD COLUMN IF NOT EXISTS ord integer NOT NULL DEFAULT 0;
`;
const LOCK_KEY = 7_420_261_001; // arbitrary app-wide advisory lock id
const META_PREFIX = '__meta__';

type State = Record<string, any>;
/** collections whose rows are only ever appended (the audit chain cannot be edited without breaking its hashes) */
const APPEND_ONLY = new Set(['auditEvents']);
const fp = (ord: number, json: string) => ord + ':' + createHash('sha1').update(json).digest('base64');
const yieldNow = () => new Promise<void>(r => setImmediate(r));
const SLICE_MS = 8;
/**
 * The key of a record. Every record should carry `id`; a record without one used to throw and stop ALL saving
 * (v20 fix). Now it falls back to a natural key (`day`, `key`, `code`) or its position, and says so once in the log.
 */
const warned = new Set<string>();
function docId(collection: string, doc: any, i: number): string {
  const id = doc?.id ?? doc?.day ?? doc?.key ?? doc?.code;
  if (id !== undefined && id !== null && id !== '') return String(id);
  if (!warned.has(collection)) { warned.add(collection); console.error(`[PG] records in "${collection}" have no id — stored by position; please give them an id`); }
  return `#${i}`;
}

export class PgStore {
  private pool: Pool;
  private lockClient: import('pg').PoolClient | null = null;
  private flushed = new Map<string, string>(); // "collection/id" -> ord + hash of the last written JSON
  private appended = new Map<string, { n: number; lastId: string }>(); // append-only collection -> rows already written + id of the last one
  private lastFlushMs = 0;
  private lastFlushAt = 0;
  public stats = { flushes: 0, lastMs: 0, maxMs: 0, lastRows: 0 };
  private dirty = false;
  private running: Promise<void> | null = null;
  private latest: State | null = null;
  private failures = 0;

  constructor(connectionString: string) {
    const ssl = process.env.PGSSLMODE === 'require' || /sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : undefined;
    this.pool = new Pool({ connectionString, max: 5, ssl });
    this.pool.on('error', e => console.error('[PG] idle client error', e.message));
  }

  async connect() {
    await this.pool.query(SCHEMA);
    this.lockClient = await this.pool.connect();
    const { rows } = await this.lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
    if (!rows[0].ok) throw new Error('Another GENZ instance already holds the database lock (single-writer). Stop it first.');
  }

  /** Returns null when the database is empty (first boot). */
  async load(): Promise<State | null> {
    const { rows } = await this.pool.query('SELECT collection, id, data, ord FROM genz_docs ORDER BY collection, ord, id');
    const meta = await this.pool.query('SELECT key, value FROM genz_meta');
    if (rows.length === 0 && meta.rows.length === 0) return null;
    const state: State = {};
    for (const m of meta.rows) state[m.key] = m.value;
    // keep collection order stable: audit events must stay in numeric id order
    for (const r of rows) {
      (state[r.collection] ||= []).push(r.data);
      if (!APPEND_ONLY.has(r.collection)) this.flushed.set(`${r.collection}/${r.id}`, fp(r.ord, JSON.stringify(r.data)));
    }
    if (Array.isArray(state.auditEvents)) state.auditEvents.sort((a: any, b: any) => a.id - b.id);
    for (const k of APPEND_ONLY) { const a = Array.isArray(state[k]) ? state[k] : []; this.appended.set(k, { n: a.length, lastId: a.length ? docId(k, a[a.length - 1], a.length - 1) : '' }); }
    for (const [k, v] of Object.entries(state)) if (!Array.isArray(v)) this.flushed.set(`${META_PREFIX}/${k}`, fp(0, JSON.stringify(v)));
    return state;
  }

  /** Called synchronously by db.save(): remember the latest state and flush soon. */
  schedule(state: State) {
    this.latest = state;
    this.dirty = true;
    if (!this.running) this.running = this.drain();
  }

  private async drain() {
    try {
      while (this.dirty) {
        // space saves by how long the last one took (at most half the time spent saving), at least 250 ms apart
        const gap = Math.max(250, this.lastFlushMs) - (Date.now() - this.lastFlushAt);
        if (gap > 0) await new Promise(r => setTimeout(r, gap));
        this.dirty = false;
        const t0 = Date.now();
        await this.flushOnce(this.latest!);
        this.lastFlushAt = Date.now(); this.lastFlushMs = this.lastFlushAt - t0;
        this.stats.flushes++; this.stats.lastMs = this.lastFlushMs; this.stats.maxMs = Math.max(this.stats.maxMs, this.lastFlushMs);
        this.failures = 0;
      }
    } catch (e: any) {
      this.failures++;
      console.error(`[PG] flush failed (#${this.failures}):`, e.message);
      this.dirty = true;
      await new Promise(r => setTimeout(r, Math.min(15_000, 500 * 2 ** this.failures)));
      this.running = null;
      if (this.dirty) this.running = this.drain();
      return;
    }
    this.running = null;
  }

  private async flushOnce(state: State) {
    const upserts: [string, string, string, number][] = [];
    const fps: string[] = [];
    const seen = new Set<string>();
    const appendedNow = new Map<string, { n: number; lastId: string }>();
    const rewrite = new Set<string>(); // append-only collections that shrank / changed order: replaced whole
    let sliceStart = Date.now();
    const maybeYield = async () => { if (Date.now() - sliceStart >= SLICE_MS) { await yieldNow(); sliceStart = Date.now(); } };
    for (const [key, val] of Object.entries(state)) {
      if (Array.isArray(val)) {
        if (APPEND_ONLY.has(key)) {
          const was = this.appended.get(key) || { n: 0, lastId: '' };
          // still a pure append (nothing removed or re-ordered)? then only the new tail is written
          const pure = val.length >= was.n && (was.n === 0 || docId(key, val[was.n - 1], was.n - 1) === was.lastId);
          if (!pure) rewrite.add(key);
          const from = pure ? was.n : 0;
          const to = val.length;
          for (let i = from; i < to; i++) {
            const doc = val[i]; const id = docId(key, doc, i);
            upserts.push([key, id, JSON.stringify(doc), i]); fps.push('');
            if ((i & 255) === 0) await maybeYield();
          }
          appendedNow.set(key, { n: to, lastId: to ? docId(key, val[to - 1], to - 1) : '' });
          continue;
        }
        for (let i = 0; i < val.length; i++) {
          const doc = val[i];
          const id = docId(key, doc, i);
          const k = `${key}/${id}`;
          const json = JSON.stringify(doc);
          const f = fp(i, json);
          seen.add(k);
          if (this.flushed.get(k) !== f) { upserts.push([key, id, json, i]); fps.push(f); }
          if ((i & 63) === 0) await maybeYield();
        }
      } else {
        const k = `${META_PREFIX}/${key}`;
        const json = JSON.stringify(val);
        const f = fp(0, json);
        seen.add(k);
        if (this.flushed.get(k) !== f) { upserts.push([META_PREFIX, key, json, 0]); fps.push(f); }
      }
    }
    const deletes = [...this.flushed.keys()].filter(k => !seen.has(k));
    this.stats.lastRows = upserts.length + deletes.length;
    if (upserts.length === 0 && deletes.length === 0 && rewrite.size === 0) { for (const [k, n] of appendedNow) this.appended.set(k, n); return; }

    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      for (const k of rewrite) await c.query('DELETE FROM genz_docs WHERE collection=$1', [k]);
      const metas = upserts.filter(u => u[0] === META_PREFIX);
      for (const [, id, json] of metas) {
        await c.query('INSERT INTO genz_meta(key, value) VALUES ($1,$2::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()', [id, json]);
      }
      // documents in batches of 500 rows per statement (one round trip each instead of one per row)
      const docs = upserts.filter(u => u[0] !== META_PREFIX);
      for (let i = 0; i < docs.length; i += 500) {
        const part = docs.slice(i, i + 500);
        await c.query(
          `INSERT INTO genz_docs(collection, id, data, ord)
           SELECT * FROM unnest($1::text[], $2::text[], $3::jsonb[], $4::int[])
           ON CONFLICT (collection, id) DO UPDATE SET data=EXCLUDED.data, ord=EXCLUDED.ord, updated_at=now()`,
          [part.map(p => p[0]), part.map(p => p[1]), part.map(p => p[2]), part.map(p => p[3])]);
      }
      const delDocs = deletes.filter(k => !k.startsWith(META_PREFIX + '/'));
      for (let i = 0; i < delDocs.length; i += 500) {
        const part = delDocs.slice(i, i + 500).map(k => { const [col, ...rest] = k.split('/'); return [col, rest.join('/')]; });
        await c.query('DELETE FROM genz_docs WHERE (collection, id) IN (SELECT * FROM unnest($1::text[], $2::text[]))', [part.map(p => p[0]), part.map(p => p[1])]);
      }
      for (const k of deletes.filter(k => k.startsWith(META_PREFIX + '/'))) await c.query('DELETE FROM genz_meta WHERE key=$1', [k.slice(META_PREFIX.length + 1)]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
    upserts.forEach((u, i) => { if (fps[i]) this.flushed.set(`${u[0]}/${u[1]}`, fps[i]); });
    for (const k of deletes) this.flushed.delete(k);
    for (const [k, n] of appendedNow) this.appended.set(k, n);
  }

  /** Wait until everything scheduled so far is durable (used on shutdown and in tests). */
  async flush() {
    while (this.running) await this.running;
    if (this.dirty && this.latest) await this.flushOnce(this.latest);
  }

  async ping() { await this.pool.query('SELECT 1'); }

  async close() {
    await this.flush().catch(() => {});
    try { await this.lockClient?.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]); } catch { /* ignore */ }
    this.lockClient?.release();
    await this.pool.end();
  }
}

export let pgStore: PgStore | null = null;
export function setPgStore(s: PgStore | null) { pgStore = s; }
