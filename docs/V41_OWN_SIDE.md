# v41 — "Apna-apna side" (buyer side tumhara, seller side hamara)

Kabhi do broker bina baantwaare ke kaam karte hain: buyer-side broker apne buyer se fees leta hai, seller-side broker apne seller se. Pehle app me sirf % split tha. Ab har offer / counter me do tareeke hain.

## Do tareeke (har deal me chuno)
- **Split (%)** — pehle jaisa: ek kul brokerage, introducer/closer % me baant-te hain.
- **Apna-apna side (OWN_SIDE)** — koi split nahi, koi kul brokerage nahi.

## Kaise chalta hai
1. Offer banate waqt (Modals → Collab proposal) "Apna-apna side" chuno aur batao aap seller side ho ya buyer side. Property ka listing broker hamesha seller side hota hai; galat side chunne par `SIDE_MISMATCH` (400).
2. Samne wala accept kare, ya % split offer ko "Apna-apna side" se counter kare (`counterFeeMode: OWN_SIDE`, `mySide`). Wapas % split se bhi counter ho sakta hai.
3. Deal room banta hai `feeMode: 'OWN_SIDE'`, `sellerBrokerId`, `buyerBrokerId`; `totalCommissionExpected` aur % = 0.
4. Commission-agreement tab me `SideFeePanel`: har broker sirf APNI fees (whole ₹) likhta hai, ek line ka undertaking sign karta hai ("sirf apne client se, doosre ke client se seedha deal nahi, 30 din ki suraksha dono par"), aur apne client se mila paisa (UTR/date) khud likhta hai. Koi dusra confirm nahi karta.
5. Dusre broker ko sirf "usne fees likhi / ho gaya" (true/false) dikhta hai, rakam kabhi nahi. Audit trail me bhi rakam nahi jaati.

## Privacy / paisa
- API: `GET /api/deals/:id`, dashboard aur timeline broker ko sirf uski side deti hain (`shapeSideDeal`); owner, legal, bina-dispute admin ko side data nahi milta (`stripSideData`). Dispute khulne par hi admin dono side dekhta hai.
- Dispute khula ho to fee/undertaking/received freeze.
- GENZ ka paisa nahi rukta. Agar admin ne GENZ fee set ki hai to wo broker ke likhe "received" par lagti hai (`BROKER_DEAL`).

## Files
`src/shared/sideFees.ts`, `server/sides.ts` (`/api/deals/:id/sides`, `/fee`, `/undertaking`, `/received`), `server.ts` (offer + counter + deal room), `src/components/SideFeePanel.tsx`, `Modals.tsx`, `DealRoomsView.tsx`, `DashboardView.tsx`, `tests/v41-own-side.test.ts` (9).
