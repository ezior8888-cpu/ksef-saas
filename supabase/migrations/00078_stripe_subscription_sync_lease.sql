-- Serialize writes to the local Stripe subscription mirror by Stripe ID.
-- The caller must claim before fetching a fresh Stripe snapshot. An expired
-- claim may be replaced, but its token/fence can never write after replacement.
-- Deploy with Stripe ingress paused: this migration removes direct application
-- writes to subscriptions, so old webhook code cannot bypass the lease.

CREATE TABLE public.stripe_subscription_sync_leases (
  stripe_subscription_id text PRIMARY KEY
    CHECK (stripe_subscription_id <> '' AND pg_catalog.length(stripe_subscription_id) <= 255),
  claim_token uuid,
  fence bigint NOT NULL DEFAULT 0 CHECK (fence >= 0),
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT stripe_subscription_sync_lease_pair CHECK (
    (claim_token IS NULL) = (lease_expires_at IS NULL)
  )
);

ALTER TABLE public.stripe_subscription_sync_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_subscription_sync_leases
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.stripe_subscription_sync_leases IS
  'Per-Stripe-subscription short lease with monotonic fencing. An expired worker cannot persist a snapshot.';

CREATE OR REPLACE FUNCTION public.claim_stripe_subscription_sync(
  p_subscription_id text
)
RETURNS TABLE (claimed boolean, claim_token uuid, fence bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token uuid := pg_catalog.gen_random_uuid();
  v_claim_token uuid;
  v_fence bigint;
BEGIN
  IF p_subscription_id IS NULL OR p_subscription_id = ''
     OR pg_catalog.length(p_subscription_id) > 255 THEN
    RAISE EXCEPTION 'Invalid Stripe subscription ID' USING ERRCODE = '22023';
  END IF;

  -- ON CONFLICT locks the existing row and rechecks expiry after concurrent
  -- transactions commit. A busy lease returns no row; each successful claim
  -- advances the fence even if the prior worker never released its token.
  INSERT INTO public.stripe_subscription_sync_leases AS lease (
    stripe_subscription_id, claim_token, fence,
    lease_expires_at, claimed_at, updated_at
  ) VALUES (
    p_subscription_id, v_token, 1,
    pg_catalog.clock_timestamp() + interval '90 seconds',
    pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE
    SET claim_token = EXCLUDED.claim_token,
        fence = lease.fence + 1,
        lease_expires_at = pg_catalog.clock_timestamp() + interval '90 seconds',
        claimed_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE lease.claim_token IS NULL
       OR lease.lease_expires_at <= pg_catalog.clock_timestamp()
  RETURNING lease.claim_token, lease.fence
    INTO v_claim_token, v_fence;

  IF v_claim_token IS NULL THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::bigint;
  ELSE
    RETURN QUERY SELECT true, v_claim_token, v_fence;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_sync(
  p_subscription_id text,
  p_claim_token uuid,
  p_fence bigint,
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lease public.stripe_subscription_sync_leases%ROWTYPE;
  v_timestamp_key text;
  v_written_id uuid;
BEGIN
  IF p_subscription_id IS NULL OR p_subscription_id = ''
     OR pg_catalog.length(p_subscription_id) > 255
     OR p_claim_token IS NULL OR p_fence IS NULL OR p_fence < 1 THEN
    RAISE EXCEPTION 'Invalid Stripe subscription sync claim' USING ERRCODE = '22023';
  END IF;

  -- Keep the claim row locked through the subscription upsert and release.
  -- A replacement claim waits for this transaction, then receives a higher
  -- fence; a worker with an expired/replaced token gets false without a write.
  SELECT * INTO v_lease
    FROM public.stripe_subscription_sync_leases AS lease
   WHERE lease.stripe_subscription_id = p_subscription_id
   FOR UPDATE;

  IF NOT FOUND OR v_lease.claim_token IS DISTINCT FROM p_claim_token
     OR v_lease.fence <> p_fence
     OR v_lease.lease_expires_at IS NULL
     OR v_lease.lease_expires_at <= pg_catalog.clock_timestamp() THEN
    RETURN false;
  END IF;

  -- Accept only the known mirror fields. Never use a generic JSON-to-record
  -- update: it could change id, tenant ownership, or future columns.
  IF p_snapshot IS NULL OR pg_catalog.jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'Invalid Stripe subscription snapshot type'
      USING ERRCODE = '22023';
  END IF;

  IF NOT (p_snapshot ?& ARRAY[
       'tenant_id', 'stripe_subscription_id', 'stripe_customer_id',
       'stripe_price_id', 'status', 'plan', 'current_period_start',
       'current_period_end', 'trial_start', 'trial_end',
       'cancel_at_period_end', 'canceled_at'
     ])
     OR EXISTS (
       SELECT 1
         FROM pg_catalog.jsonb_object_keys(p_snapshot) AS field(key)
        WHERE field.key NOT IN (
          'tenant_id', 'stripe_subscription_id', 'stripe_customer_id',
          'stripe_price_id', 'status', 'plan', 'current_period_start',
          'current_period_end', 'trial_start', 'trial_end',
          'cancel_at_period_end', 'canceled_at',
          'last_webhook_payload', 'last_webhook_at'
        )
     ) THEN
    RAISE EXCEPTION 'Invalid Stripe subscription snapshot fields'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_snapshot->'tenant_id') <> 'string'
     OR pg_catalog.jsonb_typeof(p_snapshot->'stripe_subscription_id') <> 'string'
     OR p_snapshot->>'stripe_subscription_id' <> p_subscription_id
     OR pg_catalog.jsonb_typeof(p_snapshot->'stripe_customer_id') <> 'string'
     OR p_snapshot->>'stripe_customer_id' = ''
     OR pg_catalog.length(p_snapshot->>'stripe_customer_id') > 255
     OR pg_catalog.jsonb_typeof(p_snapshot->'stripe_price_id') <> 'string'
     OR p_snapshot->>'stripe_price_id' = ''
     OR pg_catalog.length(p_snapshot->>'stripe_price_id') > 255
     OR pg_catalog.jsonb_typeof(p_snapshot->'status') <> 'string'
     OR p_snapshot->>'status' NOT IN (
       'trialing', 'active', 'past_due', 'canceled', 'incomplete',
       'incomplete_expired', 'unpaid', 'paused'
     )
     OR pg_catalog.jsonb_typeof(p_snapshot->'plan') <> 'string'
     OR p_snapshot->>'plan' NOT IN ('monthly', 'annual')
     OR pg_catalog.jsonb_typeof(p_snapshot->'cancel_at_period_end') <> 'boolean'
     OR (
       p_snapshot ? 'last_webhook_payload'
       AND pg_catalog.jsonb_typeof(p_snapshot->'last_webhook_payload')
           NOT IN ('object', 'null')
     ) THEN
    RAISE EXCEPTION 'Invalid Stripe subscription snapshot values'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_timestamp_key IN ARRAY ARRAY[
    'current_period_start', 'current_period_end', 'trial_start',
    'trial_end', 'canceled_at', 'last_webhook_at'
  ] LOOP
    IF p_snapshot ? v_timestamp_key THEN
      IF pg_catalog.jsonb_typeof(p_snapshot->v_timestamp_key)
         NOT IN ('string', 'null') THEN
        RAISE EXCEPTION 'Invalid Stripe subscription timestamp type'
          USING ERRCODE = '22023';
      END IF;
      IF pg_catalog.jsonb_typeof(p_snapshot->v_timestamp_key) = 'string'
         AND (p_snapshot->>v_timestamp_key) !~
           '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
        RAISE EXCEPTION 'Invalid Stripe subscription timestamp format'
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO public.subscriptions (
    tenant_id, stripe_subscription_id, stripe_customer_id,
    stripe_price_id, status, plan, current_period_start,
    current_period_end, trial_start, trial_end,
    cancel_at_period_end, canceled_at, last_webhook_payload,
    last_webhook_at
  ) VALUES (
    (p_snapshot->>'tenant_id')::uuid,
    p_subscription_id,
    p_snapshot->>'stripe_customer_id',
    p_snapshot->>'stripe_price_id',
    (p_snapshot->>'status')::public.subscription_status_enum,
    (p_snapshot->>'plan')::public.subscription_plan_enum,
    (p_snapshot->>'current_period_start')::timestamptz,
    (p_snapshot->>'current_period_end')::timestamptz,
    (p_snapshot->>'trial_start')::timestamptz,
    (p_snapshot->>'trial_end')::timestamptz,
    (p_snapshot->>'cancel_at_period_end')::boolean,
    (p_snapshot->>'canceled_at')::timestamptz,
    NULLIF(p_snapshot->'last_webhook_payload', 'null'::jsonb),
    pg_catalog.now()
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id,
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        stripe_price_id = EXCLUDED.stripe_price_id,
        status = EXCLUDED.status,
        plan = EXCLUDED.plan,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        trial_start = EXCLUDED.trial_start,
        trial_end = EXCLUDED.trial_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        canceled_at = EXCLUDED.canceled_at,
        last_webhook_payload = COALESCE(
          EXCLUDED.last_webhook_payload, public.subscriptions.last_webhook_payload
        ),
        last_webhook_at = EXCLUDED.last_webhook_at
  RETURNING id INTO v_written_id;

  -- 00077 returns NULL from its BEFORE UPDATE trigger when a late
  -- nonterminal snapshot tries to resurrect a canceled subscription.
  UPDATE public.stripe_subscription_sync_leases
     SET claim_token = NULL, lease_expires_at = NULL,
         updated_at = pg_catalog.now()
   WHERE stripe_subscription_id = p_subscription_id;

  RETURN v_written_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stripe_subscription_sync(
  p_subscription_id text,
  p_claim_token uuid,
  p_fence bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released_count integer;
BEGIN
  IF p_subscription_id IS NULL OR p_subscription_id = ''
     OR pg_catalog.length(p_subscription_id) > 255
     OR p_claim_token IS NULL OR p_fence IS NULL OR p_fence < 1 THEN
    RAISE EXCEPTION 'Invalid Stripe subscription sync release'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.stripe_subscription_sync_leases
     SET claim_token = NULL, lease_expires_at = NULL,
         updated_at = pg_catalog.now()
   WHERE stripe_subscription_id = p_subscription_id
     AND claim_token = p_claim_token
     AND fence = p_fence;

  GET DIAGNOSTICS v_released_count = ROW_COUNT;
  RETURN v_released_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_subscription_sync(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_stripe_subscription_sync(text, uuid, bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_stripe_subscription_sync(text, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_subscription_sync(text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_sync(text, uuid, bigint, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stripe_subscription_sync(text, uuid, bigint)
  TO service_role;

-- No other application path writes subscriptions in the current repository.
-- This makes the lease enforceable for service-role webhook traffic; direct
-- service-role writes would otherwise bypass fencing. Only the privileged
-- migration owner may write the mirror directly for supervised reconciliation.
-- Apply during a coordinated code rollout with Stripe ingress paused: the old
-- webhook handler uses direct upserts and will fail after this revoke.
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions
  FROM PUBLIC, anon, authenticated, service_role;
