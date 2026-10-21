/**
 * v20 — GENZ's own commission book for MASTER-CP agreements (pure rules: server, browser and tests share them).
 *
 * The model Krishna chose: GENZ signs a master channel-partner agreement with a builder, assigns network brokers to
 * sell, the builder pays GENZ its commission, GENZ passes the agreed share to the broker who sold and keeps the rest.
 * The money moves bank-to-bank OUTSIDE the app (GENZ never holds a customer's money); this book only records what is
 * expected, invoiced, received and paid — so nothing is forgotten, nobody is paid twice, and a CA can take a CSV.
 */

export type AgreementStatus = 'DRAFT' | 'LOI' | 'SIGNED' | 'ENDED';
export type BuilderSide = 'EXPECTED' | 'INVOICED' | 'RECEIVED' | 'WRITTEN_OFF';
export type BrokerSide = 'NOT_DUE' | 'DUE' | 'PAID' | 'ON_HOLD';

export interface MasterCpAgreement {
  id: string;
  builderId?: string;
  builderName: string;
  projectIds: string[];
  /** projects that are not on GENZ yet (typed names) */
  projectNames: string[];
  /** what the builder pays GENZ, % of the agreement value of each unit */
  genzRatePct: number;
  /** default share GENZ passes to the broker who sold, % of the agreement value */
  brokerSharePct: number;
  /** TDS the builder deducts from GENZ's commission (sec. 194H) — set by your CA */
  tdsOnGenzPct: number;
  /** TDS GENZ deducts from the broker's share before paying — set by your CA */
  tdsOnBrokerPct: number;
  /** builder pays within N days of the booking */
  paymentDays: number;
  /** broker is paid only after the builder has paid GENZ ("pay when paid") */
  payWhenPaid: boolean;
  status: AgreementStatus;
  validFrom?: string;
  validTo?: string;
  note?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  history: { at: string; by: string; what: string }[];
}

export interface MasterCpEntry {
  id: string;
  agreementId: string;
  source: 'CRM' | 'MANUAL';
  bookingId?: string;
  projectId?: string;
  projectName: string;
  unitNo: string;
  brokerId?: string;
  brokerName: string;
  bookedAt: string;
  agreementValue: number;
  genzRatePct: number;
  brokerSharePct: number;
  builder: { status: BuilderSide; invoiceNo?: string; invoicedAt?: string; receivedAt?: string; receivedAmount?: number; ref?: string };
  broker: { status: BrokerSide; paidAt?: string; paidAmount?: number; ref?: string; holdReason?: string };
  /** the builder ALSO recorded a brokerage to this partner in the CRM — risk of paying the partner twice */
  doublePayRisk?: boolean;
  cancelled?: { at: string; by: string; reason: string };
  createdAt: string;
  updatedAt: string;
  history: { at: string; by: string; what: string }[];
}

const r2 = (n: number) => Math.round(n);
export const clampPct = (n: unknown, max = 20) => { const x = Number(n); return Number.isFinite(x) ? Math.min(max, Math.max(0, Math.round(x * 100) / 100)) : 0; };

/** money of one entry (₹, rounded to the rupee) */
export function entryMoney(e: Pick<MasterCpEntry, 'agreementValue' | 'genzRatePct' | 'brokerSharePct'>, a?: Pick<MasterCpAgreement, 'tdsOnGenzPct' | 'tdsOnBrokerPct'>) {
  const gross = r2(e.agreementValue * e.genzRatePct / 100);
  const brokerShare = r2(e.agreementValue * e.brokerSharePct / 100);
  const tdsOnGenz = r2(gross * (a?.tdsOnGenzPct ?? 0) / 100);
  const tdsOnBroker = r2(brokerShare * (a?.tdsOnBrokerPct ?? 0) / 100);
  return {
    gross, brokerShare, net: gross - brokerShare,
    tdsOnGenz, expectedFromBuilder: gross - tdsOnGenz,
    tdsOnBroker, payableToBroker: brokerShare - tdsOnBroker,
  };
}

/** The broker's side follows the builder's: "pay when paid" → DUE only once GENZ has received. */
export function brokerStatusAfter(builder: BuilderSide, current: BrokerSide, payWhenPaid: boolean): BrokerSide {
  if (current === 'PAID' || current === 'ON_HOLD') return current;
  if (builder === 'WRITTEN_OFF') return 'NOT_DUE';
  if (!payWhenPaid) return 'DUE';
  return builder === 'RECEIVED' ? 'DUE' : 'NOT_DUE';
}

