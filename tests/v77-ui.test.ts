import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** v77 — source guards (there is no DOM test environment): the bell is wired for every role, the papers desk is where brokers and staff will find it,
 *  the builder's forms offer the new choices, and every new sentence has Hindi. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const TX = /\btx\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(,\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?\s*\)/g;

describe('the bell', () => {
  it('sits in the header for every role and is fed from one place', () => {
    const nav = read('src/components/Navbar.tsx');
    expect(nav).toContain("import { NotificationBell } from './NotificationBell.js'"); expect(nav).toContain('<NotificationBell />');
    expect(nav).not.toMatch(/currentUser\.role (===|!==) '[A-Z_]+' && <NotificationBell/);                // no role is left out
    const s = read('server.ts'); expect(s).toContain("app.use('/api/inbox', createInboxRouter())"); expect(s).toContain("['inbox', sweepInbox]");
    const w = read('server/webpush.ts'); const pushTo = w.slice(w.indexOf('export async function pushTo('));
    expect(pushTo.indexOf('recordInbox(userId, msg)')).toBeGreaterThan(0);
    expect(pushTo.indexOf('recordInbox(userId, msg)')).toBeLessThan(pushTo.indexOf('prefsOf(userId)'));    // recorded before phone settings, quiet hours and the daily cap are asked
    expect(pushTo.indexOf('recordInbox(userId, msg)')).toBeLessThan(pushTo.indexOf('p.quiet'));
  });
  it('has the controls the owner asked for: a count, Mark all read, Clear all (asks twice), one-by-one remove, empty state', () => {
    const b = read('src/components/NotificationBell.tsx');
    for (const id of ['header-bell', 'header-bell-badge', 'bell-panel', 'bell-mark-all', 'bell-clear-all', 'bell-list', 'bell-item', 'bell-remove', 'bell-empty']) expect(b, id).toContain(`data-testid="${id}"`);
    expect(b).toContain('api.inboxClear()'); expect(b).toMatch(/if \(!sure\) \{ setSure\(true\); return; \}/);
    expect(b).toContain('api.inboxRead()'); expect(b).toContain('api.inboxRemove(x.id)'); expect(b).toContain('api.inboxCount()');
  });
  it('follows the server (poll while visible, refresh on return) and a tap goes only inside the app', () => {
    const b = read('src/components/NotificationBell.tsx');
    expect(b).toMatch(/POLL_MS = 45_000/); expect(b).toContain('document.hidden'); expect(b).toContain("addEventListener('focus', count)"); expect(b).toContain("'visibilitychange'");
    expect(b).toMatch(/!url\.startsWith\('\/'\) \|\| url\.startsWith\('\/\/'\)/);
    expect(b).toContain("'genz:goto-tab'"); expect(read('src/App.tsx')).toContain("window.addEventListener('genz:goto-tab', go)");
    expect(b).toContain("e.key === 'Escape'");
  });
  it('is a thumb-sized button with a label for screen readers', () => {
    const b = read('src/components/NotificationBell.tsx');
    expect(b).toMatch(/h-11 w-11/); expect(b).toContain('aria-label={label}'); expect(b).toContain('role="dialog"'); expect(b).toMatch(/min-h-14/);
  });
  it('a person\'s lines go with his erasure and come with his export', () => {
    const p = read('server/privacy.ts'); expect(p).toContain('eraseInbox(s, target.id)'); expect(p).toContain('notifications: (s.inbox || [])');
  });
});

describe('papers desk', () => {
  it('shows in CRM → Inventory for brokers and staff — also when there are no units yet', () => {
    const i = read('src/components/InventoryPanel.tsx');
    expect(i).toContain("import { ProjectDocsCard } from './ProjectDocsCard.js'"); expect(i).toContain("const showDocs = role === 'BROKER' || role === 'TEAM_MEMBER'");
    const early = i.slice(i.indexOf('if (loaded && !projects.length && !data)'), i.indexOf('if (!loaded)'));
    expect(early).toContain('<ProjectDocsCard role={role}');
    expect(i).toContain('{showDocs && pid && <ProjectDocsCard role={role} projectId={pid}');
  });
  it('talks only to the papers endpoints', () => {
    const c = read('src/components/ProjectDocsCard.tsx');
    const used = [...new Set([...c.matchAll(/api\.(proj\w+)/g)].map(x => x[1]))].sort();
    expect(used).toEqual(['projDocPost', 'projDocPostEnd', 'projDocShare', 'projDocShareRevoke', 'projDocShares', 'projDocs']);
    const a = read('src/lib/api.ts');
    for (const [fn, url] of [['projDocs', '/api/projdocs'], ['projDocPost', '/api/projdocs/posts'], ['projDocShare', '/api/projdocs/shares'], ['projDocShares', '/api/projdocs/shares'], ['pcFilePatch', "method: 'PATCH'"]]) expect(a, fn).toMatch(new RegExp(`${fn}:[^\\n]*${url.replace(/[/.']/g, '\\$&')}`));
  });
  it('the broker can show to the team only what can travel, and send to a client only where the builder allows', () => {
    const c = read('src/components/ProjectDocsCard.tsx');
    expect(c).toContain('isBroker && d.canTeam &&'); expect(c).toContain('{d.canClient && <button'); expect(c).toContain('disabled={!clientOk}'); expect(c).toContain('disabled={!m.canSee}');
    expect(c).toContain('allowClient: client && clientOk');
    expect(c).toMatch(/noopener noreferrer/);                                                              // the builder\'s link never gets the page it was opened from
  });
  it('a client link is built from the page, never carries a phone number or a customer detail', () => {
    const c = read('src/components/ProjectDocsCard.tsx'); expect(c).not.toMatch(/phone|mobile|whatsapp number/i);
    const sh = read('server/share.ts'); const doc = sh.slice(sh.indexOf("} else if (l.kind === 'DOC')"), sh.indexOf("} else if (l.kind === 'PROJECT')"));
    expect(doc).toContain('docAccessFor(owner, p, doc).client'); expect(doc).not.toContain('doc.note'); expect(doc).not.toContain('clientLabel'); expect(doc).toContain('noopener noreferrer');
  });
  it('a partner sees which papers are his alone and how far each may go, and where to act on them', () => {
    const m = read('src/components/MyProjectsView.tsx');
    expect(m).toContain('data-testid="mp-doc"'); expect(m).toContain('c.personal'); expect(m).toMatch(/c\.passOn === 'CLIENT'/); expect(m).toMatch(/c\.passOn === 'TEAM'/); expect(m).toContain('CRM → Inventory → Project papers');
  });
});

