# V98 — Sirf Raipur nahi: poore India ke liye

## Kya badla
Asli code mein jahan "Raipur" chupa default tha, wahan ab **shop / broker ki apni city** use hoti hai. Demo data (Raipur ke ghar, brokers) demo ke liye jaisa tha waisa hi hai.

| Jagah | Pehle | Ab |
|---|---|---|
| Shop-QR lead → client card, buyer need | city khaali ho to "Raipur" | shop ki city, nahi to broker ki city, nahi to khaali (kuch banaya nahi jaata) |
| QR form ka "इलाका" suggestion list | Raipur ke ilaake | shop ki city ke ilaake |
| QR form ka locality tidy-up | Raipur ke spelling | shop ki city ke spelling |
| QR page par ghar | broker ke **saare** public-page ghar | sirf **shop ki city** ke ghar (city khaali ho to pehle jaisa) — *test ne pakda: Pune ki shop par Raipur ke ghar dikh rahe the* |
| Lead card → "Add & find matches" | city khaali → "Raipur" | lead ki asli city |
| Broker Home → WhatsApp report link / text | "Raipur ke verified ghar" | broker ki apni city ("<city> ke verified ghar") |
| GENZ सहायक bot — area padhna | sirf Raipur ke jaane-pehchaane ilaake | **us city ke** jaane-pehchaane ilaake **+** sentence se koi bhi ilaaka |
| Map pin | 35 shehar; baaki → India ka beech | **~100 shehar**; list mein na ho to **us rajya ka beech** (rajya na ho to pehle jaisa) |
| Police verification (rent desk, template, WhatsApp text) | "CG Police Citizen Portal" | "thana ya aapke rajya police ka citizen portal" |
| Builder form / document upload | "CGRERA …" | "RERA … (aapke rajya ka)" |
| Land records note | Chhattisgarh ka portal | Bhulekh / Apna Khata / Bhoomi / Mahabhulekh / Jamabandi / Bhuiyan — rajya ke naam ke saath (link nahi, taaki galat link na jaye) |
| Examples/placeholders | "Shankar Nagar Raipur" | chosen city ke ilaake (LocationFields), baaki neutral |

## Bot ab ilaaka kaise padhta hai
1. City ke **list** ke ilaake (Pune: Baner, Hinjewadi… ~40 shehar ki list hai) — whole-word.
2. Nahi mila to **sentence se**: "…**in Mundhwa** under 80 lakh", "**Katora Talab ke paas** 3bhk", "**वाकड़ में** 2bhk". Type/paisa/filler shabd (flat, kiraya, budget, chahiye, under…) kabhi ilaaka nahi maane jaate; "in Pune" (shehar ka naam) ilaaka nahi hai.
3. Galat pakda bhi to customer ko ✅/✏️ card mein dikhta hai aur wo sudhaar sakta hai; number tab tak nahi khulta.

## Technical
- `src/shared/sahayak.ts`: `findArea(text, city='')`, `readNeedChange(text, city='')` — **default 'Raipur' hata diya**; `areaFromPhrase()` naya.
- `server/shopPartners.ts`: `cityOfLead(l)` (shop → broker → ''), `homesOf(b, p)` city-filtered; `BotDeps.cityOf`.
- `src/shared/geo.ts`: `CITY_CENTRES` 35→~100, `STATE_CENTRES` naya, `approxPoint(city, loc, lat?, lng?, state?)`; `server/daily.ts` state pass karta hai.
- Tests: `tests/v98-universal-city.test.ts` (11) — pure rules + Pune ki shop end-to-end (client card aur need dono mein city = Pune, Raipur nahi).

## Imaandari wali baatein / baaki
- **Bhasha abhi sirf Hindi + English.** Marathi, Gujarati, Tamil, Telugu, Bengali… nahi. Ye agla bada kaam hai — batayein kaun si bhasha pehle.
- Ilaake ki suggestion-list ~40 shehar ki hai; baaki shehar mein free text chalta hai (suggestion nahi). "Paas ka ilaaka" (zone) aur spelling-alias (shanker/shankar) abhi sirf Raipur ke liye hain.
- RERA number sirf shape se check hota hai (kisi rajya ka live verification nahi); admin verify karta hai.
- GENZ company ka pata (privacy page, `COMPANY_ADDRESS` env) Raipur hi hai — wo company ka asli pata hai.
- Demo/seed: Raipur ke ghar, brokers aur "Raipur ke verified ghar" wali demo headline demo mein waise hi.
- Asli phone par test nahi hua; map ke ~65 naye shehar ke coordinates yaadasht se (±1–2 km; pin waise bhi dhundhla hota hai).
