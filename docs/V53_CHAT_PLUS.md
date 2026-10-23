# v53 — Chat mein "+" menu: property, document, photo, location, visit, stage — sab chat se, aur "Sirf brokers" switch

## Kyon / aapka sawaal
Aapne poocha tha ki chat mein "+" ho jisme sab zaruri cheezein hon (konsa document, konsi property, stage bhi), taaki shortcut bhi bane aur UI saaf rahe. Saath mein darr tha ki hum WhatsApp na ban jayein. Isliye "+" sirf **property-platform ke kaam** ka hai: voice note, contact share, KYC/ID document, paisa — kuch nahi.

## Deal chat ka "+" (deal room ke andar aur Chats inbox mein, dono jagah ek jaisa)
"+" dabane par 6 tile aur ek switch:
| Tile | Kya karta hai |
|---|---|
| **Property** | is deal ki property ka card (photo, naam, locality, rate). Tap karne par deal room ka Overview |
| **Document** | property ke vault ke wahi document jo **bhejne wale ko khud khulte hain**. Card chat mein, file nahi |
| **Photo** | property ki maujooda photos mein se ek |
| **Location** | property ki lokation ka card — **padhne wale ko usi ki apni privacy-shield wali jaankari dikhti hai** (jab tak verified visit nahi, sirf mota ilaaka) |
| **Visit** | wahi "Schedule visit" window chat ke upar khulti hai; visit tay hote hi chat mein visit ka card aa jata hai (OTP / QR chat mein kabhi nahi jata) |
| **Stage** | abhi ka stage aur "Move to <agla>" button; stage badalte hi chat mein stage ka card |
| **Sirf brokers** (switch) | on karo to message sirf do deal-brokers ko dikhega, **owner ko nahi** |

Menu **role ke hisaab se** chhota-bada hota hai: owner ko Property / Document / Photo / Location milte hain (Visit, Stage, Sirf brokers nahi); jo broker nahi hai ya jiske paas permission nahi, uske tile nahi dikhte.

### Document ke saath access (poocha ja raha hai, chupke nahi hota)
Agar document bhejne wala property ka principal (owner / listing broker) hai aur deal room ke paas abhi uska access nahi, to chat poochti hai:
- **"Send + give access (7 days)"** — wahi vault grant jo pehle se hota tha (`DEAL_ROOM_PARTICIPANTS`, VIEW, 7 din)
- **"Send card only"** — card jayega, file nahi khulegi
Doosri taraf agar access nahi hai to card par likha aata hai "Not shared with you yet". Yaani "+" se kisi ka access **chupke se nahi badhta**.

### "Sirf brokers" — ye pehle se server mein tha, UI mein nahi tha
Server mein pehle se ek brokers-only channel tha, par ऐप mein kahin dikhta hi nahi tha (demo data mein ek message usi mein pada tha jo kisi ko nahi dikhta tha). Ab:
- switch on hone par upar ek peeli patti ("Sirf brokers — owner ko nahi dikhega") aur "Turn off" button; box ka hint badal jata hai
- message par chhota 🔒 "Sirf brokers" tag
- Owner ko ye message na chat mein dikhta hai, na inbox ki preview mein (test se check)
- **Saaf bata diya gaya hai:** GENZ ise tabhi padh sakta hai jab us deal par vivaad khula ho (pehle se yahi niyam tha)
- Switch chat se bahar jaate hi band ho jata hai (galti se private na rahe)

## Client room ka chhota "+"
Yahan card nahi, sirf shortcut (kuch naya share nahi hota):
- **About a home** (pehle ka ghar wala button yahin aa gaya)
- **Share a home** → Homes tab, add-form tak
- **Book a visit** → agar ek hi ghar hai to seedha visit ka form, warna Homes tab
- **Photos to show** → us ghar ki photos chunne wali jagah
Stage / bill / brokers-only yahan **nahi** hain.

