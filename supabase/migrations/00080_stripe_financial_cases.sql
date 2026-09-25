-- Durable Stripe refund/dispute observations. Apply only after 00078 and 00079,
-- with a compatible web/admin release and the existing Stripe history reconciled.
-- This migration is intentionally not executed by Codex.
--
-- Stripe and Postgres cannot share a transaction. This gate orders financial
-- observations that reached Postgres against new local VAT/refund claims. It
-- cannot retroactively prevent a VAT document committed before delivery.
DO $$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.create_billing_vat_invoice(uuid,uuid,uuid,text,jsonb)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.claim_admin_refund_uninvoiced(uuid,uuid,uuid,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Apply 00078 and 00079 before 00080'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

CREATE TABLE public.stripe_financial_cases (
  stripe_object_id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('refund', 'dispute')),
  payment_id uuid,
  tenant_id uuid,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  stripe_status text NOT NULL,
  last_observed_status text NOT NULL,
  case_state text NOT NULL
    CHECK (case_state IN ('open', 'quarantined', 'awaiting_admin', 'settled', 'reviewed')),
  quarantine_reason text,
  -- Settlement is an alert state, never removal of historical VAT hold.
  hold_active boolean NOT NULL DEFAULT true,
  first_event_id text NOT NULL REFERENCES public.stripe_webhook_events(id),
  last_event_id text NOT NULL REFERENCES public.stripe_webhook_events(id),
  first_seen_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  last_seen_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  settled_at timestamptz,
  reviewed_at timestamptz,
  reviewed_candidate_count integer CHECK (reviewed_candidate_count >= 0),
  reviewed_candidate_payment_id uuid,
  CONSTRAINT stripe_financial_cases_payment_pair CHECK (
    (payment_id IS NULL AND tenant_id IS NULL)
    OR (payment_id IS NOT NULL AND tenant_id IS NOT NULL)
  ),
  CONSTRAINT stripe_financial_cases_payment_tenant_fk
    FOREIGN KEY (tenant_id, payment_id)
    REFERENCES public.stripe_payments (tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT stripe_financial_cases_object_kind CHECK (
    (kind = 'refund' AND stripe_object_id ~ '^re_[A-Za-z0-9]+$')
    OR (kind = 'dispute' AND stripe_object_id ~ '^du_[A-Za-z0-9]+$')
  )
);

-- Every full reference ever seen for a case remains visible to the hold guard.
-- A contradictory later observation must not erase an earlier reference.
CREATE TABLE public.stripe_financial_case_refs (
  stripe_object_id text NOT NULL
    REFERENCES public.stripe_financial_cases(stripe_object_id) ON DELETE RESTRICT,
  reference_kind text NOT NULL
    CHECK (reference_kind IN ('payment_intent', 'charge')),
  reference_id text NOT NULL,
  PRIMARY KEY (stripe_object_id, reference_kind, reference_id),
  CONSTRAINT stripe_financial_case_refs_format CHECK (
    (reference_kind = 'payment_intent'
      AND reference_id ~ '^pi_[A-Za-z0-9]+$')
    OR (reference_kind = 'charge'
      AND reference_id ~ '^ch_[A-Za-z0-9]+$')
  )
);

CREATE INDEX idx_stripe_financial_cases_payment_hold
  ON public.stripe_financial_cases(payment_id)
  WHERE hold_active AND payment_id IS NOT NULL;
CREATE INDEX idx_stripe_financial_cases_attention
  ON public.stripe_financial_cases(case_state, first_seen_at)
  WHERE case_state NOT IN ('settled', 'reviewed');
CREATE INDEX idx_stripe_financial_case_refs_lookup
  ON public.stripe_financial_case_refs(reference_kind, reference_id);


-- A new Stripe observation may reopen a manually reviewed case. Preserve
-- that transition separately from the operator's append-only review record.
CREATE TABLE public.stripe_financial_case_reopenings (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  stripe_object_id text NOT NULL
    REFERENCES public.stripe_financial_cases(stripe_object_id) ON DELETE RESTRICT,
  event_id text REFERENCES public.stripe_webhook_events(id),
  source text NOT NULL CHECK (source IN ('stripe_event', 'payment_reference_change')),
  previous_stripe_status text NOT NULL,
  observed_stripe_status text NOT NULL,
  new_case_state text NOT NULL,
  previous_candidate_count integer,
  new_candidate_count integer,
  previous_candidate_payment_id uuid,
  new_candidate_payment_id uuid,
  reopened_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT stripe_financial_case_reopenings_source_event CHECK (
    (source = 'stripe_event' AND event_id IS NOT NULL)
    OR (source = 'payment_reference_change' AND event_id IS NULL)
  )
);
CREATE INDEX idx_stripe_financial_case_reopenings_case
  ON public.stripe_financial_case_reopenings(stripe_object_id, reopened_at DESC);
ALTER TABLE public.stripe_financial_case_reopenings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_financial_case_reopenings
  FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.stripe_financial_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_financial_case_refs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_financial_cases
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.stripe_financial_case_refs
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.stripe_financial_cases TO service_role;

COMMENT ON TABLE public.stripe_financial_cases IS
  'Signed Stripe refund/dispute observations. Settled admin refunds retain their VAT hold.';
COMMENT ON TABLE public.stripe_financial_case_refs IS
  'All full payment references observed for a financial case, including conflicting history.';



-- A case reviewed while no local payment existed must not remain silent when
-- a later signed invoice webhook creates that payment. The BEFORE trigger has
-- already acquired the full-reference advisory locks for this transaction.
-- Do not assign a tenant here; only reopen the case for human verification.
CREATE FUNCTION public.reopen_reviewed_financial_cases_for_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_case public.stripe_financial_cases%ROWTYPE;
  v_candidate_count integer;
  v_candidate_id uuid;
  v_payment_intent_id text;
  v_charge_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_payment_intent_id := OLD.stripe_payment_intent_id;
    v_charge_id := OLD.stripe_charge_id;
  ELSE
    v_payment_intent_id := NEW.stripe_payment_intent_id;
    v_charge_id := NEW.stripe_charge_id;
  END IF;
  IF v_payment_intent_id IS NULL AND v_charge_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  FOR v_case IN
    SELECT c.*
    FROM public.stripe_financial_cases AS c
    WHERE c.case_state = 'reviewed'
      AND EXISTS (
        SELECT 1 FROM public.stripe_financial_case_refs AS r
        WHERE r.stripe_object_id = c.stripe_object_id
          AND ((r.reference_kind = 'payment_intent'
                AND r.reference_id = v_payment_intent_id)
            OR (r.reference_kind = 'charge'
                AND r.reference_id = v_charge_id))
      )
    ORDER BY c.stripe_object_id
    FOR UPDATE
  LOOP
    SELECT pg_catalog.count(DISTINCT p.id)::integer INTO v_candidate_count
    FROM public.stripe_payments AS p
    JOIN public.stripe_financial_case_refs AS r
      ON (r.reference_kind = 'payment_intent'
           AND r.reference_id = p.stripe_payment_intent_id)
      OR (r.reference_kind = 'charge'
           AND r.reference_id = p.stripe_charge_id)
    WHERE r.stripe_object_id = v_case.stripe_object_id;
    v_candidate_id := NULL;
    IF v_candidate_count = 1 THEN
      SELECT p.id INTO v_candidate_id
      FROM public.stripe_payments AS p
      JOIN public.stripe_financial_case_refs AS r
        ON (r.reference_kind = 'payment_intent'
             AND r.reference_id = p.stripe_payment_intent_id)
        OR (r.reference_kind = 'charge'
             AND r.reference_id = p.stripe_charge_id)
      WHERE r.stripe_object_id = v_case.stripe_object_id
      LIMIT 1;
    END IF;
    IF v_case.reviewed_candidate_count IS DISTINCT FROM v_candidate_count
       OR v_case.reviewed_candidate_payment_id
            IS DISTINCT FROM v_candidate_id THEN
      INSERT INTO public.stripe_financial_case_reopenings (
        stripe_object_id, event_id, source, previous_stripe_status,
        observed_stripe_status, new_case_state,
        previous_candidate_count, new_candidate_count,
        previous_candidate_payment_id, new_candidate_payment_id
      ) VALUES (
        v_case.stripe_object_id, NULL, 'payment_reference_change',
        v_case.stripe_status, v_case.last_observed_status, 'quarantined',
        v_case.reviewed_candidate_count, v_candidate_count,
        v_case.reviewed_candidate_payment_id, v_candidate_id
      );
      UPDATE public.stripe_financial_cases AS c
      SET case_state = 'quarantined',
          quarantine_reason = 'reviewed_payment_match_changed',
          hold_active = true,
          reviewed_at = NULL,
          reviewed_candidate_count = NULL,
          reviewed_candidate_payment_id = NULL,
          last_seen_at = pg_catalog.now()
      WHERE c.stripe_object_id = v_case.stripe_object_id;
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reopen_reviewed_financial_cases_for_payment()
  FROM PUBLIC, anon, authenticated, service_role;


-- The payment row does not exist yet for some refunds/disputes. Serialize on
-- each full PI/Charge reference before looking up a payment and before a new
-- payment can publish those references. Keys are acquired in numeric order.
-- A hash collision only causes extra contention, never a false match.
CREATE FUNCTION public.stripe_lock_financial_refs(
  p_payment_intent_id text,
  p_charge_id text,
  p_try boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pi_key integer;
  v_charge_key integer;
  v_first integer;
  v_second integer;
BEGIN
  IF p_try IS NULL
     OR (p_payment_intent_id IS NOT NULL
       AND p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$')
     OR (p_charge_id IS NOT NULL
       AND p_charge_id !~ '^ch_[A-Za-z0-9]+$') THEN
    RAISE EXCEPTION 'Invalid Stripe payment reference'
      USING ERRCODE = '22023';
  END IF;
  IF p_payment_intent_id IS NOT NULL THEN
    v_pi_key := pg_catalog.hashtext('pi:' || p_payment_intent_id);
  END IF;
  IF p_charge_id IS NOT NULL THEN
    v_charge_key := pg_catalog.hashtext('ch:' || p_charge_id);
  END IF;
  IF v_pi_key IS NULL AND v_charge_key IS NULL THEN RETURN true; END IF;
  IF v_pi_key IS NULL THEN
    v_first := v_charge_key;
  ELSIF v_charge_key IS NULL THEN
    v_first := v_pi_key;
  ELSE
    IF v_pi_key <= v_charge_key THEN
      v_first := v_pi_key;
      v_second := v_charge_key;
    ELSE
      v_first := v_charge_key;
      v_second := v_pi_key;
    END IF;
    IF v_first = v_second THEN v_second := NULL; END IF;
  END IF;

  IF p_try THEN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(805181, v_first) THEN
      RETURN false;
    END IF;
    IF v_second IS NOT NULL
       AND NOT pg_catalog.pg_try_advisory_xact_lock(805181, v_second) THEN
      RETURN false;
    END IF;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(805181, v_first);
    IF v_second IS NOT NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(805181, v_second);
    END IF;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.stripe_lock_financial_refs(text,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- An upsert can hold the payment row before its BEFORE UPDATE trigger runs.
-- Use try-lock and abort that transaction on contention, so an event holding
-- the reference lock and waiting for the row cannot deadlock with the upsert.
-- Preserve previously established references; stale invoice snapshots may
-- omit them, but may never erase or replace a full identity.
CREATE FUNCTION public.guard_stripe_payment_financial_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_intent_id text;
  v_charge_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Historical invalid refs cannot match the validated case-ref table.
    v_payment_intent_id := CASE
      WHEN OLD.stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]+$'
      THEN OLD.stripe_payment_intent_id ELSE NULL END;
    v_charge_id := CASE
      WHEN OLD.stripe_charge_id ~ '^ch_[A-Za-z0-9]+$'
      THEN OLD.stripe_charge_id ELSE NULL END;
    IF NOT public.stripe_lock_financial_refs(
      v_payment_intent_id, v_charge_id, true
    ) THEN
      RAISE EXCEPTION 'Stripe payment reference lock busy'
        USING ERRCODE = '40001';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.stripe_payment_intent_id IS NOT NULL THEN
      IF NEW.stripe_payment_intent_id IS NULL THEN
        NEW.stripe_payment_intent_id := OLD.stripe_payment_intent_id;
      ELSIF NEW.stripe_payment_intent_id <> OLD.stripe_payment_intent_id THEN
        RAISE EXCEPTION 'Stripe payment intent identity is immutable'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF OLD.stripe_charge_id IS NOT NULL THEN
      IF NEW.stripe_charge_id IS NULL THEN
        NEW.stripe_charge_id := OLD.stripe_charge_id;
      ELSIF NEW.stripe_charge_id <> OLD.stripe_charge_id THEN
        RAISE EXCEPTION 'Stripe charge identity is immutable'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF NOT public.stripe_lock_financial_refs(
    NEW.stripe_payment_intent_id, NEW.stripe_charge_id, TG_OP <> 'INSERT'
  ) THEN
    RAISE EXCEPTION 'Stripe payment reference lock busy'
      USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_stripe_payment_financial_refs()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER u_guard_stripe_payment_financial_refs
  BEFORE INSERT OR UPDATE OF stripe_payment_intent_id, stripe_charge_id
  ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_stripe_payment_financial_refs();
CREATE TRIGGER zz_reopen_reviewed_financial_cases_for_payment
  AFTER INSERT OR UPDATE OF stripe_payment_intent_id, stripe_charge_id
  ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.reopen_reviewed_financial_cases_for_payment();
CREATE TRIGGER u_guard_stripe_payment_financial_refs_delete
  BEFORE DELETE ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_stripe_payment_financial_refs();
CREATE TRIGGER zz_reopen_reviewed_financial_cases_for_payment_delete
  AFTER DELETE ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.reopen_reviewed_financial_cases_for_payment();
-- Used by the VAT and admin-refund INSERT guards below. The caller already
-- owns the payment row lock in the 00079 RPCs; this routine reads only
-- committed cases after that lock has been acquired.
CREATE FUNCTION public.stripe_payment_has_financial_hold(p_payment_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stripe_payments AS p
    JOIN public.stripe_financial_cases AS c
      ON c.hold_active AND c.payment_id = p.id
    WHERE p.id = p_payment_id
  ) OR EXISTS (
    SELECT 1
    FROM public.stripe_payments AS p
    JOIN public.stripe_financial_case_refs AS r
      ON (r.reference_kind = 'payment_intent'
            AND r.reference_id = p.stripe_payment_intent_id)
      OR (r.reference_kind = 'charge'
            AND r.reference_id = p.stripe_charge_id)
    JOIN public.stripe_financial_cases AS c
      ON c.stripe_object_id = r.stripe_object_id AND c.hold_active
    WHERE p.id = p_payment_id
  );
$$;
REVOKE ALL ON FUNCTION public.stripe_payment_has_financial_hold(uuid)
  FROM PUBLIC, anon, authenticated, service_role;


-- A claim can be created before an external case commits and before the
-- admin process calls Stripe. Recheck immediately before refunds.create.
-- This narrows the window but cannot make Stripe's API call atomic with DB.
CREATE FUNCTION public.admin_refund_financial_preflight(p_payment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_payment public.stripe_payments%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL THEN RETURN 'missing_payment'; END IF;
  SELECT p.* INTO v_payment
  FROM public.stripe_payments AS p
  WHERE p.id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing_payment'; END IF;

  IF (v_payment.stripe_payment_intent_id IS NULL
      AND v_payment.stripe_charge_id IS NULL)
     OR (v_payment.stripe_payment_intent_id IS NOT NULL
       AND v_payment.stripe_payment_intent_id !~ '^pi_[A-Za-z0-9]+$')
     OR (v_payment.stripe_charge_id IS NOT NULL
       AND v_payment.stripe_charge_id !~ '^ch_[A-Za-z0-9]+$') THEN
    RETURN 'missing_reference';
  END IF;

  -- We already hold the payment row. A blocking advisory lock here could
  -- deadlock with record_stripe_financial_case holding the reference lock.
  IF NOT public.stripe_lock_financial_refs(
    v_payment.stripe_payment_intent_id, v_payment.stripe_charge_id, true
  ) THEN
    RETURN 'busy';
  END IF;

  IF v_payment.status IS DISTINCT FROM 'succeeded'
     OR NOT EXISTS (
       SELECT 1 FROM public.stripe_refund_operations AS o
       WHERE o.payment_id = v_payment.id AND o.status = 'processing'
     )
     OR public.stripe_payment_has_financial_hold(v_payment.id) THEN
    RETURN 'held';
  END IF;
  RETURN 'clear';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_refund_financial_preflight(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_financial_preflight(uuid)
  TO service_role;

-- 00079's VAT RPC does not require a full PI/charge on historical rows. The
-- new invoice trigger closes that gap and catches a previously unmatched case
-- whose full reference appears on the payment after the case was received.
CREATE FUNCTION public.guard_billing_invoice_financial_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.stripe_payments%ROWTYPE;
BEGIN
  IF NEW.stripe_invoice_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.* INTO v_payment
  FROM public.stripe_payments AS p
  WHERE p.stripe_invoice_id = NEW.stripe_invoice_id
  FOR UPDATE;
  IF NOT FOUND OR (
    v_payment.stripe_payment_intent_id IS NULL
    AND v_payment.stripe_charge_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Billing payment reference requires reconciliation'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.stripe_lock_financial_refs(
    v_payment.stripe_payment_intent_id, v_payment.stripe_charge_id, true
  ) THEN
    RAISE EXCEPTION 'Stripe financial reference lock busy'
      USING ERRCODE = '40001';
  END IF;
  IF public.stripe_payment_has_financial_hold(v_payment.id) THEN
    RAISE EXCEPTION 'Stripe financial case requires VAT reconciliation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_billing_invoice_financial_case()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_guard_billing_invoice_financial_case
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_billing_invoice_financial_case();

-- The 00079 admin RPC locks the same payment before it inserts its claim.
-- A case already linked to that payment, or only known by full Stripe refs,
-- prevents a new outgoing refund request. Existing claims remain durable.
CREATE FUNCTION public.guard_admin_refund_financial_case()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.stripe_payments%ROWTYPE;
BEGIN
  SELECT p.* INTO v_payment
  FROM public.stripe_payments AS p
  WHERE p.id = NEW.payment_id AND p.tenant_id = NEW.tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund payment identity requires reconciliation'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.stripe_lock_financial_refs(
    v_payment.stripe_payment_intent_id, v_payment.stripe_charge_id, true
  ) THEN
    RAISE EXCEPTION 'Stripe financial reference lock busy'
      USING ERRCODE = '40001';
  END IF;
  IF public.stripe_payment_has_financial_hold(v_payment.id) THEN
    RAISE EXCEPTION 'Stripe financial case requires refund reconciliation'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_admin_refund_financial_case()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER zz_guard_admin_refund_financial_case
  BEFORE INSERT ON public.stripe_refund_operations
  FOR EACH ROW EXECUTE FUNCTION public.guard_admin_refund_financial_case();

-- The webhook must verify Stripe's signature, claim evt_* using 00076, then
-- fetch the current Refund/Dispute object from Stripe before calling this RPC.
-- The RPC is one PostgREST transaction. No metadata/email/short invoice suffix
-- is accepted as a tenant or payment identity.
CREATE FUNCTION public.record_stripe_financial_case(
  p_kind text,
  p_stripe_object_id text,
  p_event_id text,
  p_payment_intent_id text,
  p_charge_id text,
  p_amount_cents bigint,
  p_currency text,
  p_stripe_status text,
  p_reference_invalid boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_event_type text;
  v_existing public.stripe_financial_cases%ROWTYPE;
  v_candidate public.stripe_payments%ROWTYPE;
  v_payment public.stripe_payments%ROWTYPE;
  v_match_count integer := 0;
  v_reason text;
  v_case_state text;
  v_settled boolean := false;
  v_review_unchanged boolean := false;
  v_operation public.stripe_refund_operations%ROWTYPE;
BEGIN
  IF p_kind NOT IN ('refund', 'dispute') OR p_kind IS NULL
     OR p_stripe_object_id IS NULL
     OR (p_kind = 'refund'
       AND p_stripe_object_id !~ '^re_[A-Za-z0-9]+$')
     OR (p_kind = 'dispute'
       AND p_stripe_object_id !~ '^du_[A-Za-z0-9]+$')
     OR p_event_id IS NULL OR p_event_id !~ '^evt_[A-Za-z0-9]+$'
     OR p_amount_cents IS NULL OR p_amount_cents <= 0
     OR p_currency IS NULL OR p_currency !~ '^[a-z]{3}$'
     OR p_reference_invalid IS NULL
     OR p_stripe_status IS NULL
     OR p_stripe_status !~ '^[a-z][a-z0-9_]{0,63}$'
     OR (p_payment_intent_id IS NOT NULL
       AND p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$')
     OR (p_charge_id IS NOT NULL
       AND p_charge_id !~ '^ch_[A-Za-z0-9]+$') THEN
    RAISE EXCEPTION 'Invalid Stripe financial case'
      USING ERRCODE = '22023';
  END IF;

  SELECT e.type INTO v_event_type
  FROM public.stripe_webhook_events AS e
  WHERE e.id = p_event_id AND e.processing_status = 'processing';
  IF NOT FOUND OR NOT (
    (p_kind = 'refund' AND v_event_type IN (
      'refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated'
    )) OR
    (p_kind = 'dispute' AND v_event_type IN (
      'charge.dispute.created', 'charge.dispute.updated',
      'charge.dispute.closed', 'charge.dispute.funds_withdrawn',
      'charge.dispute.funds_reinstated'
    ))
  ) THEN
    RAISE EXCEPTION 'Stripe financial event claim missing or incompatible'
      USING ERRCODE = '23514';
  END IF;

  -- Serializes different evt_* for the same Stripe object even before its
  -- first database row exists. A hash collision causes contention only.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    805180, pg_catalog.hashtext(p_stripe_object_id)
  );

  IF p_reference_invalid THEN
    v_reason := 'invalid_reference';
  END IF;
  IF p_kind = 'refund' AND p_stripe_status NOT IN (
    'pending', 'requires_action', 'succeeded', 'failed', 'canceled'
  ) THEN
    v_reason := COALESCE(v_reason, 'unknown_refund_status');
  ELSIF p_kind = 'dispute' AND p_stripe_status NOT IN (
    'warning_needs_response', 'warning_under_review', 'warning_closed',
    'needs_response', 'under_review', 'won', 'lost'
  ) THEN
    v_reason := COALESCE(v_reason, 'unknown_dispute_status');
  END IF;

  PERFORM public.stripe_lock_financial_refs(
    p_payment_intent_id, p_charge_id, false
  );

  IF p_payment_intent_id IS NULL AND p_charge_id IS NULL THEN
    v_reason := COALESCE(v_reason, 'missing_reference');
  ELSE
    -- A PI is unique in 00047, but Charge is not. Lock every exact candidate
    -- in stable order; zero or multiple candidates stay quarantined.
    FOR v_candidate IN
      SELECT p.*
      FROM public.stripe_payments AS p
      WHERE (p_payment_intent_id IS NOT NULL
          AND p.stripe_payment_intent_id = p_payment_intent_id)
         OR (p_charge_id IS NOT NULL
          AND p.stripe_charge_id = p_charge_id)
      ORDER BY p.id
      FOR UPDATE
    LOOP
      v_match_count := v_match_count + 1;
      IF v_match_count = 1 THEN v_payment := v_candidate; END IF;
    END LOOP;
    IF v_match_count = 0 THEN
      v_reason := COALESCE(v_reason, 'payment_not_found');
    ELSIF v_match_count > 1 THEN
      v_reason := COALESCE(v_reason, 'ambiguous_payment_reference');
    ELSIF (p_payment_intent_id IS NOT NULL
            AND v_payment.stripe_payment_intent_id IS NOT NULL
            AND v_payment.stripe_payment_intent_id <> p_payment_intent_id)
       OR (p_charge_id IS NOT NULL
            AND v_payment.stripe_charge_id IS NOT NULL
            AND v_payment.stripe_charge_id <> p_charge_id) THEN
      v_reason := COALESCE(v_reason, 'conflicting_payment_reference');
    ELSIF pg_catalog.lower(v_payment.currency) <> p_currency
       OR p_amount_cents > v_payment.amount_cents THEN
      v_reason := COALESCE(v_reason, 'payment_amount_currency_mismatch');
    END IF;
  END IF;

  SELECT c.* INTO v_existing
  FROM public.stripe_financial_cases AS c
  WHERE c.stripe_object_id = p_stripe_object_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.kind <> p_kind
       OR v_existing.amount_cents <> p_amount_cents
       OR v_existing.currency <> p_currency THEN
      v_reason := 'object_identity_changed';
    END IF;
    IF v_existing.payment_id IS NOT NULL
       AND v_match_count = 1
       AND v_existing.payment_id <> v_payment.id THEN
      v_reason := 'object_payment_changed';
    END IF;
    IF (p_payment_intent_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.stripe_financial_case_refs AS r
          WHERE r.stripe_object_id = p_stripe_object_id
            AND r.reference_kind = 'payment_intent'
            AND r.reference_id <> p_payment_intent_id
        )) OR (p_charge_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.stripe_financial_case_refs AS r
          WHERE r.stripe_object_id = p_stripe_object_id
            AND r.reference_kind = 'charge'
            AND r.reference_id <> p_charge_id
        )) THEN
      v_reason := 'object_reference_changed';
    END IF;
    -- Contradictory terminal refund states cannot release a hold or be
    -- silently accepted as the newest result.
    IF p_kind = 'refund'
       AND v_existing.stripe_status IN ('succeeded','failed','canceled')
       AND v_existing.stripe_status <> p_stripe_status THEN
      v_reason := COALESCE(v_reason, 'terminal_refund_status_changed');
    END IF;
    -- Stripe has no database version field here. A changed dispute snapshot
    -- is a review signal, not proof that this HTTP response is the newest.
    IF p_kind = 'dispute'
       AND v_existing.stripe_status <> p_stripe_status THEN
      v_reason := COALESCE(v_reason, 'dispute_status_changed');
    END IF;
    -- Material conflicts remain quarantined until owner review. For example,
    -- needs_response -> won -> won must NOT turn the second won into open.
    -- Only missing/ambiguous references may auto-link after the underlying
    -- payment identity is genuinely resolved.
    IF v_existing.case_state = 'quarantined'
       AND v_existing.quarantine_reason NOT IN (
         'payment_not_found', 'ambiguous_payment_reference',
         'missing_reference'
       ) THEN
      v_reason := COALESCE(v_reason, v_existing.quarantine_reason);
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    v_case_state := 'quarantined';
  ELSIF p_kind = 'refund' THEN
    SELECT o.* INTO v_operation
    FROM public.stripe_refund_operations AS o
    WHERE o.payment_id = v_payment.id;
    IF FOUND THEN
      IF v_operation.amount_cents <> p_amount_cents
         OR pg_catalog.lower(v_operation.currency) <> p_currency
         OR v_operation.stripe_payment_reference IS NULL
         OR (v_operation.stripe_payment_reference IS DISTINCT FROM p_payment_intent_id
           AND v_operation.stripe_payment_reference IS DISTINCT FROM p_charge_id) THEN
        v_reason := 'admin_claim_mismatch';
        v_case_state := 'quarantined';
      ELSIF v_operation.stripe_refund_id IS NOT NULL
         AND v_operation.stripe_refund_id <> p_stripe_object_id THEN
        v_reason := 'different_admin_refund';
        v_case_state := 'quarantined';
      ELSIF v_operation.status = 'completed'
         AND v_operation.stripe_refund_id = p_stripe_object_id
         AND v_operation.amount_cents = p_amount_cents
         AND pg_catalog.lower(v_operation.currency) = p_currency
         AND p_stripe_status = 'succeeded'
         AND v_payment.status = 'refunded'
         AND EXISTS (
           SELECT 1 FROM public.stripe_refunds AS r
           WHERE r.id = v_operation.refund_id
             AND r.stripe_refund_id = p_stripe_object_id
             AND r.payment_id = v_payment.id
             AND r.tenant_id = v_payment.tenant_id
             AND r.amount_cents = p_amount_cents
             AND pg_catalog.lower(r.currency) = p_currency
             AND r.status = 'succeeded'
         ) THEN
        v_case_state := 'settled';
        v_settled := true;
      ELSIF v_operation.status = 'processing'
         AND (v_operation.stripe_refund_id IS NULL
              OR v_operation.stripe_refund_id = p_stripe_object_id) THEN
        v_case_state := 'awaiting_admin';
      ELSE
        v_case_state := 'open';
      END IF;
    ELSE
      v_case_state := 'open';
    END IF;
  ELSE
    v_case_state := 'open';
  END IF;


  -- A review closes the alert for the evidence inspected at that time. A new
  -- evt_* with identical object identity, status, refs and match does not
  -- create another alert. Material change reopens it with an immutable trail.
  IF v_existing.stripe_object_id IS NOT NULL
     AND v_existing.case_state = 'reviewed' THEN
    v_review_unchanged :=
      v_existing.kind = p_kind
      AND v_existing.amount_cents = p_amount_cents
      AND v_existing.currency = p_currency
      AND v_existing.last_observed_status = p_stripe_status
      -- A new funds movement is material even if Stripe's dispute status is
      -- unchanged; it must return to the review queue.
      AND NOT (p_kind = 'dispute' AND v_event_type IN (
        'charge.dispute.funds_withdrawn',
        'charge.dispute.funds_reinstated'
      ))
      AND (v_existing.quarantine_reason IS NOT DISTINCT FROM v_reason
           OR v_reason IS NULL)
      AND v_existing.reviewed_candidate_count = v_match_count
      AND (v_match_count <> 1 OR
           v_existing.reviewed_candidate_payment_id = v_payment.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.stripe_financial_case_refs AS r
        WHERE r.stripe_object_id = p_stripe_object_id
          AND r.reference_kind = 'payment_intent'
          AND r.reference_id IS DISTINCT FROM p_payment_intent_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stripe_financial_case_refs AS r
        WHERE r.stripe_object_id = p_stripe_object_id
          AND r.reference_kind = 'charge'
          AND r.reference_id IS DISTINCT FROM p_charge_id
      )
      AND (p_payment_intent_id IS NULL OR EXISTS (
        SELECT 1 FROM public.stripe_financial_case_refs AS r
        WHERE r.stripe_object_id = p_stripe_object_id
          AND r.reference_kind = 'payment_intent'
          AND r.reference_id = p_payment_intent_id
      ))
      AND (p_charge_id IS NULL OR EXISTS (
        SELECT 1 FROM public.stripe_financial_case_refs AS r
        WHERE r.stripe_object_id = p_stripe_object_id
          AND r.reference_kind = 'charge'
          AND r.reference_id = p_charge_id
      ));

    IF v_review_unchanged THEN
      v_case_state := 'reviewed';
      v_settled := false;
    ELSE
      INSERT INTO public.stripe_financial_case_reopenings (
        stripe_object_id, event_id, source, previous_stripe_status,
        observed_stripe_status, new_case_state,
        previous_candidate_count, new_candidate_count,
        previous_candidate_payment_id, new_candidate_payment_id
      ) VALUES (
        p_stripe_object_id, p_event_id, 'stripe_event', v_existing.stripe_status,
        p_stripe_status, v_case_state,
        v_existing.reviewed_candidate_count, v_match_count,
        v_existing.reviewed_candidate_payment_id,
        CASE WHEN v_match_count = 1 THEN v_payment.id ELSE NULL END
      );
    END IF;
  END IF;

  INSERT INTO public.stripe_financial_cases (
    stripe_object_id, kind, payment_id, tenant_id, amount_cents, currency,
    stripe_status, last_observed_status, case_state, quarantine_reason, hold_active,
    first_event_id, last_event_id, settled_at
  ) VALUES (
    p_stripe_object_id, p_kind,
    CASE WHEN v_reason IS NULL AND v_match_count = 1
      THEN v_payment.id ELSE NULL END,
    CASE WHEN v_reason IS NULL AND v_match_count = 1
      THEN v_payment.tenant_id ELSE NULL END,
    p_amount_cents, p_currency, p_stripe_status, p_stripe_status,
    v_case_state, v_reason,
    true, p_event_id, p_event_id,
    CASE WHEN v_settled THEN pg_catalog.now() ELSE NULL END
  )
  ON CONFLICT (stripe_object_id) DO UPDATE SET
    -- Never lose a prior linked hold. Unmatched cases retain every full ref.
    payment_id = COALESCE(
      public.stripe_financial_cases.payment_id, EXCLUDED.payment_id
    ),
    tenant_id = COALESCE(
      public.stripe_financial_cases.tenant_id, EXCLUDED.tenant_id
    ),
    stripe_status = CASE
      WHEN (
        (public.stripe_financial_cases.kind = 'refund'
          AND public.stripe_financial_cases.stripe_status
            IN ('succeeded','failed','canceled'))
        OR (public.stripe_financial_cases.kind = 'dispute'
          AND public.stripe_financial_cases.stripe_status
            IN ('won','lost','warning_closed','prevented'))
      ) AND public.stripe_financial_cases.stripe_status <> EXCLUDED.stripe_status
      THEN public.stripe_financial_cases.stripe_status
      ELSE EXCLUDED.stripe_status END,
    last_observed_status = EXCLUDED.last_observed_status,
    case_state = EXCLUDED.case_state,
    quarantine_reason = EXCLUDED.quarantine_reason,
    hold_active = true,
    last_event_id = EXCLUDED.last_event_id,
    last_seen_at = pg_catalog.now(),
    settled_at = CASE
      WHEN EXCLUDED.case_state = 'settled'
      THEN COALESCE(public.stripe_financial_cases.settled_at, pg_catalog.now())
      ELSE public.stripe_financial_cases.settled_at END,
    reviewed_at = CASE WHEN EXCLUDED.case_state = 'reviewed'
      THEN public.stripe_financial_cases.reviewed_at ELSE NULL END,
    reviewed_candidate_count = CASE WHEN EXCLUDED.case_state = 'reviewed'
      THEN public.stripe_financial_cases.reviewed_candidate_count ELSE NULL END,
    reviewed_candidate_payment_id = CASE WHEN EXCLUDED.case_state = 'reviewed'
      THEN public.stripe_financial_cases.reviewed_candidate_payment_id ELSE NULL END;

  IF p_payment_intent_id IS NOT NULL THEN
    INSERT INTO public.stripe_financial_case_refs (
      stripe_object_id, reference_kind, reference_id
    ) VALUES (p_stripe_object_id, 'payment_intent', p_payment_intent_id)
    ON CONFLICT DO NOTHING;
  END IF;
  IF p_charge_id IS NOT NULL THEN
    INSERT INTO public.stripe_financial_case_refs (
      stripe_object_id, reference_kind, reference_id
    ) VALUES (p_stripe_object_id, 'charge', p_charge_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN CASE WHEN v_reason IS NULL AND v_match_count = 1
    THEN 'linked' ELSE 'quarantined' END;
END;
$$;
REVOKE ALL ON FUNCTION public.record_stripe_financial_case(
  text,text,text,text,text,bigint,text,text,boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_stripe_financial_case(
  text,text,text,text,text,bigint,text,text,boolean
) TO service_role;

-- Idempotent closure for the normal admin-refund race: the webhook may arrive
-- before issueRefund has persisted/completed its Stripe response. This RPC
-- does not release the VAT hold. It only suppresses the incident alert after
-- every locally observed refund identity and status agrees.
CREATE FUNCTION public.settle_admin_refund_case(
  p_payment_id uuid,
  p_stripe_refund_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_payment public.stripe_payments%ROWTYPE;
  v_case public.stripe_financial_cases%ROWTYPE;
  v_operation public.stripe_refund_operations%ROWTYPE;
BEGIN
  IF p_payment_id IS NULL OR p_stripe_refund_id IS NULL
     OR p_stripe_refund_id !~ '^re_[A-Za-z0-9]+$' THEN
    RETURN 'invalid';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    805180, pg_catalog.hashtext(p_stripe_refund_id)
  );
  SELECT p.* INTO v_payment
  FROM public.stripe_payments AS p
  WHERE p.id = p_payment_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing_payment'; END IF;

  SELECT c.* INTO v_case
  FROM public.stripe_financial_cases AS c
  WHERE c.stripe_object_id = p_stripe_refund_id
    AND c.kind = 'refund'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing_case'; END IF;
  IF v_case.case_state = 'quarantined'
     OR v_case.payment_id IS DISTINCT FROM p_payment_id
     OR v_case.tenant_id IS DISTINCT FROM v_payment.tenant_id
     OR v_case.stripe_status <> 'succeeded'
     OR v_payment.status <> 'refunded'
     OR v_case.amount_cents <> v_payment.amount_cents
     OR pg_catalog.lower(v_payment.currency) <> v_case.currency THEN
    RETURN 'needs_reconciliation';
  END IF;

  SELECT o.* INTO v_operation
  FROM public.stripe_refund_operations AS o
  WHERE o.payment_id = p_payment_id;
  IF NOT FOUND OR v_operation.status <> 'completed'
     OR v_operation.stripe_refund_id <> p_stripe_refund_id
     OR v_operation.amount_cents <> v_case.amount_cents
     OR pg_catalog.lower(v_operation.currency) <> v_case.currency
     OR NOT EXISTS (
       SELECT 1 FROM public.stripe_refunds AS r
       WHERE r.id = v_operation.refund_id
         AND r.stripe_refund_id = p_stripe_refund_id
         AND r.payment_id = p_payment_id
         AND r.tenant_id = v_payment.tenant_id
         AND r.amount_cents = v_case.amount_cents
         AND pg_catalog.lower(r.currency) = v_case.currency
         AND r.status = 'succeeded'
     ) THEN
    RETURN 'needs_reconciliation';
  END IF;

  UPDATE public.stripe_financial_cases
  SET case_state = 'settled',
      quarantine_reason = NULL,
      hold_active = true,
      settled_at = COALESCE(settled_at, pg_catalog.now()),
      last_seen_at = pg_catalog.now()
  WHERE stripe_object_id = p_stripe_refund_id;
  RETURN 'settled';
END;
$$;
REVOKE ALL ON FUNCTION public.settle_admin_refund_case(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_admin_refund_case(uuid,text)
  TO service_role;

-- External cases are reviewed by a privileged database owner after comparing
-- the full Stripe object with local payment/VAT history. This is an alert
-- closure, not a refund or a release of the VAT/refund hold. The application
-- service_role has no EXECUTE privilege on the review RPC.
CREATE TABLE public.stripe_financial_case_reviews (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  stripe_object_id text NOT NULL
    REFERENCES public.stripe_financial_cases(stripe_object_id) ON DELETE RESTRICT,
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id),
  previous_state text NOT NULL,
  observed_stripe_status text NOT NULL,
  last_event_id text NOT NULL REFERENCES public.stripe_webhook_events(id),
  candidate_count integer NOT NULL CHECK (candidate_count >= 0),
  candidate_payment_id uuid,
  evidence_reference text NOT NULL
    CHECK (pg_catalog.char_length(evidence_reference) BETWEEN 8 AND 300),
  reason text NOT NULL
    CHECK (pg_catalog.char_length(reason) BETWEEN 20 AND 1000),
  hold_after boolean NOT NULL DEFAULT true CHECK (hold_after),
  reviewed_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
CREATE INDEX idx_stripe_financial_case_reviews_case
  ON public.stripe_financial_case_reviews(stripe_object_id, reviewed_at DESC);
ALTER TABLE public.stripe_financial_case_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_financial_case_reviews
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.prevent_financial_case_review_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Financial case review history is append-only'
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.prevent_financial_case_review_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER prevent_financial_case_review_mutation
  BEFORE UPDATE OR DELETE ON public.stripe_financial_case_reviews
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_case_review_mutation();
CREATE TRIGGER prevent_financial_case_reopening_mutation
  BEFORE UPDATE OR DELETE ON public.stripe_financial_case_reopenings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_financial_case_review_mutation();

CREATE FUNCTION public.review_stripe_financial_case(
  p_stripe_object_id text,
  p_reviewer_user_id uuid,
  p_expected_stripe_status text,
  p_expected_last_event_id text,
  p_expected_candidate_count integer,
  p_expected_candidate_payment_id uuid,
  p_evidence_reference text,
  p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_case public.stripe_financial_cases%ROWTYPE;
  v_candidate_count integer;
  v_candidate_id uuid;
  v_ref_key integer;
BEGIN
  IF p_stripe_object_id IS NULL OR p_reviewer_user_id IS NULL
     OR p_expected_stripe_status IS NULL
     OR p_expected_last_event_id IS NULL
     OR p_expected_last_event_id !~ '^evt_[A-Za-z0-9]+$'
     OR p_expected_candidate_count IS NULL
     OR p_expected_candidate_count < 0
     OR (p_expected_candidate_count = 1
         AND p_expected_candidate_payment_id IS NULL)
     OR (p_expected_candidate_count <> 1
         AND p_expected_candidate_payment_id IS NOT NULL)
     OR p_evidence_reference IS NULL
     OR pg_catalog.char_length(p_evidence_reference) NOT BETWEEN 8 AND 300
     OR p_reason IS NULL
     OR pg_catalog.char_length(p_reason) NOT BETWEEN 20 AND 1000 THEN
    RETURN 'invalid';
  END IF;
  -- Lock order matches record_stripe_financial_case: object, then every
  -- full reference in numeric key order, then the case row. New payments
  -- using those references cannot commit while the review is decided.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    805180, pg_catalog.hashtext(p_stripe_object_id)
  );
  FOR v_ref_key IN
    SELECT DISTINCT pg_catalog.hashtext(
      CASE r.reference_kind
        WHEN 'payment_intent' THEN 'pi:' || r.reference_id
        ELSE 'ch:' || r.reference_id
      END
    ) AS lock_key
    FROM public.stripe_financial_case_refs AS r
    WHERE r.stripe_object_id = p_stripe_object_id
    ORDER BY lock_key
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(805181, v_ref_key);
  END LOOP;

  SELECT c.* INTO v_case
  FROM public.stripe_financial_cases AS c
  WHERE c.stripe_object_id = p_stripe_object_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing_case'; END IF;
  IF v_case.case_state = 'settled' THEN RETURN 'already_settled'; END IF;
  IF v_case.case_state = 'reviewed' THEN RETURN 'already_reviewed'; END IF;
  IF v_case.last_event_id IS DISTINCT FROM p_expected_last_event_id THEN
    RETURN 'observation_changed';
  END IF;
  IF v_case.last_observed_status IS DISTINCT FROM p_expected_stripe_status THEN
    RETURN 'status_changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users AS u WHERE u.id = p_reviewer_user_id
  ) THEN
    RETURN 'invalid_reviewer';
  END IF;

  SELECT pg_catalog.count(DISTINCT p.id)::integer INTO v_candidate_count
  FROM public.stripe_payments AS p
  JOIN public.stripe_financial_case_refs AS r
    ON (r.reference_kind = 'payment_intent'
         AND r.reference_id = p.stripe_payment_intent_id)
    OR (r.reference_kind = 'charge'
         AND r.reference_id = p.stripe_charge_id)
  WHERE r.stripe_object_id = p_stripe_object_id;
  IF v_candidate_count = 1 THEN
    SELECT p.id INTO v_candidate_id
    FROM public.stripe_payments AS p
    JOIN public.stripe_financial_case_refs AS r
      ON (r.reference_kind = 'payment_intent'
           AND r.reference_id = p.stripe_payment_intent_id)
      OR (r.reference_kind = 'charge'
           AND r.reference_id = p.stripe_charge_id)
    WHERE r.stripe_object_id = p_stripe_object_id
    LIMIT 1;
  END IF;

  IF v_candidate_count IS DISTINCT FROM p_expected_candidate_count
     OR v_candidate_id IS DISTINCT FROM p_expected_candidate_payment_id THEN
    RETURN 'match_changed';
  END IF;

  INSERT INTO public.stripe_financial_case_reviews (
    stripe_object_id, reviewer_user_id, previous_state,
    observed_stripe_status, last_event_id, candidate_count,
    candidate_payment_id, evidence_reference, reason, hold_after
  ) VALUES (
    p_stripe_object_id, p_reviewer_user_id, v_case.case_state,
    v_case.last_observed_status, v_case.last_event_id,
    v_candidate_count, v_candidate_id,
    p_evidence_reference, p_reason, true
  );
  UPDATE public.stripe_financial_cases AS c
  SET case_state = 'reviewed',
      hold_active = true,
      reviewed_candidate_count = v_candidate_count,
      reviewed_candidate_payment_id = v_candidate_id,
      reviewed_at = pg_catalog.now()
  WHERE c.stripe_object_id = p_stripe_object_id;
  RETURN 'reviewed';
END;
$$;
REVOKE ALL ON FUNCTION public.review_stripe_financial_case(
  text,uuid,text,text,integer,uuid,text,text
) FROM PUBLIC, anon, authenticated, service_role;
