import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { greetName } from '../src/lib/utils';

/** v122 — UI pass: no repeated launcher, a proper greeting, the buyer's own bottom bar, Radar does not miss city-less needs. */
const ROOT = path.resolve(import.meta.dirname, '..'); const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
describe('v122 UI pass', () => {
  it('greets by the name, not the title', () => {
    expect(greetName('Er. Ankit Sharma')).toBe('Ankit'); expect(greetName('Adv Devendra Mishra')).toBe('Devendra'); expect(greetName('Vikramaditya Singh')).toBe('Vikramaditya'); expect(greetName('Dr.')).toBe('Dr.'); expect(greetName('')).toBe('');
  });
  it('the floating speed-dial is gone (it repeated search, the home tiles and the bottom bar)', () => {
    expect(existsSync(path.join(ROOT, 'src/components/CommandDock.tsx'))).toBe(false); expect(read('src/App.tsx')).not.toContain('CommandDock');
  });
  it('a buyer has his own bottom bar and no second list of the same links', () => {
    expect(read('src/components/NavigationTabs.tsx')).toContain("BUYER_TENANT: [HOME, { ids: ['properties']"); expect(read('src/components/RoleHome.tsx')).not.toContain("'What next?'");
  });
  it('a need without a city is found under its broker\'s city', () => {
    expect(read('server.ts')).toContain('sameCity(r.city || db.getState().users.find(u => u.id === r.assignedBrokerId)?.city, qCity)');
  });
});
