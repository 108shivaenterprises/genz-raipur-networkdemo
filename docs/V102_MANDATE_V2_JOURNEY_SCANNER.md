# V102 — Mandate wording v2 (parivaar / rishtedaar / nominee), har role se poori deal ki jaanch, broker ke home scanner ka poora test

## 0. Kya poocha tha
1. Sab mandates mein likho ki client **ya uska parivaar / rishtedaar / nominee / koi firm** introduce karne wale broker(s) ko bypass nahi karega, aur bypass hua to broker commission claim kar sakta hai.
2. Visit se commission distribution tak **har step ke baad role badal kar** dekho ki sahi cheez sahi jagah record hui ya nahi — dono party ban kar.
3. Broker ke home scanner ka **har QR, har error, har record** test karo.

## 1. Wording v2 — kahan-kahan laga
| Jagah | Kya badla | Purane records |
|---|---|---|
| Buyer ka "no direct deal" tick (`visitAck`) | `ACK_VERSION='v2'`: main, parivaar ka koi sadasya, rishtedaar, nominee, ya meri/unki koi firm-company — **koi bhi** broker ko bichh mein rakhe bina na kharidega/kiraye par lega, owner/builder se seedha sauda-baat-bhugtan nahi karega; agar hua to **sauda us broker ke zariye hi hua maana jayega aur tay commission dena hoga**. Broker-to-broker visit mein **dono broker ke naam** (booker + listing broker) | Purana pending ack `v1` ke shabd hi dikhata hai (`ackTextFor`) — kisi ko chupke se naye shabdon par agree nahi karaya |
| Shop QR / chat ka promise | Wahi `ackText` (v2) | — |
| Owner consent (`/oc/<token>`) | `CONSENT_FORM_VERSION='oc-v2'`: owner ki taraf se bhi "…ya uske parivaar-rishtedaar-nominee-firm ke saath" | Accept par `formVersion` record + audit "agreed to list … (form oc-v2)". Paper-form wale consent par version stamp **nahi** ho sakta |
| Deal room anti-bypass rule 1 + Legal page (section 2) | Wahi sentence, EN + HI | — |

**Seedhi baat:** main vakil nahi hoon. Wording ek advocate se dikhwa lena (khaas kar "commission देना होगा" wala hissa). Judgments (Abdulla Ahmed v. Animendra Kissen Mitter SC 1950, Himmat Singh v. Arup Sinha Roy Delhi HC 2025, Haribux Singhania Calcutta HC 1956) broker ke haq mein hain, par **rishtedaar ke upar seedha judgment mujhe nahi mila** — claim hamesha us par chalta hai jisne sign kiya; parivaar par asar sirf us signer ke zariye.

## 2. Har role se poori deal — `tests/v102-journey.test.ts` (29 test)
Ek buyer, ek ghar: **BRK2** (buyer ka broker) → **BRK1** (listing broker) → **OWN** (owner) → **BRK3** (bahari broker) → **ADMIN** (GENZ). Har step ke baad baaki roles ne dekha unhe kya dikhta hai.

**Part A (do broker):** visit book (deal room apne aap, BRK2 introducing / BRK1 closing) → kaun visit dekhta hai (BRK2 poora, BRK1/owner masked, admin sab, bahari kuch nahi) → gate har role ke liye alag (ACK_REQUIRED / MAKER_CHECKER / PROPERTY_SIDE_ONLY) → buyer ka v2 pass (dono broker ke naam) → ack ke baad "ready" → galat QR/code, GPS → QR scan = visit + deal stage + audit + buyer bond → doosra broker same buyer nahi le sakta → offer (owner accept, buyer-side accept nahi kar sakta) → stage ladder (skip nahi, admin summary-only) → final price → commission agreement (galat sum, bahari, proposer bahar — sab refuse; dono sign → ACTIVE, split 40/60 dono ke deal room mein; owner/GENZ ko nahi dikhta) → owner ko bill (/pay link, owner "paid", BRK1 "received") → commission payment (likhne wala khud confirm nahi kar sakta, doosra broker confirm/reject (reason ≥5 akshar), reject ke baad wahi ref dobara likh sakte hain) → BRK2 ka share PAID → BRK1 ka share → Settled (tab tak nahi jab tak har share PAID).

