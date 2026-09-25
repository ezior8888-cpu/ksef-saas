-- Durable per-tenant Checkout claim. Apply after 00078-00080 and only during
-- a coordinated rollout that has stopped old Checkout writers. Never run from
-- the agent workspace.
--
-- Stripe and Postgres do not share a transaction. A creating/uncertain claim
-- cannot expire by time alone: the provider may have created a live Session
-- even when the application lost its response.
DO $$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.claim_stripe_subscription_sync(text)'
  ) IS NULL
     OR pg_catalog.to_regclass('public.stripe_financial_cases') IS NULL THEN
    RAISE EXCEPTION 'Apply 00078-00080 before Checkout claim migration'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE TABLE public.stripe_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL
    CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
      AND pg_catalog.length(stripe_customer_id) <= 255),
  stripe_price_id text NOT NULL
    CHECK (stripe_price_id <> ''
      AND pg_catalog.length(stripe_price_id) <= 255),
  plan text NOT NULL CHECK (plan IN ('monthly', 'annual')),
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN (
      'creating', 'open', 'uncertain', 'held', 'completed',
      'expired', 'abandoned', 'retired'
    )),
  stripe_session_id text UNIQUE
    CHECK (stripe_session_id IS NULL OR (
      stripe_session_id ~ '^cs_[A-Za-z0-9]+$'
      AND pg_catalog.length(stripe_session_id) <= 255
    )),
  session_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT stripe_checkout_attempt_session_pair CHECK (
    (stripe_session_id IS NULL) = (session_expires_at IS NULL)
  ),
  CONSTRAINT stripe_checkout_attempt_open_session CHECK (
    status NOT IN ('open', 'completed', 'expired')
    OR stripe_session_id IS NOT NULL
  )
);

-- Historical attempts remain available for reconciliation. Only one
-- unresolved attempt may exist for a tenant at a time.
CREATE UNIQUE INDEX stripe_checkout_one_unresolved_tenant
  ON public.stripe_checkout_attempts (tenant_id)
  WHERE status IN ('creating', 'open', 'uncertain', 'held', 'completed');

CREATE INDEX stripe_checkout_attention
  ON public.stripe_checkout_attempts (status, created_at)
  WHERE status IN ('creating', 'uncertain', 'held');

CREATE INDEX stripe_checkout_open_expiry_attention
  ON public.stripe_checkout_attempts (session_expires_at)
  WHERE status = 'open';
ALTER TABLE public.stripe_checkout_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_checkout_attempts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.stripe_checkout_attempts TO service_role;

COMMENT ON TABLE public.stripe_checkout_attempts IS
  'Durable Checkout attempts. Unknown Stripe create outcomes remain blocking until manual reconciliation.';

-- Subscription mirror writes take the same tenant lock as a Checkout claim.
-- This closes the local check/insert race while the webhook RPC applies a
-- snapshot. A subscription may not silently move between tenants.
CREATE OR REPLACE FUNCTION public.lock_stripe_subscription_tenant_for_checkout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Stripe subscription tenant cannot be rebound'
      USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id = NEW.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stripe subscription tenant not found'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stripe_subscription_checkout_tenant_lock
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION
    public.lock_stripe_subscription_tenant_for_checkout();

REVOKE ALL ON FUNCTION public.lock_stripe_subscription_tenant_for_checkout()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.claim_stripe_checkout_attempt(
  p_tenant_id uuid,
  p_customer_id text,
  p_price_id text,
  p_plan text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id text;
  v_existing public.stripe_checkout_attempts%ROWTYPE;
  v_attempt_id uuid;
BEGIN
  IF p_tenant_id IS NULL
     OR p_customer_id IS NULL OR p_customer_id !~ '^cus_[A-Za-z0-9]+$'
     OR pg_catalog.length(p_customer_id) > 255
     OR p_price_id IS NULL OR p_price_id = ''
     OR pg_catalog.length(p_price_id) > 255
     OR p_plan NOT IN ('monthly', 'annual') OR p_plan IS NULL THEN
    RAISE EXCEPTION 'Invalid Checkout claim arguments'
      USING ERRCODE = '22023';
  END IF;

  -- The tenant row serializes all claims for the same tenant, including the
  -- first insert when no attempt row exists yet. Check the local mirror again
  -- inside this serialized claim; the earlier application check is only fast
  -- feedback, never the authority for acquiring the claim.
  SELECT stripe_customer_id INTO v_customer_id
    FROM public.tenants
   WHERE id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND OR v_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Checkout Customer does not belong to tenant'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE tenant_id = p_tenant_id
       AND status NOT IN ('canceled', 'incomplete_expired')
  ) THEN
    RETURN pg_catalog.jsonb_build_object('state', 'subscription');
  END IF;

  SELECT * INTO v_existing
    FROM public.stripe_checkout_attempts
   WHERE tenant_id = p_tenant_id
     AND status IN ('creating', 'open', 'uncertain', 'held', 'completed')
   FOR UPDATE;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', v_existing.status,
      'attemptId', v_existing.id,
      'customerId', v_existing.stripe_customer_id,
      'priceId', v_existing.stripe_price_id,
      'plan', v_existing.plan,
      'sessionId', v_existing.stripe_session_id
    );
  END IF;

  INSERT INTO public.stripe_checkout_attempts (
    tenant_id, stripe_customer_id, stripe_price_id, plan
  ) VALUES (
    p_tenant_id, p_customer_id, p_price_id, p_plan
  ) RETURNING id INTO v_attempt_id;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'claimed', 'attemptId', v_attempt_id
  );
END;
$$;

