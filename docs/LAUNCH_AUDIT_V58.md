# Launch audit — rishte ke hisaab se (23 Oct 2026, v57 ke baad)

## Kaise check kiya
- **Code mein:** har rishte ke asli kaam ki list banayi (Raipur ke broker / builder roz kya karte hain), phir dekha ki app mein woh kaam kahan hai — server ka raasta, screen aur button.
- **Phone screen:** 11 account (har role ka), har tab 390px par khola, kul ~150 screen. **0 server error, 0 script error.**
- **Tests:** 65 files / 916 test, sab pass. Inme in rishton ke API flow pehle se jaanche jaate hain: CRM, visit QR, offer, deal room, client room, shop partner, legal, ID review aadi.
- **Ek nayi cheez bhi dekhi:** ek role kuch kare to doosre role ke **phone tak alert** pahunchta hai ya nahi.

## Seedha jawab
**Broker ka roz ka kaam launch ke liye taiyaar hai:** listing, buyer, match, co-broking, deal room, client, owner consent, shop partner aur vakil.

**4 jagah asli kami thi** jo pilot mein turant chubhti:
1. **Broker ki team (agency staff)** owner aur client ke saath kaam nahi kar sakti thi — na listing dikhti, na client room, na client list.
2. **Builder ↔ CP ke kaam par phone alert nahi jaata tha:** lead, booking, payment, payout, notice, approval. Vakil ke case par bhi nahi.
3. **Kiraya (rent):** agreement khatam hone / renewal ki yaad aur police verification ki checklist nahi thi. Raipur mein rent ka kaam bahut hai.
4. **Builder aur CP ke beech chat nahi thi.** Sirf notice board tha, aur notice ke saath construction ki photo nahi.

Saath mein do chhoti dikkat:
- admin ka phone menu (26–35 tab ek line mein);
- Title Check ki bahut lambi screen.

## Rishta-wise
✅ = taiyaar · ⚠️ = chalta hai par kami · ❌ = nahi tha

### 1. Builder → Broker / CP
- ✅ Project, unit grid, rate control, "kise dikhe", hold / book.
- ✅ CP ka apply → shortlist → approve, commission, quota.
- ✅ Brochure / collateral, notice board.
- ✅ Lead registration + protection; visit QR (builder side scan).
- ✅ Booking request + payment plan, Money Trail, payout + TDS, target / bonus.
- ✅ GENZ Launch Desk.
- ❌ Lead / booking / payment / payout / notice / approval par **phone alert** → **v59**
- ❌ **Builder ↔ CP chat** (lead, unit, visit, booking ke card ke saath) → **v61**
- ⚠️ Notice mein construction ki **photo** nahi → **v61**

### 2. Broker → Broker
- ✅ WhatsApp paste → owner consent → listing, duplicate rokna.
- ✅ Buyer need, broadcast, Magic Match.
- ✅ Co-broking offer (split / own-side), tie-up.
- ✅ Deal room: chat, "+" card, papers (view-only), kaam, commission, payment, close.
- ✅ Visit QR + bypass vaada + OTP, buyer bond, dispute, reputation, Network Watch.
- Launch ke liye **taiyaar**.

### 3. Broker → Dukaan / referral partner, aur 4. Partner → Broker
- ✅ QR, hissa (% / ₹), partner ka apna page (link + OTP), lead, status, payout, "mila / nahi mila", sandesh.
- ✅ v56: lead se seedha client room. GENZ Connector desk bhi hai.
- **Taiyaar.**

### 5. Broker → Owner
- ✅ Consent (WhatsApp link / kaagaz), bypass suraksha, brokerage terms sign.
- ✅ Visit ki pavti (owner link), offer → owner faisla, token.
- ✅ Owner ka Home (views, enquiry, "kitne buyer dhoondh rahe"), brokerage bill.
- ❌ **Rent agreement ki expiry / renewal yaad + police verification checklist** → **v60**
- ⚠️ Owner ka app account sirf GENZ ke invite / waitlist se banta hai. Bina account ke owner ko visit, consent aur bill ke link milte hain, par "meri listing ka haal" wala link nahi. Pilot ke baad.

