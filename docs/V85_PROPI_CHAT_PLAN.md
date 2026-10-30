# v85 — Propi se seekh + chat-first UI: pehla hissa BANA (shop-QR lead ki chat, number chhupa), baaki yojana

Propi ka homepage dekha (propi.in); andar ke pages / pricing nahi dekhe.

## Jo is baar bana aur live gaya (v85, pehla hissa)
Aapka niyam: *"Shopkeeper se lead aaye to broker ko number nahi dikhe, sirf last ke kuch digit; requirement chat mein confirm ho; phir broker ke paas match aaye to share karne par number dikhe."*
1. **Number chhupa.** QR form bharte hi customer ko ek **private chat page** milta hai (`/q/chat/<link>`, signup nahi). Broker ko sirf **••last4** dikhta hai — API ke kisi bhi hisse mein (lead, history, links) poora number nahi jaata; client card bhi tab tak nahi banta.
2. **Chat mein kisi ko number likhne ki ijazat nahi** (customer ya broker) — dono taraf rok.
3. **Requirement chat mein confirm:** broker "ज़रूरत पक्की करवाएँ" dabata hai → customer ko ek line mein uski ज़रूरत dikhti hai → **✅ हाँ, सही है** ya **✏️ बदलाव भेजें** (badlav par broker dobara poochta hai).
4. **Match + share:** confirm ke baad broker ko sirf wahi ghar dikhte hain jo ज़रूरत se milte hain (bikri/kiraya, इलाका ya wahi ghar jo customer ne pasand kiya, budget agar padha ja sake — "40 lakh", "1.2 cr", "12k" samajhta hai; na padha jaye to budget ginta nahi). Ek ghar **share** karte hi: customer ki chat mein ghar ka card, broker ko **number khulta hai**, aur buyer/renter broker ke client list mein judta hai. Koi match nahi → number band rehta hai aur broker ko saaf likha dikhta hai.
5. **Owner (SELL / RENT_OUT) lead:** "match wala ghar" nahi hota; owner jab chat mein property ki jaankari ✅ kare, tab number khulta hai.
6. **Purani leads (v85 se pehle) ka number waise hi dikhta rahta hai** — jo pehle se chal raha tha wo band nahi kiya.
7. Audit: `SHOP_LEAD_NEED_CONFIRMED`, `SHOP_LEAD_NUMBER_SHOWN`, `SHOP_LEAD_HOME_SHARED`. Customer ki sahmati ka text badla: ab "ऐप की चैट में बात", aur "नंबर तभी दिखेगा जब ज़रूरत पक्की + मेल खाता घर शेयर".

**Imaandari wali limits:**
- Customer ko broker ka jawab tab dikhta hai jab wo apna chat link dobara kholta hai (yahi link bookmark karne ko kaha hai). Sidha SMS/WhatsApp alert **API ke bina nahi** — aapne kaha tha baad mein; abhi nahi.
- Match ka niyam sidha hai (bikri/kiraya + इलाका + budget). Hindi mein likha इलाका aur English mein likha ghar ka इलाका aksar nahi milte — tab broker ko match nahi dikhega; isse behtar matching baad ka kaam.
- Customer ek hi mobile se dobara scan kare to naya chat link nahi banta; purana link hi chalta hai.
- Chat ka pehla version — voice, photo, typing-indicator nahi.

## Baaki (abhi code nahi — ye yojana hai)

