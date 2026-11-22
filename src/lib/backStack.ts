import { useEffect, useRef } from 'react';

/**
 * v178 — the phone's Back button closes an open sheet / drawer instead of leaving the PWA.
 * Opening pushes one history entry; Back (popstate) closes; closing by other means (✕, backdrop, Escape) takes the entry off again.
 * If a tab change already replaced the entry (see App.setActiveTab) there is nothing left to take off.
 */
export function useBackClose(open: boolean, close: () => void, key = 'genzSheet') {
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    let popped = false;
    try { window.history.pushState({ ...(window.history.state || {}), [key]: true }, ''); } catch { /* old browser */ }
    const pop = (e: PopStateEvent) => { if (!e.state?.[key]) { popped = true; closeRef.current(); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('popstate', pop); window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('popstate', pop); window.removeEventListener('keydown', esc);
      try { if (!popped && window.history.state?.[key]) window.history.back(); } catch { /* old browser */ }
    };
  }, [open, key]);
}

/** a tab change replaces an open sheet's entry (so Back goes to the previous tab) or pushes a new one */
export function pushTabEntry(tab: string) {
  try {
    const st = { genzTab: tab };
    if (window.history.state?.genzSheet) window.history.replaceState(st, ''); else window.history.pushState(st, '');
  } catch { /* old browser */ }
}
