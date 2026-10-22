import './server/bootstrap.js';
import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { db, UserRole, UserProfile, sha256, type DatabaseState, type DealRoom, type BuyerRequirement as BuyerRequirementT, type AuditEvent as AuditEventT } from './server/db.js';
import {
  calculatePropertyMatch
} from './server/matching.js';
import {
  generateDealTasks,
  generateDueDiligenceItems,
  calculateTransactionReadiness,
} from './server/dealTemplates.js';
import {
  PropertyMediaAsset,
  MediaShareGrant,
  DealMessage,
} from './src/types/index.js';
import {
  propertyCreateSchema,
  propertyUpdateSchema,
  requirementCreateSchema,
  commissionSplitSchema,
  collaborationOfferSchema,
  siteVisitCreateSchema,
  ownerMandateCreateSchema,
  constructionLeadCreateSchema,
  disputeCreateSchema,
  registerSchema,
  loginSchema,
  inviteCreateSchema,
  projectCreateSchema,
  generateMandateHash,
  maskPhoneNumber,
} from './server/validation.js';
import { sendSms } from './server/notify.js';
import {
  authenticate,
  needs,
  requireAuth,
  ctx,
  rateLimit,
  hit,
  resetHits,
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  parseCookies,
  COOKIE_NAME,
  extractToken,
  setSessionCookie,
  clearSessionCookie,
  passwordPolicyError,
  randomPassword,
  secureCode,
  secureOtp,
  safeEqual,
  isSafeUrl,
  digits,
  DEMO_MODE,
  DEMO_PASSWORD,
  IS_PROD,
} from './server/auth.js';
import {
  can,
  effectivePermissions,
  permissionMatrix,
  ALL_ROLES,
  type Permission,
} from './server/permissions.js';
import {
  isAdmin,
  isSuper,
  isDealParticipant,
  dealAssignees,
  isDealBroker,
  canViewDeal,
  canSeeDealCommercials,
  dealDetailVia,
  openDisputeOf,
  openDisputeDeals,
  canBrowseProperty,
  canSeeClosedProperty,
  isPropertyPrincipal,
  canSeeProtectedPropertyData,
  canSeeOwnerCommercials,
  canAccessPropertyWorkspace,
  customerMatchesUser,
  publicUser,
  partnerCard,
} from './server/access.js';
import { createCrmRouter, applyAssociateSale } from './server/crm.js';
import { createTargetBonusRouter, sweepTargetBonus } from './server/targetbonus.js';
import { createCrmPlusRouter, sweepCrm } from './server/crm2.js';
import { createCrmSalesRouter } from './server/crm3.js';
import { createMoneyTrailRouter } from './server/crm4.js';
import { createPulseRouter, activityMiddleware, recordActivity } from './server/pulse.js';
import { createTeamRouter } from './server/team.js';
import { createInventoryRouter } from './server/inventory.js';
import { createInventoryDeskRouter } from './server/inventory2.js';
import { createLaunchRouter } from './server/launch.js';
import { normCity } from './src/shared/cities.js';
import { createGrowthRouter, createPublicCardRouter } from './server/growth.js';
import { createDailyRouter, sweepListings } from './server/daily.js';
import { createCommunityRouter } from './server/community.js';
import { createPdocsRouter } from './server/pdocs.js';
import { createPropDocsRouter, docAccess } from './server/propdocs.js';
import { createPcontrolRouter, sweepControl } from './server/pcontrol.js';
import { resaleKeyOf } from './src/shared/dealRules.js';
import { DEFAULT_TDS_PCT } from './src/shared/crmRules.js';
import { createTimelineRouter } from './server/timeline.js';
import { createNetworkRouter, createTieupsRouter, sweepNetwork } from './server/network.js';
import { onVerified, applyVoucherStrikes, sponsorOf, assignBrokerId } from './server/tiers.js';
import { createHealthRouter, noteRequest, noteServerError, noteRejection } from './server/health.js';
import { createLegalRouter, sweepLegal } from './server/legal.js';
import { createBillingRouter, chargeEvent } from './server/billing.js';
import { createRevenueRouter, createPublicStrengthRouter, sweepRevenue } from './server/revenue.js';
import { createProtectionRouter, checkDays, daysFor } from './server/protection.js';
import { verifySigningPassword } from './server/signing.js';
import { createProfilePhotoRouter } from './server/profilephoto.js';
import { createDealHubRouter } from './server/dealhub.js';
import { createSidesRouter, shapeSideDeal, stripSideData } from './server/sides.js';
import { allSidesDone, checkProposerSide, feeFor, isOwnSide, otherSide, undertakingDone } from './src/shared/sideFees.js';
import { createPartyWatchRouter, partyBlock, partyCaution, sweepPartyWatch } from './server/partywatch.js';
import { createBuyerBondRouter, buyerBondBlock, makeBuyerBond } from './server/buyerbond.js';
import { createConsentRouter, createOwnerConsentPageRouter, sweepConsents, findBlockingBond, blockedAnswer, consentForPublish, markPublished, listingKey, signatureSummary, draftForProperty } from './server/consent.js';
import { createPushRouter } from './server/webpush.js';
import { createBroadcastRouter, alertNewListing, sweepDigestPush } from './server/broadcast.js';
import { createReputationRouter, createHomeRouter } from './server/reputation.js';
import { createReportRouter } from './server/report.js';
import { createTwoFactorRouter, twoFactorOn, makeTicket, readTicket, verifySecondFactor, twoFactorRecommended } from './server/twofactor.js';
import { createKycVaultRouter, storeKyc, readKycBody, sweepKycVault } from './server/kycvault.js';
import { createIdReviewRouter, openIdTask, autoVerifyDecision, closeIdTaskOnAdverse, sweepIdDocs, ensureIdTasks, docsOfApplication } from './server/idreview.js';
import { normAadhaar, isValidAadhaar, aadhaarLast4 as aadhaarTail, isSponsorEligible } from './src/shared/idRules.js';
import { PROBATION_LIVE_LISTINGS, inProbation as inProbationT, tierOf as tierOfT } from './src/shared/networkRules.js';
import { createOffersRouter, sweepOffers } from './server/offers.js';
import { createListingsRouter, createPublicPosterRouter, sweepSoldPurge } from './server/listings.js';
import { createVisitRouter, createPublicVisitRouter, sweepVisitPasses } from './server/visitpass.js';
import { filterMessage, isFlood, newAccountCap } from './server/spam.js';
import { createShareRouter, createPublicShareRouter } from './server/share.js';
import { createAck as createVisitAck, ackBlock as visitAckBlock, ackStatus as visitAckStatus, createVisitAckRouter, createVisitAckPageRouter, sweepVisitAcks } from './server/visitack.js';
import { roomForVisit, linkVisitToRoom, createClientRoomRouter, createClientRoomPageRouter, sweepClientRooms } from './server/clientroom.js';
import { createShopPartnerRouter, createPartnerQrRouter, createPartnerPageRouter, seedDemoPartners } from './server/shopPartners.js';
import { createDealCloseRouter, sweepDealClosures } from './server/dealclose.js';
import { createPaymentRequestRouter, createPaymentPageRouter } from './server/payreq.js';
import { isClosed, offlineVisitConfirmed } from './src/shared/dealClose.js';
import { createLandRecordsRouter } from './server/landrecords.js';
import { createConnectorRouter, connectorProfileSchema } from './server/connector.js';
import { findState, stateOfCity, sameCity, isPincode } from './src/shared/india.js';
import { createPrivacyRouter, legalConfig, POLICY_VERSION } from './server/privacy.js';
import { normPan, normGstin, normRera, isValidPan, isValidGstin, isPlausibleRera } from './server/kyc.js';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || (IS_PROD ? '0.0.0.0' : '127.0.0.1');

// ==========================================
// 0. SECURITY MIDDLEWARE
// ==========================================

/** Thrown from handlers to produce a clean JSON error. */
class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

app.disable('x-powered-by');
app.use(compression());
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  if (IS_PROD) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
  }
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

// Protected-document and property-paper uploads need a larger body; those routes parse their own JSON with their own limit.
const jsonParser = express.json({ limit: '256kb' });
app.use((req, res, next) => (req.method === 'POST' && (req.path === '/api/pdocs' || req.path === '/api/property-docs' || /^\/api\/id-review\/(mine|applications\/[^/]+)\/docs$/.test(req.path) || /^\/api\/consent\/drafts\/[^/]+\/paper$/.test(req.path)) ? next() : jsonParser(req, res, next)));

// Structured one-line access log for /api (no bodies, no cookies, no query strings -> no PII in logs).
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api/health')) return;
    const ms = Date.now() - t0;
    noteRequest(req.method + ' ' + req.baseUrl + req.path, res.statusCode, ms);
    console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: req.baseUrl + req.path, s: res.statusCode, ms }));
  });
  next();
});

// CSRF defence in depth (cookie is SameSite=Lax + HttpOnly): state-changing API calls must be
// JSON and, when the browser sends an Origin header, it must match the host we are served from.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== req.headers.host) {
          return res.status(403).json({ error: 'Cross-origin request blocked' });
        }
      } catch {
        return res.status(403).json({ error: 'Invalid Origin header' });
      }
    }
    const hasBody = Number(req.headers['content-length'] || 0) > 0;
    if (hasBody && !req.is('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
  }
  next();
});

// v28 — the general API limit counts per signed-in member, and per IP only for anonymous calls. In India many brokers share one
// mobile-carrier IP (CGNAT); a per-IP limit let a few busy members push everyone on that IP to 429 — which looked like a sign-out.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const sess = verifySession(parseCookies(req.headers.cookie)[COOKIE_NAME]);
  const wait = hit(sess?.uid ? `api:u:${sess.uid}` : `api:${req.ip}`, 600, 60_000);
  if (wait) { res.setHeader('Retry-After', String(wait)); return res.status(429).json({ error: 'Too many requests. Please slow down.' }); }
  next();
});

// Resolve the caller from the signed session cookie / bearer token. Per-request (AsyncLocalStorage):
// there is NO process-wide "current user" any more.
app.use(
  authenticate(payload => {
    const state = db.getState();
    const user = db.byId('users', payload.uid);
    if (!user) return null;
    if ((user.sessionVersion || 1) !== payload.sv) return null; // revoked
    if (user.verificationStatus === 'BLACKLISTED' || user.verificationStatus === 'REJECTED') return null;
    if (user.role === 'TEAM_MEMBER') { // an employee works only while the employer is in good standing
      const emp = db.byId('users', user.employerId);
      if (!emp || emp.verificationStatus !== 'VERIFIED') return null;
      user.employerRole = emp.role;
    }
    if (payload.imp) {
      const real = db.byId('users', payload.imp);
      if (!real || real.role !== 'SUPERADMIN' || real.verificationStatus !== 'VERIFIED') return null;
    }
    return user;
  })
);

// v17: a tiny "who was around today" record (user-id + Indian date only) — the superadmin's Network Pulse counts from it.
app.use('/api', activityMiddleware);
// v47 — a close request nobody answered for 7 days closes by itself; settled lazily before the deal lists are read (no timers on Vercel)
app.use(['/api/deals', '/api/deal-hub'], (req: Request, _res: Response, next: NextFunction) => { if (req.method === 'GET') { try { sweepDealClosures(); } catch (e) { console.error('[DEALS] close sweep', e); } } next(); });

/**
 * v20 — trust numbers per broker in ONE pass over deals / mandates / visits, cached until the data changes.
 * The old code scanned every deal and visit for every user (10k brokers × 10k visits × 1.5k deals = minutes per request);
 * the result is identical, it is just counted once.
 */
type TrustCounts = { deals: number; visits: number; mandates: number; activeMandates: number };
let trustCache: { v: number; state: DatabaseState; m: Map<string, TrustCounts>; at: string } | null = null;
function trustCounts(state: DatabaseState): Map<string, TrustCounts> {
  if (trustCache && trustCache.v === db.version && trustCache.state === state) return trustCache.m;
  const m = new Map<string, TrustCounts>();
  const get = (id: string) => { let c = m.get(id); if (!c) { c = { deals: 0, visits: 0, mandates: 0, activeMandates: 0 }; m.set(id, c); } return c; };
  const dealById = new Map<string, DealRoom>();
  for (const d of state.dealRooms || []) {
    dealById.set(d.id, d);
    if (d.stage === 'Settled' || d.stage === 'Handover' || d.stage === 'Agreement' || d.settlementStatus === 'PAID' || d.settlementStatus === 'AGREED') {
      for (const id of new Set([d.introducingBrokerId, d.closingBrokerId].filter(Boolean) as string[])) get(id).deals++;
    }
  }
  for (const a of state.associateMandates || []) {
    if (!a.brokerId) continue;
    const c = get(a.brokerId); c.activeMandates++;
    if (a.unitsSold > 0 || a.status === 'TOP_PERFORMER' || a.status === 'COMPLETED') c.mandates++;
  }
  for (const v of state.siteVisits || []) {
    if (!v.isVerified) continue;
    const who = new Set<string>(); if (v.brokerId) who.add(v.brokerId);
    const d = v.dealRoomId ? dealById.get(v.dealRoomId) : undefined;
    if (d) { if (d.introducingBrokerId) who.add(d.introducingBrokerId); if (d.closingBrokerId) who.add(d.closingBrokerId); }
    for (const id of who) get(id).visits++;
  }
  trustCache = { v: db.version, state, m, at: new Date().toISOString() };
  return m;
}

function enrichRaw(user: UserProfile, state = db.getState()): UserProfile {
  if (user.role !== 'BROKER') {
    const isVerified = user.verificationStatus === 'VERIFIED';
    return {
      ...user,
      trustScore: isVerified ? 85 : 30,
      trustTier: isVerified ? 'GOLD' : 'NEW',
      completedDealsCount: 0,
      verifiedSiteVisitsCount: 0,
    };
  }
  const tc = trustCounts(state).get(user.id);
  const totalDeals = (tc?.deals || 0) + (tc?.mandates || 0);
  const verifiedVisits = tc?.visits || 0;

  let basePoints = 0;
  if (user.verificationStatus === 'VERIFIED') {
    basePoints = user.reraNumber ? 50 : 40;
  } else if (user.verificationStatus === 'PENDING') {
    basePoints = 20;
  } else if (user.verificationStatus === 'BLACKLISTED') {
    return {
      ...user,
      trustScore: 0,
      trustTier: 'NEW',
      completedDealsCount: totalDeals,
      verifiedSiteVisitsCount: verifiedVisits,
    };
  }

  const dealPoints = Math.min(totalDeals * 15, 40);
  const visitPoints = Math.min(verifiedVisits * 8, 30);

  let rawScore = basePoints + dealPoints + visitPoints;
  if (rawScore > 100) rawScore = 100;
  if (rawScore < 0) rawScore = 0;

  let tier: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'NEW' = 'NEW';
  if (rawScore >= 88) {
    tier = 'PLATINUM';
  } else if (rawScore >= 72) {
    tier = 'GOLD';
  } else if (rawScore >= 50) {
    tier = 'SILVER';
  } else if (rawScore >= 25) {
    tier = 'BRONZE';
  } else {
    tier = 'NEW';
  }

  return {
    ...user,
    trustScore: rawScore,
    trustTier: tier,
    completedDealsCount: totalDeals,
    verifiedSiteVisitsCount: verifiedVisits,
    trustDetails: {
      score: rawScore,
      tier,
      completedDeals: totalDeals,
      verifiedSiteVisits: verifiedVisits,
      activeMandates: tc?.activeMandates || 0,
      lastUpdated: trustCache?.at || new Date().toISOString(), // stable until the data changes (lets the directory ETag work)
    },
  };
}


/** Trust-score enrichment + credential stripping: this is the only way user records leave the server. */
function enrichUserWithTrustScore(user: UserProfile, state = db.getState()): UserProfile {
  return publicUser(enrichRaw(user, state)) as UserProfile;
}


// "View as" sessions are strictly read-only, and accounts flagged mustChangePassword can only reach /api/auth/*.
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const c = ctx();
  if (c.user && c.impersonatedBy && req.method !== 'GET' && !req.path.startsWith('/auth/')) {
    return res.status(403).json({ error: 'Read-only impersonation session: end "view as" to make changes.', code: 'IMPERSONATION_READONLY' });
  }
  if (db.getState().settings.maintenanceMode && !(c.user && (c.user.role === 'SUPERADMIN' || c.user.role === 'ADMIN')) && !req.path.startsWith('/auth/')) {
    return res.status(503).json({ error: 'GENZ is under scheduled maintenance. Please try again shortly.', code: 'MAINTENANCE' });
  }
  if (c.user?.mustChangePassword && !req.path.startsWith('/auth/')) {
    return res.status(403).json({ error: 'Password change required before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
});

function getCurrentUser(): UserProfile {
  const { user } = ctx();
  if (!user) throw new HttpError(401, 'Authentication required');
  return enrichUserWithTrustScore(user, db.getState());
}

/** Directory card for users other than yourself: never leaks email / phone. */
function directoryEntry(u: UserProfile, state = db.getState()) {
  return partnerCard(enrichUserWithTrustScore(u, state));
}

/** A party on someone else's offer/deal: the full profile only for yourself or an admin; otherwise the directory card (no email / phone / PAN / GSTIN). */
function partyCard(u: UserProfile, viewer: UserProfile, state = db.getState()) {
  return u.id === viewer.id || isAdmin(viewer) ? enrichUserWithTrustScore(u, state) : directoryEntry(u, state);
}

function getClientIp(req: Request) {
  return req.ip || 'n/a';
}

// ==========================================
// 1. AUTHENTICATION & ROLE MANAGEMENT
// ==========================================

let DUMMY_HASH: string | null = null;

app.get('/api/auth/config', (_req: Request, res: Response) => {
  const demoAccounts = DEMO_MODE
    ? db.getState().users
        .filter(u => u.verificationStatus !== 'BLACKLISTED')
        .map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, companyName: u.companyName, verificationStatus: u.verificationStatus }))
    : [];
  res.json({ success: true, demoMode: DEMO_MODE, demoPassword: DEMO_MODE ? DEMO_PASSWORD : undefined, demoAccounts });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required' });

  const email = parsed.data.email.trim().toLowerCase();
  const accountKey = `login:${getClientIp(req)}:${email}`;
  // per account: 6 tries / 15 min. Per IP: 300 / 15 min (v28: was 60 — many brokers share one mobile-carrier IP in India)
  const wait = hit(accountKey, 6, 15 * 60_000, 15 * 60_000) || hit(`login-ip:${getClientIp(req)}`, 300, 15 * 60_000);
  if (wait) {
    res.setHeader('Retry-After', String(wait));
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
  }

  const state = db.getState();
  let user = state.users.find(u => u.email.toLowerCase() === email);
  if (!user && !email.includes('@') && digits(email).length === 10) {
    const byPhone = state.users.filter(u => digits(u.phone) === digits(email) && u.verificationStatus !== 'BLACKLISTED');
    if (byPhone.length === 1) user = byPhone[0]; // unambiguous mobile-number sign-in
  }
  if (!DUMMY_HASH) DUMMY_HASH = hashPassword('not-a-real-password');
  const ok = verifyPassword(parsed.data.password, user?.passwordHash || DUMMY_HASH) && !!user;

  if (!ok || !user) {
    if (user) {
      db.appendAuditEvent(user.id, user.role, 'SYSTEM', user.id, 'LOGIN_FAILED', `Failed login attempt from ${getClientIp(req)}`);
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.verificationStatus === 'BLACKLISTED' || user.verificationStatus === 'REJECTED') {
    return res.status(403).json({ error: `This account is ${user.verificationStatus.toLowerCase()}. Contact GENZ Operations.` });
  }

  resetHits(accountKey);
  // v26 — two-step sign-in: the password was right; the session starts only after the authenticator code
  if (twoFactorOn(user.id)) {
    return res.json({ success: true, twoFactorRequired: true, ticket: makeTicket(user) });
  }
  return finishLogin(req, res, user, state);
});

function finishLogin(req: Request, res: Response, user: UserProfile, state = db.getState()) {
  user.lastLoginAt = new Date().toISOString();
  try { recordActivity(user.id, 'seen'); } catch { /* a counter must never block a sign-in */ }
  db.save();
  db.appendAuditEvent(user.id, user.role, 'SYSTEM', user.id, 'LOGIN_SUCCESS', `Signed in from ${getClientIp(req)}`);

  setSessionCookie(req, res, signSession(user.id, user.sessionVersion || 1));
  res.json({
    success: true,
    user: enrichUserWithTrustScore(user, state),
    permissions: effectivePermissions(user),
    mustChangePassword: !!user.mustChangePassword,
    twoFactorSuggested: twoFactorRecommended(user) && !twoFactorOn(user.id),
  });
}

app.post('/api/auth/login/2fa', rateLimit('login-2fa', 30, 15 * 60_000), (req: Request, res: Response) => {
  const t = readTicket(String(req.body?.ticket || ''));
  if (!t) return res.status(401).json({ error: 'The sign-in took too long. Enter your password again.', code: 'TICKET_EXPIRED' });
  const state = db.getState();
  const user = db.byId('users', t.uid) as UserProfile | undefined;
  if (!user || (user.sessionVersion || 1) !== t.sv || ['BLACKLISTED', 'REJECTED'].includes(user.verificationStatus)) return res.status(401).json({ error: 'Sign in again.', code: 'TICKET_EXPIRED' });
  const v = verifySecondFactor(user.id, String(req.body?.code || ''));
  if (v === 'LOCKED') return res.status(429).json({ error: 'Too many wrong codes. Wait 15 minutes.' });
  if (v !== 'OK') {
    db.appendAuditEvent(user.id, user.role, 'SYSTEM', user.id, 'LOGIN_2FA_FAILED', `Wrong two-step code from ${getClientIp(req)}`);
    return res.status(401).json({ error: 'The code is not correct. Use the newest code from your authenticator app (or a recovery code).', code: 'BAD_CODE' });
  }
  return finishLogin(req, res, user, state);
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (_req: Request, res: Response) => {
  const c = ctx();
  const user = getCurrentUser();
  const real = c.impersonatedBy ? db.byId('users', c.impersonatedBy) : undefined;
  res.json({
    success: true,
    user,
    permissions: effectivePermissions(c.user),
    mustChangePassword: !!c.user.mustChangePassword,
    impersonatedBy: real ? { id: real.id, name: real.name } : undefined,
  });
});

app.post('/api/auth/change-password', requireAuth, (req: Request, res: Response) => {
  const c = ctx();
  const { currentPassword, newPassword } = req.body || {};
  if (c.impersonatedBy) return res.status(403).json({ error: 'Not allowed while viewing as another user' });
  const dbUser = db.byId('users', c.user.id)!;
  // Only wrong guesses are throttled (per account, 8 per 10 min); a correct current password clears the counter.
  const wait = hit(`chpw:${dbUser.id}`, 8, 10 * 60_000);
  if (wait) return res.status(429).json({ error: `Too many wrong attempts. Try again in ${Math.ceil(wait / 60)} min, or restart the server.` });
  if (!verifyPassword(String(currentPassword || ''), dbUser.passwordHash)) {
    console.warn(`[AUTH] change-password: current password did not match for ${dbUser.email} (sent ${String(currentPassword || '').length} chars)`);
    return res.status(400).json({ error: 'Current password is incorrect' });
  }
  resetHits(`chpw:${dbUser.id}`);
  const problem = passwordPolicyError(newPassword);
  if (problem) { console.warn(`[AUTH] change-password: new password rejected: ${problem}`); return res.status(400).json({ error: problem }); }
  if (newPassword === currentPassword) return res.status(400).json({ error: 'New password must differ from the current one' });

  dbUser.passwordHash = hashPassword(newPassword);
  dbUser.mustChangePassword = false;
  dbUser.sessionVersion = (dbUser.sessionVersion || 1) + 1; // revoke every other session
  db.save();
  db.appendAuditEvent(dbUser.id, dbUser.role, 'SYSTEM', dbUser.id, 'PASSWORD_CHANGED', 'Password changed; other sessions revoked');
  setSessionCookie(req, res, signSession(dbUser.id, dbUser.sessionVersion));
  res.json({ success: true });
});

// People directory. Admins get full profiles; everyone else gets contact-free "partner cards" of
// network members they can legitimately work with. Pending / suspended accounts get nothing.
/**
 * v20 — the people directory. Other people come as a short card (allow-listed fields only: no phone, e-mail, PAN, referral
 * code or last-login), built once per data change and shared by every caller, and sent with an ETag so a reload that
 * changed nothing costs a few bytes ("304"). At 10k members the old list was ~6 MB and was rebuilt for every request.
 */
const DIR_FIELDS = ['id', 'name', 'role', 'city', 'state', 'brokerId', 'companyName', 'reraNumber', 'verificationStatus', 'avatarUrl', 'createdAt', 'tier', 'firmSegment', 'trustScore', 'trustTier', 'completedDealsCount', 'verifiedSiteVisitsCount'] as const;
function slimCard(u: UserProfile, state: DatabaseState) {
  const e = enrichRaw(u, state) as any; const out: any = {};
  for (const k of DIR_FIELDS) if (e[k] !== undefined && e[k] !== '') out[k] = e[k];
  return out;
}
let dirCache: { v: number; kind: string; body: any[] } | null = null;
let dirCacheAdmin: { v: number; body: any[] } | null = null;
function sendCached(req: Request, res: Response, payload: unknown) {
  const body = JSON.stringify(payload);
  const tag = 'W/"' + sha256(body).slice(0, 27) + '"';
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('ETag', tag);
  if (req.headers['if-none-match'] === tag) return res.status(304).end();
  res.type('application/json').send(body);
}

app.get('/api/auth/users', requireAuth, (req: Request, res: Response) => {
  const c = ctx();
  const state = db.getState();
  const me = c.user as UserProfile;
  if (me.verificationStatus !== 'VERIFIED') {
    return res.json({ success: true, users: [enrichUserWithTrustScore(me, state)], activeUserId: me.id });
  }
  let users: any[];
  if (me.role === 'TEAM_MEMBER') {
    const emp = db.byId('users', me.employerId);
    users = [enrichUserWithTrustScore(me, state), ...(emp ? [directoryEntry(emp, state)] : [])];
    if (can(me, 'connector:desk')) { // ops staff need the broker / contractor pool to assign referrals
      users.push(...state.users.filter(u => (u.role === 'BROKER' || u.role === 'CONTRACTOR') && u.verificationStatus === 'VERIFIED').map(u => slimCard(u, state)));
    }
  } else if (can(me, 'users:list')) {
    if (!dirCacheAdmin || dirCacheAdmin.v !== db.version) dirCacheAdmin = { v: db.version, body: state.users.map(u => enrichUserWithTrustScore(u, state)) };
    // contains e-mail / phone: never stored by the browser (no-store stays), only the server-side build is cached
    return res.json({ success: true, users: dirCacheAdmin.body, activeUserId: me.id });
  } else {
    const visibleRoles: UserRole[] = ['BROKER', 'DEVELOPER_BUILDER', 'LEGAL_COUNSEL', 'ADMIN', 'SUPERADMIN'];
    if (!dirCache || dirCache.v !== db.version) {
      dirCache = { v: db.version, kind: 'members', body: state.users.filter(u => u.verificationStatus === 'VERIFIED' && visibleRoles.includes(u.role)).map(u => slimCard(u, state)) };
    }
    // owners are visible to their own brokers/deals only through deal-room endpoints (never in the global directory)
    users = [enrichUserWithTrustScore(me, state), ...dirCache.body.filter(u => u.id !== me.id)];
    return sendCached(req, res, { success: true, users, activeUserId: me.id });
  }
  res.json({ success: true, users, activeUserId: me.id });
});

app.get('/api/auth/permission-matrix', needs('permissions:read_matrix'), (_req: Request, res: Response) => {
  res.json({ success: true, roles: ALL_ROLES, matrix: permissionMatrix() });
});

// SUPERADMIN-only "view as": read-only, 30 min, audited. Replaces the old open "switch-user" backdoor.
app.post('/api/auth/impersonate', needs('users:impersonate'), (req: Request, res: Response) => {
  const c = ctx();
  if (c.impersonatedBy) return res.status(400).json({ error: 'Already viewing as another user' });
  const target = db.byId('users', req.body?.userId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === c.user.id) return res.status(400).json({ error: 'You are already this user' });
  if (target.verificationStatus === 'BLACKLISTED' || target.verificationStatus === 'REJECTED') {
    return res.status(400).json({ error: 'Cannot view as a blocked account' });
  }
  db.appendAuditEvent(c.user.id, c.user.role, 'SYSTEM', target.id, 'IMPERSONATION_STARTED', `${c.user.name} started a read-only "view as" session for ${target.name} (${target.role})`);
  setSessionCookie(req, res, signSession(target.id, target.sessionVersion || 1, { imp: c.user.id }), 30 * 60_000);
  res.json({ success: true, user: enrichUserWithTrustScore(target, db.getState()) });
});

app.post('/api/auth/impersonate/stop', requireAuth, (req: Request, res: Response) => {
  const c = ctx();
  if (!c.impersonatedBy) return res.status(400).json({ error: 'Not in a "view as" session' });
  const real = db.byId('users', c.impersonatedBy);
  if (!real) return res.status(401).json({ error: 'Original session no longer valid' });
  db.appendAuditEvent(real.id, real.role, 'SYSTEM', c.user.id, 'IMPERSONATION_ENDED', `${real.name} ended the "view as" session for ${c.user.name}`);
  setSessionCookie(req, res, signSession(real.id, real.sessionVersion || 1));
  res.json({ success: true, user: enrichUserWithTrustScore(real, db.getState()) });
});

// Admin: issue a one-time temporary password (shown once, user must change it at next login).
app.post('/api/admin/users/:userId/reset-password', needs('users:reset_password'), (req: Request, res: Response) => {
  const actor = getCurrentUser();
  const target = db.byId('users', req.params.userId);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === actor.id) return res.status(400).json({ error: 'Use "Change password" for your own account' });
  if (!isSuper(actor) && (target.role === 'ADMIN' || target.role === 'SUPERADMIN')) {
    return res.status(403).json({ error: 'Only a SUPERADMIN can reset administrator credentials' });
  }
  const temp = randomPassword();
  target.passwordHash = hashPassword(temp);
  target.mustChangePassword = true;
  target.sessionVersion = (target.sessionVersion || 1) + 1;
  db.save();
  db.appendAuditEvent(actor.id, actor.role, 'SYSTEM', target.id, 'PASSWORD_RESET_ISSUED', `Temporary password issued for ${target.name} (${target.role})`);
  res.json({ success: true, temporaryPassword: temp, note: 'Shown once. The user must change it at next sign-in.' });
});

// ==========================================
// 2. INVITE-ONLY ONBOARDING & VERIFICATION
// ==========================================

app.get('/api/invitations', needs('users:invite'), (_req: Request, res: Response) => {
  const now = Date.now();
  const invs = db.getState().invitations;
  invs.forEach(i => { if (i.status === 'PENDING' && new Date(i.expiresAt).getTime() < now) i.status = 'EXPIRED'; });
  res.json({ success: true, invitations: invs });
});

app.post('/api/invitations', needs('users:invite'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const parsed = inviteCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid invitation' });
  const { invitedPhone, targetRole } = parsed.data;
  // Connectors (shopkeepers) often have no e-mail: they sign in with their mobile number.
  const invitedEmail = parsed.data.invitedEmail || `${digits(invitedPhone)}@phone.genz.local`;

  // Privilege-escalation guard: ADMIN may only invite non-admin roles; SUPERADMIN invites are not issued via the API.
  if (targetRole === 'SUPERADMIN') {
    return res.status(403).json({ error: 'SUPERADMIN accounts cannot be created through invitations' });
  }
  if (targetRole === 'ADMIN' && !can(currentUser, 'users:invite_admin')) {
    return res.status(403).json({ error: 'Only a SUPERADMIN can invite administrators' });
  }

  const state = db.getState();
  if (state.users.some(u => u.email.toLowerCase() === invitedEmail.toLowerCase())) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }
  const open = state.invitations.find(i => i.invitedEmail.toLowerCase() === invitedEmail.toLowerCase() && i.status === 'PENDING' && new Date(i.expiresAt) > new Date());
  if (open) {
    return res.status(409).json({ error: `An active invitation (${open.code}) already exists for this email. Revoke it first.` });
  }

  // 72-bit random code (old format had 4 digits → trivially guessable)
  const code = `GZ-${targetRole.slice(0, 3)}-${secureCode(9)}`;
  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();

  const newInvite = {
    id: `INV-${Date.now()}`,
    code,
    invitedEmail,
    invitedPhone,
    targetRole,
    issuedBy: currentUser.id,
    status: 'PENDING' as const,
    expiresAt,
    createdAt: new Date().toISOString(),
  };

  state.invitations.unshift(newInvite);
  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'SYSTEM',
    newInvite.id,
    'INVITATION_ISSUED',
    `Issued invitation for ${targetRole} (${invitedEmail})`
  );

  res.json({ success: true, invitation: newInvite });
});

