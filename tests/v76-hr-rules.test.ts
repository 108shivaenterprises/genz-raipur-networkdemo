import { describe, it, expect } from 'vitest';
import * as H from '../src/shared/hrRules.js';

/** v76 — HR rules, no server: who gets which tool, Indian dates, attendance codes, leave, targets, statement, claims. */
const S = (over: Partial<H.HrSettingsLike> = {}): H.HrSettingsLike => ({ ...H.DEFAULT_HR_SETTINGS, weeklyOff: [0], holidays: [], mutedNational: [], ...over });
const ist = (s: string) => Date.parse(s + '+05:30');

describe('who gets which HR tool', () => {
  it('a broker and a builder get all seven, a contractor no targets / statement, everybody else none', () => {
    expect(H.hrFeaturesFor('BROKER')).toEqual(H.HR_FEATURES);
    expect(H.hrFeaturesFor('DEVELOPER_BUILDER')).toEqual(H.HR_FEATURES);
    const con = H.hrFeaturesFor('CONTRACTOR');
    expect(con).toEqual(['ATTENDANCE', 'LEAVE', 'CLAIMS', 'ASSETS', 'HOLIDAYS']);
    expect(con).not.toContain('TARGETS'); expect(con).not.toContain('STATEMENT');
    for (const r of ['PROPERTY_OWNER', 'BUYER_TENANT', 'LEGAL_COUNSEL', 'ADMIN', 'SUPERADMIN', 'GENZ_CONNECTOR', 'TEAM_MEMBER', undefined]) expect(H.hrFeaturesFor(r as string | undefined), String(r)).toEqual([]);
    expect(H.isHrEmployer('BROKER')).toBe(true); expect(H.isHrEmployer('LEGAL_COUNSEL')).toBe(false);
  });
});

