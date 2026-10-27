/**
 * v16.8 — who may see which unit of a project, and in what shape.
 * One place, used by the grid API, the partner project page, the team board and the customer share page, so a rule
 * (hidden unit, hidden price, employee without price access) can never be honoured in one screen and forgotten in another.
 *
 *  ADMIN    sees everything.
 *  OWNER    the builder: everything, including who may see what.
 *  PARTNER  a broker with an ACTIVE mandate: units the builder lets him see; the price only if the builder did not hide it.
 *  MEMBER   an employee of a partner (or of the builder): only what his employer sees AND his own policy / the posts allow.
 *
 * Phones, buyers and holds of other partners are never part of a unit shape.
 */
import { db } from './db.js';
import type { BuilderProject, InventoryUnit, UserProfile } from './db.js';
import { isAdmin } from './access.js';
import { mandateIsActive, policyOf } from '../src/shared/pcontrolRules.js';
import {
  effectiveVis, partnerMaySee, memberView, impliedFeatures, ratePerSqft, postIsLive, unitKindOf, type TeamPost, type UnitVis, type UnitKind,
} from '../src/shared/inventoryRules.js';
import { tierOf } from '../src/shared/networkRules.js';

export type Actor =
  | { kind: 'ADMIN'; user: UserProfile }
  | { kind: 'OWNER'; user: UserProfile }
  | { kind: 'PARTNER'; user: UserProfile }
  | { kind: 'MEMBER'; user: UserProfile; employer: UserProfile; policy: ReturnType<typeof policyOf>; viaPartner: boolean };

const verified = (u?: UserProfile) => !!u && u.verificationStatus === 'VERIFIED';

export function partnerHasMandate(brokerId: string, projectId: string): boolean {
  return db.getState().associateMandates.some(m => m.projectId === projectId && m.brokerId === brokerId && mandateIsActive(m));
}

/** The caller's relation to a project's grid, or null when he may not open it at all. */
export function actorFor(u: UserProfile, projectId: string): { project: BuilderProject; actor: Actor } | null {
  const st = db.getState();
  const project = db.byId('builderProjects', projectId);
  if (!project) return null;
  if (isAdmin(u)) return { project, actor: { kind: 'ADMIN', user: u } };
  if (u.role === 'DEVELOPER_BUILDER') return project.builderId === u.id ? { project, actor: { kind: 'OWNER', user: u } } : null;
  if (u.role === 'BROKER') {
    if (tierOf(u) === 'TIER2') return null;
    return partnerHasMandate(u.id, projectId) ? { project, actor: { kind: 'PARTNER', user: u } } : null;
  }
  if (u.role === 'TEAM_MEMBER') {
    const employer = db.byId('users', u.employerId);
    if (!employer || !verified(employer) || !verified(u)) return null;
    const policy = policyOf(u);
    if (policy.invMode === 'OFF' || policy.onLeave) return null;
    if (employer.role === 'DEVELOPER_BUILDER') return project.builderId === employer.id ? { project, actor: { kind: 'MEMBER', user: u, employer, policy, viaPartner: false } } : null;
    if (employer.role === 'BROKER') return partnerHasMandate(employer.id, projectId) ? { project, actor: { kind: 'MEMBER', user: u, employer, policy, viaPartner: true } } : null;
  }
  return null;
}

/** Live team posts addressed to this employee (or to the whole team) on a project. */
export const postsFor = (employerId: string, projectId: string): TeamPost[] =>
  db.getState().inventoryPosts.filter(p => p.employerId === employerId && p.projectId === projectId && postIsLive(p));

export interface Seen { visible: boolean; price: boolean; features: boolean }

