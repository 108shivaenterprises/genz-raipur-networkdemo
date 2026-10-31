/** v99 — the listing-question engine (pure rules): order, relevance, reading answers, safety of the public text. */
import { describe, it, expect } from 'vitest';
import { nextAsk, progress, applyAnswer, composeListing, summaryLine, applies, answered, type AskId } from '../src/shared/listingAsk';

const base = (o: Record<string, any> = {}) => ({ transactionType: 'Sale', locality: 'Baner', city: 'Pune', ...o });
const run = (f: Record<string, any>, steps: [AskId, { chip?: string; text?: string }][]) => {
  let cur = f;
  for (const [id, inp] of steps) { const r = applyAnswer(cur, id, inp); if (!r.ok) throw new Error(`${id}: ${r.hint.en}`); cur = r.fields; }
  return cur;
};

describe('which questions, in which order', () => {
  it('starts with the type; BHK/floor only for homes; furnishing only for rent', () => {
    expect(nextAsk(base())!.id).toBe('ptype');
    expect(applies(base({ propertyType: 'Residential Plot' }), 'bhk')).toBe(false);
    expect(applies(base({ propertyType: 'Residential Plot' }), 'floor')).toBe(false);
    expect(applies(base({ propertyType: 'Residential Flat' }), 'furn')).toBe(false);
    expect(applies(base({ propertyType: 'Residential Flat', transactionType: 'Rent' }), 'furn')).toBe(true);
    expect(applies(base({ propertyType: 'Agricultural Land', transactionType: 'Rent' }), 'furn')).toBe(false);
  });
  it('a plot is asked for size in plot units and is never asked BHK', () => {
    const f = base({ propertyType: 'Residential Plot' });
    const ids: string[] = []; let cur: Record<string, any> = f; let a;
    while ((a = nextAsk(cur, [])) && ids.length < 12) { ids.push(a.id); cur = run(cur, [[a.id, a.optional ? { chip: 'SKIP' } : { text: a.id === 'price' ? '40 lakh' : '' }]]); if (a.optional) cur = { ...cur, ...({ [a.id]: 1 } as any) }; if (ids.length > 9) break; }
    expect(ids).not.toContain('bhk');
  });
  it('skipped questions are not asked again; progress counts them as done', () => {
    const f = base({ propertyType: 'Residential Flat', bhk: 2 });
    expect(nextAsk(f, ['area'])!.id).toBe('floor');
    expect(progress(f, ['area']).done).toBe(progress(f, []).done + 1);
  });
  it('a price from the form is offered back (not asked from scratch) and is only “answered” once confirmed', () => {
    const f = base({ propertyType: 'Residential Flat', bhk: 2, areaSqft: 900, floor: '2nd', askingPrice: 7500000 });
    expect(answered(f, 'price')).toBe(false); const a = nextAsk(f)!; expect(a.id).toBe('price'); expect(a.chips.map(c => c.id)).toContain('KEEP');
  });
});

describe('reading answers', () => {
  const flat = base({ propertyType: 'Residential Flat' });
  it('BHK from a tap or words; nonsense is refused', () => {
    expect(run(flat, [['bhk', { chip: '3' }]]).bhk).toBe(3);
    expect(run(flat, [['bhk', { text: '2 bhk hai' }]]).bhk).toBe(2);
    expect(applyAnswer(flat, 'bhk', { text: 'bahut bada' }).ok).toBe(false);
  });
  it('size: with a unit, dimensions, a bare number as sqft; no unit and tiny numbers are asked again', () => {
    expect(run(flat, [['area', { text: '1150 sqft' }]]).areaSqft).toBe(1150);
    expect(run(flat, [['area', { text: '40x60' }]]).areaSqft).toBe(2400);
    expect(run(flat, [['area', { text: '950' }]]).areaSqft).toBe(950);
    expect(applyAnswer(flat, 'area', { text: '7' }).ok).toBe(false);
  });
  it('sale price: lakh/crore words; “40” or “15k” on a sale is refused with a hint, never guessed', () => {
    expect(run(flat, [['price', { text: '85 lakh' }]]).askingPrice).toBe(8500000);
    expect(run(flat, [['price', { text: '1.2 cr' }]]).askingPrice).toBe(12000000);
    expect(applyAnswer(flat, 'price', { text: '40' }).ok).toBe(false);
    const r = applyAnswer(flat, 'price', { text: '15k' }); expect(r.ok).toBe(false);
    if (!r.ok) expect(r.hint.hi).not.toContain('15000 लाख');
  });
  it('rent: 15k / 15000 work; absurd values are refused', () => {
    const rent = base({ propertyType: 'Residential Flat', transactionType: 'Rent' });
    expect(run(rent, [['price', { text: '15k' }]]).askingPrice).toBe(15000);
    expect(run(rent, [['price', { text: '₹18,500' }]]).askingPrice).toBe(18500);
    expect(applyAnswer(rent, 'price', { text: '90000000' }).ok).toBe(false);
  });
  it('KEEP only works when there is a price to keep', () => {
    expect(applyAnswer(flat, 'price', { chip: 'KEEP' }).ok).toBe(false);
    const f = run({ ...flat, askingPrice: 5000000 }, [['price', { chip: 'KEEP' }]]); expect(f.priceConfirmed).toBe(true); expect(f.ownerApprovedNetPrice).toBe(5000000);
  });
  it('the address refuses a phone number; ptype can be typed in Hindi or English', () => {
    expect(applyAnswer(flat, 'address', { text: 'near temple 9876543210' }).ok).toBe(false);
    expect(run(flat, [['address', { text: 'Lane 4, Sai Residency' }]]).addressHidden).toBe('Lane 4, Sai Residency');
    expect(run(base(), [['ptype', { text: 'dukan' }]]).propertyType).toBe('Commercial Shop');
    expect(run(base(), [['ptype', { chip: 'FLAT' }]]).propertyType).toBe('Residential Flat');
  });
  it('“not sure” works for optional questions and is refused for the ones the draft cannot live without', () => {
    expect(applyAnswer(flat, 'floor', { chip: 'SKIP' })).toMatchObject({ ok: true, skip: true });
    expect(applyAnswer(flat, 'ptype', { chip: 'SKIP' }).ok).toBe(false);
    expect(applyAnswer(flat, 'price', { chip: 'SKIP' }).ok).toBe(false);
  });
});