describe('Indian dates', () => {
  it('a punch at 23:50 IST belongs to that Indian day, whatever the server zone', () => {
    expect(H.istParts(ist('2026-03-01T23:50:00')).date).toBe('2026-03-01');
    expect(H.istParts(ist('2026-03-02T00:10:00')).date).toBe('2026-03-02');
    expect(H.istParts(ist('2026-03-02T10:16:00')).minutes).toBe(10 * 60 + 16);
    expect(H.istParts(ist('2026-03-02T10:16:00')).dow).toBe(1); // Monday
    expect(H.timeOf(ist('2026-03-02T09:05:00'))).toBe('09:05');
  });
  it('validates dates and months, counts days', () => {
    expect(H.isDate('2026-02-28')).toBe(true); expect(H.isDate('2026-02-30')).toBe(false); expect(H.isDate('26-02-28')).toBe(false); expect(H.isDate(5)).toBe(false);
    expect(H.isMonth('2026-12')).toBe(true); expect(H.isMonth('2026-13')).toBe(false);
    expect(H.monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28', days: 28 });
    expect(H.monthBounds('2028-02').days).toBe(29);
    expect(H.addDays('2026-02-28', 1)).toBe('2026-03-01'); expect(H.daysBetween('2026-03-01', '2026-03-08')).toBe(7);
  });
});

describe('settings and holidays', () => {
  it('four national days come on their own; the employer can mute one or add his own', () => {
    expect(H.holidayOn(S(), '2026-01-26')).toBe('Republic Day');
    expect(H.holidayOn(S({ mutedNational: ['01-26'] }), '2026-01-26')).toBeNull();
    expect(H.holidayOn(S({ holidays: [{ date: '2026-11-08', label: 'Diwali' }] }), '2026-11-08')).toBe('Diwali');
    expect(H.isWorkingDay(S(), '2026-03-01')).toBe(false); // Sunday
    expect(H.isWorkingDay(S(), '2026-03-02')).toBe(true);
    expect(H.holidaysIn(S({ holidays: [{ date: '2026-10-20', label: 'Dussehra' }] }), '2026-10').map(h => h.label)).toEqual(['Gandhi Jayanti', 'Dussehra']);
  });
  it('a settings patch is validated and never mutates the old one', () => {
    const cur = S();
    expect(H.cleanSettings({ workStart: '25:00' }, cur)).toMatch(/Work start/);
    expect(H.cleanSettings({ graceMin: 500 }, cur)).toMatch(/Grace/);
    expect(H.cleanSettings({ weeklyOff: [1, 2, 3, 4] }, cur)).toMatch(/Weekly off/);
    expect(H.cleanSettings({ leaveAllowance: 99 }, cur)).toMatch(/Leave days/);
    expect(H.cleanSettings({ holidays: [{ date: '2026-13-01', label: 'x' }] }, cur)).toMatch(/YYYY-MM-DD/);
    expect(H.cleanSettings({ holidays: [{ date: '2026-11-08', label: ' ' }] }, cur)).toMatch(/name/);
    expect(H.cleanSettings({ mutedNational: ['07-04'] }, cur)).toMatch(/Unknown/);
    const ok = H.cleanSettings({ workStart: '09:30', graceMin: 10, weeklyOff: [0, 6, 6], leaveAllowance: 18, selfie: false, holidays: [{ date: '2026-11-09', label: 'Bhai Dooj' }, { date: '2026-11-08', label: 'Diwali' }, { date: '2026-11-08', label: 'dup' }] }, cur) as H.HrSettingsLike;
    expect(ok.workStart).toBe('09:30'); expect(ok.weeklyOff).toEqual([0, 6]); expect(ok.selfie).toBe(false);
    expect(ok.holidays.map(h => h.date)).toEqual(['2026-11-08', '2026-11-09']); // sorted, the duplicate date dropped
    expect(cur.workStart).toBe('10:00'); expect(cur.holidays).toEqual([]);
  });
});

describe('attendance', () => {
  it('late only after the grace time', () => {
    const s = S();
    expect(H.lateMinutes(s, ist('2026-03-02T09:50:00'))).toBe(0);
    expect(H.lateMinutes(s, ist('2026-03-02T10:15:00'))).toBe(0);
    expect(H.lateMinutes(s, ist('2026-03-02T10:16:00'))).toBe(16);
  });
  it('one letter per day', () => {
    const s = S(); const today = '2026-03-10'; // Tuesday
    const code = (date: string, rec?: any, leaves: any[] = [], joined?: string) => H.dayCode(s, date, rec, leaves, today, joined);
    expect(code('2026-03-09', { date: '2026-03-09', inAt: 'x', lateMin: 0 })).toBe('P');
    expect(code('2026-03-09', { date: '2026-03-09', inAt: 'x', lateMin: 20 })).toBe('L');
    expect(code('2026-03-09')).toBe('A');                       // a working day nobody came
    expect(code('2026-03-08')).toBe('O');                       // Sunday
    expect(code('2026-03-09', undefined, [{ from: '2026-03-09', to: '2026-03-09', status: 'APPROVED' }])).toBe('V');
    expect(code('2026-03-09', undefined, [{ from: '2026-03-09', to: '2026-03-09', status: 'PENDING' }])).toBe('A'); // a request is not a leave
    expect(code('2026-03-09', { date: '2026-03-09', manual: 'HALF' })).toBe('H');
    expect(code('2026-03-09', { date: '2026-03-09', manual: 'ABSENT', inAt: 'x' })).toBe('A'); // the employer's mark wins
    expect(code('2026-03-10')).toBe('-');                       // today is still open
    expect(code('2026-03-11')).toBe('-');
    expect(code('2026-03-03', undefined, [], '2026-03-05')).toBe('-'); // before he joined
  });
  it('a month summary counts a half day as half', () => {
    const sum = H.summarize(['P', 'P', 'L', 'H', 'A', 'V', 'O', '-']);
    expect(sum).toMatchObject({ P: 2, L: 1, H: 1, A: 1, V: 1, O: 1, workingDays: 6, presentDays: 3.5 });
  });
  it('the Today board: in, late, out, leave, off, absent, not yet', () => {
    const s = S({ workStart: '10:00', graceMin: 15 });
    const mon = (t: string) => ist(`2026-03-02T${t}`);
    expect(H.todayState(s, { date: '2026-03-02', inAt: 'x', lateMin: 0 }, [], mon('11:00:00'))).toBe('IN');
    expect(H.todayState(s, { date: '2026-03-02', inAt: 'x', lateMin: 30 }, [], mon('11:00:00'))).toBe('LATE');
    expect(H.todayState(s, { date: '2026-03-02', inAt: 'x', outAt: 'y', lateMin: 0 }, [], mon('19:00:00'))).toBe('OUT');
    expect(H.todayState(s, undefined, [], mon('09:00:00'))).toBe('NOT_YET');
    expect(H.todayState(s, undefined, [], mon('10:20:00'))).toBe('ABSENT');
    expect(H.todayState(s, undefined, [{ from: '2026-03-02', to: '2026-03-03', status: 'APPROVED' }], mon('10:20:00'))).toBe('ON_LEAVE');
    expect(H.todayState(s, undefined, [], ist('2026-03-01T12:00:00'))).toBe('OFF'); // Sunday
  });
});

describe('leave', () => {
  const s = S({ leaveAllowance: 12 });
  it('weekly offs and holidays are not leave days', () => {
    expect(H.leaveDays(s, '2026-03-02', '2026-03-08')).toBe(6); // Mon..Sun
    expect(H.leaveDays(s, '2026-03-01', '2026-03-01')).toBe(0);
    expect(H.leaveDays(s, '2026-03-05', '2026-03-02')).toBe(0);
    expect(H.leaveDays(s, '2026-01-01', '2026-03-31')).toBe(0); // longer than 31 days is refused, not counted
  });
  it('a request is checked: dates, back-dating, reason, overlap, balance', () => {
    const today = '2026-03-10';
    const ask = (i: any, ex: H.LeaveRec[] = []) => H.checkLeave(s, i, ex, today);
    expect(ask({})).toMatch(/first and last/);
    expect(ask({ from: '2026-03-12', to: '2026-03-11', reason: 'trip' })).toMatch(/cannot be before/);
    expect(ask({ from: '2026-02-01', to: '2026-02-03', reason: 'trip' })).toMatch(/after the fact/);
    expect(ask({ from: '2026-03-12', to: '2026-03-12', reason: 'x' })).toMatch(/reason/);
    expect(ask({ from: '2026-03-12', to: '2026-03-12', type: 'MAGIC', reason: 'trip' })).toMatch(/type/);
    expect(ask({ from: '2026-03-08', to: '2026-03-08', reason: 'sunday' })).toMatch(/weekly offs/);
    const ok = ask({ from: '2026-03-11', to: '2026-03-13', reason: 'wedding' }) as any;
    expect(ok).toMatchObject({ from: '2026-03-11', to: '2026-03-13', type: 'CASUAL', days: 3 });
    const have: H.LeaveRec[] = [{ from: '2026-03-12', to: '2026-03-12', status: 'PENDING', days: 1, type: 'CASUAL' }];
    expect(ask({ from: '2026-03-11', to: '2026-03-13', reason: 'wedding' }, have)).toMatch(/already have/);
    const used: H.LeaveRec[] = [{ from: '2026-01-05', to: '2026-01-14', status: 'APPROVED', days: 8, type: 'CASUAL' }, { from: '2026-02-02', to: '2026-02-04', status: 'PENDING', days: 3, type: 'SICK' }];
    expect(H.leaveBalance(s, used, '2026')).toEqual({ allowance: 12, used: 8, pending: 3, left: 1 });
    expect(ask({ from: '2026-03-11', to: '2026-03-12', reason: 'wedding' }, used)).toMatch(/Only 1 paid leave/);
    expect(ask({ from: '2026-03-11', to: '2026-03-12', type: 'UNPAID', reason: 'wedding' }, used)).toMatchObject({ type: 'UNPAID', days: 2 }); // unpaid is not counted against the allowance
    expect(H.leaveBalance(s, used, '2025')).toMatchObject({ used: 0, left: 12 });
  });
});

describe('targets', () => {
  it('a target needs one real figure and stays whole numbers', () => {
    expect(H.cleanTarget({ calls: 0, visits: 0, bookings: 0 })).toMatch(/at least one/);
    expect(H.cleanTarget({ calls: -1 })).toMatch(/Calls/);
    expect(H.cleanTarget({ calls: 10.5 })).toMatch(/Calls/);
    expect(H.cleanTarget({ visits: 99999 })).toMatch(/Site visits/);
    expect(H.cleanTarget({ calls: '150', visits: 15 })).toEqual({ calls: 150, visits: 15, bookings: 0 });
    expect(H.suggestTarget('TELECALLER').calls).toBeGreaterThan(H.suggestTarget('SALES_EXECUTIVE').calls);
  });
  it('pace is measured against how much of the month is gone', () => {
    const tg = { calls: 100, visits: 10, bookings: 0 };
    const half = H.targetProgress(tg, { calls: 50, visits: 5, bookings: 0 }, 0.5);
    expect(half.rows.map(r => r.metric)).toEqual(['calls', 'visits']); // a zero target is not a row
    expect(half).toMatchObject({ overall: 50, pace: 'ON_TRACK' });
    expect(H.targetProgress(tg, { calls: 50, visits: 5, bookings: 0 }, 1).pace).toBe('BEHIND');
    expect(H.targetProgress(tg, { calls: 50, visits: 5, bookings: 0 }, 0.2).pace).toBe('AHEAD');
    expect(H.targetProgress(tg, { calls: 300, visits: 30, bookings: 0 }, 1).overall).toBe(100); // over-achieving one metric cannot hide a miss on another
    expect(H.targetProgress(tg, { calls: 300, visits: 0, bookings: 0 }, 1).overall).toBe(50);
  });
  it('the elapsed share counts working days only', () => {
    const s = S();
    expect(H.monthElapsed(s, '2026-03', '2026-02-28')).toBe(0);
    expect(H.monthElapsed(s, '2026-03', '2026-03-31')).toBe(1);
    expect(H.monthElapsed(s, '2026-03', '2026-04-15')).toBe(1);
    const mid = H.monthElapsed(s, '2026-03', '2026-03-15'); expect(mid).toBeGreaterThan(0.4); expect(mid).toBeLessThan(0.6);
  });
});

describe('statement, claims, assets', () => {
  it('net pay adds fixed, incentive and signed lines; bad lines are refused', () => {
    expect(H.netPay(20000, 3500, [{ label: 'Petrol', amount: 1500 }, { label: 'Absent 2 days', amount: -1333 }])).toBe(23667);
    expect(H.cleanAdjustments([{ label: 'x', amount: 5 }])).toMatch(/Name/);
    expect(H.cleanAdjustments([{ label: 'Bonus', amount: 0 }])).toMatch(/non-zero/);
    expect(H.cleanAdjustments(new Array(13).fill({ label: 'Bonus', amount: 5 }))).toMatch(/12/);
    expect(H.cleanAdjustments([{ label: ' Bonus ', amount: '500.4' }])).toEqual([{ label: 'Bonus', amount: 500 }]);
    expect(H.cleanFixed(-5)).toMatch(/rupee/); expect(H.cleanFixed('25000')).toBe(25000);
  });
  it('a claim: kind, amount, a note, a recent past date', () => {
    const today = '2026-03-10';
    expect(H.cleanClaim({ kind: 'PETROL', amount: 450, note: 'site visits' }, today)).toEqual({ date: today, kind: 'PETROL', amount: 450, note: 'site visits' });
    expect(H.cleanClaim({ kind: 'NOPE', amount: 450, note: 'site visits' }, today)).toMatch(/kind/);
    expect(H.cleanClaim({ kind: 'PETROL', amount: 0, note: 'site visits' }, today)).toMatch(/between/);
    expect(H.cleanClaim({ kind: 'PETROL', amount: 99999999, note: 'site visits' }, today)).toMatch(/between/);
    expect(H.cleanClaim({ kind: 'PETROL', amount: 450, note: 'x' }, today)).toMatch(/what the expense/);
    expect(H.cleanClaim({ kind: 'PETROL', amount: 450, note: 'site visits', date: '2026-03-11' }, today)).toMatch(/future/);
    expect(H.cleanClaim({ kind: 'PETROL', amount: 450, note: 'site visits', date: '2025-12-01' }, today)).toMatch(/60 days/);
  });
  it('asset kinds are a fixed list with Hindi names', () => {
    expect(H.ASSET_KINDS.map(k => k.id)).toEqual(expect.arrayContaining(['PHONE', 'SIM', 'KEYS', 'BROCHURE']));
    for (const k of [...H.ASSET_KINDS, ...H.CLAIM_KINDS, ...H.LEAVE_TYPES]) { expect(k.en.length).toBeGreaterThan(2); expect(/[ऀ-ॿ]/.test(k.hi), k.id).toBe(true); }
  });
});
