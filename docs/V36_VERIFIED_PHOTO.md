# v36 — Verified Photo (ID card par broker ki photo, GENZ ki jaanch ke baad)

Pehle ID QR card par photo ka box tha par photo upload ka rasta hi nahi tha. Ab:
1. Broker (Network → "My photo for the ID card") selfie/gallery se photo deta hai. App use 480px square JPEG me chhota karti hai. DPDP tick zaroori.
2. Photo PENDING rehti hai. Card par nahi aati.
3. GENZ staff (Disputes → "Photo check", perm `users:review`) photo ko broker ke PAN/RERA/ID ke saath dekhta hai: "ID se mel khati hai — manzoor" ya "wapas bhejen" (reason ke saath; reject hote hi file disk se delete).
4. Approve hone par hi `avatarUrl` set hota hai aur QR card par "Photo GENZ ne jaanchi" ka nishan aata hai.
5. Nayi photo dene par purani approved photo tab tak chalti hai jab tak nayi approve na ho.

Privacy: photo `data/profilephotos/` me, sirf logged-in members ko (public nahi, `private` cache), account erase par delete, privacy page me line. Audit: PROFILE_PHOTO_UPLOADED / APPROVED / REJECTED.
API `/api/profile-photo`: GET /mine, POST /mine, GET /u/:userId, GET /admin, POST /admin/:id.
Tests: `tests/v36-verified-photo.test.ts` (4).
Baaki: face-match automatic nahi (staff aankh se milata hai); profile edit me avatarUrl kisi aur raste se set nahi hota (check kiya).

## v36.1 / v36.2 — "This screen hit a problem" fixes
- v36.1: Match Center aur matching server khali/missing fields se nahi girte; error card ke neeche chhoti technical line (kaaran) dikhti hai.
- v36.2: purana service worker (`sw.js` v3) har file ko "stale-while-revalidate" se cache karta tha; dev machine (`npm run dev`) par purane aur naye screen-files mix hokar kai tabs girte the. Ab `sw.js` v4: `/assets/` (hashed) cache-first, baaki sab network-first; dev par purana worker/cache ek baar apne aap hata diya jata hai (page ek baar reload hota hai).
- v36.3: Share Kit flyer (Instagram / WhatsApp / A4): upar ka text ab broker card se pehle khatam hone tak khud chhota hota hai (min 62%), phir bhi na samaye to kam bullets; lambi bullet 2 lines me wrap; price aur broker card ka text width me fit. Pehle lambe project (jaise Apex Pinnacle) ka aakhri bullet card ke peeche chhup jaata tha.
