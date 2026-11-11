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

describe('v125 — nothing reads as a demand for papers on an enquiry', () => {
  it('the room\'s paper / ID sender is folded, marked optional, and lists a photo before any ID', () => {
    const s = read('server/clientroom.ts'); expect(s).toContain('<details id="docs" data-testid="room-docs"'); expect(s).toContain('Nothing is needed just to enquire'); expect(s).toContain('[...DOC_KINDS].sort((x, y) => Number(x.kyc) - Number(y.kyc))');
  });
  it('the QR form asks five things up front; city, type and “anything else” are behind “tell more”', () => {
    const s = read('server/shopPartners.ts'); const more = s.indexOf('data-testid="qr-more"'); expect(more).toBeGreaterThan(0);
    for (const up of ['name="name"', 'name="phone"', 'name="locality"', 'name="budget"']) expect(s.indexOf(up), up).toBeLessThan(more);
    for (const folded of ['name="city"', 'name="ptype"', 'name="note"']) expect(s.indexOf(folded), folded).toBeGreaterThan(more);
  });
});

describe('v126', () => {
  it('the QR form asks “what do you need” once (four choices), and a first share is “fixed”, not “changed”', () => {
    const s = read('server/shopPartners.ts'); expect(s).not.toContain('qr-want-home'); expect(s).toContain("c.from > 0 ? '⚠ आपका हिस्सा बदला है / Your share changed' : '💰 आपका हिस्सा तय हुआ / Your share is fixed'");
  });
});
