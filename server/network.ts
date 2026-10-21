/**
 * v15 — the network engine.  /api/network (tiers, vouching, tree, captain / admin boards, trust profile, builder channel + GENZ desk)
 *                             /api/tieups  (broker ↔ broker tie-ups, directory, builder mandates in one list)
 *
 *  - Tier 1 = RERA badge. Tier 2 = Local Associate: v18 — enters ONLY through a RERA-registered (Tier 1) sponsor who registers them
 *    (phone-bound invitation, local reference). No RERA asked of the associate, but PAN + Aadhaar (last 4 kept) are, and a GENZ admin
 *    must have SEEN them before approval. Probation caps, no builder projects. Tier 2 members can never sponsor.
 *  - GENZ keeps and shows who registered whom (sponsor of record): to GENZ ops (all), to the sponsor (theirs) and to the member (their own).
 *  - Sponsoring has a price: a monthly limit, no sponsoring your own phone / company, and a strike when the person you registered
 *    is suspended or blacklisted (2 strikes pause your right to sponsor).
 *  - A tie-up is a RECORD of terms two brokers agreed (share of brokerage, scope, validity). GENZ does not hold or move money.
 *    When the two co-broke an accepted offer, the deal room opens with the tie-up's split already filled in.
 *  - GENZ desk = coordination (site visits, paperwork, launch day) on a builder's request. GENZ never sells to a buyer.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile, Tier2Application, Tieup, DeskRequest } from './db.js';
import { ctx, needs, rateLimit, digits, secureCode } from './auth.js';
import { can } from './permissions.js';
import { phoneSchema } from './validation.js';
import { normCity } from '../src/shared/cities.js';
import { normRera, isPlausibleRera, normPan, isValidPan, maskPan } from './kyc.js';
import { sponsorOf } from './tiers.js';
import { storeKyc, readKycBody, kycFlags, vaultOn } from './kycvault.js';
import { normAadhaar, isValidAadhaar, aadhaarLast4, maskAadhaar, isSponsorEligible, panProblem, aadhaarProblem, isLast4 } from '../src/shared/idRules.js';
import { openIdTask, recordIdTick, purgeApplicationDocs, docsOfApplication } from './idreview.js';
import {
  tierOf, inProbation, sameParty, monthKey, splitOk, tieupDays, TIER_LABEL, SCOPE_KINDS,
  VOUCHES_NEEDED, VOUCHES_PER_MONTH, CAPTAIN_VOUCHES_PER_MONTH, VOUCH_STRIKE_LIMIT, APPLICATION_DAYS, MAX_OPEN_APPLICATIONS,
  MAX_OPEN_PROPOSALS, MAX_ACTIVE_TIEUPS, PROPOSAL_DAYS, CITY_TARGET_ACTIVE, PROBATION_DAYS,
} from '../src/shared/networkRules.js';

const nowIso = () => new Date().toISOString();
const st = () => db.getState();
const me = () => ctx().user as UserProfile;
const bad = (res: Response, error: string, status = 400, code?: string) => res.status(status).json(code ? { error, code } : { error });
const audit = (entityType: 'SYSTEM' | 'DEAL' | 'VERIFICATION', id: string, action: string, details: string) => { const u = me(); db.appendAuditEvent(u.id, u.role, entityType, id, action, details); };
const mask = (phone?: string) => { const d = digits(phone); return d ? `XXXXXX${d.slice(-4)}` : ''; };
const isVerifiedBroker = (u?: UserProfile) => !!u && u.role === 'BROKER' && u.verificationStatus === 'VERIFIED';
const phoneKnown = (phone: string) => st().users.some(u => digits(u.phone).slice(-10) === digits(phone).slice(-10));
const seq = (prefix: string, list: { id: string }[]) => `${prefix}-${String(list.reduce((m, r) => Math.max(m, Number(r.id.split('-').pop()) || 0), 0) + 1).padStart(4, '0')}`;

/** Chapters this member captains (City Captain). */
export const captainChapters = (u: UserProfile) => st().chapters.filter(c => c.captainId === u.id);
export const isCaptainOf = (u: UserProfile, city: string) => captainChapters(u).some(c => normCity(c.city) === normCity(city));

export function vouchesThisMonth(userId: string, now = nowIso()): number {
  const mk = monthKey(now);
  return st().tier2Applications.reduce((n, a) => n + a.vouches.filter(v => v.userId === userId && monthKey(v.at) === mk).length, 0);
}

/** '' when the member may vouch right now, else the reason. */
export function vouchBlock(u: UserProfile): string {
  if (!isVerifiedBroker(u)) return 'Only verified brokers can vouch';
  // v18: only a RERA-registered (Tier 1) broker can register a new associate — a non-RERA member can never bring in another non-RERA member
  if (!isSponsorEligible(u)) return 'Only RERA-registered (Tier 1) brokers can register a new associate. Add your RERA registration to become one.';
  if (u.vouchBanUntil && Date.parse(u.vouchBanUntil) > Date.now()) return `Your right to vouch is paused until ${u.vouchBanUntil.slice(0, 10)} (a person you vouched for was suspended)`;
  if ((u.vouchStrikes || 0) >= VOUCH_STRIKE_LIMIT && !u.vouchBanUntil) return 'Your right to vouch is paused after repeated strikes';
  const cap = captainChapters(u).length ? CAPTAIN_VOUCHES_PER_MONTH : VOUCHES_PER_MONTH;
  if (vouchesThisMonth(u.id) >= cap) return `You have used your ${cap} vouches for this month`;
  return '';
}

function distinctMemberVouches(a: Tier2Application) { return new Set(a.vouches.filter(v => v.as === 'MEMBER').map(v => v.userId)).size; }
const vouchersReady = (a: Tier2Application) => a.vouches.some(v => v.as === 'CAPTAIN') || distinctMemberVouches(a) >= VOUCHES_NEEDED;

/** Enough vouches → one phone-bound invitation (14 days). The RERA number is NOT asked at sign-up. */
function maybeIssueInvitation(a: Tier2Application, actor: UserProfile): { code: string; expiresAt: string } | null {
  if (a.status !== 'OPEN' || !vouchersReady(a)) return null;
  const s = st();
  const email = `${digits(a.phone).slice(-10)}@phone.genz.local`;
  if (s.invitations.some(i => i.invitedEmail === email && i.status === 'PENDING' && new Date(i.expiresAt) > new Date())) return null;
  const inv = {
    id: `INV-${Date.now()}`, code: `GZ-BRK-${secureCode(9)}`, invitedEmail: email, invitedPhone: a.phone, targetRole: 'BROKER' as const,
    issuedBy: a.proposerId, status: 'PENDING' as const, expiresAt: new Date(Date.now() + APPLICATION_DAYS * 86400_000).toISOString(),
    createdAt: nowIso(), nominatedBy: a.vouches[0]?.userId, tier2AppId: a.id,
  };
  s.invitations.unshift(inv);
  a.status = 'INVITED'; a.invitationId = inv.id; a.updatedAt = nowIso();
  db.save();
  const names = a.vouches.map(v => `${s.users.find(u => u.id === v.userId)?.name || v.userId}${v.as === 'CAPTAIN' ? ' (City Captain)' : ''}`).join(', ');
  db.appendAuditEvent(actor.id, actor.role, 'SYSTEM', a.id, 'TIER2_INVITED', `Tier 2 entry for ${a.name} (${a.city}) registered by RERA-registered sponsor ${names}; invitation ${inv.id} issued`);
  return { code: inv.code, expiresAt: inv.expiresAt };
}

