# V107 — Lead addresses (website form + webhook): portal / ad / website ki pooch-tach seedhe CRM mein

## 0. Kyun
sell.do ke ad mein "lead inlets" (website, portal, ads se lead aana) ek feature tha jo hamare paas **nahi tha** (audit mein pakda gaya). Hamare paas lead sirf haath se bharne, import, ya shop-QR se aati thi. Ab broker ya builder ek **gupt pata** bana sakta hai; us par aayi pooch-tach ek aam lead ban kar uske CRM mein girti hai — wahi duplicate suraksha, wahi intake switch, wahi mandate.

## 1. Seedhi baat — kya hai aur kya NAHI
- **Hai:** (a) hosted enquiry form (link WhatsApp / ad / QR par, ya apni website par paste karne wala form), (b) webhook jise Zapier / Make / koi bhi tool POST kar sake.
- **NAHI hai:** 99acres, MagicBricks, Housing.com, Facebook / Instagram ke saath **seedha connection**. Wo apni leads sirf apne manjoor partner ko dete hain. Owner inhe Zapier / Make (bina coding) se ya portal ke enquiry e-mail ko parse karke jodta hai. Screen par ye likha hai, kahin "native 99acres" ka jhootha daava nahi.

## 2. Kaise chalta hai
| Kaun | Kya karta hai |
|---|---|
| **Broker / builder** (CRM → **Lead addresses** tab) | "New address": ① pooch-tach kahan se (website / portal / Facebook-Instagram / koi aur) ② kaun sa project ③ ek pehchaanne wala naam ④ ek tick: "jo log yahan aate hain unhone sampark ki sahmati di hai". Ek hi project ka ek pata. Max **10** pate. |
| **Website kind** | `/in/<token>` par bilingual enquiry form (project ka naam, RERA, owner ka brand). Neeche "apni website par form lagayein" — copy-paste HTML (consent tick-box + robot jaal ke saath). |
| **Bridge kind** (portal / Meta / other) | `POST /in/<token>` JSON ya form fields. Screen par step-by-step (Zapier / Make), pata copy, sample `curl`. |
| **Customer** | Form bharta hai → "dhanyavaad" page. (Duplicate ho ya naya — customer ko farak nahi dikhta.) |
| **Owner** | Har pate par: aaye / nayi lead / pehle se the / nahi li, aaj ka ginti (x / 300), aakhri 6 pooch-tach (naam ka pehla shabd + number ke aakhri 4 ank + wajah), **Test**, **Pause**, **New secret**, **Delete**. Nayi lead par push alert (owner + jise auto-allot hui). |

## 3. Niyam jo sach mein lagte hain
1. **Wahi darwaza:** har pooch-tach `registerLead` se guzarti hai — builder ka intake PAUSED (423), broker ka mandate aur daily cap, protection-window duplicate, manual verification, staff ko auto-allot. Inlet in sab ko bypass nahi karta.
2. **Consent:** pata banate waqt owner likhit tick karta hai; wo tareekh ke saath lead ke consent record (`via: API`) aur timeline mein jaata hai. **Hosted/website form** bina tick ke nahi jaata (422). Bridge par sender ne saaf "no" bheja to mana (422); kuch na bheja to owner ka bayan chalta hai.
3. **Duplicate:** 200 `{duplicate:true}` — doosri lead nahi. Owner ki **apni** lead (broker ki apni / builder desk ki) ki timeline mein ek line "Customer enquired again…" (10 min mein dobara nahi). **Builder ka pata partner ki lead ki timeline mein kuch nahi likhta** — partner ko ye pata hi nahi chalta ki customer builder ke paas bhi gaya.
4. **Kaun owner:** sirf VERIFIED broker ya builder khud. Staff aur admin nahi (403). Project owner ka apna (builder) ya chalu mandate wala (broker).
5. **Gupt pata:** 24-byte random (32 akshar). Link leak ho to **New secret** — purana turant 404. Pause → 404. User erase hone par uske pate mit jaate hain.
6. **Roz ki seema:** ek pate par 300 koshishein/din (galat bhi gini jaati hain); uske baad 429, owner ko ek baar alert. Alag se IP par 120/min.
7. **Safai:** `<` `>` aur control characters hata diye jaate hain; naam ke bahar sab text escape hota hai; lead ka note 1000 akshar se bada nahi; form ke extra jawab (lead-ad ke sawal) max 8, "Form answers —" ke roop mein note mein.
8. **Budget:** sirf tab number jab saaf rupaye (≥ ₹1 lakh). "40 lakh" ya "45" note mein shabd ban kar rehte hain — andaza nahi lagaya jaata.
9. **Robot jaal:** chhupa `hp_url` bhara to dhanyavaad dikhta hai par kuch nahi banta.
10. **Test button:** asli niyam chalata hai (dry-run, `registerLead` mein `dryRun`), lead nahi banati, ginti nahi badhati; sahi wajah batata hai ("builder ne intake pause kiya hai" / "mandate nahi").
11. **Privacy:** log mein poora number kabhi nahi, sirf naam ka pehla shabd + aakhri 4 ank. CORS `*` sirf POST ke liye, cookie koi nahi (token hi chaabi hai).

