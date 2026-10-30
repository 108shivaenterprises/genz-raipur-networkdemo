# GENZ Broker Network — local run (no external API, no keys)

Everything runs on your own machine. Data is a local JSON file in `./data` (created on first start). No database server, no SMS, no WhatsApp, no map/AI API is needed.
In demo mode the OTP is shown on screen, push alerts use a local key file, and anything that would call an outside service is simulated in the console.

## 1. Run
Needs **Node.js 20+** only.

- Mac / Linux: `bash start.sh`
- Windows: double-click `start.bat`
- Or by hand: `npm install` then `DEMO_MODE=true SEED_DEMO_DATA=true SEED_DEMO_BULK=true npm run dev`

Open http://127.0.0.1:3000 → use the one-click demo logins on the sign-in page (password `Genz@2026`, see `docs/DEMO_ACCOUNTS.md`).
Demo roles: superadmin, admin, brokers, owner, buyer, builder, contractor, lawyer.

## 2. Reset
Stop the server and delete the `data/` folder.

## 3. Tests (also fully local)
`npm test` (≈13 min, 1,570+ tests; each file starts its own temporary server). One file: `npx vitest run tests/v92-feed-level-share.test.ts`.
Type check: `npm run lint`.

## 4. Where things are
- `server.ts` + `server/*.ts` — Express API and the public pages (`/s /r /q /sp /a /c /oc /report /pay /p /v`)
- `src/` — React app (`src/components`, `src/lib`, `src/shared` = rules used by both server and app)
- `tests/` — vitest, over real HTTP
- `docs/` — one note per version (V47 … V92), plus ACCESS_CONTROL, DEPLOY_INDIA, DEMO_ACCOUNTS
- `SECURITY_AUDIT.md`, `FEATURES.md`, `README.md`

## 5. What is simulated locally
SMS/OTP (shown on screen in demo), WhatsApp (no receive — the app takes a WhatsApp *share* via the phone's share sheet and the paste box), payments (records only), KYC vault key (file), VAPID push key (file).
Never run DEMO_MODE on a public server.
