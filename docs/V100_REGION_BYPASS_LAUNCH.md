# V100 — Jisko jahan ka chahiye, usko wahan ka; koi bypass nahi; launch audit

## 1. Client ka shehar = match ka shehar (poore India mein)
Pune ke broker ka client Raipur mein ghar chahta hai → client ko **Raipur** ke ghar dikhte hain, Pune ke nahi. Raipur ka client Indore chahe → Indore. Broker ki apni city sirf default hai.

| Jagah | Pehle | Ab |
|---|---|---|
| Buyer need (requirement) form | "Where" ka matlab saaf nahi | "Client ko property kahan chahiye?" — alag label + hint (EN/HI); matches sirf us city ke |
| `/api/matching/requirement/:id` aur `/property/:id` | doosre shehar ke ghar/needs bhi aa jaate the (**mera bug**) | `cityMismatch()` filter — alag shehar wale bahar |
| Properties tab (broker/buyer) | saare shehar | **apni city** default (yaad rakhta hai); "dusre shehar dekho" button; city dropdown mein hamesha apni city |
| Shop-QR form | sirf shop ki city | **City box** (shop ki city prefill). Customer Indore likhe to Indore ke ghar; number tab bhi nahi khulta jab tak need confirm + ghar share na ho |
| GENZ सहायक bot | sirf area badalta tha | "Indore mein 2bhk 60 lakh" → shehar bhi badalta hai (`wantCity`), client card + need + alert us shehar ke |
| Signup (invite) | city optional | **City zaroori** (`CITY_REQUIRED`); state city se nikalta hai (Ambala → Haryana, Kota → Rajasthan …) |
| Map | ~100 shehar | **227 ke 227 listed shehar** + alias (Bangalore/Gurgaon/Vizag/Poona/Mysore/Pondicherry/Trichy/…); baaki → us rajya ka beech. Tripura ka **Udaipur** alag (pehle Rajasthan mein jaata tha — **mera bug, aaj pakda**) |

## 2. Bypass band (number / koi bhi contact id)
Har jagah jahan ek insaan ka likha doosra padhta hai:
- deal-room chat, client-room chat (dono taraf), shop-QR lead chat (dono taraf), listing title/description/locality/landmark, preferred localities, offer terms, visit notes, bot ke counter text, pasted WhatsApp text (`stripContacts`), public page.
- **Number**: digits, Hindi/English shabd ("nau aath do chhah…", "ninety-eight twenty-six oh one"), spaces/dots/dashes, emoji digits, alag-alag message mein tukde (15 min ke andar — `phoneAcross`), number ke baad lage extra digits.
- **Baaki id**: email, UPI id, @handle, instagram/telegram/wa.me/t.me links, "my insta is …" jaise phrases (`containsContactId`).
- Normal baat chalti hai: "₹85 lakh", "3 BHK 1200 sqft", "kal 4 baje", "whatsapp pe baat karte hain", "meet @ the site".
- Bot kabhi phone number print nahi karta (test mein pakka).
- Tests: `tests/v100-bypass.test.ts` (60).

## 3. Spam / fake listing
- `src/shared/priceSanity.ts`: area ≥ 50 sqft ho to bechne ka ₹150/sqft se kam ya ₹5,00,000/sqft se zyada, kiraya ₹1/sqft se kam ya ₹1000/sqft se zyada → **422 `PRICE_SANITY`** saaf wajah ke saath (typo me zero chhoot gaya / bait price). Kheti-zameen, farm house, industrial plot, warehouse par neeche wali limit nahi lagti. Admin bypass kar sakta hai. Create, edit aur price-update teeno par.
- Pehle se: honeypot + timer, rate limits, per-QR cap, 3 reports → auto-hold, duplicate hash, probation/new-account caps, Network Watch.

## 4. Naye property types (21 ho gaye)
PG / Hostel, Co-working Space, Hotel / Guest House, Banquet / Marriage Hall, Parking / Garage, Factory / Industrial Shed, School / Hospital Building. Hindi label, icon, related-type group, WhatsApp paste parser (strong-anchor rules: "flat near school" ya "covered parking" flat hi rehta hai), QR form.

## 5. Tests
`tests/v100-region.test.ts` (11), `tests/v100-bypass.test.ts` (60), `tests/v100-coverage.test.ts` (14: 227 shehar ka map, alias, Udaipur, findCityNames, priceSanity, naye types, CITY_REQUIRED + state, PRICE_SANITY). Purane 3 test files mein registration body mein city joda (ab zaroori hai).

## 6. Apni galtiyan (jo is round mein khud pakdi)
1. Match endpoints (per requirement / per property) doosre shehar ka maal bhi bhej rahe the.
2. Contact checker mein gaps: number ke baad trailing digits, bole hue numbers, "oh"=0, social-id phrases.
3. Pehle "meet @ the site" jaisa normal text email samajh liya gaya (false positive) — theek kiya.
4. New types ka pehla parser "flat near school/parking" ko galat type de raha tha — strong-anchor rules lagaye.
5. Udaipur (Tripura) map par Rajasthan mein tha.
6. Mera pehla full-suite run beech mein edits ke saath chala — isliye final run alag se kiya.

## 7. Launch ke liye jo ab bhi manual / baaki hai (sach)
- **Supply side approval ops-gated hai** (invite → waitlist → ops approve → KYC → admin verify). Design se "kuch auto-approve nahi" — quality ke liye. Growth ki speed utni hogi jitni tez ops approve karein; demand side (QR / bot / owner link) bina account ke chalta hai.
- **Tele-calling**: in-app calls, call log/list, forward, roles, HR/attendance sab hai. Lead ko seedha phone lagana (click-to-call/IVR) ke liye paid telephony (Exotel jaisa) chahiye — abhi nahi jura.
- Real SMS/WhatsApp/push ke liye production keys (SMS webhook, VAPID) daalne hain; demo mein dry-run.
- Pitch PDF aur USER_MANUAL **update nahi kiye** (standing instruction).
