# v16.7 — Sales Desk: source, details, telecaller, forward, booking amount + payment condition

**Kyun.** Associates CRM ke lead drawer aur "Register lead" form me yeh kami thi: booking request me sirf unit / agreement / token ₹ tha (na booking amount ka detail, na payment condition), telecaller ka koi kaam nahi tha, lead ko agle executive / coordinator ko forward karne ka option nahi tha, lead kahan se aayi (source) darj karne ki jagah nahi thi, aur customer ke baare me jaankari (detailing) bahut kam thi. Yeh sab ab ek jagah, English + Hindi dono me.

GENZ ke niyam jo yahan bhi nahi toote: free for everyone · GENZ paisa handle nahi karta (sirf darj karta hai, doosri taraf se confirm karwata hai) · hi+en · DPDP (consent, phone nahi dikhta, audit log, retention me data erase) · neutral platform · sirf points-based incentives · jo chal raha tha use nahi toda.

## 1. Lead ka source
- Register-lead form me **"Yeh lead kahan se aayi?"**: 15 source — Walk-in, Telecalling, Associate ka apna contact, Customer reference, Employee / dost reference, Facebook / Instagram / YouTube, Google / online ad, Website / app, Property portal, WhatsApp / SMS broadcast, Hoarding / banner / pamphlet, Newspaper / TV / radio, Exhibition / expo, Purana customer, Other.
- Har source ke saath **detail** ka box (jaise portal ka naam "99acres", campaign "Diwali offer", reference dene wale ka naam) — placeholder source ke hisaab se badalta hai.
- Lead drawer me source **badal** sakte ho (timeline me likha jaata hai). **Employee source nahi badal sakta** (403) — warna source report kharab ho jaati.
- CSV import me `source` / `source_detail` column, ya poori file ke liye ek default source. Galat source = us row ki error (chupchaap "other" nahi). Export me `source_detail` bhi.
- Filter aur Reports ki source table ab poori list (aur Hindi naam) dikhati hai.

## 2. Customer ki jaankari (detailing)
Drawer me **"Source & customer details"** card: kitna jaante ho (X/10 meter), ab tak ke jawab chips me, aur **"Agla poochho"** (budget, occupation, kab tak khareedna…).
- Fields: kyun khareed raha (khud rehne / nivesh / dono), paisa kaise (apna / home loan / mix) + loan status, kab tak khareedna, occupation (salaried / sarkari / business / professional / retired / NRI), kahan rehta hai (shehar + ilaka), abhi ka ghar, parivar ke log, **faisla kaun karega**, kya chahiye (facing, floor, parking…), kaun se aur projects dekh raha, call ka sahi time, bhasha, remarks. Budget aur "kya chahiye" pehle se the.
- Register form me bhi "Customer ke baare me aur jaankari" (khulne wala hissa, optional).
- **Jaan-boojh kar NAHI**: income, PAN / Aadhaar, dharm, jaati, sehat, doosra phone number. (DPDP: sirf wahi jo customer ki seva ke liye zaroori.) Server aise koi bhi key refuse karta hai (400).
- **"Kaun se aur projects dekh raha"** sirf associate aur uski team ko dikhta hai — **builder ko kabhi nahi** (neutral platform; broker ki apni jaankari). Builder apni taraf se baaki details edit kare tab bhi yeh field mitta nahi.
- Opt-out customer ki details edit nahi hoti. **Retention sweep** ab details, source detail aur forward ke notes bhi erase karta hai.

## 3. Telecaller: call log aur call list
- Drawer me **"Call darj karo"**: 8 natije — baat hui (ruchi hai / visit tay / baad me call / ruchi nahi), phone nahi uthaya, busy, phone band, galat number. "Visit tay" aur "baad me call" **tareekh-samay maangte hain**.
- Apne aap: pehli connected call par NEW → CONTACTED; visit tay → SITE_VISIT_SCHEDULED + site-visit reminder; call-back → reminder; phone nahi uthaya / busy / band → 4 / 3 / 24 ghante baad ka retry reminder. **5 baar try, ek baar bhi baat nahi** → "WhatsApp try karo ya lead lost karo" ka sujhav. Galat number → tag + "number sudharo". "Ruchi nahi" → "lost karo?" ka sujhav.
- Timeline me har call structured (natija, minute, kaun sa attempt). Purana "Log activity" me ab Call nahi — uski jagah yeh panel hai.
- **"Call list" tab**: kise abhi call karna hai — pehle forward ki hui, phir follow-up ka time ho chuka, phir nayi lead jisko kisi ne call nahi kiya, phir aaj ke. Employee ko sirf apni; owner ko poori team (member filter ke saath).
- **Alerts**: "Aapko forward ki gayi lead", "forward hui par 24 ghante se khuli nahi" (owner ko), "Nayi lead jisse 4+ ghante me kisi ne baat nahi ki", "5+ baar call, baat nahi hui".

