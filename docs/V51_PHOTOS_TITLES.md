# v51 — Property ki photo har jagah, logo ki jagah, page ke upar ki faltu lines hatin

## Kyon
Aapne dekha tha ki property ki photo sirf Properties ke card mein dikhti hai, baaki jagah nahi, aur app mein asli logo nahi hai. Maine code se check kiya:
- Photo sirf **Properties card** aur **Builder Launchpad** mein thi. Chats, Deals, Deal room, Matches mein nahi.
- Photo na ho to kuch bhi nahi dikhta tha (khaali jagah).
- Logo: header, login aur home-screen icon, teeno jagah sirf dark box mein sunehri "GZ" likha hai. Asli logo file app mein hai hi nahi.
- Har main page ke upar do faltu cheezein: title ke upar ek chhoti grey line ("Deterministic Scoring Algorithm · City-aware Matching", "Broker-to-broker Deal Rooms · 6 deal rooms · anti-bypass rule applies") aur title ke neeche ek grey paragraph.

## 1. Property ki photo — ek hi tareeka (`PropertyThumb`)
- Photo ho to photo. Photo na ho, ya load na ho paye, to **halke rang ka tile** jisme property ke type ka icon hota hai (flat/building, ghar/villa, dukaan/commercial, plot/zameen). Rang property ke naam se tay hota hai, to har property ka tile apna rehta hai.
- Kahan lagi:
  - **Chats ki list:** deal chat ke saamne property ki photo (client chat mein client ke initials pehle jaise).
  - **Deal chat ka header:** inbox se bhi, aur deal room ke Broker Chat se bhi.
  - **Deals:** har card aur list-row mein photo.
  - **Deal room:** upar poori chaudai ka **cover photo**, neeche locality ka naam.
  - **Matches:** card ke upar cover photo (jab property ki photo ho).
- Server: `GET /api/chats/deals` aur deal-hub ke har item mein `cover` (property ki pehli photo) aur `propertyType` jode gaye. Ye naye optional fields hain, purana kuch nahi badla. Photo wahi hai jo us deal ke log pehle se dekh sakte the.

## 2. Logo ki jagah (`BrandMark`)
- Header aur login par ab `BrandMark` dikhta hai. Agar `public/brand/logo.png` file maujood ho to wo dikhti hai; nahi to purana "GZ" box. Yaani logo file daalte hi bina code badle lag jati hai.
- **Abhi asli logo file mujhe nahi mili**, isliye abhi bhi "GZ" dikh raha hai. File aate hi: `public/brand/logo.png` (transparent PNG, square ya chaudi), aur phone ke home-screen icon ke liye square version (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png`).
- Local check kiya: file rakhne par logo dikha, hatane par "GZ" wapas.

## 3. Page title (`PageTitle`)
- Title ke upar ki grey line aur neeche ka paragraph **hata diye**. Ab sirf: **title**, ek chhota **count chip** ("6 deal rooms", "46"), aur ek **(i)** button. (i) dabane par wahi purani samjhaane wali line khulti hai, to kuch jaankari gayi nahi.
- Lagaya: Deals (aur uske Pipeline / Offers / Client rooms / Owners modes), Properties, Buyer & tenant needs, Matches, Disputes, Audit trail, Construction leads, Title check, Shop QR partners.
- Lambe jargon wale titles chhote kiye: "Property & Buyer Matching Engine" → "Matches", "Evidence-Based Property Title Audit & Issue Register" → "Property title check", "Immutable Audit Trail & Hash Chain" → "Audit trail", "Dispute Review & Anti-Bypass Desk" → "Disputes", "Buyer & Tenant Requirements Desk" → "Buyer & tenant needs".
- Properties ka "Valuation" (kul maang-ki-keemat) ab (i) ke andar hai.

## Imaandari wali baatein
- Local check mein bahar ki photos (Unsplash) ki jagah test-tasveerein lagi thi. Asli site par seed ki properties ki photos aayengi; **asli listings jinme photo nahi hai unmein rang wala tile dikhega.** Chahein to aage "photo jodiye" ka nudge bana sakte hain.
- Check phone size (390px) aur ek baar badi screen (1280px) par kiya. Hindi mode mein har naye title ko alag se nahi parakha (text `tx()` se hi aata hai).
- Home, Matches ke card ka andar ka jhamela (ID/type/locality ki line tang hai), aur Deals ke 6 KPI tile abhi waise hi hain. Wo v52 aur v54 mein.
- Manual update nahi kiya (aapka standing instruction).

## Tests
- Naye server test nahi (sirf display aur do optional fields). Poora suite phir chalaya: **60 files / 882 test pass.** `tsc` aur `vite build` saaf.

Files: `src/components/PropertyThumb.tsx` (naya), `BrandMark.tsx` (naya), `PageTitle.tsx` (naya), `ChatsView.tsx`, `DealHub.tsx`, `DealRoomsView.tsx`, `MatchCenterView.tsx`, `PropertiesView.tsx`, `RequirementsView.tsx`, `DisputesView.tsx`, `AuditTrailView.tsx`, `ConstructionView.tsx`, `DueDiligenceView.tsx`, `ShopPartners.tsx`, `Navbar.tsx`, `LoginView.tsx`, `server/dealhub.ts`, `server/chats.ts`.
