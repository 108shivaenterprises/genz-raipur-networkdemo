# GENZ Broker Network (+ Builder ⇄ Associates CRM)

Invite-only real-estate broker collaboration platform for **all of India** (every State / UT, any city, PIN-code lookup, custom tags) — now with real authentication, a role/permission model and a channel-partner CRM.

## Run
Easiest: Windows → double-click `start.bat`; Mac/Linux → `./start.sh` (needs Node.js 20+). It installs, starts and opens the browser.

Manual:
```bash
bun install          # or: npm install --legacy-peer-deps
npm run dev          # http://127.0.0.1:3000
npm test             # 144 tests + optional Postgres test (TEST_DATABASE_URL=...)
npm run build && npm start   # production (set AUTH_SECRET, DEMO_MODE=false)
```
**Demo mode is OFF by default.** `start.sh` / `start.bat` create a first admin (`admin@genzbuildcon.com` / `Genz@Admin2026`, change forced on first login) — override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Then invite brokers/owners from the Onboarding tab.
Want sample data for a demo or staging? Start with `DEMO_MODE=true SEED_DEMO_DATA=true` (one-click logins on the sign-in page, demo password `Genz@2026`). Never use that in production.

## Production
`docker compose up -d --build` (app + PostgreSQL + Caddy HTTPS). Full runbook: `docs/DEPLOY_INDIA.md`.
Production boots empty (SUPERADMIN only), refuses to start without `AUTH_SECRET` / `DATABASE_URL`, and keeps `DEMO_MODE` off.

## India features
RERA / PAN / GSTIN KYC (format + checksum checks, admin verifies on the portal) · DPDP Act workflow (consent record, data export, correction/erasure/grievance queue, Grievance Officer) · Hindi/English UI · installable PWA · WhatsApp share.

## Docs
- `docs/ACCESS_CONTROL.md` — role × permission matrix (10 roles)
- `docs/EXAMPLES_50.md` — 50 worked examples across all roles
- `SECURITY_AUDIT.md` — flaws found & fixed
- `.env.example` — configuration

## Privacy & mandate rules
- **Commission is between the two brokers only.** Property owners never see the split, fee, agreement versions, payments, deal notes or commission audit events, and cannot read the brokers-only chat channel.
- **Owners only see their own properties** (owner or listing broker) — never another owner's listing.
- **Owner ⇄ listing-broker mandate with 3 brokerage types** (owner picks one, signs with password, listing broker co-signs): **Net amount** (owner's fixed net, surplus is the broker's) · **Commission %** (0.1–10% of the final price, paid by the owner) · **Fixed fee** (flat ₹, whatever the price). Shown on the property card; terms visible only to owner, listing broker and admins.
- **India-wide:** state/UT list with the right RERA authority, free-text city & locality with suggestions, 6-digit PIN validation (India Post lookup when online), curated + custom tags, 14 property types, city-aware matching.

## GENZ Connector programme (local partners)
New role `GENZ_CONNECTOR` for paan / tea-stall / vegetable / kirana / salon / tailor / medical-store owners, auto drivers, RWA & community members (12 shop types, 7 referral types).
- **Join:** Admin → Invite & KYC → pick *GENZ Connector* + the shopkeeper's **mobile number** (e-mail optional) → send code via WhatsApp → shopkeeper uses "Have an invitation code? Join here" → admin approves. Login is by mobile number.
- **Flow:** referral (customer consent mandatory, 60-day duplicate lock) → admin assigns to a broker/contractor → CONTACTED → QUALIFIED → IN_PROGRESS → CLOSED_WON/LOST → admin approves reward → admin pays with UTR.
- **Privacy:** connectors see only their own referrals (no notes, no broker identity); brokers see customer contact but never reward data.
- **Rewards** are placeholder defaults (₹200–₹1,000). Superadmin edits them in Connector Desk → Rewards & programme. Set TDS/legal terms with your CA before paying.
- **Superadmin Control Center** tab: platform health, KYC queue, maintenance mode, platform settings, and a live function directory with "Open" redirects.
- Demo data (`DEMO_MODE=true SEED_DEMO_DATA=true`): 13 partners, exactly 50 referrals.

