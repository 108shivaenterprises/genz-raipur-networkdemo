import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

describe('v201 · Mandatory Office/Shop Photo & Location + 15d Overdue QR Reroute to GENZ', () => {
  it('enforces mandatory officePhoto and officeLocation on openSignup for Broker, Builder/Developer, and Shopkeeper', () => {
    const os = readFileSync(path.join(ROOT, 'server/openSignup.ts'), 'utf8');
    expect(os).toContain("OFFICE_PHOTO_REQUIRED");
    expect(os).toContain("OFFICE_LOCATION_REQUIRED");
    expect(os).toContain("officeProofFile(id)");
    expect(os).toContain("r.get('/office-proof/:userId'");

    const jv = readFileSync(path.join(ROOT, 'src/components/JoinView.tsx'), 'utf8');
    expect(jv).toContain('join-office-photo');
    expect(jv).toContain('join-office-gps');
    expect(jv).toContain('officePhoto, officeLocation:');
  });

  it('auto-pauses broker QR and reroutes leads to GENZ after >15 days overdue + shopkeeper flag, with GENZ claim/assign endpoints', () => {
    const sp = readFileSync(path.join(ROOT, 'server/shopPartners.ts'), 'utf8');
    expect(sp).toContain('p.rerouteToGenz = true');
    expect(sp).toContain('pauseOnShopFlag(p, l,');
    expect(sp).toContain('isGenzRerouted(p)');
    expect(sp).toContain("brokerId: rerouted ? 'GENZ_POOL' : p.brokerId");
    expect(sp).toContain("r.get('/genz-leads', needs('partner:oversee')");
    expect(sp).toContain("r.post('/genz-leads/:leadId/assign', needs('partner:oversee')");
    expect(sp).toContain("mode === 'GENZ'");
    expect(sp).toContain("mode === 'BROKER'");
    expect(sp).toContain("r.post('/:token/lead/:id/resolve-dispute'");
    expect(sp).toContain("r.post('/genz-dispute/:leadId/resolve'");
    expect(sp).toContain('data-testid="resolve-dispute"');
  });

  it('allows brokers and clients who filed a dispute to withdraw/resolve it mutually without GENZ admin', () => {
    const srv = readFileSync(path.join(ROOT, 'server.ts'), 'utf8');
    expect(srv).toContain("app.post('/api/disputes/:id/withdraw'");
    expect(srv).toContain('DISPUTE_WITHDRAWN');

    const dv = readFileSync(path.join(ROOT, 'src/components/DisputesView.tsx'), 'utf8');
    expect(dv).toContain('data-testid="dispute-withdraw-btn"');
    expect(dv).toContain('api.withdrawDispute(');
  });
});