## 4. Agle executive / coordinator ko forward
- Drawer me **"Agle executive / coordinator ko bhejo"**: teammates ki list (role, kitni khuli leads; chhutti par / limit poori / is project par nahi — to chuna nahi ja sakta). Sujhav: aapke role ke baad ka agla (telecaller → sales executive → site coordinator → closing manager).
- **Maksad** (site visit / follow-up / closing / booking ke kaagaz / other) + **hand-off note** (kam se kam 5 akshar: kya kiya, aage kya) — note ke bina forward nahi hota.
- Receiver ko lead "forward ki gayi" dikhti hai jab tak kholta nahi; khulte hi **"seen"** darj hota hai. Pura **itihaas** lead par rehta hai ("Aage bheja gaya" section). Bhejne wala usi lead ko phir nahi dekhta (employee sirf apni allotted leads dekhta hai) — use sirf ek chhoti receipt milti hai.
- Forward sirf **usi employer ki team ke andar**. Owner (broker / builder-desk) bhi forward kar sakta hai. Employer har employee ke liye **"forward kar sakta hai"** switch Team Control me badal sakta hai.
- Team me ab **role** (Telecaller / Sales executive / Site-visit coordinator / Closing manager / Assistant / Other) — member jodte waqt chuno, table me badlo. Purane free-text titles ("Site executive") se role apne aap pehchana jaata hai.
- Reports me **"Telecalling aur team"**: har member ke calls, kitni baat hui, visit tay, forward bheji / mili, khuli, booked; aur "lead darj hone se pehli call tak ka samanya samay".

## 5. Booking request: booking amount + payment condition
Drawer me **"Booking anurodh bharo"** ki bada form (pehle sirf 3 box the):
- **Unit aur keemat**: unit / plot no., type, agreement value, co-applicant.
- **Booking amount (token)**: kitna diya, **kaise** (cheque / UPI / NEFT-RTGS / DD / cash / other), **cheque no. / UTR** (cash ke alawa zaroori), kis tareekh. Aage ki tareekh ya agreement se zyada → refuse.
- **Payment condition**: plan (Builder ka standard / Down payment / Time-linked / Construction-linked CLP / Bank-loan linked / Custom), funding (apna / loan / mix) + bank + loan amount, **kistein** (naam, %, kitne din me — 100% hona zaroori, 12 tak; preset se shuru kar ke badal sakte ho), vishesh shartein, mangi gayi chhoot, registry kab tak.
- **Kaun bhej sakta hai**: associate apni lead par · **builder apni desk ki lead par** (nayi: pehle builder-desk leads ka booking ka koi raasta hi nahi tha) · **associate / builder ka employee, agar employer ne "booking anurodh bhej sakta hai" switch on kiya** (default **band**). Builder har anurodh par decision khud leta hai. Anurodh par "kisne bheja / kiski taraf se" dikhta hai.

## 6. Booking amount = DAAVA, builder confirm karta hai
- Anurodh me bheji gayi booking amount **"daava"** hai. Builder approve karte waqt checkbox **"booking amount mujhe mil gayi"** (default tick nahi) tick kare, ya baad me alag se **"Mujhe mil gayi / Nahi mili (karan ke saath)"**. Mil gayi = pehli kiston par asli receipts ban jaati hain (mode + UTR ke saath) — **tabhi brokerage collection ke anupat me payable hoti hai**. Nahi mili = karan likhna zaroori, ledger me kuch nahi jaata, associate ko dikhta hai.
- **Pehle ka ek chhed band kiya**: purana code token pehli kist se zyada ho to pehli kist **apne aap "paid"** maan leta tha — yaani anurodh bhejne wala khud brokerage unlock kar sakta tha. Ab aisa nahi hota.
- Builder alert: "booking amount ka daava 3+ din se confirm nahi hua".

