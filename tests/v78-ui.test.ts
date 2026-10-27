import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** v78 — source guards (there is no DOM test environment): the builder's inventory tab, the profiles desk is wired for every role that has it,
 *  the stamp on the client page cannot be quietly dropped, and every new sentence has Hindi. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const TX = /\btx\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(,\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?\s*\)/g;

describe('builder project room: inventory', () => {
  it('has an Inventory tab for the builder (not for read-only staff) that opens the grid of this project only', () => {
    const p = read('src/components/ProjectControlView.tsx');
    expect(p).toContain("import { InventoryPanel } from './InventoryPanel.js'");
    expect(p).toMatch(/type Sub = 'partners' \| 'inventory' \| 'verify' \| 'notices' \| 'settings' \| 'staff'/);
    expect(p).toMatch(/\.\.\.\(canWrite \? \[\['inventory', 'Inventory', 'इन्वेंटरी'/);
    expect(p).toContain("{sub === 'inventory' && canWrite && <div data-testid=\"pcv-inventory\"><InventoryPanel role={role} leads={[]} fixedProjectId={id} /></div>}");
    expect(p).toContain('data-testid={`pcv-tab-${k}`}');
  });
  it('the panel, when given a project, does not offer a project picker and starts on that project', () => {
    const i = read('src/components/InventoryPanel.tsx');
    expect(i).toContain('fixedProjectId?: string'); expect(i).toContain("useState(fixedProjectId || '')"); expect(i).toContain('{!fixedProjectId && <select value={pid}');
  });
  it('the builder desk still reaches the same inventory API (generate, edit, bulk, settings) and the server still keeps it to the owner', () => {
    const a = read('src/lib/api.ts'); for (const fn of ['invGenerate', 'invUnit', 'invBulk', 'invSettings']) expect(a, fn).toContain(`${fn}:`);
    const inv = read('server/inventory.ts'); expect(inv).toMatch(/units\/generate', needs\('inventory:manage'\)/); expect(inv).toContain('ownerAccess(u, req.params.id)');
  });
});

describe('profiles desk', () => {
  it('is mounted for everyone who has profile:use, in the bar, in the menu and in the groups of each role', () => {
    const app = read('src/App.tsx'); expect(app).toContain("import { ProfilesView }"); expect(app).toContain("activeTab === 'people' && hasPerm(permissions, 'profile:use')");
    expect(app).toContain("'people'"); expect(app).toContain("setPeopleStart('mine')"); expect(app).toContain('startOn={peopleStart}');
    const nav = read('src/components/NavigationTabs.tsx'); expect(nav).toContain("| 'people'"); expect(nav).toContain("has('profile:use') ? [{ id: 'people'");
    expect((nav.match(/'people'/g) || []).length).toBeGreaterThanOrEqual(5);
    expect(read('src/components/Navbar.tsx')).toContain('data-testid="menu-profile"');
    expect(read('src/lib/i18n.tsx')).toContain("'nav.people'");
  });
  it('talks only to the profiles endpoints', () => {
    const v = read('src/components/ProfilesView.tsx');
    const used = [...new Set([...v.matchAll(/api\.(prof\w+)/g)].map(x => x[1]))].sort();
    expect(used).toEqual(['profClear', 'profHide', 'profMine', 'profOpen', 'profQueue', 'profReply', 'profReport', 'profRestore', 'profReview', 'profReviewDelete', 'profSave', 'profSearch']);
    const a = read('src/lib/api.ts'); expect(a).toContain('/api/profiles/search?q='); expect(a).toContain('/api/profiles/mine'); expect(a).toContain('/api/profiles/admin/queue');
  });
  it('has every control a person needs, with a test id', () => {
    const v = read('src/components/ProfilesView.tsx');
    for (const id of ['people-q', 'people-go', 'people-results', 'person-row', 'people-empty', 'profile-page', 'profile-avg', 'review-box', 'review-open', 'review-form', 'review-send', 'review-why', 'review-withdraw', 'review-edit', 'review-card', 'reply-open', 'reply-send', 'report-open', 'report-reason', 'report-send', 'mine-tab', 'prof-save', 'prof-about', 'prof-photo', 'admin-tab', 'admin-hide', 'admin-keep', 'admin-restore', 'admin-reason']) expect(v, id).toContain(`data-testid="${id}"`);
  });
  it('a private person (customer / owner) is shown as first name + initial, with no switch to hide, and the screen says why', () => {
    const v = read('src/components/ProfilesView.tsx'); expect(v).toContain('{!d.isPrivate && ('); expect(v).toContain('prof-visible');
    expect(v).toMatch(/Brokers and builders can check you only by your exact mobile number or GZ code/);
  });
  it('staff have no profile tab, and only people with review:moderate see the Reports tab', () => {
    const v = read('src/components/ProfilesView.tsx'); expect(v).toContain("permissions.includes('review:moderate')"); expect(v).toContain("role === 'ADMIN' || role === 'SUPERADMIN'");
  });
  it('a review text is printed as text — never as HTML', () => {
    for (const f of ['src/components/ProfilesView.tsx']) { const v = read(f); expect(v).not.toContain('dangerouslySetInnerHTML'); expect(v).not.toMatch(/innerHTML/); }
  });
  it('withdrawing and reporting ask twice; no window.confirm', () => {
    const v = read('src/components/ProfilesView.tsx'); expect(v).not.toContain('window.confirm'); expect(v).not.toMatch(/\bconfirm\(/);
  });
});

describe('the name on the client\'s paper', () => {
  it('is built from the pure rules, laid over the paper, and cannot be right-clicked or printed away', () => {
    const s = read('server/share.ts');
    expect(s).toContain("import { embedFor, stampName, stampInitials, watermarkTile } from '../src/shared/docViewRules.js'");
    const doc = s.slice(s.indexOf("} else if (l.kind === 'DOC')"), s.indexOf("} else if (l.kind === 'PROJECT')"));
    expect(doc).toContain('stampName(owner, brandOf(card).displayName)'); expect(doc).toContain('watermarkTile(who)'); expect(doc).toContain('stampInitials(who)');
    expect(doc).toContain('class="wmo"'); expect(doc).toContain('class="wmb"'); expect(doc).toContain('sandbox="');
    expect(s).toContain('.vw .wmo{position:absolute;inset:0;pointer-events:none'); expect(s).toContain('@media print{.vw{display:none}}');
    expect(s).toContain("if (l.kind === 'DOC') res.set('Content-Security-Policy'"); expect(s).toContain("frame-ancestors 'none'");
    expect(s).toContain('contextmenu');
  });
  it('the other share pages keep the strict policy (frames only for a paper)', () => {
    const sv = read('server.ts'); expect(sv).toMatch(/frame-src [^;]*youtube/);
  });
});

describe('hindi', () => {
  it('every tx() in the new screens has an English and a Hindi text', () => {
    for (const f of ['src/components/ProfilesView.tsx', 'src/components/ProjectControlView.tsx', 'src/components/InventoryPanel.tsx', 'src/components/Navbar.tsx']) {
      const src = read(f); const calls = [...src.matchAll(TX)];
      expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) { expect(c[2], `${f}: ${c[0].slice(0, 70)}`).toBeTruthy(); expect(/[ऀ-ॿ]/.test(c[3]), `${f}: ${c[0].slice(0, 70)}`).toBe(true); }
    }
  });
  it('every Hindi alert the profiles desk sends has Hindi words, and the new permissions are explained in Hindi', () => {
    const src = read('server/profiles.ts');
    const his = [...src.matchAll(/hi: \[([^\]]*)\]/g)]; expect(his.length).toBeGreaterThanOrEqual(3);
    for (const m of his) expect(/[ऀ-ॿ]/.test(m[1]), m[0].slice(0, 70)).toBe(true);
    for (const m of src.matchAll(/hi: '([^']*)'/g)) expect(/[ऀ-ॿ]/.test(m[1]), m[0].slice(0, 70)).toBe(true);
    const ph = read('src/lib/permHi.ts'); expect(ph).toContain("'profile:use'"); expect(ph).toContain("'review:moderate'");
  });
});
