-- Received invoice numbers belong to suppliers and are not unique within a
-- tenant. 00028 accidentally applies that uniqueness to incoming invoices,
-- so one supplier's FV/1 can reject an entire KSeF inbox batch from another.
-- This migration is deliberately independent of 00086/00089 and can be
-- reviewed against main. It does not reconcile or delete historical rows.
-- Operator: inspect migration history and duplicate preflight first; arrange
-- a short write pause because index replacement holds a table lock.
BEGIN;

LOCK TABLE public.invoices IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT tenant_id, internal_number
      FROM public.invoices
      WHERE direction = 'outgoing' AND internal_number IS NOT NULL
      GROUP BY tenant_id, internal_number HAVING count(*) > 1
    ) AS duplicates
  ) THEN
    RAISE EXCEPTION 'Duplicate outgoing invoice numbers require manual reconciliation before 00096';
  END IF;

  IF pg_catalog.to_regclass('public.uq_invoices_incoming_ksef_identity') IS NULL
     AND EXISTS (
       SELECT 1 FROM (
         SELECT tenant_id, ksef_number
         FROM public.invoices
         WHERE direction = 'incoming' AND ksef_number IS NOT NULL
         GROUP BY tenant_id, ksef_number HAVING count(*) > 1
       ) AS duplicates
     ) THEN
    RAISE EXCEPTION 'Duplicate incoming KSeF numbers require manual reconciliation before 00096';
  END IF;

  -- 00089 may already be present on a server even though it is not on main.
  -- In that case keep its environment-aware index instead of adding a more
  -- restrictive cross-environment key.
  IF pg_catalog.to_regclass('public.uq_invoices_tenant_outgoing_internal_number') IS NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_invoices_tenant_outgoing_internal_number_c08
      ON public.invoices (tenant_id, internal_number)
      WHERE direction = ''outgoing'' AND internal_number IS NOT NULL';
  END IF;

  IF pg_catalog.to_regclass('public.uq_invoices_incoming_ksef_identity') IS NULL THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_invoices_tenant_incoming_ksef_number_c08
      ON public.invoices (tenant_id, ksef_number)
      WHERE direction = ''incoming'' AND ksef_number IS NOT NULL';
  END IF;
END;
$$;

-- The replacement keys must exist before dropping this overbroad index.
DROP INDEX IF EXISTS public.uq_invoices_tenant_internal_number;

COMMIT;
