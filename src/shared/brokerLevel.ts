/**
 * v92 — a simple, honest broker level (G1–G4) shown beside a broker's name on the feed, so people can tell who they are dealing with.
 * RERA no. on file starts a broker one step higher, but a local associate WITHOUT RERA is a full member of the network and can climb too
 * (completed deals in the network count for everyone). GENZ never calls a non-RERA member "RERA verified".
 */
export type BrokerLevel = { n: 1 | 2 | 3 | 4; code: 'G1' | 'G2' | 'G3' | 'G4'; rera: boolean; en: string; hi: string };

export function brokerLevel(u: { reraNumber?: string; tier?: string; completedDealsCount?: number }): BrokerLevel {
  const rera = !!String(u.reraNumber || '').trim() && u.tier !== 'TIER2';
  const deals = Math.max(0, Number(u.completedDealsCount) || 0);
  let n = rera ? 2 : 1;
  if (deals >= 3) n += 1;
  if (deals >= 10) n += 1;
  n = Math.min(4, n);
  const names = { 1: ['Local associate', 'लोकल एसोसिएट'], 2: ['Active member', 'सक्रिय सदस्य'], 3: ['Trusted broker', 'भरोसेमंद ब्रोकर'], 4: ['Top broker', 'टॉप ब्रोकर'] } as const;
  return { n: n as 1 | 2 | 3 | 4, code: `G${n}` as BrokerLevel['code'], rera, en: names[n as 1][0], hi: names[n as 1][1] };
}
