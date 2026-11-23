-- ============================================================================
-- NUVVO CUSTOMER AUTHENTICATION & COMPLETE DATA ISOLATION MIGRATION
-- Safe, idempotent, non-destructive SQL for Supabase PostgreSQL.
-- Preserves all existing users, profiles, orders, admin & franchise records.
-- ============================================================================

-- 1. Ensure customer_id linkage column & performance indexes on customer-owned tables
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS customer_id UUID;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON public.orders (customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE IF EXISTS public.customer_whatsapp_preferences
  ADD COLUMN IF NOT EXISTS customer_id UUID;

CREATE INDEX IF NOT EXISTS idx_wa_prefs_customer_id
  ON public.customer_whatsapp_preferences (customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE IF EXISTS public.payment_transactions
  ADD COLUMN IF NOT EXISTS customer_id UUID;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_customer_id
  ON public.payment_transactions (customer_id)
  WHERE customer_id IS NOT NULL;

ALTER TABLE IF EXISTS public.customer_profiles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Best-effort backfill of orders.customer_id from existing customer_profiles by matching phone (non-destructive)
UPDATE public.orders AS o
SET customer_id = cp.id
FROM public.customer_profiles AS cp
WHERE o.customer_id IS NULL
  AND o.customer_phone IS NOT NULL
  AND cp.mobile IS NOT NULL
  AND RIGHT(REGEXP_REPLACE(o.customer_phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(cp.mobile, '\D', '', 'g'), 10);

-- 2. Enable Row Level Security across all customer-scoped tables
ALTER TABLE IF EXISTS public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_whatsapp_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.order_notifications ENABLE ROW LEVEL SECURITY;

-- 3. Customer Profiles Policies (strict 1:1 ownership via auth.uid(), full access for service_role)
DROP POLICY IF EXISTS "customer_profiles_select_own" ON public.customer_profiles;
CREATE POLICY "customer_profiles_select_own"
  ON public.customer_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "customer_profiles_insert_own" ON public.customer_profiles;
CREATE POLICY "customer_profiles_insert_own"
  ON public.customer_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "customer_profiles_update_own" ON public.customer_profiles;
CREATE POLICY "customer_profiles_update_own"
  ON public.customer_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "customer_profiles_delete_own" ON public.customer_profiles;
CREATE POLICY "customer_profiles_delete_own"
  ON public.customer_profiles
  FOR DELETE
  TO authenticated
  USING (id = auth.uid());

-- 4. Orders Policies (strict per-customer ownership via customer_id = auth.uid(); never permissive for anon)
DROP POLICY IF EXISTS "Public read orders" ON public.orders;
DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Public update orders" ON public.orders;
DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own"
  ON public.orders
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "orders_update_own" ON public.orders;
CREATE POLICY "orders_update_own"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "orders_delete_own" ON public.orders;
CREATE POLICY "orders_delete_own"
  ON public.orders
  FOR DELETE
  TO authenticated
  USING (customer_id = auth.uid());

-- 5. WhatsApp Preferences Policies (isolated per customer_id = auth.uid())
DROP POLICY IF EXISTS "wa_prefs_select_own" ON public.customer_whatsapp_preferences;
CREATE POLICY "wa_prefs_select_own"
  ON public.customer_whatsapp_preferences
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "wa_prefs_insert_own" ON public.customer_whatsapp_preferences;
CREATE POLICY "wa_prefs_insert_own"
  ON public.customer_whatsapp_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "wa_prefs_update_own" ON public.customer_whatsapp_preferences;
CREATE POLICY "wa_prefs_update_own"
  ON public.customer_whatsapp_preferences
  FOR UPDATE
  TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- 6. Payment Transactions & Order Notifications Policies (scoped via parent order customer_id = auth.uid())
DROP POLICY IF EXISTS "payment_transactions_select_own" ON public.payment_transactions;
CREATE POLICY "payment_transactions_select_own"
  ON public.payment_transactions
  FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payment_transactions.order_id
        AND o.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "order_notifications_select_own" ON public.order_notifications;
CREATE POLICY "order_notifications_select_own"
  ON public.order_notifications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_notifications.order_id
        AND o.customer_id = auth.uid()
    )
  );
