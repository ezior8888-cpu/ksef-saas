-- Protect the local Stripe mirror from late or concurrent webhook snapshots.
-- This migration extends the guard installed by 00075 without weakening the
-- existing refund-operation check. Returning NULL ignores the whole stale row.
CREATE OR REPLACE FUNCTION public.preserve_stripe_payment_refund_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A Stripe invoice belongs to one tenant for its entire lifetime.
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Stripe payment tenant is immutable' USING ERRCODE = '23514';
  END IF;

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

  -- A delayed failure must not turn an already paid invoice into dunning.
  -- A later success after an earlier failed attempt is still permitted.
  IF OLD.status = 'succeeded' AND NEW.status = 'failed' THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_preserve_stripe_payment_refund_status
  ON public.stripe_payments;
CREATE TRIGGER trigger_preserve_stripe_payment_refund_status
  BEFORE UPDATE OF status, tenant_id ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.preserve_stripe_payment_refund_status();

-- Stripe cannot update a canceled subscription. A previously delivered
-- subscription.updated/created snapshot must not reopen the same Stripe ID.
-- A different subscription ID for the tenant remains eligible for creation.
CREATE OR REPLACE FUNCTION public.preserve_canceled_stripe_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- A conflicting snapshot must not move an existing subscription across
  -- tenants or Stripe customers, including when the status is unchanged.
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'Stripe subscription owner is immutable' USING ERRCODE = '23514';
  END IF;

  IF OLD.status = 'canceled' AND NEW.status <> 'canceled' THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_preserve_canceled_stripe_subscription
  ON public.subscriptions;
CREATE TRIGGER trigger_preserve_canceled_stripe_subscription
  BEFORE UPDATE OF status, tenant_id, stripe_customer_id ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.preserve_canceled_stripe_subscription();


-- A plain FK on subscription_id proves existence, not tenant ownership.
-- Check new or rewritten links at the database boundary as well as in TS.
CREATE OR REPLACE FUNCTION public.enforce_stripe_payment_subscription_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.subscription_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.subscriptions AS subscription
    WHERE subscription.id = NEW.subscription_id
      AND subscription.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'Stripe payment subscription tenant mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_stripe_payment_subscription_tenant
  ON public.stripe_payments;
CREATE TRIGGER trigger_stripe_payment_subscription_tenant
  BEFORE INSERT OR UPDATE OF subscription_id, tenant_id ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stripe_payment_subscription_tenant();


-- Subscription metadata alone is not tenant authorization. Before mirroring a
-- Stripe subscription, its customer must be the one already bound to tenant.
-- Existing mismatches are deliberately left for manual reconciliation.
CREATE OR REPLACE FUNCTION public.enforce_stripe_subscription_customer_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    WHERE tenant.id = NEW.tenant_id
      AND tenant.stripe_customer_id = NEW.stripe_customer_id
  ) THEN
    RAISE EXCEPTION 'Stripe subscription customer tenant mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_stripe_subscription_customer_tenant
  ON public.subscriptions;
CREATE TRIGGER trigger_stripe_subscription_customer_tenant
  BEFORE INSERT OR UPDATE OF tenant_id, stripe_customer_id, status
  ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_stripe_subscription_customer_tenant();
-- RLS alone permits the tenant owner to UPDATE the tenant row. Protect the
-- billing identity even if table-level UPDATE grants are present. The service
-- role is the only application identity allowed to establish this binding;
-- the database owner can still perform a supervised reconciliation.
CREATE OR REPLACE FUNCTION public.guard_tenant_stripe_customer_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Once a Customer is bound, even an old service-role app instance may not
  -- replace or clear it. Only a supervised database-owner reconciliation may.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.stripe_customer_id IS NOT NULL
       AND NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
       AND current_user <> 'postgres' THEN
      RAISE EXCEPTION 'Stripe customer binding is immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF current_user NOT IN ('service_role', 'postgres') THEN
    IF TG_OP = 'INSERT' AND NEW.stripe_customer_id IS NOT NULL THEN
      RAISE EXCEPTION 'Stripe customer binding requires service role'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
        RAISE EXCEPTION 'Stripe customer binding requires service role'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tenant_stripe_customer_id() FROM PUBLIC;

DROP TRIGGER IF EXISTS trigger_guard_tenant_stripe_customer_id ON public.tenants;
CREATE TRIGGER trigger_guard_tenant_stripe_customer_id
  BEFORE INSERT OR UPDATE OF stripe_customer_id ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_stripe_customer_id();

-- The subscription INSERT trigger checks the current mapping, but without a
-- foreign key a later tenant UPDATE could detach an existing subscription.
-- NOT VALID leaves historical mismatches for explicit reconciliation while
-- enforcing the relationship on new or changed references immediately.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tenants_id_stripe_customer
  ON public.tenants (id, stripe_customer_id);

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_tenant_customer_fk
  FOREIGN KEY (tenant_id, stripe_customer_id)
  REFERENCES public.tenants (id, stripe_customer_id)
  ON UPDATE RESTRICT ON DELETE CASCADE NOT VALID;

-- A failed external invoice lookup or uncertain email send leaves the
-- notification claim in sending. The monitor counts old claims for manual
-- reconciliation; it must never cause an automatic replay.
CREATE INDEX IF NOT EXISTS idx_billing_notifications_stale_failed_payment
  ON public.billing_notifications (sent_at)
  WHERE kind = 'payment_failed' AND status = 'sending';
