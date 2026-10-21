
## v13 — Visit QR
Partner pass banata hai, builder-side scan karta hai (maker ≠ checker), single-use, time-boxed, audit-logged, project rule `QR_REQUIRED`, camera + photo + code fallback. Dekhiye `docs/V13_VISIT_QR.md`.

## v14
Deal Desk: offers+token, listing lifecycle, site poster, retention, deal timeline. See V14_MARKET.md

## v15
Tiers, vouching, tie-ups, builder channel + GENZ desk, trust profile. See V15_NETWORK.md

## v16
CRM controls (consent/opt-out, two-side money, partial collections + reversal, payout ledger, TDS, protection extension, cancellation + clawback, retention), workflow (follow-up edit/snooze, lost codes, feedback, temperature/tags, CSV import/export, bulk, filters, WhatsApp templates) and reports. See V16_CRM.md


## v16.1
Contractor privacy and dashboard fixes: see `docs/V16_1_CONTRACTOR_FIXES.md`.

## v16.2
Connector Desk boxes are clickable: see `docs/V16_2_DESK_TILES.md`.

## v16.3
Dev-server reload fix (Today & Clients bouncing to Dashboard): see `docs/V16_3_TAB_RELOAD_FIX.md`.

## v16.4
Every role audited in a real browser (click-through, phone width, Hindi), an API sweep per role and a data-leak sweep; what was found and fixed: see `docs/V16_4_ROLE_AUDIT.md`.

## v16.5
Har screen ko "kya yeh sach dikha raha hai?" nazar se dekha: galat daave, banaya hua data, privacy leaks aur bache hue English-first screens (Deal Room, Due Diligence, Control Center, activity feed, status chips): see `docs/V16_5_HONESTY_AUDIT.md`.

## v16.6
Property Papers: owner / broker ke asli kaagaz (PDF / photo) GENZ server par store, app ke andar English + Hindi search, naam se share, har open ka log, asli delete, Due Diligence se jod, DPDP erasure me file bhi hatna: see `docs/V16_6_PROPERTY_PAPERS.md`.

## v16.7
Sales Desk: lead ka source (15 tarike + detail), customer ki jaankari ka card, telecaller ki call log + "aaj kise call karna hai" list, lead ko agle executive / coordinator ko forward (note + history), booking request me booking amount (kaise diya, UTR) + payment condition (plan, loan, kistein, shartein), builder ka "paisa aaya ya nahi" confirm, builder-desk ki apni bikri (bina brokerage): see `docs/V16_7_SALES_DESK.md`.

## v16.8
Inventory Desk: Reassign Task ki dropdown ab sirf deal ke asli log (employee dikhte hain, network ke bahar wale nahi); plot / flat ki detail (kitni taraf sadak, disha, size, tags), builder ka rate control (ek ya bahut saare plots, preview ke saath, ±40% limit, hold / book lock, history), "kise dikhe" (sab / chune partner / sirf main + rate chhupao), partner ki team ke liye unit-access aur team board (rate / features per post), customer ko link / WhatsApp (rate / features on-off), sheet paste import, clickable filters, aur GENZ Launch Desk (builder ki haan ke baad badi RERA firms → independent → local ko sirf jhalak): see `docs/V16_8_INVENTORY_DESK.md`.

## v16.9
Money Trail: paisa stage-wise — CP ka team member collect karta hai → CP confirm → CP builder ko saunpta hai → builder ka authorised accounts wala confirm; har waqt dikhta hai ki paisa **abhi kiske paas hai** (4 clickable tiles, stepper, history, booking card par "raaste me" strip). GENZ paisa nahi chhuta — har stage record hota hai aur agla insaan confirm karta hai; ledger / brokerage sirf builder ke aakhri confirm par badhte hain. Employee ke do naye switch (record / authorised-confirm, default OFF), purane direct routes trail chalte waqt band, reject / cancel par trail auto-cancel, 4 alerts: see `docs/V16_9_MONEY_TRAIL.md`.

## v17
Network Pulse (superadmin, Control Center ke upar): aaj / kal / 7 / 30 din me kitne log aur brokers aaye, kitne ne kaam kiya, naye sign-up, network ki approved bookings aur bikri ki rakam, asal vasooli, raaste me paisa (Money Trail se), live projects, intezaar me bookings, builder ki apni bikri (alag); roz ke 30-din chart + table; har tile clickable (list: naam / bhoomika / shehar — phone aur grahak kabhi nahi). Daily record sirf user-id + tareekh, 180 din me erase. See `docs/V17_NETWORK_PULSE.md`.

## v17
Network Pulse: superadmin Control Center ke upar — roz kitne log / broker aaye aur kaam kiya, network ki bookings, bikri ki rakam, vasooli, raaste me paisa, live projects; 30 din ke chart, har tile clickable. Phone / PAN / customer ka naam kabhi nahi, 180 din me daily record erase: see `docs/V17_NETWORK_PULSE.md`.

## v18
RERA Sponsor + ID: bina-RERA broker sirf RERA-registered (Tier 1) sponsor ke zariye judta hai (ek sponsor kaafi, Tier 2 sponsor nahi ban sakta), GENZ ko "kisne kisko register kiya" (admin: sponsor-wise list + 7 clickable tiles; sponsor: apne log; member: apna sponsor), har naye broker ka PAN (ek PAN = ek account) + Aadhaar (checksum, sirf aakhri 4 ank store), admin ka "ID dekha" tick Tier 2 approve karne se pehle, sponsor ko strike: see `docs/V18_RERA_SPONSOR_ID.md`.

