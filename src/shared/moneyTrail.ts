/**
 * v16.9 — Money Trail: who is holding the customer's payment, stage by stage.
 *
 *   customer ─▶ collector ─▶ CP confirms ─▶ CP hands it to the builder ─▶ builder's authorised person confirms
 *
 * GENZ moves no money and holds none. Each stage is only RECORDED by the person who has the money at that moment, and the NEXT person
 * in the chain has to confirm it before it counts. The shared ledger (booking amount / instalment receipts, and with them the
 * brokerage that becomes payable) changes ONLY at the last step — the builder side's confirmation.
 *
 * Pure rules, no server imports — the server, the browser and the unit tests all use this file.
 */
import { TOKEN_MODES } from './crmSales.js';

export type TrailSide = 'CP_OWNER' | 'CP_STAFF' | 'BUILDER_OWNER' | 'BUILDER_STAFF';
export type TrailRoute = 'CP' | 'BUILDER';
export type TrailStatus = 'WITH_COLLECTOR' | 'WITH_CP' | 'HANDED_OVER' | 'CONFIRMED' | 'NOT_RECEIVED' | 'DISPUTED' | 'CANCELLED';
export type TrailStage = 'COLLECTED' | 'CP_CONFIRMED' | 'CP_NOT_RECEIVED' | 'HANDED_OVER' | 'BUILDER_CONFIRMED' | 'BUILDER_NOT_RECEIVED' | 'CANCELLED';
export type HolderKind = 'COLLECTOR' | 'CP' | 'BUILDER_PENDING' | 'BUILDER' | 'NONE';

export interface TrailStep {
  stage: TrailStage; at: string; byId: string; byName: string; side: TrailSide;
  note?: string; ref?: string; mode?: string;
}
export interface MoneyTrail {
  id: string; bookingId: string;
  /** 'TOKEN' (the booking amount claimed on the request) or the id of a payment-schedule milestone */
  target: string; targetName: string;
  amount: number; mode: string; ref?: string; paidOn?: string;
  collector: { id: string; name: string; side: TrailSide };
  /** CP = collected on the channel partner's side (chain has the CP stages); BUILDER = collected by the builder's own people */
  route: TrailRoute;
  status: TrailStatus;
  steps: TrailStep[];
  /** the builder's own receipt number, if the accounts person gave one when confirming */
  receiptNo?: string;
  createdAt: string; updatedAt: string;
}

export const TRAIL_MODE_IDS: readonly string[] = TOKEN_MODES.map(m => m.id);
/** a collector's money not confirmed by the CP within this many days is flagged */
export const TRAIL_WITH_TEAM_DAYS = 1;
/** a hand-over the builder side has not confirmed within this many days is flagged */
export const TRAIL_AWAITING_BUILDER_DAYS = 2;
export const TRAIL_NOTE_MIN = 3;

/** money still in motion or stuck — not yet confirmed into the ledger and not cancelled */
export const OPEN_STATUS: readonly TrailStatus[] = ['WITH_COLLECTOR', 'WITH_CP', 'HANDED_OVER', 'NOT_RECEIVED', 'DISPUTED'];
export const isOpenTrail = (t: Pick<MoneyTrail, 'status'>) => OPEN_STATUS.includes(t.status);
export const sideIsCp = (s: TrailSide) => s === 'CP_OWNER' || s === 'CP_STAFF';
export const routeOf = (collectorSide: TrailSide): TrailRoute => (sideIsCp(collectorSide) ? 'CP' : 'BUILDER');

/** Where a trail starts: a CP owner collecting himself already holds it as the CP; everybody else is a collector awaiting the next person. */
export const startStatus = (collectorSide: TrailSide): TrailStatus => (collectorSide === 'CP_OWNER' ? 'WITH_CP' : 'WITH_COLLECTOR');

/** Who holds the money right now. NOT_RECEIVED keeps it with the last person who confirmed having it. */
export function holderOf(t: Pick<MoneyTrail, 'status' | 'route'>): HolderKind {
  switch (t.status) {
    case 'WITH_COLLECTOR': case 'DISPUTED': return 'COLLECTOR';
    case 'WITH_CP': return 'CP';
    case 'NOT_RECEIVED': return t.route === 'CP' ? 'CP' : 'COLLECTOR';
    case 'HANDED_OVER': return 'BUILDER_PENDING';
    case 'CONFIRMED': return 'BUILDER';
    default: return 'NONE';
  }
}

/** The person (or party) named as the holder, given the booking's CP and builder names. */
export function holderName(t: Pick<MoneyTrail, 'status' | 'route' | 'collector'>, cpName: string, builderName: string): string {
  switch (holderOf(t)) {
    case 'COLLECTOR': return t.collector.name;
    case 'CP': return cpName;
    case 'BUILDER_PENDING': case 'BUILDER': return builderName;
    default: return '—';
  }
}

