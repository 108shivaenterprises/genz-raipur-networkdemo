# V82 — Shop QR: hissa deal ke saath khud chale · badla to dukaan ko khabar · bypass par roak

Aapki baat: "Shop QR ko behtar karo ki shopkeeper ko interest aaye, zyada lead laaye, aur broker bypass na kare. **Thank-you/bonus wale plan se farzi lead ka nukshan** hoga — usse chhodo. Baaki banao. **Hissa mandate aur final deal ke hisaab se khud fix dikhe; badla jaaye to shopkeeper ko notification jaye, jise wo lead (customer) ya broker se confirm kar sake.**"

## Jo chhoda gaya (jaanbujhkar)
- Customer ko "thank-you" / visit bonus / shopkeeper khud lead register kare — **nahi banaya.** Shopkeeper se koi bhi lead *banti* nahi; lead sirf customer ke apne QR scan se aati hai (honeypot, 2.5 sec timer, rate limit pehle jaisa).

## 1) Hissa khud nikalta hai — kisi se type nahi karwaya jaata
Dukaan ka hissa = **us lead ki apni taraf ki brokerage** ka (% ya fixed ₹) — aur wo brokerage ऐप **deal se** nikaalta hai. **Doosri taraf ki kamai gini nahi jaati.**

| Dukaan se kaun aaya | Brokerage kahan se | Doosri taraf |
|---|---|---|
| Khareedar / kirayedaar (BUY, RENT_IN) | broker ka us khareedar/kirayedaar se tay **buyer-side fee plan** (हिसाब) | owner ka mandate **nahi** gina |
| Owner (SELL, RENT_OUT) | owner ke saath sign kiya **mandate** (final price par) | buyer ki fee **nahi** gini |

Example: broker ne owner se 2% mandate sign kiya aur buyer se 1% fee tay ki; ₹50 lakh ki deal. Dukaan se **khareedar** aaya → dukaan ka hissa sirf buyer ke 1% (₹50,000) par; **owner** aaya → sirf owner ke 2% (₹1,00,000) par. Broker ka apna हिसाब dono jodta hai (₹1,50,000) — par dukaan ko sirf apni taraf ka hissa.
Jab lead ki taraf ki koi fee tay hi nahi (jaise khareedar se kuch nahi liya) → ऐप ke paas us taraf ka figure nahi → broker khud likhta hai aur dukaan se confirm maanga jaata hai. (Purane own-side / split / haath se likhe हिसाब mein per-side figure nahi hota, wahan broker ka poora figure hi use hota hai.)

| Sthiti | Kya hota hai |
|---|---|
| Deal ऐप mein hai | "Deal done" dabate hi ऐप ka nikala hissa fix ho jaata hai, broker ko kuch likhna nahi. Dukaan ko wahi rakam dikhti hai. |
| Broker kehta hai "meri brokerage alag hai" | "यह मेरी ब्रोकरेज नहीं — बदलें" ke andar likhe + **wajah (3+ akshar) zaroori**. Bina wajah server **400** deta hai. Dukaan ko *purana → naya* aur wajah dikhti hai. |
| Deal ऐप mein nahi chali | Broker apni brokerage likhta hai → dukaan se **confirm** maanga jaata hai (change "ब्रोकर ने ख़ुद लिखी"). |
| Deal ke dauran (Agreement ke baad) price / mandate / fee plan / हिसाब badla | Dukaan ko apne-aap khabar: *₹X → ₹Y*, wajah ka label (deal badli / broker ne brokerage badli). 30 min ke andar ke kai edit **ek hi change** mein jud jaate hain (spam nahi); wapas purani rakam par aaye to change gayab. |
| "Deal done" ke baad, paisa dene se pehle | Broker "हिस्सा सुधारें" (wajah ke saath) — dukaan ko phir khabar. Paisa de diya to ye band; desk dekhega. |

**Dukaan ko kabhi nahi dikhta:** broker ki apni brokerage, deal ka price, customer ka poora number/naam (sirf aakhri 4 ank).

