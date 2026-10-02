-- Przeniesione 02.10.2026 ze szkicu Codexa #62 (tam 00084) jako 00115 — C-20.
-- Numeracja: 00083→00114, 00084→00115, 00085→00116.
-- Correct the 00080 payment-reference guard for invoice payment retries.
-- Deployment gate: verify main through 00082 and apply 00114 Customer claim first.
-- If 00080 is already applied, do not rerun it: this file replaces its trigger
-- function in place. Reconcile receipts failed under that old function and
-- existing payment references, rehearse on a production copy, then deploy
-- this migration with the matching app code.
-- Codex does not execute this SQL.
-- A failed receipt stays blocked: compare Stripe, DB, jobs and VAT effects
-- before any operator-controlled replay. Never clear evt_* just to retry.
--
-- A failed attempt can have a different Charge and/or PaymentIntent than the
-- attempt that ultimately pays the same Stripe invoice. Keep established refs
-- immutable once the local payment is no longer failed. The old and new full
-- references are locked before the row may change; existing financial cases,
-- refund operations and VAT invoices must never lose their association.

BEGIN;

DO $$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.guard_stripe_payment_financial_refs()'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.stripe_lock_financial_refs(text,text,boolean)'
  ) IS NULL OR pg_catalog.to_regclass(
    'public.stripe_financial_case_refs'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.stripe_payment_has_financial_hold(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Apply 00080 before 00115'
      USING ERRCODE = '55000';
  END IF;
END;
$$;

-- Existing rows, including succeeded payments, remain unverified until an
-- operator reconciles their exact Stripe references. No inferred backfill.
ALTER TABLE public.stripe_payments
  ADD COLUMN stripe_payment_refs_verified boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT stripe_payments_verified_ref_pair CHECK (
    NOT stripe_payment_refs_verified OR (
      status IN ('succeeded', 'refunded', 'partially_refunded')
      AND stripe_payment_intent_id IS NOT NULL
      AND stripe_payment_intent_id ~ '^pi_[A-Za-z0-9]{8,}$'
      AND stripe_charge_id IS NOT NULL
      AND stripe_charge_id ~ '^ch_[A-Za-z0-9]{8,}$'
    )
  );

COMMENT ON COLUMN public.stripe_payments.stripe_payment_refs_verified IS
  'True only after a fresh Stripe lookup proves this full PaymentIntent/Charge pair for the paid invoice; historical rows require reconciliation.';

CREATE OR REPLACE FUNCTION public.guard_stripe_payment_financial_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_intent_id text;
  v_charge_id text;
  v_new_attempt boolean;
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
    -- The upsert holds the payment row before this trigger. Try-lock the old
    -- full refs as well as the incoming refs; an external case that holds a
    -- ref lock while waiting for this row must cause this upsert to abort,
    -- never a deadlock or a stale case check.
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

    IF OLD.status = 'failed' AND NEW.status IN ('failed', 'succeeded') THEN
      v_new_attempt :=
        (NEW.stripe_payment_intent_id IS NOT NULL AND
         NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id)
        OR (NEW.stripe_charge_id IS NOT NULL AND
            NEW.stripe_charge_id IS DISTINCT FROM OLD.stripe_charge_id);

      -- A later failed snapshot with no new identity can omit old refs.
      -- When another failed attempt has a new full ref, or a paid snapshot
      -- arrives, do not splice the old PI/Charge into that attempt.
      IF NEW.status = 'failed' AND NOT v_new_attempt THEN
        NEW.stripe_payment_intent_id :=
          COALESCE(NEW.stripe_payment_intent_id,
                   OLD.stripe_payment_intent_id);
        NEW.stripe_charge_id :=
          COALESCE(NEW.stripe_charge_id,
                   OLD.stripe_charge_id);
      END IF;
      IF NEW.status = 'succeeded'
         AND NEW.stripe_payment_intent_id IS NULL
         AND NEW.stripe_charge_id IS NULL THEN
        RAISE EXCEPTION 'Paid Stripe payment has no full reference'
          USING ERRCODE = '23514';
      END IF;

      IF NEW.stripe_payment_intent_id IS DISTINCT FROM OLD.stripe_payment_intent_id
         OR NEW.stripe_charge_id IS DISTINCT FROM OLD.stripe_charge_id THEN
        -- A historical bad row could be marked failed despite a VAT invoice,
        -- refund or financial case. Keep it for manual reconciliation instead
        -- of changing the identity those records may depend upon.
        IF OLD.vat_invoice_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM public.stripe_refund_operations AS operation
             WHERE operation.payment_id = OLD.id
           )
           OR EXISTS (
             SELECT 1 FROM public.stripe_refunds AS refund
             WHERE refund.payment_id = OLD.id
           )
           OR EXISTS (
             SELECT 1 FROM public.stripe_financial_cases AS financial_case
             WHERE financial_case.payment_id = OLD.id
           )
           OR EXISTS (
             SELECT 1
             FROM public.stripe_financial_case_refs AS reference
             WHERE (reference.reference_kind = 'payment_intent'
               AND reference.reference_id = OLD.stripe_payment_intent_id
               AND OLD.stripe_payment_intent_id
                    IS DISTINCT FROM NEW.stripe_payment_intent_id)
                OR (reference.reference_kind = 'charge'
               AND reference.reference_id = OLD.stripe_charge_id
               AND OLD.stripe_charge_id IS DISTINCT FROM NEW.stripe_charge_id)
           ) THEN
          RAISE EXCEPTION 'Failed Stripe payment reference needs reconciliation'
            USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSE
      -- After success or any refund state, an established identity is fixed.
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

-- Also lock both refs on a flag-only UPDATE. A false write deliberately
-- revokes proof and holds financial actions; a stale success-to-failure
-- webhook is already discarded whole by the earlier 00077 status trigger.
DROP TRIGGER u_guard_stripe_payment_financial_refs ON public.stripe_payments;
CREATE TRIGGER u_guard_stripe_payment_financial_refs
  BEFORE INSERT OR UPDATE OF stripe_payment_intent_id, stripe_charge_id,
    stripe_payment_refs_verified
  ON public.stripe_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_stripe_payment_financial_refs();

-- The 00080 VAT INSERT and admin-refund claim/preflight guards call this
-- helper after locking the payment. Only a succeeded payment with a verified
-- pair may proceed; a case may still hold it through either full reference.
CREATE OR REPLACE FUNCTION public.stripe_payment_has_financial_hold(p_payment_id uuid)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stripe_payments AS p
    WHERE p.id = p_payment_id
      AND (p.status IS DISTINCT FROM 'succeeded'
           OR NOT p.stripe_payment_refs_verified)
  ) OR EXISTS (
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

COMMIT;
