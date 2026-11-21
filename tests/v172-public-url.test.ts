import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { publicBase } from '../server/features';

/** Links sent to people are built from PUBLIC_URL, never from the Host header (production). */
const ROOT = path.resolve(import.meta.dirname, '..');
const req = { protocol: 'http', get: () => 'evil.example' };
const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

describe('publicBase', () => {
  it('uses PUBLIC_URL (trailing slash trimmed) even when a Host header is present', () => {
    process.env.PUBLIC_URL = 'https://net.example.in/';
    expect(publicBase(req)).toBe('https://net.example.in');
  });
  it('falls back to the Host header in dev only', () => {
    delete process.env.PUBLIC_URL; process.env.NODE_ENV = 'development';
    expect(publicBase(req)).toBe('http://evil.example');
    process.env.NODE_ENV = 'production'; delete process.env.PUBLIC_DEMO;
    expect(publicBase(req)).toBe('');
  });
  it('no link builder reads the Host header any more', () => {
    expect(readFileSync(path.join(ROOT, 'server/visitack.ts'), 'utf8')).not.toMatch(/process\.env\.PUBLIC_URL/);
    expect(readFileSync(path.join(ROOT, 'server/visitack.ts'), 'utf8')).toContain('publicBase(a.req)');
    for (const f of ['server/shopPartners.ts', 'server/leadInlets.ts', 'server/consent.ts', 'server/visitack.ts'])
      expect(readFileSync(path.join(ROOT, f), 'utf8'), f).not.toContain("req.get('host')");
  });
});
