# v49 — Property Papers mein "Protect", har kholne wale ka watermark, aur mandate mein owner ka naam + mobile

## 1. Property Papers ke andar "🔒 Protect"
- **Upload karte waqt:** "इन कागज़ों को सुरक्षित करें (सिर्फ़ देखने के लिए)" ka checkbox.
- **Baad mein:** har paper card par `सुरक्षित करें` / `सुरक्षा हटाएँ` button. Ye sirf uploader, property owner, listing broker aur admin ko dikhta hai.
- **Protected paper par kya hota hai:**
  - Card par laal badge dikhta hai: **"सुरक्षित · सिर्फ़ देखने के लिए"**.
  - Jinke saath paper share hai (ya deal / network visibility se jo dekh sakte hain), wo use **sirf app ke viewer mein** dekh sakte hain. Har page par unka **apna naam · ••mobile ke aakhri 4 ank · date-time** tirchha chhapa rehta hai, aur neeche ek kaali patti hoti hai: "GENZ · View only — opened by … · do not forward".
  - **Download / original file** sirf uploader, property owner aur listing broker ko milti hai. GENZ admin bhi sirf stamped viewer mein dekh sakta hai.
  - Agar koi file ka direct link browser mein khole, to app use viewer par wapas bhej deta hai. API se file maange to `403 PROTECTED` milta hai (Hindi + English message ke saath).
  - Har baar kholna aur har mana hui koshish "किसने खोला" log mein darj hoti hai.
  - Protection hatane par confirm maanga jaata hai. Uske baad share wale log dobara file khol aur download kar sakte hain.
- **Kaunsi files protect ho sakti hain:**
  - photo (JPEG / PNG / WebP);
  - **scanned PDF**, yaani har page ek photo ho. Isme ye sab chalte hain: GENZ ka "पेज की फ़ोटो से एक PDF बनाएँ", scanner apps, img2pdf, reportlab, aur compressed object streams wali PDF. Invisible OCR text layer bhi chal jaata hai.
  - **Computer par typed PDF** protect nahi hoti, kyunki use watermark ke saath dikhane ke liye PDF renderer chahiye. Aisi file par saaf message aata hai: pages ki photo daalein, ya "पेज की फ़ोटो से एक PDF बनाएँ" use karein, ya bina protect ke rakhein. Bina protect ke wo pehle jaisi upload ho jaati hai.
- **Open button:**
  - Photo aur protected paper app ke andar stamped viewer mein khulte hain, isliye kholne wale ka naam dikhta hai.
  - Bina protect wali PDF pehle jaisi naye tab mein khulti hai.

## 2. "Protected Docs" ab Property Papers ke andar
- Property Papers ke upar do button hain: **Property papers · Other protected docs**. Purana Protected Docs screen ab doosre button mein hai.
- Jis user ke paas Property Papers hai, uske menu se alag "Protected Docs" tab hata diya gaya hai. Purana link ya shortcut (`?tab=pdocs`, home ke quick links) seedha is section ko kholta hai.
- Builder aur contractor ke paas Property Papers nahi hai, unke liye Protected Docs tab pehle jaisa hai.

## 3. Watermark kyun nahi dikh raha tha — kya theek kiya
- **Pehle:**
  - Property Papers ki file seedhe browser mein khulti thi, isliye uspar kisi ka naam nahi aata tha.
  - Protected Docs ka watermark bahut halka tha (16% opacity, chhota font), phone par lagbhag dikhta hi nahi tha.
  - Page tokens server ki memory mein rehte the. Vercel par request kisi doosri server copy par pahunche to page load fail ho jaata tha.
- **Ab:**
  - Ek hi naya viewer hai (`WatermarkViewer`). Usme ghana, tirchha, do-rang (safed kinara + laal) stamp hai jo safed kaagaz aur dark photo dono par dikhta hai, aur neeche kaali patti hai.
  - Mobile ke aakhri 4 ank `••1234` format mein dikhte hain.
  - **Owner / uploader ko bhi** apna naam stamp dikhta hai. Original file wo "Original" button se le sakta hai.
  - Page tokens **signed** hain (HMAC, 5 minute), isliye har server copy par chalte hain. Har copy par ek token sirf ek baar chalta hai, sirf `<img>` ki tarah, aur sirf usi user ke liye.
