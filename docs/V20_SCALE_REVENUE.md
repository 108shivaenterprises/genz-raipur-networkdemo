# v20 — Fast + stable at all-India scale, aur kamaai (Master-CP) + growth numbers

**Kyun.** Krishna: *"explore, check, improve and upgrade every feature of every single role — whats best for GENZ: fast, stable and monetise growth, jisse app ki aur company ki multi-million dollar value bane — usko implement karo."*

**Kaise kiya.** Har role (10 roles) ki har screen browser me chalayi (360 / 1280 px, English + Hindi), aur phir **"ek saal baad" jitna data** banakar server ko us par chalaya: 10,043 users · 40,003 listings · 20,002 buyer needs · 30,006 CRM leads · 10,001 site visits · 3,00,005 audit lines (287 MB JSON = 5,10,962 Postgres rows). Har role ke liye har GET endpoint ka time aur size naapa. Chhote demo data par sab theek dikhta tha — **asli dikkatein sirf bade data par dikhti hain**, aur wahi multi-crore valuation ka technical due-diligence pakadta.

GENZ ke niyam jo yahan bhi nahi toote: free for brokers · GENZ app ke andar paisa nahi rakhta (Master-CP bahi sirf hisaab hai, paisa bank-to-bank bahar) · hi+en · DPDP (koi naam / phone / PAN aggregates me nahi; dusre broker ke client sirf initials) · koi paid service / heavy dependency nahi · naya permission nahi (sab `admin:control_center` / login par) · har tile clickable.

---

## 1. Sabse badi pakad (critical) — Postgres par data save hi nahi ho raha tha
v17 (Network Pulse) ka daily record `{ day, seen, acted }` **bina `id`** ke tha. Postgres store har record ko `id` se save karta hai → pehle login ke baad **har save fail** ("Document in activityDays has no id"), retry loop chalta rehta, aur **restart par us din ke baad ka sab data chala jaata**. JSON-file mode (demo / local) par yeh nahi dikhta tha, aur Postgres test default me skip hota tha.
- **Fix:** record me `id = day`; purane records ko start par id mil jaati hai; Postgres store ab bina-id record ko bhi save karta hai (natural key / position) aur log me ek baar chetavani deta hai — **ek kharab record poori saving kabhi nahi rokega**.
- **Guard test:** server chalakar har collection ke har record me `id` hai — yeh test har baar chalta hai (Postgres ke bina bhi).
- **Aapse:** agar kahin bhi Postgres par live chala hai (v17 ke baad), bata dijiye — data check karna hoga.

## 2. Server ko jam kar dene wali cheezein (bade data par)
| Kya | Pehle (10k users) | Ab |
|---|---|---|
| People list (`/api/auth/users`) — har broker ka trust score har deal / visit scan karke | **5 min se zyada, server jam** (sab users ke liye) | ~0.3 s; ek-pass index, data badalne par hi dobara |
| Match matrix — har listing × har need | **jam + 4 GB memory khatam (crash)**; koi bhi broker kar sakta tha | broker: 0.4 s (sirf apni listing / apne client), admin: ~1–2 s (newest 150 needs, har need ke top 3) |
| Audit trail — poori history har baar + poori chain ka hash dobara | 4 s, **120 MB** response | 0.2 s, 100 line ka page + search; chain incremental check |
| CRM reports | 10 s | 0.4 s (quadratic grouping + har member ka alag scan hata) |
| Team activity / team / incentives | 5.4 s / 1.6 s / 0.8 s | 0.1 s (ek pass) |
| Daily digest (aaj ke match) | 2.2 s | 0.2 s |
| Launch segments, control center, collaborations, site visits | 1–2 s | by-id index (226 jagah `find` → O(1) lookup) |
| Postgres save | har save par **poora data JSON + saari memory double**, server seconds tak ruka | sirf naye audit lines, hash fingerprint, 8 ms ke tukdon me, 500 rows ek query me; 200 writes par p95 23 ms, server ruka max 64 ms |

Postgres par poora 287 MB data: import 10 s, restart par load 12 s, memory ~0.9 GB.

