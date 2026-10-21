# v35 — Network Watch (commission refuse / direct deal karne wale buyer aur owner)

## Problem
Kuch buyers aur owners broker ki mehnat ke baad commission nahi dete ya seedha doosri party se baat kar lete hain. Ek broker ko pata chalta hai, baaki network ko nahi.

## Kya bana
- **Check:** broker kisi bhi mobile ko kaam shuru karne se pehle check karta hai. Jawab sirf Clear / Caution / Blocked + last 4 digits. Naam ya reporter kabhi nahi.
- **Report:** fixed reason (commission refused, went direct, fake enquiry, abusive), naam, 15+ akshar ka note, aur sabse zaroori **proof** — broker apne hi record (visit, offer, buyer bond, client room, owner consent) ko chunta hai. Server check karta hai ki wo record usi broker ka hai aur usi mobile ka.
- **Levels** (mobile ke HMAC par, 180 din ki reports):
  - WATCH: 1 report. Sirf GENZ staff ko dikhta hai.
  - CAUTION: 2 brokers proof ke saath ya 3 brokers bina proof. Poore network ko caution dikhta hai (check, visit, offer, client room par notice).
  - BLOCKED: sirf GENZ staff, kam se kam ek report uphold karne ke baad. 365 din. Visit, offer, client room aur owner consent refuse hote hain (`403 PARTY_BLOCKED`, hi+en).
- **Safeguards:** har report staff review karta hai. Dismiss hui report reporter ke khilaf strike hai (saal me 3 = report band, `REPORT_LOCKED`). Koi bhi broker appeal bhej sakta hai. Staff kabhi bhi Clear kar sakta hai; Clear ke baad purani reports ginti me nahi aati. Block 1 saal baad khud ruk jata hai aur dobara dekha jata hai.
- **Accounts:** agar blocked mobile kisi GENZ account ka bhi hai to staff ko hint dikhta hai. Account apne aap suspend nahi hota (auth badlav ke liye Krishna ki manzoori chahiye).

## Privacy / DPDP
Mobile sirf HMAC + last 4. Naam aur note sirf reporter aur GENZ staff ko. Network ko sirf level. Privacy page (hi+en) me line jodi gayi.

## Files
`server/partywatch.ts`, `src/shared/partyWatchRules.ts`, `src/components/PartyWatch.tsx` (Disputes & Blacklist tab), `server/db.ts` (`partyAlerts`), permissions `partywatch:report` (broker), `partywatch:review` (admin/superadmin), hooks in `server.ts` (visit), `server/offers.ts`, `server/clientroom.ts`, `server/consent.ts`.
API: `/api/party-watch` check, report, mine, appeal, meta; admin, admin/:id/report/:rid, admin/:id/decide, admin/:id/appeal/:aid.

## Tests
`tests/v35-party-watch.test.ts` (8): clean check, validation + proof, WATCH hidden, CAUTION for 2 proven brokers, staff-only block, blocked visit + client room, appeal + clear, false-report lock.

## Baaki / agla step
- Offer aur owner-consent par block hook laga hai par uska alag test nahi.
- Blocked owner ki listing automatic hide nahi hoti (sirf naye consent refuse hote hain).
