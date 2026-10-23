# v60 — Rent desk: kiraye ki deal ke baad ka poora kaam

Launch audit (`LAUNCH_AUDIT_V58.md`) ki teesri kami: Raipur mein brokers ka bada kaam **kiraya** hai. Par app mein kiraye ki deal hone ke baad kuch nahi tha:
- kiraya, deposit, lock-in ki shartein kahin likhi nahi rehti thi;
- kirayedar ka police verification yaad dilane wala koi nahi tha;
- 11 mahine baad renewal — broker ki dobara kamai — yaad nahi rehta tha;
- kirayedar ke jaane par ghar dobara list karna haath se hota tha;
- kiraye ke deal room mein sale wale kaam dikhte the (loan, registry, survey).

## Kya bana
Naya tab **Deals → Rent desk** (sirf broker ke liye):

1. **Kirayedari darj karein** — teen jagah se:
   - kiraye wale **deal room** se;
   - apni **kiraye ki listing** se (owner ka naam / number apne aap aata hai);
   - **haath se** (pehle ki karwai kirayedari).
   - Shartein: kiraya, deposit, maintenance, kab se, kitne mahine (default 11), lock-in, saalana badhotri %, notice ke din, agreement ka step.
   - **Khatam hone ki tareekh khud nikalti hai** (1 Nov + 11 mahine = 30 Sep).
2. **Police verification** — har kirayedari par:
   - step: shuru nahi / form jama / verify ho gaya;
   - tareekh, thana, **paavti (acknowledgement) number**;
   - kya saath le jaayein — checklist (photo, ID copy, ghar ka pata, owner ki jaankari);
   - thane mein ya **CG Police Citizen Portal** par jama;
   - owner ko checklist **WhatsApp** par.
   - **Kirayedar ka Aadhaar / ID kabhi app mein nahi.** 12 ank wala number paavti mein likhne par app rok deta hai.
3. **Yaad dilana** (phone alert + Home tile):
   - agreement khatam hone se **60 / 30 / 7 din pehle**, aur avadhi khatam hone par;
   - police verification start ke **7 din baad bhi baaki** ho to ek baar;
   - alert sirf subah 9 se raat 8 ke beech (raat ke silence mein kho na jaaye).
4. **WhatsApp lines** (broker ke apne phone se, free):
   - owner se: "renew karna hai ya naya kirayedar?";
   - kirayedar se: "aage rehna hai? naya kiraya lagbhag ₹…";
   - dono ko tay shartein.
5. **Renew** — purani avadhi ke agle din se naya term:
   - naya kiraya saalana badhotri ke saath apne aap sujhaya jaata hai (₹16,000 + 5% = ₹16,800);
   - naye term ke liye naya agreement (step wapas "abhi nahi bana").
6. **Notice** (owner ya kirayedar ne diya) → ghar kis din tak khali hona hai.
7. **Khali hua** — tareekh + deposit ka kya hua. Ghar broker ki listing tha to button "**Ye ghar dobara kiraye ke liye GENZ par daalein**" — nayi listing bante hi verification phir se.
8. **Shartein ki sheet** (Print / PDF) — Hindi + English:
   - saaf likha hai ki ye **agreement nahi hai**: agreement stamp paper par, notary ke saamne;
   - saal ya usse lambi lease registry maangti hai, isliye zyadatar 11 mahine;
   - GENZ paisa nahi rakhta;
   - police checklist aur teeno ke sign ki jagah.
9. **Home tiles:**
   - "Kiraya anubandh jald khatam";
   - "Police verification baaki";
   - "Kiraye ki deal ho gayi — Rent desk par darj karein" (agreement / handover / settled wale kiraye ke deal room jo abhi desk par nahi).
10. **Kiraye ka deal room:**
    - loan, survey, title search, registry, construction → "zaroori nahi" (wajah ke saath);
    - naye kaam: kirayedar / owner ke documents, rent agreement + e-stamp + notary, **kirayedar ka police verification**, deposit + chaabi + meter reading;
    - sab Hindi mein bhi.

