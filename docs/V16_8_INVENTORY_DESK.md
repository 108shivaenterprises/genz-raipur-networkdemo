# v16.8 — Inventory Desk: plots / flats ki detail + rate control + "kise kya dikhe" + team + customer link + GENZ launch

**Kyun.** Krishna ke sawaal aur maang:
1. *Reassign Task me deal room ke bahar ke log kyun aa rahe hain, employee kyun nahi?* — bug tha, theek kiya (neeche §1).
2. Builder / developer ke saath jude channel partner ko **khali plot / flat / villa**, builder ka **tay kiya rate**, aur **features** (3-side road, 2-side road, corner, facing…) dikhne chahiye.
3. Builder **tay kare ki kaun dekh payega** aur **rate kam-zyada** kar paye (ek ya bahut saare plots ka).
4. Channel partner apni **team ke saath** plot / rate / features **share** kar sake, aur team ke liye **rate / features hide-unhide** kar sake.
5. Jo bhi tile ho — **clickable**.
6. Builder se GENZ direct sign kare aur channel partner banaye — to **GENZ ke paas launch ka option** ho; aur yeh **RERA wali badi firms / independent broker / bina-RERA wale** — kise dikhana hai, yeh socho.

GENZ ke niyam jo yahan bhi nahi toote: free for everyone · GENZ paisa handle nahi karta · hi+en · DPDP (phone / buyer ki detail kisi unit me nahi, audit log) · neutral platform (GENZ koi commission nahi leta) · sirf points-based incentives · jo chal raha tha use nahi toda.

---

## 1. Reassign Task — bug aur fix
**Kya galat tha.** Reassign ki dropdown me UI **network ke saare users** dikhata tha, jabki server sirf us deal ke logon ko hi manta tha → "deal ke bahar wale" dikhte the aur chunne par error aata tha; aur jo asli log deal me kaam karte hain — **allotted employee** — dikhte hi nahi the (UI ko unka pata nahi tha, aur employee ke paas `task:manage` bhi nahi tha).
**Ab.**
- Naya `GET /api/deals/:id/assignees`: sirf wahi jinhe sach me kaam diya ja sakta hai — **(1)** deal room ke sadasya, **(2)** is deal me lage **employees** (jinka employer deal me hai, chhutti par nahi) — naam + title + employer ke saath, **(3)** panel ke verified legal counsel, **(4)** GENZ desk (sirf jab uske paas us deal ka koi task ho).
- Dropdown ab 4 groups me: *Is deal room ke sadasya / Is deal me lage karmchari / Panel ke qanooni salahkaar / GENZ desk*. Server ka check aur dropdown **ek hi function** (`dealAssignees`) se bante hain, isliye dono kabhi alag nahi ho sakte.
- **Employee** ab apne diye hue kaam **doosre ko hand-over** kar sakta hai, lekin **sirf wahi task jo use khud diya gaya** (baaki 403). Task ka "applicability" badalna employee ke liye band.

## 2. Plot / flat ki detail (builder bharta hai)
Har unit par (sab optional): **kitni taraf sadak** (1–4), **sadak ki chaudai (ft)**, **disha** (8), **size** ("30 x 50 ft"), **tags** (14: Corner, Park facing, Main-road facing, Vastu, Garden / Lake view, End unit, Clubhouse ke paas, Terrace, Penthouse, Covered parking, Servant room, Private garden, Regular shape — max 12), **note** (200 akshar). 3-side / 2-side road alag tag nahi — "kitni taraf sadak" se hi pata chalta hai; 2+ sides par "Corner" apne aap dikhta hai.
- Banane ke teen raaste: **Generate form** (facts ke saath), **ek plot "Edit plot"**, **bahut saare "Select plots → Road / facing / tags"** (tags add / remove, replace nahi), aur **sheet paste** (neeche §5).
- Sab chhoti sahi jaankari — **kisi unit me buyer / owner / phone kabhi nahi**.

## 3. Rate control (sirf builder)
- **Ek plot**: rate + **karan** → **rate history** (last 10) aur audit log (`INVENTORY_RATE_CHANGED`: kisne, kab, kitne se kitna, kyun).
- **Bahut saare plots** (Select plots → "Rate badlo"): 4 tareeke — **% se**, **₹ per unit**, **₹ per sq ft jodo/ghatao**, **naya ₹ per sq ft set karo**. **Pehle Preview** (kaun si plot, kitne se kitna, kaun si chhooti) phir Apply — preview ke bina apply button nahi chalta.
- **Hifazat**: ek baar me **±40% se zyada nahi** (zyada chahiye to dobara karo); rate ₹1,000 tak round (SET per sq ft exact); **HOLD / BOOKED plot ka rate lock** — kabhi nahi badalta, preview me "chhoot gayi" dikhta hai; ₹10,000 se kam / ₹10,000 crore se zyada nahi.
- Optional **"Partners ko batao"** → "Rates revised" update jaata hai (naya rate sirf unhe dikhta hai jinhe dekhne ki anumati hai).