app.post('/api/invitations/:id/revoke', needs('users:invite'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const inv = db.byId('invitations', req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invitation not found' });
  if (inv.status !== 'PENDING') return res.status(400).json({ error: `Invitation is already ${inv.status.toLowerCase()}` });
  inv.status = 'REVOKED';
  db.save();
  db.appendAuditEvent(currentUser.id, currentUser.role, 'SYSTEM', inv.id, 'INVITATION_REVOKED', `Invitation for ${inv.invitedEmail} revoked`);
  res.json({ success: true, invitation: inv });
});

app.get('/api/invitations/validate/:code', rateLimit('invite-validate', 20, 10 * 60_000), (req: Request, res: Response) => {
  const { code } = req.params;
  const invite = db.getState().invitations.find(i => i.code.trim().toUpperCase() === code.trim().toUpperCase());
  // Same message for unknown / used / expired codes: do not let attackers probe the code space.
  const generic = { valid: false, error: 'Invalid or expired invitation code' };
  if (!invite || invite.status !== 'PENDING') return res.status(404).json(generic);
  if (new Date(invite.expiresAt) < new Date()) {
    invite.status = 'EXPIRED';
    db.save();
    return res.status(404).json(generic);
  }
  res.json({
    valid: true,
    invitation: {
      code: invite.code,
      targetRole: invite.targetRole,
      invitedEmail: invite.invitedEmail,
      invitedPhone: invite.invitedPhone,
      expiresAt: invite.expiresAt,
      tier2: !!invite.tier2AppId,
      // v18: the invitee sees who is registering them (a name only — no phone / PAN)
      sponsorName: (() => { const a = invite.tier2AppId ? db.byId('tier2Applications', invite.tier2AppId) : undefined; return a ? db.byId('users', a.proposerId)?.name || '' : ''; })(),
      // v19: what the sponsor already filled in, so the sign-up form comes PREFILLED. The Aadhaar is only a last-4 hint (the full number is never kept); the invitation code is a one-time secret meant for this person.
      prefill: (() => {
        const s = db.getState(); const a = invite.tier2AppId ? s.tier2Applications.find(x => x.id === invite.tier2AppId) : undefined;
        if (!a) return null;
        return { name: a.name, city: a.city, companyName: a.companyName || '', panNumber: a.panNumber || '', aadhaarLast4: a.aadhaarLast4 || '', docs: docsOfApplication(s, a.id).map(d => d.kind) };
      })(),
    },
  });
});

app.post('/api/auth/register-invite', rateLimit('register', 10, 60 * 60_000), (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration details' });
  const { code, name, phone, companyName, password } = parsed.data;
  let email = parsed.data.email || '';
  const reraNumber = normRera(parsed.data.reraNumber);
  const panNumber = normPan(parsed.data.panNumber);
  const gstin = normGstin(parsed.data.gstin);
  // v18: Aadhaar is checked here once and only its last 4 digits are ever kept. Never logged, audited or returned.
  const aadhaarRaw = normAadhaar(parsed.data.aadhaarNumber);

  const problem = passwordPolicyError(password);
  if (problem) return res.status(400).json({ error: problem });

  // India KYC: format checks now, authenticity check by an admin on the official portals.
  const targetRoleNeedsRera = (r: string) => r === 'BROKER' || r === 'DEVELOPER_BUILDER';
  if (panNumber && !isValidPan(panNumber)) return res.status(400).json({ error: 'PAN format is invalid (e.g. ABCDE1234F)' });
  if (aadhaarRaw && !isValidAadhaar(aadhaarRaw)) return res.status(400).json({ error: 'Aadhaar number is not valid — please re-check all 12 digits' });
  if (gstin && !isValidGstin(gstin)) return res.status(400).json({ error: 'GSTIN is invalid — please re-check all 15 characters' });
  // v25 — optional address (+ PIN) and the member's tick for keeping the FULL Aadhaar and the address in the encrypted vault
  const kyc = readKycBody(req.body);
  if ('error' in kyc) return res.status(400).json({ error: kyc.error, code: kyc.code });
  if (reraNumber && !isPlausibleRera(reraNumber)) return res.status(400).json({ error: 'RERA registration number looks invalid' });

  let connectorProfile: UserProfile['connector'];
  const state = db.getState();
  const invite = state.invitations.find(i => i.code.trim().toUpperCase() === code.trim().toUpperCase());

  if (!invite || invite.status !== 'PENDING' || new Date(invite.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'Valid invitation code is mandatory' });
  }
  const phoneOnlyInvite = invite.invitedEmail.endsWith('@phone.genz.local');
  if (phoneOnlyInvite) {
    // Connector invited by mobile number only: the code is bound to that number.
    if (digits(invite.invitedPhone) !== digits(phone)) return res.status(400).json({ error: 'This invitation was issued to a different mobile number' });
    email = invite.invitedEmail;
  } else {
    if (!email) return res.status(400).json({ error: 'A valid e-mail address is required' });
    // The invitation is bound to the invited e-mail: a leaked code is useless to anyone else.
    if (invite.invitedEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return res.status(400).json({ error: 'This invitation was issued to a different e-mail address' });
    }
  }
  if (invite.targetRole === 'GENZ_CONNECTOR') {
    const cp = connectorProfileSchema.safeParse({ shopType: parsed.data.shopType, shopName: parsed.data.shopName, locality: parsed.data.locality || undefined, payoutUpi: parsed.data.payoutUpi || undefined });
    if (!cp.success) return res.status(400).json({ error: cp.error.issues[0]?.message || 'Shop details are required' });
    connectorProfile = { ...cp.data, payoutUpi: cp.data.payoutUpi || undefined, whatsapp: phone };
    const sp = invite.sponsorId ? db.byId('users', invite.sponsorId) : undefined;
    if (sp && sp.role === 'BROKER') connectorProfile.sponsorId = sp.id;
  }
  if (state.users.some(u => digits(u.phone) === digits(phone) && u.role === 'GENZ_CONNECTOR') && invite.targetRole === 'GENZ_CONNECTOR') {
    return res.status(400).json({ error: 'A partner with this mobile number already exists' });
  }
  if (state.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'An account with this email address already exists' });
  }

  const t2app = invite.tier2AppId ? db.byId('tier2Applications', invite.tier2AppId) : undefined;
  if (invite.tier2AppId && (!t2app || invite.targetRole !== 'BROKER')) return res.status(400).json({ error: 'Valid invitation code is mandatory' });
  if (!t2app && targetRoleNeedsRera(invite.targetRole) && (!reraNumber || !panNumber)) {
    return res.status(400).json({ error: 'Brokers and builders must provide a RERA registration number and PAN' });
  }

  // v18 — every new broker gives PAN + Aadhaar (last 4 kept) with consent; a local associate (no RERA) also needs a RERA-registered sponsor who is still active.
  let sponsor: UserProfile | undefined;
  if (invite.targetRole === 'BROKER') {
    if (!panNumber) return res.status(400).json({ error: 'PAN is required for brokers', code: 'PAN_REQUIRED' });
    if (!aadhaarRaw) return res.status(400).json({ error: 'Aadhaar number is required for brokers (only the last 4 digits are kept)', code: 'AADHAAR_REQUIRED' });
    if (parsed.data.idConsent !== true) return res.status(400).json({ error: 'Please agree to GENZ keeping your PAN and the last 4 digits of your Aadhaar for verification', code: 'ID_CONSENT_REQUIRED' });
    // one PAN = one GENZ account: stops a removed broker coming back under a new name / number
    if (state.users.some(u => u.role === 'BROKER' && u.panNumber && normPan(u.panNumber) === panNumber)) {
      return res.status(409).json({ error: 'This PAN is already linked to another GENZ account. If that is you, sign in — or write to GENZ support.', code: 'PAN_IN_USE' });
    }
    if (t2app) {
      sponsor = db.byId('users', t2app.proposerId);
      if (!isSponsorEligible(sponsor)) return res.status(409).json({ error: 'Your sponsor is no longer an active RERA-registered member. Ask another RERA-registered broker to register you.', code: 'SPONSOR_INACTIVE' });
    }
  }

  const userId = `USR-${invite.targetRole.slice(0, 3)}-${Date.now()}`;
  const now = new Date().toISOString();

  const newUser: UserProfile = {
    id: userId,
    name,
    email,
    phone,
    role: invite.targetRole,
    city: normCity(req.body?.city || t2app?.city),
    state: findState(req.body?.state)?.name,
    companyName: companyName || connectorProfile?.shopName || '',
    connector: connectorProfile,
    reraNumber: reraNumber || '',
    panNumber: panNumber || undefined,
    gstin: gstin || undefined,
    consent: { policyVersion: POLICY_VERSION, acceptedAt: now, ip: getClientIp(req) },
    verificationStatus: 'PENDING',
    verificationNotes: t2app ? `Tier 2 local associate — registered by ${sponsor?.name || 'a RERA-registered member'}. Pending admin KYC: PAN + Aadhaar must be seen (RERA not required).` : 'Self-registered via invitation. Pending admin KYC & RERA document validation.',
    ...(t2app ? { tier: 'TIER2' as const, vouchedBy: t2app.vouches.map(v => v.userId), sponsorId: t2app.proposerId, sponsoredAt: now } : {}),
    ...(invite.targetRole === 'BROKER' ? { aadhaarLast4: aadhaarTail(aadhaarRaw), idConsentAt: now } : {}),
    createdAt: now,
    passwordHash: hashPassword(password),
    sessionVersion: 1,
  };

  const inviter = invite.nominatedBy || invite.sponsorId;
  if (inviter && state.users.some(x => x.id === inviter)) newUser.invitedById = inviter;
  if (t2app) { t2app.status = 'JOINED'; t2app.userId = userId; t2app.updatedAt = now; }
  // v19 — scans the sponsor attached to the request now belong to the new member (the sponsor can no longer open them)
  if (t2app) for (const d of state.idDocs) if (d.applicationId === t2app.id && !d.subjectUserId) d.subjectUserId = userId;
  // v19 — switch "auto-verify RERA referrals": a person registered by a verified, strike-free RERA broker is verified now; the ID check follows as an open task
  let autoVerified = false; let autoWhy = '';
  if (t2app && invite.targetRole === 'BROKER') {
    const dec = autoVerifyDecision(sponsor);
    autoWhy = dec.why;
    if (dec.apply && sponsor) {
      newUser.verificationStatus = 'VERIFIED'; newUser.autoVerifiedAt = now; newUser.autoVerifiedBy = sponsor.id;
      newUser.verificationNotes = `Auto-verified at sign-up: registered by RERA-registered ${sponsor.name}. The GENZ ID check (PAN + Aadhaar) follows under ID Review.`;
      onVerified(newUser); assignBrokerId(newUser); autoVerified = true;
    }
  }
  const gl = invite.growthLeadId ? db.byId('growthLeads', invite.growthLeadId) : undefined;
  if (gl) { gl.status = 'JOINED'; gl.userId = userId; gl.updatedAt = now; }
  invite.status = 'REDEEMED';
  invite.redeemedBy = userId;
  invite.redeemedAt = now;

  state.users.push(newUser);
  if (invite.targetRole === 'BROKER') openIdTask(userId, autoVerified ? 'AUTO_VERIFY' : 'SIGNUP', { autoVerified, by: userId, note: autoWhy || undefined });
  // v25 — the member ticked the KYC agreement: the FULL Aadhaar and the address go into the encrypted vault (never onto the user record)
  let vaultStored = false;
  if (invite.targetRole === 'BROKER' && kyc.consent && (aadhaarRaw || kyc.address)) vaultStored = storeKyc(newUser, { aadhaar: aadhaarRaw, address: kyc.address, pincode: kyc.pincode, source: kyc.source }).stored;
  db.save();

  db.appendAuditEvent(
    userId,
    newUser.role,
    'VERIFICATION',
    userId,
    'INVITE_REDEEMED',
    `User ${name} registered via invitation ${invite.id}. Verification status set to ${newUser.verificationStatus}.${sponsor ? ` Sponsor (registered by): ${sponsor.name} (${sponsor.id}).` : ''}${invite.targetRole === 'BROKER' ? ' PAN and Aadhaar (last 4 only) received with consent.' : ''}`
  );
  if (autoVerified && sponsor) {
    const setBy = db.byId('users', state.settings.autoVerifyChangedBy)?.name;
    db.appendAuditEvent(userId, newUser.role, 'VERIFICATION', userId, 'USER_AUTO_VERIFIED', `${name} was verified automatically at sign-up because RERA-registered ${sponsor.name} (${sponsor.id}) registered them and the "auto-verify RERA referrals" switch is ON${setBy ? ` (set by ${setBy})` : ''}. An ID-review task is open for the GENZ team.`);
  }

  setSessionCookie(req, res, signSession(userId, 1));
  res.json({ success: true, autoVerified, vaultStored, user: publicUser(newUser), permissions: effectivePermissions(newUser) });
});

// Admin Review of Pending Broker / Contractor Verification
app.post('/api/verifications/:userId/review', needs('users:review'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { userId } = req.params;
  const { action, notes } = req.body || {};
  const state = db.getState();
  const targetUser = db.byId('users', userId);

  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (!['APPROVE', 'REJECT', 'SUSPEND', 'BLACKLIST'].includes(action)) {
    return res.status(400).json({ error: 'action must be APPROVE, REJECT, SUSPEND or BLACKLIST' });
  }
  if (targetUser.id === currentUser.id) {
    return res.status(403).json({ error: 'You cannot review your own account' });
  }
  // Admins can never touch other administrators; only SUPERADMIN can.
  if ((targetUser.role === 'ADMIN' || targetUser.role === 'SUPERADMIN') && !isSuper(currentUser)) {
    return res.status(403).json({ error: 'Only a SUPERADMIN can review administrator accounts' });
  }
  if (targetUser.role === 'SUPERADMIN') {
    return res.status(403).json({ error: 'SUPERADMIN accounts cannot be reviewed through the API' });
  }
  if (action === 'BLACKLIST' && !can(currentUser, 'users:blacklist')) {
    return res.status(403).json({ error: 'Only a SUPERADMIN can blacklist a user' });
  }
  if (typeof notes === 'string' && notes.length > 1000) {
    return res.status(400).json({ error: 'Notes are too long' });
  }

  if (action === 'APPROVE') {
    const needsRera = (targetUser.role === 'BROKER' || targetUser.role === 'DEVELOPER_BUILDER') && state.settings.requireReraForBrokerApproval && targetUser.tier !== 'TIER2';
    if (needsRera && !targetUser.reraNumber) {
      return res.status(400).json({ error: 'A RERA registration number is required before approving a broker / builder (platform setting).' });
    }
    // v18 — a local associate (no RERA) is approved only after PAN + Aadhaar are on file AND a GENZ admin has seen the originals.
    if (targetUser.role === 'BROKER' && targetUser.tier === 'TIER2' && targetUser.verificationStatus === 'PENDING') {
      if (!targetUser.panNumber || !targetUser.aadhaarLast4) {
        return res.status(400).json({ error: 'PAN and Aadhaar are missing. A local associate (no RERA) can be approved only after both are on file — ask the member to add them under Network → My ID.', code: 'ID_MISSING' });
      }
      if (!targetUser.idCheckedAt) {
        return res.status(400).json({ error: 'Check the PAN card and the Aadhaar card (video call / office) and tick "ID seen" first. A local associate (no RERA) cannot be approved without it.', code: 'ID_CHECK_PENDING' });
      }
    }
    targetUser.verificationStatus = 'VERIFIED';
    onVerified(targetUser);
    assignBrokerId(targetUser);
    targetUser.verificationNotes = notes || 'Verified after verifying RERA credential and address records.';
  } else if (action === 'REJECT') {
    targetUser.verificationStatus = 'REJECTED';
    targetUser.verificationNotes = notes || 'Verification rejected by administrator.';
  } else if (action === 'SUSPEND') {
    targetUser.verificationStatus = 'SUSPENDED';
    targetUser.verificationNotes = notes || 'Account suspended pending investigation.';
  } else if (action === 'BLACKLIST') {
    targetUser.verificationStatus = 'BLACKLISTED';
    targetUser.verificationNotes = notes || 'Blacklisted due to verified policy breach or bypass attempt.';
  }
  if (action === 'SUSPEND' || action === 'BLACKLIST') applyVoucherStrikes(targetUser, currentUser.id, currentUser.role);
  // v19: an adverse decision also closes the person's ID-review task and starts the delete clock on his scans
  if (action !== 'APPROVE') closeIdTaskOnAdverse(targetUser.id, currentUser.id, action, typeof notes === 'string' ? notes.slice(0, 200) : undefined);

  // Any adverse decision kills the user's live sessions immediately.
  if (action !== 'APPROVE') targetUser.sessionVersion = (targetUser.sessionVersion || 1) + 1;

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'VERIFICATION',
    targetUser.id,
    `USER_${action}`,
    `Admin ${currentUser.name} applied ${action} on ${targetUser.name} (${targetUser.brokerId || targetUser.role}). Notes: ${notes || 'N/A'}`
  );

  res.json({ success: true, user: publicUser(targetUser) });
});

// ==========================================
// 3. PROPERTY MANAGEMENT & PRIVACY
// ==========================================

const PUBLIC_PROPERTY_STATUSES = ['active', 'under_negotiation'];
const roundCoord = (n?: number) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n);

/**
 * Single privacy projection for property records. Everything that returns a property to a client goes through here.
 *  - owner commercials (net price, owner phone/name, dedupe hash) → principals + admins only
 *  - exact address / street / maps links / precise pin → principals, admins, legal, or a broker with a *verified* site visit
 */
function sanitizeProperty(p: any, user: UserProfile, state = db.getState()) {
  const commercial = canSeeOwnerCommercials(user, p);
  const protectedOk = canSeeProtectedPropertyData(state, user, p);
  const out: any = { ...p };
  delete out.duplicateHash;
  delete out.ownerKeyHash;
  // v27 — the closing price / note / winning offer are private to the owner, the listing broker and GENZ staff
  if (!isAdmin(user) && p.ownerId !== user.id && p.listingBrokerId !== user.id) { delete out.soldPrice; delete out.soldNote; delete out.soldOfferId; }
  if (!commercial) {
    delete out.ownerApprovedNetPrice;
    out.ownerPhone = maskPhoneNumber(p.ownerPhone);
    out.ownerName = 'Owner (identity protected)';
  }
  if (!protectedOk) {
    out.addressHidden = 'Address protected by GENZ Privacy Shield (Disclosed upon verified site visit)';
    out.street = '';
    out.googleMapsUrl = '';
    out.googleMapsDirectionsUrl = '';
    out.latitude = roundCoord(p.latitude);
    out.longitude = roundCoord(p.longitude);
    out.locationPrecision = p.locationPrecision === 'EXACT_PIN' ? 'GENERAL_AREA' : p.locationPrecision;
    out.documents = [];
  }
  return out;
}

function sanitizeRequirement(r: any, user: UserProfile) {
  const full = isAdmin(user) || r.assignedBrokerId === user.id || (r.buyerId && r.buyerId === user.id);
  // v20: another broker's client is shown by initials only (name + phone together let anyone go around the broker)
  const initials = (n: string) => String(n || '').split(/\s+/).filter(w => /^[A-Za-z\u0900-\u097F]/.test(w)).slice(0, 3).map(w => w[0].toUpperCase() + '.').join(' ') || 'Client';
  return full ? r : { ...r, customerName: initials(r.customerName), customerPhone: maskPhoneNumber(r.customerPhone), buyerId: undefined, customerId: undefined };
}

function nextSeq(ids: string[], re: RegExp, floor = 0) {
  return ids.reduce((m, id) => Math.max(m, Number(re.exec(id)?.[1] ?? 0)), floor) + 1;
}

app.get('/api/properties', needs('property:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { locality, propertyType, transactionType, maxPrice } = req.query;
  const qState = req.query.state ? String(req.query.state) : '';
  const qCity = req.query.city ? String(req.query.city) : '';
  const qPin = req.query.pincode ? String(req.query.pincode).trim() : '';
  const qTag = req.query.tag ? String(req.query.tag).toLowerCase() : '';
  const state = db.getState();

  // Network members only see live, verified listings + whatever they own / list; admins see everything.
  // Property owners see ONLY their own properties — never another owner's.
  let list = state.properties.filter(p => canBrowseProperty(currentUser, p) || canSeeClosedProperty(currentUser, p));

  if (qState) list = list.filter(p => (findState(p.state)?.name || p.state || '').toLowerCase() === (findState(qState)?.name || qState).toLowerCase());
  if (qCity) list = list.filter(p => sameCity(p.city, qCity));
  if (qPin) list = list.filter(p => (p.pincode || '') === qPin);
  if (qTag) list = list.filter(p => (p.tags || []).some(t => t.toLowerCase() === qTag));
  if (locality) {
    list = list.filter(p => p.locality.toLowerCase().includes(String(locality).toLowerCase()));
  }
  if (propertyType) {
    list = list.filter(p => p.propertyType === propertyType);
  }
  if (transactionType) {
    list = list.filter(p => p.transactionType === transactionType);
  }
  if (maxPrice && Number.isFinite(Number(maxPrice))) {
    list = list.filter(p => p.askingPrice <= Number(maxPrice));
  }
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 80);
  if (q) list = list.filter(p => p.title.toLowerCase().includes(q) || p.locality.toLowerCase().includes(q) || p.id.toLowerCase().includes(q) || (p.pincode || '').includes(q) || (p.city || '').toLowerCase().includes(q));

  // v20 — at network scale nobody can (or should) download every listing in India on each app start.
  //  • scope=boot: everything that is MINE or part of my deals / offers / visits, plus the newest listings (my city first)
  //  • limit/offset: one page of a search, newest first
  // Without either, the old "everything visible" answer is kept (small networks, older screens).
  const total = list.length;
  const scope = String(req.query.scope || '');
  const limit = Math.min(200, Math.max(0, Number(req.query.limit) || 0));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const BOOT_CAP = Number(process.env.BOOT_LISTINGS || 400);
  const newest = (x: any, y: any) => String(y.updatedAt || y.createdAt || '').localeCompare(String(x.updatedAt || x.createdAt || ''));
  if (scope === 'boot' && total > BOOT_CAP) {
    const keep = new Set<string>();
    for (const p of list) if (p.listingBrokerId === currentUser.id || p.ownerId === currentUser.id) keep.add(p.id);
    for (const d of state.dealRooms) if (isDealParticipant(currentUser, d) && d.propertyId) keep.add(d.propertyId);
    for (const o of state.offers) if ((o.proposingBrokerId === currentUser.id || o.receivingBrokerId === currentUser.id) && o.propertyId) keep.add(o.propertyId);
    for (const v of state.siteVisits) if (v.brokerId === currentUser.id && v.propertyId) keep.add(v.propertyId);
    const visible = new Map(list.map(p => [p.id, p]));
    const pinned = [...keep].map(id => visible.get(id)).filter(Boolean) as typeof list;
    const rest = list.filter(p => !keep.has(p.id)).sort((x, y) => {
      const cx = sameCity(x.city, currentUser.city) ? 0 : 1; const cy = sameCity(y.city, currentUser.city) ? 0 : 1;
      return cx - cy || newest(x, y);
    }).slice(0, Math.max(0, BOOT_CAP - pinned.length));
    const facets = propertyFacets(list);
    return res.json({ success: true, properties: [...pinned, ...rest].map(p => sanitizeProperty(p, currentUser, state)), total, scoped: true, facets });
  }
  if (limit > 0) {
    const page = [...list].sort(newest).slice(offset, offset + limit);
    return res.json({ success: true, properties: page.map(p => sanitizeProperty(p, currentUser, state)), total, offset, hasMore: offset + page.length < total });
  }
  res.json({ success: true, properties: list.map(p => sanitizeProperty(p, currentUser, state)), total });
});

/** states / cities / tags that exist in what this person can browse (drop-downs on a partial list) */
function propertyFacets(list: { state?: string; city?: string; tags?: string[] }[]) {
  const states = new Map<string, number>(); const cities = new Map<string, number>(); const tags = new Map<string, number>();
  for (const p of list) {
    if (p.state) states.set(p.state, (states.get(p.state) || 0) + 1);
    if (p.city) cities.set(`${p.state || ''}|${p.city}`, (cities.get(`${p.state || ''}|${p.city}`) || 0) + 1);
    for (const t of p.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
  }
  return {
    states: [...states].sort((a, b) => a[0].localeCompare(b[0])).map(([name, n]) => ({ name, n })),
    cities: [...cities].map(([k, n]) => { const [state, city] = k.split('|'); return { state, city, n }; }).sort((a, b) => a.city.localeCompare(b.city)),
    tags: [...tags].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([name, n]) => ({ name, n })),
  };
}

app.get('/api/properties/:id', needs('property:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { id } = req.params;
  const state = db.getState();
  const p = db.byId('properties', id);

  if (!p || !(canBrowseProperty(currentUser, p) || canSeeClosedProperty(currentUser, p))) {
    return res.status(404).json({ error: 'Property not found' });
  }

  res.json({ success: true, property: sanitizeProperty(p, currentUser, state) });
});

app.post('/api/properties', needs('property:create'), newAccountCap('listing', 5), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();

  const parseResult = propertyCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  const data = parseResult.data;
  const state = db.getState();

  // Resolve the two principals explicitly — never default to a hard-coded broker/owner account.
  let listingBrokerId = '';
  let ownerId = '';
  const asBroker = (id?: string) => {
    const b = id ? db.byId('users', id) : undefined;
    return b && b.role === 'BROKER' && b.verificationStatus === 'VERIFIED' ? b.id : null;
  };
  const asOwner = (id?: string) => {
    const o = id ? db.byId('users', id) : undefined;
    return o && o.role === 'PROPERTY_OWNER' && o.verificationStatus === 'VERIFIED' ? o.id : null;
  };
  if (currentUser.role === 'BROKER') {
    listingBrokerId = currentUser.id;
    if (data.ownerId) {
      const o = asOwner(data.ownerId);
      if (!o) return res.status(400).json({ error: 'ownerId must be a verified property-owner account' });
      ownerId = o;
    }
  } else if (currentUser.role === 'PROPERTY_OWNER') {
    ownerId = currentUser.id;
    if (data.listingBrokerId) {
      const b = asBroker(data.listingBrokerId);
      if (!b) return res.status(400).json({ error: 'listingBrokerId must be a verified broker' });
      listingBrokerId = b;
    }
  } else {
    // ADMIN / SUPERADMIN listing on behalf of someone: must name at least one verified principal
    if (data.listingBrokerId) {
      const b = asBroker(data.listingBrokerId);
      if (!b) return res.status(400).json({ error: 'listingBrokerId must be a verified broker' });
      listingBrokerId = b;
    }
    if (data.ownerId) {
      const o = asOwner(data.ownerId);
      if (!o) return res.status(400).json({ error: 'ownerId must be a verified property-owner account' });
      ownerId = o;
    }
    if (!listingBrokerId && !ownerId) {
      return res.status(400).json({ error: 'Name the listing broker and/or the owner account for this listing' });
    }
  }

  // v15: a Tier 2 broker on probation lists fewer properties at a time
  if (currentUser.role === 'BROKER' && inProbationT(currentUser) && db.getState().properties.filter(x => x.listingBrokerId === currentUser.id && ['draft', 'pending_verification', 'active', 'under_negotiation'].includes(x.listingStatus)).length >= PROBATION_LIVE_LISTINGS) {
    return res.status(429).json({ error: `During your 30-day probation you can keep ${PROBATION_LIVE_LISTINGS} live listings. Mark old ones sold / withdrawn or wait for probation to end.`, code: 'PROBATION_CAP' });
  }

  // v26 — the owner's consent: one property, one consented broker while the protection lasts (owner phone + city + locality + type)
  const consentId = typeof req.body?.consentId === 'string' ? req.body.consentId.slice(0, 40) : '';
  const principalBroker = listingBrokerId || currentUser.id;
  const bond = findBlockingBond({ ownerPhone: data.ownerPhone, city: data.city, locality: data.locality, propertyType: data.propertyType, areaSqft: data.plotAreaSqFt || data.builtUpAreaSqFt }, principalBroker, consentId);
  if (bond) return res.status(409).json(blockedAnswer(bond));
  let usedConsent: any = null;
  if (consentId) {
    const c = consentForPublish(consentId, principalBroker, data);
    if ('error' in c) return res.status(c.status).json({ error: c.error, code: c.code });
    usedConsent = c.consent;
  } else if (state.settings.ownerConsentRequired && currentUser.role === 'BROKER') {
    return res.status(428).json({ error: "GENZ needs the owner's consent before a listing goes live. Use “Paste from WhatsApp / Ask owner” to send the owner a consent link or upload a signed form.", code: 'CONSENT_REQUIRED' });
  }

  // Duplicate Property Detection check
  const duplicateHash = sha256(`${data.city}:${data.locality}:${data.propertyType}:${data.plotAreaSqFt || data.builtUpAreaSqFt || 0}:${data.askingPrice}`);
  const duplicate = state.properties.find(p => p.duplicateHash === duplicateHash && p.listingStatus === 'active');
  if (duplicate) {
    // Never reveal someone else's listing (id / title) to the person trying to list it.
    const mine = isAdmin(currentUser) || duplicate.ownerId === currentUser.id || duplicate.listingBrokerId === currentUser.id;
    return res.status(409).json({
      error: mine
        ? `Duplicate listing suspected! Matches existing inventory ${duplicate.id} (${duplicate.title}). Contact the platform admin for verification.`
        : 'Duplicate listing suspected: a matching property is already on the network. Contact the platform admin for verification.',
      duplicatePropertyId: mine ? duplicate.id : undefined,
    });
  }

  // v14 resale: the same property (city + locality + type + area) was sold / rented on GENZ before → new listing, linked, re-verified.
  const resaleKey = resaleKeyOf(data as any);
  const earlier = state.properties.find(p => p.resaleKey === resaleKey && ['sold', 'rented'].includes(p.listingStatus));
  const propSeq = nextSeq(state.properties.map(p => p.id), /PROP-(?:RAI-)?(\d+)/, 100);
  const propertyId = `PROP-${propSeq}`;
  const now = new Date().toISOString();

  const newProperty: any = {
    id: propertyId,
    title: data.title,
    description: data.description,
    propertyType: data.propertyType,
    transactionType: data.transactionType,
    city: data.city,
    state: data.state,
    district: data.district || '',
    tehsil: data.tehsil || '',
    village: data.village || '',
    street: data.street || '',
    pincode: data.pincode || '',
    tags: data.tags,
    locality: data.locality,
    addressHidden: data.addressHidden,
    landmark: data.landmark || '',
    googleMapsUrl: data.googleMapsUrl || '',
    googleMapsDirectionsUrl: data.googleMapsDirectionsUrl || '',
    latitude: data.latitude,
    longitude: data.longitude,
    locationPrecision: data.locationPrecision || 'APPROXIMATE_LOCALITY',
    videoUrl: data.videoUrl || '',
    plotAreaSqFt: data.plotAreaSqFt,
    builtUpAreaSqFt: data.builtUpAreaSqFt,
    askingPrice: data.askingPrice,
    ownerApprovedNetPrice: data.ownerApprovedNetPrice,
    listingBrokerId,
    ownerId,
    ownerName: data.ownerName,
    ownerPhone: data.ownerPhone,
    listingStatus: 'active',
    verificationStatus: earlier ? 'PENDING' : 'VERIFIED', // a resale of a closed listing needs ownership re-verification; otherwise the creator is a KYC-verified member and admins can still moderate via /moderate
    duplicateHash,
    resaleKey,
    ...(earlier ? { resaleOf: earlier.id } : {}),
    priceHistory: [
      { price: data.askingPrice, changedAt: now, reason: 'Initial listing registered' },
    ],
    images: data.images && data.images.length > 0 ? data.images : [], // never a stock photo: a listing without photos shows "No photo yet"
    documents: [],
    confirmedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // Automatically register primary photo into Property Media Vault
  if (newProperty.images && newProperty.images.length > 0) {
    newProperty.images.forEach((imgUrl: string, idx: number) => {
      state.propertyMediaAssets.push({
        id: `ASSET-${propertyId}-${idx + 1}`,
        propertyId,
        uploaderId: currentUser.id,
        uploaderName: currentUser.name,
        introducerId: currentUser.id,
        originalFileName: `property_image_${idx + 1}.jpg`,
        category: 'PHOTOGRAPH',
        mimeType: 'image/jpeg',
        fileSizeBytes: 0,
        fileUrl: imgUrl,
        storagePath: `vault/${propertyId}/photos/property_image_${idx + 1}.jpg`,
        sha256Hash: sha256(`${propertyId}:${imgUrl}`),
        description: `Primary listing photograph ${idx + 1}`,
        version: 1,
        sensitivity: 'PUBLIC',
        isMalwareScanned: false,
        status: 'ACTIVE',
        createdAt: now,
      });
    });
  }

  // Register Walkthrough Video into Vault if provided
  if (data.videoUrl) {
    state.propertyMediaAssets.push({
      id: `ASSET-${propertyId}-VID`,
      propertyId,
      uploaderId: currentUser.id,
      uploaderName: currentUser.name,
      introducerId: currentUser.id,
      originalFileName: 'property_walkthrough_video.mp4',
      category: 'WALKTHROUGH_VIDEO',
      mimeType: 'video/mp4',
      fileSizeBytes: 0,
      fileUrl: data.videoUrl,
      storagePath: `vault/${propertyId}/videos/walkthrough.mp4`,
      sha256Hash: sha256(`${propertyId}:${data.videoUrl}`),
      description: 'Site walkthrough & video inspection',
      version: 1,
      sensitivity: 'CONFIDENTIAL',
      isMalwareScanned: false,
      status: 'ACTIVE',
      createdAt: now,
    });
  }

  newProperty.ownerKeyHash = listingKey({ ownerPhone: data.ownerPhone, city: data.city, locality: data.locality, propertyType: data.propertyType });
  if (usedConsent) markPublished(usedConsent, newProperty);
  state.properties.unshift(newProperty);
  // v28 — listed with the normal form (no owner consent yet): an owner-approval draft is made at once, so the broker can send the
  // owner the WhatsApp approval link straight away (the yes starts the bypass protection and, with brokerage terms, the mandate)
  let ownerApproval: { draftId: string } | undefined;
  if (!usedConsent && currentUser.role !== 'PROPERTY_OWNER' && newProperty.listingBrokerId === currentUser.id && /^[6-9]\d{9}$/.test(String(newProperty.ownerPhone || '').replace(/\D/g, '').slice(-10))) {
    const r2 = draftForProperty(currentUser, newProperty);
    if ('draft' in r2) ownerApproval = { draftId: r2.draft.id };
  }
  db.save();
  setImmediate(() => alertNewListing(newProperty));

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'PROPERTY',
    propertyId,
    'PROPERTY_REGISTERED',
    `New property ${propertyId} listed in ${data.locality} for ₹${data.askingPrice.toLocaleString('en-IN')}`
  );

  res.json({
    success: true, property: sanitizeProperty(newProperty, currentUser, state), ownerApproval,
    ...(earlier ? { resaleNotice: 'A property matching this one was sold / rented on GENZ earlier. This is saved as a resale: GENZ will re-verify ownership before it goes live. The earlier deals and commissions stay with the earlier listing.' } : {}),
  });
});

/** Resolve a property the caller may *manage* (owner, listing broker, admin); sends the error response itself. */
function loadManageableProperty(req: Request, res: Response, user: UserProfile) {
  const prop = db.byId('properties', req.params.id);
  if (!prop) {
    res.status(404).json({ error: 'Property not found' });
    return null;
  }
  if (!isAdmin(user) && prop.ownerId !== user.id && prop.listingBrokerId !== user.id) {
    res.status(403).json({ error: 'Unauthorized: only the listing broker, property owner, or platform admin can modify this listing.' });
    return null;
  }
  return prop;
}

app.post('/api/properties/:id/price-update', needs('property:update'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { newAskingPrice, reason } = req.body || {};
  const price = Number(newAskingPrice);

  if (!Number.isFinite(price) || price <= 0 || price > 100_000_000_000) {
    return res.status(400).json({ error: 'Valid positive price required' });
  }

  const prop = loadManageableProperty(req, res, currentUser);
  if (!prop) return;
  if (['sold', 'rented', 'withdrawn'].includes(prop.listingStatus)) {
    return res.status(409).json({ error: `Cannot revise the price of a ${prop.listingStatus} listing` });
  }
  if (prop.ownerApprovedNetPrice && price < prop.ownerApprovedNetPrice) {
    return res.status(400).json({ error: 'Asking price cannot be set below the owner-approved net price' });
  }

  const now = new Date().toISOString();
  prop.priceHistory.push({
    price,
    changedAt: now,
    reason: String(reason || 'Owner price revision').slice(0, 300),
  });
  prop.askingPrice = price;
  prop.updatedAt = now;

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'PROPERTY',
    prop.id,
    'PRICE_REVISED',
    `Price revised to ₹${price.toLocaleString('en-IN')}. Reason: ${reason || 'N/A'}`
  );

  res.json({ success: true, property: sanitizeProperty(prop, currentUser) });
});

