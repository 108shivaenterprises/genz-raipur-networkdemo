import { z } from 'zod';
import crypto from 'node:crypto';
import { isSafeUrl } from './auth.js';

/**
 * v28 — readable validation messages. zod's own words ("Too small: expected string to have >=5 characters",
 * "Invalid option: expected one of …") reached members as-is and did not say WHICH box was wrong.
 * Messages written in a schema (`{ message: '…' }`) are kept; only zod's defaults are replaced.
 */
const FIELD_NAMES: Record<string, string> = {
  exactAddressHidden: 'Exact address', addressHidden: 'Exact address', approximateLocation: 'Approximate location', scopeDescription: 'Scope of work',
  customerNameMasked: 'Customer name', customerPhoneHidden: 'Customer mobile', customerName: 'Customer name', customerPhone: 'Customer mobile',
  ownerName: 'Owner name', ownerPhone: 'Owner mobile', askingPrice: 'Asking price', ownerApprovedNetPrice: 'Owner net price', estimatedBudget: 'Budget',
  budgetMin: 'Minimum budget', budgetMax: 'Maximum budget', preferredLocalities: 'Preferred localities', builtUpAreaSqFt: 'Built-up area', plotAreaSqFt: 'Plot area',
  referralCommissionPct: 'Referral commission %', protectionPeriodDays: 'Protection days', propertyType: 'Property type', transactionType: 'Sale / rent',
};
const fieldName = (k: string) => FIELD_NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/Sq Ft/, 'sq ft').replace(/Pct$/, '%');
z.config({
  customError: (iss: any) => {
    const last = Array.isArray(iss.path) && iss.path.length ? iss.path[iss.path.length - 1] : undefined;
    const name = typeof last === 'string' ? fieldName(last) : '';
    if (!name) return undefined;
    switch (iss.code) {
      case 'too_small':
        if (iss.origin === 'string') return Number(iss.minimum) <= 1 ? `${name} is required` : `${name}: write at least ${iss.minimum} characters`;
        if (iss.origin === 'array') return `${name}: add at least ${iss.minimum}`;
        return `${name} must be ${iss.inclusive === false ? 'more than' : 'at least'} ${iss.minimum}`;
      case 'too_big':
        if (iss.origin === 'string') return `${name}: at most ${iss.maximum} characters`;
        if (iss.origin === 'array') return `${name}: at most ${iss.maximum}`;
        return `${name} must be at most ${iss.maximum}`;
      case 'invalid_type': return iss.input === undefined || iss.input === null || iss.input === '' ? `${name} is required` : `${name} is not valid`;
      case 'invalid_value': return `${name}: choose one of the given options`;
      case 'invalid_format': return `${name} is not in the right format`;
      default: return undefined;
    }
  },
});

const MAX_MONEY = 100_000_000_000; // ₹10,000 Cr sanity ceiling
const safeUrl = z.string().max(2048).refine(isSafeUrl, { message: 'Only http(s) URLs are allowed' });
const optionalSafeUrl = z.union([z.literal(''), safeUrl]).optional();
import { PROPERTY_TYPES, findState, isPincode, cleanTags } from '../src/shared/india.js';

/** A real Indian state / UT (English or Hindi name) → canonical English name. */
const stateField = z.string().trim().min(2, 'Select the state / UT').max(80)
  .refine(v => !!findState(v), { message: 'Select a valid Indian state or union territory' })
  .transform(v => findState(v)!.name);
const pincodeField = z.string().trim().max(10)
  .refine(v => v === '' || isPincode(v), { message: 'Pincode must be a valid 6-digit Indian PIN code' });
const tagsField = z.array(z.string().max(60)).max(30).optional().transform(v => cleanTags(v ?? []));

// Indian Phone Number Validator: +91 followed by 10 digits starting with 6-9, or 10 digits
export const indianPhoneRegex = /^(?:(?:\+91[\s-]?)?[6789]\d{9})$/;

export const phoneSchema = z.string().refine(val => indianPhoneRegex.test(val.replace(/\s+/g, '')), {
  message: 'Please provide a valid Indian 10-digit mobile number (+91 9XXXX XXXXX)',
});

