# V148 — Aapke chaar jawab (Deals tabs, Papers, Agreement, Buyer side)

## 1. Deals ke tabs — meri galti, isliye sirf aadha kiya
Maine pehle kaha tha "Offers / Client rooms / Owners do jagah hain". Code dobara dekha, ye poora sach nahi tha:
- **Client rooms** — sach me teen jagah tha (Deals, Deal Desk, apna alag tab). **Deals se hata diya.** Deal se juda client room ab bhi deal ke andar se khulta hai.
- **Offers (Deals wala)** — ye doosre broker ke *co-broking prastav* hain (manzoor karne par deal room khulta hai). Deal Desk ka "Offers & token" *khareedar ki keemat wale offer* hain. Dono alag cheez hain. **Nahi hataya** — hatata to co-broking prastav manzoor karne ki jagah hi nahi bachti.
- **Owners (mandate)** — sirf Deals me hai, Deal Desk me nahi. **Nahi hataya.**

## 2. Photos & papers (phone) — 2485px → 1586px
- Naam "Photos & papers" (pehle "Private Property Vault & Selective Sharing"), lamba parichay aur "Confidential Storage" badge phone par nahi.
- Address ka dabba phone par nahi (wo listing par hai); map ka link rahega.
- Har file chhota card: prakar, naam, "View". Photo ka preview, vivaran, "v1" phone par nahi.

## 3. Paper check (phone) — 3885px → 2496px
- Kala card + 5 tile ki jagah ek line: "14 me se 3 kaagaz jaanche gaye".
- Jo jaanch is property par **lagu nahi**, wo band; neeche "10 aur dikhao jo lagu nahi" button.
- Status filter phone par nahi.

## 4. Agreement (phone)
- "Propose Amendment" aur "Download Record" ab "More" button ke peeche.

## 5. Buyer side
- **Listing broker chhupa:** server ab buyer ko listing broker ki pehchan bhejta hi nahi (`listingBrokerId` hata), to "Listed by" kahin nahi dikhta. Broker ko pehle jaisa dikhta hai.
- **Properties me "Ask broker":** har ghar par Save ke saath. Query uske apne broker ko (need par broker na ho to listing broker ko). Buyer ne "My needs" me kuch nahi dala ho to pehle wo daalne ko kehta hai. WhatsApp share ab "More" me.

## 6. V149 — Tasks member ko kahin nahi ("Task hata dete hain")
Aapka chunav: "Broker ko kahin na dikhe". Purana data rakha hai, GENZ staff (admin) ko pehle jaisa dikhta hai.
- Deal room se **Tasks button** gaya; neeche ab do button: Agreement, Money.
- **Agla kadam** aur pipeline ki "▸" line me task ka naam nahi. Agla kadam ab sirf: visit, agreement, payment, band karne ka jawab, vivad. Kuch na ho to "Nothing waiting on you".
- "Need my action" ki ginti me task nahi. History me "Done: …" line nahi.
- Readiness report me "task responsibilities accept nahi hui" wala blocker hataya (member use theek hi nahi kar sakta).
- Server: `server/dealhub.ts` (`showTasks = isAdmin`), `server/dealTemplates.ts`; client: `DealRoomsView.tsx` (`canTasks`).
- Jo nahi kiya: naye deal me tasks abhi bhi peeche bante hain (sirf dikhte nahi); "Poora system hatao" aapne nahi chuna.

## Jaanch
- `tests/v137-owner-client-tabs.test.ts` me 2 naye test. Phone (390px) par chaaron screen dekhi, koi page error nahi.

## Dhyan
- Buyer ke Properties me "Ask broker" uski **sabse nayi** need se judta hai.
- Paper check / Papers ke badlav sirf phone par; bade screen par pehle jaisa.
