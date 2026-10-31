# Deploy & launch runbook (India)

## 1. Server
- Any Indian-region VM (AWS Mumbai `ap-south-1`, DigitalOcean Bangalore, Hostinger/Contabo India) with 2 vCPU / 2–4 GB RAM, Ubuntu 22.04+, Docker + Docker Compose.
- Point your domain's A record to the server's IP (needed for automatic HTTPS by Caddy).

## 2. First deploy
```bash
git clone <your repo> /opt/genz && cd /opt/genz      # or unzip the project there
cp .env.production.example .env && nano .env           # DOMAIN, DB_PASSWORD, AUTH_SECRET (openssl rand -hex 32), grievance details
docker compose up -d --build
docker compose logs app | grep AUTH                    # if SEED_ADMIN_PASSWORD was empty, the one-time admin password is printed here
```
Open `https://<DOMAIN>` → sign in as `admin@genzbuildcon.com` → you are forced to set a new password.

The app **refuses to boot in production** unless `AUTH_SECRET` (≥32 chars) and `DATABASE_URL` are set and `DEMO_MODE=false`.
Production starts **empty** (only the SUPERADMIN, no demo brokers). Set `SEED_DEMO_DATA=true` (with `DEMO_MODE=true`) only on a staging server. Create the first admin with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (forced password change on first login). Optional: `VITE_LEGAL_JURISDICTION` (build-time) sets the court jurisdiction shown in the Terms; `COMPANY_ADDRESS` sets the address in the privacy policy.

## 3. Move existing demo/pilot data (optional)
Copy your old `data/database.json` next to the app and start once with `IMPORT_JSON=true` on an **empty** database.

## 4. Backups (do this on day 1)
```bash
crontab -e   →   0 2 * * *  /opt/genz/deploy/backup.sh
```
Also copy `/opt/genz/backups` off the server (rclone → Google Drive / S3). Restore: `./deploy/restore.sh backups/<file>.sql.gz backups/files-<same stamp>.tar.gz`. **Test a restore once before launch.**

v26: the backup now also packs the files on disk (ID copies, signed owner-consent forms, protected documents). Keys are kept OUT of backups: put `KYC_VAULT_KEY`, `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` and `AUTH_SECRET` in your password manager. Set `PUBLIC_URL` so the owner-consent links sent on WhatsApp point at your domain.

## 5. Onboarding members (invite-only)
1. Admin → *Invite & KYC* → issue a code bound to the member's e-mail.
2. Member signs up with code + RERA no. + PAN (+ GSTIN) and accepts the Privacy Policy/Terms.
3. Admin verifies the RERA number on https://rera.cgstate.gov.in and PAN/GST, then **Approve**. Only then do marketplace, deal rooms and CRM unlock.

## 6. Site-visit OTP / SMS
Codes for the customer / shop / client (shop-partner page, visit "no direct deal" acknowledgement, client room) are sent by SMS through `SMS_WEBHOOK_URL` (POST `{to, message}` with Bearer token). **Without it, and with DEMO_MODE=false, these pages say "SMS is not set up" and no code is made** — the broker never sees a code (v93, audit F2). Only a local DEMO shows the code to the broker so it can be read out. Connect a DLT-registered provider (MSG91 etc.) before launch.

## 6a. v93 hardening switches (AUDIT_REPORT.md)
- `AUTH_SECRET` — set it (32+ chars). It also keys the sealed page links and, unless `AUDIT_HMAC_KEY` is set, the audit chain.
- `AUDIT_HMAC_KEY` — optional separate key (24+ chars) for the audit-trail HMAC. Keep it stable: a new key makes the existing chain read as broken. Ship the server log off-box: every start prints `[AUDIT] chain tip …`.
- `KYC_VAULT_KEY` — **required in production**: with `NODE_ENV=production` a key file inside `data/` is refused and the vault stays OFF (override only with `ALLOW_VAULT_KEY_IN_DATA=true`).
- `TRUST_PROXY=true` behind nginx / a load balancer (docker-compose sets it). Without it every user shares the proxy's IP for rate limits.
- Database file: a damaged `data/database.json` is moved aside and the newest `data/backups/database-*.json` is used; with no backup the server **refuses to start** (`ALLOW_FRESH_DB=true` starts empty on purpose). Backups: `BACKUP_EVERY_MS` (default 1 h), `BACKUP_KEEP` (default 48). Copy `data/backups/` off the server too.
- Signing out ends the account's sessions on every device.