// Update Property Listing (listing broker, owner or platform admin) — whitelist-validated, no mass assignment.
app.put('/api/properties/:id', needs('property:update'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const prop = loadManageableProperty(req, res, currentUser);
  if (!prop) return;

  const parsed = propertyUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation error' });
  }
  const data = parsed.data;
  const isOwner = prop.ownerId === currentUser.id;
  const ownerSide = isOwner || isAdmin(currentUser);

  // Owner-confidential fields can only be changed by the owner (or an admin) — never by the listing broker.
  const changesOwnerField =
    (data.ownerApprovedNetPrice !== undefined && data.ownerApprovedNetPrice !== prop.ownerApprovedNetPrice) ||
    (data.ownerName !== undefined && data.ownerName !== prop.ownerName) ||
    (data.ownerPhone !== undefined && data.ownerPhone !== prop.ownerPhone);
  if (!ownerSide && changesOwnerField) {
    return res.status(403).json({ error: 'Only the property owner or an admin can change owner-confidential fields (net price, owner name/phone).' });
  }
  if (['sold', 'rented'].includes(prop.listingStatus)) {
    return res.status(409).json({ error: `A ${prop.listingStatus} listing is closed and cannot be edited` });
  }
  if (data.ownerApprovedNetPrice !== undefined && data.ownerApprovedNetPrice !== prop.ownerApprovedNetPrice &&
      state.ownerMandates.some(m => m.propertyId === prop.id && m.status === 'ACTIVE') && !isAdmin(currentUser)) {
    return res.status(409).json({ error: 'The net amount is fixed by a signed mandate. Submit a new mandate for the listing broker to co-sign instead.' });
  }
  if (data.listingStatus === 'withdrawn') {
    const live = state.dealRooms.some(d => d.propertyId === prop.id && !['Settled', 'Lead'].includes(d.stage) && d.settlementStatus !== 'PAID');
    if (live) return res.status(409).json({ error: 'Cannot withdraw: this property has live deal rooms. Settle or dispute them first.' });
  }

  const now = new Date().toISOString();
  const nextAsking = data.askingPrice ?? prop.askingPrice;
  const nextNet = data.ownerApprovedNetPrice ?? prop.ownerApprovedNetPrice;
  if (nextNet && nextAsking < nextNet) {
    return res.status(400).json({ error: 'Asking price cannot be below the owner-approved net price' });
  }

  // If asking price has changed, record price revision audit
  if (data.askingPrice !== undefined && data.askingPrice !== prop.askingPrice) {
    const oldPrice = prop.askingPrice;
    const newPrice = data.askingPrice;
    if (!prop.priceHistory) prop.priceHistory = [];
    prop.priceHistory.push({
      price: newPrice,
      changedAt: now,
      reason: data.priceChangeReason || `Listing update by ${currentUser.name} (${currentUser.role})`,
    });
    prop.askingPrice = newPrice;

    db.appendAuditEvent(
      currentUser.id,
      currentUser.role,
      'PROPERTY',
      prop.id,
      'PRICE_REVISED',
      `Asking price modified from ₹${oldPrice.toLocaleString('en-IN')} to ₹${newPrice.toLocaleString('en-IN')}`
    );
  }

  const { askingPrice: _a, images: _i, priceChangeReason: _r, ...plain } = data;
  Object.assign(prop, plain);

  // Update images & sync into property media assets vault if any new images
  if (Array.isArray(data.images) && data.images.length > 0) {
    prop.images = data.images;
    data.images.forEach((imgUrl: string, idx: number) => {
      const existing = state.propertyMediaAssets.find(a => a.propertyId === prop.id && a.fileUrl === imgUrl);
      if (!existing) {
        state.propertyMediaAssets.push({
          id: `ASSET-${prop.id}-${Date.now()}-${idx + 1}`,
          propertyId: prop.id,
          uploaderId: currentUser.id,
          uploaderName: currentUser.name,
          introducerId: currentUser.id,
          originalFileName: `property_image_${idx + 1}.jpg`,
          category: 'PHOTOGRAPH',
          mimeType: 'image/jpeg',
          fileSizeBytes: 0,
          fileUrl: imgUrl,
          storagePath: `vault/${prop.id}/photos/image_${idx + 1}.jpg`,
          sha256Hash: sha256(`${prop.id}:${imgUrl}`),
          description: `Listing photo ${idx + 1}`,
          version: 1,
          sensitivity: 'PUBLIC',
          isMalwareScanned: false,
          status: 'ACTIVE',
          createdAt: now,
        });
      }
    });
  }

  prop.updatedAt = now;
  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'PROPERTY',
    prop.id,
    'PROPERTY_UPDATED',
    `Listing ${prop.id} ("${prop.title}") updated by ${currentUser.name} (${currentUser.role})`
  );

  res.json({ success: true, property: sanitizeProperty(prop, currentUser, state) });
});

// Withdraw (soft delete) — the client already exposes a "delete" action; it previously 404'd.
app.delete('/api/properties/:id', needs('property:withdraw'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const prop = loadManageableProperty(req, res, currentUser);
  if (!prop) return;
  const live = state.dealRooms.some(d => d.propertyId === prop.id && !['Settled'].includes(d.stage) && d.settlementStatus !== 'PAID');
  if (live) {
    return res.status(409).json({ error: 'Cannot withdraw: this property has live deal rooms. Settle or dispute them first.' });
  }
  prop.listingStatus = 'withdrawn';
  prop.updatedAt = new Date().toISOString();
  db.save();
  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', prop.id, 'PROPERTY_WITHDRAWN', `Listing ${prop.id} withdrawn by ${currentUser.name}`);
  res.json({ success: true, message: 'Listing withdrawn' });
});

// Admin moderation of a listing
app.post('/api/properties/:id/moderate', needs('property:moderate'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const prop = db.byId('properties', req.params.id);
  if (!prop) return res.status(404).json({ error: 'Property not found' });
  const { action, reason } = req.body || {};
  if (!['APPROVE', 'REJECT', 'SUSPEND', 'RESTORE'].includes(action)) {
    return res.status(400).json({ error: 'action must be APPROVE, REJECT, SUSPEND or RESTORE' });
  }
  if (action !== 'APPROVE' && action !== 'RESTORE' && (!reason || String(reason).trim().length < 5)) {
    return res.status(400).json({ error: 'A reason (min 5 chars) is required' });
  }
  if (action === 'APPROVE') prop.verificationStatus = 'VERIFIED';
  if (action === 'REJECT') { prop.verificationStatus = 'REJECTED'; prop.listingStatus = 'suspended'; }
  if (action === 'SUSPEND') prop.listingStatus = 'suspended';
  if (action === 'RESTORE') { prop.listingStatus = 'active'; prop.verificationStatus = 'VERIFIED'; }
  prop.updatedAt = new Date().toISOString();
  db.save();
  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', prop.id, `LISTING_${action}`, `Listing ${prop.id} ${action} by ${currentUser.name}. ${reason || ''}`.trim());
  res.json({ success: true, property: sanitizeProperty(prop, currentUser) });
});


// ==========================================
// 4. BUYER REQUIREMENTS & CUSTOMER PERSISTENCE
// ==========================================

app.get('/api/requirements', needs('requirement:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();

  // Buyers only ever see their own enquiries; brokers see the network board with customer phone masked.
  let visible = currentUser.role === 'BUYER_TENANT'
    ? state.requirements.filter(r => r.buyerId === currentUser.id)
    : state.requirements;
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 80);
  const qCity = String(req.query.city || '').trim();
  const qType = String(req.query.propertyType || '').trim();
  const mineOnly = req.query.mine === '1';
  if (mineOnly) visible = visible.filter(r => r.assignedBrokerId === currentUser.id || r.buyerId === currentUser.id);
  if (qCity) visible = visible.filter(r => sameCity(r.city, qCity));
  if (qType) visible = visible.filter(r => r.propertyType === qType);
  if (q) visible = visible.filter(r => r.id.toLowerCase().includes(q) || r.propertyType.toLowerCase().includes(q) || (r.city || '').toLowerCase().includes(q) || r.preferredLocalities.some(l => l.toLowerCase().includes(q)));
  // v20 — same pattern as listings: start with MY clients + what my deals / offers use + the newest needs (my city first);
  // everything else is searched page by page
  const total = visible.length;
  const BOOT_CAP = Number(process.env.BOOT_REQUIREMENTS || 300);
  const limit = Math.min(200, Math.max(0, Number(req.query.limit) || 0));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const newest = (x: any, y: any) => String(y.updatedAt || y.createdAt || '').localeCompare(String(x.updatedAt || x.createdAt || ''));
  if (req.query.scope === 'boot' && total > BOOT_CAP) {
    const keep = new Set<string>();
    for (const r of visible) if (r.assignedBrokerId === currentUser.id || r.buyerId === currentUser.id) keep.add(r.id);
    for (const d of state.dealRooms) if (d.requirementId && isDealParticipant(currentUser, d)) keep.add(d.requirementId);
    for (const o of state.offers) if (o.requirementId && (o.proposingBrokerId === currentUser.id || o.receivingBrokerId === currentUser.id)) keep.add(o.requirementId);
    const pinned = visible.filter(r => keep.has(r.id));
    const rest = visible.filter(r => !keep.has(r.id)).sort((x, y) => (sameCity(x.city, currentUser.city) ? 0 : 1) - (sameCity(y.city, currentUser.city) ? 0 : 1) || newest(x, y)).slice(0, Math.max(0, BOOT_CAP - pinned.length));
    return res.json({ success: true, requirements: [...pinned, ...rest].map(r => sanitizeRequirement(r, currentUser)), total, scoped: true });
  }
  if (limit > 0) {
    const page = [...visible].sort(newest).slice(offset, offset + limit);
    return res.json({ success: true, requirements: page.map(r => sanitizeRequirement(r, currentUser)), total, offset, hasMore: offset + page.length < total });
  }
  res.json({ success: true, requirements: visible.map(r => sanitizeRequirement(r, currentUser)), total });
});

app.post('/api/requirements', needs('requirement:create'), newAccountCap('requirement', 10), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();

  const parseResult = requirementCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  const data = parseResult.data;
  const state = db.getState();
  const reqSeq = nextSeq(state.requirements.map(r => r.id), /REQ-(?:RAI-)?(\d+)/, 200);
  const requirementId = `REQ-${reqSeq}`;
  const now = new Date().toISOString();

  // Persistent customer entity ID — re-use the same entity for the same phone number
  const existing = state.requirements.find(r => digits(r.customerPhone) === digits(data.customerPhone));
  const customerId = existing?.customerId || `CUST-${Date.now().toString(36).toUpperCase()}`;

  // No more silent assignment to a hard-coded broker: brokers own what they register; a buyer's
  // enquiry stays "unassigned" (visible, phone-masked) until a verified broker claims it or an admin assigns it.
  let assignedBrokerId = '';
  if (currentUser.role === 'BROKER') assignedBrokerId = currentUser.id;
  const requestedBroker = (req.body as any)?.assignedBrokerId;
  if (requestedBroker && currentUser.role !== 'BROKER') {
    const b = db.byId('users', requestedBroker);
    if (!b || b.role !== 'BROKER' || b.verificationStatus !== 'VERIFIED') {
      return res.status(400).json({ error: 'assignedBrokerId must be a verified broker' });
    }
    assignedBrokerId = b.id;
  }

  const newReq: any = {
    id: requirementId,
    customerId,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    assignedBrokerId,
    buyerId: currentUser.role === 'BUYER_TENANT' ? currentUser.id : undefined,
    budgetMin: data.budgetMin,
    budgetMax: data.budgetMax,
    city: data.city,
    state: data.state || stateOfCity(data.city),
    preferredLocalities: data.preferredLocalities,
    preferredTags: data.preferredTags,
    propertyType: data.propertyType,
    transactionType: data.transactionType,
    minAreaSqFt: data.minAreaSqFt,
    maxAreaSqFt: data.maxAreaSqFt,
    purpose: data.purpose,
    urgency: data.urgency,
    status: 'matching',
    createdAt: now,
    updatedAt: now,
  };

  state.requirements.unshift(newReq);
  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'SYSTEM',
    requirementId,
    'REQUIREMENT_CREATED',
    `Buyer requirement ${requirementId} logged for ${data.propertyType} in ${data.preferredLocalities.join(', ')}`
  );

  res.json({ success: true, requirement: sanitizeRequirement(newReq, currentUser) });
});

// A verified broker claims an unassigned buyer enquiry.
app.post('/api/requirements/:id/claim', needs('requirement:create'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  if (currentUser.role !== 'BROKER') return res.status(403).json({ error: 'Only brokers can claim enquiries' });
  const r = db.byId('requirements', req.params.id);
  if (!r) return res.status(404).json({ error: 'Requirement not found' });
  if (r.assignedBrokerId) return res.status(409).json({ error: 'This enquiry is already assigned to a broker' });
  r.assignedBrokerId = currentUser.id;
  r.updatedAt = new Date().toISOString();
  db.save();
  db.appendAuditEvent(currentUser.id, currentUser.role, 'SYSTEM', r.id, 'REQUIREMENT_CLAIMED', `Requirement ${r.id} claimed by ${currentUser.name}`);
  res.json({ success: true, requirement: sanitizeRequirement(r, currentUser) });
});

// ==========================================
// 5. PROPERTY-REQUIREMENT MATCHING ENGINE
// ==========================================

