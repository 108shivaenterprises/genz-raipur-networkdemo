# v38 — Target Bonus (builder → partner broker)

A builder rewards a partner broker who reaches **his own target before his own deadline**. It sits on top of the base commission, the commission slabs (Project Control) and the volume bonus (CRM → Bonus).

## The three rewards
| # | When | Reward |
|---|------|--------|
| 1 | Target reached on or before the deadline | extra % on the sales counted in the period, **or** a fixed ₹ |
| 2 | Every unit above the target (inside the period) | extra % on that unit's agreement value |
| 3 | Target reached within the first X % of the period (early finish) | extra % or fixed ₹ — this **is** the project's "early-bird %" now |

- **Target** = the partner's target units (same number as in Project Control).
- **Period** starts the day the builder approved the partner. **Deadline** = a date the builder sets for that partner, else start + the scheme's period (days).
- A unit counts when the booking is **approved inside the period** and the **minimum collection %** (default 10) is received. A cancelled booking drops out by itself; if it was already paid, the row shows "over-paid".
- Limits: period 7–730 days; extra % at most 5; early window 10–90 % of the period.

## Fair to the partner (frozen terms)
When a partner has reached the target, or his period is over, his terms (scheme, target, deadline) are **frozen**. Later changes by the builder — the scheme, his target or deadline, or the quota in Project Control — apply only to the other partners. Freezing happens before every change, on every read, on payout and in the hourly sweep.

## Screens
- **CRM → Bonus** (builder): the target bonus card per project (three reward chips; every partner with target and deadline you can edit, progress bar with a time marker, earned / paid / payable, Pay with UTR) and the scheme editor. The volume bonus stays below it.
- **CRM → Bonus** (broker): one progress card per project. It shows the target and deadline, units done, pace (ahead / on track / behind), days left, what the target pays, the early-bird date, the per-unit extra, and once earned the breakdown, paid and due amounts.

## API (mounted at `/api/crm`)
- `GET /target-bonus` — builder: own projects, every partner · broker: own row on projects with the scheme on · admins: all · others 403
- `PUT /projects/:id/target-bonus` — scheme (`crm:bonus_manage`)
- `PUT /projects/:id/target-bonus/partners/:mandateId` — `{ target, deadline, note? }` (`crm:bonus_manage`; 409 `TARGET_LOCKED` when frozen)
- `POST /projects/:id/target-bonus/pay` — `{ mandateId, amount, reference }` (`crm:payout`; amount ≤ payable, UTR required)

## Data
- `BuilderProject.targetBonus`
- `SalesAssociateMandate.targetBy` (partner deadline) and `.targetLock` (frozen terms)
- collection `targetBonusPayouts` (with id and a hit / over / early breakdown)

No new permissions. GENZ never holds or moves this money; the builder pays and records the UTR.

## Files
- Rules: `src/shared/targetBonus.ts`
- Server: `server/targetbonus.ts`, with a hook in `server/pcontrol.ts`
- Screen: `src/components/TargetBonusPanel.tsx` (shown in `CrmView` → Bonus)
- Tests: `tests/v38-target-bonus.test.ts` (rules, and the full approve → collect → frozen → payout flow)
- Demo: `server/demoBulk.ts` puts the scheme on most demo projects, with some partners already done and the rest in progress.
