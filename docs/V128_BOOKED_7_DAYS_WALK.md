# V128 — Bina client ki haan ke haq sirf 7 din; co-broke flow screen par dekha (11 Nov)

## 1. Niyam (aapka faisla)
- Broker ne sirf **visit book** ki (client ne abhi kuch confirm nahi kiya) → us client + us property par haq **7 din**.
- Client ki apni haan aate hi wahi haq **poore dino** par chala jaata hai (default abhi 30; aap 180 karoge):
  - visit site par verify hui (client ka code), ya
  - client ki sahmati wala offer, ya
  - ghar client ki **apni QR chat** me gaya (wahan client ne "seedha sauda nahi" par sign kiya hota hai).
- Isse koi broker kisi ka number daal ke jhoothi visit book karke client ko mahino tak "pakad" nahi sakta; 7 din baad haq khud khatam.
- Code: `server/buyerbond.ts` (`BOOKED_DAYS = 7`, upgrade par note). Test: `tests/v29-buyer-bond.test.ts` (book = 7 din, verify ke baad poore din).

## 2. Screen par chala ke dekha (phone size)
| Kadam | Kya dikha |
|---|---|
| Client ki zaroorat sirf dusre broker ke ghar se milti hai | A ke lead card par: number chhupa, brief "नीचे को-ब्रोक माँगें", button **"🤝 इन ब्रोकरों से को-ब्रोक माँगें"** |
| A ne dabaya | "2 ब्रोकरों को भेजा। जो घर वे जवाब में देंगे, वह यहीं दिखेगा।" |
| B ki Buyers screen | Sabse upar "Brokers are looking for": zaroorat + B ka apna matching ghar + **"I have it"** (ek tap) → "Sent" |
| A ne ghar bheja, visit book ki | Card par chips: Buyer need added · Client room opened · Buyer protection started · Site visit booked |
| Deal room | Apne aap bani: dusra broker, deal value, mera hissa, visits, "Protection left" |
| Bechne wala (QR) | Bot ke sawal → lead card par "📝 Open the draft listing" → draft "1 BHK Flat for Sale in Amlidih · ₹85 L", 8/9 bhara |
| Dukaan ka hissa dena | "I have paid" → UPI / Bank / Cash + UTR zaroori → "Mark paid — he confirms on his page" |
| Rent desk | "Record a tenancy" ka form khulta hai |
Kahin JS error nahi.

Chhota sudhaar: lead card ki purani line "Buyers → Magic Match se baat karein" ab naye button ki baat karti hai.

## 3. Jo is baar bhi poora nahi dekha
- Deal room ka **"Rate & हिसाब"** (final rate, commission split, GENZ fee): tile dikha, andar nahi gaya.
- Dukaandaar ka "paisa mila" tick; owner ko manzoori ka link; rent desk me tenancy save karke mahine ka kiraya.