export interface TrailActor {
  id: string;
  /** which side of the booking this person is on; null = a stranger (or the platform admin, who only watches) */
  side: TrailSide | null;
  /** may he record money he collected / hand it over — owners always, staff when the employer switched it on */
  canCollect: boolean;
  /** may he confirm a stage — owners always, staff when the employer switched it on */
  canConfirm: boolean;
}

export interface TrailActions { cpConfirm: boolean; handover: boolean; builderConfirm: boolean; cancel: boolean }
const NONE: TrailActions = { cpConfirm: false, handover: false, builderConfirm: false, cancel: false };

/** What this person may do on this trail right now. The server enforces exactly this; the screen only shows the buttons that apply. */
export function trailActions(t: MoneyTrail, a: TrailActor | null): TrailActions {
  if (!a || !a.side || !isOpenTrail(t)) return NONE;
  const cpAuth = a.side === 'CP_OWNER' || (a.side === 'CP_STAFF' && a.canConfirm);
  const bAuth = a.side === 'BUILDER_OWNER' || (a.side === 'BUILDER_STAFF' && a.canConfirm);
  const other = a.id !== t.collector.id; // nobody confirms the money he collected himself
  const st = t.status;
  return {
    cpConfirm: t.route === 'CP' && cpAuth && other && (st === 'WITH_COLLECTOR' || st === 'DISPUTED'),
    handover: t.route === 'CP' && cpAuth && (st === 'WITH_CP' || st === 'NOT_RECEIVED'),
    builderConfirm: bAuth && other && st !== 'CONFIRMED',
    cancel: (a.id === t.collector.id && (st === 'WITH_COLLECTOR' || st === 'DISPUTED'))
      || (t.route === 'CP' && cpAuth && ['WITH_COLLECTOR', 'WITH_CP', 'DISPUTED', 'NOT_RECEIVED'].includes(st))
      || bAuth,
  };
}

/**
 * The builder side confirms in order (collector → CP → hand-over → builder). Confirming "received" earlier than HANDED_OVER on the CP route
 * (the customer paid the builder straight away, say) is allowed, but the person must say why. "Not received" always needs a reason.
 */
export function builderNeedsNote(t: Pick<MoneyTrail, 'status' | 'route'>, received: boolean): boolean {
  return !received || (t.route === 'CP' && t.status !== 'HANDED_OVER');
}

/** Money on a target that is still in motion (cannot be recorded a second time). */
export function reservedOn(trails: MoneyTrail[] | undefined, target: string): number {
  return (trails || []).filter(t => t.target === target && isOpenTrail(t)).reduce((a, t) => a + t.amount, 0);
}
export const openTrailOn = (trails: MoneyTrail[] | undefined, target: string) => (trails || []).find(t => t.target === target && isOpenTrail(t));

export interface HolderTotals { count: number; amount: number }
/** Totals per holder over a set of trails (cancelled ones ignored) — the clickable "who has the money" tiles. */
export function holderTotals(trails: MoneyTrail[]): Record<HolderKind, HolderTotals> {
  const out: Record<HolderKind, HolderTotals> = { COLLECTOR: { count: 0, amount: 0 }, CP: { count: 0, amount: 0 }, BUILDER_PENDING: { count: 0, amount: 0 }, BUILDER: { count: 0, amount: 0 }, NONE: { count: 0, amount: 0 } };
  for (const t of trails) { if (t.status === 'CANCELLED') continue; const h = out[holderOf(t)]; h.count++; h.amount += t.amount; }
  return out;
}

const DAY = 86_400_000;
export const trailAgeDays = (t: Pick<MoneyTrail, 'updatedAt'>, now = Date.now()) => Math.floor((now - Date.parse(t.updatedAt)) / DAY);

/** Alert buckets for the CRM alert bar. */
export function trailFlags<T extends MoneyTrail>(trails: T[], now = Date.now()) {
  return {
    withTeam: trails.filter(t => t.status === 'WITH_COLLECTOR' && now - Date.parse(t.updatedAt) > TRAIL_WITH_TEAM_DAYS * DAY),
    awaitingBuilder: trails.filter(t => t.status === 'HANDED_OVER' && now - Date.parse(t.updatedAt) > TRAIL_AWAITING_BUILDER_DAYS * DAY),
    stuck: trails.filter(t => t.status === 'DISPUTED' || t.status === 'NOT_RECEIVED'),
  };
}

