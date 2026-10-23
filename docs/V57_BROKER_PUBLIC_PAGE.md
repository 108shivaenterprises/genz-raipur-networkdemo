# v57 — Broker ka public page: customer bina login ghar dekhe, enquiry page wale broker ke paas

Aapka faisla:
- pehla kadam **broker ka public page** ho;
- public enquiry **page wale broker** ke paas jaaye.

## 1. Page kahan hai
- Broker ka purana **visiting card link** (`/c/GZ-XXXX-1234`) hi ab uska public page hai.
  - Wahi link aur wahi QR (header ka QR button aur Grow Network wala card).
  - Jo link pehle se WhatsApp ya visiting card par chhapa hai, wo bhi ab is naye page par khulta hai.
- App mein naya tab **"My Public Page / मेरा पब्लिक पेज"** hai. Ye "Property & Buyers" group mein hai, phone par "More" mein.
  - Nayi enquiry ho to tab par badge aata hai.
- Home par:
  - naya card: "Your public page: 7 homes · 37 views — share it";
  - nayi enquiry aaye to hari tile: "New enquiries from your public page".
- Builder, contractor aur vakil ka card **pehle jaisa** hai. Ye badlaav sirf broker ke liye hai.

## 2. Customer ko kya dikhta hai (bina login, phone par)
- **Upar:**
  - broker ka naam, company aur "✔ GENZ Verified Broker · Raipur";
  - ek line broker ke baare mein;
  - uske ilake (chips).
- **Buttons:**
  - bada hara button **"पूछताछ / Enquire"**;
  - Call aur WhatsApp sirf tab, jab broker ne switch ON kiya ho.
- **"Homes I can show you":** broker ke chune hue ghar. Bikri aur kiraya dono hon to "All / Sale / Rent" chips bhi aate hain. Har ghar par:
  - photo;
  - keemat (₹2.85 Cr / ₹45 L / ₹12,000 per month);
  - naam, kism, ilaka, shahar;
  - area aur tags;
  - "aur photo · byora": baaki photo, bina phone number wala description, aur YouTube video agar listing mein ho;
  - **"इस घर के बारे में पूछें / Ask about this home"**. Isse form mein wahi ghar pehle se chuna aata hai.
- **Photo par watermark:**
  - photo customer ki screen par canvas mein banti hai, aur us par tirchha "broker ka naam · GENZ" likha hota hai;
  - neeche kone mein "GENZ ✔ broker ka naam";
  - photo save ya forward hui to bhi dikhega ki kis broker ke page se aayi.
- **Kabhi nahi dikhta:**
  - owner ka naam ya number;
  - pura pata, map pin, latitude;
  - net price, kaagaz (documents);
  - deal room ki koi baat.
  - Test mein har dikhaye gaye ghar ke owner ka naam, number, pata aur maps link page ke HTML mein dhoondha gaya. Kuch nahi mila.
- Neeche trust card (RERA, kab se member, "KYC ✔ GENZ ne jaancha", deals closed) aur neutral line: "GENZ aapka koi paisa nahi rakhta; paisa dene se pehle kaagaz aur RERA jaanchein".
- Sabse neeche "Made on GENZ — broker hain? aisa page muft banaiye" (purana join footer). Ye har share ko naye broker ke liye invite bhi bana deta hai.

## 3. Enquiry: sirf page wale broker ke paas
- Form mein:
  - naam;
  - mobile (+91, space ya 0 ke saath bhi chalega);
  - kaun sa ghar ("koi bhi" bhi chun sakte hain);
  - sandesh (vaikalpik);
  - **sahmati ka tick**: "मैं सहमत हूँ कि <broker> मुझसे कॉल या WhatsApp करें। मेरा नाम और नंबर सिर्फ़ इन्हीं के पास जाएगा।"
- Bhejne par "धन्यवाद! आपकी पूछताछ पहुँच गई" dikhta hai. Form band ho jaata hai, aur "ek aur poochtaachh" khol sakte hain.
- **Enquiry sirf page wale broker ki hai,** chahe ghar doosre broker ki listing ho:
  - listing broker ko customer ka naam ya number nahi milta (test se jaancha);
  - page wala broker sauda listing broker ke saath **normal co-broking offer** se karta hai;
  - enquiry card par ye likha bhi aata hai: "Listing of Amit Kumar Verma — the client is yours…".
