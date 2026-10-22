/**
 * v37 — Deal Hub.   GET /api/deal-hub   (deal:read)
 *
 * One call that feeds the Deals pipeline (board / list), the KPI tiles and the "next steps" of every deal room the caller may see.
 * The same visibility rules as /api/deals apply (server/access.ts):
 *   - a deal room is listed only to its participants, legal counsel and GENZ admins;
 *   - money (fee, split, my share) only to the two deal brokers — and to an admin while a dispute is open;
 *   - inner details (tasks, agreement, chat, visits) are NOT counted for an admin who only has the summary view.
 * Nothing here changes data. The detail screens still call /api/deals/:id and the sub-routes as before.
 */
import { Router, type Request, type Response } from 'express';
import { db } from './db.js';
import type { DealRoom, UserProfile, DatabaseState } from './db.js';
import { ctx, needs } from './auth.js';
import { canViewDeal, canSeeDealCommercials, dealDetailVia, isAdmin, isDealBroker, openDisputeDeals } from './access.js';
import { feeFor, isOwnSide } from '../src/shared/sideFees.js';
import { isClosed } from '../src/shared/dealClose.js';

const DAY = 86400_000;
const STAGES = ['Lead', 'Introduction', 'Site Visit Done', 'Negotiation', 'Agreement', 'Handover', 'Settled'] as const;
const LIVE_DISPUTE = new Set(['OPEN', 'UNDER_REVIEW', 'MEDIATION']);
export const STALLED_DAYS = 14;

export type NextKind = 'CLOSE_TO_ANSWER' | 'OFFLINE_VISIT_TO_CONFIRM' | 'DISPUTE_OPEN' | 'AGREEMENT_TO_SIGN' | 'TASKS_TO_ACCEPT' | 'VISITS_TO_VERIFY' | 'TASKS_OVERDUE' | 'TASKS_TO_VERIFY' | 'PAYMENTS_TO_CONFIRM' | 'NO_AGREEMENT' | 'TASKS_TO_DO' | 'STALLED';
/** which deal-room section answers each next step */
const TAB_OF: Record<NextKind, string> = {
  CLOSE_TO_ANSWER: 'overview', OFFLINE_VISIT_TO_CONFIRM: 'overview',
  DISPUTE_OPEN: 'disputes_holds', AGREEMENT_TO_SIGN: 'commission_agreement', TASKS_TO_ACCEPT: 'responsibilities', VISITS_TO_VERIFY: 'overview',
  TASKS_OVERDUE: 'responsibilities', TASKS_TO_VERIFY: 'responsibilities', PAYMENTS_TO_CONFIRM: 'commission_agreement', NO_AGREEMENT: 'commission_agreement',
  TASKS_TO_DO: 'responsibilities', STALLED: 'chat_call',
};

function roleIn(u: UserProfile, d: DealRoom): 'INTRODUCING' | 'CLOSING' | 'OWNER' | 'TEAM' | 'LEGAL' | 'ADMIN' | 'OTHER' {
  if (d.introducingBrokerId === u.id) return 'INTRODUCING';
  if (d.closingBrokerId === u.id) return 'CLOSING';
  if (d.ownerId === u.id) return 'OWNER';
  if (d.teamMemberIds?.includes(u.id)) return 'TEAM';
  if (u.role === 'LEGAL_COUNSEL') return 'LEGAL';
  if (isAdmin(u)) return 'ADMIN';
  return 'OTHER';
}