app.get('/api/matching/requirement/:reqId', needs('matching:run'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { reqId } = req.params;
  const state = db.getState();
  const requirement = db.byId('requirements', reqId);

  if (!requirement || (currentUser.role === 'BUYER_TENANT' && requirement.buyerId !== currentUser.id)) {
    return res.status(404).json({ error: 'Requirement not found' });
  }

  const activeProperties = state.properties.filter(p => p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
  const matches = activeProperties.map(prop => {
    const matchResult = calculatePropertyMatch(prop, requirement);
    return {
      property: {
        id: prop.id,
        title: prop.title,
        propertyType: prop.propertyType,
        locality: prop.locality,
        askingPrice: prop.askingPrice,
        builtUpAreaSqFt: prop.builtUpAreaSqFt,
        listingBrokerId: prop.listingBrokerId,
        images: prop.images,
      },
      ...matchResult,
    };
  }).filter(m => m.score > 20)
    .sort((a, b) => b.score - a.score);

  res.json({ success: true, requirement: sanitizeRequirement(requirement, currentUser), matches });
});

app.get('/api/matching/property/:propId', needs('matching:run'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  if (currentUser.role === 'BUYER_TENANT') {
    return res.status(403).json({ error: 'Buyer accounts cannot browse other customers\' requirements' });
  }
  const { propId } = req.params;
  const state = db.getState();
  const property = db.byId('properties', propId);

  if (!property) {
    return res.status(404).json({ error: 'Property not found' });
  }

  const activeRequirements = state.requirements.filter(r => r.status === 'active' || r.status === 'matching');
  const matches = activeRequirements.map(reqItem => {
    const matchResult = calculatePropertyMatch(property, reqItem);
    const mine = isAdmin(currentUser) || reqItem.assignedBrokerId === currentUser.id;
    return {
      requirement: {
        id: reqItem.id,
        // other brokers' customers are shown by initials only (client identity = broker's asset)
        customerName: mine ? reqItem.customerName : reqItem.customerName.split(' ').map(w => w[0] + '.').join(' '),
        preferredLocalities: reqItem.preferredLocalities,
        budgetMin: reqItem.budgetMin,
        budgetMax: reqItem.budgetMax,
        assignedBrokerId: reqItem.assignedBrokerId,
        urgency: reqItem.urgency,
      },
      ...matchResult,
    };
  }).filter(m => m.score > 20)
    .sort((a, b) => b.score - a.score);

  res.json({ success: true, property: sanitizeProperty(property, currentUser, state), matches });
});

// Full Network Match Matrix Overview
app.get('/api/matching/matrix', needs('matching:run'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  if (currentUser.role === 'BUYER_TENANT') {
    return res.status(403).json({ error: 'The network match matrix is for brokers and administrators' });
  }
  const state = db.getState();
  const admin = isAdmin(currentUser);
  // v20 — scoring every listing against every need (10k × 5k) froze the whole server for every member. Now each need is
  // scored only against listings that can sensibly match it: same sale/rent intent AND (its city, or — when the need has
  // no city — a preferred locality or its broker's city). A broker gets pairs touching HIS listings or HIS clients;
  // admins get the newest 150 needs. At most 3 listings per need, 500 pairs in all.
  const ck = (c?: string) => String(c || '').trim().toLowerCase().replace(/\s*\(.*\)\s*/g, '');
  const activeProps = state.properties.filter(p => p.listingStatus === 'active' && p.verificationStatus === 'VERIFIED');
  let activeReqs = state.requirements.filter(r => r.status === 'active' || r.status === 'matching');
  const byTypeCity = new Map<string, typeof activeProps>();
  const byTypeLoc = new Map<string, Map<string, typeof activeProps>>(); // intent → locality → listings (few hundred distinct localities)
  for (const p of activeProps) {
    const k = `${p.transactionType}|${ck(p.city)}`; (byTypeCity.get(k) || byTypeCity.set(k, []).get(k)!).push(p);
    const lm = byTypeLoc.get(p.transactionType) || byTypeLoc.set(p.transactionType, new Map()).get(p.transactionType)!;
    const loc = p.locality.toLowerCase().trim(); (lm.get(loc) || lm.set(loc, []).get(loc)!).push(p);
  }
  const newestN = <T,>(a: T[], n = 1500) => (a.length > n ? a.slice(-n) : a); // worst case bounded (one huge locality)
  const candidatesFor = (r: BuyerRequirementT) => newestN(candidatesAll(r));
  const candidatesAll = (r: BuyerRequirementT) => {
    if (r.city) return byTypeCity.get(`${r.transactionType}|${ck(r.city)}`) || [];
    const out = new Set<typeof activeProps[number]>();
    const brokerCity = ck(db.byId('users', r.assignedBrokerId)?.city);
    for (const p of byTypeCity.get(`${r.transactionType}|${brokerCity}`) || []) out.add(p);
    const wanted = (r.preferredLocalities || []).map(l => l.toLowerCase().trim()).filter(Boolean);
    if (wanted.length) for (const [loc, list] of byTypeLoc.get(r.transactionType) || []) if (wanted.some(w => loc.includes(w) || w.includes(loc))) for (const p of list) out.add(p);
    return [...out];
  };
  const newest = (x: any, y: any) => String(y.updatedAt || y.createdAt || '').localeCompare(String(x.updatedAt || x.createdAt || ''));
  const pairs: any[] = [];
  const add = (prop: typeof activeProps[number], reqItem: BuyerRequirementT, match: ReturnType<typeof calculatePropertyMatch>) => {
    const mine = reqItem.assignedBrokerId === currentUser.id;
    pairs.push({
      propertyId: prop.id,
      propertyTitle: prop.title,
      propertyLocality: prop.locality,
      propertyPrice: prop.askingPrice,
      listingBrokerId: prop.listingBrokerId,
      requirementId: reqItem.id,
      requirementCustomer: admin || mine ? reqItem.customerName : reqItem.customerName.split(' ').map(w => w[0] + '.').join(' '),
      requirementBrokerId: reqItem.assignedBrokerId,
      score: match.score,
      breakdown: match.breakdown,
      reasons: match.reasons,
    });
  };
  const top = <T,>(list: T[], score: (x: T) => ReturnType<typeof calculatePropertyMatch>, n: number) =>
    list.map(x => ({ x, m: score(x) })).filter(y => y.m.score >= 50).sort((a, b) => b.m.score - a.m.score).slice(0, n);
  if (admin) {
    for (const r of [...activeReqs].sort(newest).slice(0, 150)) for (const { x, m } of top(candidatesFor(r), p => calculatePropertyMatch(p, r), 3)) add(x, r, m);
  } else {
    // 1) my clients' needs against the network
    for (const r of activeReqs) if (r.assignedBrokerId === currentUser.id) for (const { x, m } of top(candidatesFor(r), p => calculatePropertyMatch(p, r), 3)) add(x, r, m);
    // 2) my listings against other brokers' needs
    const myProps = activeProps.filter(p => p.listingBrokerId === currentUser.id);
    if (myProps.length) {
      const reqByTypeCity = new Map<string, BuyerRequirementT[]>(); const cityless: BuyerRequirementT[] = [];
      for (const r of activeReqs) {
        if (r.assignedBrokerId === currentUser.id) continue;
        if (r.city) { const k = `${r.transactionType}|${ck(r.city)}`; (reqByTypeCity.get(k) || reqByTypeCity.set(k, []).get(k)!).push(r); } else cityless.push(r);
      }
      for (const p of myProps) {
        const loc = p.locality.toLowerCase().trim(); const pc = ck(p.city);
        const cands = [...(reqByTypeCity.get(`${p.transactionType}|${pc}`) || []), ...cityless.filter(r => r.transactionType === p.transactionType &&
          (ck(db.byId('users', r.assignedBrokerId)?.city) === pc || (r.preferredLocalities || []).some(l => { const w = l.toLowerCase().trim(); return !!w && (loc.includes(w) || w.includes(loc)); })))];
        for (const { x, m } of top(cands, r => calculatePropertyMatch(p, r), 5)) add(p, x, m);
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  res.json({ success: true, count: pairs.length, matches: pairs.slice(0, 500), capped: pairs.length > 500 });
});

// ==========================================
// 6. COLLABORATION OFFERS & PROPOSALS
// ==========================================

function isActiveBroker(id: string | undefined) {
  const u = id ? db.byId('users', id) : undefined;
  return !!u && u.role === 'BROKER' && u.verificationStatus === 'VERIFIED';
}

function nextDealId(state = db.getState()) {
  return `DEAL-2026-${String(nextSeq(state.dealRooms.map(d => d.id), /DEAL-2026-(\d+)/, 0)).padStart(3, '0')}`;
}

function mandateConfirmedFor(propertyId: string, state = db.getState()) {
  return state.ownerMandates.some(m => m.propertyId === propertyId && m.isConfirmed);
}

app.get('/api/collaborations', needs('collab:read'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();

  const myOffers = state.offers.filter(o => {
    if (isAdmin(currentUser)) return true;
    if (o.proposingBrokerId === currentUser.id) return true;
    if (o.receivingBrokerId === currentUser.id) return true;
    const prop = db.byId('properties', o.propertyId);
    if (prop && (prop.listingBrokerId === currentUser.id || prop.ownerId === currentUser.id)) return true;
    return false;
  });

  // v20: an admin's list is the newest 300 + everything still open (it was every offer ever made, with the full listing inside each)
  let shown = myOffers;
  if (isAdmin(currentUser) && myOffers.length > 400) {
    const open = myOffers.filter(o => o.status === 'PENDING' || o.status === 'COUNTERED');
    const rest = myOffers.filter(o => !(o.status === 'PENDING' || o.status === 'COUNTERED')).sort((a, b) => String(b.respondedAt || b.createdAt || '').localeCompare(String(a.respondedAt || a.createdAt || ''))).slice(0, 300);
    shown = [...open, ...rest];
  }
  const enrichedOffers = shown.map(o => {
    const prop = db.byId('properties', o.propertyId);
    const propBroker = db.byId('users', o.proposingBrokerId);
    const recBroker = db.byId('users', o.receivingBrokerId);
    const req = o.requirementId ? db.byId('requirements', o.requirementId) : null;
    return {
      ...o,
      property: prop ? sanitizeProperty(prop, currentUser, state) : undefined,
      proposingBroker: propBroker ? partyCard(propBroker, currentUser, state) : undefined,
      receivingBroker: recBroker ? partyCard(recBroker, currentUser, state) : undefined,
      requirement: req ? sanitizeRequirement(req, currentUser) : null,
    };
  });

  res.json({ success: true, offers: enrichedOffers, total: myOffers.length });
});

app.post('/api/collaborations', needs('collab:propose'), newAccountCap('collab', 5), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  if (currentUser.role !== 'BROKER') {
    return res.status(403).json({ error: 'Only brokers can propose co-broking collaborations' });
  }
  const parseResult = collaborationOfferSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  const data = parseResult.data;
  const state = db.getState();

  const prop = db.byId('properties', data.propertyId);
  if (!prop || prop.verificationStatus !== 'VERIFIED' || !PUBLIC_PROPERTY_STATUSES.includes(prop.listingStatus)) {
    return res.status(404).json({ error: 'Property not found or not open for collaboration' });
  }
  if (data.requirementId) {
    const rq = db.byId('requirements', data.requirementId);
    if (!rq) return res.status(404).json({ error: 'Requirement not found' });
  }

  // The counter-party is the broker who lists the property, unless one is named explicitly.
  // No hard-coded fallback broker, no random "other broker" fallback.
  let targetBrokerId = (data.receivingBrokerId || '').trim() || prop.listingBrokerId;
  if (!targetBrokerId) {
    return res.status(400).json({ error: 'This listing has no broker on the network. Name the receiving broker explicitly.' });
  }
  if (targetBrokerId === currentUser.id) {
    return res.status(400).json({ error: 'You cannot propose a collaboration to yourself — choose the partner broker.' });
  }
  if (!isActiveBroker(targetBrokerId)) {
    return res.status(400).json({ error: 'The receiving party must be a verified broker on the network' });
  }
  const dup = state.offers.find(o =>
    o.propertyId === data.propertyId && o.proposingBrokerId === currentUser.id && o.receivingBrokerId === targetBrokerId &&
    (o.status === 'PENDING' || o.status === 'COUNTERED'));
  if (dup) {
    return res.status(409).json({ error: `An open offer (${dup.id}) already exists for this property and partner` });
  }

  const ownSide = data.feeMode === 'OWN_SIDE';
  if (ownSide) {
    const bad = checkProposerSide(data.proposerSide!, currentUser.id, targetBrokerId, prop.listingBrokerId);
    if (bad) return res.status(400).json({ error: bad, code: 'SIDE_MISMATCH' });
  }
  // OWN_SIDE keeps no split: each broker keeps 100% of his own client's fee
  const introShare = ownSide ? 100 : data.proposedIntroducingShare!;
  const closeShare = ownSide ? 100 : data.proposedClosingShare!;

  const offerId = `OFFER-${nextSeq(state.offers.map(o => o.id), /OFFER-(\d+)/, 100)}`;
  const now = new Date().toISOString();

  const newOffer = {
    id: offerId,
    propertyId: data.propertyId,
    requirementId: data.requirementId || '',
    proposingBrokerId: currentUser.id,
    receivingBrokerId: targetBrokerId,
    proposedIntroducingShare: introShare,
    proposedClosingShare: closeShare,
    feeMode: data.feeMode,
    ...(ownSide ? { proposerSide: data.proposerSide } : {}),
    terms: data.terms,
    status: 'PENDING' as const,
    lastActorId: currentUser.id,
    createdAt: now,
  };

  state.offers.unshift(newOffer);
  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'DEAL',
    offerId,
    'COLLABORATION_PROPOSED',
    ownSide
      ? `Collaboration proposed by ${currentUser.name || currentUser.id} to ${targetBrokerId} for ${data.propertyId}: each broker keeps the brokerage of their own client (${data.proposerSide === 'SELLER' ? 'proposer acts for the seller' : 'proposer acts for the buyer'})`
      : `Collaboration proposed by ${currentUser.name || currentUser.id} to ${targetBrokerId} for ${data.propertyId} with ${introShare}/${closeShare} commission split`
  );

  const propBroker = db.byId('users', newOffer.proposingBrokerId);
  const recBroker = db.byId('users', newOffer.receivingBrokerId);
  const enrichedOffer = {
    ...newOffer,
    property: sanitizeProperty(prop, currentUser, state),
    proposingBroker: propBroker ? partyCard(propBroker, currentUser, state) : undefined,
    receivingBroker: recBroker ? partyCard(recBroker, currentUser, state) : undefined,
  };

  res.json({ success: true, offer: enrichedOffer });
});

app.post('/api/collaborations/:id/respond', needs('collab:respond'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { id } = req.params;
  const { decision, counterIntroducingShare, counterClosingShare, notes } = req.body || {};
  // decision: 'ACCEPT' | 'REJECT' | 'COUNTER'

  if (!['ACCEPT', 'REJECT', 'COUNTER'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be ACCEPT, REJECT or COUNTER' });
  }

  const state = db.getState();
  const offer = db.byId('offers', id);
  if (!offer) {
    return res.status(404).json({ error: 'Offer not found' });
  }
  if (offer.status !== 'PENDING' && offer.status !== 'COUNTERED') {
    return res.status(409).json({ error: `Offer is already ${offer.status.toLowerCase()}` });
  }

  // Only the party whose turn it is may answer (a proposer can never accept their own offer).
  const parties = [offer.proposingBrokerId, offer.receivingBrokerId];
  const lastActor = offer.lastActorId || offer.proposingBrokerId;
  if (!parties.includes(currentUser.id) || currentUser.id === lastActor) {
    return res.status(403).json({ error: 'It is not your turn to respond to this offer' });
  }
  if (!isActiveBroker(offer.proposingBrokerId) || !isActiveBroker(offer.receivingBrokerId)) {
    return res.status(409).json({ error: 'Both parties must be verified brokers to proceed' });
  }

  const now = new Date().toISOString();

  if (decision === 'ACCEPT') {
    const prop = db.byId('properties', offer.propertyId);
    if (!prop || !PUBLIC_PROPERTY_STATUSES.includes(prop.listingStatus)) {
      return res.status(409).json({ error: 'The property is no longer open for collaboration' });
    }
    const ownSide = offer.feeMode === 'OWN_SIDE';
    if (!ownSide && Math.abs(offer.proposedIntroducingShare + offer.proposedClosingShare - 100) > 0.001) {
      return res.status(409).json({ error: 'Offer shares do not add up to 100%' });
    }
    if (ownSide && !offer.proposerSide) return res.status(409).json({ error: 'This offer does not say which side the proposer acts for' });
    offer.status = 'ACCEPTED';
    offer.respondedAt = now;
    offer.lastActorId = currentUser.id;

    // Automatically provision a protected Deal Room for this collaboration!
    const dealId = nextDealId(state);
    const reqRecord = offer.requirementId ? db.byId('requirements', offer.requirementId) : undefined;
    const grossEstCommission = Math.round(prop.askingPrice * 0.02);

    const newDealRoom = {
      id: dealId,
      propertyId: offer.propertyId,
      requirementId: offer.requirementId || '',
      introducingBrokerId: offer.proposingBrokerId,
      closingBrokerId: offer.receivingBrokerId,
      ownerId: prop.ownerId || '',
      customerId: reqRecord?.customerId || '',
      stage: 'Introduction' as const,
      // OWN_SIDE: no shared brokerage — each broker writes his own fee later (private), so the shared total and the % stay 0
      totalCommissionExpected: ownSide ? 0 : grossEstCommission,
      introducingBrokerSharePct: ownSide ? 0 : offer.proposedIntroducingShare,
      closingBrokerSharePct: ownSide ? 0 : offer.proposedClosingShare,
      ...(ownSide ? {
        feeMode: 'OWN_SIDE' as const,
        sellerBrokerId: offer.proposerSide === 'SELLER' ? offer.proposingBrokerId : offer.receivingBrokerId,
        buyerBrokerId: offer.proposerSide === 'BUYER' ? offer.proposingBrokerId : offer.receivingBrokerId,
        sideFees: {}, sideUndertaking: {}, sideReceipts: {},
      } : {}),
      ownerRemunerationConfirmed: mandateConfirmedFor(prop.id, state),
      ownerProtectionExpiresAt: new Date(Date.now() + daysFor() * 86400000).toISOString(),
      siteVisitsCount: 0,
      agreementHash: sha256(`${dealId}:${offer.propertyId}:${offer.proposedIntroducingShare}-${offer.proposedClosingShare}:${now}`),
      settlementStatus: 'AGREED' as const,
      notes: String(notes || '').slice(0, 500) || (ownSide
        ? `Created upon accepting collaboration offer ${offer.id}. Each broker keeps the brokerage of their own client (no split).`
        : `Created upon accepting collaboration offer ${offer.id}. Split agreed: ${offer.proposedIntroducingShare}% to introducer, ${offer.proposedClosingShare}% to closer.`),
      createdAt: now,
      updatedAt: now,
    };

    offer.dealRoomId = dealId;
    state.dealRooms.unshift(newDealRoom);
    db.save();

    db.appendAuditEvent(
      currentUser.id,
      currentUser.role,
      'DEAL',
      dealId,
      'DEAL_ROOM_CREATED',
      `Collaboration offer accepted. Deal Room ${dealId} initialized with cryptographic terms hash ${newDealRoom.agreementHash.substring(0, 12)}...`
    );

    return res.json({ success: true, offer, dealRoom: newDealRoom });
  } else if (decision === 'COUNTER') {
    // v41: a counter may switch the offer to "each keeps his own client's fee" (counterFeeMode OWN_SIDE; the sides stay as proposed) or back to a % split
    const toOwn = req.body?.counterFeeMode === 'OWN_SIDE';
    const a = toOwn ? 100 : Number(counterIntroducingShare);
    const b = toOwn ? 100 : Number(counterClosingShare);
    if (toOwn && !offer.proposerSide) {
      // the offer was a % split: the one who counters says which side HE acts for
      const mine = req.body?.mySide;
      if (mine !== 'SELLER' && mine !== 'BUYER') return res.status(400).json({ error: 'Say which side you act for: seller or buyer' });
      const bad = checkProposerSide(otherSide(mine), offer.proposingBrokerId, offer.receivingBrokerId, db.byId('properties', offer.propertyId)?.listingBrokerId);
      if (bad) return res.status(400).json({ error: bad, code: 'SIDE_MISMATCH' });
      offer.proposerSide = otherSide(mine);
    }
    if (!toOwn && ([a, b].some(n => !Number.isFinite(n) || n < 0 || n > 100) || Math.abs(a + b - 100) > 0.001)) {
      return res.status(400).json({ error: 'Counter shares must be numbers between 0 and 100 that add up to exactly 100%' });
    }
    offer.status = 'COUNTERED';
    offer.proposedIntroducingShare = a;
    offer.proposedClosingShare = b;
    offer.feeMode = toOwn ? 'OWN_SIDE' : 'SPLIT';
    offer.terms = notes ? `${offer.terms} | Counter: ${String(notes).slice(0, 500)}` : offer.terms;
    offer.respondedAt = now;
    offer.lastActorId = currentUser.id;
    db.save();

    db.appendAuditEvent(
      currentUser.id,
      currentUser.role,
      'DEAL',
      offer.id,
      'OFFER_COUNTERED',
      toOwn ? 'Counter-offer: each broker keeps the brokerage of their own client (no split)' : `Counter-offer made with split ${a}/${b}`
    );

    return res.json({ success: true, offer });
  } else {
    offer.status = 'REJECTED';
    offer.respondedAt = now;
    offer.lastActorId = currentUser.id;
    db.save();

    db.appendAuditEvent(
      currentUser.id,
      currentUser.role,
      'DEAL',
      offer.id,
      'OFFER_REJECTED',
      `Collaboration offer rejected. Reason: ${notes || 'N/A'}`
    );

    return res.json({ success: true, offer });
  }
});

// ==========================================
// 7. DEAL ROOMS, SITE VISITS & COMMISSION ALLOCATION
// ==========================================

/** what the deal is worth: the price the brokers wrote into the signed commission agreement, else the asking price of a sale listing */
function dealValueOf(deal: DealRoom): number | undefined {
  if (deal.dealValue && deal.dealValue > 0) return deal.dealValue;
  const p = db.byId('properties', deal.propertyId);
  return p && p.transactionType === 'Sale' && p.askingPrice > 0 ? p.askingPrice : undefined;
}

/**
 * v21 — the numbers GENZ is allowed to see about broker-to-broker deals: how many deals reached "Agreement" or later, what they are
 * worth, how much brokerage the brokers agreed and how much has really been paid between them (CONFIRMED entries only).
 * No deal, broker or amount of a single deal is named here.
 */
function dealTotals(state: DatabaseState) {
  const agreedStages = new Set(['Agreement', 'Handover', 'Settled']);
  let deals = 0, dealValue = 0, settledDeals = 0, settledValue = 0;
  for (const d of state.dealRooms) {
    if (!agreedStages.has(d.stage)) continue;
    deals++; const v = dealValueOf(d) || 0; dealValue += v;
    if (d.stage === 'Settled') { settledDeals++; settledValue += v; }
  }
  // one agreement per deal counts: the ACTIVE (or COMPLETED) one
  let commissionAgreed = 0, commissionPaid = 0, commissionWaiting = 0, dealsWithBrokerage = 0;
  for (const a of state.commissionAgreements) {
    if (a.status !== 'ACTIVE' && a.status !== 'COMPLETED') continue;
    dealsWithBrokerage++;
    commissionAgreed += a.totalAgreedBrokerage || 0;
    for (const al of a.allocations) { commissionPaid += al.paidAmount || 0; commissionWaiting += pendingAmount(al); }
  }
  return {
    deals, dealValue, settledDeals, settledValue,
    dealsWithBrokerage, commissionAgreed, commissionPaid, commissionWaiting,
    openDisputes: openDisputeDeals(state).size,
  };
}

const initialsOf = (n: string) => String(n || '').split(/\s+/).filter(w => /^[A-Za-zऀ-ॿ]/.test(w)).slice(0, 3).map(w => w[0].toUpperCase() + '.').join(' ') || 'Client';

/**
 * v21: a GENZ admin who reads a deal room in full (because a dispute is open on it) leaves a line in the audit trail — once per
 * half hour per admin and room, so refreshing a screen does not flood it. The deal's brokers can read that line in their own audit trail.
 */
const adminDealSeen = new Map<string, number>();
function noteAdminDealAccess(user: UserProfile, deal: DealRoom, state: DatabaseState) {
  const key = `${user.id}|${deal.id}`; const now = Date.now();
  if ((adminDealSeen.get(key) || 0) > now - 30 * 60_000) return;
  adminDealSeen.set(key, now);
  if (adminDealSeen.size > 5000) for (const [k, t] of adminDealSeen) if (t < now - 30 * 60_000) adminDealSeen.delete(k);
  const disp = openDisputeOf(state, deal.id);
  db.appendAuditEvent(user.id, user.role, 'DEAL', deal.id, 'DEAL_ADMIN_ACCESS',
    `${user.name} (${user.role}) opened deal room ${deal.id} in full because dispute ${disp?.id || '—'} is open. The access ends when the dispute is resolved.`);
}

/**
 * Legal counsel reviews title & compliance — commercial terms are redacted from their view of a deal.
 * v21: a GENZ admin sees the same redacted shape (plus the deal value) until a dispute is open on the room.
 */
function shapeDealFor(deal: DealRoom, user: UserProfile, state: DatabaseState = db.getState(), open?: Set<string>) {
  const dealValue = dealValueOf(deal);
  // Only the two brokers (and a GENZ admin while a dispute is open) may see the brokerage amount / split and the brokers' working notes.
  // The property owner and legal counsel see the deal, but never what the brokers agreed between themselves.
  // v41: an own-side deal shows each broker only HIS side (a GENZ admin sees both only while a dispute is open)
  if (canSeeDealCommercials(user, deal, state, open)) return isOwnSide(deal) ? shapeSideDeal(deal, user, dealValue) : { ...deal, dealValue };
  const summary = isAdmin(user) && dealDetailVia(user, deal, state, {}, open) === 'NONE';
  return {
    ...stripSideData(deal), dealValue, teamMemberIds: undefined, totalCommissionExpected: 0, introducingBrokerSharePct: 0, closingBrokerSharePct: 0, agreementHash: undefined, notes: '', commercialsHidden: true,
    ...(summary ? { summaryOnly: true, customerId: initialsOf(deal.customerId) } : {}),
  };
}

function dealVisibleTo(user: UserProfile, deal: any) {
  return canViewDeal(user, deal, { allowLegal: true });
}

app.get('/api/deals', needs('deal:read'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const open = isAdmin(currentUser) ? openDisputeDeals(state) : undefined;

  const deals = state.dealRooms
    .filter(d => dealVisibleTo(currentUser, d))
    .map(d => shapeDealFor(d, currentUser, state, open));

  res.json({ success: true, deals });
});

app.get('/api/deals/:id', needs('deal:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { id } = req.params;
  const state = db.getState();

  const deal = db.byId('dealRooms', id);
  if (!deal) {
    return res.status(404).json({ error: 'Deal Room not found' });
  }

  if (!dealVisibleTo(currentUser, deal)) {
    return res.status(403).json({ error: 'Access forbidden: You are not an authorized participant of this deal room' });
  }

  // v21: a GENZ admin gets the summary only, unless a dispute is open on this room
  const via = dealDetailVia(currentUser, deal, state, { allowLegal: true });
  const summaryOnly = via === 'NONE';
  if (via === 'DISPUTE') noteAdminDealAccess(currentUser, deal, state);
  const liveDispute = openDisputeOf(state, deal.id);

  const property = db.byId('properties', deal.propertyId);
  const requirement = summaryOnly ? undefined : db.byId('requirements', deal.requirementId);
  const siteVisits = summaryOnly ? [] : state.siteVisits.filter(sv => sv.dealRoomId === deal.id).map(sv => sanitizeVisit(sv, currentUser, state));
  const dispute = summaryOnly ? undefined : state.disputes.find(disp => disp.dealRoomId === deal.id);

  const introducingBroker = db.byId('users', deal.introducingBrokerId);
  const closingBroker = db.byId('users', deal.closingBrokerId);
  const owner = db.byId('users', deal.ownerId);
  const shareBrokerPhones = !summaryOnly && (isAdmin(currentUser) || isDealBroker(currentUser, deal));

  res.json({
    success: true,
    deal: shapeDealFor(deal, currentUser, state),
    // what this viewer may read inside the room, and whether GENZ may read it right now (shown as a notice to the brokers)
    access: { level: summaryOnly ? 'SUMMARY' : 'FULL', via, adminCanSee: !!liveDispute, openDisputeId: liveDispute?.id },
    property: property ? sanitizeProperty(property, currentUser, state) : undefined,
    requirement: requirement && currentUser.role !== 'LEGAL_COUNSEL' && currentUser.role !== 'PROPERTY_OWNER'
      ? sanitizeRequirement(requirement, currentUser)
      : undefined,
    siteVisits,
    dispute,
    participants: {
      // The two co-brokers (and admins) can ring each other; owners, legal counsel and employees never get a broker's number from here.
      introducingBroker: introducingBroker ? { id: introducingBroker.id, name: introducingBroker.name, brokerId: introducingBroker.brokerId, phone: shareBrokerPhones ? introducingBroker.phone : undefined } : null,
      closingBroker: closingBroker ? { id: closingBroker.id, name: closingBroker.name, brokerId: closingBroker.brokerId, phone: shareBrokerPhones ? closingBroker.phone : undefined } : null,
      owner: owner ? { id: owner.id, name: owner.name, phone: maskPhoneNumber(owner.phone) } : null,
    },
  });
});

const STAGE_ORDER = ['Lead', 'Introduction', 'Site Visit Done', 'Negotiation', 'Agreement', 'Handover', 'Settled'];

app.post('/api/deals/:id/stage', needs('deal:update_stage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { id } = req.params;
  const { stage, notes } = req.body || {};

  if (!STAGE_ORDER.includes(stage)) {
    return res.status(400).json({ error: stage === 'Disputed' ? 'Disputes are raised through the Disputes desk (it places the settlement hold)' : 'Invalid deal stage' });
  }

  const state = db.getState();
  const deal = db.byId('dealRooms', id);
  if (!deal) {
    return res.status(404).json({ error: 'Deal room not found' });
  }
  // v21: GENZ may override a stage only where it may read the room (open dispute, or GENZ itself is a party)
  const admin = isAdmin(currentUser) && dealDetailVia(currentUser, deal, state) !== 'NONE';
  if (isAdmin(currentUser) && !admin) {
    return res.status(403).json({ error: 'GENZ can change a deal room only while a dispute is open on it. The two brokers move the stage themselves.', code: 'DEAL_SUMMARY_ONLY' });
  }
  if (!admin && !isDealBroker(currentUser, deal)) {
    return res.status(403).json({ error: 'Only the deal-room brokers or a platform admin can change the stage' });
  }
  if (admin && dealDetailVia(currentUser, deal, state) === 'DISPUTE') noteAdminDealAccess(currentUser, deal, state);
  if (!admin && deal.settlementStatus === 'DISPUTED') {
    return res.status(409).json({ error: 'Deal is under dispute: settlement hold is active until an admin resolves it' });
  }
  if (isClosed(deal)) {
    return res.status(409).json({ error: 'This deal room is closed (the deal did not happen). Reopen it first.', code: 'DEAL_CLOSED' });
  }

  const from = STAGE_ORDER.indexOf(deal.stage);
  const to = STAGE_ORDER.indexOf(stage);
  const activeAgreement = state.commissionAgreements.find(a => a.dealId === deal.id && a.status === 'ACTIVE');
  // v47 — or a visit outside the app that the other side confirmed (shown as unverified; no buyer protection)
  const hasVerifiedVisit = state.siteVisits.some(v => v.dealRoomId === deal.id && v.isVerified) || offlineVisitConfirmed(deal);

  if (!admin) {
    if (deal.stage === 'Settled' || deal.stage === 'Disputed') {
      return res.status(409).json({ error: `Deal is ${deal.stage.toLowerCase()} and can only be changed by an admin` });
    }
    if (to > from + 1) {
      return res.status(400).json({ error: `Stages advance one step at a time (next: ${STAGE_ORDER[from + 1] || 'n/a'})` });
    }
  }
  if (to > from) {
    const bypass = admin && String(notes || '').trim().length >= 5;
    if (stage === 'Site Visit Done' && !hasVerifiedVisit && !bypass) {
      return res.status(409).json({ error: 'A site visit verified on location (OTP / QR) is required before "Site Visit Done". If the visit already happened outside the app, record it under “Visit outside the app” and let the other broker confirm it.', code: 'VISIT_NEEDED' });
    }
    const own = isOwnSide(deal);
    if (stage === 'Agreement' && !(own ? undertakingDone(deal) : activeAgreement) && !bypass) {
      return res.status(409).json(own
        ? { error: 'Both brokers must sign the "own client only" undertaking before "Agreement"', code: 'SIDE_UNDERTAKING_NEEDED' }
        : { error: 'A fully-signed (ACTIVE) commission agreement is required before "Agreement"' });
    }
    if (stage === 'Settled' && !bypass) {
      const allPaid = own ? allSidesDone(deal) : !!activeAgreement && activeAgreement.allocations.every(a => a.entitlementStatus === 'PAID');
      if (!allPaid) {
        return res.status(409).json({ error: own
          ? 'Settlement needs both brokers to have written down the full fee received from their own client (or an admin override with notes)'
          : 'Settlement requires every commission allocation to be PAID (or an admin override with notes)' });
      }
    }
  }

  deal.stage = stage as any;
  const cleanNotes = String(notes || '').slice(0, 500);
  deal.notes = cleanNotes ? `${deal.notes}\n[${new Date().toLocaleDateString('en-IN')}] Stage changed to ${stage}: ${cleanNotes}` : deal.notes;
  if (stage === 'Settled') deal.settlementStatus = 'PAID';
  deal.updatedAt = new Date().toISOString();

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'DEAL',
    deal.id,
    'STAGE_ADVANCED',
    `Deal stage transitioned to ${stage}`
  );

  res.json({ success: true, deal: shapeDealFor(deal, currentUser, state) });
});

// Server-side strict Commission Split Validation (pre-agreement quick split; once an agreement is ACTIVE use versioned amendments)
app.post('/api/deals/:id/commission', needs('deal:commission'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { id } = req.params;
  const parseResult = commissionSplitSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  const { introducingBrokerSharePct, closingBrokerSharePct } = parseResult.data;
  const { totalCommissionExpected } = req.body;

  const state = db.getState();
  const deal = db.byId('dealRooms', id);
  if (!deal) {
    return res.status(404).json({ error: 'Deal room not found' });
  }
  if (!isDealBroker(currentUser, deal) && !isSuper(currentUser)) {
    return res.status(403).json({ error: 'Only the brokers of this deal room can edit the commission split' });
  }
  if (deal.settlementStatus === 'DISPUTED') {
    return res.status(409).json({ error: 'Commission is frozen while the deal is under dispute' });
  }
  if (isOwnSide(deal)) {
    return res.status(409).json({ error: 'This deal room is "apna-apna side": there is no shared split. Each broker writes his own fee in the Own side panel.', code: 'OWN_SIDE_DEAL' });
  }
  if (state.commissionAgreements.some(a => a.dealId === deal.id && a.status === 'ACTIVE')) {
    return res.status(409).json({ error: 'A signed commission agreement is ACTIVE. Propose an amendment (new version) instead.' });
  }
  if (totalCommissionExpected !== undefined) {
    const t = Number(totalCommissionExpected);
    if (!Number.isFinite(t) || t <= 0 || t > 10_000_000_000) {
      return res.status(400).json({ error: 'totalCommissionExpected must be a positive amount' });
    }
  }

  deal.introducingBrokerSharePct = introducingBrokerSharePct;
  deal.closingBrokerSharePct = closingBrokerSharePct;
  if (totalCommissionExpected && Number(totalCommissionExpected) > 0) {
    deal.totalCommissionExpected = Number(totalCommissionExpected);
  }
  deal.agreementHash = sha256(`${deal.id}:${deal.propertyId}:${introducingBrokerSharePct}-${closingBrokerSharePct}:${new Date().toISOString()}`);
  deal.updatedAt = new Date().toISOString();

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'COMMISSION',
    deal.id,
    'COMMISSION_RATIFIED',
    `Commission split validated & locked: Introducer ${introducingBrokerSharePct}% (₹${Math.round(deal.totalCommissionExpected * introducingBrokerSharePct / 100).toLocaleString('en-IN')}), Closer ${closingBrokerSharePct}% (₹${Math.round(deal.totalCommissionExpected * closingBrokerSharePct / 100).toLocaleString('en-IN')})`
  );

  res.json({ success: true, deal });
});

// ==========================================
// 8. SITE VISIT VERIFICATION (OTP & ANTI-BYPASS)
// ==========================================

/**
 * The OTP / QR secret proves that the *customer or owner* was physically present — so it must never
 * be readable by the broker who is being verified. It is shown to: the property owner, the customer
 * (matched by phone), admins; and — in DEMO_MODE only — the visit's own broker, so the flow can be
 * demonstrated on a single machine.
 */
function sanitizeVisit(v: any, user: UserProfile, state = db.getState()) {
  const prop = db.byId('properties', v.propertyId);
  const secretVisible =
    isAdmin(user) ||
    (!!prop && prop.ownerId === user.id) ||
    (user.role === 'BUYER_TENANT' && customerMatchesUser(v.customerPhone, user)) ||
    (DEMO_MODE && v.brokerId === user.id);
  const out: any = { ...v, otpAttempts: undefined, otpExpiresAt: v.otpExpiresAt, ackStatus: visitAckStatus('VISIT', v.id) };
  if (!secretVisible) {
    out.otpCode = '';
    out.qrToken = '';
    out.secretHidden = true;
  }
  return out;
}

function visitDeal(state: ReturnType<typeof db.getState>, v: any) {
  return db.byId('dealRooms', v.dealRoomId);
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Retrieve site visits (optionally filtered by dealRoomId or propertyId)
app.get('/api/site-visits', needs('sitevisit:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const { dealRoomId, propertyId } = req.query;

  let visits = state.siteVisits || [];
  if (dealRoomId) {
    visits = visits.filter(v => v.dealRoomId === String(dealRoomId));
  }
  if (propertyId) {
    visits = visits.filter(v => v.propertyId === String(propertyId));
  }

  // Filter based on authorized access unless admin
  if (!isAdmin(currentUser)) {
    visits = visits.filter(v => {
      if (v.brokerId === currentUser.id) return true;
      const deal = visitDeal(state, v);
      if (deal && isDealParticipant(currentUser, deal)) return true;
      const prop = db.byId('properties', v.propertyId);
      if (prop && (prop.listingBrokerId === currentUser.id || prop.ownerId === currentUser.id)) return true;
      if (currentUser.role === 'BUYER_TENANT' && customerMatchesUser((v as any).customerPhone, currentUser)) return true;
      return false;
    });
  }

  res.json({ success: true, siteVisits: visits.map(v => sanitizeVisit(v, currentUser, state)) });
});

app.post('/api/site-visits', needs('sitevisit:create'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const parseResult = siteVisitCreateSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  const { dealRoomId, propertyId, customerName, customerPhone, scheduledTime, notes, scanAt, clientRoomId, clientRoomItemId, clientRoomRequestId } = parseResult.data;
  const state = db.getState();
  // v40 — booked from a Client Room: it must be the broker's own room, a home in it, and the client's own mobile
  let roomLink: { room: any; item: any } | null = null;
  if (clientRoomId) {
    const r = roomForVisit(currentUser, { clientRoomId, clientRoomItemId, clientRoomRequestId, propertyId, customerPhone });
    if ('error' in r) return res.status(r.status).json({ error: r.error, ...(r.code ? { code: r.code } : {}) });
    roomLink = r;
  }

  const prop = db.byId('properties', propertyId);
  if (!prop || prop.verificationStatus !== 'VERIFIED' || !PUBLIC_PROPERTY_STATUSES.includes(prop.listingStatus)) {
    return res.status(404).json({ error: 'Property not found or not open for visits' });
  }

  let targetDealId = dealRoomId ? dealRoomId.trim() : '';
  let deal = targetDealId ? db.byId('dealRooms', targetDealId) : null;

  if (targetDealId) {
    // An explicit deal room must exist, concern this property and include the caller as a broker.
    if (!deal || deal.propertyId !== propertyId) {
      return res.status(400).json({ error: 'dealRoomId does not match this property' });
    }
    if (!isDealBroker(currentUser, deal) && !isSuper(currentUser)) {
      return res.status(403).json({ error: 'You are not a broker of this deal room' });
    }
    if (isClosed(deal)) return res.status(409).json({ error: 'This deal room is closed — reopen it before booking a visit', code: 'DEAL_CLOSED' });
  }

  // If no dealRoomId provided, try to find an existing deal room for this property involving currentUser
  if (!deal) {
    deal = state.dealRooms.find(d => d.propertyId === propertyId && isDealBroker(currentUser, d)) || null;
    if (deal) {
      targetDealId = deal.id;
    }
  }

  // v35 — Network Watch: a buyer GENZ has blocked for commission bypass cannot be booked
  if (customerPhone) { const pb = partyBlock(customerPhone, 'buyer'); if (pb) return res.status(403).json(pb); }
  // v29 — buyer bond: another broker brought this buyer to this property first (verified visit / offer) → stop, ask to co-broke
  if (customerPhone) {
    const blocked = buyerBondBlock(currentUser, propertyId, customerPhone, targetDealId || undefined);
    if (blocked) return res.status(409).json(blocked);
  }

  // If still no deal room exists, provision a deal room so the site visit has formal anti-bypass tail protection
  if (!deal) {
    targetDealId = nextDealId(state);
    const isListingBroker = prop.listingBrokerId === currentUser.id;
    const newDeal: any = {
      id: targetDealId,
      propertyId,
      requirementId: '',
      introducingBrokerId: currentUser.id,
      closingBrokerId: isListingBroker ? '' : prop.listingBrokerId,
      ownerId: prop.ownerId || '',
      customerId: customerName,
      stage: 'Introduction',
      introducingBrokerSharePct: 50,
      closingBrokerSharePct: 50,
      totalCommissionExpected: Math.round(prop.askingPrice * 0.02),
      antiBypassTailDays: daysFor(),
      antiBypassExpiresAt: new Date(Date.now() + daysFor() * 24 * 60 * 60 * 1000).toISOString(),
      ownerProtectionExpiresAt: new Date(Date.now() + daysFor() * 24 * 60 * 60 * 1000).toISOString(),
      settlementStatus: 'PROPOSED',
      siteVisitsCount: 0,
      ownerRemunerationConfirmed: mandateConfirmedFor(propertyId, state),
      agreementHash: sha256(`${targetDealId}:${propertyId}:${currentUser.id}:${Date.now()}`),
      notes: `Auto-provisioned Deal Room upon site visit scheduling for client ${customerName}. ${daysFor()}-Day Anti-Bypass tail protection active.`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.dealRooms.unshift(newDeal);
    deal = newDeal;
  }

  const visitId = `SV-2026-${nextSeq(state.siteVisits.map(v => v.id), /SV-2026-(\d+)/, 100)}`;
  const otpCode = secureOtp();
  const qrToken = secureCode(12);
  const when = Date.parse(scheduledTime);

  const newVisit: any = {
    id: visitId,
    dealRoomId: targetDealId,
    propertyId,
    brokerId: currentUser.id,
    customerName,
    customerPhone: customerPhone || undefined,
    scheduledTime,
    otpCode,
    qrToken,
    scanAt: scanAt || 'PROPERTY',
    otpExpiresAt: new Date(Math.max(when, Date.now()) + 24 * 3600_000).toISOString(),
    otpAttempts: 0,
    isVerified: false,
    verificationMethod: 'OTP',
    feedbackNotes: notes || undefined,
    createdAt: new Date().toISOString(),
  };

  state.siteVisits.unshift(newVisit);
  if (roomLink) linkVisitToRoom(roomLink.room, roomLink.item, clientRoomRequestId, newVisit);
  // v33 — “no direct deal” acknowledgement from the buyer (tick + mobile code) before his QR / code is shown
  const visitAck = createVisitAck({ kind: 'VISIT', refId: visitId, phone: customerPhone, buyerName: customerName, brokerId: currentUser.id, subject: prop.title });

  if (deal) {
    deal.siteVisitsCount = (deal.siteVisitsCount || 0) + 1;
    deal.updatedAt = new Date().toISOString();
  }

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'VISIT',
    visitId,
    'SITE_VISIT_SCHEDULED',
    `Site visit scheduled for customer ${customerName} (Property: ${propertyId}). Verification challenge code generated.`
  );

  // Deliver the secret to the customer & the owner — NOT to the broker.
  const msg = `GENZ site visit ${visitId} at "${prop.title}" on ${new Date(scheduledTime).toLocaleString('en-IN')}. Share code ${otpCode} with the broker ONLY when you are physically at the property.`;
  if (customerPhone && !visitAck) void sendSms(customerPhone, msg);   // with an acknowledgement the buyer gets his link instead; the code shows only after he confirms
  const ownerUser = db.byId('users', prop.ownerId);
  if (ownerUser?.phone) void sendSms(ownerUser.phone, msg);

  res.json({ success: true, siteVisit: sanitizeVisit(newVisit, currentUser, state), dealRoom: deal, watch: (customerPhone && partyCaution(customerPhone)) || undefined });
});

/** Shared guard for OTP / QR verification. Returns the visit or sends the error itself. */
function loadVerifiableVisit(req: Request, res: Response, user: UserProfile) {
  const state = db.getState();
  const visit = db.byId('siteVisits', req.params.id);
  if (!visit) {
    res.status(404).json({ error: 'Site visit record not found' });
    return null;
  }
  const deal = visitDeal(state, visit);
  // v14 maker ≠ checker: whoever scheduled the visit (buyer side) can never verify it. The PROPERTY side does:
  // the owner, or the listing broker. If the listing broker scheduled it himself (own buyer), only the owner may verify.
  const vprop = db.byId('properties', visit.propertyId);
  const selfDeal = !!vprop && visit.brokerId === vprop.listingBrokerId;
  const propertySide = !!vprop && (vprop.ownerId === user.id || (vprop.listingBrokerId === user.id && !selfDeal));
  if (visit.brokerId === user.id && !(vprop && vprop.ownerId === user.id)) {
    res.status(403).json({ error: 'You scheduled this visit, so you cannot verify it yourself. The property owner or the listing broker confirms it on the spot (the customer shows them the QR / code).', code: 'MAKER_CHECKER' });
    return null;
  }
  if (!propertySide && !isSuper(user)) {
    res.status(403).json({ error: selfDeal ? 'The listing broker brought this customer himself — only the property owner can verify this visit' : 'Only the property side (the owner or the listing broker) can verify this visit', code: 'PROPERTY_SIDE_ONLY' });
    return null;
  }
  if (visit.isVerified) {
    res.status(409).json({ error: 'This site visit is already verified' });
    return null;
  }
  // v33 — the buyer must have confirmed “no direct deal” (tick + his mobile code) first
  const ackMsg = visitAckBlock('VISIT', visit.id);
  if (ackMsg) {
    res.status(409).json({ error: ackMsg, code: 'ACK_REQUIRED' });
    return null;
  }
  if (Date.now() < Date.parse(visit.scheduledTime) - 6 * 3600_000) {
    res.status(400).json({ error: 'Too early: a visit can only be verified on the day of the scheduled visit' });
    return null;
  }
  if (visit.otpExpiresAt && Date.now() > Date.parse(visit.otpExpiresAt)) {
    res.status(410).json({ error: 'Verification window has expired. Schedule a new visit.' });
    return null;
  }
  if ((visit.otpAttempts || 0) >= 5) {
    res.status(429).json({ error: 'Too many wrong attempts — this visit is locked. Contact GENZ Operations.' });
    return null;
  }
  return visit;
}

function finishVisitVerification(visit: any, method: 'OTP' | 'QR', feedback: string, user: UserProfile, auditAction: string, auditText: string) {
  const state = db.getState();
  const now = new Date().toISOString();
  visit.isVerified = true;
  visit.verifiedAt = now;
  visit.verificationMethod = method;
  visit.feedbackNotes = feedback.slice(0, 500);

  const deal = visitDeal(state, visit);
  if (deal && deal.stage === 'Introduction') {
    deal.stage = 'Site Visit Done';
    deal.updatedAt = now;
  }
  // v29 — the buyer saw the property with this broker (OTP / QR on site): the buyer bond starts
  if (visit.customerPhone) makeBuyerBond({ brokerId: visit.brokerId, propertyId: visit.propertyId, buyerPhone: visit.customerPhone, buyerName: visit.customerName, source: 'VISIT', sourceId: visit.id, dealRoomId: visit.dealRoomId });
  db.save();
  db.appendAuditEvent(user.id, user.role, 'VISIT', visit.id, auditAction, auditText);
  return deal;
}

app.post('/api/site-visits/:id/verify-otp', needs('sitevisit:verify'), rateLimit('otp', 30, 10 * 60_000), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { otpCode, feedbackNotes } = req.body || {};

  const visit = loadVerifiableVisit(req, res, currentUser);
  if (!visit) return;

  if (!safeEqual(String(visit.otpCode).trim(), String(otpCode ?? '').trim())) {
    visit.otpAttempts = (visit.otpAttempts || 0) + 1;
    db.save();
    return res.status(400).json({ error: `Invalid verification OTP code. ${Math.max(0, 5 - visit.otpAttempts)} attempt(s) left.` });
  }

  const deal = finishVisitVerification(
    visit, 'OTP', String(feedbackNotes || 'Physical site inspection verified by client on location.'), currentUser,
    'SITE_VISIT_CONFIRMED', `Site visit ${visit.id} verified via OTP challenge. Anti-bypass evidence stamped for property ${visit.propertyId}.`
  );
  res.json({ success: true, siteVisit: sanitizeVisit(visit, currentUser), dealRoom: deal });
});

// Instant Digital QR Check-In with geo-location anti-bypass stamp
app.post('/api/site-visits/:id/checkin-qr', needs('sitevisit:verify'), rateLimit('qr', 30, 10 * 60_000), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { qrToken, feedbackNotes, latitude, longitude } = req.body || {};

  const visit = loadVerifiableVisit(req, res, currentUser);
  if (!visit) return;

  // The token is now mandatory and random (it used to be optional and equal to the public visit id).
  if (!visit.qrToken || !safeEqual(String(visit.qrToken), String(qrToken ?? '').trim())) {
    visit.otpAttempts = (visit.otpAttempts || 0) + 1;
    db.save();
    return res.status(400).json({ error: 'Invalid or expired QR verification token.' });
  }

  let geoText = '';
  if (latitude !== undefined && longitude !== undefined && latitude !== '' && longitude !== '') {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'Invalid GPS coordinates' });
    }
    const prop = db.byId('properties', visit.propertyId);
    if (prop?.latitude !== undefined && prop?.longitude !== undefined) {
      const km = distanceKm(lat, lng, prop.latitude, prop.longitude);
      if (km > 5) {
        return res.status(400).json({ error: `Check-in rejected: you appear to be ${km.toFixed(1)} km from the property.` });
      }
    }
    geoText = ` [GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}]`;
  }

  const deal = finishVisitVerification(
    visit, 'QR', String(feedbackNotes || `On-site digital QR scan check-in verified.${geoText}`), currentUser,
    'SITE_VISIT_QR_CHECKIN', `Site visit ${visit.id} checked in via on-site digital QR scan. Anti-bypass geo-evidence stamped for property ${visit.propertyId}.${geoText}`
  );
  res.json({ success: true, siteVisit: sanitizeVisit(visit, currentUser), dealRoom: deal });
});


// ==========================================
// 9. OWNER ⇄ LISTING-BROKER NET-AMOUNT MANDATE & ANTI-BYPASS TAIL CLAUSE
// ==========================================
//
// The owner fixes the FINAL NET AMOUNT he must receive for the property. Everything realised above that
// amount is the listing broker's remuneration. The owner drafts and signs (password re-entry = e-signature),
// the listing broker reviews and co-signs. Only an ACTIVE (both-signed) mandate unlocks the deal rooms
// (deal.ownerRemunerationConfirmed). The amount is confidential between owner, listing broker and admins.


/** What the listing broker earns / the owner receives if the property sells at the advertised price, for each of the 3 bases. */
function remunerationAtAsking(m: any) {
  const adv = m.advertisedPrice;
  let broker: number;
  if (m.remunerationBasis === 'PERCENTAGE') broker = Math.round(adv * (m.agreedCommissionPct || 0) / 100);
  else if (m.remunerationBasis === 'FIXED_FEE') broker = Math.round(m.fixedFeeAmount || 0);
  else broker = Math.max(0, adv - m.approvedNetPrice);
  return { brokerRemunerationAtAsking: broker, ownerReceivesAtAsking: Math.max(0, adv - broker) };
}

function mandateView(m: any, state = db.getState()) {
  const { otpChallenge: _o, otpExpiresAt: _e, otpAttempts: _a, ...rest } = m;
  const broker = db.byId('users', m.brokerId);
  const owner = db.byId('users', m.ownerId);
  const prop = db.byId('properties', m.propertyId);
  return {
    ...rest,
    ownerName: owner?.name || m.offPlatformOwner?.name,
    ownerSignature: m.consentId ? signatureSummary(m.consentId) : undefined,
    brokerName: broker?.name,
    propertyTitle: prop?.title,
    ...remunerationAtAsking(m),
  };
}

app.get('/api/owner-mandates', needs('mandate:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const propertyId = req.query.propertyId ? String(req.query.propertyId) : '';
  const list = state.ownerMandates
    .filter(m => isAdmin(currentUser) || m.ownerId === currentUser.id || m.brokerId === currentUser.id)
    .filter(m => !propertyId || m.propertyId === propertyId)
    .map(m => mandateView(m, state));
  res.json({ success: true, mandates: list });
});

