# Role-wise audit — 23 Oct 2026 (v54 ke baad)

## Kaise check kiya
- **11 account**, har role ka ek: Super admin, Admin, Broker (purana), Broker (naya, verification pending), Owner, Buyer, Contractor, Builder, Legal, Connector, Team member (do — Telecaller aur "sab dikhe" wala).
- Har account se **har tab** phone size (390px) par khola: kul ~170 screen. Har screen par note kiya: server error (4xx/5xx), script error, page ki lambai, shabd, 12px se chhota text, 36px se chhote button, aur page khulte hi kitni API calls jaati hain. Har screen ka screenshot.
- **Data-leak sweep:** har role se ~125 list APIs bulaye aur dekha ki kisi aur ka mobile number response mein to nahi aa raha.
- **Hindi:** broker ki 27 screen aur deal room ke 10 hisse Hindi mein khole, aur English-only lines gini.
- Server ke saare tests: **62 files / 897 test pass** (naye 3 milakar).

## Seedha jawab
- **Koi screen tooti nahi.** 11 role, ~170 screen: 0 server error, 0 script error.
- **1 privacy leak mila — theek kar diya** (neeche §1).
- **2 chhoti galtiyan theek** (admin ka hamesha khaali "Chats", admin ko "broker ne aapko offer bheja" wala banner).
- **Hindi theek hai:** bachi hui English lagbhag sirf user ka data hai (property ke naam, chat ke message). Server ki ek-do line English hain (Title Check: "…is exempt from this check category").
- **Sabse badi kami: kuch screen bahut lambi hain** (neeche §3) aur kuch role ke paas kaam ke feature kam hain (§2).

## 1. Jo maine abhi theek kiya (v54.1)
| Kya | Pehle | Ab |
|---|---|---|
| **Site visit ka buyer** | Property ka **owner** aur deal ka **doosra broker** `GET /api/site-visits` (aur deal room) se **doosre broker ke buyer ka poora naam aur mobile** pa rahe the (jaise "Ankit Tripathi 9100310003"). Yahi to bypass ka raasta hai — v20 mein requirements ke liye band kiya tha, visits mein chhoot gaya tha. | Sirf **visit wala broker** (aur uska staff), **khud buyer** aur **GENZ admin** poora dekhte hain. Owner aur doosre broker ko **initials ("A. T.") aur masked number**. Owner ko OTP abhi bhi dikhta hai (wo visit ka gawah hai). Test: `tests/v54-visit-privacy.test.ts` (3). |
| Admin ka "Chats" | Admin / Super admin ko Chats tab aur header ka chat icon dikhta tha, par admin kisi deal chat ka hissa hota hi nahi → hamesha khaali | Admin ke liye chhupa |
| Admin ke Home par banner | "⚡ Ek broker ne AAPKO co-broking offer bheja — 6 new… aapki property par" — admin offer ka jawab de hi nahi sakta | Banner sirf us broker ko jise offer mila |

**Aapka faisla chahiye:** owner ko visit karne wale ka **poora naam** dikhe (ghar mein kaun aa raha hai — suraksha) ya **initials** (bypass se bachav)? Maine initials rakha hai; poora naam chahiye to ek line ka badlaav hai. Mobile number dono haal mein masked rahega.

## 2. Role by role

### Super admin — 35 tab
- Chal raha: sab tab khulte hain, koi error nahi.
- **Kami:** phone par **35 tab ek lambi line mein** (broker ki tarah group / neeche ka menu nahi). Control Center **17,000px**, 623 chhote akshar; Invite & KYC **8,900px**, 541 chhote akshar, 33 chhote button; Home 8,700px (broker wale chart bhi).
- Sujhav: admin ke liye bhi group-wala menu; Control Center aur Invite & KYC ko tab / section mein todna.

### Admin — 26 tab
- Chal raha: "Today on GENZ" tile (ID review, verification, disputes, UTR…) achhe hain.
- **Kami:** wahi phone menu wali baat; Home 8,500px — "Today" tiles ke baad "Command Center", broker ke chart, inventory… Admin ka asli kaam "Today" mein hai, baaki neeche chala jaye. Zero wale tile chhupane chahiye.
- Connector Desk (admin) **16,600px / 4,100 shabd** — filter / pagination chahiye.

### Broker — 27 tab
- Chal raha: Home, Deals, Chats, Magic Match, Client rooms, Visits sab saaf (v50–v54).
- **Kami:** Title Check **13,500px / 2,363 shabd / 282 chhote akshar / 28 chhote button**; Properties 8,400px; Today & Clients 4,900px (14 chhote button); Connector Desk 6,400px (24 chhote button); Shop QR Partners **36 chhote button**; Share Kit 12; My Team 9.
- **Speed:** har page khulte hi **17–22 API calls** jaati hain (boot). Vercel / kamzor network par ye dheema padta hai. Ek "boot" call mein jodna faydemand.

