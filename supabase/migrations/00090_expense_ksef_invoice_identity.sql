-- One invoice may create at most one KPiR expense. The old index from 00044
-- was not unique, so concurrent auto-categorize events could double-book it.
-- No historical expense is deleted or merged here.
BEGIN;

-- NOT VALID protects future rows but does not scan history. Hold both tables
-- stable from the preflight through FK creation so an old cross-tenant link
-- cannot slip in between those steps.
LOCK TABLE public.invoices, public.expenses IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT tenant_id, ksef_invoice_id
      FROM public.expenses
      WHERE ksef_invoice_id IS NOT NULL
      GROUP BY tenant_id, ksef_invoice_id
      HAVING count(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate KSeF-linked expenses require manual reconciliation before 00090';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.expenses AS e
    JOIN public.invoices AS i ON i.id = e.ksef_invoice_id
    WHERE e.ksef_invoice_id IS NOT NULL AND e.tenant_id <> i.tenant_id
  ) THEN
    RAISE EXCEPTION 'Cross-tenant KSeF-linked expenses require manual reconciliation before 00090';
  END IF;
END;
$$;

CREATE UNIQUE INDEX uq_expenses_tenant_ksef_invoice
  ON public.expenses (tenant_id, ksef_invoice_id)
  WHERE ksef_invoice_id IS NOT NULL;

-- The existing UUID-only FK proves existence, but not tenant ownership.
-- 00073 supplies a unique (tenant_id,id) index on invoices.
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_ksef_invoice_same_tenant_fk
  FOREIGN KEY (tenant_id, ksef_invoice_id)
  REFERENCES public.invoices (tenant_id, id) NOT VALID;

COMMENT ON INDEX public.uq_expenses_tenant_ksef_invoice IS
  'At most one expense per KSeF invoice within a tenant.';

COMMIT;
