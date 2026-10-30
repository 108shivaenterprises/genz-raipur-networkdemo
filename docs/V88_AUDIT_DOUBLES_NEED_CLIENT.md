# v88 — Audit: "double" cheezein, dead clicks, client vs requirement

Aapki shikayat: kuch cheezein double aa rahi hain, click kaam nahi kar rahe, client requirement kahin dikhti hai kahin client nahi.

## Kaise dekha
- 11 roles ke 466 screens (pichla round) + is baar 11 roles par **duplicate / dead-click** crawler: har screen par repeat kiye cards, headings, buttons, aur har button ka click.
- Crawler ne ~200 "dead click" candidates diye; **har ek ko asli browser click se dobara jaancha**. Zyadatar crawler ki galti thi (jo tab pehle se khula tha, header ka chat icon, ya jo confirm/prompt box kholta hai). Sach mein koi button "mara hua" nahi mila.
- API data mein duplicate (properties, requirements, clients, deals) — saaf.

## Jo asli galti mili aur theek hui
1. **Client dikhta tha par requirement nahi (shop QR).** Shop-QR lead ka number khulte hi sirf "Today & Clients" mein client card banta tha; "Buyers / Magic Match" mein requirement nahi banti thi, aur card mein budget 0 rehta tha. Ab number khulte hi **dono** banti hain: client card (budget ke saath) aur buyer need (70%–100% budget, dikhaya hua ilaka, ghar ka type, Sale/Rent). Budget "50 lakh", "1.2 cr", "15k" jaisa padha jaata hai; sirf "50" ho to sale par 50 lakh, rent par "15" = 15 hazaar; na padha jaaye to requirement nahi banti (purana haath wala "Add & find matches" form rehta hai). Ek hi mobile se duplicate requirement nahi banti.
2. **Double "Find in network" ka khatra.** Requirement bante hi wo button hat jaata hai, warna dusri copy ban jaati.
3. **Buyer Home par "My site visits" do baar.** Ek card (code ke saath) upar aur dusra wahi visit phir se neeche. Ab neeche sirf **ho chuki** visits ("Visits done") dikhti hain.
4. **"Turn on" (phone alerts) par kuch na dikhna.** Agar user permission box band kar de to koi message nahi aata tha. Ab likha aata hai: "Alerts chalu nahi hue. 'Chalu karein' phir dabayein aur Allow chunein."

## Jo samajhna zaroori hai (galti nahi, par aapki raay chahiye)
- **Broker ne khud "Add Buyer Requirement" ya "WhatsApp se" se requirement dali** to wahi requirement banti hai, **client card nahi**. Yeh jaanbujhkar hai: client card par client ki sahmati (DPDP) ka tick broker ko khud lagana padta hai (v56). Agar chahein to requirement par ek button "Today & Clients mein jodein (sahmati ke saath)" de sakte hain.
- Demo data mein ek hi customer ke do alag customer-id hain (CUST-001 aur CUST-DMO-001, ek hi mobile) aur legal desk ke 4 case mein ek jaisa message — yeh **demo seed** ka nateeja hai, asli data mein nahi aayega.

## Test
`tests/v87-need-and-client-both.test.ts` (8): number khulne se pehle na card na need; reveal ke baad ek need + budget wala card; dusra broker uska client nahi; dobara scan par naya lead/need nahi; owner lead par need nahi; budgetRupees (lakh/cr/k, "50", "15" rent, na padha jaaye to null). Poora suite 1543 pass.

## Kya nahi kiya (imaandari)
- Naye users (naya broker, naya owner) bana kar poora signup/onboarding nahi chalaya — sirf maujooda demo accounts. Registration par pehle ke tests hain.
- Desktop par dead-click crawler nahi chala (sirf mobile 390px).
- Asli phone par push / install nahi.
