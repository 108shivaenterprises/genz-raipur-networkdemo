# GENZ Broker Network v92 — Security & Product Audit

Date: 2026-10-30 · Auditor: Claude (Opus 5.5) · Scope: the whole repo as shipped in `genz-broker-network-v92.zip`. The audit itself changed no code; **all 18 findings were fixed afterwards — see §14 "Fix status (v93)"** at the end.

## 0. What I actually did (and did not)

**Ran**
- `npm install`, then the app in demo mode: `DEMO_MODE=true SEED_DEMO_DATA=true SEED_DEMO_BULK=true npm run dev` on `127.0.0.1:3000`.
- A second instance with `DEMO_MODE=false SEED_DEMO_DATA=true` on port 3099 (fresh `data/`), to test demo leakage.
- A third instance on port 3099 started against a deliberately truncated `data/database.json`.
- `npm run lint` (`tsc --noEmit`): **exit 0, no errors.**
- 10 of 119 test files: `api-access-control, permissions-and-auth, v85-lead-chat-number, v46-shop-partners, v33-visit-ack, v13-visits, v54-visit-privacy, v92-feed-level-share, v71-hisaab, v25-kyc-vault` → **10 files, 134 tests, all passed, 14.8 s.** I did not run the full 13-minute suite.
- Logged in as: superadmin, admin (Pooja), brokers Vikram / Amit / Priya / Rohit, buyer (Dr. Alok), owners (Sunil, Sunita), connector, contractor, builder, legal.
- A scripted cross-user IDOR sweep: harvested Vikram's deal / lead / client-room / visit / rent / shop-lead ids and replayed **every single-`:id` GET route** (121 requests) as Priya, buyer, owner and connector.
- A scripted PII scan: 32 list endpoints × 9 roles, looking for other people's phone / email / PAN in the JSON.
- Manual curl probes for every finding below, plus a browser pass (built-in browser) at 360 px on the sign-in page, the five broker tabs and the public QR page.
- Unit probes (via `tsx`) of `containsPhone()` and `homeFits()`.

**Read** (not every line of 35 k): `server.ts` middleware/auth/visits/deals/commission sections, `server/auth.ts`, `access.ts` (parts), `shopPartners.ts` (lead, reveal, public form, partner page), `visitack.ts`, `clientroom.ts` (OTP parts), `db.ts` (load/save/audit), `vaultCrypto.ts`, `webpush.ts`, `brandlogo.ts`, upload handlers (`ownermedia`, `profilephoto`, `propdocs`), `listings.ts`, `share.ts`, `publicPage.ts` (parts), `spamRules.ts`, `clientRoomRules.ts`, `validation.ts` (schemas + mask), test helpers.

**Did not** — see section 13.

---

## 1. Findings — ranked

| # | Sev | Title | Reproduced? |
|---|---|---|---|
| F1 | **Critical** | Corrupt `database.json` is silently replaced by a fresh seed (total data loss) | Yes |
| F2 | **High** | OTPs meant for the shop / buyer / client are shown to the broker even with `DEMO_MODE=false` → broker accepts terms / acknowledgements on the other party's behalf | Yes (DEMO_MODE=false) |
| F3 | **High** | Shop-QR hidden-number gate is self-satisfiable: broker posts a listing (auto-VERIFIED) that "matches" and the number opens | Yes |
| F4 | Medium | Locality matcher matches on generic words ("Nagar") and the city name → wrong matches + looser reveal gate | Yes (unit) |
| F5 | Medium | Phone-in-chat filter bypassed by full-width / math digits, zero-width space, `+ x : *` separators, words | Yes (unit) |
| F6 | Medium | Deal-room chat does not block phone numbers for accounts older than 7 days (owner can post his number to the other broker) | Yes |
| F7 | Medium | Two different phone masks (first 5 / last 4) combine to 9 of 10 digits | Code-read |
| F8 | Medium | Logout does not revoke the session token (valid up to 8 h) | Yes |
| F9 | Medium | Debounced, non-fsynced whole-file writes: up to 10 s of money/consent writes lost on crash | Code-read |
| F10 | Medium | Audit "hash chain" is unkeyed SHA-256 and the KYC vault key sits in the same `data/` folder | Code-read |
| F11 | Low | Anonymous public-page actions are written to the audit log as role `SUPERADMIN` | Code-read |
| F12 | Low | Site-visit QR check-in: GPS is optional, so the 5 km geofence is skipped by omitting lat/lng | Code-read |
| F13 | Low | The property owner sees the visit OTP/QR token (owner is also a checker) | Code-read |
| F14 | Low | Login lockout is keyed `ip+email`; behind a proxy without `TRUST_PROXY` all users share one IP bucket | Code-read |
| F15 | Low | CSRF check passes requests that carry no `Origin` header | Code-read |
| F16 | Low | Shop-partner page token stored in plaintext next to its hash | Yes (data file) |
| F17 | Low | Forms on sign-in, Property tab and public QR page have no programmatic labels | Yes (browser) |
| F18 | Low | Test infra: shared random port ranges → flaky; tests assert the F2 behaviour as correct; no corruption / DEMO_MODE=false / filter-evasion tests | Yes |

