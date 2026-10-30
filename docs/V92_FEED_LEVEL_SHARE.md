# v92 — Propi-yojana code mein: Network Feed, buyers-waiting alert, broker level (non-RERA bhi), WhatsApp share-to-app

## Bana
1. **Network Feed** (Today group, brokers): naye live+verified ghar aur network par bheji gayi ज़रूरतें (14 din), nayi pehle. Har row par broker ka naam + level (G1–G4) + "RERA no." ya "Local" tag. Aapke liye: "aapke N client is ghar se milte hain → matches" aur "aapke paas N ghar hain → I have it". Client ka naam/number kabhi nahi. `GET /api/feed?kind=all|listings|needs`.
2. **Buyers waiting alert (ulta raasta):** listing verify/live hote hi jin brokers ke client match karte hain unhe push (pehle se tha); ab listing ke broker ko bhi push: "N brokers ke paas aapke naye ghar ka buyer hai" (kaun client — nahi bataya). Admin verify (APPROVE/RESTORE) par bhi chalta hai.
3. **Broker level G1–G4** (`src/shared/brokerLevel.ts`): RERA no. wala ek step upar se shuru (G2), bina RERA wala (local associate) G1; 3 complete deals = +1, 10 = +2. Non-RERA bhi G3 tak chadh sakta hai; use kahin "RERA verified" nahi likha jata. Directory card mein `level`.
4. **WhatsApp se share-to-app:** app ke manifest mein web share target. WhatsApp mein message → Share → GENZ → seedha "WhatsApp se listing" paste-screen, text bhara hua → drafts (purana parser). Phone par app install ho tabhi share list mein dikhta hai.

## Non-RERA broker
Pehle se raasta hai (v15/v18 "Local Associate"): RERA-registered sponsor + invite + PAN/Aadhaar (admin ne asli dekhe) + 30 din probation (chhote caps). v92 mein badla nahi: sponsor wali shart hati nahi hai (kanooni/risk faisla) — `SPONSORS_NEEDED` (`src/shared/networkRules.ts`) se tay hota hai. Ab feed/level mein non-RERA barabar dikhte hain.

## Nahi bana (aur kyun)
- WhatsApp *se seedha receive* / WhatsApp login: Meta Cloud API + approval chahiye (aapne API nahi chaha).
- Builder ke liye area-wise active brokers ka view; chat-first Home — bade kaam, alag version.

## Test
`tests/v92-feed-level-share.test.ts` (4). Pitch PDF / USER_MANUAL untouched.