- **Imaandari wali seema:** web page screenshot ya doosre phone ke camera ko rok nahi sakta. Stamp ka kaam ye hai ki leak hui copy par saaf dikhe kisne kholi thi.

## 4. Mandate mein owner ka naam aur mobile
- Mandate kholne par ab do dabbe dikhte hain:
  - **Owner:** naam, aur **poora mobile** (call link). Ye owner, listing broker aur admin ko dikhta hai.
  - **Listing broker:** naam, company, GZ-BRK code, RERA, mobile.
- Broker ki daali listing (owner GENZ par nahi hai) mein naam aur number listing se aate hain. Pehle sirf "(••0015)" aata tha, jo mobile number jaisa lagta tha.
- Agar owner ne consent link par koi doosra naam likh kar sign kiya ho, to wo alag line mein dikhta hai: "लिंक पर इस नाम से साइन किया: …".
- **Owners board ka card:** "Owner: naam · +91 …". Poora number sirf parties ko, warna "मोबाइल …1234".
- **Draft (owner ne haan kahi):** "मालिक: naam · मोबाइल: +91 …". Link par alag naam se sign hua ho to amber rang mein chetavani aati hai: "पक्का करें कि यही मालिक हैं".
- **Owner consent page (`/oc`):** naya "मालिक / Owner" row (naam + "mobile ending 0015") aur broker ka mobile.
- **Print paper form:**
  - Owner ka **poora mobile** aur broker ka mobile chhapta hai.
  - Saath mein khaali lines hain: "Owner's name (in own hand)" aur "Owner's mobile".

## Tests
- `tests/v49-protect-papers.test.ts` (9 test):
  - scanned PDF ke pages kram se milte hain, OCR layer ke saath bhi; typed PDF mana;
  - protected photo share kiya gaya broker file download nahi kar sakta, document link viewer par jaata hai;
  - stamp mein uska apna naam aur ••4 ank hote hain; token doosre user ke liye nahi chalta, dobara nahi chalta, `<img>` ke bina nahi chalta, aur jaali token mana;
  - log mein VIEW aur DENIED dono darj hote hain;
  - uploader aur owner ko original milta hai, admin sirf viewer mein dekh sakta hai;
  - sirf manager protect / unprotect kar sakta hai;
  - 3 page ki scanned PDF ka page 2 sahi aata hai; typed PDF ko protect karne par `PDF_NOT_SCANNED` (Hindi message ke saath);
  - Protected Docs mein owner ko bhi stamp milta hai;
  - mandate mein owner aur broker ka mobile, aur GZ code.
- Poora suite pass hua: 878 test, 4 skip.
- Browser mein phone size par check kiya:
  - upload sheet ka checkbox, card ka badge aur button;
  - doosre broker (Priya) ke viewer mein uska naam saaf dikha, download button nahi tha;
  - direct file link viewer par wapas aaya;
  - `?tab=pdocs` naye section par khula;
  - mandate mein Sunil Lalwani +91 98261 55667 aur broker ki details dikhi;
  - paper form aur consent page mein naye rows aaye.

Files: `server/viewToken.ts` (naya), `server/pdfPages.ts` (naya), `server/propdocs.ts`, `server/pdocs.ts`, `server/db.ts`, `server/consent.ts`, `server.ts` (`mandateView`), `src/components/WatermarkViewer.tsx` (naya), `PropertyPapersView.tsx`, `ProtectedDocsView.tsx`, `MandateModal.tsx`, `DealHub.tsx`, `ListingDrafts.tsx`, `NavigationTabs.tsx`, `App.tsx`, `LegalPages.tsx`, `lib/api.ts`, `types/index.ts`.
