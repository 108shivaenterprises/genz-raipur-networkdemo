# v19 — "Save" ki wajah, ID ki copy upload, sponsor ki bhari details signup par, ID Review desk, aur RERA-referral auto-verify

**Kyun.** Krishna ne 4 baatein kahin (screenshot ke saath):
1. *"SAVE OPTION NOT WORKING"* — broker ne PAN + Aadhaar bhara, consent tick kiya, phir bhi **Save** grey.
2. *"ID upload option nahi hai — na broker ke side se invite time, na new user ke side"*.
3. *"Broker ne details bhar di hai to user ko signup par prefilled dikhni chahiye"*.
4. *"Admin / superadmin me ID review option nahi hai"* + *"ek aisa feature jo on karne par RERA broker ke refer kiye log auto-verify ho jayein, notification admin / superadmin ko aati rahe, aur verify karne ka kaam kisi ko assign kar saken."*

GENZ ke niyam jo yahan bhi nahi toote: free for everyone · GENZ paisa handle nahi karta · hi+en · DPDP (sahmati, audit, erase, retention) · neutral platform · koi paid integration nahi · har tile clickable · naya permission nahi (wahi `users:review`, `tier2:vouch`, `self:update`).

---

## 1. "Save" kyun grey tha (asli wajah)
Screenshot ka **PAN `ABCDE9012E` galat hai** — PAN ka **4th akshar** batata hai ki PAN kiska hai (P = vyakti, C, F, H, A, T, B, L, J, G). Yahan 4th akshar `D` hai, jo valid nahi. **Aadhaar `270145518152` bilkul sahi tha** (checksum pass).
Asli bug yeh tha ki screen par **koi wajah nahi dikhti thi** — button chup-chaap grey ho jata tha, aur server ka error toast page ke upar chhup jata tha.

**Ab:**
- PAN / Aadhaar ke neeche **laal line me seedha kaaran** (hi+en): *"PAN ka 4th akshar P, C, F, H, A, T, B, L, J ya G hona chahiye — aapke me 'D' hai. Vyakti ke PAN me P hota hai, jaise ABCPD1234E."* Aadhaar ke liye: kam / zyada ank, pehla ank 0–1, ya "checksum pass nahi hota — koi ank galat typed hai". **Aadhaar number kabhi wapas screen par nahi dikhaya jata.**
- Save ke upar peele box me **"Save karne ke liye: ..."** checklist (kya baaki hai: PAN theek karein / Aadhaar bharein / sahmati tick karein).
- Server ka error bhi button ke paas, usi card me (aur toast ab screen par chipka rehta hai).

## 2. ID ki copy (PAN card + MASKED Aadhaar) — upload kahan-kahan
| Kaun | Kab | Kahan |
|---|---|---|
| **Sponsor (RERA broker)** | Local broker ko register karte waqt | Network → Register & ID → *"Their ID — fill what you know (optional)"*: firm, PAN, Aadhaar ke aakhri 4 ank + dono card ki photo / PDF. Request ban-ne ke turant baad copy upload hoti hai. |
| **Sponsor** | Baad me bhi (jab tak banda account nahi bana leta) | Apni OPEN / INVITED request ke card me "ID copies" — badal sakta hai, hata sakta hai. |
| **Naya member** | Signup par | Join screen par PAN / Aadhaar ke neeche slot (photo / PDF). Sponsor ne jo copy di wo "Your sponsor has already added a copy" dikhti hai. |
| **Member** | Baad me | Network → Register & ID → "Mera PAN aur aadhaar" card ke andar. |

**Niyam:** photo / PDF, max **3 MB** (browser photo ko khud chhota karta hai); server file ka **asli type pehchanta hai** (naam / extension nahi) — kachra file 415 se rukti hai. Ek kind ki ek hi copy (nayi daalo = purani replace). **Aadhaar sirf MASKED** copy (pehle 8 ank chhupe) — screen par likha rehta hai ki myAadhaar.uidai.gov.in se "Masked Aadhaar" download karein ya number kagaz se dhak kar photo lein.

## 3. Sponsor ki bhari details signup par PREFILLED
Invitation code dalte hi join screen par naam, firm, shehar, PAN **bhare hue** aate hain, har field par hara chip **"filled by your sponsor / आपके स्पॉन्सर ने भरा"**; upar neela banner "sponsor ne kuch details bhar di hain, jaanch lein aur galat ho to badal dein".
- **Aadhaar number sponsor se prefill nahi hota** (sponsor ke paas sirf aakhri 4 ank hote hain) — member ko poora number khud likhna hai; hint: *"Aapke sponsor ne aakhri 4 ank 0113 bataye hain"*. Alag ho to peela, **rokne wala nahi** (sirf chetavani — aur admin ko card par "Differs from sponsor" dikhta hai).
- Signup ke saath sponsor ki daali hui copies **member ke account par shift** ho jaati hain (`subjectUserId`); member chahe to nayi daal sakta hai.

