# V106 — Cost sheet (har unit ki kitni asli lagat) + tracked customer link

## 0. Kyun
sell.do ke ad mein "cost sheet" ek feature tha jo hamare paas **nahi tha** (audit mein pakda gaya). Hamare paas sirf Deal Desk ka browser-only calculator tha — builder ke tay kiye hue PLC / parking / payment plan ka kuch nahi, aur customer ko bhejne layak page nahi. Ab hai.

## 1. Kaise chalta hai
| Kaun | Kya karta hai |
|---|---|
| **Builder** (project ke Inventory mein "Cost sheet — PLC, parking, GST…" card) | Ek baar tay karta hai: GST %, stamp duty %, registration %, extra charges (PLC, parking, club, maintenance deposit… ≤12), har charge ₹/sq ft ya fixed, "GST lagta hai?" haan/nahi, "customer gintee chunta hai" (parking 0/1/2), payment steps (name, %, booking ke kitne din baad; total **100%**), sheet kitne din valid (1–90), har sheet par ek line. Neeche ek **sample unit** par turant dikhta hai ki sheet kaisi banegi. |
| **Builder, ek unit ke liye** | "Edit unit" mein us unit ka apna **PLC ₹/sq ft** (corner / park-facing). Khali = project ka PLC. |
| **Partner / uska staff / builder** (unit drawer → "Cost sheet") | Parking +/− chunta hai, live figures dekhta hai (dark "all-in" panel + breakdown + payment bar), customer (apni lead) chunta hai, language, apni ek line → "Make the customer's sheet" → **WhatsApp / link copy / message copy / Open**. |
| **Customer** | `/s/<token>` par login ke bina chhapne layak page: kimat, har charge, GST, "builder ko kul देय", stamp + registration (anumaan), **all-in**, payment schedule (₹ mein), validity, sender ka contact card. Print / PDF button. |
| **Sender** | "Cost sheets I sent" card: kitni baar khuli, kab tak valid, **Withdraw**. Lead ki timeline mein 2 line: "Cost sheet … made" aur (pehli baar khulne par) "Customer opened the cost sheet". |

## 2. Hisaab (exact)
- `agreementValue = kimat + wo charges jin par GST lagta hai`
- `GST = agreementValue × GST%` · `stamp = agreementValue × stamp%` · `registration = agreementValue × reg%`
- `payable (builder ko) = kimat + saare charges + GST` · `all-in = payable + stamp + registration`
- **Payment schedule** `kimat + GST-wale charges + GST` par chalta hai (refundable deposit aur sarkari fees alag bharte hain); **aakhri step rounding le leta hai**, isliye jod hamesha barabar (40 random unit par test).
- Per-sq-ft charge ke liye unit ka **area** chahiye. Area na ho to sheet **banne se mana** (409) — charge chupke se chhoot kar customer ko kam lagat dikhaye, ye nahi hone dete.
- ₹0 wali line print nahi hoti.

## 3. Niyam jo sach mein lagte hain
1. **Builder ne charges tay nahi kiye → koi sheet nahi** (partner ya khud builder bhi nahi). Partner kuch aisa na bheje jo builder ne kabhi manjoor nahi kiya.
2. Jis partner/staff ka **rate chhupa hai** wo sheet bana hi nahi sakta (403) — chhupa rate sheet ke raaste leak nahi hota. Unit ya project par rate/visibility chhupi ho, to bhi.
3. Mandate nahi / doosre builder ka / admin / jis staff ko boss ne "customer link" ki ijazat nahi di → mana.
4. **Figures jam jaate hain** (snapshot): baad mein builder GST ya rate badle to **pehle bheji sheet nahi badalti**; nayi sheet nayi figures se banti hai.
5. **Validity ke baad** page par ek bhi number nahi — sirf "sheet purani ho gayi, nayi maangein".
6. Unit baad mein bik/reserve ho gayi → page chalta hai par peela warning "bik chuki ho sakti hai — sender se pakka karein". Nayi sheet us unit ki bani nahi sakti.
7. Page tab bhi band (404) jab sender ka rate-access/partnership khatam ya sender ne **withdraw** kiya. Boss apne staff ki sheet withdraw kar sakta hai.
8. Page par **commission / brokerage / mandate** ka ek shabd nahi; customer ki phone/email nahi.
9. Link-preview bots (WhatsApp, Facebook…) "khuli" mein nahi gine jaate.

## 4. Kya GENZ nahi karta (seedhi baat)
- GST / stamp / registration ki **dar GENZ tay nahi karta** — builder apne CA / sub-registrar se pakki karke likhta hai; har sheet par likha hai "anumaan, ऑफ़र/एग्रीमेंट नहीं". Registration ki asli rakam sub-registrar ke valuation (circle rate) se alag ho sakti hai.
- Paisa/payment koi nahi — sirf sheet.
- Cost sheet **PDF file server nahi banata**; customer page se browser ka Print → "Save as PDF" karta hai.

## 5. Code
- `src/shared/costSheetRules.ts` — `computeCostSheet`, `skippedCharges`, `chargesError`, `cleanCharges`, `DEFAULT_CHARGES`, `sheetExpired`.
- `server/db.ts` — `BuilderProject.charges`, `InventoryUnit.plcPerSqft`, `ShareLink.kind 'COSTSHEET'` + `sheet` snapshot + `leadId`.
- `server/inventory.ts` — `PUT /api/inventory/projects/:id/charges`; unit `plcPerSqft`; project GET mein `charges` (sirf builder) + `chargesSet`.
- `server/inventory2.ts` — `/api/invdesk/cost-sheets` (`/preview`, create, list, `/:token/revoke`).
- `server/costsheetPage.ts` + `server/share.ts` — customer page, `/s/print.js`, `countView` (ab alag function), Share Kit list mein "Cost sheet · …".
- `src/components/CostSheetPanel.tsx` (ChargesSheet, UnitCostSheet, CostSheetsCard, ScheduleBar) + InventoryPanel / InventorySheets mein buttons.

## 6. Tests
`tests/v106-cost-sheet.test.ts` — 27: math (exact jod, optional qty clamp, unit PLC, area-nahi, validation, defaults), customer page (live vs expired, Hindi, escape), server (charges se pehle 409, sirf builder save, partner ko `charges` object nahi, per-unit PLC, hidden-rate 403, staff policy, no-area 409, link + page + lead lines, bots, print.js, **freeze**, input checks, lists, sender-ka-haq-khatam 404, unit bik gayi warning, withdraw, builder ki khud ki sheet). Guard hata kar chalaya to 12 fail hue — tests sach mein pakadte hain.

## 7. Seemayein
1. Parking jaise "optional" charges max 4 tak; ek unit par ek hi PLC line (id `plc`).
2. Sheet unit ki **ek hi** hoti hai (do unit ek page par nahi).
3. Hindi page par charges ke naam wahi rehte hain jo builder ne likhe (auto-translate nahi).
4. "Customer ne dekha" = page khula; padha ya nahi, ye nahi pata (sirf `plans` section ka time track hota hai).
5. Purane (V106 se pehle ke) projects par charges **unset** hain — builder ko ek baar tay karna padega.
