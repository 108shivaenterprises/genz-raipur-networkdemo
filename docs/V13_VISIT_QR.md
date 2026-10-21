# v13 — Visit QR (kaun banata hai, kaun scan karta hai)

Customer ki site-visit ka **sabut**: partner pass banata hai → customer dikhata hai → **sirf builder ki taraf** scan karti hai.

## Rules matrix
| Role | Pass bana sakta? | Scan kar sakta? | Note |
|---|---|---|---|
| Channel partner (broker) | ✔ apne leads ke liye | ✘ | apni visit khud verify nahi kar sakta |
| Partner ka staff | ✔ sirf unhe allot hue leads | ✘ | builder bhi unhe scan right nahi de sakta |
| Builder (owner) | ✔ sirf **builder-desk** leads ke liye | ✔ apne projects | partner ke lead ka pass nahi banata (maker ≠ checker) |
| Builder ka site staff | ✘ (desk leads: haan, agar allotted) | ✔ jab builder ne "Can scan visit QR" ON kiya, apne projects, chhutti par nahi | |
| Customer | ✘ | ✘ | sirf pass + photo ID dikhata hai, login nahi |
| Admin | ✘ | ✘ | audit dekh sakta hai (neutral platform) |

## Pass
- Single-use, 10-char code (0/O/1/I nahi), QR payload `GENZV:<code>`, ek lead par ek ACTIVE pass (naya purane ko SUPERSEDED karta hai).
- Window: slot se 2 ghante pehle → 10 ghante baad. Slot ≤ 30 din aage. Party 1–10. 60 pass/din/user.
- Issue ke liye: active mandate, lead LOST/BOOKED/BOOKING_REQUESTED/REJECTED nahi, project ARCHIVED nahi.
- Customer link: `/v/<code>` (login nahi; sirf pehla naam + phone ke last 4 + slot; no-store, noindex).

## Scan (2 step)
1. `GET /api/visits/scan/:code` — preview (naam, phone last-4, project, slot, kisne refer kiya, warnings). Kuch badalta nahi.
2. `POST /api/visits/scan/:code/confirm` — `idChecked:true` zaroori. Pass USED, lead par `visitProof`, stage → SITE_VISITED, partner ko 3 points, audit (VISIT_PASS_SCANNED).
- Galat / dusre builder ka code ek jaisa 404 dikhta hai; 10 galat scan → 10 min lock.

## Project rule: QR_REQUIRED
Project Control → Rules → "Site-visit proof". ON ke baad naye leads manual SITE_VISITED / NEGOTIATION / booking-request tak tabhi jaate hain jab scan ho chuka ho. Purane leads par asar nahi (`visitProofSince`).

## Camera
- Live camera: https ya localhost chahiye (browser rule).
- Plain `http://LAN-IP` par: "QR ki photo lo" (phone camera) + code type — dono chalte hain.
- Decode: native `BarcodeDetector`, warna `jsqr` (lazy-loaded).
- Purane property-visit modal me bhi ab camera scan hai (customer ka QR → check-in).

## API
`/api/visits`: `GET /me`, `POST /passes`, `GET /passes?leadId=`, `POST /passes/:id/cancel`, `GET /board`, `GET /scan/:code`, `POST /scan/:code/confirm`. Public: `GET /v/:code`.
Tests: `tests/v13-visits.test.ts` (13).
