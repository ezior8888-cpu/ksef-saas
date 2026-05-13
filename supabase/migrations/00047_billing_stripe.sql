-- ═══════════════════════════════════════════════════════════════
-- Faza 25 — Stripe billing infrastructure (Krok 1)
-- ═══════════════════════════════════════════════════════════════
-- Decyzje architektoniczne:
--   - Subskrypcja per-tenant (organizacja) — wszyscy członkowie korzystają.
--     `tenants.stripe_customer_id` to natural pivot.
--   - Trial 30 dni (zgodnie z landing copy „Wypróbuj 30 dni za darmo").
--   - Self-invoicing aktywne od MVP — `stripe_payments.vat_invoice_id` linkuje
--     do faktury VAT wygenerowanej przez nasz KSeF (Faza 25 Krok 4).
--
-- RLS strategia:
--   - SELECT przez authenticated user gdy tenant_id = current_tenant
--   - INSERT/UPDATE TYLKO service_role (webhook Stripe + admin)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Tenant extension: stripe_customer_id ───────────────────────────
--
-- Bez kolumny `stripe_customer_id` w `tenants` nie mamy gdzie zacumować
-- customer'a Stripe'a. Lazy creation: pole jest NULL aż user otworzy
-- ekran billingu / przejdzie przez checkout pierwszy raz.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_stripe_customer
  ON public.tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN public.tenants.stripe_customer_id IS
  'Stripe Customer ID (`cus_...`). Lazy-created przy pierwszym checkout/portal access.';

-- ─── 2. ENUMs ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.subscription_status_enum AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'paused'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_plan_enum AS ENUM ('monthly', 'annual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.stripe_payment_status_enum AS ENUM (
    'succeeded',
    'failed',
    'pending',
    'refunded',
    'partially_refunded'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3. subscriptions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Stripe references (źródło prawdy).
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL,
  stripe_price_id TEXT NOT NULL,

  status public.subscription_status_enum NOT NULL,
  plan public.subscription_plan_enum NOT NULL,

  -- Period bounds (sync z `current_period_start/end` w Stripe).
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,

  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,

  -- Surowy snapshot z webhook'a (debugowanie problemów). Trzymamy ostatni
  -- `customer.subscription.*` payload — bez tego trudno odtworzyć kontekst.
  last_webhook_payload JSONB,
  last_webhook_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jedna AKTYWNA subscription per tenant. Status 'canceled'/'incomplete_expired'
-- nie blokuje nowych — partial UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriptions_tenant_active
  ON public.subscriptions (tenant_id)
  WHERE status NOT IN ('canceled', 'incomplete_expired');

CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant
  ON public.subscriptions (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON public.subscriptions (stripe_customer_id);

-- Dla trial countdown UI — efektywne pytanie „kogo trial kończy się jutro".
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end
  ON public.subscriptions (trial_end)
  WHERE status = 'trialing' AND trial_end IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER trigger_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscriptions FROM anon;
GRANT SELECT ON public.subscriptions TO authenticated;

DROP POLICY IF EXISTS subscriptions_select_own_tenant ON public.subscriptions;
CREATE POLICY subscriptions_select_own_tenant ON public.subscriptions
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

COMMENT ON TABLE public.subscriptions IS
  'Stripe subscriptions per tenant (Faza 25). Source-of-truth = Stripe, lokalny mirror dla szybkich query.';

-- ─── 4. stripe_payments ───────────────────────────────────────────────
--
-- Każdy succeeded payment to candidate na self-invoicing przez KSeF (Krok 4).
-- `vat_invoice_id` linkuje do faktury VAT która została wygenerowana — gdy
-- NULL = jeszcze nie wystawiona (Inngest event się zaplanował lub failnął).

CREATE TABLE IF NOT EXISTS public.stripe_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  -- Stripe references.
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_invoice_id TEXT UNIQUE,
  stripe_charge_id TEXT,

  status public.stripe_payment_status_enum NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  -- VAT extraction z Stripe (gdy używamy `automatic_tax` lub manual line items).
  tax_cents BIGINT NOT NULL DEFAULT 0,

  paid_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Self-invoicing: FK do faktury wystawionej w naszym KSeF.
  -- NULL = jeszcze nie wystawiona; UPDATE po `submit-invoice` succeeds.
  vat_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  vat_invoice_submitted_at TIMESTAMPTZ,

  -- Surowy webhook payload — debugging.
  last_webhook_payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_tenant_paid
  ON public.stripe_payments (tenant_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_subscription
  ON public.stripe_payments (subscription_id);

-- Dla self-invoicing job: znajdź payments które jeszcze nie mają faktury VAT.
CREATE INDEX IF NOT EXISTS idx_stripe_payments_pending_vat_invoice
  ON public.stripe_payments (created_at)
  WHERE status = 'succeeded' AND vat_invoice_id IS NULL;

DROP TRIGGER IF EXISTS trigger_stripe_payments_updated_at ON public.stripe_payments;
CREATE TRIGGER trigger_stripe_payments_updated_at
  BEFORE UPDATE ON public.stripe_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_payments FROM anon;
GRANT SELECT ON public.stripe_payments TO authenticated;

DROP POLICY IF EXISTS stripe_payments_select_own_tenant ON public.stripe_payments;
CREATE POLICY stripe_payments_select_own_tenant ON public.stripe_payments
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- ─── 5. stripe_refunds ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stripe_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.stripe_payments(id) ON DELETE CASCADE,

  stripe_refund_id TEXT NOT NULL UNIQUE,

  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  reason TEXT,
  status TEXT NOT NULL,  -- Stripe: succeeded / pending / failed / canceled

  -- Kto wystawił refund (admin operator). NULL gdy automatic z dunning logic.
  triggered_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_refunds_payment
  ON public.stripe_refunds (payment_id);

CREATE INDEX IF NOT EXISTS idx_stripe_refunds_tenant_time
  ON public.stripe_refunds (tenant_id, created_at DESC);

ALTER TABLE public.stripe_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_refunds FROM anon;
GRANT SELECT ON public.stripe_refunds TO authenticated;

DROP POLICY IF EXISTS stripe_refunds_select_own_tenant ON public.stripe_refunds;
CREATE POLICY stripe_refunds_select_own_tenant ON public.stripe_refunds
  FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_current_tenant_id());

-- ─── 6. stripe_webhook_events (idempotency) ────────────────────────────
--
-- Stripe gwarantuje at-least-once delivery. Bez idempotency tabeli, ponowny
-- webhook na ten sam event_id by zduplikował zapis (np. utworzył drugi
-- payment row dla tego samego `pi_*`).

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  -- Stripe event ID `evt_*` — natural unique constraint.
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  -- Snapshot payload do replay/debug.
  payload JSONB NOT NULL,
  -- 'processed' / 'failed' / 'skipped'
  processing_status TEXT NOT NULL DEFAULT 'processed',
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_time
  ON public.stripe_webhook_events (type, received_at DESC);

-- Webhook handler tylko service_role.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;

COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency log dla Stripe webhooks (Faza 25). Każdy `evt_*` przetwarzany raz; powtórki są skip-owane.';
