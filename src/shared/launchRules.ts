/**
 * v16.8 — GENZ network launch: who sees a project, and when.
 * Pure rules (no server imports) so the tests and the browser share them.
 *
 * Why three groups, and why a staged launch:
 *  - BIG_FIRM     RERA-registered firms with a real team (5+ active staff, or marked by the GENZ desk) — can absorb a big launch fast.
 *  - INDEPENDENT  RERA-registered individual brokers / small agencies.
 *  - LOCAL        Local Associates (no RERA no.). RERA law covers agents who sell REGISTERED projects, so they never get
 *                 a selling window here — at most a "teaser" (name, place, date) so they know what is coming and can
 *                 tie up with a Tier-1 partner. Whether to show them even that is the desk's call.
 *  Each group has its own date, so GENZ can open to big firms first, independents next, locals last (or never).
 *  The builder always has to consent, and every partner still applies and is approved by the builder as before.
 */
import { tierOf } from './networkRules.js';

export type Segment = 'BIG_FIRM' | 'INDEPENDENT' | 'LOCAL';
export const SEGMENTS: Segment[] = ['BIG_FIRM', 'INDEPENDENT', 'LOCAL'];
export const BIG_FIRM_STAFF = 5;

export const SEGMENT_LABEL: Record<Segment, { en: string; hi: string; hint: { en: string; hi: string } }> = {
  BIG_FIRM: { en: 'Big RERA firms', hi: 'बड़ी RERA फ़र्में', hint: { en: `RERA no. on file and ${BIG_FIRM_STAFF}+ active staff (or marked by the desk)`, hi: `RERA नंबर दर्ज और ${BIG_FIRM_STAFF}+ सक्रिय स्टाफ़ (या डेस्क ने तय किया)` } },
  INDEPENDENT: { en: 'Independent RERA brokers', hi: 'स्वतंत्र RERA ब्रोकर', hint: { en: 'RERA no. on file, individual or small agency', hi: 'RERA नंबर दर्ज, अकेले या छोटी एजेंसी' } },
  LOCAL: { en: 'Local associates (no RERA no.)', hi: 'लोकल एसोसिएट (RERA नंबर नहीं)', hint: { en: 'Vouched local members — teaser only, never a selling window', hi: 'वाउच्ड लोकल सदस्य — सिर्फ़ झलक, बिक्री की खिड़की कभी नहीं' } },
};

export interface SegmentUser { role?: string; tier?: string; reraNumber?: string; firmSegment?: 'BIG_FIRM' | 'INDEPENDENT' }

/** Which group a broker belongs to. The RERA tier can never be overridden — only big-vs-independent can. */
export function segmentOf(u: SegmentUser, activeStaff: number): Segment | null {
  if (u.role !== 'BROKER') return null;
  if (tierOf(u) === 'TIER2') return 'LOCAL';
  if (u.firmSegment) return u.firmSegment;
  return activeStaff >= BIG_FIRM_STAFF ? 'BIG_FIRM' : 'INDEPENDENT';
}

export interface Wave { on: boolean; at: string }
export interface LocalWave { mode: 'OFF' | 'TEASER'; at: string }
export interface LaunchPlan {
  /** the builder's yes — nothing is launched without it */
  consent: 'NONE' | 'REQUESTED' | 'GRANTED' | 'DECLINED';
  requestedBy?: string; requestedAt?: string; requestNote?: string;
  decidedBy?: string; decidedAt?: string;
  status: 'DRAFT' | 'LIVE' | 'PAUSED' | 'CLOSED';
  headline: string;
  note: string;
  waves: { BIG_FIRM: Wave; INDEPENDENT: Wave; LOCAL: LocalWave };
  history: { at: string; by: string; what: string }[];
  updatedAt: string;
}
export const HEADLINE_MAX = 120;
export const NOTE_MAX = 400;
export const HISTORY_KEEP = 30;

