# Feature status (v11)
| Feature | Status | Kahan | Test |
|---|---|---|---|
| F1 Daily digest | Done | Today & Clients → Today | tests/v11-daily |
| F2 Listing expiry + Report | Done | My listings / Report button | tests/v11-daily |
| F3 Client pipeline | Done | Clients | tests/v11-daily |
| F6 Map (Leaflet/OSM) | Done | Map | manual |
| F7 Chapters | Done | Community | tests/v11-daily |
| F10 Lead score | Done | Clients | tests/v11-daily |
| F13 Points (non-cash) | Done | Points | tests/v11-daily |
| F14 Academy | Done (video ids khaali) | Community → Academy | tests/v11-daily |
| F17 Rate card | Done | Rate card | tests/v11-daily |
| F18 IMAP import | Replaced by paste-text parser | Clients → Paste | tests/v11-daily |
| F19 Loan desk | Done | Community → Home-loan | tests/v11-daily |
| View-only docs | Done (images only) | Protected Docs | tests/v11-daily |
| Spam hardening | Done | waitlist/chat/caps | tests/v11-daily |
| Web push, admin 2FA, connector auto-pause | Not done (approval needed) | — | — |
| Builder Project Control (apply/shortlist/approve/pause/revoke/terms, intake, lead verification, notices, files) | Done (v12) | Project Control | tests/v12-control |
| Channel-partner project-wise view + client shortlist | Done (v12) | My Projects | tests/v12-control |
| Staff lead control (phone policy, routing, pool/claim, hand-over, accountability, reveal log) | Done (v12) | My Team → Lead control | tests/v12-control |
Details: docs/V11_FEATURES.md, docs/V12_CONTROL.md


## v25 — KYC vault + photo se bharna (OCR)
- PAN, poora Aadhaar aur address (member ki sahmati se) encrypted vault me; sirf superadmin karan + password ke saath khol sakta hai; member ko dikhta hai. Superadmin ke paas kill-switch.
- Card ki photo se PAN / Aadhaar / address phone par hi padhna (Tesseract.js, self-hosted, English). Sirf suggestion — member badal ke confirm karta hai. Photo upload nahi hoti.

## v26 — Launch batch
- WhatsApp paste → draft → owner consent (link / signed form) → publish; ek property = ek consented broker (doosra co-broke kare).
- Bypass protection 30/60/90/180/apne din, superadmin ki maximum limit ke andar.
- Phone alerts (Web Push, bina package), 9 AM summary; buyer need broadcast + "mere paas hai".
- Superadmin/admin 2FA (authenticator), KYC vault ke liye bhi.
- Broker home + phone par neeche 5 button; Powered-by-GENZ footer; "deal sahi hui" reputation; public city report; pilot check.
Details: docs/V26_LAUNCH_BATCH.md


## v27 — brokerage at listing time + owner signature
Draft me net / commission % / fixed fee; owner ke link page par typed initials ya drawn sign; haan ke baad listing live hote hi mandate ACTIVE; purani listing par bhi owner sign + mandate (`docs/V27_BROKERAGE_SIGN.md`).

## v28 — audit fixes
WhatsApp paste ab buyer requirement bhi samajhta hai (Buyer Needs me save); brokerage terms tick se (password nahi); normal form se listing ke baad owner ko WhatsApp approval; role-wise browser audit ke fixes — logout bugs, CGNAT-safe rate limit, builder→broker requests, legal labels, due-diligence list, readable validation messages (`docs/V28_AUDIT_FIXES.md`).

## v29 — buyer bond (buyer bypass protection)
Verified visit (OTP/QR) ya offer par khareedar us property par us broker se protection days tak jud jata hai; dusra broker usi khareedar ke liye visit/offer nahi kar sakta (holder ka naam nahi dikhta) — co-broke request bhej sakta hai; property sold mark hui to holder ko turant alert; Deal Desk → Buyer protection tab, home tiles, staff ke liye Disputes me cancel-on-proof (`docs/V29_BUYER_BOND.md`).

## v30 — field helpers
Paste se broker ka number public description me nahi jata; bolkar buyer need (browser speech); poster par "price as on / valid till"; Deal Desk → Cost sheet & EMI (rate khud daalna, koi state-rate hard-coded nahi); public page par asli-count demand ticker (≥3) (`docs/V30_FIELD_HELPERS.md`).

## v31 — Client Room, connector % share, role homes, broker nav groups
Client Room: broker apne client ke liye private room (link + mobile OTP, no signup); property sirf marketing facts ke saath, chat sirf client + introducing broker; chat me phone number block (`docs/V31_CLIENT_ROOM_SHARE_HOMES.md`). Connector % : connector broker ke commission me se % maang sakta hai (admin cap, counter/accept, deal ke baad amount, paid/received — GENZ sirf record). Har role ke home par naye cards (owner report, buyer visits + cost sheet, legal cases + membership, builder week, contractor jobs, connector stepper, admin "today", telecaller "call next"). Broker ke 23 tab 5 groups me. "GENZ paisa nahi rakhta" wording ab "parties ka deal ka paisa" tak seemit.
