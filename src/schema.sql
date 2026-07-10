-- SQL SCHEMA FOR TAILOR SHOP MANAGEMENT SYSTEM (MULTI-TENANT USER-LEVEL ISOLATED VERSION)
-- Copy and execute this script inside the Supabase SQL Editor.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm extension if not already enabled for fast partial matches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. SHOPS TABLE
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Enable RLS on Shops
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restrict shops to authenticated user's own records only" ON public.shops;
CREATE POLICY "Restrict shops to authenticated user's own records only"
    ON public.shops FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());


-- 2. PROFILES TABLE (User/Worker Accounts)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager')),
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    updated_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to fetch the current user's shop_id without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_shop_id()
RETURNS UUID AS $$
DECLARE
    v_shop_id UUID;
BEGIN
    SELECT shop_id INTO v_shop_id FROM public.profiles WHERE id = auth.uid();
    RETURN v_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old policies
DROP POLICY IF EXISTS "Allow authenticated reads on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow owners full write on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow authenticated reads on profiles in same shop" ON public.profiles;
DROP POLICY IF EXISTS "Allow owners full write on profiles in same shop" ON public.profiles;
DROP POLICY IF EXISTS "Restrict profiles to authenticated user's own records only" ON public.profiles;

-- Create policies that restrict access to the user's own profile OR workers created by this owner
CREATE POLICY "Restrict profiles to authenticated user's own records only"
    ON public.profiles FOR ALL
    TO authenticated
    USING (id = auth.uid() OR created_by = auth.uid())
    WITH CHECK (id = auth.uid() OR created_by = auth.uid());


-- 3. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    updated_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Enable RLS on Customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access to customers" ON public.customers;
DROP POLICY IF EXISTS "Allow shop isolated access to customers" ON public.customers;
DROP POLICY IF EXISTS "Restrict customers to authenticated user's own records only" ON public.customers;

-- Create policy restricting to the user's own customers only
CREATE POLICY "Restrict customers to authenticated user's own records only"
    ON public.customers FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());


-- 4. MEASUREMENTS TABLE
CREATE TABLE IF NOT EXISTS public.measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    updated_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Enable RLS on Measurements
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated select/update measurements" ON public.measurements;
DROP POLICY IF EXISTS "Allow authenticated insert/update measurements" ON public.measurements;
DROP POLICY IF EXISTS "Allow shop isolated access to measurements" ON public.measurements;
DROP POLICY IF EXISTS "Restrict measurements to authenticated user's own records only" ON public.measurements;

-- Create policy restricting to own measurements only
CREATE POLICY "Restrict measurements to authenticated user's own records only"
    ON public.measurements FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());


-- 5. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
    order_number TEXT NOT NULL,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('Pending', 'Cutting', 'Stitching', 'Fitting', 'Ready', 'Ready to Deliver', 'Delivered', 'Archived')) DEFAULT 'Pending',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    due_date DATE NOT NULL,
    measurement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivered_at TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    updated_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Enable RLS on Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated select on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow authenticated write on orders" ON public.orders;
DROP POLICY IF EXISTS "Allow shop isolated access to orders" ON public.orders;
DROP POLICY IF EXISTS "Restrict orders to authenticated user's own records only" ON public.orders;

-- Create policy restricting to own orders only
CREATE POLICY "Restrict orders to authenticated user's own records only"
    ON public.orders FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());


-- 6. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    user_email TEXT,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow owners to view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow inserts into audit logs for authenticated users" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow shop isolated read to audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow inserts into audit logs in same shop" ON public.audit_logs;
DROP POLICY IF EXISTS "Restrict audit_logs to authenticated user's own records only" ON public.audit_logs;

-- Create policies restricting to own audit logs only
CREATE POLICY "Restrict audit_logs to authenticated user's own records only"
    ON public.audit_logs FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());


-- 7. SHOP SETTINGS TABLE (Compound Key per Shop)
CREATE TABLE IF NOT EXISTS public.shop_settings (
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    PRIMARY KEY (shop_id, key)
);

-- Enable RLS on Shop Settings
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read on shop settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Allow owners write access on shop settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Allow shop isolated read to shop settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Allow shop owner write to shop settings" ON public.shop_settings;
DROP POLICY IF EXISTS "Restrict shop_settings to authenticated user's own records only" ON public.shop_settings;

-- Create policy restricting to settings owned by the authenticated user
CREATE POLICY "Restrict shop_settings to authenticated user's own records only"
    ON public.shop_settings FOR ALL
    TO authenticated
    USING (user_id = auth.uid() OR key LIKE auth.uid()::text || ':%')
    WITH CHECK (user_id = auth.uid() OR key LIKE auth.uid()::text || ':%');


-- 8. INVENTORY TABLE (New Table with strict RLS)
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
    updated_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
);

-- Enable RLS on Inventory
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restrict inventory to authenticated user's own records only" ON public.inventory;
CREATE POLICY "Restrict inventory to authenticated user's own records only"
    ON public.inventory FOR ALL
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());


-- 9. PERFORMANCE OPTIMIZING INDEXES FOR FAST SEARCH, JOIN, AND TENANT ISOLATION
-- Tenant lookup indexes (Critical for Multi-Tenant performance)
CREATE INDEX IF NOT EXISTS profiles_shop_id_idx ON public.profiles (shop_id);
CREATE INDEX IF NOT EXISTS customers_shop_id_idx ON public.customers (shop_id);
CREATE INDEX IF NOT EXISTS measurements_shop_id_idx ON public.measurements (shop_id);
CREATE INDEX IF NOT EXISTS orders_shop_id_idx ON public.orders (shop_id);
CREATE INDEX IF NOT EXISTS audit_logs_shop_id_idx ON public.audit_logs (shop_id);
CREATE INDEX IF NOT EXISTS shop_settings_shop_id_idx ON public.shop_settings (shop_id);

-- Standard customer indexes
CREATE INDEX IF NOT EXISTS customers_name_idx ON public.customers (name);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON public.customers (phone);

-- GIN Trigram indexes for ultra-fast customer name and phone substring matching
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON public.customers USING gin (phone gin_trgm_ops);

-- Index foreign keys and sorting columns for orders
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders (order_number);

-- Security/RLS filtering optimization indexes
CREATE INDEX IF NOT EXISTS profiles_created_by_idx ON public.profiles (created_by);
CREATE INDEX IF NOT EXISTS customers_created_by_idx ON public.customers (created_by);
CREATE INDEX IF NOT EXISTS measurements_created_by_idx ON public.measurements (created_by);
CREATE INDEX IF NOT EXISTS orders_created_by_idx ON public.orders (created_by);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS shop_settings_user_id_idx ON public.shop_settings (user_id);
CREATE INDEX IF NOT EXISTS inventory_created_by_idx ON public.inventory (created_by);
