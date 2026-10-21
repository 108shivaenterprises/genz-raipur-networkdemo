@echo off
REM Windows launcher. Needs Node.js 20+ (https://nodejs.org)
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js not found. Install the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
if not exist node_modules call npm install --no-audit --no-fund
REM ---- DEMO MODE ON (private demo machine only). For a real/public server delete these 3 lines and see DEPLOY_INDIA.md ----
set DEMO_MODE=true
set SEED_DEMO_DATA=true
set DEMO_PASSWORD=Genz@2026
if "%SEED_ADMIN_EMAIL%"=="" set SEED_ADMIN_EMAIL=admin@genzbuildcon.com
if "%SEED_ADMIN_PASSWORD%"=="" set SEED_ADMIN_PASSWORD=Genz@Admin2026
echo Login: %SEED_ADMIN_EMAIL%  /  %SEED_ADMIN_PASSWORD%   (password change is required on first login)
echo DEMO MODE is ON: use the one-click demo logins on the sign-in page (password %DEMO_PASSWORD%). See docs\DEMO_ACCOUNTS.md
echo Starting GENZ Broker Network on http://127.0.0.1:3000  (close this window to stop)
start "" cmd /c "timeout /t 8 >nul & start http://127.0.0.1:3000"
call npm run dev
pause