app.post('/api/owner-mandates', needs('mandate:owner_create'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const parseResult = ownerMandateCreateSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  const { propertyId, protectionPeriodDays, remunerationBasis } = parseResult.data;
  { const pp = protectionPeriodDays === undefined ? null : checkDays(protectionPeriodDays); if (pp) return res.status(400).json({ error: pp.en, hi: pp.hi, code: pp.code }); }
  const approvedNetPrice = remunerationBasis === 'SURPLUS_ABOVE_NET' ? parseResult.data.approvedNetPrice! : 0;
  const commissionPct = remunerationBasis === 'PERCENTAGE' ? parseResult.data.commissionPct! : 0;
  const fixedFeeAmount = remunerationBasis === 'FIXED_FEE' ? parseResult.data.fixedFeeAmount! : 0;
  const state = db.getState();

  const prop = db.byId('properties', propertyId);
  if (!prop || prop.ownerId !== currentUser.id) {
    return res.status(403).json({ error: 'You can only draft a mandate for a property you own' });
  }
  if (['sold', 'rented', 'withdrawn'].includes(prop.listingStatus)) {
    return res.status(409).json({ error: `This listing is ${prop.listingStatus}; a mandate cannot be drafted` });
  }
  const advertisedPrice = parseResult.data.advertisedPrice ?? prop.askingPrice;
  if (remunerationBasis === 'SURPLUS_ABOVE_NET' && approvedNetPrice > advertisedPrice) {
    return res.status(400).json({ error: 'Your fixed net amount cannot exceed the advertised price' });
  }
  if (remunerationBasis === 'FIXED_FEE' && fixedFeeAmount >= advertisedPrice) {
    return res.status(400).json({ error: 'The fixed brokerage must be lower than the advertised price' });
  }
  const broker = db.byId('users', prop.listingBrokerId);
  if (!prop.listingBrokerId || !broker || broker.role !== 'BROKER' || broker.verificationStatus !== 'VERIFIED') {
    return res.status(400).json({ error: 'Appoint a verified listing broker for this property before drafting the mandate' });
  }
  if (state.ownerMandates.some(m => m.propertyId === propertyId && m.status === 'PENDING_BROKER')) {
    return res.status(409).json({ error: 'A mandate is already waiting for the listing broker. Withdraw it first to submit a new one.' });
  }
  const sigErr = verifySigningPassword(currentUser, req.body?.password);
  if (sigErr) return res.status(400).json({ error: sigErr, code: 'SIGN_PASSWORD' }); // v28: not 401 — a 401 signs the user out of the app

  const mandateId = `OM-2026-${String(nextSeq(state.ownerMandates.map(m => m.id), /OM-2026-(\d+)/, 0)).padStart(3, '0')}`;
  const now = new Date().toISOString();

  const newMandate: any = {
    id: mandateId,
    propertyId,
    ownerId: currentUser.id,
    brokerId: prop.listingBrokerId,
    advertisedPrice,
    approvedNetPrice,
    remunerationBasis,
    agreedCommissionPct: commissionPct,
    fixedFeeAmount,
    protectionPeriodDays: daysFor(protectionPeriodDays),
    agreementHash: generateMandateHash({ propertyId, ownerId: currentUser.id, approvedNetPrice, agreedCommissionPct: commissionPct, remunerationBasis, fixedFeeAmount, timestamp: now }),
    status: 'PENDING_BROKER',
    ownerSignedAt: now,
    isConfirmed: false,
    createdAt: now,
  };

  state.ownerMandates.unshift(newMandate);
  db.save();

  const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  const terms = remunerationBasis === 'PERCENTAGE' ? `commission ${commissionPct}% of the final price`
    : remunerationBasis === 'FIXED_FEE' ? `fixed brokerage ${inr(fixedFeeAmount)}`
    : `fixed net amount ${inr(approvedNetPrice)} (everything above is the listing broker's remuneration)`;
  db.appendAuditEvent(
    currentUser.id, currentUser.role, 'PROPERTY', mandateId, 'OWNER_MANDATE_SIGNED_BY_OWNER',
    `Owner signed a ${remunerationBasis} mandate: ${terms}; advertised ${inr(advertisedPrice)}. Protection tail: ${newMandate.protectionPeriodDays} days. Awaiting listing broker.`
  );
  // The amount itself is never put in an SMS.
  if (broker.phone) void sendSms(broker.phone, `GENZ: a brokerage mandate ${mandateId} for property ${propertyId} is waiting for your review and signature.`);

  res.json({ success: true, mandate: mandateView(newMandate, state) });
});

app.post('/api/owner-mandates/:id/accept', needs('mandate:broker_respond'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const mandate = db.byId('ownerMandates', req.params.id);
  if (!mandate || mandate.brokerId !== currentUser.id) return res.status(404).json({ error: 'Mandate not found' });
  if (mandate.status !== 'PENDING_BROKER') return res.status(409).json({ error: `This mandate is ${mandate.status.toLowerCase().replace('_', ' ')} and cannot be signed` });
  const prop = db.byId('properties', mandate.propertyId);
  if (!prop || prop.listingBrokerId !== currentUser.id) {
    return res.status(409).json({ error: 'You are no longer the listing broker of this property' });
  }
  const sigErr = verifySigningPassword(currentUser, req.body?.password);
  if (sigErr) return res.status(400).json({ error: sigErr, code: 'SIGN_PASSWORD' }); // v28: not 401 — a 401 signs the user out of the app

  const now = new Date().toISOString();
  state.ownerMandates.filter(m => m.propertyId === mandate.propertyId && m.status === 'ACTIVE')
    .forEach(m => { m.status = 'SUPERSEDED'; m.isConfirmed = false; });
  mandate.status = 'ACTIVE';
  mandate.brokerSignedAt = now;
  mandate.isConfirmed = true;
  mandate.confirmedAt = now;
  mandate.agreementHash = generateMandateHash({
    propertyId: mandate.propertyId, ownerId: mandate.ownerId, approvedNetPrice: mandate.approvedNetPrice,
    agreedCommissionPct: mandate.agreedCommissionPct, remunerationBasis: mandate.remunerationBasis, fixedFeeAmount: mandate.fixedFeeAmount, timestamp: now,
  });

  // Sync to the property + unlock deal rooms
  if (prop.askingPrice !== mandate.advertisedPrice) {
    prop.priceHistory.push({ price: mandate.advertisedPrice, changedAt: now, reason: `Brokerage mandate ${mandate.id}` });
    prop.askingPrice = mandate.advertisedPrice;
  }
  if (mandate.remunerationBasis === 'SURPLUS_ABOVE_NET') prop.ownerApprovedNetPrice = mandate.approvedNetPrice;
  prop.updatedAt = now;
  state.dealRooms.filter(d => d.propertyId === prop.id).forEach(d => { d.ownerRemunerationConfirmed = true; });
  db.save();

  db.appendAuditEvent(
    currentUser.id, currentUser.role, 'PROPERTY', mandate.id, 'OWNER_MANDATE_ACTIVATED',
    `Listing broker co-signed. Mandate ${mandate.id} is ACTIVE; seal ${mandate.agreementHash.substring(0, 16)}… registered. Anti-bypass tail: ${mandate.protectionPeriodDays} days.`
  );
  res.json({ success: true, mandate: mandateView(mandate, state), property: sanitizeProperty(prop, currentUser, state) });
});

app.post('/api/owner-mandates/:id/reject', needs('mandate:broker_respond'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const mandate = db.byId('ownerMandates', req.params.id);
  if (!mandate || mandate.brokerId !== currentUser.id) return res.status(404).json({ error: 'Mandate not found' });
  if (mandate.status !== 'PENDING_BROKER') return res.status(409).json({ error: 'Only a mandate that is waiting for you can be declined' });
  const note = str(req.body?.note, 400);
  if (note.length < 5) return res.status(400).json({ error: 'Please tell the owner why (min 5 characters)' });
  mandate.status = 'REJECTED';
  mandate.decisionNote = note;
  db.save();
  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', mandate.id, 'OWNER_MANDATE_DECLINED', `Listing broker declined mandate ${mandate.id}. Reason: ${note}`);
  res.json({ success: true, mandate: mandateView(mandate, state) });
});

app.post('/api/owner-mandates/:id/withdraw', needs('mandate:owner_confirm'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const mandate = db.byId('ownerMandates', req.params.id);
  if (!mandate || mandate.ownerId !== currentUser.id) return res.status(404).json({ error: 'Mandate not found' });
  if (mandate.status !== 'PENDING_BROKER') return res.status(409).json({ error: 'Only a mandate that the broker has not yet signed can be withdrawn' });
  mandate.status = 'WITHDRAWN';
  db.save();
  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', mandate.id, 'OWNER_MANDATE_WITHDRAWN', `Owner withdrew the unsigned mandate ${mandate.id}.`);
  res.json({ success: true, mandate: mandateView(mandate, state) });
});

// Owner appoints / changes the listing broker (not possible while a mandate is active or deals are live).
app.post('/api/properties/:id/appoint-broker', needs('property:update'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const prop = db.byId('properties', req.params.id);
  if (!prop || (prop.ownerId !== currentUser.id && !isAdmin(currentUser))) return res.status(404).json({ error: 'Property not found' });
  const broker = db.byId('users', req.body?.brokerId);
  if (!broker || broker.role !== 'BROKER' || broker.verificationStatus !== 'VERIFIED') {
    return res.status(400).json({ error: 'Choose a verified broker from the network' });
  }
  if (prop.listingBrokerId === broker.id) return res.json({ success: true, property: sanitizeProperty(prop, currentUser, state) });
  if (state.ownerMandates.some(m => m.propertyId === prop.id && ['ACTIVE', 'PENDING_BROKER'].includes(m.status))) {
    return res.status(409).json({ error: 'A mandate is pending or active with the current listing broker. Withdraw it / end it with an admin first.' });
  }
  if (state.dealRooms.some(d => d.propertyId === prop.id && !['Settled', 'Lead'].includes(d.stage))) {
    return res.status(409).json({ error: 'Live deal rooms exist for this property; the listing broker cannot be changed now.' });
  }
  prop.listingBrokerId = broker.id;
  prop.updatedAt = new Date().toISOString();
  db.save();
  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', prop.id, 'LISTING_BROKER_APPOINTED', `${broker.name} appointed as listing broker.`);
  res.json({ success: true, property: sanitizeProperty(prop, currentUser, state) });
});

// ==========================================
// 10. CONSTRUCTION LEAD MODULE (GENZ BUILDCON)
// ==========================================

app.get('/api/construction-leads', needs('lead:read'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();

  // Brokers see only the leads they referred; contractors see open leads (masked) + their own; admins everything.
  const visible = state.constructionLeads.filter(l => {
    if (isAdmin(currentUser)) return true;
    if (currentUser.role === 'BROKER') return l.referringBrokerId === currentUser.id;
    if (currentUser.role === 'CONTRACTOR') return l.status === 'OPEN' || l.assignedContractorId === currentUser.id;
    if (currentUser.role === 'TEAM_MEMBER' && currentUser.employerRole === 'CONTRACTOR') return l.assignedContractorId === currentUser.employerId; // only the employer's awarded jobs
    return false;
  });
  const isContractorStaff = currentUser.role === 'TEAM_MEMBER';

  // Contractor sees masked contact info until approved
  const safeLeads = visible.map(lead => {
    const isOwnerOrBroker = isAdmin(currentUser) || lead.referringBrokerId === currentUser.id;
    // Contact is un-masked only for the contractor the lead is ASSIGNED to (agreement signed) — an approved record alone is not enough.
    const myContractorId = isContractorStaff ? currentUser.employerId : currentUser.id;
    const isApprovedContractor = lead.status === 'ASSIGNED' && lead.assignedContractorId === myContractorId && state.contractorRequests.some(r => r.leadId === lead.id && r.contractorId === myContractorId && r.status === 'APPROVED');

    const canSeeContact = isOwnerOrBroker || isApprovedContractor;

    const { referralCommissionPct, referralCommissionDue, referralCommissionPaid, finalContractValue, referringBrokerId, referringBrokerName, ...nonCommercial } = lead;
    return {
      ...(isContractorStaff ? nonCommercial : lead), // employees never see commission / contract value
      exactAddressHidden: canSeeContact ? lead.exactAddressHidden : 'Protected: Access granted after referral agreement acceptance',
      customerPhoneHidden: canSeeContact ? lead.customerPhoneHidden : maskPhoneNumber(lead.customerPhoneHidden),
    };
  });

  res.json({ success: true, leads: safeLeads });
});

app.post('/api/construction-leads', needs('lead:create'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const parseResult = constructionLeadCreateSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  const data = parseResult.data;
  const state = db.getState();

  const leadSeq = nextSeq(state.constructionLeads.map(l => l.id), /CL-(?:RAI-)?(\d+)/, 500);
  const leadId = `CL-${leadSeq}`;
  const now = new Date().toISOString();

  const newLead = {
    id: leadId,
    title: data.title,
    projectType: data.projectType,
    approximateLocation: data.approximateLocation,
    exactAddressHidden: data.exactAddressHidden,
    estimatedBudget: data.estimatedBudget,
    scopeDescription: data.scopeDescription,
    timeline: data.timeline,
    referringBrokerId: currentUser.id,
    referringBrokerName: currentUser.name,
    referralCommissionPct: data.referralCommissionPct || 1, // Default 1%
    customerNameMasked: data.customerNameMasked,
    customerPhoneHidden: data.customerPhoneHidden,
    customerConsentAt: now,
    status: 'OPEN' as const,
    createdAt: now,
  };

  state.constructionLeads.unshift(newLead);
  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'LEAD',
    leadId,
    'CONSTRUCTION_LEAD_POSTED',
    `Construction opportunity logged: ${data.title} in ${data.approximateLocation} (Budget: ₹${data.estimatedBudget.toLocaleString('en-IN')}) with ${newLead.referralCommissionPct}% referral fee; broker confirmed customer consent`
  );

  res.json({ success: true, lead: newLead });
});

// Contractor requests lead access and accepts 1% referral terms
app.post('/api/construction-leads/:id/request-access', needs('lead:claim'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  if (currentUser.role !== 'CONTRACTOR') {
    return res.status(403).json({ error: 'Only registered contractors can request construction lead access' });
  }

  const { id } = req.params;
  const { termsAccepted } = req.body || {};

  if (termsAccepted !== true) {
    return res.status(400).json({ error: 'You must formally accept the referral commission mandate terms before request can be processed' });
  }

  const state = db.getState();
  const lead = db.byId('constructionLeads', id);
  if (!lead) {
    return res.status(404).json({ error: 'Construction lead not found' });
  }

  // Check if existing request (idempotent for the same contractor)
  // A stale "approved" record (lead not actually assigned to this contractor) never counts, and is never returned with contact details.
  const stale = state.contractorRequests.filter(r => r.leadId === id && r.contractorId === currentUser.id && r.status === 'APPROVED' && !(lead.status === 'ASSIGNED' && lead.assignedContractorId === currentUser.id));
  for (const sr of stale) state.contractorRequests.splice(state.contractorRequests.indexOf(sr), 1);
  let reqRecord = state.contractorRequests.find(r => r.leadId === id && r.contractorId === currentUser.id);
  const now = new Date().toISOString();

  if (!reqRecord) {
    // A lead can be claimed once. Previously any contractor could re-claim an ASSIGNED lead and hijack it.
    if (lead.status !== 'OPEN') {
      return res.status(409).json({ error: 'This lead has already been taken by another contractor' });
    }
    const reqSeq = nextSeq(state.contractorRequests.map(r => r.id), /CAR-0*(\d+)/, 0);
    reqRecord = {
      id: `CAR-${String(reqSeq).padStart(3, '0')}`,
      leadId: lead.id,
      contractorId: currentUser.id,
      contractorName: currentUser.companyName || currentUser.name,
      termsAccepted: true,
      termsAcceptedAt: now,
      status: 'APPROVED', // Instant access for KYC-verified contractors who sign the terms
      disclosedContact: {
        customerName: lead.customerNameMasked.replace(' (Masked for Privacy)', ''),
        customerPhone: lead.customerPhoneHidden,
        exactAddress: lead.exactAddressHidden,
      },
      createdAt: now,
    };
    state.contractorRequests.push(reqRecord);
    lead.assignedContractorId = currentUser.id;
    lead.status = 'ASSIGNED';
  }

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'LEAD',
    lead.id,
    'CONTRACTOR_TERMS_ACCEPTED',
    `Contractor ${currentUser.name} signed ${lead.referralCommissionPct}% referral agreement. Contact details disclosed for ${lead.id}.`
  );

  res.json({ success: true, request: reqRecord, lead });
});

// Record final contract value and commission settlement
//  - contract value: declared by the assigned contractor (or SUPERADMIN)
//  - "paid": confirmed by the *receiving* referring broker (or SUPERADMIN) — a contractor cannot mark themselves as having paid
app.post('/api/construction-leads/:id/settle-referral', needs('lead:settle'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { id } = req.params;
  const { finalContractValue, paid } = req.body || {};

  const state = db.getState();
  const lead = db.byId('constructionLeads', id);
  if (!lead) {
    return res.status(404).json({ error: 'Construction lead not found' });
  }
  if (lead.status === 'OPEN' || lead.status === 'CANCELLED') {
    return res.status(409).json({ error: `Lead is ${lead.status.toLowerCase()} — nothing to settle yet` });
  }

  const isAssignedContractor = currentUser.role === 'CONTRACTOR' && lead.assignedContractorId === currentUser.id;
  const isReferrer = currentUser.role === 'BROKER' && lead.referringBrokerId === currentUser.id;
  if (!isSuper(currentUser) && !isAssignedContractor && !isReferrer) {
    return res.status(403).json({ error: 'Only the assigned contractor or the referring broker can settle this referral' });
  }

  if (finalContractValue !== undefined && Number(finalContractValue) > 0) {
    if (!isSuper(currentUser) && !isAssignedContractor) {
      return res.status(403).json({ error: 'Only the assigned contractor declares the final contract value' });
    }
    if (lead.referralCommissionPaid) {
      return res.status(409).json({ error: 'Referral already paid — contract value is locked' });
    }
    const v = Number(finalContractValue);
    if (!Number.isFinite(v) || v > 100_000_000_000) return res.status(400).json({ error: 'Invalid contract value' });
    lead.finalContractValue = v;
    lead.referralCommissionDue = Math.round(lead.finalContractValue * (lead.referralCommissionPct / 100));
    if (lead.status === 'ASSIGNED') lead.status = 'IN_PROGRESS';
  }

  if (paid !== undefined) {
    if (!isSuper(currentUser) && !isReferrer) {
      return res.status(403).json({ error: 'Only the referring broker (who receives the fee) can confirm payment' });
    }
    if (paid && !lead.referralCommissionDue) {
      return res.status(400).json({ error: 'The contractor has not declared a final contract value yet' });
    }
    lead.referralCommissionPaid = Boolean(paid);
    if (lead.referralCommissionPaid) {
      lead.status = 'COMPLETED';
    }
  }

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'COMMISSION',
    lead.id,
    'CONSTRUCTION_REFERRAL_SETTLED',
    `Construction referral settlement updated: Contract Value ₹${lead.finalContractValue?.toLocaleString('en-IN')}, Commission Due: ₹${lead.referralCommissionDue?.toLocaleString('en-IN')}, Paid: ${lead.referralCommissionPaid}`
  );

  res.json({ success: true, lead });
});

// ==========================================
// 11. DISPUTE MANAGEMENT & AUDIT LOGS
// ==========================================

function canSeeDispute(user: UserProfile, d: any, state = db.getState()) {
  if (isAdmin(user)) return true;
  if (d.complainantId === user.id || d.counterpartyId === user.id) return true;
  if (d.dealRoomId) {
    const deal = db.byId('dealRooms', d.dealRoomId);
    if (deal && isDealParticipant(user, deal)) return true;
  }
  if (d.leadId) {
    const lead = db.byId('constructionLeads', d.leadId);
    if (lead && (lead.referringBrokerId === user.id || lead.assignedContractorId === user.id)) return true;
  }
  return false;
}

app.get('/api/disputes', needs('dispute:read'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  res.json({ success: true, disputes: state.disputes.filter(d => canSeeDispute(currentUser, d, state)) });
});

app.post('/api/disputes', needs('dispute:create'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const parseResult = disputeCreateSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({ error: parseResult.error.issues[0]?.message || 'Validation error' });
  }

  const data = parseResult.data;
  const state = db.getState();

  const counterparty = db.byId('users', data.counterpartyId);
  if (!counterparty || counterparty.id === currentUser.id) {
    return res.status(400).json({ error: 'Choose a valid counterparty (not yourself)' });
  }

  // A dispute may only freeze a deal that the complainant actually participates in.
  let deal: any;
  if (data.dealRoomId) {
    deal = db.byId('dealRooms', data.dealRoomId);
    if (!deal || !isDealParticipant(currentUser, deal)) {
      return res.status(403).json({ error: 'You can only raise a dispute on a deal room you participate in' });
    }
    if (!isDealParticipant(counterparty, deal)) {
      return res.status(400).json({ error: 'The counterparty is not a participant of this deal room' });
    }
    if (state.disputes.some(d => d.dealRoomId === deal.id && (d.status === 'OPEN' || d.status === 'UNDER_REVIEW' || d.status === 'MEDIATION'))) {
      return res.status(409).json({ error: 'An open dispute already exists for this deal room' });
    }
  }
  if (data.leadId) {
    const lead = db.byId('constructionLeads', data.leadId);
    if (!lead || (lead.referringBrokerId !== currentUser.id && lead.assignedContractorId !== currentUser.id)) {
      return res.status(403).json({ error: 'You can only raise a dispute on a construction lead you are part of' });
    }
  }

  const newDispute = fileDispute(state, currentUser, { dealRoomId: data.dealRoomId, leadId: data.leadId, counterparty, reason: data.reason, description: data.description, evidenceLinks: data.evidenceLinks }, deal);

  res.json({ success: true, dispute: newDispute });
});

/**
 * Opens a dispute (shared by the Disputes desk and the commission "payment not received" button). On a deal room it puts the
 * settlement on hold — and, from v21, opens the room's inside to the GENZ admin until the dispute is resolved.
 */
function fileDispute(
  state: DatabaseState,
  user: UserProfile,
  data: { dealRoomId?: string; leadId?: string; counterparty: UserProfile; reason: string; description: string; evidenceLinks?: string[] },
  deal?: DealRoom,
) {
  const dispId = `DISP-2026-${String(nextSeq(state.disputes.map(d => d.id), /DISP-2026-0*(\d+)/, 0)).padStart(2, '0')}`;
  const now = new Date().toISOString();

  const newDispute = {
    id: dispId,
    dealRoomId: data.dealRoomId,
    leadId: data.leadId,
    complainantId: user.id,
    complainantName: user.name,
    complainantRole: user.role,
    counterpartyId: data.counterparty.id,
    counterpartyName: data.counterparty.name, // from our records, never trusted from the client
    reason: data.reason as any,
    description: data.description,
    evidenceLinks: data.evidenceLinks || [],
    status: 'OPEN' as const,
    settlementHold: true,
    createdAt: now,
    updatedAt: now,
  };

  state.disputes.unshift(newDispute);

  // If tied to deal room, put deal settlement on hold
  if (deal) {
    deal.disputeId = dispId;
    deal.settlementStatus = 'DISPUTED';
    deal.updatedAt = now;
  }

  db.save();

  db.appendAuditEvent(
    user.id,
    user.role,
    'DISPUTE',
    dispId,
    'DISPUTE_FILED',
    `Dispute filed by ${user.name} against ${data.counterparty.name}. Reason: ${data.reason}. Settlement hold placed.${deal ? ` The GENZ admin may read deal room ${deal.id} in full until the dispute is resolved.` : ''}`
  );
  return newDispute;
}

app.post('/api/disputes/:id/resolve', needs('dispute:resolve'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { id } = req.params;
  const { status, resolutionNotes, liftHold, blacklistParty } = req.body || {};

  const state = db.getState();
  const dispute = db.byId('disputes', id);
  if (!dispute) {
    return res.status(404).json({ error: 'Dispute not found' });
  }
  const newStatus = status || 'RESOLVED';
  if (!['UNDER_REVIEW', 'MEDIATION', 'RESOLVED', 'DISMISSED'].includes(newStatus)) {
    return res.status(400).json({ error: 'status must be UNDER_REVIEW, MEDIATION, RESOLVED or DISMISSED' });
  }
  const closing = newStatus === 'RESOLVED' || newStatus === 'DISMISSED';
  if (closing && (!resolutionNotes || String(resolutionNotes).trim().length < 10)) {
    return res.status(400).json({ error: 'Resolution notes (min 10 characters) are required to close a dispute' });
  }
  if (dispute.status === 'RESOLVED' || dispute.status === 'DISMISSED') {
    return res.status(409).json({ error: 'Dispute is already closed' });
  }
  if (blacklistParty) {
    if (!can(currentUser, 'users:blacklist')) {
      return res.status(403).json({ error: 'Only a SUPERADMIN can blacklist a party' });
    }
    const offender = db.byId('users', dispute.counterpartyId);
    if (offender && (offender.role === 'SUPERADMIN' || offender.role === 'ADMIN')) {
      return res.status(403).json({ error: 'Administrators cannot be blacklisted through a dispute' });
    }
  }

  const now = new Date().toISOString();
  dispute.status = newStatus;
  dispute.resolutionNotes = String(resolutionNotes || 'Reviewed and closed by a GENZ admin.').slice(0, 2000);
  if (liftHold && closing) {
    dispute.settlementHold = false;
  }
  dispute.updatedAt = now;

  // a closed dispute releases the commission shares it had marked DISPUTED (v21: they used to stay frozen until an admin typed a payment)
  if (closing && dispute.dealRoomId) {
    for (const ag of state.commissionAgreements) if (ag.dealId === dispute.dealRoomId) for (const al of ag.allocations) {
      if (al.entitlementStatus !== 'DISPUTED') continue;
      al.entitlementStatus = (al.paidAmount || 0) >= al.allocationAmount ? 'PAID' : (al.paidAmount || 0) > 0 ? 'EARNED' : 'AGREED';
      al.disputedAmount = 0;
    }
  }

  if (dispute.dealRoomId && liftHold && closing) {
    const deal = db.byId('dealRooms', dispute.dealRoomId);
    if (deal) {
      deal.settlementStatus = 'AGREED';
      deal.updatedAt = now;
    }
  }

  if (blacklistParty && dispute.counterpartyId) {
    const offender = db.byId('users', dispute.counterpartyId);
    if (offender) {
      offender.verificationStatus = 'BLACKLISTED';
      offender.verificationNotes = `Blacklisted following dispute ${dispute.id} resolution: ${resolutionNotes}`;
      offender.sessionVersion = (offender.sessionVersion || 1) + 1;
    }
  }

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'DISPUTE',
    dispute.id,
    'DISPUTE_RESOLVED',
    `Dispute ${dispute.id} marked ${dispute.status}. Notes: ${resolutionNotes}. Hold lifted: ${Boolean(liftHold && closing)}`
  );

  res.json({ success: true, dispute });
});

// ==========================================
// 12. BUILDERS LAUNCHPAD & SALES ASSOCIATES DESK
// ==========================================

app.get('/api/builder/projects', needs('builder:projects_read'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const all = state.builderProjects || [];
  let projects = all;
  if (currentUser.role === 'DEVELOPER_BUILDER') {
    projects = all.filter(p => p.builderId === currentUser.id);
  } else if (currentUser.role === 'BROKER') {
    // brokers see projects that are open for partners, plus any project they hold a mandate on
    const mine = new Set((state.associateMandates || []).filter(m => m.brokerId === currentUser.id).map(m => m.projectId));
    projects = all.filter(p => mine.has(p.id) || ((p.status === 'ACTIVE_LAUNCH' || p.status === 'PRE_BOOKING') && (p.access || 'OPEN_APPLY') === 'OPEN_APPLY'));
  }
  res.json({ success: true, projects });
});

app.post('/api/builder/projects', needs('builder:project_create'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();

  const parsed = projectCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Missing mandatory project launch details (Name, Locality, RERA #, Price)' });
  }
  const d = parsed.data;

  let builder: UserProfile | undefined = currentUser.role === 'DEVELOPER_BUILDER' ? currentUser : undefined;
  if (!builder) {
    builder = state.users.find(u => u.id === (req.body as any)?.builderId && u.role === 'DEVELOPER_BUILDER' && u.verificationStatus === 'VERIFIED');
    if (!builder) return res.status(400).json({ error: 'Name the verified builder account (builderId) this project belongs to' });
  }

  const projectCity = (d.city || builder.city || '').trim();
  if (!projectCity) return res.status(400).json({ error: 'City of the project is required' });
  const projectState = d.state || builder.state || stateOfCity(projectCity) || '';
  const projSeq = nextSeq((state.builderProjects || []).map(p => p.id), /PROJ-(?:RAI-)?0*(\d+)/, 0);
  const projectId = `PROJ-${String(projSeq).padStart(2, '0')}`;
  const now = new Date().toISOString();

  const newProject: any = {
    id: projectId,
    builderId: builder.id,
    builderName: builder.companyName || builder.name,
    projectName: d.projectName,
    tagline: d.tagline || `New real-estate launch in ${d.locality}, ${projectCity}`,
    locality: d.locality,
    city: projectCity,
    state: projectState,
    reraNumber: d.reraNumber,
    projectType: d.projectType || 'Luxury High-Rise',
    projectStage: d.projectStage || 'Pre-Launch / Upcoming',
    launchDate: now,
    completionTarget: d.completionTarget || 'To be announced',
    totalUnits: d.totalUnits || 100,
    availableUnits: d.totalUnits || 100,
    priceStartingFrom: d.priceStartingFrom,
    priceMax: d.priceMax || d.priceStartingFrom,
    channelPartnerCommissionPct: d.channelPartnerCommissionPct ?? 2.5,
    earlyBirdIncentiveBonusPct: d.earlyBirdIncentiveBonusPct ?? 0.5,
    siteAddress: d.siteAddress || `${d.locality}, ${projectCity}`,
    images: [], // the builder adds real photos; no stock image stands in for the project
    unitConfigurations: d.unitConfigurations?.length ? d.unitConfigurations : [],
    amenities: d.amenities?.length ? d.amenities : [], // never invent amenities the builder did not state
    assignedAssociatesCount: 0,
    totalBookingsGenerated: 0,
    totalSalesVolumeDelivered: 0,
    status: 'ACTIVE_LAUNCH',
    createdAt: now,
    updatedAt: now,
  };

  if (!state.builderProjects) state.builderProjects = [];
  state.builderProjects.unshift(newProject);
  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'SYSTEM',
    projectId,
    'BUILDER_PROJECT_LAUNCHED',
    `New project "${d.projectName}" launched in ${d.locality} with ${newProject.channelPartnerCommissionPct}% associate commission offer (RERA: ${d.reraNumber})`
  );

  res.json({ success: true, project: newProject });
});

app.get('/api/builder/associates', needs('builder:associates_read', 'builder:my_mandates'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const allProjects = state.builderProjects || [];
  const allMandates = state.associateMandates || [];

  let projects = allProjects;
  let mandates = allMandates;
  let brokers: any[] = [];

  if (currentUser.role === 'DEVELOPER_BUILDER') {
    projects = allProjects.filter(p => p.builderId === currentUser.id);
    const ids = new Set(projects.map(p => p.id));
    mandates = allMandates.filter(m => ids.has(m.projectId));
  } else if (currentUser.role === 'BROKER') {
    mandates = allMandates.filter(m => m.brokerId === currentUser.id);
    const ids = new Set(mandates.map(m => m.projectId));
    projects = allProjects.filter(p => ids.has(p.id));
  }

  // Only builders / admins may browse the associate directory — and only as contact-free partner cards.
  if (can(currentUser, 'builder:associates_read')) {
    brokers = state.users
      .filter(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED')
      // v20: the same short card as the people directory (all fields the builder screen uses; 10k brokers ≈ 2.5 MB → was 5 MB)
      .map(b => (isAdmin(currentUser) ? enrichUserWithTrustScore(b, state) : slimCard(b, state)));
  }

  res.json({ success: true, brokers, mandates, projects });
});

app.post('/api/builder/associates/mandate', needs('builder:appoint_associate'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const { projectId, brokerId, agreedCommissionPct, targetUnitsQuota } = req.body || {};

  const project = state.builderProjects?.find(p => p.id === projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (!isSuper(currentUser) && project.builderId !== currentUser.id) {
    return res.status(403).json({ error: 'You can only appoint associates for your own projects' });
  }

  const broker = db.byId('users', brokerId);
  if (!broker || broker.role !== 'BROKER') {
    return res.status(404).json({ error: 'Broker not found' });
  }
  if (broker.verificationStatus !== 'VERIFIED') {
    return res.status(400).json({ error: 'Only KYC-verified brokers can be appointed as sales associates' });
  }

  const pct = agreedCommissionPct === undefined || agreedCommissionPct === '' ? project.channelPartnerCommissionPct : Number(agreedCommissionPct);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 10) {
    return res.status(400).json({ error: 'Commission must be between 0.1% and 10%' });
  }
  const quota = targetUnitsQuota === undefined || targetUnitsQuota === '' ? 5 : Number(targetUnitsQuota);
  if (!Number.isInteger(quota) || quota < 1 || quota > 1000) {
    return res.status(400).json({ error: 'Target units quota must be a whole number between 1 and 1000' });
  }

  // Check if mandate already exists
  if (!state.associateMandates) state.associateMandates = [];
  const existing = state.associateMandates.find(m => m.projectId === projectId && m.brokerId === brokerId);
  if (existing && ['APPLIED', 'SHORTLISTED', 'INVITED', 'DECLINED'].includes(existing.status)) {
    // the broker had applied (or was shortlisted) — appointing them completes that request
    existing.status = 'ACTIVE_ASSOCIATE'; existing.agreedCommissionPct = pct; existing.targetUnitsQuota = quota; existing.marketingKitAccess = true;
    existing.statusReason = undefined; existing.decidedAt = new Date().toISOString();
    project.assignedAssociatesCount = (project.assignedAssociatesCount || 0) + 1; project.updatedAt = existing.decidedAt;
    db.save();
    db.appendAuditEvent(currentUser.id, currentUser.role, 'DEAL', existing.id, 'ASSOCIATE_MANDATE_APPOINTED', `Broker ${broker.name} appointed sales associate for "${project.projectName}" (from their request) with ${pct}% commission`);
    return res.json({ success: true, mandate: existing, project });
  }
  if (existing) {
    return res.status(400).json({ error: `This broker is already ${existing.status.toLowerCase().replace('_', ' ')} on this project — use Project Control to change terms` });
  }

  const mandateSeq = nextSeq(state.associateMandates.map(m => m.id), /MAND-(?:RAI-)?0*(\d+)/, 0);
  const mandateId = `MAND-${String(mandateSeq).padStart(2, '0')}`;
  const now = new Date().toISOString();

  const newMandate: any = {
    id: mandateId,
    projectId,
    projectName: project.projectName,
    builderId: project.builderId,
    builderName: project.builderName,
    brokerId: broker.id,
    brokerName: broker.name,
    brokerCompany: broker.companyName || 'Independent Broker',
    brokerReraNumber: broker.reraNumber,
    agreedCommissionPct: pct,
    targetUnitsQuota: quota,
    unitsSold: 0,
    grossSalesDelivered: 0,
    commissionEarned: 0,
    commissionPaid: false,
    marketingKitAccess: true,
    status: 'ACTIVE_ASSOCIATE',
    assignedAt: now,
  };

  state.associateMandates.unshift(newMandate);
  project.assignedAssociatesCount = (project.assignedAssociatesCount || 0) + 1;
  project.updatedAt = now;
  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'DEAL',
    mandateId,
    'ASSOCIATE_MANDATE_APPOINTED',
    `Broker ${broker.name} (${broker.brokerId || broker.id}) appointed sales associate for project "${project.projectName}" with ${newMandate.agreedCommissionPct}% commission`
  );

  res.json({ success: true, mandate: newMandate, project });
});

