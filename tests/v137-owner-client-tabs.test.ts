import { freePort } from './helpers/port';
/** v137 — owner and client (buyer / tenant) screens: what they see is theirs, nothing blank, no broker-only tools. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const src = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const PORT = await freePort();
const B = `http://127.0.0.1:${PORT}`;
let proc: ChildProcess; let dir: string; let cfg: any;
const jar: Record<string, string> = {};
const get = (cookie: string, url: string) => fetch(B + url, { headers: { cookie } });
async function login(role: string) {
  const a = cfg.demoAccounts.find((x: any) => x.role === role && x.verificationStatus === 'VERIFIED');
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: a.email, password: cfg.demoPassword }) });
  expect(r.status, role).toBe(200); return r.headers.get('set-cookie')!.split(';')[0];
}
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'genz-v137-')); mkdirSync(path.join(dir, 'data'));
  proc = spawn(path.join(ROOT, 'node_modules/.bin/tsx'), [path.join(ROOT, 'server.ts')], {
    cwd: dir, env: { ...process.env, SMS_WEBHOOK_URL: '', PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'development', DEMO_MODE: 'true', SEED_DEMO_DATA: 'true', DISABLE_HMR: 'true' }, stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) { try { const r = await fetch(B + '/api/auth/config'); if (r.ok) { cfg = await r.json(); break; } } catch { /* not up */ } await new Promise(r => setTimeout(r, 250)); }
  expect(cfg).toBeTruthy();
  for (const role of ['BROKER', 'BUYER_TENANT', 'PROPERTY_OWNER']) jar[role] = await login(role);
}, 60000);
afterAll(async () => { proc?.kill('SIGTERM'); await new Promise(r => setTimeout(r, 300)); if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('v137 owner + client screens', () => {
  it('the broker-to-broker feed is for members only — not buyers or owners', async () => {
    expect((await get(jar.BROKER, '/api/feed')).status).toBe(200);
    expect((await get(jar.BUYER_TENANT, '/api/feed')).status).toBe(403);
    expect((await get(jar.PROPERTY_OWNER, '/api/feed')).status).toBe(403);
  });
  it('menu: a buyer sees "My needs" and no feed; owner and buyer get no technical audit table', () => {
    const nav = src('src/components/NavigationTabs.tsx');
    expect(nav).toContain("has('requirement:create') && role0 !== 'BUYER_TENANT'");
    expect(nav).toContain("role0 === 'BUYER_TENANT' ? t('nav.myNeeds', 'My needs')");
    expect(nav).toContain("has('audit:read_all', 'audit:read_own') && role0 !== 'BUYER_TENANT' && !isOwner");
    expect(nav).toContain("role === 'BUYER_TENANT' || role === 'PROPERTY_OWNER' || tabs.length > 6");   // a buyer has 5 tabs now — the bottom bar must stay
  });
  it('owner: Deal Desk says so when no offer has come; My Property has no second reach strip and no ID form before he lists himself', () => {
    expect(src('src/components/DealDesk.tsx')).toContain('data-testid="offers-empty"');
    const ol = src('src/components/OwnerListings.tsx');
    expect(ol.match(/<NetworkStrip \/>/g) || []).toHaveLength(0);
    expect(ol).not.toContain('<VerifySection');   // v141 — no ID / papers form for GENZ staff; the owner's PAN card instead
    expect(ol).toContain('data-testid="owner-pan"');
    expect(ol).toContain('homes a broker listed for you are under “My properties” below');
  });
  it('wording: a listing is "Live" (GENZ does not verify homes); the owner sees terms "with your broker"', () => {
    const pv = src('src/components/PropertiesView.tsx');
    expect(pv).toContain("<span>{tx('Live', 'लाइव')}</span>"); expect(pv).not.toContain("<span>{tx('Verified', 'वेरिफ़ाइड')}</span>");
    expect(pv).toContain("'Brokerage terms with your broker'");
    expect(src('src/components/RoleHome.tsx')).toContain('verified} live · ');
  });
  it('v138 — My profile has the photo card (it was only on the ID-card screen)', () => {
    expect(src('src/components/ProfilesView.tsx')).toContain("{c.role !== 'GENZ_CONNECTOR' && <VerifiedPhotoCard />}");
  });
  it('v139 — profile photo and the signed form open the phone chooser (camera OR gallery / PDF), not the camera only', () => {
    expect(src('src/components/VerifiedPhoto.tsx')).not.toContain('capture=');
    expect(src('src/components/ListingDrafts.tsx')).not.toContain('capture=');
  });
  it('v140 — a buyer can ask his broker about a home from Magic Match; only his own need, only a live home', async () => {
    const post = (c: string, url: string, body: unknown) => fetch(B + url, { method: 'POST', headers: { cookie: c, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const reqs = await (await get(jar.BUYER_TENANT, '/api/requirements')).json();
    const r = (reqs.requirements || reqs).find((x: any) => x.buyerId);
    expect(r).toBeTruthy();
    const props = await (await get(jar.BROKER, '/api/properties')).json();
    const p = (props.properties || props).find((x: any) => x.listingStatus === 'active');
    const ok = await post(jar.BUYER_TENANT, `/api/requirements/${r.id}/interest`, { propertyId: p.id });
    expect(ok.status, await ok.clone().text()).toBe(200); expect((await ok.json()).success).toBe(true);
    expect((await post(jar.BUYER_TENANT, `/api/requirements/${r.id}/interest`, { propertyId: 'PROP-NOPE' })).status).toBe(404);
    expect((await post(jar.BROKER, `/api/requirements/${r.id}/interest`, { propertyId: p.id })).status).toBe(404);   // not his need
    expect(src('src/components/MatchCenterView.tsx')).toContain('data-testid="match-ask"');
  });
  it('v148 — a buyer is never told which broker holds a listing; he can ask his own broker from the Properties list too', async () => {
    const post = (c: string, url: string, body: unknown) => fetch(B + url, { method: 'POST', headers: { cookie: c, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const mine = await (await get(jar.BUYER_TENANT, '/api/properties')).json();
    expect(mine.properties.length).toBeGreaterThan(0);
    for (const p of mine.properties) expect(p.listingBrokerId, p.id).toBeUndefined();
    const forBroker = await (await get(jar.BROKER, '/api/properties')).json();
    expect(forBroker.properties.some((p: any) => p.listingBrokerId)).toBe(true);   // brokers still see it (co-broking needs it)
    const live = forBroker.properties.find((x: any) => x.listingStatus === 'active');
    const ok = await post(jar.BUYER_TENANT, '/api/requirements/mine/interest', { propertyId: live.id });
    expect(ok.status, await ok.clone().text()).toBe(200);
    expect((await post(jar.BROKER, '/api/requirements/mine/interest', { propertyId: live.id })).status).toBe(404);
    expect(src('src/components/PropertiesView.tsx')).toContain('data-testid="prop-ask"');
  });
  it('v148 — phone: Deals has no Client rooms tab; agreement extras sit behind More; Paper check folds what does not apply', () => {
    const room = src('src/components/DealRoomsView.tsx');
    expect(room).not.toContain("['ROOMS', MessagesSquare");
    expect(room).toContain('data-testid="agreement-more"'); expect(room).toContain('data-testid="vault-file"');
    const dd = src('src/components/DueDiligenceView.tsx');
    expect(dd).toContain('data-testid="dd-line"'); expect(dd).toContain('data-testid="dd-show-na"');
  });
  it('v150 — chat home: a broker lands on Chats once per sign-in, the first bottom tab is Chats, Sahayak is pinned, and the old home is one tap away', () => {
    expect(src('src/lib/goto.ts')).toContain("localStorage.getItem('genz-chat-home') !== '0'");
    const app = src('src/App.tsx');
    expect(app).toContain("activeTab !== 'dashboard' || !chatHome.on()");
    expect(app).toContain("sessionStorage.removeItem('genz.landed')");
    expect(src('src/components/NavigationTabs.tsx')).toContain("chatHome.on() ? { ids: ['chats', 'dashboard'], key: 'nav.chats', en: 'Chats' } : HOME");
    const cv = src('src/components/ChatsView.tsx');
    for (const id of ['chat-row-sahayak', 'chat-home-off']) expect(cv, id).toContain(`data-testid="${id}"`);
    expect(cv).toContain('testId="sahayak-chat"');
    expect(src('src/components/BrokerHome.tsx')).toContain('data-testid="chat-home-on"');
  });
  it('v151 — Sahayak is a menu bot: every step is buttons, the phone is checked, it saves through the normal requirement API; a buyer gets no listing broker in match results', async () => {
    const bot = src('src/components/SahayakBot.tsx');
    for (const id of ['sahayak-add-need', 'sahayak-area-next', 'sahayak-name', 'sahayak-phone', 'sahayak-summary', 'sahayak-save', 'sahayak-open-need', 'sahayak-free']) expect(bot, id).toContain(`data-testid="${id}"`);
    expect(bot).toContain('api.createRequirement('); expect(bot).toContain('isValidIndianPhone(typed)'); expect(bot).toContain('x.score >= 50');
    expect(src('src/components/ChatsView.tsx')).toContain('<SahayakBot />');
    const reqs = await (await get(jar.BUYER_TENANT, '/api/requirements')).json();
    const r = (reqs.requirements || reqs).find((x: any) => x.buyerId);
    const m = await (await get(jar.BUYER_TENANT, `/api/matching/requirement/${r.id}`)).json();
    for (const x of m.matches || []) expect(x.property.listingBrokerId, x.property.id).toBeUndefined();
  });
  it('v152 — chat rows carry DEAL/CLIENT/OWNER/SHOP tags, shop leads are chats, search covers homes and needs, a deal chat shows the next step, the bot can send / book / ask / find / show commission', () => {
    const cv = src('src/components/ChatsView.tsx');
    for (const id of ['chat-tag-', 'chats-filter-', 'chats-found', 'shop-chat-pane', 'deal-next-step']) expect(cv, id).toContain(id);
    expect(cv).toContain("label: r.kind === 'OWNER' ? 'OWNER' : 'CLIENT'"); expect(cv).toContain('api.spList()'); expect(cv).toContain("'LeadCard'");
    expect(src('src/components/ShopPartners.tsx')).toContain('export const LeadCard');
    const bot = src('src/components/SahayakBot.tsx');
    for (const id of ['sahayak-send-client', 'sahayak-send-yes', 'sahayak-visit', 'sahayak-cobroke', 'sahayak-find', 'sahayak-deals']) expect(bot, id).toContain(`data-testid="${id}"`);
    for (const call of ['api.crCreate(', 'consent: true', 'api.crSend(', 'api.scheduleSiteVisit(', 'api.broadcastSend(', 'api.getDeals()']) expect(bot, call).toContain(call);
  });
  it('v153 — offer + agreement cards in the deal chat (checked on the server), owner lands on Chats, the bot adds a home as a draft, shop commission card, home opens directly', async () => {
    const { checkCard, CARD_KINDS } = await import('../server/chatcards.js');
    expect(CARD_KINDS).toContain('OFFER'); expect(CARD_KINDS).toContain('AGREEMENT');
    const base: any = { deal: { id: 'D1', propertyId: 'P1', stage: 'Lead' }, visibleAssets: [], visits: [], offers: [{ id: 'O1', dealRoomId: 'D1' }, { id: 'O2', dealRoomId: 'D2' }], agreements: [{ id: 'A1', dealId: 'D1' }], userId: 'U1' };
    expect(checkCard({ ...base, kind: 'OFFER', refId: 'O1', isBroker: true }).ok).toBe(true);
    expect((checkCard({ ...base, kind: 'OFFER', refId: 'O2', isBroker: true }) as any).code).toBe('CARD_NOT_FOUND');   // another deal's offer
    expect((checkCard({ ...base, kind: 'OFFER', refId: 'O1', isBroker: false }) as any).code).toBe('CARD_NOT_YOURS');
    expect(checkCard({ ...base, kind: 'AGREEMENT', refId: 'A1', isBroker: true }).ok).toBe(true);
    expect((checkCard({ ...base, kind: 'AGREEMENT', refId: 'A9', isBroker: true }) as any).code).toBe('CARD_NOT_FOUND');
    const cp = src('src/components/ChatPlus.tsx');
    for (const id of ['chat-card-OFFER', 'chat-card-AGREEMENT', 'plus-offer', 'plus-agreement', 'chat-offer-accept']) expect(cp, id).toContain(id);
    expect(src('src/App.tsx')).toContain("currentUser?.role !== 'PROPERTY_OWNER'");
    const bot = src('src/components/SahayakBot.tsx');
    for (const id of ['sahayak-add-home', 'sahayak-open-draft', 'sahayak-open-home']) expect(bot, id).toContain(`data-testid="${id}"`);
    expect(bot).toContain('api.draftFromForm(');
    expect(src('src/components/ControlCenter.tsx')).toContain('cc-fold-'); expect(src('src/components/DailyView.tsx')).toContain('daily-open-sahayak');
    for (const id of ['visit-owner-reply', 'visit-owner-ok', 'visit-owner-other']) expect(cp, id).toContain(id);
    for (const id of ['chat-offer-counter', 'chat-offer-reject', 'chat-offer-input']) expect(cp, id).toContain(id);
    expect(src('src/components/DealRoomsView.tsx')).toContain("['LEGAL_COUNSEL', 'ADMIN', 'SUPERADMIN'].includes(currentUser.role)");
    expect(src('src/components/ChatsView.tsx')).toContain('shop-commission-card'); expect(src('src/components/ChatsView.tsx')).toContain("{ propertyId: h.id }");
  });
});