export const propertyCreateSchema = z.object({
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(160),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
  propertyType: z.enum(PROPERTY_TYPES),
  transactionType: z.enum(['Sale', 'Rent', 'Lease']),
  state: stateField,
  city: z.string().trim().min(2, 'City / town is required').max(80),
  district: z.string().max(80).optional(),
  tehsil: z.string().max(80).optional(),
  village: z.string().max(80).optional(),
  street: z.string().max(200).optional(),
  pincode: pincodeField.optional(),
  tags: tagsField,
  locality: z.string().trim().min(2, 'Locality is required (e.g. Koramangala, Shankar Nagar, Andheri West)').max(80),
  addressHidden: z.string().trim().min(5, 'Specific address is required for confidential verification').max(300),
  landmark: z.string().max(200).optional().default(''),
  googleMapsUrl: optionalSafeUrl,
  googleMapsDirectionsUrl: optionalSafeUrl,
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationPrecision: z.enum(['APPROXIMATE_LOCALITY', 'GENERAL_AREA', 'EXACT_PIN']).optional().default('APPROXIMATE_LOCALITY'),
  videoUrl: optionalSafeUrl,
  images: z.array(safeUrl).max(30).optional(),
  plotAreaSqFt: z.number().nonnegative().max(100_000_000).optional(),
  builtUpAreaSqFt: z.number().nonnegative().max(100_000_000).optional(),
  askingPrice: z.number().positive('Asking price must be a positive number in INR').max(MAX_MONEY),
  ownerApprovedNetPrice: z.number().positive('Owner approved net price must be a positive number in INR').max(MAX_MONEY),
  ownerName: z.string().trim().min(2, 'Owner name is required').max(120),
  ownerPhone: phoneSchema,
  // Admins creating on behalf of someone must name the principals explicitly (no silent default broker/owner).
  ownerId: z.string().optional(),
  listingBrokerId: z.string().optional(),
}).refine(d => d.ownerApprovedNetPrice <= d.askingPrice * 1.0001, {
  message: 'Owner-approved net price cannot exceed the advertised asking price',
  path: ['ownerApprovedNetPrice'],
});

/** Whitelisted, validated fields for PUT /api/properties/:id (no mass-assignment). */
export const propertyUpdateSchema = z.object({
  title: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(5000),
  propertyType: z.enum(PROPERTY_TYPES),
  transactionType: z.enum(['Sale', 'Rent', 'Lease']),
  city: z.string().trim().min(2).max(80),
  state: stateField,
  district: z.string().max(80),
  tags: tagsField,
  locality: z.string().trim().min(2).max(80),
  landmark: z.string().max(200),
  village: z.string().max(80),
  street: z.string().max(200),
  pincode: pincodeField,
  addressHidden: z.string().trim().min(5).max(300),
  googleMapsUrl: optionalSafeUrl,
  videoUrl: optionalSafeUrl,
  builtUpAreaSqFt: z.coerce.number().nonnegative().max(100_000_000),
  plotAreaSqFt: z.coerce.number().nonnegative().max(100_000_000),
  askingPrice: z.coerce.number().positive().max(MAX_MONEY),
  ownerApprovedNetPrice: z.coerce.number().positive().max(MAX_MONEY),
  ownerName: z.string().trim().min(2).max(120),
  ownerPhone: phoneSchema,
  listingStatus: z.enum(['draft', 'active', 'under_negotiation', 'withdrawn']),
  images: z.array(safeUrl).max(30),
  priceChangeReason: z.string().max(300),
}).partial();

