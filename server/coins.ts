import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  db,
  DEFAULT_GENZ_COIN_CONFIG,
  type DatabaseState,
  type GenzCoinConfig,
  type GenzCoinEntry,
  type GenzCoinRedemption,
  type UserProfile,
} from './db.js';
import { ctx, requireAuth } from './auth.js';
import { alert, inr } from './alerts.js';
import { isVerifiedFull } from './permissions.js';

const DAY_MS = 86_400_000;

const st = (): DatabaseState => db.getState();
const me = () => ctx().user as UserProfile;
const nowIso = () => new Date().toISOString();
const bad = (res: Response, error: string, code = 400, extra: Record<string, unknown> = {}) =>
  res.status(code).json({ error, ...extra });

const isStaff = (u: UserProfile) => u.role === 'ADMIN' || u.role === 'SUPERADMIN';
const isCreditAllowed = (u: UserProfile) => isStaff(u) || u.role === 'BROKER';

function getConfig(): GenzCoinConfig {
  const s = st();
  if (!s.coinConfig) {
    s.coinConfig = {
      ...DEFAULT_GENZ_COIN_CONFIG,
      slabs: DEFAULT_GENZ_COIN_CONFIG.slabs.map(sl => ({ ...sl })),
    };
  }
  return s.coinConfig;
}

