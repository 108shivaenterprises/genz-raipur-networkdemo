# Launch audit — final (24 Oct 2026, v62 ke baad)

Pichhli report: `LAUNCH_AUDIT_V58.md`. Usme 4 badi aur 2 chhoti kamiyan mili thi. Ye report batati hai ki wo sab bhar di gayi, aur launch se pehle ab kya bacha hai.

## Seedha jawab
**Haan — app ke andar har rishte ka roz ka asli kaam ab pilot launch ke liye taiyaar hai.**
- Jo 6 kamiyan mili thi, paanch alag deploy (v58–v62) mein bhar di gayi.
- Ab jo bacha hai wo **code ke bahar** ka hai: aapke kuch faisle aur launch ki taiyaari (vakil / CA, server, backup, pilot).
- Kuch kaam **jaan-boojh kar pilot ke baad** rakhe hain. Wo launch nahi rokte.

## Kya bana (v58–v62)
| Version | Kami | Kya bana |
|---|---|---|
| v58 | Broker ki office team owner / client ka kaam nahi kar pati thi | Broker ke 3 switch: listing padhna (+ apni listing ka pata), client room, client list. Data broker ka, client ko bataya jaata hai, number sirf "always visible" par |
| v59 | Kisi bhi role ko doosre ke kaam ka phone alert nahi | Builder ↔ CP (lead, booking, paisa, payout, notice, appoint), team, deal chat, legal, contractor, KYC, dispute. Hindi alert. Office ke shared phone par sign out = alert band |
| v60 | Kiraye ki deal ke baad kuch nahi | Rent desk: shartein, police verification, 60 / 30 / 7 din ki yaad, renew, notice, khali, dobara list, shartein ki sheet. Kiraye ke deal room mein kiraye wale kaam |
| v61 | Builder ↔ CP chat nahi, notice mein photo nahi | Partner chat (lead / booking / unit card, photo), sales manager bhi; notice mein photo |
| v62 | Admin ka phone menu (35 tab ek line), Title Check mein "mera kaam" nahi | Har bade role ke neeche 4 button + groups; Title Check mein "mere khule kaam" (der wali samasya pehle) |

## Rishta-wise (final)
✅ = taiyaar · ⚠️ = chalta hai, chhoti baat baaki · 🕓 = pilot ke baad

1. **Builder → Broker / CP** ✅
   - project, unit, CP approve, lead protection, visit QR, booking, Money Trail, payout, target;
   - **+ phone alert (v59), chat + photo (v61), notice photo (v61)**.
2. **Broker → Broker** ✅
   - listing, buyer, match, co-broking, deal room, visit, bond, dispute;
   - **+ deal chat ka alert (v59)**.
3. **Broker → Dukaan / referral partner** ✅
4. **Partner → Broker** ✅
5. **Broker → Owner** ✅
   - consent, bypass suraksha, terms sign, visit pavti, offer, bill;
   - **+ kiraye ki renewal / police (v60)**.
   - 🕓 Bina account wale owner ke liye "meri listing ka haal" link.
6. **Broker → Builder** ✅ — project apply, lead, booking, payout statement; **+ chat (v61), alert (v59)**.
7. **Broker → apni Team** ✅ — **+ listing / client room / client list ke switch (v58)**, lead / deal ka alert (v59).
8. **Broker → Buyer / Client** ✅
   - client room, visit, offer, token, bill, public page (v57);
   - **+ kirayedar (v60)**.
   - ⚠️ Buyer ka "I'm interested" — **aapka faisla baaki**.
9. **Broker ki team → Owner / Client** ✅ (v58, switch se, default band).
10. **Broker → Vakil** ✅
    - legal help case;
    - **+ alert (v59)**, chhupa number alert mein bhi chhupa;
    - **+ Title Check "mere khule kaam" (v62)**.
11. **Superadmin / Admin** ✅
    - KYC, ID review, dispute, fees, legal, revenue, control;
    - **+ phone menu (v62), naye member ka KYC alert (v59)**.
    - ⚠️ Control Center lamba page hai (chalta hai).
12. **Baaki roles:**
    - Owner ✅
    - Buyer ⚠️ ("I'm interested")
    - Contractor ✅ (+ lead ka alert v59). 🕓 estimate / BOQ / site diary
    - Connector ✅
    - Vakil ✅
    - Builder ke buyer 🕓 (booking ke baad buyer room, demand letter)

## Jaanch (final)
- **Tests:** 70 files / **967 test pass**. Naye test: v58 (6), v59 (17), v60 (15), v61 (9), v62 (4).
- **Phone par role-wise crawl** (latest build, 390px, Mumbai demo data):
  - 11 account (superadmin, admin, broker, naya / pending broker, owner, buyer, contractor, builder, legal, connector, team);
  - **185 screen**.
  - Pehli baar ek kami mili: superadmin ke har page par chat-badge ka ek 403. **v62.1 mein theek**, phir dobara chala → **0 server error, 0 script error**.
- **Har version ke screenshot** (Hindi + English) report ke saath bheje gaye.

## Launch se pehle — code ke bahar (aapki taraf se)
1. **Vakil / CA review:**
   - Terms, Privacy Policy;
   - brokerage bill / GST wording;
   - rent ki shartein ki sheet ki line ("ye agreement nahi hai");
   - legal help ki fee rules.
2. **Server:**
   - India (Mumbai) VPS + apna domain + HTTPS;
   - Postgres (shared DB mode);
   - `DEMO_MODE` band, demo data band.
3. **Phone alert ki chaabi:**
   - server pehli baar chalte hi `data/.vapid.json` banata hai;
   - **ise backup mein rakhein** (ya `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env mein);
   - kho gayi to sabko alert dobara chalu karna padega;
   - iPhone par alert ke liye app "Add to Home Screen" se kholna padta hai (app khud batata hai).
4. **Backup + restore test:** ek baar asli restore karke dekhein.
5. **Pilot:** 20–30 broker + 1–2 builder + 1 vakil, 2–3 hafte. Har hafte feedback.

## Aapke faisle (baaki)
- Buyer ka "I'm interested" kis broker ko jaaye.
- RERA / mandate wording (parked).
- Owner consent mein "public page" ki line.
- Asli logo file.
- Public page Google mein dikhe ya nahi.
- Team member ko public page ki enquiry mile ya nahi.

## Pilot ke baad (code)
- Builder ke buyer ka room + demand letter; unit cost sheet PDF.
- Contractor tools (estimate / BOQ / site diary).
- Builder ke papers / land records / demand insight.
- Boot API (pehla page aur tez).
- Owner ka status link.
- Purane alerts (match, offer, consent, subah ka saar, client room) ki Hindi.
- Renewal brokerage ka bill.
- Broker staff ke liye Rent desk / partner chat ka switch.