export const projectCreateSchema = z.object({
  projectName: z.string().trim().min(3, 'Project name is required').max(120),
  tagline: z.string().trim().max(200).optional(),
  locality: z.string().trim().min(2, 'Locality is required').max(80),
  reraNumber: z.string().trim().min(5, 'RERA registration number is required').max(60),
  projectType: z.enum(['Luxury High-Rise', 'Gated Plotted Enclave', 'Commercial Mall & Business Hub', 'Ultra-Luxury Villas']).optional(),
  projectStage: z.enum(['Pre-Launch / Upcoming', 'Under Construction', 'Ready to Move']).optional(),
  state: stateField.optional(),
  city: z.string().trim().min(2).max(80).optional(),
  completionTarget: z.string().trim().max(60).optional(),
  totalUnits: z.coerce.number().int().min(1).max(10000).optional(),
  priceStartingFrom: z.coerce.number().positive('Starting price is required').max(MAX_MONEY),
  priceMax: z.coerce.number().positive().max(MAX_MONEY).optional(),
  channelPartnerCommissionPct: z.coerce.number().min(0.1).max(10).optional(),
  earlyBirdIncentiveBonusPct: z.coerce.number().min(0).max(5).optional(),
  siteAddress: z.string().trim().max(300).optional(),
  unitConfigurations: z.array(z.string().trim().max(120)).max(20).optional(),
  amenities: z.array(z.string().trim().max(80)).max(40).optional(),
}).refine(d => !d.priceMax || d.priceMax >= d.priceStartingFrom, { message: 'Maximum price must be ≥ starting price', path: ['priceMax'] });

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31');
export const bonusSchemeSchema = z.object({
  enabled: z.boolean(),
  windowFrom: isoDay.optional().or(z.literal('')),
  windowTo: isoDay.optional().or(z.literal('')),
  qualifyCollectionPct: z.number().min(0).max(100),
  note: z.string().trim().max(200).optional(),
  slabs: z.array(z.object({
    id: z.string().max(20).optional(),
    level: z.enum(['INDIVIDUAL', 'PROJECT']),
    minUnits: z.number().int().min(1).max(1000),
    kind: z.enum(['EXTRA_PCT', 'LUMP_SUM']),
    value: z.number().positive().max(MAX_MONEY),
  })).max(10),
}).superRefine((d, ctx) => {
  if (d.windowFrom && d.windowTo && d.windowTo < d.windowFrom) ctx.addIssue({ code: 'custom', path: ['windowTo'], message: 'End date must be on or after the start date' });
  const seen = new Set<string>();
  d.slabs.forEach((s, i) => {
    const k = `${s.level}:${s.minUnits}`;
    if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['slabs', i], message: `Two ${s.level.toLowerCase()} slabs have the same unit count (${s.minUnits})` });
    seen.add(k);
    if (s.kind === 'EXTRA_PCT' && (s.value < 0.05 || s.value > 5)) ctx.addIssue({ code: 'custom', path: ['slabs', i, 'value'], message: 'Extra commission must be between 0.05% and 5%' });
  });
  if (d.enabled && d.slabs.length === 0) ctx.addIssue({ code: 'custom', path: ['slabs'], message: 'Add at least one slab, or switch the scheme off' });
});

export const loginSchema = z.object({
  /** e-mail, or the 10-digit mobile number for accounts that have no e-mail (GENZ Connectors) */
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
  code: z.string().trim().min(6).max(60),
  name: z.string().trim().min(2, 'Name is required').max(120),
  /** optional only for GENZ Connector invitations (many local partners have no e-mail; they sign in with their mobile number) */
  email: z.string().trim().email('A valid e-mail address is required').max(200).optional().or(z.literal('')),
  shopType: z.string().max(40).optional(),
  shopName: z.string().trim().max(100).optional(),
  locality: z.string().trim().max(80).optional(),
  /** v90 — the areas of the city this person works in (brokers, builders…), so the network knows who is where */
  areas: z.array(z.string().trim().max(80)).max(10).optional(),
  payoutUpi: z.string().trim().max(80).optional(),
  phone: phoneSchema,
  companyName: z.string().trim().max(160).optional(),
  reraNumber: z.string().trim().max(60).optional(),
  password: z.string().max(128),
  state: stateField.optional(),
  city: z.string().trim().max(80).optional(),
  panNumber: z.string().trim().max(20).optional(),
  gstin: z.string().trim().max(20).optional(),
  /** v18 — brokers: 12-digit Aadhaar typed once; only the last 4 digits are kept (see src/shared/idRules.ts) */
  aadhaarNumber: z.string().trim().max(20).optional(),
  idConsent: z.boolean().optional(),
  /** v25 — the tick for keeping the FULL Aadhaar + address in the encrypted vault, the address, its PIN, and how they were entered */
  kycConsent: z.boolean().optional(),
  address: z.string().max(800).optional(),
  pincode: z.string().max(12).optional(),
  kycSource: z.enum(['TYPED', 'PHOTO', 'MIXED']).optional(),
  consent: z.literal(true, { message: 'You must accept the Privacy Policy and Terms to join' }),
  policyVersion: z.string().max(20).optional(),
});

export const inviteCreateSchema = z.object({
  invitedEmail: z.string().trim().email('A valid e-mail address is required').max(200).optional().or(z.literal('')),
  invitedPhone: phoneSchema,
  targetRole: z.enum([
    'ADMIN',
    'SUPERADMIN',
    'BROKER',
    'PROPERTY_OWNER',
    'BUYER_TENANT',
    'CONTRACTOR',
    'DEVELOPER_BUILDER',
    'LEGAL_COUNSEL',
    'GENZ_CONNECTOR',
  ]),
}).refine(d => d.targetRole === 'GENZ_CONNECTOR' || !!d.invitedEmail, { message: 'A valid e-mail address is required', path: ['invitedEmail'] });

