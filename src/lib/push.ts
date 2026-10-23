/** v26 — turn GENZ alerts on/off in this browser (Web Push, free, no app store needed). */
import { api } from './api';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

function keyBytes(b64u: string): Uint8Array {
  const pad = '='.repeat((4 - (b64u.length % 4)) % 4);
  const raw = atob((b64u + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration('/');
  return existing || navigator.serviceWorker.register('/sw.js');
}

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on';

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

/** asks the browser for permission, subscribes, and registers the subscription with GENZ */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
  const { publicKey } = await api.pushKey();
  if (!publicKey) throw new Error('Alerts are not set up on the server yet.');
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const r = await api.pushSubscribe({ endpoint: j.endpoint, keys: j.keys });
  setOwner(r?.me);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) { try { await api.pushUnsubscribe(sub.endpoint); } catch { /* server copy goes on its own after failures */ } await sub.unsubscribe(); }
  setOwner(undefined);
  return 'off';
}

/** v59 — whose alerts this phone carries (kept only in this browser) */
const OWNER_KEY = 'genz.push.owner';
function setOwner(id?: string) { try { if (id) localStorage.setItem(OWNER_KEY, id); else localStorage.removeItem(OWNER_KEY); } catch { /* storage blocked */ } }
function owner(): string | null { try { return localStorage.getItem(OWNER_KEY); } catch { return null; } }

/**
 * v59 — on app start: this phone's alerts follow the person signed in on it, and only if he turned them on himself.
 *  - the push address is his → keys refreshed, nothing else;
 *  - it was someone else's (a shared office phone; he did not sign out) → the server lets it go, this browser drops it,
 *    and the new person sees "Turn on phone alerts";
 *  - the server does not know it (data reset) → bound again only if this same person had turned alerts on here.
 */
export async function syncPush(userId: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const r = await api.pushSync({ endpoint: j.endpoint, keys: j.keys });
    if (r?.state === 'mine') { setOwner(userId); return; }
    if (r?.state === 'none' && owner() === userId) { await api.pushSubscribe({ endpoint: j.endpoint, keys: j.keys }); return; }
    await sub.unsubscribe(); setOwner(undefined);
  } catch { /* offline: the next start tries again */ }
}
