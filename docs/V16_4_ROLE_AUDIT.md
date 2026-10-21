# v16.4 — Every role checked, one by one

**Why.** "Har role ko detail mai check karo, kuch miss to nahi ho raha." The app was checked the way each role really uses it: a real browser click-through (every tab, every safe button, at desktop width, 360 px phone width, English and Hindi), a request-level sweep of every API route per role (who gets 200 / 403), a data-leak sweep (phones, e-mails, PAN, GSTIN, notes in any reply) and a "what is this person missing?" review. Everything found was fixed and the check was run again.

## What was found and fixed

| # | Role | Problem | Fix |
|---|------|---------|-----|
| 1 | Legal Counsel, Team member | Deal Room called APIs the role may not use (tasks, agreements, disputes, chat) → 403 errors and empty tabs | Deal Room now asks the server's permission list: tabs, buttons and background calls exist only for what the role may do |
| 2 | Broker (co-broking) | `/api/collaborations` returned the **other broker's** e-mail, phone, PAN, GSTIN and KYC notes | Same contact-free "party card" used in the partner directory |
| 3 | Owner, Buyer, Legal, Builder | They saw the broker dashboard (commission pipeline, deal volume) — numbers that were not theirs | Each gets its own home: owner (properties, offers, visits), buyer (my needs, matches, visit codes), legal (open / critical issues), builder (projects, mandates, associates attention list) |
| 4 | Everyone | Dashboard "Split ratified 100%" and the commission pie were hard-coded / empty | Real counts (`3/5 splits ratified`) and a pie that shows even when nothing is paid yet |
| 5 | Legal Counsel | Growth checklist asked for a Share Kit step the role cannot open | Step only appears for roles with Share Kit |
| 6 | Buyer | Demo buyer's enquiry belonged to nobody → empty "My needs"; visit OTP never reached the buyer | Demo enquiry linked to the demo buyer (existing databases are migrated); buyer sees the 6-digit visit code for visits booked on their phone — nobody else's |
| 7 | Buyer, Owner | Match Center / Properties offered buttons the role cannot use (propose, match by property) | Buttons follow permissions |
| 8 | Contractor, Broker | Construction referral fee flow was broken: the contractor had no way to declare the contract value, and the broker's "Mark paid" hit a 403 | Contractor: "Declare final contract value". Broker who referred: "I have received the referral fee" (with confirmation). Super admin can do both. Contractor can never mark themselves as having paid. GENZ still never touches the money |
| 9 | Every role | No way to change your own password after first login | "My data" → "Change my password" (same secure endpoint; other devices are signed out) |
| 10 | Buyer, Owner, Admin | Properties, Requirements, Match Center, Audit Trail and Disputes were English-only | Hindi for these screens, including enum values (property type, purpose, urgency, status) and the matching "why it matched" lines |
| 11 | Contractor (and admin) | "My Team → Lead control" opened a broker/builder-only CRM panel → 403 on click | Sub-tab shown only to Broker / Builder; Team labels no longer mix Hinglish into the English screen |
| 12 | Buyer, Owner | The two forms they use most — "Add my requirement" and "Register property" — were half or fully English, and State was blank even though City was filled | Both forms fully bilingual (labels, dropdown values, tag chips, photo/video help, alerts); State is filled from the City |
| 13 | Admin, Builder | Control Center, Invite & KYC, Builder Launchpad and the dashboard headings were English-only; one old note told non-admins to "switch to SUPERADMIN in the top bar" (no such switch exists) | Hindi added; the wrong note replaced |
| 14 | Everyone (Hindi) | 9 top-nav tabs (Today & Clients, Deal Desk, Visit QR, Protected Docs, Community, Control Center …) had **no Hindi entry** and fell back to English; Navbar, footer, "view as" banner, broker dashboard (chart titles, deal cards, Trust Score line) and the activity feed's "View Deal / View Listing" were English | Hindi added everywhere in the shared chrome, plus a test that fails if any `t('key', …)` ever lacks a Hindi entry again |
| 15 | Broker, Admin (Hindi) | **Bug:** the dashboard chart tooltip showed a ₹ amount only if the series *name* contained "volume"/"valuation" — in Hindi it would have shown "123 listings/deals" instead of money | Decided by data key, not by the translatable name |
| 16 | Admin, Broker, Contractor (Connector Desk) | The desk the user flagged earlier was still English in header, tabs, status, reward / payout flow and invite panel; Share Kit showed Hinglish ("Naam", "Logo / photo chuno", "hatao") in the English UI | Fully bilingual; Share Kit uses proper English / Hindi |

## Tests added (`tests/role-audit.test.ts`, 16)
Deal Room permission gating · collaboration party cards · growth checklist · buyer OTP privacy · role homes · full construction settlement (claim → declare → confirm → COMPLETED, plus every wrong-side attempt = 403, bad value = 400, locked value = 409) · password change (wrong current / weak new / success / other device signed out / new password works) · every quick-pick tag has a Hindi name · Buyer / Owner forms contain no bare English labels · every `t('key')` has a Hindi entry · tooltip money detection by data key · Connector Desk / Share Kit / Navbar static checks. Full suite after this round: **325 passed, 1 skipped**; `tsc --noEmit` and `npm run build` clean.

## What this check cannot promise
- "Perfect" cannot be proven. What can be said: after the final round, the browser crawl found no 403 / 5xx / script error caused by a role's own screen, and the data sweeps found no phone, e-mail, PAN or GSTIN in any reply a role should not see.
- Hindi is complete for the screens listed above and for the shared chrome. **Still English-first (measured with a scanner, ~1,000 text strings):** Deal Room (~270), Due Diligence (~100), the other pop-up forms (Modals, Edit Property, Broker Safety, Secure Document Upload, Public Broker QR, Site-Visit QR Pass), CRM detail, Inventory panel, Bonus panel. Due Diligence checklist items and Deal Room party names come from the server / data in English.
- Any Legal Counsel account can open all deals and properties — deliberate (it is a panel of advocates, not a per-deal assignment). If you want per-deal assignment, that is a separate, larger change.
- A buyer cannot yet tap "I'm interested" on a listing; they post a need and get matches. Not changed because it needs a rule for which broker gets the enquiry (neutral platform).
