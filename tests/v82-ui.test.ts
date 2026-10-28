import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** v82 — source guards (there is no DOM test environment): "Deal done" shows the share the app worked out, a correction needs a reason, paying needs a reference,
 *  the shop's replies are visible, the pitch kit exists, the shop page is never cached by the service worker, and every new sentence has Hindi. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const TX = /\btx\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(,\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?\s*\)/g;
const DEVA = /[ऀ-ॿ]/;
const ui = read('src/components/ShopPartners.tsx');

describe('broker screen', () => {
  it('“Deal done” takes the share from the deal; changing the brokerage is behind a “not my brokerage” fold and needs a reason', () => {
    expect(ui).toContain('data-testid="sp-won-auto"'); expect(ui).toContain('data-testid="sp-won-change"'); expect(ui).toContain('data-testid="sp-reason"');
    expect(ui).toContain('(Number(val) > 0 && reason.trim().length < 3)');
    expect(ui).toContain('api.spLeadWon(l.id, Math.round(Number(val)), reason)'); expect(ui).toContain('api.spLeadWon(l.id)');
    expect(ui).toContain('data-testid="sp-auto-share"'); expect(ui).toContain('data-testid="sp-fixed-share"');
  });
  it('a deal that is not in the app asks the broker to write his brokerage and says the shop will be asked to confirm', () => {
    expect(ui).toContain('This deal is not in GENZ — write your own brokerage'); expect(ui).toContain('The shop is asked to confirm this figure');
  });
  it('the share can be corrected while unpaid (with a reason), and the shop’s “not right” can be answered', () => {
    expect(ui).toContain('data-testid="sp-fix-share"'); expect(ui).toContain('api.spLeadShare(l.id'); expect(ui).toContain('api.spChangeReply(l.id, c.id, reply)');
    expect(ui).toContain("c.status === 'DISPUTED'"); expect(ui).toContain('data-testid="sp-reply-send"');
  });
  it('paying needs UPI / bank reference; cash needs the shop’s own “received”', () => {
    expect(ui).toContain('refOk(pm, val.trim())'); expect(ui).toContain('api.spLeadPaid(l.id, pm,'); expect(ui).toContain('data-testid="sp-paid-ref"');
    const api = read('src/lib/api.ts'); expect(api).toContain("spLeadPaid: (id: string, mode: 'UPI' | 'BANK' | 'CASH', ref?: string)"); expect(api).toContain('spLeadShare:'); expect(api).toContain('spChangeReply:');
  });
  it('unpaid days, auto-pause and alerts are visible on the cards; resuming a GENZ-paused QR is blocked until it is paid', () => {
    expect(ui).toContain('data-testid="sp-unpaid"'); expect(ui).toContain('data-testid="sp-autopaused"'); expect(ui).toContain('data-testid="sp-alerts-state"');
    expect(ui).toContain("disabled={busy || (p.pausedBy === 'SYSTEM' && p.overdue > 0)}");
  });
  it('the pitch kit, the A4 poster and the leaflet are one tap away; the broker’s pay record is shown', () => {
    expect(ui).toContain('data-testid="sp-pitch"'); expect(ui).toContain('data-testid="sp-poster-a4"'); expect(ui).toContain('data-testid="sp-leaflet"'); expect(ui).toContain('data-testid="sp-record"');
    expect(ui).toContain('data-testid="sp-customer-said"');
  });
  it('every sentence in the screen has a Hindi twin', () => {
    const bad: string[] = [];
    for (const m of ui.matchAll(TX)) { const hi = m[3]; if (!hi || !DEVA.test(hi)) bad.push(m[1].slice(0, 60)); }
    expect(bad).toEqual([]);
  });
});

describe('shop page (server)', () => {
  const sp = read('server/shopPartners.ts');
  it('the SMS to the customer needs his own optional, unticked box — never bundled with the contact consent', () => {
    expect(sp).toContain('name="outcome" value="1" ${keep.outcome');
    expect(sp).toContain("if (!l.outcomeOk) return render(");
    expect(sp).toMatch(/\.\.\.\(keep\.outcome === '1' \? \{ outcomeOk: true \} : \{\}\)/);
  });
  it('the shop never sees the broker’s own brokerage, a price, or the customer’s full number or name', () => {
    const render = sp.slice(sp.indexOf('const render = (req: Request'), sp.indexOf('const authed = (req: Request'));
    expect(render).not.toContain('l.won.brokerage'); expect(render).not.toContain('l.phone}'); expect(render).not.toContain('l.name');
  });
  it('the app, the manifest and the push route exist; the service worker never caches /sp/ pages', () => {
    expect(sp).toContain("r.get('/app.js'"); expect(sp).toContain('manifest.webmanifest'); expect(sp).toContain("r.post('/:token/push'");
    expect(read('public/sw.js')).toContain("url.pathname.startsWith('/sp/')");
  });
  it('the certificate calls it a network partner, not “verified”, and says it is no licence', () => {
    expect(sp).toContain('GENZ नेटवर्क पार्टनर'); expect(sp).toContain('लाइसेंस या सरकारी मान्यता नहीं');
    const cert = sp.slice(sp.indexOf("r.get('/:token/certificate'"), sp.indexOf('return r;', sp.indexOf("r.get('/:token/certificate'")));
    expect(cert).not.toMatch(/verified shop|वेरिफ़ाइड दुकान/i);
  });
  it('the poster never says “no fee” — only that GENZ takes no money from the customer', () => {
    const poster = sp.slice(sp.indexOf("r.get('/:code/poster'"), sp.indexOf("r.get('/:code', rateLimit('sp-view'"));
    expect(poster).toContain('GENZ आपसे कोई पैसा नहीं लेता'); expect(poster).not.toMatch(/no fee|बिना फ़ीस|फ्री\b/i);
  });
  it('the late-payment sweep runs at boot, hourly, and also when the broker’s list or the shop’s page is opened (serverless hosts may never run a timer)', () => {
    const s = read('server.ts');
    expect(s).toContain('ensureIdTasks(); sweepShopPartners();'); expect(s).toContain("['shopPartners', () => { watchShares(); sweepShopPartners(); }]");
    expect(sp).toContain('lazySweep()'); expect(sp).toContain('fresh(q)');
  });
  it('the shop is told when the deal moves the share: final price, signed commission terms, an owner mandate, and the हिसाब', () => {
    const s = read('server.ts'); expect(s.match(/watchShop\(/g)!.length).toBeGreaterThanOrEqual(3);
    expect(read('server/hisaab.ts')).toContain('watchShares({ dealId: d.id');
  });
});