app.post('/api/builder/associates/record-sale', needs('builder:record_sale'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const { mandateId, unitDetails, saleValue, customerName } = req.body || {};

  const mandate = state.associateMandates?.find(m => m.id === mandateId);
  if (!mandate) {
    return res.status(404).json({ error: 'Sales mandate not found' });
  }

  const project = state.builderProjects?.find(p => p.id === mandate.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  if (!isSuper(currentUser) && project.builderId !== currentUser.id) {
    return res.status(403).json({ error: 'Only the project\'s builder can record bookings against its mandates' });
  }

  const result = applyAssociateSale(mandate, project, Number(saleValue));
  if ('error' in result) {
    return res.status(result.status).json({ error: result.error });
  }

  db.save();

  db.appendAuditEvent(
    currentUser.id,
    currentUser.role,
    'COMMISSION',
    mandate.id,
    'ASSOCIATE_SALE_RECORDED',
    `Booking logged by associate ${mandate.brokerName}: ${String(unitDetails || 'Unit').slice(0, 120)} for ₹${Number(saleValue).toLocaleString('en-IN')}. Brokerage earned: ₹${result.commission.toLocaleString('en-IN')} (${mandate.agreedCommissionPct}%). Client: ${String(customerName || 'Confidential').slice(0, 120)}`
  );

  res.json({ success: true, mandate, project, commissionEarned: result.commission });
});

// Audit Trail & Cryptographic Verification — admins see everything; everyone else sees only events that concern them.
app.get('/api/audit-logs', needs('audit:read_all', 'audit:read_own'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  // v20: newest first, one page at a time (the whole trail was sent on every view — 120 MB at a year's scale)
  const limit = Math.min(500, Math.max(10, Number(req.query.limit) || 100));
  const before = Number(req.query.before) || Infinity;
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 80);
  const entity = String(req.query.entity || '').trim().toUpperCase();
  const full = req.query.full === '1' && can(currentUser, 'audit:read_all');
  let keep: (e: AuditEventT) => boolean = () => true;

  if (!can(currentUser, 'audit:read_all')) {
    const mine = new Set<string>([currentUser.id]);
    state.properties.forEach(p => { if (p.ownerId === currentUser.id || p.listingBrokerId === currentUser.id) mine.add(p.id); });
    state.dealRooms.forEach(d => { if (isDealParticipant(currentUser, d)) { mine.add(d.id); } });
    state.commissionAgreements.forEach(a => { if (mine.has(a.dealId)) mine.add(a.id); });
    state.offers.forEach(o => { if (o.proposingBrokerId === currentUser.id || o.receivingBrokerId === currentUser.id) mine.add(o.id); });
    state.siteVisits.forEach(v => { if (v.brokerId === currentUser.id || mine.has(v.dealRoomId)) mine.add(v.id); });
    state.ownerMandates.forEach(m => { if (m.ownerId === currentUser.id || m.brokerId === currentUser.id) mine.add(m.id); });
    state.constructionLeads.forEach(l => { if (l.referringBrokerId === currentUser.id || l.assignedContractorId === currentUser.id) mine.add(l.id); });
    state.disputes.forEach(d => { if (canSeeDispute(currentUser, d, state)) mine.add(d.id); });
    (state.legalRequests || []).forEach(r => { if (r.requestedById === currentUser.id || r.counsellorId === currentUser.id) mine.add(r.id); });
    (state.legalLedger || []).forEach(e => { if (e.counsellorId === currentUser.id) mine.add(e.id); });
    (state.associateMandates || []).forEach(m => { if (m.brokerId === currentUser.id || m.builderId === currentUser.id) mine.add(m.id); });
    (state.builderProjects || []).forEach(p => { if (p.builderId === currentUser.id) mine.add(p.id); });
    (state.crmLeads || []).forEach(l => { if (l.builderId === currentUser.id || l.associateId === currentUser.id) mine.add(l.id); });
    (state.crmBookings || []).forEach(b => { if (b.builderId === currentUser.id || b.associateId === currentUser.id) mine.add(b.id); });
    (state.connectorReferrals || []).forEach(r => { if (r.assignedToId === currentUser.id) mine.add(r.id); });
    // What the two brokers agreed between themselves (split, payments) is hidden from the owner and other non-broker participants.
    const hidden = new Set<string>();
    state.dealRooms.forEach(d => {
      if (!canSeeDealCommercials(currentUser, d, state)) {
        hidden.add(d.id);
        state.commissionAgreements.forEach(a => { if (a.dealId === d.id) hidden.add(a.id); });
      }
    });
    keep = e =>
      !e.action.startsWith('CONNECTOR_REWARD') && // reward money is between GENZ ops and the partner
      !(e.entityType === 'COMMISSION' && hidden.has(e.entityId)) &&
      (e.actorId === currentUser.id || mine.has(e.entityId));
  }
  const match = (e: AuditEventT) => (!entity || e.entityType === entity) &&
    (!q || e.action.toLowerCase().includes(q) || e.entityId.toLowerCase().includes(q) || e.actorId.toLowerCase().includes(q) || e.details.toLowerCase().includes(q));
  const events: AuditEventT[] = []; let total = 0; let below = 0;
  for (let i = state.auditEvents.length - 1; i >= 0; i--) {
    const e = state.auditEvents[i];
    if (!keep(e) || !match(e)) continue;
    total++;
    if (e.id < before) { below++; if (events.length < limit) events.push(e); }
  }
  const last = events[events.length - 1];
  // v21: the money lines of a deal room GENZ may not read (no open dispute) show "₹•••" — the admin sees THAT something happened, not the brokers' amounts
  let shown = events;
  if (can(currentUser, 'audit:read_all') && events.some(e => e.entityType === 'COMMISSION')) {
    const open = openDisputeDeals(state);
    shown = events.map(e => {
      if (e.entityType !== 'COMMISSION') return e;
      const dealId = /^DEAL-/.test(e.entityId) ? e.entityId : /^AGR-(DEAL-[A-Za-z0-9-]+?)-V\d+$/.exec(e.entityId)?.[1];
      const deal = dealId ? db.byId('dealRooms', dealId) : undefined;
      if (deal && canSeeDealCommercials(currentUser, deal, state, open)) return e;
      return { ...e, details: e.details.replace(/₹\s?[\d,]+(\.\d+)?/g, '₹•••') };
    });
  }
  res.json({ success: true, events: shown, total, hasMore: below > events.length, nextBefore: last?.id ?? null, integrity: db.verifyAuditIntegrity(full) });
});

// ==========================================
// SUPERADMIN CONTROL CENTER
// ==========================================
const platformSettingsSchema = z.object({
  maintenanceMode: z.boolean().optional(),
  requireReraForBrokerApproval: z.boolean().optional(),
  defaultProtectionPeriodDays: z.number().int().min(7).max(730).optional(),
  ownerConsentRequired: z.boolean().optional(),
  defaultConstructionCommissionPct: z.number().min(0.5).max(10).optional(),
}).strict();

app.get('/api/admin/control-center', needs('admin:control_center'), (_req: Request, res: Response) => {
  const state = db.getState();
  const count = <T,>(list: T[], key: (x: T) => string) => list.reduce<Record<string, number>>((m, x) => { const k = key(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const refs = state.connectorReferrals || [];
  res.json({
    success: true,
    system: { demoMode: DEMO_MODE, storage: process.env.DATABASE_URL ? 'PostgreSQL' : 'JSON file', nodeEnv: process.env.NODE_ENV || 'development', uptimeSec: Math.round(process.uptime()), policyVersion: POLICY_VERSION },
    users: {
      total: state.users.length,
      byRole: count(state.users, u => u.role),
      byStatus: count(state.users, u => u.verificationStatus),
      pendingKyc: state.users.filter(u => u.verificationStatus === 'PENDING').map(u => ({ id: u.id, name: u.name, role: u.role, city: u.city, createdAt: u.createdAt })),
      mustChangePassword: state.users.filter(u => u.mustChangePassword).length,
    },
    inventory: { properties: count(state.properties, p => p.listingStatus), requirements: count(state.requirements, r => r.status), moderationPending: state.properties.filter(p => p.verificationStatus !== 'VERIFIED').length },
    deals: { total: state.dealRooms.length, byStage: count(state.dealRooms, d => d.stage), commissionExpected: state.dealRooms.reduce((a, d) => a + (d.totalCommissionExpected || 0), 0) },
    disputes: { open: state.disputes.filter(d => !['RESOLVED', 'DISMISSED'].includes(d.status)).length, total: state.disputes.length },
    invitations: { pending: state.invitations.filter(i => i.status === 'PENDING').length, redeemed: state.invitations.filter(i => i.status === 'REDEEMED').length },
    privacy: { openRequests: (state.privacyRequests || []).filter((r: any) => r.status === 'OPEN' || r.status === 'PENDING').length },
    connector: {
      referrals: refs.length,
      unassigned: refs.filter(r => r.status === 'SUBMITTED' && !r.assignedToId).length,
      rewardApprovals: refs.filter(r => r.status === 'CLOSED_WON' && r.rewardStatus === 'NONE').length,
      payoutsDue: refs.filter(r => r.rewardStatus === 'APPROVED').length,
      payoutsDueAmount: refs.filter(r => r.rewardStatus === 'APPROVED').reduce((a, r) => a + (r.rewardAmount || 0), 0),
    },
    settings: state.settings,
    audit: { integrity: db.verifyAuditIntegrity(), recent: state.auditEvents.slice(-10).reverse().map(e => ({ id: e.id, at: e.timestamp, action: e.action, actor: e.actorRole, entity: e.entityId })) },
  });
});

app.put('/api/admin/settings', needs('admin:control_center'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const parsed = platformSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings' });
  if (parsed.data.defaultProtectionPeriodDays !== undefined) { const pp = checkDays(parsed.data.defaultProtectionPeriodDays); if (pp) return res.status(400).json({ error: pp.en, hi: pp.hi, code: pp.code }); }
  const s = db.getState().settings;
  const changed: string[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined && (s as any)[k] !== v) { changed.push(`${k}: ${(s as any)[k]} → ${v}`); (s as any)[k] = v; }
  }
  db.save();
  if (changed.length) db.appendAuditEvent(currentUser.id, currentUser.role, 'SYSTEM', 'PLATFORM-SETTINGS', 'PLATFORM_SETTINGS_UPDATED', changed.join('; '));
  res.json({ success: true, settings: s });
});

// Live metrics. Platform-wide numbers (all users, all commissions) are admin-only; everyone else gets figures scoped to their own data.
app.get('/api/admin/metrics', needs('metrics:own'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const global = can(currentUser, 'metrics:global');

  // Network inventory figures only go to roles that may browse inventory at all (a contractor has no property access, so gets zeros, not the network total).
  const canSeeInventory = can(currentUser, 'property:read');
  const visibleProps = canSeeInventory ? state.properties.filter(p => canBrowseProperty(currentUser, p)) : [];
  const myDeals = state.dealRooms.filter(d => isAdmin(currentUser) || isDealParticipant(currentUser, d));

  const totalUsers = global ? state.users.length : state.users.filter(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED').length;
  const verifiedBrokers = state.users.filter(u => u.role === 'BROKER' && u.verificationStatus === 'VERIFIED').length;
  const pendingVerifications = global ? state.users.filter(u => u.verificationStatus === 'PENDING').length : 0;
  const activeProperties = visibleProps.filter(p => p.listingStatus === 'active').length;
  const totalPropertyInventoryValue = visibleProps.reduce((acc, p) => acc + p.askingPrice, 0);

  // User-specific personalized inventory calculations
  let userInventoryValue = 0;
  let userPropertiesCount = 0;
  let userInventoryTitle = 'My Direct Listings Valuation';

  if (currentUser.role === 'PROPERTY_OWNER') {
    const myProps = state.properties.filter(p => p.ownerId === currentUser.id);
    userInventoryValue = myProps.reduce((acc, p) => acc + p.askingPrice, 0);
    userPropertiesCount = myProps.length;
    userInventoryTitle = 'My Property Portfolio Value';
  } else if (currentUser.role === 'BROKER') {
    const myProps = state.properties.filter(p => p.listingBrokerId === currentUser.id);
    userInventoryValue = myProps.reduce((acc, p) => acc + p.askingPrice, 0);
    userPropertiesCount = myProps.length;
    userInventoryTitle = 'My Mandated Listings Valuation';
  } else if (currentUser.role === 'DEVELOPER_BUILDER') {
    const myProjects = (state.builderProjects || []).filter(pr => pr.builderId === currentUser.id);
    userInventoryValue = myProjects.reduce((acc, pr) => acc + ((pr.availableUnits || pr.totalUnits || 0) * (pr.priceStartingFrom || 0)), 0);
    userPropertiesCount = myProjects.length;
    userInventoryTitle = 'My Projects Launch Valuation';
  } else if (currentUser.role === 'BUYER_TENANT') {
    const myReqs = state.requirements.filter(r => r.buyerId === currentUser.id);
    userInventoryValue = myReqs.reduce((acc, r) => acc + (r.budgetMax || 0), 0);
    userPropertiesCount = myReqs.length;
    userInventoryTitle = 'My Requirement Budget';
  } else if (canSeeInventory) {
    // Admin / Superadmin / Legal Counsel
    userInventoryValue = totalPropertyInventoryValue;
    userPropertiesCount = activeProperties;
    userInventoryTitle = 'Total Network Inventory';
  } else {
    // Roles without property access (e.g. contractor): no inventory figures at all.
    userInventoryTitle = 'No property access';
  }

  const activeRequirements = state.requirements.filter(r =>
    (r.status === 'active' || r.status === 'matching') &&
    (isAdmin(currentUser) || currentUser.role === 'BROKER' || r.buyerId === currentUser.id)).length;
  const activeDealRooms = myDeals.length;
  // v21: a GENZ admin sees TOTALS only (what the deals are worth, how much brokerage is agreed, how much really moved) — never one deal's own terms
  const adminTotals = isAdmin(currentUser) ? dealTotals(state) : undefined;
  const totalCommissionsEarned = adminTotals
    ? adminTotals.commissionAgreed
    : myDeals.filter(d => canSeeDealCommercials(currentUser, d, state)).reduce((acc, d) => acc + feeFor(d, currentUser.id), 0);

  const myLeads = state.constructionLeads.filter(l =>
    isAdmin(currentUser) ||
    (currentUser.role === 'BROKER' && l.referringBrokerId === currentUser.id) ||
    (currentUser.role === 'CONTRACTOR' && (l.status === 'OPEN' || l.assignedContractorId === currentUser.id)));
  const openConstructionLeads = myLeads.filter(l => l.status === 'OPEN').length;
  const totalConstructionVolume = myLeads.reduce((acc, l) => acc + l.estimatedBudget, 0);

  const myDisputes = state.disputes.filter(d => canSeeDispute(currentUser, d, state));
  const openDisputes = myDisputes.filter(d => d.status === 'OPEN' || d.status === 'UNDER_REVIEW').length;
  const mySiteVisits = state.siteVisits.filter(v =>
    isAdmin(currentUser) || v.brokerId === currentUser.id ||
    myDeals.some(d => d.id === v.dealRoomId));
  const totalSiteVisits = mySiteVisits.length;
  const verifiedSiteVisits = mySiteVisits.filter(v => v.isVerified).length;

  res.json({
    success: true,
    metrics: {
      totalUsers,
      verifiedBrokers,
      pendingVerifications,
      activeProperties,
      totalPropertyInventoryValue,
      userInventoryValue,
      userPropertiesCount,
      userInventoryTitle,
      userRole: currentUser.role,
      activeRequirements,
      activeDealRooms,
      totalCommissionsEarned,
      ...(adminTotals ? { dealTotals: adminTotals } : {}),
      openConstructionLeads,
      totalConstructionVolume,
      openDisputes,
      totalSiteVisits,
      verifiedSiteVisits,
      protectionWindowDays: daysFor(),
      referralFeeDefaultPct: state.settings.defaultConstructionCommissionPct,
      scope: global ? 'PLATFORM' : 'PERSONAL',
    },
    settings: global
      ? state.settings
      : { platformName: state.settings.platformName, poweredBy: state.settings.poweredBy, city: state.settings.city, state: state.settings.state, defaultProtectionPeriodDays: daysFor() },
  });
});

// Activity Feed Endpoint: unified activity events, scoped to what the caller is entitled to see.
/** newest first by updatedAt / verifiedAt / createdAt (ISO strings sort as dates) */
const newestFirst = (x: any, y: any) => String(y.updatedAt || y.verifiedAt || y.createdAt || '').localeCompare(String(x.updatedAt || x.verifiedAt || x.createdAt || ''));

app.get('/api/activity-feed', needs('activity:read'), (_req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const usersById = new Map<string, any>(state.users.map(u => [u.id, u]));
  const admin = isAdmin(currentUser);

  const activities: any[] = [];

  // 1. Property listings (only those visible to the caller)
  if (can(currentUser, 'property:read')) {
    // v20: only the newest few can reach the 40-item feed — don't build an entry for every listing in the network
    (state.properties || []).filter(p => canBrowseProperty(currentUser, p)).sort(newestFirst).slice(0, 60).forEach(p => {
      const listingBroker = usersById.get(p.listingBrokerId);
      activities.push({
        id: `act-prop-${p.id}`,
        type: 'PROPERTY_LISTED',
        title: 'New Property Listing Published',
        description: `"${p.title}" (${p.propertyType}) listed in ${p.locality}, ${p.city || ''} with confidential price protection.`,
        timestamp: p.createdAt || '2026-10-10T12:00:00.000Z',
        actorName: listingBroker?.name || 'Verified Member',
        actorRole: listingBroker?.role || 'BROKER',
        actorId: p.listingBrokerId || p.ownerId,
        entityId: p.id,
        targetTab: 'properties',
        metadata: {
          locality: p.locality,
          propertyTitle: p.title,
          price: p.askingPrice,
          badge: p.transactionType,
        },
      });
    });
  }

  // 2. Deal Rooms created & updated — participants + admins only
  (state.dealRooms || []).filter(d => admin || isDealParticipant(currentUser, d)).sort(newestFirst).slice(0, 60).forEach(d => {
    const introBroker = usersById.get(d.introducingBrokerId);
    const closeBroker = usersById.get(d.closingBrokerId);
    const prop = db.byId('properties', d.propertyId);
    const showCommercials = canSeeDealCommercials(currentUser, d, state);

    activities.push({
      id: `act-deal-${d.id}`,
      type: d.stage === 'Settled' ? 'DEAL_STAGE_ADVANCED' : 'DEAL_ROOM_CREATED',
      title: d.stage === 'Settled' ? (showCommercials ? `Deal Room Closed & Commission Settled` : 'Deal Room Closed') : `Deal Room Active: Stage "${d.stage}"`,
      description: `Deal ${d.id} for ${prop?.title || d.propertyId} between ${introBroker?.name || 'Introducer'} & ${closeBroker?.name || 'Closer'}.${showCommercials ? ` Expected Brokerage: ₹${feeFor(d, currentUser.id)?.toLocaleString('en-IN')}.` : ''}`,
      timestamp: d.updatedAt || d.createdAt || '2026-10-11T10:00:00.000Z',
      actorName: closeBroker?.name || introBroker?.name || 'Broker Network',
      actorRole: 'BROKER',
      actorId: d.closingBrokerId || d.introducingBrokerId,
      entityId: d.id,
      targetTab: 'deals',
      metadata: {
        stage: d.stage,
        dealId: d.id,
        propertyTitle: prop?.title,
        locality: prop?.locality,
        commissionExpected: showCommercials ? feeFor(d, currentUser.id) : undefined,
      },
    });
  });

  // 3. Site visits — the broker, deal participants, property owner and admins
  (state.siteVisits || []).filter(sv => {
    if (admin || sv.brokerId === currentUser.id) return true;
    const deal = db.byId('dealRooms', sv.dealRoomId);
    return !!deal && isDealParticipant(currentUser, deal);
  }).sort(newestFirst).slice(0, 60).forEach(sv => {
    const broker = usersById.get(sv.brokerId);
    const prop = db.byId('properties', sv.propertyId);

    if (sv.isVerified) {
      activities.push({
        id: `act-sv-ver-${sv.id}`,
        type: 'SITE_VISIT_VERIFIED',
        title: 'Physical Site Visit Completed & Verified',
        description: `Verified physical inspection conducted for ${sv.customerName} at ${prop?.title || sv.propertyId}. ${sv.verificationMethod} challenge recorded.`,
        timestamp: sv.verifiedAt || sv.createdAt || '2026-10-11T14:00:00.000Z',
        actorName: broker?.name || 'Verified Broker',
        actorRole: broker?.role || 'BROKER',
        actorId: sv.brokerId,
        entityId: sv.id,
        targetTab: 'deals',
        metadata: {
          customerName: sv.customerName,
          locality: prop?.locality,
          propertyTitle: prop?.title,
          dealId: sv.dealRoomId,
          verificationMethod: sv.verificationMethod,
        },
      });
    } else {
      activities.push({
        id: `act-sv-sch-${sv.id}`,
        type: 'SITE_VISIT_SCHEDULED',
        title: 'New Site Inspection Scheduled',
        description: `Scheduled inspection for buyer ${sv.customerName} on ${new Date(sv.scheduledTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`,
        timestamp: sv.createdAt || '2026-10-11T11:00:00.000Z',
        actorName: broker?.name || 'Broker',
        actorRole: broker?.role || 'BROKER',
        actorId: sv.brokerId,
        entityId: sv.id,
        targetTab: 'deals',
        metadata: {
          customerName: sv.customerName,
          dealId: sv.dealRoomId,
        },
      });
    }
  });

  // 4. Sales associate appointments — builder, the appointed broker, admins
  (state.associateMandates || []).filter(m => admin || m.builderId === currentUser.id || m.brokerId === currentUser.id).sort(newestFirst).slice(0, 60).forEach(m => {
    const broker = usersById.get(m.brokerId);
    const project = (state.builderProjects || []).find(p => p.id === m.projectId);
    const mine = m.brokerId === currentUser.id;
    const life: Record<string, [string, string]> = {
      APPLIED: ['Partner request received', `${broker?.name || 'A broker'} applied to sell ${project?.projectName || 'your project'}.`],
      SHORTLISTED: ['Partner shortlisted', `${mine ? 'You are' : (broker?.name || 'Broker') + ' is'} shortlisted for ${project?.projectName || 'a project'} — awaiting the builder.`],
      PAUSED: ['Partnership paused', `${mine ? 'Your' : (broker?.name || 'Broker') + '\'s'} partnership on ${project?.projectName || 'a project'} is paused${m.statusReason ? `: ${m.statusReason}` : ''}.`],
      REVOKED: ['Partnership ended', `${mine ? 'Your' : (broker?.name || 'Broker') + '\'s'} partnership on ${project?.projectName || 'a project'} was ended${m.statusReason ? `: ${m.statusReason}` : ''}.`],
      DECLINED: ['Partner request declined', `${mine ? 'Your request' : (broker?.name || 'Broker') + '\'s request'} for ${project?.projectName || 'a project'} was declined${m.statusReason ? `: ${m.statusReason}` : ''}.`],
    };
    const lf = life[m.status];
    activities.push({
      id: `act-man-${m.id}`,
      type: 'MANDATE_APPOINTED',
      title: lf ? lf[0] : 'Sales Associate Broker Appointed',
      description: lf ? lf[1] : `${broker?.name || 'Broker'} appointed as authorized sales associate for ${project?.projectName || 'Builder Project'} (${m.agreedCommissionPct}% commission).`,
      timestamp: m.assignedAt || '2026-10-10T15:00:00.000Z',
      actorName: project?.builderName || 'Builder Launchpad',
      actorRole: 'DEVELOPER_BUILDER',
      actorId: m.brokerId,
      entityId: m.id,
      targetTab: currentUser.role === 'BROKER' ? 'pcontrol' : 'pcontrol',
      metadata: {
        badge: `${m.agreedCommissionPct}% Comm`,
      },
    });
  });

  // Sort activities newest first and limit to top 40
  activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({
    success: true,
    activities: activities.slice(0, 40),
  });
});

// ==========================================
// 12. MODULE A: DEAL RESPONSIBILITIES & COMMISSION AGREEMENTS
// ==========================================

/** The platform desk that acts as default reviewer / verifier: a verified ADMIN, else the SUPERADMIN. */
function platformDesk(state = db.getState()) {
  return state.users.find(u => u.role === 'ADMIN' && u.verificationStatus === 'VERIFIED')
    || state.users.find(u => u.role === 'SUPERADMIN')!;
}

function readinessContext(state: ReturnType<typeof db.getState>, deal: { closingBrokerId?: string; introducingBrokerId?: string }) {
  const l = state.users.find(u => u.role === 'LEGAL_COUNSEL' && u.verificationStatus === 'VERIFIED');
  const c = state.users.find(u => u.id === (deal.closingBrokerId || deal.introducingBrokerId));
  return {
    legal: l ? { name: l.name, barRegistration: l.reraNumber } : undefined,
    coordinator: c ? { id: c.id, name: c.name, role: c.companyName ? `BROKER (${c.companyName})` : 'BROKER' } : undefined,
  };
}

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Loads a deal and enforces participant / admin (and optionally legal read-only) visibility. */
function loadDealFor(req: Request, user: UserProfile, opts: { allowLegal?: boolean } = {}) {
  const state = db.getState();
  const deal = db.byId('dealRooms', req.params.id);
  if (!deal || !canViewDeal(user, deal, opts)) throw new HttpError(404, 'Deal Room not found');
  // v21: chat, tasks, commission, due diligence, readiness … all go through here — a GENZ admin gets in only while a dispute is open
  const via = dealDetailVia(user, deal, state, opts);
  if (via === 'NONE') throw new HttpError(403, 'GENZ can open the inside of a deal room only while a dispute is open on it (or when GENZ is a party to the deal).', 'DEAL_SUMMARY_ONLY');
  if (via === 'DISPUTE') noteAdminDealAccess(user, deal, state);
  return { state, deal };
}

function loadTask(req: Request, user: UserProfile, opts: { allowLegal?: boolean } = {}) {
  const { state, deal } = loadDealFor(req, user, opts);
  const task = state.dealTasks.find(t => t.dealId === deal.id && t.id === req.params.taskId);
  if (!task) throw new HttpError(404, 'Deal task not found');
  return { state, deal, task };
}

// 12.1 Responsibility Matrix Tasks
app.get('/api/deals/:id/tasks', needs('task:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser, { allowLegal: true });

  let tasks = state.dealTasks.filter(t => t.dealId === deal.id);
  if (tasks.length === 0) {
    const prop = db.byId('properties', deal.propertyId);
    const introBroker = db.byId('users', deal.introducingBrokerId);
    const closeBroker = db.byId('users', deal.closingBrokerId);
    const owner = db.byId('users', deal.ownerId);
    const legal = state.users.find(u => u.role === 'LEGAL_COUNSEL' && u.verificationStatus === 'VERIFIED');
    const contractor = state.users.find(u => u.role === 'CONTRACTOR' && u.verificationStatus === 'VERIFIED');

    // v21: no GENZ desk in a broker-to-broker deal room — duties nobody else can take go to the brokers, who review each other's work
    tasks = generateDealTasks(deal.id, {
      introducingBrokerId: deal.introducingBrokerId,
      introducingBrokerName: introBroker?.name || 'Introducing Broker',
      closingBrokerId: deal.closingBrokerId,
      closingBrokerName: closeBroker?.name || 'Closing Broker',
      ownerId: deal.ownerId,
      ownerName: owner?.name || 'Property Owner',
      legalCounselId: legal?.id,
      legalCounselName: legal?.name,
      contractorId: contractor?.id,
      contractorName: contractor?.name,
      propertyType: prop?.propertyType,
    });
    state.dealTasks.push(...tasks);
    db.save();
  }

  res.json({ success: true, tasks });
});

app.post('/api/deals/:id/tasks/:taskId/accept', needs('task:manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { acceptance } = req.body || {};
  if (acceptance !== 'ACCEPTED' && acceptance !== 'REJECTED') {
    return res.status(400).json({ error: 'Acceptance must be ACCEPTED or REJECTED' });
  }
  const { task } = loadTask(req, currentUser);
  if (!isAdmin(currentUser) && task.assignedParticipantId !== currentUser.id) {
    return res.status(403).json({ error: 'Only the assigned participant or platform admin can accept/reject this duty' });
  }

  const now = new Date().toISOString();
  task.assignmentAcceptance = acceptance;
  task.acceptedAt = now;
  task.acceptedBy = currentUser.id;
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'DEAL', task.id, 'TASK_ASSIGNMENT_RESPONSE',
    `Participant ${currentUser.name} (${currentUser.role}) ${acceptance.toLowerCase()} responsibility for "${task.title}"`);
  res.json({ success: true, task });
});

/** Everyone this deal's duties can be handed to (never anyone from outside the room). */
app.get('/api/deals/:id/assignees', needs('task:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser);
  res.json({ success: true, assignees: dealAssignees(state, deal) });
});

app.post('/api/deals/:id/tasks/:taskId/assign', needs('task:manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { assignedParticipantId, reason } = req.body || {};
  const { state, deal, task } = loadTask(req, currentUser);

  // Only an existing assignee, a deal broker/owner, or an admin may reassign.
  if (!isAdmin(currentUser) && !isDealParticipant(currentUser, deal)) {
    return res.status(403).json({ error: 'Only deal participants can reassign duties' });
  }
  // an employee can hand over only what was given to him — the deal's brokers decide the rest
  if (currentUser.role === 'TEAM_MEMBER' && task.assignedParticipantId !== currentUser.id) {
    return res.status(403).json({ error: 'You can hand over only the duties assigned to you' });
  }
  const target = dealAssignees(state, deal).find(a => a.id === assignedParticipantId);
  const targetUser = target && db.byId('users', target.id);
  if (!target || !targetUser) {
    return res.status(400).json({ error: 'Assignee must be a participant of this deal, an employee allotted to it, or the empanelled legal counsel' });
  }
  const t = targetUser;

  const now = new Date().toISOString();
  task.reassignmentHistory.push({
    fromUserId: task.assignedParticipantId,
    toUserId: t.id,
    reassignedBy: currentUser.id,
    reassignedAt: now,
    reason: str(reason, 300) || 'Mutual agreement among participants',
  });
  task.assignedParticipantId = t.id;
  task.assignedParticipantName = t.name; // from the DB, never client-supplied
  task.assignedParticipantRole = t.role;
  task.responsibleParticipantId = t.id;
  task.assignmentAcceptance = 'PENDING_ACCEPTANCE';
  task.acceptedAt = undefined;
  task.acceptedBy = undefined;
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'DEAL', task.id, 'TASK_REASSIGNED',
    `Task "${task.title}" reassigned to ${t.name} (${t.role}). Reason: ${str(reason, 300) || 'N/A'}`);
  res.json({ success: true, task });
});

app.post('/api/deals/:id/tasks/:taskId/complete', needs('task:manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { completionNote, evidenceAttachments } = req.body || {};
  const { task } = loadTask(req, currentUser);

  if (!isAdmin(currentUser) && task.assignedParticipantId !== currentUser.id) {
    return res.status(403).json({ error: 'Only the assignee can mark this duty complete' });
  }
  if (task.assignmentAcceptance === 'REJECTED') {
    return res.status(409).json({ error: 'This duty was rejected by the assignee; reassign it first' });
  }

  const now = new Date().toISOString();
  task.taskStatus = 'COMPLETED';
  task.completionTimestamp = now;
  task.completionNote = str(completionNote, 1000) || 'Completed by assignee';

  if (Array.isArray(evidenceAttachments)) {
    evidenceAttachments.slice(0, 10).forEach((ev: any, idx: number) => {
      if (ev?.url && !isSafeUrl(ev.url) && !String(ev.url).startsWith('/')) return;
      task.evidenceAttachments.push({
        id: `EV-${task.id}-${Date.now()}-${idx}`,
        name: str(ev?.name, 120) || 'Evidence',
        url: ev?.url ? String(ev.url).slice(0, 500) : '', // no link → a reference note only; never an invented file
        uploadedAt: now,
        uploadedBy: currentUser.id,
      });
    });
  }

  task.verificationStatus = 'UNDER_REVIEW';
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'DEAL', task.id, 'TASK_COMPLETED',
    `Task "${task.title}" marked completed by ${currentUser.name}. Status moved to UNDER_REVIEW for independent audit.`);
  res.json({ success: true, task });
});

app.post('/api/deals/:id/tasks/:taskId/verify', needs('task:verify'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { verificationStatus, verificationNotes } = req.body || {};
  if (verificationStatus !== 'VERIFIED' && verificationStatus !== 'REJECTED') {
    return res.status(400).json({ error: 'Verification status must be VERIFIED or REJECTED' });
  }
  const { task } = loadTask(req, currentUser, { allowLegal: true });

  // Four-eyes: nobody (admins included) verifies the duty they were assigned or completed.
  if (task.assignedParticipantId === currentUser.id) {
    return res.status(403).json({ error: 'Independent verification required: You cannot verify your own assigned task' });
  }
  if (task.taskStatus !== 'COMPLETED') {
    return res.status(409).json({ error: 'Only completed tasks can be verified' });
  }

  const now = new Date().toISOString();
  task.verificationStatus = verificationStatus;
  task.verifiedBy = currentUser.id;
  task.verifiedAt = now;
  task.verificationNotes = str(verificationNotes, 1000) || `Verified by ${currentUser.name} (${currentUser.role})`;
  if (verificationStatus === 'REJECTED') task.taskStatus = 'IN_PROGRESS';
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'DEAL', task.id, 'TASK_VERIFIED',
    `Task "${task.title}" independent verification recorded as ${verificationStatus} by ${currentUser.name} (${currentUser.role})`);
  res.json({ success: true, task });
});

app.post('/api/deals/:id/tasks/:taskId/applicability', needs('task:manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { isApplicable, reason } = req.body || {};
  if (typeof isApplicable !== 'boolean') return res.status(400).json({ error: 'isApplicable must be true or false' });
  if (isApplicable === false && !str(reason)) {
    return res.status(400).json({ error: 'Mandatory justification reason required to mark task non-applicable' });
  }
  const { deal, task } = loadTask(req, currentUser);
  if (!isAdmin(currentUser) && !isDealParticipant(currentUser, deal)) {
    return res.status(403).json({ error: 'Only deal participants can change applicability' });
  }
  if (currentUser.role === 'TEAM_MEMBER') {
    return res.status(403).json({ error: 'Only the deal\'s brokers can mark a duty not applicable' });
  }

  task.isApplicable = isApplicable;
  task.notApplicableReason = isApplicable ? undefined : str(reason);
  if (!isApplicable) task.taskStatus = 'WAIVED';
  else if (task.taskStatus === 'WAIVED') task.taskStatus = 'NOT_STARTED';
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'DEAL', task.id, 'TASK_APPLICABILITY_CHANGED',
    `Task "${task.title}" applicability set to ${isApplicable}. Reason: ${str(reason) || 'N/A'}`);
  res.json({ success: true, task });
});

/** The other signer's e-mail and IP address are theirs alone: a counterparty sees who signed and when, not their contact details. */
function shapeAgreementFor(a: any, user: UserProfile) {
  if (!a || isAdmin(user)) return a;
  return {
    ...a,
    requiredApprovals: (a.requiredApprovals || []).map((ap: any) => {
      if (ap.userId === user.id || !ap.signatureAuditTrail) return ap;
      const { signerEmail: _e, ipAddress: _ip, ...rest } = ap.signatureAuditTrail;
      return { ...ap, signatureAuditTrail: rest };
    }),
  };
}