export interface NewTrailInput { target: string; amount: number; mode: string; ref?: string; paidOn?: string; note?: string }
/** Validate what a collector typed. Cash may go without a reference; every other mode needs the cheque no. / UTR so the next person can match it. */
export function cleanNewTrail(input: any, now = Date.now()): { error: string } | { ok: NewTrailInput } {
  const target = String(input?.target ?? '').trim();
  if (!target || target.length > 60) return { error: 'Pick what this money is for — the booking amount or an instalment' };
  const amount = Math.round(Number(input?.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { error: 'Amount must be greater than zero' };
  if (amount > 10_000_000_000) return { error: 'That amount looks wrong — please check it' };
  const mode = String(input?.mode ?? '');
  if (!TRAIL_MODE_IDS.includes(mode)) return { error: 'How was it paid? (cheque / UPI / NEFT / cash …)' };
  const ref = String(input?.ref ?? '').trim();
  if (mode !== 'CASH' && ref.length < 3) return { error: 'Give the cheque number / UTR (min 3 characters) — the next person needs it to match the money' };
  if (ref.length > 40) return { error: 'The reference can be at most 40 characters' };
  let paidOn: string | undefined;
  if (input?.paidOn !== undefined && input.paidOn !== '' && input.paidOn !== null) {
    const ms = Date.parse(String(input.paidOn));
    if (Number.isNaN(ms)) return { error: 'The payment date is not valid' };
    if (ms > now + DAY) return { error: 'The payment date cannot be in the future' };
    paidOn = new Date(ms).toISOString();
  }
  const note = String(input?.note ?? '').trim().slice(0, 200);
  return { ok: { target, amount, mode, ...(ref ? { ref } : {}), ...(paidOn ? { paidOn } : {}), ...(note ? { note } : {}) } };
}

/** Close every open trail of a booking (the booking was cancelled or rejected — the money must go back to the customer). Returns how many closed. */
export function closeOpenTrails(trails: MoneyTrail[] | undefined, by: { id: string; name: string; side: TrailSide }, reason: string, now = new Date().toISOString()): number {
  let n = 0;
  for (const t of trails || []) {
    if (!isOpenTrail(t)) continue;
    t.status = 'CANCELLED'; t.updatedAt = now;
    t.steps.push({ stage: 'CANCELLED', at: now, byId: by.id, byName: by.name, side: by.side, note: reason.slice(0, 200) });
    n++;
  }
  return n;
}

export function newTrailId(now = Date.now()): string {
  return `TR-${now.toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`;
}

// ───────────────────────── the stepper the screen draws ─────────────────────────
export type StepKey = 'COLLECTED' | 'CP' | 'HANDOVER' | 'BUILDER';
export interface StepView { key: StepKey; state: 'done' | 'current' | 'todo' | 'bad'; step?: TrailStep }

/**
 * The 2 or 4 boxes of a trail: Collected → Partner confirmed → Handed to builder → Builder confirmed (the builder's own people skip the middle two).
 * `bad` = the stage where it got stuck (partner says he never got it / builder says it never arrived). `step` = the latest record of that stage, for "who + when".
 */
export function stepperOf(t: MoneyTrail): StepView[] {
  const last = (...stages: TrailStage[]) => [...t.steps].reverse().find(s => stages.includes(s.stage));
  const cancelled = t.status === 'CANCELLED';
  const keys: StepKey[] = t.route === 'CP' ? ['COLLECTED', 'CP', 'HANDOVER', 'BUILDER'] : ['COLLECTED', 'BUILDER'];
  const doneOf = (k: StepKey): boolean => {
    switch (k) {
      case 'COLLECTED': return true;
      case 'CP': return t.collector.side === 'CP_OWNER' || ['WITH_CP', 'HANDED_OVER', 'CONFIRMED', 'NOT_RECEIVED'].includes(t.status);
      case 'HANDOVER': return ['HANDED_OVER', 'CONFIRMED', 'NOT_RECEIVED'].includes(t.status);
      case 'BUILDER': return t.status === 'CONFIRMED';
    }
  };
  const badOf = (k: StepKey) => (k === 'CP' && t.status === 'DISPUTED') || (k === 'BUILDER' && t.status === 'NOT_RECEIVED');
  let currentSet = false;
  return keys.map(k => {
    const step = k === 'COLLECTED' ? last('COLLECTED') : k === 'CP' ? last('CP_CONFIRMED', 'CP_NOT_RECEIVED') : k === 'HANDOVER' ? last('HANDED_OVER') : last('BUILDER_CONFIRMED', 'BUILDER_NOT_RECEIVED');
    if (badOf(k)) { currentSet = true; return { key: k, state: 'bad' as const, step }; }
    if (doneOf(k)) return { key: k, state: 'done' as const, step: k === 'CP' && t.collector.side === 'CP_OWNER' ? last('COLLECTED') : step };
    if (!currentSet && !cancelled) { currentSet = true; return { key: k, state: 'current' as const, step }; }
    return { key: k, state: 'todo' as const, step };
  });
}
