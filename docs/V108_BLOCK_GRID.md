# V108 — Unit block grid: tower × floor ka nazaara + har block par ghadi

## 0. Kyun
Hold (token + UTR, 2 ghante) pehle se tha, par screen par ek sapaat chip-grid aur ek chhota form tha — "kitna time bacha", "mere kitne block chal rahe", "builder ko pata chala ya nahi" kuch dikhta nahi tha. Ab wahi hold ek saaf **block** flow hai. **Paisa GENZ se nahi jaata** — broker builder ko seedha token deta hai, yahan sirf rasid / UTR likhta hai (record-only, koi payment gateway nahi).

## 1. Kya badla (broker aur builder ko)
| Jagah | Pehle | Ab |
|---|---|---|
| Unit grid | sab ek jaisa grid | **Plan view**: tower = floor ki qatar (upar wali manzil sabse upar, G = ground), har tower ke upar free/total + chhoti status-patti. Plot / villa ka grid waisa hi. **Compact** button se purana flat grid. Pasand device par yaad rehti hai. |
| Blocked unit | "1h 20m left" (haath se refresh) | **Seconds wali live ghadi** (1:59:08), rang badalta hai: amber → gehra amber (30 min se kam) → laal + dhadakta (5 min se kam). Builder ke paas booking request ho to ghadi nahi, "booking" likha. |
| Mere block | kahin nahi | **My blocks** patti: har block ka unit, customer ka pehla naam, ghadi, "3 mein se 2 use hue". Builder ko "On hold now" (sab brokers ke). |
| Unit ka drawer | chhoti line | Badi ghadi + progress bar + samjhauti ("booking request time par na gayi to unit sabke liye khali"); holder / builder ko customer, token, rasid. Doosre broker ko sirf "kab khali hogi". |
| Block karna | drawer ke andar lamba form | **Block sheet**: ① customer chip (jiska block pehle se hai wo band) ② token chip (minimum + 25k / 50k / 1 lakh…) ya khud likho ③ rasid / UTR → ek button "Block for 2 h". Wajah pehle hi batata hai (3 block poore / lead nahi / unit khali nahi). Block hote hi sheet mein ghadi + "ab CRM se booking request bhejein". |

## 2. Server (naya)
1. **Builder ko alert** jab unit block ho: "Unit blocked · A-103 — <broker> blocked A-103 for Meenakshi — token ₹50,000, 2 h". Customer ka sirf **pehla naam**, number ya UTR nahi. Broker ko khud ka alert nahi.
2. **Broker ko 15 min pehle ek baar** "Block ending": `warnedAt` stamp se doosri baar nahi. Khatam hone par "Block lapsed" aur unit sabke liye wapas AVAILABLE. (Bell mein ek unit ki ek hi line — naya purani ki jagah leta hai.)
3. **Har 1 minute** sweep (pehle sirf API call par / ghante mein) — kisi ne screen na kholi ho tab bhi warning aur lapse samay par.
4. Booking-pending hold (ghadi nahi, `expiresAt = null`) kabhi sweep nahi hoti.
5. `caps.holds = { used, max }` — sirf partner ke liye (builder / staff ko nahi); `used` us broker ke sab projects ke block gine, `max` 3.
6. Block ka jawab ab `unit` bhi deta hai (ghadi turant dikhane ke liye).

## 3. Niyam jo badle NAHI
Sirf PARTNER block kar sakta hai; apni hi lead, usi project par; minimum token; rasid ≥ 4 akshar; ek time par max 3 block; ek customer ka ek hi block; doosra broker na dekhe ki kisne / kis customer ke liye / kitna token (sirf `expiresAt`); release sirf holder ya builder. Time-line, audit, lead ki activity wahi.

## 4. Code
- `src/shared/blockGridRules.ts` (naya, pure): `towerRows`, `isTower`, `floorLabel`, `statusCounts`, `clock`, `holdTone`, `holdLeftMs`, `holdElapsed`, `tokenChips`, `canBlock`.
- `src/components/UnitBlockGrid.tsx` (naya): `useNow`, `useGridView`, `ViewToggle`, `UnitCell`, `GroupBlock`, `BlockStrip`, `HoldClock`, `BlockSheet`. Ghadi tabhi tik-tik karti hai jab screen par koi live block ho.
- `src/components/InventoryPanel.tsx`: nayi cheezein jodi, purana inline hold form hata kar "Block this unit" button.
- `server/inventory.ts` (`sweepHolds(now)`, `holdAlert`, `HOLD_WARN_MIN`, `caps.holds`, builder alert), `server/db.ts` (`hold.warnedAt`), `server.ts` (1-minute sweep), `src/lib/api.ts` (`invHold` ka jawab `unit`).

## 5. Tests
`tests/v108-block-grid.test.ts` — 20: tower (floor ka kram, natural sort, bina-floor wali units kabhi gum nahi, tower kab maana jaye), ghadi + rang + progress, token chips, canBlock; server: caps.holds (shuruat, har block / release, doosre ka apna, 3 ki seema, ek customer ek block, jawab mein ghadi), builder alert (pehla naam, UTR / number nahi, broker ko nahi, mana kiye block par koi alert nahi), sweep (40 min par kuch nahi; 10 min par ek warning, dono bhasha; doosri baar nahi; khatam par unit khali + lapse alert; pending hold nahi chhuti), doosre broker ko kya dikhta hai. `tests/helpers/v108-sweep.ts` ghadi aage khiskakar sweep chalata hai (do ghante intezaar nahi). 2 guard hata kar chalaya (once-only `warnedAt`, builder alert) — dono pakde gaye.

## 6. Seemayein
1. Ghadi device ke apne clock par chalti hai; server ka sweep hi asli faisla karta hai (screen ghadi 0 dikhaye aur server 1 minute baad unit chhode — itna fark ho sakta hai).
2. Warning / lapse alert phone par tabhi jo broker ne alerts on rakhe ho aur quiet hours (22:00–07:00) mein bell mein aata hai, phone nahi bajta.
3. Plan view tabhi jab group mein ≥2 floor aur 60% units par floor ho; warna purana grid.
4. Paisa / payment gateway nahi — rasid broker khud likhta hai, GENZ verify nahi karta.
5. "Mere block" patti sirf us project ke block dikhati hai jo screen par khula hai; baaki projects ke liye "3 mein se N use hue" ginti aur ek line ("aapke block doosre project par hain").