const appView = (a: Tier2Application, viewer: UserProfile) => {
  const s = st(); const full = viewer.id === a.proposerId || can(viewer, 'growth:manage');
  return {
    id: a.id, name: a.name, city: a.city, reference: a.reference, status: a.status, note: a.note,
    phone: full ? a.phone : mask(a.phone),
    proposer: s.users.find(u => u.id === a.proposerId)?.name || '',
    vouches: a.vouches.map(v => ({ userId: v.userId, name: s.users.find(u => u.id === v.userId)?.name || '', as: v.as, at: v.at })),
    vouchesNeeded: VOUCHES_NEEDED, memberVouches: distinctMemberVouches(a),
    createdAt: a.createdAt, expiresAt: a.expiresAt,
    iVouched: a.vouches.some(v => v.userId === viewer.id), mine: a.proposerId === viewer.id,
    // v19 — what the sponsor attached: yes / no only (the numbers and the scans are not repeated here)
    idGiven: { company: !!a.companyName, pan: !!a.panNumber, aadhaar: !!a.aadhaarLast4, panDoc: docsOfApplication(s, a.id).some(d => d.kind === 'PAN'), aadhaarDoc: docsOfApplication(s, a.id).some(d => d.kind === 'AADHAAR') },
  };
};

const applicationSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  phone: phoneSchema,
  city: z.string().trim().min(2, 'City is required').max(80),
  reference: z.string().trim().min(10, 'Write a short local reference (who knows this person, office / shop, how long)').max(300),
  consent: z.literal(true, { message: 'Confirm that this person agreed to be contacted by GENZ' }),
  // v19 — optional details the sponsor already knows; they come PREFILLED on the person's sign-up form
  companyName: z.string().trim().max(120).optional(),
  panNumber: z.string().trim().max(14).optional(),
  aadhaarLast4: z.string().trim().max(4).optional(),
});