### Naya broker (verification pending)
- **Dead end:** sirf "Verification in progress… Sign out". Na pata chalta hai ki **kaun sa document chahiye**, na **upload / badalne** ka raasta, na "kitna samay", na GENZ se baat ka tareeka. (Server pending user ko ID upload karne deta hai — `self:update` — par screen par option hi nahi.)
- Sujhav: isi screen par PAN / Aadhaar (masked) ki copy ka status + upload, review ka status ("badlaav maanga: …"), aur aage kya hoga. **Ye KYC ka hissa hai, isliye aapki haan ke bina nahi banaya.**

### Owner — 10 tab
- Chal raha: Home achha hai (meri property, offer, deal room, aane wali visit, "how my listings are doing").
- **Kami:** Title Check 12,600px; "Mark sold / rented" har listing par — theek. Owner ko pata nahi chalta ki **kitne buyer meri jaisi property dhoondh rahe hain** (bina naam-number ke ginti) — ye owner ko platform par rakhta hai.
- Visit mein buyer ab initials (§1, aapka faisla).

### Buyer — 5 tab (sabse patla)
- Chal raha: Home (visit code, kharch calculator), Properties, meri zaroorat, Magic Match.
- **Kami:** property **save / shortlist** nahi; **"I'm interested"** nahi (v16.4 se pending — kis broker ko jaaye, ye niyam aapko tay karna hai); apni **deal / booking track** nahi kar sakta; **documents** (agreement, receipt) nahi; **home loan** madad nahi (sirf broker refer kar sakta hai). Properties 8,100px. "Activity Record" buyer ke kisi kaam ka nahi (80 chhote akshar) — chhupa sakte hain.

### Contractor — 10 tab
- Chal raha: masked lead, referral fee ka do-taraf hisaab, team.
- **Kami (kaam ke tool):** customer ke liye **estimate / BOQ**, **milestone billing** (sirf record — GENZ paisa nahi chhuta), **site diary photo ke saath**, material / labour rate list. Connector Desk 23 chhote button.
- GENZ BUILDCON khud construction karta hai — ye tool aapke apne kaam bhi aayenge.

### Builder — 14 tab
- Chal raha: CRM (source, call list, forward, booking request + payment plan, receipt, payout, TDS, cancel / clawback, reports), Inventory (rate control, kise dikhe, customer link, team board), Project Control, Launch, Visit QR, target / bonus.
- **Kami:**
  1. **Booking ke baad buyer ke liye kuch nahi** — payment schedule, receipt, construction update (photo), documents, snag / complaint. Badi CRM companies ise "buyer portal" kehti hain.
  2. **Builder ↔ channel partner chat nahi** — sirf notice. (v53 wala chat + "+" yahan bhi lag sakta hai: lead, unit, visit, booking ke card.)
  3. **Property Papers nahi** (project ki approval, layout, NOC rakhne ke liye) — builder ke paas sirf Protected Docs hai.
  4. **Land Records nahi** — zameen khareedne wale builder ke liye title red-flag scanner kaam ka hai.
  5. **Demand insight nahi** — "Raipur mein 2 BHK, ₹40–60 L, Kachna ke paas kitne buyer dhoondh rahe" (bina naam-number). Naya project plan karne mein madad.
  6. Unit ka **cost sheet / quotation PDF** (base rate, PLC, parking, GST, stamp duty ka andaaza) — buyer ke liye calculator pehle se hai, builder unit se nahi judta.

### Legal — 12 tab
- Chal raha: legal desk, Title Check, properties, land records.
- **Kami:** inka asli kaam Title Check hai aur wahi 13,500px ka hai — "mere khule kaam" ka filter / tab chahiye.

### Connector — 1 screen
- Chal raha: refer karna, apni history.
- Kami: 49 chhote akshar, 8 chhote button.

### Team member — 5 tab
- Chal raha: Telecaller ka Home ("Call next", open leads, overdue), CRM, Deals, Chats, Visits.
- **Kami:** **Properties / Buyer needs nahi dikhte** (field executive ko listing dekhni padti hai); Client rooms nahi (v55 ke plan mein "team employer ke room mein chat kar sake" switch hai). Sujhav: employer ka switch "properties padh sakta hai (read-only)".

