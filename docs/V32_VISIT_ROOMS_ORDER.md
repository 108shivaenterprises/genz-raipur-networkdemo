# v32 — Visit QR for broker-to-broker, Client Rooms tab, priority-ordered sub-tabs

## 1. Visit QR tab (broker)
- Pehle sirf builder-project pass (broker banata hai, builder scan karta hai). Ab usi tab mein ek naya section **"Broker-to-broker visits"**: Deal Room ki visits ki list (baaki pehle, verified baad mein) aur har baaki visit par **"QR pass / Scan"** button — wahi QR pass + check-in scanner / OTP jo Deal Room mein tha.
- Server rules nahi badle (`/api/site-visits`, `verify-otp`, `checkin-qr`). Builder-project maker–checker rule jaisa tha waisa hai.
- Subtitle broker ke liye dono flows batata hai.

## 2. Client Rooms — ab apna tab
- Naya top-level tab **Client Rooms** (Today group, "Today & Clients" ke baad). Badge = naye client messages + visit requests + code maangne wale client.
- Broker home par naya tile **"client room ka code maang raha hai"**; tab khulte hi us room ko auto-open karta hai taaki code turant bata sake. List mein "asking for code" pill.
- Server: room summary mein `codeAsk`, home counts mein `roomCodes`; push notification ab `/?tab=clientroom` kholti hai. Deal Desk ka "Client rooms" sub-tab bhi rakha hai (purane links).

## 3. Sub-tabs priority order
- Deal Desk: Offers & token → Client rooms → My listings → Buyer protection → Deal timeline → Cost sheet
- CRM: Pipeline → Call list → Bookings → Money → Brokerage → Inventory → Bonus → Reports
- Today & Clients: Today → Clients → My listings & trust → Map → Rate card → Points
- Tie-ups & Tiers: Tie-ups → My network → Register & ID → Builder channel → City tiers
- Today group: Dashboard → Today & Clients → Client Rooms → Visit QR

Tests: `v31-client-room.test.ts` mein codeAsk / roomCodes ke assertions.