describe('builder forms', () => {
  it('papers: who gets it (incl. chosen partners), how far it goes, a note, and a way to change it later', () => {
    const p = read('src/components/ProjectControlView.tsx');
    expect(p).toContain("import { PASS_ON, AUDIENCES, passOf } from '../shared/docRules.js'");
    for (const id of ['doc-audience', 'doc-partners', 'doc-passon', 'doc-add', 'doc-edit', 'doc-editor', 'doc-save', 'doc-row']) expect(p, id).toContain(`data-testid="${id}"`);
    expect(p).toContain('api.pcFilePatch(d.project.id, f.id, b)');
    expect(p).toMatch(/c\.audience === 'SELECTED' && c\.brokerIds\.length === 0/);                        // cannot save a personal paper with nobody chosen
    expect(p).toContain("['ACTIVE_ASSOCIATE', 'TOP_PERFORMER', 'PAUSED'].includes(m.status)");           // only own partners can be chosen
  });
  it('units: kind, own number, own code and rate — when making, editing, importing and in bulk', () => {
    const i = read('src/components/InventoryPanel.tsx'); const s = read('src/components/InventorySheets.tsx');
    for (const id of ['gen-kind', 'gen-code', 'gen-rate', 'kind-chips', 'rate-card', 'rate-row', 'unit-kind', 'unit-code', 'bulk-set-kind']) expect(i, id).toContain(`data-testid="${id}"`);
    for (const id of ['edit-kind', 'edit-code']) expect(s, id).toContain(`data-testid="${id}"`);
    expect(i).toContain('unitKind: gen.unitKind'); expect(i).toContain('codePrefix'); expect(i).toContain('ratePerSqft');
    expect(s).toMatch(/const COLS = \['group', 'label', 'kind', 'code'/); expect(s).toContain("action: 'KIND'");
    expect(i).toContain('onClick={() => { setSelectMode(true); setPicked(new Set(r.ids)); }}');           // "Select all" of one type goes straight to the bulk bar
  });
  it('the rate card follows the same privacy as the grid: a hidden rate stays hidden', () => {
    const i = read('src/components/InventoryPanel.tsx');
    expect(i).toContain('rateCard(units.map(u => ({ ...u, price: seesPrice ? u.price : null })))'); expect(i).toContain('{seesPrice && <th>');
  });
  it('a booking that names the builder\'s code still meets the grid; the partner API carries kind and code, no more', () => {
    const inv = read('server/inventory.ts'); expect(inv).toMatch(/findUnit[\s\S]{0,400}\.code/);
    const sh = read('server/invaccess.ts'); expect(sh).toContain('kind: unitKindOf(unit)'); expect(sh).toContain('code: unit.code');
  });
});

describe('hindi', () => {
  it('every tx() in the new screens has an English and a Hindi text', () => {
    for (const f of ['src/components/NotificationBell.tsx', 'src/components/ProjectDocsCard.tsx', 'src/components/ProjectControlView.tsx', 'src/components/InventoryPanel.tsx', 'src/components/InventorySheets.tsx', 'src/components/MyProjectsView.tsx']) {
      const src = read(f); const calls = [...src.matchAll(TX)];
      expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) { expect(c[2], `${f}: ${c[0].slice(0, 70)}`).toBeTruthy(); expect(/[ऀ-ॿ]/.test(c[3]), `${f}: ${c[0].slice(0, 70)}`).toBe(true); }
    }
  });
  it('every Hindi alert the server sends for a paper has Hindi words', () => {
    for (const f of ['server/pcontrol.ts', 'server/projdocs.ts']) {
      const src = read(f);
      for (const m of src.matchAll(/hi: \[([^\]]*)\]/g)) expect(/[ऀ-ॿ]/.test(m[1]), `${f}: ${m[0].slice(0, 70)}`).toBe(true);
    }
  });
});
