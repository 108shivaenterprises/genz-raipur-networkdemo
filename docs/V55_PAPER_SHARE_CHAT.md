# v55 — Property Paper chat se share: kitne din, kitni baar, watermark, aur client tak

## Aapki maang
Listing broker jab buyer / renter ke broker ke saath document share kare, to:
- wo **chat mein** ho sake;
- **kitni baar** aur **kitne din tak** dekh sakta hai, ye tay ho;
- document **masked / view-only** rahe, dekhne wale ka **watermark** aaye;
- **screenshot** na le paye, aur doosre phone se photo le to uske **initials** dikhen;
- wo broker **apne customer ko bhi chat se** dikha sake, aur customer ko bhi **sirf watermark wala** copy dikhe.

## 1. Listing broker: deal chat → "+" → Document
- Ab sabse upar **"Property papers · view-only"** aate hain. Ye is deal ki property ke wo kaagaz hain jo aapne (owner / listing broker / uploader) Property Papers mein rakhe hain. Neeche pehle jaise vault ke link.
- Paper chunte hi ek chhota form khulta hai:
  - **Kaun dekh sakta hai:** deal ke log, jaise doosra broker ya owner (default: doosra broker).
  - **Kitne din tak:** 1 / 3 / 7 / 30 din.
  - **Har koi kitni baar khol sakta hai:** 1× / 3× / 5× / 10× / koi seema nahi.
  - **"Apne client ko dikha sakte hain"** switch (default ON).
- Paper agar abhi view-only nahi tha to **bhejte hi view-only ho jaata hai**. Computer par typed PDF view-only nahi ho sakti; uspar saaf message aata hai ki pages ki photo daalein.
- Chat mein ek **card** aata hai. Aapko dikhta hai ki kisne kitni baar khola (jaise "Rahul Sahu · opened 1/3 · till 26 Oct") aur har vyakti ke saamne **"Stop"** button.

## 2. Doosra broker: card par
- Card par dikhta hai: **"3 open(s) left · till 26 Oct"**, aur **Open** button.
- **Open** dabane par paper app ke viewer mein khulta hai:
  - har baar kholna ek baar gina jaata hai;
  - ginti poori hone par paper nahi khulta ("All your opens are used");
  - samay khatam hone par bhi nahi khulta.
- **Watermark** (har pages par):
  - beech mein **bade initials** ("R.S."), halke laal rang mein;
  - poore page par tirchhi line: **initials · naam · ••mobile ke aakhri 4 · tareekh-samay · GENZ**;
  - neeche kaali patti: "GENZ · View only — opened by … · do not forward".
- **Download kabhi nahi.** Original file sirf uploader, owner aur listing broker ko milti hai.

## 3. Doosra broker apne client ko dikhaye
- Card par **"Show my client"** button aata hai. Ye sirf tab dikhta hai jab bhejne wale ne switch ON rakha ho.
- Apna client room chunein, phir din (1 / 3 / 7) aur kitni baar (1 / 3 / 5) tay karein.
  - **Aapki apni seema se zyada nahi:** agar aapko 3 din mile the to client ko bhi zyada se zyada wahi 3 din.
- Client room ke **"+"** mein bhi naya tile hai: **"Show a paper"**. Isme wo kaagaz aate hain jo aap dikha sakte hain: aapke apne, aur wo jo kisi ne "client ko dikha sakte hain" ke saath bheje.
- Client room ki chat mein card par status dikhta hai: "opened 1/3 · till …" aur **"Stop showing"** button.

## 4. Client (customer) ke phone par
- Room ki chat mein **"📄 खोलें / Open"** button aur saath mein "2 बार और · 26 Oct तक".
- Kholne par alag view-only page khulta hai:
  - har page par **client ka apna naam aur initials**: "K.M. · Kiran Mehta · ••7619 · samay · via Rahul Sahu";
  - beech mein bada **"K.M."**;
  - neeche patti.
- Har kholna gina jaata hai. Ginti poori ho, samay khatam ho, ya broker band kare, to page saaf batata hai kyun nahi khul raha.
- Agar **listing broker ne doosre broker ka share band kar diya**, to uske client ka copy bhi **turant band** ho jaata hai.