## 3. Sabse lambi screen (phone, 390px)
| Screen | Kisko | Lambai | Shabd | Chhote akshar | Chhote button |
|---|---|---|---|---|---|
| Control Center | Super admin | 17,017px | 3,020 | 623 | 11 |
| Connector Desk | Admin | 16,623px | 4,082 | 64 | 17 |
| **Title Check** | sabko | 12,600–13,500px | 2,300–2,800 | ~280 | ~28 |
| Buyer needs | Admin | 12,391px | 1,335 | 65 | 11 |
| Invite & KYC | Admin | 8,866px | 1,830 | 541 | 33 |
| Properties | sabko | 7,500–9,000px | 700–780 | ~120 | 4–11 |
| Admin Home | Admin | 8,545px | 1,192 | 107 | 2 |
| Builder Launchpad | Admin | 7,815px | 932 | 91 | 1 |
| City Launch | Admin | 7,101px | 925 | 44 | 25 |

(Tulna ke liye: v54 ke baad Magic Match 2,216px, broker Home 1,689px.)

## 4. CRM / builder / sab mein kya jod sakte hain (meri priority)
Pehle se bahut kuch hai (upar Builder dekhiye), isliye sirf woh jo **nahi** hai:
| # | Kya | Kisko | Kyun | GENZ ke niyam |
|---|---|---|---|---|
| 1 | **Title Check saaf** (sirf mere / khule kaam, baaki band) | sab | sabse lambi screen, sabse zyada log khole | — |
| 2 | **CRM ke 8 KPI → 2 tile + chips** (jaise v52 Deals) | builder, broker | upar hi bheed | — |
| 3 | **Builder ↔ partner chat** (v53 "+" ke card: lead, unit, visit, booking) | builder, broker, staff | abhi sirf notice | audit, koi number nahi |
| 4 | **Buyer room (booking ke baad)**: unit, payment schedule, receipt, construction photo, documents, complaint | builder + uska buyer | buyer builder ke saath jude | **sirf record**; online payment nahi |
| 5 | **Demand letter / payment yaad-dilana** (PDF + WhatsApp text) payment schedule se | builder | collection time par | paisa GENZ nahi chhuta |
| 6 | **Construction update** (milestone + photo) partner aur buyer ko | builder | bharosa, kam phone | — |
| 7 | **Rent agreement ki expiry / renewal yaad** + police verification checklist | broker | Raipur mein rent bahut; har 11 mahine renewal = dobara kamai | WhatsApp link hi |
| 8 | **Buyer: save / shortlist + "I'm interested"** | buyer | sabse patla role | "interested" kis broker ko jaaye — **aapka niyam** |
| 9 | **Owner ko anonymous demand ginti** ("12 buyer aapke jaisi property dhoondh rahe") | owner | owner platform par rahe | naam-number nahi |
| 10 | **Builder: Property Papers + Land Records + demand insight** | builder | project paper aur zameen | permission jodna = `permHi` line |
| 11 | **Contractor: estimate / BOQ, milestone billing, site diary** | contractor | kaam ke tool | sirf record |
| 12 | **Pending broker ki screen par ID status + upload** | naya broker | dead end | **KYC — aapki haan** |
| 13 | **Admin ka phone menu (group)** + Control Center / Invite & KYC ko todna | admin | 26–35 tab ek line | — |
| 14 | **Ek "boot" API** (17–22 calls → 1–2) | sab | phone / Vercel par tez | — |
| 15 | Unit **cost sheet / quotation PDF** | builder, partner | buyer ko turant kaagaz | andaaza, CA confirm |

Pehle se plan mein: **v55** — shop partner lead se seedha client room, team ko employer ke client room mein chat ka switch (permission + Hindi line + audit).

## Imaandari wali baatein
- Check desktop browser ko 390px chauda karke kiya, asli phone par nahi. Local photos test-tasveer hain.
- "Chhote button" ka matlab 36px se kam ooncha (Apple / Google 44–48px kehte hain).
- Data-leak sweep sirf 10 ank ke Indian mobile number dhoondhta hai; email / PAN alag se nahi dekhe is baar (v16.4 mein dekhe the).
- Builder CRM mein builder ko associate ke lead ka number dikhta hai — ye **design se** hai (registration-protection aur builder ki site visit ke liye), leak nahi.
- RERA / mandate wali baat parked hai. Manual update nahi kiya.

Sources (industry ke feature dekhne ke liye): [Sell.Do — Buyer portal / CX Hub](https://www.sell.do/products/buyer-portal), [Sell.Do — channel partner ko CRM mein kya chahiye](https://www.sell.do/blog/top-crm-features-channel-partner-in-real-estate-wants)
