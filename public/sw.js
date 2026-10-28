/* GENZ service worker: app-shell caching only. API calls (/api/*) are NEVER cached — they carry private data. */
const CACHE = 'genz-shell-v5'; // v36.2: new name → every older cache is deleted on activate
// v20: the app is split into many small screen files; keep only the most recent ones so old versions do not pile up
const MAX_ENTRIES = 160;
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png'];
const trim = (c) => c.keys().then((all) => {
  const keys = all.filter((k) => !SHELL.includes(new URL(k.url).pathname)); // never drop the offline shell
  return keys.length > MAX_ENTRIES ? Promise.all(keys.slice(0, keys.length - MAX_ENTRIES).map((k) => c.delete(k))) : null;
});

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // v25: the OCR engine files (several MB) are never put in this cache — the browser's own HTTP cache and the OCR library keep them
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/ocr/') || url.pathname.startsWith('/r/') || url.pathname.startsWith('/sp/')) return; // v82: shop partner pages are private too — never cached. v69: client rooms are private pages — never cached, never replaced by the broker app shell

  if (req.mode === 'navigate') {
    // network first so deployments show up immediately; fall back to cached shell when offline
    e.respondWith(fetch(req).catch(() => caches.match('/')));
    return;
  }
  // hashed build assets (/assets/<name>-<hash>.js): the name changes with every build, so a cached copy is never stale → cache first.
  // v36.2: everything else (screen files of a dev server, icons, manifest…) is NETWORK FIRST — the old "stale-while-revalidate" for all files
  // could serve an old screen file next to a new one and make screens crash.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy).then(() => trim(c))); }
        return res;
      }))
    );
    return;
  }
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});

// v26 — push alerts (new match, offer, owner consent, buyer need, 9 AM digest). The message is encrypted end-to-end by the
// server (RFC 8291) and only says what happened + where to look; customer names / phones never travel in a push.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { t: 'GENZ', b: e.data ? e.data.text() : '' }; }
  const title = d.t || 'GENZ';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.b || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: d.g || 'genz', renotify: true,
    data: { url: typeof d.u === 'string' && d.u.startsWith('/') ? d.u : '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (new URL(c.url).origin === self.location.origin && 'focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
