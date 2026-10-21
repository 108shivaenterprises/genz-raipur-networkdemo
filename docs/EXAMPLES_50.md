# 50 worked examples — every role, every main function

Run with `DEMO_MODE=true SEED_DEMO_DATA=true` to see most of these pre-loaded (demo password `Genz@2026`). Demo connectors: `usr-con-001@connector.example` … `usr-con-012@…`; the demo data also contains **exactly 50 connector referrals** (`CR-2026-0001…0050`) in every status.

Legend: **Who** = role · **Where** = tab · **Result** = what the system does.

## A. GENZ Connector — local shopkeepers & community members (1–14)
| # | Who | Where | Example | Result |
|---|---|---|---|---|
| 1 | Paan shop owner | My Referrals → Refer someone | Customer asks about a flat; owner enters name + mobile, ticks "customer agreed" | Referral `SUBMITTED`; reward shown (default ₹500) |
| 2 | Tea-stall owner | Refer someone | "Wants to sell a plot" | Type `SELL_PROPERTY`; assigned later to a broker |
| 3 | Vegetable vendor | Refer someone | Regular customer needs a house on rent | Type `RENT_TAKE` |
| 4 | Kirana shopkeeper | Refer someone | Neighbour wants a home renovation | Type `CONSTRUCTION` → can only go to a contractor |
| 5 | Salon owner | Refer someone | Same mobile number referred twice for the same need within 60 days | 409 "already registered" — second connector gets nothing |
| 6 | Auto-rickshaw driver | Refer someone | Tries to refer his own number | 400 blocked |
| 7 | Community member | Refer someone | Leaves consent unticked | 400 "person must agree to be contacted" |
| 8 | Medical-store owner | My Referrals | Opens a won referral | Sees `Closed won · ₹1,000 · Approved`, no broker name, no internal notes |
| 9 | RWA volunteer | My shop & UPI | Adds payout UPI | Saved on profile; used by admin for payout |
| 10 | Tailor | Login | Has no e-mail | Logs in with 10-digit mobile + password |
| 11 | Any connector | Direct URL `/api/properties` or `/api/deals` | Tries to peek | 403 — connectors see only their own referrals |
| 12 | Any connector | Another connector's referral id | Guesses an id | 404 |
| 13 | Any connector | Hindi toggle | Switches UI to हिन्दी | Labels switch; reward table stays visible |
| 14 | New shopkeeper | Login page → "Have an invitation code? Join here" | Registers with the code sent on WhatsApp | Account `PENDING` until approved |

## B. Superadmin / Admin — control (15–26)
| # | Who | Where | Example | Result |
|---|---|---|---|---|
| 15 | Superadmin | Control Center | Opens the page | Health cards: users, KYC pending, disputes, deals, referrals, payouts due, audit chain |
| 16 | Superadmin | Control Center → Platform settings | Turns **Maintenance mode** on | Everyone except admins gets 503; audit event written |
| 17 | Superadmin | Control Center | Sets protection period to 1 day | 400 — allowed 7–180 |
| 18 | Superadmin | Control Center → Function directory | Searches "payout" | Sees `connector:payout` and which roles have it; "Open" jumps to Connector Desk |
| 19 | Superadmin | Control Center → Waiting for approval | Clicks Review | Jumps to Invite & KYC |
| 20 | Admin | Invite & KYC | Invites a paan-shop owner by **mobile only** | Code `GZ-GEN-…` + WhatsApp link; no e-mail needed |
| 21 | Admin | Invite & KYC | Tries to invite another ADMIN | 403 — only Superadmin can |
| 22 | Admin | Invite & KYC → Pending | Approves the shopkeeper after a call | Status `VERIFIED`, can log in |
| 23 | Admin | Connector Desk → Referrals | Assigns a property lead to a broker | OK; assigning it to a contractor → 400 |
| 24 | Admin | Connector Desk | Moves referral `SUBMITTED → CLOSED_WON` directly | 409 — must follow the flow |
| 25 | Admin | Connector Desk | Marks a repeated lead `DUPLICATE` | No reward possible |
| 26 | Superadmin | Connector Desk → Rewards & programme | Changes reward for `CONSTRUCTION` to ₹1,500 | Applies to future approvals; audit logged |

## C. Reward & payout (27–31)
| # | Who | Where | Example | Result |
|---|---|---|---|---|
| 27 | Admin | Connector Desk | Approves reward on an `IN_PROGRESS` lead | 409 — only after `CLOSED_WON` |
| 28 | Admin | Connector Desk | Approves reward on a won lead | `APPROVED`, amount from settings (or custom ≤ cap) |
| 29 | Admin | Connector Desk | Marks paid with reference `x` | 400 — needs a real UTR (≥ 4 chars) |
| 30 | Admin | Connector Desk | Marks paid with UTR `UPI123456` | `PAID`; connector sees "Paid" |
| 31 | Broker (assigned) | Connector Desk | Opens the referral | Sees customer contact; **no** reward fields |

