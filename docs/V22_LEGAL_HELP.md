# v22 — Legal Help (deal room se GENZ ke legal panel tak)

## Kaise chalta hai
1. **Broker** deal room ke naye tab **Legal Help** me jaata hai. **State apne aap bhar jaata hai** — us deal ki property ka state (state na ho to city se). Sirf tab badlein jab kaam dusre state me ho (jaise registry).
2. Madad ka prakaar chunta hai (Title check, Agreement/MoU, Registry/stamp duty, Land records, Bank/loan papers, Legal notice, RERA/builder papers, Lease/rent, Kuch aur). Har prakaar par screen bataati hai:
   - **kaunse kaagaz** counsellor aam taur par maangega (broker jo uske paas ho us par tick karta hai),
   - **vivaran me kya likhein**,
   - **kya kabhi nahi dalna** (brokers ke beech commission/payment, phone number, Aadhaar/PAN/bank number, deal-room chat).
3. Broker apne us property ke papers me se jo chahe chunta hai — wo fee accept hone ke **baad**, **sirf dekhne ke liye**, 60 din tak counsellor ko dikhte hain; case complete hote hi band.
4. Us **state ke counsellors** ko request dikhti hai (naam, deal room, papers ke bina). **Pehle jo "Take this case" dabaye wahi** (first come, first served — server par ek hi jeetta hai).
5. Wo **fee quote** karta hai. Broker **Accept** ya **Decline** karta hai. Decline / quote 72 ghante me na uthe / counsellor 24 ghante me quote na de → case wapas pool me, wo counsellor dobara nahi dekhta.
6. Accept par: dono ke **phone khulte hain**, GENZ ki **fixed platform fee** counsellor par likh jaati hai (us waqt ka rate snapshot), chune hue papers share hote hain.
7. Broker aur counsellor ek chhoti thread me baat kar sakte hain (accept se pehle phone number apne aap chhup jaate hain).

## Counsellor ko kya kabhi nahi milta
Deal room, chat, commission, grahak ka naam, dusre broker ka phone, accept se pehle koi naam. Admin ka v21 rule jas ka tas: legal request ya bypass report deal room ko GENZ ke liye nahi kholta.

## GENZ ki kamaai (paisa app ke bahar, GENZ chhuta nahi)
- **Platform fee**: har accepted case par fixed rakam (member ke liye kam). **Vakil ki fee ka hissa nahi** (Bar Council ke fee-sharing niyam ka risk).
- **Membership**: monthly / yearly; member ko per-case fee kam. Priority nahi — "pehle aao pehle pao" sab par barabar.
- Counsellor GENZ ko bahar se paise bhejta hai, yahan **UTR likhta hai**, admin **confirm / "nahi mila"** karta hai, superadmin **waive** kar sakta hai. 30 din se zyada unpaid fee par naye case lena band.
- **Rate sirf superadmin badal sakta hai**; admin aur counsellor sirf dekhte hain. Jab tak superadmin pehli baar save na kare screen "shuruaati aankde" kehti hai (default: ₹500 / member ₹250 / ₹1,999 mahina / ₹19,999 saal — placeholder).
- Rate badalne par purane accepted case apne purane rate par rehte hain; badlav audit me.

## Bypass (counsellor kaam offline le jaye)
- Broker "Report: asked to go outside GENZ" dabata hai (≥15 akshar). Ye **deal-room dispute nahi** banata (warna admin ko poora room khul jaata).
- Admin / superadmin **uphold** (strike) ya **dismiss**. 2 strike (setting) par counsellor panel se hat jaata hai; admin manual remove / restore bhi kar sakta hai.
- Platform fee accept par lock hoti hai, isliye case baad me offline chala jaaye to bhi fee due rehti hai.
- Chat me phone number block **nahi** kiya (brokers ki apni deal-chat consent wali hai); sirf legal request ke text aur accept se pehle ki thread me numbers mask hote hain.

## Kaun kya dekhta hai
| | Broker | Counsellor | Admin | Superadmin |
|---|---|---|---|---|
| Request likhna | ✔ (apne deal se) | | | |
| Apne state ki khuli requests | | ✔ | ✔ (sab) | ✔ |
| Fee table | | dekhna | dekhna | badalna |
| Fee confirm / waive | | | confirm | confirm + waive |
| Strike / panel | | | ✔ | ✔ |

## Permissions
`legal:request` (BROKER), `legal:desk` (LEGAL_COUNSEL), `legal:manage` (ADMIN, SUPERADMIN), `legal:settings` (SUPERADMIN). Hindi lines `src/lib/permHi.ts` me.

## Files
`src/shared/legalRules.ts` (niyam, prakaar, kaagaz/vivaran suchi, phone mask, fee), `server/legal.ts` (`/api/legal/*`), `src/components/LegalHelp.tsx` (broker panel, counsellor desk, admin), `tests/v22-legal-help.test.ts` (30 tests).

## Dhyan dene wali baatein
- Fee model kisi **advocate se confirm** karwa lein; Bar Council ke niyam alag-alag ho sakte hain.
- Purana behaviour (v16): koi bhi legal counsel deal ke **tasks** padh sakta hai (`allowLegal`) — chat/commission nahi. Wo is version me chhua nahi gaya; chahein to ise bhi sirf accepted case tak band kar sakte hain.
