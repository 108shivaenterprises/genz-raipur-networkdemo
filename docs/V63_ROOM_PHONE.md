# v63 — Client room mein client ka number: broker ko dikhe, team mein broker tay kare kisko

Aapka faisla: jis client ka number broker khud add karta hai, wo number broker ko room mein dikhe (call / WhatsApp), team mein broker tay kare ki kisko dikhe, aur team ke kholi hui client rooms broker jab chahe dekh sake.

## Kya bana
1. **Room ke andar number bar** (chat ke upar): `+91 98222 00003` · **Call** · **WhatsApp** · copy.
   - Naya room banate hi number server par **encrypted (AES-256-GCM, vault key)** save hota hai.
   - Room list, audit, GENZ admin ki screen aur dusre broker ko ab bhi sirf **last 4 ank** (`••0003`) jaate hain.
   - Room **band** hone par (ya link ki avadhi khatam hone par) number turant **mit jaata hai**. Broker ka account mitane par uski saari rooms ke number bhi mit jaate hain (DPDP).
2. **Team mein kisko dikhe — wahi switch jo client list ka hai** (My Team → member → "Customer phone numbers"):

| Switch | Member ko room mein |
|---|---|
| Always visible | poora number + Call / WhatsApp |
| Tap to reveal (logged) | "Show number" button; ek tap par dikhta hai. Roz ki limit usi cap mein ginti hoti hai; audit mein `CLIENT_ROOM_PHONE_REVEALED` |
| Never | sirf `••0003`; reveal 403 |

   - Ek hi room ko usi din dobara kholna cap mein dobara nahi ginta.
   - Switch ke neeche hari line: "Yahi switch tay karta hai ki client room mein client ka number kisko dikhe."
3. **Team ki client rooms broker jab chahe dekhe:** broker ko apni aur team ki **saari rooms** pehle bhi dikhti thi; ab list mein har room par "द्वारा Rakesh" aur upar chips **Whole team / Mine / <member naam (ginti)>** — ek member ki rooms alag dekh sakte hain. Room kholne par poori chat (member ke sandesh par uska naam) dikhti hai.
4. **Purane rooms** (v63 se pehle bane): unme sirf last 4 the. Broker room kholkar number ek baar daalta hai ("Number save nahi hai"); wo room ke key se **match** hona zaroori hai, galat number 400. Staff ye nahi kar sakta.

## Niyam jo nahi badle
- Client ko number nahi dikhta, chat mein phone number type nahi hota.
- Number kisi URL, audit ya export mein nahi jaata (test se jaancha: data file mein plain number nahi milta).
- Koi naya permission nahi (switch purana hai); koi paid service ya naya package nahi.
- Agar server par vault key hi na ho to room chalta hai, bas number save nahi hota (sirf last 4).

## Tests
- Naya `tests/v63-room-phone.test.ts` (7 test): broker ko poora number, list mein sirf last 4, dusra broker 404; data file mein sealed (plain number nahi); staff ke teeno mode (FULL / REVEAL / HIDDEN) + daily cap 429; staff ki kholi room broker ko "kisne kholi" ke saath; number save sirf broker, match zaroori; room band → number mit gaya.
- `v31-client-room` ka ek purana assert badla (pehle likha tha ki broker ke response mein bhi number nahi — ab broker ke response mein hai, list mein nahi).
- Phone par (390px): broker ki room mein number bar; staff "Show number" → number; list mein chips.

## Imaandari
- Demo server (Vercel) par agar vault key banane layak jagah na ho to number nahi dikhega; asli server par `KYC_VAULT_KEY` pehle se zaroori hai (Aadhaar vault ke liye), wahi key yahan bhi chalti hai — **uska backup rakhna zaroori hai**, kho gayi to saved numbers nahi khulenge.
- Staff ne number dekh kar apni phone book mein utaar liya, to GENZ use rok nahi sakta — isi liye "Tap to reveal" mein har reveal audit mein hai.
- Manual update nahi kiya.

Files: `server/clientroom.ts`, `server/db.ts`, `server/privacy.ts`, `server/demoBulk.ts`, `src/components/ClientRooms.tsx`, `src/components/TeamControl.tsx`, `src/lib/api.ts`, `tests/v63-room-phone.test.ts`, `tests/v31-client-room.test.ts`.
