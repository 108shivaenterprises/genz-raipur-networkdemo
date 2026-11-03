# V113 — Clients ↔ Buyers (Match) ↔ Chat: one client, three places

Pehle teeno alag the. Ab broker + 10-digit mobile se link hote hain (`server/clientlink.ts`).

- **Client card add/edit/stage** → budget ho to Buyers need ban jata hai / sync hota hai. Stage DEAL → need "fulfilled", LOST → "closed".
- **Buyers need (broker-assigned)** → Clients me card ("From Buyers").
- **Chat room**: card ke mobile par room khule to card pe "Chat room open ✓". Sirf-room wale number ka card auto nahi banta — room ka phone sealed (V63) rakhna hai, card me plain padta.
- Room auto nahi banta (client ki consent chahiye) — card pe "Chat room open ✓ / No chat room yet" dikhta hai.
- `GET /api/daily/clients` purana data bhi backfill karta hai (idempotent) aur `needId`, `roomId` deta hai.
- Fields: `ClientCard.requirementId`, `BuyerRequirement.clientCardId`. Test: `tests/v113-client-link.test.ts`.
