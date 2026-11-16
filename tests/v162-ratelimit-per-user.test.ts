import { describe, it, expect } from 'vitest';
import { rateLimit, requestContext } from '../server/auth.js';

const run = (user: { id: string } | null, ip: string) => {
  let code = 200;
  const res: any = { setHeader() {}, status(c: number) { code = c; return res; }, json() { return res; } };
  requestContext.run({ user, ip }, () => rateLimit('t162', 2, 60_000)({ ip } as any, res, () => {}));
  return code;
};

describe('v162 rate limit counts signed-in members one by one', () => {
  it('two brokers on the same IP do not share a bucket; anonymous callers still do', () => {
    expect([run({ id: 'A' }, '1.1.1.1'), run({ id: 'A' }, '1.1.1.1'), run({ id: 'A' }, '1.1.1.1')]).toEqual([200, 200, 429]);
    expect(run({ id: 'B' }, '1.1.1.1')).toBe(200);
    expect([run(null, '2.2.2.2'), run(null, '2.2.2.2'), run(null, '2.2.2.2')]).toEqual([200, 200, 429]);
  });
});