## 1) Propi se jo seekhna final hua
| # | Seekh | Hamare app mein kya | Mehnat |
|---|---|---|---|
| 1 | WhatsApp se listing/requirement forward karo → app padh ke daale + match bataye | Paste-parser pehle se hai (v26/v28); bas WhatsApp se aane ka raasta chahiye | Bada (WhatsApp receive) |
| 2 | Login WhatsApp code se | Abhi OTP SMS/demo; WhatsApp message verify se badla ja sakta hai (neeche) | Madhyam |
| 3 | Live feed ("river") | Naya Feed tab: network ki nayi listings + requirements | Madhyam |
| 4 | Requirements board + turant match alert | Buyer Needs + Magic Match (v54) hain; feed aur "is listing ke liye 3 brokers ke paas buyer" alert jodna | Chhota-madhyam |
| 5 | Broker level sarkari record se (RERA) | KYC + leaderboard (v74); CG RERA number se P1–P4 jaisa badge | Madhyam |
| 6 | Builder ke liye active brokers ka area-wise view | Project Control (v12) ke saath; naya kamai ka raasta | Bada |
| 7 | 5–6 tab ka chhota navigation | Chat-first Home (neeche) | Madhyam |
**Hamari taakat:** Propi deal milne tak; hamare paas deal ke baad ka kaam (deal room, final rate, हिसाब, papers, anti-bypass). Network invite-only hai.

## 2) Chat-first UI: kya saare feature kaam karenge?
Haan — chat sirf **samne ka darwaza** hai. Peeche ke API, permissions aur audit wahi rahenge. Par har feature chat mein "poora" nahi aa sakta, isliye teen darje:

- **A. Chat ke card se hi poora hoga:** listing draft confirm, visit lagana, final rate likhna, payment "mila/nahi mila", task accept/complete, bell ke to-do, partner / client chat, QR scan ke naye leads.
- **B. Chat mein card + "poora kholo ›" (bada screen):** हिसाब, papers/vault, agreement, due diligence, KYC, deal-close, hissa-baant, shop QR dashboard, leaderboard.
- **C. Alag screen hi rahenge (chat se link):** admin/superadmin, HR (attendance/leave/pay), builder Project Control, reports, settings.

Niyam: paisa / rate / permission wale kaam hamesha **confirm card** se; server par wahi permission jo abhi hai; chat se hua kaam bhi deal ke record aur audit mein pehle jaisa likhe.
Pehle step (bina AI): Chat-first Home + deal chat mein quick-action bar. Dusra: Assistant fixed commands. Teesra: voice + Hinglish + WhatsApp.

## 3) "Bina API kharch ke" verification — kya ho sakta hai, kya nahi
**Browser / PWA se:**
- Location: ho sakta hai (browser GPS, user ki ijazat se) — site check-in mein pehle se hai.
- SIM / phone number / IMEI: **nahi padh sakta.** Web page ko ye milta hi nahi.
- Device: sirf browser/phone ka model type jaisa kamzor signal; pakka saboot nahi.
**Android app (APK) se:** SIM jankari tabhi jab "phone" permission mile, aur kai phones par number khaali aata hai; Play Store par is permission par rok. iPhone par bilkul nahi. Isliye bharose layak raasta nahi.
**Jo asli mein kaam karta hai (number ka saboot):** user **khud WhatsApp se ek code bheje** — link `wa.me/<hamara number>?text=GENZ-<code>` tap karte hi message taiyaar. Hamare paas wo message us number se aaya = number uske haath mein hai. Isme SIM padhne ki zaroorat nahi.
- **Officially (Meta WhatsApp Business Cloud API):** user ka pehle message receive karna aur 24 ghante ke andar jawab dena aam taur par mufat hai; setup + Meta approval chahiye. Rate/pricing badalti rehti hai — Meta ke pricing page par dekh lena.
- **GitHub ki unofficial libraries (jaise WhatsApp Web chalane wali):** mufat hain, par WhatsApp ke niyam ke khilaf; **business number ban ho sakta hai.** Asli broker network par nahi lagana.
- Aapne "GitHub se auth ki repo" likha — kaun si repo thi, link bhej dein to dekh lunga.

**Privacy:** location / device ka koi bhi data sirf ijazat se aur sirf verification ke liye. India ke DPDP Act ke hisaab se "kyun le rahe ho" saaf likhna hoga (ye kanooni salah nahi, vakeel se pooch lein).
