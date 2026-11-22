/**
 * Tiny offline queue for the client pipeline. When the network is down, "add client" and "move stage" are kept in
 * localStorage and sent when the connection returns. Every queued "add" carries a `clientRef`, so a retry can never create a duplicate.
 */
export type PendingOp = { kind: 'add'; body: any } | { kind: 'stage'; id: string; body: any };
const LEGACY_KEY = 'genz.pending.v1';
// v178: the queue belongs to ONE signed-in user (a shared phone must never send A's offline work as B)
let owner = '';
export function setQueueUser(id: string) {
  owner = id;
  // S6: the pre-v178 shared queue is moved into this user's own key (when that is empty), never silently dropped
  try { const old = localStorage.getItem(LEGACY_KEY); if (old && id) { if (!localStorage.getItem(keyOf(id))) localStorage.setItem(keyOf(id), old); localStorage.removeItem(LEGACY_KEY); } } catch { /* blocked */ }
}
const keyOf = (id = owner) => (id ? `${LEGACY_KEY}.${id}` : '');
export function clearQueue(id = owner) { try { const k = keyOf(id); if (k) localStorage.removeItem(k); localStorage.removeItem(LEGACY_KEY); } catch { /* blocked */ } }

export function readQueue(k = keyOf()): PendingOp[] {
  try { return k ? JSON.parse(localStorage.getItem(k) || '[]') : []; } catch { return []; }
}
function write(q: PendingOp[], k = keyOf()) { try { if (k) localStorage.setItem(k, JSON.stringify(q.slice(-200))); } catch { /* storage full or blocked */ } }
export function enqueue(op: PendingOp) { write([...readQueue(), op]); }
export const pendingCount = () => readQueue().length;

export const isNetworkError = (e: unknown) => e instanceof TypeError || (e as { code?: string })?.code === 'OFFLINE' || (typeof navigator !== 'undefined' && navigator.onLine === false);

/** Sends queued operations in order. Stops at the first network failure; drops operations the server rejects for good (4xx). */
export async function flushQueue(send: (op: PendingOp) => Promise<unknown>): Promise<number> {
  const k = keyOf(); let q = readQueue(k); let sent = 0;   // this user's key, fixed for the whole flush
  while (q.length) {
    try { await send(q[0]); sent++; q = q.slice(1); write(q, k); }
    catch (e) { if (isNetworkError(e)) break; q = q.slice(1); write(q, k); }
  }
  return sent;
}
