# v21 — Deal Room Privacy + Brokers ka apna Payment Record

## Rule (Krishna ka)
GENZ admin / superadmin broker-to-broker deal room ke **andar** nahi jhaankta. Dikhta hai sirf:
- deal hui, **deal value**, kis stage par;
- dashboard ke total: kitni deal, kul deal value, kul brokerage tay hui, kul commission asal me exchange hui.

Poora deal room (chat, notes, commission terms, documents, tasks, visit feedback, timeline) tab khulta hai jab:
1. us deal room par koi **dispute open** ho (OPEN / UNDER_REVIEW / MEDIATION), ya
2. GENZ khud deal me party ho (admin account hi broker / owner hai).

Dispute resolve / dismiss hote hi room GENZ ke liye dobara band.

## Kaise kaam karta hai
- Server har deal endpoint par `loadDealFor` se jaanchta hai; band room par `403` + code `DEAL_SUMMARY_ONLY`.
- Summary me grahak ka naam sirf initials, broker ke phone nahi, brokerage / split / notes 0 / khaali.
- Jab GENZ dispute ki wajah se room kholta hai, har khulna `DEAL_ADMIN_ACCESS` audit line banata hai (admin + deal ke hisaab se 30 min me ek) — dono brokers ise apne audit-log me dekh sakte hain. Deal screen par banner bhi dikhta hai.
- Audit-log me COMMISSION ki rakam GENZ ko `₹•••` dikhti hai jab tak room band hai.
- Purani "GENZ desk" duty ab naye deal room me nahi banti: kaam brokers me bante hain, ek doosre ko review karte hain. Jo purani deal me desk ke paas task hai, wo tab tak rahta hai jab tak broker reassign na kare.
- Property-level DD / vault / papers ka GENZ access badla nahi (wo deal room ka data nahi).

## Payment: brokers khud likhte hain, GENZ nahi
1. Ek broker entry likhta hai: rakam, tareekh (aaj ya pehle), UTR / reference (kam se kam 6 akshar), note.
2. Entry **PENDING** — paid me tab tak nahi judti.
3. Doosra broker **Confirm** karta hai → paidAmount badhta hai. **Reject** par kaaran (≥ 5 akshar) zaroori.
4. Likhne wala khud confirm nahi kar sakta; solo-broker deal me self-confirm.
5. Share poora milte hi PAID. Zyada rakam / duplicate (same ref + rakam) / future tareekh refuse.
6. "Payment nahi mili" dabane par **asli Dispute** banta hai (COMMISSION_NON_PAYMENT, ≥ 15 akshar ka kaaran): share DISPUTED, payments freeze, aur GENZ ke liye room khulta hai. Dispute resolve par DISPUTED share chhoot jaata hai.
7. GENZ admin / superadmin / owner payment record ya confirm nahi kar sakte.

## Deal value
Propose agreement me optional `dealValue` (agreed price). Na ho to Sale listing ki asking price. `activateAgreement` ise deal par save karta hai. Left list me aur admin summary me dikhta hai.

## Dashboard (admin)
`metrics.dealTotals` = { deals, dealValue, commissionAgreed, commissionPaid } — sirf Agreement stage ya aage ki deal; paid me sirf CONFIRMED entries. Card `admin-deal-totals`. Broker ko sirf apne figures.

## Test
`tests/v21-deal-privacy.test.ts` (25 tests) + 3 purane tests naye model ke hisaab se badle (v16-5-audit, v16-8-inventory-desk, owner-privacy-and-mandate). Poora suite: 589 pass.

## Jo nahi kiya
- "Emergency level 3" access (maanga nahi gaya).
- OCR / PDF-create (decision baaki).
