/**
 * Resource-level access rules ("may THIS user touch THIS record?").
 * Route-level permissions live in permissions.ts; these helpers add ownership / participation checks.
 */
import { inPool } from '../src/shared/ownerListRules.js';
import type { DatabaseState, UserProfile, DealRoom, Property } from './db.js';
import { digits } from './auth.js';
import { SOLD_VISIBLE_DAYS } from '../src/shared/dealRules.js';

type U = Pick<UserProfile, 'id' | 'role'> & Partial<UserProfile>;

export const isSuper = (u: U) => u.role === 'SUPERADMIN';
export const isAdmin = (u: U) => u.role === 'SUPERADMIN' || u.role === 'ADMIN';

export function isDealParticipant(u: U, deal: Pick<DealRoom, 'introducingBrokerId' | 'closingBrokerId' | 'ownerId'> & Partial<Pick<DealRoom, 'teamMemberIds'>>) {
  if (deal.introducingBrokerId === u.id || deal.closingBrokerId === u.id || deal.ownerId === u.id) return true;
  // an employee the broker has allotted to this deal room (read / chat only — see commercials rule below)
  return u.role === 'TEAM_MEMBER' && !!deal.teamMemberIds?.includes(u.id);
}

/**
 * Who a duty in this deal room may be handed to — the SAME list feeds the "Reassign" dropdown and the server check:
 * the deal's own participants, the employees the brokers allotted to the room, the empanelled legal counsel, and the GENZ
 * desk admin who already holds a duty here (so it can be handed back). Nobody from outside the deal appears.
 */
export interface Assignee { id: string; name: string; role: string; group: 'PARTICIPANT' | 'TEAM' | 'LEGAL' | 'DESK'; title?: string; employerName?: string }
export function dealAssignees(state: DatabaseState, deal: DealRoom): Assignee[] {
  const out = new Map<string, Assignee>();
  const ok = (x?: UserProfile) => !!x && x.verificationStatus === 'VERIFIED';
  for (const id of [deal.introducingBrokerId, deal.closingBrokerId, deal.ownerId]) {
    const x = state.users.find(u => u.id === id);
    if (ok(x) && !out.has(x!.id)) out.set(x!.id, { id: x!.id, name: x!.name, role: x!.role, group: 'PARTICIPANT' });
  }
  for (const id of deal.teamMemberIds || []) {
    const x = state.users.find(u => u.id === id && u.role === 'TEAM_MEMBER');
    if (!ok(x) || out.has(x!.id)) continue;
    // an employee only counts while his employer is still a participant of the room
    if (!x!.employerId || ![deal.introducingBrokerId, deal.closingBrokerId, deal.ownerId].includes(x!.employerId)) continue;
    if (x!.teamPolicy?.onLeave) continue;
    out.set(x!.id, { id: x!.id, name: x!.name, role: 'TEAM_MEMBER', group: 'TEAM', title: x!.teamTitle, employerName: state.users.find(u => u.id === x!.employerId)?.name });
  }
  for (const x of state.users) {
    if (x.role === 'LEGAL_COUNSEL' && ok(x) && !out.has(x.id)) out.set(x.id, { id: x.id, name: x.name, role: x.role, group: 'LEGAL' });
  }
  const deskIds = new Set(state.dealTasks.filter(t => t.dealId === deal.id).map(t => t.assignedParticipantId));
  for (const x of state.users) {
    if ((x.role === 'ADMIN' || x.role === 'SUPERADMIN') && ok(x) && deskIds.has(x.id) && !out.has(x.id)) out.set(x.id, { id: x.id, name: x.name, role: x.role, group: 'DESK' });
  }
  return [...out.values()];
}

export function isDealBroker(u: U, deal: Pick<DealRoom, 'introducingBrokerId' | 'closingBrokerId'>) {
  return deal.introducingBrokerId === u.id || deal.closingBrokerId === u.id;
}

/**
 * Deal room visibility — "may this user see the deal room AT ALL?": participants, platform admins (summary only, see below)
 * and (read-only) empanelled legal counsel. For what an admin may actually read inside, use canSeeDealDetail.
 */
