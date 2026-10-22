# v45 — Header QR se seedha scan + Deals me Client rooms aur Owners

## 1. Upar wala QR button: ab "QR · Scan"
- Broker ke liye QR button dabane par ek chhota menu khulta hai, jisme do option hain: **"विज़िट QR स्कैन करें"** aur **"मेरा QR कार्ड"**.
- Scan karne par app QR padhkar khud tay karta hai ki ye kaunsa QR hai:
  - **Broker-se-broker property visit (khareedar ka pass):** agar visit aapki property par hai (aap owner ya listing broker ho), to check-in turant ho jaata hai aur visit "Verified · QR" ho jaati hai. Location mile to wo bhi jud jaati hai.
  - **Builder project pass:** sirf builder ki team ise scan kar sakti hai. Unke liye "Visit QR" screen usi code ke saath khulti hai, aur baaki logon ko saaf message milta hai.
  - **Koi aur QR:** message aata hai, "यह GENZ का विज़िट QR नहीं है".
- Niyam wahi hain jo pehle the. Aap apni book ki hui visit khud verify nahi kar sakte (maker ≠ checker), na kisi doosre ki visit. Khareedar ka "no direct deal" ack bhi pehle jaisa zaroori hai.
- **Owner** (aur builder ki team, jinke paas broker card nahi hai) ko header me ek alag **"स्कैन"** button milta hai. Khareedar ko ye button nahi milta.
- Camera na ho to "QR ki photo lo" wala tareeka chalta hai, ya deal room me OTP daal sakte hain.

## 2. Deals me sab ek saath
- Deals screen par ab ye button hain: **Pipeline · Deal room · Offers · Client rooms · Owners**.
  - "Client rooms" me poori Client Rooms screen yahin khulti hai.
  - "Mandates" ka naam badalkar "Owners" (मालिक — ब्रोकरेज की शर्तें) kar diya.
- Har deal room ke "Property owner & customer" card me ab ye dikhta hai:
  - **"मालिक की शर्तें"** button (Owners board).
  - **"क्लाइंट रूम: <naam>"** button, har us client room ke liye jisme is deal ki property hai. Dabane par wahi room khulta hai.
  - Agar kisi room me property nahi hai, to ek line batati hai ki neeche "क्लाइंट रूम में भेजें" dabayein.
- Desktop aur More menu me **Client Rooms** ab "Deals" group me hai (pehle "Today" me tha).

## Server
`GET /api/client-rooms` summary me `propertyIds` jud gaye. Ye sirf broker ke apne rooms ke liye hain.

## Check kiya
- Header QR → Scan → khareedar ke pass ki photo daali, to server par visit `isVerified: true, method QR` ho gayi.
- Dobara scan karne par "already verified" aaya, aur bekaar QR par sahi message aaya.
- DEAL-DMO-001 me 2 client room link dikhe, aur click karne par wahi room khula.
- Owner ko "स्कैन" button mila, khareedar ko nahi.
- Test: `tests/v45-deal-room-links.test.ts`.

Files: `src/components/QuickScan.tsx` (naya), `Navbar.tsx`, `App.tsx`, `SiteVisitQrPassModal.tsx` (`initialScan`), `VisitsView.tsx` (`?pass=`), `DealRoomsView.tsx`, `NavigationTabs.tsx`, `server/clientroom.ts`.
