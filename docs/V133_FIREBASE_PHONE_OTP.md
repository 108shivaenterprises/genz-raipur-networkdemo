# V133 — Firebase (Google) phone OTP (12 Nov)

## Kya bana
Google ka Firebase client ke phone par SMS se 6-ank code bhejta hai. Ye abhi **teen jagah** juda hai:
1. **Dukaandaar ka page** (`/sp/…`): mobile → code.
2. **Client room** (`/r/…`): mobile → code.
3. **"SMS कोड से पुरानी चैट खोलें"** (QR chat me wapas aana).

**Band hai jab tak aap 2 values nahi dalte.** Tab tak sab pehle jaisa chalta hai (broker code padh ke batata hai).

## Kaise chalta hai
- App apna code pehle ki tarah banata hai, par SMS nahi bhejta; use 10 minute ke liye band (encrypted) rakhta hai.
- Client ko `/otp` page par bheja jaata hai. Wahan Google usko apna code SMS karta hai; client wo daalta hai.
- Google ek sign kiya hua token deta hai. Server uski jaanch karta hai (Google ka signature, aapka project, samay, +91 number, pichhle 10 minute me verify hua).
- Sahi ho to server app ka code usi browser ko deta hai, jo use apne aap flow ke `/verify` par bhej deta hai. Client seedha andar.
- Broker ab code **nahi** dekh sakta (pehle bina SMS ke wo padh ke batata tha).
- `/otp` page sirf in teen flow ke apne `/verify` par hi code bhej sakta hai; kisi aur pate par nahi.

## Aapko kya karna hai (ek baar)
1. https://console.firebase.google.com → **Add project** (naam: genz-broker-network).
2. Project ko **Blaze (pay-as-you-go)** plan par karo: phone OTP ke liye billing account zaroori hai (Sept 2024 se free plan par SMS band hai).
3. **Build → Authentication → Get started → Sign-in method → Phone → Enable.**
4. **Authentication → Settings → Authorized domains** me apna live domain jodo (jaise `genz-raipur-networkdemo.vercel.app`, aur baad me apna asli domain).
5. **Project settings (⚙) → General → Your apps → Web app (</>) banao** → wahan `apiKey`, `projectId`, `appId` milenge.
6. **Vercel → Project → Settings → Environment Variables** me daalo, phir redeploy:
   - `FIREBASE_API_KEY` = apiKey
   - `FIREBASE_PROJECT_ID` = projectId
   - `FIREBASE_APP_ID` = appId (optional)
   - `FIREBASE_AUTH_DOMAIN` = sirf tab jab `<projectId>.firebaseapp.com` na ho
   (apiKey chhupane wali cheez nahi hai; Firebase me ye public hota hai. Phir bhi chat me mat bhejo, seedha Vercel me daalo.)
7. Firebase → Authentication → Settings → **SMS region policy**: sirf **India** allow karo (videshi number par SMS ka kharcha aur fraud rukta hai).

## Kharcha (12 Nov 2026 ko dekha)
- Firebase ke pricing page ke mutabik phone auth "billed per SMS sent"; rate Google Cloud Identity Platform ke page par hain.
- Teesri-party guides ke mutabik India ka rate lagbhag $0.01 prati SMS aur roz ke pehle 10 SMS free. Ye maine Google ke apne rate page se pakka nahi kiya; billing chalu karne se pehle wahan dekh lena.
- Bina upgrade ke roz 3,000 SMS ki seema.

## Seemaein (sach)
- **Maine ise asli SMS ke saath nahi chalaya**: Firebase project ke bina ho hi nahi sakta. Jo jaancha: token ki jaanch (nakli signature, dusra project, purana, videshi number sab mana), `/otp` page ka khulna, galat pata mana, baaki app ki suraksha policy jas ki tas. Pehli asli jaanch aapke values dalne ke baad hogi.
- Firebase sirf **code** bhej sakta hai, apna likha message nahi. Isliye **visit reminder jaise SMS is se nahi jayenge**; unke liye MSG91 jaisa provider hi chahiye.
- Abhi **nahi juda**: owner ka mobile login, broker ka login / password reset, visit par client ka code, owner ki sahmati ka code, khula signup. Ye agla kadam hai, pehle teen flow asli SMS par chal jayein.
- `/otp` page par Google ka reCAPTCHA chalta hai; kabhi-kabhi client ko tasveer wala sawal dikh sakta hai.

Code: `server/phoneOtp.ts` (naya), `server/notify.ts`, `server/shopPartners.ts`, `server/clientroom.ts`, `server.ts`. Test: `tests/v133-firebase-otp.test.ts` (5).