export function hubItem(d: DealRoom, u: UserProfile, s: DatabaseState, open: Set<string>, now = Date.now()) {
  const p = s.properties.find(x => x.id === d.propertyId);
  const money = canSeeDealCommercials(u, d, s, open);
  const inner = dealDetailVia(u, d, s, { allowLegal: true }, open) !== 'NONE';
  const myRole = roleIn(u, d);
  const broker = isDealBroker(u, d);
  const users = (id: string) => s.users.find(x => x.id === id);
  const counterpart = myRole === 'INTRODUCING' ? users(d.closingBrokerId) : myRole === 'CLOSING' ? users(d.introducingBrokerId) : undefined;
  const dispute = s.disputes.find(x => x.dealRoomId === d.id && LIVE_DISPUTE.has(x.status));
  const stageIdx = Math.max(0, STAGES.indexOf(d.stage as typeof STAGES[number]));
  const base = {
    id: d.id, stage: d.stage, stageIndex: d.stage === 'Disputed' ? -1 : stageIdx,
    propertyId: d.propertyId, propertyTitle: p?.title || d.propertyId, locality: p?.locality || '', city: p?.city || '', propertyType: p?.propertyType || '',
    transactionType: p?.transactionType, myRole, counterpartName: counterpart?.name, counterpartCompany: counterpart?.companyName,
    createdAt: d.createdAt, updatedAt: d.updatedAt, openDispute: !!dispute,
    // v47 — a deal that did not happen (closed) / a close request waiting
    closed: isClosed(d), closing: d.closure?.status === 'ASKED' ? { byMe: d.closure.byId === u.id, autoAt: d.closure.autoAt } : undefined,
    offlineVisit: d.offlineVisit ? { confirmed: !!d.offlineVisit.confirmedAt, byMe: d.offlineVisit.byId === u.id } : undefined,
    protectionDaysLeft: d.ownerProtectionExpiresAt ? Math.ceil((Date.parse(d.ownerProtectionExpiresAt) - now) / DAY) : undefined,
  };
  let lastActivityAt = d.updatedAt;
  const later = (iso?: string) => { if (iso && iso > lastActivityAt) lastActivityAt = iso; };
  let visits = { total: 0, verified: 0, upcoming: 0 };
  let tasks = { open: 0, overdue: 0, total: 0, done: 0 };
  let agreement: { version: number; status: string; signedByMe?: boolean; waitingOn: number } | null = null;
  let lastMessage: { at: string; from: string } | undefined;
  const next: { kind: NextKind; n: number; tab: string }[] = [];
  const add = (kind: NextKind, n: number) => { if (n > 0) next.push({ kind, n, tab: TAB_OF[kind] }); };

  if (dispute) add('DISPUTE_OPEN', 1);
  if (d.closure?.status === 'ASKED' && broker && d.closure.byId !== u.id) add('CLOSE_TO_ANSWER', 1);
  if (d.offlineVisit && !d.offlineVisit.confirmedAt && d.offlineVisit.byId !== u.id
    && (d.introducingBrokerId === d.closingBrokerId ? d.ownerId === u.id : broker)) add('OFFLINE_VISIT_TO_CONFIRM', 1);
  if (inner) {
    const vs = s.siteVisits.filter(v => v.dealRoomId === d.id);
    visits = { total: vs.length, verified: vs.filter(v => v.isVerified).length, upcoming: vs.filter(v => !v.isVerified && Date.parse(v.scheduledTime) > now).length };
    vs.forEach(v => later(v.verifiedAt || v.createdAt));
    // the property side verifies a visit (maker-checker): closing broker or owner
    if (d.closingBrokerId === u.id || d.ownerId === u.id) add('VISITS_TO_VERIFY', vs.filter(v => !v.isVerified && Date.parse(v.scheduledTime) <= now && v.brokerId !== u.id).length);

    const ts = s.dealTasks.filter(t => t.dealId === d.id && t.isApplicable);
    const isDone = (t: any) => t.taskStatus === 'COMPLETED' || t.taskStatus === 'WAIVED';
    tasks = { total: ts.length, done: ts.filter(isDone).length, open: ts.filter(t => !isDone(t)).length, overdue: ts.filter(t => !isDone(t) && t.dueDate && Date.parse(t.dueDate) < now).length };
    ts.forEach(t => { later(t.completionTimestamp); later(t.acceptedAt); later(t.verifiedAt); });
    const mine = ts.filter(t => t.assignedParticipantId === u.id);
    add('TASKS_TO_ACCEPT', mine.filter(t => t.assignmentAcceptance === 'PENDING_ACCEPTANCE').length);
    add('TASKS_OVERDUE', mine.filter(t => t.assignmentAcceptance === 'ACCEPTED' && !isDone(t) && t.dueDate && Date.parse(t.dueDate) < now).length);
    add('TASKS_TO_VERIFY', ts.filter(t => t.reviewingParticipantId === u.id && t.taskStatus === 'COMPLETED' && (t.verificationStatus === 'UNVERIFIED' || t.verificationStatus === 'UNDER_REVIEW')).length);

    if (isOwnSide(d)) {
      // v41: no shared agreement — the two brokers sign the "own client only" undertaking instead
      if (broker) {
        const signed = !!d.sideUndertaking?.[u.id];
        const waiting = [d.introducingBrokerId, d.closingBrokerId].filter(id => !d.sideUndertaking?.[id]).length;
        agreement = { version: 1, status: waiting === 0 ? 'ACTIVE' : 'SENT_TO_PARTICIPANTS', signedByMe: signed, waitingOn: waiting };
        if (!signed) add(stageIdx >= 2 ? 'NO_AGREEMENT' : 'AGREEMENT_TO_SIGN', 1);
      }
    } else if (broker || money) {
      const ag = s.commissionAgreements.filter(a => a.dealId === d.id).sort((a, b) => b.version - a.version)[0];
      if (ag) {
        later(ag.updatedAt);
        const mineAp = ag.requiredApprovals?.find(a => a.userId === u.id);
        agreement = { version: ag.version, status: ag.status, signedByMe: mineAp ? mineAp.hasAccepted : undefined, waitingOn: (ag.requiredApprovals || []).filter(a => !a.hasAccepted).length };
        if (broker && ['DRAFT', 'SENT_TO_PARTICIPANTS'].includes(ag.status) && mineAp && !mineAp.hasAccepted) add('AGREEMENT_TO_SIGN', 1);
        if (broker) {
          const pend = (ag.allocations || []).flatMap(a => a.payments || []).filter(x => x.status === 'PENDING' && x.recordedById !== u.id).length;
          add('PAYMENTS_TO_CONFIRM', pend);
        }
      } else if (broker && stageIdx >= 2 && d.stage !== 'Settled') add('NO_AGREEMENT', 1);
    }
    add('TASKS_TO_DO', mine.filter(t => t.assignmentAcceptance === 'ACCEPTED' && !isDone(t) && !(t.dueDate && Date.parse(t.dueDate) < now)).length);

    const ms = s.dealMessages.filter(m => m.dealRoomId === d.id && (broker || isAdmin(u) || m.audience !== 'BROKERS'));
    const lm = ms[ms.length - 1];
    if (lm) { lastMessage = { at: lm.timestamp, from: lm.senderId === u.id ? 'ME' : 'OTHER' }; later(lm.timestamp); }
  }
  const idleDays = Math.floor((now - Date.parse(lastActivityAt)) / DAY);
  const stalled = d.stage !== 'Settled' && !isClosed(d) && idleDays >= STALLED_DAYS;
  if (stalled && inner) add('STALLED', 1);

  // money: the total fee and MY share (from the latest agreement's allocation when there is one)
  let fee: number | undefined, myShare: number | undefined, split: string | undefined, dealValue: number | undefined;
  if (money) {
    fee = feeFor(d, u.id);
    split = isOwnSide(d) ? 'OWN_SIDE' : `${d.introducingBrokerSharePct}/${d.closingBrokerSharePct}`;
    dealValue = d.dealValue || (p && p.transactionType === 'Sale' ? p.askingPrice : undefined);
    if (broker && isOwnSide(d)) myShare = fee;
    else if (broker) {
      const ag = s.commissionAgreements.filter(a => a.dealId === d.id).sort((a, b) => b.version - a.version)[0];
      const al = ag?.allocations?.find(a => a.participantId === u.id);
      myShare = al?.allocationAmount ?? Math.round(fee * ((myRole === 'INTRODUCING' ? d.introducingBrokerSharePct : d.closingBrokerSharePct) || 0) / 100);
    }
  }
  return {
    ...base, lastActivityAt, idleDays, stalled, visits: inner ? visits : undefined, tasks: inner ? tasks : undefined, agreement, lastMessage,
    // a closed room nags nobody (its next steps come back when it is reopened)
    next: isClosed(d) ? [] : next.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)), needsMe: !isClosed(d) && next.some(x => x.kind !== 'STALLED' && x.kind !== 'TASKS_TO_DO'),
    money: money ? { fee, myShare, split, dealValue } : undefined, summaryOnly: !inner,
  };
}
const ORDER: NextKind[] = ['CLOSE_TO_ANSWER', 'OFFLINE_VISIT_TO_CONFIRM', 'DISPUTE_OPEN', 'AGREEMENT_TO_SIGN', 'TASKS_TO_ACCEPT', 'VISITS_TO_VERIFY', 'TASKS_OVERDUE', 'TASKS_TO_VERIFY', 'PAYMENTS_TO_CONFIRM', 'NO_AGREEMENT', 'TASKS_TO_DO', 'STALLED'];

