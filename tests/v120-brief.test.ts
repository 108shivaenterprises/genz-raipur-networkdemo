import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { leadBrief, visitNudge, type BriefIn } from '../src/shared/leadBrief';

/** v120 — the deal brief: transparent points, one next step; the bot asks "by when" once. */
const base: BriefIn = { confirmed: false, revealed: false, hasBudget: false, hasType: false, homesSent: 0, networkCount: 0, viewed: 0, visitAsked: 0, visitOk: 0, customerMsgs: 0, lastCustomerHrs: null };
const read = (p: string) => readFileSync(path.join(path.resolve(import.meta.dirname, '..'), p), 'utf8');

describe('lead brief', () => {
  it('a fresh scan is cold and the step is to get the need confirmed', () => {
    const b = leadBrief(base); expect(b.label).toBe('COLD'); expect(b.next.en).toMatch(/not confirmed/);
  });
  it('confirmed + this month + a visit asked is hot, and the visit request comes first', () => {
    const b = leadBrief({ ...base, confirmed: true, revealed: true, hasBudget: true, hasType: true, timeline: 'NOW', homesSent: 3, visitAsked: 1, lastCustomerHrs: 1 });
    expect(b.label).toBe('HOT'); expect(b.next.en).toMatch(/visit request/); expect(b.score).toBe(b.reasons.reduce((a, r) => a + r.pts, 0));
  });
  it('nothing of the broker fits but the network has homes → ask the network; nothing anywhere → Radar', () => {
    expect(leadBrief({ ...base, confirmed: true, networkCount: 4 }).next.en).toMatch(/network has 4/);
    expect(leadBrief({ ...base, confirmed: true }).next.en).toMatch(/Radar/);
  });
  it('“just looking” and a week of silence pull the score down; a closed lead is zero', () => {
    const b = leadBrief({ ...base, confirmed: true, timeline: 'LOOK', lastCustomerHrs: 24 * 9 }); expect(b.score).toBe(0); expect(b.label).toBe('COLD');
    expect(leadBrief({ ...base, confirmed: true, timeline: 'NOW', closed: true }).score).toBe(0);
  });
  it('wiring: the bot asks once after confirm, the lead view carries the brief, the broker card shows it, Radar puts own areas first', () => {
    const s = read('server/sahayak.ts'); expect(s).toContain('b.askedTimeline = true'); expect(s).toContain("case 'TL':");
    expect(read('server/shopPartners.ts')).toContain('brief: chat && !ownerSide(l) ? briefFor(l) : null');
    expect(read('src/components/ShopPartners.tsx')).toContain('data-testid="sp-brief"');
    expect(read('src/components/GenzRadar.tsx')).toContain('profile?.areas');
  });
  it('v123 — an agreed visit is reminded once in the 24 h before, asked about once 3 h after; never without a time or twice', () => {
    const t = Date.parse('2026-11-12T11:00:00+05:30'); const v = { status: 'OK', whenIso: new Date(t).toISOString() };
    expect(visitNudge(v, t - 30 * 3600_000)).toBe(null); expect(visitNudge(v, t - 20 * 3600_000)).toBe('REMIND'); expect(visitNudge({ ...v, remindedAt: 'x' }, t - 2 * 3600_000)).toBe(null);
    expect(visitNudge(v, t + 3600_000)).toBe(null); expect(visitNudge(v, t + 4 * 3600_000)).toBe('AFTER'); expect(visitNudge({ ...v, askedAfterAt: 'x' }, t + 4 * 3600_000)).toBe(null);
    expect(visitNudge(v, t + 100 * 3600_000)).toBe(null); expect(visitNudge({ status: 'ASKED', whenIso: v.whenIso }, t - 3600_000)).toBe(null); expect(visitNudge({ status: 'OK' }, t)).toBe(null);
    expect(read('server/shopPartners.ts')).toContain('n += sahayak.remindVisits(l)');
  });
});
