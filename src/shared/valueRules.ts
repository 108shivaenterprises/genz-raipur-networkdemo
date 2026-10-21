/**
 * v20 — "what is GENZ worth?" numbers an investor / buyer of the company asks for first:
 * monthly active brokers and growth, cohort retention, how much of the growth comes from members inviting members
 * (k-factor), network effects (co-broking, sales through partners), city coverage, GMV and GENZ's take rate.
 * Pure functions (server, browser, tests). Only counts — no names, phones or customer data.
 */

export const IST_MS = 330 * 60_000;
export const monthOf = (iso: string | number | undefined) => {
  if (iso === undefined || iso === '') return '';
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + IST_MS).toISOString().slice(0, 7) : '';
};
/** the last n calendar months (IST), oldest first, e.g. ['2026-05', …, '2026-10'] */
export function lastMonths(n: number, now = Date.now()): string[] {
  const d = new Date(now + IST_MS); const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); out.push(x.toISOString().slice(0, 7)); }
  return out;
}

export interface ValueInput {
  now: number;
  users: { id: string; role: string; createdAt?: string; verificationStatus: string; city?: string; invitedById?: string; sponsorId?: string }[];
  days: { day: string; seen: string[]; acted: string[] }[];
  invitations: { issuedBy?: string; status: string; redeemedAt?: string; redeemedBy?: string }[];
  bookings: { status: string; decidedAt?: string; createdAt: string; agreementValue: number; direct?: boolean; projectId?: string }[];
  offers: { createdAt?: string; proposingBrokerId?: string; receivingBrokerId?: string }[];
  deals: { createdAt?: string; introducingBrokerId?: string; closingBrokerId?: string }[];
  /** GENZ master-CP book: gross / received per month of booking */
  revenue: { bookedAt: string; gross: number; net: number; received: number; agreementValue: number; cancelled?: boolean }[];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export function valueReport(inp: ValueInput, monthsBack = 6) {
  const months = lastMonths(monthsBack, inp.now);
  const isBroker = new Map(inp.users.map(u => [u.id, u.role === 'BROKER']));
  const roleAdmin = new Set(inp.users.filter(u => u.role === 'ADMIN' || u.role === 'SUPERADMIN').map(u => u.id));
  const brokers = inp.users.filter(u => u.role === 'BROKER');

  // monthly active brokers from the daily record (IST days)
  const activeIn = new Map<string, Set<string>>(); const actedIn = new Map<string, Set<string>>();
  for (const d of inp.days) {
    const m = d.day.slice(0, 7);
    const a = activeIn.get(m) || activeIn.set(m, new Set()).get(m)!; for (const id of d.seen) if (isBroker.get(id)) a.add(id);
    const b = actedIn.get(m) || actedIn.set(m, new Set()).get(m)!; for (const id of d.acted) if (isBroker.get(id)) b.add(id);
  }
  const firstDay = inp.days.length ? inp.days.reduce((m, d) => (d.day < m ? d.day : m), inp.days[0].day) : '';
  const recorded = (m: string) => !!firstDay && m >= firstDay.slice(0, 7);

  const signupsIn = (m: string) => brokers.filter(u => monthOf(u.createdAt) === m).length;
  const verifiedBy = (m: string) => brokers.filter(u => u.verificationStatus === 'VERIFIED' && monthOf(u.createdAt) <= m).length;
  const approved = inp.bookings.filter(b => b.status === 'APPROVED');
  const monthly = months.map(m => {
    const net = approved.filter(b => !b.direct && monthOf(b.decidedAt || b.createdAt) === m);
    const rev = inp.revenue.filter(r => !r.cancelled && monthOf(r.bookedAt) === m);
    return {
      month: m,
      newBrokers: signupsIn(m),
      verifiedBrokers: verifiedBy(m),
      activeBrokers: recorded(m) ? (activeIn.get(m)?.size || 0) : null,
      workingBrokers: recorded(m) ? (actedIn.get(m)?.size || 0) : null,
      networkBookings: net.length,
      networkGmv: net.reduce((a, b) => a + (b.agreementValue || 0), 0),
      coBroking: inp.offers.filter(o => monthOf(o.createdAt) === m).length + inp.deals.filter(d => monthOf(d.createdAt) === m && d.introducingBrokerId && d.closingBrokerId && d.introducingBrokerId !== d.closingBrokerId).length,
      invitesRedeemed: inp.invitations.filter(i => i.status === 'REDEEMED' && monthOf(i.redeemedAt) === m).length,
      genzGross: rev.reduce((a, r) => a + r.gross, 0),
      genzNet: rev.reduce((a, r) => a + r.net, 0),
      genzReceived: rev.reduce((a, r) => a + r.received, 0),
    };
  });
  const last = monthly[monthly.length - 1]; const prev = monthly[monthly.length - 2];
  const growth = (k: 'activeBrokers' | 'verifiedBrokers' | 'networkGmv') => {
    const a = last?.[k] as number | null; const b = prev?.[k] as number | null;
    return a === null || b === null || b === undefined || !b ? null : Math.round(((a - b) / b) * 1000) / 10;
  };

  // cohort retention: brokers who JOINED in month M — what share was active in M, M+1, …
  const cohorts = months.map((m, i) => {
    const members = brokers.filter(u => monthOf(u.createdAt) === m).map(u => u.id);
    const cells = months.slice(i).map(n => (recorded(n) && members.length ? pct(members.filter(id => activeIn.get(n)?.has(id)).length, members.length) : null));
    return { month: m, size: members.length, retention: cells };
  });

  // virality: of the brokers who joined in the last 90 days, how many came through a MEMBER (not GENZ staff)
  const since90 = inp.now - 90 * 86_400_000;
  const recent = brokers.filter(u => u.createdAt && Date.parse(u.createdAt) >= since90);
  const viaMember = recent.filter(u => (u.sponsorId && !roleAdmin.has(u.sponsorId)) || (u.invitedById && !roleAdmin.has(u.invitedById)));
  const inviters = new Set(viaMember.map(u => u.sponsorId || u.invitedById));
  const activeRecently = new Set<string>(); for (const d of inp.days) if (Date.parse(d.day) >= since90) for (const id of d.seen) if (isBroker.get(id)) activeRecently.add(id);
  const virality = {
    newBrokers90d: recent.length,
    viaMembers90d: viaMember.length,
    viaMembersPct: pct(viaMember.length, recent.length),
    /** new brokers brought by members ÷ brokers active in the same 90 days (k > 1 = grows by itself) */
    kFactor: activeRecently.size ? Math.round((viaMember.length / activeRecently.size) * 100) / 100 : null,
    invitingMembers: inviters.size,
  };

  // cities: verified brokers and how many were active in the last 30 days
  const since30 = inp.now - 30 * 86_400_000;
  const active30 = new Set<string>(); for (const d of inp.days) if (Date.parse(d.day) >= since30) for (const id of d.seen) active30.add(id);
  const byCity = new Map<string, { verified: number; active30: number }>();
  for (const u of brokers) if (u.verificationStatus === 'VERIFIED') {
    const c = (u.city || '—').trim() || '—'; const x = byCity.get(c) || byCity.set(c, { verified: 0, active30: 0 }).get(c)!;
    x.verified++; if (active30.has(u.id)) x.active30++;
  }
  const cities = [...byCity].map(([city, x]) => ({ city, ...x })).sort((a, b) => b.verified - a.verified);

  // network effects + money, last 12 months
  const since365 = inp.now - 365 * 86_400_000;
  const ap12 = approved.filter(b => Date.parse(b.decidedAt || b.createdAt) >= since365);
  const viaPartners = ap12.filter(b => !b.direct);
  const gmv12 = viaPartners.reduce((a, b) => a + (b.agreementValue || 0), 0);
  const rev12 = inp.revenue.filter(r => !r.cancelled && Date.parse(r.bookedAt) >= since365);
  const genzGross12 = rev12.reduce((a, r) => a + r.gross, 0);
  const genzNet12 = rev12.reduce((a, r) => a + r.net, 0);
  const mcpGmv12 = rev12.reduce((a, r) => a + r.agreementValue, 0);
  const money = {
    networkGmv12m: gmv12,
    networkBookings12m: viaPartners.length,
    partnerSharePct: pct(viaPartners.length, ap12.length),
    genzGross12m: genzGross12,
    genzNet12m: genzNet12,
    genzReceived12m: rev12.reduce((a, r) => a + r.received, 0),
    /** GENZ net ÷ value sold under GENZ master-CP agreements */
    takeRatePct: mcpGmv12 ? Math.round((genzNet12 / mcpGmv12) * 10000) / 100 : null,
    /** GENZ net ÷ all network sales (how much of the network's flow GENZ monetises) */
    networkTakeRatePct: gmv12 ? Math.round((genzNet12 / gmv12) * 10000) / 100 : null,
  };

  const verifiedNow = brokers.filter(u => u.verificationStatus === 'VERIFIED').length;
  return {
    generatedAt: new Date(inp.now).toISOString(),
    recordedSince: firstDay || null,
    headline: {
      verifiedBrokers: verifiedNow,
      activeBrokersThisMonth: last?.activeBrokers ?? null,
      activeGrowthPct: growth('activeBrokers'),
      verifiedGrowthPct: growth('verifiedBrokers'),
      gmvGrowthPct: growth('networkGmv'),
      citiesWith10: cities.filter(c => c.verified >= 10).length,
      cities: cities.filter(c => c.city !== '—').length,
    },
    monthly, cohorts, virality, cities: cities.slice(0, 15), money,
  };
}

export type ValueReport = ReturnType<typeof valueReport>;

/** CSV of the monthly table for a data room (formula-injection safe) */
export function valueCsv(r: ValueReport): string {
  const head = ['Month', 'New brokers', 'Verified brokers (cumulative)', 'Active brokers', 'Working brokers', 'Network bookings', 'Network GMV (₹)', 'Co-broking (offers + deals)', 'Invites redeemed', 'GENZ gross (₹)', 'GENZ net (₹)', 'GENZ received (₹)'];
  const rows = r.monthly.map(m => [m.month, m.newBrokers, m.verifiedBrokers, m.activeBrokers ?? '', m.workingBrokers ?? '', m.networkBookings, m.networkGmv, m.coBroking, m.invitesRedeemed, m.genzGross, m.genzNet, m.genzReceived]);
  return [head, ...rows].map(x => x.join(',')).join('\n');
}
