# v86 — Customer chat: "Add to Home" install + phone alerts · audit round 1

## Kya bana
1. **Customer ki private chat (`/q/chat/<link>`) ab ek installable mini-app hai**: pehle message ya need-confirm ke baad "📲 Home par jodein" card aata hai (Android: install button, iPhone: Share → Add to Home Screen ka tareeka). Manifest chat link par hi scope hota hai, to icon dabate hi seedhi usi ki chat khulti hai.
2. **Phone alert (Web Push)**: customer "🔔 Alerts chalu karein" dabaye to broker ka jawab / ghar ka card aate hi lock-screen par alert. Lock-screen par sirf **broker ka naam** — message ka text nahi. Ek lead par max 3 devices.
3. **Number-block aur kasa**: chat mein phone number ab Devanagari (९८७६…) aur Arabic-Indic digits, aur `. , / | _` jaise beech ke chinh se bhi nahi chhupaya ja sakta.

## Audit round 1 (mobile, 11 roles)
Superadmin, admin, 2 brokers, owner, buyer, contractor, builder, legal, connector, team — har account ka home, neeche ke tabs aur "More" ke har item (466 screens) khole.
- **Mila nahi**: horizontal overflow, "undefined/NaN/null" text, 5xx, page error — 0.
- **Chhote akshar**: 11px ke label (Broker Network tag, tab labels) — jaan-boojhkar chhote hain; padhne laayak, par kam-roshni mein mushkil. Baad ke round mein dekhna.
- **Sandbox noise (app ki galti nahi)**: Unsplash demo photos is test machine par load nahi hoti (network band) → "broken-img"; aur crawler ne bahut tez screens kholi to 429 rate-limit aaya (asli user itni tez nahi).

## Limits (imaandari se)
- Push asli phone par yahan test nahi ho sakta (FCM tak network nahi). iPhone par pehle Add to Home Screen zaroori (iOS 16.4+).
- "Sab perfect" saabit nahi kiya ja sakta; yeh sirf ek round hai aur sirf screen-level checks hain, deal ke poore real-life scenarios nahi.
