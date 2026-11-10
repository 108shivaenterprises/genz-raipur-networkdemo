# V121 — Profile photo seedha live + aapke niyam (10 Nov)

## 1. Profile photo: sabke liye seedha live
- **Pehle:** photo GENZ ke approve karne tak kisi ko nahi dikhti thi.
- **Ab:** upload karte hi sab members ko dikhti hai. GENZ baad me ID se milata hai; tabhi **"Photo checked by GENZ"** mark aata hai. GENZ reject kare to photo hat jaati hai.
- Nayi photo purani ko turant badal deti hai (mark dobara check tak hat jaata hai). Leaderboard aur profile ka "photo ✔" sirf checked photo par.
- Photo ab bhi sirf signed-in members ko dikhti hai, public nahi.
- Code: `server/profilephoto.ts`, `profiles.ts`, `leadboard.ts`, `VerifiedPhoto.tsx`, `PublicBrokerQrModal.tsx`; test `tests/v36-verified-photo.test.ts`.

## 2. "Dusre broker ke client ka number kisi broker ko nahi" — pehle se lagu
- Requirement / Radar / Needs: dusre broker ka client **initials + masked number** (v20).
- Site visit: owner aur dusre broker ko initials + masked (v54).
- Offer / buyer bond: sirf laane wale broker ko aakhri 4 ank.
- Builder ko number tab milta hai jab broker khud client ko us project par register karta hai.
- Signup wali salah ka point 3 galat likha tha (jaise ye chhoot ho). Aisi koi chhoot nahi hai, na banegi.

## 3. Listing ka verification owner ke mandate se (GENZ par load nahi) — switch pehle se hai
- GENZ har listing check **nahi** karta; listing turant live hoti hai. Owner ki permission ka system (link + OTP, ya sign kiya form, ya mandate) bana hua hai, par **switch band** hai.
- **Aapko chalu karna hai (superadmin):** Control Center → "हर नई ब्रोकर लिस्टिंग से पहले मालिक की सहमति ज़रूरी" tick. Uske baad broker bina owner ki haan ke listing live nahi kar sakta.
- Purani listings par asar nahi; sirf nayi par.

## 4. 180 din ka bypass niyam — bana hua hai, din badalne hain
- Owner ki sahmati ke shabd (oc-v2) me pehle se: jo client/broker is listing se aaya, **aur uske parivar, rishtedaar, nominee, firm**, primary broker ke bina seedha sauda nahi karenge.
- Buyer side: visit/offer par "buyer bond", usi property par dusra broker us buyer ke liye visit/offer nahi kar sakta.
- **Default abhi 30 din hai, maximum 180.** Aapko: Control Center → Protection days → default **180**. Purane bond apne din rakhte hain.
- **Seema (sach):** app ye nahi jaan sakta ki koi kiski patni ya bhai hai. Rishtedaar wala niyam **likhit sahmati** me hai; bypass pakadne par wahi saboot hai (Network Watch / dispute). App khud sirf wahi mobile number rok sakta hai.

## 5. Khula signup — abhi nahi bana (agla round)
Tay niyam: mobile OTP; PAN + Aadhaar ke aakhri 4, ek PAN = ek account; bina RERA wala "Non-RERA" badge, RERA project band; ek phone/IP se signup limit; 3 report par account apne aap ruk jaye. Live par OTP ke liye SMS relay (`SMS_WEBHOOK_URL`) chahiye.
