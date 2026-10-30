# v89 — Shop QR form + dobara scan (rescan) fix

## Problem (user screenshots)
- Ek hi mobile number se dobara scan karne par naya naam/need chupchaap ignore ho jaata tha (generic thanks page) — "ek hi naam pe lock".
- Form ka upar wala button hamesha "मुझे घर चाहिए" hara dikhta tha, buyer wala promise box seller ko bhi dikhta tha.
- Client room mein label "My search — <broker>" aise lagta tha jaise search broker ki ho.

## Fix
- Rescan (same broker + same phone + same side): naya lead nahi, pehla naam/need rehta hai. Nayi details lead ki history mein ("Scanned again…") jaati hain, broker ko push (1 ghante mein ek baar). Customer ko thanks page par saaf message (`qr-again`).
- Safety: rescan par chat link kabhi wapas nahi diya jaata (phone ownership verify nahi hota).
- Alag side (BUY ke baad SELL, ya ulta) = alag lead, apni chat ke saath.
- Form: `?want=sell` par seller wala button active, seller note dikhta hai, buyer promise chhupa. Mobile par buttons overflow nahi, bottom padding.
- Client room label: "<broker> के साथ मेरी तलाश / My search with <broker>".

## Test
`tests/v89-qr-rescan-and-form.test.ts` (8 tests).

## Limits
- "Lock" ka matlab mera andaaza hai (rescan swallow). Agar kuch aur matlab tha to batayein.
- Pitch PDF / USER_MANUAL untouched.
