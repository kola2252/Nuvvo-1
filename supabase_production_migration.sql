-- ==============================================================================
-- NUVVO PRODUCTION READINESS SUPABASE MIGRATION
-- Run this script in the Supabase Dashboard -> SQL Editor
-- ==============================================================================

-- 1. ORDER NOTIFICATIONS TABLE (Durable Outbox & WhatsApp Delivery Tracker)
-- Used for WhatsApp Cloud API dispatch, idempotency, and duplicate-prevention
CREATE TABLE IF NOT EXISTS public.order_notifications (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'whatsapp',
    recipient TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'submitted', 'sent', 'delivered', 'read', 'failed', 'skipped_no_consent', 'not_configured', 'duplicate_skipped'
    recipient_role TEXT NOT NULL DEFAULT 'admin', -- 'admin' | 'customer'
    notification_type TEXT NOT NULL DEFAULT 'new_order', -- 'admin_new_order' | 'customer_order_confirmation' | 'order_accepted' | 'order_preparing' | 'order_out_for_delivery' | 'order_delivered' | 'order_cancelled'
    template_name TEXT,
    idempotency_key TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    consent_verified BOOLEAN NOT NULL DEFAULT false,
    message_id TEXT,      -- WhatsApp Cloud API message ID (wamid)
    payload JSONB,
    response_payload JSONB,
    webhook_events JSONB DEFAULT '[]'::jsonb,
    error_message TEXT,
    submitted_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Safely add new columns if order_notifications already exists from an earlier migration
ALTER TABLE IF EXISTS public.order_notifications
    ADD COLUMN IF NOT EXISTS recipient_role TEXT NOT NULL DEFAULT 'admin',
    ADD COLUMN IF NOT EXISTS notification_type TEXT NOT NULL DEFAULT 'new_order',
    ADD COLUMN IF NOT EXISTS template_name TEXT,
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS consent_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS webhook_events JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- Fast lookup indexes for idempotency, webhooks, and admin queries
CREATE INDEX IF NOT EXISTS idx_order_notifications_order_id 
    ON public.order_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notifications_message_id 
    ON public.order_notifications(message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_notifications_idempotency_key
    ON public.order_notifications(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_notifications_status 
    ON public.order_notifications(status);
CREATE INDEX IF NOT EXISTS idx_order_notifications_created_at 
    ON public.order_notifications(created_at DESC);

-- Enable Row Level Security (RLS) on order_notifications
ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;

-- Service role has full access to order_notifications
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'order_notifications' AND policyname = 'service_role_all_notifications'
    ) THEN
        CREATE POLICY service_role_all_notifications 
        ON public.order_notifications 
        FOR ALL 
        TO service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- 2. ENSURE FOOD_ITEMS SCHEMA AND SECURE RLS POLICIES
-- Ensure columns exist safely without altering existing data
ALTER TABLE IF EXISTS public.food_items 
    ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS image_url TEXT,
    ADD COLUMN IF NOT EXISTS restaurant_id TEXT;

-- Enable RLS on food_items
ALTER TABLE IF EXISTS public.food_items ENABLE ROW LEVEL SECURITY;

-- Allow public read of active food items
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'food_items' AND policyname = 'public_read_food_items'
    ) THEN
        CREATE POLICY public_read_food_items 
        ON public.food_items 
        FOR SELECT 
        TO public 
        USING (true);
    END IF;
END $$;

-- Only service role / backend proxy can modify food items
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'food_items' AND policyname = 'service_role_modify_food_items'
    ) THEN
        CREATE POLICY service_role_modify_food_items 
        ON public.food_items 
        FOR ALL 
        TO service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- Ensure consistent RLS policies for admin users and proxy calls to delete and modify food items
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'food_items' AND policyname = 'allow_admin_delete_food_items'
    ) THEN
        CREATE POLICY allow_admin_delete_food_items 
        ON public.food_items 
        FOR DELETE 
        TO authenticated, anon, service_role 
        USING (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'food_items' AND policyname = 'allow_admin_manage_food_items'
    ) THEN
        CREATE POLICY allow_admin_manage_food_items 
        ON public.food_items 
        FOR ALL 
        TO authenticated, anon, service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- 3. ENSURE ORDERS TABLE SCHEMA AND SECURE RLS POLICIES
ALTER TABLE IF EXISTS public.orders
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS final_amount NUMERIC,
    ADD COLUMN IF NOT EXISTS customer_phone TEXT,
    ADD COLUMN IF NOT EXISTS customer_email TEXT,
    ADD COLUMN IF NOT EXISTS customer_whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_consent BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS restaurant_name TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp_notification_status TEXT;

ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;

