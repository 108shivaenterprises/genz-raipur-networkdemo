# v18 — RERA Sponsor + "kisne kisko register kiya" + PAN / Aadhaar

**Kyun.** Krishna ka faisla: *"koi non-registered broker judna chahe to kisi RERA-registered broker ke zariye hi judega; kisne kisko register kiya yeh GENZ ko dikhna chahiye; aur fraud rokne ke liye brokers ka Aadhaar aur PAN bhi lenge."*

**Pehle kya tha (v15).** Local associate (Tier 2) ko 2 members ya City Captain "vouch" karte the. Kamiyan: (1) vouch karne wala khud Tier 2 bhi ho sakta tha → bina-RERA logon ki band chain; (2) sponsor ka RERA hona zaroori nahi tha; (3) admin ko sirf "kisne vouch kiya" ki ek line dikhti thi, sponsor-wise list nahi; (4) Aadhaar bilkul nahi, PAN optional.

GENZ ke niyam jo yahan bhi nahi toote: free for everyone · GENZ paisa handle nahi karta · hi+en · DPDP (sahmati, audit, erase) · neutral platform · koi paid integration nahi · har tile clickable.

---

## 1. Naya niyam (ek line me)
**Bina-RERA broker sirf tab judta hai jab koi *RERA-registered (Tier 1), verified* broker use register karaye — wahi uska sponsor hai. Ek sponsor kaafi hai. Local associate kisi ko sponsor nahi kar sakta.**

| Sawaal | Jawab |
|---|---|
| Kaun sponsor ban sakta hai? | Verified broker jiska RERA no. file par ho (Tier 1). Tier 2, owner, pending/suspended — nahi. |
| Kitne sponsor chahiye? | **1** (`SPONSORS_NEEDED` in `src/shared/networkRules.ts` — 2 karna ho to wahi ek number badlo) |
| Sponsor ki limit? | Wahi purani: mahine me 2 (City Captain 10), apne phone / company wale ko nahi, same city (Captain kahin bhi) |
| Sponsor ki zimmedari? | Jisko register kiya wo suspend / blacklist ho → sponsor ko **strike**; 2 strike = 6 mahine register karna band |
| Register hone ke baad sponsor suspend ho gaya? | Naya sign-up **nahi chalta** (`SPONSOR_INACTIVE`); admin list me laal "sponsor निष्क्रिय" |
| Pehle se judey Tier 2? | Sponsor = unki purani entry-request ka proposer (derive hota hai). Jinka kuch nahi mila wo alag peele box me: **"No sponsor on record"** |

## 2. PAN + Aadhaar (har naya broker, dono tier)
- **PAN:** zaroori, format check, **ek PAN = ek broker account** (dobara naye naam / number se aana band). Space / chhote akshar se bhi nahi bachta.
- **Aadhaar:** 12 ank, pehla ank 2–9, **Verhoeff checksum** (galat ank / farzi number turant pakda jaata hai). **Poora number kabhi store, log, audit ya wapas nahi bhejta — sirf aakhri 4 ank** (`aadhaarLast4`). Screen par `XXXX XXXX 1234`.
- **Sahmati:** alag checkbox (hi+en) — "PAN aur aadhaar ke aakhri 4 ank pehchaan aur dhokhadhadi rokne ke liye rakho". `idConsentAt` me tareekh.
- **Admin ka "ID dekha" tick:** admin video call / office me asli PAN + Aadhaar card dekhta hai, tick karta hai (note me *kya dekha* likhta hai — **number nahi**). **Tier 2 ko pehli baar approve karne se pehle yeh tick zaroori** (`ID_CHECK_PENDING`); PAN / Aadhaar na ho to `ID_MISSING`. Member PAN / Aadhaar badle to tick **hat jaata hai** — admin ko dobara dekhna padta hai.
- **Purane brokers** (jinke paas Aadhaar nahi): Network → **Register & ID** me "Mera PAN aur aadhaar" card se khud jod sakte hain. Pending member bhi (sirf `self:update` chahiye). Unhe zabardasti band nahi kiya.
- **Erasure (DPDP):** PAN, Aadhaar last-4, sahmati aur ID-tick sab hat jaate hain.

## 3. Kaun kya dekhta hai
| Kaun | Kahan | Kya |
|---|---|---|
| **GENZ admin** | Network → *City tiers & desk* → **"Who registered whom"** (sabse upar) | Har sponsor (naam, firm, shehar, RERA no., strikes, captain, active/nahi) → uske register kiye log (status, tier, jude kab, PAN masked, Aadhaar `XXXX XXXX 1234`, ID dekhi ya nahi + kisne + note). 7 clickable tiles: Sponsors · Registered · Suspended/rejected · ID not on file · ID not yet seen · Sponsor not active · No sponsor on record. Har broker ka "I have seen the ID" button yahin. |
| **GENZ admin** | Invite & KYC table | Har broker ke neeche Aadhaar masked, "Registered by", "ID seen"; pending broker par **"I have seen the ID"** button; Tier 2 ka *Approve* tab tak band. |
| **Sponsor** | Network → *My network* → **"People I registered"** | Naam, shehar, status, jude kab, ID mili / dekhi gayi (haan/nahi). **Phone, PAN, Aadhaar kuch nahi.** |
| **Member (Tier 2)** | Network → *Register & ID* aur *My network* | "Aapko kisne register kiya" (naam · firm · shehar · uska RERA no.) |
| **Dusre members** | Trust card | "Registered by <naam> — RERA GENZ ne verify nahi kiya" (sirf naam; koi ID number nahi) |