## 2) Dukaan wale ka jawab — "ठीक है" / "सही नहीं"
- Har change par **peela card**: purana ~~₹2,000~~ → naya **₹1,500**, wajah, tareekh.
- **ठीक है** → record mein "dukaan ne maana ✔".
- **सही नहीं** (wajah likhe) → **GENZ desk** ki list mein `SHARE_DISPUTED`; broker ko push; broker apna **jawab** likh sakta hai jo dukaan ke page par dikhta hai.
- Confirm karne ke do tareeke: **broker se poochho** (sawal lead ki history mein + broker ko push) ya **customer se poochho** (niche).

## 3) Customer se poochna (sirf uski apni ijazat se)
- QR form mein **alag, vaikalpik, bina tick wala** box: *"GENZ mujhe ek SMS bhej kar poochh sakta hai ki baat aage badhi ya nahi."* Contact wali sahmati se alag. Sirf **naye** leads par `outcomeOk`.
- Dukaan "ग्राहक से पूछें" dabaye → **ek SMS** (24 ghante ka gap, max 2 baar, 7 din valid, dukaan ke din ka 10 limit). SMS mein na dukaan ka naam, na koi rakam.
- Link kholne par sirf sawal dikhta hai (GET jawab nahi maanta — link-preview/scanner se galti nahi) → **haan / nahi** dabane par jawab dard hota hai; badla nahi ja sakta.
- Dukaan ko sirf "haan/nahi" dikhta hai. Agar customer **haan** kehta hai par broker ne deal likhi nahi → broker ko aur GENZ desk ko flag `CUSTOMER_YES`. Deal likhi hai par customer **nahi** kehta → `CUSTOMER_NO`.
- Agar `outcomeOk` nahi hai ya SMS chalu nahi → button hi nahi / saaf message; **kisi ko SMS nahi jaata.**

## 4) Paisa dene mein dhilai ka kharcha (GENZ paisa nahi rakhta)
- **"मैंने चुका दिया"** ab zaroori: UPI ya Bank + **reference (UTR)** (6+ akshar). Cash chuna to reference nahi, par dukaan ke "मिल गया" dabane par hi pakka.
- Dukaan ko mode + reference dikhta hai; "मिल गया" / "नहीं मिला" (wajah ke saath → desk).
- Chuka diya par dukaan ne 3 din tak nahi maana → dukaan ko ek yaad-dilaai.
- **Der se dene par (deal done ke din se):** 3, 7, 12 din par broker ko reminder · **15 din par QR GENZ rok deta hai** (naye request band; "GENZ ne roka" dikhta hai; broker khud resume nahi kar sakta jab tak bakaya chuka na de — chukate hi apne-aap chalu) · **30 din par GENZ desk** ki list mein (koi automatic strike nahi — insaan dekhega).
- **Broker ka record:** "dukaan partners ko 15 din mein hissa: N mein se M" — broker ko aur dukaan ko dikhta hai (sirf is broker ka, sirf ginti).

## 5) Dukaan ka page ab ऐप jaisa
- **Alerts:** page par "अलर्ट चालू करें" (push); lead aage badhe, hissa bane/badle, paisa bheja, reminder — sab phone par. iPhone par pehle "Add to Home Screen". Lock-screen par customer ka naam/number kabhi nahi.
- **Home screen par jodo** (manifest `/sp/<token>/manifest.webmanifest`); service worker `/sp/` pages ko kabhi cache nahi karta.
- Kamai: mila / raaste mein / baaki; **is mahine ka rank** ("Raipur ke N QR partners mein #K", sirf jab 3+ active ho); lead ka 5-step progress; hissa "fix" likha hua (ऐप ne nikala / broker ne likha).
- **Certificate** (`/sp/<token>/certificate`, A4 landscape): "GENZ नेटवर्क पार्टनर" + dukaan, broker, QR. Likha hai ki ye **referral partnership ka saboot hai, licence ya sarkari manyata nahi**. "Verified" shabd nahi.

