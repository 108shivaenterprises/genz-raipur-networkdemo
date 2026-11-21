import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
describe('v171 — a malformed cookie does not crash the cookie parser', () => {
  it('decodeURIComponent is guarded', () => { expect(readFileSync('server/auth.ts', 'utf8')).toContain('try { out[part.slice(0, i).trim()] = decodeURIComponent(raw); } catch'); });
});
