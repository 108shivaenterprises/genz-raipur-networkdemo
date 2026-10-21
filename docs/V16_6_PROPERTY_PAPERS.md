# v16.6 — Property Papers: asli file store + app ke andar search

**Kyun.** "Unke properties ke unke khud ke documents toh store karne padenge hi, taaki woh easily app me search kar saken — nahi toh WhatsApp se app me kyu hi aayenge?" Sahi baat: agar registry, khasra, naksha WhatsApp par hi rehte hain to broker/owner ke paas app kholne ki koi wajah nahi. Isliye ab har property ke **asli kaagaz (PDF / photo) GENZ server par store hote hain**, aur app me hi dhoondhe, kholne aur share kiye jaate hain.

GENZ ke niyam jo yahan bhi nahi toote: free for everyone · GENZ paisa handle nahi karta · hi+en · DPDP (consent, phone nahi dikhta, har open ka log) · neutral platform · sirf points-based incentives · jo chal raha tha use nahi toda.

## 1. Kya banaya

**"Property Papers" tab** (naam: *Property Papers / प्रॉपर्टी पेपर्स*) — Owner, Broker, Legal Counsel aur Admin ko dikhta hai.

- **Upload**: ek saath 20 tak PDF / JPEG / PNG / WebP, har file 10 MB tak. Phone ki badi photo browser me hi chhoti ho jaati hai (≤2400px). File ke naam se *title* aur *type* ka andaza apne aap lagta hai (badal sakte ho).
- **16 type**: Sale deed / Registry, Khasra / B-1 / Khatauni, Mutation (Namantaran), Layout map, Floor plan, Title report, Encumbrance, Tax receipt, Utility bill, NOC, RERA certificate, Sanction / OC / CC, POA / Mandate, Agreement, Loan papers, Other.
- **Search** (ek hi box): title, number (khasra/registry/plot), tags, note, file ka naam, type ke English + Hindi shabd (`रजिस्ट्री`, `खसरा`, `नक्शा`…), aur property ka title / locality / city / pincode. Saare shabd milne chahiye. Filter: property, type, "Sab / Meri properties ke / Mere saath share".
- **Kaun khol sakta hai** (default **private**):
  | Kaun | Kya |
  |---|---|
  | Uploader, property ka owner, listing broker | poora control (kholna, badalna, share, delete, log) |
  | Jis member ko naam se share kiya (7 / 30 / 90 din ya bina expiry) | sirf kholna / download; dobara share ya edit nahi |
  | "Deal room ke log" chuna ho | us property ke deal room ke participants |
  | "Poora verified broker network" chuna ho (alag se opt-in) | role BROKER wale sab |
  | Legal Counsel | sirf wahi kaagaz jo Due Diligence item se jude hain |
  | GENZ admin | compliance ke liye khol sakta hai — **log me "GENZ admin" likha aata hai** aur uploader ko dikhta hai |
- **"Kisne khola"** log: har VIEW / DOWNLOAD / share / revoke / **refused attempt** (DENIED) — time, kaun. Sirf manager padh sakta hai.
- **Share karte waqt phone / email nahi dikhte** (sirf naam, role, company, city; "is deal me hai" upar).
- **Delete = asli delete**: file server se mit jaati hai (sirf database ki line nahi).

## 2. Due Diligence se jod

"Add Paperwork" me ab file chun sakte ho; file Property Papers me save hoti hai aur DD item se judti hai. "Open file" link DD list aur preview dono me aata hai. Pehle jaise **sirf link** dena abhi bhi chalta hai (jinke paas file nahi). Default access ab `OWNER_AND_ADMIN_ONLY` hai (pehle zyada khula tha). Access scope ke hisaab se paper ki visibility apne aap set hoti hai.

## 3. Properties screen se seedha

Properties me owner / listing broker ko amber **"Papers / कागज़"** button — Papers tab khulta hai aur wahi property pehle se chuni hoti hai. (Role home pe bhi Owner / Legal ke liye quick link.)

## 4. Security aur privacy

