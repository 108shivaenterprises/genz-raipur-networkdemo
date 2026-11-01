# V103 — Sahayak bot ab listing ke saath chalta hai: naya ghar, sold, hata

## 0. Kya poocha tha
"Nayi listing banne pe ya purani sold hone pe ya hatne mai bot auto update hora?" → jawab tha **nahi**; phir "bana do".

## 1. Pehle kya tha (seedhi baat)
- Bot sirf **customer ke action par** bolta tha (likhna, chip dabana, need ✅). Listing badalne par ya timer par koi hook nahi tha.
- **Nayi listing:** sirf *dusre* broker ko push ("New match for one of your clients"). Customer ki chat mein kuch nahi. Bot ka wada **"नया घर आते ही यहीं दिखा दूँगा" code nibhata hi nahi tha.**
- **Sold / rented / withdrawn / suspend:** chat mein purana ghar waisa hi dikhta tha ("देखें" link ke saath). Bot tabhi sach batata tha jab customer khud "Still available?" dabaye.

## 2. Ab kya hota hai
| Kya hua | Customer ki chat | Broker ko |
|---|---|---|
| **Nayi listing** jo uski confirmed need se milti hai | 🆕 "आपकी ज़रूरत से मेल खाता नया घर आया है" + ghar ka card (max 3), chips (visit / aur ghar / broker) | Bell: "🆕 NAAM: N नया घर भेजा" (number pehli baar khula to "नंबर खुल गया") |
| **Bheja hua ghar sold / rented** | ℹ️ "अपडेट: “…” अब बिक चुका है" (ek se zyada ho to list) + **uski jagah agla best ghar** ya "नया आते ही बता दूँगा" | Bell sirf jab replacement nahi mila ya us ghar ki **visit request khuli** thi |
| **Withdrawn / admin suspend / report-hold / 30 din expire / erase** | Wahi, apne shabdon mein ("लिस्ट से हटा दिया गया", "अभी उपलब्ध नहीं") | Wahi |
| **Undo / restore** (ghar wapas live) | ✅ "अच्छी खबर: “…” फिर से उपलब्ध है" | — |
| **Ghar ka card** (chat page + broker ki lead chat) | Gone ghar par `❌ बिक चुका है` / `⚠️ अभी उपलब्ध नहीं` ka nishaan, "देखें" link hat jaata hai — bot bole ya na bole | `gone` field + red badge |
| Customer ka phone | `brokerWrote` push: "GENZ सहायक ने नई प्रॉपर्टी भेजी / संदेश" (naam/ghar lock-screen par nahi) | — |

Do baatein jo pehle galat thi aur ab sahi:
1. Jo customer ko "no match, naya aate hi dikhaunga" bola gaya tha, use ab **sach mein** dikhaya jaata hai (`needsBroker='no-match'` bhi saaf ho jaata hai).
2. **48 ghante ka rule (audit F3) waisa hi**: ek ghar jo customer ke scan ke **baad** bana, wo uska number tab tak nahi khol sakta (taaki number kholne ke liye nakli ghar na daale jaayein). Bas ab ye rule sirf **number khulne se pehle** lagta hai — number khul chuka ho to naya ghar turant dikh sakta hai.

## 3. Niyam (spam nahi)
- Sirf **confirmed need** wale buyer / renter chats. Owner-side chat, WON / LOST lead, bot **off** (is chat ka ya broker ka), broker ke likhne ke baad 30 min / "broker se baat" ke baad 6 ghante — sab mein bot chup.
- **Naya ghar push:** 4 ghante mein ek, 30 din mein max 10, ek baar mein max 3, ghante mein max 12 bot-lines; visit flow beech mein ho (`awaiting`) to nahi. Jo ghar baaki reh jaaye wo agle push mein.
- **"Naya" kise kehte hain:** jo ghar bot ne confirm ke waqt / "aur ghar" ke waqt already dekha tha wo naya nahi (`bot.seen`). Naya matlab ab-matching-aur-pehle-nahi-dekha — approve, relist, ya 48 ghante poore hone par bhi.
- **Gone / wapas ki line kabhi dabti nahi** (sach hai) aur do baar nahi aati (`bot.gone[homeId]`).
- 30 din customer ne na likha (aur confirm bhi purana) → follow band.
- **Purani chats (v103 se pehle ki):** pehli baar sirf "note" hoti hain — jo ghar pehle se sold the unki purani khabar nahi bheji jaati.

## 4. Kaise chalta hai (kahan code)
- `server/sahayak.ts` → `follow(l)`: level-triggered (facts dekh ke likhta hai, bar-bar bulane se kuch nahi bigadta).
- `server/shopPartners.ts` → `followHomes()` (live-ghar ka set pehle/baad ka diff), `sweepSahayak()` (hourly + boot), chat page khulte hi `follow(l)`, card ka status (`homeGone`), broker lead view mein `gone`.
- `server.ts` → ek middleware: koi bhi **non-GET** request (listing banana/approve/sold/withdraw/undo/moderate/broker unverify...) ke baad diff chalta hai. Kisi route ko yaad nahi rakhna padta. Hourly sweep + chat khulna safety net hai (Vercel par timer nahi — wahan chat khulna kaam aata hai).
- `src/shared/sahayak.ts` → `goneKind`, `GONE_WORDS` (EN+HI), `BOT_WATCH {days:30, gapHours:4, maxPushes:10}`. `server/db.ts` → `LeadBot.followedAt/seen/gone/watch`.

## 5. Tests
`tests/v103-bot-watch.test.ts` — 11:
nayi listing → A (number khula) ko turant; B (number khulta) ko nahi (F3); C (bina confirm) ko nahi · doosri listing 4 ghante ke gap mein push nahi, dobara chat kholne par kuch double nahi · wait ke baad B ko ghar + number khula + bell · SOLD: ek line + replacement + card badge + dobara nahi · UNDO: "फिर से उपलब्ध" · WITHDRAWN / admin SUSPEND / RESTORE · broker bot OFF → chup · C kabhi nahi likha gaya · pure parts (goneKind / words EN mein Hindi nahi / limits).
Isme ek **asli bug** mila aur theek hua: ghante-wali limit ghar ke cards ko bhi gin rahi thi, to pehle ghante mein "sold" ki sach khabar bhi dab jaati — ab limit sirf naye-ghar push par hai.

**Result: poori suite 133 file / 1920 test pass** (3 file skipped, 4 test skipped — pehle jaise), `tsc` saaf, `vite build` saaf. (V102 par 132 file / 1909 test the; ab +1 file, +11 test.)

## 6. Limits (jo mujhse nahi hua)
- Asli phone par push (`brokerWrote`) nahi dekha (DRY_RUN) — lock-screen words padhe, delivery nahi.
- Customer chat page server-rendered hai — HTTP se check hui, asli browser mein screenshot nahi li.
- Ek naya ghar 50 customers se match kare to **broker ko 50 bell** (har customer ki apni) — sahi hai par shor ho sakta hai; chaho to ek bell mein jod dein.
- "Broker ne ghar pages par kholne / band karne ka switch" (live status nahi badla) abhi sirf hourly sweep / chat khulne par pakda jaata hai.
- Khuli visit request ka ghar sold ho jaye to request cancel nahi hoti — sirf broker ko bell ("khuli thi"), wo khud nipta de.
- Price badalna (price-update) bot ko nahi batata — pucha nahi tha.
- Pitch PDF aur USER_MANUAL waise hi (tumhare kehne tak).