## 4. Kaun dekhega (sirf builder tay karta hai)
- **Project ka default** (card: "Is project ke plot kise dikhte hain") aur **har plot ka apna niyam** (ya "project ka default"):
  **Mere sabhi partner / Sirf chune hue partner / Sirf main** — aur alag se **"partner se rate chhupao"** (unhe "kimat poochho" dikhta hai).
- Chhupi hui plot **partner ke grid, My Projects page, team board, aur customer link — kahin nahi dikhti**, aur partner use **hold ya book nahi kar sakta** (server 404). Pehle partner ka My Projects page koi bhi available unit seedha dikha deta tha — woh chhed band kiya.
- Rate chhupa ho to har jagah `price: null` jaata hai — na grid me, na team post me, na customer link me aa sakta hai.
- Builder ko grid me chhupi plot par ek **eye-off** nishan dikhta hai; filter se "Chhupi / Chune hue partner / Rate chhupa" alag dekh sakta hai.

## 5. Partner ki team
**Team Control → "Plots / flats (inventory)"** (har employee ke liye): **Band** (default) / **Sirf jo main post karun** / **Jo mujhe dikhe sab** — aur teen switch: **rate dekh sakta**, **sadak / disha / khoobiyan dekh sakta**, **customer ko link bhej sakta**. (Builder apne staff ke liye bhi yahi tay karta hai.)
- **Team board** (Inventory tab me): plots chun kar **"Meri team ko dikhao"** → **poori team ya naam chun kar**, post me **rate dikhe / na dikhe**, **khoobiyan dikhe / na dikhe**, note ("is hafte push karo"), kab tak (1 / 3 / 7 din ya jab tak band na karun). Post **band** karne ka button. Isi card me har staff ki unit-access ka table bhi hai (Band / Sirf post / Sab + Rate / Features / Customer link chips).
- **Sabse sakht niyam jeetta hai**: employee ko rate tabhi dikhta hai jab **(a)** builder ne partner se rate nahi chhupaya, **(b)** employer ne uski policy me rate on kiya, **(c)** har live post jo us plot ko cover karta hai usme rate on ho. Ek puraani post naye "rate hide" ko kabhi override nahi karti.
- **Employee ko kabhi nahi dikhta**: leaderboard, commission slabs, doosre partner ke holds, buyer, phone. Employee sirf apne employer ke project / plots dekhta hai, aur chhutti par ya policy OFF hone par grid band.
- Employee ka Inventory tab **tabhi** dikhta hai jab owner ne uski access on ki ho. **Default band** (owner ko on karna hoga — demo me Pooja "Sirf post / rate nahi" aur Rakesh "Sab / rate / link" par set hain, sirf fresh demo DB me).

## 6. Customer ko bhejna (link / WhatsApp)
Plots chun kar (ya ek plot ke drawer se) **"Customer ko bhejo"**:
- **Rate dikhao ✓/✗**, **sadak / disha / khoobiyan dikhao ✓/✗**, customer ka naam (sirf aapke liye), bhasha (en / hi).
- Aap sirf wahi **ON** kar sakte ho jo **aapko khud dikhta ho** — chhupa rate kabhi nahi dikha sakte (aur "kuch dikhana tha par chhoot gaya" ka note aata hai).
- Natija: **link** (copy), **message copy** (WhatsApp-ready text + link), **WhatsApp kholo**, **Preview**; ya sirf **text copy (bina link)**.
- Link ka page **live** hai: sirf **abhi bhi available + abhi bhi dikhne layak** plots, "bik gayi / hold par" ka counter, sab bik jaye to "ab available nahi". Rate / features tabhi dikhte hain jab **link ka flag ON ho AUR bhejne wale ko aaj bhi dikhte hon**. Upar sharing firm ka contact card.
- **Employee ka link** employer ki firm ke naam se jaata hai, aur **employer use band kare / chhutti par bheje / policy OFF kare to link mar jaata hai**.
- **"Mere customer links"** card: har link ke views, copy, **revoke**; employer ko apne staff ke links bhi (kisne banaya, kitne views — customer ki pehchaan kabhi nahi).
- Rate-limit: 60 link / din.

