-- Close the authenticated write gap left by 00088 for historical failed and
-- rejected invoices with a NULL submitted_to_ksef_at. This migration is for
-- operator review and copy-DB testing; Codex does not execute it.
-- Files 00091/00092 are already in main; their presence does not prove they
-- ran on db-1. Verify the actual migration sequence before applying 00093.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_invoice_delivery_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_historical boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.last_attempt_at IS NOT NULL
       OR COALESCE(NEW.submission_attempts, 0) <> 0
       OR NEW.last_error IS NOT NULL
       OR NEW.last_error_code IS NOT NULL
       OR NEW.last_error_field IS NOT NULL
       OR NEW.last_error_suggestion IS NOT NULL THEN
      RAISE EXCEPTION 'Client cannot create KSeF delivery history'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  v_historical := OLD.ksef_status IN ('failed', 'rejected')
    OR OLD.last_attempt_at IS NOT NULL
    OR COALESCE(OLD.submission_attempts, 0) <> 0
    OR OLD.last_error IS NOT NULL
    OR OLD.last_error_code IS NOT NULL
    OR OLD.last_error_field IS NOT NULL
    OR OLD.last_error_suggestion IS NOT NULL
    OR OLD.offline_idempotency_key IS NOT NULL
    OR OLD.submitted_to_ksef_at IS NOT NULL
    OR OLD.ksef_number IS NOT NULL
    OR OLD.ksef_environment IS NOT NULL
    OR OLD.ksef_accepted_at IS NOT NULL
    OR OLD.xml_storage_path IS NOT NULL
    OR OLD.offline_qr_offline IS NOT NULL
    OR OLD.offline_qr_certyfikat IS NOT NULL;

  IF TG_OP = 'DELETE' THEN
    IF OLD.ksef_status IS DISTINCT FROM 'draft' OR v_historical THEN
      RAISE EXCEPTION 'KSeF invoice with delivery history cannot be deleted by client'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- An old failed/NULL row is not proof that no POST reached KSeF. Freeze
  -- legal content while keeping accounting-only fields editable, like 00088.
  IF v_historical AND ROW(
    NEW.tenant_id, NEW.direction, NEW.internal_number,
    NEW.invoice_type, NEW.invoice_kind, NEW.origin,
    NEW.issue_date, NEW.sale_date, NEW.seller_nip, NEW.buyer_nip,
    NEW.seller_data, NEW.buyer_data, NEW.payment_data,
    NEW.payment_due_date, NEW.currency, NEW.notes,
    NEW.net_total, NEW.vat_total, NEW.gross_total, NEW.fa3_data,
    NEW.is_b2c, NEW.buyer_id_type, NEW.buyer_pesel,
    NEW.buyer_id_number, NEW.parent_invoice_id,
    NEW.correction_reason, NEW.correction_type, NEW.advance_amount,
    NEW.advance_invoice_ids
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.direction, OLD.internal_number,
    OLD.invoice_type, OLD.invoice_kind, OLD.origin,
    OLD.issue_date, OLD.sale_date, OLD.seller_nip, OLD.buyer_nip,
    OLD.seller_data, OLD.buyer_data, OLD.payment_data,
    OLD.payment_due_date, OLD.currency, OLD.notes,
    OLD.net_total, OLD.vat_total, OLD.gross_total, OLD.fa3_data,
    OLD.is_b2c, OLD.buyer_id_type, OLD.buyer_pesel,
    OLD.buyer_id_number, OLD.parent_invoice_id,
    OLD.correction_reason, OLD.correction_type, OLD.advance_amount,
    OLD.advance_invoice_ids
  ) THEN
    RAISE EXCEPTION 'KSeF legal content with delivery history is immutable'
      USING ERRCODE = '42501';
  END IF;

  -- The current enqueue action still marks a fresh draft queued with the
  -- authenticated session. All other delivery transitions belong to jobs.
  IF NEW.ksef_status IS DISTINCT FROM OLD.ksef_status AND NOT (
    OLD.ksef_status = 'draft' AND NEW.ksef_status = 'queued'
    AND NOT v_historical
  ) THEN
    RAISE EXCEPTION 'KSeF delivery transition is server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF ROW(
    NEW.last_attempt_at, NEW.submission_attempts, NEW.last_error,
    NEW.last_error_code, NEW.last_error_field, NEW.last_error_suggestion
  ) IS DISTINCT FROM ROW(
    OLD.last_attempt_at, OLD.submission_attempts, OLD.last_error,
    OLD.last_error_code, OLD.last_error_field, OLD.last_error_suggestion
  ) THEN
    RAISE EXCEPTION 'KSeF delivery diagnostics are server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_delivery_history()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a_guard_invoice_delivery_history ON public.invoices;
