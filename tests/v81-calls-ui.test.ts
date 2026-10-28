import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** v81 — source guards (there is no DOM test environment): the microphone is allowed for the app, the call tools sit where people work, no number is on a call screen,
 *  recording is visible on both screens, and every new sentence has Hindi. */
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const TX = /\btx\(\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*(,\s*(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"))?\s*\)/g;
const DEVA = /[ऀ-ॿ]/;
const FILES = ['src/components/calls/CallScreen.tsx', 'src/components/calls/CallHost.tsx', 'src/components/calls/CallButton.tsx', 'src/components/calls/CallsPanel.tsx'];

describe('v81 call screens', () => {
  it('every tx() sentence in the call files has a Hindi line', () => {
    for (const f of FILES) {
      const s = read(f); let n = 0;
      for (const m of s.matchAll(TX)) { n++; expect(m[3], `${f}: ${m[1].slice(0, 60)}`).toBeTruthy(); expect(DEVA.test(m[3]!), `${f}: ${m[1].slice(0, 60)}`).toBe(true); }
      expect(n, f).toBeGreaterThan(2);
    }
  });
  it('the browser may use the microphone for the app itself (it was switched off for everyone before)', () => {
    expect(read('server.ts')).toContain("'camera=(self), geolocation=(self), microphone=(self)'");
  });
  it('the only non-JSON API body allowed is a piece of a call recording', () => {
    const s = read('server.ts');
    expect(s).toContain("/^\\/calls\\/[A-Za-z0-9_-]+\\/chunk$/.test(req.path)");
    expect(s).toContain('audio\\/(webm|mp4|ogg)');
  });
  it('the call screen shows no phone number and a red recording bar whenever recording is on', () => {
    const c = read('src/components/calls/CallScreen.tsx');
    expect(c).toContain('data-testid="call-rec-bar"'); expect(c).toContain("recOn && <div");
    expect(c).not.toMatch(/\.phone\b|tel:|\+91/);
    expect(c).toContain('No phone number is shown or shared on this call.');
  });
  it('the microphone is asked for only when a person taps Call or Answer', () => {
    const h = read('src/components/calls/CallHost.tsx');
    expect(h.match(/await mic\(\)|stream = await mic\(\)/g)!.length).toBe(2);
    expect(read('src/components/calls/CallScreen.tsx')).not.toContain('getUserMedia');
  });
  it('the phone that asked records, and the last piece is sent when the call ends', () => {
    const c = read('src/components/calls/CallScreen.tsx');
    expect(c).toContain("call.record === 'ON' && call.recordByMe && conn === 'connected'");
    expect(c).toContain('api.callRecordFinish');
    expect(c).toContain("navigator.sendBeacon(`/api/calls/${callRef.current.id}/end`");
  });
  it('the ringing app is wrapped around the signed-in app and off while someone is viewing as another person', () => {
    const a = read('src/App.tsx');
    expect(a).toContain("<CallHost enabled={hasPerm(permissions, 'call:use') && !impersonatedBy}>"); expect(a).toContain('</CallHost>');
  });
  it('Call sits in the team list, the staff home, the deal-room chat and the builder / partner chat; Calls (log) in Chats and Team › Activity', () => {
    expect(read('src/components/TeamView.tsx')).toContain('context="TEAM"'); expect(read('src/components/TeamView.tsx')).toContain('<CallsPanel />');
    expect(read('src/components/TeamHome.tsx')).toContain('<CallMenu context="TEAM" />');
    expect(read('src/components/ChatsView.tsx')).toContain('<CallMenu context="DEAL" contextId={row.id} compact />'); expect(read('src/components/ChatsView.tsx')).toContain('data-testid="chats-calls"');
    expect(read('src/components/PartnerChat.tsx')).toContain('context="PARTNER"');
  });
  it('the owner of the business can say it is TURN-less (so a failed call is explained)', () => {
    expect(read('src/components/calls/CallsPanel.tsx')).toContain('relay (TURN)');
  });
});