## v12 — Builder control, project-wise partner view, staff lead control
See `docs/V12_CONTROL.md`. Nav: builder → "Project Control", broker → "My Projects", employer → My Team → "Lead control".

## v11 — Today digest, clients, map, protected docs, chapters, points
See `docs/V11_FEATURES.md` and `FEATURES.md`. All free. Docker: `appdata` volume holds protected-doc pages.

## v10 — re-audit + word-of-mouth growth
- Full audit report: `docs/REAUDIT_v10.md` (what was checked, what was found, what was fixed, a 12-month city playbook).
- **Grow Network** tab (brokers, builders, contractors, legal): personal invite code, WhatsApp share, nominations, badges, activation checklist, public visiting card (`/c/<code>`).
- **Request access** + **Forgot password** on the sign-in page (public, rate-limited, no account enumeration). `/?ref=CODE` opens Request access pre-filled.
- **City Launch** tab (Admin / Super Admin): city board (Waitlist → Seeding → Live → Hub), waitlist & nomination queue, forgot-password queue.
- Faster, safer saves (coalesced writes), mobile layout fixes, canonical city names.
- Demo: broker Vikramaditya's card is live at `/c/GZ-VIKR-1001`; 12 waitlist / nomination requests across Nagpur, Bhopal, Indore, Pune and more.

## v9 — employees on every side, demo profiles, connector-friendly referrals
- **Languages:** Hindi (देवनागरी) and English only. Hinglish and Chhattisgarhi text are gone; connectors open in Hindi by default.
- **Employees (`TEAM_MEMBER`) for every employer role.** Their powers follow the employer: broker / builder staff → allotted CRM leads & deal rooms (no commission); contractor staff → only the construction jobs awarded to the employer (no commission / contract value); Admin / Super Admin staff → **Connector Desk** (view, assign, progress referrals — never reward approval, payout, settings, KYC). Contractors, Admins and Super Admin now have **My Team** too.
- **Demo profiles:** every role has at least one (most two), plus employees under builders, brokers, contractors, admin and super admin. Full list with logins: `docs/DEMO_ACCOUNTS.md`.
- **Connectors who keep the customer's number:** when referring, choose *"I will introduce them myself"*. No customer number is needed; GENZ calls the connector, who introduces the customer. The referral ID protects their credit; the number can be added later (`POST /api/connector/referrals/:id/attach-contact`). Duplicate rule: the **earliest** registration of the same person + need wins; later ones become DUPLICATE. A referral cannot go IN_PROGRESS / CLOSED_WON until a number is attached.
- **Connectors are referral partners, not brokers** (no RERA needed because they only introduce; they never negotiate, take customer money or promise returns). Have your lawyer / CA confirm reward & TDS terms.
- **Demo mode is ON** in `start.bat` / `start.sh` (`DEMO_MODE=true SEED_DEMO_DATA=true`). For production remove those lines and follow `DEPLOY_INDIA.md`.

## My Team — employees of a broker / builder (role `TEAM_MEMBER`)
- Broker or builder opens **My Team** → adds name + mobile + job title (telecaller, site executive…) and ticks that the employee has agreed to the Privacy Policy (stored as the consent record). A one-time temporary password is shown with a WhatsApp share text; the employee must change it at first login. Max 15 per employer.
- Employer allots **CRM leads** (lead drawer → "Working on it") and **deal rooms** (checkbox panel under the deal title). The employee sees only what is allotted; commission, split, agreements, payouts, bonus, inventory, directory and audit are never shown (deal rooms use the same redacted view as the property owner; no brokers-only chat).
- Employer can suspend / reactivate / reset password; a suspended or blacklisted employer locks the whole team out immediately.

## My referral partners — broker's own local network
- A broker invites a local partner by mobile number (Connector Desk → **My referral partners**, WhatsApp share link). Admin still approves the account (KYC).
- The partner's referrals go straight to the inviting broker (the sponsor). The sponsor works the lead, and approves and pays the partner's reward himself (UTR needed, only after CLOSED_WON). Platform keeps the record, the 60-day duplicate lock and the consent; other brokers never see them.
- Reward amounts are the same placeholders as the connector programme; TDS and legal terms between broker and partner are not enforced by the app.

