# V120 — Market research + bot ka "deal brief"

## 1. Research (Indian broker apps / CRM / ERP) — role-wise
| Role | Market me | GENZ me | Gap |
|---|---|---|---|
| Broker | Broker Network, PropertyPistol Syndicate, Propliv, Magnet: inventory, lead, follow-up alert, CP meet; Square Connect: payout tracking | Listings, Magic Match, CRM, SLA chip, Copilot, deal room, hisaab | Lead ka hot/warm score (QR lead par) nahi tha → **ab hai**; portal leads (99acres / MagicBricks / Housing) seedhe nahi aate |
| Builder / CP | Sell.Do, Daebuild, Tranquil: routing, geotag visit, CP portal, cost sheet, demand letter | Block grid, cost sheet, CP chat, RERA tier gate | Post-sales (demand letter, payment schedule) nahi |
| Client | WhatsApp bot: 30 sec me jawab, slot se visit book, reminder | QR chat + Sahayak + client room | Bot sirf web chat par (aapka faisla: abhi yahi); visit reminder / no-show follow-up nahi |
| Shopkeeper | Kisi ke paas dhang ka nahi | Shop QR + payout | GENZ aage |
| Team / HR | CRM me nahi hota | Attendance, leave, targets | GENZ aage |

Kaam ke numbers: 1 ghante me jawab = 7x zyada pahunch; zyadatar lead 4–7ve touch par banti hai, log 2 par ruk jaate hain; ~24% lead ko call hi nahi hoti; ek case study me 55% visit bot se book hue.
Sources: BeyondWalls (broker apps), Sell.Do (lead leakage; WhatsApp playbook), Chakra (WhatsApp for brokers), Codingclave CRM comparison (khud vendor hai), Square Connect (2016), AgentKart (paid press release).

## 2. Aapke faisle (9–10 Nov)
- Bot: **rules + smart brief** (koi AI model nahi, chat bahar nahi jaati).
- Client se baat: **web chat hi**.
- Number rule: **wahi** (zaroorat pakki + matching ghar ke baad).
- Signup: **invite + khula signup**; bina RERA wala broker aa sakta hai par "non-RERA" badge, RERA project ke liye RERA zaroori. → **abhi bana nahi**, spam rokne ka design pehle pakka karna hai (neeche).

## 3. Kya bana (V120)
- **Bot ka ek sawal:** ghar dikhane ke baad bot ek baar puchhta hai "कब तक लेना है?" (इसी महीने / 1–3 महीने / अभी देख रहे हैं). "Koi ghar nahi" wale jawab ke baad nahi puchhta. "इसी महीने" par broker ko turant alert.
- **Deal brief (broker ke lead card par):** 🔥 Hot / Warm / Cold + score, **agla kadam** ek line me, aur har point ki wajah (kholne par). Points: zaroorat pakki, timeline, visit maangi/tay, photo kholi, broker ko bulaya, 24 ghante me likha, hafte se chup.
- **Agla kadam ke niyam:** visit request → pehle uska jawab; bulaya hai → chat; ghar nahi par network me hain → network se pucho; kahin nahi → Radar; isi mahine + number khula → aaj call.
- **GENZ Radar:** broker ke profile ke **apne ilake** ki zaroorat sabse pehle, "📍 आपका इलाका" tag ke saath.
- Code: `src/shared/leadBrief.ts`, `server/sahayak.ts`, `server/shopPartners.ts` (`briefFor`), `ShopPartners.tsx`, `GenzRadar.tsx`. Tests: `tests/v120-brief.test.ts`, `v119-room-at-confirm` me timeline step.

## 4. Khula signup: spam rokne ki salah (banane se pehle)
1. **Mobile OTP** signup par (asli SMS provider chahiye; abhi live par SMS juda hai ya nahi, ye check karna hai).
2. **PAN + Aadhaar ke aakhri 4** zaroori, ek PAN = ek account (ye rule pehle se hai).
3. Naya khud-aaya broker **"Naya / Non-RERA" badge** ke saath, aur GENZ ID check hone tak **seemit**: din me kam listing/requirement, dusre broker ke client ka number nahi, RERA project band.
4. **Listing GENZ check ke baad live** jab tak ID verify na ho (aapne photo "seedha live" chuna tha; naye anjaan account par ye dono saath me risk hai).
5. Ek phone / ek device / ek IP se signup ki ginti par limit; 3 report par account apne aap ruk jaye.

## 5. Abhi nahi bana
Visit reminder + no-show follow-up, 4–7 touch follow-up sequence, nayi requirement par ilake ke brokers ko auto-alert, portal lead import, khula signup.
