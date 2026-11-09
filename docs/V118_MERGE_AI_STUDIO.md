# V118 — AI Studio wali zip ka merge (genz-broker-network.zip, 9 Nov)

## Kaise milaya
- Zip **3 Nov wale base** (jo AI Studio ke liye diya tha, V113f) se bana tha. Isliye 3-way merge kiya: base → hamara (V117 tak) → aapka (AI Studio).
- AI Studio ne 56 files badli thi aur 22 nayi joda thi. Isme se 53 files bina takraav ke mil gayi; 3 me conflict tha (profiles.ts, ProfilesView, IdReviewView).
- Har badlaav padh ke dekha. Jo sahi tha wo liya; jo nakli, galat ya unsafe tha wo hold par rakha (neeche list).
- Test: Postgres ke saath full suite, **153 files / 2152 tests pass**. TypeScript aur build saaf. Phone par screenshot se UI dekha.

## Kya liya (live)
- **App ke andar ka dialog** (`lib/ui.tsx`): browser ke `alert / confirm / prompt` ki jagah app ka apna toast aur confirm box, ~40 screens par.
- **Search / Ctrl+K command palette**: upar search icon; sirf woh screens dikhti hain jinki aapko permission hai.
- **CommandDock** (neeche daayein ⚡ button): Search, Magic Match, Deal rooms, Lead, Visit QR. Phone par labels pehle chhupe the (sirf hover par dikhte the), ab hamesha dikhte hain.
- **Smart Paste (CRM)**: WhatsApp/portal ka message paste karo → naam, mobile, budget, BHK, ilaka apne aap bhar jaata hai. Ye regex hai, AI nahi. Sample Raipur ka kar diya.
- **Quick call logger**, CRM card par WhatsApp/call aur "agla stage" button. Call ka button masked number par nahi dikhta.
- **Form checks**: mobile (6-9 se, 10 ank), PAN, GSTIN, UPI, rakam; Onboarding, Clients, Connector, DealDesk aur EditProperty par.
- **Error par "Retry"** (Match, Dashboard feed, Audit) aur modal Esc se band. Dialog roles aur aria jode.
- **Client room**: khaali room me intake message (ilaka, budget, prakar, source shop) aur bot ki puraani baatcheet. Sahayak ke naye message bhi room me jaate hain.
- **Shop partners**: "Portal link bhejo" aur "Dukaandaar ko update" ke WhatsApp buttons.
- **Server fixes**: boot sweeps ab ek-ek karke try/catch me (ek fail ho to server nahi rukta); listing approve par suspended → active; khaali naam par crash nahi; scrypt N check; rent PDF null-safe; owner "created" flag sahi; chunked body.
- Property photos upload se pehle compress hoti hain; Deal list search debounced hai.

## Kya NAHI liya (hold) aur kyun
| Feature | Dikkat |
|---|---|
| Virtual proxy call (`/api/proxy`) | Users ko "+91 80 4719 8200 dial karo + PIN" bolta tha. Ye number GENZ ka nahi hai, aur koi telephony judi nahi hai. Asli masked call pehle se hai (in-app calls, V81). |
| SIM binding (`/api/sim`, card) | Browser ya PWA SIM ka ICCID padh hi nahi sakta. Ye sirf dikhawa tha. |
| Anti-bypass seal (`/api/anti-bypass`, modal) | Secret key code me likhi thi, isliye seal koi bhi bana sakta tha. Owner ke phone ka hash 10-digit number hone se toot jaata hai (number leak). Koi bhi broker kisi bhi property par claim kar sakta tha. |
| "PROPi RADAR" ticker | Har screen par Mumbai (Bandra/Worli) ke banaye hue "live" sauday dikhata tha. |
| Zaphalo WhatsApp bot panel | "Bot ACTIVE", "MahaRERA" dikhata tha, jabki koi bot juda hi nahi tha. |
| Naya ProfilesView + vCard | Data na ho to nakli numbers ("₹3.85 Cr GMV", "14 listings") aur nakli RERA "MAHARERA/PRM/…" dikhata tha. V117 wala profile hi rakha. |
| Photo instant-approve | Client `instant:true` bhej ke GENZ ka photo check skip kar sakta tha. |
| Chat me number kaatna (scrub) | Har message se mobile, email aur UPI chupchaap kaat deta tha, broker ko bataye bina. |
| Password `sessionStorage` me | Login password tab me padha ja sakta tha; memory me hi rakha. |
| Cost sheet modal | 6% stamp duty aur ₹30,000 registration Maharashtra ke hisaab se the. Raipur ke liye V106 wali (CG rules) hi rahi. |
| Shop standee | QR bahar ki site (api.qrserver.com) se banta tha. Hamara QR app ke andar banta hai. |
| "Payout guaranteed", "100% locked" | GENZ aisi guarantee nahi deta, isliye wording tathyon ke hisaab se badli. |
| Connector ka Hindi-default hatana | V95 ka niyam wapas rakha. |
| Card ke private notes client room me | Hata diye. Sirf customer ka apna QR note jaata hai. |
| es-toolkit/compat alias | Hamare build ko zaroorat nahi. |

In me se koi feature asli tareeke se chahiye (jaise asli masked calling number, ya legal introduction record), to bataiye, alag se sahi bana denge.
