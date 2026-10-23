# v59 — Phone alerts: har role ke kaam ki khabar turant

Launch audit (`LAUNCH_AUDIT_V58.md`) ki doosri kami: ek insaan ka kaam doosre tak pahunchta tha, par **phone par khabar nahi aati thi**.
- Builder ko CP ki nayi lead ya booking ki maang app kholne par hi dikhti thi.
- CP ko booking ka faisla, payout ya builder ka notice baad mein pata chalta tha.
- Legal counsellor ko naya case, staff ko di gayi lead, contractor ko naya kaam — sab app kholne par.

Ab ye sab **Web Push** se phone par turant aata hai: free, koi app store nahi, koi paid SMS / WhatsApp service nahi.

## Kis kaam par kise alert
| Rishta | Kaam | Alert kise |
|---|---|---|
| Broker → builder | Project mein partner banne ki maang | builder |
| Builder → broker | Appoint / shortlist / mana | broker (appoint par commission % ke saath) |
| Broker → builder | Nayi partner lead | builder + uska staff jiske paas "lead check" |
| Builder → broker | Lead manzoor / na-manzoor | partner + jis staff ko lead di |
| Builder → broker | Project notice (offer, launch…) | sirf appoint kiye partner |
| Broker → builder | Booking ki maang | builder + lead check wala staff |
| Builder → broker | Booking manzoor / na-manzoor | partner + uska staff |
| Builder → broker | Brokerage bheji | partner (TDS ke baad ki rakam) |
| Broker → builder | Payout confirm / aapatti | builder |
| Dono taraf | Paisa liya / saunpa / builder ne confirm kiya | jinhe paisa confirm karna hai (malik + "money confirm" wala staff), aur collector |
| Builder site | Visit QR scan | partner + uska staff |
| Broker → team | Lead di / bulk lead di / deal room khola | wahi member (deal room ka alert ek hi baar) |
| Broker ↔ broker, owner, staff | Deal room mein naya sandesh | room ke baaki log. 🔒 brokers-only sandesh sirf dono broker ko |
| Broker → legal | Naya case | **us state** ke verified counsellor (broker ka naam nahi — pehle aao, pehle pao) |
| Legal ↔ broker | Case liya, fee quote, manzoor, mana, poora, naya sandesh | doosri taraf |
| Broker → contractor | Nayi construction lead | **us shahar** ke verified contractor (customer ka naam / number nahi) |
| Contractor ↔ broker | Lead li, contract value, referral paid | doosri taraf |
| Naya member → GENZ | KYC ke intezaar mein | GENZ admin / superadmin (naam + shahar; ID number kabhi nahi) |
| GENZ → member | Approve / reject / ID copy badlo | wahi member (raat mein bhi — account ki baat) |
| Growth | Jise aapne nominate / sponsor kiya, wo jud gaya | aap |
| Broker ↔ broker | Dispute | doosri party |

Notification tap karte hi **sahi tab** khulta hai: CRM, Project Control, Legal Desk, Deal room, Disputes, Construction Leads, Invite & KYC, Grow.

## Niyam
- **Customer ka sirf pehla naam.** Number, surname, PAN / Aadhaar kabhi alert mein nahi.
- **Fee manzoor hone se pehle** legal case ke sandesh mein likha number chhupa rehta hai — alert mein bhi.
- **Jo kaam karta hai, use khud alert nahi.**
- **Har insaan ke apne switch** (Alerts card). Saath mein:
  - raat 10 se subah 7 tak shaant (sirf account ki baat chhod kar);
  - din mein max 40 alert.
- **Chat mein bheed nahi:** ek room ka har insaan ko 3 minute mein ek hi alert. Phone par naya alert purane ki jagah dikhta hai.
- **Band account par kuch nahi.** Suspend / blacklist hua staff ya member ke phone par alert band. Pending / rejected ko sirf GENZ ka account wala sandesh.
- **Hindi:** app Hindi mein ho to v59 ke saare alert Hindi mein aate hain. App ki bhasha badalte hi alert ki bhasha bhi badalti hai.
- **Kaam kabhi nahi rukta:** alert fail ho jaaye to bhi kaam poora hota hai.

