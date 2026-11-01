# V105 — Bot ab client room mein listing khud daalta hai

## 0. Kya shikayat thi
"Bot automatically client room mai listing nahi kar raha ha." — sahi thi.

## 1. Pehle kya hota tha (seedhi baat)
- Bot customer ka client room **sirf ek baar** kholta tha (jab pehla ghar dikhaya) aur tab ke ≤6 ghar usme daalta tha.
- Uske baad jo bhi ghar chat mein aaya — "aur ghar dikhao" dabane par, **nayi listing** (V103 ka auto-push), ya **broker ne khud bheja** — wo **room mein kabhi nahi gaya**. Room pehle 3 ghar par atka rehta tha, jabki room kholne wali line bolti thi "isme abhi tak bheje gaye saare ghar hain".
- Agar broker ne usi number ka room **pehle se** bana rakha tha, to bot chup-chaap kuch nahi karta tha — ghar us room mein jaate hi nahi the.

## 2. Ab kya hota hai
| Kab | Room mein |
|---|---|
| Bot ne aur ghar dikhaye ("aur ghar" chip / customer ne likha) | Wo ghar room mein, unki **public** photo/video ke saath |
| Nayi listing jo need se milti hai (V103 auto-push) | Room mein bhi |
| Broker ne apni screen se ghar bheja (`/leads/:id/offer`) | Room mein bhi |
| Chat page khulna / ghante ka sweep | Kuch chhoota ho to barabar kar deta hai (bot band ya chup ho tab bhi) |
| Broker ka **apna room** usi number ka pehle se khula hai | Ghar **usi room** mein jaate hain (`bot.roomLinked`); customer ko doosra link nahi diya jaata — wo link broker ka hai |

- Customer ke phone par room ka apna "naya ghar" alert jaata hai (ek call = ek alert, ghar kitne bhi hon).
- Broker ki timeline mein line: "Put N home(s) in his client room".

## 3. Niyam
- **Ek ghar room ko sirf ek baar offer hota hai** (`bot.roomHomes`). Broker ne room se kisi ghar ko hata diya to wo **wapas nahi aata**.
- Sirf live, verified ghar. Room full (30) ya band ho to kuch nahi jaata; baad mein jagah bane to agli baar daal deta hai.
- Gone (sold/withdrawn) ghar room mein pehle jaisa hi dikhta hai ("sold / removed" ka label — room ka apna tarika).
- Photo/video: sirf **public** (broker ke private vault ka kuch nahi).
- LOST lead par sync nahi.

## 4. Code
- `server/clientroom.ts` → `addRoomHomes(brokerId, roomId, ids)`.
- `server/sahayak.ts` → `syncRoom(l)`; `autoRoom` ab room hone par sync karta hai; `follow()` ke baad bhi sync; `openRoom` mein `EXISTS` par `roomLinked`.
- `server/shopPartners.ts` → broker ke `/offer` ke baad `sahayak.syncRoom`.
- `server/db.ts` → `LeadBot.roomLinked`, `roomHomes`.

## 5. Tests
`tests/v105-room-sync.test.ts` — 7. Fix hata kar chalaya to 4 fail hue (aur-ghar, nayi listing, broker ka existing room, broker ka bheja ghar) — yani test sach mein bug pakadte hain.

## 6. Seemayein
- Room ke ghar customer ke **phone par tabhi** dikhte hain jab usne room khola/app jaisa install kiya ho; warna jab wo room kholega.
- Pehle ke (V105 se pehle ke) rooms ko bhi ye apne aap theek kar deta hai: agli baar chat khulte hi chhute ghar room mein aa jaate hain — par jo ghar broker pehle hata chuka, unka record nahi tha, wo bhi wapas aa sakte hain **ek baar**.
