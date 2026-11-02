/**
 * v106 — the cost sheet of ONE unit: base price + the project's extra charges (PLC, parking, club, deposits …) + GST + stamp duty / registration (an estimate) = the
 * all-in figure, and the payment schedule in rupees. Pure rules, shared by the server (which makes the sheet and keeps a snapshot) and the screens (which draw it).
 *
 * Nothing here is "the state's rate": the builder types the GST, stamp duty and registration % he has checked with his CA / sub-registrar (as in the Deal Desk
 * calculator), and every sheet says so — it is an indicative quote, never an offer or an agreement.
 */
export const COST_LIMITS = { lines: 12, schedule: 12, labelMax: 40, perSqftMax: 1_000_000, fixedMax: 1_000_000_000, maxQty: 4, validDaysMax: 90, noteMax: 240 } as const;

export type ChargeMode = 'PER_SQFT' | 'FIXED';
export interface ChargeLine {
  id: string;                 // short code: plc, parking, club …
  label: string;
  mode: ChargeMode;           // ₹ per sq ft of the unit's area, or one fixed amount
  amount: number;
  /** a customer picks it (car parking: 0, 1, 2 …) — else it is on every sheet */
  optional?: boolean;
  maxQty?: number;
  /** part of the price GST is charged on (PLC, parking). A refundable deposit or a society charge is not. Default true */
  gst?: boolean;
}
export interface ScheduleStep { name: string; pct: number; dueInDays: number }
export interface ProjectCharges {
  gstPct: number; stampPct: number; regPct: number;
  lines: ChargeLine[];
  schedule: ScheduleStep[];
  /** a sheet is valid for this many days (it is a quote, not an offer that stands) */
  validDays: number;
  note?: string;
  updatedAt?: string;
}

/** what a project starts with — every amount is 0 (a line with 0 is not printed) so the builder types his own */
export const DEFAULT_CHARGES: ProjectCharges = {
  gstPct: 5, stampPct: 5, regPct: 1,
  lines: [
    { id: 'plc', label: 'PLC (preferred location charge)', mode: 'PER_SQFT', amount: 0, gst: true },
    { id: 'parking', label: 'Covered car parking', mode: 'FIXED', amount: 0, optional: true, maxQty: 2, gst: true },
    { id: 'club', label: 'Club / amenities', mode: 'FIXED', amount: 0, gst: true },
    { id: 'maint', label: 'Maintenance deposit', mode: 'PER_SQFT', amount: 0, gst: false },
  ],
  schedule: [
    { name: 'On booking', pct: 10, dueInDays: 0 }, { name: 'Within 30 days — agreement', pct: 20, dueInDays: 30 }, { name: 'On plinth', pct: 20, dueInDays: 120 },
    { name: 'On slabs', pct: 30, dueInDays: 365 }, { name: 'On possession', pct: 20, dueInDays: 730 },
  ],
  validDays: 15,
};

const r0 = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const nn = (n: unknown) => { const x = Number(n); return Number.isFinite(x) && x > 0 ? x : 0; };
const clampQty = (q: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(nn(q))));

