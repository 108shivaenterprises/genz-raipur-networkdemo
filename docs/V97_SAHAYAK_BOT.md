# V97 — GENZ सहायक (auto-reply bot in the shop-QR chat)

## Kya hai
Customer ki private QR-chat (`/q/chat/<link>`) mein ek rules-based helper. **Koi paid AI / API nahi** — Hindi, Hinglish, English ke patterns padhta hai. Wo kuch invent nahi karta: ghar, kimat, availability sab app ke data se aata hai.

## Kya karta hai (customer ke liye)
1. **Scan karte hi**: "नमस्ते, मैं GENZ सहायक हूँ…" + ज़रूरत ka ✅ / ✏️ card (pehle broker ko `ask-need` dabana padta tha).
2. **✅ dabate hi**: sirf **live** (na sold, na rented, na held/expired) matching 3 ghar chat mein; broker ko number dikhne lagta hai (consent wahi jo QR form mein hai). 48 ghante wali F3 guard waise hi chalti hai (scan ke baad ki nayi listing match nahi hoti).
3. **Free text samajhta hai**: hello, visit, photo/video, rate, "available hai?", "aur ghar dikhao", "broker se baat", thanks, aur **ज़रूरत badalna** ("2bhk 15000 kiraya", "50 lakh") — budget / BHK / type / ilaka / kharidna-kiraya padhkar dobara ✅ poochta hai.
4. **Availability**: har bheje ghar ka haal ("उपलब्ध / बिक चुका / किराये पर जा चुका / अब लिस्ट में नहीं") aur jo gaya uski jagah naya ghar.
5. **Rate / photo / "call karo"**: bot **bargain nahi karta**. Listed kimat batata hai aur broker ko bulata hai (6 ghante tak bot chup).
6. **Visit**: kaun sa ghar → "no direct deal" vachan (QR form mein sign ho chuka hota hai; na ho to chat mein tick + naam) → samay (chips ya "kal shaam 5 baje") → **broker ko push + Partners mein card: ✔ हो सकता है / 🕐 दूसरा समय / ✖ नहीं**. Dusra samay → customer ko ✔ / 🕐 chips. Ek ghar ki ek hi khuli request.
7. **Client room**: "🏠 मेरा क्लाइंट रूम" dabane par broker ke naam se room banta hai (abhi tak dikhaye ghar usme), link customer ke chat mein. Room mein wahi mobile + code (SMS; demo mein broker bataata hai).
8. **Explore** (`/q/chat/<link>/explore`): ज़रूरत pakki hone ke baad uski ज़रूरत ke saare live ghar, 👍 / 📅 ke saath.

## Broker ke liye
- Partners → upar **🤖 सहायक chalu/band** (sabhi chats). Har chat mein **"मैं खुद बात करूँगा"**.
- Broker jaise hi likhta hai ya ghar share karta hai, bot **30 minute chup**.
- Lead card par "🙋 आपकी ज़रूरत: rate / photos / no-match / …" badge; visit requests ka panel.
- Bot ka jawab "broker ka jawab" nahi maana jata: "pehle reply se lead jeeto" wala to-do tab bhi aata hai.

## Technical
- `src/shared/sahayak.ts` (padhne ke niyam), `server/sahayak.ts` (engine), hooks `server/shopPartners.ts`, `server/clientroom.ts` `openRoomAuto()`, `server/db.ts` (`LeadMsg.by='BOT'`, `chips`, `LeadBot`, `LeadVisitReq`, `UserProfile.sahayakOff`).
- Routes: customer `POST /q/chat/:t/quick|promise|like`, `GET /q/chat/:t/explore`; broker `POST /api/shop-partners/leads/:id/visit/:vid`, `…/leads/:id/bot`, `GET|POST /api/shop-partners/sahayak`.
- Env `SAHAYAK=off` poore server par bot band. **Default ON.**
- Tests: `tests/v97-sahayak-rules.test.ts` (40), `tests/v97-sahayak.test.ts` (22, real HTTP). Purani 7 test files jo hath-se wala flow jaanchti hain (v47, v81, v85, v86, v87, v89, v93-audit-fixes) ab `SAHAYAK: 'off'` ke saath chalti hain.
- Test se mila asli bug: Devanagari "नमस्ते" par `\b` kaam nahi karta tha — fix kiya.

## Imaandari wali baatein / baaki
- Ye rules hain, samajh nahi: lamba ya ulta-seedha sawal "broker ko bhej diya" mein jaata hai (20 minute mein ek baar).
- Locality sirf city ke jaane-pehchaane ilaakon se padhta hai (Hindi spelling ke ilaake nahi).
- "Mandate" ko maine buyer ka **"no direct deal" vachan** maana (owner ka listing mandate pehle se alag chalta hai). Agar aapka matlab kuch aur tha to batayein.
- Client room **sirf customer ke tap par** banta hai (consent); client-room ke andar ke messages par bot abhi nahi bolta (agla step).
- Shopkeeper ko alag bot-message nahi; uske paas lead-progress alerts pehle se hain.
- Chat mein pehle se signed vachan na ho (purane leads) wala PROMISE card sirf code padhkar parkha, test mein nahi (form buyer ka vachan hamesha leta hai).
- Asli phone par (push/alert/camera) test nahi hua; screenshots 390px par.
