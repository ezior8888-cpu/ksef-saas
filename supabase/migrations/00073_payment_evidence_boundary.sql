-- Payment evidence is server-managed. Apply after 00072, before deploying the
-- companion application change. The operator must inspect existing grants and
-- cross-tenant rows first; the NOT VALID FKs protect new writes immediately,
-- while validation of historical rows remains an explicit release gate.
-- 00074 removes direct client writes after the new app is deployed.

-- Keep a session-authorized, atomic way to pause an invoice and cancel its
-- pending reminders before removing direct reminder writes from authenticated.
CREATE OR REPLACE FUNCTION public.set_invoice_reminders_paused(
  p_invoice_id uuid,
  p_paused boolean,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id uuid;
  v_invoice_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_invoice_id IS NULL OR p_paused IS NULL THEN
    RAISE EXCEPTION 'Invalid reminder pause request' USING ERRCODE = '42501';
  END IF;

  v_tenant_id := public.get_current_tenant_id();
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No active organization' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NOT NULL AND char_length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Reminder pause reason too long' USING ERRCODE = '22023';
  END IF;

  UPDATE public.invoices
     SET reminders_paused = p_paused,
         reminders_paused_reason = CASE WHEN p_paused THEN p_reason ELSE NULL END
   WHERE id = p_invoice_id AND tenant_id = v_tenant_id
   RETURNING id INTO v_invoice_id;
  IF v_invoice_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_paused THEN
    UPDATE public.payment_reminders
       SET status = 'cancelled',
           failure_reason = 'Wstrzymane przez użytkownika'
     WHERE tenant_id = v_tenant_id
       AND invoice_id = p_invoice_id
       AND status = 'pending';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_invoice_reminders_paused(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_invoice_reminders_paused(uuid, boolean, text)
  TO authenticated;

-- Client DML is removed by 00074 after the RPC-based app is deployed.

-- A single-column FK permits a row labelled tenant A to refer to a tenant B
-- invoice/payment. Unique indexes provide the parent keys for composite FKs.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_id_id_payment_evidence_idx
  ON public.invoices (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_tenant_id_id_payment_evidence_idx
  ON public.payments (tenant_id, id);

ALTER TABLE public.payments
  ADD CONSTRAINT payments_tenant_invoice_payment_evidence_fk
  FOREIGN KEY (tenant_id, invoice_id)
  REFERENCES public.invoices (tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.payment_reminders
  ADD CONSTRAINT payment_reminders_tenant_invoice_payment_evidence_fk
  FOREIGN KEY (tenant_id, invoice_id)
  REFERENCES public.invoices (tenant_id, id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.payment_imports
  ADD CONSTRAINT payment_imports_tenant_payment_evidence_fk
  FOREIGN KEY (tenant_id, matched_payment_id)
  REFERENCES public.payments (tenant_id, id) NOT VALID;

-- Direct PostgREST UPDATE invoices paid_amount would otherwise bypass the
-- payment ledger. The trigger executes as the caller; the payment recalculation
-- trigger runs through its SECURITY DEFINER owner. Accepted invoice fields used
-- to decide whether/where to send reminders are immutable to client roles.
CREATE OR REPLACE FUNCTION public.guard_invoice_payment_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.paid_amount <> 0 OR NEW.paid_at IS NOT NULL
       OR NEW.payment_status NOT IN ('unpaid', 'overdue')
       OR NEW.ksef_status = 'accepted' THEN
      RAISE EXCEPTION 'Payment state is server-managed' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
     OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
    RAISE EXCEPTION 'Payment state is server-managed' USING ERRCODE = '42501';
  END IF;

  IF NEW.ksef_status = 'accepted' AND OLD.ksef_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'KSeF acceptance is server-managed' USING ERRCODE = '42501';
  END IF;

  IF OLD.ksef_status = 'accepted' AND (
      NEW.ksef_status IS DISTINCT FROM OLD.ksef_status
      OR NEW.direction IS DISTINCT FROM OLD.direction
      OR NEW.gross_total IS DISTINCT FROM OLD.gross_total
      OR NEW.payment_due_date IS DISTINCT FROM OLD.payment_due_date
      OR NEW.buyer_nip IS DISTINCT FROM OLD.buyer_nip
      OR NEW.buyer_data IS DISTINCT FROM OLD.buyer_data
      OR NEW.ksef_number IS DISTINCT FROM OLD.ksef_number
      OR NEW.internal_number IS DISTINCT FROM OLD.internal_number
      OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
      OR NEW.seller_nip IS DISTINCT FROM OLD.seller_nip
      OR NEW.seller_data IS DISTINCT FROM OLD.seller_data
      OR NEW.payment_data IS DISTINCT FROM OLD.payment_data
      OR NEW.net_total IS DISTINCT FROM OLD.net_total
      OR NEW.vat_total IS DISTINCT FROM OLD.vat_total
      OR NEW.currency IS DISTINCT FROM OLD.currency
      OR NEW.fa3_data IS DISTINCT FROM OLD.fa3_data
      OR NEW.xml_storage_path IS DISTINCT FROM OLD.xml_storage_path
  ) THEN
    RAISE EXCEPTION 'Accepted invoice delivery data is server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_invoice_payment_evidence ON public.invoices;
CREATE TRIGGER a_guard_invoice_payment_evidence
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_payment_evidence();

-- Recalculate only the invoice matching the payment tenant. Cover all fields
-- used by the SUM predicate, including is_auto_matched and tenant_id.
CREATE OR REPLACE FUNCTION public.recalculate_invoice_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recalc_new boolean := false;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    UPDATE public.invoices AS i
       SET paid_amount = (
         SELECT COALESCE(SUM(p.amount), 0)
           FROM public.payments AS p
          WHERE p.tenant_id = i.tenant_id
            AND p.invoice_id = i.id
            AND (p.is_auto_matched = false OR p.is_confirmed = true)
       )
     WHERE i.tenant_id = OLD.tenant_id AND i.id = OLD.invoice_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_recalc_new := true;
  ELSIF TG_OP = 'UPDATE' THEN
    v_recalc_new := NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
      OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id;
  END IF;

  IF v_recalc_new THEN
    UPDATE public.invoices AS i
       SET paid_amount = (
         SELECT COALESCE(SUM(p.amount), 0)
           FROM public.payments AS p
          WHERE p.tenant_id = i.tenant_id
            AND p.invoice_id = i.id
            AND (p.is_auto_matched = false OR p.is_confirmed = true)
       )
     WHERE i.tenant_id = NEW.tenant_id AND i.id = NEW.invoice_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_recalculate_paid_amount ON public.payments;
CREATE TRIGGER trigger_recalculate_paid_amount
  AFTER INSERT OR DELETE OR UPDATE OF amount, is_confirmed, is_auto_matched,
    invoice_id, tenant_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_invoice_paid_amount();

-- paid_at describes the current fully-paid state, not a historical payment.
CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.paid_amount = 0 THEN
    NEW.paid_at := NULL;
    IF NEW.payment_due_date IS NOT NULL AND NEW.payment_due_date < CURRENT_DATE THEN
      NEW.payment_status := 'overdue';
    ELSE
      NEW.payment_status := 'unpaid';
    END IF;
  ELSIF NEW.gross_total IS NOT NULL AND NEW.paid_amount >= NEW.gross_total THEN
    NEW.payment_status := 'paid';
    IF NEW.paid_at IS NULL THEN NEW.paid_at := NOW(); END IF;
  ELSE
    NEW.payment_status := 'partial';
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
