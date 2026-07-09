-- SQL SCHEMA FOR TAILOR SHOP MANAGEMENT SYSTEM
-- Copy and execute this script inside the Supabase SQL Editor.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Owner', 'Worker')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID,
    updated_by UUID
);

-- Enable RLS on Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for Profiles
CREATE POLICY "Allow authenticated reads on profiles" 
    ON public.profiles FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow owners full write on profiles" 
    ON public.profiles FOR ALL 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Owner'
        )
    );

CREATE POLICY "Allow users to insert their own profile" 
    ON public.profiles FOR INSERT 
    TO authenticated 
    WITH CHECK (id = auth.uid());

CREATE POLICY "Allow users to update their own profile" 
    ON public.profiles FOR UPDATE 
    TO authenticated 
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- 2. CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    whatsapp TEXT,
    address TEXT,
    email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on Customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated full access to customers" 
    ON public.customers FOR ALL 
    TO authenticated 
    USING (true);

-- 3. MEASUREMENTS TABLE
CREATE TABLE IF NOT EXISTS public.measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL UNIQUE REFERENCES public.customers(id) ON DELETE CASCADE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on Measurements
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated select/update measurements" 
    ON public.measurements FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow authenticated insert/update measurements" 
    ON public.measurements FOR ALL 
    TO authenticated 
    USING (true);

-- 4. ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('Pending', 'Cutting', 'Stitching', 'Fitting', 'Ready', 'Ready to Deliver', 'Delivered', 'Archived')) DEFAULT 'Pending',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    due_date DATE NOT NULL,
    measurement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on Orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated select on orders" 
    ON public.orders FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow authenticated write on orders" 
    ON public.orders FOR ALL 
    TO authenticated 
    USING (true);

-- 5. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_email TEXT,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow owners to view audit logs" 
    ON public.audit_logs FOR SELECT 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Owner'
        )
    );

CREATE POLICY "Allow inserts into audit logs for authenticated users" 
    ON public.audit_logs FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

-- 6. SHOP SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.shop_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on Shop Settings
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on shop settings" 
    ON public.shop_settings FOR SELECT 
    TO authenticated 
    USING (true);

CREATE POLICY "Allow owners write access on shop settings" 
    ON public.shop_settings FOR ALL 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'Owner'
        )
    );

-- Seed Initial Default Settings (Only runs if key doesn't exist)
INSERT INTO public.shop_settings (key, value, updated_at)
VALUES (
    'shop_name', '"Classic Tailors"'::jsonb, now()
), (
    'phone', '"+1 (555) 123-4567"'::jsonb, now()
), (
    'address', '"123 Elegance Lane, Fashion District"'::jsonb, now()
), (
    'currency', '"$"'::jsonb, now()
), (
    'measurement_fields', '["Collar/Neck", "Chest", "Waist", "Hips", "Shoulder Width", "Sleeve Length", "Bicep", "Wrist", "Shirt/Jacket Length", "Trouser Length", "Inseam", "Thigh", "Ankle"]'::jsonb, now()
), (
    'pipeline_stages', '[{"id": "Pending", "name": "Getting Ready", "enabled": true}, {"id": "Ready to Deliver", "name": "Ready to Deliver", "enabled": true}, {"id": "Delivered", "name": "Delivered", "enabled": true}, {"id": "Archived", "name": "Archived", "enabled": true}]'::jsonb, now()
)
ON CONFLICT (key) DO NOTHING;

-- 7. PERFORMANCE OPTIMIZING INDEXES FOR FAST SEARCH AND JOIN QUERIES
-- Standard btree indexes for exact lookup and sorting
CREATE INDEX IF NOT EXISTS customers_name_idx ON public.customers (name);
CREATE INDEX IF NOT EXISTS customers_phone_idx ON public.customers (phone);

-- Enable pg_trgm extension if not already enabled for fast partial matches (ilike '%query%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN Trigram indexes for ultra-fast customer name and phone substring matching
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx ON public.customers USING gin (phone gin_trgm_ops);

-- Index foreign keys and sorting columns for orders
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders (order_number);
