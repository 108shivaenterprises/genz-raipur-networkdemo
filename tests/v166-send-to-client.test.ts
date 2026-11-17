import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
// static guards (v166): a listed home opens on tap; "Send to client" is on the card; a liked home of another broker offers co-broking; the QR page no longer says the number opens on share
const f = (p: string) => readFileSync(p, 'utf8');
describe('v166 — property card, send to client, co-broking', () => {
  const pv = f('src/components/PropertiesView.tsx');
  it('tapping the photo or the title opens the details; all photos and the video are there', () => {
    expect(pv).toContain('data-testid={`open-photo-${p.id}`}'); expect(pv).toContain('data-testid={`open-title-${p.id}`}'); expect(pv).toContain('data-testid={`gallery-${p.id}`}');
  });
  it('"Send to client" is a main button on the card (sorted first) and opens the sheet', () => {
    expect(pv).toContain("key: 'send'"); expect(pv).toContain("Number(b.key === 'send')"); expect(pv).toContain('<SendToClient');
    const s = f('src/components/SendToClient.tsx');
    expect(s).toContain('api.crAddItem(roomId, home.id)'); expect(s).toContain('api.crCreate'); expect(s).toContain('consent: true'); expect(s).toContain('wa.me/91');
  });
  it('a liked home listed by another broker shows "talk co-broking", which opens the offer sheet', () => {
    expect(f('server/clientroom.ts')).toContain("p.listingBrokerId !== r.brokerId ? p.listingBrokerId : undefined");
    expect(f('src/components/ClientRooms.tsx')).toContain("new CustomEvent('genz:collab'");
    expect(f('src/App.tsx')).toContain("addEventListener('genz:collab'");
  });
  it('the QR page and chat footer say the number opens when a visit is set', () => {
    const sp = f('server/shopPartners.ts');
    expect(sp).not.toContain('matching home is shared.'); expect(sp).toContain('a visit to a home is set');
  });
});
