/**
 * v16.8 — pure rules for the unit / plot grid: features, rate changes, "who may see", team posts, share text.
 * No server imports, so the unit tests and the browser use exactly the same code.
 *
 * Privacy line: a unit carries only property facts (road sides, facing, size, price). Never a buyer's or owner's details.
 */

// ───────────────────────── facts a unit can carry ─────────────────────────
export const FACINGS = [
  { id: 'EAST', en: 'East', hi: 'पूर्व' }, { id: 'WEST', en: 'West', hi: 'पश्चिम' },
  { id: 'NORTH', en: 'North', hi: 'उत्तर' }, { id: 'SOUTH', en: 'South', hi: 'दक्षिण' },
  { id: 'NORTH_EAST', en: 'North-East', hi: 'उत्तर-पूर्व' }, { id: 'NORTH_WEST', en: 'North-West', hi: 'उत्तर-पश्चिम' },
  { id: 'SOUTH_EAST', en: 'South-East', hi: 'दक्षिण-पूर्व' }, { id: 'SOUTH_WEST', en: 'South-West', hi: 'दक्षिण-पश्चिम' },
] as const;
export type Facing = typeof FACINGS[number]['id'];

/** Tags a builder can put on a unit. `kind` says where it fits (plot / flat / both). */
export const UNIT_FEATURES = [
  { id: 'CORNER', en: 'Corner', hi: 'कॉर्नर', kind: 'both' },
  { id: 'PARK_FACING', en: 'Park facing', hi: 'पार्क फ़ेसिंग', kind: 'both' },
  { id: 'MAIN_ROAD', en: 'Main-road facing', hi: 'मेन रोड फ़ेसिंग', kind: 'both' },
  { id: 'VASTU', en: 'Vastu-friendly', hi: 'वास्तु अनुकूल', kind: 'both' },
  { id: 'GARDEN_VIEW', en: 'Garden view', hi: 'गार्डन व्यू', kind: 'both' },
  { id: 'WATER_VIEW', en: 'Lake / pool view', hi: 'झील / पूल व्यू', kind: 'both' },
  { id: 'END_UNIT', en: 'End unit', hi: 'अंतिम यूनिट', kind: 'both' },
  { id: 'CLUBHOUSE_NEAR', en: 'Near clubhouse', hi: 'क्लबहाउस के पास', kind: 'both' },
  { id: 'TERRACE', en: 'Private terrace', hi: 'निजी टैरेस', kind: 'flat' },
  { id: 'PENTHOUSE', en: 'Penthouse', hi: 'पेंटहाउस', kind: 'flat' },
  { id: 'COVERED_PARKING', en: 'Covered parking', hi: 'ढकी पार्किंग', kind: 'flat' },
  { id: 'SERVANT_ROOM', en: 'Servant room', hi: 'सर्वेंट रूम', kind: 'flat' },
  { id: 'PRIVATE_GARDEN', en: 'Private garden', hi: 'निजी बगीचा', kind: 'flat' },
  { id: 'REGULAR_SHAPE', en: 'Regular shape', hi: 'सीधा / नियमित आकार', kind: 'plot' },
] as const;
export type UnitFeatureId = typeof UNIT_FEATURES[number]['id'];
const FEATURE_IDS = new Set<string>(UNIT_FEATURES.map(f => f.id));
export const MAX_FEATURES = 12;
export const NOTE_MAX = 200;

const tok = (s: string) => String(s).trim().toLowerCase().replace(/[\s_\-\/]+/g, ' ');
/** Sheet cells say "Park facing", "park_facing" or "पार्क फ़ेसिंग" — all map to the tag id. */
export const parseFeature = (t: string): string | undefined => UNIT_FEATURES.find(f => tok(f.id) === tok(t) || tok(f.en) === tok(t) || f.hi === String(t).trim())?.id;
export const parseFacing = (t: string): string | undefined => FACINGS.find(f => tok(f.id) === tok(t) || tok(f.en) === tok(t) || f.hi === String(t).trim())?.id;

export const featureLabel = (id: string, hi: boolean) => { const f = UNIT_FEATURES.find(x => x.id === id); return f ? (hi ? f.hi : f.en) : id; };
export const facingLabel = (id: string | undefined, hi: boolean) => { const f = FACINGS.find(x => x.id === id); return f ? (hi ? f.hi : f.en) : ''; };

