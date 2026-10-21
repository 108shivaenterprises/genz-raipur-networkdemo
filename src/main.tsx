import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { LangProvider } from './lib/i18n.js';
import { LegalPage } from './components/LegalPages.js';
import { lazyView } from './lib/lazyView.js';
const StrengthPage = lazyView(() => import('./components/StrengthPage.js'), 'StrengthPage');
import './index.css';
import { installGlobalErrorReporting } from './lib/clientErrors.js';

installGlobalErrorReporting();

function Root() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  if (hash === '#/privacy') return <LegalPage kind="privacy" />;
  if (hash === '#/terms') return <LegalPage kind="terms" />;
  // v20: the read-only network-strength page GENZ shares with builders (no login)
  if (hash.startsWith('#/strength/')) return <React.Suspense fallback={null}><StrengthPage token={hash.slice('#/strength/'.length)} /></React.Suspense>;
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <LangProvider>
    <Root />
  </LangProvider>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
} else if ('serviceWorker' in navigator && import.meta.env.DEV) {
  // v36.2 — on a developer / demo machine (npm run dev) there is no service worker. One left over from an earlier production run on the same
  // address used to serve OLD copies of screen files next to new ones, and screens crashed ("This screen hit a problem"). Remove it once.
  navigator.serviceWorker.getRegistrations().then(async (regs) => {
    const keys = 'caches' in window ? (await caches.keys()).filter(k => k !== 'genz-shell-v4') : [];
    if (!keys.length) return; // only when an OLD cache is there (the sign of a leftover worker)
    await Promise.all(regs.map(r => r.unregister()));
    await Promise.all(keys.map(k => caches.delete(k)));
    try { if (!sessionStorage.getItem('genz-sw-cleaned')) { sessionStorage.setItem('genz-sw-cleaned', '1'); location.reload(); } } catch { /* ignore */ }
  }).catch(() => {});
}