## 7. Baaki chhoti-badi baatein (sab clickable)
- **Status tiles** (Sabhi / Available / Hold / Booked / Reserved) **clickable** — grid ko filter karte hain.
- **Filters**: number khoj, group, type, disha, sadak ki taraf (1 / 2 / 3+), rate range (₹ lakh), khoobiyan (chips — sirf wahi jo grid me hain), builder ke liye visibility.
- **Plot tile clickable** → drawer: size, rate + ₹/sq ft, sadak / disha / tags / note, hold-release (partner), reserve (builder), **Edit plot / Kise dikhe / Rate badlo / Customer ko bhejo / Team ko dikhao / Jaankari copy**.
- **"Select plots"** mode: tick-tile, "dikhti sabhi chuno", sticky action bar.
- **"Meri screen par rate chhupao"** — customer saamne baitha ho to ek tap me saare rate chhup jaate hain (sirf screen par).
- **Sheet paste (Excel / Google Sheets → CSV)**: header ke saath rows paste → naye label jodte hain, purane (jo hold / book nahi) ka rate + facts update; **ek bhi row galat to kuch save nahi** (row-wise error list); max 500 rows; template download.
- **Partner "My Projects"** me available units ab tile-button hain (kholne par poori detail), rate nahi dikhna ho to "kimat poochho".

## 8. GENZ ka launch (builder se seedha tie-up)
**Principle.** GENZ builder ke project ko network par **builder ki "haan" ke bina launch nahi kar sakta**; **free**, **GENZ commission nahi leta**, aur **har partner ko builder hi manzoor karta hai**.

**Teen group** (GENZ desk dekh sakta hai — naam + shehar + staff ginti, **phone / email nahi**):
| Group | Kaun | Kya dikhta hai |
|---|---|---|
| **Badi RERA firms** | RERA no. darj **aur 5+ active staff** (ya desk ne "badi firm" tay ki) | project, units, shartein — **apply kar sakti hain** |
| **Independent RERA broker** | RERA no. darj, akela / chhoti agency | wahi, **desk ki tay ki tareekh se** |
| **Local associate (bina RERA)** | Tier-2, vouched | **sirf jhalak (teaser)**: naam, jagah, tareekh — **rate, unit, commission, apply nahi** |

**Faisla (aur kyun).** Bina-RERA walon ko **bikri ki khidki kabhi nahi** — RERA kanoon ke hisaab se registered agent hi bechta hai, aur GENZ ka purana Tier-2 niyam bhi yahi hai. Isliye "local" ko sirf **teaser** (ya band). Desk badi-vs-independent ko **override** kar sakta hai, lekin **RERA tier override nahi** hoti (bina RERA wale ko RERA group me nahi daal sakte).

**Flow.**
1. **GENZ desk → Launch Desk** (naya tab): project par **"Builder se anumati maango"** (note ke saath) — ya builder khud **"GENZ ko launch ke liye bulao"**.
2. **Builder → Project Control** ke upar **"GENZ network launch"** card: **Haan / Mana / Anumati wapas lo**. Wapas lene par launch band, history me likha.
3. **Haan ke baad hi** desk **plan** banata hai: har group ke liye **on/off + kab se** (lehar-dar-lehar: "badi firms abhi, baaki 3 din baad"), local ke liye Off / Jhalak, headline, note. Phir **Live / Roko / Band**.
4. **Live** hone par bina-mandate wale partner ko project **sirf uske group ki tareekh aane par** dikhta hai (My Projects ke upar **"GENZ ki nayi launching"** strip: Abhi khula / Khulega <tareekh> / Jhalak) — aur **apply route bhi usi gate se**. Mandate wale partners par koi asar nahi.
5. Live ke liye project ka status **Active launch / Pre-booking** aur **"apply ke liye khula"** hona zaroori (invite-only ho to builder se kholne ko kaha jaata hai).
6. Har kadam audit log me (`LAUNCH_REQUESTED / CONSENT_GRANT / PLAN_SET / LIVE / PAUSED / CLOSED / SEGMENT_SET`).

