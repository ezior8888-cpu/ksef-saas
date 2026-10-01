-- Protect the KSeF expense identity and the original FX evidence from direct
-- PostgREST writes. The inbox/OCR jobs insert through service_role; the UI
-- reviews existing expenses as authenticated users.

-- No authenticated application path inserts expenses. Keeping INSERT open
-- would let a client replace a guarded KSeF expense with a fabricated row.
REVOKE INSERT ON TABLE public.expenses FROM authenticated;

CREATE OR REPLACE FUNCTION public.guard_ksef_expense_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.source = 'ksef_inbox' OR OLD.ksef_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'KSeF expense evidence is server-managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.source IS DISTINCT FROM OLD.source
     OR NEW.ksef_invoice_id IS DISTINCT FROM OLD.ksef_invoice_id THEN
    RAISE EXCEPTION 'Expense source and KSeF link are server-managed'
      USING ERRCODE = '42501';
  END IF;

  IF (OLD.source = 'ksef_inbox' OR OLD.ksef_invoice_id IS NOT NULL)
     AND NEW.ocr_extracted_data IS DISTINCT FROM OLD.ocr_extracted_data THEN
    RAISE EXCEPTION 'KSeF expense currency evidence is server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_guard_ksef_expense_provenance ON public.expenses;
CREATE TRIGGER a_guard_ksef_expense_provenance
  BEFORE UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_ksef_expense_provenance();

COMMENT ON FUNCTION public.guard_ksef_expense_provenance() IS
  'Client roles cannot rewrite or delete the KSeF source/link or original FX evidence; service_role remains available for controlled operator repair.';
