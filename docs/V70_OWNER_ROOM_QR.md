# V70 — Owner Room, do rooms ek mobile par, QR se visit pakka, pura Aadhaar switch

## Owner room
- Broker "🏠 मालिक का रूम" se banata hai — **sirf apni listing** par jiska **owner mandate ACTIVE (dono ne sign)** ho. Bina mandate: 409 "NO_MANDATE". Ek property par ek hi owner room.
- Broker owner ka naam + mobile daalta hai (listing me poora number ho to khud bhar jata hai) aur "owner राज़ी है" tick karta hai.
- Owner usi mobile + OTP se khulta hai (v69 jaisa: installable app, alerts, 60-din session).
- Owner ko dikhta hai: **sirf sankhya** — kitne log dekh rahe, kitne interested, visit tay, visit hui. Naam/numbers kabhi nahi. (Dekh rahe = broker ke client rooms me dikhai gayi + shop-QR interest + page enquiries; interested = 👍 + QR interest + enquiries.)
- Chat broker se, kaagaz/photo bhejna (v69 wala).

## QR se visit pakka (bypass roke)
- Client room me booked visit par **"📲 मेरा QR दिखाएँ"** (buyer ka "no direct deal" wala page, tick + code ke baad QR).
- Owner room me **"📷 QR स्कैन करें"** (camera; jahan BarcodeDetector na ho wahan 6-ank ka code type karo). Scan par visit verified ho jati hai — wahi step jo on-site check-in karta hai (deal stage, buyer bond, audit).
- Buyer ne promise nahi diya to scan 409; galat code 404; sirf us property ki visit; ek visit ek baar.

## Ek mobile, do rooms
- Ek hi mobile se bechne wale + kharidne wale rooms ho sakte hain (same broker bhi). Ek room me OTP daalne se doosra room bhi usi phone par khul jata hai, aur page par "मेरे दूसरे रूम" switch dikhta hai (🏠 meri property / 🔍 meri talash). Session na ho to doosra room nahi khulta.

## Pura Aadhaar
- **Default OFF.** Server par `FULL_AADHAAR_OK=1` ho tabhi broker "पूरा आधार माँगें" dabा sakta hai (sirf broker, staff nahi), aur tabhi client ko option dikhta hai. File sealed, sirf broker khole, **7 din baad apne aap mit jati hai**. Vakil ki haan tak OFF rakhein.

## Limits / baaki
- Owner ka offer-reply aur visit-approve button abhi nahi — owner sirf numbers, chat, papers aur scan karta hai.
- QR camera scan Android Chrome me chalta hai; iPhone par code type karna padega.
- Files: server/clientroom.ts, server/db.ts, server.ts, src/shared/clientRoomRules.ts, src/components/ClientRooms.tsx, src/lib/api.ts, public/sw.js, tests/v70-*.
