# v48 — Malik / khareedar ko brokerage bill (PDF + UPI) aur reminder

Deal "Agreement" stage par pahunchte hi deal room me ek naya hissa dikhta hai: **"मालिक / खरीदार से ब्रोकरेज"**. Ye Handover aur Settled par bhi rehta hai. Har party ke liye alag bill banta hai.

## Broker kya karta hai
- **"मालिक को बिल"** ya **"खरीदार को बिल"** dabata hai.
- **Naam aur mobile pehle se bhare milte hain**, lekin sirf wahi jo broker ko dekhne ki ijazat hai:
  - malik ka number sirf listing broker ko;
  - khareedar ka number sirf usi broker ko jo khareedar laaya.
- **Rakam bhi pehle se bhari hoti hai:**
  - apna-apna side wali deal me aapki apni fees;
  - listing broker ke liye malik ke mandate se (% / fix / net ke upar).
- Ye bhi bhar sakte hain:
  - 3 line tak vivaran;
  - GST 0/5/12/18% (GST sirf sahi GSTIN ke saath lagta hai);
  - aakhri taareekh (default 7 din);
  - UPI ID (pichhle bill wali pehle se bhari rehti hai);
  - ek note.
- **Bill number:** `<broker code>/<financial year>/0001`, har saal naye sire se.
- **Ek party ka ek hi khula bill:** pehle wala band ya "mil gaya" ho, tabhi naya bill.

## Bhejna aur reminder
- **"WhatsApp पर भेजें"** dabane par broker ke apne WhatsApp se party ke number par Hindi message jaata hai, bill ke link ke saath. Koi paid SMS nahi lagta.
- Dobara dabane par wahi button **"रिमाइंडर भेजें"** ban jaata hai (reminder ka alag message).
- Kitne reminder gaye aur aakhri kab gaya, ye dikhta hai. Party ne link kitni baar khola, wo bhi dikhta hai.
- Aakhri taareekh nikal jaaye to deal ke Next steps me aur Home tile par aata hai: "ब्रोकरेज बिल की तारीख़ निकल गई — रिमाइंडर भेजें".
- Aur buttons: "लिंक कॉपी", "बिल / PDF", "रद्द".

## Party ka page (`/pay/...`, bina login)
Page par ye sab hota hai:
- **Poora bill:** broker ka naam, company aur RERA; party ka naam; property; vivaran; GST; kul rakam; aakhri taareekh.
- **Tax wali line:** GST ho to "Tax invoice + GSTIN", warna "GST नहीं — यह टैक्स इनवॉइस नहीं है".
- **UPI QR + "UPI ऐप खोलें":** rakam pehle se bhari rehti hai. UPI link free hai, isme koi payment gateway nahi.
- **"🖨 Print / PDF":** phone par "Save as PDF" se PDF ban jaata hai aur aage bheja ja sakta hai.
- **"भुगतान कर दिया?":** party UTR ya cheque number likhta hai. Broker ko push jaata hai, aur bill par "भुगतान बताया" dikhta hai.
- **Broker ki pushti:** broker **"पैसा मिल गया"** dabata hai. Party ka UTR apne aap bhar jaata hai, aur bill "PAID" ho jaata hai.

## Niyam aur privacy
- Paisa seedha broker ko jaata hai. GENZ ye paisa na rakhta hai, na bhejta hai, aur iske liye broker se koi fees nahi.
- Doosra broker aapke bill na dekh sakta hai, na badal sakta hai. Deal se bahar ka koi bhi kuch nahi dekh sakta.
- Band (deal nahi hui) deal room me bill nahi banta.
- Privacy page me naam, mobile, rakam, UTR aur link kitni baar khula, ye sab likh diya hai.

## Tests
- `tests/v48-brokerage-bill.test.ts` (3):
  - Agreement se pehle bill mana;
  - listing broker ko malik ki jaankari pehle se bhari milti hai, khareedar wale broker ko malik ka number nahi;
  - GSTIN bina GST mana, ₹0 mana, galat UPI mana;
  - GST 18% → kul ₹1,41,600; bill number; ek party ka doosra khula bill mana;
  - page par kul aur UPI; reminder gina gaya; party ne "paid" bataya → Home tile; doosra broker ya bahar ka broker kuch nahi kar sakta;
  - broker ne pushti ki → PAID; PAID bill rad nahi hota.
- Browser me check kiya:
  - Vikramaditya ki deal DEAL-DMO-013 me malik ka naam aur number pehle se bhara mila;
  - WhatsApp message Hindi me sahi bana;
  - bill page aur Print button chale;
  - party ne UTR likha → broker ko "Says paid" dikha.
- Poora suite pass.

Files: `server/payreq.ts`, `server/db.ts` (`paymentRequests`), `server.ts`, `server/reputation.ts`, `server/dealhub.ts`, `src/components/PaymentRequestsPanel.tsx`, `DealRoomsView.tsx`, `DealHub.tsx`, `BrokerHome.tsx`, `LegalPages.tsx`, `lib/api.ts`.
