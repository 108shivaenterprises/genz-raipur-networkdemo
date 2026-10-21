import { describe, it, expect, afterEach } from 'vitest';
import config from '../vite.config';

/**
 * Regression: with `npm run dev` the Vite file watcher saw every write to data/database.json and hard-reloaded the browser,
 * so opening a screen whose API saves (e.g. "Today & Clients") dropped the user back on the dashboard.
 */
const prev = process.env.DISABLE_HMR;
afterEach(() => { if (prev === undefined) delete process.env.DISABLE_HMR; else process.env.DISABLE_HMR = prev; });
const load = async () => (typeof config === 'function' ? await (config as any)({ command: 'serve', mode: 'development' }) : config) as any;

describe('dev server file watching', () => {
  it('ignores the runtime data the app server rewrites', async () => {
    delete process.env.DISABLE_HMR;
    const c = await load();
    expect(c.server.hmr).toBe(true);
    const ignored: string[] = c.server.watch.ignored;
    for (const dir of ['data', 'backups', 'dist', 'docs', 'tests', 'deploy']) expect(ignored).toContain(`**/${dir}/**`);
  });

  it('does not ignore front-end sources (hot reload of src/ keeps working)', async () => {
    delete process.env.DISABLE_HMR;
    const ignored: string[] = (await load()).server.watch.ignored;
    expect(ignored.some(g => /src|public|index\.html/.test(g))).toBe(false);
  });

  it('keeps file watching off when HMR is disabled', async () => {
    process.env.DISABLE_HMR = 'true';
    const c = await load();
    expect(c.server.hmr).toBe(false);
    expect(c.server.watch).toBeNull();
  });
});