export const requirementCreateSchema = z.object({
  customerName: z.string().trim().min(2, 'Customer name is required').max(120),
  customerPhone: phoneSchema,
  budgetMin: z.number().positive('Minimum budget must be positive').max(MAX_MONEY),
  budgetMax: z.number().positive('Maximum budget must be positive').max(MAX_MONEY),
  state: stateField.optional(),
  city: z.string().trim().min(2, 'City is required').max(80),
  preferredLocalities: z.array(z.string().trim().max(80)).min(1, 'At least one preferred locality is required').max(10),
  preferredTags: tagsField,
  propertyType: z.enum(PROPERTY_TYPES),
  transactionType: z.enum(['Sale', 'Rent', 'Lease']),
  minAreaSqFt: z.number().nonnegative().optional(),
  maxAreaSqFt: z.number().nonnegative().optional(),
  purpose: z.enum(['Self-use', 'Investment', 'Rental Yield', 'Commercial Relocation']),
  urgency: z.enum(['Immediate (< 15 days)', 'Moderate (1-3 months)', 'Exploratory (3-6 months)']),
}).refine(data => data.budgetMax >= data.budgetMin, {
  message: 'Maximum budget must be greater than or equal to minimum budget',
  path: ['budgetMax'],
});

export const commissionSplitSchema = z.object({
  introducingBrokerSharePct: z.number().min(0).max(100),
  closingBrokerSharePct: z.number().min(0).max(100),
}).refine(data => Math.abs(data.introducingBrokerSharePct + data.closingBrokerSharePct - 100) < 0.001, {
  message: 'Commission allocation shares must add up to exactly 100%',
});

export const collaborationOfferSchema = z.object({
  propertyId: z.string(),
  requirementId: z.string().optional(),
  receivingBrokerId: z.string().optional().default(''),
  proposedIntroducingShare: z.number().min(0).max(100).optional(),
  proposedClosingShare: z.number().min(0).max(100).optional(),
  /** v41 — OWN_SIDE: no split, each broker keeps the fee of his own client */
  feeMode: z.enum(['SPLIT', 'OWN_SIDE']).optional().default('SPLIT'),
  proposerSide: z.enum(['SELLER', 'BUYER']).optional(),
  terms: z.string().min(5, 'Terms and brokerage split notes required').max(2000),
}).refine(data => data.feeMode === 'OWN_SIDE'
  || (data.proposedIntroducingShare !== undefined && data.proposedClosingShare !== undefined
    && Math.abs(data.proposedIntroducingShare + data.proposedClosingShare - 100) < 0.001), {
  message: 'Proposed commission allocations must equal exactly 100%',
}).refine(data => data.feeMode !== 'OWN_SIDE' || !!data.proposerSide, {
  message: 'Say which side you act for: seller or buyer',
});

export const siteVisitCreateSchema = z.object({
  dealRoomId: z.string().optional().default(''),
  propertyId: z.string(),
  customerName: z.string().trim().min(1, 'Customer name is required').max(120),
  customerPhone: z.union([z.literal(''), phoneSchema]).optional().default(''),
  scheduledTime: z.string().min(1, 'Visit time is required').refine(v => !Number.isNaN(Date.parse(v)), 'Invalid visit date/time'),
  notes: z.string().max(1000).optional().default(''),
  scanAt: z.enum(['PROPERTY', 'MEET']).optional(),
  /** v40 — booked from a Client Room: the room, the home and (optionally) the client's visit request it answers */
  clientRoomId: z.string().max(40).optional(),
  clientRoomItemId: z.string().max(40).optional(),
  clientRoomRequestId: z.string().max(40).optional(),
});

