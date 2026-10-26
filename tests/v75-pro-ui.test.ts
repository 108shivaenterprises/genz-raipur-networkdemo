import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/** v75 — builder / lawyer / contractor see ONE simple home (no 8-card dashboards) and a 4-button bottom bar. The UI has no DOM test setup, so these are source guards (like role-audit). */
const ROOT = path.resolve(import.meta.dirname, '..');
const src = (f: string) => readFileSync(path.join(ROOT, 'src/components', f), 'utf8');

describe('pro roles: simple home', () => {
  it('builder, lawyer and contractor all render ProHome; the old busy dashboards are gone', () => {
    const rh = src('RoleHome.tsx'); const dv = src('DashboardView.tsx');
    expect(rh).toContain('ProHome');
    expect(rh).not.toMatch(/const (LegalHome|BuilderHome)\b/);
    expect(dv).toContain('ProHome');
    expect(dv).not.toContain('ContractorDashboard');
    expect(existsSync(path.join(ROOT, 'src/components/ContractorDashboard.tsx'))).toBe(false);
  });
  it('ProHome shows at most 5 "today" items and the four big buttons', () => {
    const ph = src('ProHome.tsx');
    expect(ph).toMatch(/items\.slice\(0, 5\)/);
    expect(ph).toContain('Today');
  });
  it('the bottom bar of each pro role is Home + 3 plain words', () => {
    const nav = src('NavigationTabs.tsx');
    for (const role of ['DEVELOPER_BUILDER', 'LEGAL_COUNSEL', 'CONTRACTOR']) {
      const line = nav.split('\n').find(l => new RegExp(`^\\s+${role}: \\[HOME,`).test(l));
      expect(line, role).toBeTruthy();
      expect((line!.match(/\{ ids:/g) || []).length, role).toBe(3);       // HOME is a shared const, so 3 more
    }
  });
  it('the team screen offers role names by employer and the member limit by employer', () => {
    const tv = src('TeamView.tsx');
    expect(tv).toContain('teamRolesFor(employerRole)');
    expect(tv).toContain('teamMaxFor(employerRole)');
    const tc = src('TeamControl.tsx');
    expect(tc).toContain('STAFF_PRESETS'); expect(tc).toContain('All switches (advanced)');
  });
});
