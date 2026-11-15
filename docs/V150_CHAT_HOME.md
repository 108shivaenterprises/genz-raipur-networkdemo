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

## Abhi sample jaisa kya NAHI hai (agle round)
1. Sahayak ke andar purana Copilot form hai, bubble + card wali baat-cheet nahi; requirement likhne par milte ghar ke card nahi.
2. List me DEAL / CLIENT / OWNER / SHOP ke tag aur chips nahi (abhi All / Unread / Clients / Brokers).
3. Owner aur shopkeeper ki chat list me row nahi; shop QR scan aur commission ka card nahi.
4. Deal chat me offer / agreement / "agla kadam" ke card nahi (visit, stage, ghar, kaagaz ke hain).
5. Client, owner, shopkeeper ka apna chat home nahi.
6. Search abhi sirf chat ke naam par; ghar / requirement / deal ki khoj nahi.

## Jaanch
- `tests/v137-owner-client-tabs.test.ts` me 1 naya test. Phone (390px): broker Chats par utra, Sahayak khula, "Old home" aur wapas dono chale, koi page error nahi.