## Ek phone, kai log (office ka phone)
- **Sign out karte hi** us phone par us insaan ke alert band.
- Pehle wale ne sign out nahi kiya aur doosra insaan usi phone par login kare:
  - pehle wale ke alert **turant** us phone se hat jaate hain;
  - naye insaan ke alert tabhi aate hain jab wo khud "Turn on" dabaye.
- **"View as"** mein phone ke alert nahi badalte.

## Screen
- **Home card:** builder, staff, counsellor, contractor, owner, buyer, connector, admin — sabke Home par "Turn on phone alerts" card.
  - Line role ke hisaab se hai. Jaise builder: "partner lead jode, unit book karne ko kahe, ya payment confirm kare".
  - "Not now" dabane par 14 din chhupa rehta hai.
  - Broker ke Home par ye pehle se "first steps" mein hai, isliye doosra card nahi.
- **Alerts card ke switch** (Home / Privacy & settings):
  - broker ko pehle jaise 6 switch;
  - baaki roles ko "mere kaam ke alert" + raat ka silence.
- **Test alert** ("Alerts chalu ✔") ki line bhi role ke hisaab se, Hindi / English.

## Tests
- Naya `tests/v59-alerts.test.ts` (17 test), API se poora flow:
  - **Builder ↔ CP:**
    - partner request → builder;
    - appoint → broker; doosre broker ko kuch nahi;
    - switch band → alert nahi;
    - lead → builder + lead-check staff. Pehla naam haan; surname / number nahi;
    - lead check → partner;
    - notice → sirf appoint partner;
    - booking → builder + staff; faisla → partner.
  - **Team:** lead → member; deal room → member ek baar.
  - **Deal chat:**
    - sandesh → doosra broker, owner, staff;
    - 3 minute mein doosra alert nahi;
    - 🔒 sandesh owner / staff ko nahi;
    - suspend staff ko nahi.
  - **Phone:**
    - sync: anjaan → none, apna → mine, kisi aur ka → turant chhoda;
    - bina login 401.
  - **Legal:**
    - naya case sirf us state ke counsellor ko, broker ke naam bina;
    - case liya / sandesh / quote / manzoor;
    - chhupa number alert mein bhi chhupa.
  - **Contractor:** shahar ke contractor; lena / value / paid doosri taraf.
  - **KYC:**
    - naya member → admin (ID number nahi);
    - approve → member.
  - **Dispute:** doosri party ko; Hindi line.
- Phone par (390px):
  - builder (en), counsellor (hi), staff (hi), contractor (en) ke Home par card;
  - "Not now" ke baad reload par bhi chhupa;
  - broker ke Home par doosra card nahi;
  - app Hindi → alert ki bhasha `hi`;
  - koi JS error nahi.

## Abhi nahi
- Purane alerts (match, offer, owner consent, subah ka saar, client room) abhi English mein. Agla kadam unki Hindi.
- "Mere pichhle alerts" ki list screen. Server ke paas hai (`/api/push/recent`, apne hi alert), screen baad mein.
- SMS / WhatsApp alert — paid service hai, isliye nahi (niyam).

Files:
- server:
  - `server/alerts.ts` (naya)
  - `server/webpush.ts`, `server/db.ts`, `server.ts`
  - `server/crm.ts`, `server/crm2.ts`, `server/crm4.ts`, `server/pcontrol.ts`, `server/team.ts`, `server/visitpass.ts`
  - `server/legal.ts`, `server/idreview.ts`
- UI:
  - `src/components/AlertsCard.tsx`, `src/components/PrivacyCenter.tsx`, `src/App.tsx`
  - `src/lib/push.ts`, `src/lib/api.ts`
- `tests/v59-alerts.test.ts`