// ═══════════════════════════ /api/network ═══════════════════════════
export function createNetworkRouter() {
  const r = Router();

  r.get('/me', needs('network:use'), (_req, res) => {
    const u = me(); const s = st();
    const tier = tierOf(u);
    const block = u.role === 'BROKER' ? vouchBlock(u) : 'Only brokers can vouch';
    res.json({
      success: true,
      tier, tierLabel: tier ? TIER_LABEL[tier] : null,
      probationUntil: inProbation(u) ? u.probationUntil : null,
      strikes: u.vouchStrikes || 0, vouchBanUntil: u.vouchBanUntil || null,
      canVouch: !block, vouchBlock: block,
      vouchesUsed: vouchesThisMonth(u.id),
      vouchLimit: captainChapters(u).length ? CAPTAIN_VOUCHES_PER_MONTH : VOUCHES_PER_MONTH,
      isCaptain: captainChapters(u).length > 0, captainCities: captainChapters(u).map(c => c.city),
      referralCode: u.referralCode || null,
      vouchedBy: (u.vouchedBy || []).map(id => s.users.find(x => x.id === id)?.name).filter(Boolean),
      // v18 — who registered me, whether I may register others, and my own ID status (masked)
      sponsor: sponsorCard(u),
      canSponsor: u.role === 'BROKER' && isSponsorEligible(u),
      sponsoredCount: s.users.filter(x => sponsorOf(x) === u.id).length,
      idStatus: idStatus(u),
    });
  });

  /** v18 — "who registered me": name / firm / city only — no phone. */
  const sponsorCard = (x: UserProfile) => {
    const sp = sponsorOf(x); if (!sp) return null;
    const p = db.byId('users', sp);
    return p ? { id: p.id, name: p.name, company: p.companyName || '', city: p.city, rera: p.reraNumber || '' } : { id: sp, name: '', company: '', city: '', rera: '' };
  };
  /** v18 — masked ID status: PAN as AB•••••4F, Aadhaar as XXXX XXXX 1234. Never the full number (not stored). */
  const idStatus = (x: UserProfile) => ({
    pan: x.panNumber ? maskPan(x.panNumber) : '', hasPan: !!x.panNumber,
    aadhaar: maskAadhaar(x.aadhaarLast4), hasAadhaar: !!x.aadhaarLast4,
    consentAt: x.idConsentAt || null, checked: !!x.idCheckedAt, checkedAt: x.idCheckedAt || null,
    vault: { on: vaultOn(), ...kycFlags(x.id) },
  });

  /** v18 — add or correct my own PAN / Aadhaar (older brokers, or a pending associate whose details were missing). Editing resets the admin's "ID seen" tick. */
  r.get('/my-id', needs('self:read'), (_req, res) => { const u = me(); if (u.role !== 'BROKER') return bad(res, 'Only brokers give an ID here', 403); res.json({ success: true, id: idStatus(u), required: tierOf(u) === 'TIER2' }); });
  r.post('/my-id', needs('self:update'), rateLimit('my-id', 60, 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    if (u.role !== 'BROKER') return bad(res, 'Only brokers give an ID here', 403);
    if (!['PENDING', 'VERIFIED'].includes(u.verificationStatus)) return bad(res, 'Your account cannot change ID details right now', 403);
    const pan = normPan(req.body?.panNumber || u.panNumber);
    const aad = normAadhaar(req.body?.aadhaarNumber);
    if (req.body?.consent !== true) return bad(res, 'Please agree to GENZ keeping your PAN and the last 4 digits of your Aadhaar for verification', 400, 'ID_CONSENT_REQUIRED');
    if (!pan || !isValidPan(pan)) return bad(res, `PAN: ${panProblem(pan)?.en || 'enter your 10-character PAN (e.g. ABCPD1234E)'}`, 400, 'PAN_INVALID');
    if (!aad || !isValidAadhaar(aad)) return bad(res, `Aadhaar: ${aadhaarProblem(aad)?.en || 'enter all 12 digits'}`, 400, 'AADHAAR_INVALID');
    if (s.users.some(x => x.id !== u.id && x.role === 'BROKER' && x.panNumber && normPan(x.panNumber) === pan)) return bad(res, 'This PAN is already linked to another GENZ account.', 409, 'PAN_IN_USE');
    // v25 — optional address (+ PIN); the FULL Aadhaar and the address go into the encrypted vault when the member ticked the KYC agreement
    const kyc = readKycBody(req.body);
    if ('error' in kyc) return bad(res, kyc.error, 400, kyc.code);
    const changed = pan !== u.panNumber || aadhaarLast4(aad) !== u.aadhaarLast4;
    u.panNumber = pan; u.aadhaarLast4 = aadhaarLast4(aad); u.idConsentAt = nowIso();
    const vault = kyc.consent ? storeKyc(u, { aadhaar: aad, address: kyc.address, pincode: kyc.pincode, source: kyc.source }) : { stored: false as const };
    if (changed) { u.idCheckedAt = undefined; u.idCheckedBy = undefined; u.idCheckNote = undefined; }
    openIdTask(u.id, changed ? 'ID_CHANGED' : 'NEW_FILE', { by: u.id, autoVerified: !!u.autoVerifiedAt });
    db.save();
    audit('VERIFICATION', u.id, 'ID_UPDATED', `${u.name} gave PAN and Aadhaar with consent (${vault.stored ? 'full Aadhaar' + (kyc.address ? ' and address' : '') + ' in the encrypted vault' : 'last 4 digits only'})${changed ? '; any earlier "ID seen" tick was reset' : ''}`);
    res.json({ success: true, id: idStatus(u), vaultStored: vault.stored });
  });

  /** v18 — GENZ ops: "I have seen this member's PAN card and Aadhaar card" (video call / office). Needs PAN + Aadhaar on file first. */
  r.post('/id-check/:userId', needs('users:review'), (req: Request, res: Response) => {
    const a = me(); const s = st();
    const t = s.users.find(x => x.id === req.params.userId);
    if (!t || t.role !== 'BROKER') return bad(res, 'Broker not found', 404);
    if (t.id === a.id) return bad(res, 'You cannot check your own ID', 403);
    const checked = req.body?.checked !== false;
    const note = String(req.body?.note || '').trim().slice(0, 200);
    if (checked && (!t.panNumber || !t.aadhaarLast4)) return bad(res, 'PAN and Aadhaar are not on file yet — ask the member to add them first', 409, 'ID_MISSING');
    recordIdTick(t, a, checked, note); // sets / clears the tick AND closes / reopens the ID-review task
    db.save();
    audit('VERIFICATION', t.id, checked ? 'ID_CHECKED' : 'ID_CHECK_CLEARED', `${a.name} ${checked ? 'saw the PAN card and Aadhaar card of' : 'cleared the "ID seen" tick of'} ${t.name}${note ? `: ${note}` : ''}`);
    res.json({ success: true, id: idStatus(t) });
  });

  /** v18 — the members I registered (sponsor view). Name, city, status, tier, joined, whether ID is on file / seen. No phone, no numbers. */
  r.get('/sponsored', needs('tier2:vouch'), (_req, res) => {
    const u = me(); const s = st();
    const rows = s.users.filter(x => sponsorOf(x) === u.id).map(x => sponsoredRow(x)).sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
    const open = s.tier2Applications.filter(a => a.proposerId === u.id && ['OPEN', 'INVITED'].includes(a.status)).length;
    res.json({
      success: true, members: rows, openRequests: open,
      totals: { all: rows.length, verified: rows.filter(x => x.status === 'VERIFIED').length, pending: rows.filter(x => x.status === 'PENDING').length, problem: rows.filter(x => ['SUSPENDED', 'BLACKLISTED', 'REJECTED'].includes(x.status)).length },
      strikes: u.vouchStrikes || 0,
    });
  });
  const sponsoredRow = (x: UserProfile) => ({
    id: x.id, name: x.name, city: x.city, status: x.verificationStatus, tier: tierOf(x), joinedAt: x.createdAt, probationUntil: inProbation(x) ? x.probationUntil || null : null,
    idOnFile: !!x.panNumber && !!x.aadhaarLast4, idChecked: !!x.idCheckedAt,
  });

  /** v18 — GENZ ops: who registered whom. Every sponsor with the people he registered; older Tier 2 members with no sponsor on record are listed apart. */
  r.get('/admin/sponsors', needs('growth:manage'), (_req, res) => {
    const s = st();
    const bySponsor = new Map<string, UserProfile[]>();
    const unsponsored: UserProfile[] = [];
    for (const x of s.users) {
      if (x.role !== 'BROKER') continue;
      const sp = sponsorOf(x);
      if (sp) { const a = bySponsor.get(sp) || []; a.push(x); bySponsor.set(sp, a); }
      else if (tierOf(x) === 'TIER2') unsponsored.push(x);
    }
    const adminRow = (x: UserProfile) => ({
      ...sponsoredRow(x), pan: x.panNumber ? maskPan(x.panNumber) : '', aadhaar: maskAadhaar(x.aadhaarLast4), checkedAt: x.idCheckedAt || null,
      checkedBy: x.idCheckedBy ? s.users.find(y => y.id === x.idCheckedBy)?.name || '' : '', checkNote: x.idCheckNote || '',
    });
    const sponsors = [...bySponsor.entries()].map(([sid, list]) => {
      const sp = s.users.find(y => y.id === sid);
      const members = list.map(adminRow).sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
      return {
        id: sid, name: sp?.name || sid, company: sp?.companyName || '', city: sp?.city || '', rera: sp?.reraNumber || '', tier: sp ? tierOf(sp) : null,
        status: sp?.verificationStatus || 'UNKNOWN', active: isSponsorEligible(sp), strikes: sp?.vouchStrikes || 0, pausedUntil: sp?.vouchBanUntil || null,
        isCaptain: sp ? captainChapters(sp).length > 0 : false,
        total: members.length, verified: members.filter(m => m.status === 'VERIFIED').length, pending: members.filter(m => m.status === 'PENDING').length,
        problem: members.filter(m => ['SUSPENDED', 'BLACKLISTED', 'REJECTED'].includes(m.status)).length,
        openRequests: s.tier2Applications.filter(a => a.proposerId === sid && ['OPEN', 'INVITED'].includes(a.status)).length,
        members,
      };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    const all = sponsors.flatMap(x => x.members);
    res.json({
      success: true, sponsors,
      unsponsored: unsponsored.map(adminRow),
      totals: {
        sponsors: sponsors.length, sponsored: all.length, problem: all.filter(m => ['SUSPENDED', 'BLACKLISTED', 'REJECTED'].includes(m.status)).length,
        inactiveSponsors: sponsors.filter(x => !x.active).length, unsponsored: unsponsored.length,
        idMissing: [...all, ...unsponsored.map(adminRow)].filter(m => !m.idOnFile).length,
        idNotSeen: [...all, ...unsponsored.map(adminRow)].filter(m => m.idOnFile && !m.idChecked && m.status !== 'REJECTED').length,
      },
    });
  });

  // ── Tier 2 entry ──
  r.get('/tier2/applications', needs('tier2:vouch', 'growth:manage'), (_req, res) => {
    const u = me(); const s = st();
    const admin = can(u, 'growth:manage');
    const caps = captainChapters(u);
    const list = s.tier2Applications.filter(a =>
      admin || a.proposerId === u.id || a.vouches.some(v => v.userId === u.id) ||
      (caps.some(c => normCity(c.city) === normCity(a.city)) && a.status === 'OPEN') ||
      // members in the same city see open requests they could vouch for
      (u.role === 'BROKER' && a.status === 'OPEN' && normCity(u.city) === normCity(a.city)));
    res.json({ success: true, applications: list.map(a => appView(a, u)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 100) });
  });

  r.post('/tier2/applications', needs('tier2:vouch'), rateLimit('t2-propose', 20, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const p = applicationSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid details');
    const d = p.data;
    const block = vouchBlock(u); if (block) return bad(res, block, 403, 'VOUCH_BLOCKED');
    const city = normCity(d.city);
    const captain = isCaptainOf(u, city);
    if (!captain && normCity(u.city) !== city) return bad(res, `You can vouch only for people in your own city (${u.city || 'not set'}). Ask the City Captain of ${city}.`, 403, 'NOT_LOCAL');
    if (digits(d.phone).slice(-10) === digits(u.phone).slice(-10)) return bad(res, 'You cannot propose yourself');
    if (phoneKnown(d.phone)) return bad(res, 'This person already has a GENZ account', 409);
    // v18: a request goes straight to INVITED (one RERA sponsor is enough), so an invited request counts as "already registered by someone"
    if (s.tier2Applications.some(a => ['OPEN', 'INVITED'].includes(a.status) && digits(a.phone).slice(-10) === digits(d.phone).slice(-10))) return bad(res, 'A RERA-registered member has already started this person\'s entry (the request is open or already invited)', 409);
    if (s.tier2Applications.filter(a => a.proposerId === u.id && a.status === 'OPEN').length >= MAX_OPEN_APPLICATIONS) return bad(res, `You already have ${MAX_OPEN_APPLICATIONS} open requests`, 429);
    // v19: the optional ID details are checked the same way as at sign-up, so the person is not handed a prefilled mistake
    const pan = d.panNumber ? normPan(d.panNumber) : '';
    if (pan) {
      const why = panProblem(pan); if (why) return bad(res, `PAN: ${why.en}`, 400, 'PAN_INVALID');
      if (s.users.some(x => x.role === 'BROKER' && x.panNumber && normPan(x.panNumber) === pan)) return bad(res, 'This PAN is already linked to a GENZ account.', 409, 'PAN_IN_USE');
    }
    if (d.aadhaarLast4 && !isLast4(d.aadhaarLast4)) return bad(res, 'Aadhaar: give exactly the last 4 digits (the full number is never taken here)', 400, 'AADHAAR_INVALID');
    const a: Tier2Application = {
      id: seq('T2', s.tier2Applications), name: d.name, phone: d.phone, city, reference: d.reference, proposerId: u.id,
      ...(d.companyName ? { companyName: d.companyName } : {}), ...(pan ? { panNumber: pan } : {}), ...(d.aadhaarLast4 ? { aadhaarLast4: d.aadhaarLast4 } : {}),
      vouches: [{ userId: u.id, as: captain ? 'CAPTAIN' : 'MEMBER', at: nowIso() }], status: 'OPEN',
      createdAt: nowIso(), updatedAt: nowIso(), expiresAt: new Date(Date.now() + APPLICATION_DAYS * 86400_000).toISOString(),
    };
    s.tier2Applications.unshift(a); db.save();
    audit('SYSTEM', a.id, captain ? 'TIER2_CAPTAIN_VOUCH' : 'TIER2_PROPOSED', `${u.name} proposed ${a.name} (${a.city}) for Tier 2${captain ? ' as City Captain' : ''}`);
    const inv = maybeIssueInvitation(a, u);
    res.json({ success: true, application: appView(a, u), invitation: inv ? { ...inv, whatsappText: inviteText(a.name, inv.code, a.phone, sponsorNameOf(a)) } : null });
  });

  r.post('/tier2/applications/:id/vouch', needs('tier2:vouch'), rateLimit('t2-vouch', 30, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const a = s.tier2Applications.find(x => x.id === req.params.id);
    if (!a) return bad(res, 'Request not found', 404);
    if (a.status !== 'OPEN') return bad(res, `This request is already ${a.status.toLowerCase()}`, 409);
    if (Date.parse(a.expiresAt) < Date.now()) return bad(res, 'This request has expired', 409);
    if (a.vouches.some(v => v.userId === u.id)) return bad(res, 'You have already vouched', 409);
    const block = vouchBlock(u); if (block) return bad(res, block, 403, 'VOUCH_BLOCKED');
    const captain = isCaptainOf(u, a.city);
    if (!captain && normCity(u.city) !== normCity(a.city)) return bad(res, `You can vouch only for people in your own city (${u.city || 'not set'})`, 403, 'NOT_LOCAL');
    const proposer = s.users.find(x => x.id === a.proposerId);
    if (sameParty(u, { phone: a.phone }) || (proposer && sameParty(u, proposer))) return bad(res, 'You cannot vouch together with someone from your own phone / company — vouches must come from independent members', 403, 'SAME_PARTY');
    a.vouches.push({ userId: u.id, as: captain ? 'CAPTAIN' : 'MEMBER', at: nowIso() }); a.updatedAt = nowIso(); db.save();
    audit('SYSTEM', a.id, captain ? 'TIER2_CAPTAIN_VOUCH' : 'TIER2_VOUCH', `${u.name} vouched for ${a.name} (${a.city})`);
    const inv = maybeIssueInvitation(a, u);
    res.json({ success: true, application: appView(a, u), invitationIssued: !!inv });
  });

  /** The proposer can read the invitation text once it exists (he is the one who passes the code on). */
  r.get('/tier2/applications/:id/invitation', needs('tier2:vouch'), (req, res) => {
    const u = me(); const s = st();
    const a = s.tier2Applications.find(x => x.id === req.params.id);
    if (!a || a.proposerId !== u.id) return bad(res, 'Request not found', 404);
    const inv = a.invitationId ? s.invitations.find(i => i.id === a.invitationId) : undefined;
    if (!inv || inv.status !== 'PENDING') return bad(res, 'No active invitation for this request', 404);
    res.json({ success: true, invitation: { code: inv.code, expiresAt: inv.expiresAt, whatsappText: inviteText(a.name, inv.code, a.phone, sponsorNameOf(a)) } });
  });

  r.post('/tier2/applications/:id/reject', needs('tier2:vouch', 'growth:manage'), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const a = s.tier2Applications.find(x => x.id === req.params.id);
    if (!a) return bad(res, 'Request not found', 404);
    if (!['OPEN', 'INVITED'].includes(a.status)) return bad(res, `This request is already ${a.status.toLowerCase()}`, 409);
    const admin = can(u, 'growth:manage');
    const mine = a.proposerId === u.id;
    if (!admin && !mine && !isCaptainOf(u, a.city)) return bad(res, 'Only the proposer, the City Captain or GENZ ops can close this request', 403);
    const note = String(req.body?.note || '').trim().slice(0, 200);
    if (!mine && note.length < 3) return bad(res, 'Give a short reason');
    a.status = mine && !admin ? 'WITHDRAWN' : 'REJECTED'; a.note = note || undefined; a.updatedAt = nowIso();
    if (a.invitationId) { const inv = s.invitations.find(i => i.id === a.invitationId); if (inv && inv.status === 'PENDING') inv.status = 'REVOKED'; }
    purgeApplicationDocs(a.id); // scans attached to a request that will never become an account are deleted at once
    db.save(); audit('SYSTEM', a.id, 'TIER2_CLOSED', `${u.name} → ${a.status} (${a.name})${note ? `: ${note}` : ''}`);
    res.json({ success: true });
  });

  /** GENZ ops: set the tier explicitly (e.g. a Tier 2 associate has now got a RERA registration). */
  r.post('/tier/:userId', needs('users:review'), (req: Request, res: Response) => {
    const s = st(); const t = s.users.find(x => x.id === req.params.userId);
    if (!t || t.role !== 'BROKER') return bad(res, 'Broker not found', 404);
    const tier = req.body?.tier;
    if (tier !== 'TIER1' && tier !== 'TIER2') return bad(res, 'tier must be TIER1 or TIER2');
    if (tier === 'TIER1') {
      const rera = normRera(req.body?.reraNumber || t.reraNumber);
      if (!rera || !isPlausibleRera(rera)) return bad(res, 'A valid RERA registration number is required for Tier 1');
      t.reraNumber = rera; t.tier = 'TIER1'; t.probationUntil = undefined;
    } else { t.tier = 'TIER2'; }
    db.save(); audit('VERIFICATION', t.id, 'TIER_SET', `${me().name} set ${t.name} to ${tier}${tier === 'TIER1' ? ` (RERA ${t.reraNumber})` : ''}`);
    res.json({ success: true, tier });
  });

  // ── growth: invite tree, captain board, admin overview ──
  r.get('/tree', needs('network:use'), (_req, res) => {
    const u = me(); const s = st();
    const out: any[] = []; let frontier = [u.id]; const seen = new Set([u.id]);
    for (let depth = 1; depth <= 3 && frontier.length && out.length < 200; depth++) {
      const next: string[] = [];
      for (const pid of frontier) for (const x of s.users) {
        if (x.invitedById !== pid || seen.has(x.id)) continue;
        seen.add(x.id); next.push(x.id);
        if (out.length < 200) out.push({ id: x.id, parentId: pid, depth, name: x.name, role: x.role, city: x.city, tier: tierOf(x), status: x.verificationStatus, joinedAt: x.createdAt });
      }
      frontier = next;
    }
    res.json({ success: true, nodes: out, totals: { direct: out.filter(n => n.depth === 1).length, all: out.length, verified: out.filter(n => n.status === 'VERIFIED').length } });
  });

  r.get('/captain', needs('tier2:vouch'), (_req, res) => {
    const u = me(); const s = st();
    const chapters = captainChapters(u);
    if (!chapters.length) return res.json({ success: true, isCaptain: false });
    const cities = new Set(chapters.map(c => normCity(c.city)));
    const members = s.users.filter(x => x.role === 'BROKER' && x.verificationStatus === 'VERIFIED' && cities.has(normCity(x.city)));
    res.json({
      success: true, isCaptain: true, chapters: chapters.map(c => ({ id: c.id, name: c.name, city: c.city })),
      members: { total: members.length, tier1: members.filter(x => tierOf(x) === 'TIER1').length, tier2: members.filter(x => tierOf(x) === 'TIER2').length, onProbation: members.filter(x => inProbation(x)).length },
      openRequests: s.tier2Applications.filter(a => a.status === 'OPEN' && cities.has(normCity(a.city))).map(a => appView(a, u)),
      vouchesUsed: vouchesThisMonth(u.id), vouchLimit: CAPTAIN_VOUCHES_PER_MONTH,
      flagged: members.filter(x => (x.vouchStrikes || 0) > 0).map(x => ({ id: x.id, name: x.name, strikes: x.vouchStrikes })),
    });
  });

  r.get('/admin/overview', needs('growth:manage'), (_req, res) => {
    const s = st();
    const brokers = s.users.filter(x => x.role === 'BROKER' && x.verificationStatus === 'VERIFIED');
    const byCity = new Map<string, { city: string; tier1: number; tier2: number }>();
    for (const b of brokers) { const c = normCity(b.city) || 'Unknown'; const row = byCity.get(c) || { city: c, tier1: 0, tier2: 0 }; if (tierOf(b) === 'TIER1') row.tier1++; else row.tier2++; byCity.set(c, row); }
    const cities = [...byCity.values()].map(x => ({ ...x, total: x.tier1 + x.tier2, target: CITY_TARGET_ACTIVE, pct: Math.min(100, Math.round(((x.tier1 + x.tier2) / CITY_TARGET_ACTIVE) * 100)) })).sort((a, b) => b.total - a.total);
    const mk = monthKey(nowIso());
    const captains = s.chapters.filter(c => c.captainId).map(c => {
      const cap = s.users.find(x => x.id === c.captainId);
      return { chapterId: c.id, city: c.city, captain: cap?.name || '', vouchesThisMonth: cap ? vouchesThisMonth(cap.id) : 0, limit: CAPTAIN_VOUCHES_PER_MONTH,
        approvedByCaptain: s.tier2Applications.filter(a => a.vouches.some(v => v.userId === c.captainId && v.as === 'CAPTAIN' && monthKey(v.at) === mk)).length };
    });
    const apps = s.tier2Applications;
    res.json({
      success: true, cities, captains,
      pipeline: { open: apps.filter(a => a.status === 'OPEN').length, invited: apps.filter(a => a.status === 'INVITED').length, joined: apps.filter(a => a.status === 'JOINED').length, rejected: apps.filter(a => a.status === 'REJECTED').length },
      flagged: s.users.filter(x => (x.vouchStrikes || 0) > 0).map(x => ({ id: x.id, name: x.name, city: x.city, strikes: x.vouchStrikes, pausedUntil: x.vouchBanUntil || null })),
      pendingTier2: s.users.filter(x => x.tier === 'TIER2' && x.verificationStatus === 'PENDING').map(x => ({
        id: x.id, name: x.name, city: x.city, vouchedBy: (x.vouchedBy || []).map(id => s.users.find(y => y.id === id)?.name || id),
        sponsor: s.users.find(y => y.id === sponsorOf(x))?.name || '', idOnFile: !!x.panNumber && !!x.aadhaarLast4, idChecked: !!x.idCheckedAt,
      })),
      // v18 — ID coverage of all verified brokers (older brokers have no Aadhaar on file yet)
      ids: {
        brokers: brokers.length, withPan: brokers.filter(b => !!b.panNumber).length, withAadhaar: brokers.filter(b => !!b.aadhaarLast4).length, seen: brokers.filter(b => !!b.idCheckedAt).length,
      },
    });
  });

  // ── trust profile ("GENZ Verified" card) ──
  r.get('/profile/:id', needs('network:use', 'growth:manage'), rateLimit('net-profile', 200, 3600_000), (req, res) => {
    const s = st(); const t = s.users.find(x => x.id === req.params.id);
    if (!t || !['BROKER', 'DEVELOPER_BUILDER'].includes(t.role) || t.verificationStatus !== 'VERIFIED') return bad(res, 'Member not found', 404);
    res.json({ success: true, profile: trustProfile(t) });
  });

  // ── builder channel + GENZ desk ──
  const ownerOf = (u: UserProfile) => (u.role === 'TEAM_MEMBER' ? u.employerId || '' : u.id);
  r.get('/channel/projects', needs('pcontrol:manage'), (_req, res) => {
    const u = me(); const s = st(); const oid = ownerOf(u);
    const rows = s.builderProjects.filter(p => p.builderId === oid && p.status !== 'ARCHIVED').map(p => {
      const ms = s.associateMandates.filter(m => m.projectId === p.id);
      return {
        id: p.id, projectName: p.projectName, city: p.city, status: p.status, access: p.access || 'OPEN_APPLY', desk: !!p.desk,
        mode: (p.access || 'OPEN_APPLY') === 'INVITE_ONLY' ? 'INVITED' : 'OPEN',
        partners: ms.filter(m => ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status)).length, applied: ms.filter(m => m.status === 'APPLIED').length,
        deskOpen: s.deskRequests.filter(x => x.projectId === p.id && ['OPEN', 'ACK'].includes(x.status)).length,
      };
    });
    res.json({ success: true, projects: rows, rule: 'Builder projects are open only to RERA-verified (Tier 1) brokers. Whoever registers the lead first owns it, whichever channel the builder uses.' });
  });

  const deskSchema = z.object({ projectId: z.string().max(60), kind: z.enum(['SITE_VISIT_COORD', 'PAPERWORK', 'LAUNCH_DAY', 'OTHER']), note: z.string().trim().min(5, 'Say what you need').max(400) });
  r.get('/desk', needs('pcontrol:manage', 'growth:manage'), (_req, res) => {
    const u = me(); const s = st();
    const admin = can(u, 'growth:manage');
    const list = s.deskRequests.filter(x => admin || x.builderId === ownerOf(u)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
    res.json({ success: true, requests: list, scope: 'GENZ desk coordinates visits and paperwork only. It never sells to a buyer and never handles money.' });
  });
  r.post('/desk', needs('pcontrol:manage'), rateLimit('desk-new', 30, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const p = deskSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid request');
    const proj = s.builderProjects.find(x => x.id === p.data.projectId && x.builderId === ownerOf(u));
    if (!proj) return bad(res, 'Project not found', 404);
    if (!proj.desk) return bad(res, 'Switch on "GENZ desk coordination" for this project first', 409, 'DESK_OFF');
    if (s.deskRequests.filter(x => x.projectId === proj.id && ['OPEN', 'ACK'].includes(x.status)).length >= 5) return bad(res, 'This project already has 5 open desk requests', 429);
    const d: DeskRequest = { id: seq('DK', s.deskRequests), projectId: proj.id, projectName: proj.projectName, builderId: proj.builderId, builderName: proj.builderName, kind: p.data.kind, note: p.data.note, status: 'OPEN', createdAt: nowIso(), updatedAt: nowIso() };
    s.deskRequests.unshift(d); db.save(); audit('SYSTEM', d.id, 'DESK_REQUESTED', `${u.name}: ${d.kind} on ${proj.projectName}`);
    res.json({ success: true, request: d });
  });
  r.post('/desk/:id/status', needs('growth:manage'), (req: Request, res: Response) => {
    const s = st(); const d = s.deskRequests.find(x => x.id === req.params.id);
    if (!d) return bad(res, 'Request not found', 404);
    const status = req.body?.status;
    if (!['ACK', 'DONE', 'DECLINED'].includes(status)) return bad(res, 'status must be ACK, DONE or DECLINED');
    d.status = status; d.response = String(req.body?.response || '').trim().slice(0, 300) || d.response; d.handledBy = me().id; d.updatedAt = nowIso(); db.save();
    audit('SYSTEM', d.id, `DESK_${status}`, `${me().name} → ${d.projectName}: ${status}`);
    res.json({ success: true });
  });

  return r;
}

function inviteText(name: string, code: string, phone: string, sponsorName = '') {
  const ph = digits(phone).slice(-10);
  const who = sponsorName ? `RERA-रजिस्टर्ड ब्रोकर ${sponsorName} ने आपको रजिस्टर कराया है` : 'एक RERA-रजिस्टर्ड ब्रोकर ने आपको रजिस्टर कराया है';
  return `नमस्ते ${name}! GENZ Broker Network में आपका स्वागत है — ${who}। इन्विटेशन कोड: ${code} (14 दिन वैध)। ऐप में "Have an invitation code? Join here" पर कोड डालें और रजिस्ट्रेशन में यही मोबाइल नंबर (${ph}) इस्तेमाल करें। आपका RERA नंबर ज़रूरी नहीं, पर PAN और आधार चाहिए (आधार के सिर्फ़ आख़िरी 4 अंक सेव होते हैं) — GENZ टीम PAN/आधार देखकर ही मंज़ूरी देती है। Hello ${name}! ${sponsorName || 'A RERA-registered broker'} registered you on GENZ Broker Network. Invitation code: ${code}. Use mobile ${ph}. Keep your PAN and Aadhaar ready.`;
}
const sponsorNameOf = (a: Tier2Application) => db.byId('users', a.proposerId)?.name || '';

export function trustProfile(t: UserProfile) {
  const s = st(); const tier = tierOf(t);
  const settled = s.dealRooms.filter(d => d.stage === 'Settled' && (d.introducingBrokerId === t.id || d.closingBrokerId === t.id)).length;
  const visits = s.siteVisits.filter(v => v.brokerId === t.id && v.isVerified).length;
  const tieups = s.tieups.filter(x => x.status === 'ACTIVE' && (x.fromId === t.id || x.toId === t.id)).length;
  const mandates = s.associateMandates.filter(m => m.brokerId === t.id && ['ACTIVE_ASSOCIATE', 'TOP_PERFORMER'].includes(m.status)).length;
  return {
    id: t.id, name: t.name, company: t.companyName || '', role: t.role, city: t.city,
    tier, tierLabel: tier ? TIER_LABEL[tier] : null,
    reraVerified: tier === 'TIER1', memberSince: t.createdAt.slice(0, 10),
    stats: { settledDeals: settled, verifiedVisits: visits, activeTieups: tieups, builderPartnerships: mandates, vouchesReceived: (t.vouchedBy || []).length, membersBrought: s.users.filter(x => x.invitedById === t.id && x.verificationStatus === 'VERIFIED').length },
    trustScore: t.trustScore ?? null, onProbation: inProbation(t),
    note: tier === 'TIER2' ? `Local associate registered by ${(() => { const sp = sponsorOf(t); return (sp && s.users.find(x => x.id === sp)?.name) || 'a RERA-registered member'; })()} — RERA registration not verified by GENZ.` : undefined,
  };
}

// ═══════════════════════════ /api/tieups ═══════════════════════════
export function activeTieupFor(aId: string, bId: string): Tieup | undefined {
  const now = Date.now();
  return st().tieups.find(t => t.status === 'ACTIVE' && (!t.validUntil || Date.parse(t.validUntil) > now) &&
    ((t.fromId === aId && t.toId === bId) || (t.fromId === bId && t.toId === aId)));
}

const proposeSchema = z.object({
  toId: z.string().max(60),
  introSharePct: z.number(),
  scopeKinds: z.array(z.enum(SCOPE_KINDS)).min(1).max(6).default(['ANY']),
  city: z.string().trim().max(60).optional(),
  validDays: z.number().optional(),
  note: z.string().trim().max(300).optional(),
});

const brokerCard = (u?: UserProfile) => u ? { id: u.id, name: u.name, company: u.companyName || '', city: u.city, tier: tierOf(u), tierLabel: tierOf(u) ? TIER_LABEL[tierOf(u)!] : null } : null;

export function tieupHash(t: Tieup) {
  return crypto.createHash('sha256').update([t.id, t.fromId, t.toId, t.introSharePct, [...t.scopeKinds].sort().join(','), t.city || '', t.validUntil || '', t.decidedAt || ''].join('|')).digest('hex');
}

export function createTieupsRouter() {
  const r = Router();
  const viewT = (t: Tieup, u: UserProfile) => {
    const other = st().users.find(x => x.id === (t.fromId === u.id ? t.toId : t.fromId));
    return { ...t, direction: t.fromId === u.id ? 'OUT' : 'IN', other: brokerCard(other), history: t.history.slice(-10) };
  };

  r.get('/', needs('tieup:manage', 'pcontrol:manage'), (_req, res) => {
    const u = me(); const s = st();
    const own = u.role === 'TEAM_MEMBER' ? u.employerId : u.id;
    const brokerTieups = u.role === 'BROKER' ? s.tieups.filter(t => t.fromId === u.id || t.toId === u.id).sort((a, b) => b.proposedAt.localeCompare(a.proposedAt)).map(t => viewT(t, u)) : [];
    const mandates = s.associateMandates.filter(m => (u.role === 'BROKER' ? m.brokerId === u.id : m.builderId === own) && !['REVOKED', 'DECLINED', 'COMPLETED'].includes(m.status)).slice(0, 100)
      .map(m => ({ id: m.id, kind: 'BUILDER_BROKER' as const, projectName: m.projectName, builderName: m.builderName, brokerName: m.brokerName, commissionPct: m.agreedCommissionPct, status: m.status, validUntil: m.validUntil || null }));
    res.json({ success: true, tieups: brokerTieups, mandates, limits: { maxActive: MAX_ACTIVE_TIEUPS, maxOpenProposals: MAX_OPEN_PROPOSALS } });
  });

  r.get('/directory', needs('tieup:manage'), rateLimit('tieup-dir', 120, 3600_000), (req, res) => {
    const u = me(); const s = st();
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 40);
    const city = String(req.query.city || '').trim();
    const tierQ = req.query.tier === 'TIER1' || req.query.tier === 'TIER2' ? req.query.tier : '';
    const rows = s.users.filter(x => isVerifiedBroker(x) && x.id !== u.id && !sameParty(u, x))
      .filter(x => !city || normCity(x.city) === normCity(city))
      .filter(x => !tierQ || tierOf(x) === tierQ)
      .filter(x => !q || x.name.toLowerCase().includes(q) || (x.companyName || '').toLowerCase().includes(q))
      .slice(0, 30).map(x => {
        const t = s.tieups.find(y => ['PROPOSED', 'ACTIVE'].includes(y.status) && ((y.fromId === u.id && y.toId === x.id) || (y.fromId === x.id && y.toId === u.id)));
        return { ...brokerCard(x)!, settledDeals: s.dealRooms.filter(d => d.stage === 'Settled' && (d.introducingBrokerId === x.id || d.closingBrokerId === x.id)).length, tieup: t ? t.status : null };
      });
    res.json({ success: true, brokers: rows });
  });

  r.post('/', needs('tieup:manage'), rateLimit('tieup-new', 30, 24 * 3600_000), (req: Request, res: Response) => {
    const u = me(); const s = st();
    const p = proposeSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error.issues[0]?.message || 'Invalid tie-up');
    const d = p.data;
    const to = s.users.find(x => x.id === d.toId);
    if (!isVerifiedBroker(u)) return bad(res, 'Only verified brokers can tie up', 403);
    if (!isVerifiedBroker(to) || !to) return bad(res, 'That broker was not found', 404);
    if (to.id === u.id || sameParty(u, to)) return bad(res, 'You cannot tie up with yourself or a broker from your own phone / company');
    const e = splitOk(d.introSharePct); if (e) return bad(res, e);
    if ((tierOf(u) === 'TIER2' || tierOf(to) === 'TIER2') && (d.scopeKinds.includes('NEW_PROJECT') || d.scopeKinds.includes('ANY'))) return bad(res, 'A tie-up with a Tier 2 (local associate) broker cannot cover new / RERA projects. Pick resale, rental, land or commercial.', 400, 'TIER2_SCOPE');
    if (s.tieups.some(t => ['PROPOSED', 'ACTIVE'].includes(t.status) && ((t.fromId === u.id && t.toId === to.id) || (t.fromId === to.id && t.toId === u.id)))) return bad(res, 'You already have an open or active tie-up with this broker', 409, 'TIEUP_EXISTS');
    if (s.tieups.filter(t => t.fromId === u.id && t.status === 'PROPOSED').length >= MAX_OPEN_PROPOSALS) return bad(res, `You already have ${MAX_OPEN_PROPOSALS} unanswered proposals`, 429);
    if (s.tieups.filter(t => t.status === 'ACTIVE' && (t.fromId === u.id || t.toId === u.id)).length >= MAX_ACTIVE_TIEUPS) return bad(res, `You already have ${MAX_ACTIVE_TIEUPS} active tie-ups`, 429);
    const t: Tieup = {
      id: seq('TU', s.tieups), kind: 'BROKER_BROKER', fromId: u.id, toId: to.id, introSharePct: d.introSharePct,
      scopeKinds: [...new Set(d.scopeKinds)], city: d.city ? normCity(d.city) : undefined, note: d.note, validDays: tieupDays(d.validDays),
      status: 'PROPOSED', proposedAt: nowIso(), history: [{ at: nowIso(), by: u.id, action: 'PROPOSED' }],
    };
    s.tieups.unshift(t); db.save();
    audit('DEAL', t.id, 'TIEUP_PROPOSED', `${u.name} → ${to.name}: buyer-side ${t.introSharePct}% / listing-side ${100 - t.introSharePct}%, ${t.scopeKinds.join('/')}${t.city ? ` in ${t.city}` : ''}, ${t.validDays} days`);
    res.json({ success: true, tieup: viewT(t, u) });
  });

  const load = (req: Request, res: Response) => { const t = st().tieups.find(x => x.id === req.params.id); if (!t || (t.fromId !== me().id && t.toId !== me().id)) { bad(res, 'Tie-up not found', 404); return null; } return t; };
  const lapsed = (t: Tieup) => Date.parse(t.proposedAt) + PROPOSAL_DAYS * 86400_000 < Date.now();

  r.post('/:id/accept', needs('tieup:manage'), (req: Request, res: Response) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.toId !== u.id) return bad(res, 'Only the broker who received the proposal can accept it', 403, 'NOT_RECIPIENT');
    if (t.status !== 'PROPOSED') return bad(res, `This tie-up is already ${t.status.toLowerCase()}`, 409);
    if (lapsed(t)) { t.status = 'EXPIRED'; db.save(); return bad(res, 'This proposal has lapsed — ask for a new one', 409); }
    if (!isVerifiedBroker(u)) return bad(res, 'Only verified brokers can tie up', 403);
    t.status = 'ACTIVE'; t.decidedAt = nowIso(); t.validUntil = new Date(Date.now() + t.validDays * 86400_000).toISOString(); t.agreementHash = tieupHash(t); t.dealsUsed = 0;
    t.history.push({ at: nowIso(), by: u.id, action: 'ACCEPTED' }); db.save();
    audit('DEAL', t.id, 'TIEUP_ACTIVE', `${u.name} accepted tie-up ${t.id}; seal ${t.agreementHash.slice(0, 16)}…`);
    res.json({ success: true, tieup: viewT(t, u) });
  });
  r.post('/:id/decline', needs('tieup:manage'), (req: Request, res: Response) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.toId !== u.id) return bad(res, 'Only the broker who received the proposal can decline it', 403, 'NOT_RECIPIENT');
    if (t.status !== 'PROPOSED') return bad(res, `This tie-up is already ${t.status.toLowerCase()}`, 409);
    t.status = 'DECLINED'; t.decidedAt = nowIso(); t.history.push({ at: nowIso(), by: u.id, action: 'DECLINED', note: String(req.body?.note || '').slice(0, 200) }); db.save();
    audit('DEAL', t.id, 'TIEUP_DECLINED', `${u.name} declined tie-up ${t.id}`);
    res.json({ success: true });
  });
  r.post('/:id/withdraw', needs('tieup:manage'), (req: Request, res: Response) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.fromId !== u.id) return bad(res, 'Only the proposer can withdraw', 403);
    if (t.status !== 'PROPOSED') return bad(res, `This tie-up is already ${t.status.toLowerCase()}`, 409);
    t.status = 'WITHDRAWN'; t.history.push({ at: nowIso(), by: u.id, action: 'WITHDRAWN' }); db.save();
    audit('DEAL', t.id, 'TIEUP_WITHDRAWN', `${u.name} withdrew tie-up ${t.id}`);
    res.json({ success: true });
  });
  r.post('/:id/end', needs('tieup:manage'), (req: Request, res: Response) => {
    const t = load(req, res); if (!t) return; const u = me();
    if (t.status !== 'ACTIVE') return bad(res, `This tie-up is ${t.status.toLowerCase()}`, 409);
    const reason = String(req.body?.reason || '').trim().slice(0, 200);
    if (reason.length < 3) return bad(res, 'Give a short reason');
    t.status = 'ENDED'; t.endedAt = nowIso(); t.endedBy = u.id; t.endReason = reason; t.history.push({ at: nowIso(), by: u.id, action: 'ENDED', note: reason }); db.save();
    audit('DEAL', t.id, 'TIEUP_ENDED', `${u.name} ended tie-up ${t.id}: ${reason} (deals already opened keep their split)`);
    res.json({ success: true });
  });

  return r;
}

