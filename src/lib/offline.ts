/**
 * Tiny offline queue for the client pipeline. When the network is down, "add client" and "move stage" are kept in
 * localStorage and sent when the connection returns. Every queued "add" carries a `clientRef`, so a retry can never create a duplicate.
 */
export type PendingOp = { kind: 'add'; body: any } | { kind: 'stage'; id: string; body: any };
const KEY = 'genz.pending.v1';

export function readQueue(): PendingOp[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(q: PendingOp[]) { try { localStorage.setItem(KEY, JSON.stringify(q.slice(-200))); } catch { /* storage full or blocked */ } }
export function enqueue(op: PendingOp) { write([...readQueue(), op]); }
export const pendingCount = () => readQueue().length;

export const isNetworkError = (e: unknown) => e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);

/** Sends queued operations in order. Stops at the first network failure; drops operations the server rejects for good (4xx). */
export async function flushQueue(send: (op: PendingOp) => Promise<unknown>): Promise<number> {
  let q = readQueue(); let sent = 0;
  while (q.length) {
    try { await send(q[0]); sent++; q = q.slice(1); write(q); }
    catch (e) { if (isNetworkError(e)) break; q = q.slice(1); write(q); }
  }
  return sent;
}