## 4. Join screen
Invitation code ke baad: sponsor ka naam ("Aapko RERA-registered broker __ ne register kiya hai"), PAN (zaroori, live format check), Aadhaar (12 ank, live checksum, "sirf aakhri 4 ank save hote hain" note), sahmati checkbox. Hindi + English. Tier 1 (admin-invite) route me bhi Aadhaar + sahmati ab zaroori.
WhatsApp invitation text me sponsor ka naam aur "PAN + Aadhaar ready rakhein" likha aata hai.

## 5. Technical
- Shared pure rules: `src/shared/idRules.ts` (PAN regex, Verhoeff, Aadhaar validate / last-4 / mask, `isSponsorEligible`) — server, browser, tests wahi use karte hain. `server/kyc.ts` ka PAN check ab wahi rule use karta hai.
- `server/network.ts`: `vouchBlock` Tier-1-only; `GET/POST /api/network/my-id`; `POST /api/network/id-check/:userId` (`users:review`); `GET /api/network/sponsored` (`tier2:vouch`); `GET /api/network/admin/sponsors` (`growth:manage`); `/me` me `sponsor`, `canSponsor`, `sponsoredCount`, `idStatus`; `/admin/overview` me `ids` + pending me `sponsor / idOnFile / idChecked`.
- `server.ts`: `register-invite` — broker ke liye PAN + Aadhaar + sahmati, PAN-unique, sponsor-active check, `sponsorId / sponsoredAt / aadhaarLast4 / idConsentAt` set; `verifications/:id/review` APPROVE gate (sirf pehli baar, Tier 2); `invitations/validate` me `sponsorName`.
- `server/tiers.ts`: `sponsorOf(user)`; `applyVoucherStrikes` ab sponsor ko bhi strike deta hai.
- `server/db.ts`: `UserProfile` me `sponsorId, sponsoredAt, aadhaarLast4, idConsentAt, idCheckedAt, idCheckedBy, idCheckNote` (naye optional fields — purana data waise hi chalta hai, koi migration nahi). `access.ts partnerCard` aur `privacy.ts` erase in sab ko hatate hain.
- Naya permission **nahi** — wahi `users:review`, `growth:manage`, `tier2:vouch`, `self:update`.
- Ek bug bhi pakda: ek hi phone par do sponsor alag-alag request bana sakte the (pehle "OPEN" window me rukta tha, ab request seedhe INVITED hoti hai) — ab OPEN **ya** INVITED request hone par dusri request 409.
- Tests: `tests/v18-sponsor-id.test.ts` (17 tests: Verhoeff / PAN / sponsor-eligibility, sponsor se entry, poora Aadhaar kabhi wapas nahi aata, ID-tick ke bina approve nahi, Tier 2 sponsor nahi bana sakta, sponsor suspend hone par sign-up nahi, PAN-unique (dono route), admin / sponsor / member views + masking, strike, my-id (consent / checksum / PAN clash / tick reset), pending member ID jod sakta hai, erasure). Purane `v15`, `v16-8`, `api-access-control`, `role-audit` naye niyam par update.

## 6. Sach-sach: yeh kya karta hai aur kya NAHI
- **Karta hai:** bina-RERA log ek zimmedaar, pehchaane hue RERA broker ke peeche judte hain; GENZ ko poora record milta hai; farzi / galat Aadhaar number aur ek-PAN-se-do-account turant pakde jaate hain; admin ne asli card dekhe bina Tier 2 approve nahi hota.
- **NAHI karta:** Aadhaar number *asli hai ya kisi aur ka* — iska pakka saboot UIDAI se hi mil sakta hai (offline: admin card + chehra dekhta hai). Checksum sirf typing / farzi number pakadta hai. Isliye asli rok = **sponsor ki zimmedari (strike) + ek PAN ek account + admin ka card dekhna**, number ki jaanch nahi.
- **Poora Aadhaar kyun store nahi karte:** Aadhaar Act / UIDAI niyam private company ko poora number rakhne par bahut pabandi lagate hain (Aadhaar Data Vault jaisi shartein), aur private platform par Aadhaar ko *zabardasti* maangna kanoonan patla hai (Puttaswamy). Aakhri 4 ank + sahmati + admin ka "dekha" tick sabse surakshit raasta hai. **Launch se pehle apne vakil se ek baar confirm karwa lein** (wording `AADHAAR_NOTE` aur join screen par).
- **Real-time UIDAI / NSDL verification** (number sach me us naam ka hai) — paid API chahiye; abhi nahi liya (aapka "koi paid integration nahi" niyam).

## 7. Jaan-boojhkar nahi kiya / aage
- Sponsor ko **2 karna** ho to `SPONSORS_NEEDED = 2` (ek line); screen par "Co-sponsor" button pehle se maujood hai.
- Tier 1 (RERA wale) ke liye ID-tick zaroori nahi kiya (unka RERA no. public portal par check hota hai) — tick lagana optional hai. Chaho to uska gate ek `if` me lag sakta hai.
- Purane verified brokers ko Aadhaar dene ke liye majboor nahi kiya; admin overview me "ID coverage" (PAN a/b · Aadhaar c/b · dekhi d/b) dikhta hai, aap tay karein kab zaroori karna hai.
- Aadhaar ka *duplicate* (ek hi Aadhaar do account) abhi nahi pakda jaata — uske liye number ka hash rakhna padega, jo legal risk badhata hai. PAN-unique se kaam chalta hai.

## 8. Pehle se pending faisle (is version se alag)
TDS 5% vs 2% · milestone-wise payment · buyer "I'm interested" · OCR · volume backup · altPhone · non-RERA FULL launch mode · Virtual Tour (app store ke baad) · Master-CP / monetization ka model · Pulse ka shehar-wise / builder-wise tod.
