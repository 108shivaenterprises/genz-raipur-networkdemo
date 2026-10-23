# v52 — Deals aur Deal room ko saaf kiya: 6 tile → 2, 3 alert bar → 1 card, 10 tab → 4 + "More"

## Kyon
Aapne kaha tha ki dusre apps saaf hain aur hamara confusing. Deals aur Deal room mein ye sab ek saath dikhta tha:
- **Deals ke upar 6–7 KPI tile** (Live, Need my action, Idle, Disputes, Settled, Closed, My share …). Sab ek jaise bade, to pata nahi chalta tha ki pehle kya dekhun.
- **Deal room ke upar 3 tak rang-birange alert bar** ("duty waits…", "site visit verify…", "kuch nahi hua 5 din…").
- **Do side-button hamesha khule:** "Visit ऐप ke बाहर हो चुकी?" aur "Deal did not happen — close". Ye kabhi-kabhi ka kaam hai, par har baar upar dikhte the.
- **10 tab ek lambi row mein** (side mein scroll), jisme se roz sirf 3–4 kaam aate hain.
- Upar `DEAL-… · PROP-… · Requirement: REQ-…` ka lamba code-line, jo koi nahi padhta.

## Kya badla

### 1. Deals (Pipeline)
- Ab **2 bade tile**: **"Need my action"** (ginti) aur **"My share in pipeline"** (jab paise ka hisaab ho) — ya paise na ho to "Live deals".
- Baaki ginti ek **chhoti chip-row** mein: Live · Idle · Disputes · Settled · Closed. **Idle, Disputes, Closed tabhi dikhte hain jab unki ginti zero se zyada ho.** Chip dabane par wahi filter lagta hai jo tile se lagta tha (test-id `hub-kpi-<id>` waise hi).
- "Introducing / Closing" ki do rang wali role-buttons ki jagah ek **dropdown** (All deals / Introducing / Closing).
- Board / List ka toggle phone par sirf icon.

### 2. Deal room — ek "Next step" card
- Pehle har pending kaam ke liye alag bar. Ab **sabse zaruri ek bada card** ("Your next step"), aur baaki **"+2 more"** ke peeche. "+N more" dabane par baaki wahi bar khulte hain.
- Har item ab bhi **wahi tab kholta hai** aur wahi test-id (`next-<kind>`) rakhta hai. Kuch baaki na ho to hari "Nothing waiting on you" line pehle jaisi.

### 3. Deal room — do side-button ab "More actions" ke andar
- Ek chhota **"More actions"** button. Dabane par wahi do button khulte hain (`offline-visit-open`, `deal-close-open`), aur unke form pehle jaise hi.
- Agar koi kaam in dono mein se nahi bachta (deal Settled, ya close/visit pehle se chal raha) to "More actions" dikhta hi nahi.

### 4. Deal room — 10 tab ki jagah 4 + "More"
- **Bar par:** Overview · Chat · Tasks · Agreement · **More ▾**
- **"More" ke andar:** Photos & map · Property Due Diligence · Registry Readiness · Anti-Bypass Rules · Legal Help · Disputes & Commission Holds
- Koi tab hata nahi, sab ke id aur andar ka content wahi hai. **Jis tab mein aapka kaam baaki hai uspe amber bindi** dikhti hai; agar wo tab "More" ke andar hai to bindi "More" par dikhti hai aur list mein us tab ke saamne.
- Jab koi "More" wala tab khula ho, "More" button usi tab ka naam dikhata hai (dark) taaki pata rahe kahan hain.
- Phone par tab ke naam ke saath ginti ("Chat (3)", "Tasks (13)") nahi dikhti, kyunki jagah nahi thi. Badi screen par ginti pehle jaisi hai; "More" ke andar bhi hai.
- Har tab ab 44px ooncha (pehle ~32px) — ungli se dabana aasan.

### 5. Deal room — code-line
- Ab sirf **Deal ID** dikhta hai, saath mein chhota **"All IDs"** button. Dabane par Property ID aur Requirement ID khulte hain.

### 6. Chhoti baatein
- Deal room ke card ki andar ki padding aur beech ki doori phone par thodi kam, taaki ek screen par zyada aaye.

## Kya NAHI badla
- Koi feature, permission, API ya data nahi hata ya badla. Sirf dikhane ka tareeka. Server ka ek bhi file nahi chhua.
- Stage badalne ke niyam, close/reopen, offline visit, bill — sab pehle jaise.

## Imaandari wali baatein
- Phone ka check **desktop browser ko 390px chauda karke** kiya (English aur Hindi dono, tab-row ke liye). Asli phone par nahi.
- Hindi mein sirf tab-row aur deal-room ka upar ka hissa dekha; baaki naye text `tx()` se hi aate hain.
- "More" ke peeche ke tab (Photos, Due diligence, Legal, Disputes) tak pahunchne mein **ek tap zyada** lagta hai. Isi liye amber bindi lagayi hai. Agar aap chahein ki Photos & map bar par rahe to Overview/Agreement mein se ek ko "More" mein bhejna padega, kyunki 390px par 5 se zyada tab nahi aate.
- Local screenshots mein property ki photo test-tasveer hai.
- Asli logo abhi bhi nahi mila, isliye "GZ" box dikh raha hai (v51 jaisa).
- Manual update nahi kiya (aapka standing instruction).

## Tests
- Server/API mein kuch nahi badla, isliye naye server test nahi. Poora suite phir chalaya: **60 files / 882 test pass.** `tsc` aur `vite build` saaf.
- Deploy: commit `d0cde13`, Vercel status success.

Files: `src/components/DealHub.tsx` (KPI tile + chip row, `NextSteps`, naya `SubTabBar`, naya `DealIds`), `DealStatusPanel.tsx`, `DealRoomsView.tsx`.
