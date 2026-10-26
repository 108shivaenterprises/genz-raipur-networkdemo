# v72 — Fee % (final price), आपस का हिसाब, lead-fee, shop page progress, owner room ऑफ़र

## 1. Har broker apni fee % me likhe
- हिसाब → "ख़रीदार से मेरी फ़ीस (अंतिम कीमत का %)" — % (0.1–10) ya fixed ₹. Final price badle to rakam apne aap badlegi (jaise 1% × ₹40L = ₹40,000).
- Listing broker ki owner-wali rakam mandate se aati hai; buyer-side fee uske upar judti hai ("owner side + buyer side").
- Khareedar ka brokerage bill (v48) isi % se prefill hota hai.

## 2. Dusre broker ko kya dikhta hai
- Sirf **"wo mujhe dega: 1% × ₹40L = ₹40,000"** — yani jo wo mujhe de raha hai.
- Listing broker ka ₹10L surplus, owner net, uski buyer-side fee, uska plan — kuch nahi (`feePlans` har response se hata hai).

## 3. "ख़रीदार ने सीधे ब्रोकर को दिया"
- भुगतान लिखें → "ख़रीदार ने सीधे ब्रोकर को दिया" (jaise ₹30L owner ko + ₹10L broker ko).
- Kimat me ginta hai; receive karne wale broker ke "मिला" me apne aap aata hai; owner ke "हाथ में" se kat jaata hai aur uske brokerage "diya" me ginta hai.
- Dusre broker ko is entry ki **rakam nahi dikhti** (sirf "rakam nahi dikhti" + note ki "baaki" zyada dikh sakta hai).

## 4. आपस का हिसाब
- Dono broker apna "main dusre ko deta hoon" % likhte hain. Sirf **farq** chalta hai: dono 1% → "✔ बराबर". Farq ho to "main sirf farq doonga / wo sirf farq dega".
- Aapas me paisa gaya to "दूसरा ब्रोकर" chunkar likhein — ye "आगे दिया" me nahi, aapas ke hisaab me ginta hai.

## 5. Lead-source fee (shop QR)
- Sirf us broker ko jiski lead hai: "📍 लीड-सोर्स फ़ीस (सिर्फ़ आपको दिखती है)", shop ka naam + rakam (anumaan; lead "deal done" likhne par final). Wo ise **apne hisse se** deta hai — koi pool nahi.
- Dusre broker ko ye line, shop ka naam ya lead ka source kahin nahi dikhta.
- "Sab nipatne par mere haath me (anumaan)" = meri fee + aapas ka lena − aapas ka dena − lead fee.

## 6. Shop partner page (`/sp/<token>`)
- Har lead par 5-step line: **लीड → विज़िट → ऑफ़र → एग्रीमेंट → पूरा**.
- Agreement stage se "आपका हिस्सा (अनुमान)"; deal close hone par final. **Deal ki kimat shop ko kabhi nahi dikhti.**

## 7. Owner room
- "💬 ऑफ़र": amount + validity, **khareedar ka naam nahi**. Owner bina account ke **Accept / Counter / Decline** kar sakta hai (wahi rules jo normal offer flow me; apna hi counter khud accept nahi kar sakta). Broker ko phone alert.
- "🗓 आने वाली विज़िट": sirf samay; **ठीक है / दूसरा समय** — jawab visit par save + broker ko alert. (Ye sirf soochna hai, visit ko block nahi karta.)

## Tests
`tests/v72-fees.test.ts` (11), `tests/v72-leadfee.test.ts` (3); v71 ka ek test badla (co-broker ko diya paisa ab "आगे दिया" nahi, aapas ke hisaab me). Poora suite hara.

## Dhyan rakhein
- Fee % dono brokers apni-apni likhte hain; mismatch ho to dono apni screen par % dekh kar baat karein (app unko zabardasti match nahi karata).
- GENZ ab bhi kisi ka paisa nahi rakhta — sab sirf record.
- RERA/mandate wording abhi parked.