/** Hourly: lapse unanswered proposals, expire finished tie-ups and stale Tier 2 requests. */
export function sweepNetwork() {
  const s = st(); const now = Date.now(); let changed = false;
  for (const t of s.tieups) {
    if (t.status === 'PROPOSED' && Date.parse(t.proposedAt) + PROPOSAL_DAYS * 86400_000 < now) { t.status = 'EXPIRED'; changed = true; }
    else if (t.status === 'ACTIVE' && t.validUntil && Date.parse(t.validUntil) < now) { t.status = 'EXPIRED'; t.history.push({ at: nowIso(), by: 'system', action: 'EXPIRED' }); changed = true; }
  }
  for (const a of s.tier2Applications) {
    if (['OPEN', 'INVITED'].includes(a.status) && Date.parse(a.expiresAt) < now) {
      a.status = 'EXPIRED'; a.updatedAt = nowIso(); changed = true;
      const inv = a.invitationId ? s.invitations.find(i => i.id === a.invitationId) : undefined;
      if (inv && inv.status === 'PENDING') inv.status = 'EXPIRED';
    }
  }
  if (changed) db.save();
}

/** For the deal room opened by an accepted offer: the split a tie-up already agreed, or undefined. */
export function tieupSplitFor(buyerBrokerId: string, listingBrokerId: string, prop: { city?: string; transactionType?: string; propertyType?: string }) {
  if (!listingBrokerId || buyerBrokerId === listingBrokerId) return undefined;
  const t = activeTieupFor(buyerBrokerId, listingBrokerId);
  if (!t) return undefined;
  if (t.city && prop.city && normCity(t.city) !== normCity(prop.city)) return undefined;
  if (!t.scopeKinds.includes('ANY')) {
    const pt = String(prop.propertyType || '').toLowerCase();
    const kind = prop.transactionType && prop.transactionType !== 'Sale' ? 'RENTAL' : /land|plot/.test(pt) ? 'LAND' : /commercial|shop|office|mall/.test(pt) ? 'COMMERCIAL' : 'RESALE';
    if (!t.scopeKinds.includes(kind)) return undefined;
  }
  return t;
}
