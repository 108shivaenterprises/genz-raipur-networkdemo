# v83 — Deal room aasaan: tab badalte hi content dikhe, Overview chhota (4 → 2.4 screen), Tasks ek-line, text 12px+ — kuch hata nahi

## Kyon
Deal room ko phone (390px) par chala ke dekha. v52 ne upar ki bheed kam ki thi, par:
1. **Tab dabane par kuch badalta nahi dikhta tha** — upar ka hissa ~630px ka tha (screen 844px). Tasks / Agreement dabao to naya content fold ke neeche → lagta tha tap hua hi nahi.
2. **Pehli screen par deal ki koi asli jaankari nahi** — sirf chrome (title, kata hua "peline / Offe" strip, switcher, ID, stage).
3. **Overview ~4 screen lamba**, usme ~3 screen sirf paisa (Final rate, Brokerage at final price, हिसाब, "My fee from buyer", "Between the two brokers" — har ek mein apna Save).
4. **Tasks ~6.5 screen** — 13 bade card, har ek mein 3 pill, ID, due, note, Reassign.
5. **~84% text 10–12px** — 40+ saal ke broker ko padhna mushkil.
6. **Final price likhne ke do alag box** (Final rate card aur Brokerage-at-final-price card) — dono ek hi API, ek hi log.

## Kya badla (sirf dikhane ka tareeka — koi feature, permission, API ya data nahi hata)

### Upar ka hissa + tab bar
- **Tab bar ab sticky** hai (top bar ke neeche chipki rehti hai) aur **tab / "Your next step" line dabane par us section ke content tak apne-aap scroll** hota hai. Phone par Chat poori screen ka hai, isliye uske liye scroll nahi.
- **Stage ek line mein**: "Site Visit Done · 3 / 7" + patli bar. Dabane par saare 7 step khulte hain (stage badalna waise hi, confirm ke saath). Badi screen par steps hamesha dikhte hain. "Disputed" ki lal line hamesha dikhti hai.
- **Bada cover photo phone par chhota thumbnail** ban gaya (title ke bagal mein); badi screen par bada cover waisa hi.
- Mode bar mein "Deal room · DEAL-…" ki lambi label hata di (ID card mein hai) — ab "Pipeline / Deal room / Offers" kate nahi.
- "YOUR NEXT STEP" ka label phone par hata (line khud saaf hai); gap thode kam.

### Overview — pehle paisa, phir log, phir niyam
1. **Final rate card** (jahan price likha jaata hai) — sabse upar, fold ke bahar (chat ka "Rate agreed? Write it" ab bhi isi tak scroll karta hai).
2. **"पैसा (हिसाब)" ek fold** — band hone par bhi header mein **asli aankde**: *Deal ₹2.85 Cr · received ₹0 · left ₹2.85 Cr* / *My brokerage ₹15 L · got ₹0 · left ₹15 L*; agar kisi bhugtaan ko mera "confirm" chahiye to peela "⏳ 1 payment wait for your confirm". Kholne par pehle jaisa poora हिसाब + Brokerage-at-final-price + fee/aapas ka hisaab. Badi screen par ye hamesha khula hai.
3. **Log ek card mein**: Introducing broker, Closing/Listing broker (naam, ID, trust badge, hissa % ek line mein), Owner & customer (owner ki shartein, client room ke links). Badi screen par ye daayein kalam mein.
4. **Protection ek line**: "30-day anti-bypass protection active until 22 Nov 2026 · Details". "Details" mein poora anti-bypass paragraph + "aapki chat sirf aap aur doosre broker ki" wala note. **"Dispute khula hai — GENZ admin padh sakta hai" ka lal alert hamesha upar dikhta hai.**
5. Site visits ka header phone par stack hota hai (buttons ab title ko nahi dabate).
- Final price ka **doosra box hata** (jahan Final-rate card usi screen par hai; dono ek jaise log aur ek hi API). Final-rate ka "kaise tay hua" (optional) box tab dikhta hai jab rate likhna shuru karo.
- **Hisaab ki headline ab final rate badalte hi khud badalti hai** (pehle bhi hisaab alag se refresh nahi hota tha; ab `refreshKey` se hota hai).