// 12.2 Versioned Commission Agreements (A2 & A3)
app.get('/api/deals/:id/commission-agreements', needs('agreement:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser); // legal counsel intentionally excluded
  if (!canSeeDealCommercials(currentUser, deal, state)) {
    return res.status(403).json({ error: 'Commission terms are confidential between the deal brokers.' });
  }
  res.json({ success: true, agreements: state.commissionAgreements.filter(a => a.dealId === deal.id).map(a => shapeAgreementFor(a, currentUser)) });
});

app.post('/api/deals/:id/commission-agreements/propose', needs('agreement:propose'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser);
  if (!isDealBroker(currentUser, deal)) {
    return res.status(403).json({ error: 'Only the deal brokers can propose commission terms' });
  }
  if (isOwnSide(deal)) {
    return res.status(409).json({ error: 'This deal room is "apna-apna side": there is no shared brokerage to put in an agreement. Use the Own side panel instead.', code: 'OWN_SIDE_DEAL' });
  }

  const b = req.body || {};
  const total = Number(b.totalAgreedBrokerage);
  if (!Number.isFinite(total) || total <= 0 || total > 5_000_000_000) {
    return res.status(400).json({ error: 'Valid total brokerage amount is required' });
  }
  if (!Array.isArray(b.allocations) || b.allocations.length === 0 || b.allocations.length > 6) {
    return res.status(400).json({ error: 'Between 1 and 6 participant allocations are required' });
  }
  // v21: what the deal is worth (the price the property sells for) — GENZ sees it as a total, never the brokerage terms
  const dealValue = b.dealValue === undefined || b.dealValue === null || b.dealValue === '' ? undefined : Number(b.dealValue);
  if (dealValue !== undefined && (!Number.isFinite(dealValue) || dealValue <= 0 || dealValue > 100_000_000_000)) {
    return res.status(400).json({ error: 'Deal value must be a positive amount' });
  }

  const seen = new Set<string>();
  let totalPct = 0;
  const resolved: { user: UserProfile; pct: number; a: any }[] = [];
  for (const a of b.allocations) {
    const pct = Number(a?.allocationPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return res.status(400).json({ error: 'Each allocation percentage must be between 0 and 100' });
    const u = db.byId('users', a?.participantId);
    if (!u || !isDealBroker(u, deal)) {
      return res.status(400).json({ error: 'Allocations can only be made to the brokers of this deal' });
    }
    if (seen.has(u.id)) return res.status(400).json({ error: `Duplicate participant ${u.name} in allocation list` });
    seen.add(u.id);
    totalPct += pct;
    resolved.push({ user: u, pct, a });
  }
  if (Math.abs(totalPct - 100) > 0.001) {
    return res.status(400).json({ error: `Allocations must total exactly 100% (currently ${totalPct}%)` });
  }
  if (!seen.has(currentUser.id)) {
    return res.status(400).json({ error: 'The proposer must be part of the allocation' });
  }

  let triggers = b.paymentTriggers;
  if (Array.isArray(triggers) && triggers.length > 0) {
    const tp = triggers.reduce((s: number, t: any) => s + (Number(t?.percentage) || 0), 0);
    if (Math.abs(tp - 100) > 0.001) return res.status(400).json({ error: `Payment triggers must total 100% (currently ${tp}%)` });
    triggers = triggers.slice(0, 8).map((t: any, i: number) => ({
      triggerId: `TRIG-${i + 1}`,
      milestoneName: str(t.milestoneName, 80) || `Milestone ${i + 1}`,
      stage: str(t.stage, 40) || 'Agreement',
      percentage: Number(t.percentage),
      amount: Math.round((total * Number(t.percentage)) / 100),
      isMet: false,
    }));
  } else {
    triggers = [
      { triggerId: 'TRIG-1', milestoneName: 'Token Execution', stage: 'Agreement', percentage: 20, amount: Math.round(total * 0.2), isMet: false },
      { triggerId: 'TRIG-2', milestoneName: 'Title Clearance', stage: 'Negotiation', percentage: 30, amount: Math.round(total * 0.3), isMet: false },
      { triggerId: 'TRIG-3', milestoneName: 'Sub-Registrar Registry', stage: 'Handover', percentage: 50, amount: Math.round(total * 0.5), isMet: false },
    ];
  }

  const existing = state.commissionAgreements.filter(a => a.dealId === deal.id);
  if (existing.some(a => a.status === 'SENT_TO_PARTICIPANTS')) {
    return res.status(409).json({ error: 'A proposal is already awaiting signatures; it must be signed or withdrawn first' });
  }
  const nextVersion = existing.length + 1;
  const prevAgreement = existing[existing.length - 1];
  const now = new Date().toISOString();
  const agreementId = `AGR-${deal.id}-V${nextVersion}`;

  const requiredApprovals = resolved.map(({ user }) => {
    const isProposer = user.id === currentUser.id;
    return {
      userId: user.id,
      userName: user.name,
      role: user.role,
      hasAccepted: isProposer,
      acceptedAt: isProposer ? now : undefined,
      signatureAuditTrail: isProposer
        ? {
            signerName: currentUser.name,
            signerEmail: currentUser.email,
            ipAddress: req.ip || 'n/a',
            authMethod: 'COMPLIANT_E_SIGN_PKEY' as const,
            timestamp: now,
            cryptoHash: sha256(`${currentUser.id}:${agreementId}:${now}:PROPOSAL_SIGNATURE`),
          }
        : undefined,
    };
  });
  const allAlreadyAccepted = requiredApprovals.every(ap => ap.hasAccepted);

  const allocations = resolved.map(({ user, pct, a }) => ({
    participantId: user.id,
    participantName: user.name,
    role: user.role,
    allocationPct: pct,
    allocationAmount: Math.round((total * pct) / 100),
    basisDescription: str(a.basisDescription, 200) || `${pct}% agreed allocation`,
    entitlementStatus: 'AGREED' as const,
    paidAmount: 0,
    disputedAmount: 0,
    // 0% is a valid rate (e.g. below the TDS threshold); only a missing value falls back to the platform default.
    taxDeductionTdsPct: (() => {
      const raw = a.taxDeductionTdsPct;
      const n = raw === undefined || raw === null || raw === '' ? NaN : Number(raw);
      return Math.min(30, Math.max(0, Number.isFinite(n) ? n : DEFAULT_TDS_PCT));
    })(),
    invoiceRequired: Boolean(a.invoiceRequired ?? true),
  }));

  const newAgreement: any = {
    id: agreementId,
    dealId: deal.id,
    version: nextVersion,
    status: allAlreadyAccepted ? 'ACTIVE' : 'SENT_TO_PARTICIPANTS',
    totalAgreedBrokerage: total,
    ...(dealValue ? { dealValue } : {}),
    payer: ['BUYER', 'SELLER', 'SPLIT_EQUAL', 'OWNER', 'BUILDER'].includes(b.payer) ? b.payer : 'SPLIT_EQUAL',
    contractualBasis: str(b.contractualBasis, 300) || 'Exclusive Broker Mandate & RERA Registered Terms',
    calculationBasis: str(b.calculationBasis, 80) || 'PERCENTAGE_OF_TOTAL_DEAL_VALUE',
    allocations,
    paymentTriggers: triggers,
    applicableTaxes: {
      gstPct: Math.min(28, Math.max(0, Number(b.applicableTaxes?.gstPct ?? 18))),
      tdsPct: Math.min(30, Math.max(0, Number(b.applicableTaxes?.tdsPct ?? 5))),
      invoiceMandatory: b.applicableTaxes?.invoiceMandatory !== false,
    },
    cancellationClause: str(b.cancellationClause, 600) || 'Cancellation and refund terms are as agreed in writing between the parties. GENZ does not hold, refund or move any money.',
    disputeProcess: str(b.disputeProcess, 600) || 'A dispute on the platform is first reviewed by a GENZ admin under the platform rules. This does not replace any legal remedy available to the parties.',
    proposedBy: currentUser.id,
    proposedByName: currentUser.name,
    proposalReason: str(b.proposalReason, 400) || (nextVersion === 1 ? 'Initial commission terms' : 'Amended commission split'),
    previousVersionId: prevAgreement ? prevAgreement.id : undefined,
    requiredApprovals,
    cryptoSealHash: sha256(`${agreementId}:${total}:${totalPct}:${now}`),
    createdAt: now,
    updatedAt: now,
  };

  // An ACTIVE predecessor stays in force until the new version is fully signed.
  if (allAlreadyAccepted) activateAgreement(state, deal, newAgreement, prevAgreement);
  state.commissionAgreements.push(newAgreement);
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'COMMISSION', newAgreement.id,
    nextVersion === 1 ? 'COMMISSION_AGREEMENT_INITIALIZED' : 'COMMISSION_AGREEMENT_AMENDED',
    `Commission terms version ${nextVersion} proposed for deal ${deal.id} totaling ₹${total.toLocaleString('en-IN')}. Reason: ${newAgreement.proposalReason}`);
  res.json({ success: true, agreement: shapeAgreementFor(newAgreement, currentUser) });
});

/** Promote a fully-signed version: supersede the previous ACTIVE one and sync the deal-room summary. */
function activateAgreement(state: ReturnType<typeof db.getState>, deal: any, agreement: any, prev?: any) {
  state.commissionAgreements
    .filter(a => a.dealId === deal.id && a.id !== agreement.id && a.status === 'ACTIVE')
    .forEach(a => { a.status = 'AMENDED'; });
  if (prev && prev.status === 'ACTIVE') prev.status = 'AMENDED';
  agreement.status = 'ACTIVE';
  deal.totalCommissionExpected = agreement.totalAgreedBrokerage;
  if (agreement.dealValue) deal.dealValue = agreement.dealValue;
  const intro = agreement.allocations.find((a: any) => a.participantId === deal.introducingBrokerId);
  const close = agreement.allocations.find((a: any) => a.participantId === deal.closingBrokerId);
  if (intro) deal.introducingBrokerSharePct = intro.allocationPct;
  if (close) deal.closingBrokerSharePct = close.allocationPct;
}

app.post('/api/deals/:id/commission-agreements/:agreementId/approve', needs('agreement:sign'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser);
  const { signerNotes } = req.body || {};
  if (!isDealBroker(currentUser, deal)) return res.status(403).json({ error: 'Only the deal brokers can sign commission terms' });
  const agreement = state.commissionAgreements.find(a => a.dealId === deal.id && a.id === req.params.agreementId);
  if (!agreement) return res.status(404).json({ error: 'Commission agreement not found' });
  if (agreement.status !== 'SENT_TO_PARTICIPANTS') {
    return res.status(409).json({ error: 'This agreement is not open for signature' });
  }

  const approval = agreement.requiredApprovals.find(ap => ap.userId === currentUser.id);
  if (!approval) return res.status(403).json({ error: 'You are not listed as a required signer for this commission agreement' });
  if (approval.hasAccepted) return res.status(409).json({ error: 'You have already signed this agreement' });

  const now = new Date().toISOString();
  approval.hasAccepted = true;
  approval.acceptedAt = now;
  approval.signatureAuditTrail = {
    signerName: currentUser.name,
    signerEmail: currentUser.email,
    ipAddress: req.ip || 'n/a',
    authMethod: 'COMPLIANT_E_SIGN_PKEY' as const, // the platform's own approval record; an Aadhaar e-Sign / DSC claim from the client is never taken on trust
    timestamp: now,
    cryptoHash: sha256(`${currentUser.id}:${agreement.id}:${now}:${str(signerNotes, 200) || 'MUTUAL_ACCEPTANCE'}`),
  };

  const allAccepted = agreement.requiredApprovals.every(ap => ap.hasAccepted);
  if (allAccepted) {
    activateAgreement(state, deal, agreement);
    agreement.cryptoSealHash = sha256(`${agreement.id}:${agreement.totalAgreedBrokerage}:ALL_PARTICIPANTS_SIGNED:${now}`);
  }
  agreement.updatedAt = now;
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'COMMISSION', agreement.id, 'AGREEMENT_ESIGNED',
    `Digital approval recorded for ${currentUser.name} (${currentUser.role}) on version ${agreement.version}. Fully Active: ${allAccepted}`);
  res.json({ success: true, agreement: shapeAgreementFor(agreement, currentUser) });
});

/**
 * v21 — commission payments are written down by the BROKERS, never by GENZ (GENZ does not touch or record the money):
 *   1. one deal broker records "₹X paid / received, ref UTR…" → the entry is PENDING,
 *   2. the OTHER deal broker confirms it (or rejects it with a reason) → only a CONFIRMED entry counts towards `paidAmount`,
 *   3. if they disagree, either broker raises a dispute — that opens the room to the GENZ admin, who decides.
 * (A deal with a single broker on both sides confirms its own entries.)
 */
const PAYMENT_REF_RE = /^[A-Za-z0-9][A-Za-z0-9 \-\/_.,#:]{3,59}$/;
function pendingAmount(alloc: any) {
  return (alloc.payments || []).filter((p: any) => p.status === 'PENDING').reduce((a: number, p: any) => a + p.amount, 0);
}
/** v23: GENZ's fee (if an admin set one) on a broker's confirmed commission receipt — charged to the broker who received it */
function chargeDealFee(deal: DealRoom, agreement: { id: string }, alloc: any, entry: any) {
  const payee = db.byId('users', alloc.participantId); if (!payee || payee.role !== 'BROKER') return;
  const prop = db.byId('properties', deal.propertyId);
  chargeEvent({ event: 'BROKER_DEAL', payerId: payee.id, base: entry.amount, refId: `${agreement.id}/${entry.id}`, refLabel: `Deal ${deal.id} · payment ${entry.id}`, dealId: deal.id, state: prop?.state || undefined });
}
function applyConfirmedPayment(alloc: any, amount: number) {
  alloc.paidAmount = (alloc.paidAmount || 0) + amount;
  alloc.entitlementStatus = alloc.paidAmount >= alloc.allocationAmount ? 'PAID' : 'EARNED';
  alloc.disputedAmount = Math.min(alloc.disputedAmount || 0, Math.max(0, alloc.allocationAmount - alloc.paidAmount));
}
/** the common checks of the three payment routes: only the deal's own brokers, only the ACTIVE agreement, nothing while a dispute freezes it */
function loadPaymentContext(req: Request, res: Response, user: UserProfile) {
  const { state, deal } = loadDealFor(req, user);
  if (!isDealBroker(user, deal)) { res.status(403).json({ error: isAdmin(user) ? 'GENZ does not record or confirm commission payments — the two deal brokers do that between themselves.' : 'Only the two deal brokers can handle commission payments.' }); return null; }
  const agreement = state.commissionAgreements.find(a => a.dealId === deal.id && a.id === req.params.agreementId);
  if (!agreement) { res.status(404).json({ error: 'Commission agreement not found' }); return null; }
  return { state, deal, agreement };
}

app.post('/api/deals/:id/commission-agreements/:agreementId/settle-payment', (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { participantId, paidDelta, isDisputed, disputeNotes, ref, paidOn, note } = req.body || {};
  const ctx0 = loadPaymentContext(req, res, currentUser); if (!ctx0) return;
  const { state, deal, agreement } = ctx0;
  if (agreement.status !== 'ACTIVE') return res.status(409).json({ error: 'Payments can only be recorded on the ACTIVE agreement' });

  const alloc = agreement.allocations.find(a => a.participantId === participantId);
  if (!alloc) return res.status(404).json({ error: 'Allocated participant not found' });
  const now = new Date().toISOString();

  const delta = paidDelta === undefined || paidDelta === null || paidDelta === '' ? 0 : Number(paidDelta);
  if (delta) {
    if (openDisputeOf(state, deal.id) || deal.settlementStatus === 'DISPUTED') {
      return res.status(409).json({ error: 'Commission payments are frozen while a dispute is open on this deal room — the GENZ admin decides in the dispute.' });
    }
    const outstanding = alloc.allocationAmount - (alloc.paidAmount || 0) - pendingAmount(alloc);
    if (!Number.isFinite(delta) || delta <= 0 || delta > outstanding) {
      return res.status(400).json({ error: `Payment must be between ₹1 and the outstanding ₹${Math.max(0, outstanding).toLocaleString('en-IN')}` });
    }
    const refText = str(ref, 60);
    if (!PAYMENT_REF_RE.test(refText)) return res.status(400).json({ error: 'Write the bank reference (UTR / cheque no. / transaction id), 4–60 characters' });
    const day = str(paidOn, 10);
    const dayMs = Date.parse(`${day}T00:00:00+05:30`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(dayMs) || dayMs > Date.now() + 86_400_000 || dayMs < Date.now() - 2 * 365 * 86_400_000) {
      return res.status(400).json({ error: 'Payment date must be a real date (YYYY-MM-DD) within the last two years, not in the future' });
    }
    if (agreement.allocations.some(a => (a.payments || []).some((p: any) => p.status !== 'REJECTED' && p.ref.toLowerCase() === refText.toLowerCase() && p.amount === delta))) {
      return res.status(409).json({ error: 'A payment with this reference and amount is already written down' });
    }
    const solo = deal.introducingBrokerId === deal.closingBrokerId;
    const entry: any = {
      id: `PAY-${Math.max(0, ...agreement.allocations.flatMap(a => (a.payments || []).map((p: any) => Number(/PAY-(\d+)/.exec(p.id)?.[1] ?? 0)))) + 1}`,
      amount: delta, ref: refText, paidOn: day, note: str(note, 300) || undefined,
      recordedById: currentUser.id, recordedByName: currentUser.name, recordedAt: now,
      status: solo ? 'CONFIRMED' : 'PENDING',
      ...(solo ? { confirmedById: currentUser.id, confirmedByName: currentUser.name, confirmedAt: now } : {}),
    };
    (alloc as any).payments = [...((alloc as any).payments || []), entry];
    if (solo) { applyConfirmedPayment(alloc, delta); chargeDealFee(deal, agreement, alloc, entry); }
    agreement.updatedAt = now;
    db.save();
    db.appendAuditEvent(currentUser.id, currentUser.role, 'COMMISSION', agreement.id, 'COMMISSION_PAYMENT_RECORDED',
      `${currentUser.name} wrote down a payment of ₹${delta.toLocaleString('en-IN')} for ${alloc.participantName} (ref ${refText}, paid on ${day}). ${solo ? 'Confirmed (single-broker deal).' : 'Waiting for the other broker to confirm.'}`);
  }

  if (isDisputed === true) {
    if (!isDealBroker(currentUser, deal)) {
      return res.status(403).json({ error: 'Only a deal broker can raise a commission dispute' });
    }
    const text = str(disputeNotes, 500);
    if (text.length < 15) return res.status(400).json({ error: 'Describe the problem in at least 15 characters — the GENZ admin reads this when the dispute opens the deal room' });
    const other = db.byId('users', deal.introducingBrokerId === currentUser.id ? deal.closingBrokerId : deal.introducingBrokerId);
    alloc.entitlementStatus = 'DISPUTED';
    alloc.disputedAmount = alloc.allocationAmount - (alloc.paidAmount || 0);
    (alloc as any).disputeNotes = text;
    // a commission dispute is a real dispute: it freezes the settlement and opens the room to GENZ until the admin resolves it
    if (other && other.id !== currentUser.id && !openDisputeOf(state, deal.id)) {
      fileDispute(state, currentUser, { dealRoomId: deal.id, counterparty: other, reason: 'COMMISSION_NON_PAYMENT', description: `Commission dispute on ${alloc.participantName}'s share: ${text}` }, deal);
    }
    agreement.updatedAt = now;
    db.save();
    db.appendAuditEvent(currentUser.id, currentUser.role, 'COMMISSION', agreement.id, 'COMMISSION_PAYMENT_DISPUTED', `Commission share of ${alloc.participantName} marked DISPUTED by ${currentUser.name}.`);
  }

  res.json({ success: true, agreement: shapeAgreementFor(agreement, currentUser) });
});

// the OTHER broker answers a payment entry: confirm (it now counts) or reject (with a reason)
for (const decision of ['confirm', 'reject'] as const) {
  app.post(`/api/deals/:id/commission-agreements/:agreementId/payments/:paymentId/${decision}`, (req: Request, res: Response) => {
    const currentUser = getCurrentUser();
    const c = loadPaymentContext(req, res, currentUser); if (!c) return;
    const { state, deal, agreement } = c;
    if (openDisputeOf(state, deal.id) || deal.settlementStatus === 'DISPUTED') {
      return res.status(409).json({ error: 'Commission payments are frozen while a dispute is open on this deal room — the GENZ admin decides in the dispute.' });
    }
    let alloc: any; let entry: any;
    for (const a of agreement.allocations) { const p = ((a as any).payments || []).find((x: any) => x.id === req.params.paymentId); if (p) { alloc = a; entry = p; break; } }
    if (!entry) return res.status(404).json({ error: 'Payment entry not found' });
    if (entry.status !== 'PENDING') return res.status(409).json({ error: `This payment is already ${entry.status.toLowerCase()}` });
    if (entry.recordedById === currentUser.id && deal.introducingBrokerId !== deal.closingBrokerId) {
      return res.status(403).json({ error: 'The other broker has to answer this entry — you wrote it down yourself.' });
    }
    const now = new Date().toISOString();
    if (decision === 'confirm') {
      entry.status = 'CONFIRMED'; applyConfirmedPayment(alloc, entry.amount); chargeDealFee(deal, agreement, alloc, entry);
    } else {
      const why = str(req.body?.note, 300);
      if (why.length < 5) return res.status(400).json({ error: 'Write why you reject it (at least 5 characters)' });
      entry.status = 'REJECTED'; entry.rejectNote = why;
    }
    entry.confirmedById = currentUser.id; entry.confirmedByName = currentUser.name; entry.confirmedAt = now;
    agreement.updatedAt = now;
    db.save();
    db.appendAuditEvent(currentUser.id, currentUser.role, 'COMMISSION', agreement.id, decision === 'confirm' ? 'COMMISSION_PAYMENT_CONFIRMED' : 'COMMISSION_PAYMENT_REJECTED',
      `${currentUser.name} ${decision === 'confirm' ? 'confirmed' : 'rejected'} payment ${entry.id} of ₹${entry.amount.toLocaleString('en-IN')} for ${alloc.participantName} (ref ${entry.ref}). Paid so far: ₹${(alloc.paidAmount || 0).toLocaleString('en-IN')}, status ${alloc.entitlementStatus}.`);
    res.json({ success: true, agreement: shapeAgreementFor(agreement, currentUser) });
  });
}

// 12.3 Due Diligence Engine Endpoints (Module B)
const DD_STATUSES = ['NOT_STARTED', 'PENDING_DOCUMENT', 'UNDER_REVIEW', 'VERIFIED', 'ISSUE_FOUND', 'REJECTED', 'NOT_APPLICABLE'];
const DD_SEVERITIES = ['INFORMATIONAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function loadPropertyWorkspace(user: UserProfile, propertyId: string) {
  const state = db.getState();
  const property = db.byId('properties', propertyId);
  if (!property || !canAccessPropertyWorkspace(state, user, property)) throw new HttpError(404, 'Property not found');
  return { state, property };
}

function loadDdItem(user: UserProfile, itemId: string) {
  const state = db.getState();
  const item = state.dueDiligenceItems.find(i => i.id === itemId);
  if (!item) throw new HttpError(404, 'Due diligence item not found');
  const property = db.byId('properties', item.propertyId);
  if (!property || !canAccessPropertyWorkspace(state, user, property)) throw new HttpError(404, 'Due diligence item not found');
  return { state, item, property };
}

/** Evidence marked confidential is only listed to the uploader, the property principals, admins/legal and explicitly shared brokers. */
function filterItemForUser(item: any, user: UserProfile, property: any, state = db.getState()) {
  const privileged = isAdmin(user) || user.role === 'LEGAL_COUNSEL' || isPropertyPrincipal(user, property);
  const evidenceReferences = (item.evidenceReferences || []).filter((ev: any) => {
    if (privileged || ev.uploadedBy === user.id) return true;
    const scope = ev.accessScope || 'ALL_VERIFIED_BROKERS';
    if (scope === 'OWNER_AND_ADMIN_ONLY') return false;
    if (scope === 'CUSTOM_BROKERS') return (ev.sharedBrokerIds || []).includes(user.id);
    if (scope === 'DEAL_PARTICIPANTS_ONLY') return state.dealRooms.some(d => d.propertyId === property.id && isDealParticipant(user, d));
    return !ev.isConfidential;
  });
  return { ...item, evidenceReferences };
}

app.get('/api/due-diligence/property/:propertyId', needs('dd:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, property } = loadPropertyWorkspace(currentUser, req.params.propertyId);

  let items = state.dueDiligenceItems.filter(i => i.propertyId === property.id);
  if (items.length === 0) {
    const legal = state.users.find(u => u.role === 'LEGAL_COUNSEL' && u.verificationStatus === 'VERIFIED');
    const desk = platformDesk(state);
    items = generateDueDiligenceItems(property.id, property.propertyType, {
      verifierId: legal?.id || desk.id,
      verifierRole: legal ? 'LEGAL_COUNSEL' : 'ADMIN',
    });
    state.dueDiligenceItems.push(...items);
    db.save();
  }

  const issues = state.dueDiligenceIssues.filter(iss => iss.propertyId === property.id);
  res.json({
    success: true,
    items: items.map(i => filterItemForUser(i, currentUser, property, state)),
    issues,
    property: sanitizeProperty(property, currentUser, state),
  });
});

app.post('/api/due-diligence/items/:itemId/evidence', needs('dd:upload'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const b = req.body || {};
  const fileName = str(b.fileName, 160);
  if (!fileName) return res.status(400).json({ error: 'Document filename is required' });
  if (b.fileUrl && !isSafeUrl(b.fileUrl) && !String(b.fileUrl).startsWith('/vault/')) {
    return res.status(400).json({ error: 'fileUrl must be an https URL' });
  }
  const { state, item, property } = loadDdItem(currentUser, req.params.itemId);

  const scopes = ['ALL_VERIFIED_BROKERS', 'DEAL_PARTICIPANTS_ONLY', 'OWNER_AND_ADMIN_ONLY', 'CUSTOM_BROKERS'];
  const now = new Date().toISOString();
  // A paper that was really uploaded to the Property Papers library: link it (the file, size, type and fingerprint come from the stored copy).
  const libDoc = typeof b.libraryDocId === 'string' ? state.propertyDocs.find(d => d.id === b.libraryDocId) : undefined;
  if (b.libraryDocId && (!libDoc || libDoc.propertyId !== property.id || docAccess(state, currentUser, libDoc).level !== 'MANAGE')) {
    return res.status(404).json({ error: 'That uploaded paper was not found for this property.' });
  }
  // Only a real fingerprint of the file's bytes (computed in the browser) is stored. GENZ does not keep the file itself.
  const checksumSha256 = libDoc ? libDoc.sha256 : typeof b.contentSha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(b.contentSha256) ? b.contentSha256.toLowerCase() : undefined;

  const newEv: any = {
    id: `EV-${item.id}-${Date.now()}`,
    fileName,
    fileUrl: libDoc ? `/api/property-docs/${libDoc.id}/file` : b.fileUrl ? String(b.fileUrl).slice(0, 500) : '',
    libraryDocId: libDoc?.id,
    uploadedBy: currentUser.id,
    uploadedAt: now,
    documentType: str(b.documentType, 60) || 'TITLE_DOCUMENT',
    documentNumber: str(b.documentNumber, 60) || undefined,
    issuer: str(b.issuer, 120) || undefined,
    issueDate: str(b.issueDate, 20) || now.split('T')[0],
    secureStorageRef: `record://properties/${item.propertyId}/${item.id}/${encodeURIComponent(fileName)}`,
    fileSizeBytes: libDoc ? libDoc.size : Math.min(50_000_000, Number(b.fileSizeBytes) || 0) || undefined,
    mimeType: libDoc ? libDoc.mime : str(b.mimeType, 80) || undefined,
    checksumSha256,
    isConfidential: b.isConfidential === true,
    accessScope: scopes.includes(b.accessScope) ? b.accessScope : 'ALL_VERIFIED_BROKERS',
    sharedBrokerIds: Array.isArray(b.sharedBrokerIds) ? b.sharedBrokerIds.filter((x: unknown) => typeof x === 'string').slice(0, 20) : [],
    notes: str(b.notes, 500) || undefined,
  };

  item.evidenceReferences.push(newEv);
  if (libDoc) {
    // the stored copy follows the sharing the uploader chose for this evidence (least privilege: only the people they named)
    libDoc.ddItemId = item.id;
    libDoc.visibility = newEv.accessScope === 'DEAL_PARTICIPANTS_ONLY' ? 'DEAL_PARTICIPANTS' : newEv.accessScope === 'ALL_VERIFIED_BROKERS' && !newEv.isConfidential ? 'VERIFIED_BROKERS' : 'PRIVATE';
    if (newEv.accessScope === 'CUSTOM_BROKERS') {
      for (const uid of newEv.sharedBrokerIds) {
        const t = state.users.find(x => x.id === uid && x.verificationStatus === 'VERIFIED' && can(x, 'propdoc:use'));
        if (t && !libDoc.shares.some(sh => sh.userId === uid && !sh.revoked)) libDoc.shares.push({ userId: uid, grantedBy: currentUser.id, grantedAt: now });
      }
    }
    libDoc.updatedAt = now;
  }
  item.approvalStage = 'DOCUMENT_UPLOADED';
  if (item.status === 'NOT_STARTED' || item.status === 'PENDING_DOCUMENT') item.status = 'UNDER_REVIEW';
  item.auditHistory.push({
    action: 'EVIDENCE_ATTACHED',
    performedBy: currentUser.id,
    timestamp: now,
    details: `Paperwork recorded: ${fileName} (${newEv.documentType}, No: ${newEv.documentNumber || 'not given'}, Scope: ${newEv.accessScope})`,
  });
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'VERIFICATION', item.id, 'DD_EVIDENCE_UPLOADED',
    `Paperwork record "${fileName}" (${newEv.documentType}) added for property ${property.id}${checksumSha256 ? `; file SHA-256 ${checksumSha256.slice(0, 16)}...` : '; no file fingerprint'}`);
  res.json({ success: true, item: filterItemForUser(item, currentUser, property), evidence: newEv });
});

app.post('/api/due-diligence/items/:itemId/gate', needs('dd:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { stage, verificationMethod, notes } = req.body || {};
  const validStages = ['DOCUMENT_UPLOADED', 'BROKER_CHECKED', 'AUTHENTICITY_VERIFIED', 'LEGAL_REVIEW_COMPLETED', 'ISSUE_RESOLVED', 'READINESS_APPROVED'];
  if (!validStages.includes(stage)) return res.status(400).json({ error: 'Invalid approval gate stage' });

  const { item, property } = loadDdItem(currentUser, req.params.itemId);

  // Every gate has its own authority — a file upload or a broker's tick never equals legal clearance.
  const gatePerm: Record<string, any> = {
    DOCUMENT_UPLOADED: 'dd:upload',
    BROKER_CHECKED: 'dd:verify_broker',
    AUTHENTICITY_VERIFIED: 'dd:verify_authenticity',
    LEGAL_REVIEW_COMPLETED: 'dd:legal_signoff',
    ISSUE_RESOLVED: 'dd:issue_manage',
    READINESS_APPROVED: 'dd:readiness_approve',
  };
  if (!can(currentUser, gatePerm[stage])) {
    return res.status(403).json({ error: `Your role is not authorised to advance this item to ${stage}.` });
  }
  if (stage === 'LEGAL_REVIEW_COMPLETED' && currentUser.role !== 'LEGAL_COUNSEL' && currentUser.role !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Formal legal review signoff requires empanelled legal counsel or Superadmin.' });
  }
  if (stage === 'AUTHENTICITY_VERIFIED' && item.evidenceReferences.some((e: any) => e.uploadedBy === currentUser.id)) {
    return res.status(403).json({ error: 'Authenticity must be verified by someone other than the uploader.' });
  }
  if ((stage === 'AUTHENTICITY_VERIFIED' || stage === 'LEGAL_REVIEW_COMPLETED' || stage === 'READINESS_APPROVED') && item.evidenceReferences.length === 0) {
    return res.status(409).json({ error: 'No evidence has been uploaded for this check yet.' });
  }

  const now = new Date().toISOString();
  item.approvalStage = stage;
  if (verificationMethod) item.verificationMethod = str(verificationMethod, 80) as any;
  item.reviewerId = currentUser.id;
  item.reviewerName = currentUser.name;
  item.reviewerRole = currentUser.role;
  item.reviewTimestamp = now;
  if (stage === 'AUTHENTICITY_VERIFIED' || stage === 'LEGAL_REVIEW_COMPLETED' || stage === 'READINESS_APPROVED') {
    item.status = 'VERIFIED';
    item.verificationResult = str(notes, 500) || `Verified at gate ${stage}`;
  }
  item.auditHistory.push({
    action: `GATE_ADVANCED_${stage}`,
    performedBy: currentUser.id,
    timestamp: now,
    details: `Approval stage advanced to ${stage} by ${currentUser.name} (${currentUser.role}). Notes: ${str(notes, 500) || 'N/A'}`,
  });
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'VERIFICATION', item.id, 'DD_APPROVAL_GATE_ADVANCED',
    `Due diligence check "${item.title}" advanced to gate stage ${stage} by ${currentUser.name} (${currentUser.role})`);
  res.json({ success: true, item: filterItemForUser(item, currentUser, property) });
});

