/**
 * Escalator commission slabs ("First 3 bookings 2.5%, next 5 bookings 3.5% + Bangkok trip").
 * Counted per associate, per project, on APPROVED bookings. Pure functions — used by the server and the UI.
 */
export interface CpSlab {
  /** first booking number this slab covers (1-based) */
  from: number;
  /** last booking number this slab covers; omit/null = open-ended */
  to?: number | null;
  commissionPct: number;
  /** free-text reward, e.g. "Bangkok trip", "Gold coin" (the builder delivers it; GENZ only records it) */
  reward?: string;
}

export function validateSlabs(slabs: CpSlab[]): string | null {
  if (!Array.isArray(slabs)) return 'Slabs must be a list';
  if (slabs.length > 8) return 'Maximum 8 slabs';
  let expectedFrom = 1;
  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i];
    if (!Number.isInteger(s.from) || s.from !== expectedFrom) return `Slab ${i + 1} must start at booking ${expectedFrom} (no gaps or overlaps)`;
    if (!(s.commissionPct >= 0.1 && s.commissionPct <= 10)) return `Slab ${i + 1}: commission must be between 0.1% and 10%`;
    if (s.reward && s.reward.length > 80) return `Slab ${i + 1}: reward text is too long`;
    if (s.to == null) {
      if (i !== slabs.length - 1) return `Only the last slab can be open-ended`;
    } else {
      if (!Number.isInteger(s.to) || s.to < s.from) return `Slab ${i + 1}: "to" must be a whole number ≥ "from"`;
      expectedFrom = s.to + 1;
    }
  }
  return null;
}

/** The slab that applies to the associate's n-th booking (1-based). */
export function slabFor(slabs: CpSlab[] | undefined, n: number): CpSlab | undefined {
  return (slabs || []).find(s => n >= s.from && (s.to == null || n <= s.to));
}

export function commissionPctFor(slabs: CpSlab[] | undefined, n: number, fallbackPct: number): number {
  return slabFor(slabs, n)?.commissionPct ?? fallbackPct;
}

/** Where an associate stands: bookings done, current slab, and what is needed for the next step up. */
export function slabProgress(slabs: CpSlab[] | undefined, done: number) {
  const list = slabs || [];
  const current = slabFor(list, done) ;
  const next = list.find(s => s.from > Math.max(done, 0) && s.commissionPct > (current?.commissionPct ?? 0)) ?? list.find(s => s.from > done);
  return { current, next, toNext: next ? Math.max(0, next.from - done) : 0 };
}

/** Leaderboard points: 100 per counted unit + 1 per ₹1 lakh of agreement value. */
export const leaderPoints = (units: number, value: number) => units * 100 + Math.floor(value / 100000);
