/** v39 — shared mode: several short-lived instances (Vercel) on one Postgres, kept in step by a revision number. */
import { describe, it, expect } from 'vitest';
import { PgStore } from '../server/pgstore.js';

const url = process.env.TEST_DATABASE_URL;

// Runs only when a throw-away Postgres is provided:  TEST_DATABASE_URL=postgres://... npm test
describe.skipIf(!url)('PgStore shared mode', () => {
  it('no single-writer lock; each commit moves the revision; another instance sees it and reloads the change', async () => {
    const a = new PgStore(url!, { shared: true }); await a.connect();
    const b = new PgStore(url!, { shared: true }); await b.connect(); // would throw "lock" in normal mode
    const sa: any = (await a.load()) || { users: [], settings: { x: 0 } };
    sa.users = [{ id: 's1', n: 'one' }]; sa.settings = { x: 1 };
    a.schedule(sa);
    expect(a.isDirty).toBe(true);
    await a.commitShared(sa);
    expect(a.isDirty).toBe(false);
    const r1 = await a.revNow(); expect(r1).toBe(a.rev);

    const sb: any = await b.load();
    expect(b.rev).toBe(r1);
    expect(sb.users.find((u: any) => u.id === 's1').n).toBe('one');
    expect(sb.__rev).toBeUndefined(); // the revision never leaks into the app's data

    sb.users.find((u: any) => u.id === 's1').n = 'two'; b.schedule(sb); await b.commitShared(sb);
    expect(await a.revNow()).not.toBe(a.rev); // a must reload
    const again: any = await a.load();
    expect(again.users.find((u: any) => u.id === 's1').n).toBe('two');

    // both write without seeing each other: a's memory is marked stale (rev -1) so it reloads next time
    again.settings = { x: 2 }; a.schedule(again);
    sb.users.push({ id: 's2', n: 'b-only' }); b.schedule(sb); await b.commitShared(sb);
    await a.commitShared(again);
    expect(a.rev).toBe(-1);
    const merged: any = await a.load();
    expect(merged.settings).toEqual({ x: 2 });
    expect(merged.users.map((u: any) => u.id).sort()).toEqual(['s1', 's2']); // a did not delete b's new record
    await a.close(); await b.close();
  });
});
