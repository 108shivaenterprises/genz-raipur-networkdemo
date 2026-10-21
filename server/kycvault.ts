/**
 * v25 — KYC vault.   Mounted at /api/kyc-vault.
 *
 * Krishna's rule: GENZ keeps the member's PAN, FULL Aadhaar number and address, because GENZ may need them in legal matters.
 * How it is kept safe (the Aadhaar Act / UIDAI rules and the DPDP Act are strict about the Aadhaar number, so this is deliberately tight):
 *   • only with the member's tick (KYC_CONSENT), and only while the superadmin's switch is ON;
 *   • AES-256-GCM, a fresh random IV per value, the record id bound in as authenticated data (a value cannot be moved to another member);
 *   • in its OWN collection (`kycVault`) — never on the user object, so no list, card, export of others or log line can carry it;
 *   • the key comes from KYC_VAULT_KEY (set it in production); without it a key file is created in data/ (0600) and the superadmin is warned;
 *   • opened ONLY by a superadmin (`kyc:reveal`), who must give a purpose, a written reason and re-type their own password; every opening is audited
 *     (the audit line never holds the number) and listed on the member's own screen;
 *   • screens show XXXX XXXX 1234 everywhere else; PAN keeps its existing masking;
 *   • erased on a DPDP erasure, when the member deletes it himself (unless a dispute is open), and 14 days after a rejected sign-up.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, KycVaultRecord, DatabaseState } from './db.js';
import { ctx, needs, rateLimit, verifyPassword, IS_PROD } from './auth.js';
import { twoFactorOn, verifySecondFactor } from './twofactor.js';
import { normAadhaar, maskAadhaar } from '../src/shared/idRules.js';
import { vaultKey, vaultReady, vaultKeyProblem, seal, unseal } from './vaultCrypto.js';
import {
  KYC_VAULT_VERSION, addressProblem, pinProblem, normAddress, normPin, REVEAL_PURPOSES, REVEAL_PURPOSE_LABEL, REVEAL_MIN_REASON, REVEAL_MAX_REASON, VIEW_LOG_CAP, VAULT_ORPHAN_DAYS,
  type RevealPurpose,
} from '../src/shared/kycRules.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json(code ? { error, code } : { error });
const recId = (userId: string) => `KYC-${userId}`;

// ───────────────────────── switch + records ─────────────────────────
/** ON when the superadmin has not switched it off AND there is a key. */
export const vaultOn = () => !st().settings.kycVaultOff && vaultReady();
export const vaultOf = (s: DatabaseState, userId: string) => (s.kycVault || []).find(r => r.userId === userId);

export function kycFlags(userId: string) {
  const r = vaultOf(st(), userId);
  return { hasAadhaar: !!r?.aadhaarEnc, hasAddress: !!r?.addressEnc, consentAt: r?.consentAt || null, updatedAt: r?.updatedAt || null, source: r?.source || null, opened: r?.views.length || 0 };
}

export interface KycInput { aadhaar?: string; address?: string; pincode?: string; source?: 'TYPED' | 'PHOTO' | 'MIXED' }
/**
 * Put the FULL Aadhaar and / or the address of `user` into the vault. The caller has already checked the member's consent and the values.
 * Returns { stored:false, why } instead of throwing when the vault is off — the rest of sign-up goes on with the last 4 digits only.
 */
export function storeKyc(user: UserProfile, input: KycInput): { stored: boolean; why?: 'OFF' | 'NO_KEY' } {
  if (!vaultReady()) return { stored: false, why: 'NO_KEY' };
  if (st().settings.kycVaultOff) return { stored: false, why: 'OFF' };
  const s = st(); const at = nowIso();
  let r = vaultOf(s, user.id); const isNew = !r;
  if (!r) { r = { id: recId(user.id), userId: user.id, consentAt: at, consentVersion: KYC_VAULT_VERSION, source: input.source || 'TYPED', createdAt: at, updatedAt: at, views: [] }; s.kycVault.push(r); }
  const aad = normAadhaar(input.aadhaar);
  if (aad) { r.aadhaarEnc = seal(aad, `${r.id}|aadhaar`); r.aadhaarLast4 = aad.slice(-4); }
  const addr = normAddress(input.address);
  if (addr) r.addressEnc = seal(JSON.stringify({ a: addr, p: normPin(input.pincode) || undefined }), `${r.id}|address`);
  if (input.source) r.source = !isNew && r.source !== input.source ? 'MIXED' : input.source;
  r.consentAt = at; r.consentVersion = KYC_VAULT_VERSION; r.updatedAt = at;
  return { stored: true };
}

