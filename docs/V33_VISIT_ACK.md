# v33 — Buyer's "no direct deal" acknowledgement (tick + mobile OTP) before the visit QR

## Rule
Before a buyer gets his visit QR / code he must **tick** a promise — he came through this broker and will not deal / negotiate / pay directly with the owner or builder (or anyone for them) without the broker during the protection period — **and** confirm his own **mobile with a code**. Until both are done: no QR on the buyer's page, no QR in the broker's modal, and the visit **cannot be verified** (`409 ACK_REQUIRED`, hi + en message).

Applies to both flows:
- **Broker-to-broker site visit (VISIT):** the buyer link is `/a/<token>`. After the confirmation the buyer sees his QR + code there. The SMS with the code no longer goes to the buyer first (his link goes instead, when an SMS gateway is set).
- **Builder-project pass (PASS):** the buyer link is the usual `/v/<code>`; it shows the acknowledgement first, then the pass. The builder's scan screen shows "buyer not yet confirmed" and cannot confirm. A re-issued pass for a buyer who already confirmed does not ask again.

Older visits / passes (made before v33) and visits **without a buyer mobile** carry no acknowledgement and work as before (the broker's screen warns "add the buyer's mobile").

## Code (OTP)
- No SMS gateway: the buyer taps "Send code", the **broker** sees the code in the Visit QR / pass panel and reads it out (same as Client Room). With a gateway it goes by SMS.
- Mobile must match the one the broker entered (HMAC compare). 10-minute code, 5 tries, 8 requests/hour/visit, rate-limited pages, no-store / noindex / no-referrer.

## Evidence & privacy (DPDP)
- Stored: buyer name, mobile as HMAC + last 4, tick time, confirmed time, wording version (`v1`), broker, subject. Never the full mobile.
- Audit trail: `VISIT_ACK_REQUESTED`, `VISIT_ACK_DONE` ("… agreed on <time>: no direct dealing … wording v1").
- Unfinished requests older than 120 days are swept; confirmed ones are kept as evidence. Privacy page text updated (hi + en).
- Wording is a record of agreement, **not a legal guarantee** — have counsel review it (`src/shared/visitAckRules.ts`).

## Screens
- Visit QR tab → pass card: amber panel with "Send on WhatsApp / Copy link"; QR + code hidden until confirmed.
- Visit QR tab → Broker-to-broker visits: "Buyer not confirmed yet" chip; the modal shows the same panel, the buyer's code when asked, and shows the QR only after he confirms. Deal Room visit list shows the chip too.
- Schedule-visit success screen: link panel instead of the OTP.

## Files
`server/visitack.ts`, `src/shared/visitAckRules.ts`, `src/components/VisitAckPanel.tsx`, `tests/v33-visit-ack.test.ts` (11), `tests/helpers/ack.ts`; v13 / v14 / v29 tests now confirm the buyer first.
