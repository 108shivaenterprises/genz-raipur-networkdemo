# v17 — Network Pulse: superadmin ko ek jagah dikhta hai ki network kitna chal raha hai

**Kyun.** Krishna ka sawaal: *"network se kitni bookings aur kitni sale hui, kitne active brokers, kitne live projects; per day kitne brokers, kitne persons — yeh sab superadmin me dikhta hai?"*

**Pehle kya tha.** Control Center me users / KYC / disputes / purane Deal-room ka count tha. **Nahi tha:** CRM bookings aur unki sale value / vasooli, live projects, aur **roz kitne log aaye** (sirf ek "last login" timestamp bachta tha, har login par badal jaata tha — history nahi).

GENZ ke niyam jo yahan bhi nahi toote: **GENZ paisa handle nahi karta** (Pulse sirf padhta hai) · hi+en · DPDP (koi grahak ka naam / phone nahi, daily record me sirf user-id + tareekh, 180 din me erase) · har tile clickable · koi naya heavy dependency nahi · auth / KYC / roles me koi badlav nahi (naya permission bhi nahi — wahi `admin:control_center`, yaani sirf superadmin).

---

## 1. Kahan hai
**Superadmin → Control Center → sabse upar "Network Pulse".** Upar 4 button: **Aaj · Kal · Pichhle 7 din · Pichhle 30 din** — niche ke tiles usi avadhi ke hisaab se badalte hain.

## 2. Tiles (har tile dabao → uske peeche ki list khulti hai)
| Group | Tile | Kya ginta hai |
|---|---|---|
| Kaun aaya | **Log aaye** | jis kisi ne app kholi (admin chhodkar) |
|  | **Broker aaye** | unme se brokers (kul verified ke saath) |
|  | **Kaam kiya** | jinki koi badlav-wali request (naya lead, approve, confirm…) safal hui |
|  | **Naye sign-up** | is avadhi me bane naye account |
| Network ne kya kiya | **Bookings (network)** | builder ne **approve** ki hui bookings, **partner ke zariye** (avadhi = approve ka din) |
|  | **Bikri ki rakam** | unki agreement value (ab tak ka total bhi) |
|  | **Ab tak vasooli** | un bookings par asal vasooli (ledger — sirf wahi jo builder ne confirm kiya) |
|  | **Raaste me paisa** | v16.9 Money Trail ke chalu trail: team ke paas / partner ke paas / builder ko saunpa (atke hue alag) |
| Network aaj | **Live projects** | jin me abhi bikne wali units bachi hain (+ kitni units, kitne builders) |
|  | **Verified brokers** | verified / kul, RERA wale (dabao → Invite & KYC) |
|  | **Intezaar me bookings** | builder ke jawab ki pratiksha |
|  | **Builder ki apni bikri** | builder ke apne desk ki bikri (bina partner) — **alag dikhti hai**, network ke aankde me nahi judti |

## 3. List me kya dikhta hai (aur kya kabhi nahi)
- **Log / broker / kaam / sign-up:** naam, bhoomika, company, shehar, kitne din active the. **Phone, email, PAN, GSTIN kabhi nahi.**
- **Bookings:** project, unit, builder, partner, rakam, vasooli %, status, tareekh. **Grahak ka naam / phone / lead id kabhi nahi.**
- **Projects:** project, builder, shehar, units, kitne partner. **Money:** trail, project, rakam, kiske paas, kitne din se.

## 4. Roz ke chart (pichhle 30 din)
- **Roz aane wale log / broker / kaam karne wale** (ek ek karke badlo) aur **roz ki bookings (manjoor / maangi gayi)**. Har bar par hover / tap → us din ka number. "Roz ki talika" dabao to poori table.
- Ek hi series ek chart me (dual axis nahi), patle bar, aadhar-rekha par.

## 5. "Roz kitne aaye" kaise gina jaata hai
- **Din = Bharat ka din (IST)**, raat 12 baje se.
- **Aaya** = us din koi bhi login ya koi bhi API call (app khula). **Kaam kiya** = koi badlav-wali request jo safal gayi (refused / error wali nahi).
- Ek aadmi ek din me ek hi baar gina jaata hai; 7 / 30 din me bhi har aadmi **ek baar** (5 din aaya to bhi 1).
- **Admin / superadmin gine nahi jaate.** "View as" session me **admin** gina jaata hai, jis user ko dekh rahe ho wo nahi.
- **Pehle ke din:** daily record is update ke baad se shuru hota hai. Usse pehle ke din ke liye **audit trail** se wo log nikalte hain jinhone **kuch kiya** (sirf dekhne wale wahan se nahi mil sakte). Chart me aise din **halke rang** me dikhte hain aur neeche likha rehta hai.
- Pehle login ke baad hi "aaya" ki ginti shuru hoti hai (screen par "ginti ___ se" likha aata hai).

## 6. Privacy (DPDP)
- Naya data sirf: `activityDays: [{ day, seen: [userId], acted: [userId] }]` — **user-id aur tareekh, bas.** Koi page, IP, phone, device nahi.
- **180 din** se purane din apne aap hat jaate hain (`KEEP_DAYS`).
- Screen par yeh baat likhi hai (hi+en).
- Pulse sirf `admin:control_center` (superadmin) ko; broker / builder / admin ko 403, bina login 401.

## 7. Technical
- Shared pure rules: `src/shared/pulseRules.ts` (IST din, window, record / prune, audit se history, din-wise ginti, bookings aur projects ka hisaab) — server, browser aur tests teeno wahi use karte hain.
- Server: `server/pulse.ts` — `activityMiddleware` (har `/api` call par sirf ek Set-lookup; disk write ek user ke liye din me sirf pehli baar (aaya) aur pehli baar (kaam kiya)), `GET /api/admin/pulse`, `GET /api/admin/pulse/drill?kind=people|brokers|acted|actedBrokers|signups|bookings|projects|money&window=today|yesterday|d7|d30|all`.
- `server/db.ts`: `activityDays` (JSON state; Postgres me wahi blob), `server.ts`: middleware + login par record + mount.
- UI: `src/components/NetworkPulse.tsx` (Control Center ke upar).
- Tests: `tests/v17-network-pulse.test.ts` (25 tests: din-sima IST, record / prune, audit-history, ginti, bookings / projects ka hisaab, aur HTTP par — kaun dekh sakta hai, view-as, refused request, booking → sale, trail → vasooli, no-PII).

## 8. Jaan-boojhkar nahi kiya / aage
- **Koi page-view / session-length tracking nahi** (privacy). Sirf "aaya / kaam kiya".
- Network bikri = **approved** bookings; **cancel hui booking** (clawback) ginti se hat jaati hai; vasooli sirf ledger ki.
- Shehar-wise / builder-wise tod abhi nahi (list me shehar dikhta hai). Agla kadam ho sakta hai.
- Daily record bahut bade scale par (lakhs of users) Postgres ki alag table maangega — abhi 180 din × active users ke ids chhote hain.
- Investor ke liye PDF / export abhi nahi.

## 9. Pehle se pending faisle (is version se alag)
TDS 5% vs 2% · milestone-wise payment · buyer "I'm interested" · OCR · volume backup · altPhone · non-RERA FULL launch mode · Virtual Tour (app store ke baad) · Master-CP / monetization ka model.