/** "3 side open" — the open-sides count a plot buyer asks about first. */
export const roadSidesLabel = (n: number | undefined, hi: boolean) => (!n ? '' : hi ? `${n} तरफ़ सड़क` : `${n}-side road`);

export interface UnitDetail {
  facing?: Facing;
  /** how many sides of the plot / unit touch a road (1–4) */
  roadSides?: 1 | 2 | 3 | 4;
  roadWidthFt?: number;
  /** e.g. "30 x 50 ft" */
  dimensions?: string;
  features?: string[];
  note?: string;
}

/** Sanitise the property facts a builder sends. Fields that are absent stay as they are; `null` clears one. */
export function cleanUnitDetail(input: any): Partial<Record<keyof UnitDetail, any>> | string {
  const out: Partial<Record<keyof UnitDetail, any>> = {};
  if (input.facing !== undefined) {
    if (input.facing === null || input.facing === '') out.facing = null;
    else if (!FACINGS.some(f => f.id === input.facing)) return 'Pick a valid facing direction';
    else out.facing = input.facing;
  }
  if (input.roadSides !== undefined) {
    if (input.roadSides === null || input.roadSides === '') out.roadSides = null;
    else { const n = Number(input.roadSides); if (![1, 2, 3, 4].includes(n)) return 'Road sides must be 1, 2, 3 or 4'; out.roadSides = n; }
  }
  if (input.roadWidthFt !== undefined) {
    if (input.roadWidthFt === null || input.roadWidthFt === '') out.roadWidthFt = null;
    else { const n = Number(input.roadWidthFt); if (!Number.isFinite(n) || n < 6 || n > 300) return 'Road width must be between 6 and 300 ft'; out.roadWidthFt = Math.round(n * 10) / 10; }
  }
  if (input.dimensions !== undefined) {
    const d = String(input.dimensions ?? '').trim();
    if (d.length > 24) return 'Dimensions can be at most 24 characters (e.g. 30 x 50 ft)';
    out.dimensions = d || null;
  }
  if (input.features !== undefined) {
    if (!Array.isArray(input.features)) return 'Features must be a list';
    const f = [...new Set(input.features.map(String))] as string[];
    if (f.length > MAX_FEATURES) return `At most ${MAX_FEATURES} features per unit`;
    if (f.some(x => !FEATURE_IDS.has(x))) return 'Unknown feature tag';
    out.features = f;
  }
  if (input.note !== undefined) {
    const n = String(input.note ?? '').trim();
    if (n.length > NOTE_MAX) return `Note can be at most ${NOTE_MAX} characters`;
    out.note = n || null;
  }
  return out;
}

/** What the "corner" tag and the road-sides number say together — a 2-side plot is a corner by definition. */
export function impliedFeatures(d: { roadSides?: number; features?: string[] }): string[] {
  const f = new Set(d.features || []);
  if ((d.roadSides || 0) >= 2) f.add('CORNER');
  return [...f];
}

// ───────────────────────── rate changes ─────────────────────────
export type RateMode = 'PCT' | 'FLAT' | 'PER_SQFT' | 'SET_PER_SQFT';
export interface RateRule { mode: RateMode; value: number }
export const RATE_PCT_MAX = 40;            // per action, either direction — repeat if more is really meant
export const RATE_FLAT_MAX = 50_000_000;   // ₹5 crore
export const RATE_PER_SQFT_MAX = 50_000;
export const PRICE_MAX = 100_000_000_000;
export const PRICE_HISTORY_KEEP = 10;

export const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export function validateRule(rule: any): RateRule | string {
  if (!rule || !['PCT', 'FLAT', 'PER_SQFT', 'SET_PER_SQFT'].includes(rule.mode)) return 'Pick how to change the rate';
  const v = Number(rule.value);
  if (!Number.isFinite(v) || v === 0) return 'Enter the amount to change by';
  if (rule.mode === 'PCT' && Math.abs(v) > RATE_PCT_MAX) return `A single change can be at most ±${RATE_PCT_MAX}%`;
  if (rule.mode === 'FLAT' && Math.abs(v) > RATE_FLAT_MAX) return 'That flat change is too large';
  if (rule.mode === 'PER_SQFT' && Math.abs(v) > RATE_PER_SQFT_MAX) return 'That per-sq-ft change is too large';
  if (rule.mode === 'SET_PER_SQFT' && (v < 100 || v > 1_000_000)) return 'Rate per sq ft must be between ₹100 and ₹10,00,000';
  return { mode: rule.mode, value: v };
}