- **GENZ ke audit mein** sirf itna darj hota hai ki "page par enquiry aayi (sahmati darj)". Naam aur number audit mein nahi jaate (test se jaancha). GENZ admin ke paas enquiry padhne ki koi screen nahi hai.
- **Bot / spam se bachav (bina CAPTCHA, bina paid service):**
  - ek chhupa hua "trap" khana: bot bhar de to page "bhej diya" dikhata hai, par kuch save nahi hota;
  - form par signed samay: 2.5 second se jaldi bheja form bot maana jaata hai;
  - ek form se ek hi enquiry;
  - seemayein: ek connection se 10 enquiry/ghanta, ek mobile se ek page par 3/din, ek page par 80/din;
  - doosri website se bheja form mana hai.
- Wahi mobile usi ghar ke liye usi din dobara bheje to nayi enquiry nahi banti. Naya sandesh purani enquiry mein jud jaata hai.
- Number **GENZ Network Watch** par ho (caution ya block) to broker ko laal chetavani dikhti hai. Bhejne wale ko kuch nahi bataya jaata.
- **180 din baad enquiry apne aap mit jaati hai** (DPDP). Broker pehle bhi mita sakta hai.

## 4. Broker ki screen: My Public Page
- **Upar ka kaala card:**
  - page ON/OFF switch;
  - link, aur WhatsApp / Copy / Open / QR buttons. QR download karke visiting card ya board par laga sakte hain;
  - ginti: views, homes, nayi enquiry.
- **Enquiries tab.** Har enquiry par:
  - naam, samay, kaun sa ghar (tap karne par property khulti hai) aur sandesh;
  - **"Open a client room"**: naam, mobile aur Buyer/Renter bhara hua naya-room form khulta hai (v56 jaisa);
  - Call, WhatsApp (pehle se likha namaste sandesh);
  - status: New / Spoke / Done / Spam;
  - mitana (do kadam, galti se na mite).
- **Homes tab:**
  - "x / 24 homes on your page";
  - **meri live listings:** har ek par do switch:
    - "On my page";
    - "Other brokers may show it too" (default **OFF**). ON par dikhta hai ki abhi kitne doosre brokers ke page par hai;
  - **doosre brokers ke ghar:** sirf wo, jinke listing broker ne switch ON kiya ho. Listing broker ka naam ke saath, aur "Add" / "On page".
- **Ek baar ka vaada:**
  - kab: pehli baar apni listing page par lagane, ya "others may show" ON karne se pehle;
  - kya likha hai: "जो घर मैं पब्लिक पेज पर लगाऊँगा, उनके मालिकों ने हाँ कहा है… पेज पर मालिक का नाम, नंबर और पूरा पता कभी नहीं दिखता।"
  - tick aur Confirm ke baad samay ke saath audit mein darj hota hai.
- **Page details tab:**
  - ek line apne baare mein (phone number likha to apne aap hat jaata hai, taaki "Call button OFF" ka matlab bana rahe);
  - ilake (6 tak);
  - Call/WhatsApp buttons ON/OFF;
  - "customer ko kya dikhta hai / kya kabhi nahi".
- Listing broker apna switch OFF kare to wo ghar **turant har doosre page se hat jaata hai.** Ghar bik jaaye, hold ho, expire ho, ya listing broker suspend ho, tab bhi apne aap hat jaata hai.

## 5. Naye niyam / data
- Naya permission `publicpage:use` (sirf BROKER). Iski Hindi line `permHi.ts` mein hai.
- User ke `publicCard` mein `homes`, `areas`, `ownerOkAt`. Property mein `publicShareOk` / `publicShareAt` (default nahi).
- Naya store `pageEnquiries` (har record ka `id`).
- Audit events:
  - `PAGE_ENQUIRY`, `PAGE_ENQUIRY_DELETED`;
  - `PUBLIC_PAGE_HOMES`, `PUBLIC_PAGE_OWNER_OK`;
  - `PUBLIC_SHARE_ALLOWED` / `PUBLIC_SHARE_STOPPED`;
  - purane `PUBLIC_CARD_ENABLED/DISABLED`.
