import { describe, it, expect } from 'vitest';
import { visitJoint } from '../src/shared/visitRules.js';

// v159 — one word for both sides of a visit
describe('visitJoint', () => {
  it('owner yes + buyer confirmed (or none asked) = PAKKA', () => {
    expect(visitJoint({ ownerOk: { answer: 'YES' }, ackStatus: 'ACKED' }).state).toBe('PAKKA');
    expect(visitJoint({ ownerOk: { answer: 'YES' }, ackStatus: 'NONE' }).state).toBe('PAKKA');
  });
  it('anything missing = WAIT; owner no = CHANGE even when the buyer said yes', () => {
    expect(visitJoint({ ackStatus: 'ACKED' })).toEqual({ state: 'WAIT', owner: 'WAIT', buyer: 'YES' });
    expect(visitJoint({ ownerOk: { answer: 'YES' }, ackStatus: 'PENDING' }).state).toBe('WAIT');
    expect(visitJoint({ ownerOk: { answer: 'NO' }, ackStatus: 'ACKED' }).state).toBe('CHANGE');
  });
});
