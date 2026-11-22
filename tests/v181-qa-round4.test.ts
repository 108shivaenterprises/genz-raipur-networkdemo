import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { setQueueUser, enqueue, readQueue, flushQueue } from '../src/lib/offline';

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

describe('v181 round 4', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  });

  it('D3: sign-out keeps the queue; another user id never flushes it', async () => {
    setQueueUser('A'); enqueue({ kind: 'add', body: { name: 'x' } });
    const app = read('src/App.tsx');
    expect(app).not.toContain('clearQueue(');
    expect(app).toContain('They stay on this phone and send when you sign in again with internet.');
    expect(app).toContain('इंटरनेट के साथ दोबारा साइन इन करने पर');
    setQueueUser('B'); const sent: unknown[] = [];
    expect(await flushQueue(async op => { sent.push(op); })).toBe(0);
    expect(sent).toHaveLength(0);
    expect(localStorage.getItem('genz.pending.v1.A')).toContain('"x"');
    setQueueUser('A'); expect(await flushQueue(async op => { sent.push(op); })).toBe(1);
    expect(app).toContain("flushQueue((op: PendingOp)");   // login-time flush effect
    expect(read('src/components/ClientsView.tsx')).toContain('pending, will send when online');
  });

  it('D4: the clients grid cannot widen the page; modal close buttons are 44px', () => {
    const c = read('src/components/ClientsView.tsx');
    expect(c).toContain('grid grid-cols-1 gap-3 sm:grid-cols-2'); expect(c).toContain('min-w-0 rounded-xl border border-slate-200 bg-white p-3.5');
    expect(read('src/components/Modals.tsx')).not.toContain('rounded-lg p-1.5 text-slate-400');
    for (const f of ['Modals', 'CheckinModal', 'PrivacyCenter']) expect(read(`src/components/${f}.tsx`)).toContain('h-11 w-11');
    expect(read('server/shopPartners.ts')).toContain('button,.btn{display:inline-block;min-height:44px');
  });

  it('D1: visit chat lines carry the year; reschedule errors have Hindi', () => {
    expect(read('server.ts')).toMatch(/month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' \}\); \} catch \{ \/\* \*\/ \}/);
    expect(read('server/chatcards.ts')).toContain("month: 'short', year: 'numeric', hour");
    expect(read('server/errorHi.ts')).toContain("'The new visit time is in the past'");
  });

  it('D2: the green "nothing waiting" card is quiet while the owner has a waiting list', () => {
    expect(read('src/components/DealHub.tsx')).toContain('if (!list.length && quiet) return null;');
    expect(read('src/components/DealRoomsView.tsx')).toContain('<NextSteps quiet=');
  });

  it('D6: the incentive table scrolls inside its own box', () => {
    expect(read('src/components/TeamView.tsx')).toContain('overflow-x-auto rounded-xl border border-slate-200 bg-white p-4" data-testid="incentive-table"');
  });

  it('D8: opt-out closes the open need-confirmation card', () => {
    expect(read('server/sahayak.ts')).toContain('l.chat.reqAskedAt = undefined;   // v181');
  });
});
