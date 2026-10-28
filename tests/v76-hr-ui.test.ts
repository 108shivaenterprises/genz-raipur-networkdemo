import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** v76 — source guards for the HR screens (there is no DOM test environment): wiring, who sees what, nothing the member must not see. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const HR_DIR = path.join(ROOT, 'src/components/hr');
const hrFiles = readdirSync(HR_DIR).filter(f => f.endsWith('.tsx'));

describe('wiring', () => {
  it('the People tab is in the Team screen for broker / builder / contractor only', () => {
    const tv = read('src/components/TeamView.tsx');
    expect(tv).toContain("import { HrEmployer } from './hr/HrEmployer.js'");
    expect(tv).toMatch(/t !== 'people' \|\| hr/);
    expect(tv).toContain("tab === 'people' && hr");
    expect(read('src/App.tsx')).toMatch(/hr=\{\['BROKER', 'DEVELOPER_BUILDER', 'CONTRACTOR'\]\.includes\(currentUser\.role\)\}/);
  });
  it('"My day" is on the team member\'s home for those three employers only', () => {
    const th = read('src/components/TeamHome.tsx');
    expect(th).toContain("import { MyDay } from './hr/MyDay.js'");
    expect(th).toMatch(/\['BROKER', 'DEVELOPER_BUILDER', 'CONTRACTOR'\]\.includes\(er \|\| ''\) && <MyDay \/>/);
  });
  it('the server mounts the router and runs the sweep at start and every hour', () => {
    const s = read('server.ts');
    expect(s).toContain("app.use('/api/hr', createHrRouter())");
    expect(s).toMatch(/sweepHr\(\); sweepCalls\(\); ensureOwnerPlans/);
    expect(s).toContain("['hr', sweepHr]");
  });
});

describe('who sees what', () => {
  it('the employer sections come from the server\'s feature list, not from a guess on the phone', () => {
    const e = read('src/components/hr/HrEmployer.tsx');
    expect(e).toContain("f.includes('TARGETS')"); expect(e).toContain("f.includes('STATEMENT')"); expect(e).toContain("f.includes('CLAIMS')"); expect(e).toContain("f.includes('ASSETS')"); expect(e).toContain("f.includes('LEAVE')");
    expect(e).toContain('const f: string[] = ov.features');
  });
  it('the member card calls only the member endpoints', () => {
    const m = read('src/components/hr/MyDay.tsx');
    const used = [...new Set([...m.matchAll(/api\.(hr\w+)/g)].map(x => x[1]))].sort();
    expect(used).toEqual(['hrAckAsset', 'hrAskLeave', 'hrCancelMyClaim', 'hrCancelMyLeave', 'hrFileClaim', 'hrMe', 'hrMyAssets', 'hrMyClaims', 'hrMyLeaves', 'hrMyStatements', 'hrPunch']);
  });
  it('the member side never mentions brokerage or the employer-only figures', () => {
    const m = read('src/components/hr/MyDay.tsx');
    expect(m).not.toMatch(/brokerage|ब्रोकरेज|incentivePct|suggestDeduct|absentDays|inLat|inLng|rec\.(lat|lng)\b/);
  });
  it('a punch-in asks for GPS and (when the employer wants it) a front-camera selfie, shrunk before upload', () => {
    const m = read('src/components/hr/MyDay.tsx');
    expect(m).toContain('navigator.geolocation.getCurrentPosition'); expect(m).toContain('enableHighAccuracy: true');
    expect(m).toContain('capture="user"'); expect(m).toMatch(/shrinkImage\(f, 360, 60 \* 1024\)/);
    expect(m).toMatch(/kind === 'in' && needSelfie/);
  });
  it('the employer never sees the selfie without asking: it is fetched on a tap', () => {
    const e = read('src/components/hr/HrEmployer.tsx');
    expect(e).toMatch(/onClick=\{async \(\) => \{ try \{ setShot\(\(await api\.hrSelfie\(b\.attId\)\)\.selfie\)/);
  });
  it('a statement is private until shared, and the screen says so', () => {
    const t = read('src/components/hr/HrTargetsPay.tsx');
    expect(t).toContain('never shows brokerage'); expect(t).toContain("api.hrStatementAct(s.id, 'publish')");
  });
});

describe('hindi and touch', () => {
  it('every tx() has both an English and a Hindi text', () => {
    for (const f of hrFiles) {
      const src = read(`src/components/hr/${f}`);
      const calls = [...src.matchAll(/\btx\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(,\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?\s*\)/g)];
      expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) { expect(c[2], `${f}: ${c[0].slice(0, 60)}`).toBeTruthy(); expect(/[ऀ-ॿ]/.test(c[3]), `${f}: ${c[0].slice(0, 60)}`).toBe(true); }
    }
  });
  it('the main buttons are thumb-sized', () => {
    expect(read('src/components/hr/shared.tsx')).toMatch(/BTN = '[^']*min-h-10/);
    expect(read('src/components/hr/MyDay.tsx')).toContain('!min-h-14');
  });
});
