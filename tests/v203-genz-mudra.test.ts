import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { spawn, ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort } from './helpers/port.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

describe('v203 · GENZ Mudra (Buyer/Tenant Only, Brokerage Calculation, 3-Stage Unlock & Rebrand)', () => {
  let port: number;
  let baseUrl: string;
  let proc: ChildProcess;
  let httpDir: string;
  let inProcDir: string;
  const originalCwd = process.cwd();
  let cfg: any;
  let adminCookie: string;
  let buyerCookie: string;
  let brokerUser: any;
  let buyerUser: any;

  async function login(email: string): Promise<string> {
    const r = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: cfg.demoPassword }),
    });
    expect(r.status).toBe(200);
    return r.headers.get('set-cookie')!.split(';')[0];
  }

  const call = (cookie: string, method: string, url: string, body?: unknown) =>
    fetch(`${baseUrl}${url}`, {
      method,
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  beforeAll(async () => {
    port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    httpDir = mkdtempSync(path.join(tmpdir(), 'genz-mudra-http-'));
    mkdirSync(path.join(httpDir, 'data'));

    proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
      cwd: httpDir,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        NODE_ENV: 'development',
        DEMO_MODE: 'true',
        SEED_DEMO_DATA: 'true',
        DISABLE_HMR: 'true',
      },
      stdio: 'ignore',
    });

    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(`${baseUrl}/api/auth/config`);
        if (r.ok) {
          cfg = await r.json();
          break;
        }
      } catch {
        // server starting up
      }
      await new Promise(r => setTimeout(r, 250));
    }
    expect(cfg).toBeTruthy();

    const adminUser = cfg.demoAccounts.find(
      (a: any) => a.role === 'SUPERADMIN' && a.verificationStatus === 'VERIFIED'
    );
    brokerUser = cfg.demoAccounts.find(
      (a: any) => a.role === 'BROKER' && a.verificationStatus === 'VERIFIED'
    );
    buyerUser = cfg.demoAccounts.find(
      (a: any) => a.role === 'BUYER_TENANT' && a.verificationStatus === 'VERIFIED'
    );
    expect(adminUser).toBeTruthy();
    expect(brokerUser).toBeTruthy();
    expect(buyerUser).toBeTruthy();

    adminCookie = await login(adminUser.email);
    buyerCookie = await login(buyerUser.email);
  }, 40_000);

  afterAll(async () => {
    proc?.kill();
    await new Promise(r => setTimeout(r, 500));
    process.chdir(originalCwd);
    if (httpDir) rmSync(httpDir, { recursive: true, force: true });
    if (inProcDir) rmSync(inProcDir, { recursive: true, force: true });
  });

  it('1. Buyer/Tenant Only: POST /api/coins/credit for a BROKER user returns HTTP 403', async () => {
    const res = await call(adminCookie, 'POST', '/api/coins/credit', {
      dealId: 'DEAL-MUDRA-BROKER-BLOCK',
      userId: brokerUser.id,
      buyerBrokerage: 100000,
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('GENZ Mudra is only available for Buyers and Tenants, not Brokers.');
  });

  it('2. Brokerage-based calculation + Initial LOCKED_VISIT: credits 1,500 GENZ Mudra at 1% of 150,000 into lockedBalance', async () => {
    const beforeWalletRes = await call(buyerCookie, 'GET', '/api/coins/wallet');
    expect(beforeWalletRes.status).toBe(200);
    const beforeWallet = await beforeWalletRes.json();

    const creditRes = await call(adminCookie, 'POST', '/api/coins/credit', {
      dealId: 'DEAL-MUDRA-150K',
      userId: buyerUser.id,
      buyerBrokerage: 150000,
    });
    expect(creditRes.status).toBe(201);
    const creditBody = await creditRes.json();
    expect(creditBody.success).toBe(true);
    expect(creditBody.entry.coinsIssued).toBe(1500);
    expect(creditBody.entry.coinsRemaining).toBe(1500);
    expect(creditBody.entry.rewardPct).toBe(1);
    expect(creditBody.entry.status).toBe('LOCKED_VISIT');

    const afterWalletRes = await call(buyerCookie, 'GET', '/api/coins/wallet');
    expect(afterWalletRes.status).toBe(200);
    const afterWallet = await afterWalletRes.json();
    expect(afterWallet.lockedBalance).toBe(beforeWallet.lockedBalance + 1500);
    expect(afterWallet.activeBalance).toBe(beforeWallet.activeBalance);
  });

  it('3. 3-Stage Unlock Flow: LOCKED_VISIT -> LOCKED_REGISTRY -> ACTIVE with expiresAt', async () => {
    inProcDir = mkdtempSync(path.join(tmpdir(), 'genz-mudra-inproc-'));
    mkdirSync(path.join(inProcDir, 'data'));
    process.env.DEMO_MODE = 'true';
    process.env.SEED_DEMO_DATA = 'true';
    process.chdir(inProcDir);

    const { db } = await import('../server/db.js');
    const {
      creditCoinsForDeal,
      unlockCoinsOnVisitVerified,
      unlockCoinsOnCommissionAgreement,
    } = await import('../server/coins.js');

    const state = db.getState();
    const buyer = state.users.find(u => u.role === 'BUYER_TENANT');
    const admin = state.users.find(u => u.role === 'SUPERADMIN' || u.role === 'ADMIN');
    expect(buyer).toBeTruthy();
    expect(admin).toBeTruthy();

    const dealId = 'DEAL-MUDRA-3STAGE-001';
    const credited = creditCoinsForDeal({
      dealId,
      userId: buyer!.id,
      buyerBrokerage: 150000,
      issuedBy: admin!.id,
    });
    expect(credited.ok).toBe(true);
    if (!credited.ok) return;
    expect(credited.entry.status).toBe('LOCKED_VISIT');
    expect(credited.entry.coinsIssued).toBe(1500);

    // Stage 1 -> Stage 2: Site visit verified
    const visitUnlocked = unlockCoinsOnVisitVerified(buyer!.id, dealId);
    expect(visitUnlocked.length).toBe(1);
    expect(visitUnlocked[0].status).toBe('LOCKED_REGISTRY');

    // Stage 2 -> Stage 3: Commission agreement executed
    const beforeUnlockMs = Date.now();
    const activeUnlocked = unlockCoinsOnCommissionAgreement(buyer!.id, dealId);
    expect(activeUnlocked.length).toBe(1);
    expect(activeUnlocked[0].status).toBe('ACTIVE');
    expect(activeUnlocked[0].unlockedAt).toBeTruthy();
    expect(activeUnlocked[0].expiresAt).toBeTruthy();
    expect(new Date(activeUnlocked[0].expiresAt).getTime()).toBeGreaterThan(beforeUnlockMs);

    // Verify entry is now counted in activeBalance
    const activeBalance = db
      .getState()
      .coinEntries.filter(
        e => e.userId === buyer!.id && (e.status === 'ACTIVE' || e.status === 'PARTIALLY_REDEEMED')
      )
      .reduce((sum, e) => sum + e.coinsRemaining, 0);
    expect(activeBalance).toBeGreaterThanOrEqual(1500);
  });

  it('4. Frontend Rebrand: GenzCoinsWallet.tsx and SuperadminCoinsPanel.tsx reflect GENZ Mudra copy and LOCKED_VISIT', () => {
    const walletSrc = readFileSync(path.join(ROOT, 'src/components/GenzCoinsWallet.tsx'), 'utf8');
    expect(walletSrc).toContain('GENZ Mudra');
    expect(walletSrc).toContain('Cash Discounts on Your Upcoming House Work');
    expect(walletSrc).toContain('LOCKED_VISIT');
    expect(walletSrc).toContain('Contact GENZ to book your service');

    const adminSrc = readFileSync(path.join(ROOT, 'src/components/SuperadminCoinsPanel.tsx'), 'utf8');
    expect(adminSrc).toContain('GENZ Mudra');
    expect(adminSrc).toContain('LOCKED_VISIT');
  });

  it('5. Tenant Rental Commission: credits Mudra on rental brokerage even when rent < minDealValueInr', async () => {
    const res = await call(adminCookie, 'POST', '/api/coins/credit', {
      dealId: 'DEAL-RENT-TENANT-001',
      userId: buyerUser.id,
      dealType: 'RENT',
      buyerBrokerage: 50000,
      dealValueInr: 50000,
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.entry.coinsIssued).toBe(500);
    expect(body.entry.status).toBe('LOCKED_VISIT');
  });

  it('6. Direct Partner Deal Rule: rejects redemption when bookedViaGenz is false', async () => {
    const res = await call(buyerCookie, 'POST', '/api/coins/redeem', {
      partnerName: 'Direct Contractor',
      partnerCategory: 'Painter',
      invoiceAmountInr: 100000,
      invoiceRef: 'INV-DIRECT-01',
      bookedViaGenz: false,
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/booked via GENZ/i);
  });
});
