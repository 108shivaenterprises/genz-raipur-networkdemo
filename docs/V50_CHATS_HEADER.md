# v50 — Chats (ek inbox, poori screen chat) aur patla header

## Kyon
Phone par naapa gaya (390px, broker login):
- Chat tak pahunchne mein: Deals → deal chuno → deal room → 10 sub-tab mein se "Broker Chat" → 3 screen scroll. Client chat alag jagah (More → Client Rooms). Do alag chat, ek inbox nahi.
- Message box page ke aakhir mein tha; client chat mein bottom bar ke peeche aur "About: (none)" dropdown ke neeche.
- Header har screen par 4 button (QR, हिन्दी, My data, Sign out), do row mein.

## 1. Chats — ek inbox
- Header ka 💬 icon (unread badge ke saath) aur **More → Today → Chats**. Link: `?tab=chats`. `?chat=c:<room id>` / `?chat=d:<deal id>` seedha ek chat kholta hai.
- Ek list: client rooms aur deal chats saath, naya upar; last message ("आप: …" / "Rahul: …"), samay (aaj → time, kal, din ka naam, tareekh), unread hara gol.
- Filter: **Sab · Unread · Clients · Brokers** (jab dono tarah ki chat ho). 6 se zyada chat ho to search.
- Jin deals mein abhi koi message nahi, wo "जिन डील में अभी चैट नहीं (n)" ke andar band rehti hain.
- Owner aur employee ko sirf deal chats (wahi jo pehle dekh sakte the). GENZ admin ka inbox khaali (admin deal chat sirf dispute ke zariye padh sakta hai, pehle jaisa).
- Badi screen par list baayein, chat daayein.

## 2. Poori screen chat
- **Phone par:** header aur neeche ka menu dhak jaate hain. ← back (aur phone ka Back button bhi chat band karta hai). Message box neeche pinned hai aur keyboard ke upar rehta hai.
- Din ke chip (Aaj / Kal / 17 Oct), message ke andar sirf samay. Bhejne wale ka naam tabhi dikhta hai jab 2 se zyada log baat kar rahe hon.
- Mobile par Enter = nayi line, bhejna button se. Computer par Enter = bhejo, Shift+Enter = nayi line.
- **Client room:** upar ek patti: Chat · Homes · Visits · Info. "New link / Close room" ⋮ menu mein. ⚡ se tayyar jawab, 🏠 se "kis property ke baare mein". SMS gateway wali line ab Info tab mein. Naye room ka link banner ab room ke andar dikhta hai.
- **Deal room → Broker Chat:** poori screen. Dark banner aur "Direct Broker-to-Broker Channel" wala bada block hata; Call ek gol hara button. Chat bhejne wale ko wahi naam dikhte hain jo deal room dikhata tha (koi phone number nahi). Chat khuli ho to har 12 second mein naye message dekhta hai.
- Inbox se deal chat mein **"Deal"** button deal room kholta hai.

## 3. Deal chat ka unread (naya)
- `GET /api/chats/deals` (har deal ka last message, kul message, unread), `GET /api/chats/summary` (header ka number), `POST /api/chats/deals/:id/read` ("padh liya").
- `chatReads` naya collection (id = `user|deal`) — kisne kahan tak padha.
- Jab tak "padh liya" ka nishaan nahi, sirf pichhle **3 din** ke naye message unread gine jaate hain; purani baat-cheet unread nahi dikhti.
- **Brokers-only channel** owner ko na list mein, na last message mein, na unread mein, na count mein dikhta hai.
- Apna bheja message kabhi unread nahi.

## 4. Patla header (sab roles)
- Ek row: logo, 💬, QR / Scan, profile. Pehle: do row, 4 button.
- Profile menu: naam, role, verified / GZ code, trust score, Language, My data, (admin ke liye "View as"), Sign out.

## Imaandari wali baatein
- Phone ke keyboard ka behaviour (message box keyboard ke upar rehna) `visualViewport` se banaya hai aur browser mein check kiya, asli phone par nahi. Asli phone par ek baar dekh lein.
- Chat ke content ke niyam (phone number block, brokers-only channel, flood rule) server par waise hi hain; sirf dikhane ka tareeka badla.

## Tests
- `tests/v50-chats.test.ts` (4 test): sign-in zaroori; ajnabi aur admin ko kuch nahi; unread / "padh liya" / header ka kul; purani baat unread nahi; brokers-only channel owner tak nahi.
- Poora suite: **882 test pass**.
- Phone size browser mein check: header, profile menu, inbox, client chat bhejna, deal chat bhejna, Back button, deal room ka chat tab, Hindi, owner login, badi screen (do pane).

Files: `server/chats.ts` (naya), `server/db.ts`, `server.ts`, `src/components/ChatKit.tsx` (naya), `ChatsView.tsx` (naya), `ClientRooms.tsx`, `DealRoomsView.tsx`, `Navbar.tsx`, `NavigationTabs.tsx`, `src/App.tsx`, `src/lib/useChatBadge.ts` (naya), `src/lib/api.ts`, `src/lib/i18n.tsx`.
