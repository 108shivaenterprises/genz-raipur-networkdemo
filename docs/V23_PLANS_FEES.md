# v23 — Plans & Fees (GENZ ki fee aur membership, admin ke haath me)

Admin aur superadmin dono ek jagah se tay karte hain: GENZ **kis kaam par**, **kis group se**, **kitni** fee lega (flat ₹ ya %), aur **membership** me kya milega (fee me chhoot aur / ya sirf-member features). Tab: **Plans & Fees** (admin), **GENZ Membership** (payer — sirf tab dikhta hai jab us par koi plan / fee / bakaya lagu ho).

## Groups (kis par lagu)
| Group | Kaun |
|---|---|
| Builders / developers | builder accounts |
| Big RERA firms | RERA no. + 5 ya zyada active staff (ya desk ne mark kiya) |
| Independent RERA brokers | RERA no., akele / chhoti agency |
| Local associates | bina RERA no. (Tier 2) |
| Legal counsellors | GENZ legal panel |
| Contractors | construction partners (abhi sirf membership / features) |
Owner, buyer, employee, connector par kabhi koi fee nahi.

## Fee kab lagti hai (3 jagah)
1. **Legal case accept** — counsellor deta hai; % ho to counsellor ki accepted fee par.
2. **Network broker se booking** — builder deta hai jab wo network broker ki booking approve kare; % ho to booking value par. Builder ke apne desk ki sale aur **master-CP project par nahi** (wahan GENZ pehle se kamata hai). Booking cancel → bina-bhugtan fee cancel, bhugtan ho chuki ho to "refund settle karo" flag.
3. **Broker-to-broker deal** — commission payment confirm hone par **paane wala broker** deta hai; % ho to mile hue amount par.

## Fee rule me kya set hota hai
- Flat ₹ ya %; % ke saath **min / max** ₹.
- Groups (event ke payer hi), **states** (khaali = sab), **sirf ye log**, **inpar kabhi nahi**.
- **Start date** — aaj ya aage; peeche ki tareekh nahi (retroactive kabhi nahi).
- Ek se zyada rule match karein to **sabse specific** jeetta hai: person > state > group; phir naya.
- Charge event ke waqt ek baar calculate hokar **freeze** hota hai; baad me rule badle to purana charge nahi badalta.
- Koi rule nahi = koi fee nahi (plan ho tab bhi).

## Membership plan me kya set hota hai
- Naam (en + hi), description, groups, states, include / exclude log.
- **Monthly / yearly price** (khaali = wo option nahi, 0 = free plan, turant chalu).
- Har event par member ki fee: **Free**, **Flat ₹**, **% of base**, ya **normal fee par % chhoot**. Member kabhi normal se zyada nahi deta.
- **Member-only features** jo ye plan kholta hai:
  - *Take legal-help cases* (counsellor) — gate
  - *Ask for legal help* (broker) — gate
  - *Launch Desk me pehle mauka* (independent RERA broker big-firm wave me) — perk; local associate ko bechne ki khidki kabhi nahi (RERA).
- Plan band (closed) = naye member nahi; purane apni avadhi tak rehte hain.
- Ek waqt ek membership; renew / dusra plan maujooda avadhi ke baad shuru.

## Member-only features (gates)
Default sab **OFF** — kuch nahi badalta jab tak admin on na kare. On karne se pehle feature kisi khule plan me hona chahiye (warna koi use hi nahi kar payega). Gate on hone par non-member ko saaf message ("Independent Pro" plan dekhiye).

## Paisa (GENZ chhuta nahi)
Payer app ke bahar bhejta hai → UTR likhta hai → admin **confirm / "nahi mila"** → admin **waive** bhi kar sakta hai (kaaran ke saath). Ek UTR do baar nahi. Membership confirm par avadhi shuru. Admin kisi ko **free membership de** sakta hai (pilot / partner) aur **jaldi khatam** kar sakta hai. Legal case ki fee 30 din se unpaid ho to naye case lena band (v22 jaisa).

## Warning jo admin ko maanni padti hai (server bhi check karta hai)
- **Counsellor ki fee par %** → Bar Council fee-sharing risk; vakil se confirm karein.
- **Broker par koi fee / paid plan** → "brokers ke liye free" ka vaada tha; pehle bataiye. Rule sirf start date se, aur broker apni screen par dekhta hai.
- **Broker deal par %** → GENZ fee se har deal ka commission nikal sakta hai (v21 vaade ke khilaf). GENZ ki screen par deal aur base amount chhupe rehte hain, par fee se andaaza lag jata hai.

## Privacy (v21 waisa hi)
Broker-deal fee ki line GENZ ko **bina deal id, bina base amount** dikhti hai (history me rakam ₹•••). Broker ko apni line poori dikhti hai. Koi fee ya report deal room nahi kholti.

## Fee calculator
Admin kisi vyakti (uski membership ke saath) ya group + state + amount daal kar dekh sakta hai ki fee kitni banegi aur kyon.

## v22 se badlav
- Legal fee aur Legal membership ab Plans & Fees ke ek **rule (FR-0001: ₹500 flat)** aur **plan (PLAN-LEGAL: ₹1,999/mahina, ₹19,999/saal, member ₹250)** ban gaye — "starting figure" tag ke saath. Purani legal ledger lines apne aap naye ledger me aa gayi.
- Legal Help admin me ab sirf time limits aur strikes (superadmin); fees "Plans & Fees" me.
- Fee rules ab **admin bhi** bana / badal sakta hai (aapke kehne par), har badlav audit me.

## Permissions
`billing:manage` (ADMIN, SUPERADMIN), `billing:self` (BROKER, DEVELOPER_BUILDER, LEGAL_COUNSEL, CONTRACTOR). Hindi lines `src/lib/permHi.ts` me.

## Files
`src/shared/billingRules.ts` (groups, events, gates, rule chunna, fee hisaab, warnings), `server/billing.ts` (`/api/billing/*`, charge / cancel hooks, migration), hooks: `server/legal.ts`, `server/crm.ts` (approve / cancel), `server.ts` (commission confirm), `server/launch.ts` (early access), screen `src/components/PlansFees.tsx`, tests `tests/v23-plans-fees.test.ts` (22).
