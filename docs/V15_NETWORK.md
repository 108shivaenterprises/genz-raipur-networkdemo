# v15 — 2-Tier network, vouching, tie-ups, builder channel, trust profile

> **v18 se badla:** Tier 2 ki entry ab "2 vouch / City Captain" nahi — sirf RERA-registered (Tier 1) sponsor, ek kaafi; Tier 2 sponsor nahi ban sakta; PAN + Aadhaar (last 4) + admin ka "ID dekha" zaroori. Dekhiye `docs/V18_RERA_SPONSOR_ID.md`. Neeche ki vouch wali lines purani hain.


## 1. 2-Tier verification (RERA ki jagah)
- **Tier 1 — RERA no. on file (pehle "RERA Verified" likha tha — GENZ registry se match nahi karta, isliye label badla):** registered agencies / primary channel partners. Builder projects aur unit hold sirf inhe milte hain.
- **Tier 2 — Local Associate (vouched):** RERA nahi maanga jaata. Entry: **City Captain ka akela vouch** YA **same city ke 2 independent members ke vouch**, + phone-bound invitation + local reference. Admin ka final KYC approval abhi bhi hota hai (RERA ke bina).
- Label hamesha "Local Associate (vouched)" — kabhi "RERA verified" nahi.
- Tier 2 ki scope: resale, rental, land, commercial, local inventory. **Builder projects / unit hold / new-project tie-ups band** (RERA law registered projects ke agents par lagta hai).
- **30 din probation:** max 5 live listings, 3 live offers; probation me vouch nahi kar sakte.

## 2. Vouch ki zimmedari (junk / ring rokne ke liye)
- Member: mahine me 2 vouch; City Captain: 10. Sirf apne city ke log.
- Apne phone / company wale ke saath vouch nahi.
- Jis ko aapne vouch kiya wo suspend / blacklist hua → aapko **strike**. 2 strikes = 180 din vouch band.
- Captain ka har vouch audit log me, admin board par dikhta hai (captain single point of power na bane).
- Admin `POST /api/network/tier/:id` se Tier 1 set kar sakta hai (valid RERA ke saath).

## 3. Tie-up engine (`/api/tieups`)
- Broker↔broker: buyer-side share % (10–90), scope (resale/rental/land/new-project/commercial), city, validity (7–365 din).
- Dono side accept; sha256 seal; end with reason. Unanswered proposal 14 din me lapse.
- Accepted offer par deal room khulta hai to **split tie-up se pre-fill** (`tieupId`).
- GENZ sirf record karta hai, paisa kabhi nahi chhuta. Builder mandates isi list me dikhte hain.

## 4. Builder channel
- **Open mandate** (sab Tier 1) ya **Invited members only** (existing `access`).
- **GENZ desk (coordination only):** builder project par ON kare → visits / paperwork / launch-day ki request. GENZ khud buyer ko nahi bechta, commission / paisa nahi.
- Attribution rule: jo broker lead pehle register kare wahi owner, channel koi bhi ho.

## 5. Growth + trust
- Invite tree (3 level), City Captain board, admin city-density board (target 300 active brokers/city).
- Trust card: tier badge, closed deals, verified visits, tie-ups, builder partners, vouches. Phone/email kabhi nahi.
- Referral rewards sirf points (existing), cash nahi.

## Limits (honest)
- Tier 2 me phone OTP real SMS nahi (invitation phone-bound + admin approval hi asli gate). SMS provider baad me.
- Spread / 48-hr advance payout / master invoice **nahi banaye** — GENZ neutral aur money-free hai. Entity + CA + lawyer + builder LOI ke baad.
- Retention / strike / probation numbers `src/shared/networkRules.ts` me constants hain.
