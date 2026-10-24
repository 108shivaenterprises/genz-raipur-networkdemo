# v65 — Har site visit chat me, listing form ka "Network error"

## 1. Visit chat me nahi dikhta tha
- Ek hi client ke do visit (alag time) the, par chat me sirf wahi card dikha jo broker ne "+" se haath se bheja tha.
- Ab visit schedule hote hi us deal ke chat me apne aap "Site visit · date, time" ka card aa jata hai (sender: jis broker ne visit rakha).
- Purane visit bhi: chat khulte hi jo visit-card missing hai wo jud jata hai (ek visit ka ek hi card, dobara nahi banta).
- Card me OTP / QR secret nahi jata; card har reader ko wahi dikhata hai jo wo apni list me dekh sakta hai.
- Test: `tests/v65-visit-cards.test.ts`. Purane v13/v33/v40/v50/v53/v54 pass.

## 2. Listing form: "Network error occurred"
- Karan: phone-gallery ki badi photo form ke saath JSON me jati thi; Vercel 4.5 MB se badi request rokta hai (aur server 256 KB). Is form me photo save hone ka raasta tha hi nahi (server sirf https link leta hai).
- Fix: form ab link-mode me khulta hai, gallery button band; badi file / server error par saaf message.
- Aage (v65b, aapki haan par): phone se seedhi photo — chhoti karke server par, aur kaun dekh sake ye privacy tay karke.