CREATE TRIGGER a_guard_invoice_delivery_history
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_delivery_history();

-- 00088 freezes line items in queued/sending states. Historical failed/NULL
-- rows must also retain the exact content needed for reconciliation.
CREATE OR REPLACE FUNCTION public.guard_historical_ksef_invoice_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_old_id uuid;
  v_new_id uuid;
  v_parent record;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Preserve the accounting-only update exception from 00088. These columns
  -- are outside the legal FA(3) content and may be edited after a failure.
  IF TG_OP = 'UPDATE' AND ROW(
    NEW.id, NEW.invoice_id, NEW.ordinal, NEW.name, NEW.quantity,
    NEW.unit, NEW.unit_price_net, NEW.vat_rate,
    NEW.net_amount, NEW.vat_amount, NEW.gross_amount
  ) IS NOT DISTINCT FROM ROW(
    OLD.id, OLD.invoice_id, OLD.ordinal, OLD.name, OLD.quantity,
    OLD.unit, OLD.unit_price_net, OLD.vat_rate,
    OLD.net_amount, OLD.vat_amount, OLD.gross_amount
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old_id := OLD.invoice_id; END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new_id := NEW.invoice_id; END IF;
  FOR v_parent IN
    SELECT i.ksef_status, i.last_attempt_at, i.submission_attempts,
           i.last_error, i.last_error_code, i.last_error_field,
           i.last_error_suggestion, i.offline_idempotency_key,
           i.submitted_to_ksef_at, i.ksef_number, i.ksef_environment,
           i.ksef_accepted_at, i.xml_storage_path,
           i.offline_qr_offline, i.offline_qr_certyfikat
      FROM public.invoices i
     WHERE i.id IN (v_old_id, v_new_id)
     ORDER BY i.id
     FOR SHARE
  LOOP
    IF v_parent.ksef_status IN ('failed', 'rejected')
       OR v_parent.last_attempt_at IS NOT NULL
       OR COALESCE(v_parent.submission_attempts, 0) <> 0
       OR v_parent.last_error IS NOT NULL
       OR v_parent.last_error_code IS NOT NULL
       OR v_parent.last_error_field IS NOT NULL
       OR v_parent.last_error_suggestion IS NOT NULL
       OR v_parent.offline_idempotency_key IS NOT NULL
       OR v_parent.submitted_to_ksef_at IS NOT NULL
       OR v_parent.ksef_number IS NOT NULL
       OR v_parent.ksef_environment IS NOT NULL
       OR v_parent.ksef_accepted_at IS NOT NULL
       OR v_parent.xml_storage_path IS NOT NULL
       OR v_parent.offline_qr_offline IS NOT NULL
       OR v_parent.offline_qr_certyfikat IS NOT NULL THEN
      RAISE EXCEPTION 'KSeF invoice lines with delivery history are immutable'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_historical_ksef_invoice_lines()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS a_guard_historical_ksef_invoice_lines ON public.invoice_line_items;
CREATE TRIGGER a_guard_historical_ksef_invoice_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_historical_ksef_invoice_lines();

COMMIT;
