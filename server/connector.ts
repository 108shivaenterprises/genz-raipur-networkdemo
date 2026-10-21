/**
 * GENZ Connector programme
 * ----------------------------------------------------------------------------
 * Local shopkeepers / community members (paan shop, chai stall, sabzi vendor, kirana …) refer people they
 * know → GENZ ops assigns the referral to a verified broker (or contractor for construction) → the
 * partner works it → when it closes, ops approves a reward → ops records the payout.
 *
 * Rules:
 *  1. A connector sees only their own referrals and rewards; never brokers' notes, other connectors,
 *     inventory or deals.
 *  2. The referred person must have agreed to be contacted (DPDP) — recorded on every referral.
 *  3. The same phone cannot be referred twice for the same need while the first one is open (60 days).
 *  4. Assigned broker/contractor sees the customer's contact only for referrals assigned to them.
 *  5. Reward money: approved by admin (only after CLOSED_WON), paid by admin with a payout reference. No self-service.
 *  6. Everything is written to the hash-chained audit trail.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import type { UserProfile } from './db.js';
import { ctx, needs, digits, rateLimit, secureCode } from './auth.js';
import { can } from './permissions.js';
import { phoneSchema } from './validation.js';
import { pushTo } from './webpush.js';
import crypto from 'crypto';
import { findState } from '../src/shared/india.js';
import {
  SHOP_TYPES, SHOP_TYPE_IDS, REFERRAL_TYPES, REFERRAL_TYPE_IDS, REFERRAL_STATUSES, STATUS_FLOW, DEFAULT_REWARDS,
  DEFAULT_MAX_SHARE_PCT, shareAmount,
  type ConnectorReferral, type ReferralStatus, type ReferralShare, type ShareSide,
} from '../src/shared/connector.js';

const DUP_WINDOW_DAYS = 60;
const MAX_REWARD = 100_000;
const upiRegex = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,30}$/;

const referralCreateSchema = z.object({
  type: z.enum(REFERRAL_TYPE_IDS),
  customerName: z.string().trim().min(2, 'Customer name is required').max(100),
  contactMode: z.enum(['SHARE_NUMBER', 'CONNECTOR_INTRODUCES']).default('SHARE_NUMBER'),
  customerPhone: phoneSchema.optional().or(z.literal('')),
  customerConsent: z.literal(true, { message: 'The person must agree to be contacted by GENZ' }),
  state: z.string().trim().max(60).optional(),
  city: z.string().trim().min(2, 'City / town is required').max(80),
  locality: z.string().trim().min(2, 'Locality is required').max(80),
  budgetNote: z.string().trim().max(120).optional(),
  details: z.string().trim().max(600).optional(),
}).refine(v => v.contactMode === 'CONNECTOR_INTRODUCES' || !!v.customerPhone, { message: 'Customer mobile number is required, or choose "I will introduce the customer myself"', path: ['customerPhone'] });

export const connectorProfileSchema = z.object({
  shopType: z.enum(SHOP_TYPE_IDS),
  shopName: z.string().trim().min(2, 'Shop / group name is required').max(100),
  locality: z.string().trim().max(80).optional(),
  whatsapp: phoneSchema.optional(),
  payoutUpi: z.string().trim().regex(upiRegex, 'UPI ID looks invalid (e.g. name@okaxis)').optional().or(z.literal('')),
});

const nowIso = () => new Date().toISOString();
const isManager = (u: UserProfile) => can(u, 'connector:manage');
const isDesk = (u: UserProfile) => can(u, 'connector:desk');
const ownPhone = (id: string) => db.byId('users', id)?.phone;

function nextId(list: ConnectorReferral[]) {
  const n = list.reduce((m, r) => Math.max(m, Number(r.id.split('-').pop()) || 0), 0) + 1;
  return `CR-2026-${String(n).padStart(4, '0')}`;
}

function push(r: ConnectorReferral, u: UserProfile, action: string, note?: string) {
  r.events.push({ at: nowIso(), byId: u.id, byName: u.name, byRole: u.role, action, note });
  r.updatedAt = nowIso();
}

const PUBLIC_ACTIONS: Record<string, string> = {
  SUBMITTED: 'Referral submitted', ASSIGNED: 'Assigned to a GENZ partner',
  'STATUS:CONTACTED': 'Customer contacted', 'STATUS:QUALIFIED': 'Requirement confirmed', 'STATUS:IN_PROGRESS': 'Work in progress',
  'STATUS:CLOSED_WON': 'Deal closed 🎉', 'STATUS:CLOSED_LOST': 'Closed – did not proceed', 'STATUS:DUPLICATE': 'Already registered earlier',
  'STATUS:REJECTED': 'Could not be taken forward', REWARD_APPROVED: 'Reward approved', REWARD_PAID: 'Reward paid',
};

/** What each viewer is allowed to see of a referral. */
export function shapeReferral(r: ConnectorReferral, u: UserProfile) {
  if (isManager(u)) return r.contactMode === 'CONNECTOR_INTRODUCES' ? { ...r, connectorPhone: ownPhone(r.connectorId) } : r;
  if (isDesk(u)) { // staff desk: workflow + contact, never reward / payout data
    const { rewardStatus, rewardAmount, rewardApprovedAt, paidAt, payoutReference, duplicateHash, ...rest } = r;
    return r.contactMode === 'CONNECTOR_INTRODUCES' ? { ...rest, connectorPhone: ownPhone(r.connectorId) } : rest;
  }
  if (r.connectorId === u.id) {
    const { assignedToId, assignedToName, assignedToRole, events, duplicateHash, ...rest } = r;
    return {
      ...rest,
      assigned: !!assignedToId,
      events: events.filter(e => PUBLIC_ACTIONS[e.action]).map(e => ({ at: e.at, action: PUBLIC_ACTIONS[e.action] })),
    };
  }
  // the broker who recruited this partner: full picture of their own network's referral, incl. the reward they owe
  if (r.sponsorId && r.sponsorId === u.id) {
    const { duplicateHash, ...own } = r;
    return r.contactMode === 'CONNECTOR_INTRODUCES' ? { ...own, connectorPhone: ownPhone(r.connectorId) } : own;
  }
  // assigned broker / contractor: contact + workflow, but no reward / payout data, no partner phone
  const { rewardStatus, rewardAmount, rewardApprovedAt, paidAt, payoutReference, duplicateHash, ...rest } = r;
  return r.contactMode === 'CONNECTOR_INTRODUCES' ? { ...rest, connectorPhone: ownPhone(r.connectorId) } : rest;
}

