# GENZ Broker Network — Re-audit (v10)

Scope: every feature area, checked by running the app, not only by reading it. Date: 13 Oct 2026.

## How it was checked
| Check | Method | Result |
|---|---|---|
| Access control on every API | 169 routes × 12 sign-ins (super admin, admin, broker, builder, contractor, legal, owner, buyer, connector, and one employee of a broker / admin / contractor) with empty bodies | **0 server errors (5xx)**; 0 routes answer without a login (except sign-out) |
| Phone-first UI | Opened every tab of every role at 390 px width in a real browser; looked for horizontal overflow, blank screens, console errors | 6 overflow problems + 2 noisy console errors found and fixed (below) |
| Money flows | Read + tested booking decision / collection / payout, connector reward / payout, token hold | State guards, caps and duplicate-submit protection present |
| Dependencies | `npm audit --omit=dev` | 0 known vulnerabilities |
| Automated tests | `npx vitest run` | 168 pass, 1 skipped |

## Findings and what was done
| # | Area | Finding | Status |
|---|---|---|---|
| A1 | Scale | Every `save()` and every audit event rewrote the whole database file synchronously (2 big writes per click). Fine for a demo, a stall at thousands of users. | **Fixed** — writes are coalesced (one write ≤150 ms later) and flushed on shutdown. Use PostgreSQL (`DATABASE_URL`) for production. |
| A2 | Support load | No self-service "forgot password"; ops had to find the user first. At city scale this becomes the #1 support task. | **Fixed** — public request (no account enumeration, rate-limited) → ops queue → one-time password + WhatsApp text. |
| A3 | Mobile | Header pushed the page ~15–250 px wider than the phone; Match Center, Due Diligence, CRM tabs and Control Center also overflowed. | **Fixed** (header wraps; selects and tab strips shrink/scroll). |
| A4 | Console noise | Legal counsel's Deal Rooms tab logged 403 errors (calls it may not use). | **Fixed** (quietly ignored). |
| A5 | Growth | The broker QR card pointed to an in-app link that needs a login — useless for a client or a new broker. | **Fixed** — QR now opens the public visiting card when switched on. |
| A6 | Data quality | City was free text ("gurgaon", "Gurgaon ", "Naya Raipur") → impossible to count per city. | **Fixed** — canonical city names (aliases such as Bombay→Mumbai) at sign-up and in growth analytics. |
| A7 | Onboarding | Only admins could create invitations → a bottleneck for a network that must grow by word of mouth. | **Added** — nominations and a public request-access queue (admin still approves; KYC unchanged). |
| A8 | Design limit | File mode and the PostgreSQL store are single-writer (one server instance). | Documented; fine for the first 12 months on one VPS. Multi-instance needs per-request queries later. |
| A9 | Not verified | SMS / WhatsApp Business API, e-Sign, call masking, payments are not wired (you chose to skip). Real-device testing on Android was not done here. | Open — recommended before the second city. |

## What was added for word-of-mouth growth
1. **Personal invite code + nominations** (`Grow Network` tab). Share on WhatsApp in Hindi / English; the pipeline shows who joined and who got verified; badges at 1 / 3 / 10 / 25 verified invitees.
2. **Request access** (public, on the sign-in page; `/?ref=CODE` opens it pre-filled). Becomes a *city waitlist* — real demand per city.
3. **City Launch board** (ops): verified professionals, KYC pending, waiting list, listings and deals per city; Waitlist → Seeding (5) → Live (15) → Hub (40); "open next" suggestion; top inviters; 30-day funnel.
4. **Public visiting card** `/c/<code>` (opt-in; verified badge, RERA, member-since, listings count; phone only if the member allows; carries a "request access" button). QR card uses it.
5. **Activation checklist + dashboard nudge** (KYC → brand → first listing/project → first tracked link → card → first nomination → first verified nominee).
6. **Forgot-password queue** (see A2).

## Suggested 12-month playbook (using the board)
- **Months 1–2 (Raipur → Seeding/Live):** get 15 verified professionals; every one switches on the public card and puts it on WhatsApp status; each nominates 2.
- **Per new city:** open it only when the board shows ≥10 waiting. Approve the waiting list, pick 2–3 respected local brokers as first nominators, run a small launch meet. Aim for Seeding (5) in 3 weeks, Live (15) in 8 weeks.
- **Order suggestion:** Raipur → Bhilai / Bilaspur → Nagpur → Bhopal / Indore → Pune → Lucknow / Jaipur → metros. Let the waitlist decide, not the list.
- **Watch weekly:** invites per member (target ≥ 1), % of nominees verified (target ≥ 50 %), listings per broker, deals per city.
- **Before city #3:** wire SMS OTP / WhatsApp Business API, move to PostgreSQL, take a daily backup, add a city-admin staff account per city (employee of Admin).

## Not a legal opinion
Public cards show only what the member switches on. Connectors are referral partners, not brokers — have a lawyer / CA confirm reward and TDS terms before paying at scale.