## v19
ID Review: "Save" grey kyun tha ab seedha dikhta hai (PAN ka 4th akshar / Aadhaar checksum ka kaaran hi+en, "Save karne ke liye" checklist); PAN card + MASKED Aadhaar ki copy sponsor (invite ke waqt aur baad me), naya member (signup par) aur member (baad me) upload kar sakte hain; sponsor ki bhari details (naam, firm, PAN, Aadhaar last-4, copies) signup par prefilled; admin + superadmin ke liye naya **ID Review** tab (6 clickable tiles, badge, search, detail me copy dekhna — har open audit me, "ID fine / Ask again / Problem", assign / bulk-assign / default reviewer); aur **auto-verify switch** (default OFF): RERA-registered, verified, strike-free sponsor ke refer kiye log signup par VERIFIED, ID-check task + notification tab tak khula jab tak koi reviewer band na kare. Copies 90 din baad (orphan 14 din) delete, reject / withdraw / DPDP erasure par turant: see `docs/V19_ID_REVIEW.md`.

## v20
Scale + kamaai: "ek saal" jitne data (10k users, 40k listings, 3 lakh audit lines) par har role ka har endpoint naapa aur theek kiya — server jam karne wale (people list ka trust score, match matrix, audit trail, CRM reports, team, digest) ab 0.1–0.4 s; **Postgres par v17 se save fail hone wala critical bug theek** (activity record me id); Postgres save tukdon me + batch; app ka pehla download 2.3 MB → 0.4 MB (screens on-demand), listings / buyer needs "meri + nayi" se shuru aur baaki server search, people list chhota card + ETag; tooti screen poori app nahi girati, phone crash report, System health; audit chain ab chupchap re-seal nahi hota; dusre broker ke client sirf initials. Superadmin ka naya **Revenue & Growth** tab: Master-CP bahi (builder → GENZ → broker, paisa app ke bahar), Growth & value (active brokers, cohort retention, k-factor, take rate, CSV), Builder pitch (network-strength ka expire hone wala link), System health; broker ko "GENZ projects se meri kamaai": see `docs/V20_SCALE_REVENUE.md`.

## v21
Deal Room Privacy: GENZ admin ko broker-to-broker deal ki sirf **deal value + dashboard totals** (kul deal value, kul brokerage tay, kul commission exchange) dikhte hain; chat / notes / commission terms / docs / tasks / timeline tabhi khulte hain jab us deal par dispute open ho ya GENZ khud deal me party ho (har khulna audit me, brokers ko dikhta hai). Commission payment brokers khud likhte hain, doosra broker confirm / reject karta hai, "payment nahi mili" asli dispute banata hai; GENZ paisa record nahi karta. Naye deal room me GENZ desk nahi: see `docs/V21_DEAL_ROOM_PRIVACY.md`.

## v22
Legal Help: broker deal room ke **Legal Help** tab se madad maangta hai — **state property se apne aap bhar jaata hai**, madad ka prakaar chunne par screen batati hai kaunse kaagaz aur kaunsi detail share karni hai (aur kya kabhi nahi). Us state ke GENZ counsellors ko request dikhti hai (naam / deal room / papers ke bina), **pehle aao pehle pao** se ek counsellor leta hai, fee batata hai, broker accept / decline karta hai. Accept par phone khulte hain, chune papers sirf-dekhne ke liye share hote hain (case complete par band). GENZ ki kamaai: **fixed platform fee per case + membership** (vakil ki fee ka hissa nahi), paisa app ke bahar — counsellor UTR likhta hai, admin confirm karta hai; rate sirf superadmin badalta hai, counsellor sirf dekhta hai. Counsellor ke bypass ki report par admin strike deta hai (deal room nahi khulta), 2 strike par panel se bahar: see `docs/V22_LEGAL_HELP.md`.

## v23
Plans & Fees: admin aur superadmin GENZ ki har fee aur membership khud tay karte hain — **legal case accept** (counsellor), **network broker se booking** (builder; master-CP project par nahi), **broker-to-broker deal commission** (paane wala broker); har ek **flat ₹ ya %** (min / max), group-wise (builder, badi RERA firm, independent RERA broker, local associate, counsellor, contractor), state-wise, chune logon par ya unhe chhod kar, aage ki tareekh se (kabhi retroactive nahi; charge event par freeze). **Membership plans**: monthly / yearly price, har fee par member rate (free / flat / % / % chhoot) aur **member-only features** (legal case lena, legal help maangna, Launch Desk me pehle mauka) — gates default OFF. Payer ko "GENZ Membership" tab me saaf dikhta hai kya lagu hai; UTR likhta hai, admin confirm / reject / waive karta hai; free membership dena / khatam karna; fee calculator. Risky choices (counsellor fee par %, brokers par fee, deal par %) par warning maanni padti hai. v22 ki legal fee / membership isi me aa gayi: see `docs/V23_PLANS_FEES.md`.

## v24
Photo se PDF: har document upload (Property Papers, Due Diligence evidence, PAN / masked Aadhaar copy) par "pages ki photo kheench kar ek PDF banao" — camera / gallery, page ghumana / aage-peeche / hatana, "clean document look", A4, naam (Hindi bhi), jagah ki size limit me apne aap fit. PDF phone par banti hai, koi naya library nahi (khud ka chhota PDF writer, qpdf se jaancha). Protected Docs me camera button. OCR abhi nahi: see `docs/V24_SCAN_TO_PDF.md`.