- Owner ke Home par listing ki "enquiries" ginti mein ab page ki enquiry bhi judti hai. Sirf ginti dikhti hai.
- Purana `/api/growth/card` save karne par page ke ghar nahi mitte (test).
- **v56 ka ek chhota bug bhi theek kiya:** "Open a client room" ka bhara form kabhi-kabhi khaali khulta tha (React render dobara hone par handoff kho jaata tha). Ab form dikhne ke baad hi handoff hat-ta hai.
- Koi paid service, nayi dependency ya migration nahi lagi. Owner consent ki wording nahi badli. Demo mein pehle demo broker ka page apne aap ON hai, saath mein 2 doosre broker ke ghar aur 3 nakli enquiry.

## Tests
- Naya `tests/v57-public-page.test.ts` (8 test):
  - keemat, ilake aur mobile ke niyam;
  - page par sirf chune live ghar, owner ka koi detail nahi;
  - doosre broker ka ghar sirf uski haan tak: band karte hi har page se hata, aur dobara jod nahi sakte;
  - apni listing sirf vaade ke baad, kisi aur ki listing kabhi nahi; page OFF par 404;
  - headline se phone number hata;
  - purana card save karne par ghar bane rahe; buyer ko screen nahi;
  - enquiry:
    - bot (jaldi / trap) andar nahi;
    - galat number, bina sahmati aur doosri site, teeno mana;
    - ek form se ek enquiry;
    - listing broker aur audit mein customer ka number nahi;
    - home tile ginti;
    - same mobile ka sandesh purani enquiry mein juda;
  - status / mitana sirf page wala broker kar sakta hai;
  - band page enquiry nahi leta.
- Poora suite: **65 files / 916 test pass**.
- Phone par check (390px):
  - broker:
    - Home tile aur card;
    - My Public Page ke teeno tab, Hindi mein bhi;
    - enquiry se client room form bhara mila ("Kiran Mehta 9826117619");
  - customer ka page:
    - 7 ghar, watermark wali photo;
    - "Ask about this home" se ghar pehle se chuna;
    - form bheja to dhanyavaad;
    - galat number par saaf galti;
    - Rent filter;
  - listing broker: "On 1 other broker page(s)";
  - naya broker: vaade ka panel;
  - koi JS error nahi.

## Imaandari wali baatein
- **Watermark photo ko chori se poori tarah nahi bachata.** Photo ka asli link page ke code mein hai (listing ki photo pehle bhi client room mein aise hi jaati thi). Watermark se itna hota hai ki dekhne, save karne ya screenshot par broker ka naam dikhe.
- **OTP nahi hai,** kyunki SMS gateway nahi hai. Isliye nakli number se enquiry aa sakti hai. Seemayein aur "Spam" button isi liye hain.
- Broker ka link `GZ-NAAM-1234` jaisa hai; apna naam chun-ne wala link (jaise /c/rahul-sahu) abhi nahi.
- Google par page abhi search mein nahi aata (noindex). Kholna ho to bataiye.
- Enquiry abhi team member (agency staff) ke paas nahi jaati, sirf page ke maalik broker ke paas.
- Check desktop browser ko 390px chauda karke kiya, asli phone par nahi. Manual update nahi kiya.

Files:
- server: `server/publicPage.ts` (naya), `server.ts`, `server/db.ts`, `server/permissions.ts`, `server/growth.ts`, `server/reputation.ts`, `server/homeinsights.ts`
- shared: `src/shared/publicPageRules.ts` (naya)
- UI:
  - `src/components/PublicPageView.tsx` (naya)
  - `NavigationTabs.tsx`, `BrokerHome.tsx`, `GrowthView.tsx`, `ClientRooms.tsx`
  - `src/App.tsx`, `src/lib/api.ts`, `src/lib/i18n.tsx`, `src/lib/permHi.ts`
- `tests/v57-public-page.test.ts`
