# User Manual v1.1 (PDF) — role-wise, Hinglish, screenshots ke saath

**File:** `GENZ_Broker_Network_User_Manual.pdf` (chat me bheja gaya). A4, 84 pages (12 MB): cover + clickable contents + 12 chapters (A–L), ~140 phone screenshots with numbered markers.
Saare screenshots demo data ke hain (phone 390 px, @2x). Har screenshot par laal box + number hai; bagal ki list mein wahi number samjhaya gaya hai.

## Chapters
- **A — Shuruaat:** GENZ kya hai, 5 zaroori baatein, roles table, sign in / invitation code se join, phone layout (header, 5 button, More sheet), QR menu, Hindi mode.
- **B — Broker (B1–B27):** pehle din ki checklist; Home; WhatsApp se listing → owner consent page (`/oc`) → publish; poora form; property card; buyer needs; matches; co-broking offer (split % vs apna-apna side), offers ka jawab; Deals pipeline; deal room (stepper, next steps, sub-tabs, responsibility, commission, chat, legal help); site visit (book → buyer link `/a` → code → QR → scan/OTP); deal band / reopen / bahar ki visit; Owners & mandate; brokerage bill (`/pay`); disputes + apna-apna side fees; Client Room (`/r`, 2 phone, watermark); Shop QR partners (`/q`, poster, `/sp`); Today & Clients; Deal Desk (buyer protection, cost sheet); Share Kit; papers; My Projects + CRM + target bonus; My Team; network / grow / community; disputes + Network Watch; title check, land records, activity record; construction leads, connector desk; GENZ Membership.
- **C — Owner**, **D — Buyer/Tenant**, **E — Builder**, **F — Contractor**, **G — Legal counsel**, **H — GENZ Connector (Hindi)**, **I — Team member**, **J — Admin / Superadmin** (Today on GENZ, Invite & KYC, ID review, Plans & Fees, legal panel, Launch desk, City launch, Shop QR desk, disputes, Control Center, Revenue & Growth).
- **K — Bina login wale pages** (table: `/oc`, `/a`, `/r`, `/q`, `/q/…/poster`, `/sp`, `/pay`, `/c`).
- **L — FAQ, 8 suraksha niyam, shabdkosh.**

## Saath mein theek kiya
- `?tab=partners` link aur page reload par Shop QR Partners tab ab khula rehta hai (pehle Home par chala jata tha) — `src/App.tsx` ALL_TABS me `partners` joda.

## Agla kadam (agar chahiye)
- App me "Help / Manual" link jo yeh PDF khole.
- Hindi-script (Devanagari) version, ya sirf broker ka chhota 10-page quick guide.

## v1.1 (v49 ke saath)
- B20 naya: Property Papers mein 🔒 Protect (upload checkbox, card ka badge/Protect/Unprotect, share wale broker ka view-only card, stamped viewer), "Other protected docs" section.
- A4 More sheet (Protected Docs ab Property Papers ke andar), B12 mandate (owner naam + poora mobile, broker details), owner consent page ka naya "मालिक / Owner" row, FAQ + shabdkosh me Protect.
