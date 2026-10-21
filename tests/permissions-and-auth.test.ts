import { describe, it, expect } from 'vitest';
import { can, effectivePermissions, permissionMatrix, PERMISSION_CATALOG } from '../server/permissions.js';
import { hashPassword, verifyPassword, passwordPolicyError, signSession, verifySession, isSafeUrl, secureOtp } from '../server/auth.js';
import { isDealParticipant, canViewDeal } from '../server/access.js';

const u = (role: string, verificationStatus = 'VERIFIED') => ({ id: 'U1', role, verificationStatus }) as any;

describe('role × permission matrix', () => {
  it('every permission referenced by a role exists in the catalog', () => {
    const m = permissionMatrix() as any;
    const known = new Set(Object.keys(PERMISSION_CATALOG));
    const all = JSON.stringify(m);
    expect(all.length).toBeGreaterThan(100);
    for (const role of ['SUPERADMIN', 'ADMIN', 'BROKER', 'PROPERTY_OWNER', 'BUYER_TENANT', 'CONTRACTOR', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL']) {
      effectivePermissions(u(role)).forEach(p => expect(known.has(p)).toBe(true));
    }
  });

  it('only SUPERADMIN can impersonate, invite admins or blacklist', () => {
    for (const p of ['users:impersonate', 'users:invite_admin', 'users:blacklist'] as const) {
      expect(can(u('SUPERADMIN'), p)).toBe(true);
      for (const r of ['ADMIN', 'BROKER', 'PROPERTY_OWNER', 'BUYER_TENANT', 'CONTRACTOR', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL']) {
        expect(can(u(r), p)).toBe(false);
      }
    }
  });

  it('brokers cannot approve CRM bookings, release payouts or record commission payments', () => {
    for (const p of ['crm:booking_decide', 'crm:payout', 'agreement:record_payment', 'dd:legal_signoff', 'builder:appoint_associate'] as const) {
      expect(can(u('BROKER'), p)).toBe(false);
    }
    expect(can(u('ADMIN'), 'permissions:read_matrix')).toBe(true);
    expect(can(u('BROKER'), 'permissions:read_matrix')).toBe(false);
    expect(can(u('BROKER'), 'crm:lead_create')).toBe(true);
    expect(can(u('BROKER'), 'crm:booking_request')).toBe(true);
  });

  it('builders approve bookings and pay brokerage but never do legal sign-off', () => {
    expect(can(u('DEVELOPER_BUILDER'), 'crm:booking_decide')).toBe(true);
    expect(can(u('DEVELOPER_BUILDER'), 'crm:payout')).toBe(true);
    expect(can(u('DEVELOPER_BUILDER'), 'dd:legal_signoff')).toBe(false);
    expect(can(u('DEVELOPER_BUILDER'), 'agreement:read')).toBe(false);
  });

  it('legal counsel signs off but cannot see commissions or chat', () => {
    expect(can(u('LEGAL_COUNSEL'), 'dd:legal_signoff')).toBe(true);
    expect(can(u('LEGAL_COUNSEL'), 'agreement:read')).toBe(false);
    expect(can(u('LEGAL_COUNSEL'), 'deal:chat')).toBe(false);
  });

  it('buyers and contractors have no deal / CRM / inventory-write access', () => {
    for (const r of ['BUYER_TENANT', 'CONTRACTOR']) {
      for (const p of ['deal:read', 'crm:read', 'agreement:read', 'dd:read', 'vault:manage'] as const) expect(can(u(r), p)).toBe(false);
    }
  });

  it('unverified accounts collapse to baseline permissions', () => {
    for (const r of ['BROKER', 'DEVELOPER_BUILDER', 'ADMIN']) {
      const perms = effectivePermissions(u(r, 'PENDING'));
      expect(perms.sort()).toEqual(['self:read', 'self:update']);
    }
  });
});

describe('passwords & sessions', () => {
  it('hashes with salt and verifies', () => {
    const h = hashPassword('Str0ngPassword!');
    expect(h).not.toContain('Str0ngPassword');
    expect(verifyPassword('Str0ngPassword!', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
    expect(hashPassword('Str0ngPassword!')).not.toBe(h);
    expect(verifyPassword('x', undefined)).toBe(false);
  });

  it('enforces the password policy', () => {
    expect(passwordPolicyError('short1A')).toBeTruthy();
    expect(passwordPolicyError('alllowercase123')).toBeTruthy();
    expect(passwordPolicyError('GoodPassw0rd')).toBeNull();
  });

  it('session tokens round-trip and reject tampering', () => {
    const t = signSession('USR-1', 3);
    expect(verifySession(t)?.uid).toBe('USR-1');
    expect(verifySession(t + 'x')).toBeNull();
    const [body, sig] = t.split('.');
    expect(verifySession(`${Buffer.from(JSON.stringify({ uid: 'USR-SUPERADMIN', sv: 3, exp: 9e12 })).toString('base64url')}.${sig}`)).toBeNull();
    expect(body).toBeTruthy();
    expect(verifySession(undefined)).toBeNull();
  });

  it('url / otp helpers', () => {
    expect(isSafeUrl('https://example.com/a.pdf')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('ftp://example.com')).toBe(false);
    expect(secureOtp()).toMatch(/^\d{6}$/);
  });
});

describe('deal visibility', () => {
  const deal: any = { introducingBrokerId: 'B1', closingBrokerId: 'B2', ownerId: 'O1' };
  it('participants + admins only; legal only when allowed', () => {
    expect(isDealParticipant({ id: 'B1', role: 'BROKER' } as any, deal)).toBe(true);
    expect(isDealParticipant({ id: 'B9', role: 'BROKER' } as any, deal)).toBe(false);
    expect(canViewDeal({ id: 'A', role: 'ADMIN' } as any, deal)).toBe(true);
    expect(canViewDeal({ id: 'L', role: 'LEGAL_COUNSEL' } as any, deal)).toBe(false);
    expect(canViewDeal({ id: 'L', role: 'LEGAL_COUNSEL' } as any, deal, { allowLegal: true })).toBe(true);
  });
});