## 5. Screenshot aur photo — kya kiya, aur imaandaari
Kiya:
- File kabhi nahi milti. Page canvas par banta hai aur har page image ek baar, sirf usi kholne wale ke liye, sirf image ki tarah aati hai (cache nahi).
- Window se focus hatte hi (app switch, notification, doosra tab) page **dhundhla** ho jaata hai.
- Right-click / long-press menu, Ctrl+S / P / C, print, aur PrintScreen key band hain. Text select nahi hota.
- Har kholna "**किसने खोला**" log mein darj hota hai. Client ka kholna bhi, "his client Kiran Mehta opened it (1 of 3)" ke roop mein.

Imaandaari:
- **Web page screenshot ko 100% nahi rok sakta**, aur doosre phone ke camera ko to bilkul nahi. Ye sirf Android ki native app (FLAG_SECURE) mein possible hai.
- Isiliye watermark itna ghana hai: leak hui har copy par **initials, naam, mobile ke aakhri 4 aur samay** dikhenge, aur pata chalega kisne kholi thi.

## 6. Server aur suraksha
- Naye endpoint:
  - `GET /api/property-docs/for-deal/:dealId` — deal ke kaagaz jo main khol / share kar sakta hoon, aur deal ke log;
  - `POST /api/property-docs/:id/chat-share`;
  - `POST /api/property-docs/:id/client-share`;
  - `POST /api/property-docs/:id/client-revoke`.
- Client ke liye: `/r/:token/paper/:id` (page) aur `/r/:token/pp/:token` (page image). Ye **room ke session** aur **usi phone** se bandhe hain.
- Share mein optional nayi cheezein: din, kitni baar, kitni baar khola, deal, "client ko dikha sakte". Purane share pehle jaise chalte hain.
- Kaun share kar sakta hai:
  - **sirf** paper ka manager (uploader / owner / listing broker);
  - sirf **usi deal ke logon** ko;
  - client ko sirf **apne** client room mein.
- **Audit:** `PROPDOC_CHAT_SHARED`, `PROPDOC_CLIENT_SHARED`.
- Naya permission nahi bana, isliye `permHi.ts` mein kuch jodna nahi pada.

## Tests
- Naya `tests/v55-paper-share.test.ts` (7 test):
  - chat-share se paper view-only bana aur card aaya;
  - ginti (2 baar ke baad `VIEWS_USED`), download mana, listing broker par seema nahi;
  - galat vyakti / galat deal / stranger mana;
  - typed PDF mana;
  - client-share sirf switch ON par, apni seema ke andar, sirf apne room mein;
  - client ka OTP login, stamp mein "K.M. · Kiran Mehta · … · via …", page image ek hi baar aur sirf image ki tarah, 2 ke baad band;
  - listing broker ke band karte hi client ka copy band;
  - audit mein dono events.
- Poora suite: **63 files / 904 test pass** (Postgres wale 4 file ek baar Postgres band hone se fail hue the; chalu karke dobara chalaye to pass).
- Phone par check (390px):
  - listing broker ka form;
  - card (bhejne wale aur paane wale, dono ka);
  - broker ka viewer ("R.S.");
  - "Show my client";
  - client room ka card;
  - client ke phone par OTP se login aur viewer ("K.M. · Kiran Mehta · ••7619 · … · via Rahul Sahu").

## Imaandari wali baatein
- Screenshot / camera ko poori tarah rokna web par sambhav nahi (upar §5).
- Computer par typed PDF chat se share nahi hoti. Pages ki photo daalni hogi ("पेज की फ़ोटो से एक PDF बनाएँ" pehle se hai).
- "Masked" ka matlab yahan view-only + watermark hai. Paper ke andar ka koi hissa (jaise Aadhaar number) **kaala karne ka tool abhi nahi hai**. Chahiye to alag version mein bana sakte hain.
- Check desktop browser ko 390px chauda karke kiya, asli phone par nahi. Manual update nahi kiya.

Files:
- server: `server/propdocs.ts`, `server/clientroom.ts`, `server/viewToken.ts`, `server/db.ts`, `src/types/index.ts`
- naye components: `src/components/PaperShare.tsx`
- badle components: `ChatPlus.tsx`, `ClientRooms.tsx`, `WatermarkViewer.tsx`, `DealRoomsView.tsx`, `ChatsView.tsx`
- `src/lib/api.ts`, `tests/v55-paper-share.test.ts`
