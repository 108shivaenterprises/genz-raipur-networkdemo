import { describe, it, expect, afterEach } from 'vitest';
import { permissionsForRole, ROLE_PERMISSIONS, ALL_ROLES } from '../server/permissions.js';

// v155 — GENZ is a tech platform: due diligence, title check and legal help are off for every role until legal help launches.
describe('legal features are off by default', () => {
  const prev = process.env.LEGAL_FEATURES;
  afterEach(() => { if (prev === undefined) delete process.env.LEGAL_FEATURES; else process.env.LEGAL_FEATURES = prev; });

  it('no role holds a dd:, legal: or readiness: permission', () => {
    delete process.env.LEGAL_FEATURES;
    for (const r of ALL_ROLES) expect(permissionsForRole(r).filter(p => /^(dd:|legal:|readiness:)/.test(p)), r).toEqual([]);
  });
  it('the switch brings them back (code stays dormant, not deleted)', () => {
    process.env.LEGAL_FEATURES = 'on';
    expect(permissionsForRole('LEGAL_COUNSEL')).toEqual(ROLE_PERMISSIONS.LEGAL_COUNSEL);
    expect(permissionsForRole('LEGAL_COUNSEL')).toContain('dd:read');
  });
});
