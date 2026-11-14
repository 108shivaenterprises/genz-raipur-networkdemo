# V137 — Owner aur Client (buyer / tenant) ke tabs + 180 din + Terms

Phone size (390px) par owner (Sunil Lalwani) aur client (Dr. Alok Pandey) ke saare tabs khol ke dekhe. Har tab ka screenshot liya, aur JS error ya fail hui API call jaanchi. Koi JS error nahi tha. Ye mila aur theek hua:

## Owner
| Kya galat tha | Ab |
|---|---|
| Deal Desk → "Offers & token" bilkul khaali (ofer na ho to kuch nahi dikhta tha) | "Abhi koi offer nahi… aayega to yahin maano / badlo / mana karo" |
| My Property par "No listing yet" likha tha, jabki neeche 3 ghar the | "Aapki apni listing nahi — broker ke daale ghar neeche 'My properties' me hain" |
| "Your property goes in front of the GENZ network" wala card Home aur My Property dono par (repeat) | Sirf Home par |
| Har owner se selfie + Aadhaar + kagaz maange ja rahe the, chahe usne khud koi listing na daali ho | Ye hissa tab dikhega jab owner khud plan se listing daale |
| Owner ki apni listing par "Brokerage terms **with owner**" | "Brokerage terms with your broker" |
| Deals me "Owners" naam ka tab (owner ke liye ulta) | "My brokerage terms" |
| Listing badge "Verified", Home par "3 verified" (V132 ke baad GENZ ghar verify nahi karta) | "Live", "3 live · 0 waiting" (sabke liye) |
| Activity Record: SHA-256 / block ki technical table, phone par aadhi kati hui | Owner ke menu se hataya (API waisi hi) |

## Client (buyer / tenant)
| Kya galat tha | Ab |
|---|---|
| Neeche menu me apni hi zaroorat ka naam "Buyer Needs" | "My needs" / "मेरी ज़रूरतें" |
| Network Feed (broker se broker: kisne kya listing daali, broker ki maang, demand ka hisaab) buyer ko dikhta tha | Menu se hataya; server bhi buyer aur owner ko 403 deta hai |
| Activity Record ki technical table | Menu se hataya |
| (Fix karte waqt pakdi) tab kam hone par neeche ka menu gayab hokar upar patti ban gaya | Owner aur buyer ka neeche wala menu hamesha |

## 180 din (aapka niyam)
- Suraksha ka default ab **180 din**: `PROTECTION_DEFAULT_DAYS`, naye setup ki settings, mandate form, owner ka broker-route form, aur listing draft. Ab form apne aap network ki setting lete hain, fix 30 nahi.
- **Live demo par** pehle se save setting 30 hi rahegi. Superadmin → Control Center → suraksha ke din me 180 karna hoga. Naye production me apne aap 180.
- Builder CRM ki "60-day" lead registration builder project ka alag niyam hai, use nahi chheda.

## Terms / Privacy (aaj ke niyam)
- Terms 1: "Invite-only / verified" → "Membership": har broker ki ID (PAN) jaanchi jaati hai; RERA badge ya Non-RERA badge; Non-RERA broker RERA project par kaam nahi kar sakta (V131).
- Terms 2: "(60 days)" → "signed terms me likhe din, na likhe hon to 180 din". Parivaar wali line pehle se thi.
- Terms 4: "GENZ broker aur advocate ke daale kagaz aur jaanch ka record rakhta hai; GENZ kisi property ka title ya kagaz nahi jaanchta, na pramanit karta hai" (V132).
- Privacy: photo turant dikhti hai (sirf logged-in members ko); GENZ baad me jaanchta hai; "checked by GENZ" nishan uske baad (V121).

## Tests
- `tests/v137-owner-client-tabs.test.ts` (4): feed buyer / owner ko 403, broker ko 200; menu ke niyam; owner ke screen; "Live" aur "with your broker".

## Jo nahi kiya (aapka faisla chahiye)
- **Buyer ke paas ghar pasand aane par koi action nahi** (sirf Save). App se visit maangne ya broker se baat karne ka raasta nahi hai, na screen par na server par.
- **Buyer ko har listing par "Listed by: <broker ka naam>" dikhta hai.** Buyer apne broker ko chhod kar seedha listing broker ke paas ja sakta hai (bypass ka khatra).
