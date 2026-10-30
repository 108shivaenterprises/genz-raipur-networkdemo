# Prompt to paste into Claude Code (run it inside the unzipped folder)

---

You are a senior security + product auditor. This folder is the complete GENZ Broker Network (invite-only real-estate broker collaboration PWA for India: React + Node/Express, JSON-file storage). Read `LOCAL_SETUP.md` first and run it locally in demo mode (`bash start.sh` or `DEMO_MODE=true SEED_DEMO_DATA=true SEED_DEMO_BULK=true npm run dev`). No external API or key is needed.

Do a detailed, evidence-based audit of the WHOLE app. Do not change code unless I ask; report first. For every finding give: severity (Critical/High/Medium/Low), file:line, how to reproduce (an exact curl or UI steps against the local server), the impact, and a minimal fix. Do not report style nits. Say clearly what you actually ran or read and what you did not.

Cover, in this order:
1. **Access control / IDOR** — for every route in `server.ts` and `server/*.ts` check the guard (`needs(...)`, `ctx()`), and that one broker can never read or change another broker's clients, leads, deals, papers, visits, chats, or a hidden phone number. Test as two different demo brokers, a buyer, an owner, an admin and the superadmin (`docs/ACCESS_CONTROL.md`, `docs/DEMO_ACCOUNTS.md`). Public pages `/s /r /q /sp /a /c /oc /report /pay /p /v` and `/api/brand/*` and `/api/feed`.
2. **Number-masking / anti-bypass** — shop-QR leads (`server/shopPartners.ts`: the number stays hidden until the need is confirmed and a matching home is shared), chat blocking of phone numbers, client-room links, visit OTP/QR (maker ≠ checker), mandate/protection days. Try to leak or bypass.
3. **Auth + session** — cookie signing, OTP flows, rate limits, password rules, demo-mode leakage (confirm DEMO_MODE false removes demo logins/OTP display), CSRF, CORS, headers.
4. **Input handling** — zod schemas (`server/validation.ts`), HTML injection/XSS in every server-rendered page (esc()), uploads (type sniffing, size, the logo upload, ID docs, papers), SSRF, path traversal, prototype pollution, JSON body limits.
5. **Data privacy (DPDP)** — KYC vault, Aadhaar handling, retention/erasure jobs, audit trail integrity (hash chain), what leaves the server in each API response (over-fetching of phone/email/PAN).
6. **Money + deal logic** — brokerage/fee %, final price, shop-partner share, offers/tokens, settlement, double counting, rounding, race conditions (parallel requests), idempotency.
7. **Matching + location engine** — `src/shared/places.ts`, `server/matching.ts`, `server/daily.ts`, `server/broadcast.ts`, `server/feed.ts`: wrong matches, sold/rented/withdrawn/held/expired listings leaking into match, feed, public pages or QR; city/area spelling; performance at 10k users.
8. **Reliability** — file-storage write safety/corruption, timers/sweeps, memory growth, error handling, startup with an empty or corrupted `data/`.
9. **Frontend** — broken flows, a11y, mobile 360px layouts, Hindi/English strings, console errors (use Playwright against the local server if available).
10. **Test quality** — tests that pass without testing anything; important flows with no test; flaky tests. Run `npm run lint` and a sample of `npm test` files and report results.

Finish with: (a) a ranked top-10 fix list, (b) what is solid, (c) what you could not verify and why. Keep the report in `AUDIT_REPORT.md`.

---
