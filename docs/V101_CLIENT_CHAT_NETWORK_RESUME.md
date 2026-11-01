# V101 — Client ka chat: need automatic, network search automatic, chat wapas khule, "network mein itne ghar"

## 0. Screenshot wala case — kya hua tha aur kyun (sach)
Client ne QR scan kiya (Amlidih · ₹40 L · Farm House) → bot ne bola "abhi koi ghar nahi" → client ne "ब्रोकर से बात" dabaya → bot chup → client ne likha "aab Shankar Nagar mein chahiye, 2.5 cr" → **kuch nahi hua**.

| Jo kaam nahi hua | Asli wajah (mera design gap) | Ab |
|---|---|---|
| Buyers requirement + network search automatic nahi | Requirement tab banti thi jab broker ka apna ghar share hota / number khulta. Client ne ✅ dabaya par broker ka apna ghar fit nahi → **kuch bana hi nahi, network scan hua hi nahi** | Client **✅ dabate hi** broker ki Buyers list mein need ban jaati hai (number chhupa: "🔒 Number opens when you share him a matching home") aur **network search turant** chalta hai |
| Client room automatic nahi | Room sirf client ke tap par banta tha | Number khulte hi (pehla matching ghar share) **room apne aap khulta hai**; chips room ke neeche rehte hain |
| "Change kar do … Shankar Nagar … 2.5 cr" ignore | "ब्रोकर से बात" ke baad bot **poora quiet** — need badalne wala message bhi dab gaya | Quiet mode mein bhi **need badalne wale shabd** apply hote hain (need, Buyers need, client card sab) — bot confirm card dubara poochta hai, ✅ par network phir se search |
| Scan dobara → purani chat gayab, pehle jaisa form | Chat link sirf ek baar mila tha; phone ko yaad nahi tha | Browser ko chat yaad rehti hai (cookie `gq_<qr>`, 180 din) → **"फिर से स्वागत है" → Continue my chat**. Naya phone/browser → **SMS code** (same QR + same mobile) se wahi chat |

## 1. Bot ab network ka haal batata hai
✅ ke baad client ko ek line: **"GENZ network mein aapke liye N property available hai — ₹X se ₹Y tak. <Broker> aapki taraf se in brokers se baat kar rahe hain; jo ghar aapke layak honge wo yahin bheje jaayenge."**
- Sirf **count + price range** — kaunsa ghar, kiska, kahan, kisse baat: kuch nahi (title, locality, doosre broker ka naam, number kabhi nahi).
- Count mein sirf wo ghar jo client ke budget ke andar (≤ budget × 1.1) — over-budget ghar gin kar jhooth nahi.
- Do bar ye line: Hindi + English, "aapke behalf" wale shabd ke saath.
- Broker ki side: lead card par `sp-network` line (network mein kitne ghar), Buyers need par network matches + "Ask the network".

## 2. Chat mein requirement update
"Change kar do", "badal do", "ab … chahiye", "X nahi, Y chahiye" (negation: Y se type/jagah/buy-rent; paisa poori line se), typo (aab), "mai/mein". Budget, area, type, BHK, buy/rent, **shehar** sab. Buyers need ek hi rehti hai (updated), duplicate nahi. Bot ki English line mein ab Hindi shabd nahi aate ("budget, area changed").

## 3. "Add to home + alerts" (user ka idea — haan, laga diya)
- Chat ke **sabse upar** card: "📲🔔 अगला जवाब मिस न हो! / Do not miss the next reply" — Alerts on / Add to home screen buttons.
- Android ke liye manual steps (⋮ → Install app), iPhone ke liye Share → Add to Home Screen.
- QR form ke neeche bhi hint: chat khulte hi home screen par jodein + alerts on.
- **Dhyan:** real alerts ke liye production server par VAPID keys chahiye (demo mein nahi hain, button subscribe nahi kar sakta); iPhone par pehle Add to Home Screen zaroori (iOS 16.4+); SMS code ke liye SMS webhook chahiye (demo mein code page par dikhta hai).

## 4. QR page UI (client scan karega tab)
- Ghar ke cards chhote (photo nahi to sirf 40px ka strip).
- Trust line: "GENZ network mein <city> ke 30+ verified ghar" (sirf number).
- 3 steps line (form → chat → matching ghar).
- "Welcome back" page: purani chat + latest need + "Continue" + "New request".
- Resume pages (phone → code) — same page chahe number ho ya na ho, ajnabi ko kuch pata nahi chalta; code 6 digit, 10 min, 5 galat try, ek baar; phone par 1 ghante mein 3 code, IP par 12.

## 5. Tests
`tests/v101-client-chat.test.ts` (17): reading ("change kar do…", "X nahi Y", price/photo alag), screenshot case end-to-end (hidden-phone need + leadId, network count/range 1 ghar ₹38 L — ₹46 L over-budget bahar, koi leak nahi, quiet mode mein change, dobara ✅ par network phir se, ek hi need), app card upar + Android steps, welcome-back (cookie / alag browser), SMS-code resume (galat code 400, ek baar, rate limit 429), QR page lines, number khulna → room auto + chips + need me number. Regression: 21 QR/bot test files (331) + v86 text update.

## 6. Apni galtiyan (is round mein khud pakdi)
1. Pehle network count mein over-budget ghar bhi aa rahe the (match score ≥60 lenient) → bot ne jhooth bola "network mein ghar hai". Budget × 1.1 filter lagaya.
2. Room auto banane se 3 purane v97 tests tootay — design change tha, par ek test mein room ke baad chips gayab the (last message room MSG) → room ke baad chips wapas.
3. Dev server UI check mein hang hua (HMR port) → production build se check kiya.
4. Bot ki English line mein Hindi shabd ("बजट, इलाका changed") — screenshot mein pakda, theek kiya.
5. Mere naye tests ke 3 galat expectation (app-card ka text JS se aata hai, rate-limit 4th request par lagta hai, bot ka last msg) — tests theek kiye, code nahi bigaada.

## 7. Abhi bhi baaki / limit
- Real push alerts: production VAPID keys + HTTPS; demo mein dry-run.
- Real SMS code: SMS webhook; warna ya to demo (code page par) ya broker naya link de.
- Pitch PDF aur USER_MANUAL **update nahi kiye** (standing instruction).