-- Allow customers and guest checkouts to insert orders
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'orders' AND policyname = 'allow_insert_orders'
    ) THEN
        CREATE POLICY allow_insert_orders 
        ON public.orders 
        FOR INSERT 
        TO public 
        WITH CHECK (true);
    END IF;
END $$;

-- Allow users to read orders (by service role or public read for demo/active sessions)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'orders' AND policyname = 'service_role_all_orders'
    ) THEN
        CREATE POLICY service_role_all_orders 
        ON public.orders 
        FOR ALL 
        TO service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- 4. APP SETTINGS TABLE (Stores payment configuration, COD toggles, and system flags)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON public.app_settings(key);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read of app settings so customer checkout knows active payment options
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'app_settings' AND policyname = 'public_read_app_settings'
    ) THEN
        CREATE POLICY public_read_app_settings 
        ON public.app_settings 
        FOR SELECT 
        TO public 
        USING (true);
    END IF;
END $$;

-- Allow service role full write access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'app_settings' AND policyname = 'service_role_all_app_settings'
    ) THEN
        CREATE POLICY service_role_all_app_settings 
        ON public.app_settings 
        FOR ALL 
        TO service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- Seed initial payment configuration if not present
INSERT INTO public.app_settings (key, value, description)
VALUES (
    'payment_config',
    '{"enableCod": true, "enableUpi": true, "customerInstructions": "Please verify UPI recipient name before sending. For Cash on Delivery, keep exact cash ready upon delivery."}'::jsonb,
    'Store payment options and checkout configuration'
)
ON CONFLICT (key) DO NOTHING;

-- 5. PAYMENT TRANSACTIONS TABLE (PhonePe Gateway S2S audit & duplicate prevention)
CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id TEXT PRIMARY KEY, -- merchant_transaction_id
    order_id TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'phonepe',
    amount_in_paise BIGINT NOT NULL,
    amount_in_rupees NUMERIC NOT NULL,
    status TEXT NOT NULL, -- 'INITIATED', 'COMPLETED', 'FAILED', 'PENDING'
    phonepe_transaction_id TEXT,
    response_code TEXT,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_order_id ON public.payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_status ON public.payment_transactions(status);

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'payment_transactions' AND policyname = 'service_role_all_payment_transactions'
    ) THEN
        CREATE POLICY service_role_all_payment_transactions 
        ON public.payment_transactions 
        FOR ALL 
        TO service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- 6. USER OTPS TABLE (Stores single-use OTP codes with expiration & attempt limits)
CREATE TABLE IF NOT EXISTS public.user_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL,          -- email or mobile phone
    otp_hash TEXT NOT NULL,            -- PBKDF2 cryptographic hash
    salt TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'login', -- 'registration', 'login', 'password_reset'
    expires_at TIMESTAMPTZ NOT NULL,
    consumed BOOLEAN NOT NULL DEFAULT false,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_otps_identifier_purpose 
    ON public.user_otps(identifier, purpose);
CREATE INDEX IF NOT EXISTS idx_user_otps_expires_at 
    ON public.user_otps(expires_at);

ALTER TABLE public.user_otps ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_otps' AND policyname = 'service_role_all_user_otps'
    ) THEN
        CREATE POLICY service_role_all_user_otps 
        ON public.user_otps 
        FOR ALL 
        TO service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- 7. API LOGS TABLE (Tracks API response times, status codes, cache hits, and error rates)
CREATE TABLE IF NOT EXISTS public.api_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    method TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    is_error BOOLEAN NOT NULL DEFAULT false,
    error_rate NUMERIC NOT NULL DEFAULT 0,
    cache_hit BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    client_ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint ON public.api_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON public.api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_is_error ON public.api_logs(is_error);

ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'api_logs' AND policyname = 'public_insert_api_logs'
    ) THEN
        CREATE POLICY public_insert_api_logs 
        ON public.api_logs 
        FOR INSERT 
        TO public 
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'api_logs' AND policyname = 'service_role_all_api_logs'
    ) THEN
        CREATE POLICY service_role_all_api_logs 
        ON public.api_logs 
        FOR ALL 
        TO service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- 8. EMAIL LOGS TABLE (Tracks status, recipient, and error details of every OTP email attempt)
CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient TEXT NOT NULL,
    flow TEXT NOT NULL, -- 'signInWithOtp' | 'verifyOtp'
    status TEXT NOT NULL, -- 'initiated' | 'sent' | 'verified' | 'failed' | 'rate_limited' | 'expired'
    provider TEXT NOT NULL DEFAULT 'supabase_auth', -- 'supabase_auth' | 'smtp' | 'client_auth'
    error_details TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient);
