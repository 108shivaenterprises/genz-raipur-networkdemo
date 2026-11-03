# V114 — Har tarah ki deal ka test + client card deal ke saath chalta hai

## 1. Kya test hua (asli server, asli HTTP)
Pura suite dobara: **2093 tests, 0 skip** (4 Postgres tests jo pehle skip hote the, local Postgres par chalaye).
Naya `tests/v114-deal-types.test.ts` — 8 tarah ki deal, ek-ek step:

| # | Deal | Steps |
|---|---|---|
| D1 | Resale, ek hi broker dono taraf | client → match → visit → offer → owner counter → broker counter accept → owner token → broker "paid" confirm → sold (GENZ) |
| D2 | Resale co-broking, 2 khareedar | reject bina reason ✗ → A accept → A token → B backup #1 → bahar bechna blocked (token) → forfeit validity se pehle ✗ → extend ek baar → A peeche hata (refund) → B promote → A ka deal room dono broker se band → reopen → A LOST → B sold |
| D3 | App ke bahar hui visit | ek broker likhe → doosra confirm (maker ≠ checker) → stage "Site Visit Done" |
| D4 | Kiraya (residential, co-broking) | tenant need → match → rent offer → accept → "rented" (sold nahi) → tenancy → police verification (Aadhaar no. ✗) |
| D5 | Lease (showroom) | unverified broker decide nahi kar sakta → admin KYC → accept → token → rented → 36 mahine / 12 lock-in / 5% badhotri |
| D6 | Plot | counter decline → offer withdraw → bahar bika → 24 ghante me undo → dobara bika → resale relist |
| D7 | Builder project (CP) | lead → visit se pehle booking ✗ → site visited → booking + token → sirf builder approve → kisht receipt → brokerage UTR se (payable se zyada ✗) → doosri booking reject → payout ke baad cancel me clawback zaroori |
| D7·5 | Client card se seedha block | card → unit block (project lead apne aap) → site visited → booking approve → card DEAL |

Saath me `tests/v113-journeys.test.ts` (shop QR → deal, co-broking token, CP block) aur `tests/v113-examples.test.ts`.

## 2. Jo bug / gap mile aur theek hue
1. **Client card deal ke saath nahi chalta tha** — visit, offer, sold sab ho jaata, card "NEW" hi rehta. Ab (`advanceClient` in `server/clientlink.ts`):
   - visit book → card **SITE_VISIT**
   - offer → **NEGOTIATION** (card na ho to offer se ban jaata hai — offer me khareedar ki consent hai)
   - GENZ ke through sold / rented (jeeta hua offer) → **DEAL**, need "fulfilled"
   - CP: project lead site visited → SITE_VISIT, booking approve → DEAL
   - kabhi peeche nahi, LOST / DEAL ko nahi chhedta; sirf visit se naya card nahi banta
2. **CP block ke liye alag lead banana padta tha** — ab block sheet me "mera client" chips; card se block karne par us project ki lead apne aap (ek hi baar) ban jaati hai.

## 3. Jo nahi badla (jaan-boojh kar)
- Deal band (buyer peeche hata) → card LOST broker khud karta hai (reason ke saath).
- Bahar (OUTSIDE) bika → kisi ka card DEAL nahi hota.
- App ke bahar ki visit confirm hone par stage broker khud badalta hai.