## Niyam
- **GENZ kiraya ya deposit kabhi nahi rakhta.** Kirayedar seedha owner ko deta hai — har screen aur sheet par likha hai.
- **Consent:** darj karte samay broker tick karta hai ki owner aur kirayedar jaante hain ki is kirayedari ke liye unka naam / number GENZ par rehta hai.
- **Mitana (DPDP):** kirayedari khatam hone ke **180 din baad**:
  - naam, number, note, paavti number apne aap mit jaate hain;
  - sirf bina naam ke ank (kiraya, tareekh) rehte hain.
- **Sirf apni kirayedari:** doosra broker na dekh sakta hai, na badal sakta hai (test se jaancha).
- **Galti se bani** kirayedari hata sakte hain. Renew hui kirayedari asli kaam ka record hai — hatti nahi, khatam ki jaati hai.
- **Purani kirayedari** darj karne par beete hue reminder ek saath nahi aate.
- **Listing abhi bhi chalu?** App yaad dilata hai ki usse "kiraye par gaya" karein, taaki doosre broker client na bhejein.

## Tests
- Naya `tests/v60-rent-desk.test.ts` (15 test):
  - **Niyam:**
    - khatam ki tareekh (mahine ke aakhri din ka hisaab bhi);
    - saalana badhotri, kaunsa reminder kab;
    - WhatsApp lines mein pehla naam, owner ka surname nahi;
    - kiraye ke deal room ke kaam; sale wale same;
    - sirf broker ke paas permission, Hindi line.
  - **Darj karna:**
    - consent zaroori; galat number / kam kiraya / lock-in > avadhi / 2 saal se purani / galat tareekh / extra field → mana;
    - sale ka deal room → `NOT_RENT`.
  - **Listing se:** owner ka naam aata hai; doosra broker usse nahi bana sakta; ek ghar ki ek hi chalu kirayedari.
  - **Doosra broker:** dekh / badal / renew / hata / sheet — sab 404.
  - **Police:**
    - Aadhaar jaisa number mana;
    - "verify ho gaya" bina tareekh ya bhavishya ki tareekh ke mana.
  - **Shartein badalna:** history mein line; tareekh ke saath khatam ki tareekh bhi badalti hai.
  - **Renew:** agle din se, badhotri ke saath; naya agreement; renew hui kirayedari hatti nahi.
  - **Notice → khali:** bhavishya ki tareekh mana; khatam par 180 din baad mitane ki tareekh.
  - **Sheet:** Hindi + English, "agreement nahi hai", koi inline script nahi.
  - **Home ki ginti.**
  - **Sweep:**
    - 200 din pehle khatam hui kirayedari ke naam / number mit gaye, ank bache;
    - 30 din wala reminder aur police nudge ek-ek baar, Hindi line ke saath.
- Phone par (390px):
  - Home par rent tiles;
  - desk ki list (chalu / jald khatam / police baaki / khatam);
  - khula card (police, WhatsApp, renew / notice / khali);
  - naya form, Hindi screen, shartein ki sheet;
  - koi JS error nahi.

## Abhi nahi
- Renewal ki brokerage ka bill. v48 ka bill sirf deal room se banta hai; haath se darj kirayedari ke liye baad mein.
- Staff (office team) ke liye Rent desk. Abhi sirf broker; zaroorat ho to v58 jaisa switch.
- Har mahine ka kiraya aaya ya nahi — ye owner aur kirayedar ka aapas ka maamla hai, GENZ beech mein nahi.

Files:
- shared: `src/shared/rentRules.ts` (naya)
- server:
  - `server/rentdesk.ts` (naya)
  - `server/db.ts`, `server/permissions.ts`, `server.ts`, `server/reputation.ts`
  - `server/dealTemplates.ts`, `server/demoBulk.ts`
- UI:
  - `src/components/RentDeskView.tsx` (naya)
  - `src/components/NavigationTabs.tsx`, `src/components/BrokerHome.tsx`, `src/App.tsx`
  - `src/lib/api.ts`, `src/lib/i18n.tsx`, `src/lib/permHi.ts`, `src/lib/templateHi.ts`
- `tests/v60-rent-desk.test.ts`
