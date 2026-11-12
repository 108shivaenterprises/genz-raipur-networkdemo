# V129 — Dukaan QR aur public QR listing ke saath apne aap chalte hain (12 Nov)

## Aapke do sawal, chala ke dekha
| Sawal | Pehle | Ab |
|---|---|---|
| Listing **sold / rented / withdrawn** hui to QR se hat-ti hai? | Haan, turant: dukaan QR page aur public QR page dono se. Chat me ghar par "बिक गया" aata hai; broker use dobara bhej nahi sakta; client us par visit nahi maang sakta. | Wahi (sahi tha, test jod diya). |
| App me **nayi listing** dalte hi QR par aati hai? | **Aadha.** QR ki chat me bot turant dikha deta tha. Par QR page ke neeche ki "ghar ki list" aur public page par tab tak nahi, jab tak broker khud tick na kare. | **Apne aap aati hai** (aapka faisla), dono page par. |

## Naya niyam
- Broker ek baar "मालिक राज़ी हैं" wala vaada karta hai (pehli tick ke saath). Uske baad uski **har nayi verified listing** dukaan QR aur public QR par khud aa jaati hai (page par max 24 ghar, nayi pehle).
- Kisi ghar ko nahi dikhana ho to tick hata do: wo **band hi rehta hai**, aur baad ki nayi listings phir bhi aati rehti hain.
- Jis broker ne vaada kabhi nahi kiya, uske ghar page par nahi dikhte (pehle jaisa); screen par "QR par koi ghar nahi dikh raha" ki chetavni aati hai.
- Dusre broker ke ghar (co-broke / "open to pages") ab bhi tick se hi aate hain.

## Dukaan QR ke baaki check (sab sahi mile)
- Galat mobile / sahmati ka tick nahi / khareedar ne "seedha sauda nahi" par sign nahi kiya → form saaf Hindi + English me rokta hai.
- Wahi customer **usi dukaan** par dobara scan kare → nayi lead nahi banti.
- Wahi customer **usi broker ki dusri dukaan** par scan kare → nayi lead nahi; credit **pehli dukaan** ka hi rehta hai.
- Dukaan pause / band → uska QR: "यह QR अभी अनुरोध नहीं ले रहा।"

## Dhyan
- Bechi hui listing jaisi hi dobara dalne par (wahi pata / owner) nayi listing "PENDING" me jaati hai jab tak GENZ dekh na le; tab tak wo QR par nahi aati. Ye purana suraksha niyam hai.
- Code: `server/publicPage.ts` (shownHomes + hidden), `server/db.ts`, `ShopPartners.tsx` (line ka text). Test: `tests/v129-qr-follows-listings.test.ts` (5).
