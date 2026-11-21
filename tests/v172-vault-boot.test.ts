import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const src = (f: string) => readFileSync(path.resolve(import.meta.dirname, '..', f), 'utf8');
describe('KYC key boot check', () => {
  it('assertProductionConfig reuses vaultCrypto; the admin message is silent when disabled', () => {
    expect(src('server.ts')).toMatch(/else if \(!vaultKey\(\)\) problems\.push\(vaultKeyProblem\(\)/);
    expect(src('server/kycvault.ts')).toContain("process.env.KYC_VAULT_DISABLED === 'true' ? '' : vaultKeyProblem()");
  });
});