- File ka **asli type magic-bytes se jaancha jaata hai** (naam ya browser ke type par bharosa nahi): sirf PDF / JPEG / PNG / WebP. Galat type → 415; badi → 413; khaali / kharab base64 → 400.
- Browser ko file `nosniff`, `Cache-Control: private, no-store` ke saath milti hai; photo par `CSP: sandbox`.
- Jo paper aap dekh hi nahi sakte uska jawab **404** (pata hi nahi chalta ki hai) aur DENIED log. Dekh sakte ho par manage nahi → 403.
- **Upload se pehle tick zaroori**: "main owner hoon / owner ne ijazat di; Aadhaar / PAN ke number dikhne wali copy nahi daali" (server bhi `attest:true` maangta hai).
- Limits: 10 MB / file · 80 paper / property · 400 MB / member. Rate limit: 80 upload / ghanta, 300 open / ghanta.
- **DPDP erasure**: jab admin kisi member ka ERASURE request COMPLETE karta hai to uske upload kiye aur uski properties ke paper disk se mit jaate hain aur uske diye shares hat jaate hain.
- Disk par file `data/propdocs/<id>.bin`; database me sirf metadata aur SHA-256.

## 5. Asli bugs jo browser check me mile aur theek kiye

1. **File chunte hi list khaali** (kabhi-kabhi): input ko turant `value=''` karne se live `FileList` khaali ho jaata tha, jabki React ka update baad me chalta tha. Ab files pehle copy hoti hain.
2. **Properties ka "Papers" button kaam nahi karta tha**: App `?tab=propdocs` ko pehchanta hi nahi tha. Ab whitelist me hai aur property pehle se select hoti hai.
3. Ek test galat tha: jo paper aap dekh hi nahi sakte uska jawab 404 hona chahiye (403 nahi) — test sahi kiya, server sahi tha.

## 6. Files

- Naya: `server/propdocs.ts`, `src/shared/propDocs.ts`, `src/components/PropertyPapersView.tsx`, `src/lib/paperFile.ts`, `tests/v16-6-papers.test.ts`.
- Badla: `server/db.ts` (PropertyDoc, PropertyDocLog), `server/permissions.ts` (`propdoc:use`: ADMIN, BROKER, PROPERTY_OWNER, LEGAL_COUNSEL; SUPERADMIN ko sab), `server.ts` (mount, parser bypass, DD `libraryDocId`), `server/privacy.ts` (erasure), `src/lib/api.ts`, `App.tsx`, `NavigationTabs.tsx`, `PropertiesView.tsx`, `SecureDocumentUploadModal.tsx`, `DueDiligenceView.tsx`, `RoleHome.tsx`, `ControlCenter.tsx`, `permHi.ts`, `i18n.tsx`.
- API: `/api/property-docs` — `GET /meta`, `GET /`, `POST /`, `GET /:id/file`, `PATCH /:id`, `GET /:id/people`, `POST /:id/share`, `POST /:id/revoke`, `GET /:id/log`, `DELETE /:id`.

## 7. Verify kaise kiya

- `tests/v16-6-papers.test.ts`: 20 tests (upload / type check / access matrix / search / DD / delete / DPDP erasure / bilingual wiring). Poora suite: **359 pass**, 1 skipped (pehle se). `tsc` clean, `npm run build` ok.
- Asli Chromium me: owner ke taur par PDF + photo upload, English aur Hindi search, share, "kisne khola", Amit ke login se khulna (aur usse sirf wahi ek paper dikhna), anjaan broker ko 404, delete, 360px width (Hindi), DD me asli upload + "Open file", Properties → Papers prefill. Hindi me koi English-only line nahi.

## 8. Imaandaari se — jo abhi NAHI hai

- **Search sirf metadata par hai**, kaagaz ke andar ke text par nahi. Scan / photo ke andar "khasra 142" dhoondhna OCR maangta hai (bhaari dependency, kharcha) — **aapka faisla chahiye**. Abhi sahi title / number / tags daalne se search achha chalti hai.
- **Storage server ki local disk** (`appdata` volume) hai — S3 / cloud backup nahi. Volume ka backup aapko lena hoga. Production me object storage ka option baad me.
- **GENZ admin paper khol sakta hai** (compliance). Log me dikhta hai aur uploader dekh sakta hai. Agar aap chahte ho ki admin bhi na khole, to yeh DPDP / dispute review ke raaste ko mushkil karega — aapka faisla.
- **Aadhaar / PAN**: copy dissuade ki gayi hai (warning + tick), par "ID proof" naam ka koi type jaan-boojh kar nahi rakha. Koi chahe to "Other" me daal sakta hai — hum number ko pehchaan nahi sakte.
- **"Poora verified broker network"** wala option ek paper ko saare brokers ke liye khol deta hai — isliye alag, saaf opt-in hai.
- Legal Counsel sirf DD se jude kaagaz dekhta hai.
- Purana **sirf-link** evidence path abhi bhi hai (jinke paas file nahi).
- Pehle se pending faisle: TDS 5% vs 2%, milestone payments, buyer ka "I'm interested".
