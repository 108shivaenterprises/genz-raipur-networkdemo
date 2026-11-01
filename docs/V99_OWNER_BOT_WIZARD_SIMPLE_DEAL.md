# V99 — Owner listing bot · Broker wizard · Simple deal room · Non-Raipur demo

## Kya naya hai (chaar kaam)

### 1. Owner QR scan → bot khud listing ke sawal poochta hai (GENZ सहायक)
Shop-QR par koi **ghar bechne / kiraye par dene wala (owner)** scan kare aur ✅ dabaye, to bot ek-ek sawal (zyada tar ek tap) poochta hai aur **ek DRAFT** bana ke broker ko de deta hai.

| Sawal | Kaise |
|---|---|
| Property type | chips (flat, makaan, plot, khet, dukan, office, godown) — form mein pehle se ho to nahi poochta |
| BHK | 1–5 chips (sirf ghar/flat/villa/builder floor/penthouse ke liye) |
| Size | "1150 sqft", "40x60", "2 acre", "200 gaj"; sirf "950" likhe to sqft maana jaata hai |
| Manzil | chips ya "3rd floor" |
| Keemat / kiraya | form wala number wapis dikhata hai — "✔ haan, yahi"; "40" ya "15k" jaisa galat/chhota sale-rate nahi maanta, wapis poochta hai |
| Furniture | sirf rent par |
| Kab se khaali | chips |
| Pata (gali/makaan no.) | phone number likhne par mana; sirf broker ko dikhta hai |
| Kagaz | registry / loan / kuch kagaz / pata nahi |

- Har sawal par **"पता नहीं / बाद में"** — broker baad mein puchh leta hai.
- **Draft pehle jawab se hi ban jaata hai** (owner beech mein chala gaya to bhi kuch nahi khota) aur har jawab ke saath update hota hai. **Broker ne jo title/keemat/kuch bhi theek kiya, bot use kabhi overwrite nahi karta** (`botSet` — bot sirf khaali ya apni likhi hui jagah badalta hai).
- Public title/description **bina pata, naam, number** ke bante hain ("2 BHK Flat for Sale in Baner").
- Owner kisi bhi waqt **"status?"** poochh sakta hai ("mera listing kab tak lagega?") — jawab asli haalat se aata hai: draft taiyaar / ab tak N cheez baaki / approval link bheja gaya / aapki haan mil gayi / lisiting live.
- Same owner dobara scan kare to **doosra draft nahi** banta.
- **Zaroori hadein (badli nahi):** draft kabhi apne-aap live nahi hota; owner ki "haan" (consent link) aur mandate broker ke haath mein hi rehte hain; photo/kagaz chat mein nahi liye jaate (chat text-only) — bot bata deta hai ki broker alag se maangega.
- Broker ko lead card par badge ("owner sawal ka jawab de raha hai") aur **"Open the draft listing"** button milta hai.

### 2. Broker ke liye "सवाल-जवाब से भरें" (Drafts mein)
Kisi bhi khuli, unlocked draft mein ab upar ek hara card: wahi sawal, ek-ek karke, chips + type, progress bar (3/10), **Undo**, aur aakhri sawal par title/description khaali ho to khud likh deta hai ("इन जवाबों से शीर्षक और विवरण लिखें" button hamesha). Paste-wali draft mein aksar **owner ka naam + mobile** khaali rehta hai — uska bhi aakhri sawal hai ("रमेश 9876543210" — naam aur number ek hi line mein padh leta hai; +91, space, dash chalte hain). Kuch save nahi hota jab tak broker Save/"ask owner" na dabaye.

### 3. Dealroom — "सरल" view (default)
Dealroom mein dus section the; ab khulte hi **सरल** view dikhta hai:
- Upar pehle jaisa: stage + "आपका अगला कदम".
- **एक नज़र में**: doosra broker, deal ki keemat, mera hissa, visits (N mein se M hui), duties, suraksha ke din bache, aakhri halchal.
- **6 bade button**: चैट · कौन क्या करेगा · समझौता · फ़ोटो और काग़ज़ · काग़ज़ों की जाँच · रेट और हिसाब (amber dot jahan aapka kaam baaki hai).
- "पूरा डील रूम खोलें" — purana poora view **ek tap door**. Upar **सरल | पूरा** switch; choice yaad rehti hai (localStorage).
- Kisi bhi section ka link / "agla kadam" tap / pipeline card jo kisi tab par khulta hai → seedha **poora** view us section par. GENZ admin ka summary view hamesha purana rehta hai. Jinhe commission dekhna mana hai (owner/team) unhe "समझौता"/"रेट और हिसाब" button nahi dikhta.
- Kuch hataya nahi: v83 ke saare test-ids aur section waise hi.

### 4. Naye demo IDs (Raipur ke bahar)
`SEED_DEMO_DATA + SEED_DEMO_BULK` ke saath (public demo mein bhi) — sab **FAKE** data, password wahi demo password:

