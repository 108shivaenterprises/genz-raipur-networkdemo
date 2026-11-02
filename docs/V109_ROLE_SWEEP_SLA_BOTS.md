# V109 — Role sweep, SLA, rescue, smarter bots

## Kya naya
- **First-response SLA** (`slaRules.ts`): lead card par chip — "Call now · Nm late" / "Reply in Nm". Default 30 min.
- **Stalled partners** (`rescueRules.ts`, `/api/growth/stalled`, CityLaunch panel): D3 / D7 / D14 par wa.me nudge, ek baar, opt-out respect.
- **Bots**: Devanagari digits, "pachas lakh", "80L"; naye intents — visit cancel, stop, who, help, property question (andaza nahi, broker se puchta hai), haan/nahi; owner ke liye NEED guard.

## Bugs fixed
- Masked lead se `phoneKey` leak band; builder ko sirf apne projects ke mandates; staff ko commission/TDS nahi.
- Reopen LOST→NEW duplicate par 409; dispute wale rooms auto-close nahi hote.
- Lead inlet: sab case me same reply, junk se daily cap nahi khatam.
- Phone-mask bypass (Devanagari, `/` `,` separators); impossible dates reject (`isRealDay`); bonus TDS PAN ke hisaab se; settle-referral `paid` string parse.

## Check
- 11 demo roles × har GET: koi 5xx nahi. ecc plugin Lighthouse (mobile demo): A11y 98, Best Practices 96; SEO 54 jaan-boojh ke (invite-only app, `noindex`).
- Pitch PDF / USER_MANUAL untouched.
