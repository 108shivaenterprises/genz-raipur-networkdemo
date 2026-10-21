# v16.9 — Money Trail: paisa stage-wise confirm hota hai, aur dikhta hai ki **abhi kiske paas hai**

**Kyun.** Krishna ki maang: *"amount confirmation stagewise aaye — jaise CP ki team member ne collect kiya, fir CP confirm kare, fir builder ke paas aur authorised accounts wala update kare / confirm kare, aur kiske paas payment hai yeh dikhe."*

GENZ ke niyam jo yahan bhi nahi toote: **GENZ paisa kabhi handle nahi karta** (har stage sirf **record** hota hai, aur **agla insaan confirm** karta hai) · free for everyone · hi+en · employee ko brokerage / agreement value / payout nahi dikhta · har step audit log me · koi naya heavy dependency nahi.

---

## 1. Chain
```
customer ─▶ collector ─▶ CP confirm ─▶ CP builder ko handover ─▶ builder ka authorised aadmi confirm
            (CP ka team    (CP ya uska      (kaise: cash / cheque /      (owner ya "paisa confirm kar
             member)        authorised)       UTR ke saath)                sakta hai" wala accounts staff)
```
- Har payment (booking amount ya koi bhi kisht) ek **trail** hai: `TR-…`.
- **Ledger (booking ki vasooli) sirf aakhri step par badalti hai** — jab builder side confirm kare ki paisa pahuncha. Isliye **brokerage tabhi payable banti hai** (pehle se chalne wala pro-rata rule, koi naya rule nahi).
- **Kisi ka apna liya hua paisa wo khud confirm nahi kar sakta.**
- Builder ke **apne** log (builder staff / owner) collect karein to beech ke do stage (CP confirm, handover) nahi hote: collect → builder side confirm (confirm karne wala **doosra** aadmi).
- CP **khud** collect kare (owner) to wo seedha "mere paas" se shuru hota hai (CP-confirm ki zaroorat nahi — wahi to CP hai).

## 2. "Paisa kiske paas hai" — har waqt
| Stage | Holder |
|---|---|
| Collector ne record kiya | **Collector** (naam ke saath) |
| CP ne "mujhe mil gaya" kaha | **CP** |
| CP ne builder ko saunpa | **Builder — confirm baaki** |
| Builder ne confirm kiya | **Builder — confirmed** (ledger me juda) |
| CP: "mujhe nahi mila" | wapas **collector** (vivaad) |
| Builder: "nahi pahuncha" | aakhri insaan jisne paana confirm kiya tha (CP) |
- Money tab ke upar **4 clickable tile**: *Team member ke paas · Partner ke paas · Builder ko saunpa · Builder ne maana* — har tile me ₹ aur entries; tile dabao to list us holder tak filter.
- Har entry me **stepper** (✓ Collected → ✓ Partner ne maana → ③ Builder ko saunpa → ④ Builder ne maana), har step ke neeche **kisne, kab**, aur chalu step par "kiski pratiksha". Atka hua step **laal ✕**.
- Har entry me **"Money is with: <naam> · <bhoomika>"** badge aur **History** (har step: kisne, kab, cheque/UTR, note).
- Booking card par **"₹X raaste me · team member ke paas · partner ke paas"** strip — dabao to Money tab us booking par khulta hai.

## 3. Kaun kya kar sakta hai
| Kaun | Kya |
|---|---|
| **CP / Partner (owner)** | khud collect; team ka paisa confirm; builder ko handover; (cancel — handover se pehle) |
| **CP ka employee** | collect (agar switch ON); confirm + handover (sirf agar "authorised" switch ON) |
| **Builder (owner)** | collect; confirm / "nahi mila"; kabhi bhi cancel |
| **Builder ka employee** | collect (switch ON); confirm (sirf "authorised accounts" switch ON) |
| **Admin** | sirf dekh sakta hai (read-only) |
- **Employee ke 2 naye switch** (My Team → Team Control, dono **default OFF**): *"Paisa record kar sakta"* aur *"Authorised — paisa confirm kar sakta"*. Naye permissions: `crm:money_collect`, `crm:money_confirm` (Hindi line sahit).
- Employee sirf **usi grahak** par paisa record kar sakta hai jis par wo kaam karta hai (lead uska / request uski) — ya employer ke sab bookings par agar wo **authorised (confirm)** wala hai.
- Employee ko **sirf trail rows** milti hain (grahak, unit, rakam, stage) — **brokerage, agreement value, payout, TDS kabhi nahi**. Collector ko sirf apni; authorised ko employer ki sab.
- Builder ko "jaldi confirm" (handover se pehle) karna ho (jaise grahak ne seedha builder ko de diya) to **kaaran likhna zaroori**. "Nahi mila" ke liye bhi hamesha kaaran.