export const isOverdue = (e: MasterCpEntry, a: Pick<MasterCpAgreement, 'paymentDays'> | undefined, now = Date.now()) =>
  !e.cancelled && (e.builder.status === 'EXPECTED' || e.builder.status === 'INVOICED') && now - Date.parse(e.bookedAt) > (a?.paymentDays ?? 45) * 86_400_000;

export interface RevenueTotals {
  entries: number; agreementValue: number;
  gross: number; brokerShare: number; net: number;
  expected: number; invoiced: number; received: number; writtenOff: number; overdue: number; overdueCount: number;
  payableNow: number; paidToBrokers: number; onHold: number;
  /** received from builders minus paid to brokers (cash GENZ actually kept so far) */
  cashKept: number;
  doublePayRisk: number;
}

export function totals(entries: MasterCpEntry[], agreements: Map<string, MasterCpAgreement>, now = Date.now()): RevenueTotals {
  const t: RevenueTotals = { entries: 0, agreementValue: 0, gross: 0, brokerShare: 0, net: 0, expected: 0, invoiced: 0, received: 0, writtenOff: 0, overdue: 0, overdueCount: 0, payableNow: 0, paidToBrokers: 0, onHold: 0, cashKept: 0, doublePayRisk: 0 };
  for (const e of entries) {
    if (e.cancelled) continue;
    const a = agreements.get(e.agreementId);
    const m = entryMoney(e, a);
    t.entries++; t.agreementValue += e.agreementValue; t.gross += m.gross; t.brokerShare += m.brokerShare; t.net += m.net;
    if (e.builder.status === 'EXPECTED') t.expected += m.expectedFromBuilder;
    if (e.builder.status === 'INVOICED') t.invoiced += m.expectedFromBuilder;
    if (e.builder.status === 'RECEIVED') t.received += e.builder.receivedAmount ?? m.expectedFromBuilder;
    if (e.builder.status === 'WRITTEN_OFF') t.writtenOff += m.expectedFromBuilder;
    if (isOverdue(e, a, now)) { t.overdue += m.expectedFromBuilder; t.overdueCount++; }
    if (e.broker.status === 'DUE') t.payableNow += m.payableToBroker;
    if (e.broker.status === 'PAID') t.paidToBrokers += e.broker.paidAmount ?? m.payableToBroker;
    if (e.broker.status === 'ON_HOLD') t.onHold += m.payableToBroker;
    if (e.doublePayRisk) t.doublePayRisk++;
  }
  t.cashKept = t.received - t.paidToBrokers;
  return t;
}

const csvCell = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
/** one row per booking for the CA (amounts in ₹; formula-injection safe) */
export function entriesCsv(entries: MasterCpEntry[], agreements: Map<string, MasterCpAgreement>): string {
  const head = ['Entry', 'Agreement', 'Builder', 'Project', 'Unit', 'Broker', 'Booked on', 'Agreement value', 'GENZ %', 'GENZ gross', 'TDS by builder', 'Expected from builder', 'Builder status', 'Invoice no', 'Received on', 'Received amount', 'Broker %', 'Broker share', 'TDS on broker', 'Payable to broker', 'Broker status', 'Paid on', 'Paid amount', 'Payment ref', 'GENZ net', 'Cancelled'];
  const rows = entries.map(e => {
    const a = agreements.get(e.agreementId); const m = entryMoney(e, a);
    return [e.id, e.agreementId, a?.builderName || '', e.projectName, e.unitNo, e.brokerName, e.bookedAt.slice(0, 10), e.agreementValue, e.genzRatePct, m.gross, m.tdsOnGenz, m.expectedFromBuilder, e.builder.status, e.builder.invoiceNo || '', (e.builder.receivedAt || '').slice(0, 10), e.builder.receivedAmount ?? '', e.brokerSharePct, m.brokerShare, m.tdsOnBroker, m.payableToBroker, e.broker.status, (e.broker.paidAt || '').slice(0, 10), e.broker.paidAmount ?? '', e.broker.ref || '', m.net, e.cancelled ? `${e.cancelled.at.slice(0, 10)} ${e.cancelled.reason}` : ''];
  });
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
}
