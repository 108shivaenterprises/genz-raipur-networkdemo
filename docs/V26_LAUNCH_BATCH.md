# v26 — Launch batch (Play Store ko chhod kar sab)

Krishna ne launch-readiness list ke saare suggestions maange, sirf #7 (Play Store) nahi. Do shartein thi:
- WhatsApp paste se listing banane me **customer (property owner) ka consent pehle** chahiye. Wahi broker–owner ka bypass bond banata hai, aur isi se duplicate listing rukti hai.
- **Bypass protection ke din** broker 30/60/90/180 ya apne din chun sake. Iski **maximum limit sirf superadmin** tay kare (legal bond limit).

Do sawaal poochhe gaye the, unke jawab:
- Consent kaise liya jaaye: **dono tareeke** — WhatsApp link, aur paper form ki photo.
- Doosra broker wahi property daale to kya ho: **B ruk jaaye, A ke saath co-broke kare**.

## 1. Bypass protection — superadmin ki legal limit
- Control Center → "Bypass protection — legal limit" me superadmin maximum din (7–730) aur default din set karta hai. ADMIN aur broker ye nahi badal sakte (403).
- Broker har owner-consent aur mandate par 30 / 60 / 90 / 180 din chunta hai, ya "Apne din" me koi bhi number likhta hai. Ye maximum se upar kabhi nahi jaata; server rokta hai aur message hi+en me deta hai.
- Maximum ghatane par purane bond ke din wahi rehte hain. Sirf naye bond nayi limit se bante hain.
- Deal room me "30-day" likha hua tha. Ab wahan us deal ke asli din dikhte hain.
- Code: `src/shared/protectionRules.ts`, `server/protection.ts`, `src/components/ProtectionDays.tsx`.

## 2. WhatsApp se listing → owner consent → publish
Flow:
1. Property tab → **"WhatsApp se daalein"** (broker home par bhi ye button hai). Broker ek ya kai messages paste karta hai, ya poora chat export.
2. Parser (`src/shared/waParse.ts`) message padh kar draft banata hai: type, sale/rent, city, locality, area, price aur BHK. Area ke units sqft / gaj / acre / dismil / 25×60 samajh aate hain. Price me lakh / crore / k / ₹ / rate×area chalta hai. Hindi words bhi samajh aate hain. Message me jo phone number hai use price nahi samjha jaata.
3. **Draft sirf broker ko dikhta hai.** Owner ka naam, mobile aur pura pata zaroori hai. Message me mila number aksar forward karne wale broker ka hota hai, isliye screen par ye chetavani dikhti hai.
4. Consent lene ke do tareeke:
   - **WhatsApp link:** wa.me message owner ke number par jaata hai, jisme `/oc/<token>` ka link hota hai. Ye link 7 din chalta hai.
     - Owner apne phone par property, price, broker (RERA ke saath) aur protection ke din padhta hai. Phir apna naam likhta hai, tick karta hai aur "Haan" dabata hai.
     - Agar link kisi logged-in GENZ broker/staff ke browser me khule, to wahan se consent **nahi** hota.
     - Agar owner ki "haan" usi phone + browser se aaye jisse broker ne link banaya tha, to consent ho jaata hai par **flag** lagta hai (GENZ owner ko call karke pakka kare).
     - Jab SMS service judegi (`SMS_WEBHOOK_URL`), tab owner ko SMS code bhi daalna hoga.
   - **Paper form:** "Paper form print karein" se form khulta hai (hi+en words, owner aur broker ke sign). Signed form ki photo/PDF upload hoti hai (max 4 MB; file ka asli type check hota hai). GENZ admin "Owner consents to check" queue me ise dekh kar accept ya reject karta hai.
5. Owner ki "haan" ke saath **bond** shuru hota hai, chune gaye din tak. Broker "Listing live karein" dabata hai. Listing par `protectionUntil` lagta hai. Ek consent ek hi baar use hota hai.
6. Owner baad me link par "Maine sahmati nahi di" report kar sakta hai. GENZ queue me aata hai, aur admin consent cancel kar sakta hai. Cancel hote hi bond turant khatam ho jaata hai.

**Duplicate rokna:**
- Same property = owner ka mobile + city + locality + type, aur area 10% ke andar.
- Bond chalte hue doosra broker **kisi bhi raaste** se wahi property nahi daal sakta, chahe normal form se ho ya paste se. Use `CONSENT_TAKEN` milta hai, saath me protection ki date aur (agar listing live hai) co-broke ke liye listing ka link. Pehle broker ka naam nahi dikhaya jaata.
- Superadmin switch: **"Har nayi broker listing ke liye owner consent zaroori"**. Ye default OFF hai (purana flow todna nahi tha). Launch par ON karna behtar hai.
- Owner ka phone consent record me sirf HMAC hash + aakhri 4 ank ke roop me rehta hai. Owner ke page par owner ka number nahi chhapta.

## 3. Phone alerts (Web Push) — bina kisi naye package ke
- VAPID (RFC 8292) aur encryption (RFC 8291) Node crypto se khud likhe gaye. RFC 8291 ka official example byte-by-byte match karta hai (test me hai).
- Keys `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` se aati hain. Ye na hon to `data/.vapid.json` banti hai.
- Sirf asli push services (Google / Mozilla / Apple / Microsoft) ke https address accept hote hain. Koi doosra server call nahi hota (SSRF band).
- Alert kab jaata hai:
  - client ke liye nayi matching listing aaye
  - offer aaye, accept / counter / reject ho
  - owner haan ya na kahe, paper form check ho
  - broker ki buyer need aaye, ya kisi ne jawab diya
  - chapter meet tay ho
  - subah 9 baje (IST) ka summary
