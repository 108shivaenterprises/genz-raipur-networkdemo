import { describe, it, expect } from 'vitest';
import { matchAction, mineFirst } from '../src/shared/matchOfferRules';
import { matchState, stateOfIso, stateOfCity } from '../src/shared/india';

/** v80 — pure rules: who a Magic Match card may offer to, and how a place name becomes OUR state. */
describe('matchAction — a Magic Match card never offers a deal to myself', () => {
  const ME = 'USR-BRK-001'; const OTHER = 'USR-BRK-002'; const THIRD = 'USR-BRK-003';
  it('my home + my buyer → my own client room, no offer', () => { expect(matchAction(ME, ME, ME)).toEqual({ kind: 'OWN' }); });
  it('my home + another broker’s buyer → the offer goes to THAT buyer’s broker', () => { expect(matchAction(ME, ME, OTHER)).toEqual({ kind: 'OFFER', to: OTHER }); });
  it('another broker’s home + my buyer → the offer goes to the broker who lists the home', () => { expect(matchAction(ME, OTHER, ME)).toEqual({ kind: 'OFFER', to: OTHER }); });
  it('neither side is mine → no button at all', () => { expect(matchAction(ME, OTHER, THIRD)).toEqual({ kind: 'NONE' }); });
  it('a missing broker id or a missing viewer never produces an offer', () => {
    expect(matchAction(undefined, ME, OTHER)).toEqual({ kind: 'NONE' });
    expect(matchAction(ME, undefined, undefined)).toEqual({ kind: 'NONE' });
    expect(matchAction(ME, ME, undefined)).toEqual({ kind: 'NONE' });
    expect(matchAction(ME, undefined, ME)).toEqual({ kind: 'NONE' });
  });
  it('the target of an OFFER is never me', () => {
    for (const [p, r] of [[ME, OTHER], [OTHER, ME], [ME, ME], [OTHER, THIRD], [THIRD, ME]] as const) { const a = matchAction(ME, p, r); if (a.kind === 'OFFER') expect(a.to).not.toBe(ME); }
  });
});

describe('mineFirst', () => {
  it('puts mine first and keeps every other order as it was', () => {
    const list = [{ id: 1, o: 'b' }, { id: 2, o: 'me' }, { id: 3, o: 'c' }, { id: 4, o: 'me' }];
    expect(mineFirst(list, x => x.o === 'me').map(x => x.id)).toEqual([2, 4, 1, 3]);
    expect(mineFirst([], () => true)).toEqual([]);
  });
});

describe('matchState — a geocoder / an edge network spells a state its own way', () => {
  it('the exact names still work', () => { expect(matchState('Chhattisgarh')?.name).toBe('Chhattisgarh'); expect(matchState('  maharashtra ')?.name).toBe('Maharashtra'); });
  it('known other spellings map to our state', () => {
    const cases: [string, string][] = [['Orissa', 'Odisha'], ['NCT of Delhi', 'Delhi'], ['State of Delhi', 'Delhi'], ['Jammu & Kashmir', 'Jammu and Kashmir'], ['Chattisgarh', 'Chhattisgarh'], ['Pondicherry', 'Puducherry'], ['Uttaranchal', 'Uttarakhand'], ['Andaman & Nicobar Islands', 'Andaman and Nicobar Islands']];
    for (const [raw, want] of cases) expect(matchState(raw)?.name, raw).toBe(want);
  });
  it('rubbish or an empty value is no state (the form is left for the person to fill)', () => {
    for (const raw of ['', undefined, '   ', 'Atlantis', 'California']) expect(matchState(raw as string)).toBeUndefined();
  });
});

describe('stateOfIso — the region code an edge network sends', () => {
  it('maps ISO 3166-2:IN codes', () => {
    expect(stateOfIso('CT')?.name).toBe('Chhattisgarh'); expect(stateOfIso('mh')?.name).toBe('Maharashtra'); expect(stateOfIso('DL')?.name).toBe('Delhi');
    expect(stateOfIso('OR')?.name).toBe('Odisha'); expect(stateOfIso('TG')?.name).toBe('Telangana'); expect(stateOfIso('UT')?.name).toBe('Uttarakhand');
  });
  it('an unknown code is no state', () => { expect(stateOfIso('ZZ')).toBeUndefined(); expect(stateOfIso('')).toBeUndefined(); expect(stateOfIso(undefined)).toBeUndefined(); });
  it('a city we know also tells its state (the form falls back to it)', () => { expect(stateOfCity('Raipur')).toBe('Chhattisgarh'); expect(stateOfCity('raipur')).toBe('Chhattisgarh'); });
});
