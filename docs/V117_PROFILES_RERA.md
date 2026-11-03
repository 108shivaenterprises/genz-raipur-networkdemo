# V117 — Har role ki profile + "RERA aa gaya → Tier 1" + naya profile design

## 1. Kis-kis ki profile banti hai?
| Kaun | Profile? | Kaise milta hai |
|---|---|---|
| Broker (Tier 1 / Tier 2) | ✅ | naam / firm / ilaka / GZ code se search |
| Builder | ✅ | same |
| Team member (broker ka staff) | ✅ | same |
| Contractor, Vakeel | ✅ | same |
| Owner, Customer (buyer/tenant) | ✅ (private) | sirf poore mobile number ya GZ code se, sirf broker/builder ko |
| **Dukaan (connector, login wala)** | ✅ **naya** | apni profile + reviews dekh/badal sakta hai; brokers usko review de sakte hain jab uski lead le li ho. **Search nahi** (directory nahi milti — design wahi) |
| Shop-QR partner (bina login) | ❌ | uska login hi nahi — broker ke Partners list me record hai |
| Client room wala client (bina login) | ❌ | broker ke client card / room me hai |
| GENZ staff (Admin/Superadmin) | ❌ (design) | sirf search + reviews moderate |

## 2. "RERA aa gaya" — Tier 2 → Tier 1 (pehle sirf admin kar sakta tha, broker khud nahi)
1. Tier 2 broker → **My profile** → peela "Tier 2 · Local associate" card → RERA number daalo → *Send to GENZ to check*.
2. Galat shape, kisi aur broker ka number, ya pehle se wahi number → mana.
3. Admins ko bell + push: "Ek broker ne RERA joda — jaanchein" → **ID Review** me sabse upar "Brokers who added their RERA".
4. Admin RERA portal par dekhe → **Checked — make Tier 1** (broker ko alert: "builder projects ab khule") ya **Not found** (kaaran zaroori; broker ko dikhta hai, dobara bhej sakta hai).
5. Tier 1 hote hi: builder project par partner, unit block/hold, booking — sab khul jaata hai (server ka `tier1Gate`). Profile par "Tier 1 · RERA …" badge.
6. Purana admin "set tier" raasta bhi pending claim ko band kar deta hai. Admin apna claim khud approve nahi kar sakta.
Demo: **naya.associate@demo.genz.example** / Genz@2026 (Tier 2, bina RERA) — yahi flow try karo.

## 3. Naya profile design (phone par dekha)
- Upar **cover + bada photo/initials**, naam, role · firm · city, badges (ID checked, Tier 1/2, GZ code, kab se).
- **4 numbers ek line me**: Rating · Reviews · Sauda poora · Saal.
- **Profile kitni poori %** + jo baaki hai uske "+ chips" (tap → edit).
- **Kaam kis par** (Resale, Rental, Naye project, Plot, Dukaan/Office, Luxury, NRI, Home loan, Kagaz) — 4 tak chips; ilaake aur bhasha bhi chips.
- Edit ab alag "Edit" sheet me (labels ke saath); privacy wali baat "Who can see this" box me.
- Reviews: **"Mere baare me / Maine likhe"** do tab.
- **Share** button: WhatsApp par "mera GZ code search karke reviews dekho".
- Review form me "kis kaam par saath kiya" ab "bheji hui lead" (connector) bhi dikhata hai.

## 4. Test
`tests/v117-profile-rera.test.ts` (9): Tier 2 band → galat/duplicate RERA mana → claim → admin alert → reject (kaaran zaroori) → dobara → approve → builder projects khule → profile par RERA; purana admin raasta; har role ki profile; connector search mana; specialities (max 4).
Full suite Postgres ke saath.
