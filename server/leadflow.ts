/**
 * v12 — who may see / work which lead, and how new leads reach the employer's staff.
 * Shared by crm.ts (lead lists, registration), team.ts (suspend → hand-over) and pcontrol.ts.
 */
import { db } from './db.js';
import type { UserProfile } from './db.js';
import type { CrmLead } from '../src/types/crm.js';
import { policyOf, pickAssignee, maskPhone } from '../src/shared/pcontrolRules.js';

const nowIso = () => new Date().toISOString();
const isOpen = (l: CrmLead) => !['BOOKED', 'LOST'].includes(l.stage);

export const employerOf = (u: UserProfile): UserProfile | undefined =>
  u.role === 'TEAM_MEMBER' ? db.byId('users', u.employerId) : u;

/** Who "owns" a lead: the associate that registered it, or the builder for builder-desk leads. */
export const ownerIdOf = (l: CrmLead) => l.associateId || l.builderId;

export const membersOf = (employerId: string) =>
  db.getState().users.filter(u => u.role === 'TEAM_MEMBER' && u.employerId === employerId);

export const openLoad = (memberId: string) =>
  db.getState().crmLeads.filter(l => l.assignedMemberId === memberId && isOpen(l)).length;

/** Open leads of the employer that nobody on the team is working on (the "pool"). */
export const poolFor = (employerId: string) =>
  db.getState().crmLeads.filter(l => isOpen(l) && !l.assignedMemberId && ownerIdOf(l) === employerId && l.verify !== 'REJECTED');

/** Leads a team member may see (read). ASSIGNED = allotted ones; PROJECTS = every lead of the owner on the listed projects. */
export function leadsForMember(member: UserProfile): CrmLead[] {
  const pol = policyOf(member);
  const all = db.getState().crmLeads;
  const emp = member.employerId;
  const inScope = (l: CrmLead) => pol.projectIds.length === 0 || pol.projectIds.includes(l.projectId);
  const assigned = all.filter(l => l.assignedMemberId === member.id && inScope(l));
  if (pol.scope !== 'PROJECTS') return assigned;
  const wide = all.filter(l => pol.projectIds.includes(l.projectId) && (l.builderId === emp || l.associateId === emp));
  const ids = new Set(wide.map(l => l.id));
  return [...wide, ...assigned.filter(l => !ids.has(l.id))];
}

/** Apply the staff phone policy to an outgoing lead. Owners, builders and admins are untouched. */
export function maskLeadForViewer<T extends { phone: string }>(l: T, viewer: { role: string } & Partial<UserProfile>): T & { phoneMasked?: boolean } {
  if (viewer.role !== 'TEAM_MEMBER') return l;
  const pol = policyOf(viewer as UserProfile);
  if (pol.phoneMode === 'FULL') return l;
  return { ...l, phone: maskPhone(l.phone), phoneMasked: true } as T & { phoneMasked?: boolean };
}

/** Auto-allot a freshly registered lead according to the owner's routing rule. */
export function autoAssign(owner: UserProfile, lead: CrmLead, byName = 'Lead routing'): boolean {
  const mode = owner.leadRouting?.mode || 'OFF';
  if (mode === 'OFF' || lead.assignedMemberId) return false;
  const staff = membersOf(owner.id).filter(m => m.verificationStatus === 'VERIFIED');
  const cand = staff.map(m => { const p = policyOf(m); return { id: m.id, openLeads: openLoad(m.id), onLeave: p.onLeave, maxOpenLeads: p.maxOpenLeads, projectIds: p.projectIds, canRegister: p.canRegister }; });
  const pick = pickAssignee(cand, mode, owner.leadRouting?.cursor || 0, lead.projectId);
  if (!pick) return false;
  const m = staff.find(x => x.id === pick.id)!;
  lead.assignedMemberId = m.id; lead.assignedMemberName = m.name;
  lead.activities.unshift({ id: `A-${Date.now().toString(36)}-r`, type: 'SYSTEM', note: `Allotted to ${m.name} (auto: ${mode === 'ROUND_ROBIN' ? 'round-robin' : 'least loaded'})`, byUserId: owner.id, byName, at: nowIso() });
  owner.leadRouting = { mode, cursor: pick.cursor };
  return true;
}

/** Take every open lead off a member (suspended / left / on long leave): route to the rest of the team or back to the owner's pool. */
export function releaseMemberLeads(owner: UserProfile, member: UserProfile, actorId: string, actorName: string, toMemberId?: string | null): number {
  const open = db.getState().crmLeads.filter(l => l.assignedMemberId === member.id && isOpen(l));
  let n = 0;
  for (const l of open) {
    const prev = l.assignedMemberName;
    l.assignedMemberId = undefined; l.assignedMemberName = undefined;
    let note = `Taken back from ${prev || 'team'} (hand-over)`;
    if (toMemberId) {
      const to = membersOf(owner.id).find(m => m.id === toMemberId && m.verificationStatus === 'VERIFIED');
      if (to) { l.assignedMemberId = to.id; l.assignedMemberName = to.name; note = `Allotted to ${to.name} (hand-over from ${prev || 'team'})`; }
    } else if (autoAssign(owner, l, actorName)) { n++; l.updatedAt = nowIso(); continue; }
    l.activities.unshift({ id: `A-${Date.now().toString(36)}-h${n}`, type: 'SYSTEM', note, byUserId: actorId, byName: actorName, at: nowIso() });
    l.updatedAt = nowIso();
    n++;
  }
  return n;
}