## 3. App jaldi khulti hai (phone + 4G)
- **Pehla download 2.3 MB → 0.4 MB** (gzip 590 KB → 120 KB). Har screen apni alag file me, tabhi aati hai jab khole. Dashboard ke charts (390 KB) numbers dikhne ke baad aate hain. Login ke baad idle time me role ki agli 2–3 screens chupke se aa jaati hain.
- **Start par data:** listings pehle **saari** aati thi (10k par 50 MB). Ab: **meri listings + mere deals / offers / visits wali + network ki nayi 400 (mera shehar pehle)**. Baaki ke liye **server par search / filter, page-by-page** ("Browse all, newest first", "Show more"). Buyer needs bhi waise hi (meri 300 + search), aur "My clients / Network needs" tabs. Broker ka start-up download: **3.4 MB raw / ~106 KB gzip, 0.5 s** (10k users par).
- **People list** chhota card (sirf naam, role, shehar, firm, RERA, tier, trust) — **ETag** ke saath: kuch badla nahi to 304 (lagbhag 0 bytes). Dusron ka referral code / last-login / e-mail / phone ab list me nahi jaata.
- Cards 30-30 karke dikhte hain (sau-sau image cards phone ko dheema karte the). Map ek shehar ek baar (pehle poora Bharat ek jawab — 10k users par lagbhag 15 MB).
- Deal Desk ka property picker ab search box (pehle 40k options ki dropdown).
- Service worker: purani files apne aap saaf (160 tak), offline shell kabhi nahi hatta; ek purana clone bug bhi theek.

## 4. Stable
- **Ek screen tooti to poori app safed nahi hoti** — sirf us screen par "Try again / Reload" card; header, tabs chalte rehte hain.
- Naya version deploy hone par purani screen-file na mile to app khud ek baar reload karti hai (30 s me dobara nahi — loop nahi).
- **Phone ke crash GENZ team tak:** browser error, screen crash, promise error → server (sirf error text, screen ka naam; lambe number `[n]` ho jaate hain).
- **Server:** koi bhoola hua promise ab poora server band nahi karta (`unhandledRejection` log + count); asli crash par data flush karke restart (Docker `unless-stopped`); shutdown 20 s se zyada nahi atakta; hourly kaam (sweeps) me ek fail ho to baaki chalte hain.
- **System health** (Revenue & Growth → System health, superadmin): status, server kitna busy (per minute), memory, slow requests (≥ 1.5 s), server errors, phone crashes, sabse bada data, Postgres saves. Sab memory me, koi bahar ki service nahi.
- **Audit chain:** pehle har restart par toota hua chain chupchap "re-seal" ho jaata tha (database file edit karne wala chhup jaata). Ab sirf **pehli baar** (legacy migration) — uske baad toota chain **toota hi dikhta hai** (Control Center laal). Har ghante poora check.
- Dusre broker ke client ka naam ab **sirf initials** (pehle poora naam dikhta tha — client ko seedha pakadne ka raasta). Match matrix pehle bhi initials deta tha; ab board bhi.

## 5. Kamaai — Master-CP bahi (superadmin → "Revenue & Growth")
Aapka plan: builder se master channel-partner agreement, network ke brokers bechte hain, builder GENZ ko commission deta hai, GENZ broker ko uska hissa deta hai, baaki GENZ ka.
- **Agreement:** builder, projects (GENZ wale chuno ya naam likho), *builder GENZ ko %*, *broker ka hissa %*, TDS dono taraf (default 2% — **CA se pakka karein**, purana "TDS 5% vs 2%" faisla), kitne din me builder dega, "pay when paid" (broker ko tabhi jab builder de de), status: Draft / LOI / Signed / Ended, validity. Ek project par ek hi live agreement.
- **Lines apne aap:** LOI / Signed agreement ke project ki **har approved partner booking** (CRM) bahi me aa jaati hai — rate us din ka. CRM me booking cancel → line cancel (paisa aa chuka ho to broker payout **on hold** + note). GENZ ki CRM ke bahar ki bikri haath se jod sakte hain.
- **Har line:** builder side *bill banana hai → bill bheja (invoice no.) → mila (UTR, rakam)* / write-off; broker side *builder ka intezaar → abhi dena → diya (UTR)* / hold. Paisa hilne ke baad rakam edit nahi hoti.
- **Do baar bhugtan ka khatra:** agar builder ne CRM me usi partner ka brokerage bhi daala hai, line par laal-peela tag; broker ko pay karne se pehle note me pakka karna padta hai.
- **Tiles (sab clickable):** bill banana hai · bill bheja · overdue · mila · broker ko abhi dena · broker ko diya · GENZ net (booked) · cash kept; 12 mahine ki table; **CSV for CA** (formula-injection safe). Har kadam audit trail me.
- **Broker ko:** "My network" me **"GENZ projects se meri kamaai"** — sirf apni lines: hissa, TDS, mila / dena / intezaar. GENZ ka apna rate / margin broker ko nahi dikhta.

## 6. Company ki value — Growth & value (investor / buyer ke sawaal)
Headline: verified brokers + MoM growth, is mahine active brokers + growth, network bikri (12 mahine) + partner share, GENZ net revenue + **take rate**, **members ke zariye aaye naye brokers (k-factor)**, shehar (10+ broker wale), network me GENZ ka hissa. Mahine-dar-mahine table (naye, verified, active, kaam karne wale, bookings, bikri, co-broking, invites, GENZ net), **cohort retention** (jis mahine jude unme se kitne % agle mahino me aaye), top shehar. **CSV (data room)**. Sirf ginti — koi naam nahi.