export function purgeKyc(s: DatabaseState, userId: string): number {
  const before = (s.kycVault || []).length;
  s.kycVault = (s.kycVault || []).filter(r => r.userId !== userId);
  return before - s.kycVault.length;
}

/** Hourly: a vault whose member no longer exists, was erased, or was REJECTED more than VAULT_ORPHAN_DAYS ago is deleted. (Suspended / blacklisted members keep theirs — that is when GENZ needs it.) */
export function sweepKycVault() {
  const s = st(); const now = Date.now(); const before = (s.kycVault || []).length;
  s.kycVault = (s.kycVault || []).filter(r => {
    const u = s.users.find(x => x.id === r.userId);
    if (!u || u.erasedAt) return false;
    if (u.verificationStatus === 'REJECTED' && Date.parse(r.updatedAt) + VAULT_ORPHAN_DAYS * 86400_000 < now) return false;
    return true;
  });
  if (s.kycVault.length !== before) db.save();
}

const openDisputeOf = (s: DatabaseState, userId: string) => s.disputes.some(d => ['OPEN', 'UNDER_REVIEW', 'MEDIATION'].includes(d.status) && (d.complainantId === userId || d.counterpartyId === userId));

/** What a member may see of his own vault: masked Aadhaar, his own address, and who opened it. */
function mineView(u: UserProfile) {
  const s = st(); const r = vaultOf(s, u.id);
  let address = ''; let pincode = ''; let broken = '';
  if (r?.addressEnc) {
    try { const j = JSON.parse(unseal(r.addressEnc, `${r.id}|address`)); address = j.a || ''; pincode = j.p || ''; }
    catch (e: any) { broken = e?.message || 'VAULT_BAD_DATA'; }
  }
  return {
    on: vaultOn(), keyReady: vaultReady(),
    hasAadhaar: !!r?.aadhaarEnc, aadhaar: maskAadhaar(r?.aadhaarLast4 || u.aadhaarLast4), hasAddress: !!r?.addressEnc, address, pincode,
    consentAt: r?.consentAt || null, updatedAt: r?.updatedAt || null, broken,
    // “who looked at my KYC” — the member is told every time
    opened: (r?.views || []).slice().reverse().map(v => ({ at: v.at, by: v.byName, purpose: v.purpose, reason: v.reason })),
  };
}