## 7. Legal checklist before public launch
- [ ] Counsel reviews `/#/privacy` and `/#/terms` (they are templates) and the 8-year retention note.
- [ ] Fill `GRIEVANCE_NAME / EMAIL / PHONE` (DPDP Grievance Officer) and `COMPANY_ADDRESS`.
- [ ] Brokerage/TDS treatment confirmed with your CA (CRM assumes 5% TDS, user-editable per agreement).
- [ ] DLT registration (entity + template) before enabling SMS OTP.
- [ ] RERA agent/project numbers verified manually by admin for the first members.

## 8. Operations
- Health: `GET /api/health` (used by Docker healthcheck). Logs: `docker compose logs -f app` (one JSON line per API call, no personal data).
- Update: `git pull && docker compose up -d --build` (zero schema migration — documents are JSONB).
- **Single instance only:** the app holds an advisory lock in Postgres; a second copy refuses to start. Scale-up path = move hot collections to relational tables.
- Rotate `AUTH_SECRET` to log everybody out. Admin → reset-password issues a one-time temp password.

## 9. Known limits
- Documents/media are URL references (no upload + malware-scan pipeline yet).
- No e-mail/SMS OTP login or MFA yet; password + invite-only + rate limits for now.
- Hindi covers navigation, login, CRM, consent and privacy screens; deal-room / due-diligence / property forms are still English.
- The Dockerfile/compose were written to the standard layout but could not be built in the authoring sandbox (no Docker daemon) — run `docker compose build` once on the server and check `docker compose logs`.

## GENZ Connector programme — go-live checklist
1. Decide reward amounts (Connector Desk → Rewards & programme). Defaults are placeholders.
2. Confirm with your CA: TDS/GST treatment of referral rewards and the partner agreement wording. The app records approval and UTR but does **not** deduct tax or move money.
3. Invite partners by mobile number (Invite & KYC); approve only after you have met / called them.
4. Ensure the customer-consent line shown in the referral form matches your Privacy Policy (DPDP).
5. Use Control Center → Maintenance mode for planned downtime; only admins can sign in during it.

## Team members & broker partner network — go-live notes
1. Employees are created by the employer with a one-time temporary password; tell them to change it at first login. The "privacy consent" is an employer attestation — keep your own written employee agreement as well.
2. Reward payments to broker-sponsored partners happen outside GENZ (UTR recorded by the broker). Settle TDS / contract terms with your CA; the app does not enforce them.
3. In demo mode two sample employees exist (mobile 9000030001 / 9000030002, demo password) — never enable DEMO_MODE in production.

## v8 notes (inventory, check-in, share links, land records)
1. Public share pages live at `/s/<token>`. Put them behind the same HTTPS domain; WhatsApp previews work best with a real domain (not localhost).
2. Selfies are stored inside the database file (small JPEGs). Take backups as usual; consider a retention policy for check-ins.
3. Token hold records a receipt / UTR only — reconcile the actual money between broker and builder yourself.
4. Demo data adds a Tower A (20 units) on PROJ-RAI-01 and 24 plots with escalator slabs on PROJ-RAI-02 — only with SEED_DEMO_DATA.


## v20 notes (scale, health, revenue)
1. **Use PostgreSQL in production** (`DATABASE_URL`). The JSON file rewrites the whole database on every save — the log warns when one save takes > 400 ms. Measured on PostgreSQL with 5.1 lakh records (10k users, 40k listings, 3 lakh audit lines): import 10 s, restart 12 s, ~0.9 GB RAM, 200 writes with p95 23 ms. Give the container ≥ 2 GB RAM (`NODE_OPTIONS=--max-old-space-size=3072` for very large networks).
2. **If you ran on PostgreSQL with v17–v19:** saves failed after the first sign-in (activity record without `id`). Upgrade, restart, and check that new changes survive a restart (Revenue & Growth → System health → "Database saves" should show flushes with rows).
3. Optional env: `BOOT_LISTINGS` (400), `BOOT_REQUIREMENTS` (300) — how many network listings / needs the app loads at start; `SLOW_REQUEST_MS` (1500) — what counts as slow on the health page; `SHUTDOWN_FLUSH_MS` (20000) — how long a stop waits for the last save.
4. Health: superadmin → Revenue & Growth → System health (server busy per minute, memory, slow requests, server errors, crashes reported by phones). Kept in memory; for long-term records keep the container logs (JSON lines).
5. After each deploy the app reloads old screens automatically once; the service worker keeps at most 160 cached files.
6. Master-CP book and builder links: decide invoice / GST / TDS handling with your CA before recording real money; builder links show totals only and can be switched off any time.
