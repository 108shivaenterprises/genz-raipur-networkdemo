import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** v80 — source guards (there is no DOM test environment): the owner sign-in cannot loop, the Home does not repeat the bell, a broker's QR card is his own,
 *  Magic Match never offers to myself, the final rate has a card, the owner of my listing has a search card, and every new sentence has Hindi. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const TX = /\btx\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(,\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?\s*\)/g;
const DEVA = /[ऀ-ॿ]/;
const signIn = () => { const s = read('src/components/OwnerListings.tsx'); const a = s.indexOf('export const OwnerSignIn'); return s.slice(a, s.indexOf('const STATUS:', a)); };

describe('owner sign-in: no flicker loop, the city fills in once', () => {
  it('detect() does not depend on tx (a new function on every render) — the latest tx sits in a ref', () => {
    const c = signIn();
    expect(c).toContain('const txRef = useRef(tx); txRef.current = tx;');
    expect(c).not.toMatch(/\[tx\]/);
    expect(c).toMatch(/const detect = useCallback\(\(\) => \{[\s\S]*\}, \[apply\]\);/);
  });
  it('the automatic detection runs ONCE when a new owner reaches the code step (a ref guard), the button can run it again', () => {
    const c = signIn();
    expect(c).toContain('const autoRan = useRef(false);');
    expect(c).toContain("if (step === 'code' && !exists && !autoRan.current) { autoRan.current = true; detect(); }");
    expect(c).toContain('data-testid="owner-detect"');
  });
  it('the form is filled only while the owner has not typed or chosen anything himself', () => {
    const c = signIn(); expect(c).toMatch(/const apply = useCallback\([\s\S]*if \(touched\.current\) return;/);
  });
  it('no GPS / denied / no place found → the network address fills the rough city and state; a state in a geocoder’s own spelling is matched to ours', () => {
    const c = signIn(); expect(c).toContain('api.geoIp()'); expect(c).toContain('matchState(r.state)');
    expect(c.match(/viaNetwork\(/g)!.length).toBeGreaterThanOrEqual(4);
    expect(read('src/lib/api.ts')).toContain("'/api/geo/ip'");
    expect(read('server.ts')).toContain('matchState(String(j?.principalSubdivision');
  });
  it('typing a city we know picks the state, and the state’s cities are suggested', () => {
    const c = signIn(); expect(c).toContain('stateOfCity(v)'); expect(c).toContain('<datalist id="owner-city-list">');
  });
  it('the signed token travels with the code, and "code expired" offers a new one right there', () => {
    const c = signIn(); expect(c).toContain('otpToken: tok || undefined'); expect(c).toContain("setTok(r.otpToken || '')");
    expect(c).toContain('data-testid="owner-resend"'); expect(c).toContain("tx('Send a new code', 'नया कोड भेजें')");
  });
  it('the server checks the token with the secret + the code, one use, five tries — and never stores the code', () => {
    const s = read('server/ownerlist.ts');
    expect(s).toContain('export function makeOtpToken'); expect(s).toContain('export function readOtpToken');
    expect(s).toContain('if (tk.e < Date.now())'); expect(s).toContain('rec.used'); expect(s).toContain('++rec.tries > 5');
    expect(s).toMatch(/otpToken: makeOtpToken\(phone, code, exp\)/);
  });
});

describe('the Home does not repeat the bell', () => {
  it('the broker Home has no counter tiles and the dashboard has no second "co-broking offer" banner for a broker', () => {
    const h = read('src/components/BrokerHome.tsx'); expect(h).not.toContain('home-tiles'); expect(h).not.toContain('HOME_TODOS');
    expect(read('src/components/DashboardView.tsx')).toContain('{myIncomingOffers.length > 0 && !isBroker && (');
  });
  it('what stays on the Home: the first steps, the four doers, the page / rank / chapter / share row', () => {
    const h = read('src/components/BrokerHome.tsx');
    for (const id of ['first-steps', 'home-wa', 'home-magic', 'home-rank', 'home-report', 'broker-home']) expect(h, id).toContain(`data-testid="${id}"`);
  });
});

describe('a broker opening his own QR sees only his own card', () => {
  const m = read('src/components/PublicBrokerQrModal.tsx');
  it('the broker list is for GENZ staff only; a broker’s list is just himself', () => {
    expect(m).toContain("const isStaff = currentUser.role === 'ADMIN' || currentUser.role === 'SUPERADMIN';");
    expect(m).toContain('const brokerList = isStaff ?'); expect(m).toContain(': [currentUser];');
    const i = m.indexOf('data-testid="qr-broker-select"'); expect(m.slice(Math.max(0, i - 200), i)).toContain('isStaff &&');
  });
});

describe('Magic Match never offers a deal to myself', () => {
  const m = read('src/components/MatchCenterView.tsx');
  it('the offer button and its target come from the one pure rule; a card that is not mine says so', () => {
    expect(m).toContain("from '../shared/matchOfferRules.js'"); expect(m).toContain("act.kind === 'OFFER'"); expect(m).toContain('receivingBrokerId: act.to');
    expect(m).toContain('data-testid="match-not-mine"'); expect(m).toContain('mineFirst(');
  });
  it('the server refuses it too', () => { expect(read('server.ts')).toContain('You cannot propose a collaboration to yourself'); });
});

describe('the final rate has one card', () => {
  const f = read('src/components/FinalRateCard.tsx');
  it('the card shows the rate, who set it and how, can be set by a deal broker, and says when it is locked', () => {
    for (const id of ['final-rate', 'final-rate-price', 'final-rate-input', 'final-rate-note', 'final-rate-save', 'final-rate-by', 'final-rate-locked', 'final-rate-preview']) expect(f, id).toContain(`data-testid="${id}"`);
    expect(f).toContain('api.setFinalPrice');
  });
  it('it sits in the deal room overview, the visit card in the chat points to it, and the bill screen mentions it', () => {
    expect(read('src/components/DealRoomsView.tsx')).toContain('<FinalRateCard'); expect(read('src/components/DealRoomsView.tsx')).toContain("tab === 'final-rate'");
    expect(read('src/components/ChatPlus.tsx')).toContain('chat-card-final-rate');
    expect(read('src/components/DealHisaab.tsx')).toMatch(/Final rate/);
  });
  it('the people in the room are told with a Hindi line; a settled deal keeps its price', () => {
    const s = read('server.ts'); const i = s.indexOf("app.post('/api/deals/:id/final-price'"); const blk = s.slice(i, s.indexOf('12.7 DEAL ROOM CHAT', i));
    expect(blk).toContain("code: 'DEAL_SETTLED'"); const hi = /hi: \[([^\]]*)\]/.exec(blk); expect(hi && DEVA.test(hi[1])).toBe(true);
    expect(blk).toContain('prop.listingBrokerId === currentUser.id');
  });
});

describe('the owner of my listing is findable in Profiles', () => {
  it('the search card says "Owner on your listing · not on GENZ yet" and is not a profile you can open', () => {
    const v = read('src/components/ProfilesView.tsx');
    expect(v).toContain('data-testid="people-owner-record"'); expect(v).toContain('{res?.ownerRecord && <OwnerRecordCard rec={res.ownerRecord} />}');
    expect(v).toContain('res.results.length === 0 && !res.ownerRecord');
    const a = v.indexOf('const OwnerRecordCard'); const card = v.slice(a, v.indexOf('// ───────── find', a)); expect(card).not.toContain('onClick'); expect(card).not.toMatch(/review/i);
  });
  it('the server answers only the listing broker, only on an exact mobile, only when no member has it — and returns a short name and 4 digits, never the number or the address', () => {
    const s = read('server/profiles.ts');
    expect(s).toContain("kind === 'PHONE' && !hits.length && canLookupPrivate(seeker) && !isStaffRole(seeker)");
    const a = s.indexOf('export function ownerRecordFor'); const fn = s.slice(a, s.indexOf("const ALERT_URL", a));
    expect(fn).toContain('p.listingBrokerId === brokerId'); expect(fn).toContain('c.brokerId !== brokerId'); expect(fn).toContain('shortName(');
    expect(fn).not.toMatch(/addressHidden|ownerPhone:/);
  });
});

describe('hindi', () => {
  it('every tx() in the screens touched by v80 has an English and a Hindi text', () => {
    for (const f of ['src/components/OwnerListings.tsx', 'src/components/ProfilesView.tsx', 'src/components/BrokerHome.tsx', 'src/components/MatchCenterView.tsx', 'src/components/PublicBrokerQrModal.tsx', 'src/components/FinalRateCard.tsx', 'src/components/ChatPlus.tsx']) {
      const src = read(f); const calls = [...src.matchAll(TX)].filter(c => !c[0].includes('${')); expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) { expect(c[2], `${f}: ${c[0].slice(0, 70)}`).toBeTruthy(); expect(DEVA.test(c[3]), `${f}: ${c[0].slice(0, 70)}`).toBe(true); }
    }
  });
});
