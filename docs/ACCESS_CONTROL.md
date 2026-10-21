# Access control — role × permission matrix

Generated from `server/permissions.ts` (single source of truth). The API enforces every row with `needs(<permission>)`; resource-level ownership checks (deal participant, property owner/listing broker, lead owner, builder-of-project) sit on top. The UI only hides what the server would reject anyway.

Unverified (KYC pending / suspended) accounts are reduced to `self:read` + `self:update`. Rejected / blacklisted accounts have no permissions and cannot sign in.

| Permission | What it allows | SUPER | ADMIN | BROKER | OWNER | BUYER | CONTR. | BUILDER | LEGAL | CONNECTOR | TEAM |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `self:read` | View own profile & verification status | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `self:update` | Change own password / profile | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `metrics:own` | See own dashboard metrics | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |
| `activity:read` | See the (role-scoped) activity feed | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |
| `directory:read` | See contact-free partner cards of network members | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |
| `users:list` | See the full user directory incl. contact details | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `users:invite` | Issue invitation codes (non-admin roles) | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `users:invite_admin` | Issue invitation codes for ADMIN / SUPERADMIN roles | ✔ |  |  |  |  |  |  |  |  |  |
| `users:review` | Approve / reject / suspend users (KYC) | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `users:blacklist` | Blacklist a user permanently | ✔ |  |  |  |  |  |  |  |  |  |
| `users:reset_password` | Issue a temporary password to a user | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `users:impersonate` | View the platform as another user (audited) | ✔ |  |  |  |  |  |  |  |  |  |
| `audit:read_all` | Read the complete audit trail | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `audit:read_own` | Read audit events that concern the caller | ✔ |  | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |
| `metrics:global` | See platform-wide metrics (all users, all commissions) | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `permissions:read_matrix` | View the role/permission matrix | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `property:read` | Browse verified property inventory (privacy-masked) | ✔ | ✔ | ✔ | ✔ | ✔ |  |  | ✔ |  |  |
| `property:create` | List a property | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `property:update` | Edit a listing the caller owns / lists (admins: any) | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `property:moderate` | Approve / reject / suspend listings | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `property:withdraw` | Withdraw a listing the caller owns / lists | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `vault:manage` | Upload to the media vault & manage share-grants (own property) | ✔ |  | ✔ | ✔ |  |  |  |  |  |  |
| `vault:read_all` | Read every vault asset (compliance) | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `requirement:read` | Read buyer requirements (own / assigned; PII masked otherwise) | ✔ | ✔ | ✔ |  | ✔ |  |  |  |  |  |
| `requirement:create` | Register a buyer requirement | ✔ |  | ✔ |  | ✔ |  |  |  |  |  |
| `matching:run` | Run the property ⇄ requirement match engine | ✔ | ✔ | ✔ |  | ✔ |  |  |  |  |  |
| `collab:read` | Read collaboration offers the caller is a party to | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `collab:propose` | Propose a co-broking collaboration | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `collab:respond` | Accept / counter / reject a collaboration offer | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `deal:read` | Open deal rooms the caller participates in | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |  | ✔ |
| `deal:update_stage` | Advance a deal-room stage | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `deal:commission` | Edit the (pre-agreement) commission split | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `deal:chat` | Read / write the deal-room chat | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  | ✔ |
| `agreement:read` | Read commission agreements of own deals | ✔ | ✔ | ✔ |  |  |  |  |  |  |  |
| `agreement:propose` | Propose / amend a commission agreement | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `agreement:sign` | E-sign a commission agreement as a named signer | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `agreement:record_payment` | Record commission payments / disputes | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `task:read` | Read the deal responsibility matrix | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |  | ✔ |
| `task:manage` | Accept, assign, complete, waive deal tasks | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `task:verify` | Independently verify a completed task | ✔ | ✔ | ✔ |  |  |  |  | ✔ |  |  |
| `dd:read` | Read due-diligence checklists for properties the caller can access | ✔ | ✔ | ✔ | ✔ |  |  |  | ✔ |  |  |
| `dd:upload` | Attach evidence to a due-diligence item | ✔ |  | ✔ | ✔ |  |  |  | ✔ |  |  |
| `dd:verify_broker` | Mark broker-level checks | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `dd:verify_authenticity` | Mark authenticity verified (independent of uploader) | ✔ | ✔ |  |  |  |  |  | ✔ |  |  |
| `dd:legal_signoff` | Formal legal review sign-off | ✔ |  |  |  |  |  |  | ✔ |  |  |
| `dd:readiness_approve` | Approve a checklist item for registry readiness | ✔ | ✔ |  |  |  |  |  | ✔ |  |  |
| `dd:issue_manage` | Raise / respond to / decide due-diligence issues | ✔ | ✔ | ✔ |  |  |  |  | ✔ |  |  |
| `readiness:generate` | Generate the registry-readiness report | ✔ | ✔ |  |  |  |  |  | ✔ |  |  |
| `sitevisit:read` | Read site visits the caller is party to | ✔ | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |
| `sitevisit:create` | Schedule a site visit | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `sitevisit:verify` | Verify a site visit on location (OTP / QR) | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `sitevisit:secret_view` | See the visit OTP/QR secret (owner / customer / admin side) | ✔ | ✔ |  | ✔ | ✔ |  |  |  |  |  |
| `mandate:read` | Read net-amount mandates of own listings (owner, listing broker, admins) | ✔ | ✔ | ✔ | ✔ |  |  |  |  |  |  |
| `mandate:owner_create` | Owner: draft a brokerage mandate — net amount, % commission or fixed fee (signs the draft) | ✔ |  |  | ✔ |  |  |  |  |  |  |
| `mandate:owner_confirm` | Owner: withdraw a pending (not yet co-signed) mandate | ✔ |  |  | ✔ |  |  |  |  |  |  |
| `mandate:broker_respond` | Listing broker: accept (co-sign) or reject the owner's brokerage mandate (net amount, % commission or fixed fee) | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `lead:read` | Read construction referral leads (contact details gated) | ✔ | ✔ | ✔ |  |  | ✔ |  |  |  |  |
| `lead:create` | Post a construction referral lead | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `lead:claim` | Accept referral terms & claim a lead (contractor) | ✔ |  |  |  |  | ✔ |  |  |  |  |
| `lead:settle` | Record contract value / referral payment | ✔ |  | ✔ |  |  | ✔ |  |  |  |  |
| `dispute:read` | Read disputes the caller is party to | ✔ | ✔ | ✔ | ✔ |  | ✔ | ✔ |  |  |  |
| `dispute:create` | File a dispute | ✔ |  | ✔ | ✔ |  | ✔ | ✔ |  |  |  |
| `dispute:resolve` | Mediate & resolve disputes (lifts settlement hold) | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `builder:projects_read` | View builder projects (commission terms only for partners) | ✔ | ✔ | ✔ |  |  |  | ✔ |  |  |  |
| `builder:project_create` | Launch a builder project | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `builder:associates_read` | See the associate directory & mandates of own projects | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `builder:my_mandates` | See own sales-associate mandates | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `builder:appoint_associate` | Appoint a broker as sales associate | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `builder:record_sale` | Record / approve a booking against a mandate | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `crm:read` | Open the CRM (scope limited to own pipeline / own projects) | ✔ | ✔ | ✔ |  |  |  | ✔ |  |  | ✔ |
| `crm:lead_create` | Register a CRM lead (dedupe-protected) | ✔ |  | ✔ |  |  |  | ✔ |  |  | ✔ |
| `crm:lead_manage` | Update stage, log follow-ups & activities on a lead | ✔ |  | ✔ |  |  |  | ✔ |  |  | ✔ |
| `crm:booking_request` | Submit a booking request for a lead | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `crm:booking_decide` | Approve / reject booking requests, manage payment schedule | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `crm:payout` | Mark associate brokerage as paid | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `inventory:read` | See the live unit / plot grid of a project the caller is mandated on or owns | ✔ | ✔ | ✔ |  |  |  | ✔ |  |  |  |
| `inventory:manage` | Builder: create units, set status, hold window, minimum token and escalator commission slabs | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `inventory:hold` | Broker: place a token hold on an available unit for own lead | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `team:checkin` | Record a GPS + selfie site check-in | ✔ |  | ✔ |  |  | ✔ |  |  |  | ✔ |
| `share:use` | Branded flyers, tracked share links and message templates | ✔ |  | ✔ |  |  |  | ✔ |  |  |  |
| `landrecord:manage` | Record land / khasra details and run the title red-flag scanner | ✔ | ✔ | ✔ |  |  |  |  | ✔ |  |  |
| `team:manage` | Add / suspend own team members and allot CRM leads & deal rooms to them | ✔ | ✔ | ✔ |  |  | ✔ | ✔ |  |  |  |
| `growth:nominate` | Invite-only growth: nominate peers, own invite code, public visiting card, activation checklist | ✔ |  | ✔ |  |  | ✔ | ✔ | ✔ |  |  |
| `growth:manage` | City launch board, growth waitlist / nomination queue, password-reset requests | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `connector:sponsor` | Run own referral-partner network: invite local partners, receive their referrals, reward & pay them | ✔ |  | ✔ |  |  |  |  |  |  |  |
| `crm:bonus_manage` | Define volume-bonus slabs on own projects and pay bonuses to associates | ✔ |  |  |  |  |  | ✔ |  |  |  |
| `crm:assign` | Re-assign leads between associates | ✔ | ✔ |  |  |  |  | ✔ |  |  |  |
| `connector:self` | Connector: own referral dashboard, referral history & reward ledger | ✔ |  |  |  |  |  |  |  | ✔ |  |
| `connector:refer` | Connector: submit a referral (customer must have consented) | ✔ |  |  |  |  |  |  |  | ✔ |  |
| `connector:desk` | GENZ staff desk: view, assign and progress connector referrals (no reward, payout or settings) | ✔ |  |  |  |  |  |  |  |  |  |
| `connector:work` | Broker / contractor: work the connector referrals assigned to you | ✔ |  | ✔ |  |  | ✔ |  |  |  |  |
| `connector:manage` | Review connector partners & referrals, assign, set status, approve rewards | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `connector:payout` | Record the payout of an approved connector reward | ✔ | ✔ |  |  |  |  |  |  |  |  |
| `connector:settings` | Edit the reward table & connector programme switch | ✔ |  |  |  |  |  |  |  |  |  |
| `admin:control_center` | Open the Superadmin Control Center (platform health, function directory, role matrix) | ✔ |  |  |  |  |  |  |  |  |  |

