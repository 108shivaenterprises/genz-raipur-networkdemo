# v11 — Daily-habit, trust, community (sab free, koi paywall nahi)

Sabhi features `plan = 'free'` par ON hain. `server/features.ts` me flags hain (`sponsoredSlots`, `premiumTeams` = false) — abhi koi upgrade prompt nahi.

## 1. Today (daily digest), lead score, client pipeline
- **Digest ranking (neutral, builder boost nahi):** match 60% + trust 10% + recency + broker ka 👍 (≤6) + shortlist (2) + "boost" (3, sirf points se kharida hua).
  Koi builder/advertiser paisa dekar upar nahi aa sakta.
- **Lead score:** HOT ≥ 60, WARM ≥ 35, baaki COLD. Rule-based: budget clarity, recent contact, site visit, stage, follow-up due.
- **Client pipeline:** New → Spoke → Site visit → Negotiation → Closed/Lost. Notes, follow-up date, WhatsApp wa.me templates (koi API nahi).
- "Paste a lead" parser: WhatsApp/email text paste karo → naam, phone, budget, city nikal ke client card (IMAP ka free substitute).

## 2. Listing expiry + report
- Har listing 30 din me "Confirm still available" maangti hai (23 din par warning). 30 din baad browse se hat jaati hai (delete nahi). Confirm karte hi wapas.
- Purani (v10 tak ki) listings upgrade par `confirmedAt` pa jaati hain — kuch expire nahi hota.
- Report button: 3 alag reporters => listing auto-hold, admin review (Community → Reports).
- **Trust score (100 me):** verified KYC + profile + deals + visits + referrals + freshness + reports ka breakdown dikhta hai.

## 3. Map (Leaflet + OpenStreetMap)
- Pins **approximate** (city centre + locality offset ya rounded coordinates). Exact address sirf verified site visit ke baad.
- OSM tiles free hain, par unki usage policy follow karo; bahut traffic aaye to apna tile server/provider lo.

## 4. Protected documents (view-only) + spam hardening
- Owner upload karta hai (JPEG/PNG/WebP, ≤12 pages, ≤1.5 MB/page; PDF abhi nahi). Share: kis broker ko, expiry, view limit; revoke kabhi bhi.
- Viewer ko download/forward nahi milta; page canvas par har jagah **uska naam + time watermark**; focus jaane par blur; single-use 5-min token; sab access log.
- **Honest limit:** web par screenshot/photo 100% nahi roka ja sakta. GENZ download/forward rokta hai aur leak ko traceable banata hai. Asli block sirf native Android (FLAG_SECURE) me.
- Spam: waitlist par math challenge, chat me >2 link block, <7 din purane account link/phone nahi bhej sakte, same text 3× → 429, naye account ka daily cap (listing 5 / need 10 / collab 5). Demo mode me exempt.

## 5. Chapters + points
- City chapter (admin kholta hai), captain, meets + RSVP + attendance.
- **Points (cash nahi):** listing confirm 5, settled deal 25, verified visit 3, verified referral 15, meet attendance 10. 40/din cap, self-dealing nahi, har (user, kind, ref) sirf ek baar.
- 100 points = 7 din profile boost. Badges 50/150/400/1000. Monthly leaderboard.

## 6. Rate card, Home-loan desk, Academy
- Rate card: locality ka ₹/sq.ft tabhi dikhta hai jab ≥10 sale listings (90 din) ho.
- Loan desk: broker client ko loan referral bhejta hai, admin status track karta hai (koi bank API nahi).
- Academy: 5 bilingual lessons; YouTube ids abhi khaali placeholders hain — apne video ids `src/shared/academy.ts` me daalo.

## Phone par manual test (Hinglish)
1. Broker login → "Today & Clients" → Add client → budget + city → agli subah digest me match dikhna chahiye.
2. Map tab → pins; pin dabao → popup (approximate area likha).
3. My listings → "Confirm still available" → points +5 (Points tab).
4. Dusre broker se listing par Report ×3 → listing hold, admin ko Reports me dikhe.
5. Protected Docs → photo upload → dusre broker ko share → uske phone me naam watermark ke saath dikhe, download button nahi.
6. Admin → Community → chapter banao, captain chuno, meet banao.

## Jaan-boojh ke nahi kiya
- IMAP import (credentials/auth risk) → paste-text parser.
- Web push, admin 2FA, connector auto-pause (auth badlav = aapki manzoori).
- Connector ka cash payout vs "no cash incentives" aur builder-centric Launchpad vs neutral platform — **aapka decision**.
