/**
 * v97 — GENZ सहायक: the pure reading rules (what he meant, what changed in his need, what time he said). No server.
 */
import { describe, it, expect } from 'vitest';
import { readIntent, readNeedChange, readWhen, findArea } from '../src/shared/sahayak';

describe('readIntent — Hindi / Hinglish / English', () => {
  const cases: [string, string][] = [
    ['hi', 'GREET'], ['Namaste ji', 'GREET'], ['नमस्ते', 'GREET'],
    ['mujhe visit karna hai', 'VISIT'], ['kal dekhne aa sakta hu', 'VISIT'], ['मुझे घर देखना है', 'VISIT'], ['I want to book a visit', 'VISIT'],
    ['photo bhejo', 'PHOTOS'], ['video hai kya', 'PHOTOS'], ['फोटो दिखाइए', 'PHOTOS'],
    ['is ghar ka rate kitna hai', 'PRICE'], ['price kam hoga?', 'PRICE'], ['कीमत क्या है', 'PRICE'],
    ['kya ye abhi available hai', 'AVAIL'], ['sold ho gaya kya', 'AVAIL'], ['kiraye pe ja chuka hai?', 'AVAIL'],
    ['aur ghar dikhao', 'MORE'], ['koi aur option hai', 'MORE'], ['और घर दिखाओ', 'MORE'],
    ['broker se baat karni hai', 'HUMAN'], ['mujhse call karo', 'HUMAN'], ['मुझे ब्रोकर से बात करनी है', 'HUMAN'],
    ['thank you', 'THANKS'], ['शुक्रिया', 'THANKS'],
    ['2bhk 15000 me kiraya chahiye', 'NEED'], ['मुझे दुकान चाहिए 20 लाख', 'NEED'],
    ['ok', 'OTHER'], ['', 'OTHER'], ['hmm theek', 'OTHER'],
  ];
  for (const [t, want] of cases) it(`“${t}” → ${want}`, () => expect(readIntent(t)).toBe(want));
  it('asking for a person beats everything else', () => expect(readIntent('visit se pehle broker se baat karni hai')).toBe('HUMAN'));
});

describe('readNeedChange — budget, type, BHK, buy / rent, area', () => {
  it('rent + BHK + area + plain-number budget', () => {
    expect(readNeedChange('2bhk rent 15000 shankar nagar', 'Raipur')).toEqual({ kind: 'RENT_IN', bhk: 2, budget: '15000', ptype: 'Residential Flat', locality: 'Shankar Nagar' });
  });
  it('buy + lakh budget, no area written', () => {
    const c = readNeedChange('budget 50 lakh me 3 bhk flat kharidna hai'); expect(c.kind).toBe('BUY'); expect(c.budget).toBe('50 lakh'); expect(c.bhk).toBe(3); expect(c.locality).toBeUndefined();
  });
  it('crore, k, comma money and Devanagari', () => {
    expect(readNeedChange('1.2 cr plot').budget).toBe('1.2 cr'); expect(readNeedChange('1.2 cr plot').ptype).toBe('Residential Plot');
    expect(readNeedChange('15k kiraya').budget).toBe('15k'); expect(readNeedChange('मुझे 12,000 तक किराये पर चाहिए')).toMatchObject({ kind: 'RENT_IN', budget: '12000' });
  });
  it('the BHK count is not mistaken for the budget', () => expect(readNeedChange('3 bhk flat chahiye').budget).toBeUndefined());
  it('a generic word alone is not an area', () => { expect(findArea('nagar mein ghar', 'Raipur')).toBeUndefined(); expect(findArea('nagar mein ghar')).toBeUndefined(); expect(findArea('main road mein flat', 'Pune')).toBeUndefined(); expect(findArea('Tatibandh me shop', 'Raipur')).toBe('Tatibandh'); });
});

describe('readWhen — the time he wants to come (IST)', () => {
  const now = new Date('2026-10-31T10:00:00Z');       // Saturday 15:30 IST
  it('tomorrow evening 5 → 17:00 IST tomorrow', () => { const w = readWhen('kal shaam 5 baje', now)!; expect(w.hi).toBe('कल शाम 5 बजे'); expect(w.iso).toBe('2026-11-01T11:30:00.000Z'); });
  it('a bare “5 baje” is the evening; “aaj dopahar 2 baje” is 14:00', () => { expect(readWhen('5 baje', now)!.iso).toBe('2026-10-31T11:30:00.000Z'); expect(readWhen('aaj dopahar 2 baje', now)!.iso).toBe('2026-10-31T08:30:00.000Z'); });
  it('weekday, am/pm and “parso subah”', () => { expect(readWhen('sunday 11am', now)!.iso).toBe('2026-11-01T05:30:00.000Z'); expect(readWhen('parso subah', now)!.hi).toBe('परसों सुबह'); });
  it('a day with no clock keeps a label and no instant; nonsense is null', () => { const w = readWhen('weekend', now)!; expect(w.iso).toBeUndefined(); expect(w.en).toContain('weekend'); expect(readWhen('xyz abc', now)).toBeNull(); expect(readWhen('', now)).toBeNull(); });
  it('a phone-like long number is not a clock time', () => expect(readWhen('9876543210', now)).toBeNull());
});
