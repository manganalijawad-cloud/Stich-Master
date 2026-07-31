-- Hello Darzi cloud backup / sync schema
-- SQLite on each device remains the source of truth.
-- These tables mirror local business data for backup & multi-device sync (LWW via updated_at).

-- ---------------------------------------------------------------------------
-- Shared helper: updated_at bump (optional; clients send updated_at explicitly)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Business tables (owner-scoped via created_by / user_id = auth.uid())
-- ---------------------------------------------------------------------------
create table if not exists public.shops (
  id text primary key,
  shop_name text not null default '',
  address text not null default '',
  mobile_number text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'Owner' check (role in ('Owner', 'Worker')),
  shop_id text references public.shops(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.customers (
  id text primary key,
  shop_id text references public.shops(id) on delete set null,
  name text not null,
  phone text default '',
  address text default '',
  email text default '',
  notes text default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.measurements (
  id text primary key,
  shop_id text references public.shops(id) on delete set null,
  customer_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.orders (
  id text primary key,
  shop_id text references public.shops(id) on delete set null,
  order_number text not null,
  customer_id text not null,
  status text not null default 'Pending',
  items jsonb not null default '[]'::jsonb,
  total_amount double precision not null default 0,
  discount_type text check (discount_type is null or discount_type in ('fixed', 'percentage')),
  discount_value double precision default 0,
  discount_amount double precision default 0,
  final_total double precision,
  paid_amount double precision not null default 0,
  due_date text,
  measurement_snapshot jsonb default '{}'::jsonb,
  delivered_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

-- Explicit payment ledger (future-ready; order.paid_amount remains the live total)
create table if not exists public.payments (
  id text primary key,
  shop_id text references public.shops(id) on delete set null,
  order_id text,
  amount double precision not null default 0,
  method text default '',
  notes text default '',
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.expenses (
  id text primary key,
  shop_id text references public.shops(id) on delete set null,
  category text default '',
  description text default '',
  amount double precision not null default 0,
  expense_date text,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.shop_settings (
  id text primary key,
  shop_id text references public.shops(id) on delete set null,
  key text not null,
  value text not null default '',
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (key, user_id)
);

create table if not exists public.garment_types (
  id text primary key,
  shop_id text references public.shops(id) on delete set null,
  name text not null,
  enabled boolean not null default true,
  display_order integer not null default 0,
  price double precision default 0,
  measurement_fields jsonb default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

create table if not exists public.styling_categories (
  id text primary key,
  shop_id text references public.shops(id) on delete set null,
  garment_type_id text,
  name text not null,
  display_order integer not null default 0,
  options jsonb default '[]'::jsonb,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Indexes for incremental sync
-- ---------------------------------------------------------------------------
create index if not exists idx_customers_created_by_updated on public.customers (created_by, updated_at);
create index if not exists idx_measurements_created_by_updated on public.measurements (created_by, updated_at);
create index if not exists idx_orders_created_by_updated on public.orders (created_by, updated_at);
create index if not exists idx_payments_created_by_updated on public.payments (created_by, updated_at);
create index if not exists idx_expenses_created_by_updated on public.expenses (created_by, updated_at);
create index if not exists idx_shop_settings_user_updated on public.shop_settings (user_id, updated_at);
create index if not exists idx_garment_types_created_by_updated on public.garment_types (created_by, updated_at);
create index if not exists idx_styling_categories_created_by_updated on public.styling_categories (created_by, updated_at);

-- ---------------------------------------------------------------------------
-- RLS: each user only sees their own rows
-- ---------------------------------------------------------------------------
alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.measurements enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.shop_settings enable row level security;
alter table public.garment_types enable row level security;
alter table public.styling_categories enable row level security;

create policy "shops_own" on public.shops
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "profiles_own" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "customers_own" on public.customers
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "measurements_own" on public.measurements
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "orders_own" on public.orders
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "payments_own" on public.payments
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "expenses_own" on public.expenses
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "shop_settings_own" on public.shop_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "garment_types_own" on public.garment_types
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "styling_categories_own" on public.styling_categories
  for all using (created_by = auth.uid()) with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage bucket for uploaded files / images (shop logos, future media)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shop-assets',
  'shop-assets',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do nothing;

create policy "shop_assets_select_own"
  on storage.objects for select
  using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "shop_assets_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "shop_assets_update_own"
  on storage.objects for update
  using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "shop_assets_delete_own"
  on storage.objects for delete
  using (bucket_id = 'shop-assets' and (storage.foldername(name))[1] = auth.uid()::text);