-- Called only after the Checkout API returned a verified open Session. A lost
-- DB response remains safe: the old claim continues to block another create.
CREATE OR REPLACE FUNCTION public.record_stripe_checkout_session(
  p_attempt_id uuid,
  p_session_id text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_attempt_id IS NULL OR p_session_id IS NULL
     OR p_session_id !~ '^cs_[A-Za-z0-9]+$'
     OR pg_catalog.length(p_session_id) > 255
     OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'Invalid Checkout Session record'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.stripe_checkout_attempts
     SET status = 'open',
         stripe_session_id = p_session_id,
         session_expires_at = p_expires_at,
         updated_at = pg_catalog.now()
   WHERE id = p_attempt_id
     AND status = 'creating'
     AND stripe_session_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Any error after the provider create was attempted is ambiguous, even if an
-- SDK exception looked transient. Do not automatically retry or time out.
CREATE OR REPLACE FUNCTION public.hold_stripe_checkout_attempt(
  p_attempt_id uuid,
  p_expected_status text,
  p_new_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_attempt_id IS NULL
     OR p_expected_status NOT IN ('creating', 'open')
     OR p_new_status NOT IN ('uncertain', 'held') THEN
    RAISE EXCEPTION 'Invalid Checkout hold transition'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.stripe_checkout_attempts
     SET status = p_new_status,
         updated_at = pg_catalog.now()
   WHERE id = p_attempt_id
     AND status = p_expected_status;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- This is only for failures proven to occur BEFORE sessions.create was called.
CREATE OR REPLACE FUNCTION public.abandon_stripe_checkout_attempt(
  p_attempt_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Checkout attempt ID' USING ERRCODE = '22023';
  END IF;
  UPDATE public.stripe_checkout_attempts
     SET status = 'abandoned', updated_at = pg_catalog.now()
   WHERE id = p_attempt_id
     AND status = 'creating'
     AND stripe_session_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- Only a fresh, identity-checked Stripe retrieval may drive this RPC. The
-- attempt ID plus Session ID is a compare-and-swap boundary. No clock-only
-- expiry and no automatic release of completed/uncertain/held attempts.
CREATE OR REPLACE FUNCTION public.settle_stripe_checkout_session(
  p_attempt_id uuid,
  p_session_id text,
  p_new_status text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_attempt_id IS NULL OR p_session_id IS NULL
     OR p_session_id !~ '^cs_[A-Za-z0-9]+$'
     OR pg_catalog.length(p_session_id) > 255
     OR p_new_status NOT IN ('completed', 'expired') THEN
    RAISE EXCEPTION 'Invalid Checkout settlement'
      USING ERRCODE = '22023';
  END IF;
  UPDATE public.stripe_checkout_attempts
     SET status = p_new_status, updated_at = pg_catalog.now()
   WHERE id = p_attempt_id
     AND status = 'open'
     AND stripe_session_id = p_session_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

-- A completed Checkout can be retired only after the application verifies
-- the exact Session and terminal Stripe Subscription, and the local mirror
-- independently confirms the same terminal subscription under tenant lock.
-- This permits a new Checkout after cancellation without releasing an
-- unmirrored or still-active subscription.
CREATE OR REPLACE FUNCTION public.retire_completed_stripe_checkout_attempt(
  p_attempt_id uuid,
  p_session_id text,
  p_subscription_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_tenant_customer text;
  v_attempt public.stripe_checkout_attempts%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_attempt_id IS NULL OR p_session_id IS NULL
     OR p_session_id !~ '^cs_[A-Za-z0-9]+$'
     OR pg_catalog.length(p_session_id) > 255
     OR p_subscription_id IS NULL
     OR p_subscription_id !~ '^sub_[A-Za-z0-9]+$'
     OR pg_catalog.length(p_subscription_id) > 255 THEN
    RAISE EXCEPTION 'Invalid completed Checkout retirement'
      USING ERRCODE = '22023';
  END IF;

  SELECT tenant_id INTO v_tenant_id
    FROM public.stripe_checkout_attempts
   WHERE id = p_attempt_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- All Checkout claims and subscription mirror writes take this lock first.
  SELECT stripe_customer_id INTO v_tenant_customer
    FROM public.tenants
   WHERE id = v_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_attempt
    FROM public.stripe_checkout_attempts
   WHERE id = p_attempt_id
     AND tenant_id = v_tenant_id
   FOR UPDATE;
  IF NOT FOUND OR v_attempt.status <> 'completed'
     OR v_attempt.stripe_session_id IS DISTINCT FROM p_session_id
     OR v_attempt.stripe_customer_id IS DISTINCT FROM v_tenant_customer THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE tenant_id = v_tenant_id
       AND stripe_subscription_id = p_subscription_id
       AND stripe_customer_id = v_tenant_customer
       AND status IN ('canceled', 'incomplete_expired')
  ) OR EXISTS (
    SELECT 1 FROM public.subscriptions
     WHERE tenant_id = v_tenant_id
       AND status NOT IN ('canceled', 'incomplete_expired')
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.stripe_checkout_attempts
     SET status = 'retired', updated_at = pg_catalog.now()
   WHERE id = p_attempt_id AND status = 'completed';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_stripe_checkout_attempt(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_stripe_checkout_session(uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_stripe_checkout_attempt(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.abandon_stripe_checkout_attempt(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_stripe_checkout_session(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retire_completed_stripe_checkout_attempt(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_checkout_attempt(uuid,text,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_stripe_checkout_session(uuid,text,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.hold_stripe_checkout_attempt(uuid,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.abandon_stripe_checkout_attempt(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_stripe_checkout_session(uuid,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.retire_completed_stripe_checkout_attempt(uuid,text,text)
  TO service_role;
