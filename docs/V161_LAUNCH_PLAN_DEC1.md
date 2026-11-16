# V161 — Launch plan: 1 Dec tak (16 Nov ko likha)

## Sach: code ki halat
- 172 test file, ~2,220 test pass. Broker chain (visit → offer → token → deal room → commission → bill → settle), rent, plot, builder booking, QR chaaron flow, HR/team, fees — sab ke end-to-end API journey test maujood hain (v102, v113, v114, v126, v76, v72 …).
- Terms/Privacy aaj ke niyamon ke hisaab se hain (Non-RERA, GENZ title certify nahi karta, photo live, 180 din default likha).
- Sab flow ka **khud phone par aankh se check** abhi baaki hai — ye tumhare final check ka hissa hai (neeche sheet).

## Launch ke blocker (sirf tum kar sakte ho — final check ke baad, par Dec 1 se pehle)
1. Naya production Supabase project (demo data ke bina) + `DEMO_MODE=false`, `AUTH_SECRET`, asli Superadmin + 2FA.
2. Fast2SMS: naya key (purana chat mein aaya tha → badlo), DLT + OTP template; teeno OTP flow asli phone par.
3. Production Vercel env mein keys (demo par kabhi nahi).
4. Control Center mein suraksha ke din (protection) apna niyam: 180.
5. Apna domain (nahi to `*.vercel.app` par chalega).
6. Supabase ka daily backup/PITR on karna (JSON backup sirf file-mode ke liye hai).

## Din-ba-din (mera kaam)
- 17–19 Nov: har flow ka phone-size visual pass (broker, owner, client, builder, team, admin) — jo toota wahi fix.
- 20–23 Nov: load/concurrency check (kai broker ek saath), error-alert dhyan se, slow screens.
- 24–27 Nov: tumhari manual sheet ke findings fix, poora suite, final build.
- 28–30 Nov: freeze — sirf blocker bug fix. 1 Dec launch.

## Tumhara final check sheet (phone par, har role)
**Broker** — signup (OTP) → PAN/RERA → profile → listing banao (photo, rate) → owner consent link → co-broking offer bhejo → visit book → deal room → token → commission split sign → bill → "paid" confirm → home to-do khaali.
**Owner** — QR/link khole → listing dekhe → visit confirm → offer dekhe/accept → bill khole → UTR likhe.
**Client** — QR scan → bot chat → client room (OTP) → ghar dekhe → visit maange → papers bheje.
**Builder / team / HR** — inventory block → booking request → builder approve → team member attendance/leave → employer approve.
**Admin** — member approve → fees/plan → network watch report → bill/commission ledger → backup.
Har step par: error aaya? number/naam galat chhupa/dikha? button dead? Jo galat ho screenshot bhejo.