// ───────────────────────── router ─────────────────────────
export function createKycVaultRouter() {
  const r = Router();
  const audit = (entityId: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, 'VERIFICATION', entityId, action, details); };

  // ── the member's own side ──
  r.get('/mine', needs('self:read'), (_req, res) => {
    const u = me();
    if (u.role !== 'BROKER') return bad(res, 'Only brokers keep KYC details here', 403);
    res.json({ success: true, ...mineView(u) });
  });

  r.put('/mine/address', needs('self:update'), rateLimit('kyc-addr', 30, 3600_000), (req: Request, res: Response) => {
    const u = me();
    if (u.role !== 'BROKER') return bad(res, 'Only brokers keep KYC details here', 403);
    if (!['PENDING', 'VERIFIED'].includes(u.verificationStatus)) return bad(res, 'Your account cannot change KYC details right now', 403);
    const b = z.object({ address: z.string().max(800), pincode: z.string().max(12).optional(), consent: z.literal(true, { message: 'Please agree first' }), source: z.enum(['TYPED', 'PHOTO', 'MIXED']).optional() }).safeParse(req.body);
    if (!b.success) return bad(res, b.error.issues[0]?.message || 'Check the address', 400, 'KYC_CONSENT_REQUIRED');
    const ap = addressProblem(b.data.address); if (ap || !normAddress(b.data.address)) return bad(res, `Address: ${ap?.en || 'write the full address'}`, 400, ap?.code || 'ADDRESS_SHORT');
    const pp = pinProblem(b.data.pincode); if (pp) return bad(res, `PIN code: ${pp.en}`, 400, pp.code);
    if (!vaultReady()) return bad(res, 'The KYC vault is not ready on this server (no encryption key). Tell the GENZ team.', 503, 'VAULT_NO_KEY');
    if (st().settings.kycVaultOff) return bad(res, 'GENZ is not collecting full KYC details right now.', 409, 'VAULT_OFF');
    storeKyc(u, { address: b.data.address, pincode: b.data.pincode, source: b.data.source || 'TYPED' });
    db.save();
    audit(u.id, 'KYC_ADDRESS_SAVED', `${u.name} saved an address in the KYC vault (encrypted)`);
    res.json({ success: true, ...mineView(u) });
  });

  /** DPDP: the member deletes his full Aadhaar + address (the last 4 digits and PAN stay for the ID check). Not while a dispute involving him is open. */
  r.delete('/mine', needs('self:update'), (_req, res) => {
    const u = me(); const s = st();
    if (u.role !== 'BROKER') return bad(res, 'Only brokers keep KYC details here', 403);
    if (openDisputeOf(s, u.id)) return bad(res, 'A dispute involving you is open, so GENZ must keep these details until it is closed. Ask the grievance officer if you need help.', 409, 'KYC_HELD_FOR_DISPUTE');
    const n = purgeKyc(s, u.id);
    if (n) { db.save(); audit(u.id, 'KYC_VAULT_DELETED', `${u.name} deleted the full Aadhaar number and address from the KYC vault`); }
    res.json({ success: true, ...mineView(u) });
  });

  // ── the superadmin's side ──
  const sup = needs('kyc:reveal');

  r.get('/status', sup, (_req, res) => {
    const s = st(); const k = vaultKey();
    const rows = s.kycVault || [];
    res.json({
      success: true, on: vaultOn(), switchedOff: !!s.settings.kycVaultOff, keyReady: !!k, keyMode: k?.mode || null, keyProblem: k ? '' : vaultKeyProblem(),
      keyWarning: k?.mode === 'file' ? 'The encryption key is a file on the same disk as the data. Set KYC_VAULT_KEY in the server settings so a copy of the data folder alone cannot be opened.' : '',
      counts: { records: rows.length, withAadhaar: rows.filter(x => x.aadhaarEnc).length, withAddress: rows.filter(x => x.addressEnc).length, brokers: s.users.filter(x => x.role === 'BROKER').length },
      changedBy: s.users.find(x => x.id === s.settings.kycVaultChangedBy)?.name || '', changedAt: s.settings.kycVaultChangedAt || null,
    });
  });

  r.put('/settings', sup, (req: Request, res: Response) => {
    const a = me(); const s = st();
    const b = z.object({ on: z.boolean() }).safeParse(req.body); if (!b.success) return bad(res, 'Invalid setting');
    if (b.data.on && !vaultReady()) return bad(res, 'The vault cannot be switched on: there is no encryption key on this server.', 409, 'VAULT_NO_KEY');
    if (!b.data.on !== !!s.settings.kycVaultOff) {
      s.settings.kycVaultOff = !b.data.on; s.settings.kycVaultChangedBy = a.id; s.settings.kycVaultChangedAt = nowIso();
      db.save();
      audit('KYC-VAULT-SETTINGS', 'KYC_VAULT_SWITCH', `${a.name} switched the KYC vault ${b.data.on ? 'ON' : 'OFF'} (OFF = new sign-ups keep only the last 4 Aadhaar digits; what is already stored stays encrypted)`);
    }
    res.json({ success: true, on: vaultOn() });
  });

  /**
   * Open one member's PAN + full Aadhaar + address. Needs: purpose, a written reason, and the superadmin's own password (a stolen session alone is not enough).
   * The audit line holds the reason and the masked Aadhaar — never the number.
   */
  r.post('/reveal/:userId', sup, rateLimit('kyc-reveal', 20, 3600_000), (req: Request, res: Response) => {
    const a = me(); const s = st();
    const b = z.object({
      purpose: z.enum(REVEAL_PURPOSES), reason: z.string().trim().min(REVEAL_MIN_REASON, `Write why you need this (at least ${REVEAL_MIN_REASON} characters)`).max(REVEAL_MAX_REASON),
      ref: z.string().trim().max(60).optional(), password: z.string().min(1).max(200), code: z.string().trim().max(20).optional(),
    }).safeParse(req.body);
    if (!b.success) return bad(res, b.error.issues[0]?.message || 'Choose a purpose and write the reason', 400, 'REVEAL_FIELDS');
    const t = s.users.find(x => x.id === req.params.userId);
    if (!t) return bad(res, 'Member not found', 404);
    const me2 = s.users.find(x => x.id === a.id);
    if (!verifyPassword(b.data.password, me2?.passwordHash)) {
      audit(t.id, 'KYC_REVEAL_DENIED', `${a.name} tried to open the KYC of ${t.name} with a wrong password`);
      return bad(res, 'Your password is not correct.', 403, 'BAD_PASSWORD');
    }
    // v26 — the vault needs the superadmin's authenticator code too (in production 2FA must be on before the vault opens at all)
    if (twoFactorOn(a.id)) {
      const v = verifySecondFactor(a.id, b.data.code || '');
      if (v === 'LOCKED') return bad(res, 'Too many wrong codes. Wait 15 minutes.', 429, 'TWO_FACTOR_LOCKED');
      if (v !== 'OK') { audit(t.id, 'KYC_REVEAL_DENIED', `${a.name} tried to open the KYC of ${t.name} with a wrong two-step code`); return bad(res, 'The code from your authenticator app is not correct.', 403, 'BAD_CODE'); }
    } else if (IS_PROD) {
      return bad(res, 'Turn on two-step sign-in (authenticator app) first — the KYC vault does not open without it.', 403, 'TWO_FACTOR_REQUIRED');
    }
    const rec = vaultOf(s, t.id);
    if (!rec || (!rec.aadhaarEnc && !rec.addressEnc)) return bad(res, 'This member has no full Aadhaar or address in the vault.', 404, 'VAULT_EMPTY');
    let aadhaar = ''; let address = ''; let pincode = '';
    try {
      if (rec.aadhaarEnc) aadhaar = unseal(rec.aadhaarEnc, `${rec.id}|aadhaar`);
      if (rec.addressEnc) { const j = JSON.parse(unseal(rec.addressEnc, `${rec.id}|address`)); address = j.a || ''; pincode = j.p || ''; }
    } catch (e: any) {
      return bad(res, e?.message === 'VAULT_WRONG_KEY' ? 'The encryption key on this server is not the one these details were saved with.' : e?.message === 'VAULT_NO_KEY' ? 'The vault has no encryption key.' : 'These details could not be decrypted.', 500, e?.message || 'VAULT_BAD_DATA');
    }
    rec.views.push({ at: nowIso(), byId: a.id, byName: a.name, purpose: b.data.purpose, reason: b.data.reason, ref: b.data.ref || undefined });
    if (rec.views.length > VIEW_LOG_CAP) rec.views.splice(0, rec.views.length - VIEW_LOG_CAP);
    db.save();
    audit(t.id, 'KYC_REVEALED', `${a.name} opened the KYC of ${t.name} (Aadhaar ${maskAadhaar(rec.aadhaarLast4)}) — ${REVEAL_PURPOSE_LABEL[b.data.purpose as RevealPurpose].en}${b.data.ref ? ` [${b.data.ref}]` : ''}: ${b.data.reason}`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, member: { id: t.id, name: t.name, phone: t.phone || '', email: t.email.endsWith('@phone.genz.local') ? '' : t.email, city: t.city || '', status: t.verificationStatus }, pan: t.panNumber || '', aadhaar, address, pincode, consentAt: rec.consentAt, hideAfterSeconds: 90 });
  });

  r.get('/reveals', sup, (_req, res) => {
    const s = st();
    const rows = (s.kycVault || []).flatMap(rec => rec.views.map(v => ({ at: v.at, by: v.byName, purpose: v.purpose, reason: v.reason, ref: v.ref || '', memberId: rec.userId, member: s.users.find(x => x.id === rec.userId)?.name || '—' })));
    rows.sort((x, y) => y.at.localeCompare(x.at));
    res.json({ success: true, reveals: rows.slice(0, 100) });
  });

  return r;
}

/** Shared by sign-up and “My PAN & Aadhaar”: check the optional vault fields of a request body. Returns an error string or the clean values. */
export function readKycBody(body: any): { error: string; code: string } | { address?: string; pincode?: string; consent: boolean; source: 'TYPED' | 'PHOTO' | 'MIXED' } {
  const address = normAddress(body?.address); const pincode = normPin(body?.pincode);
  if (address) { const ap = addressProblem(address); if (ap) return { error: `Address: ${ap.en}`, code: ap.code }; }
  const pp = pinProblem(pincode); if (pp) return { error: `PIN code: ${pp.en}`, code: pp.code };
  const source = body?.kycSource === 'PHOTO' || body?.kycSource === 'MIXED' ? body.kycSource : 'TYPED';
  return { ...(address ? { address } : {}), ...(pincode ? { pincode } : {}), consent: body?.kycConsent === true, source };
}
