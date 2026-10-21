/**
 * v20 — crashes in people's phones reach the GENZ team (Control Center → "App errors"), without any outside service.
 * Only the error text, the screen name and the app version are sent — never form contents, phone numbers or tokens.
 */
let sent = 0;
const seen = new Set<string>();
export function reportClientError(e: { kind: string; area?: string; message: string; stack?: string }) {
  try {
    const key = `${e.kind}|${e.area || ''}|${e.message}`.slice(0, 300);
    if (seen.has(key) || sent >= 20) return; // same error once per page load, at most 20
    seen.add(key); sent++;
    const body = JSON.stringify({
      kind: e.kind, area: e.area || '', message: String(e.message || '').slice(0, 400),
      stack: String(e.stack || '').replace(/\b\d{10,}\b/g, '[n]').slice(0, 1500), path: location.pathname + location.search.replace(/[?&](code|token|t)=[^&]+/g, ''),
      ua: navigator.userAgent.slice(0, 160),
    });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/client-errors', new Blob([body], { type: 'application/json' }));
    else fetch('/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* never let error reporting throw */ }
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', (ev) => {
    if (!ev.error && !ev.message) return;
    reportClientError({ kind: 'window', message: ev.message || String(ev.error), stack: ev.error?.stack });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r: any = ev.reason;
    if (r && typeof r === 'object' && 'status' in r) return; // API errors are shown on screen already
    reportClientError({ kind: 'promise', message: r?.message || String(r), stack: r?.stack });
  });
}
