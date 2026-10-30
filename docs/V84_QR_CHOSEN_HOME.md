# v84 — Shop QR: chuna hua ghar form par hi dikhe · QR par ghar na dikhe to broker ko wajah

## Shikayat
Dukaan ke QR se customer "👍 मुझे पसंद है" dabata tha, to page form tak scroll hota tha aur **ghar sirf ek text line reh jaata tha** (photo, daam, jagah sab upar rah jaata). Form bharte waqt wapas upar scroll karke ghar dekhna padta tha. Aur agar broker ka public page band ho (ya wo verified na ho) to QR par **koi ghar dikhta hi nahi tha** — broker ko pata bhi nahi chalta tha.

## Kya badla
1. **Chuna hua ghar form ke andar ek card mein**: watermark wali photo, daam, title, jagah, "आपने यह घर चुना है" aur **"↩ दूसरा घर देखें"** (list par wapas, `#homes`). Ghar ki id form ke hidden field mein jaati hai (lead par `homeId` pehle jaisa).
2. **Broker ko batata hai** (Partners tab): agar uske QR par 0 ghar dikh rahe hain to peela note — *verification baaki* / *public page band* / *koi listing public page ke liye chalu nahi* — teeno ke alag Hindi + English shabd. API `GET /api/shop-partners` mein `homes: { shown, verified, pageOn }`.

## Jo NAHI badla (bypass se bachav waise ka waisa)
- Ghar tabhi ginta hai jab wo **sach mein us broker ke public page par** ho; kisi aur ki `?home=` id se kuch nahi hota (na card, na hidden field).
- Customer ka poora number dukaan ko nahi dikhta; "no direct deal" ka tick + hastakshar, 2.5 sec timer, honeypot, rate-limit, pehle wale broker ka lock (same mobile dobara scan kare to pehli dukaan ka hi rehta hai) — sab pehle jaisa.
- Hissa, notification, SMS poochna, paisa dene ke niyam (v82) — koi badlav nahi.

## Test
`tests/v84-qr-chosen-home.test.ts` (4): ghar list mein hai, form mein chuna hua card + "See other homes" link + hidden field, galat `?home=` kuch nahi chunta, broker ko homes ka hisaab. (Test ka setup pehle dukaan ko "accept" nahi karwata tha, isliye QR "abhi chalu nahi" dikhata tha — theek kiya.)

## Imaandari wali baat
- Demo data mein photo nahi hoti, isliye screenshot mein "Photo coming soon" dikhta hai; asli listing par watermark wali photo aati hai (list wale card jaisi, usi script se).
- "Lead bypass" ke liye koi naya chhed nahi mila; upar likhe bachav kaam kar rahe hain. Agar aapne koi khaas raasta dekha ho (jaise dukaan wala customer se seedha baat kare) to bataiye, uska alag se test likhunga.
