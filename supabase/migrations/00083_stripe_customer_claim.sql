-- Durable Customer creation claim. Apply after 00081 while all old Customer
-- writers are stopped. Never run this migration from an agent workspace.
--
-- A Stripe create response can be lost after Stripe has stored the Customer.
-- An unresolved claim must not time out or retry automatically: Stripe may
-- prune idempotency keys after at least 24 hours.
-- Keep SECURITY DEFINER creation and privilege revocation in one transaction.
BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.stripe_checkout_attempts') IS NULL THEN
    RAISE EXCEPTION 'Apply 00081 before Customer claim migration'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE TABLE public.stripe_customer_attempts (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'uncertain', 'completed')),
  stripe_customer_id text UNIQUE
    CHECK (stripe_customer_id IS NULL OR (
      stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'
      AND pg_catalog.length(stripe_customer_id) <= 255
    )),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT stripe_customer_completed_id CHECK (
    status <> 'completed' OR stripe_customer_id IS NOT NULL
  )
);

CREATE INDEX stripe_customer_attempt_attention
  ON public.stripe_customer_attempts (status, created_at)
  WHERE status IN ('creating', 'uncertain');

ALTER TABLE public.stripe_customer_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_customer_attempts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.stripe_customer_attempts TO service_role;

COMMENT ON TABLE public.stripe_customer_attempts IS
  'One permanent Customer creation claim per tenant. Unknown provider outcomes remain blocking.';

CREATE OR REPLACE FUNCTION public.claim_stripe_customer_attempt(
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id text;
  v_attempt public.stripe_customer_attempts%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Invalid Customer claim tenant'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize the first claim even when no attempt row exists yet.
  -- This is the same tenant lock used by Checkout and subscription sync.
  SELECT stripe_customer_id INTO v_customer_id
    FROM public.tenants
   WHERE id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found for Customer claim'
      USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_attempt
    FROM public.stripe_customer_attempts
   WHERE tenant_id = p_tenant_id
   FOR UPDATE;

  -- A stale old-code writer could have mapped another Customer while this
  -- claim was in flight. Do not silently use that mapping until reconciled.
  IF v_customer_id IS NOT NULL THEN
    IF FOUND AND (
      v_attempt.status <> 'completed'
      OR v_attempt.stripe_customer_id IS DISTINCT FROM v_customer_id
    ) THEN
      RETURN pg_catalog.jsonb_build_object(
        'state', v_attempt.status, 'attemptId', v_attempt.id
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'state', 'existing', 'customerId', v_customer_id
    );
  END IF;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', v_attempt.status, 'attemptId', v_attempt.id
    );
  END IF;
  INSERT INTO public.stripe_customer_attempts (tenant_id)
  VALUES (p_tenant_id)
  RETURNING * INTO v_attempt;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'claimed', 'attemptId', v_attempt.id
  );
END;
$$;

-- Map the verified Stripe Customer and complete its claim in ONE transaction.
-- Tenant lock comes first, matching claim_stripe_customer_attempt. A lost RPC
-- response can be resolved by the next claim read; no second create is needed.
CREATE OR REPLACE FUNCTION public.record_stripe_customer_attempt(
  p_tenant_id uuid,
  p_attempt_id uuid,
  p_customer_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_customer text;
  v_attempt public.stripe_customer_attempts%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_tenant_id IS NULL OR p_attempt_id IS NULL
     OR p_customer_id IS NULL
     OR p_customer_id !~ '^cus_[A-Za-z0-9]+$'
     OR pg_catalog.length(p_customer_id) > 255 THEN
    RAISE EXCEPTION 'Invalid Customer assignment'
      USING ERRCODE = '22023';
  END IF;

  SELECT stripe_customer_id INTO v_tenant_customer
    FROM public.tenants
   WHERE id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT * INTO v_attempt
    FROM public.stripe_customer_attempts
   WHERE tenant_id = p_tenant_id AND id = p_attempt_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_tenant_customer = p_customer_id
     AND v_attempt.status = 'completed'
     AND v_attempt.stripe_customer_id = p_customer_id THEN
    RETURN true;
  END IF;

  IF v_tenant_customer IS NOT NULL
     OR v_attempt.status <> 'creating'
     OR v_attempt.stripe_customer_id IS NOT NULL THEN
    RETURN false;
  END IF;

  UPDATE public.tenants
     SET stripe_customer_id = p_customer_id
   WHERE id = p_tenant_id AND stripe_customer_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Customer assignment lost tenant lock'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.stripe_customer_attempts
     SET status = 'completed',
         stripe_customer_id = p_customer_id,
         updated_at = pg_catalog.now()
   WHERE tenant_id = p_tenant_id AND id = p_attempt_id
     AND status = 'creating' AND stripe_customer_id IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Customer assignment lost claim'
      USING ERRCODE = '55000';
  END IF;
  RETURN true;
END;
$$;

-- After any attempted provider create, unknown results remain blocked.
-- Store an observed Customer ID when available for manual reconciliation.
CREATE OR REPLACE FUNCTION public.hold_stripe_customer_attempt(
  p_tenant_id uuid,
  p_attempt_id uuid,
  p_customer_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_customer text;
  v_updated integer;
BEGIN
  IF p_tenant_id IS NULL OR p_attempt_id IS NULL
     OR (p_customer_id IS NOT NULL AND (
       p_customer_id !~ '^cus_[A-Za-z0-9]+$'
       OR pg_catalog.length(p_customer_id) > 255
     )) THEN
    RAISE EXCEPTION 'Invalid Customer hold'
      USING ERRCODE = '22023';
  END IF;

  SELECT stripe_customer_id INTO v_tenant_customer
    FROM public.tenants
   WHERE id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND OR v_tenant_customer IS NOT NULL THEN RETURN false; END IF;

  UPDATE public.stripe_customer_attempts
     SET status = 'uncertain',
         stripe_customer_id = p_customer_id,
         updated_at = pg_catalog.now()
   WHERE tenant_id = p_tenant_id AND id = p_attempt_id
     AND status = 'creating';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_customer_attempt(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_stripe_customer_attempt(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hold_stripe_customer_attempt(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_customer_attempt(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_stripe_customer_attempt(uuid,uuid,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.hold_stripe_customer_attempt(uuid,uuid,text)
  TO service_role;

COMMIT;