| Shehar | Broker | Owner | Buyer | Listings |
|---|---|---|---|---|
| Pune, Maharashtra | `USR-BRK-PUN` Mahesh Kulkarni (Baner Homes Pune) | `USR-OWNER-PUN` | `USR-BUYER-PUN` | `PROP-PUN-001…005` (Baner, Kothrud, Wakad, Viman Nagar, Hinjewadi) |
| Indore, Madhya Pradesh | `USR-BRK-IND` Pooja Chouhan (Vijay Nagar Realty) | `USR-OWNER-IND` | `USR-BUYER-IND` | `PROP-IND-001…005` |
| Jaipur, Rajasthan | `USR-BRK-JAI` Rajesh Meena (Pink City Properties) | `USR-OWNER-JAI` | `USR-BUYER-JAI` | `PROP-JAI-001…005` |

Har shehar mein: 2 sale flats, 1 rent flat, 1 dukan (rent), 1 plot. Ye accounts demo login list mein khud aa jaate hain.

## Technical
- `src/shared/listingAsk.ts` (naya): pure engine — `nextAsk / applyAnswer / progress(f, skipped, withOwner) / composeListing / summaryLine`. Teen jagah ek hi rules: bot (owner chat), broker wizard, tests. Ask ids: ptype, bhk, area, floor, price, furn, avail, address, papers, **owner** (sirf broker wizard mein; owner chat mein naam/number pehle se pata hai).
- `server/sahayak.ts`: `startInterview / askNext / answerAsk / keepDraft / finishInterview / ownerStatus`; chip ids `ASK:<qid>:<chip>`, `STATUS`, `ASKGO`; intent `STATUS`. `server/db.ts`: `LeadBot.interview`.
- `server/consent.ts`: `saveOwnerChatDraft()` (dedupe: leadId, ya phone+kind+same locality; `botSet` overwrite-guard); `draftFields` zod mein floor/furnishing/availableFrom/papers/papersNote/priceConfirmed/dimensions.
- `server/shopPartners.ts`: `ownerFacts(l)`, `draftState(l)`.
- UI: `src/components/ListingQuickAsk.tsx`, `DealSimple.tsx` (naye); `ListingDrafts.tsx`, `DealRoomsView.tsx`, `ShopPartners.tsx` (chhote badlav).
- `server/demoCities.ts` (naya) + `db.ts` mein seeding call.
- Tests (naye): `v99-listing-ask` (16 — pure), `v99-owner-listing-bot` (14 — real HTTP, Pune), `v99-demo-cities` (7 — Pune buyer match, Jaipur renter match, Indore owner draft), `v99-deal-simple` (6), `v99-paste-rent` (8).

### 5. V99.1 — "sab check karo" ke baad ek fix
- **Paste parser (WhatsApp forward se draft)**: kiraye ka seedha number ab padha jaata hai — "3 BHK for rent Baner Pune 18000", "2bhk Kothrud 15000 per month" → ₹18,000 / ₹15,000. Sirf 4–5 digit (₹2,000–₹99,999), sirf jab transaction *Rent* ho, aur sirf jab text mein ek hi aisa number ho. Area (sqft/sq ft), BHK, floor, pincode, phone ke saath wale number kabhi rent nahi maane jaate; 6 digit ya do-do number mein andaza nahi lagata. `bareRent()` in `src/shared/waParse.ts`; "need" paste (`findBudget`) mein bhi rent-context ke liye.
- **Hindi (Devanagari) shehar ka naam**: "जयपुर, पुणे, इंदौर, रायपुर, भोपाल, नागपुर…" ab city + state pehchante hain. (Mohalla/locality Devanagari mein abhi nahi padha jaata — wizard puchh leta hai.)
- Test: `tests/v99-paste-rent.test.ts` (8).
- Jo dekha aur theek mila: Simple dealroom — English, 1280px desktop, owner, team member, admin, buyer, aur Pune broker ka khaali dealroom (koi error/overflow nahi); broker wizard English mein; lead-card par "📝 मालिक से सवाल चल रहे हैं (x/9)" badge + "ड्राफ़्ट लिस्टिंग खोलें" button (click → wahi draft khulta hai).

## Imaandari wali baatein / baaki
- **Bhasha abhi Hindi + English hi.** Marathi/Gujarati/Tamil… nahi — agla bada kaam; batayein kaun si pehle.
- Bot **photo/kagaz nahi leta** (chat text-only) — sirf batata hai ki broker alag se maangega.
- Owner ke jawab "jaise likhe waise" maane jaate hain; ghalat ho to broker draft mein theek karta hai (owner ki haan **draft ke tathyon par** hi li jaati hai, isliye consent ke baad type/shehar/locality badalne ke liye pehle request wapas leni padti hai — purana rule).
- Demo city shops (QR) seed nahi kiye — QR/OTP/partner-accept ka asli flow dikhana tha; test ye flow chalate hain. Pune/Indore/Jaipur ke liye demo **buyer requirement/deal rooms** abhi nahi banaye.
- Simple deal room ka "doosra broker / mera hissa" jaisa data Deal Hub se aata hai — jahan hub ko hissa nahi pata wahan wo fact chhup jaata hai (kuch bana ke nahi dikhata).
- Asli phone par test nahi hua; screenshots 390px browser mein.
- Pitch PDF aur USER_MANUAL **nahi chhue** (aapke kahe anusaar).
