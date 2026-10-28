import { describe, it, expect } from 'vitest';
import * as R from '../src/shared/callRules.js';

describe('v81 — call rules', () => {
  it('recording mode: the employer decides for his own people; two businesses always ask; OFF forbids it', () => {
    expect(R.recordMode('TEAM', 'ALWAYS', true)).toBe('ALWAYS');
    expect(R.recordMode('TEAM', 'ASK', true)).toBe('ASK');
    expect(R.recordMode('TEAM', 'OFF', true)).toBe('FORBIDDEN');
    expect(R.recordMode('TEAM', undefined, true)).toBe('ASK');
    // an outsider on the call: the employer's ALWAYS does not silence him — he must allow it
    expect(R.recordMode('DEAL', 'ALWAYS', false)).toBe('ASK');
    expect(R.recordMode('PARTNER', 'ALWAYS', false)).toBe('ASK');
    expect(R.recordMode('DEAL', undefined, false)).toBe('ASK');
    expect(R.recordMode('DEAL', 'OFF', false)).toBe('FORBIDDEN');
  });
  it('a ring nobody answers becomes MISSED; a call past its limit ends', () => {
    const t0 = Date.parse('2026-10-28T10:00:00Z');
    const ring = { status: 'RINGING' as const, createdAt: new Date(t0).toISOString() };
    expect(R.lazyStatus(ring, t0 + 10_000)).toBe('RINGING');
    expect(R.lazyStatus(ring, t0 + (R.RING_SECONDS + 1) * 1000)).toBe('MISSED');
    const live = { status: 'ACTIVE' as const, createdAt: new Date(t0).toISOString(), answeredAt: new Date(t0).toISOString() };
    expect(R.lazyStatus(live, t0 + 30 * 60_000)).toBe('ACTIVE');
    expect(R.lazyStatus(live, t0 + (R.CALL_MAX_SECONDS + 200) * 1000)).toBe('ENDED');
    expect(R.lazyStatus({ ...live, status: 'ENDED' }, t0 + 99_999_999)).toBe('ENDED');
  });
  it('duration, clock text, keeping days', () => {
    const a = '2026-10-28T10:00:00.000Z';
    expect(R.durationSec({ status: 'ENDED', createdAt: a, answeredAt: a, endedAt: '2026-10-28T10:02:05.000Z' })).toBe(125);
    expect(R.durationSec({ status: 'MISSED', createdAt: a })).toBe(0);
    expect(R.fmtDuration(125)).toBe('02:05');
    const now = Date.parse('2026-10-28T10:00:00Z');
    expect(R.recordingKept('2026-10-10T00:00:00Z', now)).toBe(true);
    expect(R.recordingKept('2026-09-20T00:00:00Z', now)).toBe(false);
    expect(R.recordingKept(undefined, now)).toBe(false);
  });
  it('knows an audio file from its first bytes and nothing else', () => {
    const pad = (b: number[]) => Uint8Array.from([...b, ...new Array(16).fill(0)]);
    expect(R.sniffAudio(pad([0x1a, 0x45, 0xdf, 0xa3]))?.ext).toBe('webm');
    expect(R.sniffAudio(Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...new Array(12).fill(0)]))?.ext).toBe('mp4');
    expect(R.sniffAudio(pad([0x4f, 0x67, 0x67, 0x53]))?.ext).toBe('ogg');
    expect(R.sniffAudio(pad([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(R.sniffAudio(new Uint8Array(4))).toBeNull();
  });
  it('limits fit a serverless body and the file-sync cap', () => {
    expect(R.CHUNK_MAX_BYTES).toBeLessThan(4_500_000);
    expect(R.REC_TOTAL_MAX_BYTES).toBeLessThanOrEqual(12 * 1024 * 1024);
  });
});
