# V127 — QR lead se co-broke, aur "jisne pehle dikhaya, client usi ka" (11 Nov)

## 1. Aapka sawal: QR se requirement aayi, broker ke paas property nahi, dusre broker ke paas hai
**Pehle (chala ke dekha):** Broker A ko lead card par "network me N ghar" dikhta tha aur Magic Match me Broker B ka ghar bhi, par A use client ki chat me **bhej nahi sakta tha** (400). Raasta tabhi khulta tha jab B apna ghar "dusre brokers ke page ke liye" khole aur A use apne QR page par tick kare: do alag screen, kisi ko pata nahi. Client ka number bhi chhupa rehta tha, to A atak jaata tha.

**Ab ka flow:**
1. Client QR scan → ✅. A ka apna ghar nahi, network me hai. Lead card par naya button **"🤝 इन ब्रोकरों से को-ब्रोक माँगें"**.
2. A dabata hai → zaroorat (type, ilaka, budget; **naam/number nahi**) un brokers ko jaati hai jinke paas matching ghar hai.
3. B ko "Buyer for your listing?" alert → **"I have it"** + apna ghar chunta hai. Yahi uski co-broke ki haan hai.
4. Wo ghar A ke lead card par "bhejne layak" list me aa jaata hai → A **Share** dabata hai → client ki chat aur client room me ghar, client ka number A ko khul jaata hai. Client ko B ka naam kahin nahi dikhta.
5. Client "📅 विज़िट चाहिए" → A haan karta hai → A site visit book karta hai → **deal room** apne aap: A = client laane wala, B = listing wala. Aage offer / token / commission split deal room me.
B ke haan karne se pehle A wo ghar nahi bhej sakta (test me pakka kiya).

## 2. Aapka sawal: wahi client, wahi property, dusre broker ke QR se
**Pehle (chala ke dekha):** dusre broker ko **kuch nahi** dikhta tha. Wo visit bhi book kar leta tha, offer bhi. Suraksha sirf site par verify hui visit ya offer se shuru hoti thi, aur jo pehle wo kar le client usi ka; yaani baad me aaya broker pehle wale se client le sakta tha.

**Aapke faisle (11 Nov):** jisne pehle dikhaya uska · dusra ruke + co-broke maange (naam nahi) · client ko ghar dikhe par visit par roka jaye.

**Ab:**
- A ne chat me ghar bheja (ya bot ne dikhaya) **ya** visit book ki → usi pal us **client + us property** par A ka "buyer bond".
- Wahi client Broker C ke QR par aaye: C ko wo ghar "bhejne layak" list me nahi milta, number us ghar ke bharose nahi khulta. C share / visit / offer kare to **409: "यह खरीदार इस प्रॉपर्टी पर पहले GENZ का दूसरा ब्रोकर लाया था…"** A ka naam nahi.
- C **co-broke request** bhej sakta hai; tab A ko C ka naam, company, mobile milta hai.
- Client ko C ki chat me saaf line: "आपकी ज़रूरत का एक घर आप पहले से GENZ के एक दूसरे ब्रोकर के साथ देख रहे हैं… यहाँ मैं दूसरे घर दिखाऊँगा।" (kaun broker, nahi batata). C ke QR page ki aam list me ghar dikhta rehta hai.
- **Listing broker B bhi** us client ko apne hi ghar par seedha nahi le sakta (409), jab tak wo A ki deal room me na ho. Yahi bypass rok hai.

## 3. Dhyan
- Bond ke din abhi **30** hain (default). Aapne 180 kaha tha: Control Center → Protection days → 180.
- "Visit book karte hi bond" ka galat istemal ho sakta hai (koi broker kisi ka number daal ke jhoothi visit book kare aur client "pakad" le). Abhi rok: visit ki ghante-wali limit, GENZ staff saboot par bond radd kar sakta hai, holder khud chhod sakta hai.
- Purana test "booked visit se bond nahi banta" naye niyam ke hisaab se badla.

## 4. Code / tests
`server/shopPartners.ts` (matchesFor: network ke jawab wale ghar + bond wale ghar bahar; offer 409; SHOWN bond), `server/sahayak.ts` (client ko line), `server/buyerbond.ts` + `server/db.ts` (source SHOWN / BOOKED), `server.ts` (visit book par bond), `ShopPartners.tsx` (AskNetwork button), `leadBrief.ts`. Tests: `tests/v127-cobroke-qr.test.ts` (6), `tests/v29-buyer-bond.test.ts` badla.
