# GENZ Broker Network — security & access-control audit

## Critical flaws found in the original build → fix

| # | Flaw | Fix |
|---|---|---|
| 1 | **No authentication.** Identity came from a client-controlled `x-user-id` header / localStorage; anyone could be anyone, incl. SUPERADMIN. | Password login (scrypt), HMAC-signed HttpOnly SameSite cookie, per-user `sessionVersion` revocation, rate-limited + lockout, constant-time compare, no user enumeration. |
| 2 | **`/api/auth/switch-user` backdoor** and a UI role-switcher for every user. | Removed. SUPERADMIN-only, read-only, 30-min, audited "view as". |
| 3 | **No role checks** on most routes (any user could read/modify deals, tasks, agreements, DD, vault, chat, disputes). | 74-permission catalog (`server/permissions.ts`), `needs()` gate on every route + resource-ownership checks. See `docs/ACCESS_CONTROL.md`. |
| 4 | **Commission forgery:** any user could sign for another party (`requiredApprovals[0]` fallback), propose splits with arbitrary names/IDs, and mark payments paid. | Only the named signer signs; participants/names resolved from DB; payments admin-only and capped at outstanding; amended version stays inactive until fully signed. |
| 5 | **Anti-bypass defeated:** OTP and QR secret returned to the broker in API responses; QR token defaulted to the public visit id; OTP from `Math.random`. | Secrets go only to customer/owner/admin (SMS); random QR token; CSPRNG OTP; attempt limits; stage-gated. DEMO_MODE shows them for demos only. |
| 6 | **Data leaks:** owner net price, exact address, documents, customer phone, user e-mail/phone and password data in list endpoints. | Single `sanitizeProperty/Requirement/Visit` projection; directory cards without contact data; `passwordHash`/`sessionVersion` never leave the server. |
| 7 | **Self-verification:** uploader could mark own document "authentic"; assignee could verify own task; resolver could close own issue. | Four-eyes rules; legal sign-off restricted to legal counsel/SUPERADMIN. |
| 8 | **Vault grants** could reference other properties' assets / arbitrary recipients; anyone could revoke. | Asset & recipient validation, principal/admin-only revoke, expiry bounds. |
| 9 | **Input validation gaps:** no body limits, no enum checks, `javascript:` URLs accepted, price > asking allowed, negative / huge numbers. | zod schemas + `isSafeUrl`, money caps, body limit 256 kB, central error handler (no stack leaks). |
| 10 | **Integrity:** audit hash chain never verified; non-atomic DB writes could corrupt `database.json`; fake "malware scanned" flag; client-faked GPS coordinates. | Chain recomputed & verified on load; atomic tmp+rename writes; flag no longer asserted; real device geolocation (server rejects > 5 km). |
| 11 | **Web hardening:** no CSRF defence, no security headers, open CORS-like behaviour, server bound to all interfaces. | Origin + JSON-only guard, CSP/HSTS/nosniff/frame-deny, binds `127.0.0.1` by default, 404 for unknown `/api`. |
| 12 | **Hard-coded demo special-cases** and unused dependencies (`@google/genai`, `dotenv`); esbuild peer conflict broke `npm install`. | Removed; esbuild ^0.28. |

## Added for production
| Area | What |
|---|---|
| Storage | PostgreSQL write-behind store (transactional, changed-docs-only, single-writer advisory lock, graceful-shutdown flush); JSON file only for dev |
| Boot guards | Production refuses to start without AUTH_SECRET / DATABASE_URL or with DEMO_MODE on; starts with no demo data |
| DPDP | Consent record (policy version, time, IP), self-service export, correction/erasure/grievance queue, anonymising erasure with ledger retention |
| KYC | PAN, GSTIN (mod-36 checksum), RERA shape validation; PAN/GST never shown to other members |
| Ops | /api/health, gzip, immutable asset caching, PII-free access log, Docker + Caddy HTTPS, backup/restore scripts |

