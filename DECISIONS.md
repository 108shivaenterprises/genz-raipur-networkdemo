# DECISIONS.md — GENZ Broker Network launch prep

Owner's rule: CEO (Claude) decides product/tech/UX/security with the team; everything reversible (feature switch / config flag).
**Always ask the owner first:** deploy / VPS / domain / DNS · `.env`, secrets, API keys, paid service or plugin · real user data · DB delete/drop/reset · anything that costs money.

Format: **Decision** — why — how to reverse.

## D1. Voice calls and speech-to-text are OFF by default
**Chosen:** in-app WebRTC voice calls and the speech-to-text mic button are switched OFF by a flag (`FEATURE_VOICE`, default off). Code stays dormant.
Why: brief says no voice for now; calls need a paid TURN server behind Indian mobile CGNAT; speech-to-text sends audio to Google and the privacy notice does not say so.
Reverse: set `FEATURE_VOICE=true` and re-grant `call:use`.
Implemented (round 1): `server/features.ts` `voiceOn()`; off => no `/api/calls` routes, `call:use` stripped in `effectivePermissions`, `/api/auth/config` returns `voice`, call buttons/panels and the VoiceNote mic hidden. Tests: tests/v172-voice-off.test.ts.

## D2. Aadhaar: never store the number; verify through DigiLocker
**Chosen:** no full Aadhaar number is stored. Verification goes through DigiLocker (owner's decision). Only a "verified by DigiLocker" flag, last 4 digits and the verification reference are kept. Existing vault code stays dormant behind a flag.
Why: safest under DPDP and the Aadhaar Act; removes the 3-year sealed-copy risk.
Needs owner: DigiLocker partner/API credentials (secrets + onboarding). Built as an adapter behind `DIGILOCKER_MODE` (`off` | `manual-review` | `live`). Until keys exist the app runs in `manual-review` (a human admin checks the uploaded document). Nothing calls DigiLocker without keys.
Reverse: `DIGILOCKER_MODE=off`, and `KYC_STORE_FULL_AADHAAR=true` re-enables the legacy vault.

## D3. Signup
**Chosen:** brokers/agencies go live after document verification (DigiLocker when live, otherwise admin manual review); sign-up OTP alone no longer makes a broker account live. Clients (buyers) need only OTP; everything else optional.
Why: a verified-broker network is the product's trust; clients should have zero friction.
Reverse: `SIGNUP_AUTOLIVE_ON_OTP_PAN=true` restores the old behaviour.

## D4. Vercel demo: dummy data only
**Chosen:** the Vercel deployment is a demo with generated dummy data only. It must never be connected to a real database or real users. Production = Indian VPS + Docker + PostgreSQL. The demo-only boot file stays outside the VPS image.
Reverse: n/a (policy).
Implemented (round 1): `.dockerignore` excludes `api/`, `server/vercelBoot.ts`; Dockerfile now copies `src/shared`; production boot refuses without `PUBLIC_URL` and a KYC key decision (`KYC_VAULT_KEY` / `KYC_VAULT_KEY_FILE` / `KYC_VAULT_DISABLED=true`); SMS/QR/inlet links use `PUBLIC_URL` only (`publicBase`). CI: `.github/workflows/ci.yml`.

## D5. OTP login for now = WhatsApp click-to-chat / manual (no SMS provider)
**Chosen:** `OTP_MODE=manual`: server generates the code; user sends it through a free `wa.me` click-to-chat link, or an admin reads it from a pending-codes screen. Global daily cap + per-phone cooldown; account-exists leak removed. Fast2SMS / Firebase fields stay dormant and hidden.
Reverse: `OTP_MODE=sms` when an SMS provider is chosen.

## D6. Git workflow for the team
**Chosen:** work is committed to the branch `launch-prep` (not `main`) so no production deploy is triggered. Merging to `main` / deploying is the owner's call.

## D7. Deal tab reorganised using ideas from the Resell.do handoff pack
**Chosen:** copy Resell.do's screen order (numbers -> primary action -> what is expiring -> list), countdown pills and a payout-style ledger. Concretely: "Book visit" button on the Simple deal room; 3-cell metric strip + 3-row Today card on phone; hide the dead Board/List toggle on phones; new "Earnings" top mode (only when money exists, built from data already loaded); "Ending soon" rows and status pills (visit booked, protection days left); top mode "Offers" renamed "Co-broke"; tidier More list in sub-tabs.
**Skipped on purpose:** merging Simple and Full deal rooms (high risk, tests guard it); reordering the Simple room (**#9**, owner/team permission paths; revisit later); GPS 300 m geofence, KYC APIs, call masking, slab/TDS/escrow payouts (paid or developer-side; GENZ does not hold money); 60-day phone-dedup tagging (not Deal-tab scope).
Note: the pack says Section 194H TDS is 5%; reviewer believes it has been 2% since 1 Oct 2024. Not copied; verify with the CA before any TDS feature.
Why: smallest change that makes the Deal tab scannable on a 360px phone without touching server data.
Reverse: UI-only changes; revert the commit on `launch-prep`.

## D8. Client chat "Call" (tel:) link stays
**Chosen:** the plain `tel:` Call link in client chat/deal room stays. D1 covers only in-app voice calls and the speech mic. A dialer link costs nothing and is what brokers use today.
Reverse: remove the `room-call` link (ClientRooms/ChatsView) if "no voice" should also mean no dialer links.

## D9. PropGrid BUILD.md + 5-app findings (Sell.Do, Square Connect, NoBroker, LeadSquared, Housing.com): what we take
**Take (free, already mostly built; polish only):** 60-day-style protection and phone dedup = existing protection/anti-bypass (keep, show countdown pills); co-branded WhatsApp flyer = ShareKit (make sure RERA no. + name + phone are always on it); dynamic cost sheet = V106 (keep); tower grid = V108 (keep); "speed to lead" = WhatsApp deep link / tel: link on new lead (no telephony); sub-broker split display = agency team view.
**Skip for now (paid or out of brief):** Exotel/Twilio masking, WhatsApp Cloud API, Razorpay UPI token hold, Digio/Leegality e-sign and e-stamp, CIBIL check, Mapbox, OpenAI voice CRM (voice is OFF, D1), PropWorth AVM (needs registry data), Home-loan DSA referral (needs a licence and legal review; revisit after launch), TDS/GST engine (GENZ does not hold or move money).
**Do not copy:** the "Dynamic API Vault" that writes keys to a JSON file from the UI. Keys stay in `.env`/secret store only; the existing API-keys tab stays as is.
**Do not trust:** the numbers in the findings file (391% conversion, 4.2x time-on-site, 3x inquiries) are unsourced marketing claims; 150 m geofence needs real property coordinates; Section 194H TDS is 5% in these files but is believed to be 2% since 1 Oct 2024 (CA to confirm).
Reverse: policy only; nothing built.

## D10. QA round (six role-testers) — v178
**Relay-admin trust model (kept):** in manual OTP mode an ADMIN with `otp:relay` can read a pending code and send it to the number on record; that is the price of "no SMS provider" (D5). Limits that stay: never your own code, never a staff number's, every view and every send is audited, codes are sealed and wiped on use / expiry, staff passwords are reset only by a SUPERADMIN. Forgot-password stays non-enumerating, so its screen is the same for everyone (the wording no longer promises delivery or a changed password).
**Chosen:**
- Privacy: full PAN only for SUPERADMIN, each full view audited (`PAN_REVEALED`); ADMIN sees it masked (ID-review task detail, sponsor PAN, `POST /api/verifications/:id/review` response). `PUT /api/id-review/settings` with `autoVerify` is SUPERADMIN-only (the default-reviewer setting stays open to ADMIN). CRM opt-out is employer-only; staff CSV export masks e-mail for ADMIN. Production boot refuses to start unless `TRUST_PROXY` is a number or `false`.
- OTP: no phone-wide lock (a stranger could lock a victim out); each wrong-guessed code locks alone, and a number can burn at most 6 locked codes a day. `/otp-pending/:ref/sent` needs manual mode and is idempotent. Phone format is checked before the per-IP gate.
- API keys tab: TURN group hidden while voice is off; SMS / Firebase metadata not returned in manual mode.
- Data: offline queue keyed by user id and cleared on logout; visits cannot be booked in the past (15 min slack); shop QR mobile must be a real Indian mobile (+91 / 0 / spaces / dashes accepted); the "Notify shopkeeper" text carries first name + last 4 digits and no link; check-in selfie must decode to >= 1.5 KB with JPEG / PNG / WebP magic bytes; owner OTP request survives a reload (sessionStorage).
- UX: modals start at the top on phones (scrollable, close button always reachable); Back walks tabs and closes sheets (history entries; Escape closes More); offline lazy-view shows a retry card, no reload; Simple deal room lists the owner's pending actions; humanised overdue chip; consent page "No" has a confirm step.
- New privacy request `CONSENT_WITHDRAWAL` (beside CORRECTION / GRIEVANCE / ERASURE): My Data button, admin queue, completing it needs a note of what was stopped.
- Hindi: one `server/errorHi.ts` table + wrapper adds `errorHi` to listed English errors; the API client shows Hindi when the app is in Hindi; first-run language follows a Hindi browser; offline `fetch` failures become a bilingual "No network" message.
**Skipped on purpose:** geofence on check-in, DigiLocker, SMS, new paid integrations, merging Simple / Full deal rooms (still D7), Chrome-only issues that did not reproduce. "Session expiry redirect" was already built (401 -> login with a notice). Blacklist button is hidden for non-SUPERADMIN and on your own / SUPERADMIN rows; a SUPERADMIN may still blacklist an ADMIN (the server allows it and it is the way to remove a rogue admin).
**Reverse:** every item is a small, separate edit. TRUST_PROXY: delete the one `problems.push` line in `assertProductionConfig`. OTP phone lock: restore the `lock` lines in `issueOtp`. PAN: set `full` to `true` in `idreview.ts` task detail. Hindi wrapper: remove `app.use(hindiErrors)`. Back-button: remove `useBackClose` calls and the `popstate` effect in `App.tsx`. The v178 test file lists each guard.

## D11. QA round 2 — v179 (security review + bot tester report)
**Chosen:**
- PAN: every list / "view as" / builder-associates / deal-party response masks `panNumber` for anyone but SUPERADMIN (`maskKycFor` in `server/kyc.ts`; the admin directory cache is split per SUPERADMIN / other). Full PAN stays only on the audited ID-review and KYC-vault paths. GSTIN and Aadhaar last-4 are still sent (business registration / 4 digits).
- Owner net price (B9): the QR owner interview no longer copies the asking price into `ownerApprovedNetPrice`; the draft leaves it empty ("pending owner confirmation") until the owner confirms it through the consent flow (`termsOf` already treats empty as 0). The QR form's `ownerFacts` no longer sets it either. Floor answers must contain a number or a floor word.
- Budget slack (B5): a home up to 10% over the stated budget may be shown (`BUDGET_SLACK = 1.1`, was 25%) and is then named "slightly above your budget". One reader (`budgetRupees`, which now understands "sixty lakh" / "साठ लाख" / "50L") serves the form and the matcher; a bare "60" is 60 lakh (sale) or 60 thousand (rent) in both. With no readable budget the bot sends at most 2 mid-range homes (none if only one exists) and asks for the budget.
- Bot acknowledgement (B7): a customer message that gets no bot reply (assistant quiet, throttled, switched off) gets one short bubble "आपका संदेश broker तक पहुँच गया है …" at most once per 10 minutes; the same canned line is never written twice within an hour.
- Opt-out (B8): "not interested", "nahi chahiye", "band karo", "please stop", "don't contact", "remove me", "ruko", "मत भेजो" … (short messages only, no need words left) stop automatic pushes, set the lead to the existing `LOST` status with a reason, and tell the broker. "stop" counts only as the first word ("don't stop calling me", "bus stop near the house" do not).
- OTP lock (S4): the 6-locked-codes cap is per (IP, number), and its wait is the oldest locked code's age out (the screen says "try tomorrow" for 1 h or more); one IP may make 30 wrong guesses per hour across all codes.
- Consent withdrawal (S8): the resolver cannot be the requester; completing it sets `consentWithdrawnAt` on the user and `consent.withdrawnAt`, and `pushTo` then drops broadcast / digest / matches / community alerts (deal, consent and system alerts continue). Known gap: no outbound WhatsApp exists to stop, and per-purpose consent records are not modelled.
**Reverse:** PAN: make `maskKycFor` return `u`. Net price: restore the two `ownerApprovedNetPrice = askingPrice` assignments in `src/shared/listingAsk.ts` and the one in `ownerFacts`. Slack: set `BUDGET_SLACK` to 1.25. Acknowledgement: delete `ack()` and its call in `onText`. Opt-out: remove `stopShort` in `src/shared/sahayak.ts`. OTP: put back the phone-wide filter in `issueOtp`. Consent: delete the `consentWithdrawnAt` line in `pushTo`.

**Round 3 (v180, security only):** ReDoS: `cleanWa` collapses blank-line / trailing-space runs, every number regex in `waParse.ts` / `sahayak.readNeedChange` has a `(?<![\d,])` lookbehind and capped digit runs, the e-mail strip has a lookbehind, `splitMessages` reads at most 300 segments (tests/v180-qa-round3.test.ts: < 150 ms on 20k hostile chars). OTP: the 3 codes/day cap is per (number, IP) plus a 10/day per-number ceiling from any IP (`PER_PHONE_DAY_ANY`), same generic message. Invite lookup (`GET /api/invitations/validate/:code`) returns the sponsor's PAN masked + `hasPan`; register uses the stored PAN when the field is blank or still masked. `maskPan` never echoes a value under 6 chars; audit lines use it. Consent withdrawal: `pushTo` checks `consentWithdrawnAt` before `recordInbox` (marketing kinds no longer reach the bell); privacy request ids get a random suffix; the resolved audit line says what was stopped.
**Reverse (round 3):** delete the lookbehinds / `{0,15}` caps and the two `cleanWa` replaces; set the OTP cap back to `mine.filter(r => !r.locked).length >= PER_PHONE_DAY`; return `a.panNumber` in the validate prefill and drop `inv0`/`storedPan` in register-invite; move the `consentWithdrawnAt` line back below `recordInbox`.

**Round 4 (v181):**
- Clients list: the card grid is `grid-cols-1` on phones (it was an implicit auto-min column that a wide card stretched to 517px, widening the whole page and the fixed overlays with it, so Add client looked clipped); the incentive table in Team has its own scroll box. Modal / check-in / privacy close buttons are 44x44; the public QR pages' buttons have `min-height:44px`.
- Visit chat cards (deal room) show the year; reschedule errors have Hindi. Owner deal room: the green "nothing waiting" card hides while the owner's amber "Waiting for you" list is shown. Opt-out closes the bot's open need-confirmation card.
- D3 (reverses the v178 "queue is cleared on sign-out" rule): the offline queue is KEPT under `genz.pending.v1.<userId>` on sign-out; the confirm text says so. It is flushed when that same user signs in again (App effect on login + ClientsView). Another user id reads another key, so it can never flush it. To reverse: call `clearQueue(currentUser?.id)` in `handleLogout` (App.tsx) after `api.logout()` and restore the "will be lost" text.

## Needs the owner's eyes (updated as rounds finish)
- DigiLocker partner credentials (D2)
- Real VPS, domain, `.env` values: `AUTH_SECRET`, `KYC_VAULT_KEY`, `AUDIT_HMAC_KEY`, `PUBLIC_URL`, grievance-officer details
- Advocate review of privacy notice, retention periods, KYC retention
