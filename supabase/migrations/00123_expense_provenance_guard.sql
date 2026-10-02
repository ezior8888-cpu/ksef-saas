-- Przeniesione 02.10.2026 ze szkicu Codexa #71 (tam 00095) jako 00123 — C-20.
-- The 00034 tenant RLS policy still lets an authenticated caller UPDATE every
-- expense column. A client could relabel a KSeF expense as manual or remove its
-- invoice link, making it escape environment-specific KSeF expense filters.
-- Keep 00090 unchanged: its deployment status on db-1 may differ from git.
-- This guard has no dependency on 00090/00094 and does not rewrite old rows.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_expense_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Only the trusted inbox worker may claim that an expense came from KSeF.
    IF NEW.source = 'ksef_inbox' OR NEW.ksef_invoice_id IS NOT NULL THEN
      RAISE EXCEPTION 'KSeF expense provenance requires a trusted server'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- Keep the original tenant, source and invoice link while allowing normal
  -- review edits (category, amounts, notes, deductible VAT and status).
  IF ROW(NEW.tenant_id, NEW.source, NEW.ksef_invoice_id)
     IS DISTINCT FROM
     ROW(OLD.tenant_id, OLD.source, OLD.ksef_invoice_id) THEN
    RAISE EXCEPTION 'Expense provenance cannot be changed by client'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_expense_provenance()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_guard_expense_provenance ON public.expenses;
CREATE TRIGGER a_guard_expense_provenance
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_expense_provenance();

COMMIT;
