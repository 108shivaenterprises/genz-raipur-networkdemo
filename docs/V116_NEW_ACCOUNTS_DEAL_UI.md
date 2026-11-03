# V116 — Har role ke naye account + Deal pipeline / Deal room aasaan

## 1. Naye account — test me (asli tareeke se)
`tests/v116-new-accounts.test.ts`: har role ke liye **invite → code se register → PENDING (kaam band) → GENZ approve → login → us role ka pehla kaam**.
Roles: Admin, Broker (RERA + PAN + Aadhaar), Owner, Buyer, Contractor, Builder (RERA + PAN), Vakeel, Dukaan (connector, sirf mobile), aur Team member (broker khud banata hai → temporary password → badalna zaroori).
Superadmin API se kabhi nahi banta (design se) — test yeh bhi check karta hai. Kamzor password, code dobara use, admin ka admin banana — sab mana.

## 2. Naye account — live demo par (khaali, data nahi)
Password sab ka: **Genz@2026** (demo). Sign-in page ke one-click list me bhi dikhenge.

| Role | Login (email) | Mobile |
|---|---|---|
| Superadmin | naya.superadmin@demo.genz.example | 90000 60001 |
| Admin | naya.admin@demo.genz.example | 90000 60002 |
| Broker | naya.broker@demo.genz.example | 90000 60003 |
| Owner | naya.owner@demo.genz.example | 90000 60004 |
| Buyer / tenant | naya.buyer@demo.genz.example | 90000 60005 |
| Contractor | naya.contractor@demo.genz.example | 90000 60006 |
| Builder | naya.builder@demo.genz.example | 90000 60007 |
| Vakeel | naya.vakeel@demo.genz.example | 90000 60008 |
| Dukaan (connector) | naya.dukaan@demo.genz.example | 90000 60009 |
| Team member (Naya Broker ka staff) | naya.staff@demo.genz.example | 90000 60010 |

Sirf demo me banate hain (`SEED_DEMO_DATA` + `SEED_DEMO_BULK` + `DEMO_MODE`), ek baar, dobara nahi chhedte. Production me kabhi nahi.

## 3. Deal pipeline + deal room (design-critique se)
Phone (390px) par screenshot leke dekha; jo dikkat mili aur kya badla:
| Dikkat | Niyam | Badlav |
|---|---|---|
| Pipeline me pehli deal se pehle 6 parat controls | Hick's law / excise | "Kaun si deal" aur Board/List ab **"Filter"** button ke peeche — pehli deal ~1 row upar |
| Deal room ke tab "Ove… C… T… Agre…" kat jaate the | Mystery-meat labels | Phone par icon ke neeche **poora naam** (Overview / Chat / Tasks / Agreement / More) |
| Laal patti dikhi par pata nahi "yeh mera agla kaam hai" | Recognition over recall | Upar **"👉 Aapka agla kadam"** label phone par bhi |
| "+1 more" — kya? | Specific labels | **"+1 aur kaam"** |
| Deal ka code (DEAL-DMO-013) sabse upar | User language | **Ghar ka naam pehle**, code uske neeche |

Test: `v83-dealroom-ui` (12px se chhota text nahi) wagaira sab hare.
