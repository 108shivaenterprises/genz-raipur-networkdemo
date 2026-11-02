# V110 — Broker Copilot (phase 1)

Broker "Today" tab ke upar ek chat-box: ek line likho, bot **plan** banata hai, tum ✅ dabao tab hi kaam hota hai.

## Kaise chalta hai
- `src/shared/copilotRules.ts` — pure parser: Hinglish line → plan (ADD_CLIENT / STAGE / NOTE / CONFIRM_LISTING / SHOW_* / ASK / UNKNOWN). Koi write nahi.
- `src/components/CopilotPanel.tsx` — plan ko confirm card me dikhata hai; ✅ par **wahi existing API** chalti hai (`clientAdd`, `clientStage`, `clientNote`, `confirmListing`). Isliye permission, rate limit, audit sab pehle jaisa.
- Naya server code nahi, naya write-path nahi.

## Kya bol sakte ho
- "naya client Mohan 98260 12345 budget 60 lakh 2bhk Pandri kal 5 baje"
- "Ramesh ko call kiya, kal 5 baje follow-up"
- "Ramesh site visit ho gaya" / "Ramesh ki deal ho gayi" / "Ramesh lost budget kam"
- "aaj ka kaam" / "kiska follow-up pending hai" / "thanda leads dikhao"
- "Pandri wali listing abhi bhi available hai"

## Safety
- Har write par confirm. Naya client: "client ne contact ki ijazat di" tick zaroori (server bhi mangta hai).
- Deal = chetavni. LOST = wajah zaroori. Naam do clients se match ho to pooch ke chunta hai. Number/naam na mile to andaza nahi lagata, poochta hai.
- Office staff (TEAM_MEMBER) ko panel nahi dikhta.

## Aage (phase 2/3)
Builder/Owner copilot (inventory hold/sold, requests), subah ka proactive brief, voice command.
