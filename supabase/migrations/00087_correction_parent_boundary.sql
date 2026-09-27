-- Bind correction parents to the same tenant and a proven KSeF acceptance.
-- Apply only after 00086 and after reconciling historical NULL provenance.
-- NOT VALID avoids treating existing cross-tenant links as already audited.
BEGIN;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_tenant_parent_correction_fk
  FOREIGN KEY (tenant_id, parent_invoice_id)
  REFERENCES public.invoices (tenant_id, id)
  ON DELETE RESTRICT NOT VALID;

CREATE OR REPLACE FUNCTION public.guard_invoice_correction_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_user IN ('authenticated', 'anon') THEN
    IF NEW.invoice_kind IS DISTINCT FROM OLD.invoice_kind OR
       NEW.parent_invoice_id IS DISTINCT FROM OLD.parent_invoice_id THEN
      RAISE EXCEPTION 'Invoice kind and parent are immutable after creation'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.ksef_status = 'accepted' AND (
       NEW.invoice_type IS DISTINCT FROM OLD.invoice_type OR
       NEW.correction_reason IS DISTINCT FROM OLD.correction_reason OR
       NEW.correction_type IS DISTINCT FROM OLD.correction_type OR
       NEW.advance_invoice_ids IS DISTINCT FROM OLD.advance_invoice_ids) THEN
      RAISE EXCEPTION 'Accepted invoice legal references are immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.invoice_kind = 'correction' AND NOT EXISTS (
    SELECT 1 FROM public.invoices p
    WHERE p.id = NEW.parent_invoice_id
      AND p.tenant_id = NEW.tenant_id
      AND p.direction = 'outgoing'
      AND p.invoice_kind = 'regular'
      AND p.ksef_status = 'accepted'
      AND p.ksef_environment IS NOT NULL
      AND NULLIF(pg_catalog.btrim(p.ksef_number), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Correction parent requires same-tenant accepted KSeF invoice with provenance'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_correction_parent()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trigger_guard_invoice_correction_parent ON public.invoices;
CREATE TRIGGER trigger_guard_invoice_correction_parent
  BEFORE INSERT OR UPDATE OF tenant_id, invoice_kind, invoice_type,
    parent_invoice_id, correction_reason, correction_type, advance_invoice_ids
  ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_correction_parent();

-- Historical rows are intentionally not validated here. Before VALIDATE
-- CONSTRAINT, the operator must count and resolve cross-tenant parent IDs and
-- accepted corrections with missing/foreign KSeF provenance on a DB copy.
COMMIT;
