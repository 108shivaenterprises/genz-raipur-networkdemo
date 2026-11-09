import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** v119 — GENZ Radar: source guards (no DOM test environment). */
const read = (p: string) => readFileSync(path.join(path.resolve(import.meta.dirname, '..'), p), 'utf8');

describe('GENZ Radar', () => {
  const r = read('src/components/GenzRadar.tsx');
  it('is named GENZ Radar and shows real needs only (no hard-coded sample rows, no PROPi name)', () => {
    expect(r).toContain('GENZ RADAR'); expect(r).not.toMatch(/PROPi/i); expect(r).not.toMatch(/Mumbai|Bandra|SAMPLE_EVENTS/);
    expect(r).toContain('api.getRequirements');
  });
  it('starts on the broker\'s own city; clearing the city (Advanced search) looks across India', () => {
    expect(r).toContain("useState(home)"); expect(r).toContain('city.trim() || undefined'); expect(r).toContain('Advanced search');
  });
  it('sits at the top of the Needs screen for everyone but a buyer', () => {
    expect(read('src/components/RequirementsView.tsx')).toContain('{!isBuyer && <GenzRadar');
  });
});