export const ownerMandateCreateSchema = z.object({
  propertyId: z.string(),
  /** public asking price; defaults to the listing's current asking price */
  advertisedPrice: z.number().positive().max(MAX_MONEY).optional(),
  /** how the listing broker is paid: surplus above the owner's net amount, a % commission, or a flat fee */
  remunerationBasis: z.enum(['SURPLUS_ABOVE_NET', 'PERCENTAGE', 'FIXED_FEE']).default('SURPLUS_ABOVE_NET'),
  /** SURPLUS_ABOVE_NET: the owner's FIXED final / net amount — anything realised above it belongs to the listing broker */
  approvedNetPrice: z.number().positive().max(MAX_MONEY).optional(),
  /** PERCENTAGE: commission % of the final price, paid by the owner */
  commissionPct: z.number().min(0.1, 'Commission must be at least 0.1%').max(10, 'Commission cannot exceed 10%').optional(),
  /** FIXED_FEE: flat brokerage in ₹, paid by the owner whatever the final price */
  fixedFeeAmount: z.number().positive().max(MAX_MONEY).optional(),
  protectionPeriodDays: z.number().int().min(7).max(730).optional(), // v26: the superadmin's maximum is checked in the route
  password: z.string().max(200).optional(),
}).superRefine((d, ctx) => {
  if (d.remunerationBasis === 'SURPLUS_ABOVE_NET' && !d.approvedNetPrice) ctx.addIssue({ code: 'custom', path: ['approvedNetPrice'], message: 'Enter the fixed net amount you want to receive' });
  if (d.remunerationBasis === 'PERCENTAGE' && !d.commissionPct) ctx.addIssue({ code: 'custom', path: ['commissionPct'], message: 'Enter the commission percentage' });
  if (d.remunerationBasis === 'FIXED_FEE' && !d.fixedFeeAmount) ctx.addIssue({ code: 'custom', path: ['fixedFeeAmount'], message: 'Enter the fixed brokerage amount' });
});

export const constructionLeadCreateSchema = z.object({
  title: z.string().trim().min(5).max(160),
  projectType: z.enum([
    'Turnkey Residential',
    'Commercial Interior Fitout',
    'Renovation & Remodel',
    'Structural Expansion',
    'Architectural Sanction',
  ]),
  approximateLocation: z.string().trim().min(3).max(160),
  exactAddressHidden: z.string().trim().min(5).max(300),
  estimatedBudget: z.number().positive().max(MAX_MONEY),
  scopeDescription: z.string().trim().min(10).max(3000),
  timeline: z.string().trim().min(2).max(120),
  customerNameMasked: z.string().trim().min(2).max(120),
  customerPhoneHidden: phoneSchema,
  referralCommissionPct: z.number().min(0.5).max(10).default(1),
  // DPDP: the broker must confirm the customer agreed to share their details for this enquiry.
  customerConsent: z.literal(true, { message: 'Confirm that the customer agreed to share their details' }),
});

export const disputeCreateSchema = z.object({
  dealRoomId: z.string().optional(),
  leadId: z.string().optional(),
  counterpartyId: z.string().min(1),
  counterpartyName: z.string().max(160).optional().default(''),
  reason: z.enum([
    'BYPASS_ATTEMPT',
    'COMMISSION_NON_PAYMENT',
    'FALSE_REPRESENTATION',
    'UNAUTHORIZED_CONTACT',
    'OTHER',
  ]),
  description: z.string().trim().min(15, 'Please provide detailed factual description of the dispute').max(4000),
  evidenceLinks: z.array(safeUrl).max(10).optional().default([]),
});

// Helper to mask phone numbers: +91 98261 44001 -> +91 98261 •••••
export function maskPhoneNumber(phone: string): string {
  if (!phone) return '••••••••••';
  // audit F7 — one mask everywhere: only the LAST 4 digits (shop leads, visit acks and partners show the same 4),
  // so two masked views of one person never add up to more than 4 digits
  const d = phone.replace(/\D/g, '');
  if (d.length < 6) return '••••••';
  return `${/^\s*\+91/.test(phone) || (d.length === 12 && d.startsWith('91')) ? '+91 ' : ''}••••••${d.slice(-4)}`;
}

// Helper to format Indian Currency
export function formatINR(val: number): string {
  if (isNaN(val)) return '₹0';
  if (val >= 10000000) {
    const cr = (val / 10000000).toFixed(2);
    return `₹${cr.replace(/\.00$/, '')} Cr`;
  }
  if (val >= 100000) {
    const lakh = (val / 100000).toFixed(2);
    return `₹${lakh.replace(/\.00$/, '')} Lakh`;
  }
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
}

// Generate secure random 6-digit verification code
export function generateOtp(): string {
  return crypto.randomInt(100000, 1000000).toString(); // CSPRNG (Math.random is predictable)
}

// Cryptographic mandate sealing
export function generateMandateHash(data: {
  propertyId: string;
  ownerId: string;
  approvedNetPrice: number;
  agreedCommissionPct?: number;
  remunerationBasis?: string;
  fixedFeeAmount?: number;
  timestamp: string;
}): string {
  const payload = `${data.propertyId}:${data.ownerId}:${data.approvedNetPrice}:${data.agreedCommissionPct ?? 0}:${data.remunerationBasis ?? 'SURPLUS_ABOVE_NET'}:${data.fixedFeeAmount ?? 0}:${data.timestamp}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}
