-- Przeniesione 02.10.2026 ze szkicu Codexa #62 (tam 00085) jako 00116 — C-20.
-- Numeracja: 00083→00114, 00084→00115, 00085→00116.
-- Checkout Session IDs from Stripe contain a second underscore (cs_test_*/cs_live_*).
-- The 00081 constraint and RPC guards rejected real IDs, leaving claims blocked.
-- Also adds an identity-checked CAS to recover a lost DB response for uncertain.
-- This migration depends only on 00081. Run it only in a coordinated rollout
-- after confirming earlier migrations and backups; Codex never executes SQL.
BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.stripe_checkout_attempts') IS NULL
     OR pg_catalog.to_regprocedure('public.record_stripe_checkout_session(uuid,text,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'Apply 00081 before Checkout Session ID repair'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

ALTER TABLE public.stripe_checkout_attempts
  DROP CONSTRAINT stripe_checkout_attempts_stripe_session_id_check;
ALTER TABLE public.stripe_checkout_attempts
  ADD CONSTRAINT stripe_checkout_attempts_stripe_session_id_check
  CHECK (stripe_session_id IS NULL OR (
    stripe_session_id ~ '^cs_[A-Za-z0-9_]+$'
    AND pg_catalog.length(stripe_session_id) <= 255
  ));

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
     OR p_session_id !~ '^cs_[A-Za-z0-9_]+$'
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
     OR p_session_id !~ '^cs_[A-Za-z0-9_]+$'
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
     OR p_session_id !~ '^cs_[A-Za-z0-9_]+$'
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

-- Recovery after a lost record RPC response is allowed only when the signed
-- webhook handler has freshly retrieved this exact Session from Stripe and
-- verified its attempt, tenant, Customer and plan. The SQL CAS repeats those
-- stored-identity checks; uncertain is never released by a clock.
CREATE OR REPLACE FUNCTION public.record_verified_uncertain_checkout_session(
  p_attempt_id uuid,
  p_tenant_id uuid,
  p_customer_id text,
  p_plan text,
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
  IF p_attempt_id IS NULL OR p_tenant_id IS NULL
     OR p_customer_id IS NULL OR p_customer_id !~ '^cus_[A-Za-z0-9]+$'
     OR pg_catalog.length(p_customer_id) > 255
     OR p_plan IS NULL OR p_plan NOT IN ('monthly', 'annual')
     OR p_session_id IS NULL OR p_session_id !~ '^cs_[A-Za-z0-9_]+$'
     OR pg_catalog.length(p_session_id) > 255
     OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'Invalid verified Checkout Session recovery'
      USING ERRCODE = '22023';
  END IF;

  -- Match the tenant lock order used by claims and subscription mirror writes.
  PERFORM 1 FROM public.tenants
   WHERE id = p_tenant_id AND stripe_customer_id = p_customer_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.stripe_checkout_attempts
     SET status = 'open',
         stripe_session_id = p_session_id,
         session_expires_at = p_expires_at,
         updated_at = pg_catalog.now()
   WHERE id = p_attempt_id
     AND tenant_id = p_tenant_id
     AND stripe_customer_id = p_customer_id
     AND plan = p_plan
     AND status = 'uncertain'
     AND stripe_session_id IS NULL
     AND session_expires_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.record_stripe_checkout_session(uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_verified_uncertain_checkout_session(uuid,uuid,text,text,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_stripe_checkout_session(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retire_completed_stripe_checkout_attempt(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_checkout_session(uuid,text,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_verified_uncertain_checkout_session(uuid,uuid,text,text,text,timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_stripe_checkout_session(uuid,text,text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.retire_completed_stripe_checkout_attempt(uuid,text,text)
  TO service_role;

COMMIT;
