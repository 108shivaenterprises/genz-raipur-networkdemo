# V69 — Client Room ab "App" jaisa + KYC / kaagaz bhejna

## Problem
Client ko baar-baar WhatsApp se link kholna padta tha, broker ko kuch bhejna ho to phir WhatsApp.

## Ab kya hai
1. **Add to Home** — room page installable hai (har room ka apna manifest, naam "मेरा रूम"). Android: ek button se install. iPhone: Share → Add to Home Screen ki line dikhti hai.
2. **Phone alerts (free web push)** — "🔔 अलर्ट चालू करें" dabane par broker ka message, naya ghar, visit book hone par client ke phone par alert. Room-wise roz max 30 alerts. Link renew/room close par alerts band.
3. **Broker ko bhejna** — room ke andar: PAN, masked Aadhaar, koi aur ID, kaagaz (PDF), photo. Consent tick zaroori, file AES-sealed (vault key), photo phone par chhoti hoti hai (max 2.5 MB, room me 12 files), chat me "📎 ... भेजा" line, broker ko alert.
4. **Broker ka "Papers / काग़ज़" tab** — list, Open (count + audit), Remove. **ID copy (🪪) sirf broker khol sakta hai, office staff nahi.** Room close / expiry par sab files mit jaati hain.
5. Login: mobile + OTP ek baar, phir 60-din sliding session (badlav nahi).

## Honest limits
- iPhone: home-screen app ka cookie browser se alag hota hai → ek baar phir OTP; push ke liye iOS 16.4+ aur app home screen par honi chahiye.
- Alerts ke liye server par VAPID keys chahiye; file bhejne ke liye vault key (`KYC_VAULT_KEY`) — dono ka backup rakhein, vault key kho gayi to files nahi khulengi.
- Aadhaar sirf masked, aur hum verify nahi karte. Poora Aadhaar na lene wali baat v25 me vakil ke liye flagged hai.
- Owner ka room (install + chat + visit approval) **v70** me — owner ki pehchaan ka tareeka aapse tay karna hai.

## Files
server/clientroom.ts, server/webpush.ts, server/db.ts, src/shared/clientRoomRules.ts, src/components/ClientRooms.tsx, src/lib/api.ts, public/sw.js (`/r/` ko cache se alag), server.ts (json limit), tests/v69-room-app-docs.test.ts.