### 6. Broker → Builder
- ✅ GENZ / builder projects dekhna, apply, unit, lead, visit pass, hold, booking, Money Trail.
- ✅ Payout statement + andaaze ka invoice breakup (GST / TDS).
- ❌ Builder desk se **chat** → **v61**
- ❌ Booking approve / payout par **alert** → **v59**

### 7. Broker → apni Team
- ✅ Member jodna (mobile + temp password), role, phone-mode switch, lead routing.
- ✅ Builder CRM lead allot, deal room allot, check-in, incentive, handover.
- ❌ Member **listing nahi dekh sakta** (field executive ko ghar dikhana hota hai) → **v58**
- ❌ Member broker ke **client room** mein kaam nahi kar sakta → **v58**
- ❌ Member **Today & Clients** (client list, follow-up) nahi chala sakta → **v58**

### 8. Broker → Buyer / Client
- ✅ Client list + follow-up, buyer need, client room (ghar, chat, visit request, papers), visit QR + OTP, buyer bond.
- ✅ Offer → token → deal, brokerage bill, public page (v57), loan refer, kharch calculator.
- ❌ Kirayedar ke liye agreement / renewal / police verification → **v60**
- ⚠️ Buyer ka **"I'm interested"** abhi nahi. Kis broker ko jaaye, **ye aapka faisla hai.**

### 9. Broker ki team → Owner / Client
- ✅ Allot kiye deal room mein chat, builder visit pass / scan, CRM call list.
- ❌ Client room, client list, listing → **v58** (sab employer ke switch se, default band)

### 10. Broker → Vakil (legal)
- ✅ Deal room se legal help, state se apne aap, pehle aao pehle pao, fee, accept, papers view-only, complete, UTR, strike.
- ❌ Case lene / fee / accept par **phone alert** → **v59**
- ⚠️ Vakil ka asli kaam Title Check hai, jo bahut lambi screen hai → **v62** ("mere khule kaam")

### 11. Superadmin / Admin
- ✅ ID Review, Invite & KYC, listing / consent kaagaz jaanch, dispute, Network Watch, strike.
- ✅ Plans & Fees, Legal settings, Revenue, City Launch, broadcast, audit, Control Center, 2FA.
- ❌ **Phone par menu** — 26–35 tab ek line mein, broker jaisa group / neeche ka button nahi → **v62**
- ⚠️ Control Center (17,000px) aur Invite & KYC (8,900px) lambe hain.

### 12. Baaki roles
- **Owner** ✅
- **Buyer** ⚠️ ("I'm interested" aapka faisla; save v56 mein ban gaya)
- **Contractor** ⚠️ (estimate / BOQ / site diary nahi — pilot ke baad)
- **Connector** ✅
- **Vakil** ⚠️ (Title Check)
- **Builder ke buyer** ❌ (booking ke baad buyer room, demand letter — pilot ke baad)

## Kram (har ek alag deploy, tests + phone check + doc ke saath)
- **v58:** Agency team — employer ke switch se member: listing padhna (+ apni listing ka pata), client room mein kaam, client list.
- **v59:** Phone alert — builder ↔ CP, project approval, notice, legal case, team allot.
- **v60:** Rent desk — kiraye ka record, renewal / expiry yaad, police verification checklist, WhatsApp sandesh, khaali hone par dobara listing.
- **v61:** Builder ↔ CP chat (card ke saath) + notice mein photo.
- **v62:** Admin ka phone menu + Title Check "mere khule kaam".
- **Pilot ke baad:**
  - builder ke buyer ka room + demand letter;
  - unit cost sheet PDF;
  - contractor tool;
  - builder ke papers / land records / demand;
  - "boot" API (tezi);
  - owner ka status link.

## Aapke faisle (code se bahar / aapki haan chahiye)
- Buyer ka "I'm interested" kis broker ko jaaye.
- RERA / mandate wording (parked).
- Owner consent mein "public page" ki line.
- Asli logo file.
- Launch se pehle (pehle se list mein):
  - advocate / CA checks;
  - VPS + domain + HTTPS;
  - backup aur restore test;
  - 20–30 broker ka pilot.
