# V150 — WhatsApp jaisa UI, pehla kadam: Chat home (broker)

Aapka kehna: "Sab ERP / CRM / broker network ke features ek WhatsApp type UI me la dete hain … deal search se deal crack tak, requirement add se shopkeeper commission tak."
Aapke chunav: roop = **Chat list + Sahayak**; roles = owner + broker + shopkeeper + client; tareeka = aapne kuch nahi chuna, sample ke baad "Chalo karo" → maine apni salah li: **naya Chat mode, purane tabs ke saath**.

Sample (7 phone screen): artifact "GENZ WhatsApp-style UI sample".

## Code me pehle se kya tha (naya nahi banana pada)
- `ChatsView` (v50): client rooms + deal chats + partner chats ek list me, last message, unread.
- `ChatPlus` (v53): chat ke andar "+" menu aur card (ghar, kaagaz, photo, location, visit, stage).
- `CopilotPanel` (v110): ek line likho → plan → haan → kaam.

## V150 me kya hua (sirf broker)
- **Login ke baad broker Chats par utarta hai** (pehle dashboard). Har sign-in par ek baar; baad me Home dabaye to Home hi khulta hai.
- **Neeche ki patti ka pehla button "Chats"** (pehle Home). Home ab More me.
- **Chats ke upar "GENZ Sahayak" pinned row.** Dabane par wahi Copilot chat ke khol me khulta hai.
- **Switch:** Chats me "Old home" → purana home wapas (pasand yaad rehti hai). Purane home par "Try the new chat home" button.
- Files: `src/lib/goto.ts` (`chatHome`), `src/App.tsx`, `NavigationTabs.tsx`, `ChatsView.tsx`, `BrokerHome.tsx`.

## V151 — Sahayak ab menu wala bot (WhatsApp automation jaisa)
Aapka kehna: "Sahayak me format galat likhega broker to pata nahi chalega, WhatsApp automation type ka kar do taki wo khud options bhi de."
- Sahayak khulte hi **button**: Client ki zaroorat jodo · Property dhoondho / jodo · Aaj ka kaam · Meri deal aur commission · Mera shop QR · Khud likhunga.
- **Zaroorat jodna, ek-ek sawal, jawab button se:** khareedna / kiraya → kya (Flat, House, Plot, Shop, Office, Aur…) → ilaka (shahar ke ilake ke chips, ek se zyada) → budget (button; ya rakam + Hazaar / Lakh / Crore) → naam → mobile (10 ank sahi hone par hi aage) → ek line me jaanch → "Haan, save karo".
- Save usi purane requirement API se (wahi niyam); budget "tak" maana, neeche ki seema uska 70%.
- Save ke baad **milte ghar ke card** (sirf 50% ya zyada mel wale, 3 tak) + "Ye zaroorat kholo" / "Ek aur jodo".
- Purana likhne wala Copilot "Khud likhunga" ke peeche hai.
- Saath me ek chhed band: buyer ko match ke nateeje me bhi listing broker ki pehchan nahi jaati (V148 ka niyam yahan chhoot gaya tha).
- Files: `src/components/SahayakBot.tsx` (naya), `ChatsView.tsx`, `server.ts`.

## Abhi sample jaisa kya NAHI hai (agle round)
1. Sahayak me abhi sirf "zaroorat jodo" poora flow hai; property jodna, visit tay karna, offer, commission abhi apne purane tab par le jaate hain. Milte ghar ke card par "client ko bhejo / co-broke pucho" button nahi.
2. List me DEAL / CLIENT / OWNER / SHOP ke tag aur chips nahi (abhi All / Unread / Clients / Brokers).
3. Owner aur shopkeeper ki chat list me row nahi; shop QR scan aur commission ka card nahi.
4. Deal chat me offer / agreement / "agla kadam" ke card nahi (visit, stage, ghar, kaagaz ke hain).
5. Client, owner, shopkeeper ka apna chat home nahi.
6. Search abhi sirf chat ke naam par; ghar / requirement / deal ki khoj nahi.

## Jaanch
- `tests/v137-owner-client-tabs.test.ts` me 1 naya test. Phone (390px): broker Chats par utra, Sahayak khula, "Old home" aur wapas dono chale, koi page error nahi.
