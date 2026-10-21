# v16.1 — Contractor privacy and dashboard fixes

Reported from a contractor session (Ramesh Patel): customer contact visible on an open lead, network inventory on a contractor's dashboard, and an internal-sounding note on Protected Docs.

## 1. Customer contact stayed visible on an OPEN lead (privacy leak)
**Cause.** The demo seed carried an old "approved" access request (CAR-001) for a lead that was still OPEN, and the lead list unmasked contact for any contractor holding an approved request.
**Fix.**
- Contact (full phone, exact site address) is shown to a contractor only when the lead is `ASSIGNED` to that contractor *and* an approved request exists. An approved record on its own is never enough.
- `request-access` drops any old approved record for a lead that is not assigned to the caller, so it can never hand back contact details.
- On load, `migrateState` removes approved requests that do not match an assigned lead. Existing databases are cleaned the first time v16.1 starts; no manual step.
- The demo seed no longer ships the inconsistent request.

The referring broker and admins see the full contact as before. Staff of a contractor never saw commission or contract value, and still don't.

## 2. Portfolio value / properties on a contractor's dashboard
**Cause.** `/api/admin/metrics` computed inventory totals for every role, and the contractor fell into the "Total Network Inventory" branch; the dashboard then showed a personal-portfolio card plus deal-room and co-broking cards.
**Fix.**
- Inventory figures are returned only to roles with `property:read`; a contractor gets zeros.
- The contractor dashboard is now its own screen (`ContractorDashboard.tsx`): open opportunities (masked), active jobs and contract value, referral fee to pay, referral fee settled, a pipeline list, a short privacy explainer and quick links. No inventory, deal-room, brokerage or co-broking cards or charts. Hindi and English.
- GENZ still does not handle the referral fee: the figures are records of what the contractor and the broker confirm.

## 3. "Honest note" on Protected Docs
Replaced with a plain notice: people you share with cannot download or forward a document, every viewer's name is stamped on each page, and every view is logged. It makes no claim about screenshots. The developer comment in `server/pdocs.ts` still records the limit for maintainers.

## Tests
`tests/contractor-privacy.test.ts` (6 tests): masked on a fresh demo contractor; full contact for the referring broker and admin; masked until the agreement is signed and then visible only to the assigned contractor (other contractor gets 409 and no contact); an old approved record is purged on load; zero inventory in metrics for a contractor while admin and broker are unchanged; `/api/properties` closed to a contractor. Removing any of the three fixes makes the matching test fail. Full suite: 303 passed, 1 skipped.