/** New price for one unit under a rule, or a reason it cannot be computed. */
export function adjustedPrice(price: number, areaSqft: number | undefined, rule: RateRule): number | string {
  let next: number;
  switch (rule.mode) {
    case 'PCT': next = roundTo(price * (1 + rule.value / 100), 1000); break;
    case 'FLAT': next = roundTo(price + rule.value, 1000); break;
    case 'PER_SQFT': if (!areaSqft) return 'no area'; next = roundTo(price + rule.value * areaSqft, 1000); break;
    case 'SET_PER_SQFT': if (!areaSqft) return 'no area'; next = Math.round(rule.value * areaSqft); break;
  }
  if (!Number.isFinite(next) || next < 10_000) return 'price would be too low';
  if (next > PRICE_MAX) return 'price would be too high';
  return next;
}

export interface RateChange { id: string; label: string; from: number; to: number }
export interface RatePreview { changes: RateChange[]; skipped: { id: string; label: string; why: string }[] }

/** Units whose rate is locked (held / booked) are skipped, never silently changed. */
export function previewRateChange(units: { id: string; label: string; price: number; areaSqft?: number; status: string }[], rule: RateRule): RatePreview {
  const changes: RateChange[] = []; const skipped: RatePreview['skipped'] = [];
  for (const u of units) {
    if (u.status === 'BOOKED' || u.status === 'HOLD') { skipped.push({ id: u.id, label: u.label, why: u.status === 'BOOKED' ? 'booked' : 'on hold' }); continue; }
    const n = adjustedPrice(u.price, u.areaSqft, rule);
    if (typeof n === 'string') { skipped.push({ id: u.id, label: u.label, why: n }); continue; }
    if (n === u.price) { skipped.push({ id: u.id, label: u.label, why: 'no change' }); continue; }
    changes.push({ id: u.id, label: u.label, from: u.price, to: n });
  }
  return { changes, skipped };
}

export const ratePerSqft = (price: number, areaSqft?: number) => (areaSqft && areaSqft > 0 ? Math.round(price / areaSqft) : undefined);

// ───────────────────────── who may see a unit ─────────────────────────
export interface UnitVis {
  /** ALL = every active partner; SELECTED = only the listed partners; HIDDEN = builder (and admin) only */
  audience: 'ALL' | 'SELECTED' | 'HIDDEN';
  brokerIds: string[];
  /** partners see "price on request" instead of the rate */
  priceHidden: boolean;
}
export const DEFAULT_VIS: UnitVis = { audience: 'ALL', brokerIds: [], priceHidden: false };
export const MAX_SELECTED_PARTNERS = 200;

export function cleanVis(input: any, fallback: UnitVis = DEFAULT_VIS): UnitVis | string {
  const out: UnitVis = { audience: fallback.audience, brokerIds: [...fallback.brokerIds], priceHidden: fallback.priceHidden };
  if (input.audience !== undefined) {
    if (!['ALL', 'SELECTED', 'HIDDEN'].includes(input.audience)) return 'Audience must be ALL, SELECTED or HIDDEN';
    out.audience = input.audience;
  }
  if (input.brokerIds !== undefined) {
    if (!Array.isArray(input.brokerIds) || input.brokerIds.length > MAX_SELECTED_PARTNERS || input.brokerIds.some((x: unknown) => typeof x !== 'string' || x.length > 40)) return 'Invalid partner list';
    out.brokerIds = [...new Set(input.brokerIds as string[])];
  }
  if (input.priceHidden !== undefined) {
    if (typeof input.priceHidden !== 'boolean') return 'priceHidden must be true or false';
    out.priceHidden = input.priceHidden;
  }
  if (out.audience === 'SELECTED' && out.brokerIds.length === 0) return 'Pick at least one partner, or choose "all partners"';
  if (out.audience !== 'SELECTED') out.brokerIds = [];
  return out;
}

export const effectiveVis = (unitVis?: UnitVis, projectVis?: UnitVis): UnitVis => unitVis ?? projectVis ?? DEFAULT_VIS;
export const partnerMaySee = (vis: UnitVis, brokerId: string) => vis.audience === 'ALL' || (vis.audience === 'SELECTED' && vis.brokerIds.includes(brokerId));

// ───────────────────────── team access ─────────────────────────
export type InvMode = 'OFF' | 'SHARED' | 'ALL';
export interface InvPolicy { invMode: InvMode; invPrice: boolean; invFeatures: boolean; invShareOut: boolean }
export const DEFAULT_INV_POLICY: InvPolicy = { invMode: 'OFF', invPrice: false, invFeatures: true, invShareOut: false };

