#!/usr/bin/env bash
# Mac / Linux: double-click-friendly launcher.  Needs Node.js 20+ (https://nodejs.org)
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js not found. Install it from https://nodejs.org (LTS) and run this again."; exit 1; }
[ -d node_modules ] || npm install --no-audit --no-fund
# ---- DEMO MODE ON (private demo machine only). For a real/public server remove these 3 lines, see DEPLOY_INDIA.md ----
export DEMO_MODE=true SEED_DEMO_DATA=true DEMO_PASSWORD="${DEMO_PASSWORD:-Genz@2026}"
# Local first-run admin (you are forced to change the password on first login). Override by exporting these before running.
export SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@genzbuildcon.com}"
export SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-Genz@Admin2026}"
echo "Login:  $SEED_ADMIN_EMAIL  /  $SEED_ADMIN_PASSWORD   (password change is required on first login)"
echo "DEMO MODE is ON: use the one-click demo logins on the sign-in page (password $DEMO_PASSWORD). See docs/DEMO_ACCOUNTS.md"
echo "Starting GENZ Broker Network on http://127.0.0.1:3000  (Ctrl+C to stop)"
( sleep 6; (command -v open >/dev/null && open http://127.0.0.1:3000) || (command -v xdg-open >/dev/null && xdg-open http://127.0.0.1:3000) ) >/dev/null 2>&1 &
npm run dev