## Live inventory matrix, unit hold & escalator commission (CRM → "inventory" tab)
- Builder generates a tower (floors × flats) or plot grid per project; colours: 🟢 Available · 🟡 Hold · 🔴 Booked · 🟣 Builder reserved. Brokers see the grid only for projects where they have an active mandate.
- **Token hold:** broker holds a unit for his own lead with a token ≥ the builder's minimum (default ₹21,000) and the builder's receipt / UTR number. GENZ does not move money. Window default **2 hours** (builder can set 1–72 h; the "15 minutes" in your note and the "2 ghante" were both mentioned — it is a setting). A pending booking request keeps the hold until the builder decides. Other brokers see only "On hold", never who. Max 3 holds per broker. Bookings on a unit label that exists in the grid respect it (held by someone else → refused). Unknown labels still work as free text (older projects).
- **Escalator slabs:** e.g. booking 1–3 → 2.5 %, 4–8 → 3.5 % + "Bangkok trip", 9+ → 4 %. Applied on the associate's n-th *approved* booking from the day it is saved; earlier bookings are not re-priced. Rewards (trip / coin) are recorded text; the builder delivers them.
- **Leaderboard:** points = 100 per approved booking + 1 per ₹1 lakh; others' sales values are hidden from brokers.

## Team activity, GPS check-in, incentive split (My Team → "Activity & incentives")
Employer sees calls / WhatsApp / meetings logged, site visits, open and overdue leads per member. **Site check-in** (member or broker, from a lead or My Work): browser GPS (India only) + selfie shrunk in the browser; location and selfie are visible to the employer only and written to the audit trail. Incentive: employer sets a % (0–50) per member; the app computes agent incentive vs firm share on brokerage of the member's booked leads — calculation only, payment is yours.

## Share Kit (broker / builder)
Brand card (name, RERA ID, logo) → tracked link `/s/<token>` (public mobile page, Hindi / English / Chhattisgarhi) → flyers: WhatsApp Status 1080×1920 PNG, Instagram 1080×1080 PNG, A4 brochure via browser "Save as PDF". The link records views and seconds on each section ("Plans & pricing"); preview bots are ignored; the broker can revoke it. Public page never shows commission, owner phone or exact address. Alerts appear inside the app (🔥 badge) — WhatsApp push would need the WhatsApp Business API. Message templates (intro, site-visit invite, offer summary, payment reminder) are **drafts**, not regulator-approved; the Chhattisgarhi text should be proof-read.

## Land Records & Red Flags
Record khasra / bhuiyan details by hand (GENZ does not scrape government portals) and get a CLEAR / CAUTION / DANGER verdict from rules: agricultural land without diversion, Nazul land, mortgage without bank NOC, litigation, encumbrance unchecked, seller-name mismatch, missing layout approval / RERA, joint owners' consent, stale (>30 days) check. Records are visible to the creator, admins, legal counsel and (if linked) the property's owner / listing broker.

## Not built (needs paid third-party accounts)
Number-masking cloud telephony (Exotel / Knowlarity), Aadhaar e-Sign (Leegality / NeSL), speech-to-listing, WhatsApp Business push alerts, live Bhuiyan fetch.

## Builder ⇄ Associates CRM (tab “Associates CRM”)
**Volume bonus (tab “Bonus”):** the builder can add incentive slabs on top of the base commission — *Associate's own units* (e.g. 3+ units → ₹50,000, 5+ units → +0.5% on those sales) and *Whole project units* (e.g. 10+ units → ₹25,000 to each associate who sold ≥1). Optional date window; a unit counts only after booking approval **and** a minimum collection % (default 10%). Highest slab per level applies; cancelled bookings drop out and any earlier over-payment is flagged. Builder pays with a UTR; associates see the ladder and only their own progress.

Lead registration with 60-day duplicate protection per phone/project → follow-ups & activity timeline → site visit → negotiation → booking request (associate) → approval + payment schedule (builder) → collections → pro-rata brokerage payout with 5% TDS.
