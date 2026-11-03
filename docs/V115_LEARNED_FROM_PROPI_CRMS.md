# V115 — Propi, Clixence aur broker CRMs (Sell.Do waghera) se seekh

## 1. Kya dekha
| Site | Kya hai | Kaam ki baat |
|---|---|---|
| **propi.in** (Mumbai) | Broker network: "You have the client. Someone has the flat." | Live "river" feed; **listing par "5 agents ke paas matching requirement"**; **area-wise demand vs supply** ("demand zyada → yahan list karo, supply zyada → requirement daalo"); buildings directory (rent/sale range, kitne agent); agent level P1–P4 (RERA se); builder ko area ke active CP + demand digest; WhatsApp forward se post; 5-tab bottom nav; "connects" wala plan (₹1,000/maah, 100 number) |
| **clixence.com** (Jaipur) | Consumer property portal (CRM nahi) | Map view, category tiles, most viewed / favourite, broker directory, price alerts, private site-visit booking, expo |
| **Sell.Do** (broker / CP module) | Real-estate CRM | Lead dedupe, follow-up reminders, match % cards, brokerage slab + GST + sub-broker share, payout ledger, broker microsite, GPS check-in, visit calendar, SLA / aging reports |
| Broker apps list (BeyondWalls, Broker Network, Magnet, PropertyPistol Syndicate, Propliv) | CP apps | Launch alerts, payouts jaldi, lead history, follow-up reminders |

## 2. GENZ me pehle se tha (code dekh kar)
Feed (river), map, Magic Match + score, network needs ("Network has N homes"), need broadcast, trust/level badge, Sahayak bot, Copilot, public page (microsite), shop QR, visit OTP/QR + GPS, brokerage at price, hisaab/payout, CP inventory + block, cost sheet, deal room, token flow.

## 3. Jo nahi tha — ab bana (V115)
1. **Listing par "kitne broker ke paas iska khareedar"** (Propi ka sabse bada idea, ulta raasta). My listings ke har tile par: "🤝 3 broker ke paas iska client hai (4 zaroorat)". Kholo to har zaroorat: type · ilaka · budget · match % · broker ka naam. Client ka naam / number kabhi nahi. **"Inko batao"** ek tap, din me ek baar → un brokers ki bell / phone par "Aapke client ki zaroorat se milti listing" + listing ka link.
   API: `GET /api/broadcast/listing/:id`, `POST /api/broadcast/listing/:id/tell`.
2. **Demand vs supply, ilaka-wise** (Feed tab me "📊 Maang kahan hai?"). Apne shahar ke har ilake me: khuli client zaroorat (120 din) vs live listing, bar ke saath. Har line par salah: *"Yahan list karo — jaldi bikega"* / *"Yahan client ki zaroorat daalo"* / *"Barabar"*. Filter: Bikri / Kiraya-lease, Residential / Commercial. Sirf ginti, koi naam nahi.
   API: `GET /api/broadcast/demand-supply?deal=&seg=&city=`.
3. **Visit agenda** (CRM visit calendar jaisa). Broker visits ab din-wise: **Chhooti** (lal) / **Aaj** / **Kal** / **Baad me**.

Test: `tests/v115-network-demand.test.ts` (privacy, sirf listing broker, din me ek baar, filters ka jod).

## 4. Baad ke liye (abhi nahi banaya)
- **Building / society directory** (Propi): har society ka rent/sale range + kitne broker. Iske liye listing me society ka naam alag field chahiye.
- **Buyer ke liye price alert / saved search** (Clixence).
- **Builder ke liye "area ke active CP" + demand digest** (Propi for-builders). Launch desk me jodna.
- **WhatsApp forward se post** (Propi). WhatsApp Business API chahiye.
- **Lead aging / SLA report** (Sell.Do). Rescue rules (V109) ka report view.