## 4. Field ke naam jo samajhte hain
name / full_name / customer name · first_name + last_name · phone / mobile / phone_number / whatsapp / contact · email / email_address · message / comments / requirement / remarks · budget · bhk / config / interest · campaign / portal / utm_source (sourceDetail) · consent / agree / optin. Baaki sab extra jawab ban kar note mein jaate hain. Phone: +91 / 0 / space / dash saaf karke 10 ank (6–9 se shuru) — warna pooch-tach nahi li jaati.

## 5. Code
- `src/shared/inletRules.ts` — `pickFields`, `cleanPhone`, `parseConsent`, `inletNote`, `formSnippet`, `INLET_LIMITS`, `INLET_CHANNELS`.
- `server/db.ts` — `LeadInlet` + `leadInlets` (state, default, migration). `server/privacy.ts` — erase par pate hat jaate hain.
- `server/crm.ts` — `registerLead(… { dryRun })`.
- `server/leadInlets.ts` — `/api/inlets` (list, create, update, rotate, delete, test, snippet) aur `/in/:token` (OPTIONS, GET form, POST). `server.ts` mein mount + `/in` brand strip.
- `src/components/LeadInletsPanel.tsx` + `CrmView.tsx` ka naya "Lead addresses" tab (sirf broker / builder) + `api.ts`.

## 6. Tests
`tests/v107-lead-inlets.test.ts` — 33: reader (field naam, extras, markup, phone, budget, consent, note, snippet, channels) + server (kaun owner, consent, hosted form, galat/bina-tick post, lead + consent record, duplicate, robot jaal, CORS, pause, rotate, doosre ka haath nahi, bridge JSON, consent bridge, 422/placeholder/e-mail, markup, intake 423 + test button, test button koi lead nahi, roz ki seema, builder ka pata + partner ki timeline safe, 10 ki seema). 3 guard hata kar chalaya (hosted-tick, partner-timeline scope, log mein poora number) — teeno pakde gaye.

## 7. Seemayein
1. Ek pata = ek project. Do projects ke liye do pate.
2. Portal / Meta ke liye owner ko Zapier / Make ka apna khata chahiye (unka kharcha owner ka). GENZ unke saath koi integration nahi bechta.
3. Hosted form par customer ko redirect nahi hota; "dhanyavaad" page dikhta hai.
4. Pate ki seema 300/din tay hai (owner badal nahi sakta).
5. Duplicate par builder ka pata partner ki lead mein kuch nahi likhta — builder ko sirf apne pate ke log mein "Already registered … nothing added" dikhta hai.
6. SMS / e-mail se seedha lead lena (inbound e-mail parser) abhi nahi — Zapier / Make ke raaste hi.