## Resource-level rules (beyond the matrix)

- **Commission confidentiality**: the split, fee, agreement versions, payments, deal notes and COMMISSION audit events are visible only to the two deal brokers (admins: only while a dispute is open; amounts show ₹••• otherwise). The deal API returns the owner a redacted deal (`commercialsHidden: true`, zeroed split/fee, no agreement hash); `agreement:read`, `agreement:sign` and `collab:read` are not granted to PROPERTY_OWNER. Deal chat has a brokers-only channel (`audience: "BROKERS"`) that owners never receive.
- **Owner property scoping**: an owner (and any PROPERTY_OWNER account) only ever sees properties where they are the owner or the listing broker — never another owner's listing, even if the name or phone matches. Brokers/buyers/builders see verified, active listings.
- **Owner mandate (3 brokerage types: net amount / commission % / fixed fee)**: the owner picks the basis, enters the net amount, % (0.1–10) or flat fee, and signs with password re-entry (`mandate:owner_create`/`owner_confirm`); only the property's listing broker can co-sign (`mandate:broker_respond`). Everything above the net amount is the listing broker's remuneration. Statuses: PENDING_BROKER → ACTIVE, or REJECTED / WITHDRAWN / SUPERSEDED. Every step is in the hash-chained audit trail.
- **GENZ Connector (local partners)**: paan / tea / vegetable / kirana / salon / tailor / medical-store owners, auto-rickshaw drivers, RWA & community members. Phone-only login. They can only submit referrals (customer consent mandatory, 60-day duplicate lock per phone+need) and read **their own** referrals. They never see properties, deals, other users, internal notes or the broker/contractor identity. Reward is approved by admin only after CLOSED_WON and paid by admin with a UTR reference; assigned brokers/contractors see the customer contact but never reward data; reward audit events are hidden from non-admins.
- **Superadmin Control Center**: `admin:control_center` (SUPERADMIN only) — health cards, KYC queue, platform settings (maintenance mode, RERA requirement, protection days, construction %), live function directory generated from this catalog.
- **Deal room (v21)**: introducing/closing broker and owner read it; GENZ admins see a **summary only** (deal value, stage, dashboard totals; API `403 DEAL_SUMMARY_ONLY` on chat/tasks/commission/timeline/stage) unless a dispute is OPEN / UNDER_REVIEW / MEDIATION on that room or GENZ is itself a party (each opening is audited as `DEAL_ADMIN_ACCESS`, visible to the brokers). Legal counsel can read tasks + readiness report but not chat or commissions. Buyers have no deal access.
- **Property**: owner or listing broker edits; exact address, owner net price and documents are shown only to principals, admins, legal, and a broker with a *verified* site visit.
- **Site-visit OTP / QR secret**: never returned to the broker (DEMO_MODE excepted); it goes to the customer by SMS. Verification is rate-limited and bound to deal stage.
- **Commission agreement**: only listed deal participants can propose; only each named signer can sign for themselves; commission payments are written down by the brokers themselves (the other broker confirms or rejects; GENZ records nothing), cannot exceed the outstanding amount, and freeze while a dispute is open.
- **Due diligence**: authenticity must be verified by someone other than the uploader; legal sign-off needs LEGAL_COUNSEL/SUPERADMIN; confidential evidence is filtered by access scope.
- **Task verification**: four-eyes — nobody verifies a duty assigned to themselves, admins included.
- **CRM**: builder sees leads of own projects; broker sees only own leads; admin sees all with phone masked; booking approval/payout only by the project's builder (or SUPERADMIN); a broker can never approve their own booking; brokerage is payable only pro-rata with builder collections.
- **"View as"**: SUPERADMIN only, read-only, 30 minutes, audited — replaces the old open user-switcher.

