# v31 — Client Room · connector % share · role homes · broker tab groups

## 1. Client Room (`/api/client-rooms`, public page `/r/:token`)
A broker's private room for **his own client** (buyer / renter / tenant). Separate from deal-room chats.
- **Open:** Deal Desk → Client rooms → New room (name, mobile, kind, consent tick). The link is shown once (WhatsApp / copy). "New link" later kills the old link and the client's session.
- **Client side (no app, no signup):** opens link → types his mobile (must match the broker's entry) → 6-digit code → in. Code goes by SMS when `SMS_WEBHOOK_URL` is set; otherwise it appears on the **broker's** room screen and the broker reads it out. Wrong number gets no code; 5 wrong codes / 8 number tries per hour are blocked.
- **Client sees:** the properties the broker chose — title, locality + city, type, price, areas, tags, first photo, description with phone numbers stripped, broker's note. **Never** exact address, owner name / number, net price, deal rooms. Sold/rented ones show "no longer available". He can 👍/👎, ask for a visit slot, and chat.
- **Chat:** only the client and the introducing broker. Listing broker, co-brokers, team and GENZ staff get 404/403. Phone numbers cannot be typed (either side, hi+en message). 1000 chars / 500 messages / 30 properties / 100 open rooms.
- **Visit request:** the broker books the real visit from Properties → Schedule Visit with the client's mobile (so a verified visit also creates the v29 buyer bond).
- **DPDP:** mobile stored as HMAC + last 4 only. Closed room's chat erased after 90 days; links expire after 60 days. Privacy page updated.
- **Home tiles:** "New messages from your clients", "Clients asking to visit".
- Permission `clientroom:use` (BROKER) — Hindi line in `permHi.ts`.

## 2. Connector % of the broker's commission
- Connector proposes a % on a referral; the working broker (or sponsor) accepts, declines or **counters**; either side can counter until agreed. Cap set by superadmin (Rewards & programme → "Highest connector share", default 25%, 1–50).
- After CLOSED_WON the broker enters **his commission**; the amount = commission × % (rounded). He marks "paid" (UPI ref optional); the connector confirms "received" or says "not received" (note required) → shows in GENZ's **Share not received** queue.
- **Paid by the broker from his own commission, outside GENZ.** GENZ only caps and records (audit: `CONNECTOR_SHARE_*`). It is separate from GENZ's own reward ledger. Wording says "referral fee", not brokerage — please have the CA / lawyer confirm for RERA.
- Connector never learns who the broker is (history uses only CONNECTOR / WORKER).
- Broker home tiles: "A connector proposed a % share", "Connector share to work out / pay".
- API: `POST /referrals/:id/share`, `/share/respond`, `/share/deal`, `/share/settle`.

## 3. Role homes (`GET /api/home/insights`)
Owner: per-listing views / enquiries / visits / offers + "Mark sold" shortcut · Buyer: my visits + Cost sheet & EMI · Legal: case counts + membership expiry warning · Builder: this week's leads / visits / bookings + most active broker · Contractor: jobs & requests · Connector: stepper on every referral + numbers · Admin / Superadmin: "Today on GENZ" (ID reviews, KYC, listings, disputes, UTR, consents, shares) · Telecaller: "Call next" + call list.

## 4. Broker tabs in groups
23 tabs → Today · Property & Buyers · Deals · Sales & Team · Network & Growth (+ Other). Desktop: group pills + that group's tabs; phone: "More" sheet grouped. Every tab still reachable.

## 5. Wording
"GENZ never holds money" → "GENZ never holds the parties' deal money" (Modals, BrokerSafety, Network, Commission payments, Contractor). GENZ's own fees are in Plans & Fees.

## Checks
- New tests: `v31-connector-share` (7), `v31-client-room` (9), `v31-home-insights` (6). Full suite: **799 passed / 2 skipped**. `tsc`, `vite build` clean.
- Browser journey (`j31`): room create → client gate → wrong/right mobile → code → chat/like/phone-block → other broker sees nothing; nav groups (desktop + phone + Hindi); connector↔broker share to ₹25,000; every role home.

## Limits (honest)
- Without an SMS gateway the OTP is read out by the broker, so it protects against a forwarded link but not against a broker acting as the client.
- Client Room has no push to the client (no app) — the broker sends the link / nudges on WhatsApp.
- The % share is a private agreement; GENZ cannot force payment (only records "not received").

## v31.1 — tabs inside each group, by priority
Group ke andar tabs ab `GROUP_DEFS.ids` ke order mein dikhte hain (pehle global order tha, isliye Share Kit pehle aa jata tha). Group pill click pehle tab par land karta hai.
- Property & Buyers: Property Inventory → Buyer Needs → Match Center → Share Kit → Property Papers → Protected Docs → Land Records
- Deals: Deal Rooms → Deal Desk → Legal Help → Due Diligence → Disputes → Audit Trail
- Sales & Team: CRM → My Projects → Project Control → Connector Desk → Construction Leads → My Team
- Network & Growth: Tie-ups → Community → Grow Network → Plans → Launch Desk → City Launch
- Today: Dashboard → Today & Clients → Visit QR