**Part B (ek hi broker dono side):** ghar BRK1 ka, buyer bhi BRK1 ka → sirf **owner** verify kar sakta hai → agreement ek akele broker ka 100% → payment **apne aap CONFIRMED** → Settled.

**Part C:** owner consent page par v2 shabd (EN+HI), accept ke baad audit mein `form oc-v2`.

## 3. Jo galtiyan/gaps mile aur theek kiye
| # | Kya galat tha | Asar | Fix |
|---|---|---|---|
| 1 | **Broker apni hi listing par apna buyer laaye** (visit ya offer) → deal room mein `closingBrokerId = ''` | Baaki poora app (solo payment, one-broker close, hisaab, screens) maanta hai ki ek broker = introducing aur closing **same**. `''` hone par payment PENDING bana rehta aur confirm karne wala doosra broker hai hi nahi → **deal Settled tak pahunch hi nahi sakti thi** | `server.ts` (visit) + `server/offers.ts`: closing = wahi broker; `server/db.ts` migration purane `''` deals ko theek karti hai |
| 2 | Home scanner par **koi bhi dusra GENZ QR** (shop QR, broker card, owner consent, bill, buyer ka promise link) → "yeh GENZ visit QR nahi, buyer se pass dobara khulwao" | Galat aur confusing | `src/shared/scanRules.ts`: har QR apne naam se (kisko kis kaam ka) — EN+HI. Dono scanner (home QR + Visit QR screen) |
| 3 | Pass screen par **"is QR mein check-in secret nahi" / "doosri visit ka QR"** error dikhta hi nahi tha (effect order: error saaf karne wala effect scan wale ko mita deta tha) | Owner ki screen ka QR (secret chhupa hota hai) scan karo → khali screen, kuch nahi | `SiteVisitQrPassModal.tsx`: scan wala effect baad mein |
| 4 | "Too early" ka text: "sirf visit ke din" — asli rule: slot se **6 ghante pehle** se | Galat jaankari | Text theek (server) |
| 5 | Galat QR par sirf "Invalid or expired" — kitni koshish bachi nahi batata (OTP batata tha) | Lock achanak lagta tha | "… N attempt(s) left." |
| 6 | Visit book hone par property side (owner + listing broker) ko **bell/push nahi**; verify hone par booker + baaki ko bhi nahi | Record bana par kisi ko pata nahi | Dono jagah `alert()` (EN+HI, buyer sirf initials mein) — verify karne wale ko nahi, baaki ko |
| 7 | Home scan se pass khulta to ghar ka naam ki jagah **"PROP-104"** aur "Location not set" | Kachcha lagta tha | `QuickScan.tsx` property fetch karke deta hai |

**Apni galtiyan (test likhte waqt):** (a) pehle ek hi ghar select kiya jis par seed deal pehle se thi; (b) offers ki list ka shape galat maana; (c) reject ke baad wahi ref dobara likhne par 409 socha — asal mein 200 (reject hui entry block nahi karti, sahi hai); (d) Part B ka ghar Part A se takra gaya — ab naya ghar list hota hai. Koi galti production code mein nahi gayi.

## 4. Scanner ka poora matrix (real browser mein chalaya)
Playwright (Chromium, production build), har role ki apni login; QR **photo upload** (“Take photo of QR”) se — yani asli decoder (jsQR) chala, sirf camera nahi.