---

## 2. Access control / IDOR

**Result: solid.** No finding in this section.

- Every router I checked applies a router-level guard (`r.use(needs(...))`) or an in-handler `ctx().user` check: calls, clientroom, crm/crm2/crm3, inventory, landrecords, partnerchat, profiles, publicPage, pulse, rentdesk, share, team. Routes without `needs()` (`/api/crm/target-bonus`, `/api/revenue/mine`, `/api/visit-acks/:kind/:refId`, the commission `settle-payment` / `confirm` / `reject` routes) all reject anonymous callers inside the handler. `POST /api/listings/admin/purge-now` uses `needs()` with no permission but checks `SUPERADMIN` inline (`server/listings.ts:258`).
- IDOR sweep (121 requests): Priya, the buyer and the connector got **403/404 on every one of Vikram's deals, leads, client rooms, visits, rent items and lead-forward targets**. The owner got 200 only on deals where he is the seller party (`DEAL-2026-001`, `DEAL-DMO-001`), and his `hisaab` view is restricted to the seller's own numbers.
- PII scan (9 roles × 32 endpoints): every unmasked phone returned belonged to the caller's own listing / requirement / lead. Requirement board masks other brokers' clients (`+91 98263 •••••`), construction leads are masked for contractors, directory cards carry no phone/email/PAN.
- Impersonation is read-only and expires in 30 min (`server.ts:405-414`, `auth.ts:104`).

---

## 3. Number masking / anti-bypass

### F3 — High — Hidden-number gate can be opened with a broker's own fresh listing
- **Where:** `server/shopPartners.ts:572-588` (`/leads/:id/offer`), `matchesFor()` at `:94-100`, `pageLive()` `server/publicPage.ts:44`, new listings auto-`VERIFIED` at `server.ts:1310`.
- **Why:** the promise is "the number stays hidden until the need is confirmed **and a matching home is shared**". "Matching" only checks locality/type/budget against the broker's own live listings, and a broker's new listing is `VERIFIED` immediately. So once the customer taps ✅, the broker can create a listing that fits and "share" it.
- **Repro (done):**
  ```bash
  # 1 customer scans Vikram's QR FCG8EPFC (form POST /q/FCG8EPFC: BUY, Kachna, "20 lakh", phone 9876512345) → /q/chat/<TOK>
  curl -b vikram -X POST /api/shop-partners/leads/PLD-…/ask-need -H 'Content-Type: application/json'
  curl -X POST /q/chat/<TOK>/ans -d a=YES                      # customer confirms the need
  # matches == []  (nothing fits)
  curl -b vikram -X POST /api/properties -H 'Content-Type: application/json' \
   -d '{"title":"Plot in Kachna","description":"A residential plot for sale","propertyType":"Residential Plot","transactionType":"Sale","state":"Chhattisgarh","city":"Raipur","locality":"Kachna","addressHidden":"Some lane, Kachna","askingPrice":2000000,"ownerApprovedNetPrice":1900000,"ownerName":"Fake Owner","ownerPhone":"9123456780"}'
  # → PROP-104 VERIFIED active ; matches now = [PROP-104]
  curl -b vikram -X POST /api/shop-partners/leads/PLD-…/offer -d '{"homeId":"PROP-104"}' -H 'Content-Type: application/json'
  # → masked:false, phone:"9876512345"
  ```
