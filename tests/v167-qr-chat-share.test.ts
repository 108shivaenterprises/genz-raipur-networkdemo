import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const f = (p: string) => readFileSync(p, 'utf8');
describe('v167 — shop-QR lead chat: share, network, tappable card', () => {
  it('lead chat shows the network note + ask button', () => {
    const s = f('src/components/ShopLeadChat.tsx');
    expect(s).toContain('sp-network'); expect(s).toContain('<AskNetwork'); expect(s).not.toContain('stays hidden until you share one');
  });
  it('Send-to-client puts a fitting home into a QR lead chat', () => {
    const s = f('src/components/SendToClient.tsx'); expect(s).toContain('api.spOffer'); expect(s).toContain('send-qr-');
  });
  it('customer card without photos still opens the home page (visit button)', () => {
    const s = f('server/shopPartners.ts'); expect(s).toContain('घर देखें / विज़िट माँगें'); expect(s).toContain('data-testid="media-visit"');
  });
});
