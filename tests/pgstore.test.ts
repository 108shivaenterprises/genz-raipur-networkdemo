import { describe, it, expect } from 'vitest';
import { PgStore } from '../server/pgstore.js';

const url = process.env.TEST_DATABASE_URL;

// Runs only when a throw-away Postgres is provided:  TEST_DATABASE_URL=postgres://... npm test
describe.skipIf(!url)('PgStore (PostgreSQL write-behind persistence)', () => {
  it('round-trips documents, keeps order, deletes removed docs, and enforces single-writer', async () => {
    const a = new PgStore(url!);
    await a.connect();
    await a.load(); // fresh
    const state: any = { users: [{ id: 'u2', n: 'B' }, { id: 'u1', n: 'A' }], auditEvents: [{ id: 2 }, { id: 1 }], settings: { x: 1 } };
    a.schedule(state);
    await a.flush();

    // a second instance must not be allowed to write concurrently
    const b = new PgStore(url!);
    await expect(b.connect()).rejects.toThrow(/lock/i);
    await b.close().catch(() => {});

    state.users.reverse(); // order change must persist
    state.users[0].n = 'A2';
    state.auditEvents.pop();
    state.settings = { x: 2 };
    a.schedule(state);
    await a.close();

    const c = new PgStore(url!);
    await c.connect();
    const loaded: any = await c.load();
    expect(loaded.users.map((u: any) => u.id)).toEqual(['u1', 'u2']);
    expect(loaded.users[0].n).toBe('A2');
    expect(loaded.auditEvents.map((e: any) => e.id)).toEqual([2]);
    expect(loaded.settings).toEqual({ x: 2 });
    await c.close();
  });

  it('v20: big batches, audit trail written as a tail only, rewrite when it is not a pure append', async () => {
    const a = new PgStore(url!);
    await a.connect();
    await a.load();
    // start from a clean slate for this test's collections
    const state: any = { users: Array.from({ length: 1200 }, (_, i) => ({ id: `U${i}`, n: i })), auditEvents: Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, h: `h${i + 1}` })), settings: { x: 3 } };
    a.schedule(state); await a.flush();
    expect(a.stats.lastRows).toBeGreaterThan(2600);
    // only the 10 new audit rows and the one changed user are written next time
    for (let i = 0; i < 10; i++) state.auditEvents.push({ id: 1501 + i, h: 'new' });
    state.users[5].n = 'changed';
    a.schedule(state); await a.flush();
    expect(a.stats.lastRows).toBe(11);
    // not a pure append any more (an old row removed) → the collection is rewritten
    state.auditEvents.splice(3, 1);
    a.schedule(state); await a.flush();
    await a.close();
    const c = new PgStore(url!);
    await c.connect();
    const loaded: any = await c.load();
    expect(loaded.users.length).toBe(1200);
    expect(loaded.users.find((u: any) => u.id === 'U5').n).toBe('changed');
    expect(loaded.auditEvents.length).toBe(1509);
    expect(loaded.auditEvents.some((e: any) => e.id === 4)).toBe(false);
    expect(loaded.auditEvents[loaded.auditEvents.length - 1].id).toBe(1510);
    expect(loaded.settings).toEqual({ x: 3 });
    await c.close();
  });
});