function visibleTo(u: UserProfile, r: ConnectorReferral) {
  if (isManager(u) || isDesk(u)) return true;
  if (can(u, 'connector:self') && r.connectorId === u.id) return true;
  if (can(u, 'connector:work') && r.assignedToId === u.id) return true;
  if (can(u, 'connector:sponsor') && r.sponsorId === u.id) return true;
  return false;
}

const CLOSED = ['CLOSED_WON', 'CLOSED_LOST', 'DUPLICATE', 'REJECTED'];
/** The queues behind the desk's tiles. Each tile's count and the list it opens use these same rules, so they can never disagree. */
export const REFERRAL_QUEUES = ['open', 'won', 'unassigned', 'rewardApprovals', 'payoutsDue', 'shareDisputes'] as const;
export type ReferralQueue = typeof REFERRAL_QUEUES[number];
const inQueue: Record<ReferralQueue, (r: ConnectorReferral) => boolean> = {
  open: r => !CLOSED.includes(r.status),
  won: r => r.status === 'CLOSED_WON',
  unassigned: r => r.status === 'SUBMITTED' && !r.assignedToId,
  rewardApprovals: r => r.status === 'CLOSED_WON' && r.rewardStatus === 'NONE',
  payoutsDue: r => r.rewardStatus === 'APPROVED',
  shareDisputes: r => r.share?.status === 'NOT_RECEIVED',
};

function stats(list: ConnectorReferral[]) {
  const by: Record<string, number> = {};
  for (const s of REFERRAL_STATUSES) by[s] = 0;
  list.forEach(r => { by[r.status]++; });
  const sum = (f: (r: ConnectorReferral) => boolean) => list.filter(f).reduce((t, r) => t + (r.rewardAmount || 0), 0);
  return {
    total: list.length,
    byStatus: by,
    open: list.filter(r => !['CLOSED_WON', 'CLOSED_LOST', 'DUPLICATE', 'REJECTED'].includes(r.status)).length,
    won: by.CLOSED_WON,
    rewardPendingApproval: list.filter(r => r.status === 'CLOSED_WON' && r.rewardStatus === 'NONE').length,
    rewardApprovedAmount: sum(r => r.rewardStatus === 'APPROVED'),
    rewardPaidAmount: sum(r => r.rewardStatus === 'PAID'),
    rewardEarnedAmount: sum(r => r.rewardStatus === 'APPROVED' || r.rewardStatus === 'PAID'),
  };
}