## Employees (TEAM_MEMBER) — powers depend on the employer
The TEAM_MEMBER column above shows the broker / builder employee. Actual powers come from `memberPermissions(employerRole)`:
- **Broker / Builder staff:** CRM leads & deal rooms allotted by the employer; GPS check-in. No commission, inventory control or connector access.
- **Contractor staff:** `lead:read` — only jobs awarded to the employer, commission and contract value removed; cannot request/accept leads.
- **Admin / Super Admin staff:** `connector:desk` — all connector referrals, assign and progress; no reward approval, payout, settings or KYC.

## Growth (v10)
- `growth:nominate` — Broker, Builder, Contractor, Legal (and Super Admin): invite code, nominations, public card, checklist.
- `growth:manage` — Admin, Super Admin: City Launch board, waitlist / nomination queue. Forgot-password requests need `users:reset_password`.

## v11 permissions
`daily:use`, `pdoc:use`, `report:create`, `report:manage`, `chapter:read`, `chapter:manage`, `loan:submit`, `loan:manage`, `academy:read`.
BROKER: daily/pdoc/report:create/chapter:read/loan:submit/academy. CONTRACTOR, DEVELOPER_BUILDER, LEGAL_COUNSEL: pdoc/report:create/chapter:read/academy. PROPERTY_OWNER: pdoc. ADMIN: report/chapter/loan manage + academy.
Protected docs: sirf owner download kar sakta hai; viewers ko single-use token + watermark; sab access `DocAccessLog` me.