- Alert me kabhi client ka naam ya number nahi hota.
- Raat 10 se subah 7 tak shaant rehta hai (owner consent ko chhod kar). Har member ko din me max 40 alert.
- Member "My data" me ya broker home par chuntा hai ki kaun se alert chahiye.
- iPhone par pehle "Add to Home Screen" karna padta hai.

## 4. Buyer need → network ("mere paas hai")
- Buyer Needs me apni requirement par **"Network se poochhein — kiske paas hai?"**. Ye need un brokers ko jaati hai jinki listing match karti hai, aur shehar ke baaki verified brokers ko bhi (max 80).
- Ek broker din me 5 baar bhej sakta hai. Same need 24 ghante me dobara nahi jaati.
- Paane wale broker ko apni matching listings dikhti hain, aur **1-tap "Mere paas hai"**. Agar property GENZ par nahi hai to ek line likh kar jawab de sakta hai.
- Bhejne wale ko jawab dene wale broker ka naam aur listing dikhti hai. Aage ki baat normal offer flow se hoti hai.
- Client ka naam aur phone kabhi network me nahi jaata.

## 5. Two-step sign-in (2FA) — superadmin/admin
- Google / Microsoft Authenticator ka 6-digit code (RFC 6238) chahiye. Secret encrypted rehta hai. Ek code ek hi baar chalta hai.
- 10 recovery codes milte hain, hash me rakhe jaate hain, aur sirf ek baar dikhte hain.
- Login: password ke baad code maanga jaata hai. Code ke bina session nahi banta.
- KYC vault kholne ke liye bhi code chahiye. **Production me 2FA on kiye bina vault khulta hi nahi.**
- Kahan milega: "My data" aur Control Center me.

## 6. Simple broker home + neeche 5 button
- Broker ka home:
  - teen pehle kadam: listing, client ki zaroorat, alerts
  - bade button: WhatsApp listing, client need, Aaj, Match
  - sirf kaam ki tiles, aur har tile apni screen kholti hai: owner ne haan kaha, brokers ko chahiye, jawab aaye, follow-up, owner ka intezaar, protected listings
  - "deal sahi hui" confirm
  - GENZ ke khule projects
  - is mahine ki rank
  - chapter ki agli meet
  - shehar ki report WhatsApp par bhejna
- Phone par broker ko upar ke ~20 tab ki jagah neeche **5 button** milte hain: Home, Property, Khareedar, Deal, Aur. "Aur" me baaki sab tab hain. Desktop pehle jaisa hai.

## 7. Growth loops
- **Powered by GENZ footer:** har shared brochure (`/s/`), listing board (`/p/`) aur city report par "Broker hain? Free judiye" likha hota hai, sharing broker ke referral code (`/?ref=`) ke saath. Visiting card par ye pehle se tha.
- **Reputation:** SETTLED deal room ke baad doosra broker "Sauda theek hua ✔" dabata hai.
  - Visiting card aur listing board par "N deals closed · M brokers ne confirm kiya" dikhta hai. Sirf ginti dikhti hai.
  - Confirm milne par 10 points milte hain.
- **City Captain / meet / leaderboard:** chapters (area-wise captain, meet, RSVP, monthly leaderboard) v11 se pehle se the. Naya ye hai ki meet tay hote hi chapter ke members ko alert jaata hai, aur broker home par rank aur agli meet dikhti hai.
- **Public "GENZ <City> Property Report" (`/report/Raipur`):**
  - locality-wise median ₹/sqft, sirf jahan 90 din me 10+ listing ho
  - type-wise live listings
  - jahan 3+ buyer needs hon wo localities
  - Koi naam, number ya pata nahi dikhta. 20 live listing se kam ho to report "abhi tayyar nahi" kehti hai.
- **Pilot check (Revenue & Growth):**
  - 7 din me activation: listing / client / owner consent (lakshya 40%)
  - din 7–13 par wapsi (lakshya 30%)
  - shehar ke hisaab se filter hota hai

## 8. Deploy / data
- `.env` me nayi lines: `VAPID_*`, `VAPID_SUBJECT`, `PUBLIC_URL`. docker-compose bhi update hai.
- `deploy/backup.sh` ab disk ki files bhi pack karta hai (ID copies, consent forms, protected docs). KYC key file backup me **nahi** jaati, keys password manager me rakhein. `restore.sh` files bhi wapas daalta hai.
- Privacy policy (hi+en) me owner-consent record aur push address ki line judi.

## Tests
- `tests/v26-launch.test.ts`: 43 tests. Inme parser, protection limit, RFC 8291/8292/6238 vectors, poora consent flow (link, paper, decline, same-device flag, report, void), duplicate rokna, consent-required switch, push subscribe/prefs, broadcast, 2FA login + replay + recovery + vault, home summary, footer, city report aur pilot math hain.
- Poori suite: 732 pass.

## Jo nahi kiya / dhyan dein
- Play Store (#7) nahi kiya, jaisa kaha tha.
- SMS (owner OTP, forgot password) abhi bhi paid provider ke bina haath se hota hai.
- Push asli phone par test nahi hua. Sandbox se Google/Apple ke server tak network nahi jaata. Encryption RFC example se pakka hai.
- Advocate se confirm karna hai:
  - protection ki maximum limit
  - consent ke words
  - Aadhaar vault
  - GENZ ka apna RERA agent registration
