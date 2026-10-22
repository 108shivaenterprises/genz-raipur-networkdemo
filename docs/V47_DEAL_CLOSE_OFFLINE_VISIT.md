# v47 — Deal room band / dobara kholna · App ke bahar hui visit · Mandate me naam

## 1. Deal room band karna ("deal nahi hui")
Ye deal room ke upar milega (Next steps ke neeche): **"डील नहीं हुई — बंद करें"**.
- **Band karne ki request:** kaaran chunte hain (khareedar peeche hata / keemat nahi bani / malik ne mana kiya ya kahin aur bech di / loan ya kaagaz / anya) aur ek line likh sakte hain.
- **Doosre broker ka jawab:** use Next steps me "दूसरा ब्रोकर यह डील बंद करना चाहता है — जवाब दें" dikhta hai, aur push bhi jaata hai.
  - **"हाँ, बंद करें"** dabaye to room band.
  - **"नहीं, डील चालू है"** dabaye (kaaran ke saath) to request hat jaati hai.
  - **7 din me jawab na aaye** to room apne aap band ho jaata hai. Ye check har ghante hota hai, aur deal list kholte waqt bhi, kyunki Vercel par timer nahi chalta.
- **Ek hi broker dono taraf ho** to room turant band ho jaata hai.
- **Band room me kya hota hai:**
  - Stage nahi badalti, nayi visit book nahi hoti.
  - Next steps aur "idle" ki yaad-dahani band ho jaati hai.
  - Pipeline me "Live" ki ginti me nahi aata. Alag tile hai: **"बंद (डील नहीं हुई)"**.
- **Kya nahi rukta:** khareedar suraksha (buyer bond), malik ka mandate aur anti-bypass niyam apni-apni taareekh tak chalte rehte hain. Room band karke chupke se deal karna isse nahi bachata.
- **Dobara kholna:** koi bhi broker kaaran likh ke **"दोबारा खोलें"** kar sakta hai. Doosre broker ko push jaata hai. Sab notes aur audit trail me darj hota hai.
- **Client room** band karne ka option pehle se tha: room → **"रूम बंद करें"**.

## 2. Visit app ke bahar ho chuki
- Ye tabhi dikhta hai jab deal "Site Visit Done" se pehle ho aur koi verified visit na ho: **"विज़िट ऐप के बाहर हो चुकी?"**
- Ek broker visit ki taareekh (pichhle 1 saal ke andar) aur kya hua wo likhta hai.
- **Doosra broker** pushti karta hai. Ek-broker wali deal me pushti **malik** karta hai. Jo likhe wahi pushti nahi kar sakta.
- Pushti ke baad deal "Site Visit Done" par ja sakti hai.
- Ye hamesha **"दोनों ने माना — वेरिफ़ाइड नहीं"** dikhega. Isse khareedar suraksha (buyer bond) **nahi** banti. Nayi visit hamesha OTP/QR se karni chahiye.
- Pushti ke bina koshish karne par stage ki galti me yahi raasta bataya jaata hai.
- **Documents ki shart:** kisi stage ke liye document upload zaroori nahi hai. Shartein sirf ye hain: Site Visit Done ke liye verified visit (ya ab ye raasta), Agreement ke liye signed commission agreement, aur Settled ke liye saara paisa "paid" darj hona.

## 3. Mandate me naam
- Mandate kholne par ab **Malik** aur **Listing broker** ke naam dikhte hain. Pehle sirf ID, keemat aur tareekh dikhti thi.
- "Owners" board se kholne par broker ki jagah ID dikhti thi, wo bhi theek kar di.
- Mandate dobara kholke check karna: **Deals → Owners → "मैंडेट खोलें"**, ya property card → **और ▾ → मालिक से ब्रोकरेज की शर्त → देखें**.

## Tests
- `tests/v47-deal-close.test.ts` (4):
  - request → "chalu hai" → request hati; dobara request → haan → band; band room ki stage nahi badalti; bina kaaran reopen mana; reopen;
  - jawab na aane par apne aap band (test me samay chhota kiya gaya);
  - deal se bahar ka broker band nahi kar sakta;
  - bahar ki visit: bhavishya ki taareekh mana, khud ki pushti mana, pushti se pehle stage mana, pushti ke baad stage chal jaati hai.
- Browser me poora raasta do brokers ke phone par chala ke dekha. Mandate me naam dikhe: Sunil Lalwani / Vikramaditya Sharma.

Files: `src/shared/dealClose.ts`, `server/dealclose.ts`, `server.ts` (stage gate, visit booking, sweep), `server/dealhub.ts`, `server/db.ts`, `src/types/index.ts`, `src/components/DealStatusPanel.tsx`, `DealRoomsView.tsx`, `DealHub.tsx`, `DashboardView.tsx`, `MandateModal.tsx`, `lib/api.ts`.
