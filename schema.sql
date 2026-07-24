-- SQL SCHEMA FOR TAILOR SHOP MANAGEMENT SYSTEM
-- Execute this script in the Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===================================================================
-- TRIGGER: AUTO-CREATE PROFILE ON USER SIGNUP
-- ===================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    'Owner'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===================================================================
-- TRIGGER: CLEAN UP DEPENDENT DATA BEFORE USER DELETION
-- ===================================================================
CREATE OR REPLACE FUNCTION public.handle_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.shops WHERE created_by = OLD.id;
  DELETE FROM public.profiles WHERE id = OLD.id;
  DELETE FROM public.subscriptions WHERE user_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_user_delete();

-- ===================================================================
-- 1. SHOPS TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    mobile_number TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid()
);

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to insert shops" ON public.shops;
DROP POLICY IF EXISTS "Allow users to view own shops" ON public.shops;
DROP POLICY IF EXISTS "Allow users to update own shops" ON public.shops;
DROP POLICY IF EXISTS "Allow users to delete own shops" ON public.shops;

CREATE POLICY "Allow authenticated users to insert shops"
    ON public.shops FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Allow users to view own shops"
    ON public.shops FOR SELECT
    TO authenticated
    USING (created_by = auth.uid());

CREATE POLICY "Allow users to update own shops"
    ON public.shops FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Allow users to delete own shops"
    ON public.shops FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- ===================================================================
-- 2. PROFILES TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT '',
    mobile_number TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('Owner', 'Worker')) DEFAULT 'Owner',
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_number TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restrict profiles to authenticated user's own records only" ON public.profiles;

CREATE POLICY "Restrict profiles to authenticated user's own records only"
    ON public.profiles FOR ALL
    TO authenticated
    USING (id = auth.uid() OR created_by = auth.uid())
    WITH CHECK (id = auth.uid() OR created_by = auth.uid());

-- ===================================================================
-- 3. CUSTOMERS TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    email TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customers_isolation_policy" ON public.customers;

CREATE POLICY "customers_isolation_policy"
    ON public.customers FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ===================================================================
-- 4. ORDERS TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    order_number TEXT NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'Pending',
    items JSONB NOT NULL DEFAULT '[]',
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    measurement_snapshot JSONB DEFAULT '{}',
    delivered_at TIMESTAMPTZ,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_isolation_policy" ON public.orders;

CREATE POLICY "orders_isolation_policy"
    ON public.orders FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ===================================================================
-- 5. MEASUREMENTS TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "measurements_isolation_policy" ON public.measurements;

CREATE POLICY "measurements_isolation_policy"
    ON public.measurements FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ===================================================================
-- 6. SHOP SETTINGS TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.shop_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}',
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE(key, user_id)
);

ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shop_settings_isolation_policy" ON public.shop_settings;

CREATE POLICY "shop_settings_isolation_policy"
    ON public.shop_settings FOR ALL
    TO authenticated
    USING (user_id = auth.uid() OR key LIKE auth.uid() || ':%')
    WITH CHECK (user_id = auth.uid() OR key LIKE auth.uid() || ':%');

-- ===================================================================
-- 7. AUDIT LOGS TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT,
    user_name TEXT DEFAULT '',
    user_role TEXT DEFAULT '',
    action TEXT NOT NULL,
    module TEXT DEFAULT '',
    record_id TEXT DEFAULT '',
    previous_value TEXT DEFAULT '',
    new_value TEXT DEFAULT '',
    device TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_isolation_policy" ON public.audit_logs;

CREATE POLICY "audit_logs_isolation_policy"
    ON public.audit_logs FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ===================================================================
-- 8. GARMENT TYPES TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.garment_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    price REAL DEFAULT 0,
    measurement_fields JSONB DEFAULT '[]',
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.garment_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "garment_types_isolation_policy" ON public.garment_types;

CREATE POLICY "garment_types_isolation_policy"
    ON public.garment_types FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ===================================================================
-- 9. STYLING CATEGORIES TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.styling_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    garment_type_id UUID REFERENCES public.garment_types(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    options JSONB DEFAULT '[]',
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.styling_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "styling_categories_isolation_policy" ON public.styling_categories;

CREATE POLICY "styling_categories_isolation_policy"
    ON public.styling_categories FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ===================================================================
-- 10. INVENTORY TABLE
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL DEFAULT 0,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_isolation_policy" ON public.inventory;

CREATE POLICY "inventory_isolation_policy"
    ON public.inventory FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- ===================================================================
-- 11. SUBSCRIPTIONS TABLE
-- Used by the desktop app to check subscription status after login.
-- The website manages subscription creation and billing.
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    status TEXT NOT NULL DEFAULT 'inactive'
        CHECK (status IN ('active', 'inactive', 'trialing', 'past_due', 'canceled', 'expired')),
    plan_id TEXT DEFAULT '',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_isolation_policy" ON public.subscriptions;

CREATE POLICY "subscriptions_isolation_policy"
    ON public.subscriptions FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Allow the service role (admin) to manage subscriptions
DROP POLICY IF EXISTS "subscriptions_admin_policy" ON public.subscriptions;

CREATE POLICY "subscriptions_admin_policy"
    ON public.subscriptions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ===================================================================
-- INDEXES
-- ===================================================================
CREATE INDEX IF NOT EXISTS profiles_shop_id_idx ON public.profiles (shop_id);
CREATE INDEX IF NOT EXISTS profiles_created_by_idx ON public.profiles (created_by);
CREATE INDEX IF NOT EXISTS shops_created_by_idx ON public.shops (created_by);
CREATE INDEX IF NOT EXISTS customers_created_by_idx ON public.customers (created_by);
CREATE INDEX IF NOT EXISTS orders_created_by_idx ON public.orders (created_by);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS measurements_customer_id_idx ON public.measurements (customer_id);
CREATE INDEX IF NOT EXISTS shop_settings_key_idx ON public.shop_settings (key);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS garment_types_shop_id_idx ON public.garment_types (shop_id);
CREATE INDEX IF NOT EXISTS styling_categories_garment_type_id_idx ON public.styling_categories (garment_type_id);
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON public.subscriptions (user_id);

-- ===================================================================
-- DISCOUNT COLUMNS FOR ORDERS TABLE
-- ===================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK(discount_type IN ('fixed','percentage'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_value REAL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount REAL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS final_total REAL;
