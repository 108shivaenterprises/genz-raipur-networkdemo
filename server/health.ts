/**
 * v20 — "is GENZ healthy right now?" without any outside monitoring service.
 * Keeps, in memory only, the last few server errors, slow requests and crashes reported by people's phones,
 * plus how long the server took to respond to itself (event-loop lag). Nothing here holds a name, phone,
 * request body or query string — only paths, timings and error text.
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { needs, rateLimit } from './auth.js';
import { db } from './db.js';
import v8 from 'node:v8';
import { pgStore } from './pgstore.js';

type Entry = { at: string; path: string; detail: string; ms?: number; n: number };
const MAX = 60;
const ring = { serverErrors: [] as Entry[], slow: [] as Entry[], client: [] as Entry[] };
const counts = { serverErrors: 0, slow: 0, client: 0, rejections: 0, requests: 0 };
const startedAt = new Date().toISOString();
export const SLOW_MS = Number(process.env.SLOW_REQUEST_MS || 1500);

function push(list: Entry[], path: string, detail: string, ms?: number) {
  // same path + message within the list → count it instead of adding a line
  const hit = list.find(e => e.path === path && e.detail === detail);
  if (hit) { hit.n++; hit.at = new Date().toISOString(); if (ms && (!hit.ms || ms > hit.ms)) hit.ms = ms; return; }
  list.unshift({ at: new Date().toISOString(), path, detail, ms, n: 1 });
  if (list.length > MAX) list.length = MAX;
}
/** ids / numbers in a path are collapsed so /api/deals/DEAL-2026-001 and …-002 count as one place */
export const pathKey = (p: string) => p.replace(/\/[A-Z]{2,}[-_][A-Z0-9_-]+/g, '/:id').replace(/\/\d{3,}/g, '/:n').slice(0, 120);

export function noteRequest(path: string, status: number, ms: number) {
  counts.requests++;
  if (ms >= SLOW_MS) { counts.slow++; push(ring.slow, pathKey(path), `${status}`, ms); }
}
export function noteServerError(path: string, err: unknown) {
  counts.serverErrors++;
  const msg = err instanceof Error ? err.message : String(err);
  push(ring.serverErrors, pathKey(path), msg.replace(/\b\d{10,}\b/g, '[n]').slice(0, 300));
}
export function noteRejection(err: unknown) {
  counts.rejections++;
  push(ring.serverErrors, '(background)', (err instanceof Error ? err.message : String(err)).slice(0, 300));
}

// event-loop lag: how late a 500 ms timer fires. A busy (blocked) server shows up here first.
let lagMax1m = 0; let lagNow = 0; let lagWindowAt = Date.now();
const lagHistory: number[] = []; // one value per minute, last 60
(() => {
  let last = Date.now();
  const t = setInterval(() => {
    const now = Date.now(); const lag = Math.max(0, now - last - 500); last = now;
    lagNow = lag; lagMax1m = Math.max(lagMax1m, lag);
    if (now - lagWindowAt >= 60_000) { lagHistory.push(lagMax1m); if (lagHistory.length > 60) lagHistory.shift(); lagMax1m = 0; lagWindowAt = now; }
  }, 500);
  t.unref();
})();

const clientSchema = z.object({
  kind: z.string().max(20), area: z.string().max(40).optional().default(''), message: z.string().max(400),
  stack: z.string().max(1500).optional().default(''), path: z.string().max(200).optional().default(''), ua: z.string().max(160).optional().default(''),
});

export function healthSnapshot() {
  const st = db.getState() as any;
  const mem = process.memoryUsage();
  const sizes: Record<string, number> = {};
  for (const [k, v] of Object.entries(st)) if (Array.isArray(v) && v.length >= 100) sizes[k] = v.length;
  const worstLag = Math.max(lagMax1m, ...lagHistory.slice(-15));
  const status = counts.serverErrors > 0 && ring.serverErrors[0] && Date.now() - Date.parse(ring.serverErrors[0].at) < 15 * 60_000 ? 'WARN'
    : worstLag > 2000 ? 'WARN' : 'OK';
  return {
    status, startedAt, uptimeSec: Math.round(process.uptime()),
    memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576), heapLimit: Math.round(v8.getHeapStatistics().heap_size_limit / 1048576) },
    eventLoopLagMs: { now: lagNow, max1m: lagMax1m, max15m: worstLag, perMinute: lagHistory.slice(-30) },
    counts: { ...counts }, slowThresholdMs: SLOW_MS,
    serverErrors: ring.serverErrors.slice(0, 25), slow: ring.slow.slice(0, 25), client: ring.client.slice(0, 25),
    data: { users: st.users?.length || 0, properties: st.properties?.length || 0, auditEvents: st.auditEvents?.length || 0, bigCollections: sizes, version: db.version },
    storage: process.env.DATABASE_URL ? 'PostgreSQL' : 'JSON file',
    saves: pgStore ? { ...pgStore.stats } : undefined,
  };
}

export function createHealthRouter() {
  const r = Router();
  // phones report crashes here (works before sign-in too: login / join screens can break as well)
  r.post('/client-errors', rateLimit('client-err', 30, 60_000), (req: Request, res: Response) => {
    const p = clientSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'bad report' });
    counts.client++;
    const d = p.data;
    push(ring.client, `${d.area || d.path || '?'}`.slice(0, 80), `${d.kind}: ${d.message}`.replace(/\b\d{10,}\b/g, '[n]').slice(0, 300));
    res.status(204).end();
  });
  r.get('/admin/health', needs('admin:control_center'), (_req, res) => res.json({ success: true, health: healthSnapshot() }));
  return r;
}
