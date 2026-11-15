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

## V152 — baaki sab jodna (aapka "Sab add karo")
- **Chats list:** har row par chhota tag **DEAL / CLIENT / OWNER / SHOP / PARTNER**. Owner ke room ka alag rang. Naya filter **Shops** (dukaan ki lead ki chat). Dukaan ki lead dabane par poora lead card (chat, ghar bhejna, visit, commission) khulta hai.
- **Search box ab hamesha:** chat ke naam ke saath **ghar** aur **zaroorat** bhi dhoondhta hai (dabane par us tab par jata hai).
- **Deal chat me "Agla kadam" card:** stage ke hisaab se (visit tay karo / offer-final rate lo / agreement-commission) ek dabaao me deal ke sahi hisse par.
- **Sahayak me nayi cheezen:**
  - milte ghar ke card par **Client ko bhejo** (client room banta hai, client ki haan puchhi jaati hai, ghar bhej deta hai) aur **Visit tay karo** (kal 11 / kal 4 / parso 11);
  - neeche **Brokeron se pucho (co-broke)** — client ki zaroorat (naam/number ke bina) milte ghar wale brokeron ko;
  - menu: **Property dhoondho** (likho, ghar dikhte hain), **Meri deal aur commission** (anumanit commission + 3 deal).
- Files: `ChatsView.tsx`, `SahayakBot.tsx`, `ShopPartners.tsx` (LeadCard export), test `v137-owner-client-tabs.test.ts`.

## Abhi bhi NAHI hai
1. Deal chat me offer / agreement ke **alag message-card** (server me naya card prakaar chahiye); abhi sirf "Agla kadam" patti.
2. **Client, owner, dukaandaar ka apna chat home**: client / dukaandaar app me login hi nahi karte (link se aate hain); owner ke liye landing nahi badli.
3. Ghar ki khoj me ghar par dabane se seedha wahi ghar nahi khulta, Properties tab khulta hai.
4. "Property jodo" abhi Properties tab par le jata hai (bot me poora flow nahi).
5. Commission card dukaan ki chat ke andar ka (LeadCard) purana hai; sample jaisa naya nahi.
