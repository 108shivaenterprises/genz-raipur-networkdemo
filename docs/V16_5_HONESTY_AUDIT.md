# v16.5 — "Jo app dikhata hai, wahi sach ho" (honesty + Hindi audit)

**Kyun.** "Har role ko detail mai check karo, kuch miss to nahi ho raha — jab tak app perfect na ho jaye, reverify karte raho." Is round me har screen ko is nazar se dekha gaya: *kya yeh screen kuch aisa dikha raha hai jo asal me hua hi nahi, ya kuch aisa daava kar raha hai jo GENZ kar hi nahi sakta?* Saath me Hindi me bache hue English-first screens pure kiye gaye. Har fix ke baad browser crawl (har role, Hindi mode, har tab) aur tests dobara chalaye gaye.

GENZ ke niyam jo is round me bhi nahi toote: free for everyone · GENZ kabhi paisa handle nahi karta (sirf record karta hai aur doosri side se confirm karwata hai) · bilingual hi+en · DPDP (consent, phone nahi dikhana, audit log) · neutral platform · sirf points-based incentives.

## 1. Galat daave (over-claims) hataye gaye

| Jagah | Pehle kya likha tha | Ab |
|---|---|---|
| Deal Room, Disputes, Modals | "escrow", "secure vault of funds", "Arbitration / Mediation Tribunal", "Tribunal Ruling" | "Dispute Review Desk / Admin decision" — GENZ kisi ko tribunal ya escrow nahi hai (Legal pages me yeh saaf likha hai) |
| Anti-bypass tab | "RERA Section 11/34", "Official RERA Covenant", "100% legally payable", "legally covenant", "Dual-OTP", "immutably logged", "blacklisting aur expedited arbitration", "Encrypted chat" | Sach wali bhasha: platform ke 30-din anti-bypass niyam, hash-chained audit log, admin review |
| Default clauses (server + seed) | "100% token refund to buyer", "Arbitration and Conciliation Act 1996", "GenZ Arbitration Committee" | Neutral: "Cancellation and refund terms are as agreed in writing between the parties. GENZ does not hold, refund or move any money." aur "A dispute on the platform is first reviewed by a GENZ admin under the platform rules. This does not replace any legal remedy available to the parties." |
| e-sign | Client ke bheje `AADHAAR_ESIGN` / `DSC` ko server maan leta tha | Hamesha `COMPLIANT_E_SIGN_PKEY` ("digital approval recorded"); modal me likha hai "yeh Aadhaar e-Sign nahi hai" |
| Network tier | "RERA Verified" | "RERA no. on file / RERA नंबर दर्ज" — GENZ registry se match nahi karta |
| Builder card | `reraNumber \|\| 'CGRERA Verified'` | `'—'` |
| TDS line | "Section 194H" | "TDS rate on this share (as set for the project — confirm with your CA)" |
| Dispute resolve | Default notes me tribunal jaisi bhasha | "Reviewed and closed by a GENZ admin." |

## 2. Banaya hua (invented) data hataya gaya

- **Fake call number** `+91 98261 44002` aur poora "Voice / HD video call" simulator (jo "encrypted video call" ka daava karta tha) **hata diya**. Ab `tel:` link sirf tab, jab doosre broker ka asli phone ho; warna likha aata hai "GENZ par phone number share nahi hota — yahin chat karein".
- **Demo prefills**: ₹5,70,000 default fee, 50/50 split, `signerNotes = "Terms approved"`, fake reasons, "_Evidence.pdf", `/docs/task_evidence.pdf`. Ab form khali / asli deal ke numbers se bharta hai. Propose modal me fee `currentAgreement → deal ka expected fee` se aati hai.
- **Fake vault**: file size (1.5 MB / 2.1 MB / 35 MB) aur SHA lines hata di; unsplash fallback hata diya. `SecureDocumentUploadModal` ab file ka **asli SHA-256 browser me** nikalta hai. Upload modal me likha hai: "GENZ sirf link store karta hai".
- **DD evidence**: koi banaya hua number / issuer / size / fingerprint nahi; hash validate hota hai.
- **Fake stats / "/ 13 tasks"**: ab `tasks.length` jaise asli counts.
- **Stock photos**: photo-less property ko `images: []`; builder project me invented images / amenities / unit configs / `priceMax = ×2.5` nahi (default `priceMax = priceStartingFrom`).
- **Signer IP** UI se hata diya.

## 3. Asli bugs

