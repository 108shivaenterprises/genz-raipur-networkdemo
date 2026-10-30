# v91 — QR par har tarah ki property, visit apne aap mark, GENZ logo (superadmin control)

## 1) QR form: 14 property types
- Dropdown grouped (ghar / plot / dukaan-office / farm-godown-industry...). Heading "property" (home · plot · shop · farm · godown), sirf "ghar" nahi.
- QR se bani need ka sahi type (Other/Any par ab "Residential Flat" nahi lagta).
- Number reveal ka match ab type bhi dekhta hai (plot wale ko flat nahi dikhta).

## 2) Visit: aasaan + automatic
- Shop lead card par ek-tap "visit book" (LeadVisit).
- Visit book hote hi lead NEW → CONTACTED; visit verify hote hi lead → VISIT ("Visit done"), client card → SITE_VISIT, shop ko push ("विज़िट तय हुई 📍" / "विज़िट हो गई ✔"). Ek visit ek baar (history tag `[visitId:BOOKED|DONE]`), sirf broker ki apni, locked (number abhi chhupa) leads par.

## 3) GENZ Broker Network logo
- Sirf SUPERADMIN badal sakta hai: Control Center → "GENZ Broker Network logo" (ON/OFF, 4 jagah ke tick: QR, poster/certificate, banner/post/story, public pages, upload, reset). Audit event `BRAND_LOGO_CHANGED`.
- Upload: PNG/JPEG/WebP ≤300 KB, type asli bytes se; SVG mana (script-risk). Default = built-in GZ mark.
- Server: `server/brandlogo.ts` — `GET /api/brand/logo`, `GET /api/brand/config` (public), `PUT /api/brand` (superadmin). Public pages (/s /r /q /sp /a /c /oc /report /pay /p /v) par upar logo strip (middleware). Server QR (shop QR, poster, tent, visit pass, visit ack) ke beech logo, error-correction H.
- App: `src/lib/brandQr.ts` — QR (public page, broker QR, visit pass, visits, site poster), site poster aur ShareKit banner/post/story par logo.
- UPI payment QR **plain** rakha (payment app ke scan ka risk).
- 2FA authenticator QR plain.

## Test
`tests/v91-logo-types-visit.test.ts` (7). Poora suite: 1569 pass.

## Limits
- Visit "DONE" (verify) ka hook code mein hai, par HTTP test nahi (verify sirf visit ke din + buyer ack ke baad ho sakta hai) — BOOKED test hua.
- Logo ka size/jagah screen par asli phone se dekhna baaki.
- Pitch PDF / USER_MANUAL untouched.
