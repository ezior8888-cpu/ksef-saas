-- ═══════════════════════════════════════════════════════════════
-- Faza 25 Krok 5 — Billing notifications idempotency log
-- ═══════════════════════════════════════════════════════════════
-- Cel: cron `trial-countdown-emails` leci codziennie. Bez tej tabeli ten
-- sam stage (np. "trial-7d") byłby wysłany 7 razy gdy user jest w 7-dniowym
-- oknie. Wpis do tej tabeli przed wysłaniem → ON CONFLICT skip = jeden email
-- per stage per subscription.
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.billing_notification_kind_enum AS ENUM (
    'trial_14d',
    'trial_7d',
    'trial_3d',
    'trial_1d',
    'payment_failed',
    'refund_issued'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.billing_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- Subscription / payment / refund — to którego encyjki dotyczy notyfikacja.
  -- Dla `trial_*` to subscription.id, dla `payment_failed` — payment.id,
  -- dla `refund_issued` — refund.id.
  entity_id UUID NOT NULL,
  kind public.billing_notification_kind_enum NOT NULL,
  -- Email odbiorcy (snapshot na moment wysyłki — owner mógł go zmienić).
  recipient_email TEXT NOT NULL,
  -- Status z Resend / fallback.
  status TEXT NOT NULL DEFAULT 'sent',
  resend_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IDEMPOTENCY: jedna notyfikacja danego typu per encja. Cron INSERT'uje
-- przed wysłaniem; przy duplikacie skip + log.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_notifications_entity_kind
  ON public.billing_notifications (entity_id, kind);

-- Wyszukiwanie historii notyfikacji dla danego tenanta (admin panel).
CREATE INDEX IF NOT EXISTS idx_billing_notifications_tenant_time
  ON public.billing_notifications (tenant_id, sent_at DESC);

-- Service-role only — admin czyta przez admin client.
ALTER TABLE public.billing_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_notifications FROM anon, authenticated;
GRANT ALL ON public.billing_notifications TO service_role;

COMMENT ON TABLE public.billing_notifications IS
  'Log billing email notyfikacji (Faza 25). UNIQUE(entity_id, kind) zapobiega duplikatom przy cron retry.';
