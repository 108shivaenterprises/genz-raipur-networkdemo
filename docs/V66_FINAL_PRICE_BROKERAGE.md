# v66 — Final price par mandate ka asli hisaab (deal se auto-link)

## Kya badla
- Pehle mandate ka hisaab sirf "asking price par" dikhta tha. Ab deal ki **final price** par broker aur owner ka hissa dikhta hai.
- **Final price kahan se aati hai (auto):**
  1. Offer accept hote hi deal room ki value = offer ki rakam (counter accept hua to counter ki rakam).
  2. Signed commission agreement me jo price likhi ho wo sabse upar (usse badalne ke liye naya agreement version).
  3. Ya deal broker khud "Set" se bhar de (jahan offer nahi tha). Audit me `FINAL_PRICE_SET`.
  4. Kuch nahi to asking price (label: "asking price").
- **Niyam (`src/shared/mandateShare.ts`):** Net amount: broker = final − net (0 se neeche nahi); Commission %: final price ka %; Fixed fee: wahi fee (price se zyada nahi). Asking se upar bika to extra broker ka (net wale me).
- Final price owner ke net se kam ho to laal chetavni: broker ko 0, owner ko apni maang se kam — pehle owner se tay karein.
- Deal room me naya card **"फ़ाइनल कीमत पर ब्रोकरेज"**: price + source, owner ka rule, broker/owner ko kitna, asking ke hisaab se kitna kam/zyada.
- Brokerage bill (v48) ka amount hint bhi ab isi hisaab se (final price par).

## Privacy
- Ye card sirf **owner aur listing broker** ko (net amount confidential). Dusre broker, employees aur GENZ ko `brokerage` hi nahi jata. Dusra broker final price type kar sakta hai par hissa nahi dekhta.
- GENZ ka koi paisa nahi; owner seedha broker ko deta hai.

## Honest limits
- Do brokers ke beech ka split (`totalCommissionExpected`, abhi 2% anuman) **nahi badla** — kyunki wo dono brokers ko dikhta hai aur net amount se price−net nikal kar owner ka net khul jata. Mandate wala hissa sirf principals ko.
- Agreement/offer ke baad price badli to purani value auto-update hoti hai jab tak agreement ne lock na kiya ho.

## Tests
`tests/v66-final-price-brokerage.test.ts` (5): hisaab ki table, privacy, manual price + bill hint + below-net, accepted offer se dealValue. v14/v15/v21/v27/v37/v41/v47/v48 pass.