- **Impact:** the core shop-QR guarantee to customers (and the "need confirmed + home shared" evidence used in disputes) can be met with a fake listing a few seconds old.
- **Minimal fix:** in `matchesFor()` ignore listings created after the lead (`createdAt > lead.createdAt`) or younger than N hours, and/or require the customer to tap "I'm interested" on the shared home before `revealNumber()`; record `listingAgeAtReveal` in the audit line.

### F2 — High — OTPs shown to the broker when no SMS gateway is set, regardless of `DEMO_MODE`
- **Where:** `server/shopPartners.ts:395` (`codeForPartner`) + `:1169`; `server/visitack.ts:89-92` (`codeForBuyer`) + `:169`; `server/clientroom.ts:166,176` (`codeForClient`) + `:687`. All are gated on `smsOn()` only, never on `DEMO_MODE`.
- **Contradiction:** `docs/DEPLOY_INDIA.md:36` says "keep DEMO_MODE=false so brokers never see it". They do see it.
- **Repro (done, `DEMO_MODE=false`, port 3099):**
  ```bash
  curl -b vik -X POST /api/shop-partners -H 'Content-Type: application/json' -d '{"consent":true,"shopName":"Audit Kirana","personName":"Audit Person","area":"Shankar Nagar","city":"Raipur","phone":"9826099999","terms":{"sale":{"mode":"PCT","value":20},"rent":{"mode":"FIXED","value":2000},"lockDays":180}}'
  curl -X POST /sp/<token>/otp -d phone=9826099999          # broker knows the shop's number
  curl -b vik /api/shop-partners                            # → codeForPartner: "705532"
  curl -c dev -X POST /sp/<token>/verify -d code=705532      # 303
  curl -b dev -X POST /sp/<token>/accept -d ok=1             # 303 → status ACTIVE
  ```
  History: "Accepted the terms: Sale: 20% …"; audit: *"Shop partner accepted the terms on his own phone (mobile verified)"*.
- **Impact:** the broker can accept share terms for the shop, sign the buyer's "no direct deal" acknowledgement (which then feeds the buyer bond / protection), and open the client's room on his own device. The audit log calls this "mobile verified", so it is also wrong evidence in a dispute.
- **Minimal fix:** expose `otpPlain` / `codeFor*` only when `DEMO_MODE` is true. In production without SMS, refuse to start these flows (or require the code to be read out by GENZ ops), and change the audit text to say how the code was delivered.

### F5 — Medium — `containsPhone()` is easy to evade
- **Where:** `src/shared/clientRoomRules.ts:16-21`; used by the shop-lead chat and the client room.
- **Repro (done, `tsx`):** `9826511223`, `98265 11223`, `९८२६५११२२३`, `98-265-112-23`, `wa.me/919826511223` are blocked. **Passes:** `98265+11223`, `98265x11223`, `98265:11223`, `98265*11223`, `98265 then 11223`, full-width `９８２６５１１２２３`, math-bold `𝟗𝟖𝟐𝟔𝟓𝟏𝟏𝟐𝟐𝟑`, zero-width space `98265​11223`, and spelled-out digits.
- **Fix:** `text.normalize('NFKC')`, map every `\p{Nd}` to ASCII, strip all `[^0-9a-z]`, then also run the regex on the digits-only string. Accept that words/split messages cannot be fully stopped; add a report button.

### F6 — Medium — Deal-room chat allows phone numbers after an account's first 7 days
- **Where:** `src/shared/spamRules.ts:12` (phone rule only for `isNewAccount`), `server.ts:5579`.
- **Repro (done):** as owner Sunil: `POST /api/deals/DEAL-DMO-001/messages {"text":"Buyer ji, call me directly: 98261 55667, skip the broker"}` → `success:true`. The introducing (buyer-side) broker `USR-BRK-005` is a participant of that room. The same message posted by Vikram was readable by the owner.
- **Impact:** the v20/v54 rule hides the owner's number from the other broker; the deal room hands it over.
- **Fix:** run the same `containsPhone()` (after F5) on deal-room, partner-chat and `/api/chats` messages whenever the room mixes sides (owner ↔ other broker, buyer ↔ listing broker).

