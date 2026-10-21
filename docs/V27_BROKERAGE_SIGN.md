# v27 — Listing ke time par brokerage + owner ka sign

Krishna ne dekha: PROP-104 (broker ki apni daali listing) me "Brokerage Mandate" modal me koi form nahi tha, aur WhatsApp draft me bhi brokerage ka option nahi tha. Saath me maanga: owner ke sign ke liye initials likhna aur sign draw karna, dono.

## Wajah
Mandate ka form sirf `PROPERTY_OWNER` login ko dikhta tha (owner password se sign karta, broker co-sign). WhatsApp / broker ki daali listing me owner GENZ par hota hi nahi. Isliye broker ko sirf samjhaane wala box dikhta tha.

## Ab kya hota hai
1. **Draft me brokerage block** (`ListingDrafts.tsx`): Net amount / Commission % (0.1–10) / Fixed fee. Live preview: "₹45 L par: broker ₹X, owner ₹Y". Broker apna **password** daal kar in shartein par sign karta hai (wahi e-sign jo mandate me chalta hai, `server/signing.ts`).
2. **Owner ka page** (`/oc/<token>`): brokerage ki shartein, protection ke din, broker ka naam + RERA. Phir naam, aur **sign ke do tareeke**:
   - ✍️ naam ke akshar (2–8 letters, kisi bhi script me, jaise `RP`)
   - 🖊️ ungli / mouse se sign (canvas). Server PNG ka asli type, size (≤200 KB) aur strokes (≥12) check karta hai.
   Dono me se ek zaroori. Bina sign ke "haan" nahi maani jaati.
   Pad ka script `/oc/sign.js` hamari apni file hai, kyunki CSP me inline script allowed nahi.
3. **Owner ki haan ke baad listing live** → mandate **ACTIVE** apne aap (`OM-2026-NNN`): owner ka sign + broker ka password-sign, SHA-256 seal, deal rooms khul jaate hain, bypass protection ke din consent ke din hain.
4. **Purani listing** (jaise PROP-104): Mandate modal me broker ko "Brokerage tay karein aur owner ka sign lein" ka button. Wahi draft + link + sign, phir "Apply to PROP-xxx" (`/api/consent/drafts/:id/attach`) se purani listing par protection date aur ACTIVE mandate lag jaata hai.
5. Mandate card me owner ka sign (initials / drawn image) dikhta hai. Drawn image sirf us broker ko jisne maanga, aur GENZ staff ko (`GET /api/consent/:id/signature`).

## Suraksha / niyam
- Owner ko price ya brokerage dikhne ke baad badalna ho to pehle request wapas lo (`CONSENT_LOCKED`). Publish ke time price consent ke price se alag ho to `CONSENT_MISMATCH`.
- Brokerage optional hai (purana flow nahi toota). Par bina mandate ke deal room band rehte hain, isliye UI me yaad dilaya jaata hai.
- Drawn sign ki file `data/consent-signatures/<id>.png` me; backup.sh poora `data/` pack karta hai.
- Mandate me `ownerId` khaali, `offPlatformOwner` + `consentId` se owner ki pehchaan.
- GENZ paisa nahi chhoota; owner seedha broker ko deta hai (consent ke words me likha hai).

## Tests
`tests/v27-brokerage-sign.test.ts` (14): terms ka hisaab, initials, password sign, invalid commission, sign ke bina haan refuse, lock, typed sign → publish → mandate ACTIVE, drawn PNG (kharab/kam strokes/SVG refuse, sirf broker + admin ko dikhe), purani listing attach. v26 ke tests me owner ka "haan" ab sign ke saath.

## Dhyan dein
- Browser me asli phone par sign pad abhi dekha nahi gaya (sirf server-side tests). Pehli baar phone par ek baar zaroor try karein.
- Sign + consent ke words ko advocate se confirm karwayein.

## Sold / rented: sab ko "SOLD" dikhe (v27 add-on)
Krishna ne dekha: Edit window me "sold" chunne par error aata tha (`Invalid option: expected one of draft|active|under_negotiation|withdrawn`), kyunki plain edit sold nahi maanta. Aur sold hote hi listing network se gayab ho jaati thi.
- **Edit window:** sold/rented chunne par "kaise bika?" panel (GENZ ke bahar / network se + offer ya deal room, price, note). Negotiation ya kisi bhi status se chalta hai. Server wahi `listings/:id/status` flow chalata hai (24 ghante me undo).
- **Poore network ko dikhta hai:** sold/rented listing brokers ko 30 din tak board par **SOLD / बिक गई** (ya RENTED) badge ke saath dikhti hai (`SOLD_VISIBLE_DAYS`, `canSeeClosedProperty`). View-only: Propose Split, Schedule Visit, Find Matches, Edit band; offer server se hi refuse.
- Final price / note / winning offer sirf owner, listing broker aur GENZ staff ko; baaki brokers ko nahi dikhta.
- Public pages (`/p/`, `/s/`) par sold listing pehle jaisi (poster "sold" dikhata hai); sirf broker board badla.
- Token held ho to GENZ ke bahar sold nahi hota (pehle token refund/release karo) — purana suraksha niyam.
- Test: `v27-brokerage-sign.test.ts` me 2 naye; `v14-market` ka purana "sold feed se hat jaati hai" wala assert badla.
