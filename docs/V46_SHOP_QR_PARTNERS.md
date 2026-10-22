# v46 — Dukaan QR partner + Client room bina baar-baar code ke

## 1. Dukaan QR partner (referral partner)
Broker pamphlet ki jagah apna QR kisi dukaan ya society gate par lagata hai. Customer QR scan karke apni zaroorat bhejta hai, lead broker ko milti hai, aur dukaan wale ko tay hissa milta hai.

**Kaise chalta hai**
1. Broker: **More → Sales & Team → Shop QR Partners → "+ New partner"**.
   - Ye bharna hai: dukaan ka naam, dukaandar ka naam aur mobile, ilaka.
   - Hissa tay karna hai: **sale par** aur **rent par** alag-alag. Har ek ya to broker ki brokerage ka % (max 50%) ho sakta hai, ya har deal par fix ₹.
   - Ye bhi: lead kitne din dukaan ki rahe (default **180 din**, 30–365).
   - Ek sahmati tick.
2. Broker WhatsApp par dukaandar ko uske page ka link bhejta hai.
   - Dukaandar link kholke apna mobile daalta hai aur code daalta hai (SMS se, ya SMS na ho to broker ke card par dikhta hai).
   - Phir wo **"मंज़ूर"** dabata hai. Isse **pehle QR kaam nahi karta.**
3. **QR poster** (A5, Hindi + English, Print/PDF):
   - Poster par broker ka naam aur RERA hota hai, phone number nahi. Isse customer QR se hi aata hai aur dukaan ka credit bana rehta hai.
4. **Customer scan karta hai** (`/q/CODE`). Login ki zaroorat nahi.
   - Form me ye bharta hai: kya chahiye (khareedna / kiraye par chahiye / bechna / kiraye par dena), naam, mobile, ilaka, budget, prakar, note, sahmati.
   - Lead seedha usi broker ke paas jaati hai, aur broker ko push aata hai.
   - Khareedar/kirayedar ka "Today & Clients" me client card bhi apne aap ban jaata hai.
5. **Dukaandar ka page** (`/sp/...`):
   - Shartein, scan / lead / deal ki ginti, kitna baki hai aur kitna mila.
   - Har lead ki halat: ilaka, mobile ke **sirf aakhri 4 ank**, stage, aur kab tak lead dukaan ki hai.
   - Poster ka link, aur broker ko message bhejne ka option.

**Dhokha rokna**
- Lead ka mobile tay din tak usi dukaan ka maana jaata hai. Agar wahi number dobara scan ho, chahe broker ki doosri dukaan par, to pehli dukaan ki lead hi rehti hai.
- Lock ke samay me agar broker usi mobile par kuch bhi karta hai, to wo **apne aap lead se jud jaata hai** aur dukaandar ko bhi dikhta hai:
  - site visit
  - client room
  - buyer need
  - deal room
  - buyer protection
  - naya client card
  - us malik ki listing
- **⚠ Lal nishaan do haalat me lagta hai:**
  - lead ko "आगे नहीं बढ़ी" bataane ke baad bhi us par kaam hua;
  - deal room Agreement / Handover / Settled par hai, ya client card "Deal" par hai, lekin hissa darj nahi hua.
- "Deal done" par broker apni brokerage likhta hai. Dukaan ka hissa usi % ya ₹ se apne aap nikalta hai (kabhi brokerage se zyada nahi). Phir broker "मैंने चुका दिया" dabata hai.
- Dukaandar apne page par **"मिल गया"** ya **"नहीं मिला"** dabata hai (note ke saath). "नहीं मिला" aur lal nishaan wali leads **GENZ desk** (admin) ko dikhti hain.
- **Hissa badalna:**
  - Broker naya hissa prastav karta hai. Dukaandar ke "मंज़ूर" karne tak purana hissa chalta hai.
  - Naya hissa **sirf aage aane wali leads par** lagta hai. Har lead apni shart (version) yaad rakhti hai.
  - Mana karne par purani shart hi rehti hai.
- **Broker ke aur controls:** Pause / Resume / End, naya link, aur dukaandar ke phone hatana. Dukaandar ka page bhi zyada se zyada 2 phone par khulta hai.
- **Paisa:** GENZ ye paisa nahi rakhta, broker khud UPI se deta hai. App me ise "referral fee" likha gaya hai, ek baar CA/vakil se confirm kar lena.
- **Spam rok:**
  - chhupa honeypot field;
  - form 2.5 second se pehle bheja to mana;
  - IP par limit;
  - ek QR par din me 60 lead tak;
  - ek number se din me 3 baar tak;
  - Network Watch me block hua number mana.

**Home tiles:** "दुकान QR से नई लीड", "दुकान पार्टनर का हिस्सा देना है", "दुकान पार्टनर कोड माँग रहे हैं".
**Demo:** Vikramaditya (USR-BRK-001) ke paas 3 partner aur 6 lead hain. Inme ek "paid" wali aur ek lal nishaan wali lead bhi hai.

## 2. Client room: bina baar-baar code, aur galat istemaal par rok
- Ek phone par ek baar code daalne ke baad wo phone **bina code ke khulta hai**. Har baar kholne par session 60 din aage badh jaata hai.
- Room ka link bhi istemaal par aage badhta hai (pehle 60 din me band ho jaata tha), lekin link banne se zyada se zyada 365 din tak.
- **Zyada se zyada 2 phone.** Teesra phone code maangne se pehle hi mana ho jaata hai.
- Broker ko **Client room → Info** me dono phone dikhte hain (prakar aur aakhri baar kab khola). Wo kisi phone ko **हटाएँ** kar sakta hai, jisse wo phone turant logout ho jaata hai.
- Doosre phone par room khulte hi broker ko alert aata hai.
- "नया लिंक" ya "रूम बंद" karne par saare phone hat jaate hain.
- Page par client ka **naam + ••aakhri 4 ank + broker ka naam** halka watermark ki tarah likha rehta hai. Screenshot aage bheja to pata chalega kiska room tha.
- Page par ek line: "बुकमार्क / होम स्क्रीन पर रखें".
- Is update ke baad pehle se khule purane session me client ko **ek baar** dobara code daalna padega.

## Privacy page
Dono nayi cheezon ki jaankari Privacy page me hindi aur english me jod di gayi hai.

## Tests
- `tests/v46-shop-partners.test.ts` (8): niyam; dukaandar ki manzoori ke bina QR band; doosra broker kuch nahi dekh/badal sakta; scan se lead aur client card; dukaan ko sirf ••4 ank; dobara scan par nayi lead nahi; jaldi bheja form mana; "lost" ke baad client room → AFTER_LOST nishaan; GENZ desk; deal → 20% = ₹30,000 → paid → "नहीं मिला"; naya hissa sirf nayi lead par; partner page 2 phone; client room 2 phone, teesra mana, hataya hua phone logout, doosra broker phone nahi hata sakta.
- Browser me poora safar (dukaandar ka phone, customer ka phone, poster print, client room watermark, dobara bina code) check kiya.
- Poora suite: 858 pass.

Files: `src/shared/shopPartner.ts`, `server/shopPartners.ts`, `src/components/ShopPartners.tsx`, `server/clientroom.ts`, `src/shared/clientRoomRules.ts`, `src/components/ClientRooms.tsx`, `server/db.ts`, `server/permissions.ts` (`partner:manage`, `partner:oversee`), `src/lib/permHi.ts`, `server.ts`, `server/reputation.ts`, `src/components/BrokerHome.tsx`, `NavigationTabs.tsx`, `App.tsx`, `lib/api.ts`, `lib/i18n.tsx`, `LegalPages.tsx`.
