import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const f = (p: string) => readFileSync(p, 'utf8');
describe('v168 — network homes can be shown to a QR lead at once', () => {
  it('broker side (leadView + /offer) sees the homes behind the network count; the bot does not auto-share them', () => {
    const s = f('server/shopPartners.ts');
    expect(s).toContain('matchesFor(l, true).map(h =>'); expect(s).toContain('matchesFor(l, true).find'); expect(s).toContain('q && withNet');
    expect(s).toContain('function matchesFor(l: PartnerLead, withNet = false)');
  });
  it('listing broker is alerted when his unopened home is shared', () => {
    const s = f('server/shopPartners.ts'); expect(s).toContain("!h.publicShareOk) alertUsers(h.listingBrokerId, 'broadcast'");
  });
  it('broadcast exports the homes behind the count', () => { expect(f('server/broadcast.ts')).toContain('export const networkHomesFor'); });
});