### F7 — Medium — Two masks combine to 9 of 10 digits
- **Where:** `maskPhoneNumber()` `server/validation.ts:342-347` keeps everything but the **last 5** (`+91 98263 •••••`); shop leads, visit acks and partners expose `phoneLast4` (`shopPartners.ts:389,942`, `visitack.ts:91`).
- **Impact:** a broker who sees the same customer both as a masked network requirement / visit and as a masked shop lead knows 9 digits — 10 guesses. Not reproduced on one person end-to-end.
- **Fix:** one mask everywhere, e.g. `••••••1223` (last 4 only), or a per-viewer pseudonym.

### Visit OTP / QR (maker ≠ checker) — mostly solid
- `gateFor()` blocks the booker from verifying, 5 wrong tries lock the visit, OTP is random 6-digit, QR token random (`server.ts:2740-2860`). Good.
- **F12 (Low)** `server.ts:2830-2845`: the 5 km geofence only runs if lat/lng are sent; omitting them succeeds. Fix: require coordinates when the property has them, or mark the visit "no GPS" in the evidence.
- **F13 (Low)** `server.ts:2520-2524`: the owner (a checker) receives `otpCode`/`qrToken`, so the checker can verify without the customer present. Fix: show the code only to the buyer and admins.

### Mandate / protection days
Not tested beyond reading call sites (see §13).

---

## 4. Auth, session, demo leakage, CSRF, CORS, headers

- Password hashing: scrypt N=16384, timing-safe compare, dummy hash for unknown users. Policy ≥10 chars with upper/lower/digit. Session = HMAC-SHA256 signed JSON, `HttpOnly; SameSite=Lax`, `Secure` in production, 8 h TTL, `sessionVersion` revocation on password change/reset. Good.
- **DEMO_MODE=false (verified on 3099):** `/api/auth/config` returns `demoAccounts: []`, `Genz@2026` login → 401, the bootstrap admin password is forced to change. Good — except F2.
- **F8 — Medium — logout is cookie-only.** `server.ts:525-528` just clears the cookie.
  ```bash
  TOK=$(login rohit) ; curl -H "Authorization: Bearer $TOK" -X POST /api/auth/logout   # 200
  curl -H "Authorization: Bearer $TOK" /api/auth/me                                      # 200 (still valid)
  ```
  Fix: bump `sessionVersion` on logout (or keep a short deny-list of `iat`), and offer "sign out everywhere".