## Server mein kya jodha (sab optional, purana kuch nahi badla)
- Message mein 3 optional field: `kind` (PROPERTY / DOCUMENT / PHOTO / LOCATION / VISIT / STAGE), `refId`, `auto`. Card mein sirf id jaati hai; **har padhne wale ki screen apni dikhne-layak jaankari se card bharti hai.**
- Server har card ka sach khud check karta hai (`server/chatcards.ts`):
  - Property / Location: sirf isi deal ki property.
  - Photo: sirf is property ki apni photo.
  - Document: sirf wahi jo **bhejne wale ko** vault mein khulta hai (grant / principal / public). Doosra broker jiske paas grant nahi, use bhej nahi sakta.
  - Visit: isi deal room ki visit; bhejne wala visit banane wala broker ya deal broker.
  - Stage: sirf deal broker, aur sirf wahi stage jo deal mein sach mein hai (purana stage ka card bana nahi sakte).
- Card ke saath likha caption (300 akshar tak) usi chat-filter se guzarta hai (link flood, naye account par phone number).
- **Audit:** har card par `CHAT_CARD_SENT` ki ek line banti hai (kaun sa card, kis id ka, brokers-only tha ya nahi). Sadhaaran chat text ka audit pehle ki tarah nahi.
- Naya permission nahi bana, isliye `permHi.ts` mein kuch jodna nahi pada.
- Stage badalne ke niyam wahi hain (ek baar mein ek kadam, "Site Visit Done" ke liye verified visit, "Agreement" ke liye signed samjhauta) — "+" sirf shortcut hai. Refusal ka message panel mein dikhta hai.
- `GET /api/properties/:id/vault/assets` ka logic ek function (`visibleVaultAssets`) mein nikala, taaki chat aur vault ek hi niyam use karein. Output wahi.

## Chhoti baatein
- Visit aur QR-pass wali windows ab chat ke upar (z-index) khulti hain; pehle chat ke peeche chhup jaati.
- `?sub=` link ab deal room ka koi bhi section khol deta hai (pehle sirf chat). Card tap karne se wahi kaam hota hai.

## Imaandari wali baatein
- **Phone se nayi photo kheench kar chat mein bhejna abhi nahi hai.** App mein file-storage ke liye abhi koi alag niyam nahi (vault sirf link rakhta hai), aur ye DPDP / malware ka sawaal khadi karta hai. Abhi "Photo" property ki maujooda photos mein se chunta hai. Chahein to alag version mein, aapki haan ke baad.
- Phone ka check desktop browser ko 390px chauda karke kiya (English, Hindi, owner, inbox, client room, aur ek baar 1280px). Asli phone par keyboard ke saath nahi dekha.
- Demo data mein is property ke vault mein is broker ko khulne wala koi document nahi tha, isliye Document list local screenshot mein khaali dikhti hai; document ka poora rasta (access poochna, grant, doosre broker ka block) **server test** se parakha gaya, screen par nahi.
- Card mein visit ka status ("Scheduled / Verified") chat kholte waqt, aur visit / stage / access dene ke baad taaza hota hai; chat khule rehte hue wo apne aap nahi badalta.
- Photos local screenshot mein test-tasveer hain.
- Asli logo abhi nahi mila ("GZ" box). Manual update nahi kiya (aapka standing instruction). RERA / mandate wali baat parked hai.

## Tests
- Naya `tests/v53-chat-cards.test.ts`: 12 test (card ke niyam alag se, aur API se: property/location, photo, document + grant, stage, visit, caption filter, audit line, brokers-only owner se chhupa — inbox preview mein bhi).
- Poora suite: **61 files / 894 test pass** (pehle 882 + ye 12). `tsc` aur `vite build` saaf.

Files: `server/chatcards.ts` (naya), `server.ts`, `src/types/index.ts`, `src/components/ChatPlus.tsx` (naya), `ChatKit.tsx`, `DealRoomsView.tsx`, `ChatsView.tsx`, `ClientRooms.tsx`, `Modals.tsx`, `SiteVisitQrPassModal.tsx`, `src/App.tsx`, `src/lib/api.ts`, `tests/v53-chat-cards.test.ts`.
