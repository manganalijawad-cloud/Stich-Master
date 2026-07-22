-- SQL SCHEMA FOR TAILOR SHOP MANAGEMENT SYSTEM
-- Execute this script in the Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- AUTO-CREATE PROFILE ON USER SIGNUP
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

-- 1. SHOPS TABLE
CREATE TABLE IF NOT EXISTS public.shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    owner_name TEXT NOT NULL DEFAULT '',
    mobile_number TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid()
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

-- 2. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT '',
    mobile_number TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK (role IN ('Owner', 'Worker')) DEFAULT 'Owner',
    shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS owner_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mobile_number TEXT NOT NULL DEFAULT '';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restrict profiles to authenticated user's own records only" ON public.profiles;

CREATE POLICY "Restrict profiles to authenticated user's own records only"
    ON public.profiles FOR ALL
    TO authenticated
    USING (id = auth.uid() OR created_by = auth.uid())
    WITH CHECK (id = auth.uid() OR created_by = auth.uid());

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS profiles_shop_id_idx ON public.profiles (shop_id);
CREATE INDEX IF NOT EXISTS shops_created_by_idx ON public.shops (created_by);
