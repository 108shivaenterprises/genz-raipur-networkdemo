# V147 — Deal pipeline aur Deal room, CRM jaisa layout (phone)

Aapka faisla (samples dekh ke): Deal room **"Pipedrive jaisa"**, Pipeline **"Stage ke chips + list"**.

## Pipeline (Deals tab, phone)
- Upar do tile wahi: "Need my action", "My share in pipeline".
- Uske neeche **stage ke chips**: All, phir sirf wo stage jisme deal hai (ginti ke saath). Settled / Closed / Disputes / Idle chip tabhi jab unme kuch ho.
- Har deal **3 line ka chhota row**: naam + rakam (mera hissa, na ho to deal ki keemat) · ilaka · stage · "▸ agla kaam".
- Photo, deal code, role chip, progress patti, alag-alag badge row se hate. Bade screen par board / list pehle jaisa.

## Deal room (deal dabate hi, phone)
1. Card: ghar, stage patti, ek agla kadam (pehle jaisa).
2. Teen number: mera hissa · deal ki keemat · doosra broker.
3. **Chaar gol button: Call · WhatsApp · Chat · Papers.** Call / WhatsApp doosre broker ke number par (wahi number jo chat ke header me pehle se dikhta hai).
4. **History**: pichhli 4 baatein, nayi upar (deal shuru, visit tay / hui, kaam poora, agreement bheja / lagu, chat me kisne likha).
5. Neeche teen button: Tasks · Agreement · Money.
6. "More": Paper check, Full deal room.
- Chat se wapas ab halke room par aata hai (pehle bhaari "overview" par jaata tha).

## Server
- `server/dealhub.ts`: deal item me `history` (aakhri 6), sirf deal ke andar wale ko (`inner`); GENZ summary view ko nahi.

## Jaanch
- `tests/v99-deal-simple.test.ts` me naya test; deal wale 6 test file (111 test) pass; poora suite Postgres ke saath.
- Phone (390px) par demo broker se: chips "All 1 / Site Visit Done 1", row, room me Call + WhatsApp + 4 history line, koi page error nahi.

## Jo nahi kiya
- History me offer / token / payment ki entries nahi (abhi visit, task, agreement, chat hi).
- Call / WhatsApp sirf broker-se-broker deal me; owner ya client ka number yahan nahi.
- Offers / Client rooms / Owners tabs, Paper check aur Photos & papers ki andar ki screens jaisi thi waisi.