## 4. ID Review desk (admin + superadmin) — naya tab "ID Review / ID जाँच"
Nav me tab (permission: wahi `users:review`), **badge** me "mere naam ya bina-naam wale" kaam ki ginti (har 60 sec me, aur kuch bhi badalne par turant).
- **6 clickable tiles:** Baaki (default) · Auto-verified · Mere · Bina reviewer · Dobara maanga · Ho gaya (+ search, tier filter).
- **Har card:** naam, shehar, firm, sponsor, PAN (masked), Aadhaar (masked), PAN / Aadhaar copy hai ya nahi, "Auto-verified" (violet) / "Differs from sponsor" (laal) / "Waiting for member" (peela) chips, reviewer select, "Review ID →".
- **Detail:** "Compare with the card" (poora PAN — **sirf detail me**, list me masked), sponsor ne kya bhara, copies (**Show** = page ke andar photo, **Open** = nayi tab; **har open par reviewer ka naam audit trail me**, `IDDOC_VIEWED`), 3 checkbox ("PAN card se naam / number mila", "Aadhaar card (masked) mila", "chehra / video call"), note.
- **Buttons:** *ID is fine* (ID dekhi — record) · *ID fine + Approve* (PENDING member: pehle ID-dekhi, phir approve) · *Ask for clearer copy* (note zaroori; member ko "GENZ team asks: ..." box me dikhta hai; wo nayi copy / number daalta hai to task wapas khul jaata hai) · *Problem — reject* (PENDING) / *suspend* (VERIFIED) — suspend par sponsor ko strike wahi v18 niyam se.
- **Assign:** har card me reviewer select (kisi ko bhi, ya hata do); upar **"Default reviewer"** (naye kaam apne aap us par) aur **"Saare bina-reviewer kaam ek ko do"** (bulk). Reviewer = koi bhi VERIFIED user jiske paas `users:review` hai. Superadmin aur admin **dono** kar sakte hain.
- Control Center me **"ID checks waiting"** card (clickable) aur Invite & KYC me **"Open ID Review"** button.
- Purana v18 "I have seen the ID" button waise hi chalta hai aur task ko saath me band karta hai.

## 5. Auto-verify switch (admin + superadmin dono)
ID Review ke upar **"Auto-verify people registered by a RERA broker"** — ek switch (`role="switch"`), **default OFF**. ON karte waqt confirm box (hi+en) aata hai.

**ON hone par:** sign-up ke waqt member seedha **VERIFIED** (30-din probation, Broker ID mil jaati hai), **magar**
1. uska **ID-check task khula rehta hai** (violet "Auto-verified" chip) — jab tak koi reviewer ID dekh kar band na kare;
2. **notification kabhi band nahi hoti:** tab ka badge, "Auto-verified" tile, upar violet banner "N auto-verified members ki ID jaanch baaki", Control Center card — sab tab tak jab tak task khula hai;
3. default reviewer set ho to task usi ko **assign** ho jaata hai; baaki ko aap kabhi bhi assign / bulk-assign kar sakte hain;
4. ID galat nikli → **Problem — suspend** → account session samet band + sponsor ko **strike** (v18 niyam).

**Sharten (sab ek saath):** sponsor **RERA-registered Tier 1 + verified** ho (`isSponsorEligible`), uske **0 strike** hon, uska register karna **pause** na ho. Koi shart toot-ti hai to banda **PENDING** hi rehta hai aur task ki history me wajah likhi aati hai ("sponsor ke strike hain" ...). Admin ne jo Tier 1 seedha invite kiya wo is switch se **chhua nahi** jaata (wo pehle jaisa chalta hai).
Kaun ne kab switch badla — "Last changed by ... · tareekh" dikhta hai aur audit me (`ID_AUTO_VERIFY_CHANGED`, `USER_AUTO_VERIFIED`).

## 6. ID copy ka storage — privacy
- File `data/iddocs/<id>.bin` (JSON / Postgres me sirf metadata: naam, size, sha256, kaun, kab). Postgres store naye arrays ko apne aap uthata hai.
- **Kaun khol sakta hai:** review team (har baar audit event) · khud member · sponsor **sirf jab tak account nahi bana**. Aur koi nahi (na dusra broker, na builder, na owner).
- **Retention:** decision ke **90 din** baad file delete; jo request kabhi account nahi bani / band hui uski copy **14 din**; **reject / withdraw par turant**; DPDP erasure par turant (file + task + sponsor ka bhara PAN / last-4 bhi). Har ghante `sweepIdDocs`.
- Aadhaar ki **poori number kabhi store / log nahi** — sirf last-4. (Masked copy me bhi pehle 8 ank chhupe hone chahiye.)

