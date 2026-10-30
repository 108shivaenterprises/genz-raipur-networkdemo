# v93 — Ek dukaan, ek QR: doosra broker usi shop par QR nahi laga sakta + shop ki live-camera GPS photo

## Sawal
Doosra broker usi shop par apna QR laga de to? Kaise rokenge?

## Jo bana
1. **Proof of place:** naya shop partner jodte waqt broker ko dukaan par khade hokar **app ke live camera** se photo leni hoti hai (gallery se nahi). Photo ke saath phone ka **GPS** (±150 m se achha) liya jaata hai; photo par lat/long + time likha aata hai. Server par private rakhi jaati hai (`data/shopphotos/`); sirf wahi broker aur GENZ admin dekh sakte hain. Card par "📍 Location + photo recorded".
2. **Ek shop = ek QR:** koi **aur broker** usi shop ka QR nahi bana sakta agar —
   - **dukaandaar ka mobile wahi hai**, ya
   - **25 m ke andar + shop ka naam wahi** hai —
   aur pehli partnership ACTIVE / PAUSED hai (ya 14 din se kam purani PENDING). Jawab: "Is shop par pehle se GENZ ka QR hai…" — kaun sa broker hai ye **nahi bataya jaata**. Koi bhi koshish audit mein (`SHOP_ALREADY_HAS_QR`). Pehli partnership END hote hi shop free.
3. **Market ka dhyan:** 25 m ke andar alag naam + alag mobile wali dukaan allowed hai; GENZ ko audit note milta hai (`SHOP_QR_NEAR_ANOTHER`).
4. Pehle wali (14 din se purani) PENDING partnership shop ko roke nahi rakhti — koi broker squat nahi kar sakta.

## Kab zaruri
Real server (NODE_ENV=production) par photo+GPS **zaruri** hai. Local/demo par optional (tests aur demo chalte rahein); zabardasti ke liye `SHOP_PROOF_REQUIRED=true`, band karne ke liye `=false`.

## Imaandari wali limits
- Browser GPS/camera ko nakli (fake GPS app, screen par photo ki photo) kar sakte hain — ye rokta nahi, sirf mushkil aur saboot-trail banata hai. Zyada pakka: dukaandaar ka khud ka OTP-accept (pehle se hai) + admin photo dekh sake.
- **Dukaan par chipka hua doosra QR sticker** software se nahi roka ja sakta; sirf dukaandaar ya admin ko pata chalega jab koi lead us QR se aaye. Shikayat par admin ko photo + GPS dikhti hai.
- Purane partners par photo nahi hai; unpar sirf mobile wala rule lagta hai.

## Test
`tests/v93-one-shop-one-qr.test.ts` (6). Pitch PDF / USER_MANUAL untouched.
