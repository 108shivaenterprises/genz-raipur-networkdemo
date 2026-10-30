# v90 — Location sahi, network match turant, QR par ghar broker chune

## 1) Location (har jagah, sirf QR mein nahi)
Problem: "Raipur" likhne wale client ko "Shankar Nagar" ka ghar match nahi hota tha; "Shanker Nagar" aur "Shankar Nagar" alag ginte the; signup par area ka pata nahi chalta tha.

Naya engine `src/shared/places.ts` (ek hi jagah, server + app dono):
- **Poora shahar**: area mein sirf shahar ka naam (ya khali, "anywhere", "पूरा शहर") = us shahar ka koi bhi area match.
- **Spelling**: Shanker/Shankar/shankarnagar/TELIBANDA, "Shankar Nagar, Raipur" = ek hi jagah. Hindi naam (शंकर नगर) Raipur ke areas ke liye. Sector 2 ≠ Sector 21.
- **Paas ka area (near)**: ek hi zone ke area (Raipur: Central, VIP Road side, Naya Raipur) = kam score (16) par miss nahi.
- Shahar area-box mein likha ho aur city khali ho to shahar pehchana jaata hai (`inferCity`).
- Lagu: matching (score), Daily/Magic Match prefilter, broadcast, shop-QR ghar match, naya requirement/listing save (area tidy hokar save), QR form (area suggestions + tidy), signup/har LocationFields (shahar ke apne areas ki list, blur par tidy), requirement form (🏙️ "Poora shahar" chip).
- **Signup**: "Aap kin ilakon mein kaam karte ho?" chips (shahar ke areas suggest) + apna area. Save: `user.homeLocality`, `user.profile.areas`.
- Limits: areas ki list abhi Raipur mein sabse bhari; doosre shahar free text + purani list. Zone sirf Raipur ke liye (jo pakke the). Naye shahar jodte waqt `CITY_ZONES` / `CITY_LOCALITIES` badhayein.

## 2) QR page par kaun se ghar
Broker ab Shop QR screen par hi tick karke chunta hai (🏠 "Mere QR page par kaun se ghar dikhein"): apne verified ghar + network ke khule ghar; "Hide all" / "Show all my homes"; public page band ho to "Turn on". Apne aap kuch nahi dikhta; owner-sahmati ka tick ek baar. Wahi list public page par bhi.

## 3) Requirement aate hi network match
- Naya need banate hi broker ko dikhta hai: "Network mein N ghar" (top 5, broker ka naam, score) + push; N=0 ho to "abhi nahi — match aate hi batayenge".
- Need ke card par 🌐 "Network has N matching homes" apne aap load hota hai. Sirf uska apna broker dekh sakta hai.
- Shop-QR se aayi need par bhi wahi push.

## 4) Aur
- Need card par "Today & Clients mein jodein" (client ki sahmati ke tick ke saath).
- Home par 📍 Shop QR tile: is hafte leads / owners / shops, ya "Pehli dukaan jodein (2 min)".
- Partners tab: lambi chetavni har card se hata kar ek baar upar.
- Dukaan ka page: kamai/ginti pehle, 💡 "zyada lead kaise" tips, alert card neeche.
- Bell todo: "2+ ghante se customer ko reply nahi" (partnerReply).
- Nahi kiya: 11px→12px (779 jagah, alag se tay karein).

## Test
`tests/v90-places.test.ts` (7), `tests/v90-network-needs.test.ts` (4: area tidy, poora shahar, sirf apna broker, QR ghar chunna — chunne wala hissa demo mein 2 se kam ghar ho to chhoot jata hai).
Pitch PDF / USER_MANUAL untouched.