| Bug | Asar | Fix |
|---|---|---|
| Vault grant: deal room ke bahar har grant seed broker `USR-BRK-002` ko jaata tha, `VERIFIED_GROUP` 400 deta tha | Galat insaan ko access / grant fail | Grant modal ke teen saaf options: deal room ke sab · sirf doosra broker · sabhi verified members (`VERIFIED_ALL`). Free-text naam hata diya |
| `permissionLevel: 'PREVIEW'` server ignore karta tha | "Sirf preview" choose karne par bhi full access | `PREVIEW` ab rakha jaata hai |
| TDS `0` ko `\|\| 5` se 5 bana diya jaata tha; seed me bhi hard-coded 5 | 0% TDS wale project par galat katauti | `0` rakha jaata hai; rate na bheje to platform default; naya agreement pichle agreement ka TDS carry karta hai |
| "Dispute file karo" form | Hard-coded counterparty ("Sunil Lalwani" / `USR-OWNER-001`), pehle se likhi hui ilzaam wali description, nakli evidence link `/evidence/signed_mandate_otp_log.pdf`, aur "tribunal review" ka message — kisi ke bhi naam par dispute ban sakta tha | Counterparty us deal ke participants me se (ya directory se) chunna padta hai; description khali, kam se kam 15 akshar; evidence sirf asli link; message "admin review" |
| Construction lead | Customer ki consent ke bina ban jaati thi | `customerConsent` na ho to 400, ho to `customerConsentAt` store hota hai (DPDP) |
| DD me `INFORMATIONAL` issue | Form ka option server reject karta tha | Accept |

## 4. Privacy (DPDP)

- Deal detail me dono co-brokers ka phone **sirf** un dono aur admin ko. Owner, legal counsel, team members ko nahi.
- Agreement me **doosre signer ka e-mail aur IP** non-admin ko nahi jaata (`shapeAgreementFor`) — GET, propose, approve aur settle-payment sab replies me.
- Construction lead: customer ki consent ke bina nahi banti.

## 5. Hindi coverage

- **Deal Room** poora (har sub-tab, form, modal, error) + **Due Diligence**. Server ke 13 task aur 26 DD items (title / description / required document / acceptable evidence), default payment milestones aur 4 default clauses ke liye `src/lib/templateHi.ts` (122 lines) — test fail hota hai agar koi template line ka Hindi na ho.
- **Control Center**: 116 permission descriptions ka Hindi (`src/lib/permHi.ts`) — test fail hota hai agar naya permission bina Hindi ke aaye. Role naam bhi Hindi.
- **Activity feed** (dashboard): server English me likhta hai; client `src/lib/activityHi.ts` se Hindi padhta hai (naam / property / rupaye jaise ke taise).
- Common **status chips** (ACTIVE, PROPOSED, REQUESTED, OPEN, ACK, INVITED …) ab `label('status', …)` se Hindi; project type / stage; connector ke shop / referral types; Team greeting; CRM "via …"; Legal dashboard severity.
- Pehle ke segments me: Modals, BrokerSafetyModal, EditPropertyModal, PropertiesView, BuilderLaunchpadView, SecureDocumentUploadModal, SiteVisitQrPassModal, PublicBrokerQrModal.

## 6. Kaise verify kiya
- Har demo role (Super Admin, Admin, Broker ×2, Owner, Buyer, Contractor, Builder, Legal, Connector, Team) ka **Hindi mode me har tab** browser me khola; bacha hua English line-by-line dekha. Ab jo English bacha hai wo sirf **data** hai: log ke naam, project / property ke titles, seed descriptions, chat messages, audit ka raw event text.
- `journeys.cjs` (buyer requirement, owner property, legal issue, broker flows): **ALL PASSED**, koi 403 / 5xx / script error nahi.
- `tests/v16-5-audit.test.ts` (14 tests): banned strings (escrow / tribunal / stock photo / fake phone) UI me nahi; phone visibility; TDS 0; signer email / IP; e-sign authMethod; vault grants; vault size 0; DD evidence; consent; template + permission Hindi completeness; activity-feed Hindi.
- Poora suite: **339 passed, 1 skipped**. `tsc --noEmit` aur `npm run build` clean.

## 7. Jo yeh round nahi kar sakta (seedhi baat)
- **"Perfect" saabit nahi ho sakta.** Jo kaha ja sakta hai: har role ka har tab dekha gaya, aur jo mila wo theek kiya gaya.
- **User ka likha / server ka data English hi rahega** (naam, chat, property description, seed notes). Inhe auto-translate karna galat ho sakta hai, isliye nahi kiya.
- **Vault / DD "documents" files nahi, sirf links + hash record karte hain.** Asli file storage (S3 / disk, size limits, DPDP deletion, cost) ek bada faisla hai — aap bataiye to alag version me.
- **TDS default 5% hai.** Hamari jaankari ke hisaab se 1 Apr 2026 se brokerage par TDS 2% (s.393(1), ₹20,000 threshold) hai. Maine default **chupke se nahi badla** — `DEFAULT_TDS_PCT` (`src/shared/crmRules.ts`) ek line ka change hai, builder project-wise set kar sakta hai. Apne CA se confirm karke bataiye.
- **Default payment milestones 20 / 30 / 50 fixed hain**, UI me editor nahi hai.
- **Legal Counsel sabhi deals dekh sakta hai** (design se — advocates ka panel hai).
- **Buyer "I'm interested" nahi daba sakta** — need post karta hai aur match milte hain (kaunse broker ko enquiry jaaye, iska neutral rule chahiye).
- DealDesk ka print HTML English hi hai.
