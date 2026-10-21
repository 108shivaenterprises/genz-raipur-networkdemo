# v16.3 — "Today & Clients sends me back to the Dashboard"

**What happened.** Running with `npm run dev` / `start.bat` (Vite dev server with hot reload on), the server rewrites `data/database.json` whenever it saves. Vite's file watcher treated that write as a source change and told the browser to **hard-reload**. A reload restarts the app, which always opens on the Dashboard. Any screen whose API saves on open therefore threw you back immediately.

**Measured before the fix** (click every tab, detect a page reload): Today & Clients (SUPERADMIN and BROKER), Project Control (SUPERADMIN) and My Projects (BROKER). It was not specific to one tab: any action that saves, such as adding a lead or a property, could reload the page and lose what was typed or open. After the fix, no tab for any of the 10 demo roles reloads, and three DB-writing requests in a row leave the page untouched.

**Fix.**
1. `vite.config.ts`: the dev watcher ignores `data/`, `backups/`, `dist/`, `docs/`, `tests/`, `deploy/` and `*.log`. Front-end sources (`src/`, `public/`, `index.html`) are still watched, so hot reload while editing code still works.
2. The app remembers the open tab for the browser tab (`sessionStorage`), so any other reload (F5, an app update, returning from the Privacy / Terms page) keeps you where you were. Login, "view as" and logout still reset to the Dashboard.
3. A remembered or linked tab the user is not allowed to open falls back to the Dashboard instead of showing an empty page.

**Tests.** `tests/dev-reload.test.ts` (3): the watcher ignores runtime data, does not ignore front-end sources, and stays off when HMR is disabled. Checked in a real browser with hot reload on: clicking every tab for every role, plus a forced reload and a blocked remembered tab. Full suite 309 passed, 1 skipped.

**If you still see it.** Stop the app, delete `node_modules/.vite`, start again (stale cache of the old config), and hard-refresh the browser (Ctrl+F5). For daily use without any dev-server behaviour at all, `npm run build` then `npm start` serves the built app.