app.post('/api/due-diligence/items/:itemId/status', (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { status, mismatchSeverity, reason } = req.body || {};
  if (!DD_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  if (mismatchSeverity && !DD_SEVERITIES.includes(mismatchSeverity)) return res.status(400).json({ error: 'Invalid severity' });

  const { item, property } = loadDdItem(currentUser, req.params.itemId);
  // Only a reviewer-class permission may set the item to a verdict status.
  const needsPerm = status === 'VERIFIED' ? 'dd:verify_authenticity' : status === 'REJECTED' || status === 'ISSUE_FOUND' ? 'dd:issue_manage' : 'dd:upload';
  if (!can(currentUser, needsPerm as any)) return res.status(403).json({ error: 'Your role may not set this status' });
  if (status === 'VERIFIED' && item.evidenceReferences.length === 0) return res.status(409).json({ error: 'No evidence uploaded' });

  item.status = status;
  if (mismatchSeverity) item.mismatchSeverity = mismatchSeverity;
  item.auditHistory.push({
    action: 'STATUS_UPDATED',
    performedBy: currentUser.id,
    timestamp: new Date().toISOString(),
    details: `Status updated to ${status}. Severity: ${mismatchSeverity || 'N/A'}. Reason: ${str(reason, 300) || 'N/A'}`,
  });
  db.save();
  res.json({ success: true, item: filterItemForUser(item, currentUser, property) });
});

app.post('/api/due-diligence/items/:itemId/applicability', needs('dd:issue_manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { isApplicable, reason } = req.body || {};
  if (typeof isApplicable !== 'boolean') return res.status(400).json({ error: 'isApplicable must be true or false' });
  if (isApplicable === false && !str(reason)) {
    return res.status(400).json({ error: 'Explicit audit reason required to mark due diligence item non-applicable' });
  }
  const { item, property } = loadDdItem(currentUser, req.params.itemId);

  item.isApplicable = isApplicable;
  item.notApplicableReason = isApplicable ? undefined : str(reason);
  item.status = isApplicable ? 'NOT_STARTED' : 'NOT_APPLICABLE';
  item.auditHistory.push({
    action: 'APPLICABILITY_CHANGED',
    performedBy: currentUser.id,
    timestamp: new Date().toISOString(),
    details: `Applicability changed to ${isApplicable}. Reason: ${str(reason) || 'N/A'}`,
  });
  db.save();
  res.json({ success: true, item: filterItemForUser(item, currentUser, property) });
});

app.post('/api/due-diligence/items/:itemId/comment', needs('dd:read'), rateLimit('ddcomment', 60, 60_000), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const text = str((req.body || {}).text, 1500);
  if (!text) return res.status(400).json({ error: 'Comment text cannot be empty' });
  const { item, property } = loadDdItem(currentUser, req.params.itemId);

  item.comments.push({ id: `CMT-${Date.now()}`, authorId: currentUser.id, authorName: currentUser.name, text, createdAt: new Date().toISOString() });
  db.save();
  res.json({ success: true, item: filterItemForUser(item, currentUser, property) });
});

// 12.4 Issue Register Endpoints (Module B5)
app.get('/api/due-diligence/issues', needs('dd:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const state = db.getState();
  const propertyId = typeof req.query.propertyId === 'string' ? req.query.propertyId : undefined;
  const dealId = typeof req.query.dealId === 'string' ? req.query.dealId : undefined;

  const visible = (iss: any) => {
    const prop = db.byId('properties', iss.propertyId);
    return !!prop && canAccessPropertyWorkspace(state, currentUser, prop);
  };
  let issues = state.dueDiligenceIssues.filter(visible);
  if (propertyId) issues = issues.filter(i => i.propertyId === propertyId);
  if (dealId) issues = issues.filter(i => i.dealId === dealId);
  res.json({ success: true, issues });
});

app.post('/api/due-diligence/issues', needs('dd:issue_manage'), rateLimit('ddissue', 30, 60_000), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const b = req.body || {};
  const title = str(b.title, 160);
  const description = str(b.description, 2000);
  if (!b.propertyId || !title || !description || !DD_SEVERITIES.includes(b.severity)) {
    return res.status(400).json({ error: 'Property ID, valid severity, title and description are required' });
  }
  const { state } = loadPropertyWorkspace(currentUser, String(b.propertyId));

  let resolver: UserProfile | undefined = currentUser;
  if (b.responsibleResolverId && b.responsibleResolverId !== currentUser.id) {
    resolver = db.byId('users', b.responsibleResolverId);
    if (!resolver) return res.status(400).json({ error: 'Unknown resolver' });
  }
  if (b.dealId && !state.dealRooms.some(d => d.id === b.dealId && d.propertyId === b.propertyId)) {
    return res.status(400).json({ error: 'Deal does not belong to this property' });
  }

  const issueId = `ISSUE-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  const dl = b.deadline && !Number.isNaN(Date.parse(b.deadline)) ? new Date(b.deadline).toISOString() : new Date(Date.now() + 14 * 86400000).toISOString();

  const newIssue: any = {
    id: issueId,
    checklistId: b.checklistId,
    propertyId: b.propertyId,
    dealId: b.dealId,
    severity: b.severity,
    title,
    description,
    supportingEvidence: Array.isArray(b.supportingEvidence) ? b.supportingEvidence.slice(0, 10) : [],
    responsibleResolverId: resolver.id,
    responsibleResolverName: resolver.name,
    deadline: dl,
    resolutionPlan: str(b.resolutionPlan, 1000) || 'Resolution in progress',
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  };
  state.dueDiligenceIssues.push(newIssue);

  if (b.checklistId) {
    const item = state.dueDiligenceItems.find(i => i.id === b.checklistId && i.propertyId === b.propertyId);
    if (item) {
      item.status = 'ISSUE_FOUND';
      item.mismatchSeverity = b.severity;
      item.auditHistory.push({ action: 'ISSUE_LINKED', performedBy: currentUser.id, timestamp: now, details: `Issue ${issueId} (${b.severity}) linked to check: ${title}` });
    }
  }
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'VERIFICATION', issueId, 'DD_ISSUE_REGISTERED',
    `Due diligence defect issue filed (${b.severity}): "${title}" on property ${b.propertyId}`);
  res.json({ success: true, issue: newIssue });
});

app.post('/api/due-diligence/issues/:id/respond', needs('dd:issue_manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { responseNotes, resolutionEvidence } = req.body || {};
  const state = db.getState();
  const issue = state.dueDiligenceIssues.find(iss => iss.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  loadPropertyWorkspace(currentUser, issue.propertyId);

  if (!isAdmin(currentUser) && issue.responsibleResolverId !== currentUser.id) {
    return res.status(403).json({ error: 'Only the assigned resolver can respond to this issue' });
  }

  issue.responseNotes = str(responseNotes, 2000) || 'Response submitted with documents';
  if (Array.isArray(resolutionEvidence)) issue.resolutionEvidence = resolutionEvidence.slice(0, 10);
  issue.status = 'IN_PROGRESS';
  issue.updatedAt = new Date().toISOString();
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'VERIFICATION', issue.id, 'DD_ISSUE_RESPONDED',
    `Resolver ${currentUser.name} submitted resolution response for issue "${issue.title}"`);
  res.json({ success: true, issue });
});

app.post('/api/due-diligence/issues/:id/decide', needs('dd:issue_manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { decision, notes } = req.body || {};
  if (decision !== 'RESOLVED' && decision !== 'ACCEPTED_RISK' && decision !== 'REOPENED') {
    return res.status(400).json({ error: 'Decision must be RESOLVED, ACCEPTED_RISK, or REOPENED' });
  }
  const state = db.getState();
  const issue = state.dueDiligenceIssues.find(iss => iss.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  const { property } = loadPropertyWorkspace(currentUser, issue.propertyId);

  // The resolver cannot close their own issue; accepting residual risk is a principal / admin / legal call.
  if (issue.responsibleResolverId === currentUser.id && !isSuper(currentUser)) {
    return res.status(403).json({ error: 'The resolver cannot decide on their own issue' });
  }
  if (decision === 'ACCEPTED_RISK' && !(isAdmin(currentUser) || currentUser.role === 'LEGAL_COUNSEL' || isPropertyPrincipal(currentUser, property))) {
    return res.status(403).json({ error: 'Only the property principal, legal counsel or admin may accept residual risk' });
  }
  if (issue.severity === 'CRITICAL' && decision !== 'REOPENED' && !(isAdmin(currentUser) || currentUser.role === 'LEGAL_COUNSEL')) {
    return res.status(403).json({ error: 'CRITICAL issues need legal counsel or admin sign-off' });
  }

  const now = new Date().toISOString();
  issue.status = decision;
  issue.reviewerDecision = str(notes, 1000) || `Decision ${decision} recorded`;
  issue.reviewedBy = currentUser.name;
  if (decision === 'RESOLVED' && issue.checklistId) {
    issue.resolvedAt = now;
    const item = state.dueDiligenceItems.find(i => i.id === issue.checklistId);
    if (item && item.status === 'ISSUE_FOUND') {
      item.status = 'UNDER_REVIEW';
      item.approvalStage = 'ISSUE_RESOLVED';
    }
  } else if (decision === 'RESOLVED') {
    issue.resolvedAt = now;
  }
  issue.updatedAt = now;
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'VERIFICATION', issue.id, 'DD_ISSUE_DECISION',
    `Decision "${decision}" entered for issue "${issue.title}" by ${currentUser.name} (${currentUser.role})`);
  res.json({ success: true, issue });
});

// 12.5 Registry Readiness Report (Module B6)
app.get('/api/deals/:id/readiness-report', needs('dd:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser, { allowLegal: true });
  const report = calculateTransactionReadiness(deal.id, deal.propertyId, state.dueDiligenceItems, state.dueDiligenceIssues, state.dealTasks, readinessContext(state, deal));
  res.json({ success: true, report });
});

app.post('/api/deals/:id/readiness-report/generate', needs('readiness:generate'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser, { allowLegal: true });
  const report = calculateTransactionReadiness(deal.id, deal.propertyId, state.dueDiligenceItems, state.dueDiligenceIssues, state.dealTasks, readinessContext(state, deal));
  report.generatedBy = `${currentUser.name} (${currentUser.role})`;
  state.readinessReports.push(report);
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'DEAL', deal.id, 'REGISTRY_READINESS_REPORT_SEALED',
    `Transaction Readiness Report generated for ${deal.id}. Ready for Registry: ${report.isReadyForRegistry}. Blockers: ${report.blockers.length}`);
  res.json({ success: true, report });
});

// ==========================================
// 12.6 PROPERTY MEDIA VAULT & SELECTIVE SHARING
// ==========================================
const MEDIA_SENSITIVITIES = ['PUBLIC', 'CONFIDENTIAL', 'RESTRICTED', 'HIGHLY_CONFIDENTIAL'];

function loadVaultProperty(user: UserProfile, id: string) {
  const state = db.getState();
  const property = db.byId('properties', id);
  if (!property) throw new HttpError(404, 'Property not found');
  return { state, property };
}

app.get('/api/properties/:id/vault/assets', needs('property:read'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, property } = loadVaultProperty(currentUser, req.params.id);
  const id = property.id;

  const isOwnerOrListingBroker = isPropertyPrincipal(currentUser, property);
  const seeAll = isOwnerOrListingBroker || can(currentUser, 'vault:read_all');

  const userDealRoomIds = state.dealRooms.filter(d => isDealParticipant(currentUser, d)).map(d => d.id);
  const activeGrants = state.mediaShareGrants.filter(g => {
    if (g.propertyId !== id || g.isRevoked) return false;
    if (g.expiresAt && new Date(g.expiresAt).getTime() < Date.now()) return false;
    return g.recipientId === currentUser.id ||
      (g.recipientId === 'VERIFIED_ALL' && currentUser.verificationStatus === 'VERIFIED') ||
      (g.recipientType === 'DEAL_ROOM_PARTICIPANTS' && userDealRoomIds.includes(g.recipientId));
  });
  const granted = new Set<string>();
  activeGrants.forEach(g => g.assetIds.forEach(aid => granted.add(aid)));

  // A property that is not publicly listed hides even its PUBLIC assets from outsiders.
  const listed = ['active', 'under_negotiation'].includes(property.listingStatus);
  const assets = state.propertyMediaAssets
    .filter(a => a.propertyId === id && a.status === 'ACTIVE')
    .filter(a => seeAll || granted.has(a.id) || (a.sensitivity === 'PUBLIC' && listed));

  res.json({ success: true, assets, isOwnerOrListingBroker, activeGrantsCount: activeGrants.length });
});

app.post('/api/properties/:id/vault/assets', needs('vault:manage'), rateLimit('vaultup', 60, 60_000), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, property } = loadVaultProperty(currentUser, req.params.id);
  const id = property.id;
  if (!isPropertyPrincipal(currentUser, property)) {
    return res.status(403).json({ error: 'Only property owner or listing broker can upload into Property Vault' });
  }

  const b = req.body || {};
  const originalFileName = str(b.originalFileName, 160);
  const category = str(b.category, 40);
  if (!originalFileName || !/^[A-Z_]+$/.test(category) || !b.fileUrl) {
    return res.status(400).json({ error: 'originalFileName, category, and fileUrl are required' });
  }
  if (!isSafeUrl(b.fileUrl) && !String(b.fileUrl).startsWith('/')) {
    return res.status(400).json({ error: 'fileUrl must be an https URL' });
  }
  const fileUrl = String(b.fileUrl).slice(0, 500);
  const sensitivity = MEDIA_SENSITIVITIES.includes(b.sensitivity) ? b.sensitivity : 'CONFIDENTIAL';

  const assetId = `ASSET-${id}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const safeName = originalFileName.replace(/[^\w.\- ]/g, '_');

  const newAsset: PropertyMediaAsset = {
    id: assetId,
    propertyId: id,
    uploaderId: currentUser.id,
    uploaderName: currentUser.name,
    introducerId: property.listingBrokerId,
    originalFileName: safeName,
    category: category as any,
    mimeType: str(b.mimeType, 80) || 'image/jpeg',
    fileSizeBytes: Math.min(200_000_000, Number(b.fileSizeBytes) || 0), // unknown stays 0 — we only store a link
    fileUrl,
    storagePath: `vault/${id}/${category.toLowerCase()}/${safeName}`,
    sha256Hash: sha256(`${assetId}:${fileUrl}:${now}`),
    description: str(b.description, 500),
    version: 1,
    sensitivity: sensitivity as any,
    isMalwareScanned: false, // real scanning is out of scope; do not claim it happened
    status: 'ACTIVE',
    createdAt: now,
  };
  state.propertyMediaAssets.unshift(newAsset);

  if (category === 'PHOTOGRAPH' && sensitivity === 'PUBLIC' && !property.images.includes(fileUrl)) property.images.push(fileUrl);
  if (category === 'WALKTHROUGH_VIDEO' && sensitivity === 'PUBLIC') property.videoUrl = fileUrl;
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', id, 'MEDIA_VAULT_ASSET_UPLOADED',
    `Asset ${safeName} (${category}, ${sensitivity}) uploaded to vault for property ${id}. Hash: ${newAsset.sha256Hash.substring(0, 12)}...`);
  res.json({ success: true, asset: newAsset });
});

app.get('/api/properties/:id/vault/grants', needs('vault:manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, property } = loadVaultProperty(currentUser, req.params.id);
  if (!isPropertyPrincipal(currentUser, property) && !can(currentUser, 'vault:read_all')) {
    return res.status(403).json({ error: 'Permission denied to inspect property access grants' });
  }
  res.json({ success: true, grants: state.mediaShareGrants.filter(g => g.propertyId === property.id) });
});

app.post('/api/properties/:id/vault/grants', needs('vault:manage'), rateLimit('vaultgrant', 60, 60_000), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, property } = loadVaultProperty(currentUser, req.params.id);
  if (!isPropertyPrincipal(currentUser, property)) {
    return res.status(403).json({ error: 'Permission denied to create sharing grants for this property' });
  }

  const b = req.body || {};
  const types = ['BROKER', 'CONNECTOR', 'BUYER', 'DEAL_ROOM_PARTICIPANTS', 'VERIFIED_GROUP'];
  if (!types.includes(b.recipientType) || !b.recipientId || !Array.isArray(b.assetIds) || b.assetIds.length === 0 || b.assetIds.length > 100) {
    return res.status(400).json({ error: 'recipientType, recipientId, and assetIds are required' });
  }

  // Assets must belong to THIS property (otherwise a grant could leak another property's vault).
  const ownAssets = new Set(state.propertyMediaAssets.filter(a => a.propertyId === property.id).map(a => a.id));
  if (!b.assetIds.every((a: unknown) => typeof a === 'string' && ownAssets.has(a))) {
    return res.status(400).json({ error: 'One or more assets do not belong to this property' });
  }

  let recipientName = '';
  if (b.recipientType === 'DEAL_ROOM_PARTICIPANTS') {
    const dr = state.dealRooms.find(d => d.id === b.recipientId && d.propertyId === property.id);
    if (!dr) return res.status(400).json({ error: 'Deal room not found for this property' });
    recipientName = `Deal room ${dr.id}`;
  } else if (b.recipientType === 'VERIFIED_GROUP') {
    if (b.recipientId !== 'VERIFIED_ALL') return res.status(400).json({ error: 'Invalid group' });
    recipientName = 'All verified members';
  } else {
    const ru = state.users.find(u => u.id === b.recipientId && u.verificationStatus === 'VERIFIED');
    if (!ru) return res.status(400).json({ error: 'Recipient must be a verified member' });
    recipientName = ru.name;
  }

  const now = new Date().toISOString();
  const days = b.expiresInDays === undefined || b.expiresInDays === null || b.expiresInDays === '' ? undefined : Number(b.expiresInDays);
  if (days !== undefined && (!Number.isFinite(days) || days <= 0 || days > 365)) return res.status(400).json({ error: 'expiresInDays must be 1–365' });
  const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : undefined;

  const newGrant: MediaShareGrant = {
    id: `GRANT-${Date.now().toString(36).toUpperCase()}`,
    propertyId: property.id,
    grantedByUserId: currentUser.id,
    grantedByName: currentUser.name,
    recipientType: b.recipientType,
    recipientId: b.recipientId,
    recipientName,
    assetIds: b.assetIds,
    permissionLevel: ['PREVIEW', 'VIEW', 'DOWNLOAD'].includes(b.permissionLevel) ? b.permissionLevel : 'VIEW',
    locationPrecisionPermitted: ['APPROXIMATE_LOCALITY', 'GENERAL_AREA', 'EXACT_PIN'].includes(b.locationPrecisionPermitted) ? b.locationPrecisionPermitted : 'APPROXIMATE_LOCALITY',
    requiresAuthentication: true,
    allowForwarding: b.allowForwarding === true,
    startAt: now,
    expiresAt,
    isRevoked: false,
    createdAt: now,
  };
  state.mediaShareGrants.unshift(newGrant);
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', property.id, 'MEDIA_SHARE_GRANT_ISSUED',
    `Access granted to ${recipientName} (${b.recipientType}). Assets count: ${b.assetIds.length}, Permitted Location: ${newGrant.locationPrecisionPermitted}. Expires: ${expiresAt || 'Never'}`);
  res.json({ success: true, grant: newGrant });
});

app.post('/api/properties/:id/vault/grants/:grantId/revoke', needs('vault:manage'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, property } = loadVaultProperty(currentUser, req.params.id);
  if (!isPropertyPrincipal(currentUser, property) && !isAdmin(currentUser)) {
    return res.status(403).json({ error: 'Only the owner, listing broker or an admin can revoke a grant' });
  }
  const grant = state.mediaShareGrants.find(g => g.id === req.params.grantId && g.propertyId === property.id);
  if (!grant) return res.status(404).json({ error: 'Share grant not found' });

  grant.isRevoked = true;
  grant.revokedAt = new Date().toISOString();
  grant.revocationReason = str((req.body || {}).reason, 300) || 'Revoked by listing broker';
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', property.id, 'MEDIA_SHARE_GRANT_REVOKED',
    `Grant ${grant.id} revoked for ${grant.recipientName}. Reason: ${grant.revocationReason}`);
  res.json({ success: true, grant });
});

app.post('/api/properties/:id/location', needs('property:update'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { property } = loadVaultProperty(currentUser, req.params.id);
  if (!isPropertyPrincipal(currentUser, property)) {
    return res.status(403).json({ error: 'Only owner or listing broker can edit property location' });
  }

  const b = req.body || {};
  if (b.googleMapsUrl) {
    try {
      const u = new URL(String(b.googleMapsUrl));
      const hostOk = ['maps.google.com', 'www.google.com', 'google.com', 'maps.app.goo.gl', 'goo.gl'].includes(u.hostname);
      if (u.protocol !== 'https:' || !hostOk) {
        return res.status(400).json({ error: 'Please enter a valid https Google Maps URL (maps.google.com or maps.app.goo.gl)' });
      }
    } catch {
      return res.status(400).json({ error: 'Invalid Google Maps URL format' });
    }
  }
  if (b.googleMapsDirectionsUrl && !isSafeUrl(b.googleMapsDirectionsUrl)) {
    return res.status(400).json({ error: 'Invalid directions URL' });
  }
  const lat = b.latitude !== undefined && b.latitude !== '' ? Number(b.latitude) : undefined;
  const lng = b.longitude !== undefined && b.longitude !== '' ? Number(b.longitude) : undefined;
  if ((lat !== undefined && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng !== undefined && (!Number.isFinite(lng) || Math.abs(lng) > 180))) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  if (b.state) property.state = str(b.state, 60);
  if (b.district !== undefined) property.district = str(b.district, 80);
  if (b.tehsil !== undefined) property.tehsil = str(b.tehsil, 80);
  if (b.village !== undefined) property.village = str(b.village, 80);
  if (b.street !== undefined) property.street = str(b.street, 160);
  if (b.pincode !== undefined) property.pincode = str(b.pincode, 10);
  if (b.locality) property.locality = str(b.locality, 120);
  if (b.landmark !== undefined) property.landmark = str(b.landmark, 160);
  if (b.googleMapsUrl !== undefined) property.googleMapsUrl = str(b.googleMapsUrl, 500);
  if (b.googleMapsDirectionsUrl !== undefined) property.googleMapsDirectionsUrl = str(b.googleMapsDirectionsUrl, 500);
  if (lat !== undefined) property.latitude = lat;
  if (lng !== undefined) property.longitude = lng;
  if (['APPROXIMATE_LOCALITY', 'GENERAL_AREA', 'EXACT_PIN'].includes(b.locationPrecision)) property.locationPrecision = b.locationPrecision;

  property.updatedAt = new Date().toISOString();
  db.save();

  db.appendAuditEvent(currentUser.id, currentUser.role, 'PROPERTY', property.id, 'LOCATION_METADATA_UPDATED',
    `Location updated: ${property.locality}, ${property.state || 'N/A'}, Pincode: ${property.pincode || 'N/A'}, Precision: ${property.locationPrecision}`);
  res.json({ success: true, property: sanitizeProperty(property, currentUser) });
});

// ==========================================
// 12.7 DEAL ROOM CHAT
// ==========================================
app.get('/api/deals/:id/messages', needs('deal:chat'), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser); // legal counsel is deliberately not a chat reader
  const brokersChannel = canSeeDealCommercials(currentUser, deal, state); // the brokers — and GENZ while a dispute is open — may read the brokers-only channel
  res.json({ success: true, messages: state.dealMessages.filter(m => m.dealRoomId === deal.id && (brokersChannel || (m.audience || 'ALL') === 'ALL')) });
});

app.post('/api/deals/:id/messages', needs('deal:chat'), rateLimit('chat', 60, 60_000), (req: Request, res: Response) => {
  const currentUser = getCurrentUser();
  const { state, deal } = loadDealFor(req, currentUser);
  if (!isDealParticipant(currentUser, deal)) {
    return res.status(403).json({ error: 'Only deal participants can post in the deal room' });
  }
  const b = req.body || {};
  const text = typeof b.text === 'string' ? b.text.trim() : '';
  if (!text || text.length > 2000) return res.status(400).json({ error: 'Message must be 1–2000 characters' });
  const blocked = filterMessage(currentUser, text);
  if (blocked) { db.appendAuditEvent(currentUser.id, currentUser.role, 'DEAL', deal.id, 'CHAT_BLOCKED', blocked); return res.status(400).json({ error: blocked, code: 'CHAT_FILTER' }); }
  if (isFlood(currentUser.id, text)) return res.status(429).json({ error: 'You already sent this exact message a moment ago.' });
  if (b.mediaUrl && !isSafeUrl(b.mediaUrl)) return res.status(400).json({ error: 'mediaUrl must be an https URL' });
  const mediaType = ['IMAGE', 'DOCUMENT', 'AUDIO_VOICE_NOTE'].includes(b.mediaType) ? b.mediaType : undefined;
  // 'BROKERS' = private channel for the two deal brokers (commission talk etc.); the owner can never post to / read it.
  const audience: 'ALL' | 'BROKERS' = b.audience === 'BROKERS' ? 'BROKERS' : 'ALL';
  if (audience === 'BROKERS' && !isDealBroker(currentUser, deal)) {
    return res.status(403).json({ error: 'Only the deal brokers can use the brokers-only channel' });
  }

  const newMsg: DealMessage = {
    id: `MSG-${deal.id}-${Date.now().toString(36)}`,
    dealRoomId: deal.id,
    senderId: currentUser.id,
    senderName: currentUser.name,
    senderRole: currentUser.role,
    text,
    audience,
    mediaUrl: b.mediaUrl ? String(b.mediaUrl).slice(0, 500) : undefined,
    mediaType: b.mediaUrl ? mediaType : undefined,
    timestamp: new Date().toISOString(),
  };
  state.dealMessages.push(newMsg);
  db.save();
  res.json({ success: true, message: newMsg });
});

// ==========================================
// 13. CRM, ERROR HANDLING, VITE DEV SERVER / STATIC ASSETS
// ==========================================
app.use('/api/crm/money', createMoneyTrailRouter());
app.use('/api/admin/pulse', createPulseRouter());
app.use('/api/crm', createTargetBonusRouter());
app.use('/api/crm', createCrmSalesRouter());
app.use('/api/crm', createCrmPlusRouter());
app.use('/api/crm', createCrmRouter());
app.use('/api/connector', createConnectorRouter());
app.use('/api/team', createTeamRouter());
app.use('/api/inventory', createInventoryRouter());
app.use('/api/invdesk', createInventoryDeskRouter());
app.use('/api/launch', createLaunchRouter());
app.use('/api/share', createShareRouter());
app.use('/api/land-records', createLandRecordsRouter());
app.use('/s', createPublicShareRouter());
app.use('/api/client-rooms', createClientRoomRouter());
app.use('/r', createClientRoomPageRouter());
// v46 — shop QR partners: broker API, the customer's scan form + poster, the shopkeeper's own page
app.use('/api/shop-partners', createShopPartnerRouter());
app.use('/q', createPartnerQrRouter());
app.use('/sp', createPartnerPageRouter());
app.use('/api/visit-acks', createVisitAckRouter());
app.use('/a', createVisitAckPageRouter());
app.use('/c', createPublicCardRouter());
app.use('/oc', createOwnerConsentPageRouter());
app.use('/report', createReportRouter());
app.use('/api/growth', createGrowthRouter());
app.use('/api/daily', createDailyRouter());
app.use('/api/community', createCommunityRouter());
app.use('/api/pdocs', createPdocsRouter());
app.use('/api/property-docs', createPropDocsRouter());
app.use('/api/pcontrol', createPcontrolRouter());
app.use('/api/visits', createVisitRouter());
app.use('/api/offers', createOffersRouter());
app.use('/api/timeline', createTimelineRouter());
app.use('/api/network', createNetworkRouter());
app.use('/api/id-review', createIdReviewRouter());
app.use('/api/kyc-vault', createKycVaultRouter());
app.use('/api/protection', createProtectionRouter());
app.use('/api/auth/2fa', createTwoFactorRouter());
app.use('/api/consent', createConsentRouter());
app.use('/api/buyer-bonds', createBuyerBondRouter());
app.use('/api/party-watch', createPartyWatchRouter());
app.use('/api/profile-photo', createProfilePhotoRouter());
app.use('/api/deal-hub', createDealHubRouter());
app.use('/api/deals', createSidesRouter());
app.use('/api/deals', createDealCloseRouter());
// v48 — brokerage bills to the owner / buyer (+ the party's page /pay/:token)
app.use('/api', createPaymentRequestRouter());
app.use('/pay', createPaymentPageRouter());
app.use('/api/push', createPushRouter());
app.use('/api/broadcast', createBroadcastRouter());
app.use('/api/reputation', createReputationRouter());
app.use('/api/home', createHomeRouter());
app.use('/api', createHealthRouter());
app.use('/api/revenue', createRevenueRouter());
app.use('/api/legal', createLegalRouter());
app.use('/api/billing', createBillingRouter());
app.use('/api/public', createPublicStrengthRouter());
app.use('/api/tieups', createTieupsRouter());
app.use('/api/listings', createListingsRouter());
app.use('/p', createPublicPosterRouter());
app.use('/v', createPublicVisitRouter());
app.use('/api/privacy', createPrivacyRouter());
app.get('/api/legal/config', (_req: Request, res: Response) => res.json({ success: true, ...legalConfig() }));

// PIN code → state / district / post-office names (India Post public data). Optional convenience: any failure
// simply means the user fills the fields by hand. Only the 6-digit PIN leaves the server — no personal data.
const pinCache = new Map<string, { at: number; data: any }>();
app.get('/api/geo/pincode/:pin', requireAuth, rateLimit('pincode', 60, 60_000), async (req: Request, res: Response) => {
  const pin = String(req.params.pin || '').trim();
  if (!isPincode(pin)) return res.status(400).json({ error: 'Enter a valid 6-digit PIN code' });
  const cached = pinCache.get(pin);
  if (cached && Date.now() - cached.at < 24 * 3600_000) return res.json({ success: true, ...cached.data });
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: ctl.signal });
    clearTimeout(timer);
    const j: any = await r.json();
    const offices: any[] = j?.[0]?.PostOffice || [];
    if (!offices.length) {
      const data = { found: false };
      pinCache.set(pin, { at: Date.now(), data });
      return res.json({ success: true, ...data });
    }
    const st = findState(String(offices[0].State || ''));
    const data = {
      found: true,
      state: st?.name || String(offices[0].State || ''),
      district: String(offices[0].District || ''),
      city: String(offices[0].Block || offices[0].District || ''),
      localities: [...new Set<string>(offices.map(o => String(o.Name || '').replace(/\s+(B\.?O|S\.?O|H\.?O)\.?$/i, '').trim()).filter(Boolean))].slice(0, 20),
    };
    pinCache.set(pin, { at: Date.now(), data });
    return res.json({ success: true, ...data });
  } catch {
    return res.json({ success: true, found: false, unavailable: true });
  }
});

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    const { pgStore } = await import('./server/pgstore.js');
    if (pgStore) await pgStore.ping();
    const { PRELOADED } = await import('./server/bootstrap.js');
    res.json({ ok: true, storage: pgStore ? 'postgres' : 'file', uptime: Math.round(process.uptime()), ...(PRELOADED.dbError ? { dbError: PRELOADED.dbError } : {}) });
  } catch {
    res.status(503).json({ ok: false });
  }
});

function assertProductionConfig() {
  if (!IS_PROD) return;
  const problems: string[] = [];
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) problems.push('AUTH_SECRET must be set (>= 32 chars)');
  // A public demo on purpose (fake data only): PUBLIC_DEMO=true lets DEMO_MODE run in production. Never set it on a real network.
  if (DEMO_MODE && process.env.PUBLIC_DEMO !== 'true') problems.push('DEMO_MODE must be false in production');
  if (!process.env.DATABASE_URL && process.env.ALLOW_FILE_DB !== 'true') problems.push('DATABASE_URL must be set (or ALLOW_FILE_DB=true for a pilot)');
  if (problems.length) {
    console.error('[BOOT] Refusing to start in production:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
}

async function startServer() {
  assertProductionConfig();
  try { seedDemoPartners(); } catch (e) { console.error('[DEMO] shop partners seed failed', e); }
  // Unknown API paths must not fall through to the SPA shell.
  app.use('/api', (_req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.DIST_DIR || path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, file) => {
          const base = path.basename(file);
          if (base === 'sw.js' || base === 'index.html' || base === 'manifest.webmanifest') res.setHeader('Cache-Control', 'no-cache');
          else if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          else res.setHeader('Cache-Control', 'public, max-age=86400');
        },
      })
    );
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Central error handler: HttpError -> clean JSON, everything else -> generic 500 (no stack leakage).
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (err instanceof HttpError) return res.status(err.status).json(err.code ? { error: err.message, code: err.code } : { error: err.message });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Malformed JSON' });
    console.error('[ERROR]', err);
    noteServerError(req.method + ' ' + req.path, err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // v20: a forgotten promise somewhere must not take the whole network down (Node's default is to exit).
  process.on('unhandledRejection', (reason) => { console.error('[UNHANDLED REJECTION]', reason); noteRejection(reason); });
  // A real crash: save what is in memory, then exit so Docker (restart: unless-stopped) brings a clean process back.
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION] — saving data and restarting', err);
    try { db.flush(); } catch { /* ignore */ }
    import('./server/pgstore.js').then(m => m.pgStore?.flush()).catch(() => {}).finally(() => setTimeout(() => process.exit(1), 300));
  });

  // Vercel (public demo): the platform calls the exported handler; no listener, no timers, no signals.
  if (process.env.VERCEL) { sweepListings(); ensureIdTasks(); return; }

  const server = app.listen(port, HOST, () => {
    console.log(`[GENZ BROKER NETWORK] Server active on http://${HOST}:${port} (${IS_PROD ? 'production' : 'development'}, demo=${DEMO_MODE})`);
  });

  // v11: listings nobody confirmed for 30 days leave the network until the broker taps "still available".
  sweepListings();
  sweepControl(); sweepVisitPasses(); sweepOffers(); sweepSoldPurge(); sweepNetwork(); sweepCrm(); sweepIdDocs(); sweepKycVault(); sweepConsents(); sweepClientRooms(); sweepVisitAcks(); sweepPartyWatch(); sweepTargetBonus(); sweepDealClosures(); ensureIdTasks();
  setInterval(() => {
    // v20: one failing sweep must not stop the others (or crash the process)
    for (const [name, fn] of [['listings', sweepListings], ['control', sweepControl], ['visitPasses', sweepVisitPasses], ['offers', sweepOffers], ['soldPurge', sweepSoldPurge], ['network', sweepNetwork], ['crm', sweepCrm], ['idDocs', sweepIdDocs], ['kycVault', sweepKycVault], ['consents', sweepConsents], ['clientRooms', sweepClientRooms], ['visitAcks', sweepVisitAcks], ['partyWatch', sweepPartyWatch], ['targetBonus', sweepTargetBonus], ['dealClosures', sweepDealClosures], ['digestPush', sweepDigestPush], ['revenue', sweepRevenue], ['legal', sweepLegal], ['auditChain', () => db.verifyAuditIntegrity(true)]] as [string, () => unknown][]) {
      try { fn(); } catch (e: any) { console.error(`[SWEEP] ${name} failed:`, e?.message || e); }
    }
  }, 60 * 60_000).unref();

  // Graceful shutdown: stop accepting, make sure every pending write is durable, release the DB lock.
  let closing = false;
  const shutdown = async (sig: string) => {
    if (closing) return;
    closing = true;
    console.log(`[BOOT] ${sig} received — flushing and shutting down`);
    server.close();
    db.flush();
    try {
      const { pgStore } = await import('./server/pgstore.js');
      // v20: never hang on shutdown (a database that keeps refusing writes kept the old process alive forever)
      await Promise.race([pgStore?.close(), new Promise(r => setTimeout(r, Number(process.env.SHUTDOWN_FLUSH_MS || 20_000)))]);
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/** Vercel: api/_entry.ts awaits this before it hands a request to the app. */
export const ready = startServer();
export default app;