export type LaunchView = 'HIDDEN' | 'SOON' | 'OPEN' | 'TEASER';

/**
 * What a viewer of a given group sees of a plan right now.
 *  OPEN   — can see the project and apply (builder still approves)
 *  SOON   — their wave opens later: name / place / date only
 *  TEASER — local associate: name / place / date only, no price, units, commission or apply
 */
export function launchView(plan: LaunchPlan | undefined, seg: Segment, now = Date.now()): LaunchView {
  if (!plan || plan.consent !== 'GRANTED' || plan.status !== 'LIVE') return 'HIDDEN';
  if (seg === 'LOCAL') return plan.waves.LOCAL.mode === 'TEASER' && Date.parse(plan.waves.LOCAL.at) <= now ? 'TEASER' : 'HIDDEN';
  const w = plan.waves[seg];
  if (!w.on) return 'HIDDEN';
  return Date.parse(w.at) <= now ? 'OPEN' : 'SOON';
}

/**
 * True while GENZ is steering this project's visibility, so the old open-to-all rule steps aside: the builder agreed AND the
 * launch is live or paused. A draft plan changes nothing, and a closed launch hands the project back to the builder's own setting.
 */
export const launchControls = (plan?: LaunchPlan) => !!plan && plan.consent === 'GRANTED' && (plan.status === 'LIVE' || plan.status === 'PAUSED');

export function cleanPlanInput(input: any, current: LaunchPlan): LaunchPlan | string {
  const out: LaunchPlan = JSON.parse(JSON.stringify(current));
  if (input.headline !== undefined) {
    const h = String(input.headline ?? '').trim();
    if (h.length > HEADLINE_MAX) return `Headline can be at most ${HEADLINE_MAX} characters`;
    out.headline = h;
  }
  if (input.note !== undefined) {
    const n = String(input.note ?? '').trim();
    if (n.length > NOTE_MAX) return `Note can be at most ${NOTE_MAX} characters`;
    out.note = n;
  }
  const isoOk = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  if (input.waves !== undefined) {
    const w = input.waves;
    if (typeof w !== 'object' || w === null) return 'Invalid waves';
    for (const k of ['BIG_FIRM', 'INDEPENDENT'] as const) {
      if (w[k] === undefined) continue;
      if (typeof w[k].on !== 'boolean') return `${k}: on must be true or false`;
      if (w[k].at !== undefined && !isoOk(w[k].at)) return `${k}: invalid date`;
      out.waves[k] = { on: w[k].on, at: w[k].at ?? out.waves[k].at };
    }
    if (w.LOCAL !== undefined) {
      if (!['OFF', 'TEASER'].includes(w.LOCAL.mode)) return 'Local associates can be OFF or TEASER only';
      if (w.LOCAL.at !== undefined && !isoOk(w.LOCAL.at)) return 'LOCAL: invalid date';
      out.waves.LOCAL = { mode: w.LOCAL.mode, at: w.LOCAL.at ?? out.waves.LOCAL.at };
    }
  }
  const any = out.waves.BIG_FIRM.on || out.waves.INDEPENDENT.on || out.waves.LOCAL.mode === 'TEASER';
  if (!any) return 'Pick at least one group to launch to';
  return out;
}

export function emptyPlan(now = new Date().toISOString()): LaunchPlan {
  return {
    consent: 'NONE', status: 'DRAFT', headline: '', note: '',
    waves: { BIG_FIRM: { on: true, at: now }, INDEPENDENT: { on: true, at: now }, LOCAL: { mode: 'OFF', at: now } },
    history: [], updatedAt: now,
  };
}

export const pushHistory = (plan: LaunchPlan, by: string, what: string, at = new Date().toISOString()) => {
  plan.history.unshift({ at, by, what: what.slice(0, 200) });
  plan.history.length = Math.min(plan.history.length, HISTORY_KEEP);
  plan.updatedAt = at;
};