## D. Brokers (32–37)
| # | Who | Where | Example | Result |
|---|---|---|---|---|
| 32 | Broker | Property Inventory | Lists a flat with state/city/PIN and tags | Saved; matches use city-aware logic |
| 33 | Broker | Buyer Needs | Adds a requirement | Match Center scores listings |
| 34 | Broker | Deal Rooms | Opens a deal | Sees split, fee, agreements |
| 35 | Broker | Collab Proposals | Proposes a co-broke split | Counter-party signs with password |
| 36 | Broker | Deal Rooms → task | Reassigns a task | Dropdown lists **real verified members**, not fixed names |
| 37 | Broker | Audit Trail | Opens | Sees own events only; no `CONNECTOR_REWARD*` events |

## E. Owners, buyers, builders, contractors, legal (38–46)
| # | Who | Where | Example | Result |
|---|---|---|---|---|
| 38 | Owner | My Property Deals | Opens a deal | Commission, split, agreement hash hidden |
| 39 | Owner | My Properties | Lists | Sees only own properties |
| 40 | Owner | Property → Mandate | Picks one of 3 brokerage types — **Net amount** (fixes net ₹80 L, surplus is broker's), **Commission %** (2% of final price) or **Fixed fee** (₹1.5 L flat) — and signs with password | `PENDING_BROKER`; listing broker co-signs → `ACTIVE`; screen shows broker's pay and owner's receipt at asking price |
| 41 | Buyer/Tenant | Property Inventory | Browses verified listings | No owner phone/exact address until a deal |
| 42 | Builder | Builder Launchpad | Creates a project; sets associate mandate | Visible to mandated associates |
| 43 | Builder | Associates CRM | Approves a booking | Payment schedule + brokerage with 5% TDS; counts toward the volume bonus once the collection % is met |
| 44 | Contractor | Construction Leads | Takes a lead | Status moves; commission tracked |
| 45 | Contractor | Connector Desk | Gets a `CONSTRUCTION` referral | Updates status; no reward data |
| 46 | Legal counsel | Due Diligence | Signs off Gate 4 | Only Legal Counsel / Superadmin can |

## F. Security, privacy & compliance (47–50)
| # | Who | Where | Example | Result |
|---|---|---|---|---|
| 47 | Any user | First login with temporary password | Forced "Set a new password" | New password + repeat; rejected if weak or same as temp |
| 48 | Any user | My data | Requests export / erasure | Queue for Grievance Officer; export includes own data only |
| 49 | Superadmin | Audit Trail | Verifies chain | SHA-256 chain "Intact"; tampering shows "BROKEN" |
| 50 | Superadmin | View as… | Opens a connector's view read-only for 30 min | Audited; cannot change data |

## G. Team & partner network (bonus examples)
| # | Who | Where | Example | Result |
|---|---|---|---|---|
| 51 | Broker | My Team | Adds Pooja (telecaller, mobile 9000030001), ticks consent | One-time password shown; Pooja must change it at first login |
| 52 | Broker | CRM lead drawer | Allots a lead to Pooja | Pooja sees only that lead; bookings/brokerage/bonus hidden |
| 53 | Broker | Deal Rooms | Ticks Rakesh under the deal title | Rakesh gets the redacted view (no commission, no brokers-only chat) |
| 54 | Broker | My referral partners | Invites a kirana owner by mobile | Admin approves; her referrals go to this broker |
| 55 | Broker | Connector Desk | Marks partner referral CLOSED_WON → approves → pays with UTR | Reward recorded; other brokers cannot see or pay it |
| 56 | Builder | CRM → inventory | Generates Tower A (5 floors × 4) and sets slabs 1–3 → 2.5 %, 4–8 → 3.5 % + Bangkok trip | Grid appears in four colours; slabs apply from the next approval |
| 57 | Broker | CRM → inventory | Taps A-302, picks customer, token ₹25,000 + receipt no. | Unit turns yellow for 2 h; other brokers see "On hold" only |
| 58 | Broker | My Team → Activity | Opens last 7 days | Calls, site visits, overdue follow-ups per member; check-in map links and selfies |
| 59 | Broker | Share Kit | Creates a link for "Dr. Verma" in Hindi, downloads WhatsApp Status flyer | 🔥 shows after 2 views or 30 s on Plans & pricing |
| 60 | Broker | Land Records | Enters an agricultural khasra with no diversion order | Verdict DANGER with the exact reason |