## 9. API (naye / badle)
`GET /api/deals/:id/assignees` · `PUT /api/inventory/units/:uid` (facts, vis, rate+reason) · `POST /api/inventory/projects/:id/units/bulk` (`RATE` dryRun / `VISIBILITY` / `FEATURES` / `STATUS`) · `PUT /api/inventory/projects/:id/visibility` · `GET /api/inventory/projects/:id/partners` · `POST /api/inventory/projects/:id/units/import` · `GET/POST /api/invdesk/posts`, `POST /posts/:id/end` · `GET/POST /api/invdesk/shares`, `POST /shares/:token/revoke` · `/api/launch/admin/*` (projects, segments, request, plan, status) · `/api/launch/builder/*` (projects, consent) · `GET /api/launch/feed`. Naye permissions: `inventory:share`, `launch:manage`, `launch:read` (+ Hindi line har ek ki).

## 10. Files
- **Naya**: `src/shared/inventoryRules.ts`, `src/shared/launchRules.ts` (server + browser + tests ka ek hi niyam), `server/invaccess.ts` (kaun kis unit ko kis roop me dekhe — ek jagah), `server/inventory2.ts` (team board + share), `server/launch.ts`, `src/components/InventorySheets.tsx`, `src/components/LaunchDesk.tsx`, `tests/v16-8-inventory-desk.test.ts` (45 tests).
- **Badla**: `server.ts`, `server/{access,db,permissions,pcontrol,crm,share,inventory}.ts`, `src/shared/pcontrolRules.ts`, `src/lib/{api,permHi,i18n}`, `InventoryPanel.tsx` (poora naya), `DealRoomsView.tsx`, `TeamControl.tsx`, `CrmView.tsx`, `MyProjectsView.tsx`, `ProjectControlView.tsx`, `NavigationTabs.tsx`, `App.tsx`; `tests/v16-6-papers.test.ts` ka cleanup retry (purana flaky teardown).

## 11. Verify kaise kiya
- Poora suite: **439 pass**, 1 skipped (pehle se; 394 purane + 45 naye). `tsc` clean, `npm run build` ok.
- Asli Chromium (360px aur 390px, Hindi + English): partner ne status tile se filter kiya, "3 ya zyada taraf sadak" filter, plot drawer, 2 plot chun kar customer link banaya (rate ON) aur public page khola; builder ne project-visibility sheet kholi, 3 plot ka +5% rate **preview → apply** kiya, ek plot "Sirf main" kiya — aur partner ke grid se woh plot **sach me gayab** mili; employee (Hindi) ko sirf posted plots, rate ki jagah "poochho", aur koi builder button nahi; admin ne Launch Desk me request bheji → builder (Hindi) ne "Haan" kiya → admin ne plan save karke Live kiya → partner ke My Projects par "GENZ ki nayi launching" strip aayi. Koi horizontal scroll nahi, koi English-only line nahi (sirf project / vyakti ke naam, aur server ki purani audit-history ki lines jinka Hindi ab UI me jaata hai).
- Reassign modal: deal me ab 4 groups, employee Pooja (Telecaller) dikh rahi hai, network ke bahar ka koi nahi.

## 12. Imaandaari se — jo abhi NAHI hai / aapko tay karna hai
- **Bina-RERA walon ka "full selling window" nahi banaya** (sirf teaser). Agar kisi **bina-RERA project** (jaise sirf plotted layout jise RERA ki zaroorat nahi) ko local associates ko poora bechne dena ho to alag "FULL" mode chahiye — **batao, tab banate hain** (kanooni salah ke saath).
- **"Badi firm" ki paribhasha** = RERA + 5+ active staff (ya desk override). Sankhya badalni ho to ek constant hai (`BIG_FIRM_STAFF`).
- **Employee ka unit-access default BAND** — owner ko Team Control me on karna padega.
- **Chhupa hua rate kisi bhi raaste se employee / customer ko nahi jaata** — par agar partner kisi customer ko **zubaani** rate bata de, GENZ use rok nahi sakta.
- **Rate badalna ek baar me ±40%**; zyada ke liye dobara karo. **HOLD / BOOKED ka rate lock** hai.
- **Customer link kisi ka naam / phone nahi maangta** (DPDP) — sirf "kitne views"; kaun-sa customer, GENZ ko pata nahi.
- **Waves tareekh se chalti hain** (alag scheduler nahi) — Launch ko "Live" karte hi lagu, tareekh aane par apne aap khulti hain.
- Launch me **GENZ desk ka koi commission / fee nahi** — agar kabhi chahiye to alag niyam + consent chahiye.
- Pehle se pending faisle: TDS 5% vs 2%, milestone payments, buyer ka "I'm interested", OCR (v16.6), volume ka backup, aur v16.7 ka doosra phone number (altPhone) — jaan-boojh kar chhoda.
