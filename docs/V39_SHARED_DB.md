# v39 — Demo data that does not reset (Vercel + Supabase)

Before v39 the Vercel demo kept its data in `/tmp` of each serverless instance, so every cold start went back to the seeded demo data. With **`DATABASE_URL`** set in the Vercel project, the data now lives in Supabase Postgres and survives cold starts, redeploys and new instances.

## How it works (shared mode)
- **Turned on automatically:** `server/vercelBoot.ts` sets `SHARED_DB=true` and `DATABASE_SCHEMA=genz` when `DATABASE_URL` is present.
- **No lock:** `PgStore` in shared mode has no single-writer lock (many instances by design). Every commit moves a revision number (`genz_meta.__rev`) in the same transaction.
- **Per request** (`server/sharedSync.ts`, called from `api/_entry.ts`):
  1. If the revision moved since this instance last looked, reload the data (same normalising as a cold start).
  2. The app handles the request.
  3. Before the response is sent, what changed is written in one transaction and the revision moves on.
- **One at a time:** requests inside one instance run one after the other, so a reload never swaps data under a running request.
- **Stale detection:** if two instances write at the same moment, the later write wins for the same record. The instance that missed the other's change marks itself stale and reloads on its next request. This is fine for a demo or pilot; a large network runs on one long-lived server.
- **First boot on an empty database** seeds the demo data (with the bulk set) once.

## Secrets that must stay the same across instances and restarts
When `DATABASE_URL` is present, these are derived from it (it holds a password) unless the project sets them:
- `AUTH_SECRET` — sessions and the phone HMACs
- `KYC_VAULT_KEY` — sealed KYC values
- VAPID keys — phone alerts

Nothing secret is in the public repo.

## Supabase setup (done)
- Project `genz-demo` (`wgtmxcvhqnjuolvdikzg`, ap-south-1).
- Login role `genz_app` (its own password) and a private schema `genz` that Supabase's public REST API does not expose. The tables `genz.genz_docs` and `genz.genz_meta` are created by the app on first boot.
- **Connection:** the transaction pooler `postgres://genz_app.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`. If that cluster answers "Tenant or user not found", `server/bootstrap.ts` retries on `aws-1-…` automatically.

## Not kept
Uploaded files (profile photos, property papers, signatures) still live in `/tmp` of an instance.

## Reset the demo on purpose
`TRUNCATE genz.genz_docs, genz.genz_meta;` in Supabase. The next request seeds fresh demo data.

## Tests
- `tests/v39-shared-db.test.ts` and `tests/pgstore.test.ts` (both need `TEST_DATABASE_URL`).
- Checked by hand: two app instances on one Postgres (a change on one is seen by the other, and the session works on both), then a cold restart keeps the data, and a tab sweep for 5 roles showed no errors.
