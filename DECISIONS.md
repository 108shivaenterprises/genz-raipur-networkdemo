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

## Needs the owner's eyes (updated as rounds finish)
- DigiLocker partner credentials (D2)
- Real VPS, domain, `.env` values: `AUTH_SECRET`, `KYC_VAULT_KEY`, `AUDIT_HMAC_KEY`, `PUBLIC_URL`, grievance-officer details
- Advocate review of privacy notice, retention periods, KYC retention
