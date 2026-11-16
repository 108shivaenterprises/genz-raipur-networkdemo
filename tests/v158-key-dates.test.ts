import { describe, it, expect } from 'vitest';
import { checkDates, daysTo, whenWords, dateCounts, todayIST, isDay } from '../src/shared/keyDates.js';
import { HOME_TODOS } from '../src/shared/homeTodoRules.js';

// v158 — the deal's four dates: order, range, "in N days" words and the two bell counters.
const NOW = Date.parse('2026-11-16T10:00:00+05:30');
describe('key dates rules', () => {
  it('a real date only; leap day and month end are checked', () => {
    expect(isDay('2026-02-29')).toBe(false); expect(isDay('2028-02-29')).toBe(true); expect(isDay('16-11-2026')).toBe(false);
  });
  it('order: token <= agreement <= registry <= possession; range', () => {
    expect(checkDates({ token: '2026-11-20', agreement: '2026-12-01', registry: '2026-12-20' }, NOW)).toBe('');
    expect(checkDates({ token: '2026-11-20', registry: '2026-11-10' }, NOW)).toMatch(/cannot be before/);
    expect(checkDates({ registry: '2031-01-01' }, NOW)).toMatch(/out of range/);
    expect(checkDates({ token: 'soon' as any }, NOW)).toMatch(/not a date/);
  });
  it('days are counted in India time', () => {
    expect(todayIST(Date.parse('2026-11-16T20:00:00Z'))).toBe('2026-11-17');   // 1:30 am IST next day
    expect(daysTo('2026-11-19', NOW)).toBe(3); expect(whenWords('2026-11-16', NOW).en).toBe('today'); expect(whenWords('2026-11-15', NOW).past).toBe(true);
  });
  it('bell counters: a date within 3 days; registry passed and record not ticked; settled deals are left out', () => {
    const d = (stage: string, keyDates: any) => ({ stage, keyDates });
    expect(dateCounts([d('Agreement', { registry: '2026-11-18' }), d('Agreement', { registry: '2026-12-30' }), d('Settled', { registry: '2026-11-18' })], NOW)).toEqual({ dealDates: 1, dealMutation: 0 });
    expect(dateCounts([d('Handover', { registry: '2026-11-10' }), d('Handover', { registry: '2026-11-10', mutationDone: true })], NOW)).toEqual({ dealDates: 0, dealMutation: 1 });
  });
  it('both counters are in the one Home / bell list', () => {
    expect(HOME_TODOS.map(x => x.key)).toEqual(expect.arrayContaining(['dealDates', 'dealMutation']));
  });
});