## Known limits (be honest before production)
- JSON-file database: fine for demo/pilot, move to PostgreSQL before real scale; single-process rate limits.
- Documents/media are stored as URL references — no file upload/AV scanning pipeline yet.
- SMS is simulated in the console unless `SMS_WEBHOOK_URL` is set.
- No e-mail verification / MFA / password-reset-by-email (admin issues one-time temp password).
- Set `AUTH_SECRET`, `DEMO_MODE=false`, `SEED_ADMIN_PASSWORD` and run behind HTTPS for production.


## Round 2 findings (owner privacy, mandate, India-wide)

| # | Finding | Fix |
|---|---|---|
| R2-1 | **Owner could see the broker↔broker commission split** through deal fields, `agreement:read/sign`, `collab:read`, deal notes, COMMISSION audit events, activity feed, metrics and deal chat. | Owner role loses those permissions; `shapeDealFor()` redacts deals (`commercialsHidden`); audit/activity/metrics filtered; brokers-only chat channel; UI hides the panels. |
| R2-2 | **Owners saw other owners' properties** — the server listed all verified listings to every role and the client also matched on owner name/phone. | `canBrowseProperty()`: owners get only properties they own / list; by-id access enforced too. |
| R2-3 | **Owner mandate form was never mounted** and relied on an SMS OTP that cannot work without SMS. | New password-signed, surplus-above-net mandate (owner → listing broker co-sign), hash-chained audit, `OwnerMandate` UI. |
| R2-4 | **Mandate signing password check always failed** (verified against an enriched user copy without the hash). Found by the new end-to-end tests. | Verify against the stored record; covered by tests. |
| R2-5 | Fabricated demo values (random document numbers, stamp hashes, default RERA/trust scores, sample advocate name, hard-coded Raipur coordinates) shown as if real. | Removed; fields start empty or show "not provided". |
| R2-6 | Raipur/Chhattisgarh hard-coded in validation, IDs, matching, DD templates, UI, manifest, legal text. | India-wide shared data module; state-aware RERA authority; configurable jurisdiction. |
| R2-7 | Demo mode on by default. | Off by default; demo data only with `DEMO_MODE=true SEED_DEMO_DATA=true`. |


## Round 3 findings (GENZ Connector launch audit)

| # | Finding | Fix |
|---|---|---|
| R3-1 | **No public sign-up page**: invitation codes could only be redeemed via API. | `JoinView` (code → role-aware form → consent) reachable from the login page. |
| R3-2 | Invite UI offered only some roles; no way to invite shopkeepers without e-mail. | All roles selectable (ADMIN for Superadmin only); phone-only invites; login accepts mobile number. |
| R3-3 | `maintenanceMode` setting existed but was never enforced. | Middleware returns 503 to non-admins (auth routes stay open); toggle in Control Center, audited. |
| R3-4 | Superadmin had no consolidated control view or way to change platform settings. | `/api/admin/control-center` + validated `PUT /api/admin/settings` + Control Center UI + function directory. |
| R3-5 | Task-reassign dropdown used hard-coded demo users; Gate-4 text named a specific advocate. | Dropdown loads verified members; text made generic. |
| R3-6 | New programme risks: referral spam, reward fraud, data leakage. | Rate limit 30/day, 60-day duplicate lock, own-number block, mandatory consent, reward only after CLOSED_WON, approve ≠ pay (UTR), reward audit events hidden from non-admins, connectors isolated from every other API (tested). |

