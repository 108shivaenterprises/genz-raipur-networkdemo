/** v33 — the buyer's side of the “no direct deal” acknowledgement, for tests: tick + his mobile + the code the broker reads out. */
export async function ackBuyer(B: string, call: (cookie: string | undefined, method: string, url: string, body?: unknown) => Promise<Response>, cookie: string, kind: 'PASS' | 'VISIT', refId: string, phone: string): Promise<number> {
  const info = async () => (await (await call(cookie, 'GET', `/api/visit-acks/${kind}/${refId}`)).json()).ack;
  const a = await info(); if (!a) throw new Error('no acknowledgement for ' + refId);
  const post = (path: string, form: Record<string, string>) => fetch(B + a.page + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  await post('/otp', { agree: '1', phone });
  const code = (await info()).codeForBuyer;
  const r = await post('/verify', { code });
  return r.status;
}
