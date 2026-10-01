-- Stage 2 of the KSeF expense review boundary. Apply only after 00100 has
-- installed review_ksef_expense() AND the web uses that RPC for KSeF reviews.
-- Applying this before the web rollout breaks legitimate expense editing.
-- CREATE OR REPLACE retains the trigger installed by 00100.
DO $$
BEGIN
  IF to_regprocedure('public.review_ksef_expense(uuid,uuid,uuid,timestamptz,jsonb)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger AS t
        WHERE t.tgrelid = 'public.expenses'::regclass
          AND t.tgname = 'a_guard_ksef_expense_provenance'
          AND NOT t.tgisinternal
     ) THEN
    RAISE EXCEPTION 'KSeF expense stage 1 RPC/trigger is missing';
  END IF;
END;
$$;

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

  -- Every client UPDATE of an existing KSeF expense is forbidden, including
  -- no-op writes and edits to amount, deduction, review or the original FX
  -- evidence. Ordinary tenant-scoped expenses retain their existing RLS write.
  IF OLD.source = 'ksef_inbox' OR OLD.ksef_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'KSeF expense review is server-managed'
      USING ERRCODE = '42501';
  END IF;

  -- A client cannot relabel an ordinary expense as KSeF or attach an invoice.
  IF NEW.source IS DISTINCT FROM OLD.source
     OR NEW.ksef_invoice_id IS DISTINCT FROM OLD.ksef_invoice_id THEN
    RAISE EXCEPTION 'Expense source and KSeF link are server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_ksef_expense_provenance() IS
  'Stage 2: client roles cannot update or delete KSeF expenses; service_role review_ksef_expense performs verified, tenant-bound, atomically audited edits.';
