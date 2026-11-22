/** v192 (round 12) — Copilot answers questions about a named client (read-only SHOW_CLIENT). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planCommand, translit, findClients } from '../src/shared/copilotRules';

const clients = [{ id: 'C1', name: 'Rupesh Sahu', stage: 'NEW' }, { id: 'C2', name: 'Dr. Anil Verma', stage: 'CONTACTED' }, { id: 'C3', name: 'Anita Rao', stage: 'NEW' }];
const ctx = { clients, listings: [], now: new Date('2026-11-22T10:00:00') };
const p = (s: string) => planCommand(s, ctx) as any;

describe('v192 · SHOW_CLIENT', () => {
  it.each(['Rupesh Sahu ke baare mein batao', 'tell me about Rupesh', 'Rupesh ka status kya hai', 'Rupesh ka budget kya hai', 'Rupesh ka follow-up pending?', 'Rupesh', 'रुपेश के बारे में बताओ'])('"%s" shows the client', s => {
    const r = p(s); expect(r.kind, JSON.stringify(r)).toBe('SHOW_CLIENT'); expect(r.clientId).toBe('C1');
  });
  it('topic is passed so the answer comes first', () => {
    expect(p('Rupesh ka budget kya hai').topic).toBe('budget'); expect(p('Rupesh ka follow-up pending?').topic).toBe('follow');
  });
  it('writes still win: follow-up with a time, stage, contact', () => {
    expect(p('Rupesh follow-up kal 5 baje').kind).toBe('NOTE'); expect(p('Rupesh site visit').kind).toBe('STAGE'); expect(p('Rupesh ko call kiya').kind).toBe('NOTE');
  });
  it('titles do not break matching; Devanagari is transliterated', () => {
    expect(p('Anil ke baare mein batao').clientId).toBe('C2'); expect(findClients('anil', clients).map(c => c.id)).toEqual(['C2']);
    expect(translit('रुपेश')).toBe('rupesh');
  });
  it('several matches ask which; unknown text says what was understood', () => {
    expect(p('Ani ke baare mein batao').kind).not.toBe('SHOW_CLIENT');
    const u = p('Rupesh purple monkey dishwasher'); expect(u.kind).toBe('UNKNOWN'); expect(u.en).toContain('Rupesh'); expect(u.en).toContain('status');
    expect(p('सुनील के बारे में').en).toContain('Latin');
    expect(p('hello there').en).toContain('Try:');
  });
});

describe('v192 · panel source guards', () => {
  const src = readFileSync(path.resolve(import.meta.dirname, '../src/components/CopilotPanel.tsx'), 'utf8');
  it('a failed client load shows an error with Retry; pick falls back to the client card', () => {
    expect(src).toContain('copilot-load-error'); expect(src).toContain('copilot-load-retry'); expect(src).toContain('setLoadErr(true)');
    expect(src).toContain('showClientPlan(c)'); expect(src).not.toMatch(/api\.[a-zA-Z]+\(.*\bSHOW_CLIENT/);
  });
});