## 6) Broker ke liye pitch kit
- **Partners** tab ke upar "दुकानदार को कैसे समझाएँ": WhatsApp message (copy / bhejo) + 4 aam sawal-jawab (mujhe kya milega? rakam sahi kaise? der hui to? baad mein hata to nahi doge?).
- Har partner card par **समझाने वाला पर्चा** (`/api/shop-partners/:id/leaflet`, A4): uski apni sharten, ek udaharan, hissa kaise tay hota hai, der par kya hota hai, kya nahi karna.
- **Behtar poster** (A5, `?size=a4` se A4): bada QR, 3 steps (scan → likho → broker ka call), broker ka naam + RERA. Likha hai *"GENZ aapse koi paisa nahi leta"* — **"koi fee nahi" nahi** (broker ki brokerage lagti hai).

## Technical
- Naye/badle: `src/shared/shopPartner.ts` (niyam), `server/shopPartners.ts` (`closeLead`, `autoShare`, `watchLead/watchShares`, `sweepShopPartners`, `lazySweep`, `overdueOf`, shop page, `/sp/app.js`, manifest, push, certificate, `/q/ok/:token`), `server/hisaab.ts` (`leadShareInfo`; `watchShares` jab हिसाब ka due/plan badle), `server/webpush.ts` (`shop:<id>` keys), `server.ts` (hook + final price / agreement / mandate par `watchShop` + sweeps), `public/sw.js`, `src/components/ShopPartners.tsx`, `src/lib/api.ts`.
- **Vercel par sweep:** hourly timer bharose ka nahi → broker ki list kholne aur dukaan ka page kholne par bhi sweep chalta hai (10 min throttle).
- Naya data: `PartnerLead.shareSeen/shareChanges/stepSeen/outcomeOk/ask`, `won.source/dealId/auto`, `payout.mode/remind/deskAt/askedAt`, `ShopPartner.pausedBy/pauseReason`. Purane records waise hi chalte hain.

## Test
- `v82-share-follows-deal` (13): niyam, hissa deal se, badlav merge/gayab, BROKER_EDIT, "Deal done" teen raaste (deal / correction bina wajah 400 / deal nahi), 3-7-12 reminder, 15 din pause, 30 din desk, 3 din nudge.
- `v82-shop-app` (10, asli HTTP + SMS mock): SMS code se login, manifest/JS, push sirf signed-in phone aur jaane-pehchane push service se, optional SMS box, typed brokerage → dukaan ko change, "ठीक है", sudhaar + "सही नहीं" + broker jawab + desk, UPI reference zaroori, customer se poochna (bina tick ke SMS nahi; GET jawab nahi; ek hi jawab), `CUSTOMER_YES` flag, poster/leaflet/certificate.
- `v82-ui` (14): screen ke guard + har naye vaakya ka Hindi.

## Imaandari wali baatein (abhi kya nahi)
- **Customer ko SMS ke liye SMS provider chahiye** (`SMS_WEBHOOK_URL`) aur India mein **DLT template** register karwana padega — warna SMS nahi jaayega. Bina SMS ke "ग्राहक से पूछें" band rehta hai; broker se poochna chalta hai.
- **Push sirf unhe jaata hai jinhone page par "अलर्ट चालू करें" dabaya.** iPhone par sirf home-screen wale ऐप mein. Baaki ko reminder/ख़बर tabhi dikhegi jab wo page kholenge.
- **Rank** chhote shahar mein (3 se kam active dukaan) nahi dikhta.
- **Hissa tabhi "auto" hai jab deal ऐप mein chali** aur uska fee plan/mandate bhara ho. Warna broker ka likha hua, aur dukaan se confirm maanga jaata hai — wo bhi "farzi" ho sakta hai; isiliye "ठीक है/सही नहीं", customer se poochna, aur desk.
- **15 din ka auto-pause** sirf naye QR request rokta hai; purani lead aur unka hissa waisa hi rehta hai.
- Paise ko "**referral fee**" kehne aur is poori vyavastha (SMS consent ke shabd, pause ki shart, certificate ka shabd, RERA ke niyam) ke liye **vakil/CA se ek baar** zaroor puchhein.
- Pitch PDF **update nahi kiya** (aapka standing instruction).
