# v64 — Shop QR page par ghar, "I'm interested", "direct deal nahi" promise, shop ka naam

## Kya bana
- Shop ke QR (`/q/CODE`) par ab us broker ke **public page wale ghar** dikhte hain: uske apne + dusre brokers ke jinhone "others may show" switch ON kiya hai (default OFF). Network wale ghar par "GENZ नेटवर्क लिस्टिंग" badge.
- Upar do button: **मुझे घर चाहिए** / **मुझे अपनी प्रॉपर्टी देनी है**. Har ghar par **मुझे पसंद है / I'm interested** — form me wahi ghar pre-select ho jata hai.
- **Lead sirf QR wale broker ke paas jati hai.** Jis broker ki listing hai use customer ka naam/number nahi dikhta; deal co-broking offer se hi chalti hai.
- Khareedne / kiraye par lene wale ko **"सीधा सौदा नहीं" promise** par tick + naam type karke sign karna padta hai (v33 ka `ackText`, v1 wording — naya RERA wording nahi).
- Lead card, client card, audit aur push me **kis shop QR se aayi** aur **kaun sa ghar** dikhta hai.
- Agar broker ke paas layak ghar nahi: lead uski hi rehti hai → **"No home yet? Find in network"** se buyer need banti hai, Magic Match poore network me dhundta hai, phir broker co-broking offer bhejta hai. Lead apne aap kisi aur ko nahi jati.
- Seller lead sirf lead hai (promise nahi); listing tabhi banegi jab owner ki sahmati ho.

## Rules / suraksha
- Ghar tabhi dikhte hain jab broker verified ho aur uska public page ON ho.
- Owner, address, number, map link page par kabhi nahi.
- Listing broker ne switch OFF kiya to ghar turant hat jata hai; wapas ON karne par apne aap nahi aata — QR wala broker dubara add karta hai.
- Unverified QR lead se BuyerBond **nahi** banta (misuse ka risk).

## Tests
- `tests/v64-shop-qr-homes.test.ts` (9) + `tests/v46-shop-partners.test.ts` (BUY ab tick+sign maangta hai).

## ईमानदार सीमाएँ
- Sign sirf typed naam hai, OTP nahi — galat number se bhi bhara ja sakta hai.
- Promise ki wording vakil se review honi baaki hai (RERA/mandate wording parked).
- Ghar tabhi dikhte hain jab broker ka public page ON ho aur "others may show" switch ON ho.
