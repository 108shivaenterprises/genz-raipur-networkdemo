# V160 — broker journey gaps (from V157 research)

Four small builds, all broker-side, nothing to the owner/client screens except the existing confirmations.

- **A. Deal dates + registry reminder** — `src/shared/keyDates.ts`, `KeyDates.tsx` in the deal Overview. Token / agreement / registry / possession dates, mutation-done tick, a "registry carry list". `GET/POST /api/deals/:id/key-dates` (brokers of the deal only, audited `DEAL_DATES_SET`, push to the other broker). Home to-do keys `dealDates`, `dealMutation`. Dates are plain India-time `YYYY-MM-DD`, range-checked.
- **B. Joint visit** — `visitJoint` in `visitRules.ts`, `VisitJoint.tsx` chip in deal room visit lists and chat "+" menu: shows owner YES/NO and client ack so the broker sees at a glance if both agreed.
- **C. Post maker** — `src/shared/postMaker.ts` + `PostMaker.tsx`; "Post text" button on my own live listings. WhatsApp group text, Instagram caption + up to 12 hashtags, reel script; Hindi/English; Copy button. Never includes owner name/number/exact address.
- **D. Need reply** — "mere paas hai" already existed (`/api/broadcast/:id/respond`). Added `mins` (need → answer) to `/api/broadcast/mine` and a ⚡ chip per answer (`answerTime`).

Tests: `v158-key-dates`, `v159-visit-joint`, `v160-post-maker`, `v26-launch` (mins).
Not done: reel video generation, auto-posting to Instagram (copy/paste only).