export function canViewDeal(u: U, deal: DealRoom, opts: { allowLegal?: boolean } = {}) {
  return isAdmin(u) || isDealParticipant(u, deal) || (!!opts.allowLegal && u.role === 'LEGAL_COUNSEL');
}

/**
 * v21 — GENZ staff see what the deal is worth and how much commission moved (the totals), but NOT the chat, notes, commission
 * terms, site-visit feedback, documents or tasks of a deal room between two brokers. The full record opens to GENZ only when
 *   (a) a dispute on that deal room is open (a broker raised it; it closes again when the dispute is resolved), or
 *   (b) GENZ is itself a party to the deal (an admin account is a broker / the owner of the room).
 * Every admin opening of case (a) is written to the audit trail, which the deal's brokers can read.
 */
const LIVE_DISPUTE = new Set(['OPEN', 'UNDER_REVIEW', 'MEDIATION']);
type DisputeSource = Pick<DatabaseState, 'disputes'>;
export function openDisputeOf(st: DisputeSource, dealId: string) {
  return st.disputes.find(d => d.dealRoomId === dealId && LIVE_DISPUTE.has(d.status));
}
/** every deal room that has an open dispute right now — one pass, for list screens */
export function openDisputeDeals(st: DisputeSource): Set<string> {
  const out = new Set<string>();
  for (const d of st.disputes) if (d.dealRoomId && LIVE_DISPUTE.has(d.status)) out.add(d.dealRoomId);
  return out;
}
export type DealDetailVia = 'PARTICIPANT' | 'LEGAL' | 'DISPUTE' | 'NONE';
/** how this user may read inside the deal room — 'NONE' means summary only (a GENZ admin with no open dispute) */
export function dealDetailVia(u: U, deal: DealRoom, st: DisputeSource, opts: { allowLegal?: boolean } = {}, open?: Set<string>): DealDetailVia {
  if (isDealParticipant(u, deal)) return 'PARTICIPANT';
  if (u.role === 'LEGAL_COUNSEL' && opts.allowLegal) return 'LEGAL';
  if (isAdmin(u)) return (open ? open.has(deal.id) : !!openDisputeOf(st, deal.id)) ? 'DISPUTE' : 'NONE';
  return 'NONE';
}
export const canSeeDealDetail = (u: U, deal: DealRoom, st: DisputeSource, opts: { allowLegal?: boolean } = {}) => dealDetailVia(u, deal, st, opts) !== 'NONE';

/**
 * Brokerage terms between the two deal brokers are visible to those brokers — never to the owner or legal counsel — and to GENZ
 * admins only while a dispute is open on that deal room (or when the admin is a participant of the room himself).
 */
export function canSeeDealCommercials(u: U, deal: Pick<DealRoom, 'id' | 'introducingBrokerId' | 'closingBrokerId' | 'ownerId'>, st: DisputeSource, open?: Set<string>) {
  if (isDealBroker(u, deal)) return true;
  if (!isAdmin(u)) return false;
  return deal.ownerId === u.id || (open ? open.has(deal.id) : !!openDisputeOf(st, deal.id));
}

/** Who may see a property in listings: admins, its owner / listing broker, and (for network members) verified live listings. Owners never see other owners' properties. */
export function canBrowseProperty(u: U, p: Pick<Property, 'ownerId' | 'listingBrokerId' | 'verificationStatus' | 'listingStatus' | 'ownerListing'> & { expiredAt?: string; heldAt?: string }) {
  if (isAdmin(u)) return true;
  if (p.ownerId === u.id || p.listingBrokerId === u.id) return true;
  if (u.role === 'PROPERTY_OWNER') return false;
  if (p.expiredAt || p.heldAt) return false; // stale or reported listings stay hidden from the network until refreshed / reviewed
  if (u.role === 'BROKER' && u.verificationStatus === 'VERIFIED' && inPool(p as any)) return true; // v73 — an owner's own listing sits in the pool: seen, never matched
  return p.verificationStatus === 'VERIFIED' && (p.listingStatus === 'active' || p.listingStatus === 'under_negotiation');
}

