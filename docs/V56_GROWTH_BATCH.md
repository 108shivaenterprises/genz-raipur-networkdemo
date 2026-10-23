# v56 — Growth batch: naya broker atke nahi, owner ko demand dikhe, buyer ghar save kare, shop ki lead client room mein

Role audit (`ROLE_AUDIT_V54.md`) ki growth wali chaar cheezein, aapki "han kar do" ke baad.

## 1. Naya broker (verification pending): dead end khatam
**Pehle:** sirf "Verification in progress…" aur "Sign out". Na pata chalta tha kaun sa kaagaz chahiye, na upload ka raasta.

**Ab isi screen par:**
- **3 kadam:**
  1. ✓ Account ban gaya
  2. PAN aur masked Aadhaar ki photo (dono lagte hi ✓)
  3. GENZ team jaanchti hai, hote hi access mil jaata hai
- **PAN aur masked Aadhaar ki photo:** jodna, badalna, hatana, aur "Photo → PDF". Ye wahi upload hai jo My ID mein hai. Server pending user ko ye pehle se karne deta tha, bas screen par option nahi tha.
- **GENZ ne badlaav maanga ho** to upar peeli patti mein unka note aata hai. Nayi photo daalte hi jaanch apne aap phir shuru ho jaati hai (pehle ka niyam).
- **"Check again"** button (page reload), aur Sign out.
- **KYC ke niyam bilkul nahi badle.** Kaun approve karta hai, kya jaancha jaata hai, sab pehle jaisa. Sirf upload ka raasta is screen par aaya hai. Aapki haan ke baad hi kiya.

## 2. Owner: "kitne buyer meri jaisi property dhoondh rahe"
- Owner ke Home par "How my listings are doing" mein har live listing ke upar hari line:
  **"4 buyers on GENZ are looking for a home like this — brokers can show it to them"**.
- Ginti GENZ ke matching niyam (Magic Match wale) se aati hai. Sirf woh khule buyer needs gine jaate hain jinka score 50% ya usse zyada hai.
- Owner ko **sirf ginti** dikhti hai. Naam, number, buyer ka broker, kuch nahi (test se jaancha). Bypass ka raasta nahi khulta.
- Faayda: owner platform par bana rehta hai aur apne broker ko kaam karne deta hai.

## 3. Buyer: ghar save karna (shortlist)
- **Properties** aur **Magic Match** mein har ghar par **"♡ Save"** button (Magic Match mein buyer ko co-broking button ki jagah).
- **Home** par naya section **"Saved homes"**: photo, naam, ilaka, keemat. Tap karne par wahi property khulti hai. Ghar bik jaaye to "no longer available" likha aata hai.
- Server par sirf property ki id rehti hai.
  - Kisi ko nahi bataya jaata ki kisne save kiya. Listing broker ko bhi nahi, kyunki koi lead nahi banti aur buyer kisi ke haath nahi jaata.
  - Ek buyer zyada se zyada 100 ghar save kar sakta hai.
- **"I'm interested"** abhi bhi nahi banaya. Wo kis broker ke paas jaaye, ye niyam aapko tay karna hai (neutral platform).

## 4. Shop QR ki lead → seedha client room
- Lead card par ab sabse pehla button **"Open a client room"** hai. Dabate hi Client Rooms ka naya-room form khulta hai jisme pehle se bhara hota hai:
  - lead ka naam aur mobile;
  - kism (khareedna → Buyer, kiraye par chahiye → Renter, baaki → Other);
  - aapke liye private note: "Shop QR lead … · dukaan ka naam".
- Client ki **sahmati ka tick aapko khud lagana hai** (DPDP, pehle jaisa).
- Call / WhatsApp ab bhi hain, par chhote. Neeche saaf likha hai: *"Call ya WhatsApp GENZ mein darj nahi hota; client room mein chat, dikhaye ghar aur visit darj rehte hain. Lead ya dukaan ke hisse par kabhi sawaal uthe to kaam aata hai."*
- Naam aur number URL mein nahi jaate. Wo is tab ke session storage se form tak pahunchte hain.
- Lead ke status wale chips (New / Spoke / Visit done…) ab bade hain (36px).

## Tests
- Naya `tests/v56-growth.test.ts` (4 test):
  - buyer save / unsave, Home par dikhna, response mein owner / pata / maps nahi;
  - galat id 404, bina login 401;
  - owner ki demand ginti sirf number hai, aur naya matching buyer need jodne par badhti hai;
  - pending broker apni ID jaanch padh sakta hai, aur baaki sab band hai.
- Poora suite: **64 files / 908 test pass**. Ek purani file (`v16-6-papers`) ke sab 20 test pass hue, par test ke baad temp folder mitate waqt ek baar race aaya (server abhi likh raha tha). Akele dobara chalaya to saaf pass. App ke code se iska lena-dena nahi.
- Phone par check (390px):
  - pending broker ki screen (3 kadam, dono ID slot);
  - owner ki demand line;
  - buyer: Magic Match mein Save → "Saved", Properties mein 20 Save button, Home par Saved homes;
  - shop lead → client room form mein naam "Sanjay Verma" aur mobile bhara mila.

## Imaandari wali baatein
- Demand ginti utni hi sahi hai jitne buyer needs GENZ par darj hain. Shuru mein kam dikhegi.
- Check desktop browser ko 390px chauda karke kiya. Manual update nahi kiya.

Files:
- server: `server/saved.ts` (naya), `server/homeinsights.ts`, `server/db.ts`, `server.ts`
- components: `LoginView.tsx`, `HomeInsights.tsx`, `PropertiesView.tsx`, `MatchCenterView.tsx`, `ShopPartners.tsx`, `ClientRooms.tsx`
- `src/App.tsx`, `src/lib/api.ts`, `tests/v56-growth.test.ts`
