# v16 — CRM: more control, more workflow, reports

Builder ⇄ Associates CRM ko "list of leads" se "controlled sales pipeline" banaya. **GENZ paisa kabhi nahi chhuta** — jo bhi side bolti hai wo *record* hota hai aur doosri side ko *confirm* karna padta hai.

Code: `server/crm2.ts` (routes + retention sweep), `src/shared/crmRules.ts` (pure rules), UI: `CrmPlus.tsx`, `CrmMoney.tsx`, `CrmReports.tsx`. Tests: `tests/v16-crm.test.ts` (25).

## A. Controls
| Control | Kaise kaam karta hai |
|---|---|
| **Customer consent (DPDP)** | Lead register karne par consent attest karna **zaroori** (form, CSV import, shortlist). `lead.consent` me kaun / kab / kaise (FORM·IMPORT·SHORTLIST) store hota hai. |
| **Opt-out** | Customer mana kare → lead LOST (NOT_INTERESTED), pending follow-ups hat'te hain, call/WhatsApp log + naye follow-up **blocked (409 OPTED_OUT)**, re-open nahi hota. Personal data 30 din baad erase. |
| **Two-side money** | Associate "customer ne pay kiya" **claim** bhejta hai (alert builder ko) → builder **receipt record** karta hai → claim RESOLVED. 7 din unanswered = escalated alert. |
| **Partial collections + reversal** | Ek milestone par kai receipts (amount, mode, UTR/receipt no). Builder reverse kar sakta hai (reason ke saath, bounced cheque). Agar diya hua brokerage reduced collection se zyada ho jaye to **409 PAYOUT_EXCEEDS**. |
| **Payout ledger** | Payout ke liye UTR / cheque no. **zaroori**, mode, date. Associate **CONFIRM / DISPUTE** karta hai (dispute me reason). Unconfirmed 7+ din = alert. |
| **TDS + invoice** | Project-wise TDS % (0–30, default 5). Associate ka PAN nahi → **kam se kam 20%**. Indicative GST 18% (sirf GSTIN wale par) + net breakup. **CA se rate pakka karein.** |
| **Registration-protection extension** | Sirf aakhri 7 din me, pichhle 14 din me *real* activity (call / meeting / visit) ke saath, max 2 baar × 30 din. |
| **Phone correction** | Associate: register karne ke 24 ghante tak; builder: kabhi bhi. Duplicate check, reason zaroori, audit me **masked** numbers. |
| **Retention / erase** | LOST lead (booking nahi) 365 din baad, opt-out 30 din baad: naam / phone / email / notes erase (`erasedAt`). Booking ke financial records safe. Env: `CRM_LOST_RETENTION_DAYS`, `CRM_OPTOUT_RETENTION_DAYS`. SUPERADMIN `POST /api/crm/retention/run`. |
| **Cancellation** | Builder seedha cancel kare ya associate **request** bheje → builder approve (refund / forfeit / clawback) ya reason ke saath decline. Brokerage pehle diya ho to clawback amount batana **zaroori** (0 allowed). Clawback DUE → RECOVERED track hota hai. |

## B. Workflow
- Follow-up **edit / snooze (+1/3/7 din) / delete**; stage badalne par **auto follow-up** (contacted +2d, visited +2d, negotiation +3d).
- **Stale flag** (7+ din koi activity nahi), **temperature** (HOT/WARM/COLD) + **tags** (max 5, searchable).
- **Structured lost reasons** (9 codes) — report me kaam aate hain.
- **Visit feedback** (rating, kya pasand aaya, objection, next step; max 5).
- **CSV import** (≤200 rows, per-row result, consent zaroori, 5/din) aur **CSV export** (default **masked** phone, formula-injection safe, audit, 10/din, employees ko nahi, admin ko full number kabhi nahi).
- **Bulk actions** (≤50): temperature, tag, follow-up, lost. **Filters + pagination** (project, temperature, source, overdue, stale, expiring, search; 200/page).
- **WhatsApp templates** (6, hi/en) — `wa.me` link, client-side, koi paid API nahi. Opted-out leads par nahi dikhta.

## C. Alerts + reports
- `GET /api/crm/alerts` — role-wise: follow-up overdue, protection expiring, stale, verify pending, claim open/escalated, collection overdue, cancel request, payout disputed / unconfirmed / new, clawback due. UI me chips — click karo to list filter ho jaati hai.
- `GET /api/crm/reports?days=` — funnel, project table, **associate scorecard** (first-reply hours, overdue, stale), source table, lost reasons, aging, money flags. Broker sirf apne numbers dekhta hai; employee ko money block nahi.

## Permissions
Koi naya permission nahi. Claims / ack / cancel-request `crm:booking_request` (associate), receipts / reversal / clawback / cancel decision `crm:booking_decide` (builder), payout + TDS `crm:payout`.

## Limits (honest)
- GENZ **bank movement verify nahi kar sakta** — claim / confirm *record + escalate* karta hai, proof nahi. Dispute ka faisla parties ko khud karna hai.
- Consent **attestation** hai (registering user ki zimmedari), customer se OTP / link nahi. Customer-side opt-out link ke liye SMS/WhatsApp provider chahiye (baad me).
- TDS 5% / no-PAN 20% / GST 18% **indicative**; retention periods (365 / 30 din) aapke **lawyer / CA** se confirm karein.
- Alerts sirf in-app hain (push / SMS nahi). Server error messages abhi English me hain; UI hi/en dono.
- `altPhone` (doosra number) jaan-boojh kar nahi banaya — privacy surface badhta hai.