/** v27 — a listing that was just sold / rented stays visible to brokers as SOLD for SOLD_VISIBLE_DAYS (view only: no offers, no visits). */
export function canSeeClosedProperty(u: U, p: Pick<Property, 'verificationStatus' | 'listingStatus'> & { soldAt?: string; purgedAt?: string; heldAt?: string }, now = Date.now()) {
  if (u.role !== 'BROKER') return false;
  if (!['sold', 'rented'].includes(p.listingStatus) || p.verificationStatus !== 'VERIFIED' || p.purgedAt || p.heldAt) return false;
  return !!p.soldAt && now - Date.parse(p.soldAt) <= SOLD_VISIBLE_DAYS * 86400_000;
}

/** Owner or listing broker of a property (or SUPERADMIN). */
export function isPropertyPrincipal(u: U, p: Pick<Property, 'ownerId' | 'listingBrokerId'>) {
  return isSuper(u) || p.ownerId === u.id || p.listingBrokerId === u.id;
}

/** May the user see exact address / owner identity? Principals, admins, or a broker with a verified visit. */
/**
 * v20: listing pages call this once per property; the old version scanned every site visit each time
 * (40k listings × 10k visits). The caller's verified-visit property ids are now collected once and reused for
 * one second (same request), then rebuilt — so a visit verified a moment ago unlocks the address on the next screen.
 */
const visitMemo = new WeakMap<object, { arr: unknown; len: number; at: number; set: Set<string> }>();
export function canSeeProtectedPropertyData(state: DatabaseState, u: U, p: Property) {
  if (isAdmin(u) || p.ownerId === u.id || p.listingBrokerId === u.id) return true;
  if (u.role === 'LEGAL_COUNSEL') return true; // legal review needs the title/address
  // v58 — a broker's office staff with "listings + address" may take clients to HIS EMPLOYER's own listings (never another broker's)
  if (u.role === 'TEAM_MEMBER' && !!u.employerId && p.listingBrokerId === u.employerId && u.teamPolicy?.listings === 'ADDRESS') return true;
  const now = Date.now();
  let m = visitMemo.get(u);
  if (!m || m.arr !== state.siteVisits || m.len !== state.siteVisits.length || now - m.at > 1000) {
    const set = new Set<string>();
    for (const v of state.siteVisits) if (v.isVerified && v.brokerId === u.id) set.add(v.propertyId);
    m = { arr: state.siteVisits, len: state.siteVisits.length, at: now, set };
    visitMemo.set(u, m);
  }
  return m.set.has(p.id);
}

export function canSeeOwnerCommercials(u: U, p: Pick<Property, 'ownerId' | 'listingBrokerId'>) {
  return isAdmin(u) || p.ownerId === u.id || p.listingBrokerId === u.id;
}

/** Everyone who may legitimately work on a property's due diligence / vault. */
export function canAccessPropertyWorkspace(state: DatabaseState, u: U, p: Property) {
  if (isAdmin(u) || u.role === 'LEGAL_COUNSEL') return true;
  if (p.ownerId === u.id || p.listingBrokerId === u.id) return true;
  return state.dealRooms.some(d => d.propertyId === p.id && isDealParticipant(u, d));
}

export function dealsOfProperty(state: DatabaseState, propertyId: string) {
  return state.dealRooms.filter(d => d.propertyId === propertyId);
}

export function customerMatchesUser(visitPhone: string | undefined, u: U) {
  return !!visitPhone && !!u.phone && digits(visitPhone) === digits(u.phone);
}

/** Public projection of a user — never include credentials / session internals. */
export function publicUser<T extends Partial<UserProfile>>(u: T): Omit<T, 'passwordHash' | 'sessionVersion' | 'mustChangePassword'> {
  const { passwordHash: _p, sessionVersion: _s, mustChangePassword: _m, ...rest } = u as any;
  return rest;
}

/** Directory projection for other users: no email / phone. */
export function partnerCard(u: Partial<UserProfile>) {
  const x = publicUser(u) as any;
  delete x.email;
  delete x.phone;
  delete x.verificationNotes;
  delete x.panNumber;
  delete x.gstin;
  delete x.aadhaarLast4; delete x.idConsentAt; delete x.idCheckedAt; delete x.idCheckedBy; delete x.idCheckNote;
  delete x.sponsorId; delete x.sponsoredAt; delete x.autoVerifiedAt; delete x.autoVerifiedBy;
  delete x.consent;
  delete x.erasedAt;
  return x;
}
