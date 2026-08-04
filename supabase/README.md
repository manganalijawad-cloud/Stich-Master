# Supabase (Auth + cloud backup/sync)

Hello Darzi keeps **SQLite as the source of truth** on each PC. Supabase provides:

1. **Auth** — invite-only email/password sign-in  
2. **Database** — mirror of shop data for backup / multi-device sync  
3. **Storage** — shop logos and future uploaded images (`shop-assets` bucket)

## One-time project setup

1. Create a Supabase project (or reuse the existing Auth project).
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.
3. Run the migration in the Supabase SQL Editor (or CLI):

```bash
# From repo root, if using Supabase CLI linked to the project:
supabase db push
```

Or paste `migrations/20260731000000_cloud_sync.sql` into **SQL Editor → Run**.

4. Confirm Auth stays invite-only (disable public sign-ups).

## Sync behaviour

- Writes always go to local SQLite first.
- Pending changes are queued in `sync_outbox`.
- **New device (empty local DB for this Auth user):** on sign-in, `ensure-profile` full-pulls all cloud rows into SQLite before shop setup — same shop/customers/orders, no duplicates.
- **Existing device:** when online with a valid session, the app pushes the outbox then pulls rows with `updated_at` newer than `last_pulled_at`.
- Conflicts use **last write wins** on `updated_at`.
- Owner → **Cloud backup** shows status, pending count, last backup, and **Backup Now**.

## Tables synced

`shops`, `profiles`, `customers`, `measurements`, `orders`, `payments`, `expenses`, `shop_settings`, `garment_types`, `styling_categories`

Add future business tables to:

- `apps/desktop/server/src/sync/tables.ts` (`SYNC_TABLES`)
- `apps/desktop/server/src/db.ts` (`SYNCABLE_TABLES` + local schema)
- a new Supabase migration mirroring the columns + RLS