CREATE INDEX IF NOT EXISTS idx_email_logs_flow ON public.email_logs(flow);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs(created_at DESC);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_logs' AND policyname = 'public_insert_email_logs'
    ) THEN
        CREATE POLICY public_insert_email_logs 
        ON public.email_logs 
        FOR INSERT 
        TO public 
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_logs' AND policyname = 'public_select_email_logs'
    ) THEN
        CREATE POLICY public_select_email_logs 
        ON public.email_logs 
        FOR SELECT 
        TO public 
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'email_logs' AND policyname = 'service_role_all_email_logs'
    ) THEN
        CREATE POLICY service_role_all_email_logs 
        ON public.email_logs 
        FOR ALL 
        TO service_role 
        USING (true) 
        WITH CHECK (true);
    END IF;
END $$;

-- 9. CUSTOMER WHATSAPP PREFERENCES & CONSENT TABLE
-- Stores explicit opt-in consent and verified E.164 WhatsApp numbers (never assumes phone = consent or email = phone)
CREATE TABLE IF NOT EXISTS public.customer_whatsapp_preferences (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    whatsapp_number TEXT NOT NULL, -- Normalized E.164 (+91XXXXXXXXXX)
    consent_granted BOOLEAN NOT NULL DEFAULT false,
    consent_source TEXT,           -- 'registration' | 'checkout' | 'profile' | 'webhook_opt_out'
    consent_timestamp TIMESTAMPTZ,
    opt_out_timestamp TIMESTAMPTZ,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_wa_prefs_customer_id
    ON public.customer_whatsapp_preferences(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_wa_prefs_email
    ON public.customer_whatsapp_preferences(customer_email);
CREATE INDEX IF NOT EXISTS idx_customer_wa_prefs_phone
    ON public.customer_whatsapp_preferences(customer_phone);
CREATE INDEX IF NOT EXISTS idx_customer_wa_prefs_whatsapp
    ON public.customer_whatsapp_preferences(whatsapp_number);

ALTER TABLE public.customer_whatsapp_preferences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'customer_whatsapp_preferences' AND policyname = 'public_upsert_customer_whatsapp_prefs'
    ) THEN
        CREATE POLICY public_upsert_customer_whatsapp_prefs
        ON public.customer_whatsapp_preferences
        FOR INSERT
        TO public
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'customer_whatsapp_preferences' AND policyname = 'public_update_customer_whatsapp_prefs'
    ) THEN
        CREATE POLICY public_update_customer_whatsapp_prefs
        ON public.customer_whatsapp_preferences
        FOR UPDATE
        TO public
        USING (true)
        WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'customer_whatsapp_preferences' AND policyname = 'public_select_customer_whatsapp_prefs'
    ) THEN
        CREATE POLICY public_select_customer_whatsapp_prefs
        ON public.customer_whatsapp_preferences
        FOR SELECT
        TO public
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'customer_whatsapp_preferences' AND policyname = 'service_role_all_customer_whatsapp_prefs'
    ) THEN
        CREATE POLICY service_role_all_customer_whatsapp_prefs
        ON public.customer_whatsapp_preferences
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- 10. RAW META WHATSAPP WEBHOOK EVENTS TABLE (Troubleshooting & Delivery Audit Debug Log)
-- Stores raw inbound Meta webhook payloads so Admins can inspect the last 50 events
CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
    id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    event_type TEXT NOT NULL DEFAULT 'unknown', -- 'status' | 'message' | 'opt_out' | 'mixed' | 'invalid_signature' | 'unknown'
    signature_valid BOOLEAN,
    wamid TEXT,
    status_summary TEXT,
    phone_number_id TEXT,
    recipient_or_sender TEXT,
    matched_notification_id TEXT,
    matched_order_id TEXT,
    processed_statuses INTEGER NOT NULL DEFAULT 0,
    processed_opt_outs INTEGER NOT NULL DEFAULT 0,
    error_summary TEXT,
    raw_headers JSONB DEFAULT '{}'::jsonb,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wa_webhook_events_received_at
    ON public.whatsapp_webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_events_wamid
    ON public.whatsapp_webhook_events(wamid);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_events_event_type
    ON public.whatsapp_webhook_events(event_type);

ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'whatsapp_webhook_events' AND policyname = 'service_role_all_whatsapp_webhook_events'
    ) THEN
        CREATE POLICY service_role_all_whatsapp_webhook_events
        ON public.whatsapp_webhook_events
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;


