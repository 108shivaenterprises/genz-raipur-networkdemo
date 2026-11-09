# V119 — GENZ Radar + QR scan par turant client room

## 1. GENZ Radar (pehle "PROPi Radar")
- **Kya tha:** AI Studio ke zip me "PROPi RADAR" ticker tha, par wo Mumbai ke banaye hue nakli sauday dikhata tha, isliye V118 me hold kiya tha.
- **Ab:** naam **GENZ RADAR**, aur data **asli** (network ki khuli client requirements). Needs screen ke upar ek card, sirf broker/builder/team ke liye (buyer ko nahi).
- **Default:** broker ke **apne shehar** ki khuli zaroorat. Har card: type, khareed/kiraya, ilaka, budget, "घर मिलाएँ" button (Magic Match).
- **Advanced search:** shehar khaali chhodo to **poora India**; ilaka, property type, khareed/kiraya/lease se chhaanto.
- **Privacy:** wahi server rules jo Needs list me hain: dusre broker ke client ka naam sirf initials, number masked. Apni khud ki requirements Radar me nahi aati.
- **Seema:** "aas-paas" abhi **shehar** tak hai. Broker ke profile me kaam ke ilake nahi hote, isliye ilaka advanced search me hai.
- Code: `src/components/GenzRadar.tsx`, `RequirementsView.tsx` me ek line. Server me koi badlaav nahi (`GET /api/requirements?city=&q=&propertyType=` pehle se tha).

## 2. Client QR scan karta hai → room turant
- **Pehle:** scan par bot-chat page; "client room" tab banta tha jab zaroorat pakki ho **aur** pehla ghar bheja ja chuka ho. Client ko do jagah, aur kabhi-kabhi room hi nahi.
- **Ab:** client "हाँ, सही है" dabate hi room ban jaata hai aur chat me **"आपका क्लाइंट रूम"** card turant dikhta hai (mobile + SMS code se khulta hai). Chat, ghar, visit sab usi room me.
- **Broker ko kya dikhta hai (zaroori):** room **`held`** rakha gaya hai. Jab tak client ka number broker ko khula nahi (matching ghar dikhaya nahi), broker ko room list me, room detail me, lead ke links me, ya partner "kaam hua" ginti me **kuch nahi** dikhta. Room me "number reveal" button hota hai, isliye room pehle dikhta to number-reveal ka niyam toot jaata.
- **Number khulte hi:** wahi room broker ka ho jaata hai (`releaseRoom`) aur ghar usme chale jaate hain (V105 wala sync).
- Code: `server/sahayak.ts` (onConfirmed → openRoom held; syncRoom me release), `server/clientroom.ts` (held filter, `releaseRoom`), `server/db.ts` (`ClientRoom.held`), `server/shopPartners.ts` (linksFor).

## 3. Jo nahi badla
- Chat me number likhne par kya ho, asli masked call, "pehle kisne introduce kiya" proof: aapne "no preference" bola, jaisa tha waisa hai.
- Photo "sab seedha live": aapne chuna tha, par is round me **nahi badla** (alag se bolo to kar dunga).

## 4. Tests
- `tests/v119-radar.test.ts` (3): naam, asli data, default shehar, Needs screen me jagah.
- `tests/v119-room-at-confirm.test.ts` (3): ✅ ke baad card chat me aur broker ko room nahi; ghar dikhne par room broker ki list me.

## 5. Jo nahi dekha
- Radar card phone par aankh se nahi dekha (build + source test hi).
- Customer ka SMS-code wala room login demo me pehle jaisa hi; live SMS provider se nahi chalaya.