export function createDealHubRouter() {
  const r = Router();
  r.get('/', needs('deal:read'), (_req: Request, res: Response) => {
    const u = ctx().user as UserProfile;
    const s = db.getState();
    const open = openDisputeDeals(s);
    const now = Date.now();
    const items = s.dealRooms.filter(d => canViewDeal(u, d, { allowLegal: true })).map(d => hubItem(d, u, s, open, now));
    const live = items.filter(i => i.stage !== 'Settled' && !i.closed);
    const byStage: Record<string, number> = {};
    for (const i of items) byStage[i.stage] = (byStage[i.stage] || 0) + 1;
    res.json({
      success: true, stages: STAGES, stalledDays: STALLED_DAYS, deals: items,
      kpis: {
        total: items.length, live: live.length, settled: items.filter(i => i.stage === 'Settled').length, closed: items.filter(i => i.closed).length, byStage,
        needsMe: items.filter(i => i.needsMe).length, stalled: items.filter(i => i.stalled).length, disputes: items.filter(i => i.openDispute).length,
        myPipeline: live.reduce((n, i) => n + (i.money?.myShare || 0), 0),
        mySettled: items.filter(i => i.stage === 'Settled').reduce((n, i) => n + (i.money?.myShare || 0), 0),
        hasMoney: items.some(i => !!i.money),
      },
    });
  });
  return r;
}