## 7. Builder-desk ki apni bikri
Lead builder ki apni desk ki ho (koi associate nahi) to builder (ya uska employee) booking anurodh bhej sakta hai aur approve bhi karta hai **bina mandate ke**: unit counters badhte-ghatte hain, **brokerage 0**, payout 409 se refuse, cancel karne par unit wapas. Associates ko yeh booking dikhti hi nahi.

## 8. Employee ko jo NAHI dikhta (ek leak bhi theek kiya)
Pehle employee lead kholta to booking ka poora record (brokerage, payouts, ledger) uske response me jaata tha. Ab employee ko sirf: unit, plan, booking amount ka status, kisne bheja — **brokerage, payout, TDS, ledger kuch nahi** (aur agreement value sirf tab jab usne khud anurodh bheja).

## 9. Files
- Naya: `src/shared/crmSales.ts` (saare niyam, hi+en labels), `server/crm3.ts` (call, call-queue, forward), `src/components/CrmSales.tsx` (saari nayi screens), `tests/v16-7-salesdesk.test.ts` (35 tests).
- Badla: `server/crm.ts` (source / details, booking request, decision, token confirm, payout guard, employee view), `server/crm2.ts` (import / export, retention, alerts, reports), `server/team.ts` (role), `server/permissions.ts` (`crm:booking_request` builder + employees ko; claim / payout-ack / cancel-request routes ab bhi sirf associate ke), `server/pcontrol.ts`, `server/db.ts`, `server.ts`, `src/shared/pcontrolRules.ts`, `src/types/crm.ts`, `src/lib/api.ts`, `labels.ts`, `CrmView.tsx`, `CrmPlus.tsx`, `CrmReports.tsx`, `TeamView.tsx`, `TeamControl.tsx`; do purane tests me ab booking amount ke saath mode + UTR bhejna padta hai (naya niyam).
- API (naye): `POST /api/crm/leads/:id/call` · `GET /api/crm/call-queue` · `GET /api/crm/leads/:id/forward-targets` · `POST /api/crm/leads/:id/forward` · `POST /api/crm/bookings/:id/token` · `decision` me `tokenReceived`.

## 10. Verify kaise kiya
- Poora suite: **394 pass**, 1 skipped (pehle se). `tsc` clean, `npm run build` ok.
- Asli Chromium: associate ne source + details ke saath lead darj ki, details bhari, call log (phone nahi uthaya → visit tay), forward Rakesh ko note ke saath, booking request (mode-UTR ki error, 100% se kam kisten ki error, construction-linked preset, loan, co-applicant), Rakesh (Hindi) ko "forward ki gayi" alert + call list, builder ne daava dekha aur checkbox tick karke approve kiya → "Received — builder ne confirm kiya", brokerage collection ke anupat me. Hindi me 360px par register form / drawer / forward / booking sheet: koi horizontal scroll nahi, koi English-only line nahi (sirf project / vyakti ke naam).

## 11. Imaandaari se — jo abhi NAHI hai
- **GENZ bank ka paisa verify nahi kar sakta.** "Mujhe mil gayi" builder ka apna bayan hai (UTR ke saath darj, audit log me); GENZ bank statement se match nahi karta.
- **PAN / Aadhaar / KYC offline hi rehta hai** (customer ka bhi) — jaan-boojh kar.
- **Doosra phone number (alt phone) nahi rakha** — DPDP ke hisaab se customer ne ek hi number par sahmati di hai. Agar chahiye to batao.
- **"Booking anurodh bhej sakta hai" har employee ke liye default band** — owner ko Team Control me on karna padega.
- Builder-desk bookings par **brokerage nahi**; builder ke employee ke incentive ka hisaab abhi alag (points) hai, brokerage se nahi judta.
- Call log **GENZ ke andar se call nahi lagata** — "Call" button phone ka dialer kholta hai; natija aap darj karte ho (koi paid telephony API nahi).
- Pehle se pending faisle: TDS 5% vs 2%, milestone payments, buyer ka "I'm interested", OCR (v16.6), volume ka backup.
