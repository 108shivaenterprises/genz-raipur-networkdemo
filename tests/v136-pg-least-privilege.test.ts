/** v136 — the live app role (genz_app) owns its schema but may not create schemas in the database.
 *  "CREATE SCHEMA IF NOT EXISTS" still needs that right, so every boot fell back to the file database. */
import { describe, it, expect, vi } from 'vitest';
import pg from 'pg';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('PgStore with a least-privilege role', () => {
  it('connects when its schema exists, without the right to create schemas', async () => {
    const admin = new pg.Client({ connectionString: url }); await admin.connect();
    await admin.query('DROP SCHEMA IF EXISTS lp136 CASCADE'); await admin.query('DROP ROLE IF EXISTS genz_lp136');
    await admin.query('CREATE ROLE genz_lp136 LOGIN'); await admin.query('CREATE SCHEMA lp136 AUTHORIZATION genz_lp136');
    const db = new URL(url!).pathname.slice(1);
    const { rows } = await admin.query(`SELECT has_database_privilege('genz_lp136', $1, 'CREATE') AS c`, [db]);
    expect(rows[0].c).toBe(false);   // same as live
    const u = new URL(url!); u.username = 'genz_lp136'; u.password = '';
    const old = process.env.DATABASE_SCHEMA; process.env.DATABASE_SCHEMA = 'lp136'; vi.resetModules();
    try {
      const { PgStore } = await import('../server/pgstore.js');
      const s = new PgStore(u.toString(), { shared: true });
      await s.connect();   // threw "permission denied for database …" before v136
      const t = await admin.query(`SELECT to_regclass('lp136.genz_docs') AS d, to_regclass('lp136.genz_meta') AS m`);
      expect(t.rows[0].d).toBeTruthy(); expect(t.rows[0].m).toBeTruthy();
      await s.close();
    } finally {
      if (old === undefined) delete process.env.DATABASE_SCHEMA; else process.env.DATABASE_SCHEMA = old;
      await admin.query('DROP SCHEMA IF EXISTS lp136 CASCADE'); await admin.query('DROP ROLE IF EXISTS genz_lp136'); await admin.end();
    }
  });
  it('a fresh database still gets its schema made', async () => {
    const admin = new pg.Client({ connectionString: url }); await admin.connect(); await admin.query('DROP SCHEMA IF EXISTS new136 CASCADE');
    const old = process.env.DATABASE_SCHEMA; process.env.DATABASE_SCHEMA = 'new136'; vi.resetModules();
    try {
      const { PgStore } = await import('../server/pgstore.js');
      const s = new PgStore(url!, { shared: true }); await s.connect(); await s.close();
      expect((await admin.query(`SELECT to_regclass('new136.genz_docs') AS d`)).rows[0].d).toBeTruthy();
    } finally {
      if (old === undefined) delete process.env.DATABASE_SCHEMA; else process.env.DATABASE_SCHEMA = old;
      await admin.query('DROP SCHEMA IF EXISTS new136 CASCADE'); await admin.end();
    }
  });
});
