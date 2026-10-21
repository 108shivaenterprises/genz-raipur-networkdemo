/** v42 — uploaded files (photos, papers) are kept in the database and come back after a serverless restart. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PgStore, setPgStore } from '../server/pgstore.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('file sync (Postgres)', () => {
  it('a file written by one copy appears in another copy; a change and a delete travel too; top-level db files are not synced', async () => {
    const store = new PgStore(url!, { shared: true }); await store.connect(); setPgStore(store);
    await store.pool_query_clear();
    const { createFileSync } = await import('../server/fileSync.js');
    const copyA = createFileSync(); const copyB = createFileSync();
    const cwd = process.cwd();
    const A = fs.mkdtempSync(path.join(os.tmpdir(), 'genz-fs-a-')); const B = fs.mkdtempSync(path.join(os.tmpdir(), 'genz-fs-b-'));
    try {
      // copy A uploads a photo and a paper; also a db json at the top of data/ that must stay local
      process.chdir(A);
      fs.mkdirSync('data/profilephotos', { recursive: true }); fs.mkdirSync('data/iddocs', { recursive: true });
      fs.writeFileSync('data/profilephotos/USR-1.bin', Buffer.from([1, 2, 3, 4]));
      fs.writeFileSync('data/iddocs/D1.bin', Buffer.from('paper one'));
      fs.writeFileSync('data/state.json', '{"local":true}');
      await copyA.pushFiles();
      // copy B (fresh disk, as after a cold start) pulls them
      process.chdir(B);
      await copyB.pullFiles();
      expect(fs.readFileSync('data/profilephotos/USR-1.bin')).toEqual(Buffer.from([1, 2, 3, 4]));
      expect(fs.readFileSync('data/iddocs/D1.bin').toString()).toBe('paper one');
      expect(fs.existsSync('data/state.json')).toBe(false);
      // A changes one and deletes the other
      process.chdir(A);
      fs.writeFileSync('data/profilephotos/USR-1.bin', Buffer.from([9, 9]));
      fs.rmSync('data/iddocs/D1.bin');
      await new Promise(r => setTimeout(r, 20));
      await copyA.pushFiles();
      process.chdir(B);
      await copyB.pullFiles();
      expect(fs.readFileSync('data/profilephotos/USR-1.bin')).toEqual(Buffer.from([9, 9]));
      expect(fs.existsSync('data/iddocs/D1.bin')).toBe(false);
      // nothing changed: a second pull is a no-op
      await copyB.pullFiles();
    } finally { process.chdir(cwd); fs.rmSync(A, { recursive: true, force: true }); fs.rmSync(B, { recursive: true, force: true }); setPgStore(null); await store.close(); }
  });
});
