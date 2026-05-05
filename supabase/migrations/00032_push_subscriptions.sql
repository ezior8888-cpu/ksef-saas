-- ============================================================================
-- MIGRACJA 00032: Push subscriptions dla Web Push API
-- Faza 17: PWA + Mobile-First
-- (Numeracja: 00021 jest zajęty przez import_jobs_realtime — ten plik = 00032)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,

  user_agent TEXT,
  device_type TEXT,
  device_name TEXT,

  notify_invoice_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  notify_invoice_rejected BOOLEAN NOT NULL DEFAULT TRUE,
  notify_payment_received BOOLEAN NOT NULL DEFAULT TRUE,
  notify_cert_expiry BOOLEAN NOT NULL DEFAULT TRUE,
  notify_inbox_new BOOLEAN NOT NULL DEFAULT FALSE,

  last_used_at TIMESTAMPTZ,
  failed_count INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_push_subs_tenant ON public.push_subscriptions(tenant_id)
  WHERE is_active = TRUE;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Widok / CRUD tylko własnych wierszy i tylko dla aktualnego tenanta (multi-tenant)
CREATE POLICY "Users see own push subscriptions"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND tenant_id = public.get_current_tenant_id()
  );

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid()
    AND tenant_id = public.get_current_tenant_id()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND tenant_id = public.get_current_tenant_id()
  );

CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions per device. Faza 17.';

REVOKE ALL ON TABLE public.push_subscriptions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.push_subscriptions TO authenticated;
