# v61 — Builder ↔ CP chat + notice mein photo

Launch audit (`LAUNCH_AUDIT_V58.md`) ki chauthi kami: builder aur channel partner (CP) ke beech app mein seedhi baat ka koi raasta nahi tha.
- Lead, unit, visit, booking, payout ki baat WhatsApp par hoti thi. Record app mein nahi rehta tha.
- Builder ka notice sirf text tha. Offer ka poster ya site ki progress photo nahi lag sakti thi.

## Kya bana
1. **Partner chat** — har builder aur har partner broker ke beech **ek chat** (us builder ke saare projects ke liye ek hi).
   - **Chats** tab mein deal room aur client room ke saath dikhti hai. Filter chip: broker ke liye "Builder", builder ke liye "Partner".
   - **Builder:** Project Control → Partners / Requests → har partner par **"Chat"** button.
   - **Broker:** My Projects → project → **"<Builder> se chat karein"**.
   - **"+" menu se card:**
     - **Lead** — dono ke beech ki lead; sirf pehla naam ("Dr. Alok"), kabhi number nahi;
     - **Booking** — unit, status, rakam;
     - **Unit** — sirf builder bhej sakta hai; shared project ka khaali unit. "Price chhupao" wala unit price ke bina;
     - **Photo** — site, cheque, brochure ka page. Phone par chhoti hokar jaati hai (max 600 KB).
   - **Taiyar jawab (⚡):**
     - builder: "lead manzoor — visit tay karein", "booking manzoor", "brokerage bhej di";
     - partner: "meri lead jaanch lijiye", "kya ye unit khaali hai?", "brokerage kab tak?".
   - **Unread:** chat icon par ginti. Har naye sandesh par **doosri taraf ke phone par alert** — har insaan ko har chat ka 3 minute mein ek; Hindi app par Hindi.
2. **Builder ka sales manager:** jis staff ke paas "partner ki lead jaanchna" (canVerify) chalu hai, wo builder ki taraf se chat padh / likh sakta hai.
   - Builder ko dikhta hai ki kisne likha ("— Komal").
   - Partner ko builder ki taraf ka sandesh hi dikhta hai.
   - Switch band → chat band.
3. **Notice mein photo:** Project Control → Notices mein "Photo jodein" (offer ka poster, site ki progress).
   - Photo wahi dekhta hai jo notice padh sakta hai: "sirf partner" wala notice → appointed partner; "sabhi broker" → sab.
   - Notice hatate hi photo bhi mit jaati hai.

## Niyam
- **Kaun:**
  - Chat tabhi khulti hai jab dono kisi project se jude hon (invite / apply / shortlist / appoint / pause).
  - Partnership khatam (revoke / decline) → purani baat **padh sakte hain**, naya sandesh nahi.
  - Bina jude broker ko chat nahi khulti (`NOT_LINKED`).
- **Privacy:**
  - Ek partner doosre partner ki chat / photo nahi dekh sakta.
  - GENZ admin bhi in chats ko nahi padhta (deal room jaisa).
  - Photo login ke bina nahi khulti, aur sirf chat ki dono taraf ko.
  - Card mein customer ka sirf pehla naam.
  - Doosre partner ki lead is chat mein card nahi ban sakti.
- **DPDP:**
  - Account mitane par uske sandesh par naam anonymous ho jaata hai, uski bheji photos mit jaati hain;
  - "Mera data download" mein uske partner chat ke sandesh aur Rent desk ke record bhi aate hain;
  - account mitane par Rent desk ke owner / kirayedar ke naam-number bhi mit jaate hain (v60 ki kami bhi band).
- **Audit:** chat khulna aur har card / photo audit mein (chat ka text audit mein nahi, deal room jaisa).

## Chhota sudhar
Alert aur card mein pehla naam ab title ke saath: "Dr. Alok Pandey" → "Dr. Alok" (pehle sirf "Dr." aata tha). Chat list mein "Er.: …" ki jagah "Alok: …".

## Tests
- Naya `tests/v61-partner-chat.test.ts` (9 test):
  - **Permission:** broker / builder haan; owner / admin / legal nahi. Builder staff sirf canVerify par. Hindi line.
  - **List:** broker ko sirf jude builder; bina jude broker → `NOT_LINKED`.
  - **Sandesh:** do baar kholne par wahi chat; khaali sandesh mana; builder ko unread + phone alert (link + Hindi).
  - **Doosra broker:** padh / likh nahi sakta (404).
  - **Card:**
    - apni lead (pehla naam, number nahi);
    - partner unit nahi bhej sakta;
    - builder unit bhejta hai;
    - doosre partner ki lead nahi.
  - **Photo:** text file 415, 600 KB se badi 413. Dono taraf ko khulti hai (private cache); doosre broker ko 404, admin ko 403.
  - **Sales manager:** switch par padhta / likhta hai, builder ko naam dikhta hai, partner ke sandesh ka alert use bhi; switch band → 403.
  - **Partnership khatam:** chat padh sakte hain, naya sandesh 409 `CLOSED`.
  - **Notice photo:**
    - partner ko dikhti hai, bahar ke broker ko nahi;
    - galat file 415;
    - notice hatane par photo 404;
    - chat ke raaste notice photo nahi khulti.
- Phone par (390px):
  - builder ne notice photo ke saath daala;
  - Partners → Chat → sandesh + unit card;
  - broker (Hindi): Chats mein builder ki chat, lead card + photo bheji;
  - My Projects mein "builder se chat" button;
  - koi JS error nahi.

## Abhi nahi
- Broker ke office staff ki taraf se partner chat. Abhi sirf broker; zaroorat ho to v58 jaisa switch.
- CRM lead ke andar se "builder se poochhein" button. Abhi chat ke "+" se lead card.
- Chat mein PDF. Papers ke liye Protected Docs (watermark, sirf dekhna) — wahi sahi jagah hai.

Files:
- server:
  - `server/partnerchat.ts`, `server/workphotos.ts` (naye)
  - `server/db.ts`, `server/permissions.ts`, `server/pcontrol.ts`, `server/alerts.ts`, `server/privacy.ts`, `server.ts`
- UI:
  - `src/components/PartnerChat.tsx`, `src/lib/photoFile.ts` (naye)
  - `src/components/ChatsView.tsx`, `ProjectControlView.tsx`, `MyProjectsView.tsx`, `NavigationTabs.tsx`
  - `src/App.tsx`, `src/lib/useChatBadge.ts`, `src/lib/api.ts`, `src/lib/permHi.ts`
- `tests/v61-partner-chat.test.ts`