## 7. Technical
- Naye: `server/idreview.ts` (router `/api/id-review/*`: `mine`, `applications/:id/docs`, `docs/:id/file`, `summary`, `queue`, `tasks/:id`, `tasks/:id/assign`, `tasks/:id/decide`, `assign-unassigned`, `settings`), `src/components/IdReviewView.tsx`, `src/components/IdDocSlot.tsx`, `src/lib/idFile.ts`.
- `src/shared/idRules.ts`: `panProblem`, `aadhaarProblem` (kaaran + hi/en), `isLast4`, `ID_DOC_*` (server, browser, tests wahi).
- `server/db.ts`: `IdDoc`, `IdReviewTask`, `Tier2Application.{companyName,panNumber,aadhaarLast4}`, `UserProfile.{autoVerifiedAt,autoVerifiedBy}`, settings `autoVerifyReraReferrals`, `idReviewDefaultAssigneeId` — sab optional, purana data waise hi chalta hai (migration nahi).
- `server.ts`: invitation validate me `prefill`; register-invite me copies shift + `autoVerifyDecision`; non-APPROVE decision par `closeIdTaskOnAdverse`.
- Control Center ke `platformSettingsSchema` (`.strict()`) ko **nahi chheda** — switch sirf ID Review me hai.
- Tests: `tests/v19-id-review.test.ts` — 36 tests (screenshot wale PAN ka kaaran, Aadhaar sahi, invite-time details + copies, prefill, kaun khol sakta hai + audit, queue / assign / bulk, ID-check gate, ask-again, seen + approve, auto-verify (default OFF, toggle, signup par verified, badge, suspend → strike, strike wale sponsor par skip, Tier 1 direct invite par asar nahi, OFF par band), member-side cleanup, erasure).

## 8. Sach-sach: kya karta hai, kya NAHI
- **Karta hai:** galat PAN / Aadhaar ka kaaran seedha dikhata hai; ID ki copy sponsor, member aur baad me bhi jama kar deta hai; sponsor ki bhari details member ko prefilled milti hain; GENZ team ko ek hi jagah ID-queue + assign + record; RERA broker ke log turant kaam shuru kar sakte hain par ID-check khula rehta hai.
- **NAHI karta:** copy ke andar ka naam / number **OCR se nahi padhta** (reviewer aankh se milata hai); Aadhaar asli hai ya kisi aur ka — UIDAI ke bina pakka nahi; **SMS / WhatsApp / email notification nahi** bhejta (notification = tab badge + tiles + banner + Control Center; sms ke liye provider chahiye = paid / alag setup).
- **Auto-verify ka asli jokhim:** member ID dekhne se **pehle** VERIFIED ho jaata hai (v18 ka "ID dekhe bina approve nahi" gate is switch me skip hota hai). Isliye default **OFF**, sirf strike-free verified RERA sponsor par, task + notification hamesha khula, aur galat nikla to suspend → sponsor ko strike.

## 9. Jaan-boojhkar nahi kiya / aapka faisla chahiye
- **Auto-verify se pehle copy zaroori?** Abhi nahi (copy optional). Chaho to "dono copy ho tabhi auto-verify" ek `if` me.
- **Sirf GENZ-staff reviewer:** abhi reviewer = koi bhi verified `users:review` wala. Alag "ID reviewer" role chahiye to naya permission lagega (aapse poochna tha).
- **Notification SMS / WhatsApp:** hook ban sakta hai, par provider chahiye (paid).
- **Retention 90 / 14 din** badalna ho to `ID_DOC_RETENTION_DAYS`, `ID_DOC_ORPHAN_DAYS` (`idRules.ts`).
- **Vakeel se confirm:** Aadhaar (masked) copy rakhne ka wording / retention.
- Purane pending faisle (TDS 5% vs 2%, milestone payment, buyer "I'm interested", OCR, volume backup, altPhone, non-RERA FULL launch mode, Virtual Tour, Master-CP / monetization, Pulse breakdowns) waise hi baaki.


> **v25 update:** upar jahan 'Aadhaar number kabhi wapas nahi dikhaya jata' likha hai wo review screens par ab bhi sach hai. Fark: member ki sahmati se poora Aadhaar + address ab alag encrypted vault me rakha jata hai (docs/V25_KYC_VAULT_OCR.md). Masked-copy upload ka niyam badla nahi.
