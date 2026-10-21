# v16.2 — Connector Desk: every number is one click

On the Connector Desk (Local Partner Referrals) the top boxes were plain numbers. Each is now a button that opens exactly the list it counts.

| Box | Opens |
|---|---|
| Total | all referrals (clears any filter) |
| Open | referrals still in progress |
| Won | referrals closed as won |
| To assign | submitted, nobody working them yet |
| Reward approvals | closed won, reward not yet approved |
| Payouts due | reward approved, not yet paid — with a **Who to pay** panel: partner, UPI on file, phone, number of referrals, amount |
| Partners | partner table, all |
| KYC pending | partner table, only those awaiting approval, with the Verify button |

- The tapped box is highlighted, a bar above the list says what you are looking at (with the total for payouts) and has **Show all**.
- Payouts due also shows "pay to <partner> · UPI <id>" inside each referral. GENZ still does not move money: you pay from your own UPI/bank, enter the UTR, tap Mark paid.
- The Partners table has All / KYC pending / Verified chips; "KYC pending" uses the same rule as the box, so the numbers match.
- Hindi and English; works at 360px.

**Server.** `GET /api/connector/referrals?queue=open|won|unassigned|rewardApprovals|payoutsDue`. The overview counts and the lists use one shared set of rules, so a box can never show a number its list does not match. Money queues (`rewardApprovals`, `payoutsDue`) return empty for anyone without the reward authority; an unknown queue is a 400. The overview also returns `payoutsDueAmount`.

**Tests.** 3 added to `tests/connector.test.ts`: count = list length for every queue; an approved reward moves from "reward approvals" to "payouts due" and leaves it once paid; unknown queue and non-manager behaviour. Full suite 306 passed, 1 skipped.

**Not done.** Only a platform admin sees the money boxes. The "Desk" staff role sees To assign / Open / Won but the Partners and KYC boxes stay plain numbers for it, because it has no partner table.
