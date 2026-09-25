-- Atomic receipt claims for Stripe webhooks. Apply before the companion web
-- rollout: the old endpoint does not use the owner token or these RPCs.
-- No automatic reclaim of an in-flight or failed claim. A process can finish
-- after a timeout or fail after partial effects, so both need reconciliation.
-- A controlled, audited manual replay is separate work; these RPCs never reset
-- a failed or processing receipt and must not be worked around by deleting it.
-- Only a proven pre-effect failure may be finalized as retryable by the app.

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS claim_token uuid,
  ADD COLUMN IF NOT EXISTS claim_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_attempt_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN processing_status SET DEFAULT 'processing';

ALTER TABLE public.stripe_webhook_events
  ADD CONSTRAINT stripe_webhook_events_status_valid
    CHECK (processing_status IN ('processing', 'processed', 'failed', 'retryable', 'skipped')) NOT VALID,
  ADD CONSTRAINT stripe_webhook_events_claim_attempt_count_nonnegative
    CHECK (claim_attempt_count >= 0) NOT VALID;

-- One partial index supports stale processing (including legacy rows with a
-- NULL claim_started_at), failed receipts and persistent retryable receipts.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_attention
  ON public.stripe_webhook_events (processing_status, received_at)
  WHERE processing_status IN ('processing', 'failed', 'retryable');

COMMENT ON COLUMN public.stripe_webhook_events.claim_token IS
  'Owner token for the current attempt; finalization must present this exact token.';
COMMENT ON COLUMN public.stripe_webhook_events.claim_started_at IS
  'Start of the current claim. Old in-flight rows remain blocked for manual reconciliation.';
COMMENT ON COLUMN public.stripe_webhook_events.claim_attempt_count IS
  'Number of successful claims, including atomic retries explicitly marked safe before side effects.';

-- SECURITY INVOKER is sufficient: only service_role may execute, and it
-- already has the table privileges. Each RPC is one database transaction.
CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET lock_timeout = '2s'
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
  v_token uuid := pg_catalog.gen_random_uuid();
BEGIN
  IF p_event_id IS NULL OR p_event_id = ''
     OR p_event_type IS NULL OR p_event_type = ''
     OR p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR p_payload->>'id' IS DISTINCT FROM p_event_id
     OR p_payload->>'type' IS DISTINCT FROM p_event_type THEN
    RAISE EXCEPTION 'Invalid webhook event claim' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.stripe_webhook_events (
    id, type, payload, processing_status, processing_error,
    received_at, processed_at, claim_token, claim_started_at, claim_attempt_count
  ) VALUES (
    p_event_id, p_event_type, p_payload, 'processing', NULL,
    pg_catalog.now(), NULL, v_token, pg_catalog.now(), 1
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_event;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('state', 'claimed', 'token', v_token::text);
  END IF;

  -- The row lock serializes all retries and concurrent deliveries of evt_*.
  SELECT * INTO v_event
    FROM public.stripe_webhook_events
   WHERE id = p_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Webhook event claim disappeared' USING ERRCODE = 'P0002';
  END IF;
  IF v_event.type IS DISTINCT FROM p_event_type
     OR v_event.payload IS DISTINCT FROM p_payload THEN
    RAISE EXCEPTION 'Webhook event payload mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_event.processing_status IN ('processed', 'skipped') THEN
    RETURN pg_catalog.jsonb_build_object('state', 'processed');
  END IF;
  -- Even a failed handler may have committed payment state or queued a job
  -- before reporting failure. Without a durable outbox/dedupe, re-running it
  -- automatically could duplicate invoices or notifications. An operator must
  -- reconcile both processing and failed receipts before any manual retry.
  IF v_event.processing_status IN ('processing', 'failed') THEN
    RETURN pg_catalog.jsonb_build_object('state', 'busy');
  END IF;
  IF v_event.processing_status <> 'retryable' THEN
    RAISE EXCEPTION 'Unknown webhook event state' USING ERRCODE = '22023';
  END IF;

  -- Only a handler which proved it failed before any side effect may have
  -- finalized as retryable. This row lock makes competing retries exclusive.
  UPDATE public.stripe_webhook_events
     SET processing_status = 'processing',
         processing_error = NULL,
         processed_at = NULL,
         claim_token = v_token,
         claim_started_at = pg_catalog.now(),
         claim_attempt_count = claim_attempt_count + 1
   WHERE id = p_event_id;

  RETURN pg_catalog.jsonb_build_object('state', 'claimed', 'token', v_token::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_stripe_webhook_event(
  p_event_id text,
  p_claim_token uuid,
  p_status text,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  IF p_event_id IS NULL OR p_event_id = '' OR p_claim_token IS NULL
     OR p_status NOT IN ('processed', 'failed', 'retryable') OR p_status IS NULL
     OR (p_error_code IS NOT NULL AND
         p_error_code !~ '^[a-z][a-z0-9_]{0,63}$') THEN
    RAISE EXCEPTION 'Invalid webhook event finalization' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stripe_webhook_events
     SET processing_status = p_status,
         processing_error = CASE p_status
           WHEN 'failed' THEN COALESCE(p_error_code, 'handler_failed')
           WHEN 'retryable' THEN COALESCE(p_error_code, 'pre_effect_failed')
           ELSE NULL END,
         processed_at = pg_catalog.now()
   WHERE id = p_event_id
     AND claim_token = p_claim_token
     AND processing_status = 'processing';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'Webhook event finalization owner mismatch'
      USING ERRCODE = 'P0002';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON public.stripe_webhook_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.stripe_webhook_events TO service_role;

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.finalize_stripe_webhook_event(text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_stripe_webhook_event(text, uuid, text, text)
  TO service_role;
