# v42 — Uploads bhi persist (Vercel / Supabase demo)

Pehle: photos aur papers `data/<folder>/` me file ban ke jaate the. Vercel par wo `/tmp` hota hai, jo copy band hote hi ud jaata hai.

Ab (sirf shared-DB mode me, yaani jab `DATABASE_URL` laga ho):
- Har request se pehle `pullFiles()` ek checksum query chalata hai; doosri copy ne file jodi/hatayi ho to is copy ki disk theek kar deta hai.
- Likhne wali request (POST/PUT/PATCH/DELETE) ke baad `pushFiles()` nayi/badli file ko table `genz_files` (bytea) me daalta hai, hati hui ko "deleted" mark karta hai.
- App ka baaki code waisa hi hai: wo ab bhi normal file padhta/likhta hai.
- `data/` ke seedhe andar ki files (JSON db) sync nahi hoti, sirf `data/<folder>/…`. 12 MB se badi file skip.
- Supabase Storage bucket nahi liya: uske liye service-role key chahiye aur app files sync padhti hai. Table usi private schema `genz` me hai, role `genz_app` ke alawa koi nahi dekh sakta.
- Free Supabase DB 500 MB ka hai — demo ke liye kaafi. Bada network ho to ek lambi chalne wali server par normal disk/object storage lo.

Files: `server/fileSync.ts`, `server/pgstore.ts` (table + 5 methods), `server/sharedSync.ts`, `server/vercelBoot.ts` (`GENZ_WORKDIR` test ke liye), `tests/v42-file-sync.test.ts` (TEST_DATABASE_URL chahiye).
Check kiya: do alag disk wali copies — ek me photo upload, doosri me dikhi; copy band karke disk saaf, restart ke baad bhi dikhi.
