# v58 — Broker ki office team: listing, client room aur client list (broker ke switch se)

Launch audit (`LAUNCH_AUDIT_V58.md`) ki pehli kami: broker ka staff owner aur client ke saath kaam nahi kar pata tha. Pehle staff sirf builder ki CRM lead, allot kiye deal room aur check-in tak simit tha. Resale / rent wale agency ke kaam mein:
- field executive ko ghar ka pata chahiye;
- telecaller ko client list chahiye;
- office ko client room chalana hota hai.

## Kya bana
Broker → **My Team → "Access & leads"** → member kholein → naya hissa **"Office work — resale / rent"**. Teeno switch **default band** hain.

| Switch | Member ko kya milta hai | Kya kabhi nahi milta |
|---|---|---|
| **Listings: See listings** | Properties tab: network ki listing wahi jaise broker dekhta hai, sirf padhne ke liye | owner ka naam / number, net price, kaagaz; listing daalna, edit, offer, co-broking |
| **Listings: + address of mine** | upar ke saath **broker ki apni listing ka pura pata** (client ko le jaane ke liye) | doosre broker ki listing ka pata; owner ka number |
| **Client rooms** | broker ke saare client room: chat, ghar bhejna, code batana, naya room kholna, naya link | room **band karna** (sirf broker); kaagaz dikhana; visit tay karna |
| **Client list** (Today & Clients) | broker ke client card: jodna, note, follow-up, stage | client **mitana** (sirf broker); number tabhi dikhta hai jab upar phone ka switch **"Always visible"** ho |

## Niyam
- **Data broker ka rehta hai.**
  - Member jo room kholta hai ya client jodta hai, wo broker ka hi hota hai.
  - Member ke naukri chhodne / suspend hone par sab broker ke paas rehta hai.
  - Doosre broker ka staff kuch nahi dekh sakta (test se jaancha).
- **Client ko saaf bataya jaata hai:**
  - switch ON hone par client ke room page par likha aata hai: "यह चैट सिर्फ़ आप, आपके ब्रोकर और उनकी ऑफ़िस टीम देख सकते हैं";
  - member ke sandesh par uska naam aata hai ("Rakesh Dewangan (Vikramaditya Sharma का ऑफ़िस)");
  - broker ke apne sandesh pehle jaise.
- **Phone number:**
  - client list mein number sirf **"Always visible"** wale member ko dikhta hai. "Tap to reveal" / "Never" par masked rehta hai;
  - masked number wala member number badal bhi nahi sakta.
- **Alert:** client ka naya sandesh, visit ki maang ya code ki maang broker ke saath **room wale staff ke phone par bhi** jaati hai.
- **Audit:**
  - har switch badalna (`TEAM_POLICY_SET` mein teeno);
  - member ka room kholna / sandesh;
  - client jodna ("by <member> for <broker>").
- **Turant asar:** switch band karte hi screen aur API dono band.
- Builder ka staff ye switch nahi le sakta. Builder ke staff ke switch pehle jaise hain.

## Member ki screen
- **Home ("My Work")** par teen naye button: Client rooms / Clients & follow-ups / Listings (jo chalu ho).
- **Today & Clients** mein member ko sirf "Clients", "Map", "Rate card" dikhte hain. Digest, trust aur points broker ke apne hain.
- **Client rooms** ki list ka heading: "Vikramaditya Sharma's client rooms (4)".
  - Room mein "Close room", "Show a paper", "Book a visit" member ko nahi dikhte.
  - "Listings" switch band ho to "ghar jodne ke liye broker se 'See listings' chalu karwaayein" likha aata hai.

## Tests
- Naya `tests/v58-agency-team.test.ts` (6 test):
  - switch default band;
  - builder ka staff nahi le sakta, doosre broker ka staff badal nahi sakta;
  - listing ka pata sirf "+ address" par aur sirf broker ki apni listing ka; owner / kaagaz / net price kabhi nahi;
  - member listing daal ya offer nahi kar sakta;
  - member room kholta hai → broker ka room; doosre broker ka staff nahi dekhta;
  - client OTP se andar aata hai, page par member ka naam aur "office team" dikhta hai;
  - member room band nahi kar sakta, broker kar sakta hai; switch band → 403;
  - client list: member ka jodna broker ko dikhta hai, number "Never" par masked;
  - member mita nahi sakta; doosre broker ka staff nahi dekhta.
- Poora suite: **66 files / 922 test pass**. `v26-launch` ki file ek baar poore suite mein ruki, kyunki uska server 20 second mein boot nahi hua (ek saath ~60 server chalte hain). Akele chalayi to 43/43 pass. Uska boot-wait ab 50 second kar diya.
- Phone par (390px):
  - broker ne switch chalu kiye;
  - member ke Home par 3 button;
  - Properties mein 20 listing, co-broking button 0;
  - broker ke 4 client room;
  - Today & Clients mein sirf 3 tab;
  - koi JS error nahi.

## Abhi nahi
- Member ka **resale site visit tay karna** (OTP / bypass vaade wala). Abhi broker hi tay karta hai.
- Member ka **owner consent lena** / listing daalna. Owner ka bharosa broker se hai; ye abhi broker ke paas hi hai.

Files:
- shared: `src/shared/pcontrolRules.ts`
- server:
  - `server/permissions.ts`, `server/db.ts`, `server/pcontrol.ts`, `server/access.ts`, `server.ts`
  - `server/clientroom.ts`, `server/daily.ts`
- UI:
  - `src/components/TeamControl.tsx`, `TeamView.tsx`, `TeamHome.tsx`
  - `ClientRooms.tsx`, `ClientsView.tsx`, `DailyView.tsx`, `ChatKit.tsx`
  - `src/App.tsx`
- `tests/v58-agency-team.test.ts`
