import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * v20 — every big screen is its own file, downloaded only when someone opens it (the first load used to be one 2.3 MB file).
 * After a new version is deployed the old screen files are gone; the first failed download reloads the page once to pick up
 * the new version (not again within 30 s, so a real outage shows the error card instead of a reload loop).
 */
const KEY = 'genz.chunkReloadAt';

export function lazyView<M extends Record<string, any>, K extends keyof M & string>(load: () => Promise<M>, name: K): LazyExoticComponent<M[K]> {
  return lazy(async () => {
    try {
      const m = await load();
      return { default: m[name] as ComponentType<any> };
    } catch (e) {
      let last = 0;
      try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* storage blocked */ }
      if (Date.now() - last > 30_000) {
        try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
        window.location.reload();
        return new Promise<never>(() => { /* page is reloading */ });
      }
      throw e;
    }
  }) as unknown as LazyExoticComponent<M[K]>;
}

/** Warm the files of screens the user is likely to open next, once the browser is idle (no effect on first paint). */
export function prefetch(loaders: (() => Promise<unknown>)[]) {
  const run = () => loaders.forEach(l => { l().catch(() => { /* ignore — real open will retry */ }); });
  const w = window as any;
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: 4000 });
  else window.setTimeout(run, 2500);
}