| R3-7 | Owner mandate supported only "net amount"; real-life deals also use % commission and flat fee. | Mandate now has 3 bases (`SURPLUS_ABOVE_NET`, `PERCENTAGE`, `FIXED_FEE`) with server validation, hash covering all terms, owner price floor untouched by non-net bases, UI selector and tests. |
| R3-8 | Builders could not offer volume incentives (extra pay for more units sold). | Computed bonus slabs (`src/shared/bonus.ts`): individual + project level, date window, collection gate, UTR payout, over-payment flag, builder-only editing (`crm:bonus_manage`), associates see only their own row; 11 tests. |
| R3-9 | Brokers/builders had to share their own login with telecallers and site staff. | `TEAM_MEMBER` role: employer-created, consent-attested accounts; sees only allotted leads/deals; commercials redacted; no bonus/bookings/inventory/audit; employer suspension locks the team; ownership checks on allot (other brokers' leads/members rejected); audited; tested. |
| R3-10 | Brokers wanted their own local referral partners without the platform paying rewards. | Broker-sponsored partners (invite → admin KYC → referrals routed to sponsor); sponsor approves/pays his own partners only (UTR, after CLOSED_WON); global duplicate lock & consent unchanged; non-sponsors get 403/404; tested. |
| R3-11 | Two brokers could race for the same unit; free-text unit numbers allowed bypass. | Server-side unit grid with atomic hold (one winner, 409 for the rest), expiry sweep, hold visible only to holder/builder/admin, booking-request checks the grid, approval → BOOKED, reject/cancel → AVAILABLE; tested. |
| R3-12 | Escalator slabs could be gamed or mis-ordered. | Slabs validated (no gaps/overlap, 0.1–10 %), applied only at approval by the associate's n-th approved booking, audited (`CP_SLABS_UPDATED`); builder-only. |
| R3-13 | New location + selfie data is sensitive. | Check-in is opt-in per action, India-bounds checked, JPEG-only ≤ 220 KB, selfie visible to employer only (list responses omit it), oldest selfies dropped after 300, audited. |
| R3-14 | Public tracked links could leak private data or be used for XSS / log spam. | Public page renders marketing fields only (no commission / owner / exact address), every value HTML-escaped, `noindex`, revocable, ping endpoint whitelists section names and caps seconds, rate-limited, bots ignored, tracking script served from own origin (CSP-safe). |
| R3-15 | Land-record red flags could be mistaken for legal clearance. | Manual-entry only; UI and docs state it is not legal advice; record access limited to creator / admin / legal counsel / linked property parties. |
| R3-16 | Employees of admins / contractors could gain too much power. | Employee permissions are computed from the employer's role (`memberPermissions`), always a strict subset: admin staff get only `connector:desk` (no reward / payout / settings / KYC), contractor staff see only the employer's awarded jobs with commission and contract value stripped, and cannot accept leads. Employer suspension still locks the team out. |
| R3-17 | Connector who withholds the customer number could be bypassed or duplicated. | Introduce-mode referral keeps `customerPhone` empty; the connector's own number is shown only to the assigned worker, sponsor and ops. Work cannot reach IN_PROGRESS / CLOSED_WON without an attached number; on attach the number is checked globally and the earliest registration wins (later ones auto-DUPLICATE, audited). Same connector cannot re-register the same name + locality + need within 60 days. |
| R3-18 | Public request-access / forgot-password could be abused (spam, number enumeration). | Per-IP and per-number rate limits, honeypot field, DPDP consent mandatory, identical answer for known / unknown numbers, nothing auto-approved (ops approve → normal KYC). |
| R3-19 | Public visiting card could leak private data. | Opt-in only; shows brand fields, verified status, RERA, member-since and counts; phone only if the member ticks it; every value HTML-escaped; `noindex`; rate-limited; disabling it returns 404 immediately. |
| R3-20 | Forgot-password flow used for account takeover. | Ops-only issuance of a one-time password (forced change at next sign-in, old sessions revoked); admins can only be reset by a super admin; request is single-use; audited. |
| R3-21 | Coalesced DB writes could lose data on a crash. | Window ≤150 ms, flushed on SIGTERM/SIGINT/exit; production uses PostgreSQL write-behind with the same coalescing. |


## v11 additions
- Protected docs: magic-byte validation, size caps, single-use 5-min tokens, Sec-Fetch-Dest image check, no-store, access log, revoke/expiry/view-limit. Screenshots web par roke nahi ja sakte (documented).
- Waitlist: stateless HMAC challenge (single-use, ≥2s). Chat link/phone filter for new accounts, flood guard, daily creation caps.
- Map pins approximate; exact address gated by verified visit. Points non-cash, idempotent, capped.

## v12 additions
- Staff phone policy enforced server-side on every lead response; masked staff cannot search by number; reveals rate-limited, capped per day and audited.
- Builder-only controls are scoped to the builder's own projects (other builders get 404); admin is read-only.
- Collateral links validated (http/https only). Notices/links are rendered as text / safe anchors.
- Suspend / leave hands open leads back — no stranded or retained customer data.
