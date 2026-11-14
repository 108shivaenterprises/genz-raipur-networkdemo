# V136 — Launch check + live database ki galti theek

## 1. Jo galti mili aur theek hui (live)
- **Galti:** live `/api/health` keh raha tha `storage: "file"` aur `dbError: "permission denied for database postgres"`. Supabase ke logs me pichhle 24 ghante me ye error kai baar aaya (24 ghante se purane logs nahi dikhte).
- **Asar:** live app Supabase me save nahi kar raha tha. Vercel par har naya server apni alag aur kachchi (temporary) file par chalta hai, isliye demo me kiya kaam thodi der baad gayab ho sakta hai, aur alag-alag servers ko alag data dikh sakta hai. V135 ki API Keys bhi isi wajah se live par tike nahi rehte.
- **Wajah:** live app `genz_app` user se judta hai. Ye apne `genz` schema aur tables ka maalik hai aur uske paas padhne-likhne ke saare haq hain. Bas poore database par CREATE ka haq nahi hai. Code shuru me `CREATE SCHEMA IF NOT EXISTS genz` chalata tha, aur Postgres schema pehle se hone par bhi is command ke liye wo haq maangta hai.
- **Fix:** `server/pgstore.ts` me schema sirf tab banta hai jab wo maujood na ho (`to_regnamespace`). Kam-haq wala user ab theek se judta hai. Database ke haq nahi badle.
- **Test:** `tests/v136-pg-least-privilege.test.ts` (2). Live jaisa user bana ke dekha: fix se pehle test fail ("permission denied"), fix ke baad pass. Naye database par schema ab bhi banta hai.

## 2. Launch check (2026-11-14)
Live abhi **public demo** hai: `demoMode: true`, 168 demo account, aur sabka password `/api/auth/config` par khula hai. Koi bhi demo Superadmin ban sakta hai.

### Launch se pehle zaroori (blocker)
1. **Database fix live karna** (ye V136) aur `/api/health` par `storage: "postgres"` dekhna.
2. **Demo band, asli setup:** naya production Supabase project (demo data ke bina), `DEMO_MODE=false`, `PUBLIC_DEMO` hatao, asli Superadmin, mazboot password aur 2FA ke saath. Production me DEMO_MODE ke saath code chalne se mana karta hai (`assertProductionConfig`).
3. **Asli API keys demo par mat daalo.** Demo Superadmin ka password sabke saamne hai: koi bhi "other gateway URL" badal kar saare OTP code apne server par mangwa sakta hai. Keys sirf production app me daalo.
4. **SMS / OTP:** Fast2SMS me DLT + OTP template, key production panel me, aur teeno flow asli phone par chala ke dekhna.
5. **Niyam ek karo:** suraksha ke din: Terms me 60, code ka default 30, aapka niyam 180. Owner consent ka default bhi abhi band hai.
6. **Terms / Privacy ko aaj ke niyamon ke hisaab se karna:**
   - Privacy: "GENZ staff photo jaanchta hai, sirf manzoor photo dikhti hai". Ye V121 (photo seedha live) ke baad sach nahi hai.
   - Terms: "Invite-only / verified brokers" likha hai. Ab Non-RERA broker bhi aa sakte hain (V131).
   - Terms: "GENZ kagaz / title nahi jaanchta, sirf record rakhta hai" (V132 ka faisla) Terms me nahi likha hai.

### Baad me (blocker nahi)
- Apna domain (abhi `*.vercel.app`).
- Khula signup (OTP ke baad), portal lead import, follow-up sequence.
- Key sahi hai ya nahi, ye jaanchne ka button (API Keys tab).