function nextId(prefix: string, existingIds: string[], pad = 4): string {
  const max = existingIds.reduce((m, id) => {
    const n = Number(id.slice(prefix.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

function audit(entityId: string, action: string, details: string) {
  const u = ctx().user as UserProfile | null;
  db.appendAuditEvent(
    u?.id || 'SYSTEM',
    (u?.role || 'SUPERADMIN') as UserProfile['role'],
    'SYSTEM',
    entityId,
    action,
    details
  );
}

/** Auto-expire any active or partially-redeemed entries whose expiresAt has passed. */
function expireOverdueEntries(userId?: string): boolean {
  const now = Date.now();
  let changed = false;
  for (const entry of st().coinEntries) {
    if (userId && entry.userId !== userId) continue;
    if (
      (entry.status === 'ACTIVE' || entry.status === 'PARTIALLY_REDEEMED') &&
      new Date(entry.expiresAt).getTime() <= now
    ) {
      entry.status = 'EXPIRED';
      changed = true;
    }
  }
  if (changed) db.save();
  return changed;
}

export interface AffiliatedPartner {
  id: string;
  name: string;
  companyName: string;
  category: string;
  city: string;
  phone?: string;
  verified: boolean;
  source: 'USER' | 'AFFILIATE';
}

const DEMO_AFFILIATED_PARTNERS: AffiliatedPartner[] = [
  {
    id: 'PTR-ARCH-001',
    name: 'Ar. Siddharth Deshmukh',
    companyName: 'Deshmukh Spatial & Architects Studio',
    category: 'Architect & Design',
    city: 'Raipur',
    verified: true,
    source: 'AFFILIATE',
  },
  {
    id: 'PTR-INT-001',
    name: 'Kavita Sahu',
    companyName: 'VastuCraft Modular & Turnkey Interiors',
    category: 'Modular Kitchen & Interiors',
    city: 'Raipur',
    verified: true,
    source: 'AFFILIATE',
  },
  {
    id: 'PTR-PAINT-001',
    name: 'Mahesh Dewangan',
    companyName: 'CG ProCoat Painters & Waterproofing',
    category: 'Painting & Waterproofing',
    city: 'Raipur',
    verified: true,
    source: 'AFFILIATE',
  },
  {
    id: 'PTR-TILE-001',
    name: 'Nitin Agrawal',
    companyName: 'Shree Balaji Tiles, Granite & Sanitaryware',
    category: 'Tiles & Flooring',
    city: 'Raipur',
    verified: true,
    source: 'AFFILIATE',
  },
  {
    id: 'PTR-CLEAN-001',
    name: 'Deepak Verma',
    companyName: 'SparkleHome Deep Cleaning & Pest Control',
    category: 'Deep Cleaning & Pest Control',
    city: 'Raipur',
    verified: true,
    source: 'AFFILIATE',
  },
];

function getAffiliatedPartners(): AffiliatedPartner[] {
  const contractors: AffiliatedPartner[] = st()
    .users.filter(u => u.role === 'CONTRACTOR' && isVerifiedFull(u))
    .map(u => ({
      id: u.id,
      name: u.name,
      companyName: u.companyName || `${u.name} Constructions`,
      category: 'Civil & Construction Contractor',
      city: u.city || 'Raipur',
      verified: true,
      source: 'USER' as const,
    }));
  return [...contractors, ...DEMO_AFFILIATED_PARTNERS];
}

export interface CreditCoinsInput {
  dealId: string;
  userId: string;
  dealType?: 'SALE' | 'RENT';
  buyerBrokerage?: number;
  dealValueInr?: number;
  registryRef?: string;
  issuedBy: string;
  note?: string;
}

export function creditCoinsForDeal(
  input: CreditCoinsInput
): { ok: true; entry: GenzCoinEntry } | { ok: false; error: string; status: number } {
  const cfg = getConfig();
  if (!cfg.enabled) {
    return { ok: false, error: 'GENZ Mudra program is currently disabled by Superadmin.', status: 400 };
  }
  const user = db.byId('users', input.userId);
  if (!user) {
    return { ok: false, error: 'Recipient user not found.', status: 404 };
  }
  if (user.role !== 'BUYER_TENANT') {
    return {
      ok: false,
      error: 'GENZ Mudra is only available for Buyers and Tenants, not Brokers.',
      status: 403,
    };
  }

  const dealIdTrimmed = input.dealId.trim();
  const deal = st().dealRooms.find(d => d.id === dealIdTrimmed);
  const agreement = st()
    .commissionAgreements.filter(a => a.dealId === dealIdTrimmed)
    .sort((a, b) => (a.status === 'ACTIVE' ? 1 : 0) - (b.status === 'ACTIVE' ? 1 : 0) || b.version - a.version)
    .pop();

  const agreementBuyerBrokerage =
    agreement && agreement.totalAgreedBrokerage > 0
      ? agreement.payer === 'SPLIT_EQUAL'
        ? agreement.totalAgreedBrokerage / 2
        : agreement.totalAgreedBrokerage
      : undefined;

  const resolvedDealValue = input.dealValueInr ?? agreement?.dealValue ?? deal?.dealValue;
  const isRentalOrBrokerageCredit =
    input.dealType === 'RENT' ||
    (deal as { dealType?: string } | undefined)?.dealType === 'RENT' ||
    (input.buyerBrokerage !== undefined && input.dealValueInr === undefined);
  if (
    !isRentalOrBrokerageCredit &&
    resolvedDealValue !== undefined &&
    (!Number.isFinite(resolvedDealValue) || resolvedDealValue < cfg.minDealValueInr)
  ) {
    return {
      ok: false,
      error: `Deal value must be at least ${inr(cfg.minDealValueInr)} to qualify for GENZ Mudra.`,
      status: 400,
    };
  }

  const calculationBasis =
    input.buyerBrokerage ??
    agreementBuyerBrokerage ??
    (deal && deal.totalCommissionExpected > 0 ? deal.totalCommissionExpected : undefined) ??
    resolvedDealValue ??
    0;

  if (!Number.isFinite(calculationBasis) || calculationBasis <= 0) {
    return {
      ok: false,
      error: 'Buyer brokerage or deal value must be positive to credit GENZ Mudra.',
      status: 400,
    };
  }

  const dup = st().coinEntries.find(
    e => e.dealId === dealIdTrimmed && e.userId === input.userId && e.status !== 'EXPIRED'
  );
  if (dup) {
    return { ok: false, error: `GENZ Mudra already credited for deal ${input.dealId}.`, status: 409 };
  }

  const coinsIssued = Math.min(
    cfg.maxCoinCapPerDeal,
    Math.round((calculationBasis * cfg.defaultRewardPct) / 100)
  );
  if (coinsIssued <= 0) {
    return { ok: false, error: 'Computed GENZ Mudra reward is zero.', status: 400 };
  }

  const now = Date.now();
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + cfg.validityDays * DAY_MS).toISOString();
  const registryRef = input.registryRef?.trim() || undefined;

  const entry: GenzCoinEntry = {
    id: nextId('GZC-', st().coinEntries.map(e => e.id), 4),
    userId: input.userId,
    dealId: dealIdTrimmed,
    dealValueInr: Math.round(resolvedDealValue ?? calculationBasis),
    rewardPct: cfg.defaultRewardPct,
    coinsIssued,
    coinsRemaining: coinsIssued,
    status: 'LOCKED_VISIT',
    registryRef,
    issuedBy: input.issuedBy,
    issuedAt,
    expiresAt,
    note: input.note?.trim() || undefined,
  };

  st().coinEntries.push(entry);
  db.saveNow();

  audit(
    entry.id,
    'GENZ_COINS_CREDITED',
    `${coinsIssued} GENZ Mudra (${entry.status}) credited to ${user.name} (${user.id}) for deal ${entry.dealId} (basis=${inr(calculationBasis)}, dealValue=${inr(entry.dealValueInr)})`
  );

  alert(
    user.id,
    'system',
    'GENZ Mudra Reserved (Pending Visit Verification)',
    `${coinsIssued.toLocaleString('en-IN')} GENZ Mudra reserved for deal ${entry.dealId}. Preview activates after site visit verification and unlocks on commission agreement.`,
    '/',
    { not: input.issuedBy }
  );

  return { ok: true, entry };
}

export function unlockCoinsOnVisitVerified(userId: string, dealId?: string): GenzCoinEntry[] {
  if (!userId) return [];
  const matching = st().coinEntries.filter(
    e => e.userId === userId && (!dealId || e.dealId === dealId) && e.status === 'LOCKED_VISIT'
  );
  if (matching.length === 0) return [];
  const now = nowIso();
  for (const entry of matching) {
    entry.status = 'LOCKED_REGISTRY';
    audit(
      entry.id,
      'GENZ_MUDRA_VISIT_VERIFIED',
      `GENZ Mudra ${entry.id} (${entry.coinsIssued}) transitioned LOCKED_VISIT -> LOCKED_REGISTRY for user ${entry.userId} (deal ${entry.dealId}) at ${now}`
    );
  }
  db.saveNow();
  return matching;
}

export function unlockCoinsOnCommissionAgreement(userId: string, dealId?: string): GenzCoinEntry[] {
  if (!userId) return [];
  const matching = st().coinEntries.filter(
    e =>
      e.userId === userId &&
      (!dealId || e.dealId === dealId) &&
      (e.status === 'LOCKED_REGISTRY' || e.status === 'LOCKED_VISIT')
  );
  if (matching.length === 0) return [];
  const cfg = getConfig();
  const now = Date.now();
  const nowStr = new Date(now).toISOString();
  const expiresAt = new Date(now + cfg.validityDays * DAY_MS).toISOString();
  for (const entry of matching) {
    entry.status = 'ACTIVE';
    entry.unlockedAt = nowStr;
    entry.expiresAt = expiresAt;
    audit(
      entry.id,
      'GENZ_MUDRA_UNLOCKED',
      `GENZ Mudra ${entry.id} (${entry.coinsIssued}) unlocked to ACTIVE for user ${entry.userId} (deal ${entry.dealId}) via commission agreement; expiresAt=${expiresAt}`
    );
    alert(
      entry.userId,
      'system',
      'GENZ Mudra Unlocked!',
      `${entry.coinsRemaining.toLocaleString('en-IN')} GENZ Mudra for deal ${entry.dealId} are now active.`,
      '/'
    );
  }
  db.saveNow();
  return matching;
}

const configUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  defaultRewardPct: z.number().min(0.5).max(5).optional(),
  validityDays: z.number().int().min(30).max(730).optional(),
  minDealValueInr: z.number().min(0).optional(),
  maxCoinCapPerDeal: z.number().min(1000).optional(),
  partnerFeePct: z.number().min(1).max(50).optional(),
  slabs: z
    .array(
      z.object({
        minInvoiceInr: z.number().min(1000),
        maxDiscountPct: z.number().min(1).max(50),
        label: z.string().trim().min(1).max(120),
      })
    )
    .min(1)
    .optional(),
  termsAndConditions: z.string().trim().min(10).max(5000).optional(),
});

const creditSchema = z
  .object({
    dealId: z.string().trim().min(2).max(120),
    userId: z.string().trim().min(2).max(120),
    dealType: z.enum(['SALE', 'RENT']).optional(),
    buyerBrokerage: z.number().positive().optional(),
    dealValueInr: z.number().positive().optional(),
    registryRef: z.string().trim().max(160).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine(d => d.buyerBrokerage !== undefined || d.dealValueInr !== undefined, {
    message: 'Either buyerBrokerage or dealValueInr is required.',
  });

const unlockSchema = z.object({
  registryRef: z.string().trim().min(3, 'Registry reference (Index-II / Sale Deed) is required').max(160),
});

const redeemSchema = z.object({
  partnerId: z.string().trim().max(120).optional(),
  partnerName: z.string().trim().min(2).max(160).optional(),
  partnerCategory: z.string().trim().min(2).max(120),
  invoiceAmountInr: z.number().positive(),
  invoiceRef: z.string().trim().min(2).max(160),
  bookedViaGenz: z.boolean().optional(),
});

export function createCoinsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // 1. GET /api/coins/config
  router.get('/config', (_req: Request, res: Response) => {
    return res.json({ success: true, config: getConfig() });
  });

  // 2. PUT /api/coins/config (SUPERADMIN only)
  router.put('/config', (req: Request, res: Response) => {
    const u = me();
    if (u.role !== 'SUPERADMIN') {
      return bad(res, 'Forbidden: only SUPERADMIN can modify GENZ Mudra configuration.', 403);
    }
    const parsed = configUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return bad(res, parsed.error.issues[0]?.message || 'Invalid coin configuration payload.');
    }

    const cfg = getConfig();
    const d = parsed.data;
    if (d.enabled !== undefined) cfg.enabled = d.enabled;
    if (d.defaultRewardPct !== undefined) cfg.defaultRewardPct = d.defaultRewardPct;
    if (d.validityDays !== undefined) cfg.validityDays = d.validityDays;
    if (d.minDealValueInr !== undefined) cfg.minDealValueInr = d.minDealValueInr;
    if (d.maxCoinCapPerDeal !== undefined) cfg.maxCoinCapPerDeal = d.maxCoinCapPerDeal;
    if (d.partnerFeePct !== undefined) cfg.partnerFeePct = d.partnerFeePct;
    if (d.slabs !== undefined) {
      cfg.slabs = [...d.slabs].sort((a, b) => a.minInvoiceInr - b.minInvoiceInr);
    }
    if (d.termsAndConditions !== undefined) cfg.termsAndConditions = d.termsAndConditions;
    cfg.updatedAt = nowIso();
    cfg.updatedBy = u.id;

    db.saveNow();
    audit(
      'COIN_CONFIG',
      'GENZ_COIN_CONFIG_UPDATED',
      `Updated GENZ Mudra config: enabled=${cfg.enabled}, reward=${cfg.defaultRewardPct}%, validity=${cfg.validityDays}d, cap=${inr(cfg.maxCoinCapPerDeal)}, partnerFee=${cfg.partnerFeePct}%`
    );

    return res.json({ success: true, config: cfg });
  });

  // 3. GET /api/coins/wallet
  router.get('/wallet', (_req: Request, res: Response) => {
    const u = me();
    expireOverdueEntries(u.id);

    const cfg = getConfig();
    const entries = st()
      .coinEntries.filter(e => e.userId === u.id)
      .slice()
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

    const activeBalance = entries
      .filter(e => e.status === 'ACTIVE' || e.status === 'PARTIALLY_REDEEMED')
      .reduce((sum, e) => sum + e.coinsRemaining, 0);

    const lockedBalance = entries
      .filter(e => e.status === 'LOCKED_VISIT' || e.status === 'LOCKED_REGISTRY')
      .reduce((sum, e) => sum + e.coinsRemaining, 0);

    const redemptions = st()
      .coinRedemptions.filter(r => r.userId === u.id)
      .slice()
      .sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());

    return res.json({
      success: true,
      activeBalance,
      lockedBalance,
      entries,
      redemptions,
      config: cfg,
      partners: getAffiliatedPartners(),
    });
  });

  // 4. POST /api/coins/credit (ADMIN / SUPERADMIN / BROKER)
  router.post('/credit', (req: Request, res: Response) => {
    const u = me();
    if (!isCreditAllowed(u)) {
      return bad(res, 'Forbidden: only ADMIN, SUPERADMIN, or BROKER can credit GENZ Mudra.', 403);
    }
    const parsed = creditSchema.safeParse(req.body);
    if (!parsed.success) {
      return bad(res, parsed.error.issues[0]?.message || 'Invalid credit request.');
    }

    const result = creditCoinsForDeal({
      ...parsed.data,
      issuedBy: u.id,
    });
    if (!result.ok) {
      return bad(res, result.error, result.status);
    }
    return res.status(201).json({ success: true, entry: result.entry });
  });

  // 5. POST /api/coins/unlock/:entryId (ADMIN / SUPERADMIN)
  router.post('/unlock/:entryId', (req: Request, res: Response) => {
    const u = me();
    if (!isStaff(u)) {
      return bad(res, 'Forbidden: only ADMIN or SUPERADMIN can unlock registry-held coins.', 403);
    }
    const parsed = unlockSchema.safeParse(req.body);
    if (!parsed.success) {
      return bad(res, parsed.error.issues[0]?.message || 'Registry reference is required.');
    }

    const entry = st().coinEntries.find(e => e.id === req.params.entryId);
    if (!entry) {
      return bad(res, 'Coin entry not found.', 404);
    }
    if (entry.status !== 'LOCKED_REGISTRY' && entry.status !== 'LOCKED_VISIT') {
      return bad(res, `Entry ${entry.id} is ${entry.status}, not LOCKED_REGISTRY or LOCKED_VISIT.`, 400);
    }
    if (new Date(entry.expiresAt).getTime() <= Date.now()) {
      entry.status = 'EXPIRED';
      db.saveNow();
      return bad(res, 'This coin entry has already expired.', 400);
    }

    entry.status = 'ACTIVE';
    entry.registryRef = parsed.data.registryRef;
    entry.unlockedAt = nowIso();
    entry.unlockedBy = u.id;
    db.saveNow();

    audit(
      entry.id,
      'GENZ_COINS_UNLOCKED',
      `Unlocked ${entry.coinsIssued} GENZ Mudra for user ${entry.userId} (deal ${entry.dealId}, registryRef=${entry.registryRef})`
    );

    alert(
      entry.userId,
      'system',
      'GENZ Mudra Unlocked!',
      `${entry.coinsRemaining.toLocaleString('en-IN')} GENZ Mudra for deal ${entry.dealId} are now active.`,
      '/',
      { not: u.id }
    );

    return res.json({ success: true, entry });
  });

  // 6. POST /api/coins/redeem (authenticated client)
  router.post('/redeem', (req: Request, res: Response) => {
    const u = me();
    const cfg = getConfig();
    if (!cfg.enabled) {
      return bad(res, 'GENZ Mudra redemption is currently paused by administrator.', 400);
    }

    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) {
      return bad(res, parsed.error.issues[0]?.message || 'Invalid redemption payload.');
    }

    const { partnerId, partnerName, partnerCategory, invoiceAmountInr, invoiceRef, bookedViaGenz } = parsed.data;
    if (bookedViaGenz === false) {
      return bad(
        res,
        'Service must be booked via GENZ. GENZ is not liable for Mudra redemption on direct deals with affiliated partners.',
        400
      );
    }
    const partners = getAffiliatedPartners();
    const matchedPartner = partnerId ? partners.find(p => p.id === partnerId) : undefined;
    const resolvedPartnerName = matchedPartner?.companyName || partnerName?.trim();
    if (!resolvedPartnerName) {
      return bad(res, 'Please select an affiliated partner or provide partnerName.');
    }

    const minSlabInr = Math.min(...cfg.slabs.map(s => s.minInvoiceInr));
    if (invoiceAmountInr < minSlabInr) {
      return bad(
        res,
        `Minimum invoice amount to redeem GENZ Mudra is ${inr(minSlabInr)}.`,
        400
      );
    }

    const slab = cfg.slabs
      .filter(s => invoiceAmountInr >= s.minInvoiceInr)
      .sort((a, b) => b.minInvoiceInr - a.minInvoiceInr)[0];

    if (!slab) {
      return bad(res, 'No eligible discount slab found for this invoice amount.', 400);
    }

    expireOverdueEntries(u.id);

    const activeEntries = st()
      .coinEntries.filter(
        e =>
          e.userId === u.id &&
          (e.status === 'ACTIVE' || e.status === 'PARTIALLY_REDEEMED') &&
          e.coinsRemaining > 0
      )
      .sort((a, b) => {
        const expDiff = new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
        return expDiff !== 0 ? expDiff : new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime();
      });

    const activeBalance = activeEntries.reduce((sum, e) => sum + e.coinsRemaining, 0);
    if (activeBalance <= 0) {
      return bad(res, 'You have no active GENZ Mudra available to redeem.', 400);
    }

    const roundedInvoice = Math.round(invoiceAmountInr);
    const maxDiscountInr = Math.floor(roundedInvoice * (slab.maxDiscountPct / 100));
    const coinsBurned = Math.min(activeBalance, maxDiscountInr);
    if (coinsBurned <= 0) {
      return bad(res, 'Computed discount is zero for this invoice.', 400);
    }

    // FIFO burn across active non-expired coin entries
    let remainingToBurn = coinsBurned;
    const entriesUsed: { entryId: string; coins: number }[] = [];
    for (const entry of activeEntries) {
      if (remainingToBurn <= 0) break;
      const take = Math.min(entry.coinsRemaining, remainingToBurn);
      entry.coinsRemaining -= take;
      remainingToBurn -= take;
      entry.status = entry.coinsRemaining === 0 ? 'REDEEMED' : 'PARTIALLY_REDEEMED';
      entriesUsed.push({ entryId: entry.id, coins: take });
    }

    const cashPaidInr = roundedInvoice - coinsBurned;
    const partnerFeeInr = Math.round(roundedInvoice * (cfg.partnerFeePct / 100));
    const genzMarginInr = Math.max(0, partnerFeeInr - Math.round(coinsBurned * 0.2));

    const redemption: GenzCoinRedemption = {
      id: nextId('GZR-', st().coinRedemptions.map(r => r.id), 4),
      userId: u.id,
      partnerId: matchedPartner?.id || partnerId || undefined,
      partnerName: resolvedPartnerName,
      partnerCategory: partnerCategory.trim(),
      invoiceAmountInr: roundedInvoice,
      invoiceRef: invoiceRef.trim(),
      slabLabel: slab.label,
      maxDiscountPct: slab.maxDiscountPct,
      maxDiscountInr,
      coinsBurned,
      cashPaidInr,
      partnerFeeInr,
      genzMarginInr,
      entriesUsed,
      redeemedAt: nowIso(),
    };

    st().coinRedemptions.push(redemption);
    db.saveNow();

    audit(
      redemption.id,
      'GENZ_COINS_REDEEMED',
      `User ${u.name} (${u.id}) burned ${coinsBurned} GENZ Mudra on ${inr(roundedInvoice)} invoice (${invoiceRef}) with ${resolvedPartnerName}; net payable ${inr(cashPaidInr)}; partnerFee=${inr(partnerFeeInr)}, genzMargin=${inr(genzMarginInr)}`
    );

    return res.status(201).json({
      success: true,
      redemption,
      remainingActiveBalance: activeBalance - coinsBurned,
    });
  });

  // 7. GET /api/coins/admin/ledger (ADMIN / SUPERADMIN)
  router.get('/admin/ledger', (_req: Request, res: Response) => {
    const u = me();
    if (!isStaff(u)) {
      return bad(res, 'Forbidden: only ADMIN or SUPERADMIN can view the GENZ Mudra ledger.', 403);
    }

    expireOverdueEntries();

    const entries = st()
      .coinEntries.slice()
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

    const redemptions = st()
      .coinRedemptions.slice()
      .sort((a, b) => new Date(b.redeemedAt).getTime() - new Date(a.redeemedAt).getTime());

    const totalIssued = entries.reduce((sum, e) => sum + e.coinsIssued, 0);
    const totalActive = entries
      .filter(e => e.status === 'ACTIVE' || e.status === 'PARTIALLY_REDEEMED')
      .reduce((sum, e) => sum + e.coinsRemaining, 0);
    const totalExpired = entries
      .filter(e => e.status === 'EXPIRED')
      .reduce((sum, e) => sum + e.coinsRemaining, 0);
    const totalBurned = redemptions.reduce((sum, r) => sum + r.coinsBurned, 0);
    const totalGenzMarginInr = redemptions.reduce((sum, r) => sum + r.genzMarginInr, 0);

    return res.json({
      success: true,
      totals: {
        totalIssued,
        totalActive,
        totalBurned,
        totalExpired,
        totalGenzMarginInr,
      },
      entries,
      redemptions,
      config: getConfig(),
    });
  });

  return router;
}