## v12 permissions
`pcontrol:manage` (builder), `pcontrol:partner` (broker), `pcontrol:oversee` (admin, read-only), `pcontrol:staff` (employees of brokers/builders).
Team-lead control (`/api/pcontrol/team/*`) is limited to BROKER / DEVELOPER_BUILDER employers; staff reveal/claim require TEAM_MEMBER. Employee abilities are further limited by the employer-set `teamPolicy` (phone mode, scope, register / mark-lost / claim / verify, open-lead cap, projects).

- **Legal Help (v22)**: a broker raises a request from his own deal room (`legal:request`); counsellors (`legal:desk`) see only requests of their states, with no names / deal room / papers until they claim it and no phone until the broker accepts the fee; papers are shown view-only after acceptance and closed on completion. GENZ staff (`legal:manage`) read the request text, confirm fee payments and decide bypass reports; only the superadmin (`legal:settings`) edits fees. None of this opens a deal room to GENZ.

- **Plans & Fees (v23)**: GENZ admins and the superadmin (`billing:manage`) create fee rules (flat or %, per group / state / person, from a start date — never retroactive), membership plans and member-only features, and confirm / reject / waive payments. Payers (`billing:self`: brokers, builders, counsellors, contractors) see only the fees and plans that apply to them and their own dues. A broker-deal fee line shows GENZ neither the deal nor the commission amount. Owners, buyers, employees and connectors are never billed.


## v25 — KYC vault
`kyc:reveal` sirf SUPERADMIN ke paas hai. Poora Aadhaar + address kholne ke liye: purpose, 15+ akshar ka karan, aur superadmin ka apna password. Har khulna audit me (karan + masked Aadhaar, number nahi) aur member ko 'mera KYC kisne dekha' me dikhta hai. ADMIN / ID-reviewer sirf 'vault me hai ya nahi' dekhte hain.

## v26
- Bypass protection ki maximum limit: sirf SUPERADMIN (`admin:control_center`). Broker sirf limit ke andar din chunta hai.
- Owner-consent queue (signed form check, same-device flag, owner report, cancel): `property:moderate` (ADMIN, SUPERADMIN).
- Draft listings sirf banane wale broker ko dikhte hain. Owner ka consent page bina login ke chalta hai, par logged-in broker/staff wahan se haan nahi de sakta.
- 2FA: koi bhi member chalu kar sakta hai; SUPERADMIN/ADMIN ke liye zor diya jaata hai; production me KYC vault 2FA ke bina nahi khulta.
- Pilot check: `admin:control_center`.
