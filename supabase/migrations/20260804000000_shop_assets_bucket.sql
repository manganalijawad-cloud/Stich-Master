-- Fix: ensure shop-assets storage bucket + policies exist
-- Run in Supabase SQL Editor if cloud logo sync is needed.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-assets',
  'shop-assets',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shop_assets_select_own" on storage.objects;
create policy "shop_assets_select_own"
  on storage.objects for select
  using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "shop_assets_insert_own" on storage.objects;
create policy "shop_assets_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "shop_assets_update_own" on storage.objects;
create policy "shop_assets_update_own"
  on storage.objects for update
  using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "shop_assets_delete_own" on storage.objects;
create policy "shop_assets_delete_own"
  on storage.objects for delete
  using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = auth.uid()::text);
