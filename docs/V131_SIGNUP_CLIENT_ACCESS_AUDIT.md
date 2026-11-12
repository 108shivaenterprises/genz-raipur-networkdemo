# V131 — Signup aur client access ki jaanch (12 Nov)

## Theek kiya (aapke 10 Nov ke niyam se ulta chal raha tha)
- **Broker bina RERA ke join nahi kar sakta tha.** Invite se aane wale broker ke form me "RERA no. *" aur "Company / firm *" zaroori the; server bhi mana karta tha. Aapka niyam: bina RERA bhi aa sakta hai, "Non-RERA" badge ke saath.
- **Ab:** broker ke liye RERA aur company **"(हो तो)"**; PAN zaroori. Bina RERA wala apne aap Tier 2 / Non-RERA hota hai, builder / RERA project us par band rehte hain jab tak wo RERA na jode (V117 ka "RERA jodo" card). Builder ke liye RERA ab bhi zaroori.
- Test: `tests/v131-broker-no-rera.test.ts`.

## Signup: jo dekha (phone size)
| Raasta | Abhi | Dikkat / sudhaar |
|---|---|---|
| Login | Email ya mobile + password | Theek |
| "Request access" | 5 khaane + chhota sawal (14 + 7) + sahmati | Theek, chhota hai |
| Invite code se broker join | **Ek hi page par 17 khaane, 2445px**: naam, mobile, email, rajya, shehar, ilaka, kaam ke ilake, company, RERA, PAN, GSTIN, poora 12-ank Aadhaar, pata, PIN, PAN / Aadhaar ki photo, password, 2 sahmati | Sabse bada rukaavat. Sujhav neeche (1, 2) |
| Password | 10+ akshar, bada + chhota + ank | Broker ke liye bhaari. OTP login behtar (SMS chahiye) |
| Password bhool gaye | "GENZ Operations WhatsApp par naya password bhejega" (haath se) | OTP se khud reset (SMS chahiye) |
| Owner | Sirf mobile + 6-ank code, ek kadam | Achha; yahi sabke liye chahiye |
| Invite me naam | Mobile aur email pehle se bhare aate hain, naam nahi | Chhota sudhaar |

## Client ka access: jo dekha
| Raasta | Abhi | Dikkat |
|---|---|---|
| QR scan | Koi login nahi; 5 khaane + sahmati → chat | Achha |
| Chat band ho gayi, wapas aana | Dobara scan → "🔑 SMS कोड से पुरानी चैट खोलें" (mobile + code) | SMS juda na ho to client ko code kaise mile? Demo me code screen par aata hai |
| Client room | Mobile + code, har naye phone par | Wahi SMS wali baat |
| Chat aur room | Do alag page | Client ke liye ek hi jagah behtar hoti |
| Buyer ka app account | Hai, par invite se | Zyadatar client ko zaroorat nahi |

## Sujhav (aapke faisle chahiye; kuch nahi banaya)
1. **Broker signup 2 kadam me:** pehle sirf naam, mobile, shehar, PAN, password → turant andar (seemit, "ID baaki"). Aadhaar / pata / photo **pehli deal ya pehli listing se pehle**. Abhi sab ek saath maanga jaata hai.
2. **Poora 12-ank Aadhaar signup par:** sabse zyada log yahin chhodte hain. Vikalp: sirf aakhri 4 + masked photo; poora number tabhi jab zaroori ho.
3. **OTP login + OTP reset** (password ki jagah ya saath me): SMS provider milte hi.
4. **Khula signup** (bina invite): OTP ke saath; niyam 10 Nov ko tay ho chuke.
5. **Client ke liye ek hi link:** chat khulte hi wahi room ho; alag login na lage.
6. Invite ka naam pehle se bhara aaye.

Sab (3, 4, aur client ka wapas aana) ek hi cheez par tike hain: **asli SMS**.
