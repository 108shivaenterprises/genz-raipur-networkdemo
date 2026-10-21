# v37 — Deal Hub (Deals / Deal Room / Mandates / Client Rooms redesign)

## Deals tab ("Deal Rooms & Splits")
Upar ek switch: **Pipeline · Deal room · Collab proposals · Mandates**.
- **Pipeline (naya home):** KPI tiles: chalu deals, mera kaam baaki, pipeline me mera hissa, 14+ din ruke, vivad, nipte. Har tile clickable filter hai.
  - **Search:** property, ilaka, deal ID ya dusre broker ke naam se.
  - **Role chips:** "Kharidar main laya" / "Meri listing".
  - **Do view:** Board (stage-wise columns) ya List. Choice yaad rehti hai; phone par list se shuru hota hai aur board me khali stage chhup jaate hain.
  - **Card:** property ka naam, ilaka, stage progress, dusra broker, mera hissa aur pehla agla kadam. Card dabane par deal room seedha usi section par khulta hai jo kaam baaki hai.
- **Deal room:**
  - **Stage stepper:** Lead → Settled; deal broker step dabakar stage badal sakta hai (confirm ke saath).
  - **"Aapke agle kadam":** vivad, agreement manzoor karna, duties accept karna, visit verify karna, overdue duties, check karni duties, payment confirm karna, agreement nahi bana, duties poori karni, 14+ din se kuch nahi hua. Har line sahi section kholti hai.
  - **Deal badalna:** Pichhli/Agli deal ke buttons, aur left list me search; phone par deal switcher (wapas, select, ‹ ›).
  - **Sub-tabs:** scroll hote hain, aur jahan kaam baaki hai wahan peela dot.
  - **Responsibility matrix filters:** Sabhi / Meri / Baaki / Tareekh nikli / Mujhe jaanchni (count ke saath). Agle kadam se aane par sahi filter khud lagta hai.
- **Mandates (naya):** saare owner ⇄ broker mandates ek jagah.
  - **Tiles:** Active, broker ke sign baaki, 7 din me suraksha khatam, khatam/wapas, aur maangi keemat par meri brokerage.
  - **Card:** terms, asking price, brokerage, aur suraksha progress bar (kitne din baaki).
  - **Buttons:** "Open mandate" (purana MandateModal: sign/withdraw), aur usi property ka deal room button.

## Client Rooms
- **Upar:** KPI tiles (khule room, naye sandesh, visit anurodh, code ka intezaar, pasand ki gayi property), har ek filter. Search (naam / aakhri 4 ank) aur kind chips (Buyer/Renter/Tenant/Other).
- **Layout:** bade screen par 2 pane (rooms | khula room, pehla room khud khulta hai). Phone par list → room (wapas button, room khulne par tiles chhup jaate hain).
- **Room ke andar tabs:**
  - **Chat:** neeche tak khud scroll, aur 5 quick replies (hi/en).
  - **Homes:** share ki gayi property aur nayi jodna.
  - **Visits:** saare visit anurodh ek jagah.
  - **Info:** nijee note, link kab tak, aur room me kya hua (timeline).
- **Baaki:** "Ye room kya hai" box ab khulne/band hone wala hai.

## Server
`GET /api/deal-hub` (`server/dealhub.ts`, perm `deal:read`) — /api/deals jaise hi niyam:
- **Kaun dekhta hai:** list sirf participants, legal aur admin ko.
- **Paisa:** fee, split aur mera hissa sirf dono deal brokers ko (aur admin ko jab dispute khula ho).
- **Andar ki ginti:** tasks, agreement, chat aur visits ki ginti admin summary-view me nahi.
- Koi data nahi badalta.

## Tests
- `tests/v37-deal-hub.test.ts` (3): har role ke liye wahi deal list, broker ko money aur next steps, owner/legal/admin ko money nahi.
- Full suite 828 pass.
- Browser check: broker, owner aur admin ke saare mode, cards, sub-tabs, next steps aur task filters, desktop aur phone dono par; koi screen nahi giri.