### Tasks
- **Default "Mere baaki kaam"** (mere naam ke, abhi baaki). Mere paas koi nahi to "Baaki", wo bhi nahi to "Sabhi". Koi "next step" line dabao to apna filter (Mine / Overdue / To check) jaisa pehle.
- **Har task ek row**: rang ka dot, title, **ek status shabd** (Verified / Done — check pending / Waiting to accept / Declined / In progress / To do / Not needed), kaun, kab (late ho to lal "Overdue"). Mera task ho to "You / आप".
- **Row par hi sabse zaroori button**: mere task par *Accept / Decline* ya *Complete Duty*; jisse mujhe jaanchna hai uspe *Independent Audit*.
- **Row dabane par poori purani detail** (ID, category, teeno status, description, assignee, due, accepted-on, completion note, files, verified-by, reassign history) **aur sab button (Reassign samet)** — waise ke waise.
- Scorecard 2×2 bade tile → ek patli row (4 aankde). Filter chips ek scroll hoti row; `All` ab bhi saare 13 dikhata hai.

### Text
- Deal-room ki 12 file mein **`text-[10px]` / `text-[11px]` sab 12px (text-xs)** ho gaye. Tab ke naam phone par 13px.

## Kya NAHI badla (aur kaise pakka kiya)
- **Koi section unmount nahi hua.** हिसाब ka fold sirf CSS se chhupata hai (`hidden`), isliye wo pehle jaise khud load hota, refresh hota aur header ke aankde deta rehta hai. Final rate card fold ke bahar hai. Tasks ki list pehle jaisi `loadTasks` se aati hai (permission check waise hi).
- Har role ke liye wahi conditions: owner, team member, legal, GENZ admin ka "summary view" (bina commercial) — pehle jaise. Charon role + broker ko asli browser mein khol ke dekha, page error koi nahi.
- Koi test-id nahi hata; naye test-id: `deal-subtabs-sticky`, `deal-header-card`, `stage-summary`, `deal-money`, `deal-parties`, `deal-protection(-toggle)`, `deal-visits`, `hisaab-fold(-toggle/-summary/-ack)`, `task-scorecard`, `task-row-<id>`, `task-toggle-<id>`.

## Imaandari wali baatein
- Phone ka check **desktop Chromium ko 390px karke** (English aur Hindi dono) — asli phone par nahi.
- Tab bar ki sticky position `61px` hai (top bar ki ooncha: padding 8+8, button 44, border 1). Top bar ki ooncha badli to ye number badalna padega (test ise pakadta hai).
- "More actions" button abhi bhi apni row leta hai (~44px) — usse deal-close / offline-visit ka form judaa hai, isliye nahi chheda.
- **Agreement tab ka "Total agreed brokerage" aur Overview ka "Brokerage" alag ho sakte hain** (demo data mein ₹5.70 L vs ₹15 L: ek co-broker agreement ka, ek owner mandate ka). Ye hamesha se alag source se aate hain; maine unhe jod nahi diya — asli deal mein dekhna.
- Pichhli run mein dev-server par ek `removeChild` error dikha tha — production build mein nahi aata (dev/HMR ka asar).
- Pitch PDF **update nahi kiya** (aapka standing instruction). Manual bhi nahi.

## Test
- Naya `tests/v83-dealroom-ui.test.ts` (14): sticky + scroll, chhota header, Overview ka kram, folded हिसाब mounted rehta hai, final-rate card fold ke bahar, duplicate box sirf wahan hata jahan Final-rate card hai, har task ka button, permission conditions, 10 tab (kuch nahi gira), 12px floor, har naye `tx()` ka Hindi.
- Asli browser (production build) mein: fold khulna/band hona, final rate likhna → header ke aankde badalna, stage steps, 3 tab, "More" ke 5 tab, Tasks "Mine" par khulna, All = 13, Reassign / 3 status expand mein, Complete Duty ka form.
- Poora suite: **105 file pass, 1505 test pass** (3 file / 4 test pehle se skip); `tsc --noEmit` saaf.

Files: `src/components/DealRoomsView.tsx`, `DealHub.tsx` (StageStepper, SubTabBar, NextSteps label), `DealHisaab.tsx` (fold + refreshKey), `BrokerageAtPrice.tsx` (hideSetter), `FinalRateCard.tsx` (note), aur 12px ke liye `DealStatusPanel / PaymentRequestsPanel / DealTeamAccess / SideFeePanel / CommissionPayments / LegalHelp / DueDiligenceView`.