| QR | Kaun scan kare | Jo dikhta hai | Record kahan |
|---|---|---|---|
| Buyer ka pass, buyer ne promise nahi kiya | listing broker | Pass khulta hai + "Waiting for the buyer's 'no direct deal' tick" | Kuch nahi |
| … slot 6 ghante se door | listing broker | "Too early … from 6 hours before its time (date, time)" | Kuch nahi |
| … apna book kiya | booker | "You booked this visit … Remind / move" | Kuch nahi |
| … kisi aur ka | bahari broker | "GENZ visit QR, but NOT yours" | Kuch nahi |
| … pehle se verified | listing broker | "This visit is already verified." | Kuch nahi |
| … galat secret | listing broker | "Invalid or expired QR verification token. 4 attempt(s) left." | Try count +1; 5 par LOCKED |
| … secret ke bina | listing broker | "This QR has no check-in secret — ask the customer to open their own pass." | Kuch nahi |
| … phone 300 km door | listing broker | "Check-in rejected: you appear to be 303.0 km from the property" + "6-digit code se Verify OTP karo" | Kuch nahi |
| … phone ghar ke paas | listing broker | "Check-In Verified · VERIFIED & RECORDED" | visit (QR, `gpsChecked=true`), deal "Site Visit Done", audit (kisne), buyer bond, bell (booker+owner) |
| … location ke bina | listing broker / owner | Verified | Wahi, `gpsChecked=false` (saboot mein likha) |
| Visit id jo hai hi nahi | koi bhi | "GENZ visit QR, but NOT yours" (jaan-bujhkar wahi — pata na chale ki id hai ya nahi) | — |
| Shop QR, chat link, partner page, owner consent, bill, shared ghar, broker card, buyer promise link | broker | Har ek ka apna naam + kisliye hai + "visit pass nahi" | — |
| Builder pass (`GENZV:` / `/v/CODE`) | broker | "Only that builder's team can scan it, at the project" | — |
| Builder pass | uska builder | Visit QR screen par pass ki details (partner, slot, ID-check) | `/api/visits/scan` — confirm par lead "site visited", audit, partner ki bell, board |
| Builder pass | doosra builder | "GENZ pass, but NOT for your project" (kiska hai nahi batata) | — |
| Plain text, website, junk JSON, UPI QR | broker | "Not a GENZ visit QR…" | — |
| Bina QR ki photo | broker | "No QR found in that photo — move closer…" | — |

Builder pass ka API matrix (`tests/v102-scanner.test.ts`, B1–B6): promise se pehle block · issuer/bahari/owner/anonymous/doosra builder ke apne error · ID-check tick zaroori · confirm ke baad lead, audit (builder ka naam), partner ki bell, board · dobara scan "already used" · 72 ghante door "Pass opens …" · replaced / cancelled · 10 galat scan par 10 minute ka lock.

## 5. Tests
- `tests/v102-journey.test.ts` — 29 (Part A 21, Part B 7, Part C 1)
- `tests/v102-scanner.test.ts` — 24 (A 9, B 7, C 4, D source guards 4)
- Purane: v33, v64 (v2 shabd), v79-ui (property pass) update.
- **Result: poori suite 132 file / 1909 test pass** (3 file skipped, 4 test skipped — pehle jaise), `tsc` saaf. (V101 par 130 file / 1856 test the.)

## 6. Limits (jo mujhse nahi hua)
- **Asli phone camera / BarcodeDetector** nahi chalaya — photo-upload wala rasta (wahi decoder) chala. Live camera permission, roshni, blur: asli phone par ek baar dekho.
- GPS **simulated** (Playwright location) — asli GPS drift/denied ka case nahi.
- "EXPIRED" (slot ke 24 ghante baad) API par nahi chala sakte (time travel nahi) — pure rules tests (v79-rules) mein covered.
- SMS/push asli nahi (DRY_RUN) — bell line check hui, phone ki notification nahi.
- Owner consent accept hone ki audit line **broker ki apni trail mein nahi dikhti** (admin ko dikhti hai) — jaan-bujhkar chheda nahi, batana tha. Agar chahiye to bol dena.
- Wording ke liye **advocate review** zaroori.
- Pitch PDF aur USER_MANUAL waise hi (tumhare kehne tak).
