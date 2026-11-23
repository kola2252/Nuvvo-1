-- ============================================================================
-- NUVVO FOOD & FAST DELIVERY — MASTER UPGRADE (NON-DESTRUCTIVE SQL MIGRATION)
-- Safe to run multiple times in Supabase SQL Editor.
-- Does NOT drop, truncate, or delete any existing tables, rows, or users.
-- ============================================================================

-- 1. Extend public.orders safely for idempotency, soft-archive, and status reasons
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS hidden_by_customer boolean NOT NULL DEFAULT false;

-- Partial unique index preventing duplicate checkout submissions per customer
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_customer_idempotency
  ON public.orders (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_visible
  ON public.orders (customer_id, hidden_by_customer);

-- 2. Dedicated Support Tickets table (with non-destructive RLS policies)
-- Note: Backend Express routes also persist ticket & store_operations snapshots
-- in app_settings / server store when service-role sync is used, so both paths work seamlessly.
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id text PRIMARY KEY,
  customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_phone text,
  order_id text,
  category text NOT NULL DEFAULT 'General',
  subject text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_customer
  ON public.support_tickets (customer_id, created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'support_tickets' AND policyname = 'Customers can view own support tickets'
  ) THEN
    CREATE POLICY "Customers can view own support tickets"
      ON public.support_tickets FOR SELECT
      USING (auth.uid() = customer_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'support_tickets' AND policyname = 'Customers can create own support tickets'
  ) THEN
    CREATE POLICY "Customers can create own support tickets"
      ON public.support_tickets FOR INSERT
      WITH CHECK (auth.uid() = customer_id);
  END IF;
END $$;

-- 3. Informational summary of app_settings keys managed by the Master Upgrade:
--   * 'store_operations'   -> StoreOperationsConfig JSON (default isCustomConfigActive=false, ₹39 delivery > ₹400 free, 5% GST)
--   * 'support_tickets'    -> Array of SupportTicket records synchronized via /api/support-tickets
--   * 'delivery_partners'  -> Admin-managed DeliveryPartner directory synced via /api/admin/delivery-partners/sync