## 4. Safety
- **Double count nahi**: ek target par ek hi trail ghoom sakta hai (booking amount); kisht par jo rakam chal rahi hai wo "reserved" — baaki hi record ho sakti hai. Confirm ke waqt dobara check: kisht me utna pending hona chahiye.
- **Puraane seedhe routes** (booking amount "mujhe mil gaya", kisht "receive", approve ke saath tick) jab tak us target par trail chal raha ho → **409** ("Money Trail me confirm / cancel karein") — isliye same paisa do tareeke se nahi judta. Screen par bhi wo buttons hat jaate hain aur "Money tab me confirm karein" ka note dikhta hai.
- **Booking reject / cancel** → us booking ke saare chalu trail **apne aap cancel**, note: *"paisa grahak ko lautana hai"*. Reject / cancel hui booking par naya paisa record nahi hota.
- **Naya paisa record**: cheque / UPI / NEFT me **cheque no. / UTR zaroori** (agla insaan milaane ke liye); **cash** me optional. Tareekh future ki nahi.
- **Builder ki rasid**: confirm karte waqt builder apni **receipt no.** daal sakta hai — wahi ledger me receipt ref banta hai; har ledger receipt par `trailId` jaata hai (kaun se trail se aaya).
- Sab **audit**: `MONEY_TRAIL_COLLECTED / CP_CONFIRMED / DISPUTED / HANDED_OVER / BUILDER_CONFIRMED / NOT_RECEIVED / CANCELLED`, lead ki timeline me bhi ek line.

## 5. Alerts (CRM ke upar wali patti, clickable → Money tab)
- **Team member ne paisa liya, aapke confirm ki pratiksha** (1+ din)
- **Aapko saunpa gaya paisa — pahunchne par confirm karein** (builder ke liye, 2+ din)
- **Builder ko saunpa, builder ne abhi confirm nahi kiya** (partner ke liye, 2+ din)
- **"Nahi mila" wali entries — suljhayein** (vivaad / not received)

## 6. Technical
- Shared pure rules: `src/shared/moneyTrail.ts` (holder, actions, stepper, validation, close-on-cancel) — server, browser aur tests teeno wahi use karte hain.
- Server: `server/crm4.ts` mounted `/api/crm/money` — `GET /trails`, `GET /collectables`, `POST /trails`, `POST /trails/:id/{cp-confirm,handover,builder-confirm,cancel}`. Data `booking.trails[]` (JSON state; Postgres me bhi wahi booking JSON).
- UI: `src/components/MoneyTrail.tsx` (`MoneyPanel`, `MoneyStrip`), CRM me **Money** tab (employee ko sirf tab jab switch ON), `TeamControl` me do toggle.
- Tests: `tests/v16-9-money-trail.test.ts` (24 tests: pure rules + poori chain HTTP par).

## 7. Jo jaan-boojhkar nahi kiya / aage
- **Customer ko receipt PDF** abhi nahi (builder ki receipt no. record hoti hai).
- Booking amount ka trail **exact claimed amount** hi leta hai; alag rakam aaye to builder "nahi mila" / cancel karke sahi rakam se naya entry karwaye.
- Ek kisht par partially-confirmed + partially-pending kai trail chal sakte hain; sab ka total pending se zyada nahi ho sakta.
- Notification / push nahi — alerts patti aur Money tab hi.

## 8. Pehle se pending faisle (is version se alag)
TDS 5% vs 2% · milestone-wise payment · buyer "I'm interested" · OCR · volume backup · altPhone · non-RERA FULL launch mode.
