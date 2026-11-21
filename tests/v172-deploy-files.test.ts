import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/** Docker / env / CI wiring (static checks; the real `docker build` runs in CI). */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

describe('Docker image', () => {
  it('copies every runtime dir the server imports', () => {
    const d = read('Dockerfile');
    expect(d).toContain('COPY src/shared ./src/shared'); expect(d).toContain('COPY src/types ./src/types');
    // Dockerfile allows full-line comments only: no trailing `# ...` on instruction lines
    for (const l of d.split('\n')) if (/^(COPY|RUN|ENV|CMD|EXPOSE|USER|WORKDIR|FROM|HEALTHCHECK)\b/.test(l)) expect(l, l).not.toMatch(/\s#\s/);
    expect(d).toContain('--start-period=60s');
    expect(d).toContain('HEALTHCHECK'); expect(d).toContain('/api/health');
    // every src/* directory the server imports is copied
    const dirs = new Set<string>();
    const walk = (p: string) => { for (const f of readdirSync(p)) { const fp = path.join(p, f); if (statSync(fp).isDirectory()) walk(fp); else if (fp.endsWith('.ts')) for (const m of readFileSync(fp, 'utf8').matchAll(/from '(?:\.\.?\/)+src\/([a-z]+)\//g)) dirs.add(m[1]); } };
    walk(path.join(ROOT, 'server')); for (const m of read('server.ts').matchAll(/from '\.\/src\/([a-z]+)\//g)) dirs.add(m[1]);
    for (const x of dirs) expect(d, x).toContain(`COPY src/${x} ./src/${x}`);
  });
  it('keeps the Vercel demo files out of the image', () => {
    const i = read('.dockerignore').split('\n');
    for (const x of ['api', 'server/vercelBoot.ts', '.env.*']) expect(i).toContain(x);
  });
});
describe('compose + env', () => {
  const c = read('docker-compose.yml'); const e = read('.env.production.example');
  it('requires prod-critical values and rotates logs', () => {
    for (const k of ['DB_PASSWORD', 'AUTH_SECRET', 'PUBLIC_URL', 'DOMAIN']) expect(c).toContain(`\${${k}:?`);
    expect(c).toContain('max-size'); expect(c).toContain('max-file'); expect(c).toContain('mem_limit'); expect(c).toContain('NODE_OPTIONS');
    expect(c).toContain('FEATURE_VOICE: ${FEATURE_VOICE:-false}');
    for (const k of ['KYC_VAULT_KEY_FILE', 'ALLOW_FRESH_DB', 'PGSSLMODE', 'DATABASE_SCHEMA', 'VAPID_KEY_FILE', 'SEED_ADMIN_CITY', 'SEED_ADMIN_COMPANY', 'BACKUP_EVERY_MS', 'BACKUP_KEEP', 'VIDEO_MAX_MB', 'INLET_DAILY_CAP', 'KYC_RETAIN_DAYS']) expect(c, k).toMatch(new RegExp(`^\\s+${k}: \\$\\{${k}:-`, 'm'));
    for (const k of ['ALLOW_FILE_DB', 'ALLOW_VAULT_KEY_IN_DATA']) expect(c, k).not.toContain(k);
  });
  it('admin email default matches the deploy doc', () => {
    expect(c).toContain('admin@genzbuildcon.com'); expect(c).not.toContain('admin@example.com');
    expect(read('docs/DEPLOY_INDIA.md')).toContain('admin@genzbuildcon.com');
  });
  it('the example lists every key and holds no real value', () => {
    for (const k of ['DB_PASSWORD', 'AUTH_SECRET', 'KYC_VAULT_KEY', 'AUDIT_HMAC_KEY', 'PUBLIC_URL', 'DOMAIN', 'ADMIN_EMAIL', 'GRIEVANCE_EMAIL', 'OTP_MODE', 'FEATURE_VOICE', 'DIGILOCKER_MODE']) expect(e, k).toMatch(new RegExp(`^#? ?${k}=`, 'm'));
    expect(e).toMatch(/^AUTH_SECRET=\s*(#.*)?$/m); expect(e).toMatch(/^KYC_VAULT_KEY=\s*(#.*)?$/m);
  });
  it('documents the DB password format and the upgrade note', () => {
    expect(e).toContain('openssl rand -hex 24');
    const d = read('docs/DEPLOY_INDIA.md'); expect(d).toContain('openssl rand -hex 24'); expect(d).toContain('UPGRADE NOTE'); expect(d).toMatch(/UPGRADE NOTE[\s\S]*PUBLIC_URL/);
    expect(read('.env.example')).toContain('PUBLIC_URL');
  });
  it('the server refuses to boot in production without PUBLIC_URL / KYC decision', () => {
    const s = read('server.ts');
    expect(s).toContain('PUBLIC_URL must be set'); expect(s).toContain('KYC_VAULT_DISABLED'); expect(s).toContain('vaultKeyProblem()');
  });
  it('CI runs tsc, vitest, vite build and docker build without secrets', () => {
    const y = read('.github/workflows/ci.yml');
    for (const x of ['tsc --noEmit', 'vitest run', 'vite build', 'docker build']) expect(y).toContain(x);
    expect(y.indexOf('docker build --check')).toBeGreaterThan(-1); expect(y.indexOf('docker build --check')).toBeLessThan(y.indexOf('docker build -t'));
    expect(y).not.toContain('secrets.');
  });
});
