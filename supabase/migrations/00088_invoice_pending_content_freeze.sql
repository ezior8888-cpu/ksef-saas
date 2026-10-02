-- Freeze legal document content from enqueue/Offline24 onward and prevent
-- client edits to accepted imports. This file is
-- for operator review and copy-DB testing only; Codex does not execute SQL.
-- Apply after the renumbered 00087 correction-parent boundary.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_invoice_pending_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_locked boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('authenticated', 'anon') AND (
      NEW.ksef_status IS DISTINCT FROM 'draft'
      OR NEW.ksef_number IS NOT NULL
      OR NEW.ksef_environment IS NOT NULL
      OR NEW.ksef_accepted_at IS NOT NULL
      OR NEW.xml_storage_path IS NOT NULL
      OR NEW.offline_qr_offline IS NOT NULL
      OR NEW.offline_qr_certyfikat IS NOT NULL
      OR NEW.offline_idempotency_key IS NOT NULL
      OR NEW.submitted_to_ksef_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Client invoice must start as a draft without KSeF delivery evidence'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_locked := OLD.ksef_status IN ('queued', 'offline_queued', 'sending')
      OR OLD.offline_idempotency_key IS NOT NULL
      OR OLD.submitted_to_ksef_at IS NOT NULL
      OR (current_user IN ('authenticated', 'anon') AND OLD.ksef_status = 'accepted');
    IF v_locked THEN
      RAISE EXCEPTION 'KSeF document cannot be deleted by this role'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- Incoming imports can be accepted without a local submission timestamp.
  -- Their trusted server-side enrichment remains possible; client edits do not.
  v_locked := OLD.ksef_status IN ('queued', 'offline_queued', 'sending')
    OR NEW.ksef_status IN ('queued', 'offline_queued', 'sending')
    OR OLD.offline_idempotency_key IS NOT NULL
    OR OLD.submitted_to_ksef_at IS NOT NULL
    OR (current_user IN ('authenticated', 'anon') AND
        (OLD.ksef_status = 'accepted' OR NEW.ksef_status = 'accepted'));
  IF v_locked AND ROW(
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
    RAISE EXCEPTION 'KSeF document content is immutable for this role'
      USING ERRCODE = '42501';
  END IF;

  -- Current enqueue marks a draft queued via the authenticated session after
  -- publishing an event. This trigger protects the listed delivery fields;
  -- it does not prove that a client-written queued state has a matching job.
  IF current_user IN ('authenticated', 'anon') AND (
    NEW.ksef_status IN ('sending', 'offline_queued', 'accepted')
      AND NEW.ksef_status IS DISTINCT FROM OLD.ksef_status
    OR OLD.ksef_status IN ('queued', 'offline_queued', 'sending')
      AND NEW.ksef_status IS DISTINCT FROM OLD.ksef_status
    OR NEW.ksef_number IS DISTINCT FROM OLD.ksef_number
    OR NEW.ksef_environment IS DISTINCT FROM OLD.ksef_environment
    OR NEW.ksef_accepted_at IS DISTINCT FROM OLD.ksef_accepted_at
    OR NEW.xml_storage_path IS DISTINCT FROM OLD.xml_storage_path
    OR NEW.offline_qr_offline IS DISTINCT FROM OLD.offline_qr_offline
    OR NEW.offline_qr_certyfikat IS DISTINCT FROM OLD.offline_qr_certyfikat
    OR NEW.offline_idempotency_key IS DISTINCT FROM OLD.offline_idempotency_key
    OR NEW.submitted_to_ksef_at IS DISTINCT FROM OLD.submitted_to_ksef_at
  ) THEN
    RAISE EXCEPTION 'KSeF delivery state is server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_pending_content()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS b_guard_invoice_pending_content ON public.invoices;
CREATE TRIGGER b_guard_invoice_pending_content
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_pending_content();

-- Lock the parent row before changing legal line content, so a concurrent
-- enqueue cannot race the line edit. This trigger allows accounting-only
-- changes on pending rows; 00086 separately blocks client DML on accepted lines.
CREATE OR REPLACE FUNCTION public.guard_pending_invoice_lines()
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
  IF TG_OP = 'UPDATE' THEN
    IF ROW(
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
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old_id := OLD.invoice_id; END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new_id := NEW.invoice_id; END IF;
  FOR v_parent IN
    SELECT i.ksef_status, i.offline_idempotency_key, i.submitted_to_ksef_at
      FROM public.invoices i
     WHERE i.id IN (v_old_id, v_new_id)
     ORDER BY i.id
     FOR SHARE
  LOOP
    IF v_parent.ksef_status IN ('queued', 'offline_queued', 'sending')
       OR v_parent.offline_idempotency_key IS NOT NULL
       OR v_parent.submitted_to_ksef_at IS NOT NULL THEN
      RAISE EXCEPTION 'Pending KSeF invoice lines are immutable'
        USING ERRCODE = '42501';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_invoice_lines()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS b_guard_pending_invoice_lines ON public.invoice_line_items;
CREATE TRIGGER b_guard_pending_invoice_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_pending_invoice_lines();

COMMIT;