/** '' when the project's charges are fine, else why not (the builder sees this text) */
export function chargesError(c: Partial<ProjectCharges> | undefined): string {
  if (!c) return 'Charges are missing';
  const pct = (v: unknown, max: number) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= max;
  if (!pct(c.gstPct, 28)) return 'GST must be between 0% and 28%';
  if (!pct(c.stampPct, 15)) return 'Stamp duty must be between 0% and 15%';
  if (!pct(c.regPct, 15)) return 'Registration must be between 0% and 15%';
  const lines = c.lines || [];
  if (lines.length > COST_LIMITS.lines) return `At most ${COST_LIMITS.lines} charge lines`;
  const seen = new Set<string>();
  for (const l of lines) {
    if (!/^[a-z0-9_]{1,20}$/.test(String(l.id || ''))) return 'Every charge needs a short code (letters / numbers)';
    if (seen.has(l.id)) return `The code “${l.id}” is used twice`; seen.add(l.id);
    const label = String(l.label || '').trim(); if (label.length < 2 || label.length > COST_LIMITS.labelMax) return `Name each charge (2–${COST_LIMITS.labelMax} letters)`;
    if (l.mode !== 'PER_SQFT' && l.mode !== 'FIXED') return `“${label}”: choose per sq ft or fixed`;
    const cap = l.mode === 'PER_SQFT' ? COST_LIMITS.perSqftMax : COST_LIMITS.fixedMax;
    if (!Number.isFinite(Number(l.amount)) || Number(l.amount) < 0 || Number(l.amount) > cap) return `“${label}”: the amount is not valid`;
    if (l.optional && l.maxQty !== undefined && (!Number.isInteger(l.maxQty) || l.maxQty < 1 || l.maxQty > COST_LIMITS.maxQty)) return `“${label}”: the most a customer can take is 1–${COST_LIMITS.maxQty}`;
  }
  const sched = c.schedule || [];
  if (sched.length) {
    if (sched.length > COST_LIMITS.schedule) return `At most ${COST_LIMITS.schedule} payment steps`;
    for (const s of sched) { if (String(s.name || '').trim().length < 2 || String(s.name).length > 60) return 'Name each payment step'; if (!(nn(s.pct) > 0)) return `“${s.name}”: the % must be above 0`; if (!Number.isInteger(Number(s.dueInDays)) || Number(s.dueInDays) < 0 || Number(s.dueInDays) > 3650) return `“${s.name}”: the days are not valid`; }
    const sum = sched.reduce((a, s) => a + nn(s.pct), 0);
    if (Math.abs(sum - 100) > 0.01) return `The payment steps must total 100% (now ${Math.round(sum * 100) / 100}%)`;
  }
  const vd = Number(c.validDays); if (!Number.isInteger(vd) || vd < 1 || vd > COST_LIMITS.validDaysMax) return `A sheet can be valid for 1–${COST_LIMITS.validDaysMax} days`;
  if (c.note && String(c.note).length > COST_LIMITS.noteMax) return `The note can be ${COST_LIMITS.noteMax} letters at most`;
  return '';
}

/** the saved charges, cleaned (numbers, trimmed words, no stray fields); a project that never set any gets the defaults */
export function cleanCharges(c: Partial<ProjectCharges> | undefined): ProjectCharges {
  const d = DEFAULT_CHARGES; if (!c) return { ...d, lines: d.lines.map(l => ({ ...l })), schedule: d.schedule.map(s => ({ ...s })) };
  return {
    gstPct: Number(c.gstPct ?? d.gstPct), stampPct: Number(c.stampPct ?? d.stampPct), regPct: Number(c.regPct ?? d.regPct),
    lines: (c.lines ?? d.lines).filter(l => l && typeof l === 'object').map(l => ({
      id: String(l.id).trim().toLowerCase(), label: String(l.label).trim().slice(0, COST_LIMITS.labelMax), mode: l.mode, amount: Number(l.amount) || 0,
      ...(l.optional ? { optional: true, maxQty: l.maxQty ?? 1 } : {}), gst: l.gst !== false,
    })),
    schedule: (c.schedule ?? d.schedule).filter(s => s && typeof s === 'object').map(s => ({ name: String(s.name).trim().slice(0, 60), pct: Number(s.pct), dueInDays: Number(s.dueInDays) })),
    validDays: Number(c.validDays ?? d.validDays), ...(c.note ? { note: String(c.note).trim().slice(0, COST_LIMITS.noteMax) } : {}),
  };
}

export interface CostSheetLine { id: string; label: string; basis: string; qty: number; amount: number; gst: boolean }
export interface CostSheetOut {
  basic: number; areaSqft: number | null; ratePerSqft: number | null;
  lines: CostSheetLine[];
  extras: number;               // all charge lines
  gstPct: number; gst: number;
  /** basic + the charge lines GST applies to — what stamp duty / registration are worked on */
  agreementValue: number;
  stampPct: number; stamp: number; regPct: number; reg: number;
  /** price + charges + GST (what the builder collects) */
  payable: number;
  /** payable + stamp duty + registration (what the customer really spends) */
  allIn: number;
  schedule: { name: string; pct: number; dueInDays: number; amount: number }[];
}

/**
 * `qty` = how many of each optional charge the customer takes (car parking: 2). `plcPerSqft` = this unit's own PLC, when it differs from the project's.
 * A per-sq-ft charge needs the unit's area; without an area it is left out and the sheet says so (`areaSqft` null).
 */