export function createConnectorRouter() {
  const r = Router();

  /** Static catalogue for forms + reward table. */
  r.get('/meta', needs('connector:self', 'connector:manage', 'connector:work', 'connector:desk'), (_req: Request, res: Response) => {
    const s = db.getState().settings;
    res.json({
      success: true,
      enabled: s.connectorProgramEnabled !== false,
      shopTypes: SHOP_TYPES, referralTypes: REFERRAL_TYPES, statuses: REFERRAL_STATUSES, statusFlow: STATUS_FLOW,
      rewards: s.connectorRewards || DEFAULT_REWARDS,
      maxSharePct: s.connectorMaxSharePct ?? DEFAULT_MAX_SHARE_PCT,
    });
  });

  r.get('/overview', needs('connector:self', 'connector:manage', 'connector:work', 'connector:desk'), (_req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const state = db.getState();
    const mine = state.connectorReferrals.filter(x => visibleTo(u, x));
    const base: any = { success: true, stats: stats(mine), maxSharePct: db.getState().settings.connectorMaxSharePct ?? DEFAULT_MAX_SHARE_PCT };
    if (isManager(u) || isDesk(u)) {
      const connectors = state.users.filter(x => x.role === 'GENZ_CONNECTOR');
      base.partners = {
        total: connectors.length,
        verified: connectors.filter(c => c.verificationStatus === 'VERIFIED').length,
        pendingKyc: connectors.filter(c => c.verificationStatus === 'PENDING').length,
      };
      base.queue = {
        unassigned: mine.filter(inQueue.unassigned).length,
        rewardApprovals: isManager(u) ? base.stats.rewardPendingApproval : 0,
        payoutsDue: isManager(u) ? mine.filter(inQueue.payoutsDue).length : 0,
        shareDisputes: isManager(u) ? mine.filter(inQueue.shareDisputes).length : 0,
        payoutsDueAmount: isManager(u) ? mine.filter(inQueue.payoutsDue).reduce((t, x) => t + (x.rewardAmount || 0), 0) : 0,
      };
    }
    res.json(base);
  });

  r.get('/referrals', needs('connector:self', 'connector:manage', 'connector:work', 'connector:desk'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const status = String(req.query.status || '');
    const q = String(req.query.q || '').trim().toLowerCase();
    let list = db.getState().connectorReferrals.filter(x => visibleTo(u, x));
    if (status) list = list.filter(x => x.status === status);
    const queue = String(req.query.queue || '') as ReferralQueue;
    if (queue) {
      if (!REFERRAL_QUEUES.includes(queue)) return res.status(400).json({ error: 'Unknown queue' });
      // money queues belong to the reward authority; everyone else gets the same empty answer the overview already gives them
      list = (queue === 'rewardApprovals' || queue === 'payoutsDue' || queue === 'shareDisputes') && !isManager(u) ? [] : list.filter(inQueue[queue]);
    }
    if (q) list = list.filter(x => `${x.id} ${x.customerName} ${x.connectorName} ${x.city} ${x.locality}`.toLowerCase().includes(q));
    list = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // v20: newest 500 per answer (search / queues narrow it down) — the desk list was the whole history
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 500));
    res.json({ success: true, referrals: list.slice(0, limit).map(x => shapeReferral(x, u)), total: list.length, capped: list.length > limit });
  });

  r.get('/referrals/:id', needs('connector:self', 'connector:manage', 'connector:work', 'connector:desk'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const x = db.byId('connectorReferrals', req.params.id);
    if (!x || !visibleTo(u, x)) return res.status(404).json({ error: 'Referral not found' });
    res.json({ success: true, referral: shapeReferral(x, u) });
  });

  r.post('/referrals', needs('connector:refer'), rateLimit('connector-refer', 30, 24 * 60 * 60_000), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const state = db.getState();
    if (state.settings.connectorProgramEnabled === false) return res.status(503).json({ error: 'The Connector programme is paused right now.' });
    const p = referralCreateSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Validation error' });
    const d = p.data;
    if (d.state && !findState(d.state)) return res.status(400).json({ error: 'Unknown state / UT' });
    const intro = d.contactMode === 'CONNECTOR_INTRODUCES';
    const phone = intro ? '' : digits(d.customerPhone);
    if (!intro && phone === digits(u.phone)) return res.status(400).json({ error: 'You cannot refer your own number' });

    const cutoff = Date.now() - DUP_WINDOW_DAYS * 86400000;
    const norm = (t?: string) => (t || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const dup = state.connectorReferrals.find(x => intro
      ? x.connectorId === u.id && norm(x.customerName) === norm(d.customerName) && norm(x.locality) === norm(d.locality) && x.type === d.type && new Date(x.createdAt).getTime() > cutoff && !['CLOSED_LOST', 'DUPLICATE', 'REJECTED'].includes(x.status)
      : phone && digits(x.customerPhone) === phone && x.type === d.type && new Date(x.createdAt).getTime() > cutoff &&
      !['CLOSED_LOST', 'DUPLICATE', 'REJECTED'].includes(x.status));
    if (dup) return res.status(409).json({ error: 'This person is already registered with GENZ for the same need. Please refer someone else.' });

    const ref: ConnectorReferral = {
      id: nextId(state.connectorReferrals),
      connectorId: u.id, connectorName: u.name, shopType: u.connector?.shopType ?? 'COMMUNITY_MEMBER',
      type: d.type, customerName: d.customerName, customerPhone: intro ? '' : d.customerPhone || '', contactMode: d.contactMode, customerConsent: true,
      state: d.state || u.state, city: d.city, locality: d.locality, budgetNote: d.budgetNote, details: d.details,
      status: 'SUBMITTED', rewardStatus: 'NONE',
      duplicateHash: intro ? `intro:${u.id}:${norm(d.customerName)}:${d.type}` : `${phone}:${d.type}`, createdAt: nowIso(), updatedAt: nowIso(), events: [],
    };
    push(ref, u, 'SUBMITTED');
    const sponsor = u.connector?.sponsorId ? state.users.find(x => x.id === u.connector!.sponsorId) : undefined;
    if (sponsor && sponsor.role === 'BROKER' && sponsor.verificationStatus === 'VERIFIED') {
      // partner belongs to a broker's own network → the broker works it directly and rewards the partner
      ref.sponsorId = sponsor.id; ref.sponsorName = sponsor.name;
      ref.assignedToId = sponsor.id; ref.assignedToName = sponsor.name; ref.assignedToRole = sponsor.role;
      push(ref, u, 'ASSIGNED', `Auto-assigned to sponsoring broker ${sponsor.name}`);
    }
    state.connectorReferrals.unshift(ref);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', ref.id, 'CONNECTOR_REFERRAL_SUBMITTED', `${u.name} referred a ${d.type} lead in ${d.locality}, ${d.city}`);
    res.json({ success: true, referral: shapeReferral(ref, u) });
  });

  // Attach / correct the customer's number later (connector, assigned worker, ops). Earliest registration of the same person+need wins.
  r.post('/referrals/:id/attach-contact', needs('connector:self', 'connector:work', 'connector:manage', 'connector:desk'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const state = db.getState();
    const x = db.byId('connectorReferrals', req.params.id);
    if (!x || !visibleTo(u, x)) return res.status(404).json({ error: 'Referral not found' });
    const ok = phoneSchema.safeParse(req.body?.customerPhone);
    if (!ok.success) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number' });
    if (['CLOSED_WON', 'CLOSED_LOST', 'DUPLICATE', 'REJECTED'].includes(x.status)) return res.status(409).json({ error: 'This referral is already closed' });
    const phone = digits(ok.data);
    if (phone === digits(ownPhone(x.connectorId))) return res.status(400).json({ error: 'That is the partner\'s own number' });
    const active = (v: ConnectorReferral) => !['CLOSED_LOST', 'DUPLICATE', 'REJECTED'].includes(v.status);
    const others = state.connectorReferrals.filter(v => v.id !== x.id && v.type === x.type && active(v) && digits(v.customerPhone) === phone);
    x.customerPhone = ok.data;
    x.duplicateHash = `${phone}:${x.type}`;
    const older = others.find(v => v.createdAt < x.createdAt);
    if (older) {
      x.status = 'DUPLICATE';
      push(x, u, 'STATUS:DUPLICATE', `Same person and need already registered earlier (${older.id}); credit stays with the earlier partner`);
    } else {
      push(x, u, 'CONTACT_ATTACHED', 'Customer number added');
      for (const v of others) { v.status = 'DUPLICATE'; push(v, u, 'STATUS:DUPLICATE', `Same person and need registered earlier as ${x.id}`); }
    }
    db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', x.id, 'CONNECTOR_CONTACT_ATTACHED', `${u.name} added the customer number${older ? ' → duplicate of ' + older.id : ''}`);
    res.json({ success: true, duplicate: !!older, referral: shapeReferral(x, u) });
  });

  r.post('/referrals/:id/assign', needs('connector:manage', 'connector:desk'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const state = db.getState();
    const x = db.byId('connectorReferrals', req.params.id);
    if (!x) return res.status(404).json({ error: 'Referral not found' });
    if (['CLOSED_WON', 'DUPLICATE', 'REJECTED'].includes(x.status)) return res.status(409).json({ error: `Referral is ${x.status.toLowerCase().replace('_', ' ')}` });
    const to = state.users.find(v => v.id === String(req.body?.assigneeId || ''));
    if (!to || to.verificationStatus !== 'VERIFIED' || !(to.role === 'BROKER' || to.role === 'CONTRACTOR')) {
      return res.status(400).json({ error: 'Pick a verified broker or contractor' });
    }
    if (x.type === 'CONSTRUCTION' && to.role !== 'CONTRACTOR') return res.status(400).json({ error: 'Construction referrals go to a contractor' });
    if (x.type !== 'CONSTRUCTION' && to.role !== 'BROKER') return res.status(400).json({ error: 'Property referrals go to a broker' });
    x.assignedToId = to.id; x.assignedToName = to.name; x.assignedToRole = to.role;
    push(x, u, 'ASSIGNED', `Assigned to ${to.name}`);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', x.id, 'CONNECTOR_REFERRAL_ASSIGNED', `Assigned to ${to.name} (${to.role})`);
    res.json({ success: true, referral: x });
  });

  r.post('/referrals/:id/status', needs('connector:manage', 'connector:work', 'connector:desk'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const state = db.getState();
    const x = db.byId('connectorReferrals', req.params.id);
    if (!x || !visibleTo(u, x)) return res.status(404).json({ error: 'Referral not found' });
    const status = String(req.body?.status || '') as ReferralStatus;
    const note = String(req.body?.note || '').slice(0, 300);
    if (!REFERRAL_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    const manager = isManager(u) || isDesk(u);
    if (!manager && ['DUPLICATE', 'REJECTED'].includes(status)) return res.status(403).json({ error: 'Only GENZ operations can mark a referral duplicate / rejected' });
    if (!manager && !x.assignedToId) return res.status(409).json({ error: 'Referral is not assigned yet' });
    if (!STATUS_FLOW[x.status].includes(status)) return res.status(409).json({ error: `Cannot move from ${x.status} to ${status}` });
    if (status === 'CLOSED_LOST' && !note) return res.status(400).json({ error: 'Add a short reason' });
    if (status !== 'SUBMITTED' && !['DUPLICATE', 'REJECTED', 'CLOSED_LOST'].includes(status) && !x.assignedToId) {
      return res.status(409).json({ error: 'Assign this referral to a broker / contractor first' });
    }
    if (x.contactMode === 'CONNECTOR_INTRODUCES' && !x.customerPhone && ['IN_PROGRESS', 'CLOSED_WON'].includes(status)) {
      return res.status(409).json({ error: 'Add the customer\'s number first (it is checked against earlier referrals) before moving ahead' });
    }
    x.status = status;
    push(x, u, `STATUS:${status}`, note || undefined);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'LEAD', x.id, `CONNECTOR_REFERRAL_${status}`, `${u.name}: ${x.status}${note ? ' — ' + note : ''}`);
    res.json({ success: true, referral: shapeReferral(x, u) });
  });

  r.post('/referrals/:id/reward', needs('connector:manage', 'connector:sponsor'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const state = db.getState();
    const x = db.byId('connectorReferrals', req.params.id);
    if (!x || !(isManager(u) || x.sponsorId === u.id)) return res.status(404).json({ error: 'Referral not found' });
    if (x.status !== 'CLOSED_WON') return res.status(409).json({ error: 'A reward can be approved only after the referral is CLOSED_WON' });
    if (x.rewardStatus === 'PAID') return res.status(409).json({ error: 'Reward already paid' });
    const amount = req.body?.amount === undefined ? (state.settings.connectorRewards?.[x.type] ?? DEFAULT_REWARDS[x.type]) : Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_REWARD) return res.status(400).json({ error: `Reward must be between ₹1 and ₹${MAX_REWARD.toLocaleString('en-IN')}` });
    x.rewardAmount = Math.round(amount); x.rewardStatus = 'APPROVED'; x.rewardApprovedAt = nowIso();
    push(x, u, 'REWARD_APPROVED', `₹${x.rewardAmount}`);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', x.id, 'CONNECTOR_REWARD_APPROVED', `Reward ₹${x.rewardAmount} approved for ${x.connectorName}`);
    res.json({ success: true, referral: x });
  });

  r.post('/referrals/:id/pay', needs('connector:payout', 'connector:sponsor'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const state = db.getState();
    const x = db.byId('connectorReferrals', req.params.id);
    if (!x || !(can(u, 'connector:payout') || x.sponsorId === u.id)) return res.status(404).json({ error: 'Referral not found' });
    if (x.rewardStatus !== 'APPROVED') return res.status(409).json({ error: 'Reward must be approved before it can be paid' });
    const reference = String(req.body?.reference || '').trim().slice(0, 60);
    if (reference.length < 4) return res.status(400).json({ error: 'Enter the UPI / bank payout reference (UTR)' });
    x.rewardStatus = 'PAID'; x.paidAt = nowIso(); x.payoutReference = reference;
    push(x, u, 'REWARD_PAID', reference);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', x.id, 'CONNECTOR_REWARD_PAID', `₹${x.rewardAmount} paid to ${x.connectorName} (ref ${reference})`);
    res.json({ success: true, referral: x });
  });


  // ───────────── v31: connector's % share of the broker's commission ─────────────
  // The connector and the broker who works the referral agree a percentage of the BROKER's commission. It is paid by the broker
  // from his own commission, outside GENZ. GENZ only records the terms, caps the percentage, and keeps the trail.
  const sideOf = (u: UserProfile, x: ConnectorReferral): ShareSide | null => {
    if (x.connectorId === u.id) return 'CONNECTOR';
    if (x.assignedToId === u.id || x.sponsorId === u.id) return 'WORKER';
    return null;
  };
  const maxPct = () => db.getState().settings.connectorMaxSharePct ?? DEFAULT_MAX_SHARE_PCT;
  const shareStep = (sh: ReferralShare, side: ShareSide | 'GENZ', action: string, pct?: number, note?: string) => {
    sh.history.push({ id: 'SS-' + crypto.randomBytes(4).toString('hex'), at: nowIso(), side, action, pct, note: note ? note.slice(0, 200) : undefined });
    sh.updatedAt = nowIso();
  };
  const ping = (x: ConnectorReferral, toSide: ShareSide, title: string, body: string) => {
    const to = toSide === 'WORKER' ? (x.assignedToId || x.sponsorId) : x.connectorId;
    if (to) void pushTo(to, { kind: 'deals', title, body, url: '/?tab=connector' });
  };
  const loadShareRef = (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const x = db.byId('connectorReferrals', req.params.id);
    const side = x ? sideOf(u, x) : null;
    if (!x || !side) { res.status(404).json({ error: 'Referral not found' }); return null; }
    return { u, x, side };
  };

  r.post('/referrals/:id/share', needs('connector:self', 'connector:work', 'connector:sponsor'), (req: Request, res: Response) => {
    const got = loadShareRef(req, res); if (!got) return;
    const { u, x, side } = got;
    if (['DUPLICATE', 'REJECTED', 'CLOSED_LOST'].includes(x.status)) return res.status(409).json({ error: 'This referral is closed, so a share cannot be set' });
    if (side === 'WORKER' && !x.assignedToId && x.sponsorId !== u.id) return res.status(409).json({ error: 'Assign this referral first' });
    const raw = Number(req.body?.pct);
    const cap = maxPct();
    if (!Number.isFinite(raw) || raw <= 0) return res.status(400).json({ error: 'Enter the percentage of the commission' });
    if (raw > cap) return res.status(400).json({ error: `GENZ allows up to ${cap}% of the broker's commission as a connector share`, cap });
    const pct = Math.round(raw * 10) / 10;
    const note = String(req.body?.note || '').trim().slice(0, 200);
    let sh = x.share;
    if (sh && ['AGREED', 'PAID', 'CONFIRMED', 'NOT_RECEIVED'].includes(sh.status)) return res.status(409).json({ error: 'The share is already agreed and locked' });
    if (!sh || sh.status === 'DECLINED') {
      sh = x.share = { id: 'SH-' + crypto.randomBytes(4).toString('hex'), pct, proposedBy: side, status: 'PROPOSED', history: [], updatedAt: nowIso() };
      shareStep(sh, side, 'PROPOSED', pct, note);
    } else {
      const counter = sh.proposedBy !== side;
      sh.pct = pct; sh.proposedBy = side; sh.status = 'PROPOSED';
      shareStep(sh, side, counter ? 'COUNTERED' : 'REVISED', pct, note);
    }
    push(x, u, 'SHARE_PROPOSED', `${pct}% by ${side}`);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', x.id, 'CONNECTOR_SHARE_PROPOSED', `${side} proposed ${pct}% of the broker's commission`);
    ping(x, side === 'CONNECTOR' ? 'WORKER' : 'CONNECTOR', `Share proposed: ${pct}%`, `${side === 'CONNECTOR' ? x.connectorName : 'The broker'} proposed ${pct}% of the broker's commission on ${x.id}. Open Connector to accept, counter or decline.`);
    res.json({ success: true, referral: shapeReferral(x, u) });
  });

  r.post('/referrals/:id/share/respond', needs('connector:self', 'connector:work', 'connector:sponsor'), (req: Request, res: Response) => {
    const got = loadShareRef(req, res); if (!got) return;
    const { u, x, side } = got;
    const sh = x.share;
    const action = String(req.body?.action || '');
    if (!['ACCEPT', 'DECLINE'].includes(action)) return res.status(400).json({ error: 'Choose ACCEPT or DECLINE' });
    if (!sh || sh.status !== 'PROPOSED') return res.status(409).json({ error: 'There is no open proposal' });
    if (sh.proposedBy === side) return res.status(409).json({ error: 'Wait for the other side to answer your proposal (you can change the % meanwhile)' });
    sh.status = action === 'ACCEPT' ? 'AGREED' : 'DECLINED';
    shareStep(sh, side, action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED', sh.pct, String(req.body?.note || ''));
    push(x, u, 'SHARE_' + sh.status, `${sh.pct}%`);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', x.id, 'CONNECTOR_SHARE_' + sh.status, `${side} ${action === 'ACCEPT' ? 'accepted' : 'declined'} ${sh.pct}%`);
    ping(x, sh.proposedBy, action === 'ACCEPT' ? `Share agreed: ${sh.pct}%` : 'Share proposal declined', `${x.id}: the other side ${action === 'ACCEPT' ? 'accepted' : 'declined'} ${sh.pct}%.`);
    res.json({ success: true, referral: shapeReferral(x, u) });
  });

  /** The broker records his commission on the closed deal; the share amount is worked out from the agreed %. */
  r.post('/referrals/:id/share/deal', needs('connector:work', 'connector:sponsor'), (req: Request, res: Response) => {
    const got = loadShareRef(req, res); if (!got) return;
    const { u, x, side } = got;
    const sh = x.share;
    if (side !== 'WORKER') return res.status(403).json({ error: 'Only the broker working this referral records the deal commission' });
    if (!sh || sh.status !== 'AGREED') return res.status(409).json({ error: 'Agree the share first' });
    if (x.status !== 'CLOSED_WON') return res.status(409).json({ error: 'Record the commission after the referral is CLOSED_WON' });
    const c = Number(req.body?.commission);
    if (!Number.isFinite(c) || c <= 0 || c > 1_000_000_000) return res.status(400).json({ error: 'Enter your commission on the deal in ₹' });
    sh.dealCommission = Math.round(c); sh.amount = shareAmount(sh.dealCommission, sh.pct);
    shareStep(sh, 'WORKER', 'DEAL_RECORDED', sh.pct, `commission ₹${sh.dealCommission} → share ₹${sh.amount}`);
    push(x, u, 'SHARE_DEAL', `₹${sh.amount}`);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', x.id, 'CONNECTOR_SHARE_DEAL', `Commission ₹${sh.dealCommission}, ${sh.pct}% → ₹${sh.amount}`);
    ping(x, 'CONNECTOR', 'Your share is worked out', `${x.id}: ${sh.pct}% = ₹${sh.amount.toLocaleString('en-IN')}. The broker will pay you directly.`);
    res.json({ success: true, referral: shapeReferral(x, u) });
  });

  /** Paid outside GENZ: the broker marks it paid; the connector confirms (or says it did not arrive, which GENZ ops can see). */
  r.post('/referrals/:id/share/settle', needs('connector:self', 'connector:work', 'connector:sponsor'), (req: Request, res: Response) => {
    const got = loadShareRef(req, res); if (!got) return;
    const { u, x, side } = got;
    const sh = x.share;
    const action = String(req.body?.action || '');
    if (!['PAID', 'CONFIRM', 'NOT_RECEIVED'].includes(action)) return res.status(400).json({ error: 'Unknown action' });
    if (!sh || sh.amount === undefined) return res.status(409).json({ error: 'The share amount is not worked out yet' });
    const note = String(req.body?.note || '').trim().slice(0, 200);
    if (action === 'PAID') {
      if (side !== 'WORKER') return res.status(403).json({ error: 'Only the broker marks the share as paid' });
      if (!['AGREED', 'NOT_RECEIVED'].includes(sh.status)) return res.status(409).json({ error: 'Nothing to pay right now' });
      sh.status = 'PAID'; sh.paidNote = note || undefined;
      shareStep(sh, 'WORKER', 'MARKED_PAID', sh.pct, note);
      ping(x, 'CONNECTOR', 'Share marked paid', `${x.id}: the broker says ₹${sh.amount.toLocaleString('en-IN')} is paid. Please confirm once you receive it.`);
    } else {
      if (side !== 'CONNECTOR') return res.status(403).json({ error: 'Only the connector confirms receipt' });
      if (sh.status !== 'PAID') return res.status(409).json({ error: 'The broker has not marked it paid yet' });
      if (action === 'NOT_RECEIVED' && note.length < 5) return res.status(400).json({ error: 'Add a short note about what is missing' });
      sh.status = action === 'CONFIRM' ? 'CONFIRMED' : 'NOT_RECEIVED';
      shareStep(sh, 'CONNECTOR', action === 'CONFIRM' ? 'CONFIRMED' : 'NOT_RECEIVED', sh.pct, note);
      ping(x, 'WORKER', action === 'CONFIRM' ? 'Share confirmed' : 'Connector says share not received', `${x.id}: ${action === 'CONFIRM' ? 'the connector confirmed receipt.' : 'the connector says it has not arrived. GENZ ops can see this.'}`);
    }
    push(x, u, 'SHARE_' + sh.status, sh.amount ? `₹${sh.amount}` : undefined);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'COMMISSION', x.id, 'CONNECTOR_SHARE_' + sh.status, `${side}: ${action} ₹${sh.amount}`);
    res.json({ success: true, referral: shapeReferral(x, u) });
  });

  /** Own shop / payout profile. */
  r.put('/profile', needs('connector:self'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const p = connectorProfileSchema.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Validation error' });
    const stored = db.byId('users', u.id)!;
    stored.connector = { ...p.data, payoutUpi: p.data.payoutUpi || undefined, sponsorId: stored.connector?.sponsorId }; // sponsor is set by the invitation, never self-edited
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', u.id, 'CONNECTOR_PROFILE_UPDATED', 'Shop / payout details updated');
    res.json({ success: true, connector: stored.connector });
  });

  /** Admin: all partners with their numbers. */
  r.get('/partners', needs('connector:manage'), (_req: Request, res: Response) => {
    const state = db.getState();
    const partners = state.users.filter(x => x.role === 'GENZ_CONNECTOR').map(c => {
      const mine = state.connectorReferrals.filter(x => x.connectorId === c.id);
      return {
        id: c.id, name: c.name, phone: c.phone, city: c.city, state: c.state, verificationStatus: c.verificationStatus,
        connector: c.connector, createdAt: c.createdAt, stats: stats(mine),
        sponsorName: c.connector?.sponsorId ? state.users.find(v => v.id === c.connector!.sponsorId)?.name : undefined,
      };
    });
    res.json({ success: true, partners });
  });

  // ── a broker's own referral-partner network ──
  r.get('/my-partners', needs('connector:sponsor'), (_req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const state = db.getState();
    const partners = state.users.filter(x => x.role === 'GENZ_CONNECTOR' && x.connector?.sponsorId === u.id).map(c => {
      const list = state.connectorReferrals.filter(x => x.connectorId === c.id && x.sponsorId === u.id);
      return { id: c.id, name: c.name, phone: c.phone, city: c.city, verificationStatus: c.verificationStatus, connector: c.connector, createdAt: c.createdAt, stats: stats(list) };
    });
    const invites = state.invitations.filter(i => i.sponsorId === u.id && i.status === 'PENDING' && new Date(i.expiresAt) > new Date())
      .map(i => ({ id: i.id, code: i.code, invitedPhone: i.invitedPhone, expiresAt: i.expiresAt }));
    res.json({ success: true, partners, invites });
  });

  /** A broker invites a local partner; an admin still approves the account (KYC) before it can submit referrals. */
  r.post('/my-partners/invite', needs('connector:sponsor'), rateLimit('sponsor-invite', 30, 24 * 60 * 60_000), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    if (u.verificationStatus !== 'VERIFIED') return res.status(403).json({ error: 'Your account must be verified first' });
    const p = phoneSchema.safeParse(req.body?.phone);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || 'Valid 10-digit mobile number required' });
    const state = db.getState();
    const phone = digits(p.data);
    if (state.users.some(x => digits(x.phone) === phone)) return res.status(409).json({ error: 'This mobile number is already registered on GENZ' });
    const email = `${phone}@phone.genz.local`;
    const open = state.invitations.find(i => i.invitedEmail === email && i.status === 'PENDING' && new Date(i.expiresAt) > new Date());
    if (open) return res.status(409).json({ error: `An invitation (${open.code}) is already pending for this number` });
    const code = `GZ-GEN-${secureCode(9)}`;
    const inv = {
      id: `INV-${Date.now()}`, code, invitedEmail: email, invitedPhone: p.data, targetRole: 'GENZ_CONNECTOR' as const,
      issuedBy: u.id, sponsorId: u.id, status: 'PENDING' as const,
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(), createdAt: nowIso(),
    };
    state.invitations.unshift(inv);
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', inv.id, 'PARTNER_INVITED_BY_BROKER', `${u.name} invited a local partner (${p.data}) into their referral network`);
    res.json({ success: true, invitation: { id: inv.id, code, invitedPhone: inv.invitedPhone, expiresAt: inv.expiresAt } });
  });

  r.get('/settings', needs('connector:manage', 'connector:settings'), (_req: Request, res: Response) => {
    const s = db.getState().settings;
    res.json({ success: true, enabled: s.connectorProgramEnabled !== false, rewards: s.connectorRewards || DEFAULT_REWARDS, maxSharePct: s.connectorMaxSharePct ?? DEFAULT_MAX_SHARE_PCT });
  });

  r.put('/settings', needs('connector:settings'), (req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const s = db.getState().settings;
    const rewards: Record<string, number> = { ...(s.connectorRewards || DEFAULT_REWARDS) };
    for (const t of REFERRAL_TYPES) {
      const v = req.body?.rewards?.[t.id];
      if (v === undefined) continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > MAX_REWARD) return res.status(400).json({ error: `Reward for ${t.label} must be between 0 and ${MAX_REWARD}` });
      rewards[t.id] = Math.round(n);
    }
    s.connectorRewards = rewards;
    if (typeof req.body?.enabled === 'boolean') s.connectorProgramEnabled = req.body.enabled;
    if (req.body?.maxSharePct !== undefined) {
      const m = Number(req.body.maxSharePct);
      if (!Number.isFinite(m) || m < 1 || m > 50) return res.status(400).json({ error: 'The highest share % must be between 1 and 50' });
      s.connectorMaxSharePct = Math.round(m * 10) / 10;
    }
    db.save();
    db.appendAuditEvent(u.id, u.role, 'SYSTEM', 'CONNECTOR-SETTINGS', 'CONNECTOR_SETTINGS_UPDATED', `Programme ${s.connectorProgramEnabled ? 'on' : 'paused'}; reward table updated`);
    res.json({ success: true, enabled: s.connectorProgramEnabled !== false, rewards, maxSharePct: s.connectorMaxSharePct ?? DEFAULT_MAX_SHARE_PCT });
  });

  return r;
}
