/**
 * v15 — the 2-tier gate and the hooks the KYC / listing / offer code calls.
 * Kept free of other server modules (only db + auth + shared rules) so pcontrol / inventory / offers can import it without cycles.
 */
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { ctx } from './auth.js';
import { tierOf, inProbation, PROBATION_DAYS, VOUCH_STRIKE_LIMIT, VOUCH_BAN_DAYS } from '../src/shared/networkRules.js';

const nowIso = () => new Date().toISOString();

/** Builder projects are RERA-registered inventory: only a Tier 1 broker (RERA badge) may partner on them or hold their units. */
export function tier1Gate(_req: Request, res: Response, next: NextFunction) {
  const u = ctx().user as UserProfile | null;
  if (u && tierOf(u) === 'TIER2') {
    return res.status(403).json({
      error: 'Builder projects are for RERA-verified (Tier 1) brokers. Local associates can work resale, rental, land and local inventory. Add your RERA registration to move up.',
      code: 'TIER2_NOT_ALLOWED',
    });
  }
  next();
}

/** Called when an admin approves an account. Tier 2 starts its probation from approval; a broker with a RERA number is Tier 1. */
export function onVerified(u: UserProfile) {
  if (u.role !== 'BROKER') return;
  if (u.tier === 'TIER2') u.probationUntil = new Date(Date.now() + PROBATION_DAYS * 86400_000).toISOString();
  else if (!u.tier) u.tier = u.reraNumber ? 'TIER1' : 'TIER2';
  if (u.tier === 'TIER2' && !u.probationUntil) u.probationUntil = new Date(Date.now() + PROBATION_DAYS * 86400_000).toISOString();
}

/** GZ-BRK-492xxx — the broker's public GENZ number; assigned once, when the account is verified (by an admin, or automatically through a RERA sponsor). */
export function assignBrokerId(u: UserProfile) {
  if (u.role !== 'BROKER' || u.brokerId) return;
  const st = db.getState();
  let id = '';
  do { id = `GZ-BRK-${492000 + Math.floor(Math.random() * 9999)}`; } while (st.users.some(x => x.brokerId === id));
  u.brokerId = id;
}

/**
 * v18 — who registered this member (sponsor of record). New members carry `sponsorId`; older Tier 2 members are found through
 * their entry request (the proposer). Returns '' for members GENZ brought in directly (no sponsor).
 */
export function sponsorOf(u: UserProfile): string {
  if (u.sponsorId) return u.sponsorId;
  if (u.role !== 'BROKER') return '';
  return db.getState().tier2Applications.find(a => a.userId === u.id)?.proposerId || '';
}

/** A person was suspended / blacklisted: everyone who vouched for them (and their sponsor) gets a strike; repeat strikes pause their right to vouch. */
export function applyVoucherStrikes(target: UserProfile, actorId: string, actorRole: string) {
  const st = db.getState();
  const sp = sponsorOf(target);
  for (const vid of new Set([...(target.vouchedBy || []), ...(sp ? [sp] : [])])) {
    const v = db.byId('users', vid);
    if (!v) continue;
    v.vouchStrikes = (v.vouchStrikes || 0) + 1;
    if (v.vouchStrikes >= VOUCH_STRIKE_LIMIT) v.vouchBanUntil = new Date(Date.now() + VOUCH_BAN_DAYS * 86400_000).toISOString();
    db.appendAuditEvent(actorId, actorRole as any, 'SYSTEM', v.id, 'VOUCH_STRIKE', `${v.name} got a strike: ${target.name} (vouched) was ${target.verificationStatus.toLowerCase()}. Strikes: ${v.vouchStrikes}${v.vouchBanUntil ? ' — vouching paused' : ''}`);
  }
  db.save();
}

export const liveOfferCap = (u: UserProfile, normal: number, probation: number) => (inProbation(u) ? probation : normal);
export { nowIso };
