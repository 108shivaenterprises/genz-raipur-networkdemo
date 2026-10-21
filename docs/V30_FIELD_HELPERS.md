# v30 — field helpers (from the role-by-role audit)

An outside audit (attached by Krishna) listed ~35 ideas. Each was checked against the code first.
- **Already built, no work needed:**
  - bulk paste split;
  - 2-hour unit hold;
  - bonus-slab progress;
  - staff phone-reveal cap;
  - sold alerts and the public join footer;
  - buyer bond (v29).
- **Built now (below):** the safe items.
- **Not built, with the reason:** see the end.

## Built
1. **Pasted forwards no longer leak a phone number.**
   - A WhatsApp forward carries the forwarding broker's mobile. It used to be copied into the listing's public description.
   - The description is now cleaned (`stripPhones`).
   - The number is still offered in "pick the owner's number", and the broker's own "Original message" is unchanged.
2. **Speak the need.**
   - A mic button in the WhatsApp-paste box uses the browser's own speech recognition (nothing installed, no server cost).
   - Language: Hinglish/English or Hindi.
   - The spoken text only fills the paste box. The broker reads it and presses "Make drafts" → a normal Buyer Need draft.
   - The screen says that the browser's speech service hears the audio, and tells brokers not to speak a client's mobile aloud.
3. **Poster stamps its date.**
   - Every printed board now says "Price as on <date> · valid till <date>".
   - Validity is chosen by the broker: 7 / 15 / 30 days, or just the date.
   - It also says "confirm on the QR page", because the QR page is always live.
4. **Cost sheet & EMI** (Deal Desk → new tab, `?tab=desk&sub=cost`).
   - All-in cost: price, stamp duty on the higher of price and guideline value, registration (with cap), GST, extras, legal, broker's fee.
   - Also shown: "X % on top of the price", and an EMI table at rate −1 / 0 / +1.
   - Runs in the browser and stores nothing.
   - **No state rate is hard-coded.** Rates differ by state, buyer and year. The member types the rate he has confirmed; the screen says so.
5. **Live demand ticker on public pages.**
   - The line is "N buyers looking in <city> · M site visits verified this week", on the listing board page and on the brochure / card / report footer.
   - **Real counts only.** It is shown only when a number is at least 3, and it is cached for 10 minutes per city.
   - It never carries a name, number or budget.

## Not built — and why
| Idea | Why not now |
|---|---|
| Masked calling / virtual numbers | Needs a paid telephony provider (no paid third parties). |
| Instant UPI micro-payout to connectors | Conflicts with the points-only incentive rule. It can come with the payments module if Krishna changes that rule. |
| Whisper voice (server) | The browser speech API covers it for free. |
| Zero-signup QR onboarding, WhatsApp OTP login | Auth / KYC change — needs Krishna's go-ahead first. |
| WhatsApp bot / missed-call lead drop | Needs the official WhatsApp Business API or telephony (paid). |
| Auto stale-lead reassignment | Changes who owns a lead without a human deciding. Needs a rule from Krishna. |
| Camera-only geo-tagged stage photos, time-lapse reel, offline QR check-in | Large pieces. Each needs its own design (browser cannot truly force camera-only). |
| Family decision poll in deal room | New guest-link surface. Needs its own privacy design. |
| Public "title red-flag score" lead magnet | Public, unauthenticated tool. Needs abuse protection first. |
| Land-record queue fallback | Depends on the state portals' behaviour. Better with real downtime data. |

## Checks
- `tests/v30-field-helpers.test.ts` — 8 tests (phone strip, cost maths, EMI figure, draft description, ticker threshold and privacy).
- Browser: cost sheet, EMI, voice button (clear message when the mic is blocked), 390 px width.

## Print fixes (v30.1)
Found when Krishna reported "mandate print has a mistake":
- **Owner paper form:**
  - "For N days from today" is now "from the date I sign this form". The form is printed first and signed later, so "today" was ambiguous.
  - Added the property address, state, a protection line, Date / Place lines, a witness block for a thumb impression, and Hindi headings.
  - Added A4 print margins and a Devanagari font fallback.
- **Fixed-fee mandate:** it said "if the final price is lower, the broker's share follows the same rule". A fixed fee does not. It now says "the fee stays the same whatever the final price".
- **Print buttons that printed the whole app screen:**
  - the co-broking agreement now prints in its own clean window;
  - the deal-room readiness report, the visit QR pass and the broker QR card now print only their own card.
- Test: `v30-field-helpers` → "printed owner consent form".
