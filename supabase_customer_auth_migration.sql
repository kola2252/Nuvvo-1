-- ==============================================================================
-- NUVVO CUSTOMER AUTHENTICATION & PROFILE MIGRATION (NON-DESTRUCTIVE)
-- Run this script in Supabase Dashboard -> SQL Editor
-- Preserves all existing tables, users, orders, and WhatsApp configuration.
-- ==============================================================================

-- 1. CUSTOMER PROFILES TABLE (Linked 1:1 to Supabase Auth auth.users)
-- NEVER stores plaintext passwords or password hashes; Supabase Auth manages credentials.
CREATE TABLE IF NOT EXISTS public.customer_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    mobile TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    delivery_address TEXT NOT NULL DEFAULT '',
    addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
    whatsapp_number TEXT,
    whatsapp_consent BOOLEAN NOT NULL DEFAULT false,
    whatsapp_opt_in_at TIMESTAMPTZ,
    whatsapp_opt_in_source TEXT,
    preferred_language TEXT NOT NULL DEFAULT 'te',
    avatar TEXT,
    role TEXT NOT NULL DEFAULT 'Customer' CHECK (role = 'Customer'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Non-destructive column additions if public.customer_profiles already exists
ALTER TABLE IF EXISTS public.customer_profiles
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS mobile TEXT,
    ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS delivery_address TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS addresses JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_opt_in_source TEXT,
    ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'te',
    ADD COLUMN IF NOT EXISTS avatar TEXT,
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'Customer',
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Guarantee customer_profiles role can never be escalated above Customer
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'customer_profiles_role_customer_only'
          AND conrelid = 'public.customer_profiles'::regclass
    ) THEN
        ALTER TABLE public.customer_profiles
            ADD CONSTRAINT customer_profiles_role_customer_only CHECK (role = 'Customer') NOT VALID;
    END IF;
END $$;

-- 2. CASE-INSENSITIVE UNIQUE CONSTRAINTS (Username & Email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_username_lower
    ON public.customer_profiles (lower(trim(username)))
    WHERE username IS NOT NULL AND trim(username) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_profiles_email_lower
    ON public.customer_profiles (lower(trim(email)))
    WHERE email IS NOT NULL AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_customer_profiles_mobile
    ON public.customer_profiles (mobile);

-- 3. AUTOMATIC UPDATED_AT TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION public.set_customer_profiles_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_customer_profiles_updated_at'
          AND tgrelid = 'public.customer_profiles'::regclass
    ) THEN
        CREATE TRIGGER trg_customer_profiles_updated_at
            BEFORE UPDATE ON public.customer_profiles
            FOR EACH ROW
            EXECUTE FUNCTION public.set_customer_profiles_updated_at();
    END IF;
END $$;

-- 4. STRICT ROW LEVEL SECURITY (RLS) POLICIES
-- Customers can ONLY read/insert/update their own profile row (auth.uid() = id).
-- Unauthenticated/anon clients have ZERO direct read or write access.
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'customer_profiles' AND policyname = 'customer_select_own_profile'
    ) THEN
        CREATE POLICY customer_select_own_profile
            ON public.customer_profiles
            FOR SELECT
            TO authenticated
            USING (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'customer_profiles' AND policyname = 'customer_insert_own_profile'
    ) THEN
        CREATE POLICY customer_insert_own_profile
            ON public.customer_profiles
            FOR INSERT
            TO authenticated
            WITH CHECK (auth.uid() = id AND role = 'Customer');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'customer_profiles' AND policyname = 'customer_update_own_profile'
    ) THEN
        CREATE POLICY customer_update_own_profile
            ON public.customer_profiles
            FOR UPDATE
            TO authenticated
            USING (auth.uid() = id)
            WITH CHECK (auth.uid() = id AND role = 'Customer');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'customer_profiles' AND policyname = 'service_role_all_customer_profiles'
    ) THEN
        CREATE POLICY service_role_all_customer_profiles
            ON public.customer_profiles
            FOR ALL
            TO service_role
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;