- **F14 — Low** `server.ts:461`: per-account lock key includes the IP, so an attacker rotating IPs gets 6 tries per IP per account. `docker-compose.yml:38` sets `TRUST_PROXY`, but Vercel / other deploys must too, or every user shares one IP bucket (300 failed logins/15 min from anyone → everyone gets 429). Fix: add a pure per-account counter (with a slower back-off) and document `TRUST_PROXY` as required.
- **F15 — Low** `server.ts:238-258`: when `Origin` is absent the request passes; the JSON-content-type rule and `SameSite=Lax` cover browsers today. Fix: also accept `Sec-Fetch-Site: same-origin` / require `Origin` or `Referer` for cookie-authenticated writes.
- **CORS:** no `Access-Control-Allow-Origin` is ever sent; cross-origin POST with `Origin: https://evil.example` → 403. Good.
- **Headers:** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` always; CSP + HSTS only when `NODE_ENV=production` (`server.ts:209-215`). The CSP has no `'unsafe-inline'` for scripts. Good.

---

## 5. Input handling

- **XSS:** I stored `<img src=x onerror=alert(1)>` in a property title/description and a share-link label and fetched `/p/<code>`, `/s/<token>`: all escaped (`&lt;img …`). Shop pages, client-room and visit-ack pages use `esc()`; the remaining raw `${msg}` interpolations I traced are server-constant strings. React has **no** `dangerouslySetInnerHTML`/`innerHTML`.
- **Uploads:** magic-byte sniffing for photos/PDF/video (`ownermedia.ts:87-95,125`, `profilephoto.ts:61`, `propdocs.ts:268`), logo rejects SVG (`brandlogo.ts:26-29,108`), served with `nosniff`. Call-recording chunks are size-capped and audio-sniffed. File names on disk are server ids → no path traversal found.
- **SSRF:** the only outbound fetches are web-push (host allow-list, `webpush.ts:128-129`) and the SMS webhook from env. Good.
- **Prototype pollution / mass assignment:** no `...req.body` spreads or `Object.assign(x, req.body)` found; updates go through zod schemas.
- **Body limits:** 256 kb default; larger routes have their own parsers (700 kb logo, etc.).

---

## 6. Data privacy (DPDP)

- Aadhaar: only last-4 kept on the user; full number only in the AES-256-GCM vault with per-field AAD (`vaultCrypto.ts`). PAN not stored in clear on demo users. Good design.
- **F10 — Medium:**
  - Vault key defaults to `data/.kyc-vault.key` — the same folder as the encrypted data and `database.json` (`vaultCrypto.ts:15,38-45`). A copy of `data/` (backup, volume snapshot) is a copy of the plaintext.
  - Audit chain is `sha256(prev + event)` with no secret (`db.ts:3520-3545`). Anyone who can edit the file can recompute the chain; removing `settings.auditChainSealedAt` even triggers an automatic re-seal (`db.ts:3236-3262`).
  - Fix: require `KYC_VAULT_KEY` from env/secret manager in production (refuse to start otherwise); HMAC the audit chain with a key not stored in `data/`, and periodically export the chain tip off-box.
- **F11 — Low:** anonymous actions (QR lead, need confirmed, partner accepted) are logged as `actorId:'public', actorRole:'SUPERADMIN'` (`shopPartners.ts:771,883,957,1199,1209,1228,1244,1263`). Fix: add a `PUBLIC` actor role.
- **F16 — Low:** `shopPartners.ts:470,480` keep `p.token` in plaintext next to `tokenHash` (all 3 partners in the data file). Fix: drop the plaintext and re-issue a link on demand.
- Retention / erasure jobs (`sweepKycHolds`, `sweepKycVault`, `sweepSoldPurge`, full-Aadhaar 7-day erase) exist; I did not time-travel to verify they fire.

---

## 7. Money & deal logic

- Commission split schema enforces 100 % (`validation.ts:245-268`). Commission payments: outstanding-cap, dispute freeze, UTR+amount duplicate check, maker/checker confirmation for two-broker deals (`server.ts:4722-4800`). Handlers are synchronous, so parallel requests cannot interleave between check and write in one process. Good.
- Shop-partner share: `partnerAmount()` rounds to rupees and caps at the brokerage (`src/shared/shopPartner.ts:70-74`); terms bounded by `checkTerms()`.
- Minor (not ranked): `paidDelta` accepts fractions of a rupee (e.g. `0.5`), so float sums can drift. Fix: require integers (rupees) or store paise.
- Not verified: offers/tokens, settlement flows, billing ledger, master-CP revenue (see §13).

---

## 8. Matching & location engine

### F4 — Medium — loose locality match
- **Where:** `homeFits()` `server/shopPartners.ts:78-92`: `b = norm(home.locality + ' ' + home.city)` and any lead word ≥ 4 letters contained in `b` counts.
- **Repro (done, `tsx`):** `Shankar Nagar → Ram Nagar` MATCH; `Devendra Nagar → Shankar Nagar` MATCH; `Naya Raipur → Telibandha` MATCH (the word "raipur" hits the appended city). Correct negatives: `Tatibandh → Telibandha`, `Avanti Vihar → Vidhan Sabha Road`.
- **Impact:** wrong homes offered to customers, and the F3 reveal gate is looser still.
- **Fix:** drop the word-substring fallback (rely on `localityFit()` exact/city), or exclude stop-words (`nagar, colony, road, vihar, sector, phase, city names`) and never match against the appended city.
- Lifecycle filtering is good: after `POST /api/listings/PROP-104/status {"status":"withdrawn"}` the listing vanished from the poster `/p/…`, share `/s/…`, `/api/feed`, other brokers' `/api/properties` and `/api/matching/matrix`.
- Performance at 10 k users: not load-tested (the bulk seed is ~100 users). By reading: `GET /api/shop-partners` runs `matchesFor()` (full property scan) per confirmed lead; `GET /api/requirements` without `limit` returns everything. Both will need pagination/indexing at scale.

---

## 9. Reliability

### F1 — Critical — corrupt database file is overwritten with a seed
- **Where:** `server/db.ts:3382-3438` (`loadState`): `JSON.parse` failure → `console.error(...)` → `saveStateDirect(seed)`.
- **Repro (done):**
  ```bash
  mkdir -p /tmp/x/data && echo '{"users":[{"id":"REAL-1"}],"dealRooms":[{"id":"IMPORTANT"' > /tmp/x/data/database.json
  cd /tmp/x && PORT=3099 SEED_ADMIN_PASSWORD=… tsx <repo>/server.ts
  # log: [DB] Failed to parse existing db file, initializing seed: SyntaxError …
  # database.json now = one "Platform Administrator", no backup kept
  ```
- **Impact:** one truncated write, disk-full event, or bad manual edit → every broker, deal, KYC record and audit event is gone, and the server keeps running as if new.
- **Fix:** on parse error, rename the file to `database.corrupt-<ts>.json`, try the newest backup, and **refuse to start** unless an explicit `ALLOW_FRESH_DB=true` is set.

### F9 — Medium — write durability
- `db.ts:3473-3490`: saves are debounced 150 ms–10 s; `db.ts:3447-3451` writes tmp + rename without `fsync`. A crash/OOM/`kill -9` loses everything since the last flush (SIGTERM/SIGINT do flush). Money confirmations, consents and OTP attempt counters live in that window.
- Fix: flush synchronously for money/consent/auth writes, `fsync` the tmp file and directory, keep rolling backups; or use the Postgres store for any real deployment.

- Memory: in-process maps (rate-limit buckets, call signals, OTP maps, page cache) all have sweeps or size checks; `pushLog` is capped at 500. No leak found by reading.
- Startup with an empty `data/` works (fresh seed + bootstrap admin printed to the log).

---

## 10. Frontend (360 px, built-in browser)

- Sign-in page, Home, Property, Buyers, Deals, More and the public QR page `/q/FCG8EPFC`: **no horizontal overflow** at 360 px (`scrollWidth == 360`).
- Console: only one expected 401 (`/api/auth/me` before sign-in). No other errors across the five tabs.
- **F17 — Low (a11y):** the sign-in email/password textboxes have no accessible name (labels not tied to inputs); 5 unlabeled inputs on the Property tab; on the public QR page all 8 inputs (`name, phone, locality, budget, ptype, note, sign`) are unlabeled and 7 tap targets are under 24 px. Fix: `<label for>` / wrap inputs, `aria-label` where visual labels are absent.
- Hindi/English strings: spot-checked on the QR page (bilingual, `lang="hi"`); not audited across the app.
- Playwright was not used (not installed); flows beyond tab switching were not clicked through.

---

## 11. Tests

- `npm run lint`: pass. Sample of 10 files: 134/134 pass.
- **F18 — Low:**
  - Each test file picks `PORT = <base> + random(0..89)` and many files share a base (e.g. 10 files use 7300–7389), so parallel runs can collide → intermittent `EADDRINUSE` failures.
  - `tests/v31-client-room.test.ts:84`, `v64-shop-qr-homes.test.ts:57`, `v69-room-app-docs.test.ts:52` read `codeForClient` / `codeForPartner` from the broker's API — they lock in F2 as intended behaviour.
  - Missing tests for the real risks: corrupt/empty `database.json` (F1); any flow with `DEMO_MODE=false` except `v25-kyc-vault`; phone-filter evasion (F5); reveal with a just-created listing (F3); logout revocation (F8).
  - Assertions are generally real (status sets like `expect([403,404]).toContain` are fine for denials); I found no `it.only`/`skip` and no test file without `expect`.

---

## 12. (a) Top-10 fix list

1. **F1** — never overwrite an unparseable `database.json`; quarantine it and refuse to start.
2. **F2** — tie every `codeFor*` / `otpPlain` exposure to `DEMO_MODE`; fix the "mobile verified" audit text; update the three tests.
3. **F3** — ignore listings created after the lead in `matchesFor()`; require the customer's tap on the shared home before revealing.
4. **F9** — synchronous fsync'd writes for money/consent; rolling backups (or Postgres in production).
5. **F10** — vault key from env/secret store only in production; HMAC-key the audit chain outside `data/`.
6. **F6** — apply the phone filter to deal-room / partner / broker chats that mix sides.
7. **F5** — NFKC + `\p{Nd}` normalisation in `containsPhone()`.
8. **F4** — remove the generic-word / city substring fallback in `homeFits()`.
9. **F8** — revoke on logout (`sessionVersion++`).
10. **F7** — one phone mask format across the app (last 4 only).

## 12. (b) What is solid

- Route-level permission model (`needs()` + router-level guards) and resource ownership checks: no IDOR found in 121 cross-user requests.
- Response shaping: no other-party phone/email/PAN leaked in 32 endpoints × 9 roles.
- Password storage, signed sessions with revocation on password change/reset, read-only time-boxed impersonation, invite codes bound to e-mail/phone, 2FA support.
- `DEMO_MODE=false` removes demo logins and the demo password.
- HTML escaping on every public page I tested; no raw-HTML sinks in React; upload type sniffing; no SVG logos; SSRF-safe push.
- Listing lifecycle: withdrawn/sold listings disappear from posters, share links, feed, board and matching.
- Commission money flow: 100 % split check, outstanding cap, duplicate-UTR guard, maker/checker confirmation, dispute freeze.
- Visit verification: maker ≠ checker enforced on the server, attempt lock-out.
- Atomic tmp+rename writes (no half-written file under normal operation); `tsc` clean.

## 13. (c) What I could not verify, and why

- **Full test suite** (119 files, ~13 min): only 10 files run, for time.
- **Every one of the ~800 routes' write paths:** the IDOR sweep covered GET detail routes; for writes I tested chat, offer, listing status, partner create/link/accept, and read the commission routes. Mutations on CRM, rent desk, HR, inventory, billing, legal, consent, pcontrol were not attacked one by one.
- **Mandate / protection-day logic, buyer bonds, offers/tokens, billing ledger, master-CP revenue:** not traced end-to-end.
- **Retention / erasure sweeps** (KYC holds, full Aadhaar after 7 days, sold-listing purge): not time-travelled.
- **10 k-user performance:** no large dataset available locally; comments in §8 are from reading.
- **Postgres store / Vercel build** (`pgstore.ts`, `sharedSync.ts`, `build:vercel`): not run.
- **Production headers (CSP/HSTS):** only read; the server was run with `NODE_ENV=development`.
- **SMS / WhatsApp / push delivery:** simulated locally, not exercised.
- **Frontend flows beyond tab navigation, Hindi strings app-wide, Playwright E2E:** not done.
- **F7** (mask combination) and the visibility of F6's message to `USR-BRK-005` were reasoned from code, not observed in that user's session.

---

## 14. Fix status (v93)

Every finding was fixed in code; each is covered by `tests/v93-audit-fixes.test.ts` (38 tests) or by updated existing tests.

**Verified after the fixes:** `npm run lint` clean · full suite `npx vitest run` → **116 files passed, 3 skipped; 1,611 tests passed, 4 skipped, 0 failed (81 s)**. Two more test-only problems found on the way and fixed: 9 files deleted their temp folder while the server was still writing (now wait 500 ms); `v75-client-alerts` sent a real push to Google FCM with a fake endpoint and failed whenever FCM answered 404 quickly (new `PUSH_DRY_RUN=true` for tests).

| # | Fix | Where |
|---|---|---|
| F1 | An unreadable `database.json` is renamed `database.corrupt-<time>.json`; the newest readable `data/backups/database-*.json` is restored; with no backup the server **refuses to start** (`ALLOW_FRESH_DB=true` starts empty on purpose). Errors during migration no longer fall through to a seed either. | `server/db.ts` `readExisting()` / `loadState()` |
| F2 | Codes for the shop / buyer / client are shown to the broker **only in DEMO_MODE**. With DEMO_MODE=false and no `SMS_WEBHOOK_URL`, the code pages answer 503 "SMS is not set up" and no code is made. Audit text now says how the code was delivered (no more "mobile verified" for a read-out code). The broker's visit panel says SMS is missing instead of promising a code. | `server/shopPartners.ts`, `server/visitack.ts`, `server/clientroom.ts`, `src/components/VisitAckPanel.tsx` |
| F3 | A listing created **after** the customer scanned does not count as his matching home for 48 h (`REVEAL_FRESH_LISTING_HOURS`); the broker gets `409 LISTING_TOO_NEW`. The reveal audit line records the listing's creation time. | `server/shopPartners.ts` `tooFreshFor()` / offer route |
| F4 | Area fallback compares whole, distinctive words only — generic words (Nagar, Colony, Naya…) and the city's own name never match. | `src/shared/shopPartner.ts` `areaWordsMatch()` |
| F5 | `containsPhone()` normalises NFKC, maps any Unicode digit to ASCII, strips invisible characters, joins digits across short symbol runs and one filler word, reads o/O and l/I as 0/1 and number words (English, Hinglish, Hindi). 14 evasions blocked, 6 normal messages allowed. | `src/shared/clientRoomRules.ts` |
| F6 | Deal-room chat refuses phone numbers for every account (both sides are in the room). | `server.ts` deal messages route |
| F7 | `maskPhoneNumber()` shows the last 4 digits only (`+91 ••••••4001`), the same 4 every other mask shows; the second mask in `pcontrol.ts` now uses it. | `server/validation.ts`, `server/pcontrol.ts` |
| F8 | Logout bumps `sessionVersion` → the token stops working on every device (a "view as" logout only ends itself). | `server.ts` `/api/auth/logout` |
| F9 | Writes are fsync'd (file and folder) before/after the rename; debounce capped at 2 s; commission payments and shop-partner money/consent routes write immediately (`db.saveNow()`); hourly rolling backups (`BACKUP_EVERY_MS`, `BACKUP_KEEP`). | `server/db.ts`, `server.ts`, `server/shopPartners.ts` |
| F10 | Audit chain is an **HMAC** (`AUDIT_HMAC_KEY`, else derived from `AUTH_SECRET`); an intact old chain is re-keyed once, a broken keyed chain is never re-sealed; each start logs the chain tip for off-box anchoring. In production the KYC vault refuses a key file inside `data/` (stays off until `KYC_VAULT_KEY` is set). | `server/db.ts`, `server/vaultCrypto.ts` |
| F11 | Anonymous public actions are logged with actor role `PUBLIC`. | `server/shopPartners.ts`, `server/visitack.ts` |
| F12 | QR check-in without GPS still counts but sets `gpsChecked:false` and the evidence says "NO GPS sent — distance not checked". | `server.ts` checkin-qr |
| F13 | The owner (a checker) no longer receives the visit OTP / QR secret. | `server.ts` `sanitizeVisit()` |
| F14 | Extra per-account login limit (20 / 15 min) independent of the IP; `TRUST_PROXY` documented as required behind a proxy. | `server.ts` login, `docs/DEPLOY_INDIA.md` |
| F15 | Writes with `Sec-Fetch-Site` other than `same-origin`/`none` are refused even without an `Origin` header. | `server.ts` CSRF middleware |
| F16 | Shop-partner and brokerage-bill links are stored AES-GCM sealed (`tokenSealed`); old plain copies are sealed and dropped on first read. | `server/linkSeal.ts`, `server/shopPartners.ts`, `server/payreq.ts` |
| F17 | Sign-in, 2FA and password-change fields and the 5 Property-tab filters have accessible names; every public page's `<label>`+field pair is linked automatically (`linkLabels()` in the page wrapper); the honeypot field is `aria-hidden`. | `src/components/LoginView.tsx`, `src/components/PropertiesView.tsx`, `server/brandlogo.ts` |
| F18 | Tests use an OS-assigned free port (`tests/helpers/port.ts`) instead of colliding random ranges; tests that read the visit code as the owner now read it as admin / the demo booker; new regression file for F1–F16. | `tests/*` |
| — | Commission payments must be whole rupees (no float drift). | `server.ts` settle-payment |

**Behaviour changes to know before deploying**
- Without an SMS gateway and with DEMO_MODE=false, shop-partner pages, visit acknowledgements and client rooms cannot be opened (they show "SMS is not set up"). Connect `SMS_WEBHOOK_URL` first.
- Signing out signs the account out on all devices.
- In production, set `KYC_VAULT_KEY` (and keep `AUTH_SECRET` / `AUDIT_HMAC_KEY` stable), or the vault stays off.
- Phone masks everywhere now look like `+91 ••••••4001`.
- See `docs/DEPLOY_INDIA.md` §6a and `.env.production.example` for the new switches.
