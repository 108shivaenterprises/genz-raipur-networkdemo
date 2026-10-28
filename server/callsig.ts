/**
 * v81 — where in-app call signals wait for the other phone. One copy of the app (a normal server, the tests): a small in-memory list.
 * Several copies side by side (Vercel + Supabase): the shared database's own table, outside the document store (see PgStore.sigAdd).
 * A signal is a few hundred bytes and lives minutes, so nothing here is "kept".
 */
import { pgStore } from './pgstore.js';

export interface Signal { seq: number; kind: string; data: string }

const mem = new Map<string, Array<Signal & { to: string; at: number }>>(); // callId -> signals
let counter = 0;
const TTL_MS = 15 * 60_000;

const useDb = () => !!pgStore?.shared;

export async function sigAdd(callId: string, to: string, kind: string, data: string): Promise<number> {
  if (useDb()) return pgStore!.sigAdd(callId, to, kind, data);
  const list = mem.get(callId) || []; mem.set(callId, list);
  const seq = ++counter; list.push({ seq, to, kind, data, at: Date.now() });
  if (list.length > 600) list.splice(0, list.length - 600);
  return seq;
}
export async function sigList(callId: string, to: string, after: number): Promise<Signal[]> {
  if (useDb()) return pgStore!.sigList(callId, to, after);
  return (mem.get(callId) || []).filter(s => s.to === to && s.seq > after).slice(0, 200).map(({ seq, kind, data }) => ({ seq, kind, data }));
}
export async function sigDrop(callId: string) {
  mem.delete(callId);
  if (useDb()) await pgStore!.sigDrop(callId);
}
/** forget old signals (hourly sweep) */
export async function sigPrune() {
  const cut = Date.now() - TTL_MS;
  for (const [k, list] of mem) { const keep = list.filter(s => s.at > cut); if (keep.length) mem.set(k, keep); else mem.delete(k); }
  if (useDb()) await pgStore!.sigPrune(15);
}
