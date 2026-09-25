-- A composite FK below guarantees that the operation and payment belong to
-- the same tenant even when the service-role caller makes a mistake.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_payments_tenant_id_id
  ON public.stripe_payments (tenant_id, id);
-- Existing mismatched rows are handled during reconciliation; NOT VALID
-- enforces the tenant boundary for every new/updated refund immediately.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_refunds_payment_id_id
  ON public.stripe_refunds (payment_id, id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stripe_refunds_payment_tenant_fk'
      AND conrelid = 'public.stripe_refunds'::regclass
  ) THEN
    ALTER TABLE public.stripe_refunds
      ADD CONSTRAINT stripe_refunds_payment_tenant_fk
      FOREIGN KEY (tenant_id, payment_id)
      REFERENCES public.stripe_payments (tenant_id, id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END;
$$;
-- One durable full-refund attempt per Stripe payment. The row is claimed before
-- calling Stripe so a lost response cannot turn a later admin click into a new
-- refund request. Operators reconcile ambiguous attempts manually.
CREATE TABLE IF NOT EXISTS public.stripe_refund_operations (
  payment_id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT stripe_refund_operations_payment_tenant_fk
    FOREIGN KEY (tenant_id, payment_id)
    REFERENCES public.stripe_payments (tenant_id, id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  stripe_payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'reconciliation_required', 'completed')),
  requested_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  stripe_refund_id TEXT UNIQUE,
  refund_id UUID REFERENCES public.stripe_refunds(id) ON DELETE SET NULL,
  CONSTRAINT stripe_refund_operations_refund_payment_fk
    FOREIGN KEY (payment_id, refund_id)
    REFERENCES public.stripe_refunds (payment_id, id),
  reconciliation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stripe_refund_operations_reference_required
    CHECK (status = 'reconciliation_required' OR stripe_payment_reference IS NOT NULL)
);

ALTER TABLE public.stripe_refund_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_refund_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_refund_operations TO service_role;

COMMENT ON TABLE public.stripe_refund_operations IS
  'Durable admin full-refund claim. Processing or reconciliation_required must never start a new Stripe refund automatically.';

-- An invoice.payment_succeeded/failed webhook can arrive after the refund.
-- Reject the entire stale update even if a concurrent webhook upsert races
-- an admin action. An in-flight or unresolved refund claim also blocks stale
-- payment updates. Returning NULL preserves every column of the row.
CREATE OR REPLACE FUNCTION public.preserve_stripe_payment_refund_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('succeeded', 'failed')
     AND (
       OLD.status IN ('refunded', 'partially_refunded')
       OR EXISTS (
         SELECT 1
         FROM public.stripe_refund_operations AS operation
         WHERE operation.payment_id = OLD.id
       )
     ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_preserve_stripe_payment_refund_status ON public.stripe_payments;
CREATE TRIGGER trigger_preserve_stripe_payment_refund_status
  BEFORE UPDATE OF status ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.preserve_stripe_payment_refund_status();


-- Older releases wrote directly to stripe_refunds. Backfill a blocking claim
-- for every such payment, including partial/failed refunds; their exact Stripe
-- state must be reconciled before another full refund request.
INSERT INTO public.stripe_refund_operations (
  payment_id,
  tenant_id,
  idempotency_key,
  amount_cents,
  currency,
  stripe_payment_reference,
  status,
  requested_by_user_id,
  reason,
  stripe_refund_id,
  refund_id,
  reconciliation_reason,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.tenant_id,
  'admin-full-refund-v1:' || p.id::text,
  COALESCE(NULLIF(p.amount_cents, 0), r.amount_cents),
  p.currency,
  COALESCE(p.stripe_payment_intent_id, p.stripe_charge_id),
  'reconciliation_required',
  r.triggered_by_user_id,
  r.reason,
  r.stripe_refund_id,
  CASE WHEN r.tenant_id = p.tenant_id THEN r.id ELSE NULL END,
  CASE WHEN r.tenant_id = p.tenant_id
    THEN 'historical_refund_row' ELSE 'historical_tenant_mismatch' END,
  r.created_at,
  NOW()
FROM public.stripe_payments AS p
JOIN LATERAL (
  SELECT id, tenant_id, triggered_by_user_id, reason, stripe_refund_id, amount_cents, created_at
  FROM public.stripe_refunds
  WHERE payment_id = p.id
  ORDER BY created_at DESC, id DESC
  LIMIT 1
) AS r ON TRUE
ON CONFLICT (payment_id) DO NOTHING;