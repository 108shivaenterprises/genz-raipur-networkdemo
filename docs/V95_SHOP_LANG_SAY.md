# v95 — Dukaandaar page: language switch + "ग्राहक से कहें" + QR dikhao; Vastu CRM se seekh

## Vastu CRM (vastucrm.com) — kya hai
Builder + broker/channel-partner ka CRM (₹3,500–12,000/maah, Abeyaantrix Technology). Leads (portal/FB/WhatsApp/call se), inventory (tower/unit status), cost sheet PDF, collections (demand letter, reminder), WhatsApp drips (10 step), AI template, site-visit, reports/leaderboard, call-logging app. **QR / shop-partner / geotag proof / chat-masking jaisa kuch nahi** — hamara shop-QR model unse alag hai.
Seekhne layak (abhi bana nahi, sirf suggestion):
1. Lead par automatic follow-up drip (reminder chain: 1 din, 3 din, 7 din) — hamare bell todo ke upar.
2. Cost-sheet PDF (price + charges + payment plan) ek tap mein — builder/broker dono ke kaam.
3. Source-wise lead report (QR / WhatsApp / public page / referral).
4. Call-logging + "Today" screen (kis lead ko aaj call).
5. Collections reminders (hamara हिसाब ke saath jud sakta hai).

## Bana (v95)
- **Language switch** (हिन्दी · English · दोनों) dukaandaar page ke upar; default हिन्दी; cookie mein yaad (`?lang=`). Sirf "हिन्दी / English" jode wale text par; naam/raqam/shart (termsText) jaise sirf-Hindi hisse English mode mein Hindi hi rahte hain.
- **"ग्राहक से कहें" card** (page ke upar, QR chalu ho tab): ek line jo dukaandaar bole — "भैया, घर, दुकान या प्लॉट लेना/बेचना हो तो ye QR scan karke apni zarurat bhar dijiye…"; do button: **📲 QR ग्राहक को दिखाएँ** (poora-screen QR + 1 line, `/sp/<token>/show`) aur **💬 WhatsApp par bhejein** (link + line).
- Customer form pehle se: 4 bade button (kharidna / kiraye par chahiye / bechna / kiraye par dena), property type grouped, budget, area, naam, mobile.

## Test
`tests/v95-shop-lang-say.test.ts` (5). Pitch PDF / USER_MANUAL untouched.
