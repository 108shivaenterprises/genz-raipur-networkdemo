# V141 — India scale: GENZ team ki desk ke bina (V140 + V141)

Aapka niyam: "India level pe karna hai, GENZ ki team hamesha check karne nahi baithegi."

## V140 (pehle hi live)
- **Photo:** daalte hi live. Koi GENZ jaanch nahi, koi line nahi. "Checked by GENZ" ka nishaan sirf un purani photos par jo staff ne sach me jaanchi thi.
- **Top 10 board:** ab bas photo chahiye (pehle GENZ ki jaanchi photo chahiye thi).
- **Buyer → apne broker ko query:** Magic Match me "Ask broker". Broker ko bell + phone alert (buyer ka number nahi). Requirement par broker na ho to listing broker ko.

## V141 — chaaron jaanch automatic
| Pehle (GENZ team) | Ab (apne aap) |
|---|---|
| Naya member "PENDING", admin PAN / Aadhaar dekh ke manzoor karta | Join par **mobile OTP + valid PAN jo kisi aur account par na ho** → turant live (RERA na ho to Non-RERA). Bina OTP ke purana raasta (GENZ dekhega). |
| Broker RERA daale → staff portal par jaanche → Tier 1 | Sahi format ka, kisi aur ka na liya hua RERA → **turant Tier 1** |
| Owner ki kagaz wali sahmati → staff jaanche | Kagaz wala raasta **band** (410). Owner sirf link + SMS code se haan kare. Purane bheje kagaz queue me rahenge. |
| Owner listing: staff ID / kagaz jaanche + staff UTR pakka kare | Owner (mobile OTP login) **ek baar PAN** daale. Fee 0 plan → turant live. Fee wala plan → **UTR likhte hi live**. GENZ baad me bank se milaan karke fake UTR wali listing hata sakta hai ("reject"). Owner ka selfie / ID / kagaz wala hissa hata diya. |

## Ek hi suraksha sab par: members ki report
- Listing: 3 alag members report karein → listing ruk jaati hai (pehle se tha).
- **Member (naya):** 3 alag *verified* members report karein → account turant **SUSPENDED**, photo hatt jaati hai, khud jodha RERA badge wapas. Wo login kar sakta hai par kaam band (PENDING jaisa). GENZ chahe to wapas khol sakta hai.

## Kya dhyan rakhna hai
- **OTP ke liye SMS chalu hona zaroori hai** (Fast2SMS key, API Keys tab, *production* me). SMS band ho to join par "GENZ ID jaanchega" aata hai aur account PENDING rehta hai.
- **PAN ki online jaanch (NSDL / Protean API) nahi judi.** Abhi sirf PAN ka format aur "ek PAN ek account" jaancha jaata hai. Koi kisi aur ka asli PAN daal de to pakda nahi jayega jab tak koi report na kare. PAN verification API (har jaanch ₹1-2) baad me API Keys tab se jod sakte hain.
- **RERA ki online jaanch nahi** (state RERA portals ki seedhi API nahi). Sirf format + ek number ek account + reports.
- **Fee:** typed UTR saboot nahi hai. Asli auto-confirm ke liye payment gateway (Razorpay / Cashfree) chahiye. Tab tak GENZ hafte me ek baar bank statement se milaan kare.
- 3 log milkar kisi competitor ko suspend karwa sakte hain. Isliye sirf verified members ki report ginti hoti hai, aur GENZ suspension hata sakta hai.

## Tests
- `tests/v141-no-genz-desk.test.ts` (3): OTP + PAN → live; galat code mana; bina code PENDING; RERA turant Tier 1; dusre ka RERA 409; 3 report → SUSPENDED + RERA gaya.
- `tests/v73-owner-listing.test.ts`: PAN pehle; UTR par turant live; staff reject se listing hatti; free plan turant live.
- `tests/v26-launch.test.ts`: kagaz → 410.
- Phone screen: join par "Send code" + code box + demo code; owner ke My Property me "Your PAN" card.
