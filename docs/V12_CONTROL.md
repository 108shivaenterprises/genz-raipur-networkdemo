# v12 — Builder control, project-wise partner view, staff lead control

## 1. Builder: Project Control (nav tab "Project Control")
| Control | Kya karta hai |
|---|---|
| **Partners → requests** | Broker "Request to sell" bhejta hai → builder **Approve / Shortlist / Decline**. Approve ke time commission %, target units, roz ki max nayi leads, partnership end date set hoti hai. |
| **Pause / Resume** | Partner nayi lead register nahi kar sakta; purani leads protected rehti hain. Reason partner ko dikhta hai. |
| **End partnership** | Reason (≥5 akshar) zaroori. Default: partner ki registered leads protection khatam hone tak uski rehti hain (fair). Option: "open leads builder desk par wapas lo". Pending booking request ho to pehle uska decision. Unit holds free ho jaate hain. |
| **Edit terms** | Commission / quota / daily cap / end date. Note zaroori; history partner ko dikhti hai. Naya commission sirf **aage ki booking requests** par lagta hai. |
| **Rules** | Visibility (Brokers apply kar sakte hain / Invite-only = chhupa), **lead intake pause** (message ke saath), **lead check** (har lead builder verify kare; 48 ghante me jawab na diya to auto-accept), lead protection days (15–180). |
| **Verify leads** | Pending leads: Accept / Reject (reason). Reject = lead LOST + protection release (doosra broker register kar sakta hai). Booking request tab tak band jab tak lead accept na ho. |
| **Notices & files** | Offers / price / launch notices (sirf partners ya sab brokers ko), brochure / price list links (unsafe links blocked). |
| **My staff** | Builder ka kaun sa employee partner leads verify kar sakta hai. |
| **Project details** | Status, price range, default commission, units available, tagline — pehle edit nahi ho sakta tha. |
| **Demand** | "N clients shortlisted by M brokers" — sirf ginti, naam/number kabhi nahi. |
Admin ko read-only view milta hai.

## 2. Channel partner: My Projects (nav tab "My Projects")
- Har project ek jagah, status chip: Active / Paused / Shortlisted by builder / Request sent / Open to apply / Ended.
- Project page: apni shartein (commission, target, daily limit, end date, history), builder notices, brochures, available units (sirf active partner ko), apni leads stage-wise, bookings.
- **Shortlist (project-wise):** apne CRM client ko project + pasand ki units ke saath shortlist karo (partner banne se pehle bhi). "Register as lead" → protected lead (shortlist link ke saath). Sirf apko dikhti hai.
- **Shortlist board:** saare projects ki shortlist ek screen par.

## 3. Staff lead control (My Team → "Lead control")
- **Phone numbers:** Always visible / Tap-to-reveal (har reveal logged, daily cap) / Never. Masked mode me list se number nahi dikhta aur **number se search band** (probing nahi).
- **Routing:** manual / round-robin / least-busy. Leave par, cap par, ya dusre project tak limited staff skip.
- **Pool + claim:** jis lead ko koi na le wo pool me; claim-enabled staff first-come-first-served (cap ke saath).
- **Permissions per staff:** register leads, mark lost, claim, (builder staff) verify, max open leads, kin projects par kaam, "project ki saari leads dekh sake (read-only)".
- **Hand-over / On leave / Suspend:** open leads automatically wapas (routing ya pool me). Bulk allot API.
- **Accountability:** Untouched 24h, Stale 3d, Overdue follow-ups, first-reply time; "kisne kiska number dekha" log.

## Rules jo kabhi nahi tootte
- Lead attribution immutable: pause/revoke se registered lead nahi chheenti (builder ke explicit audited option ke bina).
- Pehle maangi gayi booking pause/expiry ke baad bhi honour hoti hai.
- Har action hash-chained audit trail me (PARTNER_APPROVE / PAUSE / REVOKE / TERMS_CHANGED, CRM_LEAD_ACCEPTED / REJECTED, TEAM_POLICY_SET, CRM_PHONE_REVEALED, LEAD_ROUTING_SET ...).
- Purane employees ka behaviour same (policy na ho to pehle jaisa: number dikhta hai, sirf allotted leads).

## Honest limits
- Reveal ke baad staff number likh/copy kar sakta hai — hum isse roke nahi sakte; cap + log + sirf allotted leads se risk bahut kam hota hai.
- Notices app me dikhte hain (aur activity feed me partner-status events); SMS/WhatsApp push nahi.
- Brochure links external hain; jinhe forward nahi karna unke liye "Protected Docs".

## Phone par test (Hinglish)
1. Broker B → My Projects → koi "Open" project → Request to sell.
2. Builder → Project Control → project → Partners → request → Approve (daily limit 2 daalo).
3. Broker B se 3 leads register karo → teesri par "daily limit" aana chahiye.
4. Builder → Rules → Lead check "I verify each lead" → Broker se lead → Verify tab me dikhe → Reject (reason) → Broker ko "rejected" dikhe.
5. Builder → My Team → Lead control → staff ko "Tap to reveal" → staff login me number masked, "Tap to reveal" dabane par dikhe; builder ke log me entry.
6. Routing "Take turns" → 4 leads register → 2-2 staff ko.
7. Staff ko "On leave" → uski open leads wapas pool/dusre staff ko.
