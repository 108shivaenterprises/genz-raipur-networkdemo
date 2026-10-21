# Launch readiness — 17 Oct 2026 (v25 ke baad)

## Faisla
Features me koi kami nahi hai, balki zaroorat se zyada hain (25 versions, 689 tests). Par launch ke liye abhi ready nahi. Jo kami hai wo feature ki nahi, ye 5 cheezein hain:
1. Broker tak alert nahi pahunchta. Koi push ya SMS nahi hai. Site-visit OTP aur forgot password haath se hote hain.
2. App bhaari hai. Broker ko lagbhag 20 menu dikhte hain.
3. Superadmin par 2FA nahi hai, jabki ab poora Aadhaar vault me hai.
4. Legal checks baaki hain: Aadhaar vault, GENZ ka apna RERA agent registration aur GST, Terms/Privacy ka review.
5. Abhi tak koi asli broker pilot nahi hua.

## Launch se pehle (blockers)
- Superadmin aur admin ke liye TOTP 2FA (free, khud code ho sakta hai).
- Web Push alerts (free; `web-push` npm package lagega) aur WhatsApp click-to-send buttons. SMS DLT provider baad me (paid).
- Simple broker home: neeche 5 button (Aaj, Property, Buyer Needs/Match, Deals, Aur) aur pehli baar khulne par 3 step ka setup.
- Advocate/CA: Aadhaar vault, GENZ ka CG RERA agent registration (master-CP commission ki wajah se), GST, Terms/Privacy.
- Live setup: VPS, domain, HTTPS, Postgres, backup ke saath restore test, KYC_VAULT_KEY aur uska backup, DEMO_MODE=false.
- 20–30 Raipur brokers ke saath 3 hafte ka band pilot. Do cheezein naapo: pehli listing kitnon ne daali, aur 7 din baad kitne wapas aaye.

## Growth features (asar ke hisaab se)
1. WhatsApp forward paste karo, draft listings ban jaayein (bulk). Pehle hi din inventory milti hai.
2. Har public page, brochure, poster aur visiting card par "Powered by GENZ — broker ho? free join" footer, referral code ke saath.
3. Requirement broadcast: matching brokers ko turant push, aur 1-tap "mere paas hai".
4. Launch ke din GENZ ke apne builder projects (master-CP) live hon.
5. Reputation jo saath chale: verified badge, deals closed ka count, aur peer "deal sahi hui" confirm visiting card par.
6. Area-wise City Captain, leaderboard aur monthly meetup (sirf points).
7. Play Store listing (PWA ko TWA me wrap karke; Google Play account one-time fee).
8. Public "GENZ Raipur Property Report" (anonymised closed deals se), jab data kaafi ho jaaye.
9. Subah 9 baje daily digest ka push.

## Abhi nahi
Aur naye features, 3D tour, paid gates, India-scale data layer. Abhi ek server kuch shehron ke liye kaafi hai.

## Kram
- Hafta 1–2: 2FA, push, simple home, viral footer, WhatsApp paste.
- Hafta 2: deploy aur legal.
- Hafta 3–5: pilot.
- Uske baad Raipur open, phir City Launch board se agla shehar.

## Update — v26 (17 Oct 2026, raat)
Code me bana: 2FA, push alerts, simple broker home + neeche 5 button, Powered-by-GENZ footer, WhatsApp paste + owner consent + duplicate rokna, superadmin ki protection limit, requirement broadcast, reputation, city report, pilot check. Chapter meet ka alert bhi bana. Play Store nahi kiya.
Ab bhi baaki (code se bahar):
- advocate/CA checks
- VPS + domain + HTTPS + `PUBLIC_URL` / `VAPID_*` / `KYC_VAULT_KEY` set karna
- backup ke saath restore test
- 20–30 broker ka pilot
- launch par "owner consent zaroori" switch ON karna
