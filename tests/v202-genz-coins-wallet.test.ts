import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

describe('v202 · GENZ Coins & Affiliated Partner Discount Wallet + Cactus Bridge', () => {
  it('configures default 1% reward, 6-month (180d) validity, and invoice slabs in server/db.ts', () => {
    const dbSrc = readFileSync(path.join(ROOT, 'server/db.ts'), 'utf8');
    expect(dbSrc).toContain('DEFAULT_GENZ_COIN_CONFIG');
    expect(dbSrc).toContain('defaultRewardPct: 1');
    expect(dbSrc).toContain('validityDays: 180');
    expect(dbSrc).toContain('maxDiscountPct: 10');
    expect(dbSrc).toContain('maxDiscountPct: 15');
    expect(dbSrc).toContain('maxDiscountPct: 20');
    expect(dbSrc).toContain('GZC-DEMO-0001');
  });

  it('implements /api/coins backend with SUPERADMIN controls, slab enforcement, and zero hard-cash payout', () => {
    const coinsPath = path.join(ROOT, 'server/coins.ts');
    expect(existsSync(coinsPath)).toBe(true);
    const coinsSrc = readFileSync(coinsPath, 'utf8');
    expect(coinsSrc).toContain("r.get('/config'");
    expect(coinsSrc).toContain("r.put('/config'");
    expect(coinsSrc).toContain("r.get('/wallet'");
    expect(coinsSrc).toContain("r.post('/redeem'");
    expect(coinsSrc).toContain("r.get('/admin/ledger'");
    expect(coinsSrc).toContain("SUPERADMIN");

    const srvSrc = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
    expect(srvSrc).toContain("app.use('/api/coins', createCoinsRouter())");
  });

  it('wires GenzCoinsWallet into HomeInsights and SuperadminCoinsPanel into ControlCenter', () => {
    const walletPath = path.join(ROOT, 'src/components/GenzCoinsWallet.tsx');
    const adminPath = path.join(ROOT, 'src/components/SuperadminCoinsPanel.tsx');
    expect(existsSync(walletPath)).toBe(true);
    expect(existsSync(adminPath)).toBe(true);

    const walletSrc = readFileSync(walletPath, 'utf8');
    expect(walletSrc).toContain('parseQuoteWithCactus');
    expect(walletSrc).toContain('data-testid="coins-redeem-btn"');

    const adminSrc = readFileSync(adminPath, 'utf8');
    expect(adminSrc).toContain('data-testid="superadmin-coins-panel"');

    const hiSrc = readFileSync(path.join(ROOT, 'src/components/HomeInsights.tsx'), 'utf8');
    expect(hiSrc).toContain('<GenzCoinsWallet />');

    const ccSrc = readFileSync(path.join(ROOT, 'src/components/ControlCenter.tsx'), 'utf8');
    expect(ccSrc).toContain('<SuperadminCoinsPanel');
  });
});
