# V71 — हिसाब (deal accounts): token, kisht, brokerage — kitna mila / diya / bacha

GENZ koi paisa nahi rakhta — sirf record. Bhugtan seedhe (UPI / bank / cash / cheque).

## Kahan
- **Deal Desk → हिसाब** tab: saare deals ek nazar me (mila / baaki), kisi par tap karo to poora हिसाब.
- **Deal room** me bhi हिसाब card (brokerage card ke neeche) — broker aur owner dono ko.

## Sale ka paisa (khareedar → malik)
- Kul kimat (final price, nahi to asking), **mila**, **baaki**, progress bar.
- Entries: टोकन / किस्त / आख़िरी भुगतान / खरीदार को वापस (refund = mile hue me se ghatta hai). Rakam, tareeka, tareekh, UTR, note.
- **Offer ka token apne aap** gina jata hai (dobara type nahi karna).
- Likhta hai deal ka broker; **malik ya doosra broker "हाँ, मिल गया" se confirm** karta hai (likhne wala apni entry confirm nahi kar sakta). Confirm hone ke baad cancel nahi — sudhaar ke liye nayi (refund) entry.
- Cancel ke liye karan likhna padta hai; entry mitti nahi, kati hui dikhti hai (audit).

## Malik ka view
- Kimat, mila, baaki, **brokerage jo dena hai / diya / baaki** (mandate se, paid bill gina jata hai) aur **"aapke haath me" = mila − brokerage diya**.

## Broker ka apna (private) brokerage khata
- **Banta hai / mila / baaki**, **aage diya** (doosre broker ka hissa, partner), **mere haath me bacha**. Sirf usi broker ko dikhta hai; doosre broker, malik, GENZ ko nahi (har JSON response se brokerBook hata di jati hai; privacy export me sirf apni).
- "Banta hai" = malik ke mandate se (listing broker), own-side fee, ya apna hissa; **haath se badal** sakte hain.
- Brokerage bill (v48) "mil gaya" hone par apne aap gina jata hai — dobara na likhein.

## Limits
- Ye record hai, bank se match nahi hota; galat entry ka zimma likhne wale ka.
- Khareedar ka alag login nahi — uski taraf se confirm owner/doosra broker karte hain.
- Owner room me offer-reply / visit-approve abhi baaki.
- Files: server/hisaab.ts, server/db.ts, server.ts, server/privacy.ts, src/components/DealHisaab.tsx, DealDesk.tsx, DealRoomsView.tsx, src/lib/api.ts, tests/v71-hisaab.test.ts.
