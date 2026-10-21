# v34 — "Kahan scan hoga" at QR creation + clear message when a scanned QR is not yours

## 1. Scan point chosen when the QR is made
- **Builder pass** (Visit QR tab and the lead drawer): "Where will this QR be scanned?" — Project / sales office (default), Site gate, Model flat / sample house. The builder's team scans it.
- **Broker-to-broker site visit** (Schedule visit): At the property (default) or At the meeting point near the property. The owner or the listing broker scans it.
- Stored as `scanAt` on the pass / visit (validated list; bad value → 400). Shown as "Scan at: … — who scans" on the pass card, the schedule-success screen, the QR modal, the buyer's `/v/<code>` pass and the buyer's `/a/<token>` page after he confirms (hi + en).

## 2. A scanned QR that is not yours says so
- **Builder scan desk:** a GENZ pass of another builder → "This is a GENZ visit pass, but NOT for your project" (code `NOT_YOUR_PASS`); an unknown / mistyped code → "not a valid GENZ visit pass". Neither says whose it is. Both still count towards the 10-bad-scans lock (no code guessing). A broker-to-broker visit QR scanned here → "this is a property-visit QR, scanned by the owner / listing broker".
- **Broker's new "Scan a buyer's QR" button** (Visit QR tab → Broker-to-broker visits): builder pass QR → "only that builder's team scans it"; not a GENZ QR → "not a GENZ visit QR"; GENZ visit that is not his booking and not on his property → "NOT yours — you cannot scan it"; already verified; his own booking → "you booked this, the owner / listing broker scans". Otherwise the visit's check-in modal opens.

Tests: `tests/v33-visit-ack.test.ts` (+3 for v34). Files: `src/shared/visitRules.ts` (SCAN_POINTS), `src/components/ScanPoint.tsx`.
