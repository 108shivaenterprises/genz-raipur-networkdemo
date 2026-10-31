# V96 — Claude Code audit fixes merged (F1–F18)
Source: user's zip (v92 base + AUDIT_REPORT.md). Merged 3-way onto v95: 114 of 116 file changes applied cleanly, 2 hunks in server/shopPartners.ts merged by hand (sealed link import, tokenSealed on partner create).
Checks: tsc clean; full suite 1622 passed / 4 skipped; tests/v27 teardown flake (ENOTEMPTY) passes alone 16/16.
Pushed: 46e6da1 on main. Pitch PDF and USER_MANUAL untouched.
Behaviour changes: codes (OTP) for shop/buyer/client are visible to brokers only in DEMO_MODE; without SMS_WEBHOOK_URL and DEMO_MODE=false those pages answer 503. Logout signs out all devices. Phone masks show last 4 only. Corrupt database.json -> quarantined + backup restore, else refuse to start (ALLOW_FRESH_DB=true overrides). New listing needs 48 h before it counts as a match for reveal (409 LISTING_TOO_NEW). Production needs KYC_VAULT_KEY, stable AUTH_SECRET/AUDIT_HMAC_KEY.
Not verified: Vercel deploy status (MCP shows no projects under the connected team); v93 one-shop-one-QR + v95 language pages re-tested only via the full suite, not on a phone.
