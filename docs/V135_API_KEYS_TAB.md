# V135 — Superadmin ka "API Keys" tab

## Kya hai
- Superadmin ke menu me naya tab **API Keys** (Control group me, Control Center ke neeche). Sirf **SUPERADMIN** ko dikhta hai; ADMIN, broker, baaki sab ko 403.
- Yahan key paste karke **Save** dabao. Agle hi request se poore app me wahi key chalti hai, sab server copies par (shared DB har request par taaza hota hai). Redeploy ki zaroorat nahi.
- Key khaali karo (**Remove**) to Vercel / server wali setting phir se chalti hai.

## Kaun si keys
| Group | Keys |
|---|---|
| SMS — Fast2SMS | `FAST2SMS_API_KEY`, `FAST2SMS_OTP_ID` |
| SMS — other gateway | `SMS_WEBHOOK_URL` (sirf https), `SMS_WEBHOOK_TOKEN` |
| Firebase phone OTP | `FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `FIREBASE_AUTH_DOMAIN` |
| Calls — TURN relay | `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` |

Jaan-boojhkar **nahi** rakhi: `DATABASE_URL`, `AUTH_SECRET`, `KYC_VAULT_KEY`, `AUDIT_HMAC_KEY` (inke bina app ya taala hi nahi khulta; panel se badalna khatarnak), aur push ki VAPID keys (badalne se sabke purane notification toot jaate).

## Suraksha
- Key database me **vault se band (AES-GCM)** rehti hai. Vault key server par na ho to save mana (screen par laal sandesh).
- Secret ki poori value kabhi browser me wapas nahi aati, sirf `••••` + aakhri 4 ank. Audit log me bhi sirf naam + aakhri 4.
- Har value ki jaanch: 500 se lambi ya chhupe characters mana; URL sirf `https://`, TURN sirf `turn:`/`turns:`; list ke bahar ka naam 404.

## Code
- `server/apiKeys.ts` (naya): `apiKey(name)` = panel ki key, warna server env. Route `GET/PUT /api/admin/api-keys`.
- `server/notify.ts`, `server/phoneOtp.ts`, `server/calls.ts` ab `apiKey()` se padhte hain.
- `src/components/ApiKeysView.tsx` (naya), tab: `NavigationTabs.tsx`, `App.tsx`, `api.ts`, `i18n.tsx`.

## Tests
- `tests/v135-api-keys.test.ts` (3): sirf superadmin; secret wapas nahi aata, galat value / anjaan naam / `DATABASE_URL` / `AUTH_SECRET` mana; TURN key daalte hi calls me relay chalu, hatate hi band.
- Phone screen par superadmin se tab khola, demo key save ki: "Set here", `••••9876`, naam aur samay dikhe, koi JS error nahi.

## Jo nahi dekha
- Live site par panel se asli Fast2SMS key daal ke SMS nahi bheja.
- "Key sahi hai ya nahi" jaanchne ka button nahi banaya (Fast2SMS wallet check se ho sakta hai).
