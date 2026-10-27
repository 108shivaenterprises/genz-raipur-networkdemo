import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, Loader2, Trash2, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n, useTx } from '../lib/i18n.js';
import { agoLabel } from '../shared/inboxRules.js';

type Row = { id: string; kind: string; title: string; body: string; url?: string; at: string; read: boolean; todo?: boolean; n?: number };
const POLL_MS = 45_000;

/** where a tap goes: a tab of this app (/?tab=…) opens in place; any other in-app path is opened as a page */
export function openInboxUrl(url: string | undefined) {
  if (!url || !url.startsWith('/') || url.startsWith('//')) return;
  try {
    const u = new URL(url, window.location.origin);
    const tab = u.searchParams.get('tab');
    if (u.pathname === '/' && tab) {
      // v79 — the other query parameters (?view=proposals, ?drafts=1, ?sub=bonds …) are what the Home tiles set before they open a tab:
      // set them here too, so a line in the bell lands on the same sub-screen as the Home counter it came from
      try {
        const cur = new URL(window.location.href);
        u.searchParams.forEach((v, k) => { if (k !== 'tab') cur.searchParams.set(k, v); });
        window.history.replaceState(window.history.state, '', cur.toString());
      } catch { /* old browser */ }
      window.dispatchEvent(new CustomEvent('genz:goto-tab', { detail: tab })); return;
    }
    window.location.assign(u.pathname + u.search + u.hash);
  } catch { /* an unusable link: do nothing */ }
}

/**
 * v77 — the notification bell: one place, for every role, where every alert is kept (the same words that go to the phone).
 * Tap a line = it is marked read and you go to the work. "Mark all read" and "Clear all" are at the top of the list.
 */
export const NotificationBell: React.FC = () => {
  const tx = useTx(); const { lang } = useI18n(); const hi = lang === 'hi';
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [err, setErr] = useState('');
  const btn = useRef<HTMLButtonElement>(null);

  const count = useCallback(() => { api.inboxCount().then(r => setUnread(r.unread)).catch(() => { /* signed out or offline: keep the old number */ }); }, []);
  const load = useCallback(async () => {
    setErr('');
    try { const r = await api.inbox(lang); setRows(r.items); setUnread(r.unread); } catch (e: any) { setErr(e.message || 'Error'); }
  }, [lang]);

  // the number follows the server: every 45 s while the app is visible, and when the app comes back to the front
  useEffect(() => {
    count();
    const tick = () => { if (!document.hidden) count(); };
    const t = window.setInterval(tick, POLL_MS);
    window.addEventListener('focus', count); document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); window.removeEventListener('focus', count); document.removeEventListener('visibilitychange', tick); };
  }, [count]);
  useEffect(() => { if (open) load(); else setSure(false); }, [open, load]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open]);
  useEffect(() => { if (!sure) return; const t = window.setTimeout(() => setSure(false), 4000); return () => window.clearTimeout(t); }, [sure]);

  const act = async (fn: () => Promise<any>) => { setBusy(true); setErr(''); try { await fn(); } catch (e: any) { setErr(e.message || 'Error'); } finally { setBusy(false); } };
  const tap = (x: Row) => act(async () => {
    if (!x.read) { const r = await api.inboxRead([x.id]); setUnread(r.unread); setRows(p => p && p.map(y => (y.id === x.id ? { ...y, read: true } : y))); }
    setOpen(false); openInboxUrl(x.url);
  });
  const markAll = () => act(async () => { const r = await api.inboxRead(); setUnread(r.unread); setRows(p => p && p.map(y => ({ ...y, read: true }))); });
  const remove = (x: Row) => act(async () => { const r = await api.inboxRemove(x.id); setUnread(r.unread); setRows(p => p && p.filter(y => y.id !== x.id)); });
  const clearAll = () => { if (!sure) { setSure(true); return; } setSure(false); act(async () => { await api.inboxClear(); setRows([]); setUnread(0); }); };

  const label = unread > 0 ? tx(`Notifications — ${unread} new`, `सूचनाएँ — ${unread} नई`) : tx('Notifications', 'सूचनाएँ');
  const now = Date.now();
  return (
    <div className="relative">
      <button ref={btn} type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog" aria-label={label} title={tx('Notifications', 'सूचनाएँ')} data-testid="header-bell"
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-slate-900">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white" data-testid="header-bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label={tx('Notifications', 'सूचनाएँ')} data-testid="bell-panel"
            className="fixed left-2 right-2 top-16 z-50 max-h-[75vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-13 sm:w-96">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <h2 className="text-sm font-bold text-slate-900">{tx('Notifications', 'सूचनाएँ')}{unread > 0 && <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[11px] font-bold text-rose-700">{unread}</span>}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={tx('Close', 'बंद करें')} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            {rows && rows.length > 0 && (
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                <button type="button" disabled={busy || unread === 0} onClick={markAll} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-700 hover:bg-white disabled:opacity-40" data-testid="bell-mark-all"><CheckCheck className="h-4 w-4" />{tx('Mark all read', 'सब पढ़ा हुआ')}</button>
                <button type="button" disabled={busy} onClick={clearAll} className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold disabled:opacity-40 ${sure ? 'bg-rose-600 text-white' : 'text-rose-700 hover:bg-white'}`} data-testid="bell-clear-all"><Trash2 className="h-4 w-4" />{sure ? tx('Tap again to clear all', 'सब हटाने के लिए फिर दबाएँ') : tx('Clear all', 'सब हटाएँ')}</button>
              </div>
            )}
            <div className="max-h-[58vh] overflow-y-auto">
              {rows === null && !err && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>}
              {err && <p className="px-3 py-2 text-xs text-rose-700">{err}</p>}
              {rows && rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500" data-testid="bell-empty">{tx('Nothing new. You are all caught up.', 'कुछ नया नहीं। सब देख लिया है।')}</p>}
              {rows && rows.length > 0 && (
                <ul className="divide-y divide-slate-100" data-testid="bell-list">
                  {rows.map(x => (
                    <li key={x.id} className={`flex items-start gap-1 ${x.read ? '' : 'bg-sky-50/60'}`} data-testid="bell-item" data-read={x.read ? '1' : '0'}>
                      <button type="button" onClick={() => tap(x)} className="flex min-h-14 min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-left">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.read ? 'bg-transparent' : 'bg-rose-500'}`} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[13px] leading-snug text-slate-900 ${x.read ? 'font-medium' : 'font-bold'}`}>{x.todo && <span className="mr-1.5 inline-block rounded bg-slate-900 px-1.5 py-px align-middle text-[10px] font-bold uppercase tracking-wide text-white" data-testid="bell-todo-chip">{tx('To do', 'करना है')}{x.n ? ` · ${x.n}` : ''}</span>}{x.title}</span>
                          {x.body && <span className="mt-0.5 block break-words text-xs leading-snug text-slate-600">{x.body}</span>}
                          <span className="mt-1 block text-[11px] text-slate-400">{agoLabel(x.at, now, hi)}</span>
                        </span>
                      </button>
                      <button type="button" disabled={busy} onClick={() => remove(x)} aria-label={tx('Remove this notification', 'यह सूचना हटाएँ')} className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40" data-testid="bell-remove"><X className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