/** What this actor sees of one unit (before shaping). */
export function seenBy(actor: Actor, project: BuilderProject, unit: InventoryUnit, posts?: TeamPost[]): Seen {
  if (actor.kind === 'ADMIN' || actor.kind === 'OWNER') return { visible: true, price: true, features: true };
  const vis: UnitVis = effectiveVis(unit.vis, project.invVis);
  if (actor.kind === 'PARTNER') return { visible: partnerMaySee(vis, actor.user.id), price: !vis.priceHidden, features: true };
  // MEMBER — his employer first, then his own policy
  let employerSees: Seen;
  if (actor.viaPartner) employerSees = { visible: partnerMaySee(vis, actor.employer.id), price: !vis.priceHidden, features: true };
  else employerSees = { visible: true, price: true, features: true };
  if (!employerSees.visible) return { visible: false, price: false, features: false };
  const v = memberView(actor.policy, posts ?? postsFor(actor.employer.id, project.id), unit.id, actor.user.id, employerSees.price);
  return { visible: v.visible, price: v.price, features: v.features };
}

export interface ShapedUnit {
  id: string; projectId: string; group: string; label: string;
  /** v77 — always filled (an old unit gets flat / plot from its floor) */
  kind: UnitKind; code?: string;
  floor?: number; config: string; areaSqft?: number;
  /** null = hidden from this viewer ("price on request") */
  price: number | null; priceHidden: boolean; ratePerSqft?: number;
  status: InventoryUnit['status']; updatedAt: string;
  facing?: string; roadSides?: number; roadWidthFt?: number; dimensions?: string; features?: string[]; note?: string;
  hold?: unknown; mine: boolean; bookingId?: string;
  /** owner / admin only */
  vis?: UnitVis; priceHistory?: InventoryUnit['priceHistory'];
}

export function shapeUnit(unit: InventoryUnit, project: BuilderProject, actor: Actor, seen: Seen): ShapedUnit {
  const ownerLike = actor.kind === 'ADMIN' || actor.kind === 'OWNER';
  const mine = actor.kind === 'PARTNER' && unit.hold?.brokerId === actor.user.id;
  const { hold } = unit;
  const out: ShapedUnit = {
    id: unit.id, projectId: unit.projectId, group: unit.group, label: unit.label, kind: unitKindOf(unit), code: unit.code, floor: unit.floor, config: unit.config, areaSqft: unit.areaSqft,
    price: seen.price ? unit.price : null, priceHidden: !seen.price,
    ratePerSqft: seen.price ? ratePerSqft(unit.price, unit.areaSqft) : undefined,
    status: unit.status, updatedAt: unit.updatedAt, dimensions: unit.dimensions,
    hold: hold ? (ownerLike || mine ? hold : { expiresAt: hold.expiresAt }) : undefined,
    mine, bookingId: ownerLike ? unit.bookingId : undefined,
  };
  if (seen.features) {
    out.facing = unit.facing; out.roadSides = unit.roadSides; out.roadWidthFt = unit.roadWidthFt;
    out.features = impliedFeatures(unit); out.note = unit.note;
  }
  if (ownerLike) { out.vis = effectiveVis(unit.vis, project.invVis); out.priceHistory = unit.priceHistory; }
  return out;
}

/** Every unit of a project this actor may see, shaped. */
export function unitsFor(project: BuilderProject, actor: Actor): ShapedUnit[] {
  const posts = actor.kind === 'MEMBER' ? postsFor(actor.employer.id, project.id) : undefined;
  const out: ShapedUnit[] = [];
  for (const x of db.getState().inventoryUnits) {
    if (x.projectId !== project.id) continue;
    const seen = seenBy(actor, project, x, posts);
    if (seen.visible) out.push(shapeUnit(x, project, actor, seen));
  }
  return out;
}

/** The units a partner sees on the project page / My Projects — same rules, available ones only. */
export function availableUnitsForPartner(project: BuilderProject, broker: UserProfile, limit = 200): ShapedUnit[] {
  return unitsFor(project, { kind: 'PARTNER', user: broker }).filter(x => x.status === 'AVAILABLE').slice(0, limit);
}

/** What the actor may turn ON when sharing a unit with a customer. */
export function shareCaps(actor: Actor, project: BuilderProject, unit: InventoryUnit, posts?: TeamPost[]): { price: boolean; features: boolean; visible: boolean; canShare: boolean } {
  const s = seenBy(actor, project, unit, posts);
  const canShare = actor.kind !== 'MEMBER' || actor.policy.invShareOut;
  return { price: s.price, features: s.features, visible: s.visible, canShare };
}
