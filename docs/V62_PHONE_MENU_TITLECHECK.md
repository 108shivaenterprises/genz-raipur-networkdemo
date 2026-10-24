# v62 — Har role ka phone menu + Title Check "mere khule kaam"

Launch audit (`LAUNCH_AUDIT_V58.md`) ki aakhri do kamiyan:
1. **Phone par menu:** sirf broker ke paas neeche 5 bade button aur "More" tha. Baaki sab ke liye upar ek lambi patti thi:
   - superadmin ke 35 tab, admin ke 25, builder ke 14, legal ke 11;
   - KYC ya ID Review tak pahunchne ke liye baar-baar scroll.
2. **Title Check:** ek-ek property kholkar dekhna padta tha ki mere zimme kya baaki hai. "Mujhe kya karna hai" ki koi list nahi thi.

## Kya bana
### 1. Phone menu (6 se zyada tab wale har role ke liye)
Neeche 4 button + **"More"**. More mein sab tab groups mein.

| Role | Neeche ke button |
|---|---|
| Broker | Home · Property · Buyers · Deals (pehle jaisa) |
| Builder | Home · Projects · CRM · Chats |
| Admin | Home · KYC · Vivad · Fees |
| Superadmin | Home · KYC · Vivad · Control |
| Legal | Home · Legal · Title · Kaagaz |
| Owner | Home · Property · Deals · Chats |
| Contractor | Home · Lead · Team · Vivad |
| Baaki | Home + pehle 3 tab |

- **Admin / superadmin ke groups:** Aaj (KYC, ID jaanch, vivad, legal help) · Paisa aur badhat · Listing aur deal · Sales aur team · Control aur record.
- **Bade screen par bhi** wahi groups upar chips mein.
- **Superadmin ke menu se broker ke apne kaam ke tab hate:**
  - Today & Clients, Client Rooms, Visit QR, My Public Page, Rent Desk, Share Kit, Deal Desk;
  - ye uske liye khaali the — member ki screen "view as" se dikhti hai;
  - link se khule to route chalta hai.
  - Menu 35 → 28 tab.
- Team member / buyer (5 tab) ke liye pehle jaisa.

### 2. Title Check → "Mere khule kaam"
Title Check kholte hi upar card, saari properties mila kar. Sirf wahi properties jinka workspace aap khol sakte hain.

| Type | Kya |
|---|---|
| **Samasya** (laal) | jo issue aapko suljhana hai — **der wale aur gambhir pehle** |
| **Jaanchein** | jin checks ke verifier aap hain aur kaagaz aa gaye (UNDER_REVIEW) |
| **Shuru karein** | aapki listing ki deal chal rahi hai (negotiation / agreement / handover), par title check kabhi khula nahi |
| **Kaagaz** | aapki listing, deal chal rahi hai, kaagaz abhi baaki / reject |

- Upar ginti: "1 samasya · 0 jaanchna · 14 kaagaz baaki · 1 shuru karna", aur laal "1 der se".
- **Row dabaate hi** wo property khulti hai aur wo jaanch / samasya scroll hokar peeli line se chamakti hai.
- Kaagaz upload hote hi wo aapki list se hatkar verifier ki "jaanchein" list mein chala jaata hai.

## Tests
- Naya `tests/v62-titlecheck-mine.test.ts` (4 test):
  - **Access:** login zaroori; bahar ka broker kuch nahi dekhta.
  - **Kaagaz:** deal "site visit" par ho to nahi dikhta. Negotiation par aate hi listing wale broker ko dikhta hai, doosre broker ko nahi.
  - **Upload:** kaagaz upload → broker ki list se hata, verifier (legal) ki list mein "jaanchein".
  - **Samasya:** der wali HIGH pehle, aage ki LOW baad mein; ginti sahi.
- Menu UI ka hai, isliye phone par jaancha (390px):
  - admin (Hindi), superadmin, builder, legal (Hindi), owner, broker — har ek ke neeche sahi button;
  - "More" mein sahi groups;
  - team member par patti pehle jaisi;
  - superadmin desktop par 5 group chips;
  - Title Check (Hindi) mein card + row dabaane par samasya tak scroll aur chamak;
  - koi JS error nahi.

## Abhi nahi
- Builder ke staff ke liye alag button (unke 5–6 tab hain, patti theek hai).
- "Mere khule kaam" ka Home tile. Abhi Title Check ke andar; zaroorat ho to Home par ginti.

Files:
- server: `server.ts` (`GET /api/due-diligence/mine`)
- UI:
  - `src/components/NavigationTabs.tsx`, `src/components/DueDiligenceView.tsx`
  - `src/App.tsx`, `src/lib/api.ts`, `src/lib/i18n.tsx`
- `tests/v62-titlecheck-mine.test.ts`