type CostUnit = { price: number; areaSqft?: number | null; plcPerSqft?: number | null };
/** the charge lines that apply to this unit: the project's, plus the unit's own PLC when the project has no PLC line */
function linesFor(unit: CostUnit, charges: ProjectCharges): ChargeLine[] {
  const ls = [...charges.lines];
  if (nn(unit.plcPerSqft) > 0 && !ls.some(l => l.id === 'plc')) ls.unshift({ id: 'plc', label: 'PLC (preferred location charge)', mode: 'PER_SQFT', amount: nn(unit.plcPerSqft), gst: true });
  return ls;
}
const rateOf = (unit: CostUnit, l: ChargeLine) => (l.id === 'plc' && unit.plcPerSqft !== undefined && unit.plcPerSqft !== null ? nn(unit.plcPerSqft) : nn(l.amount));

/**
 * Per-sq-ft charges this unit would carry but cannot, because it has no area on record. A sheet must not go out with such a charge silently left off
 * (it would understate what the customer pays), so the server refuses to make one until the area is added.
 */
export function skippedCharges(unit: CostUnit, charges: ProjectCharges, qty: Record<string, number> = {}): string[] {
  if (nn(unit.areaSqft)) return [];
  return linesFor(unit, charges).filter(l => l.mode === 'PER_SQFT' && rateOf(unit, l) > 0 && (!l.optional || clampQty(qty[l.id], l.maxQty || 1) > 0)).map(l => l.label);
}

export function computeCostSheet(unit: CostUnit, charges: ProjectCharges, qty: Record<string, number> = {}): CostSheetOut {
  const basic = r0(nn(unit.price)); const area = nn(unit.areaSqft) || null;
  const lines: CostSheetLine[] = []; let taxable = basic; let extras = 0;
  for (const l of linesFor(unit, charges)) {
    const q = l.optional ? clampQty(qty[l.id], l.maxQty || 1) : 1; if (!q) continue;
    const rate = rateOf(unit, l);
    if (!rate) continue;
    if (l.mode === 'PER_SQFT' && !area) continue;
    const amount = r0(l.mode === 'PER_SQFT' ? rate * (area as number) * q : rate * q);
    const gst = l.gst !== false;
    lines.push({ id: l.id, label: l.label, basis: l.mode === 'PER_SQFT' ? `₹${r0(rate).toLocaleString('en-IN')} × ${area} sq ft${q > 1 ? ` × ${q}` : ''}` : (q > 1 ? `₹${r0(rate).toLocaleString('en-IN')} × ${q}` : 'Fixed'), qty: q, amount, gst });
    extras += amount; if (gst) taxable += amount;
  }
  const agreementValue = taxable;
  const gst = r0(taxable * nn(charges.gstPct) / 100);
  const stamp = r0(agreementValue * nn(charges.stampPct) / 100); const reg = r0(agreementValue * nn(charges.regPct) / 100);
  const payable = basic + extras + gst; const allIn = payable + stamp + reg;
  // the schedule runs on the sale price + GST (the deposits and the government fees are paid separately); the last step takes the rounding
  const base = taxable + gst; const sched: CostSheetOut['schedule'] = []; let used = 0;
  charges.schedule.forEach((s, i) => {
    const last = i === charges.schedule.length - 1; const amount = last ? base - used : r0(base * nn(s.pct) / 100); used += amount;
    sched.push({ name: s.name, pct: nn(s.pct), dueInDays: s.dueInDays, amount });
  });
  return { basic, areaSqft: area, ratePerSqft: area ? r0(basic / area) : null, lines, extras, gstPct: nn(charges.gstPct), gst, agreementValue, stampPct: nn(charges.stampPct), stamp, regPct: nn(charges.regPct), reg, payable, allIn, schedule: sched };
}

/** what is kept with a sent link: the figures as they were that day (a later rate change never alters a quote already sent) */
export interface CostSheetSnapshot {
  projectName: string; builderName: string; reraNumber?: string; city?: string; locality?: string;
  unit: { label: string; group: string; config: string; kind?: string; floor?: number; facing?: string };
  out: CostSheetOut;
  validUntil: string;                 // ISO
  note?: string;                      // the builder's line (“prices subject to change without notice”)
}
export const sheetExpired = (s: { validUntil: string }, now = Date.now()) => Date.parse(s.validUntil) < now;
