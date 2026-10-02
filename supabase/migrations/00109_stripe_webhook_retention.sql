-- 00109_stripe_webhook_retention.sql
--
-- AUD-79: `claim_stripe_webhook_event` przy ponownej dostawie porównywał
-- CAŁY payload. Stripe zmienia między dostawami pola koperty (np.
-- `pending_webhooks`), więc taka dostawa kończyła się „payload mismatch”
-- i zdarzenie nie przechodziło nigdy (brak faktury VAT, z alarmem).
-- Teraz porównanie typu i `data`. Reszta funkcji bez zmian (00076).
--
-- AUD-81 (decyzja B9): surowe zdarzenia Stripe przechowujemy 90 dni od
-- przetworzenia. `prune_stripe_webhook_payloads` zostawia w `payload`
-- tylko id i typ; woła ją miesięczny job sprzątania. Funkcja nie zmienia
-- niczego przy wgraniu (stan produkcji 02.10: 0 zdarzeń).

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
  -- AUD-79: porównujemy treść zdarzenia (`data`), nie cały payload — Stripe
  -- przy ponownej dostawie zmienia pola koperty (np. `pending_webhooks`),
  -- a porównanie całości blokowało takie zdarzenie na zawsze.
  IF v_event.type IS DISTINCT FROM p_event_type
     OR v_event.payload->'data' IS DISTINCT FROM p_payload->'data' THEN
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

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.prune_stripe_webhook_payloads(p_retention_days integer DEFAULT 90)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH pruned AS (
    UPDATE public.stripe_webhook_events
       SET payload = pg_catalog.jsonb_build_object('id', id, 'type', type, 'pruned', true)
     WHERE processing_status IN ('processed', 'skipped')
       AND processed_at < pg_catalog.now() - pg_catalog.make_interval(days => GREATEST(p_retention_days, 30))
       AND NOT (payload ? 'pruned')
    RETURNING 1
  )
  SELECT pg_catalog.count(*)::integer FROM pruned;
$$;

COMMENT ON FUNCTION public.prune_stripe_webhook_payloads(integer) IS
  'Retencja surowych zdarzeń Stripe (AUD-81, B9): po N dniach od przetworzenia zostaje id i typ. Minimum 30 dni. Tylko service_role.';

REVOKE EXECUTE ON FUNCTION public.prune_stripe_webhook_payloads(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_stripe_webhook_payloads(integer) TO service_role;
