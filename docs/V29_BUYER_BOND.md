# v29 — Buyer bond (buyer bypass protection)

Owner bond (v26) protects the broker who brought the **property**. v29 adds the same protection for the broker who brought the **buyer**.

## Rule
- A **buyer bond** is created when:
  - a site visit with the buyer's mobile is **verified** (OTP / QR) — a visit that is only booked is not enough; or
  - an **offer** is sent with the buyer's consent.
- It is per **property + buyer mobile** and lasts the GENZ protection days (the superadmin's default, `daysFor()`).
- While it lasts, **no other GENZ broker** can book a site visit or make an offer for the same buyer on the same property. The API returns `409 BUYER_BONDED` (hi + en message, `protectedUntil`, `bondRef`).
  - The stopped broker is **never told who** holds the buyer.
  - He can send a **co-broke request**. His name, company and mobile then go to the holder, who can call or WhatsApp him.
- **Allowed through:**
  - the holder himself;
  - a broker who works on this property in a deal room **with the holder as the buyer side** — the deal room the bond was made in, or one where the holder is the introducing broker. In practice this is the listing broker of the holder's own deal.
  - Merely sharing some other deal room with the holder is **not** enough. A broker's own room with the listing broker must not let him take the listing broker's own buyer.
- If the property is marked **sold / rented** while a bond is active:
  - every holder who was not on the closing side is alerted at once (phone alert + red notice);
  - the notice tells him to raise a dispute in the deal room if his buyer bought it.
- The holder can **let a bond go** ("buyer not interested").
- **GENZ staff** (`property:moderate`) see bonds per property in **Disputes**. They can **cancel a bond on proof**, which needs a reason of at least 10 characters.
- **Privacy (DPDP):**
  - the buyer's mobile is stored only as an HMAC plus its last 4 digits;
  - phone alerts never carry the buyer's name or digits;
  - other brokers never see the bond;
  - the privacy page text was updated.
- The first bond stays. A later visit or offer by the same broker is only noted on it; another broker never gets a second bond for the same buyer.

## Where in the app
- **Schedule visit:** a green hint ("add the buyer's mobile → protected to you"). If stopped, an amber notice appears with an **Ask that broker to co-broke** button.
- **Deal Desk → Make an offer:** the same notice appears when stopped.
- **Deal Desk → Buyer protection** (new tab, also opened with `?tab=desk&sub=bonds`) shows:
  - your bonds, with days left;
  - co-broke requests, with call and WhatsApp buttons;
  - sold alerts;
  - ended bonds;
  - a "Let go" button.
- **Broker home** has three tiles:
  - Buyers protected to you;
  - Brokers asking to co-broke your buyer;
  - Your buyer's property was marked sold.
- **Disputes** (GENZ staff) has a list of bonds with "Cancel on proof…".

## API
| | |
|---|---|
| `GET /api/buyer-bonds/mine` | my bonds + asks (`offer:make` / `sitevisit:create`) |
| `POST /api/buyer-bonds/:id/release` | holder lets it go |
| `POST /api/buyer-bonds/:id/ask` `{note}` | stopped broker asks the holder to co-broke (once; `ALREADY_ASKED`, `BOND_ENDED`) |
| `GET /api/buyer-bonds/admin?propertyId=` | GENZ staff |
| `POST /api/buyer-bonds/admin/:id/void` `{note ≥ 10}` | GENZ staff |
| `GET /api/home/broker` | `counts.buyerBonds`, `counts.bondAsks` (last 14 days), `counts.bondAlerts` |

## Files
- `server/buyerbond.ts` (new)
- `server/db.ts` (`BuyerBond`, `buyerBonds`)
- `server.ts` (mount, visit check, bond on verified visit)
- `server/offers.ts` (check + bond on offer)
- `server/listings.ts` (sold alert)
- `server/reputation.ts` (home counts)
- `src/components/BuyerBond.tsx` (new)
- `DealDesk.tsx`, `Modals.tsx` (ScheduleVisitModal), `BrokerHome.tsx`, `App.tsx`, `LegalPages.tsx`, `src/lib/api.ts`

## Limits (honest)
- A visit booked **without** the buyer's mobile gives no protection, and is not checked.
- The offer check works on the mobile the broker types. A broker who types a wrong number gets past it, but then the offer is not for that buyer. The sold alert and the dispute route are the backstop.
- This is a record and an alert. GENZ never holds or moves money; disputes follow the existing deal-room dispute flow.

## Checks
- `tests/v29-buyer-bond.test.ts` — 8 tests:
  - a booked visit makes no bond, a verified visit does;
  - another broker is stopped on visit and offer, and is not told who holds the buyer;
  - a different buyer is fine; an offer makes a bond;
  - the holder and the listing broker in his deal room can go on;
  - the co-broke ask works (once);
  - the sold alert works;
  - admin void, which needs a reason;
  - release.
- Full suite: **768 passed / 2 skipped**. `tsc` and `vite build` are clean.
- Browser journey (desktop + 390 px phone + Hindi) — 19/19 checks passed:
  - stopped on the visit;
  - ask sent;
  - stopped on the offer;
  - home tiles → Buyer protection tab with the ask;
  - admin list.
- Tab sweep for broker, admin, superadmin, owner and builder: no API errors and no page errors.