export interface TeamPost {
  id: string; employerId: string; projectId: string;
  unitIds: string[]; memberIds: string[];           // memberIds empty = the whole team
  showPrice: boolean; showFeatures: boolean;
  note: string; createdBy: string; createdByName: string; createdAt: string;
  endsAt?: string; active: boolean;
}
export const MAX_POST_UNITS = 60;
export const MAX_ACTIVE_POSTS = 50;
export const postIsLive = (p: Pick<TeamPost, 'active' | 'endsAt'>, now = Date.now()) => p.active && (!p.endsAt || Date.parse(p.endsAt) > now);
export const postCovers = (p: TeamPost, unitId: string, memberId: string, now = Date.now()) =>
  postIsLive(p, now) && p.unitIds.includes(unitId) && (p.memberIds.length === 0 || p.memberIds.includes(memberId));

/**
 * What one employee may see of one unit. `viewerSeesPrice` is whether his EMPLOYER can see the price at all
 * (a partner never sees a price the builder hid). Every live post that covers the unit must allow price / features —
 * the most restrictive wins, so a boss who once hid the price is never overridden by an older post.
 */
export function memberView(policy: InvPolicy, posts: TeamPost[], unitId: string, memberId: string, viewerSeesPrice: boolean, now = Date.now()):
  { visible: boolean; price: boolean; features: boolean; via: 'ALL' | 'POST' | null } {
  if (policy.invMode === 'OFF') return { visible: false, price: false, features: false, via: null };
  if (policy.invMode === 'ALL') return { visible: true, price: viewerSeesPrice && policy.invPrice, features: policy.invFeatures, via: 'ALL' };
  const cover = posts.filter(p => postCovers(p, unitId, memberId, now));
  if (cover.length === 0) return { visible: false, price: false, features: false, via: null };
  return {
    visible: true, via: 'POST',
    price: viewerSeesPrice && policy.invPrice && cover.every(p => p.showPrice),
    features: policy.invFeatures && cover.every(p => p.showFeatures),
  };
}

// ───────────────────────── customer share ─────────────────────────
export const MAX_SHARE_UNITS = 30;
export interface ShareFlags { showPrice: boolean; showFeatures: boolean }

/** A person can only turn on what they themselves are allowed to see — they may always turn more off. */
export function capShareFlags(want: ShareFlags, canPrice: boolean, canFeatures: boolean): ShareFlags {
  return { showPrice: want.showPrice && canPrice, showFeatures: want.showFeatures && canFeatures };
}

export interface ShareUnit {
  label: string; group?: string; config?: string; areaSqft?: number; price?: number | null;
  facing?: string; roadSides?: number; roadWidthFt?: number; dimensions?: string; features?: string[]; note?: string;
}

/** One unit as a short, WhatsApp-ready text. Price / features appear only when the flags allow. */
export function unitShareLine(u: ShareUnit, flags: ShareFlags, hi: boolean): string {
  const bits: string[] = [];
  const head = [u.label, u.config].filter(Boolean).join(' · ');
  if (u.areaSqft) bits.push(`${u.areaSqft} ${hi ? 'वर्ग फ़ुट' : 'sq ft'}`);
  if (u.dimensions) bits.push(u.dimensions);
  if (flags.showFeatures) {
    const rs = roadSidesLabel(u.roadSides, hi); if (rs) bits.push(rs + (u.roadWidthFt ? ` ${u.roadWidthFt} ft` : ''));
    const fc = facingLabel(u.facing, hi); if (fc) bits.push(`${fc} ${hi ? 'मुखी' : 'facing'}`);
    for (const f of impliedFeatures(u)) bits.push(featureLabel(f, hi));
  }
  let line = `• ${head}${bits.length ? ` — ${bits.join(', ')}` : ''}`;
  if (flags.showPrice) line += u.price ? ` — ${inrShort(u.price)}` : ` — ${hi ? 'कीमत पूछें' : 'price on request'}`;
  if (flags.showFeatures && u.note) line += `\n   ${u.note}`;
  return line;
}

export function inrShort(n: number): string {
  const t = (x: number, d: number) => String(parseFloat(x.toFixed(d)));
  if (n >= 10_000_000) return `₹${t(n / 10_000_000, 2)} Cr`;
  if (n >= 100_000) return `₹${t(n / 100_000, 2)} L`;
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