describe('what the broker/public gets', () => {
  it('title + description are public-safe: no address, owner name or number', () => {
    const f = run(base({ propertyType: 'Residential Flat', ownerName: 'Sunita Deshpande', ownerPhone: '9123459901' }), [
      ['bhk', { chip: '2' }], ['area', { text: '1150 sqft' }], ['floor', { chip: '3-5' }], ['price', { text: '75 lakh' }], ['address', { text: 'Lane 4, Sai Residency, flat 302' }], ['papers', { chip: 'REG' }]]);
    const c = composeListing(f);
    expect(c.title).toBe('2 BHK Flat for Sale in Baner');
    for (const bad of ['Sai Residency', 'Sunita', '9123459901', 'flat 302']) { expect(c.description).not.toContain(bad); expect(c.title).not.toContain(bad); }
    expect(c.description).toContain('1,150 sq ft'); expect(c.description).toContain('₹75 L');
    expect(summaryLine(f).hi).toContain('2 BHK');
  });
});

describe('owner name + mobile (only the broker’s wizard ever asks this)', () => {
  const flat = base({ propertyType: 'Residential Flat' });
  it('asked only while the draft lacks a name or a valid mobile — never in the owner chat, where both are known', () => {
    expect(applies(flat, 'owner')).toBe(true);
    expect(applies({ ...flat, ownerName: 'Ramesh', ownerPhone: '9876543210' }, 'owner')).toBe(false);
    expect(applies({ ...flat, ownerName: 'Ramesh', ownerPhone: '1234567890' }, 'owner')).toBe(true);   // not a mobile number
    expect(nextAsk({ ...flat, ownerName: 'Ramesh', ownerPhone: '9876543210' }, ['ptype'])?.id).not.toBe('owner');
  });
  it('reads “Ramesh 98765 43210”, “Mr. Joshi +91-9823012345”; refuses a missing number or a missing name', () => {
    let r = applyAnswer(flat, 'owner', { text: 'Ramesh 98765 43210' }); expect(r.ok && r.fields).toMatchObject({ ownerName: 'Ramesh', ownerPhone: '9876543210' });
    r = applyAnswer(flat, 'owner', { text: 'Mr. Joshi +91-9823012345' }); expect(r.ok && r.fields).toMatchObject({ ownerName: 'Joshi', ownerPhone: '9823012345' });
    expect(applyAnswer(flat, 'owner', { text: 'Ramesh' }).ok).toBe(false);
    expect(applyAnswer(flat, 'owner', { text: '9876543210' }).ok).toBe(false);
    expect(applyAnswer(flat, 'owner', { text: 'Ramesh 1234567890' }).ok).toBe(false);
  });
  it('a name already on the draft is kept when only the number is typed', () => {
    const r = applyAnswer({ ...flat, ownerName: 'Sunita' }, 'owner', { text: '9123459901' }); expect(r.ok && r.fields).toMatchObject({ ownerName: 'Sunita', ownerPhone: '9123459901' });
  });
  it('the broker’s progress counts the owner question all along (the total does not shrink when it is answered)', () => {
    const a = progress(flat, [], true); const f2 = { ...flat, ownerName: 'Ramesh', ownerPhone: '9876543210' }; const b = progress(f2, [], true);
    expect(b.total).toBe(a.total); expect(b.done).toBe(a.done + 1);
    expect(progress(f2).total).toBe(a.total - 1);        // in the owner chat the owner question is not part of it
  });
});
