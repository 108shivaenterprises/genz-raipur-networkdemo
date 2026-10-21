/**
 * v30 — what a buyer really pays: the price on the agreement plus stamp duty, registration, GST (if under construction),
 * extras (floor rise, parking, club, maintenance deposit, legal), and the broker's fee — and what the loan EMI looks like.
 * Rates differ by state, buyer (women's concession), property and year, so NOTHING here is hard-coded as "the state's rate":
 * the screen starts with a plain default and the member types the rate he has checked with the sub-registrar / CA.
 */
export interface CostInput {
  price: number;               // agreement value
  guidelineValue?: number;     // circle / guideline rate value; duty is charged on the higher of the two
  stampPct: number;            // stamp duty %, as checked for the state
  regPct: number;              // registration fee %
  regCap?: number;             // some states cap the registration fee (₹)
  gstPct: number;              // 0 for ready / resale, 5 (1 affordable) for under-construction — check with a CA
  extras: number;              // floor rise + PLC + parking + club + maintenance deposit + society charges
  legal: number;               // lawyer / agreement drafting
  brokeragePct: number;        // broker's fee on the price (what the buyer owes his broker, if any)
}
export interface CostOut { dutyBase: number; stamp: number; reg: number; gst: number; brokerage: number; extras: number; legal: number; total: number; onTopPct: number }

const r0 = (n: number) => Math.round(Number.isFinite(n) ? n : 0);
const nn = (n: unknown) => { const x = Number(n); return Number.isFinite(x) && x > 0 ? x : 0; };

export function landedCost(i: CostInput): CostOut {
  const price = nn(i.price); const dutyBase = Math.max(price, nn(i.guidelineValue));
  const stamp = r0(dutyBase * nn(i.stampPct) / 100);
  let reg = r0(dutyBase * nn(i.regPct) / 100); const cap = nn(i.regCap); if (cap && reg > cap) reg = r0(cap);
  const gst = r0(price * nn(i.gstPct) / 100); const brokerage = r0(price * nn(i.brokeragePct) / 100);
  const extras = r0(nn(i.extras)); const legal = r0(nn(i.legal));
  const total = price + stamp + reg + gst + brokerage + extras + legal;
  return { dutyBase, stamp, reg, gst, brokerage, extras, legal, total, onTopPct: price ? Math.round(((total - price) / price) * 1000) / 10 : 0 };
}

/** monthly instalment for a reducing-balance loan; 0 rate = plain division */
export function emi(principal: number, annualPct: number, years: number): number {
  const P = nn(principal); const n = Math.round(nn(years) * 12); if (!P || !n) return 0;
  const r = nn(annualPct) / 1200; if (!r) return r0(P / n);
  const f = Math.pow(1 + r, n); return r0((P * r * f) / (f - 1));
}

export interface LoanPlan { loan: number; emi: number; interest: number; total: number }
export function loanPlan(price: number, downPct: number, annualPct: number, years: number): LoanPlan {
  const loan = r0(nn(price) * (1 - Math.min(100, nn(downPct)) / 100)); const m = emi(loan, annualPct, years);
  const total = m * Math.round(nn(years) * 12);
  return { loan, emi: m, interest: Math.max(0, total - loan), total };
}
