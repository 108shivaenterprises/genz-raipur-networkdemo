# v14 — Visit rule, Offers + Token, Listing lifecycle, Poster, Retention, Deal timeline

## 1. Visit: kaun schedule, kaun verify
- Buyer-side broker schedule karta hai. Property side (owner / listing broker) QR scan / OTP verify karta hai.
- Scheduler khud verify nahi kar sakta (403 `MAKER_CHECKER` / `PROPERTY_SIDE_ONLY`). Self-deal me sirf owner verify karega.

## 2. Multiple offers + token (`/api/offers`)
- Ek broker ek property par alag-alag buyers ke saath multiple offers de sakta hai (property par max 3 live, broker par max 15).
- Owner hamesha decide karta hai; listing broker bhi, par apne hi offer par nahi.
- Ek winner; baaki BACKUP me, auto-promote. Token received => TOKEN_HELD, property under_negotiation.
- GENZ paisa kabhi handle nahi karta — sirf record + lock. Validity ke baad hi "forfeited"; 3 din grace ke baad auto-release.

## 3. Listing lifecycle (`/api/listings`)
- Sold / Rented / Hold / Withdrawn; sold via NETWORK ya OUTSIDE (optional private price). Matching aur feed se turant hide.
- 24 ghante me undo. Resale = NAYA linked record (verification PENDING). Create par resale warning.

## 4. Site poster + public page
- Poster (naam/number/RERA + QR) PNG/print. QR -> `/p/CODE` public page, enquiry form (consent required) -> listing broker ko lead.
- QR ke liye publicly reachable URL chahiye (localhost/LAN customer ke phone par nahi khulega).

## 5. Retention
- Sold ke `SOLD_PURGE_DAYS` (default 90, env se change) baad personal data erase; anonymous market record (price band) rehta hai.
- Broker deal timeline + audit/commission records 8 saal. Active settlement/dispute ho to erase block.

## 6. Deal timeline (`/api/timeline`)
- Visits, offers, registry/payment/agreement milestones (dono side confirm), private notes/reminders. Fingerprint = record hash, legal signature nahi.

## Limits
- Alerts sirf in-app. Retention period ke liye counsel se confirm karein. Demo me verify ke liye 2 accounts chahiye.