## 7. Builder pitch — network ki taqat ka link
"Builder pitch" me shehar chuno → verified brokers, RERA wale, unka sales staff, 30 din me active, live listings, localities, buyer needs (type-wise), 90 din ke verified site visits, 12 mahine ki bookings + rakam, lead par pehli call ka median time, kitne builder pehle se. **Link banao** (kiske liye, 7–90 din) → builder bina login dekhta hai, Print / PDF kar sakta hai; **kitni baar khola** dikhta hai; kabhi bhi band. Sirf kul sankhya — koi broker / buyer / owner ki detail nahi.

## 8. Har role par kya badla
| Role | Badlav |
|---|---|
| Broker | jaldi khulna; listings / needs me server search; client naam initials; map shehar-wise; digest tez; GENZ projects ki kamaai card; Deal Desk picker |
| Builder | CRM reports 25× tez; associate list chhoti; team screens tez |
| Team member | team / incentives / reports tez |
| Connector desk | referral list newest 500 + search (total dikhta hai) |
| Admin | audit trail page + search; ID review tile hints Hindi me |
| Superadmin | Revenue & Growth tab (bahi, value, builder pitch, system health) |
| Owner / buyer / legal / contractor | jaldi khulna, crash-safe screens |

## 9. Technical
- Naye: `server/revenue.ts` (`/api/revenue/*`, `/api/public/strength/:token`), `server/health.ts` (`/api/client-errors`, `/api/admin/health`), `src/shared/revenueRules.ts`, `src/shared/valueRules.ts`, `src/components/RevenueGrowthView.tsx`, `StrengthBody.tsx`, `StrengthPage.tsx` (`#/strength/<token>`), `DashboardCharts.tsx`, `TabErrorBoundary.tsx`, `src/lib/lazyView.ts`, `src/lib/clientErrors.ts`.
- `server/db.ts`: `db.version`, `db.byId()`, incremental `verifyAuditIntegrity(full?)`, `settings.auditChainSealedAt`, `activityDays[].id`, naye collections `masterCpAgreements`, `masterCpEntries`, `strengthLinks` (sab optional / migrate — purana data chalta hai). JSON mode me save ka gap pichhli save ke time se, 400 ms se badi file par Postgres ki salah log me.
- `server/pgstore.ts`: append-only `auditEvents` tail, sha1 fingerprint, time-slicing, 500-row batches, shrink / reorder par rewrite, bina-id record safe, `stats`.
- API: `/api/properties` aur `/api/requirements` me `scope=boot`, `limit/offset`, `q`, `total`, `facets`; `/api/audit-logs` me `limit/before/q/entity/full`; `/api/daily/map?city=`; `/api/connector/referrals` me `total/capped`; env `BOOT_LISTINGS` (400), `BOOT_REQUIREMENTS` (300), `SLOW_REQUEST_MS` (1500), `SHUTDOWN_FLUSH_MS` (20000).
- Tests: `tests/v20-scale.test.ts` (12), `tests/v20-revenue.test.ts` (11), `tests/pgstore.test.ts` (+1, asli Postgres par chalaya), v17 test update (record me `id`). Pura suite + browser check (sab roles, 360/1280, en/hi).

## 10. Sach-sach: kya NAHI kiya / aapka faisla
- **Master-CP ka kanooni hissa:** GENZ ka builder ko invoice, GST, TDS dar, broker ke saath sub-CP agreement — **CA + vakeel** se. App sirf hisaab rakhta hai, invoice nahi banata. (v15 me likha tha "entity + CA + lawyer + builder LOI ke baad" — bahi ab taiyaar hai, chalu tab karein jab pehla LOI ho.)
- **Multiple servers (horizontal scale):** abhi ek hi server process (single-writer). 10k users / 5 lakh rows par aaram se chala; lakhs of users ke liye per-request database queries wala bada badlav chahiye — tab tak ek bada VPS kaafi.
- **Owner jiske hazaron listing:** uski apni sab listing start me aati hain (cap nahi lagaya — apni listing kabhi gayab na ho).
- **Crash reports / health** server ki memory me (restart par saaf) — lambe record ke liye log file.
- Purane pending faisle (TDS 5% vs 2% ab bahi me setting hai, milestone payment, buyer "I'm interested", OCR, volume backup, altPhone, non-RERA FULL launch mode, Virtual Tour, Pulse breakdowns, v19: auto-verify se pehle copy zaroori?, alag ID-reviewer role, SMS/WhatsApp notification, retention din) waise hi baaki.
