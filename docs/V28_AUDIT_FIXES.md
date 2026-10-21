# v28 — Krishna ki 3 shikayatein + poore app ka role-wise audit

Krishna ne bataya: (1) WhatsApp paste sirf listing leta hai, buyer requirement nahi; (2) commission consent me "superadmin ka password" maangta hai; (3) normal form se listing daalne par owner ko approval nahi jaata; aur legal, broker, builder→broker me aur glitch hain — sab dhoondh kar theek karo, check karo, phir theek karo.

## 1. Teen shikayatein
**WhatsApp paste → buyer requirement bhi** (`src/shared/waParse.ts`: `kindOf`, `parseNeed`, `findBudget`, `findLocalities`)
- "chahiye / required / need / wanted / looking for / budget / client ke liye / चाहिए / ज़रूरत / बजट…" wale message **Buyer need** bante hain; "available / owner direct / bikau" wale listing hi rehte hain.
- Budget: "40-50 L", "40 se 50 lakh", "1.2 to 1.5 cr", "50 L tak / upto", "budget 45 lakh", "20k-25k". Kai ilaake ek saath ("Shankar Nagar / Telibandha / Avanti Vihar"). Rent apne aap pehchaana jaata hai.
- Paste screen par alag **"Buyer needs"** section: client ka naam + mobile bharo → **"Save as Buyer Need"** → Buyer Needs me jaata hai, matching shuru. Need kabhi owner ke paas nahi jaati (`NEED_DRAFT`).
- Buyer Needs page par bhi **"WhatsApp se ज़रूरत पेस्ट करें"** button; broker home ka button "WhatsApp se — listing ya khareedar ki zaroorat".

**Commission par password nahi** — brokerage terms ab ek **tick** se confirm hoti hain ("main sahmat hoon — ye mera e-sign hai", samay ke saath darj). Wajah: browser saved superadmin password apne aap bhar deta tha. Server: `agreeTerms: true` zaroori (`TERMS_NOT_AGREED`, hi+en).

**Normal form se listing → owner approval**
- "Register New Property" ke baad seedha owner-approval draft khulta hai (sab details pehle se bhari) → protection ke din + brokerage chuno → **WhatsApp par owner ko link**. Owner ki haan → listing par protection date (aur brokerage ho to ACTIVE mandate).
- Har aisi listing ke card par **"Owner approval baaki — Maalik ko bhejein"**.
- Jab superadmin ne "owner consent zaroori" ON kiya ho: form ki details **draft** ban jaati hain (kuch live nahi hota), PIN / landmark / photos saath rehte hain.
- GENZ staff listing sirf kisi broker ki taraf se kar sakta hai (form me broker chunna zaroori); approval us broker ke card par aata hai.

## 2. Audit me mili aur theek ki gayi galtiyan
| Jagah | Galti | Ab |
|---|---|---|
| Sab | Galat password (2FA band karna, mandate sign) par **logout** ho jaata tha (server 401 deta tha) | 400 + error, session bana rehta hai |
| Sab | Server busy (429) / net gaya to app **login page** par phenk deta tha | 4 baar dobara koshish, sign-in bana rehta hai |
| Sab | API limit **IP** par thi — Jio/Airtel par bahut log ek IP share karte hain (CGNAT) | Login ke baad limit **har member** par; login IP limit 60→300 / 15 min |
| Builder→broker | Dashboard "1 application waiting" Launchpad kholta tha jahan application dikhti hi nahi | Project Control khulta hai (Requests highlight) |
| Builder→broker | Sirf apply kiya broker bhi "Active associates" me gina jaata tha, uspar "+ Record Booking" | Sirf approved partner gine jaate hain; baaki par "Project Control me faisla karein" |
| Legal | Vakil ko apni bheji fees par "your answer needed" | "Fee sent — waiting for the broker"; tile "bakaya GENZ fees" |
| Deal room | Tabs ki line kat kar "3)" dikhta tha | Line wrap hoti hai |
| Property card | Sold dropdown error (v27 me theek), toote photo par naam ka text badges par | "No photo yet" |
| Text | Kai jagah "30-day anti-bypass" fix likha tha | Superadmin ke din ya "GENZ niyam ke din" |
| My Projects | Lead stage sirf English; chip toot kar 2 line | Hindi; ek line |
| Builder | "My network" kholte hi 403 | Sirf broker/superadmin ke liye call |
| Purani listing | Sirf city thi to approval draft "state chahiye" kehta tha | City se state apne aap |
| Owner page | favicon 404 | icon |
| Broker | Due Diligence me doosre brokers ki listing bhi dikhti thi; chunne par "Property not found" | Sirf apni listing / jis deal room me ho / admin-legal; khaali ho to samjhaane wala sandesh |
| Superadmin | Match Center / card par "Propose Split" dikhta tha par server sirf broker se leta hai (403) | Sirf broker ko dikhta hai |
| Superadmin | "List property" aur "Launch New Project" me broker / builder chunne ka option nahi tha → hamesha error | Staff ke liye broker / builder chunna (zaroori) |
| Builder→broker | Approved partner ko unit list na hone par kuch nahi dikhta tha | "Builder ne abhi unit list nahi daali" + kahan daalein; Project Control chip me sahi units |
| Admin | Builder Launchpad me "Launch New Project", "Appoint", "+ Record Booking" dikhte the par ADMIN ko ijazat nahi (403) | Sirf builder / superadmin ko dikhte hain; admin sirf dekhta hai |
| Broker | Deal Desk me offer dete waqt khareedar ka naam-number dobara likhna padta tha | "Meri Buyer Needs se khareedar chunein" |
| Privacy | Owner ke sign aur brokerage terms ka zikr nahi tha | Privacy policy (hi+en) me joda |
| Sab forms | zod ke kachche sandesh ("Too small: expected string to have >=5 characters") | Box ka naam + saaf baat ("Title: write at least 5 characters", "Project Type: choose one of the given options") |

## 3. Kaise check kiya
- Har role (broker, legal, builder, contractor, owner, buyer, admin, superadmin, connector, team) se browser me har tab ka har button (403/5xx/JS error) — saaf.
- Form-filler: har "add / create / send…" form ko data bhar kar submit (UI ⇄ server mismatch, 5xx, 403).
- Poore flow browser me: legal (request → case lena → fees → accept → phone khulna), builder→broker (request to sell → builder ko dikhna), WhatsApp paste (listing + need), form → owner approval, owner ka phone par sign pad.
- `tests/v28-fixes.test.ts` (12, incl. per-member API limit) + v27/v26/v14/owner-mandate tests update. Poori suite: 759 pass.
