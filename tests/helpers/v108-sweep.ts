/**
 * v108 test helper — runs the hold sweep with a clock we choose, in a fresh seeded database (cwd), and prints what happened as one JSON line.
 * (The server sweeps every minute; a test cannot wait two hours, so it moves the clock instead.)
 */
import { db } from '../../server/db';
import { sweepHolds, HOLD_WARN_MIN } from '../../server/inventory';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const st = db.getState();
const unit: any = st.inventoryUnits.find((u: any) => u.status === 'AVAILABLE');
const brokerId = 'USR-BRK-001';
const T0 = Date.now();
const inboxOf = (uid: string) => st.inbox.filter((x: any) => x.userId === uid && x.tag === `hold-${unit.id}`).map((x: any) => ({ title: x.title, body: x.body, hi: x.hi?.title }));

unit.status = 'HOLD';
unit.hold = { brokerId, brokerName: 'Vikramaditya Sharma', leadId: 'L-X', customerName: 'Ravi Kumar Verma', tokenAmount: 25000, tokenRef: 'UTR998877', at: new Date(T0 - 100 * 60_000).toISOString(), expiresAt: new Date(T0 + 40 * 60_000).toISOString() };
const out: any = { unitId: unit.id, warnMin: HOLD_WARN_MIN };

// 40 minutes left — nothing yet
out.early = { swept: sweepHolds(T0), warned: !!unit.hold.warnedAt, status: unit.status };
// 10 minutes left — one warning
out.soon = { swept: sweepHolds(T0 + 30 * 60_000), warned: !!unit.hold.warnedAt, status: unit.status };
await wait(250);
out.inboxSoon = inboxOf(brokerId);
// a second sweep a minute later — no second warning
const warnedAt = unit.hold.warnedAt;
out.again = { swept: sweepHolds(T0 + 31 * 60_000), sameStamp: unit.hold?.warnedAt === warnedAt };
// past the end — back to everyone, and the broker is told
out.lapsed = { swept: sweepHolds(T0 + 41 * 60_000), status: unit.status, hold: unit.hold ?? null };
await wait(250);
out.inboxLapsed = inboxOf(brokerId);
// a booking-pending hold (no clock) is never swept
const u2: any = st.inventoryUnits.find((u: any) => u.status === 'AVAILABLE' && u.id !== unit.id);
u2.status = 'HOLD'; u2.hold = { brokerId, brokerName: 'x', leadId: 'L-Y', customerName: 'Sita', tokenAmount: 25000, tokenRef: 'UTR1', at: new Date(T0).toISOString(), expiresAt: null, bookingId: 'BKG-X' };
out.pending = { swept: sweepHolds(T0 + 999 * 3600_000), status: u2.status };
console.log('RESULT ' + JSON.stringify(out));
process.exit(0);
